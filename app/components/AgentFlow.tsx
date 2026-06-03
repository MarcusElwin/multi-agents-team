/**
 * AgentFlow — a looping, high-level animation of a research task flowing through
 * a multi-agent system (the v1 orchestrated pipeline). Pure CSS/SVG keyframes,
 * no JS state and no dependencies, so it renders server-side and is cheap. The
 * whole thing respects `prefers-reduced-motion` (animations collapse to a calm
 * static diagram). Styled to match the landing's stone palette + card aesthetic.
 *
 * The "story" of one ~9s loop:
 *   user query → coordinator plans → researcher / writer / editor light up in
 *   turn (a pulse travels each wire) → a synthesized answer appears.
 */

const AGENTS = [
  { key: 'research', label: 'Researcher', sub: 'searches the web' },
  { key: 'writer', label: 'Writer', sub: 'drafts the piece' },
  { key: 'editor', label: 'Editor', sub: 'polishes & checks' },
] as const;

export function AgentFlow() {
  return (
    <div className="agentflow relative mx-auto max-w-3xl">
      <div className="rounded-2xl border border-stone-200 bg-white p-6 sm:p-9">
        {/* Query chip — the task entering the system */}
        <div className="flex justify-center">
          <span className="af-query inline-flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-3.5 py-1.5 text-xs font-medium text-stone-600">
            <span className="af-cursor h-3.5 w-px bg-stone-400" aria-hidden />
            “Research the state of multi-agent AI and write a brief.”
          </span>
        </div>

        {/* Wire: query → coordinator */}
        <Wire delay="0s" />

        {/* Coordinator */}
        <div className="flex justify-center">
          <div className="af-node af-coordinator flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
            <span className="af-dot h-2.5 w-2.5 rounded-full bg-stone-900" aria-hidden />
            <div className="text-left">
              <div className="text-sm font-semibold text-stone-900">Coordinator</div>
              <div className="text-[11px] text-stone-500">plans &amp; delegates</div>
            </div>
          </div>
        </div>

        {/* Fan-out wires → three specialists. The branches end at x = 50/150/250,
            the centres of the three equal columns below. */}
        <div className="af-fanout relative mx-auto mt-1 h-7 w-full" aria-hidden>
          <svg viewBox="0 0 300 28" className="h-full w-full" preserveAspectRatio="none">
            <path className="af-branch" d="M150 0 V12 H50 V28" />
            <path className="af-branch" d="M150 0 V28" />
            <path className="af-branch" d="M150 0 V12 H250 V28" />
            {/* a bright "comet" segment runs along each branch (stroke-dash),
                staggered so the specialists light up in turn */}
            <path className="af-flow af-flow-1" d="M150 0 V12 H50 V28" pathLength={100} />
            <path className="af-flow af-flow-2" d="M150 0 V28" pathLength={100} />
            <path className="af-flow af-flow-3" d="M150 0 V12 H250 V28" pathLength={100} />
          </svg>
        </div>

        {/* Specialists */}
        <div className="grid grid-cols-3 gap-3">
          {AGENTS.map((a, i) => (
            <div
              key={a.key}
              className={`af-node af-agent af-agent-${i + 1} rounded-xl border border-stone-200 bg-white px-3 py-3 text-center`}
            >
              <div className="af-working mx-auto mb-2 flex h-1.5 w-10 overflow-hidden rounded-full bg-stone-100">
                <span className="af-bar h-full w-1/3 rounded-full bg-stone-900" />
              </div>
              <div className="text-sm font-semibold text-stone-900">{a.label}</div>
              <div className="text-[11px] text-stone-500">{a.sub}</div>
            </div>
          ))}
        </div>

        {/* Converge wires → answer */}
        <div className="af-converge relative mx-auto h-7 w-full" aria-hidden>
          <svg viewBox="0 0 300 28" className="h-full w-full" preserveAspectRatio="none">
            <path className="af-branch" d="M50 0 V16 H150 V28" />
            <path className="af-branch" d="M150 0 V28" />
            <path className="af-branch" d="M250 0 V16 H150 V28" />
          </svg>
        </div>

        {/* Answer */}
        <div className="flex justify-center">
          <div className="af-node af-answer flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
            <svg className="h-4 w-4 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <span className="text-sm font-medium text-emerald-900">Synthesized brief</span>
          </div>
        </div>
      </div>

      <p className="mt-3 text-center text-xs text-stone-400">
        One request, flowing through the <span className="font-medium text-stone-500">v1 orchestrated</span> pipeline.
      </p>
    </div>
  );
}

function Wire({ delay }: { delay: string }) {
  return (
    <div className="af-wire relative mx-auto my-1 h-7 w-px" aria-hidden>
      <span className="absolute inset-0 bg-stone-200" />
      <span className="af-wire-pulse absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-stone-900" style={{ animationDelay: delay }} />
    </div>
  );
}
