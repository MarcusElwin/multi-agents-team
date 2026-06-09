import type { AgentEvent, EventSink } from '@/lib/agent-events';
import type { ConversationTurn } from '@/lib/conversation';
import type { Mode } from '@/lib/modes';
import type { ProviderId } from '@/lib/models';
import {
  iiiEngineHttpUrl,
  iiiEngineToken,
  iiiEventsPath,
  iiiHealthPath,
  iiiRunPath,
  iiiTurnTimeoutMs,
} from './config';
import { parseSSEStream } from './stream-read';

/** Result of an iii engine/worker health probe. */
export type IiiHealth =
  | { ok: true; uptimeMs?: number; features?: Record<string, boolean> }
  | { ok: false; error: string };

/**
 * Ping the worker's `GET /health` trigger to confirm it's registered and
 * reachable, before dispatching a (potentially long) run. Returns a structured
 * result with a human-readable error on any failure — fast (3s) by design.
 */
export async function checkIiiHealth(): Promise<IiiHealth> {
  const base = iiiEngineHttpUrl();
  if (!base) return { ok: false, error: 'No engine configured (set III_ENGINE_HTTP_URL).' };

  const url = base.replace(/\/$/, '') + iiiHealthPath();
  const token = iiiEngineToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(url, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, error: `Engine health returned ${res.status}. Is the worker registered?` };
    }
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; uptimeMs?: number; features?: Record<string, boolean> };
    if (body?.ok === false) return { ok: false, error: 'Worker reported unhealthy.' };
    return { ok: true, uptimeMs: body?.uptimeMs, features: body?.features };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return { ok: false, error: aborted ? `Health check timed out — the iii engine at ${base} didn't respond.` : `Couldn't reach the iii engine at ${base}.` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Adapter that runs a turn on the iii engine instead of the in-app harness.
 *
 * The app POSTs the turn to the engine's HTTP trigger (the iii-http worker);
 * our worker (`iii-worker/`) runs the agent loop with the existing `lib/`
 * runners. Two transports, by config:
 *   - batch (default): the worker returns `{ result, events, ...totals }`; we
 *     replay the events and complete.
 *   - stream (III_STREAM_ENABLED): the worker publishes events to iii-stream and
 *     we read them live from the engine Stream API.
 *
 * Fails closed: a missing endpoint, non-2xx, or timeout surfaces a single,
 * actionable `workflow_error`. Only imported on the `iii` path.
 */

export interface IiiRunContext {
  mode: Mode;
  message: string;
  model: string;
  providerId: ProviderId;
  apiKey?: string;
  history: ConversationTurn[];
  conversationId?: string;
  send: EventSink;
}

interface IiiTurnRequest {
  mode: Mode;
  message: string;
  model: string;
  provider: ProviderId;
  api_key?: string;
  history: ConversationTurn[];
  conversationId?: string;
  auth_token?: string;
}

interface IiiTurnResponse {
  runId?: string;
  streamName?: string;
  group?: string;
  queued?: boolean;
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
 * Best-effort translation of an engine event item into one of our AgentEvents.
 * Unwraps an iii-stream item envelope (`{ data }`) if present. Items already
 * shaped like an AgentEvent pass through; a generic `{ text, agent }` step maps
 * to `agent_step`. Anything else is dropped.
 */
export function translateIiiEvent(item: unknown): AgentEvent | null {
  if (!item || typeof item !== 'object') return null;
  let obj = item as Record<string, unknown>;
  if ('data' in obj && obj.data && typeof obj.data === 'object') {
    obj = obj.data as Record<string, unknown>;
  }
  if (typeof obj.type === 'string' && KNOWN_EVENT_TYPES.has(obj.type as AgentEvent['type'])) {
    return obj as unknown as AgentEvent;
  }
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

function describeIiiError(err: unknown, url: string): string {
  if (err instanceof Error && err.name === 'AbortError') {
    return `The iii engine didn't respond in time (${url}). It may be overloaded or the run exceeded the timeout.`;
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/ECONNREFUSED|ENOTFOUND|fetch failed|network|EAI_AGAIN/i.test(msg)) {
    return `Couldn't reach the iii engine at ${url}. Is it deployed and is III_ENGINE_HTTP_URL correct? Or switch the backend to the in-app harness.`;
  }
  return `iii engine error: ${msg}`;
}

export async function runIiiBackend(ctx: IiiRunContext): Promise<void> {
  const { mode, message, model, providerId, apiKey, history, conversationId, send } = ctx;

  send({ type: 'workflow_start', mode, model, query: message });

  const base = iiiEngineHttpUrl();
  if (!base) {
    send({
      type: 'workflow_error',
      error:
        'The iii backend is selected but no engine is configured. Set III_ENGINE_HTTP_URL on the server, or switch the backend to the in-app harness.',
    });
    return;
  }

  const url = base.replace(/\/$/, '') + iiiRunPath();
  const token = iiiEngineToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), iiiTurnTimeoutMs());

  try {
    const body: IiiTurnRequest = {
      mode, message, model, provider: providerId, api_key: apiKey, history, conversationId, auth_token: token,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      send({ type: 'workflow_error', error: `iii engine returned ${res.status}. ${detail.slice(0, 300)}`.trim() });
      return;
    }

    // Default live path: the worker streams SSE over the (channel-backed) HTTP
    // response. Forward each event as it lands — no second endpoint involved.
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('text/event-stream') && res.body) {
      for await (const item of parseSSEStream(res.body, controller.signal)) {
        const event = translateIiiEvent(item);
        if (!event || event.type === 'workflow_start') continue; // we emitted our own start
        send(event);
        if (event.type === 'workflow_complete' || event.type === 'workflow_error') return;
      }
      send({ type: 'workflow_error', error: 'iii stream ended before the run completed.' });
      return;
    }

    const data = (await res.json()) as IiiTurnResponse;
    if (data?.error) {
      send({ type: 'workflow_error', error: `iii engine: ${data.error}` });
      return;
    }

    // Queue path: the run was enqueued and runs to completion on the engine,
    // independent of this request. Poll the worker's `GET /events?runId=&after=`
    // for new events until it reports done — so a long run survives a function
    // timeout / disconnect (it keeps running; the next poll picks up where we
    // left off). The engine Stream API is WebSocket-only and there's no public
    // HTTP function-invoke, so the worker proxies the read.
    if (data.queued && data.runId) {
      const runId = data.runId;
      const eventsUrl = base.replace(/\/$/, '') + iiiEventsPath();
      const deadline = Date.now() + iiiTurnTimeoutMs();
      let cursor = 0;
      let idle = 0;
      while (Date.now() < deadline) {
        if (controller.signal.aborted) return;
        let poll: { events?: unknown[]; cursor?: number; done?: boolean } | null = null;
        try {
          const r = await fetch(`${eventsUrl}?runId=${encodeURIComponent(runId)}&after=${cursor}`, {
            headers: token ? { authorization: `Bearer ${token}` } : {},
            signal: controller.signal,
          });
          if (r.ok) poll = await r.json();
        } catch {
          // transient — retry on the next tick
        }
        const events = Array.isArray(poll?.events) ? poll!.events! : [];
        for (const item of events) {
          const event = translateIiiEvent(item);
          if (!event || event.type === 'workflow_start') continue;
          send(event);
          if (event.type === 'workflow_complete' || event.type === 'workflow_error') return;
        }
        if (typeof poll?.cursor === 'number') cursor = poll.cursor;
        if (poll?.done) return; // terminal event already forwarded above
        idle = events.length === 0 ? idle + 1 : 0;
        // Poll ~every 1.5s; back off slightly while idle to ease load.
        await new Promise((r) => setTimeout(r, idle > 8 ? 3000 : 1500));
      }
      send({ type: 'workflow_error', error: 'iii run timed out (the engine kept running but stopped reporting events).' });
      return;
    }

    // Legacy batch fallback: replay the worker's events, then synthesize completion.
    if (Array.isArray(data.events)) {
      for (const item of data.events) {
        const event = translateIiiEvent(item);
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
    send({ type: 'workflow_error', error: describeIiiError(err, url) });
  } finally {
    clearTimeout(timer);
  }
}
