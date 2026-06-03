import Link from 'next/link';
import { ArrowLeft, ArrowRight, Code2, Sparkles } from 'lucide-react';

const REPO_URL = 'https://github.com/MarcusElwin/multi-agents-team';

export const metadata = {
  title: 'About — Multi-Agent Team',
  description:
    'Why this exists: a living reference for multi-agent AI coordination patterns — run the same task through each architecture, watch it think, and compare cost.',
};

export default function AboutPage() {
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
          <Link href="/references" className="text-sm text-stone-500 hover:text-stone-900">
            References
          </Link>
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 pt-10 pb-8 text-center">
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">About this project</h1>
        <p className="mx-auto mt-4 max-w-xl text-stone-600">
          A hands-on, runnable reference for the many ways to coordinate LLM agents.
        </p>
      </section>

      <div className="mx-auto max-w-3xl space-y-6 px-6 pb-20">
        <div className="rounded-2xl border border-stone-200 bg-white p-6 sm:p-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400">What it is</h2>
          <p className="mt-3 leading-relaxed text-stone-600">
            “Multi-agent” gets used as one word, but there are many distinct ways to coordinate
            agents — and they behave very differently. This is a place to <em>feel</em> the
            differences: run the same task through each architecture, watch the live agent timeline,
            inspect every tool call and message in the debug stream, and compare cost. It’s a
            teaching tool and a reference implementation in one.
          </p>
          <p className="mt-4 leading-relaxed text-stone-600">
            Agentic AI moves fast — new patterns, frameworks, and papers land every week. The goal
            here is a <strong>living reference</strong>: a single place to learn the coordination
            patterns by running them, with the research and source for each one a click away.
          </p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-6 sm:p-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400">How to use it</h2>
          <ol className="mt-3 space-y-2 text-stone-600">
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[11px] font-medium text-stone-500">1</span>
              Open the app, pick an architecture (v1–v9), and a model from any of the four providers.
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[11px] font-medium text-stone-500">2</span>
              Send a task and watch the agents reason, call tools, and message each other live.
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[11px] font-medium text-stone-500">3</span>
              Run the <em>same</em> task through a different pattern and compare the result, the path, and the cost.
            </li>
          </ol>
          <p className="mt-4 text-sm text-stone-500">
            It’s a public demo — bring your own OpenAI, Anthropic, Mistral, or Fireworks key in
            Settings. Keys stay in your browser and are never stored on the server.
          </p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-stone-50/60 p-6 sm:p-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400">Contributions welcome</h2>
          <p className="mt-3 leading-relaxed text-stone-600">
            Know a pattern, paper, or framework that belongs here? Add it — open a PR with a new
            architecture or a reference, or file an issue. The patterns are data-driven, so adding
            one is mostly a new runner + a mode entry.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <a
              href={`${REPO_URL}/blob/main/CONTRIBUTING.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-4 py-1.5 font-medium text-white hover:bg-stone-800"
            >
              <Code2 className="h-3.5 w-3.5" /> Contribute
            </a>
            <a
              href={`${REPO_URL}/issues`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-4 py-1.5 text-stone-700 hover:border-stone-300"
            >
              Open issues
            </a>
            <Link href="/references" className="inline-flex items-center gap-1.5 px-2 py-1.5 text-stone-500 hover:text-stone-900">
              Reading list →
            </Link>
          </div>
        </div>

        <div className="flex justify-center pt-2">
          <Link
            href="/chat"
            className="inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800"
          >
            Try it now <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
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
