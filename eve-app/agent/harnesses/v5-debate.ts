import { runDebate } from '@/lib/debate-runner';
import { Conversation } from '@/lib/conversation';
import type { HarnessSpec } from './types';

/**
 * v5 — Debate. Affirmative and opposing sides argue for 3 rounds; a judge rules
 * and synthesizes. The full argument transcript is the signal the judge needs,
 * so context is appended (not summarized); eve checkpoints per round.
 */
export const v5: HarnessSpec = {
  mode: 'v5',
  name: 'Debate',
  summary: 'Opposing sides argue; a judge decides and synthesizes.',
  harness: {
    checkpoint: 'round',
    parallel: false,
    maxConcurrency: 1,
    humanInLoop: false,
    contextControl: 'append',
    maxSteps: 3,
  },
  run: (message, opts, history, emit) =>
    runDebate(message, opts, emit, new Conversation(history)),
};
