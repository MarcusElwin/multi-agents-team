import { runBlackboard } from '@/lib/blackboard-runner';
import { Conversation } from '@/lib/conversation';
import type { HarnessSpec } from './types';

/**
 * v6 — Blackboard. A controller picks one role (analyst / planner / critic) per
 * round to read/write named sections of a shared board, until a `solution`
 * settles or 8 rounds. The board *is* the context (shared-workspace), and each
 * round is a durable checkpoint so the evolving board survives a resume.
 */
export const v6: HarnessSpec = {
  mode: 'v6',
  name: 'Blackboard',
  summary: 'Agents share one workspace; a controller picks who acts next.',
  harness: {
    checkpoint: 'round',
    parallel: false,
    maxConcurrency: 1,
    humanInLoop: false,
    contextControl: 'shared-workspace',
    maxSteps: 8,
  },
  run: (message, opts, history, emit) =>
    runBlackboard(message, opts, emit, new Conversation(history)),
};
