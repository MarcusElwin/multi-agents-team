import { randomUUID } from 'node:crypto';
import type { ISdk } from 'iii-sdk';
import type { AgentEvent } from '@/lib/agent-events';
import { cfg } from './config';

/** Stream name a run's events are published under. */
export function streamNameFor(runId: string): string {
  return cfg.streamNamePrefix + runId;
}

/**
 * Publish one run event to the iii-stream worker so subscribers (the app) see
 * it live. Best-effort: a stream hiccup never fails the run. No-op unless
 * streaming is enabled.
 *
 * VERIFY (live engine): the publish function id + payload (stream_name/group_id/
 * item_id/data) are normalized to the IStream item shape from iii-sdk/stream;
 * confirm against the running iii-stream worker.
 */
export async function publishEvent(iii: ISdk, runId: string, event: AgentEvent): Promise<void> {
  if (!cfg.streamEnabled) return;
  try {
    await iii.trigger({
      function_id: cfg.streamPublishFn,
      payload: {
        stream_name: streamNameFor(runId),
        group_id: cfg.streamGroup,
        item_id: randomUUID(),
        data: event,
      },
    });
  } catch {
    // best-effort live delivery
  }
}
