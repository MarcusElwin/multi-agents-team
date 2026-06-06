import Link from 'next/link';
import { ArrowLeft, ArrowRight, Cpu, Network, Check, Sparkles } from 'lucide-react';
import { ArticleAnalytics } from '@/app/components/ArticleAnalytics';

const REPO_URL = 'https://github.com/MarcusElwin/multi-agents-team';
const ISSUE_URL = `${REPO_URL}/issues/10`;

export const metadata = {
  title: 'Harness — original vs the iii refactor',
  description:
    'A side-by-side comparison of this project\'s original hand-rolled agent harness and the iii refactor: what a harness does, how each handles the ~dozen jobs, and the trade-offs.',
};

/** The jobs a production agent harness does, and how each backend handles them. */
const COMPARISON: Array<{ job: string; original: string; iii: string }> = [
  {
    job: 'Turn / workflow FSM',
    original: 'Hand-rolled orchestrator + per-pattern runners in lib/ (~1,900 lines)',
    iii: 'Same runners, but run inside a worker on the engine bus; optionally queue-backed so a turn outlives the request',
  },
  {
    job: 'Provider streaming',
    original: 'Vercel AI SDK, in-process',
    iii: 'Kept — the same AI SDK runners run inside the worker',
  },
  {
    job: 'Events → UI',
    original: 'SSE from the Next route',
    iii: 'Live SSE streamed over a channel (the HTTP response itself)',
  },
  {
    job: 'Tool calling',
    original: 'AI SDK tool() + zod',
    iii: 'Same tools, gated by a policy check before they run',
  },
  {
    job: 'Policy / permissions',
    original: 'None — every tool runs unchecked',
    iii: 'policy::check_permissions + iii-permissions.yaml, fail-closed',
  },
  {
    job: 'Cost / budget',
    original: 'Estimate only (lib/models.ts); nothing stops a run',
    iii: 'llm-budget worker — real caps, alerts, forecasts',
  },
  {
    job: 'Sessions / history',
    original: 'Browser localStorage only',
    iii: 'iii-state — server-side, keyed by conversation',
  },
  {
    job: 'Human-in-the-loop',
    original: 'In-memory map, single-process, 5-min timeout',
    iii: 'Durable via the queue + state (survives restarts)',
  },
  {
    job: 'Observability',
    original: 'Terminal logging (chalk / boxen)',
    iii: 'OpenTelemetry spans per worker, automatically',
  },
  {
    job: 'Deploy surface',
    original: 'One Next.js app — zero extra services',
    iii: 'Next app + the iii engine (a separate process, e.g. on Fly)',
  },
];

