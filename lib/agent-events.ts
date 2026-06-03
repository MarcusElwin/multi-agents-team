export type AgentEvent =
  | {
      type: 'workflow_start';
      mode: 'v1' | 'v2' | 'v3' | 'v4' | 'v5' | 'v6' | 'v7';
      model: string;
      query: string;
      startingAgent?: string;
    }
  | { type: 'iteration_start'; iteration: number; agent: string }
  | {
      type: 'iteration_end';
      iteration: number;
      agent: string;
      durationMs: number;
      stepCount: number;
      outputPreview: string;
      completed?: boolean;
      // Token usage + estimated USD cost for this iteration, when available.
      inputTokens?: number;
      outputTokens?: number;
      costUsd?: number;
    }
  | { type: 'tool_call'; agent: string; toolName: string; preview?: string }
  | {
      // Reasoning text produced at the end of each LLM step, surfaced live so the
      // UI can show what an agent is thinking during a long-running turn.
      type: 'agent_step';
      agent: string;
      iteration?: number;
      stepIndex: number;
      text: string;
      toolNames: string[];
    }
  | {
      // The researcher's web search tool ran. status 'start' on dispatch,
      // 'done' when results return (with source count).
      type: 'web_search';
      agent: string;
      status: 'start' | 'done';
      query: string;
      sources?: number;
    }
  | {
      // The coordinator's planned workflow (from analyzeRequest), surfaced so
      // the UI can show the plan and "next step" while the run proceeds.
      type: 'agent_plan';
      agent: string;
      intent: string;
      steps: Array<{ agent: string; task: string }>;
    }
  | {
      // An agent is requesting input from the human before it can continue.
      // The run pauses until the client POSTs an input_response with this id.
      type: 'input_request';
      requestId: string;
      agent: string;
      question: string;
    }
  | {
      // v3 hierarchical: a node was spawned in the agent tree. parentId is null
      // for the root lead. Lets the UI build the tree live as agents appear.
      type: 'agent_spawn';
      id: string;
      parentId: string | null;
      role: string;
      task: string;
      depth: number;
    }
  | {
      // v4 evaluator–optimizer: the critic scored a draft this round.
      type: 'critique';
      round: number;
      score: number; // 0–10
      passed: boolean;
      issues: string[];
    }
  | {
      // v6 blackboard: a section of the shared workspace was written/updated.
      type: 'blackboard_update';
      section: string;
      author: string;
      preview: string;
    }
  | {
      // v7 market: a task was posted to the auction board.
      type: 'task_posted';
      taskId: string;
      title: string;
    }
  | {
      // v7 market: an agent bid on a task (fit 0–1, estimated USD).
      type: 'bid';
      taskId: string;
      agent: string;
      fit: number;
      estCostUsd: number;
    }
  | {
      // v7 market: a task was awarded to the winning bidder.
      type: 'task_awarded';
      taskId: string;
      agent: string;
    }
  | {
      type: 'bus_message';
      from: string;
      to: string;
      messageType: 'user' | 'agent' | 'system';
      content: string;
    }
  | { type: 'handoff'; from: string; to: string }
  | {
      type: 'workflow_complete';
      mode: 'v1' | 'v2' | 'v3' | 'v4' | 'v5' | 'v6' | 'v7';
      result?: string;
      agentResults?: Array<{
        agent: string;
        output: string;
        duration: number;
        completed: boolean;
      }>;
      iterations?: number;
      totalDuration?: number;
      agentsUsed?: string[];
      messageBusStats?: unknown;
      // Aggregate token usage + estimated USD cost across the whole run.
      totalInputTokens?: number;
      totalOutputTokens?: number;
      totalCostUsd?: number;
      // Optional structured summary for a pattern-specific in-chat visualization
      // (v4 score ladder, v5 debate, v6 blackboard, v7 auction). Persists in the
      // message so the rich view survives reload.
      summary?: RunSummary;
    }
  | { type: 'workflow_error'; error: string };

/** Pattern-specific summaries rendered as bespoke cards in the completed message. */
export type RunSummary =
  | {
      kind: 'evaluator';
      rounds: Array<{ round: number; score: number; passed: boolean; issues: string[]; draft: string }>;
    }
  | {
      kind: 'debate';
      question: string;
      turns: Array<{ stance: string; round: number; argument: string }>;
      verdict: { winner: string; reasoning: string; synthesis: string };
    }
  | {
      kind: 'blackboard';
      sections: Array<{ section: string; author: string; content: string }>;
    }
  | {
      kind: 'market';
      tasks: Array<{ taskId: string; title: string }>;
      bids: Array<{ taskId: string; agent: string; fit: number; estCostUsd: number }>;
      awards: Array<{ taskId: string; agent: string; output?: string }>;
    };

export type EventSink = (event: AgentEvent) => void;

/**
 * Hooks passed into agent factories so an agent's tools/steps can emit events
 * into the live run. The orchestrator/runner supplies closures that forward to
 * the current run's EventSink with the right agent name and iteration.
 */
export interface AgentHooks {
  onStep?: (info: { stepIndex: number; text: string; toolNames: string[] }) => void;
  onWebSearch?: (info: { status: 'start' | 'done'; query: string; sources?: number }) => void;
}

const NOOP: EventSink = () => {};

export function noopSink(): EventSink {
  return NOOP;
}
