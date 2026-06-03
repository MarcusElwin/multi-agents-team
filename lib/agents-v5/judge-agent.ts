import { Experimental_Agent as Agent, stepCountIs, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { type OpenAIModel } from "../models";
import { type AgentHooks } from "../agent-events";
import { makeStepHook } from "../agents/researcher-agent";

/**
 * The judge reads the full debate transcript and renders a verdict: it picks the
 * stronger position (or synthesizes a balanced recommendation) and justifies the
 * call with specifics drawn from the arguments. The single `verdict` tool records
 * the structured decision the runner turns into the final deliverable.
 */
export function createJudgeAgent(model: OpenAIModel, hooks: AgentHooks) {
  const verdict = tool({
    description:
      "Render your final verdict on the debate. Call this exactly once after weighing both sides.",
    inputSchema: z.object({
      winner: z
        .string()
        .describe('The stronger side, e.g. "Affirmative", "Opposing", or "Consensus" if balanced.'),
      reasoning: z
        .string()
        .describe("Why this side won (or why you synthesized), citing specific arguments made."),
      synthesis: z
        .string()
        .describe("A balanced, actionable recommendation that resolves the question."),
    }),
    execute: async ({ winner, reasoning, synthesis }) => ({ winner, reasoning, synthesis }),
  });

  const system =
    `You are an impartial judge of a structured debate. Two debaters argued opposing stances ` +
    `across several rounds. Your job:\n\n` +
    `- Weigh BOTH sides fairly on the merits of their arguments — not on which one spoke last.\n` +
    `- Pick the stronger position, OR synthesize a balanced recommendation if both have real merit.\n` +
    `- Justify your call with SPECIFICS drawn from the actual arguments made.\n` +
    `- Always end by calling verdict exactly once with winner, reasoning, and synthesis.`;

  return new Agent({
    model: openai(model),
    system,
    tools: { verdict },
    stopWhen: stepCountIs(3),
    onStepFinish: makeStepHook(hooks),
  });
}
