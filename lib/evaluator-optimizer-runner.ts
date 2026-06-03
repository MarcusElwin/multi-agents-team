import { Conversation } from "./conversation";
import { DEFAULT_MODEL, estimateCost, formatCost, type OpenAIModel } from "./models";
import type { AgentEvent, EventSink } from "./agent-events";
import { createGeneratorAgent } from "./agents-v4/generator-agent";
import { createCriticAgent } from "./agents-v4/critic-agent";
import * as log from "./logger";

const THRESHOLD = 8; // critic score (0–10) at/above which a draft passes
const MAX_ROUNDS = 4; // hard cap on generate → critique → revise rounds

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
interface GeneratorAgent {
  generate(opts: { prompt: string }): Promise<AgentResult>;
}
interface CriticAgent {
  generate(opts: { prompt: string }): Promise<AgentResult>;
}

interface Critique {
  score: number;
  issues: string[];
  rationale: string;
}

export interface EvaluatorOptimizerResult {
  finalOutput: string;
  finalScore: number;
  rounds: number;
  totalDuration: number;
  iterations: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
}

export interface EvaluatorOptimizerOptions {
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
 * v4 — Evaluator–Optimizer.
 *
 * A generator produces a draft; a critic scores it 0–10 against a rubric and
 * lists concrete issues; the generator revises to address them. The loop repeats
 * until the critic passes (score >= THRESHOLD) or MAX_ROUNDS is reached, at which
 * point the best draft seen so far is returned.
 */
export class EvaluatorOptimizerRunner {
  private model: OpenAIModel;
  private emit: EventSink = () => {};
  private iterations = 0;
  private totalIn = 0;
  private totalOut = 0;
  private totalCost = 0;

  constructor(options: EvaluatorOptimizerOptions = {}) {
    this.model = options.model ?? DEFAULT_MODEL;
  }

  async run(
    userQuery: string,
    _conversation: Conversation = new Conversation(),
    onEvent?: EventSink,
  ): Promise<EvaluatorOptimizerResult> {
    this.emit = onEvent ?? (() => {});
    this.iterations = 0;
    this.totalIn = 0;
    this.totalOut = 0;
    this.totalCost = 0;

    log.box("🔁 v4 Evaluator–Optimizer Workflow", "yellow");
    log.kv({ Query: `"${userQuery.slice(0, 80)}${userQuery.length > 80 ? "…" : ""}"` });

    const startTime = Date.now();
    this.emit({
      type: "workflow_start",
      mode: "v4",
      model: this.model,
      query: userQuery,
      startingAgent: "generator",
    });

    let bestDraft = "";
    let bestScore = -1;
    let lastDraft = "";
    let lastIssues: string[] = [];
    let finalScore = 0;
    let round = 0;
    const rounds: Array<{ round: number; score: number; passed: boolean; issues: string[]; draft: string }> = [];

    while (round < MAX_ROUNDS) {
      round++;

      // 1) Generator: produce (round 1) or revise (later rounds) a draft.
      const genPrompt =
        round === 1
          ? `Produce a high-quality deliverable for this request:\n\n${userQuery}`
          : `Original request:\n\n${userQuery}\n\n` +
            `Your previous draft was:\n\n${lastDraft}\n\n` +
            `A demanding reviewer scored it ${finalScore}/10 and raised these issues:\n` +
            lastIssues.map((iss, i) => `${i + 1}. ${iss}`).join("\n") +
            `\n\nRevise the draft so that EVERY issue above is addressed, then submit it.`;
      const draft = await this.runGenerator(genPrompt, round);
      lastDraft = draft;
      if (!draft) break;

      // 2) Critic: score the draft against the rubric.
      const critPrompt =
        `Original request:\n\n${userQuery}\n\n` +
        `Evaluate this draft (round ${round}):\n\n${draft}\n\n` +
        `Score it 0–10 against clarity, correctness, completeness, and usefulness, ` +
        `list concrete actionable issues, and give a short rationale.`;
      const critique = await this.runCritic(critPrompt, round);
      finalScore = critique.score;
      lastIssues = critique.issues;

      const passed = critique.score >= THRESHOLD;
      rounds.push({ round, score: critique.score, passed, issues: critique.issues, draft });
      this.emit({
        type: "critique",
        round,
        score: critique.score,
        passed,
        issues: critique.issues,
      });
      log.step(
        `round ${round}: score ${critique.score}/10 — ${passed ? "PASS" : "revise"}` +
          (critique.issues.length ? ` (${critique.issues.length} issue(s))` : ""),
      );

      // Track the best draft regardless of pass/fail, so a non-passing run still
      // returns its strongest attempt.
      if (critique.score > bestScore) {
        bestScore = critique.score;
        bestDraft = draft;
      }

      if (passed) break;
    }

    const finalOutput = bestDraft || lastDraft;
    const finalScoreOut = bestScore >= 0 ? bestScore : finalScore;
    const totalDuration = Date.now() - startTime;

    log.box("✅ v4 Complete", "green");
    log.kv({
      Rounds: round,
      "Final score": `${finalScoreOut}/10`,
      "Agent calls": this.iterations,
      "Total duration": `${totalDuration}ms`,
      "Est. cost": `${formatCost(this.totalCost)} (${(this.totalIn + this.totalOut).toLocaleString()} tokens)`,
    });

    const note =
      `\n\n---\n_Evaluator–optimizer: final score ${finalScoreOut}/10 after ${round} round` +
      `${round === 1 ? "" : "s"}._`;

    this.emit({
      type: "workflow_complete",
      mode: "v4",
      result: finalOutput + note,
      iterations: this.iterations,
      totalDuration,
      agentsUsed: ["generator", "critic"],
      totalInputTokens: this.totalIn,
      totalOutputTokens: this.totalOut,
      totalCostUsd: this.totalCost,
      summary: { kind: "evaluator", rounds },
    });

    return {
      finalOutput,
      finalScore: finalScoreOut,
      rounds: round,
      totalDuration,
      iterations: this.iterations,
      totalInputTokens: this.totalIn,
      totalOutputTokens: this.totalOut,
      totalCostUsd: this.totalCost,
    };
  }

