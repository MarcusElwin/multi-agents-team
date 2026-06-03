'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Mode } from '@/lib/modes';
import type { RunSummary } from '@/lib/agent-events';

/**
 * A single user/assistant message as persisted in a stored conversation. Mirrors
 * the client-side ChatMessage shape but is intentionally serializable (no React
 * state, dates as epoch ms) so it round-trips through localStorage cleanly.
 */
export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  meta?: {
    mode: Mode;
    model?: string;
    agentsUsed?: string[];
    iterations?: number;
    totalDuration?: number;
    totalCostUsd?: number;
    totalTokens?: number;
    // For v2: each agent's deliverable, rendered as a build-plan card. `output`
    // is the full text so the card can show a collapsible deliverable.
    perAgent?: Array<{ agent: string; duration: number; completed: boolean; output?: string }>;
    // For v4–v7: a pattern-specific summary rendered as a bespoke card above the
    // markdown result (score ladder, debate, blackboard, auction).
    summary?: RunSummary;
  };
}

/** Lifecycle of a conversation's most recent turn. */
export type ConversationStatus = 'idle' | 'running' | 'error';

export interface StoredConversation {
  id: string;
  title: string;
  mode: Mode;
  model: string;
  messages: StoredMessage[];
  /** 'running' while a research/run is in flight for this chat. */
  status: ConversationStatus;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'mat:conversations:v1';
const ACTIVE_KEY = 'mat:active-conversation:v1';

/** Derive a short title from the first user message. */
export function deriveTitle(messages: StoredMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return 'New chat';
  const t = firstUser.content.trim().replace(/\s+/g, ' ');
  return t.length > 48 ? `${t.slice(0, 48)}…` : t;
}

function load(): StoredConversation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredConversation[]) : [];
  } catch {
    return [];
  }
}

/**
 * Owns the list of stored conversations and which one is active, persisting
 * both to localStorage. The page lifts its message list into the active
 * conversation via saveActive() after each completed turn.
 */
export function useConversations() {
  const [conversations, setConversations] = useState<StoredConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Skip the first persist effect run so initial hydration doesn't immediately
  // re-write storage with an empty list before load() has populated state.
  const hydrated = useRef(false);

  // Hydrate once on mount (client-only).
  useEffect(() => {
    const loaded = load();
    setConversations(loaded);
    const storedActive = window.localStorage.getItem(ACTIVE_KEY);
    if (storedActive && loaded.some((c) => c.id === storedActive)) {
      setActiveId(storedActive);
    }
    hydrated.current = true;
  }, []);

  // Persist conversations whenever they change (after hydration).
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    } catch {
      // Quota or serialization failure — non-fatal; history just won't persist.
    }
  }, [conversations]);

  // Persist the active id separately so a reload reopens the same chat.
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      if (activeId) window.localStorage.setItem(ACTIVE_KEY, activeId);
      else window.localStorage.removeItem(ACTIVE_KEY);
    } catch {
      // non-fatal
    }
  }, [activeId]);

  /** Start a fresh chat: clear the active selection so the page shows empty state. */
  const newConversation = useCallback(() => {
    setActiveId(null);
  }, []);

  const selectConversation = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      setActiveId((cur) => (cur === id ? null : cur));
    },
    [],
  );

  /**
   * Create-or-update a conversation at a known id and make it active. Used at
   * run start to bind an in-flight research to a chat (status 'running') before
   * any result exists. Pass an existing id to update it, or omit to mint a new
   * one. Returns the id in use (reliable even though setState is async).
   */
  const upsertConversation = useCallback(
    (params: {
      id?: string;
      messages: StoredMessage[];
      mode: Mode;
      model: string;
      status: ConversationStatus;
      now: number;
      activate?: boolean;
    }): string => {
      const { messages, mode, model, status, now, activate = true } = params;
      const id = params.id ?? activeId ?? crypto.randomUUID();

      setConversations((prev) => {
        if (prev.some((c) => c.id === id)) {
          return prev.map((c) =>
            c.id === id
              ? { ...c, messages, mode, model, status, title: deriveTitle(messages), updatedAt: now }
              : c,
          );
        }
        const created: StoredConversation = {
          id,
          title: deriveTitle(messages),
          mode,
          model,
          messages,
          status,
          createdAt: now,
          updatedAt: now,
        };
        return [created, ...prev];
      });

      if (activate && id !== activeId) setActiveId(id);
      return id;
    },
    [activeId],
  );

  /**
   * Write a patch to a specific conversation by id, regardless of which chat is
   * currently active. Used to land a completed run's result back on its
   * originating chat even after the user has navigated away. No-op if the id is
   * gone (e.g. the user deleted that chat mid-run).
   */
  const updateConversation = useCallback(
    (id: string, patch: Partial<Omit<StoredConversation, 'id'>>, retitle = false) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                ...patch,
                title: retitle && patch.messages ? deriveTitle(patch.messages) : c.title,
              }
            : c,
        ),
      );
    },
    [],
  );

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;

  return {
    conversations,
    activeId,
    activeConversation,
    hydrated: hydrated.current,
    newConversation,
    selectConversation,
    deleteConversation,
    upsertConversation,
    updateConversation,
  };
}
