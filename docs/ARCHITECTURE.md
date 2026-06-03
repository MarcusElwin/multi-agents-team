# Multi-Agent Team — Architecture

This repo implements **nine distinct multi-agent coordination patterns** (v1–v9)
over a shared event/message layer. Each is exposed as its own Next.js
**Server-Sent Events** route, driven by a dedicated runner, and emits a stream of
`AgentEvent`s (`lib/agent-events.ts`) that the UI renders live.

This document is the deep dive. For the at-a-glance comparison table, the ASCII
diagram of every pattern, and setup, see the top-level [`README.md`](../README.md)
and each in-app `/architectures/[mode]` page.

## The nine patterns

| Mode | Pattern | Control | Runner | Cap |
|---|---|---|---|---|
| **v1** | Orchestrated | LLM coordinator routes | `lib/orchestrator.ts` | 15 iterations |
| **v2** | Choreographed | Code round-robin, peers message | `lib/runner.ts` | 10 iterations |
| **v3** | Hierarchical | Lead spawns sub-agents at runtime | `lib/hierarchical-runner.ts` | depth 2 · width 4 · 15 nodes |
| **v4** | Evaluator–Optimizer | Generate → critique → revise | `lib/evaluator-optimizer-runner.ts` | score ≥ 8, 4 rounds |
| **v5** | Debate | Two stances argue, a judge rules | `lib/debate-runner.ts` | 3 rounds |
| **v6** | Blackboard | Controller picks who writes the shared board | `lib/blackboard-runner.ts` | 8 rounds |
| **v7** | Market | Agents bid on tasks, best bid wins | `lib/market-runner.ts` | 2 tasks/agent |
| **v8** | Self-Consistency | N parallel samples, a judge selects/merges | `lib/self-consistency-runner.ts` | 4 samples |
| **v9** | Swarm | Identical agents build on a shared scratchpad | `lib/swarm-runner.ts` | 4 agents × 3 rounds |

Every run is bound to a single `Conversation` (`lib/conversation.ts`) that owns
its **own** `MessageBus` and the prior chat history — there is no shared global
state across requests, so concurrent runs cannot leak into one another.

---

## v1 — Orchestrated (`lib/agents/` + `lib/orchestrator.ts`)

```
                        ┌──────────────┐
            user ─────▶ │ /api/agents  │
                        └──────┬───────┘
                               ▼
                  ┌────────────────────────┐
                  │  AgentOrchestrator     │ ◀── reads bus, builds prompts
                  │  - currentAgent state  │
                  │  - max 15 iterations   │
                  └───────────┬────────────┘
                              │ delegateToAgent()
                              ▼
                       ┌────────────┐
                       │ coordinator│ ◀──── always starts here
                       └─────┬──────┘
                             │ handoff
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
         ┌────────┐    ┌────────┐    ┌────────┐
         │researcher│  │ writer │    │ editor │
         └────┬─────┘  └───┬────┘    └───┬────┘
              └────────────┴─────────────┘
                           │ done() → returns to coordinator
                           ▼
                     coordinator decides:
                     more work? OR markComplete()
```

### How it works

1. `POST /api/agents { message, model?, history?, apiKey?, provider? }` hits
   `app/api/agents/route.ts`; the body is validated (`lib/validate-request.ts`)
   and credentials resolved (`lib/provider.ts`).
2. The route instantiates `AgentOrchestrator({ model, apiKey, providerId })` and
   calls `processUserMessage` inside a `withProvider` scope.
3. The orchestrator publishes the user message to the conversation bus addressed
   to `coordinator`.
4. Each iteration:
   - `buildPromptFromMessageBus(currentAgent)` synthesizes a tailored prompt by
     reading bus history (research findings, drafts, handoff context).
   - The agent runs `generate({ prompt })` against the active provider.
   - `detectHandoff` inspects tool results for `delegateToAgent` (specialist
     routing) or `done` (return to coordinator).
   - `detectCompletion` looks for `markComplete` (coordinator).
