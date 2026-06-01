'use client';

import { useState } from 'react';
import { ArrowRight, ArrowLeftRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { MODES, type Mode } from '@/lib/modes';

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
}: {
  mode: Mode;
  className?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
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

  return (
    <div className={cn('rounded-2xl border border-stone-200 bg-white', className)}>
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
        <div className="px-5 pt-5">{header}</div>
      )}

      {open && (
        <div className={cn('px-5 pb-5', collapsible ? 'pt-0' : 'pt-1')}>
          <p className="mb-5 text-xs leading-relaxed text-stone-500">{spec.description}</p>

          {mode === 'v1' ? <OrchestratedDiagram /> : <ChoreographedDiagram />}

          <div className="mt-5 space-y-2 border-t border-stone-100 pt-4">
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
