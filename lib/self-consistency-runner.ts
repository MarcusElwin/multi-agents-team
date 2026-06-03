import { Conversation } from "./conversation";
import { DEFAULT_MODEL, estimateCost, formatCost, type OpenAIModel, type ProviderId } from "./models";
import { withProvider } from "./provider";
import type { AgentEvent, EventSink, RunSummary } from "./agent-events";
import { createSamplerAgent } from "./agents-v8/sampler-agent";
import { createJudgeAgent } from "./agents-v8/judge-agent";
import * as log from "./logger";

/** Number of independent samples drawn in parallel before judging. */
export const SAMPLES = 4;

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
interface RunnableAgent {
  generate(opts: { prompt: string }): Promise<AgentResult>;
}

export interface SelfConsistencyResult {
  finalOutput: string;
  totalDuration: number;
  iterations: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
}

export interface SelfConsistencyOptions {
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

interface JudgeVerdict {
  method: "select" | "merge";
  chosenIndex?: number;
  finalAnswer: string;
  rationale: string;
}

/**
 * v8 — Self-consistency. Sample the SAME task N times in parallel (independent
 * attempts), then a judge either SELECTS the best sample or MERGES them into a
 * consensus answer. Distinct from v4: there is no critique–revise loop on a
 * single draft — the diversity comes from independent parallel sampling.
 */
export class SelfConsistencyRunner {
  private model: OpenAIModel;
  private apiKey?: string;
  private providerId: ProviderId;
  private emit: EventSink = () => {};
  private iterations = 0;
  private totalIn = 0;
  private totalOut = 0;
  private totalCost = 0;

  constructor(options: SelfConsistencyOptions = {}) {
    this.model = options.model ?? DEFAULT_MODEL;
    this.apiKey = options.apiKey;
    this.providerId = options.providerId ?? "openai";
  }

