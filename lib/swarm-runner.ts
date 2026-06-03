import { Conversation } from "./conversation";
import { DEFAULT_MODEL, estimateCost, formatCost, type OpenAIModel, type ProviderId } from "./models";
import { withProvider } from "./provider";
import type { AgentEvent, EventSink } from "./agent-events";
import { createSwarmAgent } from "./agents-v9/swarm-agent";
import * as log from "./logger";

// Swarm shape: this many identical agents act every round, for this many rounds.
export const SWARM_SIZE = 4;
export const ROUNDS = 3;

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
interface SwarmAgent {
  generate(opts: { prompt: string }): Promise<AgentResult>;
}

/** One accumulated trace on the shared scratchpad. */
interface Trace {
  round: number;
  agent: string;
  text: string;
}

export interface SwarmResult {
  finalOutput: string;
  totalDuration: number;
  iterations: number;
  agentsUsed: string[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
}

export interface SwarmOptions {
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

/** Render the scratchpad as text for injection into an agent prompt. */
function renderScratchpad(traces: Trace[]): string {
  if (traces.length === 0) return "(the scratchpad is empty — you are among the first; lay solid groundwork)";
  return traces
    .map((t) => `- [round ${t.round} · ${t.agent}] ${t.text}`)
    .join("\n");
}

/**
 * v9 — Swarm (identical agents leave traces; emergent convergence).
 *
 * SWARM_SIZE identical, role-less agents work the same task. Each round all of
 * them run IN PARALLEL; every agent reads the shared scratchpad of all traces
 * so far and leaves ONE new trace that builds on it (stigmergy). There is no
 * controller picking who acts and no named sections — coordination is purely
 * through the accumulated freeform traces. After ROUNDS (or once a round adds
 * nothing substantive), a final distill pass condenses the whole scratchpad
 * into a single coherent answer. The ROUNDS cap guarantees termination.
 */
export class SwarmRunner {
  private model: OpenAIModel;
  private apiKey?: string;
  private providerId: ProviderId;
  private emit: EventSink = () => {};
  private totalIn = 0;
  private totalOut = 0;
  private totalCost = 0;

  constructor(options: SwarmOptions = {}) {
    this.model = options.model ?? DEFAULT_MODEL;
    this.apiKey = options.apiKey;
    this.providerId = options.providerId ?? 'openai';
  }

  async run(
    userQuery: string,
    conversation: Conversation = new Conversation(),
    onEvent?: EventSink,
  ): Promise<SwarmResult> {
    return withProvider({ providerId: this.providerId, apiKey: this.apiKey }, async () => {
    this.emit = onEvent ?? (() => {});
    this.totalIn = 0;
    this.totalOut = 0;
    this.totalCost = 0;

    log.box("🐝 v9 Swarm Workflow", "yellow");
    log.kv({ Query: `"${userQuery.slice(0, 80)}${userQuery.length > 80 ? "…" : ""}"` });

    const startTime = Date.now();
    this.emit({ type: "workflow_start", mode: "v9", model: this.model, query: userQuery, startingAgent: "agent 1" });

    const history = conversation.renderHistory();
    const labels = Array.from({ length: SWARM_SIZE }, (_, i) => `agent ${i + 1}`);
    const scratchpad: Trace[] = [];

    let round = 0;
    let actualRounds = 0;

    for (round = 1; round <= ROUNDS; round++) {
      // Snapshot the scratchpad so every agent in the round reads the SAME
      // shared state (stigmergy) — this round's contributions land afterwards.
      const snapshot = renderScratchpad(scratchpad);
      log.iteration(round, `swarm (${SWARM_SIZE} agents)`);

      const roundResults = await Promise.all(
        labels.map((label, i) => this.runOneAgent(label, i, round, userQuery, history, snapshot)),
      );

      let added = 0;
      for (const r of roundResults) {
        if (r.text && r.text.trim()) {
          scratchpad.push({ round, agent: r.agent, text: r.text });
          added++;
        }
      }
      actualRounds = round;

      // Stop early if a whole round contributed nothing substantive.
      if (added === 0) {
        log.step("round added no new traces — converged, stopping early");
        break;
      }
    }

    // Final distill pass: one swarm agent condenses the full scratchpad into a
    // coherent answer (better than dumping raw traces on the user).
    const finalOutput = await this.distill(userQuery, history, scratchpad);

    const totalDuration = Date.now() - startTime;
    log.box("✅ v9 Complete", "green");
    log.kv({
      Rounds: actualRounds,
      Traces: scratchpad.length,
      Agents: labels.join(", "),
      "Total duration": `${totalDuration}ms`,
      "Est. cost": `${formatCost(this.totalCost)} (${(this.totalIn + this.totalOut).toLocaleString()} tokens)`,
    });

    this.emit({
      type: "workflow_complete",
      mode: "v9",
      result: finalOutput,
      iterations: actualRounds,
      totalDuration,
      agentsUsed: labels,
      totalInputTokens: this.totalIn,
      totalOutputTokens: this.totalOut,
      totalCostUsd: this.totalCost,
      summary: { kind: "swarm", rounds: actualRounds, traces: scratchpad },
    });

    return {
      finalOutput,
      totalDuration,
      iterations: actualRounds,
      agentsUsed: labels,
      totalInputTokens: this.totalIn,
      totalOutputTokens: this.totalOut,
      totalCostUsd: this.totalCost,
    };
    });
  }

