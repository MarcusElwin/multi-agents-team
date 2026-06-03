import { Experimental_Agent as Agent, stepCountIs, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { DEFAULT_MODEL, type OpenAIModel } from "../models";
import { type AgentHooks } from "../agent-events";
import { makeStepHook } from "../agents/researcher-agent";

/**
 * v4 evaluator–optimizer: the CRITIC.
 *
 * Scores a draft 0–10 against a rubric (clarity, correctness, completeness,
 * usefulness) and returns a list of concrete, actionable issues. The runner
 * reads the critique tool result to decide whether the draft passes or needs
 * another revision round.
 */
export function createCriticAgent(model: OpenAIModel = DEFAULT_MODEL, hooks: AgentHooks = {}) {
  const critique = tool({
    description:
      "Record your evaluation of the draft. Call this exactly once when your review is complete.",
    inputSchema: z.object({
      score: z
        .number()
        .min(0)
        .max(10)
        .describe("Overall quality score from 0 (unusable) to 10 (excellent, ship it)."),
      issues: z
        .array(z.string())
        .describe(
          "Concrete, actionable issues the generator must fix. Empty only when the draft is genuinely excellent.",
        ),
      rationale: z
        .string()
        .describe("A short justification for the score, referencing the rubric dimensions."),
    }),
    execute: async ({ score, issues, rationale }) => ({ score, issues, rationale }),
  });

  return new Agent({
    model: openai(model),
    system:
      "You are the CRITIC in an evaluator–optimizer loop. You are a demanding, rigorous " +
      "reviewer. Score the draft against the user's request on four dimensions:\n" +
      "- Clarity: is it well-structured and easy to follow?\n" +
      "- Correctness: are the facts, logic, and any code right?\n" +
      "- Completeness: does it fully cover what was asked, with no gaps?\n" +
      "- Usefulness: would the reader actually be able to act on it?\n\n" +
      "RULES:\n" +
      "- Be specific. Every issue must be concrete and actionable so the generator knows exactly " +
      "what to change. Avoid vague complaints.\n" +
      "- Hold a high bar. Only score 8 or above when the draft is genuinely strong across all four " +
      "dimensions. Reserve 10 for truly excellent work.\n" +
      "- Always end by calling critique exactly once with your score, issues, and rationale.",
    tools: { critique },
    stopWhen: stepCountIs(3),
    onStepFinish: makeStepHook(hooks),
  });
}
