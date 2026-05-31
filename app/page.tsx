'use client';

import { useState, useRef, useEffect, type FormEvent } from 'react';
import { ArrowUp, Bot, User, Sparkles, Network, Workflow, Check, Loader2, Bug } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { DEFAULT_MODEL, type OpenAIModel } from '@/lib/models';
import { MarkdownContent } from './components/MarkdownContent';
import { ModelSelector } from './components/ModelSelector';
import { AgentTimeline, type LiveAgent } from './components/AgentTimeline';
import { DebugDrawer } from './components/DebugDrawer';
import type { AgentEvent } from '@/lib/agent-events';

type Mode = 'v1' | 'v2';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  meta?: {
    mode: Mode;
    model?: string;
    agentsUsed?: string[];
    iterations?: number;
    totalDuration?: number;
    perAgent?: Array<{ agent: string; duration: number; completed: boolean }>;
  };
}

interface LiveRun {
  agents: Map<string, LiveAgent>;
  currentAgent?: string;
  iteration?: number;
  events: AgentEvent[];
}

const SUGGESTIONS_V1 = [
  'Write a short blog post about AI agents in 2026',
  'Research recent breakthroughs in multi-agent systems',
  'Draft a product launch announcement for a developer tool',
  'Summarize the state of open-source LLM frameworks',
];

const SUGGESTIONS_V2 = [
  'Design a task management feature with priorities and assignment',
  'Build a real-time analytics dashboard',
  'Create a notification preferences settings page',
  'Spec out a multi-tenant billing system',
];

function emptyRun(): LiveRun {
  return { agents: new Map(), events: [] };
}

