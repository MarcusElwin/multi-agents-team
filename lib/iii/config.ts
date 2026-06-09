/**
 * Client-side configuration for talking to the iii engine over HTTP. The app
 * (on Vercel) POSTs each turn to the engine's HTTP trigger; the engine routes
 * it to our worker, which runs the agent loop and returns the result. All values
 * come from the environment so a deploy points at its own engine without code
 * changes. See the deploy guide in README and `iii-worker/` for the other side.
 */

/** Base HTTPS URL of the engine's HTTP API (the iii-http worker, default :3111). */
export function iiiEngineHttpUrl(): string {
  return process.env.III_ENGINE_HTTP_URL?.trim() ?? '';
}

/** Path the worker registers its turn HTTP trigger on. */
export function iiiRunPath(): string {
  const p = process.env.III_RUN_PATH?.trim() || '/run';
  return p.startsWith('/') ? p : `/${p}`;
}

/** Path the worker registers its health HTTP trigger on (GET). */
export function iiiHealthPath(): string {
  const p = process.env.III_HEALTH_PATH?.trim() || '/health';
  return p.startsWith('/') ? p : `/${p}`;
}

/** Path the worker registers its events-poll HTTP trigger on (GET, queue path). */
export function iiiEventsPath(): string {
  const p = process.env.III_EVENTS_PATH?.trim() || '/events';
  return p.startsWith('/') ? p : `/${p}`;
}

/**
 * How long the app keeps polling a queued run's events before giving up. A
 * queued run executes independent of this request, so this can be much longer
 * than the inline turn timeout. Default 15 min.
 */
export function iiiQueuePollTimeoutMs(): number {
  const raw = Number(process.env.III_QUEUE_POLL_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 900_000;
}

/** Shared secret sent as a Bearer token (and body field) to authorize a run. */
export function iiiEngineToken(): string | undefined {
  return process.env.III_ENGINE_TOKEN?.trim() || undefined;
}

/** Timeout (ms) for a submitted turn. Agent runs are long; default 4 min. */
export function iiiTurnTimeoutMs(): number {
  const raw = Number(process.env.III_TURN_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 240_000;
}

/** Whether an engine endpoint has been configured on the server. */
export function isIiiConfigured(): boolean {
  return Boolean(iiiEngineHttpUrl());
}

/**
 * Live streaming (iii-stream). When enabled, `mat::run` returns a stream name and
 * the app reads run events live from the engine Stream API instead of getting a
 * batched result. OFF by default — the batch path is the verified default.
 *
 * NOTE: the engine Stream API wire format is finalized against a live engine;
 * the base URL and read path are configurable so a deploy can point at the real
 * endpoint without code changes.
 */
export function iiiStreamEnabled(): boolean {
  return process.env.III_STREAM_ENABLED === 'true';
}

/** Base URL of the engine Stream API (defaults to the HTTP host on :3112). */
export function iiiStreamUrl(): string {
  const explicit = process.env.III_STREAM_URL?.trim();
  if (explicit) return explicit;
  const http = iiiEngineHttpUrl();
  if (!http) return '';
  // Default to the same host on the documented Stream API port.
  return http.replace(/:\d+$/, '').replace(/\/$/, '') + ':3112';
}

/** Path template the app reads a run's stream from. `{stream}`/`{group}` substituted. */
export function iiiStreamReadPath(): string {
  return process.env.III_STREAM_READ_PATH?.trim() || '/streams/{stream}/{group}';
}

/** Stream group the worker publishes a run's events under. */
export function iiiStreamGroup(): string {
  return process.env.III_STREAM_GROUP?.trim() || 'events';
}
