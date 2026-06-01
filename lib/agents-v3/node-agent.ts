import { Experimental_Agent as Agent, stepCountIs, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { DEFAULT_MODEL, type OpenAIModel } from "../models";
import { type AgentHooks } from "../agent-events";
import { makeStepHook } from "../agents/researcher-agent";

/**
 * A single node in the v3 hierarchy. Every node runs the SAME agent definition,
 * parameterized by `role` — the lead invents roles for the children it spawns.
 *
 * A node has two tools:
 *  - spawnSubAgent: delegate a subtask to a child (the runner executes children
 *    recursively and feeds their results back for synthesis).
 *  - finalize: produce this node's deliverable (a leaf does its own work; a
 *    parent synthesizes its children's results).
 *
 * `canSpawn` is false at the depth cap, so leaves are told to just do the work.
 * The tools only RECORD intent (via zod-validated returns); the recursive runner
 * reads the tool results and orchestrates — the agent never calls children directly.
 */
export function createNodeAgent(opts: {
  role: string;
  depth: number;
  canSpawn: boolean;
  maxChildren: number;
  model?: OpenAIModel;
  hooks?: AgentHooks;
}) {
  const { role, canSpawn, maxChildren, model = DEFAULT_MODEL, hooks = {} } = opts;

  const spawnGuidance = canSpawn
    ? `You MAY break this task down. If it has clearly separable parts, call spawnSubAgent ` +
      `once per part (at most ${maxChildren}), giving each child a focused role and a ` +
      `self-contained task. Spawn ONLY when delegation genuinely helps — otherwise just do ` +
      `the work yourself and call finalize. Do not spawn more than one round of children.`
    : `You are at the maximum depth and CANNOT delegate further. Do the work yourself, ` +
      `then call finalize with your deliverable.`;

  const finalize = tool({
    description:
      'Produce this node\'s final deliverable. Call this exactly once when your work (or the ' +
      'synthesis of your children\'s work) is complete.',
    inputSchema: z.object({
      deliverable: z
        .string()
        .describe('Your complete output: findings, spec, code, or synthesized result.'),
    }),
    execute: async ({ deliverable }) => ({ finalized: true, deliverable }),
  });

  const spawnSubAgent = tool({
    description:
      'Delegate a focused subtask to a child agent. The child runs independently and its ' +
      'result is returned to you. Call once per subtask, then call finalize to synthesize.',
    inputSchema: z.object({
      role: z
        .string()
        .describe('Short role for the child, e.g. "researcher", "api-designer", "ui-builder".'),
      task: z.string().describe('A self-contained instruction for the child.'),
    }),
    // The runner intercepts these tool results to spawn children; the value
    // here is just an ack so the model can continue and then finalize.
    execute: async ({ role: childRole, task }) => ({ spawn: true, role: childRole, task }),
  });

  // Both tools are always present (a flat literal keeps the ToolSet types
  // clean). At the depth cap the system prompt tells the node NOT to spawn, and
  // the runner ignores any spawn results past MAX_DEPTH as a hard backstop.
  return new Agent({
    model: openai(model),
    system:
      `You are a "${role}" agent in a hierarchical team. Your job is to fulfil the task you ` +
      `are given.\n\n${spawnGuidance}\n\n` +
      `RULES:\n` +
      `- Be concrete and useful. Produce real content (specs, code, analysis), not meta-talk.\n` +
      `- If you spawn children, do it in ONE batch of spawnSubAgent calls, then stop and wait.\n` +
      `- Always end by calling finalize exactly once with your deliverable.`,
    tools: { spawnSubAgent, finalize },
    stopWhen: stepCountIs(canSpawn ? maxChildren + 3 : 4),
    onStepFinish: makeStepHook(hooks),
  });
}
