'use client';

import { useState } from 'react';
import {
  Check, ChevronRight, Scale, LayoutGrid, Gavel, RefreshCw, Trophy, Gauge,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { prettyAgentName } from '@/lib/modes';
import { formatCost } from '@/lib/models';
import { MarkdownContent } from './MarkdownContent';
import type { RunSummary } from '@/lib/agent-events';

/** Dispatches a RunSummary to its bespoke view. Returns null for unknown kinds. */
export function StrategyView({ summary }: { summary: RunSummary }) {
  switch (summary.kind) {
    case 'evaluator':
      return <EvaluatorView rounds={summary.rounds} />;
    case 'debate':
      return <DebateView summary={summary} />;
    case 'blackboard':
      return <BlackboardView sections={summary.sections} />;
    case 'market':
      return <MarketView summary={summary} />;
    default:
      return null;
  }
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <div className="flex items-center gap-2 border-b border-stone-100 bg-stone-50/70 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
        {icon}
        {title}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

// ── v4 Evaluator–Optimizer: a round-by-round score ladder ──────────────────
function EvaluatorView({ rounds }: { rounds: Extract<RunSummary, { kind: 'evaluator' }>['rounds'] }) {
  const [open, setOpen] = useState<number | null>(rounds.length - 1);
  return (
    <Card icon={<RefreshCw className="h-3.5 w-3.5" />} title={`Evaluator–Optimizer · ${rounds.length} round${rounds.length === 1 ? '' : 's'}`}>
      <div className="space-y-1.5">
        {rounds.map((r, i) => {
          const expanded = open === i;
          return (
            <div key={i} className="rounded-xl border border-stone-100 bg-stone-50/50">
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : i)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left"
              >
                <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-stone-400 transition-transform', expanded && 'rotate-90')} />
                <span className="text-sm font-medium text-stone-700">Round {r.round}</span>
                <ScoreBadge score={r.score} passed={r.passed} />
                {!expanded && r.issues.length > 0 && (
                  <span className="ml-auto truncate text-[11px] text-stone-400">{r.issues.length} issue{r.issues.length === 1 ? '' : 's'}</span>
                )}
              </button>
              {expanded && (
                <div className="space-y-2 px-3 pb-3">
                  {r.issues.length > 0 && (
                    <ul className="ml-1 list-disc space-y-0.5 pl-4 text-[12px] text-stone-600">
                      {r.issues.map((iss, j) => <li key={j}>{iss}</li>)}
                    </ul>
                  )}
                  <div className="rounded-lg border border-stone-100 bg-white px-3 py-2 text-sm">
                    <MarkdownContent content={r.draft} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ScoreBadge({ score, passed }: { score: number; passed: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-medium tabular-nums',
        passed ? 'border-green-200 bg-green-50 text-green-700' : 'border-orange-200 bg-orange-50 text-orange-700',
      )}
    >
      <Gauge className="h-3 w-3" />
      {score}/10{passed ? ' · passed' : ''}
    </span>
  );
}

// ── v5 Debate: two columns of arguments + verdict ──────────────────────────
function DebateView({ summary }: { summary: Extract<RunSummary, { kind: 'debate' }> }) {
  const stances = Array.from(new Set(summary.turns.map((t) => t.stance)));
  const [left, right] = stances;
  const rounds = Array.from(new Set(summary.turns.map((t) => t.round))).sort((a, b) => a - b);
  const find = (stance: string, round: number) => summary.turns.find((t) => t.stance === stance && t.round === round)?.argument;

  return (
    <Card icon={<Scale className="h-3.5 w-3.5" />} title={`Debate · ${rounds.length} round${rounds.length === 1 ? '' : 's'}`}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold">
          <div className="rounded-lg bg-blue-50 px-2 py-1 text-center text-blue-700">{left}</div>
          <div className="rounded-lg bg-rose-50 px-2 py-1 text-center text-rose-700">{right}</div>
        </div>
        {rounds.map((round) => (
          <div key={round} className="grid grid-cols-2 gap-2">
            <ArgCell text={find(left, round)} tone="blue" round={round} />
            <ArgCell text={find(right, round)} tone="rose" round={round} />
          </div>
        ))}
        <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
            <Trophy className="h-3.5 w-3.5" /> Verdict · winner: <span className="text-stone-800">{summary.verdict.winner}</span>
          </div>
          <div className="text-sm text-stone-700"><MarkdownContent content={summary.verdict.reasoning} /></div>
          {summary.verdict.synthesis && (
            <div className="mt-2 border-t border-stone-200 pt-2 text-sm text-stone-700">
              <div className="mb-0.5 text-[11px] font-semibold text-stone-500">Recommendation</div>
              <MarkdownContent content={summary.verdict.synthesis} />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function ArgCell({ text, tone, round }: { text?: string; tone: 'blue' | 'rose'; round: number }) {
  return (
    <div className={cn('rounded-lg border px-2.5 py-2 text-[12px] leading-snug', tone === 'blue' ? 'border-blue-100 bg-blue-50/40 text-stone-700' : 'border-rose-100 bg-rose-50/40 text-stone-700')}>
      <div className="mb-0.5 text-[10px] text-stone-400">round {round}</div>
      {text ?? <span className="text-stone-400">—</span>}
    </div>
  );
}

// ── v6 Blackboard: the shared workspace as section cards ───────────────────
function BlackboardView({ sections }: { sections: Extract<RunSummary, { kind: 'blackboard' }>['sections'] }) {
  return (
    <Card icon={<LayoutGrid className="h-3.5 w-3.5" />} title={`Blackboard · ${sections.length} section${sections.length === 1 ? '' : 's'}`}>
      <div className="grid gap-2 sm:grid-cols-2">
        {sections.map((s, i) => (
          <div key={i} className="rounded-xl border border-stone-100 bg-stone-50/50 p-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-stone-800">{s.section}</span>
              <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-500">{prettyAgentName(s.author)}</span>
            </div>
            <div className="text-[13px] text-stone-700"><MarkdownContent content={s.content} /></div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── v7 Market: auction board (tasks → bids → award) ────────────────────────
function MarketView({ summary }: { summary: Extract<RunSummary, { kind: 'market' }> }) {
  return (
    <Card icon={<Gavel className="h-3.5 w-3.5" />} title={`Market · ${summary.tasks.length} task${summary.tasks.length === 1 ? '' : 's'}`}>
      <div className="space-y-2">
        {summary.tasks.map((t) => {
          const award = summary.awards.find((a) => a.taskId === t.taskId);
          const bids = summary.bids
            .filter((b) => b.taskId === t.taskId)
            .sort((a, b) => b.fit - a.fit);
          return (
            <div key={t.taskId} className="rounded-xl border border-stone-100 bg-stone-50/50 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-stone-800">{t.title}</span>
                {award && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                    <Trophy className="h-3 w-3" /> {prettyAgentName(award.agent)}
                  </span>
                )}
              </div>
              {bids.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {bids.map((b, i) => (
                    <span
                      key={i}
                      className={cn(
                        'rounded-full border px-1.5 py-0.5 text-[10px] tabular-nums',
                        award?.agent === b.agent
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-stone-200 bg-white text-stone-500',
                      )}
                      title={`~${formatCost(b.estCostUsd)}`}
                    >
                      {prettyAgentName(b.agent)} {(b.fit * 100).toFixed(0)}%
                    </span>
                  ))}
                </div>
              )}
              {award?.output && (
                <div className="mt-2 border-t border-stone-100 pt-2 text-[13px] text-stone-700">
                  <MarkdownContent content={award.output} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
