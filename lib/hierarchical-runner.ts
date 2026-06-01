import { Conversation } from "./conversation";
import { DEFAULT_MODEL, estimateCost, formatCost, type OpenAIModel } from "./models";
import type { AgentEvent, EventSink } from "./agent-events";
import { createNodeAgent } from "./agents-v3/node-agent";
import * as log from "./logger";

const MAX_DEPTH = 2; // root = 0; nodes at MAX_DEPTH cannot spawn (leaves)
const MAX_CHILDREN = 4; // fan-out cap per node
const MAX_NODES = 15; // hard backstop against runaway trees

interface AgentStep {
  text?: string;
  toolCalls?: Array<{ toolName: string }>;
}
interface ToolResultItem {
  type: string;
  output?: { value?: Record<string, unknown> };
}
interface AgentResult {
  text: string;
  steps: AgentStep[];
  response?: { messages?: Array<{ role: string; content?: ToolResultItem[] }> };
  usage?: { inputTokens?: number; outputTokens?: number; promptTokens?: number; completionTokens?: number };
}
interface NodeAgent {
  generate(opts: { prompt: string }): Promise<AgentResult>;
}

interface SpawnRequest {
  role: string;
  task: string;
}

export interface HierarchicalResult {
  finalOutput: string;
  totalDuration: number;
  nodeCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
}

export interface HierarchicalOptions {
  model?: OpenAIModel;
}

/** Walk an agent result's tool outputs, calling `fn` for each value object. */
function forEachToolResult(result: AgentResult, fn: (v: Record<string, unknown>) => void) {
  for (const message of result.response?.messages ?? []) {
    if (message.role === "tool" && message.content) {
      for (const item of message.content) {
        if (item.type === "tool-result" && item.output?.value) fn(item.output.value);
      }
    }
  }
}

function readUsage(result: AgentResult) {
  const u = result.usage ?? {};
  return {
    inputTokens: u.inputTokens ?? u.promptTokens ?? 0,
    outputTokens: u.outputTokens ?? u.completionTokens ?? 0,
  };
}

/**
 * v3 — Hierarchical, dynamically-spawned sub-agents.
 *
 * The root "lead" decides at runtime how to decompose the task by calling
 * spawnSubAgent; the runner executes each child recursively (children run in
 * PARALLEL), capped by depth/width/total-node limits. A parent then synthesizes
 * its children's deliverables. Leaves (at MAX_DEPTH or that chose not to spawn)
 * return their own work directly.
 */
export class HierarchicalRunner {
  private model: OpenAIModel;
  private emit: EventSink = () => {};
  private nodeCount = 0;
  private totalIn = 0;
  private totalOut = 0;
  private totalCost = 0;

  constructor(options: HierarchicalOptions = {}) {
    this.model = options.model ?? DEFAULT_MODEL;
  }

  async run(
    userQuery: string,
    _conversation: Conversation = new Conversation(),
    onEvent?: EventSink,
  ): Promise<HierarchicalResult> {
    this.emit = onEvent ?? (() => {});
    this.nodeCount = 0;
    this.totalIn = 0;
    this.totalOut = 0;
    this.totalCost = 0;

    log.box("🌳 v3 Hierarchical Workflow", "yellow");
    log.kv({ Query: `"${userQuery.slice(0, 80)}${userQuery.length > 80 ? "…" : ""}"` });

    const startTime = Date.now();
    this.emit({ type: "workflow_start", mode: "v3", model: this.model, query: userQuery, startingAgent: "lead" });

    const finalOutput = await this.runNode({
      id: "root",
      parentId: null,
      role: "lead",
      task: userQuery,
      depth: 0,
    });

    const totalDuration = Date.now() - startTime;
    log.box("✅ v3 Complete", "green");
    log.kv({
      Nodes: this.nodeCount,
      "Total duration": `${totalDuration}ms`,
      "Est. cost": `${formatCost(this.totalCost)} (${(this.totalIn + this.totalOut).toLocaleString()} tokens)`,
    });

    this.emit({
      type: "workflow_complete",
      mode: "v3",
      result: finalOutput,
      iterations: this.nodeCount,
      totalDuration,
      agentsUsed: ["lead"],
      totalInputTokens: this.totalIn,
      totalOutputTokens: this.totalOut,
      totalCostUsd: this.totalCost,
    });

    return {
      finalOutput,
      totalDuration,
      nodeCount: this.nodeCount,
      totalInputTokens: this.totalIn,
      totalOutputTokens: this.totalOut,
      totalCostUsd: this.totalCost,
    };
  }

