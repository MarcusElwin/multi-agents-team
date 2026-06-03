import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Sparkles, FileText } from 'lucide-react';
import { REFERENCE_SECTIONS, type RefType, logoFor, DARK_LOGOS } from '@/lib/references';
import { MODE_LIST } from '@/lib/modes';
import { ExportReport } from '@/app/components/ExportReport';

/** A source logo (local SVG) in a tile — dark tile for white-art logos. */
function SourceLogo({ source, url }: { source: string; url: string }) {
  const slug = logoFor(source, url);
  const dark = slug ? DARK_LOGOS.has(slug) : false;
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border ${
        dark ? 'border-stone-800 bg-stone-900' : 'border-stone-200 bg-stone-50'
      }`}
    >
      {slug ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/logos/${slug}.svg`} alt="" className="h-5 w-5 object-contain" />
      ) : (
        <FileText className="h-4 w-4 text-stone-400" />
      )}
    </span>
  );
}

export const metadata = {
  title: 'References — multi-agent systems reading list',
  description:
    'A curated reading list on multi-agent AI systems: foundational papers, frameworks, and posts on orchestration, debate, blackboard, market, swarm, and more.',
};

const TYPE_TONE: Record<RefType, string> = {
  Paper: 'border-violet-200 bg-violet-50 text-violet-700',
  Post: 'border-sky-200 bg-sky-50 text-sky-700',
  Docs: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  Talk: 'border-amber-200 bg-amber-50 text-amber-700',
  Repo: 'border-stone-300 bg-stone-100 text-stone-700',
};

function RefRow({
  title,
  source,
  url,
  type,
  note,
}: {
  title: string;
  source: string;
  url: string;
  type: RefType;
  note?: string;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 transition-colors hover:border-stone-300 hover:bg-stone-50"
    >
      <SourceLogo source={source} url={url} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-stone-900 group-hover:underline">{title}</span>
          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${TYPE_TONE[type]}`}>{type}</span>
        </div>
        <div className="mt-0.5 text-[11px] text-stone-400">{source}</div>
        {note && <p className="mt-1 text-[12px] leading-snug text-stone-500">{note}</p>}
      </div>
      <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-stone-300 transition-colors group-hover:text-stone-600" />
    </a>
  );
}

export default function ReferencesPage() {
  // Per-pattern references pulled from the mode specs (deduped within a mode).
  const patternRefs = MODE_LIST.filter((m) => m.references && m.references.length > 0);

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-900 text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold">Multi-Agent Team</span>
        </Link>
        <div className="flex items-center gap-3">
          <ExportReport />
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 pt-10 pb-8 text-center">
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Multi-agent systems — a reading list
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-stone-600">
          The papers, framework docs, and posts behind the nine architectures in this project.
          A starting point for going deeper.
        </p>
      </section>

      <div className="mx-auto max-w-3xl space-y-10 px-6 pb-20">
        {REFERENCE_SECTIONS.map((section) => (
          <section key={section.heading}>
            <h2 className="text-lg font-semibold tracking-tight">{section.heading}</h2>
            {section.blurb && <p className="mt-1 text-sm text-stone-500">{section.blurb}</p>}
            <div className="mt-3 space-y-2">
              {section.items.map((item) => (
                <RefRow key={item.url} {...item} />
              ))}
            </div>
          </section>
        ))}

        {/* By pattern — sourced from the mode specs */}
        <section>
          <h2 className="text-lg font-semibold tracking-tight">By pattern</h2>
          <p className="mt-1 text-sm text-stone-500">The references attached to each architecture in the app.</p>
          <div className="mt-3 space-y-4">
            {patternRefs.map((m) => (
              <div key={m.value} className="rounded-xl border border-stone-200 bg-white p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-stone-200 bg-stone-50 text-stone-700">
                    <m.icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-sm font-semibold">{m.pattern}</span>
                  <span className="font-mono text-[10px] uppercase tracking-wide text-stone-400">{m.value}</span>
                </div>
                <div className="space-y-1.5">
                  {m.references!.map((r) => (
                    <a
                      key={r.url}
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-1.5 text-[13px] text-stone-500 hover:text-stone-900"
                    >
                      <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {r.label}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <footer className="border-t border-stone-200 py-8 text-center text-xs text-stone-400">
        Made with <span className="text-red-400">♥</span> in Stockholm by{' '}
        <a href="https://umai-tech.com" target="_blank" rel="noopener noreferrer" className="font-medium text-stone-500 hover:text-stone-900 hover:underline">
          Marcus Elwin @ UmaiTech
        </a>
      </footer>
    </main>
  );
}