export default function Home() {
  const [mode, setMode] = useState<Mode>('v1');
  const [model, setModel] = useState<OpenAIModel>(DEFAULT_MODEL);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [live, setLive] = useState<LiveRun>(emptyRun);
  const [debugOpen, setDebugOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    const id = requestAnimationFrame(() => {
      scrollRef.current!.scrollTop = scrollRef.current!.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [messages.length, isLoading, live.agents.size]);

  // Tick clock while a run is in flight so durations animate
  useEffect(() => {
    if (!isLoading) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [isLoading]);

  function applyEvent(prev: LiveRun, event: AgentEvent): LiveRun {
    const next: LiveRun = {
      agents: new Map(prev.agents),
      currentAgent: prev.currentAgent,
      iteration: prev.iteration,
      events: [...prev.events, event],
    };

    const upsert = (name: string, patch: Partial<LiveAgent>) => {
      const existing = next.agents.get(name) ?? {
        name,
        status: 'pending' as const,
        toolCalls: [],
        outbound: 0,
      };
      next.agents.set(name, { ...existing, ...patch });
    };

    switch (event.type) {
      case 'workflow_start':
        if (event.startingAgent) next.currentAgent = event.startingAgent;
        break;
      case 'iteration_start':
        next.currentAgent = event.agent;
        next.iteration = event.iteration;
        upsert(event.agent, { status: 'running', startedAt: Date.now() });
        break;
      case 'iteration_end': {
        const existing = next.agents.get(event.agent);
        upsert(event.agent, {
          status: event.completed ? 'done' : existing?.status === 'running' ? 'pending' : existing?.status ?? 'pending',
          durationMs: (existing?.durationMs ?? 0) + event.durationMs,
          completed: event.completed ?? existing?.completed,
          outputPreview: event.outputPreview || existing?.outputPreview,
          startedAt: undefined,
        });
        break;
      }
      case 'tool_call': {
        const existing = next.agents.get(event.agent);
        upsert(event.agent, {
          toolCalls: [
            ...(existing?.toolCalls ?? []),
            { toolName: event.toolName, preview: event.preview, at: Date.now() },
          ],
        });
        break;
      }
      case 'bus_message': {
        if (event.messageType === 'agent' && event.from && event.from !== 'user') {
          const existing = next.agents.get(event.from);
          upsert(event.from, { outbound: (existing?.outbound ?? 0) + 1 });
        }
        break;
      }
      case 'handoff':
        next.currentAgent = event.to;
        break;
      case 'workflow_complete':
        next.currentAgent = undefined;
        break;
    }

    return next;
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
    };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setIsLoading(true);
    setLive(emptyRun());

    const endpoint = mode === 'v1' ? '/api/agents' : '/api/agents-v2';
    let finalEvent: Extract<AgentEvent, { type: 'workflow_complete' }> | null = null;
    let errorEvent: Extract<AgentEvent, { type: 'workflow_error' }> | null = null;
    const collectedEvents: AgentEvent[] = [];

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, model }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.details || err.error || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sep: number;
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const dataLine = frame
            .split('\n')
            .find((l) => l.startsWith('data:'));
          if (!dataLine) continue;
          const payload = dataLine.slice(5).trim();
          if (!payload) continue;
          try {
            const event = JSON.parse(payload) as AgentEvent;
            collectedEvents.push(event);
            if (event.type === 'workflow_complete') finalEvent = event;
            if (event.type === 'workflow_error') errorEvent = event;
            setLive((prev) => applyEvent(prev, event));
          } catch {
            // skip malformed frame
          }
        }
      }

      if (errorEvent) {
        throw new Error(errorEvent.error);
      }

      const assistantMsg = buildAssistantMessage(mode, model, finalEvent, collectedEvents);
      setMessages((m) => [...m, assistantMsg]);
    } catch (e) {
      const err = e instanceof Error ? e.message : 'Unknown error';
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `**Error:** ${err}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  const hasMessages = messages.length > 0;
  const suggestions = mode === 'v1' ? SUGGESTIONS_V1 : SUGGESTIONS_V2;
  const liveAgents = Array.from(live.agents.values());

  return (
    <div className="flex h-screen flex-col bg-stone-50 text-stone-900">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-stone-200 bg-white/70 px-4 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-900 text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">Multi-Agent Team</div>
            <div className="text-[11px] leading-tight text-stone-500">
              {mode === 'v1' ? 'Orchestrated · coordinator + research/write/edit' : 'Choreographed · backend/frontend/design'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ModelSelector value={model} onChange={setModel} disabled={isLoading} />
          <ModeToggle mode={mode} onChange={setMode} disabled={isLoading} />
          <DebugToggle
            open={debugOpen}
            onClick={() => setDebugOpen((v) => !v)}
            eventCount={live.events.length}
            active={isLoading}
          />
        </div>
      </header>

      <main className="flex flex-1 flex-col overflow-hidden">
        {!hasMessages ? (
          <div className="flex flex-1 flex-col items-center justify-center px-4">
            <div className="w-full max-w-3xl">
              <h1 className="mb-2 text-center text-3xl font-semibold tracking-tight text-stone-900">
                {mode === 'v1' ? 'What should we research today?' : 'What should we build together?'}
              </h1>
              <p className="mb-8 text-center text-sm text-stone-500">
                {mode === 'v1'
                  ? 'A coordinator will dispatch researcher → writer → editor.'
                  : 'Backend, frontend, and design agents collaborate via a shared message bus.'}
              </p>
              <InputArea
                input={input}
                setInput={setInput}
                onSubmit={handleSubmit}
                isLoading={isLoading}
              />
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    disabled={isLoading}
                    className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-700 transition-all hover:border-stone-300 hover:bg-stone-100 disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto [scrollbar-width:thin]"
            >
              <div className="mx-auto max-w-3xl px-4 py-6">
                {messages.map((m) => (
                  <MessageRow key={m.id} message={m} />
                ))}
                {isLoading && (
                  <AgentTimeline
                    agents={liveAgents}
                    mode={mode}
                    currentAgent={live.currentAgent}
                    iteration={live.iteration}
                    now={now}
                  />
                )}
              </div>
            </div>
            <div className="border-t border-stone-200 bg-white/70 px-4 py-3 backdrop-blur">
              <div className="mx-auto max-w-3xl">
                <InputArea
                  input={input}
                  setInput={setInput}
                  onSubmit={handleSubmit}
                  isLoading={isLoading}
                />
                <p className="mt-2 text-center text-[11px] text-stone-400">
                  Agents can take 30–90s. Open the debug drawer for live tool calls and bus traffic.
                </p>
              </div>
            </div>
          </>
        )}
      </main>

      <DebugDrawer
        open={debugOpen}
        onClose={() => setDebugOpen(false)}
        events={live.events}
      />
    </div>
  );
}

function buildAssistantMessage(
  mode: Mode,
  model: string,
  finalEvent: Extract<AgentEvent, { type: 'workflow_complete' }> | null,
  allEvents: AgentEvent[],
): ChatMessage {
  if (!finalEvent) {
    return {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '_(no result returned)_',
    };
  }

  if (finalEvent.mode === 'v1') {
    return {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: finalEvent.result ?? '_(empty response)_',
      meta: {
        mode: 'v1',
        model,
        agentsUsed: finalEvent.agentsUsed,
        iterations: finalEvent.iterations,
      },
    };
  }

  const results = finalEvent.agentResults ?? [];
  const content =
    results.length === 0
      ? '_(no agent output)_'
      : results
          .map(
            (r) =>
              `## ${prettyAgentName(r.agent)}${r.completed ? '' : ' (in progress)'}\n\n${r.output}`,
          )
          .join('\n\n---\n\n');

  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    content,
    meta: {
      mode: 'v2',
      model,
      iterations: finalEvent.iterations,
      totalDuration: finalEvent.totalDuration,
      perAgent: results.map((r) => ({
        agent: r.agent,
        duration: r.duration,
        completed: r.completed,
      })),
    },
  };
}