function Pros({ items }: { items: string[] }) {
  return (
    <ul className="mt-4 space-y-2">
      {items.map((it) => (
        <li key={it} className="flex gap-2 text-sm leading-relaxed text-stone-600">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

export default function HarnessPage() {
  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <ArticleAnalytics article="harness" title="Harness — original vs iii" />

      <header className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-900 text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold">Multi-Agent Team</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/about" className="text-sm text-stone-500 hover:text-stone-900">
            About
          </Link>
          <Link href="/references" className="text-sm text-stone-500 hover:text-stone-900">
            References
          </Link>
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 pt-10 pb-8 text-center">
        <p className="mb-4 inline-block rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-500">
          Two backends, one app
        </p>
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          The harness: original vs the iii refactor
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-stone-600">
          A “harness” is everything around the model that turns a chat into an agent run — the turn
          loop, tool calls, streaming, sessions, policy, budget, and tracing. This app ships two of
          them, switchable per run from the chat UI.
        </p>
      </section>

      <div className="mx-auto max-w-4xl space-y-6 px-6 pb-20">
        {/* Side-by-side */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-stone-200 bg-white p-6">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-100">
                <Cpu className="h-4 w-4 text-stone-600" />
              </span>
              <h2 className="text-base font-semibold">Original — in-app harness</h2>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-stone-600">
              The default. Orchestration, the message bus, and tools all run in-process in the
              Next.js app over the Vercel AI SDK — hand-rolled across <code>lib/</code>.
            </p>
            <Pros
              items={[
                'Zero extra services — works out of the box',
                'The nine patterns live in readable code you can step through',
                'Perfect for a demo, learning, and local dev',
                'No policy, no real budget caps, sessions in localStorage',
              ]}
            />
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-6">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-100">
                <Network className="h-4 w-4 text-stone-600" />
              </span>
              <h2 className="text-base font-semibold">Refactor — iii engine</h2>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-stone-600">
              The same runners, moved behind{' '}
              <a href="https://github.com/iii-hq/iii" target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
                iii
              </a>{' '}
              — an engine exposing a bus of swappable workers (functions, triggers, channels,
              streams) for the cross-cutting harness jobs.
            </p>
            <Pros
              items={[
                'A real policy layer + budget caps the original lacks',
                'Server-side sessions and OpenTelemetry tracing',
                'Durable runs (queue) and live events over a channel',
                'Cost: a separate engine process to run and operate',
              ]}
            />
          </div>
        </div>

        {/* Comparison table */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 sm:p-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400">
            Job by job
          </h2>
          <div className="mt-4 overflow-x-auto [scrollbar-width:thin]">
            <table className="w-full min-w-[44rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-[11px] uppercase tracking-wide text-stone-400">
                  <th className="py-2 pr-4 font-semibold">Harness job</th>
                  <th className="px-4 py-2 font-semibold">
                    <span className="inline-flex items-center gap-1.5"><Cpu className="h-3.5 w-3.5" /> Original</span>
                  </th>
                  <th className="pl-4 py-2 font-semibold">
                    <span className="inline-flex items-center gap-1.5"><Network className="h-3.5 w-3.5" /> iii refactor</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.job} className="border-b border-stone-100 align-top last:border-0">
                    <td className="py-3 pr-4 font-medium text-stone-800">{row.job}</td>
                    <td className="px-4 py-3 text-stone-600">{row.original}</td>
                    <td className="pl-4 py-3 text-stone-600">{row.iii}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* The toggle */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 sm:p-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400">
            How the toggle works
          </h2>
          <p className="mt-3 leading-relaxed text-stone-600">
            Every run targets a backend, picked from a selector next to the model and mode dropdowns
            (with a global default in Settings). The choice is threaded through the request and the
            API route, which dispatches to the in-app runners or hands the turn to the iii engine.
            The <strong>in-app harness is the default</strong> and is fully self-contained; the iii
            path activates only when an engine is configured. Same UI, same nine patterns, either
            way.
          </p>
        </div>

        {/* iii primitives */}
        <div className="rounded-2xl border border-stone-200 bg-stone-50/60 p-6 sm:p-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400">
            The refactor in iii&apos;s terms
          </h2>
          <p className="mt-3 leading-relaxed text-stone-600">
            The iii backend uses all four engine primitives:{' '}
            <strong>functions</strong> (the turn, plus state / stream / policy calls),{' '}
            <strong>triggers</strong> (an HTTP endpoint and a durable queue),{' '}
            <strong>channels</strong> (live events stream over the HTTP response; large artifacts
            hand off worker-to-worker), and <strong>streams</strong> (an optional named event log
            for persistence and fan-out).
          </p>
          <p className="mt-4 text-sm text-stone-500">
            It&apos;s a phased migration — see{' '}
            <a href={ISSUE_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-stone-600 underline-offset-2 hover:text-stone-900 hover:underline">
              issue #10
            </a>{' '}
            for the plan and the full mapping of hand-rolled pieces to iii workers.
          </p>
        </div>

        {/* Which to use */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 sm:p-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400">
            Which should you use?
          </h2>
          <p className="mt-3 leading-relaxed text-stone-600">
            For a self-contained demo, learning the patterns, or running locally, the{' '}
            <strong>original in-app harness</strong> wins — nothing to operate, and the coordination
            logic is right there in the source. Reach for the <strong>iii engine</strong> when you
            want the production properties it adds for free: a policy layer, real budget caps,
            durable server-side sessions, and tracing — accepting a second runtime to run.
          </p>
        </div>

        <div className="flex justify-center pt-2">
          <Link
            href="/chat"
            className="inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800"
          >
            Try both in the app <ArrowRight className="h-4 w-4" />
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
