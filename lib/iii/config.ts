/**
 * Server-side configuration for the iii engine backend. All values are read
 * from the environment so a deploy can point at whatever engine it runs without
 * code changes. The exact orchestrator function id + payload contract is engine
 * specific (see issue #10, Phase 0/1) — hence env-configurable rather than
 * hardcoded.
 */

/** Default engine WebSocket address, per the iii SDK. */
export const III_DEFAULT_ENGINE_URL = 'ws://localhost:49134';

/** WebSocket URL of the iii engine the app submits runs to. */
export function iiiEngineUrl(): string {
  return process.env.III_ENGINE_URL?.trim() || III_DEFAULT_ENGINE_URL;
}

/**
 * function_id of the turn-orchestrator entrypoint a run is submitted to. The
 * engine's default harness exposes a turn-orchestrator worker; the precise id
 * is pinned per deployment.
 */
export function iiiTurnFunctionId(): string {
  return process.env.III_TURN_FUNCTION_ID?.trim() || 'turn-orchestrator::run';
}

/** Timeout (ms) for a submitted turn. Agent runs are long; default 4 min. */
export function iiiTurnTimeoutMs(): number {
  const raw = Number(process.env.III_TURN_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 240_000;
}

/**
 * Whether an engine URL has been explicitly configured on the server. When
 * false we still attempt the default localhost address (useful for local dev),
 * but this lets callers reason about intent.
 */
export function isIiiConfigured(): boolean {
  return Boolean(process.env.III_ENGINE_URL?.trim());
}
