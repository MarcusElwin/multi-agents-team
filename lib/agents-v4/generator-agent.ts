import { Experimental_Agent as Agent, stepCountIs, tool } from "ai";
import { provider } from "../provider";
import { z } from "zod";
import { DEFAULT_MODEL, type OpenAIModel } from "../models";
import { type AgentHooks } from "../agent-events";
import { makeStepHook } from "../agents/researcher-agent";

/**
 * v4 evaluator–optimizer: the GENERATOR.
 *
 * Produces a deliverable on the first round and REVISES it on later rounds in
 * response to the critic's issues. It has a single tool, submitDraft, which the
 * runner reads to extract the current draft. The runner orchestrates the loop —
 * the generator just produces (or improves) one draft per call.
 */
export function createGeneratorAgent(model: OpenAIModel = DEFAULT_MODEL, hooks: AgentHooks = {}) {
  const submitDraft = tool({
    description:
      "Submit your finished deliverable for this round. Call this exactly once, after the " +
      "deliverable is complete (or once you have addressed every issue from the critic).",
    inputSchema: z.object({
      draft: z
        .string()
        .describe("The complete deliverable: the full text/spec/code, ready to be reviewed."),
    }),
    execute: async ({ draft }) => ({ draft }),
  });

  return new Agent({
    model: provider()(model),
    system:
      "You are the GENERATOR in an evaluator–optimizer loop. Your job is to produce a " +
      "high-quality deliverable that fully satisfies the user's request.\n\n" +
      "RULES:\n" +
      "- Produce real, concrete content — not meta-commentary about what you would write.\n" +
      "- Optimize for clarity, correctness, completeness, and usefulness.\n" +
      "- When you are given critic feedback (a previous draft plus a list of issues), REVISE " +
      "the draft so that EVERY issue is addressed. Keep what already works; fix what does not.\n" +
      "- Always end by calling submitDraft exactly once with your complete deliverable.",
    tools: { submitDraft },
    stopWhen: stepCountIs(3),
    onStepFinish: makeStepHook(hooks),
  });
}
