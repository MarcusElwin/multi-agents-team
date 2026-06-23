import { runHierarchical } from '@/lib/hierarchical-runner';
import { Conversation } from '@/lib/conversation';
import type { HarnessSpec } from './types';

/**
 * v3 — Hierarchical. A lead spawns sub-agents at runtime (depth 2, width 4, ≤15
 * nodes) that run in parallel and roll results up. This is the pattern that most
 * wants eve's sandboxes: each spawned node is an isolated, durable sub-run that
 * checkpoints independently and sees only its own branch's context (per-branch).
 */
export const v3: HarnessSpec = {
  mode: 'v3',
  name: 'Hierarchical',
  summary: 'A lead spawns parallel sub-agents that roll results up a tree.',
  harness: {
    checkpoint: 'node',
    parallel: true,
    maxConcurrency: 4,
    humanInLoop: false,
    contextControl: 'per-branch',
    maxSteps: 15,
  },
  run: (message, opts, history, emit) =>
    runHierarchical(message, opts, emit, new Conversation(history)),
};
