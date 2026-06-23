import type { AgentEvent, EventSink } from '@/lib/agent-events';
import type { ConversationTurn } from '@/lib/conversation';
import type { Mode } from '@/lib/modes';
import type { ProviderId } from '@/lib/models';
import {
  eveAgentName,
  eveApiToken,
  eveBaseUrl,
  eveHealthPath,
  eveSessionPath,
  eveStreamPath,
  eveTurnTimeoutMs,
} from './config';
import { parseNDJSONStream } from './stream-read';

/** Result of an eve app readiness probe. */
export type EveHealth =
  | { ok: true; agent?: string; features?: Record<string, boolean> }
  | { ok: false; error: string };

/**
 * Ping the eve app's health endpoint to confirm it's deployed and reachable,
 * before starting a (potentially long) durable session. Fast (3s) by design.
 */
export async function checkEveHealth(): Promise<EveHealth> {
  const base = eveBaseUrl();
  if (!base) return { ok: false, error: 'No eve app configured (set EVE_BASE_URL).' };

  const url = base + eveHealthPath();
  const token = eveApiToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(url, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, error: `eve app health returned ${res.status}. Is it deployed?` };
    }
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; agent?: string; features?: Record<string, boolean> };
    if (body?.ok === false) return { ok: false, error: 'eve app reported unhealthy.' };
    return { ok: true, agent: body?.agent, features: body?.features };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return { ok: false, error: aborted ? `Health check timed out — the eve app at ${base} didn't respond.` : `Couldn't reach the eve app at ${base}.` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Adapter that runs a turn on a deployed eve app instead of the in-app harness.
 *
 * The app starts a durable eve *session* (POST /eve/v1/session) and streams the
 * session's NDJSON lifecycle events back, translating each into this app's
 * `AgentEvent` stream — so the existing chat UI renders it unchanged. On the eve
 * side, our agent (`eve-app/`) runs the *same* `lib/` runner for the requested
 * architecture (one harness per mode) inside eve's durable, checkpointed harness.
 *
 * Two transports, by what the POST returns:
 *   - inline (preferred): the POST response body itself is the NDJSON event
 *     stream; we read it directly.
 *   - two-step: the POST returns JSON with a session id (+ continuationToken);
 *     we then GET the session stream and read its NDJSON.
 *
 * Durability: because the session is checkpointed on eve, the `continuationToken`
 * (echoed via `conversationId`) lets a future turn resume the same session. The
 * adapter itself fails closed — a missing endpoint, non-2xx, or timeout surfaces
 * a single, actionable `workflow_error`. Only imported on the `eve` path.
 */

export interface EveRunContext {
  mode: Mode;
  message: string;
  model: string;
  providerId: ProviderId;
  apiKey?: string;
  history: ConversationTurn[];
  conversationId?: string;
  send: EventSink;
}

interface EveSessionRequest {
  agent: string;
  mode: Mode;
  message: string;
  model: string;
  provider: ProviderId;
  api_key?: string;
  history: ConversationTurn[];
  /** Stable chat id — used as eve's continuation key so a session resumes. */
  conversationId?: string;
  continuationToken?: string;
}

interface EveSessionResponse {
  sessionId?: string;
  continuationToken?: string;
  result?: string;
  text?: string;
  output?: string;
  events?: unknown[];
  iterations?: number;
  agentsUsed?: string[];
  totalInputTokens?: number;
  totalOutputTokens?: number;
  totalCostUsd?: number;
  error?: string;
}

const KNOWN_EVENT_TYPES = new Set<AgentEvent['type']>([
  'workflow_start', 'iteration_start', 'iteration_end', 'tool_call', 'agent_step',
  'web_search', 'agent_plan', 'input_request', 'agent_spawn', 'critique',
  'blackboard_update', 'task_posted', 'bid', 'task_awarded', 'sample', 'trace',
  'bus_message', 'handoff', 'workflow_complete', 'workflow_error',
]);

/**
 * Best-effort translation of an eve session lifecycle item into one of our
 * AgentEvents. eve frames wrap the payload in `{ type, data }` (or `{ event,
 * payload }`); our agent emits raw AgentEvents inside `data`, so those pass
 * through. eve's own terminal frames map to `workflow_complete`, and a generic
 * text/message frame maps to `agent_step`. Anything else is dropped.
 */
export function translateEveEvent(item: unknown): AgentEvent | null {
  if (!item || typeof item !== 'object') return null;
  let obj = item as Record<string, unknown>;

  // Unwrap eve's lifecycle envelope: { type/event, data/payload }.
  const inner = (obj.data ?? obj.payload) as unknown;
  if (inner && typeof inner === 'object') {
    const innerObj = inner as Record<string, unknown>;
    if (typeof innerObj.type === 'string' && KNOWN_EVENT_TYPES.has(innerObj.type as AgentEvent['type'])) {
      return innerObj as unknown as AgentEvent;
    }
    obj = { ...obj, ...innerObj }; // hoist inner fields for the generic mappings below
  }

  // A frame already shaped like one of our AgentEvents passes straight through.
  if (typeof obj.type === 'string' && KNOWN_EVENT_TYPES.has(obj.type as AgentEvent['type'])) {
    return obj as unknown as AgentEvent;
  }

  const kind = typeof obj.type === 'string' ? obj.type : typeof obj.event === 'string' ? obj.event : '';

  // eve terminal frames → workflow_complete.
  if (/session\.(completed|succeeded)|run\.completed|completed|done/i.test(kind)) {
    const result = obj.result ?? obj.text ?? obj.output;
    const mode = (typeof obj.mode === 'string' ? obj.mode : 'v1') as Mode;
    return { type: 'workflow_complete', mode, result: typeof result === 'string' ? result : '' };
  }
  // eve error/failure frames → workflow_error.
  if (/session\.(failed|errored)|run\.failed|error|failed/i.test(kind)) {
    const reason = obj.error ?? obj.message ?? 'eve session failed';
    return { type: 'workflow_error', error: typeof reason === 'string' ? reason : 'eve session failed' };
  }
  // Generic text/message step.
  if (typeof obj.text === 'string') {
    return {
      type: 'agent_step',
      agent: typeof obj.agent === 'string' ? obj.agent : 'eve',
      stepIndex: typeof obj.stepIndex === 'number' ? obj.stepIndex : 0,
      text: obj.text,
      toolNames: Array.isArray(obj.toolNames) ? (obj.toolNames as string[]) : [],
    };
  }
  return null;
}

function describeEveError(err: unknown, url: string): string {
  if (err instanceof Error && err.name === 'AbortError') {
    return `The eve app didn't respond in time (${url}). The session may be overloaded or the run exceeded the timeout.`;
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/ECONNREFUSED|ENOTFOUND|fetch failed|network|EAI_AGAIN/i.test(msg)) {
    return `Couldn't reach the eve app at ${url}. Is it deployed and is EVE_BASE_URL correct? Or switch the backend to the in-app harness.`;
  }
  return `eve app error: ${msg}`;
}

/** Drain an NDJSON stream of eve lifecycle events into the app's AgentEvent sink. */
async function drainEveStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  send: EventSink,
): Promise<boolean> {
  for await (const item of parseNDJSONStream(body, signal)) {
    const event = translateEveEvent(item);
    if (!event || event.type === 'workflow_start') continue; // we emitted our own start
    send(event);
    if (event.type === 'workflow_complete' || event.type === 'workflow_error') return true;
  }
  return false;
}