  /** Run the generator for one round; returns the submitted draft (or text). */
  private async runGenerator(prompt: string, round: number): Promise<string> {
    this.iterations++;
    const iteration = this.iterations;
    this.emit({ type: "iteration_start", iteration, agent: "generator" });
    log.iteration(iteration, `generator (round ${round})`);

    const start = Date.now();
    const agent = createGeneratorAgent(this.model, {
      onStep: ({ stepIndex, text, toolNames }) =>
        this.emit({ type: "agent_step", agent: "generator", iteration, stepIndex, text, toolNames }),
    }) as unknown as GeneratorAgent;

    const result = await agent.generate({ prompt });

    let draft = "";
    forEachToolResult(result, (v) => {
      if (typeof v.draft === "string") draft = v.draft;
    });
    const deliverable = draft || result.text;
    this.account(result, "generator", iteration, Date.now() - start, deliverable);
    return deliverable;
  }

  /** Run the critic for one round; returns the parsed critique. */
  private async runCritic(prompt: string, round: number): Promise<Critique> {
    this.iterations++;
    const iteration = this.iterations;
    this.emit({ type: "iteration_start", iteration, agent: "critic" });
    log.iteration(iteration, `critic (round ${round})`);

    const start = Date.now();
    const agent = createCriticAgent(this.model, {
      onStep: ({ stepIndex, text, toolNames }) =>
        this.emit({ type: "agent_step", agent: "critic", iteration, stepIndex, text, toolNames }),
    }) as unknown as CriticAgent;

    const result = await agent.generate({ prompt });

    let critique: Critique = { score: 0, issues: [], rationale: "" };
    forEachToolResult(result, (v) => {
      if (typeof v.score === "number") {
        critique = {
          score: v.score,
          issues: Array.isArray(v.issues) ? (v.issues as string[]) : [],
          rationale: typeof v.rationale === "string" ? v.rationale : "",
        };
      }
    });
    const preview = `score ${critique.score}/10 · ${critique.issues.length} issue(s)`;
    this.account(result, "critic", iteration, Date.now() - start, preview);
    return critique;
  }

  /** Tally tokens/cost and emit iteration_end for a completed agent call. */
  private account(
    result: AgentResult,
    agent: string,
    iteration: number,
    durationMs: number,
    preview: string,
  ) {
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
      outputPreview: preview.slice(0, 240),
      completed: true,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd,
    });
  }
}

export async function runEvaluatorOptimizer(
  userQuery: string,
  options: EvaluatorOptimizerOptions = {},
  onEvent?: EventSink,
  conversation: Conversation = new Conversation(),
): Promise<EvaluatorOptimizerResult> {
  return new EvaluatorOptimizerRunner(options).run(userQuery, conversation, onEvent);
}

// Re-export for route typing convenience.
export type { AgentEvent };
