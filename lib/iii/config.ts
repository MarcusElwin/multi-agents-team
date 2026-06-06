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
