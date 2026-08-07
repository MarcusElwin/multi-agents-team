import { resolveModel, type ProviderId } from '@/lib/models';
import type { AgentEvent } from '@/lib/agent-events';
import type { ConversationTurn } from '@/lib/conversation';
import type { Mode } from '@/lib/modes';
import { harnessFor } from '../agent/harnesses';

/** The turn payload the eve channel receives (mirrors the iii worker's TurnRequest). */
export interface TurnRequest {
  mode: Mode;
  message: string;
  model?: string;
  provider?: ProviderId;
  api_key?: string;
  history?: ConversationTurn[];
  conversationId?: string;
  continuationToken?: string;
}

/**
 * Dispatch a turn to the harness for its mode and run it, emitting AgentEvents.
 * `history` is passed explicitly so the caller can substitute eve's durable
 * session history for the client-sent history. This is the single seam between
 * eve's channel/session layer and this repo's runners — identical in spirit to
 * `iii-worker/run.ts`, but selecting a per-architecture HarnessSpec.
 */
export async function runMode(
  req: TurnRequest,
  history: ConversationTurn[],
  emit: (e: AgentEvent) => void,
): Promise<void> {
  const spec = harnessFor(req.mode);
  await spec.run(
    req.message,
    {
      model: resolveModel(req.model),
      apiKey: req.api_key,
      providerId: req.provider ?? 'openai',
    },
    history,
    emit,
  );
}
