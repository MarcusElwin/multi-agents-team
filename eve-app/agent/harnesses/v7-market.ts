import { runMarket } from '@/lib/market-runner';
import { Conversation } from '@/lib/conversation';
import type { HarnessSpec } from './types';

/**
 * v7 — Market. Tasks are posted to an auction board; a roster of four agents bid
 * (fit 0–1, est. $) and each task is awarded to its best bid (≤2 per agent). The
 * bid round fans out — eve runs the bids as parallel durable sub-runs — then the
 * award + execution are checkpointed per turn.
 */
export const v7: HarnessSpec = {
  mode: 'v7',
  name: 'Market',
  summary: 'Agents bid on posted tasks; the best bid wins each.',
  harness: {
    checkpoint: 'turn',
    parallel: true,
    maxConcurrency: 4,
    humanInLoop: false,
    contextControl: 'append',
    maxSteps: 8,
  },
  run: (message, opts, history, emit) =>
    runMarket(message, opts, emit, new Conversation(history)),
};
