import { Conversation } from "./conversation";
import { DEFAULT_MODEL, estimateCost, formatCost, type OpenAIModel, type ProviderId } from "./models";
import { withProvider } from "./provider";
import type { AgentEvent, EventSink } from "./agent-events";
import { createContributorAgent } from "./agents-v6/contributor-agent";
import * as log from "./logger";

// Fixed roster of generic contributors that work for any task. A content-driven
// controller picks among these each round (see pickNextRole).
export const ROLES = ["analyst", "planner", "critic"] as const;
type Role = (typeof ROLES)[number];

// Hard backstop so the loop always terminates regardless of model behaviour.
export const MAX_ROUNDS = 8;

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
interface ContributorAgent {
  generate(opts: { prompt: string }): Promise<AgentResult>;
}

/** One section of the shared workspace. */
interface BoardEntry {
  content: string;
  author: string;
}
type Blackboard = Map<string, BoardEntry>;

interface SectionWrite {
  section: string;
  content: string;
  solutionReady: boolean;
}

export interface BlackboardResult {
  finalOutput: string;
  totalDuration: number;
  iterations: number;
  agentsUsed: string[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
}

export interface BlackboardOptions {
  model?: OpenAIModel;
  apiKey?: string;
  providerId?: ProviderId;
}

/** Render the whole board as text for injection into a contributor prompt. */
function renderBoard(board: Blackboard): string {
  if (board.size === 0) return "(the blackboard is empty — be the first to contribute)";
  return [...board.entries()]
    .map(([section, entry]) => `## ${section}  _(by ${entry.author})_\n${entry.content}`)
    .join("\n\n");
}

/** Render the board as the final markdown deliverable, highlighting a solution. */
function renderResult(board: Blackboard): string {
  const sections = [...board.entries()];
  const solution = sections.find(([s]) => s.toLowerCase() === "solution");
  const lines: string[] = ["# Blackboard"];
  if (solution) {
    lines.push(`\n## ✅ Solution\n${solution[1].content}`);
  }
  for (const [section, entry] of sections) {
    if (section.toLowerCase() === "solution") continue;
    lines.push(`\n## ${section}\n_${entry.author}_\n\n${entry.content}`);
  }
  return lines.join("\n");
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
 * v6 — Blackboard (shared workspace, content-driven selection).
 *
 * Agents share a structured blackboard (named sections). Each round a cheap
 * heuristic controller inspects the board and picks the next contributor —
 * the role that has contributed LEAST so far (ties broken by roster order),
 * so the board fills from all angles instead of plain round-robin. The chosen
 * contributor reads the whole board, writes/refines one section, and writes
 * back. No agent talks to another directly — all coordination is via the board.
 * The loop stops when a contributor marks the solution ready, when the board
 * stops growing (stuck), or at MAX_ROUNDS.
 *
 * NOTE: the heuristic controller keeps cost down; a full LLM controller (asking
 * a model which role should act next given the board) could replace pickNextRole.
 */
export class BlackboardRunner {
  private model: OpenAIModel;
  private apiKey?: string;
  private providerId: ProviderId;
  private emit: EventSink = () => {};
  private totalIn = 0;
  private totalOut = 0;
  private totalCost = 0;

  constructor(options: BlackboardOptions = {}) {
    this.model = options.model ?? DEFAULT_MODEL;
    this.apiKey = options.apiKey;
    this.providerId = options.providerId ?? 'openai';
  }

  /** Heuristic controller: pick the role that has contributed least so far. */
  private pickNextRole(contributions: Record<Role, number>): Role {
    let best: Role = ROLES[0];
    for (const role of ROLES) {
      if (contributions[role] < contributions[best]) best = role;
    }
    return best;
  }

  async run(
    userQuery: string,
    conversation: Conversation = new Conversation(),
    onEvent?: EventSink,
  ): Promise<BlackboardResult> {
    return withProvider({ providerId: this.providerId, apiKey: this.apiKey }, async () => {
    this.emit = onEvent ?? (() => {});
    this.totalIn = 0;
    this.totalOut = 0;
    this.totalCost = 0;

    log.box("📋 v6 Blackboard Workflow", "magenta");
    log.kv({ Query: `"${userQuery.slice(0, 80)}${userQuery.length > 80 ? "…" : ""}"` });

    const startTime = Date.now();
    this.emit({ type: "workflow_start", mode: "v6", model: this.model, query: userQuery, startingAgent: ROLES[0] });

    const board: Blackboard = new Map();
    const contributions: Record<Role, number> = { analyst: 0, planner: 0, critic: 0 };
    const agentsUsed: string[] = [];
    const history = conversation.renderHistory();

    let solutionReady = false;
    let staleRounds = 0; // consecutive rounds that added no new section content
    let round = 0;

    for (round = 1; round <= MAX_ROUNDS; round++) {
      const role = this.pickNextRole(contributions);
      this.emit({ type: "iteration_start", iteration: round, agent: role });
      log.iteration(round, role);

      const start = Date.now();
      const agent = createContributorAgent(this.model, {
        onStep: ({ stepIndex, text, toolNames }) =>
          this.emit({ type: "agent_step", agent: role, iteration: round, stepIndex, text, toolNames }),
      }, role) as unknown as ContributorAgent;

      const prompt =
        (history ? `Conversation so far:\n${history}\n\n` : "") +
        `TASK:\n${userQuery}\n\n` +
        `CURRENT BLACKBOARD:\n${renderBoard(board)}\n\n` +
        `You are the "${role}". Read the board above, then call writeSection once to add or ` +
        `refine your section. Set solutionReady=true only if the task is now fully solved.`;

      const result = await agent.generate({ prompt });
      const write = this.parseWrite(result);
      contributions[role]++;
      if (!agentsUsed.includes(role)) agentsUsed.push(role);

      let grew = false;
      if (write) {
        const prev = board.get(write.section);
        if (!prev || prev.content !== write.content) grew = true;
        board.set(write.section, { content: write.content, author: role });
        if (write.solutionReady) solutionReady = true;

        this.emit({
          type: "blackboard_update",
          section: write.section,
          author: role,
          preview: write.content.slice(0, 240),
        });
        log.step(`${role} wrote "${write.section}" (${write.content.length} chars)${write.solutionReady ? " · solutionReady" : ""}`);
      } else {
        log.step(`${role} produced no section this round`);
      }

      this.account(result, role, round, Date.now() - start, write?.content ?? result.text);

      // Stuck detection: two consecutive rounds with no new section content.
      staleRounds = grew ? 0 : staleRounds + 1;
      if (solutionReady) {
        log.step("solution marked ready — stopping");
        break;
      }
      if (staleRounds >= 2) {
        log.step("no new content for 2 consecutive rounds — stopping (stuck)");
        break;
      }
    }

    const iterations = Math.min(round, MAX_ROUNDS);
    const finalOutput = renderResult(board);
    const totalDuration = Date.now() - startTime;
    const sections = [...board.entries()].map(([section, entry]) => ({ section, author: entry.author, content: entry.content }));

    log.box("✅ v6 Complete", "green");
    log.kv({
      Rounds: iterations,
      Sections: board.size,
      Contributors: agentsUsed.join(", ") || "none",
      "Total duration": `${totalDuration}ms`,
      "Est. cost": `${formatCost(this.totalCost)} (${(this.totalIn + this.totalOut).toLocaleString()} tokens)`,
    });

    this.emit({
      type: "workflow_complete",
      mode: "v6",
      result: finalOutput,
      iterations,
      totalDuration,
      agentsUsed,
      totalInputTokens: this.totalIn,
      totalOutputTokens: this.totalOut,
      totalCostUsd: this.totalCost,
      summary: { kind: "blackboard", sections },
    });

    return {
      finalOutput,
      totalDuration,
      iterations,
      agentsUsed,
      totalInputTokens: this.totalIn,
      totalOutputTokens: this.totalOut,
      totalCostUsd: this.totalCost,
    };
    });
  }

  /** Extract the writeSection contribution from a contributor's result. */
  private parseWrite(result: AgentResult): SectionWrite | null {
    let write: SectionWrite | null = null;
    forEachToolResult(result, (v) => {
      if (v.wrote && typeof v.section === "string" && typeof v.content === "string") {
        write = {
          section: v.section,
          content: v.content,
          solutionReady: v.solutionReady === true,
        };
      }
    });
    return write;
  }

  /** Tally tokens/cost and emit iteration_end for a completed round. */
  private account(result: AgentResult, role: string, iteration: number, durationMs: number, output: string) {
    const usage = readUsage(result);
    const costUsd = estimateCost(this.model, usage);
    this.totalIn += usage.inputTokens;
    this.totalOut += usage.outputTokens;
    this.totalCost += costUsd;

    this.emit({
      type: "iteration_end",
      iteration,
      agent: role,
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

export async function runBlackboard(
  userQuery: string,
  options: BlackboardOptions = {},
  onEvent?: EventSink,
  conversation: Conversation = new Conversation(),
): Promise<BlackboardResult> {
  return new BlackboardRunner(options).run(userQuery, conversation, onEvent);
}

// Re-export for route typing convenience.
export type { AgentEvent };
