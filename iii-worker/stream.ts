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
export async function publishEvent(
  iii: ISdk,
  runId: string,
  event: AgentEvent,
  opts: { seq?: number; force?: boolean } = {},
): Promise<void> {
  // Queued runs (force) must publish regardless of the stream flag — the stream
  // is their only output channel for the app's poll. Inline runs only publish
  // when streaming is explicitly enabled (live SSE is their primary path).
  if (!opts.force && !cfg.streamEnabled) return;
  try {
    // StreamSetInput: { stream_name, group_id, item_id, data }. Use a
    // zero-padded sequence as item_id so stream::list returns events in order
    // and the poller can slice by count reliably.
    const itemId = opts.seq != null ? String(opts.seq).padStart(6, '0') : randomUUID();
    await iii.trigger({
      function_id: cfg.streamPublishFn,
      payload: {
        stream_name: streamNameFor(runId),
        group_id: cfg.streamGroup,
        item_id: itemId,
        data: event,
      },
    });
  } catch {
    // best-effort live delivery
  }
}