  /** Run one node: generate, spawn children (parallel), synthesize. Returns the node's deliverable. */
  private async runNode(node: {
    id: string;
    parentId: string | null;
    role: string;
    task: string;
    depth: number;
  }): Promise<string> {
    this.nodeCount++;
    const canSpawn = node.depth < MAX_DEPTH && this.nodeCount < MAX_NODES;

    this.emit({
      type: "agent_spawn",
      id: node.id,
      parentId: node.parentId,
      role: node.role,
      task: node.task,
      depth: node.depth,
    });
    this.emit({ type: "iteration_start", iteration: this.nodeCount, agent: node.role });
    log.iteration(this.nodeCount, `${"  ".repeat(node.depth)}${node.role}`);

    const start = Date.now();
    const agent = createNodeAgent({
      role: node.role,
      task: node.task,
      depth: node.depth,
      canSpawn,
      maxChildren: MAX_CHILDREN,
      model: this.model,
      hooks: {
        onStep: ({ stepIndex, text, toolNames }) =>
          this.emit({ type: "agent_step", agent: node.role, stepIndex, text, toolNames }),
        onWebSearch: ({ status, query, sources }) =>
          this.emit({ type: "web_search", agent: node.role, status, query, sources }),
      },
    }) as unknown as NodeAgent;

    // First pass: the node decides whether to spawn and produces a finalize.
    const result = await agent.generate({ prompt: node.task });
    const { spawns, deliverable } = this.parseResult(result);
    this.account(result, node.role, this.nodeCount, Date.now() - start, deliverable);

    // Leaf or chose not to spawn: return its own deliverable.
    if (!canSpawn || spawns.length === 0) {
      return deliverable || result.text;
    }

    // Run children concurrently (true parallelism — v1/v2 are sequential).
    const capped = spawns.slice(0, MAX_CHILDREN);
    log.step(`${"  ".repeat(node.depth)}spawning ${capped.length} sub-agent(s)`);
    const childResults = await Promise.all(
      capped.map((s, i) =>
        this.runNode({
          id: `${node.id}.${i}`,
          parentId: node.id,
          role: s.role,
          task: s.task,
          depth: node.depth + 1,
        }).then((output) => ({ role: s.role, task: s.task, output })),
      ),
    );

    // Synthesis pass: feed children's deliverables back for a final answer.
    const synthStart = Date.now();
    const synthAgent = createNodeAgent({
      role: node.role,
      // Synthesis combines children's work — no fresh web search needed.
      task: "synthesize the sub-agent results into a final deliverable",
      depth: node.depth,
      canSpawn: false, // synthesis never spawns again
      maxChildren: MAX_CHILDREN,
      model: this.model,
      hooks: {
        onStep: ({ stepIndex, text, toolNames }) =>
          this.emit({ type: "agent_step", agent: node.role, stepIndex, text, toolNames }),
      },
    }) as unknown as NodeAgent;

    const childBlock = childResults
      .map((c) => `### ${c.role}\nTask: ${c.task}\n\nResult:\n${c.output}`)
      .join("\n\n---\n\n");
    const synthPrompt =
      `Original task: ${node.task}\n\n` +
      `Your sub-agents returned these results:\n\n${childBlock}\n\n` +
      `Synthesize them into a single, coherent deliverable that fulfils the original task. ` +
      `Integrate the parts, resolve overlaps, and call finalize with the combined result.`;

    const synth = await synthAgent.generate({ prompt: synthPrompt });
    const { deliverable: synthDeliverable } = this.parseResult(synth);
    this.account(synth, node.role, this.nodeCount, Date.now() - synthStart, synthDeliverable, true);

    return synthDeliverable || synth.text;
  }

  /** Extract spawn requests and the finalize deliverable from a node's result. */
  private parseResult(result: AgentResult): { spawns: SpawnRequest[]; deliverable: string } {
    const spawns: SpawnRequest[] = [];
    let deliverable = "";
    forEachToolResult(result, (v) => {
      if (v.spawn && typeof v.role === "string" && typeof v.task === "string") {
        spawns.push({ role: v.role, task: v.task });
      }
      if (v.finalized && typeof v.deliverable === "string") {
        deliverable = v.deliverable;
      }
    });
    return { spawns, deliverable };
  }

  /** Tally tokens/cost and emit iteration_end for a completed node pass. */
  private account(
    result: AgentResult,
    role: string,
    iteration: number,
    durationMs: number,
    deliverable: string,
    synthesis = false,
  ) {
    const usage = readUsage(result);
    const costUsd = estimateCost(this.model, usage);
    this.totalIn += usage.inputTokens;
    this.totalOut += usage.outputTokens;
    this.totalCost += costUsd;

    const preview = (deliverable || result.text).slice(0, 240);
    this.emit({
      type: "iteration_end",
      iteration,
      agent: role,
      durationMs,
      stepCount: result.steps.length,
      outputPreview: synthesis ? `[synthesis] ${preview}` : preview,
      completed: true,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd,
    });
  }
}

export async function runHierarchical(
  userQuery: string,
  options: HierarchicalOptions = {},
  onEvent?: EventSink,
  conversation: Conversation = new Conversation(),
): Promise<HierarchicalResult> {
  return new HierarchicalRunner(options).run(userQuery, conversation, onEvent);
}

// Re-export for route typing convenience.
export type { AgentEvent };
