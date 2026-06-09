'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProviderId } from '@/lib/models';
import { asBackend, DEFAULT_BACKEND, type Backend } from '@/lib/backends';

/**
 * Per-browser settings: bring-your-own API keys, one per provider. Mirrors
 * useConversations (hydrate-once guard + persist effect). Keys live ONLY in
 * localStorage and are sent in the request body to this app's own API — never
 * persisted server-side, never logged. localStorage is XSS-readable; the
 * settings UI states this trade-off.
 */
export interface Settings {
  apiKeys: Partial<Record<ProviderId, string>>;
  /** Global default execution backend; the per-run selector seeds from this. */
  backend: Backend;
}

const STORAGE_KEY = 'mat:settings:v1';

const EMPTY: Settings = { apiKeys: {}, backend: DEFAULT_BACKEND };

function load(): Settings {
  if (typeof window === 'undefined') return { ...EMPTY };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.apiKeys) return { ...EMPTY };
    return { apiKeys: parsed.apiKeys, backend: asBackend(parsed.backend) };
  } catch {
    return { ...EMPTY };
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>({ ...EMPTY });
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

  const setBackend = useCallback((backend: Backend) => {
    setSettings((s) => ({ ...s, backend }));
  }, []);

  return { settings, hydrated: hydrated.current, setApiKey, clearApiKey, hasKey, setBackend };
}