5. Loop ends on completion or after 15 iterations.

### Key properties

- **Centralized:** the coordinator is the only agent that decides routing.
- **LLM-driven control flow:** routing is a tool call — the model makes the
  workflow decisions.
- **Heavy prompt synthesis:** the orchestrator injects prior context into each
  agent's prompt; specialists do not subscribe to the bus themselves.
- **Single output:** one final synthesized string + the message history.
- **Human-in-the-loop:** the coordinator can pause and ask the user a question
  (`input_request` → `/api/agents/input`).

### When to use v1

Linear pipelines (research → draft → polish) where you want one synthesized
answer and the LLM (not your code) to decide what comes next.

---

## v2 — Choreographed (`lib/agents-v2/` + `lib/runner.ts`)

```
                       ┌──────────────────┐
            user ─────▶│ /api/agents-v2   │
                       └────────┬─────────┘
                                ▼
                  ┌─────────────────────────┐
                  │      AgentRunner        │
                  │  - round-robin scheduler│
                  │  - max 10 iterations    │
                  │  - completion = all done│
                  └───────────┬─────────────┘
              publishes user query to ALL agents
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌─────────┐     ┌─────────┐     ┌─────────┐
        │ backend │ ◀──▶│frontend │ ◀──▶│ design  │
        └─────────┘     └─────────┘     └─────────┘
              └──────────────┬────────────────┘
                             ▼
                     ┌──────────────────┐
                     │  conversation bus│ ◀── pub/sub: each agent
                     │   (per run)      │     reads its own inbox
                     └──────────────────┘
```

### How it works

1. `POST /api/agents-v2` calls `runAgentsWithCoordination(message, opts, sink, conversation)`.
2. The runner uses the conversation's own bus, publishing the user query to each
   agent's inbox.
3. A starting agent is chosen **randomly**.
4. Each iteration: run the current agent; inter-agent context arrives through the
   per-conversation bus; agents `publish` messages to specific peers via their
   `coordinationTool`; `detectCompletion` checks for `markCompleted`; advance the
   ring (skipping completed agents).
5. Loop ends when **all** agents have marked completed, or after 10 iterations.

### Key properties

- **Decentralized:** no coordinator; agents talk to each other via the bus.
- **Code-driven scheduling:** the runner decides whose turn it is, not the LLM.
- **Per-agent completion:** each agent independently signals when it's done.
- **Multiple outputs:** a per-agent deliverable each, rendered as a build-plan
  board.

### When to use v2

Cross-discipline collaboration where each agent owns a deliverable and you want
emergent behavior and an inspectable inter-agent conversation, not a fixed pipeline.

---

## v3 — Hierarchical (`lib/agents-v3/node-agent.ts` + `lib/hierarchical-runner.ts`)

A single role-parameterized **node** agent recursively decomposes the task. The
lead invents child roles at runtime via a `spawnSubAgent` tool; children run **in
parallel** and each parent runs a synthesis pass over its children's results.

### How it works

1. The lead node receives the task and decides whether to `spawnSubAgent` (one
   call per child) or `finalize`.
2. Spawned children run concurrently; a research-y role/task gets a real
   web-search tool (OpenAI provider only).
3. Each non-leaf parent synthesizes its children's deliverables before returning
   upward; `agent_spawn` events let the UI build the tree live.

### Key properties

- **Emergent structure:** the tree shape depends on the task, decided at runtime.
- **Parallel children, recursive synthesis.**
- **Capped:** depth **2**, width **4** per node, **15** total nodes — backstops so
  the tree always terminates.

### When to use v3

Open-ended tasks that naturally break into nested, independent subtasks.

---

## v4 — Evaluator–Optimizer (`lib/evaluator-optimizer-runner.ts`)

A **generator** writes a draft; a **critic** scores it 0–10 with concrete issues;
the generator revises with those issues. Loop until the critic passes
(`THRESHOLD = 8`) or `MAX_ROUNDS = 4`. The best-scoring draft is kept if it never
clears the bar. Each round emits a `critique` event (the score ladder).

