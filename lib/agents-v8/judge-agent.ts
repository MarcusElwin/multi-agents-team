import { Experimental_Agent as Agent, stepCountIs, tool } from "ai";
import { provider } from "../provider";
import { z } from "zod";
import { DEFAULT_MODEL, type OpenAIModel } from "../models";
import { type AgentHooks } from "../agent-events";
import { makeStepHook } from "../agents/researcher-agent";

/**
 * v8 self-consistency: the judge. Given the original task and the N candidate
 * answers, it either SELECTS the single best candidate or MERGES them into a
 * stronger consensus answer.
 *
 * One tool, decide, records the verdict; the runner reads the tool result to
 * build the run summary and final output.
 */
export function createJudgeAgent(model: OpenAIModel = DEFAULT_MODEL, hooks: AgentHooks = {}) {
  const decide = tool({
    description:
      "Record your verdict over the candidate answers. Call this exactly once when you have decided.",
    inputSchema: z.object({
      method: z
        .enum(["select", "merge"])
        .describe('"select" if one candidate is clearly best; "merge" if you combined several.'),
      chosenIndex: z
        .number()
        .optional()
        .describe('When method is "select", the 0-based index of the chosen candidate.'),
      finalAnswer: z
        .string()
        .describe("The final answer — the chosen candidate verbatim, or the merged consensus."),
      rationale: z.string().describe("A brief explanation of why you selected or merged."),
    }),
    execute: async ({ method, chosenIndex, finalAnswer, rationale }) => ({
      decided: true,
      method,
      chosenIndex,
      finalAnswer,
      rationale,
    }),
  });

  return new Agent({
    model: provider()(model),
    system:
      `You are the judge in a self-consistency team. Several independent samplers each answered ` +
      `the SAME task; you are given the task and all of their candidate answers.\n\n` +
      `Compare the candidates carefully. If one is clearly the best — most correct, complete, and ` +
      `well-reasoned — SELECT it (method "select", give its chosenIndex). If they have complementary ` +
      `strengths, MERGE them into a single stronger consensus answer (method "merge") that combines ` +
      `the best of each and resolves any disagreements.\n\n` +
      `Explain your choice briefly in rationale. Always end by calling decide exactly once.`,
    tools: { decide },
    stopWhen: stepCountIs(3),
    onStepFinish: makeStepHook(hooks),
  });
}
