import { Conversation } from "./conversation";
import { DEFAULT_MODEL, estimateCost, formatCost, type OpenAIModel, type ProviderId } from "./models";
import { withProvider } from "./provider";
import type { AgentEvent, EventSink, RunSummary } from "./agent-events";
import { createDispatcherAgent } from "./agents-v7/dispatcher-agent";
import { createWorkerAgent } from "./agents-v7/worker-agent";
import * as log from "./logger";

/** Fixed roster of worker specialties and the per-agent bundle cap. */
const ROSTER = ["researcher", "engineer", "designer", "analyst"] as const;
const MAX_PER_AGENT = 2;

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
interface MarketAgent {
  generate(opts: { prompt: string }): Promise<AgentResult>;
}

interface MarketTask {
  id: string;
  title: string;
  description: string;
}
interface MarketBid {
  taskId: string;
  agent: string;
  fit: number;
  estCostUsd: number;
}

export interface MarketResult {
  finalOutput: string;
  totalDuration: number;
  iterations: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  agentsUsed: string[];
}

export interface MarketOptions {
  model?: OpenAIModel;
  apiKey?: string;
  providerId?: ProviderId;
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
 * v7 — Market / Auction.
 *
 * A dispatcher decomposes the request into tasks and posts them to a market. A
 * pool of generalist workers (one per specialty in ROSTER) BIDS on the tasks,
 * advertising fit (0–1) and estimated cost. The dispatcher awards each task to
 * its highest-fit bidder — greedily, with a per-agent bundle cap (MAX_PER_AGENT)
 * so work spreads across the roster. Winners execute their awarded task(s) in
 * PARALLEL, and a final synthesis pass combines the deliverables.
 */
export class MarketRunner {
  private model: OpenAIModel;
  private apiKey?: string;
  private providerId: ProviderId;
  private emit: EventSink = () => {};
  private iterations = 0;
  private totalIn = 0;
  private totalOut = 0;
  private totalCost = 0;

  constructor(options: MarketOptions = {}) {
    this.model = options.model ?? DEFAULT_MODEL;
    this.apiKey = options.apiKey;
    this.providerId = options.providerId ?? 'openai';
  }

  async run(
    userQuery: string,
    _conversation: Conversation = new Conversation(),
    onEvent?: EventSink,
  ): Promise<MarketResult> {
    return withProvider({ providerId: this.providerId, apiKey: this.apiKey }, async () => {
    this.emit = onEvent ?? (() => {});
    this.iterations = 0;
    this.totalIn = 0;
    this.totalOut = 0;
    this.totalCost = 0;

    log.box("🏷️  v7 Market / Auction Workflow", "magenta");
    log.kv({ Query: `"${userQuery.slice(0, 80)}${userQuery.length > 80 ? "…" : ""}"` });

    const startTime = Date.now();
    this.emit({ type: "workflow_start", mode: "v7", model: this.model, query: userQuery, startingAgent: "dispatcher" });

    // Structured summary accumulators for the auction board (tasks → bids → awards).
    const summaryTasks: Array<{ taskId: string; title: string }> = [];
    const summaryBids: Array<{ taskId: string; agent: string; fit: number; estCostUsd: number }> = [];
    const summaryAwards: Array<{ taskId: string; agent: string; output?: string }> = [];

    // (a) Dispatcher posts tasks.
    const tasks = await this.postTasks(userQuery);
    if (tasks.length === 0) {
      // Guard: nothing to auction. Fall back to a single dispatcher answer.
      const fallback = await this.synthesize(userQuery, []);
      return this.finish(fallback, [], startTime, {
        kind: "market",
        tasks: summaryTasks,
        bids: summaryBids,
        awards: summaryAwards,
      });
    }
    for (const t of tasks) {
      this.emit({ type: "task_posted", taskId: t.id, title: t.title });
      summaryTasks.push({ taskId: t.id, title: t.title });
    }

    // (b) Bid round: every worker bids on the posted tasks.
    const bids = await this.collectBids(userQuery, tasks);
    for (const b of bids) {
      summaryBids.push({ taskId: b.taskId, agent: b.agent, fit: b.fit, estCostUsd: b.estCostUsd });
    }

    // (c) Award: greedily assign each task to its best bidder (bundle-capped).
    const awards = this.award(tasks, bids);
    for (const a of awards) {
      this.emit({ type: "task_awarded", taskId: a.task.id, agent: a.agent });
    }

    // (d) Execute: winners run their awarded task(s) in parallel.
    const deliverables = await Promise.all(
      awards.map((a) =>
        this.execute(a.agent, a.task, userQuery).then((output) => ({
          agent: a.agent,
          task: a.task,
          output,
        })),
      ),
    );
    // Record awards with the winner's deliverable text (available at synthesis time).
    for (const d of deliverables) {
      summaryAwards.push({ taskId: d.task.id, agent: d.agent, output: d.output || undefined });
    }

    // (e) Synthesize a final deliverable from all completed work.
    const finalOutput = await this.synthesize(userQuery, deliverables);

    const agentsUsed = [...new Set(awards.map((a) => a.agent))];
    return this.finish(finalOutput, agentsUsed, startTime, {
      kind: "market",
      tasks: summaryTasks,
      bids: summaryBids,
      awards: summaryAwards,
    });
    });
  }

