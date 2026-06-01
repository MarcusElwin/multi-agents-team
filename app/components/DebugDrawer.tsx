'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, X, Bug, Activity, MessageSquare, Wrench, ArrowRight } from 'lucide-react';
import type { AgentEvent } from '@/lib/agent-events';
import { cn } from '@/lib/utils/cn';

interface DebugDrawerProps {
  open: boolean;
  onClose: () => void;
  events: AgentEvent[];
}

type FilterKey = 'all' | 'tool' | 'bus' | 'iter';

function eventCategory(e: AgentEvent): FilterKey {
  switch (e.type) {
    case 'tool_call':
      return 'tool';
    case 'bus_message':
    case 'handoff':
      return 'bus';
    case 'iteration_start':
    case 'iteration_end':
      return 'iter';
    default:
      return 'all';
  }
}

export function DebugDrawer({ open, onClose, events }: DebugDrawerProps) {
  const [filter, setFilter] = useState<FilterKey>('all');

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    if (filter === 'all') return events;
    return events.filter((e) => eventCategory(e) === filter);
  }, [events, filter]);

  const counts = useMemo(() => {
    const c = { all: events.length, tool: 0, bus: 0, iter: 0 };
    for (const e of events) {
      const cat = eventCategory(e);
      if (cat !== 'all') c[cat]++;
    }
    return c;
  }, [events]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-stone-900/20 backdrop-blur-[2px]"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={cn(
          'fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-stone-200 bg-white shadow-2xl transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        aria-hidden={!open}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-stone-200 px-4">
          <div className="flex items-center gap-2">
            <Bug className="h-4 w-4 text-stone-600" />
            <div>
              <div className="text-sm font-semibold leading-tight">Debug stream</div>
              <div className="text-[11px] leading-tight text-stone-500">
                {events.length} event{events.length === 1 ? '' : 's'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-900"
            aria-label="Close debug drawer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex shrink-0 gap-1 border-b border-stone-200 px-3 py-2">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} count={counts.all}>
            <Activity className="h-3 w-3" /> All
          </FilterChip>
          <FilterChip active={filter === 'tool'} onClick={() => setFilter('tool')} count={counts.tool}>
            <Wrench className="h-3 w-3" /> Tools
          </FilterChip>
          <FilterChip active={filter === 'bus'} onClick={() => setFilter('bus')} count={counts.bus}>
            <MessageSquare className="h-3 w-3" /> Bus
          </FilterChip>
          <FilterChip active={filter === 'iter'} onClick={() => setFilter('iter')} count={counts.iter}>
            <ArrowRight className="h-3 w-3" /> Iter
          </FilterChip>
        </div>

        <div className="flex-1 overflow-y-auto [scrollbar-width:thin]">
          {filtered.length === 0 ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-stone-400">
              No events yet. Send a message to see live agent activity.
            </div>
          ) : (
            <ol className="divide-y divide-stone-100">
              {filtered.map((event, i) => (
                <EventCell key={i} event={event} index={i} />
              ))}
            </ol>
          )}
        </div>
      </aside>
    </>
  );
}

function FilterChip({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
        active
          ? 'border-stone-900 bg-stone-900 text-white'
          : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:text-stone-900',
      )}
    >
      {children}
      <span
        className={cn(
          'rounded-full px-1 text-[10px]',
          active ? 'bg-white/15' : 'bg-stone-100 text-stone-500',
        )}
      >
        {count}
      </span>
    </button>
  );
}

/**
 * The main free-text payload of an event, if any — bus/agent content, step
 * reasoning, a search query. Rendered as readable prose; the raw JSON stays
 * available separately. Returns null for purely structural events.
 */
function primaryText(event: AgentEvent): string | null {
  switch (event.type) {
    case 'bus_message':
      return event.content || null;
    case 'agent_step':
      return event.text || null;
    case 'workflow_complete':
      return event.mode === 'v1' ? event.result ?? null : null;
    case 'workflow_error':
      return event.error || null;
    case 'agent_plan':
      return event.steps.map((s, i) => `${i + 1}. ${s.agent} — ${s.task}`).join('\n');
    default:
      return null;
  }
}