  /** Run a single swarm agent for one round; returns its new trace text. */
  private async runOneAgent(
    label: string,
    index: number,
    round: number,
    userQuery: string,
    history: string,
    scratchpad: string,
  ): Promise<{ agent: string; text: string }> {
    this.emit({ type: "iteration_start", iteration: round, agent: label });

    const start = Date.now();
    const agent = createSwarmAgent(this.model, {
      onStep: ({ stepIndex, text, toolNames }) =>
        this.emit({ type: "agent_step", agent: label, iteration: round, stepIndex, text, toolNames }),
    }, label) as unknown as SwarmAgent;

    const prompt =
      (history ? `Conversation so far:\n${history}\n\n` : "") +
      `TASK:\n${userQuery}\n\n` +
      `SHARED SCRATCHPAD (all agents' traces so far):\n${scratchpad}\n\n` +
      `You are ${label}. Read the scratchpad, then call contribute once with ONE concrete ` +
      `improvement, correction, or new angle that builds on it — do not repeat what's there.`;

    const result = await agent.generate({ prompt });
    const text = this.parseContribution(result);

    this.account(result, label, round, Date.now() - start, text);
    this.emit({ type: "trace", round, agent: label, preview: text.slice(0, 240) });

    return { agent: label, text };
  }

  /** Final pass: one agent distills the whole scratchpad into the answer. */
  private async distill(userQuery: string, history: string, scratchpad: Trace[]): Promise<string> {
    const label = "distiller";
    this.emit({ type: "iteration_start", iteration: ROUNDS + 1, agent: label });

    const start = Date.now();
    const agent = createSwarmAgent(this.model, {
      onStep: ({ stepIndex, text, toolNames }) =>
        this.emit({ type: "agent_step", agent: label, iteration: ROUNDS + 1, stepIndex, text, toolNames }),
    }, label) as unknown as SwarmAgent;

    const prompt =
      (history ? `Conversation so far:\n${history}\n\n` : "") +
      `TASK:\n${userQuery}\n\n` +
      `The swarm left these traces on the shared scratchpad:\n${renderScratchpad(scratchpad)}\n\n` +
      `Synthesize ALL of the traces above into a single, coherent, complete answer to the task. ` +
      `Integrate the best ideas, resolve contradictions, drop redundancy, and fill any gaps. ` +
      `Call contribute once with the final polished answer.`;

    const result = await agent.generate({ prompt });
    const text = this.parseContribution(result) || result.text;

    this.account(result, label, ROUNDS + 1, Date.now() - start, text);
    return text;
  }

  /** Extract the contribute() text from an agent's result. */
  private parseContribution(result: AgentResult): string {
    let text = "";
    forEachToolResult(result, (v) => {
      if (typeof v.text === "string") text = v.text;
    });
    return text;
  }

  /** Tally tokens/cost and emit iteration_end for a completed agent pass. */
  private account(result: AgentResult, agent: string, iteration: number, durationMs: number, output: string) {
    const usage = readUsage(result);
    const costUsd = estimateCost(this.model, usage);
    this.totalIn += usage.inputTokens;
    this.totalOut += usage.outputTokens;
    this.totalCost += costUsd;

    this.emit({
      type: "iteration_end",
      iteration,
      agent,
      durationMs,
      stepCount: result.steps.length,
      outputPreview: (output || result.text).slice(0, 240),
      completed: true,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd,
    });
  }
}

export async function runSwarm(
  userQuery: string,
  options: SwarmOptions = {},
  onEvent?: EventSink,
  conversation: Conversation = new Conversation(),
): Promise<SwarmResult> {
  return new SwarmRunner(options).run(userQuery, conversation, onEvent);
}

// Re-export for route typing convenience.
export type { AgentEvent };
