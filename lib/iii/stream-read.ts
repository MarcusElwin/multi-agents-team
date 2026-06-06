/**
 * SSE readers for the iii backend.
 *
 * `parseSSEStream` parses a raw SSE body into JSON items — used for both the
 * channel-backed HTTP response (`mat::run` streams events over the response, the
 * default live path) and the named iii-stream read (the queue path).
 */

/** Parse an SSE `ReadableStream` body, yielding each `data:` frame as JSON. */
export async function* parseSSEStream(
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

      let sep: number;
      while ((sep = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        for (const line of frame.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const json = line.slice(5).trim();
          if (!json || json === '[DONE]') continue;
          try {
            yield JSON.parse(json);
          } catch {
            // skip malformed frame
          }
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}

/**
 * Read a run's events live from the engine Stream API (the iii-stream worker).
 * Only used on the queue path — inline runs stream over the HTTP response.
 *
 * VERIFY (live engine): the read endpoint is assumed to be SSE at a configurable
 * path (`III_STREAM_READ_PATH`, default `/streams/{stream}/{group}`). Confirm the
 * URL shape against the engine Stream API (port 3112) and adjust the env if
 * needed — this is the one stream unknown, and only on the queue path.
 */
export interface ReadStreamOptions {
  baseUrl: string;
  path: string;
  streamName: string;
  group: string;
  token?: string;
  signal?: AbortSignal;
}

export async function* readEngineStream(opts: ReadStreamOptions): AsyncGenerator<unknown> {
  const url =
    opts.baseUrl.replace(/\/$/, '') +
    opts.path
      .replace('{stream}', encodeURIComponent(opts.streamName))
      .replace('{group}', encodeURIComponent(opts.group));

  const res = await fetch(url, {
    headers: {
      accept: 'text/event-stream',
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`stream ${res.status}`);
  }
  yield* parseSSEStream(res.body, opts.signal);
}
