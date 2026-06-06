import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Policy gate shared between the in-app and iii backends.
 *
 * Our tools are defined inline across many agent factories and are the *same*
 * code on both backends, so we can't couple them to the iii SDK. Instead, the
 * iii worker installs a policy-check function for the duration of a run via
 * {@link withPolicy}; tools call {@link policyCheck}, which is a no-op unless a
 * checker is active (i.e. on the in-app path nothing changes). This mirrors the
 * `withProvider` AsyncLocalStorage pattern in `lib/provider.ts`.
 *
 * The active checker forwards to the iii harness worker's
 * `policy::check_permissions` (configurable), driven by `iii-permissions.yaml`.
 */

export type PolicyDecision = 'allow' | 'deny' | 'needs_approval';

export interface PolicyRequest {
  /** Logical tool/action being attempted, e.g. 'web_search'. */
  tool: string;
  /** The tool's input args, for argument-aware policies. */
  input?: unknown;
  /** Optional agent id for per-agent policies. */
  agent?: string;
}

export interface PolicyResult {
  decision: PolicyDecision;
  /** Human-readable reason, surfaced when denied. */
  reason?: string;
}

export type PolicyChecker = (req: PolicyRequest) => Promise<PolicyResult>;

const als = new AsyncLocalStorage<PolicyChecker>();

/** Run `fn` with `checker` active for all nested {@link policyCheck} calls. */
export function withPolicy<T>(checker: PolicyChecker, fn: () => Promise<T>): Promise<T> {
  return als.run(checker, fn);
}

/** Thrown when a policy denies (or declines to approve) a tool call. */
export class PolicyDeniedError extends Error {
  constructor(public readonly req: PolicyRequest, public readonly result: PolicyResult) {
    super(result.reason || `Policy ${result.decision} for ${req.tool}`);
    this.name = 'PolicyDeniedError';
  }
}

/**
 * Consult the active policy. No-op (allows) when no checker is installed — so
 * the in-app backend behaves exactly as before. On the iii path, throws
 * {@link PolicyDeniedError} for deny/needs_approval so the run surfaces it.
 */
export async function policyCheck(req: PolicyRequest): Promise<void> {
  const checker = als.getStore();
  if (!checker) return;
  const result = await checker(req);
  if (result.decision !== 'allow') {
    throw new PolicyDeniedError(req, result);
  }
}
