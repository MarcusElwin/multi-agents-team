'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * AgentFlow — a looping animation that previews how different multi-agent
 * architectures coordinate. It auto-rotates through four visually-distinct
 * patterns (each representing a family), and a row of tabs lets the visitor jump
 * to one. Animations are pure CSS keyframes scoped under `.agentflow`; only the
 * active panel animates (keyed off `data-active`). Respects prefers-reduced-motion
 * (panels render as calm static diagrams and auto-rotation is paused).
 */

type PatternKey = 'orchestrated' | 'debate' | 'evaluator' | 'swarm';

const PATTERNS: { key: PatternKey; tab: string; modes: string; caption: string }[] = [
  { key: 'orchestrated', tab: 'Orchestrated', modes: 'v1 · v3', caption: 'A coordinator plans, delegates to specialists, and synthesizes the result.' },
  { key: 'debate', tab: 'Debate', modes: 'v5', caption: 'Two sides argue opposing cases; a judge weighs them and rules.' },
  { key: 'evaluator', tab: 'Evaluator', modes: 'v4', caption: 'A generator drafts; a critic scores and sends it back — until it passes.' },
  { key: 'swarm', tab: 'Swarm', modes: 'v8 · v9', caption: 'Many agents work in parallel; their contributions converge into one answer.' },
];

const ROTATE_MS = 7000;

export function AgentFlow() {
  const [active, setActive] = useState<PatternKey>('orchestrated');
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Don't auto-rotate if the user prefers reduced motion.
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || paused) return;
    timer.current = setInterval(() => {
      setActive((cur) => {
        const i = PATTERNS.findIndex((p) => p.key === cur);
        return PATTERNS[(i + 1) % PATTERNS.length].key;
      });
    }, ROTATE_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [paused, active]);

  const current = PATTERNS.find((p) => p.key === active)!;

  return (
    <div
      className="agentflow mx-auto max-w-3xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Tabs */}
      <div className="mb-4 flex flex-wrap justify-center gap-1.5" role="tablist" aria-label="Architecture patterns">
        {PATTERNS.map((p) => {
          const on = p.key === active;
          return (
            <button
              key={p.key}
              role="tab"
              aria-selected={on}
              onClick={() => setActive(p.key)}
              className={
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ' +
                (on ? 'bg-stone-900 text-white' : 'border border-stone-200 text-stone-500 hover:border-stone-300 hover:text-stone-800')
              }
            >
              {p.tab}
              <span className={on ? 'text-stone-400' : 'text-stone-300'}>{p.modes}</span>
            </button>
          );
        })}
      </div>

      {/* Panel */}
      <div className="rounded-2xl border border-stone-200 bg-white p-6 sm:p-9">
        {active === 'orchestrated' && <Orchestrated />}
        {active === 'debate' && <Debate />}
        {active === 'evaluator' && <Evaluator />}
        {active === 'swarm' && <Swarm />}
      </div>

      <p className="mt-3 text-center text-xs text-stone-400">{current.caption}</p>
    </div>
  );
}

/* ── Shared bits ─────────────────────────────────────────────────────────── */

function Query({ text }: { text: string }) {
  return (
    <div className="flex justify-center">
      <span className="af-query inline-flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-3.5 py-1.5 text-xs font-medium text-stone-600">
        <span className="af-cursor h-3.5 w-px bg-stone-400" aria-hidden />“{text}”
      </span>
    </div>
  );
}

function VWire() {
  return (
    <div className="af-wire relative mx-auto my-1 h-7 w-px" aria-hidden>
      <span className="absolute inset-0 bg-stone-200" />
      <span className="af-wire-pulse absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-stone-900" />
    </div>
  );
}

function Answer({ label }: { label: string }) {
  return (
    <div className="flex justify-center">
      <div className="af-node af-answer flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
        <svg className="h-4 w-4 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <span className="text-sm font-medium text-emerald-900">{label}</span>
      </div>
    </div>
  );
}

/* ── 1 · Orchestrated (fan-out to specialists) ──────────────────────────────── */