function prettyAgentName(name: string): string {
  return name
    .replace(/Agent$/, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function ModeToggle({
  mode,
  onChange,
  disabled,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center rounded-full border border-stone-200 bg-white p-0.5 text-xs">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange('v1')}
        className={cn(
          'flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors',
          mode === 'v1'
            ? 'bg-stone-900 text-white'
            : 'text-stone-600 hover:text-stone-900',
          disabled && 'cursor-not-allowed opacity-50'
        )}
      >
        <Workflow className="h-3.5 w-3.5" />
        v1 orchestrated
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange('v2')}
        className={cn(
          'flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors',
          mode === 'v2'
            ? 'bg-stone-900 text-white'
            : 'text-stone-600 hover:text-stone-900',
          disabled && 'cursor-not-allowed opacity-50'
        )}
      >
        <Network className="h-3.5 w-3.5" />
        v2 choreographed
      </button>
    </div>
  );
}

function DebugToggle({
  open,
  onClick,
  eventCount,
  active,
}: {
  open: boolean;
  onClick: () => void;
  eventCount: number;
  active: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
        open
          ? 'border-stone-900 bg-stone-900 text-white'
          : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:text-stone-900',
      )}
      aria-pressed={open}
      aria-label="Toggle debug drawer"
    >
      <Bug className="h-3.5 w-3.5" />
      Debug
      {eventCount > 0 && (
        <span
          className={cn(
            'rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
            open ? 'bg-white/15' : 'bg-stone-100 text-stone-500',
          )}
        >
          {eventCount}
        </span>
      )}
      {active && !open && (
        <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
        </span>
      )}
    </button>
  );
}

function InputArea({
  input,
  setInput,
  onSubmit,
  isLoading,
}: {
  input: string;
  setInput: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  isLoading: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="w-full">
      <div className="flex items-end gap-2 rounded-2xl border border-stone-200 bg-white p-2 shadow-sm transition-colors focus-within:border-stone-400">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (input.trim()) onSubmit(e as unknown as FormEvent);
            }
          }}
          placeholder="Ask anything…"
          disabled={isLoading}
          rows={1}
          className={cn(
            'flex-1 resize-none bg-transparent px-3 py-2 text-sm leading-6',
            'placeholder:text-stone-400 focus:outline-none',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'max-h-[200px] min-h-[40px]'
          )}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors',
            input.trim() && !isLoading
              ? 'bg-stone-900 text-white hover:bg-stone-800'
              : 'bg-stone-200 text-stone-400'
          )}
          aria-label="Send"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowUp className="h-4 w-4" />
          )}
        </button>
      </div>
    </form>
  );
}

function MessageRow({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div
      className={cn(
        'group flex gap-3 py-4 animate-in fade-in slide-in-from-bottom-1 duration-300',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200 text-stone-700'
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div
        className={cn(
          'max-w-[85%] space-y-2',
          isUser && 'flex flex-col items-end'
        )}
      >
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5',
            isUser
              ? 'bg-stone-900 text-white'
              : 'bg-white border border-stone-200 text-stone-900'
          )}
        >
          <MarkdownContent content={message.content} />
        </div>
        {message.meta && <MetaBar meta={message.meta} />}
      </div>
    </div>
  );
}

function MetaBar({ meta }: { meta: NonNullable<ChatMessage['meta']> }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <span
        className={cn(
          'rounded-full border px-2 py-0.5 font-medium',
          meta.mode === 'v1'
            ? 'border-blue-200 bg-blue-50 text-blue-700'
            : 'border-purple-200 bg-purple-50 text-purple-700'
        )}
      >
        {meta.mode === 'v1' ? 'orchestrated' : 'choreographed'}
      </span>
      {meta.model && (
        <span className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 font-mono text-stone-600">
          {meta.model}
        </span>
      )}
      {meta.iterations !== undefined && (
        <span className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-stone-600">
          {meta.mode === 'v1' ? `${meta.iterations} msgs` : `${meta.iterations} iter`}
        </span>
      )}
      {meta.totalDuration !== undefined && (
        <span className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-stone-600">
          {(meta.totalDuration / 1000).toFixed(1)}s
        </span>
      )}
      {meta.agentsUsed?.map((a) => (
        <span key={a} className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-stone-600">
          {prettyAgentName(a)}
        </span>
      ))}
      {meta.perAgent?.map((a) => (
        <span
          key={a.agent}
          className={cn(
            'flex items-center gap-1 rounded-full border px-2 py-0.5',
            a.completed
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-yellow-200 bg-yellow-50 text-yellow-700'
          )}
        >
          {a.completed && <Check className="h-3 w-3" />}
          {prettyAgentName(a.agent)} · {(a.duration / 1000).toFixed(1)}s
        </span>
      ))}
    </div>
  );
}
