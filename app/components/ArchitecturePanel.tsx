'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, ArrowLeftRight, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { MODES, type Mode } from '@/lib/modes';

/**
 * Slide-over panel (right side, like the debug drawer) hosting the architecture
 * diagram + how-it-works explanation for the current mode. Toggled from a header
 * button so it doesn't crowd the chat column.
 */
export function ArchitectureDrawer({
  mode,
  open,
  onClose,
}: {
  mode: Mode;
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-stone-900/20 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      )}
      <aside
        className={cn(
          'fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-stone-200 bg-white shadow-2xl transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        aria-hidden={!open}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-stone-200 px-4">
          <div className="text-sm font-semibold">Architecture</div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-900"
            aria-label="Close architecture panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 [scrollbar-width:thin]">
          {/* Borderless variant inside the drawer chrome. */}
          <ArchitecturePanel mode={mode} bare />
        </div>
      </aside>
    </>
  );
}

/**
 * Visual hierarchy + capability descriptions for the selected agentic system.
 * v1 (orchestrated) renders as a top-down coordinator → specialists tree;
 * v2 (choreographed) renders as peers on a shared bus. Demo-facing.
 *
 * When `collapsible`, the header becomes a toggle and the body (diagram +
 * agent list) expands/collapses. `defaultOpen` controls the initial state.
 */
export function ArchitecturePanel({
  mode,
  className,
  collapsible = false,
  defaultOpen = false,
  bare = false,
}: {
  mode: Mode;
  className?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** Drop the card chrome (border/bg) — for use inside the drawer. */
  bare?: boolean;
}) {
  const spec = MODES[mode];
  const [open, setOpen] = useState(collapsible ? defaultOpen : true);

  const header = (
    <div className="flex items-center gap-2">
      {collapsible && (
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-stone-400 transition-transform', !open && '-rotate-90')}
        />
      )}
      <spec.icon className="h-4 w-4 text-stone-600" />
      <h2 className="text-sm font-semibold text-stone-900">{spec.pattern} architecture</h2>
      <span className="ml-auto rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-500">
        {spec.label}
      </span>
    </div>
  );

  const pad = bare ? '' : 'px-5';
  return (
    <div className={cn(!bare && 'rounded-2xl border border-stone-200 bg-white', className)}>
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center px-5 py-4 text-left"
          aria-expanded={open}
        >
          {header}
        </button>
      ) : (
        <div className={cn(pad, bare ? '' : 'pt-5')}>{header}</div>
      )}

      {open && (
        <div className={cn(pad, bare ? 'pt-3' : 'pb-5', collapsible ? 'pt-0' : !bare && 'pt-1')}>
          <p className="mb-5 text-xs leading-relaxed text-stone-500">{spec.description}</p>

          {mode === 'v1' ? (
            <OrchestratedDiagram />
          ) : mode === 'v2' ? (
            <ChoreographedDiagram />
          ) : mode === 'v3' ? (
            <HierarchicalDiagram />
          ) : (
            <GenericDiagram mode={mode} />
          )}

          <div className="mt-5 border-t border-stone-100 pt-4">
            <SectionLabel>How it works</SectionLabel>
            <ol className="mt-1.5 space-y-1.5">
              {spec.howItWorks.map((step, i) => (
                <li key={i} className="flex gap-2 text-xs text-stone-600">
                  <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[9px] font-semibold text-stone-500">
                    {i + 1}
                  </span>
                  <span className="leading-snug">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-green-100 bg-green-50/50 p-2.5">
              <SectionLabel>When to use</SectionLabel>
              <p className="mt-1 text-[11px] leading-snug text-stone-600">{spec.whenToUse}</p>
            </div>
            <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-2.5">
              <SectionLabel>Trade-off</SectionLabel>
              <p className="mt-1 text-[11px] leading-snug text-stone-600">{spec.tradeoff}</p>
            </div>
          </div>

          <div className="mt-4 space-y-2 border-t border-stone-100 pt-4">
            <SectionLabel>Agents</SectionLabel>
            {spec.agents.map((a) => (
              <div key={a.id} className="flex items-baseline gap-2 text-xs">
                <span className="w-20 shrink-0 font-medium text-stone-800">{a.name}</span>
                <span className="text-stone-500">{a.role}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">{children}</div>
  );
}

function Node({ label, tone = 'specialist' }: { label: string; tone?: 'lead' | 'specialist' }) {
  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-1.5 text-center text-xs font-medium',
        tone === 'lead'
          ? 'border-stone-900 bg-stone-900 text-white'
          : 'border-stone-200 bg-stone-50 text-stone-700'
      )}
    >
      {label}
    </div>
  );
}

function OrchestratedDiagram() {
  const specialists = MODES.v1.agents.filter((a) => a.id !== 'coordinator');
  return (
    <div className="flex flex-col items-center gap-3">
      <Node label="Coordinator" tone="lead" />
      <ArrowRight className="h-4 w-4 rotate-90 text-stone-300" />
      <div className="flex flex-wrap items-center justify-center gap-2">
        {specialists.map((a, i) => (
          <div key={a.id} className="flex items-center gap-2">
            <Node label={a.name} />
            {i < specialists.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-stone-300" />}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-stone-400">delegated one at a time · results synthesized by the coordinator</p>
    </div>
  );
}

function ChoreographedDiagram() {
  const peers = MODES.v2.agents;
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {peers.map((a, i) => (
          <div key={a.id} className="flex items-center gap-2">
            <Node label={a.name} />
            {i < peers.length - 1 && <ArrowLeftRight className="h-3.5 w-3.5 text-stone-300" />}
          </div>
        ))}
      </div>
      <div className="w-full max-w-xs rounded-lg border border-dashed border-stone-300 bg-stone-50/60 py-1.5 text-center text-[10px] font-medium text-stone-500">
        shared message bus
      </div>
      <p className="text-[10px] text-stone-400">peers exchange specs directly · no central coordinator</p>
    </div>
  );
}

function HierarchicalDiagram() {
  return (
    <div className="flex flex-col items-center gap-2">
      <Node label="Lead" tone="lead" />
      <ArrowRight className="h-4 w-4 rotate-90 text-stone-300" />
      <div className="flex flex-wrap items-start justify-center gap-4">
        {['Research lead', 'Build lead'].map((sub) => (
          <div key={sub} className="flex flex-col items-center gap-1.5">
            <Node label={sub} />
            <ArrowRight className="h-3 w-3 rotate-90 text-stone-300" />
            <div className="flex gap-1">
              <Node label="sub" />
              <Node label="sub" />
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-stone-400">lead spawns sub-agents at runtime · children run in parallel · depth-capped</p>
    </div>
  );
}

/** Fallback diagram for modes without a bespoke layout (v4–v7): the mode's own
 *  agents as nodes plus its tagline. */
function GenericDiagram({ mode }: { mode: Mode }) {
  const spec = MODES[mode];
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {spec.agents.map((a, i) => (
          <div key={a.id} className="flex items-center gap-2">
            <Node label={a.name} tone={i === 0 ? 'lead' : 'specialist'} />
            {i < spec.agents.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-stone-300" />}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-stone-400">{spec.tagline}</p>
    </div>
  );
}