function Orchestrated() {
  const agents = [
    { label: 'Researcher', sub: 'searches the web' },
    { label: 'Writer', sub: 'drafts the piece' },
    { label: 'Editor', sub: 'polishes & checks' },
  ];
  return (
    <div data-active>
      <Query text="Research the state of multi-agent AI and write a brief." />
      <VWire />
      <div className="flex justify-center">
        <div className="af-node af-coordinator flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
          <span className="af-dot h-2.5 w-2.5 rounded-full bg-stone-900" aria-hidden />
          <div className="text-left">
            <div className="text-sm font-semibold text-stone-900">Coordinator</div>
            <div className="text-[11px] text-stone-500">plans &amp; delegates</div>
          </div>
        </div>
      </div>
      <div className="relative mx-auto mt-1 h-7 w-full" aria-hidden>
        <svg viewBox="0 0 300 28" className="h-full w-full" preserveAspectRatio="none">
          <path className="af-branch" d="M150 0 V12 H50 V28" />
          <path className="af-branch" d="M150 0 V28" />
          <path className="af-branch" d="M150 0 V12 H250 V28" />
          <path className="af-flow af-flow-1" d="M150 0 V12 H50 V28" pathLength={100} />
          <path className="af-flow af-flow-2" d="M150 0 V28" pathLength={100} />
          <path className="af-flow af-flow-3" d="M150 0 V12 H250 V28" pathLength={100} />
        </svg>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {agents.map((a, i) => (
          <div key={a.label} className={`af-node af-agent af-agent-${i + 1} rounded-xl border border-stone-200 bg-white px-3 py-3 text-center`}>
            <div className="mx-auto mb-2 flex h-1.5 w-10 overflow-hidden rounded-full bg-stone-100">
              <span className="af-bar h-full w-1/3 rounded-full bg-stone-900" />
            </div>
            <div className="text-sm font-semibold text-stone-900">{a.label}</div>
            <div className="text-[11px] text-stone-500">{a.sub}</div>
          </div>
        ))}
      </div>
      <div className="relative mx-auto h-7 w-full" aria-hidden>
        <svg viewBox="0 0 300 28" className="h-full w-full" preserveAspectRatio="none">
          <path className="af-branch" d="M50 0 V16 H150 V28" />
          <path className="af-branch" d="M150 0 V28" />
          <path className="af-branch" d="M250 0 V16 H150 V28" />
        </svg>
      </div>
      <Answer label="Synthesized brief" />
    </div>
  );
}

/* ── 2 · Debate (two sides → judge) ─────────────────────────────────────────── */

function Debate() {
  return (
    <div data-active>
      <Query text="Should small teams build agents or buy a platform?" />
      <VWire />
      <div className="grid grid-cols-2 gap-3">
        <div className="af-node af-side af-side-1 rounded-xl border border-stone-200 bg-white px-3 py-3 text-center">
          <div className="text-[11px] font-medium uppercase tracking-wide text-stone-400">Affirmative</div>
          <div className="mt-0.5 text-sm font-semibold text-stone-900">argues “build”</div>
        </div>
        <div className="af-node af-side af-side-2 rounded-xl border border-stone-200 bg-white px-3 py-3 text-center">
          <div className="text-[11px] font-medium uppercase tracking-wide text-stone-400">Opposing</div>
          <div className="mt-0.5 text-sm font-semibold text-stone-900">argues “buy”</div>
        </div>
      </div>
      <div className="relative mx-auto h-9 w-full max-w-xs" aria-hidden>
        <svg viewBox="0 0 200 36" className="h-full w-full" preserveAspectRatio="none">
          {/* back-and-forth arrows between the two sides */}
          <path className="af-volley af-volley-1" d="M60 10 H140" pathLength={100} />
          <path className="af-volley af-volley-2" d="M140 24 H60" pathLength={100} />
        </svg>
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-medium text-stone-400">3 rounds</span>
      </div>
      <div className="flex justify-center">
        <div className="af-node af-judge flex items-center gap-2.5 rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
          <span className="af-dot h-2.5 w-2.5 rounded-full bg-stone-900" aria-hidden />
          <div className="text-left">
            <div className="text-sm font-semibold text-stone-900">Judge</div>
            <div className="text-[11px] text-stone-500">weighs both, rules</div>
          </div>
        </div>
      </div>
      <VWire />
      <Answer label="Reasoned verdict" />
    </div>
  );
}

