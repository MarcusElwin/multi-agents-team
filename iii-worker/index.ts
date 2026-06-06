/**
 * MAT worker — the engine-side half of the iii backend.
 *
 * Connects to the iii engine over its WebSocket bus, registers a `mat::run`
 * function that runs one agent turn using this repo's existing `lib/` runners,
 * and binds an HTTP trigger so the Vercel app can POST a turn and get the result
 * (see `lib/iii/run-iii.ts`). Run with `pnpm worker` (alongside a running
 * engine) or via the Docker image in this repo.
 *
 * The runners already set up their own per-request credential scope
 * (`withProvider`), so this worker drives them exactly like the Next API routes
 * do — no logic is duplicated, only the transport changes.
 */
import { registerWorker, type RegisterTriggerInput } from 'iii-sdk';
import { AgentOrchestrator } from '@/lib/orchestrator';
import { runAgentsWithCoordination } from '@/lib/runner';
import { runHierarchical } from '@/lib/hierarchical-runner';
import { runEvaluatorOptimizer } from '@/lib/evaluator-optimizer-runner';
import { runDebate } from '@/lib/debate-runner';
import { runBlackboard } from '@/lib/blackboard-runner';
import { runMarket } from '@/lib/market-runner';
import { runSelfConsistency } from '@/lib/self-consistency-runner';
import { runSwarm } from '@/lib/swarm-runner';
import { Conversation, type ConversationTurn } from '@/lib/conversation';
import { resolveModel, type ProviderId } from '@/lib/models';
import type { AgentEvent } from '@/lib/agent-events';
import type { Mode } from '@/lib/modes';

const ENGINE_URL = process.env.III_ENGINE_URL?.trim() || 'ws://localhost:49134';
const RUN_FN = process.env.MAT_RUN_FUNCTION_ID?.trim() || 'mat::run';
const RUN_PATH = (() => {
  const p = process.env.III_RUN_PATH?.trim() || '/run';
  return p.startsWith('/') ? p : `/${p}`;
})();
const TOKEN = process.env.III_ENGINE_TOKEN?.trim() || undefined;

interface TurnRequest {
  mode: Mode;
  message: string;
  model?: string;
  provider?: ProviderId;
  api_key?: string;
  history?: ConversationTurn[];
  auth_token?: string;
}

type RunnerOpts = { model: string; apiKey?: string; providerId: ProviderId };

/** Dispatch a turn to the runner for its mode, mirroring the Next API routes. */
async function runMode(req: TurnRequest, send: (e: AgentEvent) => void): Promise<void> {
  const conversation = new Conversation(req.history ?? []);
  const opts: RunnerOpts = {
    model: resolveModel(req.model),
    apiKey: req.api_key,
    providerId: req.provider ?? 'openai',
  };
  switch (req.mode) {
    case 'v1':
      await new AgentOrchestrator(opts).processUserMessage(req.message, send, conversation);
      return;
    case 'v2':
      await runAgentsWithCoordination(req.message, opts, send, conversation);
      return;
    case 'v3':
      await runHierarchical(req.message, opts, send, conversation);
      return;
    case 'v4':
      await runEvaluatorOptimizer(req.message, opts, send, conversation);
      return;
    case 'v5':
      await runDebate(req.message, opts, send, conversation);
      return;
    case 'v6':
      await runBlackboard(req.message, opts, send, conversation);
      return;
    case 'v7':
      await runMarket(req.message, opts, send, conversation);
      return;
    case 'v8':
      await runSelfConsistency(req.message, opts, send, conversation);
      return;
    case 'v9':
      await runSwarm(req.message, opts, send, conversation);
      return;
    default:
      throw new Error(`Unknown mode: ${String((req as TurnRequest).mode)}`);
  }
}

async function main() {
  const iii = registerWorker(ENGINE_URL, { workerName: 'mat-worker' });

  iii.registerFunction(RUN_FN, async (payload: unknown) => {
    const req = (payload ?? {}) as TurnRequest;

    // Fail closed when a token is configured: the engine's HTTP boundary is
    // public, so a shared secret gates who can spend keys/credits here.
    if (TOKEN && req.auth_token !== TOKEN) {
      return { error: 'unauthorized' };
    }
    if (!req.message || !req.mode) {
      return { error: 'mode and message are required' };
    }

    const events: AgentEvent[] = [];
    const send = (e: AgentEvent) => {
      events.push(e);
    };

    try {
      await runMode(req, send);
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err), events };
    }

    // The runners emit their own terminal workflow_complete; lift its fields up
    // as the HTTP result, and return the full event list for the app to replay.
    const complete = [...events]
      .reverse()
      .find((e): e is Extract<AgentEvent, { type: 'workflow_complete' }> => e.type === 'workflow_complete');

    return {
      result: complete?.result ?? '',
      iterations: complete?.iterations,
      agentsUsed: complete?.agentsUsed,
      totalInputTokens: complete?.totalInputTokens,
      totalOutputTokens: complete?.totalOutputTokens,
      totalCostUsd: complete?.totalCostUsd,
      events,
    };
  });

  iii.registerTrigger({
    type: 'http',
    function_id: RUN_FN,
    config: { api_path: RUN_PATH, http_method: 'POST' },
  } as RegisterTriggerInput);

  console.log(`[mat-worker] connected to ${ENGINE_URL}`);
  console.log(`[mat-worker] registered ${RUN_FN} · POST ${RUN_PATH}${TOKEN ? ' (token required)' : ''}`);

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