  /** (a) Run the dispatcher and read its postTasks result. */
  private async postTasks(userQuery: string): Promise<MarketTask[]> {
    this.iterations++;
    const role = "dispatcher";
    this.emit({ type: "iteration_start", iteration: this.iterations, agent: role });
    log.iteration(this.iterations, role);

    const start = Date.now();
    const agent = createDispatcherAgent(this.model, this.stepHooks(role)) as unknown as MarketAgent;
    const result = await agent.generate({
      prompt:
        `Decompose this request into 2–5 independent, awardable tasks and call postTasks:\n\n${userQuery}`,
    });

    const tasks: MarketTask[] = [];
    forEachToolResult(result, (v) => {
      if (Array.isArray(v.tasks)) {
        for (const raw of v.tasks as Array<Record<string, unknown>>) {
          if (typeof raw.id === "string" && typeof raw.title === "string" && typeof raw.description === "string") {
            tasks.push({ id: raw.id, title: raw.title, description: raw.description });
          }
        }
      }
    });

    this.account(result, role, this.iterations, Date.now() - start, `posted ${tasks.length} task(s)`);
    log.step(`dispatcher posted ${tasks.length} task(s)`);
    return tasks;
  }

  /** (b) Each worker in the roster bids on the posted tasks (in parallel). */
  private async collectBids(userQuery: string, tasks: MarketTask[]): Promise<MarketBid[]> {
    const taskBlock = tasks.map((t) => `- ${t.id}: ${t.title} — ${t.description}`).join("\n");
    const prompt =
      `Original request: ${userQuery}\n\n` +
      `Posted tasks:\n${taskBlock}\n\n` +
      `Bid on the tasks that fit your specialty by calling submitBids. ` +
      `Use fit 0–1 (high only for genuine matches) and an honest estimated cost in USD.`;

    const rounds = await Promise.all(
      ROSTER.map(async (role) => {
        this.iterations++;
        const iteration = this.iterations;
        this.emit({ type: "iteration_start", iteration, agent: role });
        log.iteration(iteration, `${role} (bidding)`);

        const start = Date.now();
        const agent = createWorkerAgent(this.model, this.stepHooks(role), role) as unknown as MarketAgent;
        const result = await agent.generate({ prompt });

        const bids: MarketBid[] = [];
        forEachToolResult(result, (v) => {
          if (Array.isArray(v.bids)) {
            for (const raw of v.bids as Array<Record<string, unknown>>) {
              if (typeof raw.taskId === "string" && typeof raw.fit === "number") {
                bids.push({
                  taskId: raw.taskId,
                  agent: role,
                  fit: raw.fit,
                  estCostUsd: typeof raw.estCostUsd === "number" ? raw.estCostUsd : 0,
                });
              }
            }
          }
        });

        this.account(result, role, iteration, Date.now() - start, `submitted ${bids.length} bid(s)`);
        return bids;
      }),
    );

    const all = rounds.flat();
    // Only bid on tasks that actually exist; emit each valid bid.
    const validIds = new Set(tasks.map((t) => t.id));
    const valid = all.filter((b) => validIds.has(b.taskId));
    for (const b of valid) {
      this.emit({ type: "bid", taskId: b.taskId, agent: b.agent, fit: b.fit, estCostUsd: b.estCostUsd });
    }
    return valid;
  }

  /**
   * (c) Deterministic, total award: every task gets exactly one winner.
   *
   * Greedy by fit — process candidate (task, bid) pairs from highest fit down,
   * skipping any agent already at MAX_PER_AGENT. A task with no usable bid (or
   * whose bidders are all capped out) is assigned to the least-loaded worker.
   */
  private award(tasks: MarketTask[], bids: MarketBid[]): Array<{ task: MarketTask; agent: string }> {
    const load: Record<string, number> = Object.fromEntries(ROSTER.map((r) => [r, 0]));
    const winner: Record<string, string> = {};

    // Sort candidate bids by fit desc; ties broken deterministically by taskId
    // then agent so the assignment is reproducible.
    const candidates = [...bids].sort(
      (a, b) => b.fit - a.fit || a.taskId.localeCompare(b.taskId) || a.agent.localeCompare(b.agent),
    );

    for (const bid of candidates) {
      if (winner[bid.taskId]) continue; // task already awarded
      if (load[bid.agent] >= MAX_PER_AGENT) continue; // agent bundle full
      winner[bid.taskId] = bid.agent;
      load[bid.agent] += 1;
    }

    // Any task without a winner → least-loaded worker (deterministic by roster
    // order on ties). Ignores the cap as a last resort so the award is total.
    for (const task of tasks) {
      if (winner[task.id]) continue;
      let best: string = ROSTER[0];
      for (const role of ROSTER) {
        if (load[role] < load[best]) best = role;
      }
      winner[task.id] = best;
      load[best] += 1;
    }

    return tasks.map((task) => ({ task, agent: winner[task.id] }));
  }

