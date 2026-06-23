import { defineTool } from 'eve/tools';
import { z } from 'zod';
import type { AgentEvent } from '@/lib/agent-events';
import { runMode } from '../../shared/run';

/**
 * Tool form of a run: execute one architecture for a prompt and return its final
 * synthesized result. The streaming HTTP channel is the primary entrypoint; this
 * tool lets the agent (or another agent) invoke a pattern inline and get just the
 * answer — useful for composing patterns or for non-streaming callers.
 */
export default defineTool({
  description:
    'Run one of the nine multi-agent coordination patterns (v1–v9) for a prompt and return the final synthesized result.',
  inputSchema: z.object({
    mode: z.enum(['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9']),
    message: z.string().min(1),
    model: z.string().optional(),
    provider: z.enum(['openai', 'anthropic', 'mistral', 'fireworks']).optional(),
  }),
  async execute({ mode, message, model, provider }) {
    let result = '';
    const collect = (e: AgentEvent) => {
      if (e.type === 'workflow_complete') result = e.result ?? '';
    };
    await runMode({ mode, message, model, provider }, [], collect);
    return { mode, result };
  },
});
