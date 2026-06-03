import { Experimental_Agent as Agent, stepCountIs, tool } from "ai";
import { provider } from "../provider";
import { z } from "zod";
import { DEFAULT_MODEL, type OpenAIModel } from "../models";
import { type AgentHooks } from "../agent-events";
import { makeStepHook } from "../agents/researcher-agent";

/**
 * v9 — one worker in a swarm of IDENTICAL agents. There are no roles and no
 * coordinator: every agent runs the same definition each round, reads the
 * shared scratchpad of everyone's traces so far, and leaves ONE new trace that
 * builds on what's already there (stigmergy). The collective answer emerges
 * from accumulated traces, distilled in a final pass.
 *
 * The single `contribute` tool just records the agent's contribution (zod
 * validated) so the runner can read it back from the tool results and append
 * it to the scratchpad — agents never talk to each other directly.
 */
export function createSwarmAgent(
  model: OpenAIModel = DEFAULT_MODEL,
  hooks: AgentHooks = {},
  id: string,
) {
  const contribute = tool({
    description:
      "Record your single contribution to the shared scratchpad. Call this exactly " +
      "once with one concrete improvement, correction, or new angle that builds on " +
      "the notes so far.",
    inputSchema: z.object({
      text: z
        .string()
        .describe("Your one concrete contribution — a self-contained improvement, fix, or new angle."),
    }),
    execute: async ({ text }) => ({ text }),
  });

  const system =
    `You are ${id}, one of several identical agents collaboratively solving a task. ` +
    `There is no leader and no fixed role — every agent works the same problem at the ` +
    `same time and leaves traces on a shared scratchpad for the others to build on.\n\n` +
    `Read the shared notes so far, then add ONE concrete improvement, correction, or new ` +
    `angle. Do NOT repeat what is already there — extend it, sharpen it, fill a gap, or ` +
    `challenge a weak point. Be specific and substantive, not meta-commentary.\n\n` +
    `Always end by calling contribute exactly once with your single contribution.`;

  return new Agent({
    model: provider()(model),
    system,
    tools: { contribute },
    stopWhen: stepCountIs(2),
    onStepFinish: makeStepHook(hooks),
  });
}
