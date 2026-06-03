import { Experimental_Agent as Agent, stepCountIs, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { DEFAULT_MODEL, type OpenAIModel } from "../models";
import { type AgentHooks } from "../agent-events";
import { makeStepHook } from "../agents/researcher-agent";

/**
 * A single contributor in the v6 BLACKBOARD team. Every contributor runs the
 * SAME agent definition, parameterized by `role` (analyst, planner, critic, …).
 *
 * There is NO direct agent-to-agent messaging. All coordination happens through
 * the shared blackboard: the runner renders the current board into the prompt,
 * the contributor reads it, and writes back via the single `writeSection` tool.
 * The runner intercepts that tool result to update the board and decide whether
 * the task is solved (solutionReady).
 */
export function createContributorAgent(
  model: OpenAIModel = DEFAULT_MODEL,
  hooks: AgentHooks = {},
  role: string,
) {
  const writeSection = tool({
    description:
      'Write or refine a single section of the shared blackboard. Provide the section ' +
      'name and its full new content (you overwrite the section, so include everything ' +
      'it should now contain). Set solutionReady=true ONLY when the overall task is fully ' +
      'solved on the board and needs no further contributions.',
    inputSchema: z.object({
      section: z
        .string()
        .describe('The board section to write, e.g. "analysis", "plan", "critique", "solution".'),
      content: z.string().describe('The full new content for that section.'),
      solutionReady: z
        .boolean()
        .optional()
        .describe('True only when the whole task is fully solved on the board.'),
    }),
    // The runner reads this result to update the board; the value is just an ack.
    execute: async ({ section, content, solutionReady }) => ({
      wrote: true,
      section,
      content,
      solutionReady: solutionReady ?? false,
    }),
  });

  const system =
    `You are the "${role}" contributor on a shared BLACKBOARD team. You coordinate ONLY ` +
    `through the board — you never message other agents directly.\n\n` +
    `Each turn you are shown the CURRENT BLACKBOARD (all sections written so far). Your job:\n` +
    `- Read the whole board to understand what others have contributed.\n` +
    `- Add or refine the section(s) you, as the "${role}", are responsible for. As an ` +
    `analyst, surface facts/constraints/assumptions; as a planner, lay out concrete steps ` +
    `or structure; as a critic, find gaps and propose fixes.\n` +
    `- Build on existing sections rather than repeating them. If a section is good enough, ` +
    `improve a different one instead.\n\n` +
    `RULES:\n` +
    `- Be concrete and useful — produce real content, not meta-talk.\n` +
    `- Call writeSection exactly once with your contribution this turn.\n` +
    `- Set solutionReady=true ONLY when the overall task is fully solved on the board; if so, ` +
    `write or finalize the "solution" section with the complete answer.`;

  return new Agent({
    model: openai(model),
    system,
    tools: { writeSection },
    stopWhen: stepCountIs(3),
    onStepFinish: makeStepHook(hooks),
  });
}
