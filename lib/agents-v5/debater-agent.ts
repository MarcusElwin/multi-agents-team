import { Experimental_Agent as Agent, stepCountIs, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { type OpenAIModel } from "../models";
import { type AgentHooks } from "../agent-events";
import { makeStepHook } from "../agents/researcher-agent";

/**
 * A debater argues a single, fixed stance across multiple rounds. Each round it
 * sees the opponent's latest argument and is told to rebut it directly. The one
 * tool, `argue`, records the debater's argument so the runner can append it to
 * the running transcript and surface it as a bus_message.
 */
export function createDebaterAgent(model: OpenAIModel, hooks: AgentHooks, stance: string) {
  const argue = tool({
    description:
      "Submit your argument for this round. Call this exactly once with the strongest case " +
      "you can make for your assigned stance (rebutting the opponent when applicable).",
    inputSchema: z.object({
      argument: z
        .string()
        .describe("Your substantive argument for this round, in a few tight paragraphs."),
    }),
    execute: async ({ argument }) => ({ argument }),
  });

  const system =
    `You are a skilled debater. You argue FOR the assigned stance: "${stance}".\n\n` +
    `RULES:\n` +
    `- Make the strongest possible case for your stance — marshal evidence, logic, and examples.\n` +
    `- In later rounds you will be shown the opponent's last argument; directly REBUT their ` +
    `specific points, then advance your own.\n` +
    `- Be substantive and persuasive, not repetitive — add new angles each round.\n` +
    `- Do not concede your stance. Stay in character as its advocate.\n` +
    `- Always end by calling argue exactly once with your argument for this round.`;

  return new Agent({
    model: openai(model),
    system,
    tools: { argue },
    stopWhen: stepCountIs(3),
    onStepFinish: makeStepHook(hooks),
  });
}
