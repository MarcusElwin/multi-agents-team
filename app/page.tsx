import Link from 'next/link';
import { ArrowRight, Code2, KeyRound, Sparkles, Star, GitFork } from 'lucide-react';
import { ArchitectureCards } from './components/ArchitectureCards';
import { AgentFlow } from './components/AgentFlow';

export const metadata = {
  title: 'Multi-Agent Team — nine ways to coordinate LLM agents',
  description:
    'A hands-on playground for multi-agent AI architectures: orchestrated, choreographed, hierarchical, evaluator–optimizer, debate, blackboard, and market. Bring your own API key.',
};

const BYO_ONLY = process.env.NEXT_PUBLIC_BYO_KEY_ONLY === 'true';
const REPO_URL = 'https://github.com/MarcusElwin/multi-agents-team';

/** Live star/fork counts from the GitHub API (cached 1h). Null on failure. */
async function getRepoStats(): Promise<{ stars: number; forks: number } | null> {
  try {
    const res = await fetch('https://api.github.com/repos/MarcusElwin/multi-agents-team', {
      headers: { Accept: 'application/vnd.github+json' },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { stars: data.stargazers_count ?? 0, forks: data.forks_count ?? 0 };
  } catch {
    return null;
  }
}

export default async function Landing() {
  const stats = await getRepoStats();

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      {/* Top bar */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5 xl:max-w-6xl 2xl:max-w-7xl">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-900 text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold">Multi-Agent Team</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/about" className="hidden text-sm text-stone-500 hover:text-stone-900 sm:inline">
            About
          </Link>
          <Link href="/references" className="hidden text-sm text-stone-500 hover:text-stone-900 sm:inline">
            References
          </Link>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-600 hover:border-stone-300 hover:text-stone-900"
            aria-label="GitHub"
          >
            <Code2 className="h-4 w-4" /> <span className="hidden sm:inline">GitHub</span>
            {stats && (stats.stars > 0 || stats.forks > 0) && (
              <span className="flex items-center gap-2 border-l border-stone-200 pl-2 text-stone-500">
                {stats.stars > 0 && (
                  <span className="inline-flex items-center gap-0.5 tabular-nums">
                    <Star className="h-3.5 w-3.5" /> {stats.stars}
                  </span>
                )}
                {stats.forks > 0 && (
                  <span className="inline-flex items-center gap-0.5 tabular-nums">
                    <GitFork className="h-3.5 w-3.5" /> {stats.forks}
                  </span>
                )}
              </span>
            )}
          </a>
          <Link
            href="/chat"
            className="inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-stone-800"
          >
            Open the app <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-6 pt-16 pb-12 text-center">
        <p className="mb-4 inline-block rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-500">
          Built on the Vercel AI SDK
        </p>
        <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Nine ways to make AI agents work as a team
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-balance text-lg leading-relaxed text-stone-600">
          The same request, solved by nine different multi-agent architectures — from a single
          coordinator delegating to specialists, to peers negotiating on a bus, to a market where
          agents bid for work. Watch them think, stream live, and see what each pattern costs.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/chat"
            className="inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800"
          >
            Try it now <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="#patterns"
            className="rounded-full border border-stone-300 px-5 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100"
          >
            See the patterns
          </a>
        </div>
        {BYO_ONLY && (
          <p className="mx-auto mt-6 inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <KeyRound className="h-3.5 w-3.5 text-amber-600" />
            This is a public demo — bring your own OpenAI or Anthropic API key in Settings to run it.
          </p>
        )}
      </section>

      {/* How it works — animated flow (leads, before the About text) */}
      <section className="mx-auto max-w-5xl px-6 pb-14">
        <h2 className="mb-2 text-center text-2xl font-semibold tracking-tight">How a team handles one request</h2>
        <p className="mb-6 text-center text-sm text-stone-500">
          The same job, coordinated four different ways. Pick a pattern — or watch them cycle.
        </p>
        <AgentFlow />
      </section>

      {/* Patterns */}
      <section id="patterns" className="mx-auto max-w-5xl px-6 pb-16 xl:max-w-6xl 2xl:max-w-7xl">
        <h2 className="mb-2 text-center text-2xl font-semibold tracking-tight">The nine architectures</h2>
        <p className="mb-6 text-center text-sm text-stone-500">Open any architecture for how it works, the agents, notes, and references.</p>
        <ArchitectureCards />
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-3xl px-6 pb-24 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Pick a pattern and watch it run</h2>
        <p className="mx-auto mt-3 max-w-xl text-stone-600">
          Switch architectures from a dropdown, stream the agents’ reasoning live, and see the cost
          of every step.
        </p>
        <Link
          href="/chat"
          className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-stone-800"
        >
          Launch the app <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      <footer className="border-t border-stone-200 py-8 text-center text-xs text-stone-400">
        Made with <span className="text-red-400">♥</span> in Stockholm by{' '}
        <a
          href="https://umai-tech.com"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-stone-500 underline-offset-2 hover:text-stone-900 hover:underline"
        >
          Marcus Elwin @ UmaiTech
        </a>
        {' · '}MIT
      </footer>
    </main>
  );
}
