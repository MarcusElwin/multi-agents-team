import { runAgentsWithCoordination } from '@/lib/runner';
import { Conversation } from '@/lib/conversation';
import type { HarnessSpec } from './types';

/**
 * v2 — Choreographed. Backend / frontend / design peers message each other over
 * a per-conversation bus until all complete (≤10 rounds). Each peer's turn is
 * fed from its inbox, so the durable unit is a whole turn; eve checkpoints per
 * turn and the bus state is part of the replayable context.
 */
export const v2: HarnessSpec = {
  mode: 'v2',
  name: 'Choreographed',
  summary: 'Peers negotiate a shared artifact over a message bus.',
  harness: {
    checkpoint: 'turn',
    parallel: false,
    maxConcurrency: 1,
    humanInLoop: false,
    contextControl: 'append',
    maxSteps: 10,
  },
  run: (message, opts, history, emit) =>
    runAgentsWithCoordination(message, opts, emit, new Conversation(history)),
};
