export type AgentEvent =
  | {
      type: 'workflow_start';
      mode: 'v1' | 'v2' | 'v3';
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
      type: 'bus_message';
      from: string;
      to: string;
      messageType: 'user' | 'agent' | 'system';
      content: string;
    }
  | { type: 'handoff'; from: string; to: string }
  | {
      type: 'workflow_complete';
      mode: 'v1' | 'v2' | 'v3';
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
    }
  | { type: 'workflow_error'; error: string };

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
