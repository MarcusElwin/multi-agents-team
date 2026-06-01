'use client';

import { useState } from 'react';
import { Check, ChevronRight, Palette, Server, Layout, Boxes, Target } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { prettyAgentName } from '@/lib/modes';
import { MarkdownContent } from './MarkdownContent';

export interface BuildPlanAgent {
  agent: string;
  duration: number;
  completed: boolean;
  output?: string;
}

interface BuildPlanProps {
  /** The user's request — the spec/PRD the team built from. */
  goal?: string;
  agents: BuildPlanAgent[];
  totalDuration?: number;
}

// Per-agent visual identity for the v2 (choreographed) team.
const AGENT_META: Record<string, { icon: LucideIcon; tint: string; ring: string }> = {
  designAgent: { icon: Palette, tint: 'text-fuchsia-600 bg-fuchsia-50', ring: 'border-fuchsia-200' },
  backendAgent: { icon: Server, tint: 'text-amber-600 bg-amber-50', ring: 'border-amber-200' },
  frontendAgent: { icon: Layout, tint: 'text-sky-600 bg-sky-50', ring: 'border-sky-200' },
};

function metaFor(agent: string) {
  return AGENT_META[agent] ?? { icon: Boxes, tint: 'text-stone-600 bg-stone-100', ring: 'border-stone-200' };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Renders a v2 choreographed run as a "build plan": the goal it was built from,
 * then one card per specialist (Design / Backend / Frontend) with its
 * deliverable collapsible underneath. Reads like a spec a team assembled.
 */
export function BuildPlan({ goal, agents, totalDuration }: BuildPlanProps) {
  const completed = agents.filter((a) => a.completed).length;

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <div className="border-b border-stone-100 bg-stone-50/70 px-4 py-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
          <Boxes className="h-3.5 w-3.5" />
          Build plan
          <span className="ml-auto font-normal normal-case text-stone-400">
            {completed}/{agents.length} agents
            {totalDuration ? ` · ${formatDuration(totalDuration)}` : ''}
          </span>
        </div>
        {goal && (
          <div className="mt-2 flex items-start gap-2">
            <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-400" />
            <p className="text-sm leading-snug text-stone-700">{goal}</p>
          </div>
        )}
      </div>

      <div className="divide-y divide-stone-100">
        {agents.map((a, i) => (
          <AgentCard key={`${a.agent}-${i}`} agent={a} defaultOpen={i === 0} />
        ))}
      </div>
    </div>
  );
}

function AgentCard({ agent, defaultOpen }: { agent: BuildPlanAgent; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const { icon: Icon, tint, ring } = metaFor(agent.agent);
  const hasOutput = Boolean(agent.output?.trim());

  return (
    <div className="px-3 py-2.5">
      <button
        type="button"
        disabled={!hasOutput}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 text-left disabled:cursor-default"
      >
        {hasOutput ? (
          <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-stone-400 transition-transform', open && 'rotate-90')} />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border', tint, ring)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-sm font-medium text-stone-800">{prettyAgentName(agent.agent)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-[11px] text-stone-500">
          {agent.completed ? (
            <span className="inline-flex items-center gap-0.5 rounded-full border border-green-200 bg-green-50 px-1.5 py-0.5 font-medium text-green-700">
              <Check className="h-2.5 w-2.5" />
              done
            </span>
          ) : (
            <span className="rounded-full border border-yellow-200 bg-yellow-50 px-1.5 py-0.5 font-medium text-yellow-700">
              in progress
            </span>
          )}
          <span className="tabular-nums">{formatDuration(agent.duration)}</span>
        </span>
      </button>

      {open && hasOutput && (
        <div className="mt-2 ml-[2.6rem] rounded-xl border border-stone-100 bg-stone-50/50 px-3 py-2 text-sm">
          <MarkdownContent content={agent.output!} />
        </div>
      )}
    </div>
  );
}
