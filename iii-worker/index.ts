/**
 * MAT worker — the engine-side half of the iii backend.
 *
 * Connects to the iii engine bus and serves one agent turn over HTTP. The turn
 * runs this repo's existing `lib/` runners (which own their own `withProvider`
 * scope, so this drives them exactly like the Next API routes).
 *
 * iii primitives in use:
 *   - functions — `mat::run`, `mat::execute`, `mat::artifact`, plus calls to
 *     `state::*`, `stream::publish`, `policy::check_permissions`.
 *   - triggers  — the HTTP trigger (POST /run) and the queue trigger (Enqueue).
 *   - channels  — the HTTP response is a channel; `mat::run` streams SSE over it
 *     live (no separate read endpoint). Plus optional worker↔worker artifact
 *     handoff (`artifact.ts`).
 *   - streams   — optional named iii-stream publish for persistence / the queue
 *     path / multiple subscribers.
 *
 * Each prebuilt-worker integration is behind a flag in `config.ts`, off by
 * default. Run with `pnpm worker` or the repo Docker image.
 */
import { randomUUID } from 'node:crypto';
import { registerWorker, http, TriggerAction, type ISdk, type ApiResponse, type RegisterTriggerInput } from 'iii-sdk';
import type { AgentEvent } from '@/lib/agent-events';
import type { ConversationTurn } from '@/lib/conversation';
import { withPolicy } from '@/lib/iii/policy-context';
import { cfg } from './config';
import { runMode, type TurnRequest } from './run';
import { makePolicyChecker } from './policy';
import { loadSession, saveSession } from './state';
import { publishEvent, streamNameFor } from './stream';
import { offloadArtifact, readArtifact } from './artifact';

function findComplete(events: AgentEvent[]) {
  return [...events]
    .reverse()
    .find((e): e is Extract<AgentEvent, { type: 'workflow_complete' }> => e.type === 'workflow_complete');
}

function apiJson(status_code: number, body: Record<string, unknown>): ApiResponse {
  return { status_code, headers: { 'content-type': 'application/json' }, body };
}

function bearer(headers: Record<string, string | string[]>): string | undefined {
  const raw = headers['authorization'] ?? headers['Authorization'];
  const val = Array.isArray(raw) ? raw[0] : raw;
  return val?.replace(/^Bearer\s+/i, '');
}

/**
 * Run a turn end-to-end: session in (iii-state), run (policy-gated), events out
 * via `send` (live), session back, optional artifact handoff. Returns a summary
 * for callers that don't stream (the queue path).
 */
async function runTurn(iii: ISdk, req: TurnRequest, runId: string, send: (e: AgentEvent) => void) {
  const policy = cfg.policyEnabled ? makePolicyChecker(iii) : null;

  const stored = await loadSession(iii, req.conversationId);
  const history = stored ?? req.history ?? [];

  const events: AgentEvent[] = [];
  const emit = (e: AgentEvent) => {
    events.push(e);
    send(e);
  };

  try {
    const run = () => runMode(req, history, emit);
    await (policy ? withPolicy(policy, run) : run());
  } catch (err) {
    emit({ type: 'workflow_error', error: err instanceof Error ? err.message : String(err) });
  }

  const complete = findComplete(events);

  if (complete?.result) {
    await saveSession(iii, req.conversationId, [
      ...history,
      { role: 'user', content: req.message },
      { role: 'assistant', content: complete.result },
    ] as ConversationTurn[]);

    // Large artifact → hand off over a channel instead of inlining it.
    if (cfg.artifactChannelEnabled && Buffer.byteLength(complete.result, 'utf8') >= cfg.artifactThresholdBytes) {
      try {
        const { ref, bytes } = await offloadArtifact(iii, complete.result);
        await iii.trigger({ function_id: cfg.artifactSinkFn, payload: { ref, meta: { runId, conversationId: req.conversationId, bytes } } });
      } catch (err) {
        console.warn('[mat-worker] artifact handoff failed:', err instanceof Error ? err.message : err);
      }
    }
  }

  return {
    runId,
    streamName: streamNameFor(runId),
    group: cfg.streamGroup,
    result: complete?.result ?? '',
    iterations: complete?.iterations,
    agentsUsed: complete?.agentsUsed,
    totalInputTokens: complete?.totalInputTokens,
    totalOutputTokens: complete?.totalOutputTokens,
    totalCostUsd: complete?.totalCostUsd,
  };
}