export async function runEveBackend(ctx: EveRunContext): Promise<void> {
  const { mode, message, model, providerId, apiKey, history, conversationId, send } = ctx;

  send({ type: 'workflow_start', mode, model, query: message });

  const base = eveBaseUrl();
  if (!base) {
    send({
      type: 'workflow_error',
      error:
        'The eve backend is selected but no eve app is configured. Set EVE_BASE_URL on the server, or switch the backend to the in-app harness.',
    });
    return;
  }

  const url = base + eveSessionPath();
  const token = eveApiToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), eveTurnTimeoutMs());

  try {
    const body: EveSessionRequest = {
      agent: eveAgentName(),
      mode,
      message,
      model,
      provider: providerId,
      api_key: apiKey,
      history,
      // eve keys a durable session by its continuation token; we reuse the chat
      // id so subsequent turns in the same chat resume the same session.
      conversationId,
      continuationToken: conversationId,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/x-ndjson, text/event-stream',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      send({ type: 'workflow_error', error: `eve app returned ${res.status}. ${detail.slice(0, 300)}`.trim() });
      return;
    }

    // Preferred path: the POST response body *is* the session's NDJSON stream.
    const contentType = res.headers.get('content-type') ?? '';
    if (/ndjson|event-stream|jsonl|application\/json-seq/i.test(contentType) && res.body) {
      const completed = await drainEveStream(res.body, controller.signal, send);
      if (!completed) {
        send({ type: 'workflow_error', error: 'eve session stream ended before the run completed.' });
      }
      return;
    }

    // Two-step path: the POST returned JSON. Pull a session id (header or body)
    // and read the durable session stream over a second GET. The session keeps
    // running on eve independent of this request, so this survives a reconnect.
    const sessionId = res.headers.get('x-eve-session-id') ?? undefined;
    const data = (await res.json().catch(() => ({}))) as EveSessionResponse;
    if (data?.error) {
      send({ type: 'workflow_error', error: `eve app: ${data.error}` });
      return;
    }

    const id = sessionId ?? data.sessionId;
    if (id) {
      const streamUrl = base + eveStreamPath().replace('{id}', encodeURIComponent(id));
      const streamRes = await fetch(streamUrl, {
        headers: { accept: 'application/x-ndjson, text/event-stream', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        signal: controller.signal,
      });
      if (streamRes.ok && streamRes.body) {
        const completed = await drainEveStream(streamRes.body, controller.signal, send);
        if (!completed) {
          send({ type: 'workflow_error', error: 'eve session stream ended before the run completed.' });
        }
        return;
      }
      send({ type: 'workflow_error', error: `eve session stream returned ${streamRes.status}.` });
      return;
    }

    // Batch fallback: the POST returned a finished result (no streaming). Replay
    // any included events, then synthesize completion.
    if (Array.isArray(data.events)) {
      for (const item of data.events) {
        const event = translateEveEvent(item);
        if (!event || event.type === 'workflow_start' || event.type === 'workflow_complete') continue;
        send(event);
      }
    }
    send({
      type: 'workflow_complete',
      mode,
      result: data.result ?? data.text ?? data.output ?? '',
      iterations: data.iterations,
      agentsUsed: data.agentsUsed,
      totalInputTokens: data.totalInputTokens,
      totalOutputTokens: data.totalOutputTokens,
      totalCostUsd: data.totalCostUsd,
    });
  } catch (err) {
    send({ type: 'workflow_error', error: describeEveError(err, url) });
  } finally {
    clearTimeout(timer);
  }
}
