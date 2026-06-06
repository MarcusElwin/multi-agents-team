/**
 * MAT worker — the engine-side half of the iii backend.
 *
 * Connects to the iii engine bus and exposes one agent turn over HTTP. The turn
 * runs this repo's existing `lib/` runners (the runners own their own
 * `withProvider` scope, so this drives them exactly like the Next API routes).
 *
 * Adopts iii's prebuilt workers, each behind a flag in `config.ts` (all OFF by
 * default — the batch HTTP path is the verified default):
 *   - iii-queue   — enqueue the turn so it outlives the HTTP request.
 *   - iii-stream  — publish events live for the app to subscribe to.
 *   - iii-state   — load/save session history server-side.
 *   - harness     — gate tools via policy::check_permissions.
 *
 * Run with `pnpm worker` (alongside a running engine) or the repo Docker image.
 */
import { registerWorker, TriggerAction, type ISdk, type RegisterTriggerInput } from 'iii-sdk';
import type { AgentEvent } from '@/lib/agent-events';
import type { ConversationTurn } from '@/lib/conversation';
import { withPolicy } from '@/lib/iii/policy-context';
import { cfg } from './config';
import { runMode, type TurnRequest } from './run';
import { makePolicyChecker } from './policy';
import { loadSession, saveSession } from './state';
import { publishEvent, streamNameFor } from './stream';

function findComplete(events: AgentEvent[]) {
  return [...events]
    .reverse()
    .find((e): e is Extract<AgentEvent, { type: 'workflow_complete' }> => e.type === 'workflow_complete');
}

/** Run a turn end-to-end: state in, run (policy-gated), stream out, state back. */
async function executeTurn(iii: ISdk, req: TurnRequest, runId: string) {
  const policy = cfg.policyEnabled ? makePolicyChecker(iii) : null;

  // Prefer server-side session history (iii-state) over client-sent history.
  const stored = await loadSession(iii, req.conversationId);
  const history = stored ?? req.history ?? [];

  const events: AgentEvent[] = [];
  const send = (e: AgentEvent) => {
    events.push(e);
    void publishEvent(iii, runId, e); // live (no-op unless streaming)
  };

  try {
    const run = () => runMode(req, history, send);
    await (policy ? withPolicy(policy, run) : run());
  } catch (err) {
    send({ type: 'workflow_error', error: err instanceof Error ? err.message : String(err) });
  }

  const complete = findComplete(events);

  // Persist the updated session (best-effort, no-op unless state enabled).
  if (complete?.result) {
    await saveSession(iii, req.conversationId, [
      ...history,
      { role: 'user', content: req.message },
      { role: 'assistant', content: complete.result },
    ] as ConversationTurn[]);
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
    events,
  };
}

async function main() {
  const iii = registerWorker(cfg.engineUrl, { workerName: 'mat-worker' });

  // HTTP entrypoint: authorize, mint a run id, then enqueue (durable) or run
  // inline. Either way the response carries the stream the app can read live.
  iii.registerFunction(cfg.runFn, async (payload: unknown) => {
    const req = (payload ?? {}) as TurnRequest;
    if (cfg.token && req.auth_token !== cfg.token) return { error: 'unauthorized' };
    if (!req.message || !req.mode) return { error: 'mode and message are required' };

    const runId = crypto.randomUUID();

    if (cfg.queueEnabled) {
      void iii.trigger({
        function_id: cfg.executeFn,
        payload: { ...req, runId },
        action: TriggerAction.Enqueue({ queue: cfg.queueName }),
      });
      return { runId, streamName: streamNameFor(runId), group: cfg.streamGroup, queued: true };
    }

    return executeTurn(iii, req, runId);
  });

  // Queue target: runs the turn out-of-band; results land on the stream.
  iii.registerFunction(cfg.executeFn, async (payload: unknown) => {
    const req = (payload ?? {}) as TurnRequest & { runId?: string };
    return executeTurn(iii, req, req.runId || crypto.randomUUID());
  });

  iii.registerTrigger({
    type: 'http',
    function_id: cfg.runFn,
    config: { api_path: cfg.runPath, http_method: 'POST' },
  } as RegisterTriggerInput);

  const on = (b: boolean) => (b ? 'on' : 'off');
  console.log(`[mat-worker] connected to ${cfg.engineUrl}`);
  console.log(`[mat-worker] ${cfg.runFn} · POST ${cfg.runPath}${cfg.token ? ' (token required)' : ''}`);
  console.log(
    `[mat-worker] queue=${on(cfg.queueEnabled)} stream=${on(cfg.streamEnabled)} state=${on(cfg.stateEnabled)} policy=${on(cfg.policyEnabled)}`,
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