async function main() {
  // The worker is long-lived and serves many runs. A single dropped client
  // connection (or a transient bus reconnect) must never take it down, so we
  // log-and-continue on otherwise-unhandled async errors instead of crashing.
  process.on('uncaughtException', (err) => {
    console.error('[mat-worker] uncaughtException (continuing):', err instanceof Error ? err.message : err);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[mat-worker] unhandledRejection (continuing):', reason instanceof Error ? reason.message : reason);
  });

  const iii = registerWorker(cfg.engineUrl, { workerName: 'mat-worker' });

  // HTTP entrypoint. The response is a channel: when running inline we stream
  // SSE events over it live; when queued we return JSON and the app reads the
  // named stream instead.
  iii.registerFunction(
    cfg.runFn,
    http(async (req, res): Promise<void | ApiResponse> => {
      const body = (req.body ?? {}) as TurnRequest;
      const token = body.auth_token ?? bearer(req.headers);
      if (cfg.token && token !== cfg.token) return apiJson(401, { error: 'unauthorized' });
      if (!body.message || !body.mode) return apiJson(400, { error: 'mode and message are required' });

      const runId = randomUUID();

      if (cfg.queueEnabled) {
        void iii.trigger({
          function_id: cfg.executeFn,
          payload: { ...body, runId },
          action: TriggerAction.Enqueue({ queue: cfg.queueName }),
        });
        return apiJson(200, { runId, streamName: streamNameFor(runId), group: cfg.streamGroup, queued: true });
      }

      // Live SSE over the channel-backed HTTP response.
      res.status(200);
      res.headers({
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        'x-accel-buffering': 'no',
      });

      // The channel write is async (chunked over the WebSocket), so a failure
      // when the client has disconnected surfaces *later* as an 'error' event on
      // the Writable — a sync try/catch can't catch it, and unhandled it crashes
      // the whole worker. Track a `closed` flag, stop writing once closed, and
      // swallow late stream errors so one dropped connection is non-fatal.
      let closed = false;
      const stream = res.stream as NodeJS.WritableStream & { on?: (ev: string, cb: () => void) => void };
      stream.on?.('error', () => {
        closed = true;
      });
      stream.on?.('close', () => {
        closed = true;
      });

      const send = (e: AgentEvent) => {
        if (closed) return;
        try {
          res.stream.write(`data: ${JSON.stringify(e)}\n\n`);
        } catch {
          closed = true; // client gone — stop writing
        }
        if (cfg.streamEnabled) void publishEvent(iii, runId, e); // optional persistence/fanout
      };
      await runTurn(iii, body, runId, send);
      // The channel write is async/chunked, so the final `workflow_complete`
      // event may still be in flight. Closing immediately races that flush and
      // the app sees the stream end without a terminal event ("iii stream ended
      // before the run completed"). Yield a few macrotasks so the last chunk
      // drains over the WebSocket before we close the channel.
      if (!closed) {
        await new Promise((r) => setTimeout(r, 50));
      }
      closed = true;
      try {
        res.close();
      } catch {
        // already closed
      }
    }),
  );

  // Queue target: runs the turn out-of-band; events go to the named stream.
  iii.registerFunction(cfg.executeFn, async (payload: unknown) => {
    const req = (payload ?? {}) as TurnRequest & { runId?: string };
    const runId = req.runId || randomUUID();
    return runTurn(iii, req, runId, (e) => void publishEvent(iii, runId, e));
  });

  // Artifact sink: drains a channel handed off by a run. In a real deployment
  // this id points at a dedicated render/store worker; here it acks the bytes.
  iii.registerFunction(cfg.artifactSinkFn, async (payload: unknown) => {
    const { ref } = (payload ?? {}) as { ref?: Parameters<typeof readArtifact>[0] };
    if (!ref) return { received: false, error: 'missing ref' };
    const content = await readArtifact(ref);
    return { received: true, bytes: Buffer.byteLength(content, 'utf8') };
  });

  // Health check. Lets the app confirm the worker is registered and reachable
  // *before* dispatching a run (so an unreachable/crashed worker surfaces as a
  // clean "engine not ready" instead of a slow run timeout). Exposed both as a
  // callable function (`mat::health`) and a `GET /health` HTTP trigger.
  const startedAt = Date.now();
  const healthBody = () => ({
    ok: true,
    worker: 'mat-worker',
    runFn: cfg.runFn,
    uptimeMs: Date.now() - startedAt,
    features: {
      queue: cfg.queueEnabled,
      stream: cfg.streamEnabled,
      state: cfg.stateEnabled,
      policy: cfg.policyEnabled,
      artifactChannel: cfg.artifactChannelEnabled,
    },
  });
  iii.registerFunction(
    cfg.healthFn,
    http(async (): Promise<ApiResponse> => apiJson(200, healthBody())),
  );

  iii.registerTrigger({
    type: 'http',
    function_id: cfg.runFn,
    config: { api_path: cfg.runPath, http_method: 'POST' },
  } as RegisterTriggerInput);

  iii.registerTrigger({
    type: 'http',
    function_id: cfg.healthFn,
    config: { api_path: cfg.healthPath, http_method: 'GET' },
  } as RegisterTriggerInput);

  const on = (b: boolean) => (b ? 'on' : 'off');
  console.log(`[mat-worker] connected to ${cfg.engineUrl}`);
  console.log(`[mat-worker] ${cfg.runFn} · POST ${cfg.runPath}${cfg.token ? ' (token required)' : ''} · live SSE over channel`);
  console.log(`[mat-worker] ${cfg.healthFn} · GET ${cfg.healthPath}`);
  console.log(
    `[mat-worker] queue=${on(cfg.queueEnabled)} stream=${on(cfg.streamEnabled)} state=${on(cfg.stateEnabled)} policy=${on(cfg.policyEnabled)} artifactChannel=${on(cfg.artifactChannelEnabled)}`,
  );

  const shutdown = async () => {
    try {
      await iii.shutdown();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[mat-worker] fatal:', err);
  process.exit(1);
});
