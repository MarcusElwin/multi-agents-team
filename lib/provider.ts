import { AsyncLocalStorage } from 'node:async_hooks';
import type { LanguageModel } from 'ai';
import { envOpenAI, PROVIDERS, providerForModel, type ProviderId } from './models';

/**
 * Per-request model-provider resolution.
 *
 * Agents/tools import `provider()` instead of `@ai-sdk/openai`'s `openai`. The
 * route wraps the whole run in `withProvider({ providerId, apiKey }, fn)`; every
 * `provider()` call inside that async tree resolves to a client bound to the
 * request's API key + provider. This keeps per-request credentials isolated
 * (concurrency-safe — no module-level mutable state) without threading an
 * apiKey through every factory signature.
 *
 * RULES:
 * - Only call `provider()` INSIDE a `withProvider` scope (i.e. during a run).
 * - Never hoist a provider instance to module scope — it would capture a stale
 *   (or absent) credential. Build it lazily at the call site.
 * - With no apiKey, OpenAI falls back to the env singleton (reads
 *   OPENAI_API_KEY), preserving the original behavior for local dev.
 */

interface ProviderContext {
  providerId: ProviderId;
  apiKey?: string;
}

const als = new AsyncLocalStorage<ProviderContext>();

// A "provider" is a model factory: provider(modelId) → LanguageModel. The
// OpenAI variant additionally carries `.responses` and `.tools` (web search).
type ModelProvider = ((model: string) => LanguageModel) & {
  responses?: (model: string) => LanguageModel;
  tools?: { webSearch: (opts: Record<string, unknown>) => unknown };
};

// Memoize clients per (provider, key) so the ~21 provider() calls in one run
// don't each allocate a new client. Keyed so the credential fully determines it.
const cache = new Map<string, ModelProvider>();

function build(ctx: ProviderContext): ModelProvider {
  const { providerId, apiKey } = ctx;
  // OpenAI with no explicit key → env singleton (today's behavior; has
  // .responses/.tools and reads OPENAI_API_KEY).
  if (providerId === 'openai' && !apiKey) {
    return envOpenAI as unknown as ModelProvider;
  }
  // Effective key: explicit user key, else the provider's env var (env fallback).
  const effectiveKey = apiKey ?? process.env[PROVIDERS[providerId].envVar];
  const cacheKey = `${providerId}:${effectiveKey ?? '__none__'}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const client = PROVIDERS[providerId].createClient(effectiveKey ?? '') as unknown as ModelProvider;
  cache.set(cacheKey, client);
  return client;
}

/** Run `fn` with the given provider context active for all nested provider() calls. */
export function withProvider<T>(ctx: ProviderContext, fn: () => Promise<T>): Promise<T> {
  return als.run(ctx, fn);
}

/** The active model-provider. Must be called inside a withProvider scope. */
export function provider(): ModelProvider {
  const ctx = als.getStore() ?? { providerId: 'openai' as ProviderId };
  return build(ctx);
}

/** The active provider id (for tools that are provider-specific, e.g. web search). */
export function activeProviderId(): ProviderId {
  return als.getStore()?.providerId ?? 'openai';
}

/** True when web search is available (OpenAI-only tool). */
export function webSearchAvailable(): boolean {
  return activeProviderId() === 'openai';
}

/** True when the public deployment requires visitors to bring their own key. */
export function isByoKeyOnly(): boolean {
  return process.env.PUBLIC_BYO_KEY_ONLY === 'true';
}

/**
 * Resolve the effective provider + API key for a request, applying precedence:
 *   user-supplied key (settings) > server env key > error.
 * In PUBLIC_BYO_KEY_ONLY mode the env key is ignored — a user key is required.
 * Returns `{ error }` (a human message) when no usable key is available.
 */
export function resolveCredentials(body: {
  model?: string;
  apiKey?: string;
  provider?: ProviderId;
}): { providerId: ProviderId; apiKey?: string } | { error: string } {
  const providerId: ProviderId = body.provider ?? providerForModel(body.model ?? '');
  const reg = PROVIDERS[providerId];
  const userKey = typeof body.apiKey === 'string' && body.apiKey.trim() ? body.apiKey.trim() : undefined;

  if (userKey) return { providerId, apiKey: userKey };

  // No user key. In BYO-only mode, refuse to fall back to the server env key.
  if (isByoKeyOnly()) {
    return { error: `This deployment requires your own ${reg.label} API key. Add one in Settings.` };
  }

  // Fall back to the server env key. OpenAI uses the implicit env singleton
  // (apiKey undefined → provider() returns envOpenAI). Other providers need
  // their env var present, otherwise the SDK call will fail — check up front.
  if (providerId !== 'openai' && !process.env[reg.envVar]) {
    return { error: `Add a ${reg.label} API key in Settings, or set ${reg.envVar} in the environment.` };
  }
  if (providerId === 'openai' && !process.env.OPENAI_API_KEY) {
    return { error: `Add an OpenAI API key in Settings, or set OPENAI_API_KEY in .env.local.` };
  }
  return { providerId, apiKey: undefined }; // env fallback
}
