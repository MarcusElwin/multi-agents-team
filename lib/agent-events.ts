export type AgentEvent =
  | {
      type: 'workflow_start';
      mode: 'v1' | 'v2';
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
    }
  | { type: 'tool_call'; agent: string; toolName: string; preview?: string }
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
      type: 'bus_message';
      from: string;
      to: string;
      messageType: 'user' | 'agent' | 'system';
      content: string;
    }
  | { type: 'handoff'; from: string; to: string }
  | {
      type: 'workflow_complete';
      mode: 'v1' | 'v2';
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
    }
  | { type: 'workflow_error'; error: string };

export type EventSink = (event: AgentEvent) => void;

const NOOP: EventSink = () => {};

export function noopSink(): EventSink {
  return NOOP;
}
