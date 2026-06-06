import { createChannel } from 'iii-sdk/helpers';
import { ChannelReader, type ISdk, type StreamChannelRef } from 'iii-sdk';
import { cfg } from './config';

/**
 * Worker-to-worker artifact handoff over an iii **channel** (the one core
 * primitive functions/triggers/streams don't cover). A large final artifact is
 * streamed onto a channel and only its `readerRef` is passed across the bus —
 * keeping big blobs out of JSON payloads. The consumer reconstructs a
 * {@link ChannelReader} from the ref and drains it.
 *
 * Flag-gated (`III_ARTIFACT_CHANNEL_ENABLED`) and off by default. The sink id
 * (`MAT_ARTIFACT_FUNCTION_ID`) can point at a dedicated render/store worker; with
 * a single worker it round-trips to a co-registered ack (see index.ts).
 */

/** Stream a text artifact onto a fresh channel; returns the reader ref + size. */
export async function offloadArtifact(
  iii: ISdk,
  content: string,
): Promise<{ ref: StreamChannelRef; bytes: number }> {
  const channel = await createChannel(iii);
  const buf = Buffer.from(content, 'utf8');
  channel.writer.stream.end(buf);
  return { ref: channel.readerRef, bytes: buf.length };
}

/** Drain an artifact handed off via a channel reader ref. */
export async function readArtifact(ref: StreamChannelRef): Promise<string> {
  const reader = new ChannelReader(cfg.engineUrl, ref);
  try {
    const buf = await reader.readAll();
    return buf.toString('utf8');
  } finally {
    reader.close();
  }
}
