import { runEvaluatorOptimizer } from '@/lib/evaluator-optimizer-runner';
import { Conversation } from '@/lib/conversation';
import type { HarnessSpec } from './types';

/**
 * v4 — Evaluator–Optimizer. Generate → critique → revise until a quality bar
 * (score ≥ 8) or 4 rounds. Each round is a durable checkpoint; the harness
 * summarizes prior drafts/critiques so the context stays bounded as rounds add up.
 */
export const v4: HarnessSpec = {
  mode: 'v4',
  name: 'Evaluator–Optimizer',
  summary: 'Generate, critique, and revise a single artifact to a quality bar.',
  harness: {
    checkpoint: 'round',
    parallel: false,
    maxConcurrency: 1,
    humanInLoop: false,
    contextControl: 'summarize',
    maxSteps: 4,
  },
  run: (message, opts, history, emit) =>
    runEvaluatorOptimizer(message, opts, emit, new Conversation(history)),
};
