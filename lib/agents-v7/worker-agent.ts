import { Experimental_Agent as Agent, stepCountIs, tool } from "ai";
import { provider } from "../provider";
import { z } from "zod";
import { DEFAULT_MODEL, type OpenAIModel } from "../models";
import { type AgentHooks } from "../agent-events";
import { makeStepHook } from "../agents/researcher-agent";

/**
 * The fixed roster of worker specialties the market runner draws from. Each
 * specialty is a generalist worker biased toward its own domain — it bids high
 * only on tasks that genuinely fit its strengths.
 */
export const WORKER_ROLES = ["researcher", "engineer", "designer", "analyst"] as const;
export type WorkerRole = (typeof WORKER_ROLES)[number];

/**
 * v7 market — a WORKER. One generalist agent parameterized by a `role`
 * specialty. It plays two rounds:
 *  - bid round: given the posted tasks, it calls submitBids advertising its fit
 *    (0–1) and an estimated cost for the tasks it can do well.
 *  - execute round: for a task it was AWARDED, it calls deliver with the output.
 *
 * Both tools only RECORD intent via their zod-validated returns; the runner
 * reads the tool results to drive the auction and collect deliverables.
 */
export function createWorkerAgent(
  model: OpenAIModel = DEFAULT_MODEL,
  hooks: AgentHooks = {},
  role: string,
) {
  const submitBids = tool({
    description:
      "Submit bids on the posted tasks. Bid only on tasks you can genuinely do well given " +
      "your specialty. Use fit 0–1 (high only for real matches) and an honest estimated cost.",
    inputSchema: z.object({
      bids: z
        .array(
          z.object({
            taskId: z.string().describe("The id of the task you are bidding on."),
            fit: z.number().min(0).max(1).describe("How well this task fits your specialty, 0–1."),
            estCostUsd: z.number().min(0).describe("Your honest estimated cost in USD."),
            rationale: z.string().describe("Why you fit (or why your fit is low)."),
          }),
        )
        .describe("One entry per task you want to bid on. May be empty if nothing fits."),
    }),
    execute: async ({ bids }) => ({ bids }),
  });

  const deliver = tool({
    description:
      "Deliver the finished output for the task you were awarded. Call this exactly once " +
      "with your complete, concrete result.",
    inputSchema: z.object({
      output: z.string().describe("Your complete deliverable for the awarded task."),
    }),
    execute: async ({ output }) => ({ output }),
  });

  const system =
    `You are a "${role}" worker in a market-based multi-agent team. You are a capable ` +
    `generalist whose strength is ${role} work.\n\n` +
    "You operate in two modes depending on the prompt:\n" +
    "1. BIDDING: given a list of posted tasks, call submitBids. Bid HONESTLY — advertise high " +
    `fit (close to 1) only for tasks that genuinely match ${role} work, and low fit (or skip) ` +
    "for tasks outside your strengths. Estimate cost honestly relative to task size.\n" +
    "2. EXECUTING: given a single awarded task, do the work to a high standard and call deliver " +
    "exactly once with concrete, useful content (not meta-talk).\n\n" +
    "Always finish by calling the appropriate tool exactly once.";

  return new Agent({
    model: provider()(model),
    system,
    stopWhen: stepCountIs(5),
    onStepFinish: makeStepHook(hooks),
    tools: { submitBids, deliver },
  });
}
