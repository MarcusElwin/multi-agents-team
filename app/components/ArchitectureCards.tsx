'use client';

import { useState } from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { MODE_LIST } from '@/lib/modes';

/**
 * The landing "architectures" grid. Each card expands in place to reveal the
 * how-it-works steps, agents, the author's note, and references — so the
 * landing can go deep without a separate page. Client component (the expand
 * state) embedded in the server-rendered landing.
 */
export function ArchitectureCards() {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {MODE_LIST.map((m) => {
        const expanded = open === m.value;
        return (
          <div
            key={m.value}
            className={cn(
              'flex flex-col rounded-2xl border bg-white p-5 transition-colors',
              expanded ? 'border-stone-400 lg:col-span-1' : 'border-stone-200',
            )}
          >
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 bg-stone-50 text-stone-700">
                <m.icon className="h-4 w-4" />
              </span>
              <div>
                <div className="text-sm font-semibold text-stone-900">{m.pattern}</div>
                <div className="font-mono text-[10px] uppercase tracking-wide text-stone-400">{m.value}</div>
              </div>
            </div>

            <p className="mt-3 text-sm leading-snug text-stone-600">{m.tagline}</p>

            <div className="mt-3 space-y-1.5 text-[12px] leading-snug">
              <p className="text-stone-500"><span className="font-medium text-stone-700">Best for:</span> {m.whenToUse}</p>
              <p className="text-stone-400"><span className="font-medium text-stone-500">Trade-off:</span> {m.tradeoff}</p>
            </div>

            {expanded && (
              <div className="mt-4 space-y-4 border-t border-stone-100 pt-4 text-[12px]">
                <div>
                  <SectionLabel>How it works</SectionLabel>
                  <ol className="mt-1.5 space-y-1.5">
                    {m.howItWorks.map((step, i) => (
                      <li key={i} className="flex gap-2 text-stone-600">
                        <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[9px] font-semibold text-stone-500">
                          {i + 1}
                        </span>
                        <span className="leading-snug">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
                <div>
                  <SectionLabel>Agents</SectionLabel>
                  <div className="mt-1.5 space-y-1">
                    {m.agents.map((a) => (
                      <div key={a.id} className="flex items-baseline gap-2">
                        <span className="w-20 shrink-0 font-medium text-stone-800">{a.name}</span>
                        <span className="text-stone-500">{a.role}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {m.note && (
                  <div className="rounded-lg border border-stone-200 bg-stone-50/60 p-2.5">
                    <SectionLabel>Note</SectionLabel>
                    <p className="mt-1 leading-relaxed text-stone-600">{m.note}</p>
                  </div>
                )}
                {m.references && m.references.length > 0 && (
                  <div>
                    <SectionLabel>References</SectionLabel>
                    <div className="mt-1.5 space-y-1.5">
                      {m.references.map((r) => (
                        <a
                          key={r.url}
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start gap-1.5 text-stone-500 hover:text-stone-900"
                        >
                          <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
                          {r.label}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => setOpen(expanded ? null : m.value)}
              className="mt-4 inline-flex items-center gap-1 self-start text-[11px] font-medium text-stone-500 hover:text-stone-900"
              aria-expanded={expanded}
            >
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
              {expanded ? 'Less' : 'How it works'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">{children}</div>;
}
