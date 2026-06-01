'use client';

import { Plus, MessageSquare, Trash2, Sparkles, PanelLeftClose, PanelLeft } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { StoredConversation } from '../hooks/useConversations';

interface ChatSidebarProps {
  conversations: StoredConversation[];
  activeId: string | null;
  /** Chat ids with a run in flight — shown with a pulsing dot. */
  runningIds?: Set<string>;
  disabled?: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

const DAY = 24 * 60 * 60 * 1000;

/** Bucket conversations into Today / Yesterday / Previous 7 days / Older. */
function groupByRecency(
  conversations: StoredConversation[],
  now: number,
): Array<{ label: string; items: StoredConversation[] }> {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();

  const buckets: Record<string, StoredConversation[]> = {
    Today: [],
    Yesterday: [],
    'Previous 7 days': [],
    Older: [],
  };

  for (const c of [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)) {
    if (c.updatedAt >= todayMs) buckets.Today.push(c);
    else if (c.updatedAt >= todayMs - DAY) buckets.Yesterday.push(c);
    else if (c.updatedAt >= todayMs - 7 * DAY) buckets['Previous 7 days'].push(c);
    else buckets.Older.push(c);
  }

  return Object.entries(buckets)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}

export function ChatSidebar({
  conversations,
  activeId,
  runningIds,
  disabled,
  collapsed,
  onToggle,
  onNew,
  onSelect,
  onDelete,
}: ChatSidebarProps) {
  const isRunning = (id: string) => runningIds?.has(id) ?? false;
  // Date.now() is fine in a client component render for bucketing display only.
  const groups = groupByRecency(conversations, Date.now());

  // Collapsed: a thin rail with just the expand + new-chat icons, so history
  // can be hidden to reclaim horizontal space.
  if (collapsed) {
    return (
      <aside className="flex h-full w-12 shrink-0 flex-col items-center gap-2 border-r border-stone-200 bg-white/60 py-3">
        <button
          type="button"
          onClick={onToggle}
          aria-label="Show chats"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onNew}
          disabled={disabled}
          aria-label="New chat"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:bg-stone-50 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-stone-200 bg-white/60">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-stone-200 px-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900 text-white">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
        <span className="text-sm font-semibold">Chats</span>
        <button
          type="button"
          onClick={onToggle}
          aria-label="Hide chats"
          className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      <div className="px-2 py-2">
        <button
          type="button"
          onClick={onNew}
          disabled={disabled}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition-colors',
            'hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <Plus className="h-4 w-4" />
          New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3 [scrollbar-width:thin]">
        {conversations.length === 0 ? (
          <p className="px-2 py-6 text-center text-[11px] text-stone-400">
            No saved chats yet. Your conversations appear here.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="mb-3">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                {group.label}
              </div>
              <ul className="space-y-0.5">
                {group.items.map((c) => (
                  <li key={c.id}>
                    <div
                      className={cn(
                        'group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors',
                        c.id === activeId
                          ? 'bg-stone-900 text-white'
                          : 'text-stone-700 hover:bg-stone-100',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => onSelect(c.id)}
                        disabled={disabled}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-not-allowed"
                      >
                        {isRunning(c.id) ? (
                          <span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center" aria-label="running">
                            <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-blue-400 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
                          </span>
                        ) : (
                          <MessageSquare
                            className={cn(
                              'h-3.5 w-3.5 shrink-0',
                              c.status === 'error'
                                ? 'text-red-400'
                                : c.id === activeId
                                  ? 'text-white/70'
                                  : 'text-stone-400',
                            )}
                          />
                        )}
                        <span className="truncate">{c.title}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(c.id)}
                        disabled={disabled}
                        aria-label="Delete chat"
                        className={cn(
                          'shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 disabled:cursor-not-allowed',
                          c.id === activeId
                            ? 'text-white/60 hover:text-white'
                            : 'text-stone-400 hover:text-red-600',
                        )}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
