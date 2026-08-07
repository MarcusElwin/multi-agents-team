import { AgentOrchestrator } from '@/lib/orchestrator';
import { Conversation } from '@/lib/conversation';
import type { HarnessSpec } from './types';

/**
 * v1 — Orchestrated. A coordinator plans and delegates to research / write /
 * edit specialists over a single iteration loop (≤15), then synthesizes. The
 * loop is the natural durable unit, so eve checkpoints per iteration; the
 * coordinator can pause to ask the user a question (eve approval gate).
 */
export const v1: HarnessSpec = {
  mode: 'v1',
  name: 'Orchestrated',
  summary: 'Coordinator plans and delegates to specialists, then synthesizes.',
  harness: {
    checkpoint: 'iteration',
    parallel: false,
    maxConcurrency: 1,
    humanInLoop: true,
    contextControl: 'summarize',
    maxSteps: 15,
  },
  run: (message, opts, history, emit) =>
    new AgentOrchestrator(opts).processUserMessage(message, emit, new Conversation(history)),
};