  async run(
    userQuery: string,
    _conversation: Conversation = new Conversation(),
    onEvent?: EventSink,
  ): Promise<SelfConsistencyResult> {
    return withProvider({ providerId: this.providerId, apiKey: this.apiKey }, async () => {
      this.emit = onEvent ?? (() => {});
      this.iterations = 0;
      this.totalIn = 0;
      this.totalOut = 0;
      this.totalCost = 0;

      log.box("🎲 v8 Self-Consistency Workflow", "yellow");
      log.kv({ Query: `"${userQuery.slice(0, 80)}${userQuery.length > 80 ? "…" : ""}"`, Samples: SAMPLES });

      const startTime = Date.now();
      this.emit({ type: "workflow_start", mode: "v8", model: this.model, query: userQuery, startingAgent: "sampler" });

      // Draw SAMPLES independent answers to the SAME task, in parallel.
      const sampleTexts = await Promise.all(
        Array.from({ length: SAMPLES }, (_, i) => this.runSample(userQuery, i)),
      );

      // Judge: select the best or merge into a consensus.
      const verdict = await this.runJudge(userQuery, sampleTexts);

      const chosenIndex = verdict.method === "select" ? verdict.chosenIndex : undefined;
      const samples = sampleTexts.map((text, index) => ({
        index,
        text,
        chosen: chosenIndex !== undefined && index === chosenIndex,
      }));

      const summary: RunSummary = {
        kind: "self-consistency",
        samples,
        method: verdict.method,
        rationale: verdict.rationale,
      };

      const methodNote =
        verdict.method === "select"
          ? `\n\n_(self-consistency: judge selected sample ${(chosenIndex ?? 0) + 1} of ${SAMPLES})_`
          : `\n\n_(self-consistency: judge merged ${SAMPLES} samples into a consensus)_`;
      const finalOutput = `${verdict.finalAnswer}${methodNote}`;

      const totalDuration = Date.now() - startTime;
      log.box("✅ v8 Complete", "green");
      log.kv({
        Method: verdict.method,
        Iterations: this.iterations,
        "Total duration": `${totalDuration}ms`,
        "Est. cost": `${formatCost(this.totalCost)} (${(this.totalIn + this.totalOut).toLocaleString()} tokens)`,
      });

      this.emit({
        type: "workflow_complete",
        mode: "v8",
        result: finalOutput,
        iterations: this.iterations,
        totalDuration,
        agentsUsed: ["sampler", "judge"],
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
      };
    });
  }

  /** Run one independent sampler on the task; returns its answer text. */
  private async runSample(userQuery: string, index: number): Promise<string> {
    const iteration = ++this.iterations;
    const label = `sample ${index + 1}`;
    this.emit({ type: "iteration_start", iteration, agent: label });
    log.iteration(iteration, label);

    const start = Date.now();
    const agent = createSamplerAgent(this.model, {
      onStep: ({ stepIndex, text, toolNames }) =>
        this.emit({ type: "agent_step", agent: label, iteration, stepIndex, text, toolNames }),
    }) as unknown as RunnableAgent;

    const result = await agent.generate({ prompt: userQuery });
    let answer = "";
    forEachToolResult(result, (v) => {
      if (typeof v.answer === "string") answer = v.answer;
    });
    const text = answer || result.text;

    this.account(result, label, iteration, Date.now() - start, text);
    this.emit({ type: "sample", index, preview: text.slice(0, 240) });
    return text;
  }

  /** Run the judge over all samples; returns its verdict. */
  private async runJudge(userQuery: string, samples: string[]): Promise<JudgeVerdict> {
    const iteration = ++this.iterations;
    const label = "judge";
    this.emit({ type: "iteration_start", iteration, agent: label });
    log.iteration(iteration, label);

    const start = Date.now();
    const agent = createJudgeAgent(this.model, {
      onStep: ({ stepIndex, text, toolNames }) =>
        this.emit({ type: "agent_step", agent: label, iteration, stepIndex, text, toolNames }),
    }) as unknown as RunnableAgent;

    const candidateBlock = samples
      .map((s, i) => `### Candidate ${i} (index ${i})\n${s}`)
      .join("\n\n---\n\n");
    const prompt =
      `Original task:\n${userQuery}\n\n` +
      `Here are the ${samples.length} candidate answers from independent samplers:\n\n` +
      `${candidateBlock}\n\n` +
      `Compare them. SELECT the single best (give its 0-based chosenIndex) or MERGE them into a ` +
      `stronger consensus answer. Call decide with your verdict.`;

    const result = await agent.generate({ prompt });
    const verdict = this.parseVerdict(result, samples);
    this.account(result, label, iteration, Date.now() - start, verdict.finalAnswer);
    return verdict;
  }

  /** Extract the judge's decide verdict, with safe fallbacks. */
  private parseVerdict(result: AgentResult, samples: string[]): JudgeVerdict {
    let verdict: JudgeVerdict | null = null;
    forEachToolResult(result, (v) => {
      if (v.decided && (v.method === "select" || v.method === "merge")) {
        verdict = {
          method: v.method,
          chosenIndex: typeof v.chosenIndex === "number" ? v.chosenIndex : undefined,
          finalAnswer: typeof v.finalAnswer === "string" ? v.finalAnswer : "",
          rationale: typeof v.rationale === "string" ? v.rationale : "",
        };
      }
    });

    if (verdict) {
      const v = verdict as JudgeVerdict;
      if (!v.finalAnswer) {
        // Fall back to the chosen sample (or first) if the judge omitted text.
        const idx = v.method === "select" && typeof v.chosenIndex === "number" ? v.chosenIndex : 0;
        v.finalAnswer = samples[idx] ?? result.text;
      }
      return v;
    }

    // No decide call — degrade to selecting the first sample.
    return {
      method: "select",
      chosenIndex: 0,
      finalAnswer: samples[0] ?? result.text,
      rationale: "Judge did not return a structured verdict; defaulted to the first sample.",
    };
  }

  /** Tally tokens/cost and emit iteration_end for a completed pass. */
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
      outputPreview: output.slice(0, 240),
      completed: true,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd,
    });
  }
}

export async function runSelfConsistency(
  userQuery: string,
  options: SelfConsistencyOptions = {},
  onEvent?: EventSink,
  conversation: Conversation = new Conversation(),
): Promise<SelfConsistencyResult> {
  return new SelfConsistencyRunner(options).run(userQuery, conversation, onEvent);
}

// Re-export for route typing convenience.
export type { AgentEvent };
