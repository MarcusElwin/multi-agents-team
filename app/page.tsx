'use client';

import { useState, useRef, useEffect, type FormEvent } from 'react';
import { ArrowUp, Bot, User, Sparkles, Check, Loader2, Bug, ChevronDown, Code2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { DEFAULT_MODEL, formatCost, type OpenAIModel } from '@/lib/models';
import { MODES, type Mode, prettyAgentName } from '@/lib/modes';
import { MarkdownContent } from './components/MarkdownContent';
import { ModelSelector } from './components/ModelSelector';
import { ModeSelector } from './components/ModeSelector';
import { AgentTimeline, type LiveAgent } from './components/AgentTimeline';
import { ArchitecturePanel } from './components/ArchitecturePanel';
import { InputRequestCard } from './components/InputRequestCard';
import { DebugDrawer } from './components/DebugDrawer';
import { ChatSidebar } from './components/ChatSidebar';
import { BuildPlan } from './components/BuildPlan';
import { CodePreview } from './components/CodePreview';
import { extractCodeBlocks, type CodeBlock } from '@/lib/utils/extract-code';
import { useConversations, type StoredMessage } from './hooks/useConversations';
import type { AgentEvent } from '@/lib/agent-events';

// The on-screen message shape is exactly what we persist, so reuse it to keep
// the rendered chat and stored history from drifting.
type ChatMessage = StoredMessage;

interface PlanStep {
  agent: string;
  task: string;
}

interface PendingInput {
  requestId: string;
  agent: string;
  question: string;
}

interface LiveRun {
  agents: Map<string, LiveAgent>;
  currentAgent?: string;
  iteration?: number;
  events: AgentEvent[];
  plan?: { intent: string; steps: PlanStep[] };
  pendingInput?: PendingInput;
  // Running totals accumulated from iteration_end events.
  costUsd: number;
}

function emptyRun(): LiveRun {
  return { agents: new Map(), events: [], costUsd: 0 };
}

export default function Home() {
  const [mode, setMode] = useState<Mode>('v1');
  const [model, setModel] = useState<OpenAIModel>(DEFAULT_MODEL);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  // live holds the streaming timeline for the chat currently on screen. It maps
  // 1:1 to liveRunId — when you switch chats, we swap or clear it.
  const [live, setLive] = useState<LiveRun>(emptyRun);
  const [liveRunId, setLiveRunId] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  // Code preview side pane: opened from an agent deliverable's "View code".
  const [preview, setPreview] = useState<{ title: string; blocks: CodeBlock[] } | null>(null);

  const openCodePreview = (title: string, source: string) => {
    const blocks = extractCodeBlocks(source);
    if (blocks.length > 0) setPreview({ title, blocks });
  };
  const [now, setNow] = useState(Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    conversations,
    activeId,
    activeConversation,
    newConversation,
    selectConversation,
    deleteConversation,
    upsertConversation,
    updateConversation,
  } = useConversations();

  // Runs in flight, keyed by the chat id they belong to. A run keeps streaming
  // in the background after you switch away; its result lands back on its chat.
  const runsRef = useRef<Map<string, AbortController>>(new Map());
  // Which chat ids currently have a run in flight (drives sidebar dots + the
  // "is the viewed chat running" loading state). A piece of state so the UI
  // re-renders as runs start/stop.
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());

  // The chat on screen is "loading" only if ITS run is in flight. A run for
  // another chat streams in the background without showing a spinner here.
  const isLoading = activeId != null && runningIds.has(activeId);

  const markRunning = (id: string, running: boolean) =>
    setRunningIds((prev) => {
      const next = new Set(prev);
      if (running) next.add(id);
      else next.delete(id);
      return next;
    });

  // Always-current viewed chat id, read inside streaming closures (which would
  // otherwise capture a stale activeId). Updated synchronously below.
  const viewedIdRef = useRef<string | null>(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // When the active conversation changes (switch or hydrate), load its stored
  // messages and the mode/model it was held in. Runs keep going in the
  // background, so we never block this on a run being in flight — we just don't
  // carry another chat's live timeline over. A null active id means "new chat".
  const loadedId = useRef<string | null>(null);
  useEffect(() => {
    viewedIdRef.current = activeId;
    if (activeId === loadedId.current) return;
    loadedId.current = activeId;
    if (activeConversation) {
      setMessages(activeConversation.messages);
      setMode(activeConversation.mode);
      setModel(activeConversation.model as OpenAIModel);
    } else {
      setMessages([]);
    }
    // Only keep the live timeline if it belongs to the chat we're switching to.
    if (liveRunId !== activeId) setLive(emptyRun());
  }, [activeId, activeConversation, liveRunId]);

  function startNewChat() {
    // Leave any in-flight run alone — it streams in the background and writes
    // back to its own chat. Just clear the view to the empty welcome state.
    loadedId.current = null;
    newConversation();
    setMessages([]);
    setLive(emptyRun());
    setLiveRunId(null);
    setInput('');
  }

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
      ...prev,
      agents: new Map(prev.agents),
      events: [...prev.events, event],
    };

    const upsert = (name: string, patch: Partial<LiveAgent>) => {
      const existing = next.agents.get(name) ?? {
        name,
        status: 'pending' as const,
        toolCalls: [],
        outbound: 0,
        steps: [],
        searches: [],
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
          costUsd: (existing?.costUsd ?? 0) + (event.costUsd ?? 0),
        });
        next.costUsd += event.costUsd ?? 0;
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
      case 'agent_step': {
        const existing = next.agents.get(event.agent);
        upsert(event.agent, {
          steps: [
            ...(existing?.steps ?? []),
            { stepIndex: event.stepIndex, text: event.text, toolNames: event.toolNames },
          ],
        });
        break;
      }
      case 'web_search': {
        const existing = next.agents.get(event.agent);
        const searches = [...(existing?.searches ?? [])];
        if (event.status === 'start') {
          searches.push({ query: event.query, status: 'start' });
        } else {
          // Mark the matching pending search done; fall back to appending.
          const idx = searches.findLastIndex(
            (s) => s.query === event.query && s.status === 'start',
          );
          const done = { query: event.query, status: 'done' as const, sources: event.sources };
          if (idx >= 0) searches[idx] = done;
          else searches.push(done);
        }
        upsert(event.agent, { searches });
        break;
      }
      case 'handoff':
        next.currentAgent = event.to;
        break;
      case 'agent_plan':
        next.plan = { intent: event.intent, steps: event.steps };
        break;
      case 'input_request':
        next.pendingInput = {
          requestId: event.requestId,
          agent: event.agent,
          question: event.question,
        };
        break;
      case 'workflow_complete':
        next.currentAgent = undefined;
        break;
    }

    return next;
  }

  async function send(text: string) {
    const trimmed = text.trim();
    // Only block if the chat we're viewing is already running; a different
    // chat's run streaming in the background is fine.
    if (!trimmed || isLoading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
    };

    // Bind this run to a chat id up front: reuse the active chat, or mint a new
    // one. Persist immediately (status 'running') so the chat shows in the
    // sidebar and the run "belongs" to it before any result exists.
    const priorMessages = messages;
    const withUser = [...priorMessages, userMsg];
    const runId = upsertConversation({
      id: activeId ?? undefined,
      messages: withUser,
      mode,
      model,
      status: 'running',
      now: Date.now(),
      activate: true,
    });
    loadedId.current = runId; // we just activated runId; don't re-load over it
    viewedIdRef.current = runId;

    // Reflect on screen (we are viewing this chat right after send).
    setMessages(withUser);
    setInput('');
    setLive(emptyRun());
    setLiveRunId(runId);
    markRunning(runId, true);

    const endpoint = MODES[mode].endpoint;
    // Prior turns become the agents' memory. Snapshot before appending this turn.
    const history = priorMessages.map((m) => ({ role: m.role, content: m.content }));
    let finalEvent: Extract<AgentEvent, { type: 'workflow_complete' }> | null = null;
    let errorEvent: Extract<AgentEvent, { type: 'workflow_error' }> | null = null;

    const controller = new AbortController();
    runsRef.current.set(runId, controller);

    // Only paint the live timeline while THIS run's chat is the one on screen.
    const renderLive = (event: AgentEvent) => {
      if (viewedIdRef.current === runId) setLive((prev) => applyEvent(prev, event));
    };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, model, history }),
        signal: controller.signal,
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
            if (event.type === 'workflow_complete') finalEvent = event;
            if (event.type === 'workflow_error') errorEvent = event;
            renderLive(event);
          } catch {
            // skip malformed frame
          }
        }
      }

      if (errorEvent) {
        throw new Error(errorEvent.error);
      }

      const assistantMsg = buildAssistantMessage(model, finalEvent);
      const updated = [...withUser, assistantMsg];
      // Write the result back to THIS run's chat, wherever the user is now.
      updateConversation(runId, { messages: updated, status: 'idle', updatedAt: Date.now() });
      // Only touch the visible transcript if we're still viewing this chat.
      if (viewedIdRef.current === runId) setMessages(updated);
    } catch (e) {
      if (controller.signal.aborted) return; // deliberate cancel (e.g. delete)
      const err = e instanceof Error ? e.message : 'Unknown error';
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `**Error:** ${err}`,
      };
      const updated = [...withUser, errorMsg];
      updateConversation(runId, { messages: updated, status: 'error', updatedAt: Date.now() });
      if (viewedIdRef.current === runId) setMessages(updated);
    } finally {
      runsRef.current.delete(runId);
      markRunning(runId, false);
      // Drop the live timeline only if this run still owns it.
      setLiveRunId((cur) => (cur === runId ? null : cur));
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  // Deliver a human answer to a paused run, then clear the prompt card so the
  // timeline takes over again while the agents resume.
  async function respondToInput(requestId: string, answer: string) {
    setLive((prev) => ({ ...prev, pendingInput: undefined }));
    try {
      await fetch('/api/agents/input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, answer }),
      });
    } catch {
      // The run will time out and proceed with defaults if this fails.
    }
  }

  // Switching chats leaves any running research alone (it streams in the
  // background and writes back to its own chat). We just change what's viewed.
  function handleSelectConversation(id: string) {
    if (id === activeId) return;
    selectConversation(id);
  }

  // Deleting a chat aborts its run if one is in flight, then removes it.
  function handleDeleteConversation(id: string) {
    runsRef.current.get(id)?.abort();
    runsRef.current.delete(id);
    markRunning(id, false);
    deleteConversation(id);
  }

  const hasMessages = messages.length > 0;
  const spec = MODES[mode];
  const liveAgents = Array.from(live.agents.values());

  return (
    <div className="flex h-screen bg-stone-50 text-stone-900">
      <ChatSidebar
        conversations={conversations}
        activeId={activeId}
        runningIds={runningIds}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        onNew={startNewChat}
        onSelect={handleSelectConversation}
        onDelete={handleDeleteConversation}
      />
      <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-stone-200 bg-white/70 px-4 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-900 text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">Multi-Agent Team</div>
            <div className="text-[11px] leading-tight text-stone-500">
              {spec.pattern} · {spec.tagline}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ModelSelector value={model} onChange={setModel} disabled={isLoading} />
          <ModeSelector value={mode} onChange={setMode} disabled={isLoading} />
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
          <div className="flex flex-1 flex-col items-center overflow-y-auto px-4 py-10 [scrollbar-width:thin]">
            <div className="w-full max-w-3xl">
              <h1 className="mb-2 text-center text-3xl font-semibold tracking-tight text-stone-900">
                {mode === 'v1' ? 'What should we research today?' : 'What should we build together?'}
              </h1>
              <p className="mb-8 text-center text-sm text-stone-500">{spec.description}</p>
              <InputArea
                input={input}
                setInput={setInput}
                onSubmit={handleSubmit}
                isLoading={isLoading}
              />
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {spec.suggestions.map((s) => (
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

              <ArchitecturePanel mode={mode} collapsible defaultOpen={false} className="mt-10" />
            </div>
          </div>
        ) : (
          <>
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto [scrollbar-width:thin]"
            >
              <div className="mx-auto max-w-3xl px-4 py-6">
                {messages.map((m, i) => (
                  <MessageRow
                    key={m.id}
                    message={m}
                    prevUserMessage={
                      m.role === 'assistant'
                        ? [...messages.slice(0, i)].reverse().find((p) => p.role === 'user')?.content
                        : undefined
                    }
                    onViewCode={openCodePreview}
                  />
                ))}
                {isLoading && (
                  <AgentTimeline
                    agents={liveAgents}
                    mode={mode}
                    currentAgent={live.currentAgent}
                    iteration={live.iteration}
                    now={now}
                    plan={live.plan}
                    costUsd={live.costUsd}
                  />
                )}
                {live.pendingInput && (
                  <InputRequestCard
                    agent={live.pendingInput.agent}
                    question={live.pendingInput.question}
                    onSubmit={(answer) => respondToInput(live.pendingInput!.requestId, answer)}
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
                  {spec.pattern} agents · {spec.durationHint}. Open the debug drawer for live tool calls and bus traffic.
                </p>
              </div>
            </div>
          </>
        )}
      </main>
      </div>

      <DebugDrawer
        open={debugOpen}
        onClose={() => setDebugOpen(false)}
        events={live.events}
      />

      <CodePreview
        open={preview !== null}
        title={preview?.title}
        blocks={preview?.blocks ?? []}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}

function buildAssistantMessage(
  model: string,
  finalEvent: Extract<AgentEvent, { type: 'workflow_complete' }> | null,
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
        totalCostUsd: finalEvent.totalCostUsd,
        totalTokens: (finalEvent.totalInputTokens ?? 0) + (finalEvent.totalOutputTokens ?? 0),
      },
    };
  }

  const results = finalEvent.agentResults ?? [];
  // v2 renders as a BuildPlan board from meta.perAgent, so content stays empty
  // (a markdown fallback is kept for the rare no-output case).
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: results.length === 0 ? '_(no agent output)_' : '',
    meta: {
      mode: 'v2',
      model,
      iterations: finalEvent.iterations,
      totalDuration: finalEvent.totalDuration,
      totalCostUsd: finalEvent.totalCostUsd,
      totalTokens: (finalEvent.totalInputTokens ?? 0) + (finalEvent.totalOutputTokens ?? 0),
      perAgent: results.map((r) => ({
        agent: r.agent,
        duration: r.duration,
        completed: r.completed,
        output: r.output,
      })),
    },
  };
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

