/**
 * Extract the most useful human-readable message from an error thrown by the AI
 * SDK / a provider call. AI SDK `APICallError`s set `.message` to just the HTTP
 * status text (e.g. "Not Found"), while the provider's actual explanation lives
 * in the JSON response body (e.g. "Account suspended … check billing"). Surfacing
 * only `.message` hides the real cause, so we dig into the response body first.
 */
export function describeError(error: unknown): string {
  if (typeof error === 'string') return error;
  if (!error || typeof error !== 'object') return 'Unknown error';

  const e = error as Record<string, unknown>;

  // AI SDK APICallError exposes the raw provider response on `responseBody`
  // (string) and/or `data` (parsed). Provider errors are usually
  // { error: { message, code, type } } or { error: "..." } or { message }.
  const body = e.responseBody ?? e.data;
  const fromBody = extractProviderMessage(body);
  if (fromBody) {
    const status = typeof e.statusCode === 'number' ? ` (HTTP ${e.statusCode})` : '';
    return `${fromBody}${status}`;
  }

  // Fall back to the SDK message, but enrich a bare status text with the code.
  if (e.message && typeof e.message === 'string') {
    const status = typeof e.statusCode === 'number' ? ` (HTTP ${e.statusCode})` : '';
    // Avoid doubling the status if it's already in the message.
    return status && !e.message.includes(String(e.statusCode)) ? `${e.message}${status}` : e.message;
  }

  return 'Unknown error';
}

/** Pull a message out of a provider error body (string JSON or parsed object). */
function extractProviderMessage(body: unknown): string | null {
  if (!body) return null;

  let parsed: unknown = body;
  if (typeof body === 'string') {
    try {
      parsed = JSON.parse(body);
    } catch {
      // Non-JSON body — return it trimmed if it looks like a message.
      const t = body.trim();
      return t.length > 0 && t.length < 600 ? t : null;
    }
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  // { error: { message } } | { error: "..." } | { message }
  const err = obj.error;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const m = (err as Record<string, unknown>).message;
    if (typeof m === 'string') return m;
  }
  if (typeof obj.message === 'string') return obj.message;

  return null;
}
