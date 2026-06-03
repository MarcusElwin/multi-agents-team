import { Experimental_Agent as Agent, stepCountIs, tool } from "ai";
import { provider } from "../provider";
import { z } from "zod";
import { DEFAULT_MODEL, type OpenAIModel } from "../models";
import { type AgentHooks } from "../agent-events";
import { makeStepHook } from "../agents/researcher-agent";

/**
 * v7 market — the DISPATCHER. It decomposes the user's request into a small set
 * of independent, awardable tasks and posts them to the "market" via postTasks.
 *
 * The runner reads the postTasks tool result to build the auction board; the
 * agent itself never assigns work. The same agent is also reused by the runner
 * for the final synthesis pass (it just generates prose, no tools required).
 */
export function createDispatcherAgent(model: OpenAIModel = DEFAULT_MODEL, hooks: AgentHooks = {}) {
  const postTasks = tool({
    description:
      "Post the decomposed tasks to the market so worker agents can bid on them. " +
      "Call this exactly once with 2–5 independent, self-contained tasks.",
    inputSchema: z.object({
      tasks: z
        .array(
          z.object({
            id: z.string().describe('Short stable id, e.g. "t1", "t2".'),
            title: z.string().describe("A concise task title."),
            description: z
              .string()
              .describe("A self-contained instruction the winning worker can execute on its own."),
          }),
        )
        .min(1)
        .describe("The 2–5 tasks the request decomposes into."),
    }),
    execute: async ({ tasks }) => ({ tasks }),
  });

  const system =
    "You are the DISPATCHER in a market-based multi-agent team. Your job is to break the " +
    "user's request into 2–5 INDEPENDENT, awardable tasks that different specialists can work " +
    "on in parallel.\n\n" +
    "RULES:\n" +
    "- Each task must be self-contained: it should make sense and be executable on its own.\n" +
    "- Give each task a clear, specific title and a concrete description of what to produce.\n" +
    "- Prefer tasks that map to distinct specialties (research, engineering, design, analysis).\n" +
    "- Keep tasks genuinely separable — avoid one task that just repeats the whole request.\n" +
    "- Call postTasks exactly once with the full task list, then stop.";

  return new Agent({
    model: provider()(model),
    system,
    stopWhen: stepCountIs(3),
    onStepFinish: makeStepHook(hooks),
    tools: { postTasks },
  });
}