/* ── 3 · Evaluator–Optimizer (generate ⇄ critique loop) ─────────────────────── */

function Evaluator() {
  return (
    <div data-active>
      <Query text="Write a tight product launch announcement." />
      <VWire />
      <div className="relative grid grid-cols-2 items-center gap-6">
        <div className="af-node af-gen rounded-xl border border-stone-200 bg-white px-3 py-3 text-center">
          <div className="mx-auto mb-2 flex h-1.5 w-10 overflow-hidden rounded-full bg-stone-100">
            <span className="af-bar h-full w-1/3 rounded-full bg-stone-900" />
          </div>
          <div className="text-sm font-semibold text-stone-900">Generator</div>
          <div className="text-[11px] text-stone-500">writes a draft</div>
        </div>
        <div className="af-node af-critic rounded-xl border border-stone-200 bg-white px-3 py-3 text-center">
          <div className="text-sm font-semibold text-stone-900">Critic</div>
          <div className="text-[11px] text-stone-500">scores 0–10</div>
        </div>
        {/* loop arrows between the two */}
        <svg viewBox="0 0 220 60" className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden>
          <path className="af-loop af-loop-1" d="M95 16 H125" pathLength={100} />
          <path className="af-loop af-loop-2" d="M125 44 H95" pathLength={100} />
        </svg>
      </div>
      <div className="af-verdict mt-3 text-center text-[11px] font-medium text-stone-400">revise · revise · score ≥ 8 ✓</div>
      <VWire />
      <Answer label="Polished draft" />
    </div>
  );
}

/* ── 4 · Swarm / parallel (N agents → converge) ─────────────────────────────── */

function Swarm() {
  return (
    <div data-active>
      <Query text="Brainstorm names for an agent-orchestration tool." />
      <div className="relative mx-auto mt-1 h-7 w-full" aria-hidden>
        <svg viewBox="0 0 300 28" className="h-full w-full" preserveAspectRatio="none">
          <path className="af-branch" d="M150 0 V10 H38 V28" />
          <path className="af-branch" d="M150 0 V10 H113 V28" />
          <path className="af-branch" d="M150 0 V10 H188 V28" />
          <path className="af-branch" d="M150 0 V10 H262 V28" />
          <path className="af-flow af-flow-1" d="M150 0 V10 H38 V28" pathLength={100} />
          <path className="af-flow af-flow-2" d="M150 0 V10 H113 V28" pathLength={100} />
          <path className="af-flow af-flow-3" d="M150 0 V10 H188 V28" pathLength={100} />
          <path className="af-flow af-flow-4" d="M150 0 V10 H262 V28" pathLength={100} />
        </svg>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`af-node af-agent af-agent-${i + 1} rounded-xl border border-stone-200 bg-white px-2 py-3 text-center`}>
            <div className="mx-auto mb-1.5 flex h-1.5 w-8 overflow-hidden rounded-full bg-stone-100">
              <span className="af-bar h-full w-1/3 rounded-full bg-stone-900" />
            </div>
            <div className="text-xs font-semibold text-stone-900">agent</div>
          </div>
        ))}
      </div>
      <div className="relative mx-auto h-7 w-full" aria-hidden>
        <svg viewBox="0 0 300 28" className="h-full w-full" preserveAspectRatio="none">
          <path className="af-branch" d="M38 0 V18 H150 V28" />
          <path className="af-branch" d="M113 0 V18 H150 V28" />
          <path className="af-branch" d="M188 0 V18 H150 V28" />
          <path className="af-branch" d="M262 0 V18 H150 V28" />
        </svg>
      </div>
      <div className="af-scratch mx-auto mb-3 max-w-xs rounded-lg border border-dashed border-stone-300 bg-stone-50/60 px-3 py-2 text-center text-[11px] text-stone-500">
        shared scratchpad — builds up over 3 rounds
      </div>
      <Answer label="Converged shortlist" />
    </div>
  );
}
