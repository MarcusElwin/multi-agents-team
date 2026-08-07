import { defineHttpChannel, type SessionContext } from 'eve/channels';
import type { AgentEvent } from '@/lib/agent-events';
import type { ConversationTurn } from '@/lib/conversation';
import { runMode, type TurnRequest } from '../../shared/run';
import { harnessFor } from '../harnesses';
import { cfg } from '../../eve.config';

/**
 * The durable HTTP entrypoint for a turn.
 *
 * The app POSTs `{ agent, mode, message, model, provider, api_key, history,
 * conversationId }` here; eve opens a durable, checkpointed **session** and hands
 * us a `SessionContext`. We pick the per-architecture harness, run it inside a
 * durable step, and stream each `AgentEvent` back as one NDJSON frame
 * (`{ type: 'event', data: <AgentEvent> }`). On resume after a crash/deploy, the
 * completed step is replayed from the session's event log instead of re-run.
 *
 * The app's adapter (`lib/eve/run-eve.ts`) translates these frames straight back
 * into its own event stream, so the chat UI renders an eve run identically to
 * the in-app one.
 *
 * VERIFY (eve beta): the exact `defineHttpChannel` / `SessionContext` surface
 * (header access, `emit`, `step`) may differ from the shim in `eve.d.ts` — pin
 * it against the installed `eve` package. The translation contract on the app
 * side is intentionally permissive so minor frame-shape drift is tolerated.
 */
function bearer(headers: Record<string, string>): string | undefined {
  const raw = headers['authorization'] ?? headers['Authorization'];
  return raw?.replace(/^Bearer\s+/i, '');
}

async function handler(ctx: SessionContext): Promise<void> {
  const body = (ctx.body ?? {}) as unknown as TurnRequest & { auth_token?: string };

  // Auth: shared secret as a bearer token or an `auth_token` body field.
  const token = body.auth_token ?? bearer(ctx.headers ?? {});
  if (cfg.token && token !== cfg.token) {
    ctx.emit({ type: 'event', data: { type: 'workflow_error', error: 'unauthorized' } });
    return;
  }
  if (!body.message || !body.mode) {
    ctx.emit({ type: 'event', data: { type: 'workflow_error', error: 'mode and message are required' } });
    return;
  }

  const spec = harnessFor(body.mode);

  // A continued durable session carries its own history; fall back to the
  // client-sent turns on a fresh session.
  // VERIFY (eve beta): replace with eve's session-state read once wired up.
  const history: ConversationTurn[] = body.history ?? [];

  const emit = (e: AgentEvent) => ctx.emit({ type: 'event', data: e });

  // Run the whole turn as one durable step. Each harness declares a finer
  // `checkpoint` granularity (iteration / round / sample / node) — wire those to
  // nested `ctx.step(...)` calls inside the runners as eve's durable-step API is
  // confirmed; today the turn is the atomic durable unit.
  try {
    await ctx.step(`run:${spec.mode}`, () => runMode(body, history, emit));
  } catch (err) {
    emit({ type: 'workflow_error', error: err instanceof Error ? err.message : String(err) });
  }
}

export default defineHttpChannel({
  method: 'POST',
  // eve mounts this under the agent's session route; the app posts to
  // `${EVE_BASE_URL}/eve/v1/session`. Adjust to match your eve routing.
  path: '/run',
  handler,
});
