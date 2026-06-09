import { track } from '@vercel/analytics';

/**
 * Custom analytics events (Vercel Web Analytics → custom events).
 *
 * Thin, typed wrappers around `@vercel/analytics`'s `track()` so event names and
 * property shapes stay consistent across the app and live in one place. `track`
 * only accepts flat properties whose values are string | number | boolean | null,
 * so every payload here is kept flat. We never send anything sensitive — API key
 * *values* are never tracked, only which provider a key was set for.
 *
 * Docs: https://vercel.com/docs/analytics/custom-events
 */

/** A workflow that runs at least this long (seconds) is flagged "long running". */
export const LONG_RUNNING_SECONDS = 30;
/** A workflow that costs at least this much (USD) is flagged "expensive". */
export const EXPENSIVE_USD = 0.1;

/** A long-form content page was opened (architecture pages, references, about). */
export function trackArticleView(p: { article: string; title: string }) {
  track('article_view', { ...p });
}

/** Active seconds spent reading a content page, flushed on leave/hide. */
export function trackArticleTimeSpent(p: { article: string; title: string; seconds: number }) {
  track('article_time_spent', { ...p });
}

/** The chat experience was opened (page mounted). */
export function trackChatOpened() {
  track('chat_opened');
}

/** Active seconds spent in the chat, flushed on leave/hide. */
export function trackChatClosed(p: { seconds: number }) {
  track('chat_closed', { ...p });
}

/** The user explicitly picked a model from the selector. */
export function trackModelSelected(p: { model: string; label: string; provider: string }) {
  track('model_selected', { ...p });
}

/**
 * A provider API key was configured/uploaded or cleared in Settings. We record
 * only the provider and the action — never the key itself.
 */
export function trackApiKeyConfigured(p: {
  provider: string;
  label: string;
  action: 'configured' | 'cleared';
}) {
  track('api_key_configured', { ...p });
}

/** A prompt was submitted to an agent workflow. */
export function trackPromptSubmitted(p: {
  mode: string;
  model: string;
  provider: string;
  promptLength: number;
  backend?: string;
}) {
  track('prompt_submitted', { ...p });
}

/**
 * A workflow finished (success or error). Always emits `workflow_completed`;
 * additionally emits dedicated `long_running_workflow` / `expensive_workflow`
 * events when a successful run crosses the duration/cost thresholds, so they're
 * trivial to filter in the Vercel dashboard.
 */
export function trackWorkflowCompleted(p: {
  mode: string;
  model: string;
  provider: string;
  durationSeconds: number;
  costUsd: number;
  iterations?: number;
  status: 'success' | 'error';
}) {
  track('workflow_completed', {
    mode: p.mode,
    model: p.model,
    provider: p.provider,
    durationSeconds: p.durationSeconds,
    costUsd: p.costUsd,
    iterations: p.iterations ?? null,
    status: p.status,
  });

  if (p.status !== 'success') return;

  if (p.durationSeconds >= LONG_RUNNING_SECONDS) {
    track('long_running_workflow', {
      mode: p.mode,
      model: p.model,
      provider: p.provider,
      durationSeconds: p.durationSeconds,
    });
  }
  if (p.costUsd >= EXPENSIVE_USD) {
    track('expensive_workflow', {
      mode: p.mode,
      model: p.model,
      provider: p.provider,
      costUsd: p.costUsd,
    });
  }
}
