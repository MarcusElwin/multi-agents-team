import type { ISdk } from 'iii-sdk';
import { cfg } from './config';
import type { ConversationTurn } from '@/lib/conversation';

/**
 * Server-side session history via the iii-state worker, replacing this app's
 * localStorage-only history when enabled. Keyed by `{ scope, key=conversationId }`.
 * Both calls degrade to no-ops/null on any error so a flaky state worker never
 * breaks a run.
 *
 * VERIFY (live engine): the get/set payload + result shapes are normalized
 * loosely; confirm against the running iii-state worker (IState in iii-sdk/state).
 */
interface SessionValue {
  turns: ConversationTurn[];
}

export async function loadSession(
  iii: ISdk,
  conversationId: string | undefined,
): Promise<ConversationTurn[] | null> {
  if (!cfg.stateEnabled || !conversationId) return null;
  try {
    const res = await iii.trigger<{ scope: string; key: string }, unknown>({
      function_id: cfg.stateGetFn,
      payload: { scope: cfg.stateScope, key: conversationId },
    });
    const r = res as Record<string, unknown> | null;
    const value = (r?.value ?? r?.new_value ?? r) as SessionValue | undefined;
    return Array.isArray(value?.turns) ? value!.turns : null;
  } catch {
    return null;
  }
}

export async function saveSession(
  iii: ISdk,
  conversationId: string | undefined,
  turns: ConversationTurn[],
): Promise<void> {
  if (!cfg.stateEnabled || !conversationId) return;
  try {
    await iii.trigger({
      function_id: cfg.stateSetFn,
      payload: { scope: cfg.stateScope, key: conversationId, value: { turns } satisfies SessionValue },
    });
  } catch {
    // Non-fatal: persistence is best-effort.
  }
}
