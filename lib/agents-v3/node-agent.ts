import { Experimental_Agent as Agent, stepCountIs, tool } from "ai";
import { provider } from "../provider";
import { z } from "zod";
import { DEFAULT_MODEL, type OpenAIModel } from "../models";
import { type AgentHooks } from "../agent-events";
import { makeStepHook } from "../agents/researcher-agent";
import { makeWebSearchTool, needsWebSearch } from "../tools/web-search";
import { makeReportTool } from "../tools/report";

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
  task: string;
  depth: number;
  canSpawn: boolean;
  maxChildren: number;
  isRoot?: boolean;
  /** When true, expose generateReport so the deliverable can be a rich report. */
  canReport?: boolean;
  model?: OpenAIModel;
  hooks?: AgentHooks;
}) {
  const { role, task, canSpawn, maxChildren, isRoot = false, canReport = false, model = DEFAULT_MODEL, hooks = {} } = opts;

  // Give research-y nodes the real web-search tool; others reason from prompt.
  const webSearchEnabled = needsWebSearch(`${role} ${task}`);

  // The root lead is strongly biased toward decomposition (otherwise a capable
  // model just answers in one shot and no tree forms). Deeper nodes keep it
  // optional so they don't over-spawn.
  const spawnGuidance = canSpawn
    ? isRoot
      ? `You are the LEAD. Your job is to DECOMPOSE this task, not answer it yourself. ` +
        `Identify its 2–${maxChildren} natural parts and call spawnSubAgent once per part — ` +
        `each with a focused role and a self-contained task. Do this in ONE batch, then stop ` +
        `and wait for their results. Do NOT call finalize on the first turn, and do NOT do ` +
        `the work yourself unless the task is genuinely a single indivisible step.`
      : `You MAY break this task down. If it has clearly separable parts, call spawnSubAgent ` +
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

  const webSearch = makeWebSearchTool(model, hooks);
  const generateReport = makeReportTool();

  // Two full literals (no optional keys) keep the ToolSet types clean — a
  // conditional `...(cond ? {x} : {})` spread infers `x?: undefined`, which
  // breaks the onStepFinish callback's inferred ToolSet.
  const baseSystem =
    `You are a "${role}" agent in a hierarchical team. Your job is to fulfil the task you ` +
    `are given.\n\n${spawnGuidance}\n\n` +
    (webSearchEnabled
      ? `You have a webSearch tool — USE IT to ground your work in real, current, sourced ` +
        `information rather than guessing. Cite what you find.\n\n`
      : ``) +
    (canReport
      ? `You may produce a rich visual report instead of plain prose: call generateReport ` +
        `with KPIs, charts (with real numbers from the sub-agents' work), tables, and ` +
        `sections. Prefer generateReport when the content has data worth visualizing; ` +
        `otherwise call finalize with markdown.\n\n`
      : ``) +
    `RULES:\n` +
    `- Be concrete and useful. Produce real content (specs, code, analysis), not meta-talk.\n` +
    `- If you spawn children, do it in ONE batch of spawnSubAgent calls, then stop and wait.\n` +
    `- Always end by calling finalize (or generateReport) exactly once with your deliverable.`;

  const common = {
    model: provider()(model),
    system: baseSystem,
    stopWhen: stepCountIs(canSpawn ? maxChildren + 4 : 5),
    onStepFinish: makeStepHook(hooks),
  };

  // Distinct full literals per tool combination (keeps the ToolSet types clean).
  // At the depth cap the prompt tells the node NOT to spawn; the runner also
  // ignores spawn results past MAX_DEPTH as a hard backstop.
  if (canReport) {
    return new Agent({ ...common, tools: { spawnSubAgent, finalize, generateReport } });
  }
  return webSearchEnabled
    ? new Agent({ ...common, tools: { spawnSubAgent, finalize, webSearch } })
    : new Agent({ ...common, tools: { spawnSubAgent, finalize } });
}
