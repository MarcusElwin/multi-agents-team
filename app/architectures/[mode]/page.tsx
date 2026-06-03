import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { MODES, MODE_LIST, type Mode } from '@/lib/modes';
import { ArchitecturePanel } from '@/app/components/ArchitecturePanel';

// Static params for all nine modes → these pages prerender.
export function generateStaticParams() {
  return MODE_LIST.map((m) => ({ mode: m.value }));
}

export async function generateMetadata({ params }: { params: Promise<{ mode: string }> }) {
  const { mode } = await params;
  const spec = MODES[mode as Mode];
  if (!spec) return { title: 'Architecture not found' };
  return {
    title: `${spec.pattern} — multi-agent architecture`,
    description: spec.description,
  };
}

export default async function ArchitecturePage({ params }: { params: Promise<{ mode: string }> }) {
  // Next 16: route params are async — must be awaited.
  const { mode } = await params;
  const spec = MODES[mode as Mode];
  if (!spec) notFound();

  // Prev/next for in-place navigation between architectures.
  const idx = MODE_LIST.findIndex((m) => m.value === spec.value);
  const prev = idx > 0 ? MODE_LIST[idx - 1] : null;
  const next = idx < MODE_LIST.length - 1 ? MODE_LIST[idx + 1] : null;

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-900 text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold">Multi-Agent Team</span>
        </Link>
        <Link href="/#patterns" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900">
          <ArrowLeft className="h-3.5 w-3.5" /> All architectures
        </Link>
      </header>

      <div className="mx-auto max-w-3xl px-6 pb-20">
        <div className="pt-6 pb-2">
          <div className="font-mono text-[11px] uppercase tracking-wide text-stone-400">{spec.value} · architecture</div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{spec.pattern}</h1>
          <p className="mt-3 text-stone-600">{spec.tagline}</p>
        </div>

        {/* The panel already renders the diagram, how-it-works, when-to-use,
            trade-off, agents, note, and references for this mode. */}
        <ArchitecturePanel mode={spec.value} className="mt-4" />

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/chat"
            className="inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800"
          >
            Try {spec.pattern} <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/references" className="text-sm text-stone-500 hover:text-stone-900">
            Reading list →
          </Link>
        </div>

        {/* Prev / next */}
        <nav className="mt-10 flex items-center justify-between border-t border-stone-200 pt-5 text-sm">
          {prev ? (
            <Link href={`/architectures/${prev.value}`} className="inline-flex items-center gap-1.5 text-stone-500 hover:text-stone-900">
              <ArrowLeft className="h-3.5 w-3.5" /> {prev.pattern}
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link href={`/architectures/${next.value}`} className="inline-flex items-center gap-1.5 text-stone-500 hover:text-stone-900">
              {next.pattern} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </div>

      <footer className="border-t border-stone-200 py-8 text-center text-xs text-stone-400">
        Made with <span className="text-red-400">♥</span> in Stockholm by{' '}
        <a href="https://umaitech.com" target="_blank" rel="noopener noreferrer" className="font-medium text-stone-500 hover:text-stone-900 hover:underline">
          Marcus Elwin @ UmaiTech
        </a>
      </footer>
    </main>
  );
}
