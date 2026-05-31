'use client';

import { Bot, Check, Loader2, Wrench, MessageSquare, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export type AgentStatus = 'pending' | 'running' | 'done';

export interface LiveAgent {
  name: string;
  status: AgentStatus;
  startedAt?: number;
  durationMs?: number;
  toolCalls: { toolName: string; preview?: string; at: number }[];
  outbound: number;
  outputPreview?: string;
  completed?: boolean;
}

interface AgentTimelineProps {
  agents: LiveAgent[];
  mode: 'v1' | 'v2';
  currentAgent?: string;
  iteration?: number;
  now: number;
}

function prettyAgentName(name: string): string {
  return name
    .replace(/Agent$/, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function AgentTimeline({ agents, mode, currentAgent, iteration, now }: AgentTimelineProps) {
  if (agents.length === 0) {
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
                ? 'Coordinator is dispatching specialists…'
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
        </div>
        <div className="space-y-1.5 rounded-2xl border border-stone-200 bg-white p-2">
          {agents.map((a) => (
            <AgentRow key={a.name} agent={a} now={now} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AgentRow({ agent, now }: { agent: LiveAgent; now: number }) {
  const elapsed =
    agent.status === 'running' && agent.startedAt
      ? now - agent.startedAt
      : agent.durationMs ?? 0;

  return (
    <div className="rounded-xl border border-stone-100 bg-stone-50/60 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
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
          {elapsed > 0 && <span className="tabular-nums">{formatDuration(elapsed)}</span>}
        </div>
      </div>
      {agent.toolCalls.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
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
      {agent.outputPreview && agent.status !== 'running' && (
        <div className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-stone-500">
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
