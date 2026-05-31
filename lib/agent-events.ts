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
