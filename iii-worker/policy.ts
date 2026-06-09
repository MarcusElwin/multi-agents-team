import type { ISdk } from 'iii-sdk';
import { cfg } from './config';
import type { PolicyChecker, PolicyResult } from '@/lib/iii/policy-context';

/**
 * Build a {@link PolicyChecker} that forwards to the iii harness worker's
 * `policy::check_permissions` (configurable). The worker installs this around a
 * run via `withPolicy`, so shared tools gate themselves without importing iii.
 *
 * Fail-closed: if the policy worker is unreachable, deny rather than silently
 * allow an unguarded tool — matching iii's fail-closed default.
 *
 * VERIFY (live engine): the request/response schema of policy::check_permissions
 * is normalized loosely below; confirm field names against the running harness.
 */
export function makePolicyChecker(iii: ISdk): PolicyChecker {
  return async (req) => {
    try {
      const res = await iii.trigger<
        { tool: string; input?: unknown; agent?: string },
        { decision?: string; reason?: string; allowed?: boolean } | null
      >({
        function_id: cfg.policyFn,
        payload: { tool: req.tool, input: req.input, agent: req.agent },
      });

      const raw = res?.decision;
      const decision: PolicyResult['decision'] =
        raw === 'deny' || raw === 'needs_approval' || raw === 'allow'
          ? raw
          : res?.allowed === false
            ? 'deny'
            : 'allow';
      return { decision, reason: res?.reason ?? undefined };
    } catch (err) {
      return {
        decision: 'deny',
        reason: `policy check failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  };
}