function EventCell({ event, index }: { event: AgentEvent; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const meta = eventMeta(event);
  const text = primaryText(event);

  return (
    <li className="px-3 py-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-2 text-left"
      >
        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-stone-100 text-stone-500">
          <ChevronRight
            className={cn('h-3 w-3 transition-transform', expanded && 'rotate-90')}
          />
        </span>
        <span className="mt-0.5 inline-flex shrink-0 items-center justify-center rounded-md bg-stone-50 px-1 text-[10px] font-mono text-stone-400 tabular-nums">
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <span
              className={cn(
                'rounded-full border px-1.5 py-0.5 font-mono text-[10px]',
                meta.tone,
              )}
            >
              {meta.tag}
            </span>
            <span className="truncate text-stone-700">{meta.headline}</span>
          </span>
          {meta.subline && (
            <span className="mt-0.5 line-clamp-1 block text-[11px] text-stone-500">
              {meta.subline}
            </span>
          )}
        </span>
      </button>
      {expanded && (
        <div className="mt-2 ml-7 space-y-2">
          {text && (
            // Readable, wrapped, scrollable text block — long bus payloads no
            // longer become an unbroken wall. whitespace-pre-wrap keeps any
            // line structure the agent emitted.
            <div className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-[11px] leading-relaxed text-stone-700 [scrollbar-width:thin]">
              {text}
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className="text-[10px] font-medium text-stone-400 hover:text-stone-700"
          >
            {showRaw ? 'Hide raw event' : 'Show raw event'}
          </button>
          {showRaw && (
            <pre className="max-h-72 overflow-auto rounded-md bg-stone-950 px-3 py-2 text-[11px] leading-relaxed text-stone-100 [scrollbar-width:thin]">
              {JSON.stringify(event, null, 2)}
            </pre>
          )}
        </div>
      )}
    </li>
  );
}

function eventMeta(event: AgentEvent): {
  tag: string;
  tone: string;
  headline: string;
  subline?: string;
} {
  switch (event.type) {
    case 'workflow_start':
      return {
        tag: 'start',
        tone: 'border-stone-200 bg-stone-50 text-stone-600',
        headline: `${event.mode} · starting agent: ${event.startingAgent ?? '—'}`,
        subline: event.query,
      };
    case 'iteration_start':
      return {
        tag: `iter ${event.iteration}`,
        tone: 'border-blue-200 bg-blue-50 text-blue-700',
        headline: `${event.agent} started`,
      };
    case 'iteration_end':
      return {
        tag: `iter ${event.iteration}`,
        tone: 'border-blue-200 bg-blue-50 text-blue-700',
        headline: `${event.agent} · ${event.durationMs}ms · ${event.stepCount} steps`,
        subline: event.outputPreview,
      };
    case 'tool_call':
      return {
        tag: 'tool',
        tone: 'border-amber-200 bg-amber-50 text-amber-700',
        headline: `${event.agent} → ${event.toolName}`,
        subline: event.preview,
      };
    case 'bus_message':
      return {
        tag: event.messageType,
        tone:
          event.messageType === 'agent'
            ? 'border-purple-200 bg-purple-50 text-purple-700'
            : event.messageType === 'user'
              ? 'border-stone-300 bg-stone-100 text-stone-700'
              : 'border-stone-200 bg-stone-50 text-stone-500',
        headline: `${event.from} → ${event.to}`,
        subline: event.content,
      };
    case 'handoff':
      return {
        tag: 'handoff',
        tone: 'border-indigo-200 bg-indigo-50 text-indigo-700',
        headline: `${event.from} → ${event.to}`,
      };
    case 'workflow_complete':
      return {
        tag: 'done',
        tone: 'border-green-200 bg-green-50 text-green-700',
        headline:
          event.mode === 'v2'
            ? `complete · ${event.iterations ?? 0} iter · ${event.totalDuration ?? 0}ms`
            : 'complete',
        subline:
          event.mode === 'v1'
            ? event.result?.slice(0, 200)
            : event.agentResults?.map((r) => r.agent).join(', '),
      };
    case 'workflow_error':
      return {
        tag: 'error',
        tone: 'border-red-200 bg-red-50 text-red-700',
        headline: 'workflow error',
        subline: event.error,
      };
    case 'agent_plan':
      return {
        tag: 'plan',
        tone: 'border-amber-200 bg-amber-50 text-amber-700',
        headline: `${event.agent} planned ${event.steps.length} step(s)`,
        subline: event.steps.map((s) => s.agent).join(' → ') || event.intent,
      };
    case 'input_request':
      return {
        tag: 'input',
        tone: 'border-sky-200 bg-sky-50 text-sky-700',
        headline: `${event.agent} needs input`,
        subline: event.question,
      };
    case 'agent_step':
      return {
        tag: 'step',
        tone: 'border-stone-200 bg-white text-stone-600',
        headline: `${event.agent} · step ${event.stepIndex + 1}`,
        subline: event.text || (event.toolNames.length ? `→ ${event.toolNames.join(', ')}` : undefined),
      };
    case 'web_search':
      return {
        tag: 'search',
        tone: 'border-teal-200 bg-teal-50 text-teal-700',
        headline:
          event.status === 'start'
            ? `web search: ${event.query}`
            : `web search done · ${event.sources ?? 0} sources`,
        subline: event.status === 'start' ? undefined : event.query,
      };
    default: {
      // Exhaustiveness guard: if a new AgentEvent variant is added without a
      // case above, TS errors here on the `never` assignment.
      void (event satisfies never);
      return { tag: 'event', tone: 'border-stone-200 bg-stone-50 text-stone-600', headline: 'event' };
    }
  }
}
