import { Conversation } from "./conversation";
import { DEFAULT_MODEL, estimateCost, formatCost, type OpenAIModel } from "./models";
import type { AgentEvent, EventSink } from "./agent-events";
import { createDebaterAgent } from "./agents-v5/debater-agent";
import { createJudgeAgent } from "./agents-v5/judge-agent";
import * as log from "./logger";

const ROUNDS = 3; // number of back-and-forth rounds before judging

const AFFIRMATIVE = "Affirmative";
const OPPOSING = "Opposing";
const JUDGE = "Judge";

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
interface DebateAgent {
  generate(opts: { prompt: string }): Promise<AgentResult>;
}

export interface DebateResult {
  finalOutput: string;
  totalDuration: number;
  iterations: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
}

export interface DebateOptions {
  model?: OpenAIModel;
}

interface Verdict {
  winner: string;
  reasoning: string;
  synthesis: string;
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
 * v5 — Debate / Consensus.
 *
 * Two debaters argue OPPOSING stances on the user's question across ROUNDS
 * rounds. Each round the Affirmative argues, then the Opposing rebuts (seeing
 * the Affirmative's latest). Every argument is appended to a running transcript
 * and surfaced as a bus_message so the debate is visible live. After the rounds,
 * an impartial Judge reads the whole transcript and renders the verdict, which
 * becomes the final deliverable.
 */
export class DebateRunner {
  private model: OpenAIModel;
  private emit: EventSink = () => {};
  private iteration = 0;
  private totalIn = 0;
  private totalOut = 0;
  private totalCost = 0;

  constructor(options: DebateOptions = {}) {
    this.model = options.model ?? DEFAULT_MODEL;
  }

  async run(
    userQuery: string,
    _conversation: Conversation = new Conversation(),
    onEvent?: EventSink,
  ): Promise<DebateResult> {
    this.emit = onEvent ?? (() => {});
    this.iteration = 0;
    this.totalIn = 0;
    this.totalOut = 0;
    this.totalCost = 0;

    log.box("⚖️ v5 Debate / Consensus Workflow", "yellow");
    log.kv({ Query: `"${userQuery.slice(0, 80)}${userQuery.length > 80 ? "…" : ""}"` });

    const startTime = Date.now();
    this.emit({ type: "workflow_start", mode: "v5", model: this.model, query: userQuery, startingAgent: AFFIRMATIVE });

    // Generic, robust stance derivation — no setup call needed.
    const affStance = `the affirmative / pro position on: ${userQuery}`;
    const conStance = `the opposing / con position on: ${userQuery}`;

    const transcript: string[] = [];
    let lastAffArgument = "";
    let lastConArgument = "";

    for (let round = 1; round <= ROUNDS; round++) {
      log.step(`Round ${round} of ${ROUNDS}`);

      // Affirmative argues (rebutting the Opposing's last argument from round-1).
      const affArg = await this.runDebater(AFFIRMATIVE, affStance, round, lastConArgument, userQuery);
      lastAffArgument = affArg;
      transcript.push(`### Round ${round} — ${AFFIRMATIVE}\n${affArg}`);
      this.emit({ type: "bus_message", from: AFFIRMATIVE, to: "debate", messageType: "agent", content: affArg });

      // Opposing rebuts the Affirmative's just-made argument.
      const conArg = await this.runDebater(OPPOSING, conStance, round, lastAffArgument, userQuery);
      lastConArgument = conArg;
      transcript.push(`### Round ${round} — ${OPPOSING}\n${conArg}`);
      this.emit({ type: "bus_message", from: OPPOSING, to: "debate", messageType: "agent", content: conArg });
    }

    const fullTranscript = transcript.join("\n\n");

    // Judge reads the whole transcript and renders the verdict.
    const verdict = await this.runJudge(userQuery, fullTranscript);

    const finalOutput =
      `## Verdict\n\n` +
      `**Winner:** ${verdict.winner}\n\n` +
      `${verdict.reasoning}\n\n` +
      `## Recommendation\n\n` +
      `${verdict.synthesis}`;

    const totalDuration = Date.now() - startTime;
    log.box("✅ v5 Complete", "green");
    log.kv({
      Rounds: ROUNDS,
      Winner: verdict.winner,
      "Total duration": `${totalDuration}ms`,
      "Est. cost": `${formatCost(this.totalCost)} (${(this.totalIn + this.totalOut).toLocaleString()} tokens)`,
    });

    this.emit({
      type: "workflow_complete",
      mode: "v5",
      result: finalOutput,
      iterations: this.iteration,
      totalDuration,
      agentsUsed: [AFFIRMATIVE, OPPOSING, JUDGE],
      totalInputTokens: this.totalIn,
      totalOutputTokens: this.totalOut,
      totalCostUsd: this.totalCost,
    });

    return {
      finalOutput,
      totalDuration,
      iterations: this.iteration,
      totalInputTokens: this.totalIn,
      totalOutputTokens: this.totalOut,
      totalCostUsd: this.totalCost,
    };
  }

  /** Run one debater turn; returns its argument and accounts tokens/iteration. */
  private async runDebater(
    stanceLabel: string,
    stance: string,
    round: number,
    opponentLast: string,
    userQuery: string,
  ): Promise<string> {
    this.iteration++;
    const iter = this.iteration;
    this.emit({ type: "iteration_start", iteration: iter, agent: stanceLabel });
    log.iteration(iter, `${stanceLabel} (round ${round})`);

    const agent = createDebaterAgent(this.model, this.makeHooks(stanceLabel, iter), stance) as unknown as DebateAgent;

    const prompt =
      round === 1 || !opponentLast
        ? `The question being debated:\n${userQuery}\n\n` +
          `This is round ${round}. Open with the strongest case for your stance.`
        : `The question being debated:\n${userQuery}\n\n` +
          `This is round ${round}. Your opponent just argued:\n\n"${opponentLast}"\n\n` +
          `Directly rebut their specific points, then advance new support for your stance.`;

    const start = Date.now();
    const result = await agent.generate({ prompt });
    let argument = "";
    forEachToolResult(result, (v) => {
      if (typeof v.argument === "string") argument = v.argument;
    });
    argument = argument || result.text;
    this.account(result, stanceLabel, iter, Date.now() - start, argument);
    return argument;
  }

  /** Run the judge over the full transcript; returns the parsed verdict. */
  private async runJudge(userQuery: string, transcript: string): Promise<Verdict> {
    this.iteration++;
    const iter = this.iteration;
    this.emit({ type: "iteration_start", iteration: iter, agent: JUDGE });
    log.iteration(iter, JUDGE);

    const agent = createJudgeAgent(this.model, this.makeHooks(JUDGE, iter)) as unknown as DebateAgent;

    const prompt =
      `The question being debated:\n${userQuery}\n\n` +
      `Full debate transcript (${AFFIRMATIVE} vs ${OPPOSING}):\n\n${transcript}\n\n` +
      `Weigh both sides and call verdict with the winner, your reasoning, and a synthesized recommendation.`;

    const start = Date.now();
    const result = await agent.generate({ prompt });
    let verdict: Verdict = { winner: "Consensus", reasoning: "", synthesis: "" };
    forEachToolResult(result, (v) => {
      if (typeof v.winner === "string" && typeof v.reasoning === "string" && typeof v.synthesis === "string") {
        verdict = { winner: v.winner, reasoning: v.reasoning, synthesis: v.synthesis };
      }
    });
    if (!verdict.reasoning && !verdict.synthesis) verdict.synthesis = result.text;
    this.account(result, JUDGE, iter, Date.now() - start, `${verdict.winner}: ${verdict.reasoning}`);
    return verdict;
  }

  private makeHooks(agent: string, iteration: number) {
    return {
      onStep: ({ stepIndex, text, toolNames }: { stepIndex: number; text: string; toolNames: string[] }) =>
        this.emit({ type: "agent_step", agent, iteration, stepIndex, text, toolNames }),
    };
  }

  /** Tally tokens/cost and emit iteration_end for a completed turn. */
  private account(
    result: AgentResult,
    agent: string,
    iteration: number,
    durationMs: number,
    output: string,
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
      outputPreview: output.slice(0, 240),
      completed: true,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd,
    });
  }
}

export async function runDebate(
  userQuery: string,
  options: DebateOptions = {},
  onEvent?: EventSink,
  conversation: Conversation = new Conversation(),
): Promise<DebateResult> {
  return new DebateRunner(options).run(userQuery, conversation, onEvent);
}

// Re-export for route typing convenience.
export type { AgentEvent };

export { ROUNDS };
