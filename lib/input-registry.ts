/**
 * Bridges a paused agent run (waiting on human input) with the separate HTTP
 * request that delivers the answer.
 *
 * When an agent calls its request-input tool, it registers a pending request
 * here and awaits the returned promise. The client POSTs the answer to a small
 * endpoint, which calls resolve(requestId, answer) to unblock the run.
 *
 * NOTE: this is a single-process, in-memory registry — correct for local dev
 * and a single-instance deployment. A multi-instance deployment would need a
 * shared store (e.g. Redis pub/sub) so the answer reaches the instance holding
 * the paused run.
 */
interface Pending {
  resolve: (answer: string) => void;
  timeout: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, Pending>();

/** Register a wait for human input. Resolves with the answer, or '' on timeout. */
export function waitForInput(requestId: string, timeoutMs = 5 * 60_000): Promise<string> {
  return new Promise<string>((resolve) => {
    const timeout = setTimeout(() => {
      pending.delete(requestId);
      resolve(''); // empty answer signals "no response / timed out"
    }, timeoutMs);
    pending.set(requestId, { resolve, timeout });
  });
}

/** Deliver an answer for a pending request. Returns false if none was waiting. */
export function resolveInput(requestId: string, answer: string): boolean {
  const entry = pending.get(requestId);
  if (!entry) return false;
  clearTimeout(entry.timeout);
  pending.delete(requestId);
  entry.resolve(answer);
  return true;
}
