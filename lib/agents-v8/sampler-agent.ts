import { Experimental_Agent as Agent, stepCountIs, tool } from "ai";
import { provider } from "../provider";
import { z } from "zod";
import { DEFAULT_MODEL, type OpenAIModel } from "../models";
import { type AgentHooks } from "../agent-events";
import { makeStepHook } from "../agents/researcher-agent";

/**
 * v8 self-consistency: a single sampler. The runner spins up N of these in
 * parallel on the SAME task — each is an independent attempt at the best
 * complete answer. The judge later selects or merges across the samples.
 *
 * One tool, submitAnswer, records the sample's final answer; the runner reads
 * the tool result so it always has the structured text even if the model's
 * trailing prose drifts.
 */
export function createSamplerAgent(model: OpenAIModel = DEFAULT_MODEL, hooks: AgentHooks = {}) {
  const submitAnswer = tool({
    description:
      "Submit your final, complete answer to the task. Call this exactly once when your answer is ready.",
    inputSchema: z.object({
      answer: z.string().describe("Your best complete answer to the task."),
    }),
    execute: async ({ answer }) => ({ answer }),
  });

  return new Agent({
    model: provider()(model),
    system:
      `You are a sampler in a self-consistency team. Several independent samplers are ` +
      `answering the SAME task in parallel; later a judge will compare the answers and either ` +
      `pick the best one or merge them into a consensus.\n\n` +
      `Produce YOUR best complete answer to the task. Be substantive, concrete, and self-contained — ` +
      `do not assume the reader has seen any other answer. Reason it through, then commit.\n\n` +
      `Always end by calling submitAnswer exactly once with your complete answer.`,
    tools: { submitAnswer },
    stopWhen: stepCountIs(3),
    onStepFinish: makeStepHook(hooks),
  });
}
