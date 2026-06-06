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

export interface TurnRequest {
  mode: Mode;
  message: string;
  model?: string;
  provider?: ProviderId;
  api_key?: string;
  history?: ConversationTurn[];
  conversationId?: string;
  auth_token?: string;
}

type RunnerOpts = { model: string; apiKey?: string; providerId: ProviderId };

/**
 * Dispatch a turn to the runner for its mode, mirroring the Next API routes.
 * `history` is passed explicitly so the caller can substitute a server-side
 * session (iii-state) for the client-sent history.
 */
export async function runMode(
  req: TurnRequest,
  history: ConversationTurn[],
  send: (e: AgentEvent) => void,
): Promise<void> {
  const conversation = new Conversation(history);
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
