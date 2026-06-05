import type { AgentEvent, EventSink } from '@/lib/agent-events';
import type { ConversationTurn } from '@/lib/conversation';
import type { Mode } from '@/lib/modes';
import type { ProviderId } from '@/lib/models';
import { iiiEngineUrl, iiiTurnFunctionId, iiiTurnTimeoutMs } from './config';

/**
 * Adapter that runs a turn on the iii engine instead of the in-app harness, and
 * bridges the engine's event plane back into this app's {@link AgentEvent} SSE
 * stream so the existing chat UI renders it unchanged.
 *
 * Contract (engine-side, pinned per deployment — see issue #10):
 *  - We connect with the iii Node SDK and register a short-lived *sink* function
 *    the orchestrator can call to stream UI events back to us live.
 *  - We `trigger()` the turn-orchestrator entrypoint with the run payload (and
 *    the sink's function id), and await its final result.
 *  - Each streamed item is translated to an AgentEvent; the final result becomes
 *    `workflow_complete`.
 *
 * Fails closed: any connection/timeout error surfaces a single, actionable
 * `workflow_error` rather than hanging or leaking a stack trace. The in-app
 * backend is unaffected — this module is only imported on the `iii` path.
 */

export interface IiiRunContext {
  mode: Mode;
  message: string;
  model: string;
  providerId: ProviderId;
  apiKey?: string;
  history: ConversationTurn[];
  send: EventSink;
}

/** Payload submitted to the engine's turn-orchestrator entrypoint. */
interface IiiTurnPayload {
  mode: Mode;
  message: string;
  model: string;
  provider: ProviderId;
  api_key?: string;
  history: ConversationTurn[];
  /** Function the orchestrator calls to stream UI events back to this client. */
  event_sink_function_id: string;
}

/** Loosely-typed shape of the final result the orchestrator returns. */
interface IiiTurnResult {
  result?: string;
  text?: string;
  output?: string;
  events?: unknown[];
  iterations?: number;
  agentsUsed?: string[];
  totalInputTokens?: number;
  totalOutputTokens?: number;
  totalCostUsd?: number;
}

const KNOWN_EVENT_TYPES = new Set<AgentEvent['type']>([
  'workflow_start', 'iteration_start', 'iteration_end', 'tool_call', 'agent_step',
  'web_search', 'agent_plan', 'input_request', 'agent_spawn', 'critique',
  'blackboard_update', 'task_posted', 'bid', 'task_awarded', 'sample', 'trace',
  'bus_message', 'handoff', 'workflow_complete', 'workflow_error',
]);

/**
 * Best-effort translation of an engine event item into one of our AgentEvents.
 * Items already shaped like an AgentEvent (have a known `type`) pass through;
 * a generic `{ kind|agent|text }` step maps to `agent_step`. Anything else is
 * dropped rather than risking a malformed event reaching the UI.
 */
export function translateIiiEvent(item: unknown): AgentEvent | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (typeof obj.type === 'string' && KNOWN_EVENT_TYPES.has(obj.type as AgentEvent['type'])) {
    return obj as unknown as AgentEvent;
  }
  // Generic reasoning/step item → agent_step so the timeline still shows it.
  if (typeof obj.text === 'string') {
    return {
      type: 'agent_step',
      agent: typeof obj.agent === 'string' ? obj.agent : 'iii',
      stepIndex: typeof obj.stepIndex === 'number' ? obj.stepIndex : 0,
      text: obj.text,
      toolNames: Array.isArray(obj.toolNames) ? (obj.toolNames as string[]) : [],
    };
  }
  return null;
}

/** Map a thrown engine/transport error to a short, actionable message. */
function describeIiiError(err: unknown, url: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/ECONNREFUSED|connect|closed|reconnect|timeout|ETIMEDOUT|WebSocket/i.test(msg)) {
    return `Couldn't reach the iii engine at ${url}. Is the engine running? Set III_ENGINE_URL on the server, or switch the backend to the in-app harness.`;
  }
  return `iii engine error: ${msg}`;
}

export async function runIiiBackend(ctx: IiiRunContext): Promise<void> {
  const { mode, message, model, providerId, apiKey, history, send } = ctx;
  const url = iiiEngineUrl();

  send({ type: 'workflow_start', mode, model, query: message });

  // Load the SDK lazily so it never enters the in-app backend's code path or
  // bundle, and a missing/broken install degrades to a clear error here only.
  let registerWorker: typeof import('iii-sdk').registerWorker;
  try {
    ({ registerWorker } = await import('iii-sdk'));
  } catch {
    send({
      type: 'workflow_error',
      error:
        'The iii backend is selected but the iii SDK is unavailable. Install it (pnpm add iii-sdk) and configure III_ENGINE_URL, or switch back to the in-app harness.',
    });
    return;
  }

  const iii = registerWorker(url, {
    workerName: 'multi-agents-team',
    invocationTimeoutMs: iiiTurnTimeoutMs(),
    // The app is a transient client per request, not a long-lived worker — keep
    // OTel auto-init out of the serverless route.
    otel: { enabled: false },
  });
  const sinkId = `app::ui-sink::${crypto.randomUUID()}`;

  // Live event plane: the orchestrator calls this back per UI event.
  const sink = iii.registerFunction(sinkId, async (data: unknown) => {
    const event = translateIiiEvent(
      data && typeof data === 'object' && 'event' in (data as Record<string, unknown>)
        ? (data as Record<string, unknown>).event
        : data,
    );
    if (event && event.type !== 'workflow_complete') send(event);
    return { ok: true };
  });

  try {
    const payload: IiiTurnPayload = {
      mode,
      message,
      model,
      provider: providerId,
      api_key: apiKey,
      history,
      event_sink_function_id: sinkId,
    };

    const res = await iii.trigger<IiiTurnPayload, IiiTurnResult>({
      function_id: iiiTurnFunctionId(),
      payload,
      timeoutMs: iiiTurnTimeoutMs(),
    });

    // Replay any events the engine batched into the result (for engines that
    // return events instead of streaming them live), then complete.
    if (Array.isArray(res?.events)) {
      for (const item of res.events) {
        const event = translateIiiEvent(item);
        if (event && event.type !== 'workflow_complete') send(event);
      }
    }

    const result = res?.result ?? res?.text ?? res?.output ?? '';
    send({
      type: 'workflow_complete',
      mode,
      result,
      iterations: res?.iterations,
      agentsUsed: res?.agentsUsed,
      totalInputTokens: res?.totalInputTokens,
      totalOutputTokens: res?.totalOutputTokens,
      totalCostUsd: res?.totalCostUsd,
    });
  } catch (err) {
    send({ type: 'workflow_error', error: describeIiiError(err, url) });
  } finally {
    try {
      sink.unregister();
    } catch {
      // ignore
    }
    try {
      await iii.shutdown();
    } catch {
      // ignore
    }
  }
}
