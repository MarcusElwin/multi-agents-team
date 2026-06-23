/**
 * Client-side configuration for talking to a deployed eve app over HTTP. The
 * Next app (on Vercel) starts a durable eve *session* for each turn and streams
 * the session's lifecycle events back. All values come from the environment so a
 * deploy points at its own eve app without code changes. See the deploy guide in
 * README and `eve-app/` for the other side (the agent definition).
 *
 * eve's HTTP surface (per the docs):
 *   - POST /eve/v1/session            → starts a durable session, returns the
 *                                        `x-eve-session-id` header + a
 *                                        `continuationToken` in the body.
 *   - GET  /eve/v1/session/:id/stream → streams NDJSON lifecycle events.
 * Both paths are configurable below so a pinned deploy can adjust without code
 * changes if the surface shifts (eve is beta).
 */

/** Base HTTPS URL of the deployed eve app (the Vercel deployment). */
export function eveBaseUrl(): string {
  return process.env.EVE_BASE_URL?.trim().replace(/\/$/, '') ?? '';
}

/** Path that starts a durable session (POST). */
export function eveSessionPath(): string {
  const p = process.env.EVE_SESSION_PATH?.trim() || '/eve/v1/session';
  return p.startsWith('/') ? p : `/${p}`;
}

/**
 * Path template that streams a session's NDJSON lifecycle events (GET).
 * `{id}` is substituted with the session id. eve also returns the stream inline
 * on the POST response in some deployments; the adapter prefers the inline body
 * and falls back to this GET when the POST returns JSON only.
 */
export function eveStreamPath(): string {
  const p = process.env.EVE_STREAM_PATH?.trim() || '/eve/v1/session/{id}/stream';
  return p.startsWith('/') ? p : `/${p}`;
}

/** Path of a lightweight readiness probe (GET). */
export function eveHealthPath(): string {
  const p = process.env.EVE_HEALTH_PATH?.trim() || '/eve/v1/health';
  return p.startsWith('/') ? p : `/${p}`;
}

/** Bearer token authorizing a session (must match the eve app's EVE_API_TOKEN). */
export function eveApiToken(): string | undefined {
  return process.env.EVE_API_TOKEN?.trim() || undefined;
}

/** Name of the eve agent to run (an eve app can host several). Default `mat`. */
export function eveAgentName(): string {
  return process.env.EVE_AGENT_NAME?.trim() || 'mat';
}

/** Timeout (ms) for a turn's inline stream. Agent runs are long; default 4 min. */
export function eveTurnTimeoutMs(): number {
  const raw = Number(process.env.EVE_TURN_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 240_000;
}

/** Whether an eve app endpoint has been configured on the server. */
export function isEveConfigured(): boolean {
  return Boolean(eveBaseUrl());
}
