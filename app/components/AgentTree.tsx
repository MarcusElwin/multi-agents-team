'use client';

import { useState } from 'react';
import { Bot, Check, Loader2, ChevronRight, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export type TreeNodeStatus = 'running' | 'done';

export interface TreeNode {
  id: string;
  parentId: string | null;
  role: string;
  task: string;
  depth: number;
  status: TreeNodeStatus;
  durationMs?: number;
  costUsd?: number;
  outputPreview?: string;
  childIds: string[];
}

interface AgentTreeProps {
  /** Flat node map keyed by id; the root has parentId === null. */
  nodes: Map<string, TreeNode>;
  rootId: string | null;
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

/**
 * Live view of the v3 hierarchical run: an indented, collapsible tree that
 * fills in as agent_spawn events arrive. Each node shows its role, status,
 * duration, and cost — mirroring the timeline/build-plan visual language.
 */
export function AgentTree({ nodes, rootId, costUsd }: AgentTreeProps) {
  if (!rootId || !nodes.has(rootId)) {
    return (
      <div className="flex gap-3 py-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-700">
          <Bot className="h-4 w-4" />
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Lead is decomposing the task…</span>
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
          <GitBranch className="h-3 w-3" />
          <span>Hierarchical run · {nodes.size} agent{nodes.size === 1 ? '' : 's'}</span>
          {costUsd !== undefined && costUsd > 0 && (
            <span className="ml-auto rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700 tabular-nums">
              ~{formatCost(costUsd)}
            </span>
          )}
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-2">
          <TreeRow nodes={nodes} id={rootId} />
        </div>
      </div>
    </div>
  );
}

function TreeRow({ nodes, id }: { nodes: Map<string, TreeNode>; id: string }) {
  const node = nodes.get(id);
  const [open, setOpen] = useState(true);
  if (!node) return null;
  const children = node.childIds.map((cid) => nodes.get(cid)).filter(Boolean) as TreeNode[];
  const hasChildren = children.length > 0;

  return (
    <div>
      <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-stone-50">
        <button
          type="button"
          disabled={!hasChildren}
          onClick={() => setOpen((v) => !v)}
          className="flex shrink-0 items-center disabled:opacity-0"
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          <ChevronRight className={cn('h-3.5 w-3.5 text-stone-400 transition-transform', open && 'rotate-90')} />
        </button>
        {node.status === 'running' ? (
          <span className="relative inline-flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
          </span>
        ) : (
          <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-green-500" />
        )}
        <span className="truncate text-sm font-medium text-stone-800">{node.role}</span>
        {node.parentId === null && (
          <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-500">lead</span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2 text-[11px] text-stone-500">
          {node.status === 'done' && <Check className="h-3 w-3 text-green-600" />}
          {node.costUsd !== undefined && node.costUsd > 0 && (
            <span className="tabular-nums text-emerald-600">~{formatCost(node.costUsd)}</span>
          )}
          {node.durationMs !== undefined && node.durationMs > 0 && (
            <span className="tabular-nums">{formatDuration(node.durationMs)}</span>
          )}
        </span>
      </div>
      <div className="ml-2 truncate pl-4 text-[11px] text-stone-400">{node.task}</div>

      {hasChildren && open && (
        <div className="ml-3 border-l border-stone-200 pl-2">
          {children.map((c) => (
            <TreeRow key={c.id} nodes={nodes} id={c.id} />
          ))}
        </div>
      )}
    </div>
  );
}
