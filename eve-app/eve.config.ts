/**
 * eve-side configuration for the `mat` agent. Every value is read from the
 * environment (a Vercel project env var) with a sensible default, so a deploy is
 * configured without code changes. The matching app-side config lives in
 * `lib/eve/config.ts`.
 */
const env = (k: string) => process.env[k]?.trim() || undefined;
const flag = (k: string) => process.env[k] === 'true';

export const cfg = {
  /** Agent name the app targets (must match `EVE_AGENT_NAME` on the app side). */
  agentName: env('EVE_AGENT_NAME') || 'mat',
  /** Shared secret authorizing a session (must match the app's `EVE_API_TOKEN`). */
  token: env('EVE_API_TOKEN'),
  /** Default provider when a turn omits one. */
  defaultProvider: env('EVE_DEFAULT_PROVIDER') || 'openai',
  /** Enable eve's server-side session state as the source of history. */
  sessionStateEnabled: flag('EVE_SESSION_STATE_ENABLED'),
  /** Enable eve approval gates for human-in-the-loop patterns (v1). */
  approvalsEnabled: flag('EVE_APPROVALS_ENABLED'),
} as const;
