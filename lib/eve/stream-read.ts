/**
 * Stream readers for the eve backend.
 *
 * eve streams session lifecycle events as **NDJSON** (one JSON object per line)
 * over the durable session stream — unlike the iii path, which streams SSE
 * `data:` frames. `parseNDJSONStream` yields each line as a parsed JSON object;
 * the adapter (`run-eve.ts`) translates those into this app's `AgentEvent`s.
 *
 * It also tolerates an SSE-style body (`data: {…}` frames) defensively, since an
 * eve deployment fronted by a generic streaming proxy may re-wrap the stream —
 * a `data:` prefix is stripped before parsing.
 */

/** Parse an NDJSON (or `data:`-prefixed) `ReadableStream` body, yielding JSON objects. */
export async function* parseNDJSONStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      if (signal?.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let nl: number;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        const parsed = parseLine(line);
        if (parsed !== undefined) yield parsed;
      }
    }
    // Flush any trailing line without a newline.
    const parsed = parseLine(buf);
    if (parsed !== undefined) yield parsed;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}

function parseLine(raw: string): unknown | undefined {
  let line = raw.trim();
  if (!line) return undefined;
  if (line.startsWith('data:')) line = line.slice(5).trim(); // tolerate SSE re-wrap
  if (!line || line === '[DONE]') return undefined;
  try {
    return JSON.parse(line);
  } catch {
    return undefined; // skip malformed line
  }
}
