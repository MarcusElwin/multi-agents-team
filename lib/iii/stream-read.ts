/**
 * Read a run's events live from the engine Stream API (the iii-stream worker).
 * Yields each item the worker published, so `runIiiBackend` can render the
 * timeline live instead of waiting for a batched result.
 *
 * VERIFY (live engine): the read endpoint is assumed to be SSE at a configurable
 * path (`III_STREAM_READ_PATH`, default `/streams/{stream}/{group}`). Confirm the
 * URL shape and framing against the running engine's Stream API (port 3112) and
 * adjust the path/parse here if needed — this is the one stream unknown.
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

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line.
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
}