// Assistant reports longer than this collapse to a preview with a "Show full
// report" toggle, so a multi-section answer doesn't bury the conversation.
const REPORT_COLLAPSE_THRESHOLD = 1200;

function MessageRow({
  message,
  prevUserMessage,
  onViewCode,
}: {
  message: ChatMessage;
  prevUserMessage?: string;
  onViewCode?: (title: string, source: string) => void;
}) {
  const isUser = message.role === 'user';
  // v2 assistant turns render as a BuildPlan board instead of a markdown bubble.
  const isBuildPlan =
    !isUser && message.meta?.mode === 'v2' && (message.meta.perAgent?.length ?? 0) > 0;
  const isLongReport =
    !isUser && !isBuildPlan && message.content.length > REPORT_COLLAPSE_THRESHOLD;
  // Long reports start collapsed; short ones and user messages always show full.
  const [expanded, setExpanded] = useState(false);
  const showCollapsed = isLongReport && !expanded;
  // Offer a code preview when the (non-build-plan) report contains code/JSON.
  const reportCode = !isUser && !isBuildPlan ? extractCodeBlocks(message.content) : [];

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
          isBuildPlan ? 'min-w-0 flex-1 space-y-2' : 'max-w-[85%] space-y-2',
          isUser && 'flex flex-col items-end'
        )}
      >
        {isBuildPlan ? (
          <BuildPlan
            goal={prevUserMessage}
            agents={message.meta!.perAgent!}
            totalDuration={message.meta!.totalDuration}
            onViewCode={onViewCode}
          />
        ) : (
          <div
            className={cn(
              'rounded-2xl px-4 py-2.5',
              isUser
                ? 'bg-stone-900 text-white'
                : 'bg-white border border-stone-200 text-stone-900'
            )}
          >
            <div className={cn('relative', showCollapsed && 'max-h-72 overflow-hidden')}>
              <MarkdownContent content={message.content} />
              {showCollapsed && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent" />
              )}
            </div>
            <div className="mt-2 flex items-center gap-3">
              {isLongReport && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-500 hover:text-stone-900"
                >
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
                  {expanded ? 'Collapse report' : 'Show full report'}
                </button>
              )}
              {reportCode.length > 0 && onViewCode && (
                <button
                  type="button"
                  onClick={() => onViewCode('Report code', message.content)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-500 hover:text-stone-900"
                >
                  <Code2 className="h-3.5 w-3.5" />
                  View code ({reportCode.length})
                </button>
              )}
            </div>
          </div>
        )}
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
      {meta.totalCostUsd !== undefined && meta.totalCostUsd > 0 && (
        <span
          className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700"
          title={meta.totalTokens ? `${meta.totalTokens.toLocaleString()} tokens` : undefined}
        >
          ~{formatCost(meta.totalCostUsd)}
        </span>
      )}
      {meta.agentsUsed?.map((a, i) => (
        <span key={`${a}-${i}`} className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-stone-600">
          {prettyAgentName(a)}
        </span>
      ))}
      {/* v2 per-agent details live in the BuildPlan board above; show the
          chips here only for non-build-plan messages. */}
      {meta.mode !== 'v2' &&
        meta.perAgent?.map((a, i) => (
          <span
            key={`${a.agent}-${i}`}
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
