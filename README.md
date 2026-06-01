# Multi-Agent AI System

A multi-agent AI playground built with Next.js and the Vercel AI SDK. It ships **three distinct multi-agent architectures** sharing a common event/message layer, each exposed as its own streaming API route and selectable from the chat UI.

## Overview

This repo demonstrates three complementary patterns for coordinating LLM agents:

- **v1 — Orchestrated** (hub-and-spoke): a coordinator agent plans a workflow and delegates to research / writer / editor specialists one at a time, then synthesizes the result. Best for content pipelines.
- **v2 — Choreographed** (peer-to-peer): backend / frontend / design agents run in a round-robin and message each other directly via a per-conversation bus until all mark themselves complete. Best for cross-discipline collaboration. Renders as a visual **build-plan board**.
- **v3 — Hierarchical** (recursive): a lead agent decomposes the task at runtime by spawning sub-agents, which can spawn their own children (depth-capped). Children run **in parallel**; each parent synthesizes its children's results. Best for open-ended tasks that break into nested subtasks.

All three stream live to the UI (agent reasoning, tool calls, web searches), surface **estimated cost** per step and per run, and persist to a localStorage chat history.

Future patterns are tracked as issues — see [v4 Evaluator–Optimizer](https://github.com/MarcusElwin/multi-agents-team/issues/4) and [v5 Debate/Consensus](https://github.com/MarcusElwin/multi-agents-team/issues/5).

## Architecture

### v1 — Orchestrated (`lib/agents/` + `lib/orchestrator.ts`)

```
                        ┌──────────────┐
            user ─────▶ │ /api/agents  │  (SSE stream)
                        └──────┬───────┘
                               ▼
                  ┌────────────────────────┐
                  │  AgentOrchestrator     │ ◀── reads bus, builds prompts
                  │  - LLM-driven routing  │     per-run agents w/ event hooks
                  │  - max 15 iterations   │
                  └───────────┬────────────┘
                              ▼
                       ┌────────────┐
                       │coordinator │ ◀──── always starts here
                       └─────┬──────┘
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
         ┌──────────┐  ┌────────┐    ┌────────┐
         │researcher│  │ writer │    │ editor │
         └──────────┘  └────────┘    └────────┘
```

### v2 — Choreographed (`lib/agents-v2/` + `lib/runner.ts`)

```
                       ┌──────────────────┐
            user ─────▶│ /api/agents-v2   │  (SSE stream)
                       └────────┬─────────┘
                                ▼
                  ┌─────────────────────────┐
                  │      AgentRunner        │
                  │  - round-robin schedule │
                  │  - inbox-fed prompts    │
                  │  - all-must-complete    │
                  └───────────┬─────────────┘
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌─────────┐     ┌─────────┐     ┌─────────┐
        │ backend │ ◀──▶│frontend │ ◀──▶│ design  │
        └─────────┘     └─────────┘     └─────────┘
              └── pub/sub via per-conversation bus ──┘
```

### v3 — Hierarchical (`lib/agents-v3/` + `lib/hierarchical-runner.ts`)

```
                       ┌──────────────────┐
            user ─────▶│ /api/agents-v3   │  (SSE stream)
                       └────────┬─────────┘
                                ▼
                       ┌──────────────┐
                       │     Lead     │  spawnSubAgent() at runtime
                       └──────┬───────┘
                ┌─────────────┴─────────────┐
                ▼                           ▼
         ┌─────────────┐            ┌─────────────┐
         │ sub-agent A │            │ sub-agent B │  (run in parallel)
         └──────┬──────┘            └──────┬──────┘
            ┌───┴───┐                  ┌───┴───┐
            ▼       ▼                  ▼       ▼
          leaf    leaf               leaf    leaf      (depth-capped)
```

Caps: depth **2**, width **4** per node, **15** total nodes. Each parent runs a synthesis pass over its children's deliverables.

For the deep-dive comparison and trade-offs, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

### Specialized Agents

#### v1 agents

| Agent | Role | Tools |
|---|---|---|
| **Coordinator** | Plans the workflow; analyzes requests, delegates, synthesizes results | `analyzeRequest`, `delegateToAgent`, `requestUserInput`, `markComplete` |
| **Researcher** | Real-time web search, source validation, structured extraction | `webSearch`, `returnToCoordinator` |
| **Writer** | Content creation in multiple formats (blog, article, report) | `formatContent`, `returnToCoordinator` |
| **Editor** | Grammar, clarity, polish, final quality assessment | `assessQuality`, `returnToCoordinator` |

#### v2 agents

| Agent | Role | Tools |
|---|---|---|
| **Backend** | APIs, data models, services | `coordinationTool`, `readMessages`, `markCompleted` |
| **Frontend** | Components, state, layouts | `coordinationTool`, `readMessages`, `markCompleted` |
| **Design** | UI/UX, styling, visual guidelines | `coordinationTool`, `readMessages`, `markCompleted` |

#### v3 agents

| Agent | Role | Tools |
|---|---|---|
| **Node** (one role-parameterized agent; the lead invents child roles) | Decompose, do focused work, or synthesize | `spawnSubAgent`, `finalize`, and `webSearch` when the role/task is research-y |

Every agent runs on the per-request model (default `gpt-5.5`).

## Features

- **Three coordination patterns** — orchestrated, choreographed, hierarchical — switchable from the chat UI.
- **Live streaming** — agent reasoning (`onStepFinish`), tool calls, and web searches stream to the UI as they happen.
- **Cost estimates** — per-step and per-run token cost (indicative pricing in `lib/models.ts`), shown in the timeline, message meta, and terminal summaries.
- **Chat history** — conversations persist in localStorage; collapsible sidebar with running indicators; runs continue in the background when you switch chats and write back to their originating chat.
- **Code preview sidecar** — detects code/JSON in deliverables; a slide-over pane with syntax highlighting, copy, and a **live HTML/React preview** (sandboxed iframe).
- **Debug stream** — a drawer of every event with pretty-printed JSON and per-event detail.
- **Human-in-the-loop** — v1 can pause and ask the user a question mid-run.
- **Per-conversation message bus** — no cross-request state leakage (each `Conversation` owns its own bus).
- **Styled terminal logs** — `chalk` + `boxen` boxes, a dependency-free spinner, and consistent per-agent output.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Runtime**: React 19
- **AI SDK**: Vercel AI SDK (Experimental Agent API)
- **LLMs**: OpenAI — default `gpt-5.5`, picked per-request from a dropdown (see Chat UI)
- **Validation**: Zod
- **Styling**: Tailwind CSS 4
- **UI**: lucide-react icons, custom inline markdown renderer, `chalk` + `boxen` for terminal logs
- **Language**: TypeScript
- **Package Manager**: pnpm

## Getting Started

### Prerequisites

- Node.js 20.9+ (Next 16 requires it)
- pnpm (or npm/yarn)
- OpenAI API key. The model dropdown defaults to `gpt-5.5` — ensure your account has access. Other listed ids only work if enabled on your account/org.

### Installation

1. Clone the repository:
```bash
git clone https://github.com/MarcusElwin/multi-agents-team.git
cd multi-agents-team
```

2. Install dependencies:
```bash
pnpm install
```

3. Create environment file and add your key:
```bash
cp .env.example .env.local
# then edit .env.local:
# OPENAI_API_KEY=sk-...
```

### Running the Application

#### Development Server
```bash
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) to view the app.

#### Test Agents via CLI

```bash
# v1 — orchestrated (coordinator + researcher + writer + editor)
pnpm test:agents

# v2 — choreographed (backend + frontend + design)
pnpm test:runner
```

`pnpm test:agents` exercises the full v1 collaboration: the coordinator analyzes the request, delegates to the researcher (which searches the web), then the writer drafts, the editor polishes, and the coordinator returns the final output.

`pnpm test:runner` exercises v2: agents start in random order, message each other through the bus, and the run ends when all three call `markCompleted`.

#### Build for Production
```bash
pnpm build
pnpm start
```

## Chat UI

The app ships with a built-in chat UI at `/`. Centered welcome state, suggestion chips, bottom-anchored input, rounded message bubbles, lucide icons, and a stone/neutral palette.

### Header controls

- **Model selector** — dropdown of OpenAI models from `lib/models.ts`. The selected model applies to every agent in the run.
- **Mode toggle** — switch between `v1 orchestrated`, `v2 choreographed`, and `v3 hierarchical`, routing to `/api/agents`, `/api/agents-v2`, or `/api/agents-v3`.
- **Debug** — opens the live event-stream drawer.

### Conversation

- **Welcome state** shows mode-aware suggestion chips and a collapsible architecture panel.
- **Live view while running**:
  - v1/v2 → an agent **timeline** with expandable rows (live reasoning, tool calls, web searches) and a running cost readout.
  - v3 → a live **agent tree** that fills in as sub-agents spawn, with per-node status, duration, and cost.
- **Completed messages**:
  - v1/v3 → a single synthesized markdown report (long reports collapse; fenced code renders as code blocks; a "View code" button opens the preview pane).
  - v2 → a **build-plan board**: the goal plus a card per agent with a collapsible deliverable.
- **Meta pills** under each reply show mode, model, iterations/agents, duration, and estimated cost.
- **Sidebar** lists past conversations (localStorage), grouped by recency, with a running dot for in-flight runs.

### Available models

From `lib/models.ts`:

| Model | Description |
|---|---|
| `gpt-5.5` | **Default.** Flagship — best for coding & reasoning |
| `gpt-5.4` | More affordable flagship-class |
| `gpt-5.4-mini` | Strong mini — fast, lower cost |
| `gpt-5.4-nano` | Fastest, most cost-efficient |
| `gpt-4.1` | Legacy fallback |
| `o4-mini` | Reasoning, lightweight |

> **⚠️ Caveat:** picking a model id that isn't enabled on your OpenAI account/org returns a 4xx in the chat. Unknown/unavailable values passed to the API fall back to the default. Verify access with `curl https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY"`.

## API Routes

All three architectures are exposed as **Server-Sent Events** endpoints (`Content-Type: text/event-stream`). Each `data:` frame is a JSON `AgentEvent` (see `lib/agent-events.ts`); the run ends with a `workflow_complete` (or `workflow_error`) event. `model` and `history` are optional in the request body.

### POST `/api/agents` (v1, max 60s)

```bash
curl -N -X POST http://localhost:3000/api/agents \
  -H "Content-Type: application/json" \
  -d '{"message": "Write a blog post about AI agents", "model": "gpt-5.5"}'
```

Streams `workflow_start`, `iteration_start`/`iteration_end`, `agent_step`, `tool_call`, `web_search`, `agent_plan`, `bus_message`, `handoff`, and finally `workflow_complete` with the synthesized `result`.

### POST `/api/agents-v2` (v2, max 120s)

```bash
curl -N -X POST http://localhost:3000/api/agents-v2 \
  -H "Content-Type: application/json" \
  -d '{"message": "Design a notification preferences settings page"}'
```

Streams per-agent `iteration_*` events and ends with `workflow_complete` carrying `agentResults` (one deliverable per agent, deduped to the latest).

### POST `/api/agents-v3` (v3, max 300s)

```bash
curl -N -X POST http://localhost:3000/api/agents-v3 \
  -H "Content-Type: application/json" \
  -d '{"message": "Plan and build a habit-tracker app: research, data model, API, and a UI component"}'
```

Streams `agent_spawn` events (building the tree) plus `iteration_*`, and ends with `workflow_complete` carrying the lead's synthesized `result`.

Each route also has a `GET` returning a small readiness/status object.

## Project Structure

```
multi-agents-team/
├── app/
│   ├── api/
│   │   ├── agents/route.ts            # v1 (orchestrated) SSE endpoint
│   │   ├── agents/input/route.ts      # human-in-the-loop answer delivery
│   │   ├── agents-v2/route.ts         # v2 (choreographed) SSE endpoint
│   │   └── agents-v3/route.ts         # v3 (hierarchical) SSE endpoint
│   ├── components/
│   │   ├── AgentTimeline.tsx          # v1/v2 live timeline (expandable rows)
│   │   ├── AgentTree.tsx              # v3 live hierarchical tree
│   │   ├── ArchitecturePanel.tsx      # collapsible per-mode diagram
│   │   ├── BuildPlan.tsx              # v2 build-plan board
│   │   ├── ChatSidebar.tsx            # localStorage chat history
│   │   ├── CodePreview.tsx            # code/JSON pane + live HTML/React preview
│   │   ├── DebugDrawer.tsx            # live event stream
│   │   ├── InputRequestCard.tsx       # human-in-the-loop prompt
│   │   ├── MarkdownContent.tsx        # inline markdown renderer
│   │   ├── ModeSelector.tsx           # v1/v2/v3 toggle
│   │   └── ModelSelector.tsx          # OpenAI model dropdown
│   ├── hooks/
│   │   └── useConversations.ts        # localStorage-backed chat store
│   ├── layout.tsx
│   └── page.tsx                       # full chat UI
├── lib/
│   ├── agents/                        # v1 agents (factory functions)
│   ├── agents-v2/                     # v2 agents (backend/frontend/design)
│   ├── agents-v3/
│   │   └── node-agent.ts              # role-parameterized hierarchical node
│   ├── tools/
│   │   └── web-search.ts              # reusable web-search tool
│   ├── utils/
│   │   ├── cn.ts                      # clsx + tailwind-merge
│   │   └── extract-code.ts            # code-block extraction + preview docs
│   ├── agent-events.ts                # AgentEvent union + AgentHooks
│   ├── conversation.ts                # per-run Conversation (owns its bus)
│   ├── logger.ts                      # chalk/boxen logger + spinner
│   ├── message-bus.ts                 # per-conversation pub/sub bus
│   ├── models.ts                      # model catalog, pricing, cost helpers
│   ├── modes.ts                       # v1/v2/v3 mode specs
│   ├── orchestrator.ts                # v1 hub-and-spoke orchestrator
│   ├── runner.ts                      # v2 round-robin runner
│   └── hierarchical-runner.ts         # v3 recursive runner
├── scripts/
│   ├── test-agents.ts                 # CLI test for v1
│   └── test-runner.ts                 # CLI test for v2
├── docs/
│   └── ARCHITECTURE.md                # deep-dive on the architectures
└── README.md
```

## Configuration

### Models & cost

The catalog, default, and indicative pricing live in `lib/models.ts`:

```typescript
export const DEFAULT_MODEL: OpenAIModel = 'gpt-5.5';
export const MODEL_OPTIONS = [...];           // see "Available models"
export const MODEL_PRICING: Record<OpenAIModel, { input: number; output: number }>;
export function resolveModel(input?: string): OpenAIModel;  // safe, with fallback
export function estimateCost(model, usage): number;          // USD
```

Every agent ships as a **factory function** so the runners can rebuild it per request with the chosen model and event hooks:

```typescript
import { createCoordinatorAgent } from '@/lib/agents';
const agent = createCoordinatorAgent('gpt-5.4-mini', hooks);
```

The orchestrator/runners accept `{ model }` and wire per-run event hooks internally:

```typescript
new AgentOrchestrator({ model: 'gpt-5.4-mini' });
runAgentsWithCoordination('build a thing', { model: 'gpt-5.4-mini' });
runHierarchical('research and build X', { model: 'gpt-5.5' });
```

### Caps & timeouts

| | v1 | v2 | v3 |
|---|---|---|---|
| Iteration / node cap | `maxIterations = 15` | `maxIterations = 10` | depth 2 · width 4 · 15 nodes |
| API `maxDuration` | 60s | 120s | 300s |

## Extending the System

### Adding a new mode

PR-level reference: the v3 PR adds a mode end-to-end. The pieces are:

1. Agents in `lib/agents-vN/` (factory functions taking `(model, hooks)`).
2. A runner in `lib/` that drives the loop and emits `AgentEvent`s.
3. An SSE route at `app/api/agents-vN/route.ts`.
4. Any new event variants in `lib/agent-events.ts` (and widen the `mode` unions).
5. A `MODES.vN` spec in `lib/modes.ts` (label, diagram, suggestions).
6. UI wiring in `app/page.tsx` (+ a render component if the output shape is new).

### Adding a tool

```typescript
tools: {
  yourTool: tool({
    description: 'What this tool does',
    inputSchema: z.object({ param: z.string() }),
    execute: async ({ param }) => ({ result: 'value' }),
  }),
}
```

For shared tools (like `lib/tools/web-search.ts`), export a `makeXTool(model, hooks)` factory so it can emit hook events into the live run.

## Troubleshooting

- **"OPENAI_API_KEY not found"** — ensure `.env.local` exists; restart the dev server after adding env vars.
- **4xx on a request** — the chosen model id isn't enabled on your account; pick another or verify access.
- **Node version error** — Next 16 needs Node ≥ 20.9 (`nvm use 20`).
- **Run hits the cap** — v2/v3 can reach their iteration/node caps on very open-ended prompts; tighten the prompt or raise the cap.
- **Cost shows $0** — the AI SDK didn't return token `usage` for that call; estimates depend on it. Pricing is indicative, not billing-accurate.

## Deploy on Vercel

```bash
npm i -g vercel
vercel
# Settings → Environment Variables → add OPENAI_API_KEY
```

## License

MIT License

## Acknowledgments

- Built with [Vercel AI SDK](https://sdk.vercel.ai/)
- Powered by [OpenAI](https://openai.com/)

---

**Note**: This project uses OpenAI's experimental Agent API. Features may change as the SDK evolves.
