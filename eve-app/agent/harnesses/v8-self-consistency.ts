import { runSelfConsistency } from '@/lib/self-consistency-runner';
import { Conversation } from '@/lib/conversation';
import type { HarnessSpec } from './types';

/**
 * v8 — Self-Consistency. Draw 4 independent samples of the same prompt in
 * parallel; a judge selects or merges the best. The samples are independent, so
 * each is its own durable sub-run (checkpoint: sample) in an isolated sandbox,
 * and they are judged together at the end (fan-in) — no shared running context.
 */
export const v8: HarnessSpec = {
  mode: 'v8',
  name: 'Self-Consistency',
  summary: 'Sample N attempts in parallel; a judge picks/merges the best.',
  harness: {
    checkpoint: 'sample',
    parallel: true,
    maxConcurrency: 4,
    humanInLoop: false,
    contextControl: 'fan-in',
    maxSteps: 4,
  },
  run: (message, opts, history, emit) =>
    runSelfConsistency(message, opts, emit, new Conversation(history)),
};
