'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProviderId } from '@/lib/models';

/**
 * Per-browser settings: bring-your-own API keys, one per provider. Mirrors
 * useConversations (hydrate-once guard + persist effect). Keys live ONLY in
 * localStorage and are sent in the request body to this app's own API — never
 * persisted server-side, never logged. localStorage is XSS-readable; the
 * settings UI states this trade-off.
 */
export interface Settings {
  apiKeys: Partial<Record<ProviderId, string>>;
}

const STORAGE_KEY = 'mat:settings:v1';

function load(): Settings {
  if (typeof window === 'undefined') return { apiKeys: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { apiKeys: {} };
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && parsed.apiKeys ? (parsed as Settings) : { apiKeys: {} };
  } catch {
    return { apiKeys: {} };
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>({ apiKeys: {} });
  const hydrated = useRef(false);

  useEffect(() => {
    setSettings(load());
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // quota / serialization — non-fatal
    }
  }, [settings]);

  const setApiKey = useCallback((provider: ProviderId, key: string) => {
    setSettings((s) => ({ ...s, apiKeys: { ...s.apiKeys, [provider]: key } }));
  }, []);

  const clearApiKey = useCallback((provider: ProviderId) => {
    setSettings((s) => {
      const next = { ...s.apiKeys };
      delete next[provider];
      return { ...s, apiKeys: next };
    });
  }, []);

  const hasKey = useCallback(
    (provider: ProviderId) => Boolean(settings.apiKeys[provider]?.trim()),
    [settings.apiKeys],
  );

  return { settings, hydrated: hydrated.current, setApiKey, clearApiKey, hasKey };
}