- **Self-improving loop**, two roles.
- **Trade-off:** cost grows per round; a never-satisfied critic can burn the budget.
- **Use for:** iteratively improving a single artifact to a quality bar.

---

## v5 — Debate (`lib/debate-runner.ts`)

An **Affirmative** and an **Opposing** debater argue the user's question across
`ROUNDS = 3` back-and-forth turns; a **Judge** then picks a winner and synthesizes
a final answer. The summary (`kind: 'debate'`) renders the turns + verdict.

- **Adversarial:** the strongest case for each side is surfaced before any answer.
- **Trade-off:** adds argument rounds; verdict quality depends on the judge.
- **Use for:** decisions and trade-offs where opposing cases should be heard.

---

## v6 — Blackboard (`lib/blackboard-runner.ts`)

Agents share a structured **blackboard** of named sections. Each round a
content-driven controller (`pickNextRole`) selects one of a fixed roster —
`analyst`, `planner`, `critic` — to read the board and write/update a section.
Stops when a `solution` section settles or the board stops growing, with a
`MAX_ROUNDS = 8` backstop. Each write emits a `blackboard_update` event.

- **Indirect coordination:** agents never message each other; they coordinate
  through the shared workspace.
- **Trade-off:** controller selection can loop; slower than direct messaging.
- **Use for:** answers that assemble from many partial contributions.

---

## v7 — Market (`lib/market-runner.ts`)

Tasks are posted to an **auction board**; a roster of four specialties —
`researcher`, `engineer`, `designer`, `analyst` — submit **bids** (a fit 0–1 and an
estimated USD cost). Each task is awarded greedily to its highest-fit bidder,
subject to a per-agent bundle cap (`MAX_PER_AGENT = 2`); winners then execute their
tasks. Emits `task_posted`, `bid`, and `task_awarded` events.

- **Market allocation:** the best agent for each task is discovered by bidding.
- **Trade-off:** the bid round is extra LLM calls — worth it for larger pools.
- **Use for:** heterogeneous work where the best agent isn't obvious up front.

---

## v8 — Self-Consistency (`lib/self-consistency-runner.ts`)

The same prompt is run as `SAMPLES = 4` **independent samples in parallel**; a
**judge** then either selects the single best sample or merges them into a
consensus (`method: 'select' | 'merge'`). Each completed sample emits a `sample`
event; the summary records which was chosen.

- **Parallelization for quality:** agreement across attempts signals a good answer.
- **Trade-off:** N samples cost N× the tokens of a single attempt for the sampling step.
- **Use for:** questions where one attempt is noisy but consensus is informative.

---

## v9 — Swarm (`lib/swarm-runner.ts`)

`SWARM_SIZE = 4` **identical** agents act every round, for `ROUNDS = 3` rounds, each
leaving a contribution (a `trace`) on a shared scratchpad that the next round
builds on. There are no roles, no controller, and no direct messaging — pure
**stigmergy** (coordination through a shared environment).

- **Emergent convergence** from many cheap, undirected passes.
- **Trade-off:** no structure means redundancy and drift, so it's round-capped.
- **Use for:** open-ended ideation/refinement that benefits from many passes.

---

## Shared components

### `lib/conversation.ts` + `lib/message-bus.ts`

Each run constructs one `Conversation`, which owns its **own** `MessageBus` and the
prior chat `history`. This replaced the former module-level singleton bus, which
leaked state across requests and was unsafe under concurrency. A `Message` is
`{ id, from, to, content, metadata }`; the bus is an `EventEmitter` with a backing
array, supporting both **log** access (`getMessageHistory`, used by v1) and
**pub/sub** (`subscribe`, used by v2). `renderHistory(maxTurns, maxChars)` produces
a compact transcript injected into agent prompts.

### `lib/provider.ts` — provider injection

