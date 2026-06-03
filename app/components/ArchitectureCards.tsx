import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { MODE_LIST } from '@/lib/modes';

/**
 * The landing "architectures" grid. Each card links to its own page
 * (/architectures/<v>) for the full detail — how it works, agents, notes,
 * references, and a "Try this mode" CTA. Server component (no client state).
 */
export function ArchitectureCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {MODE_LIST.map((m) => (
        <Link
          key={m.value}
          href={`/architectures/${m.value}`}
          className="group flex flex-col rounded-2xl border border-stone-200 bg-white p-5 transition-colors hover:border-stone-300 hover:bg-stone-50"
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

          <span className="mt-4 inline-flex items-center gap-1 self-start text-[11px] font-medium text-stone-500 group-hover:text-stone-900">
            How it works <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      ))}
    </div>
  );
}