  /** (d) A winning worker executes one awarded task and returns its output. */
  private async execute(role: string, task: MarketTask, userQuery: string): Promise<string> {
    this.iterations++;
    const iteration = this.iterations;
    this.emit({ type: "iteration_start", iteration, agent: role });
    log.iteration(iteration, `${role} → ${task.title}`);

    const start = Date.now();
    const agent = createWorkerAgent(this.model, this.stepHooks(role), role) as unknown as MarketAgent;
    const result = await agent.generate({
      prompt:
        `Original request (context): ${userQuery}\n\n` +
        `You were AWARDED this task. Do the work and call deliver with your complete output.\n\n` +
        `Task ${task.id}: ${task.title}\n${task.description}`,
    });

    let output = "";
    forEachToolResult(result, (v) => {
      if (typeof v.output === "string") output = v.output;
    });
    output = output || result.text;

    this.account(result, role, iteration, Date.now() - start, output);
    return output;
  }

  /** (e) Final synthesis pass — the dispatcher combines all deliverables. */
  private async synthesize(
    userQuery: string,
    deliverables: Array<{ agent: string; task: MarketTask; output: string }>,
  ): Promise<string> {
    this.iterations++;
    const role = "dispatcher";
    const iteration = this.iterations;
    this.emit({ type: "iteration_start", iteration, agent: role });
    log.iteration(iteration, `${role} (synthesis)`);

    const block = deliverables
      .map((d) => `### ${d.task.title} (${d.agent})\n${d.output}`)
      .join("\n\n---\n\n");
    const prompt = deliverables.length
      ? `Original request: ${userQuery}\n\n` +
        `The market's winning workers delivered these results:\n\n${block}\n\n` +
        `Synthesize them into a single, coherent markdown deliverable that fully answers the ` +
        `original request. Integrate the parts and resolve any overlap. Do not call any tools — ` +
        `just write the final answer.`
      : `Answer this request directly in clear markdown:\n\n${userQuery}`;

    const start = Date.now();
    const agent = createDispatcherAgent(this.model, this.stepHooks(role)) as unknown as MarketAgent;
    const result = await agent.generate({ prompt });
    this.account(result, role, iteration, Date.now() - start, result.text, true);

    return result.text;
  }

  private finish(finalOutput: string, agentsUsed: string[], startTime: number, summary?: RunSummary): MarketResult {
    const totalDuration = Date.now() - startTime;
    log.box("✅ v7 Complete", "green");
    log.kv({
      Iterations: this.iterations,
      Workers: agentsUsed.join(", ") || "—",
      "Total duration": `${totalDuration}ms`,
      "Est. cost": `${formatCost(this.totalCost)} (${(this.totalIn + this.totalOut).toLocaleString()} tokens)`,
    });

    this.emit({
      type: "workflow_complete",
      mode: "v7",
      result: finalOutput,
      iterations: this.iterations,
      totalDuration,
      agentsUsed,
      totalInputTokens: this.totalIn,
      totalOutputTokens: this.totalOut,
      totalCostUsd: this.totalCost,
      summary,
    });

    return {
      finalOutput,
      totalDuration,
      iterations: this.iterations,
      totalInputTokens: this.totalIn,
      totalOutputTokens: this.totalOut,
      totalCostUsd: this.totalCost,
      agentsUsed,
    };
  }

  /** Step/web-search hooks that forward to the live event sink for a role. */
  private stepHooks(role: string) {
    return {
      onStep: ({ stepIndex, text, toolNames }: { stepIndex: number; text: string; toolNames: string[] }) =>
        this.emit({ type: "agent_step", agent: role, stepIndex, text, toolNames }),
      onWebSearch: ({ status, query, sources }: { status: "start" | "done"; query: string; sources?: number }) =>
        this.emit({ type: "web_search", agent: role, status, query, sources }),
    };
  }

  /** Tally tokens/cost and emit iteration_end for a completed pass. */
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

export async function runMarket(
  userQuery: string,
  options: MarketOptions = {},
  onEvent?: EventSink,
  conversation: Conversation = new Conversation(),
): Promise<MarketResult> {
  return new MarketRunner(options).run(userQuery, conversation, onEvent);
}

// Re-export for route typing convenience.
export type { AgentEvent };