Per-request model-provider resolution via `AsyncLocalStorage`. A route resolves
credentials, then wraps the run in `withProvider({ providerId, apiKey }, fn)`;
agents/tools call `provider()` (instead of importing a provider) and get a client
bound to that request's key + provider. This isolates per-request credentials
without threading an `apiKey` through every agent factory. With no user key,
OpenAI falls back to the env singleton (`OPENAI_API_KEY`).

### `lib/models.ts` — providers, models, cost

`PROVIDERS` is the registry of model providers, each with a `createClient(apiKey)`,
env var, and key prefix. Four ship today:

| Provider | Env var | Web search |
|---|---|---|
| OpenAI | `OPENAI_API_KEY` | ✅ hosted (Responses API) |
| Anthropic | `ANTHROPIC_API_KEY` | — |
| Mistral AI | `MISTRAL_API_KEY` | — |
| Fireworks AI | `FIREWORKS_API_KEY` | — |

`MODEL_OPTIONS` carries each model's `provider`; `providerForModel`, `resolveModel`,
`MODEL_PRICING`, and `estimateCost` round out the catalog. The default model is
`gpt-5.5`; agents take a `model` param per request. Web search is OpenAI-only and
degrades gracefully under other providers (`webSearchAvailable()`).

Keys can also be supplied per-provider in the in-app **Settings** drawer (stored
in the browser, sent per request, never persisted server-side). Setting
`PUBLIC_BYO_KEY_ONLY=true` ignores the server env keys so a public deploy never
spends the owner's key. See [`SECURITY.md`](../SECURITY.md).

---

## API reference

All nine run routes are **Server-Sent Events** endpoints
(`Content-Type: text/event-stream`). The request body is
`{ message, model?, history?, apiKey?, provider? }`, validated by
`validateAgentRunBody`. Each `data:` frame is a JSON `AgentEvent`; the stream ends
with `workflow_complete` (carrying the result, per-agent data, token usage/cost,
and any pattern-specific `summary`/`report`) or `workflow_error`.

```bash
curl -N -X POST http://localhost:3000/api/agents \
  -H 'Content-Type: application/json' \
  -d '{"message":"Write a short blog post about AI agents","model":"gpt-5.5"}'
```

| Route | Mode | `maxDuration` |
|---|---|---|
| `/api/agents` | v1 orchestrated | 60s |
| `/api/agents-v2` | v2 choreographed | 120s |
| `/api/agents-v3` | v3 hierarchical | 300s |
| `/api/agents-v4` | v4 evaluator–optimizer | 180s |
| `/api/agents-v5` | v5 debate | 180s |
| `/api/agents-v6` | v6 blackboard | 240s |
| `/api/agents-v7` | v7 market | 240s |
| `/api/agents-v8` | v8 self-consistency | 180s |
| `/api/agents-v9` | v9 swarm | 240s |
| `/api/agents/input` | human-in-the-loop answer delivery | — |

Each run route also exposes a `GET` returning a small readiness/status object.

---

## Trade-offs

| Concern | Centralized (v1) | Peer/round-robin (v2) | Recursive (v3) | Iterative (v4) | Adversarial (v5) | Shared-state (v6) | Market (v7) | Sampling (v8) | Swarm (v9) |
|---|---|---|---|---|---|---|---|---|---|
| Predictability | High | Low | Low | Medium | Medium | Medium | Medium | High | Low |
| Control | LLM | Code | LLM | Code loop | Code rounds | Controller | Greedy code | Code + judge | Code rounds |
| Parallelism | None | None | Children | None | None | None | Bids/exec | Samples | All agents |
| Output | One synthesis | Per-agent board | Tree synthesis | Best draft | Judged synthesis | Solution section | Per-task awards | Selected/merged | Converged scratchpad |
| Cost driver | Coordinator runs each iter | All agents must run | Recursive spawning | Rounds | Rounds + judge | Rounds | Bid round | N× samples | size × rounds |
| Main failure mode | Wrong handoff | Talk past each other | Unbounded tree (capped) | Critic never satisfied | Weak judge | Controller loops | Thin bids | Samples agree on wrong | Drift/redundancy |
