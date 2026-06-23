import { runSwarm } from '@/lib/swarm-runner';
import { Conversation } from '@/lib/conversation';
import type { HarnessSpec } from './types';

/**
 * v9 — Swarm. Four identical agents build on a shared scratchpad over 3 rounds —
 * pure stigmergy, no roles or controller. The agents in a round act in parallel;
 * the scratchpad is the only context (shared-workspace) and is checkpointed per
 * round so each round builds on the durable trace of the last.
 */
export const v9: HarnessSpec = {
  mode: 'v9',
  name: 'Swarm',
  summary: 'Identical agents build on a shared scratchpad over rounds.',
  harness: {
    checkpoint: 'round',
    parallel: true,
    maxConcurrency: 4,
    humanInLoop: false,
    contextControl: 'shared-workspace',
    maxSteps: 3,
  },
  run: (message, opts, history, emit) =>
    runSwarm(message, opts, emit, new Conversation(history)),
};
