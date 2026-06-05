'use client';

import { usePageSession } from '@/app/hooks/usePageSession';
import { trackArticleView, trackArticleTimeSpent } from '@/lib/analytics';

/**
 * Drop-in (renders nothing) tracker for a long-form content page. Fires an
 * `article_view` on mount and an `article_time_spent` with active seconds when
 * the reader leaves or hides the tab. Safe to render from a Server Component:
 * it's a Client Component child that only touches the DOM in effects.
 */
export function ArticleAnalytics({ article, title }: { article: string; title: string }) {
  usePageSession(
    () => trackArticleView({ article, title }),
    (seconds) => trackArticleTimeSpent({ article, title, seconds }),
  );
  return null;
}
