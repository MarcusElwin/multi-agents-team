'use client';

import { useState } from 'react';
import {
  Bot, Check, Loader2, Wrench, MessageSquare, ArrowRight, ListChecks,
  ChevronRight, Brain, Search,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { prettyAgentName } from '@/lib/modes';

export type AgentStatus = 'pending' | 'running' | 'done';

interface PlanStep {
  agent: string;
  task: string;
}

export interface AgentReasoningStep {
  stepIndex: number;
  text: string;
  toolNames: string[];
}

export interface AgentSearch {
  query: string;
  status: 'start' | 'done';
  sources?: number;
}

export interface LiveAgent {
  name: string;
  status: AgentStatus;
  startedAt?: number;
  durationMs?: number;
  toolCalls: { toolName: string; preview?: string; at: number }[];
  outbound: number;
  outputPreview?: string;
  completed?: boolean;
  // Live reasoning + search activity, surfaced in expandable rows.
  steps: AgentReasoningStep[];
  searches: AgentSearch[];
  /** Estimated USD cost accumulated for this agent. */
  costUsd?: number;
}

interface AgentTimelineProps {
  agents: LiveAgent[];
  mode: 'v1' | 'v2' | 'v3' | 'v4' | 'v5' | 'v6' | 'v7';
  currentAgent?: string;
  iteration?: number;
  now: number;
  plan?: { intent: string; steps: PlanStep[] };
  /** Running estimated USD cost for the whole run so far. */
  costUsd?: number;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatCost(usd: number): string {
  if (usd <= 0) return '$0.00';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

export function AgentTimeline({ agents, mode, currentAgent, iteration, now, plan, costUsd }: AgentTimelineProps) {
  if (agents.length === 0 && !plan) {
    return (
      <div className="flex gap-3 py-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-700">
          <Bot className="h-4 w-4" />
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>
              {mode === 'v1'
                ? 'Coordinator is planning the workflow…'
                : 'Agents are coordinating via the message bus…'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 py-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-700">
        <Bot className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center gap-2 text-[11px] text-stone-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>
            {currentAgent ? (
              <>
                <span className="font-medium text-stone-700">{prettyAgentName(currentAgent)}</span>{' '}
                working
                {iteration ? <> · iteration {iteration}</> : null}
              </>
            ) : (
              'Agents working…'
            )}
          </span>
          {costUsd !== undefined && costUsd > 0 && (
            <span className="ml-auto rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700 tabular-nums">
              ~{formatCost(costUsd)}
            </span>
          )}
        </div>

        {plan && <PlanBlock plan={plan} currentAgent={currentAgent} />}

        {agents.length > 0 && (
          <div className="space-y-1.5 rounded-2xl border border-stone-200 bg-white p-2">
            {agents.map((a) => (
              <AgentRow key={a.name} agent={a} now={now} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PlanBlock({
  plan,
  currentAgent,
}: {
  plan: { intent: string; steps: PlanStep[] };
  currentAgent?: string;
}) {
  // The first not-yet-reached step is the "next step" hint.
  const currentIdx = plan.steps.findIndex((s) => s.agent === currentAgent);
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-amber-800">
        <ListChecks className="h-3.5 w-3.5" />
        Plan
      </div>
      <p className="mb-2 text-[11px] leading-snug text-amber-900/80">{plan.intent}</p>
      <ol className="space-y-1">
        {plan.steps.map((s, i) => {
          const done = currentIdx >= 0 && i < currentIdx;
          const active = i === currentIdx;
          return (
            <li key={`${s.agent}-${i}`} className="flex items-start gap-2 text-[11px]">
              <span
                className={cn(
                  'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold',
                  done
                    ? 'bg-green-500 text-white'
                    : active
                      ? 'bg-amber-500 text-white'
                      : 'bg-amber-200 text-amber-700'
                )}
              >
                {done ? <Check className="h-2.5 w-2.5" /> : i + 1}
              </span>
              <span className={cn('min-w-0', active ? 'text-amber-900' : 'text-amber-800/80')}>
                <span className="font-medium">{prettyAgentName(s.agent)}</span>
                {active && <span className="ml-1 text-amber-600">· now</span>}
                <span className="text-amber-700/70"> — {s.task.slice(0, 90)}{s.task.length > 90 ? '…' : ''}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function AgentRow({ agent, now }: { agent: LiveAgent; now: number }) {
  // Running agents default to expanded so live reasoning is visible; collapse
  // once done to keep the timeline compact. User toggles override this.
  const [override, setOverride] = useState<boolean | null>(null);
  const hasDetail = agent.steps.length > 0 || agent.searches.length > 0;
  const expanded = override ?? agent.status === 'running';

  const elapsed =
    agent.status === 'running' && agent.startedAt
      ? now - agent.startedAt
      : agent.durationMs ?? 0;

  return (
    <div className="rounded-xl border border-stone-100 bg-stone-50/60 px-3 py-2">
      <button
        type="button"
        disabled={!hasDetail}
        onClick={() => setOverride(!expanded)}
        className="flex w-full items-center justify-between gap-3 text-left disabled:cursor-default"
      >
        <div className="flex min-w-0 items-center gap-2">
          {hasDetail ? (
            <ChevronRight
              className={cn(
                'h-3 w-3 shrink-0 text-stone-400 transition-transform',
                expanded && 'rotate-90',
              )}
            />
          ) : (
            <span className="w-3 shrink-0" />
          )}
          <StatusDot status={agent.status} />
          <span className="truncate text-sm font-medium text-stone-800">
            {prettyAgentName(agent.name)}
          </span>
          {agent.completed && (
            <span className="inline-flex items-center gap-0.5 rounded-full border border-green-200 bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
              <Check className="h-2.5 w-2.5" />
              done
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-stone-500">
          {agent.searches.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Search className="h-3 w-3" />
              {agent.searches.length}
            </span>
          )}
          {agent.toolCalls.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Wrench className="h-3 w-3" />
              {agent.toolCalls.length}
            </span>
          )}
          {agent.outbound > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              {agent.outbound}
            </span>
          )}
          {agent.costUsd !== undefined && agent.costUsd > 0 && (
            <span className="tabular-nums text-emerald-600">~{formatCost(agent.costUsd)}</span>
          )}
          {elapsed > 0 && <span className="tabular-nums">{formatDuration(elapsed)}</span>}
        </div>
      </button>

      {!expanded && agent.toolCalls.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1 pl-5">
          {agent.toolCalls.slice(-4).map((tc, i) => (
            <span
              key={i}
              className="rounded-full bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] text-stone-600"
            >
              {tc.toolName}
            </span>
          ))}
          {agent.toolCalls.length > 4 && (
            <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500">
              +{agent.toolCalls.length - 4}
            </span>
          )}
        </div>
      )}

      {expanded && hasDetail && (
        <div className="mt-2 space-y-1.5 border-l border-stone-200 pl-3 ml-1.5">
          {agent.searches.map((s, i) => (
            <div key={`s-${i}`} className="flex items-start gap-1.5 text-[11px] leading-snug">
              <Search className={cn('mt-0.5 h-3 w-3 shrink-0', s.status === 'done' ? 'text-teal-600' : 'text-teal-400 animate-pulse')} />
              <span className="min-w-0 text-stone-600">
                <span className="text-stone-700">{s.query}</span>
                {s.status === 'done' && (
                  <span className="text-stone-400"> · {s.sources ?? 0} source{s.sources === 1 ? '' : 's'}</span>
                )}
              </span>
            </div>
          ))}
          {agent.steps.map((step) => (
            <div key={`step-${step.stepIndex}`} className="flex items-start gap-1.5 text-[11px] leading-snug">
              <Brain className="mt-0.5 h-3 w-3 shrink-0 text-stone-400" />
              <span className="min-w-0 text-stone-600">
                {step.text || (
                  <span className="text-stone-400">
                    {step.toolNames.length ? `calling ${step.toolNames.join(', ')}` : 'thinking…'}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {!expanded && agent.outputPreview && agent.status !== 'running' && (
        <div className="mt-1.5 line-clamp-2 pl-5 text-[11px] leading-snug text-stone-500">
          {agent.outputPreview}
        </div>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: AgentStatus }) {
  if (status === 'running') {
    return (
      <span className="relative inline-flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
      </span>
    );
  }
  if (status === 'done') {
    return <span className="inline-flex h-2 w-2 rounded-full bg-green-500" />;
  }
  return <span className="inline-flex h-2 w-2 rounded-full bg-stone-300" />;
}

export { ArrowRight };
