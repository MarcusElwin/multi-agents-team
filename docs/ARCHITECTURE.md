# Multi-Agent Team — Architecture

This repo contains **two distinct multi-agent architectures** that share a common message bus but implement different coordination patterns. Both are exposed as Next.js API routes.

| | **v1 — Orchestrated** | **v2 — Choreographed** |
|---|---|---|
| Location | `lib/agents/` + `lib/orchestrator.ts` | `lib/agents-v2/` + `lib/runner.ts` |
| Pattern | Hub-and-spoke (centralized control) | Peer-to-peer round-robin (decentralized) |
| Agents | coordinator, researcher, writer, editor | backend, frontend, design |
| Routing decision | LLM (coordinator decides next agent) | Code (`(index + 1) % agents.length`) |
| Termination | Coordinator calls `markComplete` | All agents independently call `markCompleted` |
| Starting agent | Always coordinator | Random |
| Iteration cap | 15 | 10 |
| API route | `POST /api/agents` | `POST /api/agents-v2` |
| CLI | `pnpm test:agents` | `pnpm test:runner` |
| Output | Single synthesized string | Per-agent outputs + coordination log |
| Best for | Content workflows (research → write → edit) | Cross-discipline collaboration (build a feature) |

Both architectures use the same shared `lib/message-bus.ts` — but v1 treats it as a passive log the orchestrator reads from, while v2 uses it as an active pub/sub channel agents subscribe to.

---

## v1 — Orchestrated (`lib/agents/`)

```
                        ┌──────────────┐
            user ─────▶ │ /api/agents  │
                        └──────┬───────┘
                               │
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
              │            │             │
              └────────────┴─────────────┘
                           │ done() → returns to coordinator
                           ▼
                     coordinator decides:
                     more work? OR markComplete()
```

### How it works

1. `POST /api/agents { message }` hits `app/api/agents/route.ts:7`.
2. Route instantiates `AgentOrchestrator` (`lib/orchestrator.ts:11`) and calls `processUserMessage`.
3. The orchestrator publishes the user message to the bus addressed to `coordinator`.
4. Each iteration:
   - `buildPromptFromMessageBus(currentAgent)` synthesizes a tailored prompt by reading bus history (research findings, drafts, handoff context, etc.).
   - The agent runs `generate({ prompt })` against OpenAI.
   - `detectHandoff(result)` inspects tool results for `delegateToAgent` (specialist routing) or `done` (return to coordinator).
   - `detectCompletion(result)` looks for `markComplete` (coordinator) or `workflowComplete` (editor).
5. Loop ends on completion or after 15 iterations.

### Key properties

- **Centralized:** the coordinator is the only agent that decides routing. Specialists never address each other directly.
- **LLM-driven control flow:** routing is a tool call, so the LLM is making the workflow decisions.
- **Heavy prompt synthesis:** the orchestrator does substantial work in `buildPromptFromMessageBus` to inject prior context into each agent's prompt — agents do not subscribe to the bus themselves.
- **Single output:** the API returns one final string + the full message history.

### When to use v1

- Linear pipelines (research → draft → polish).
- You want one synthesized answer.
- You want the LLM (not your code) to decide what comes next.

---

## v2 — Choreographed (`lib/agents-v2/`)

```
                       ┌──────────────────┐
            user ─────▶│ /api/agents-v2   │
                       └────────┬─────────┘
                                │
                                ▼
                  ┌─────────────────────────┐
                  │      AgentRunner        │
                  │  - round-robin scheduler│
                  │  - max 10 iterations    │
                  │  - completion = all done│
                  └───────────┬─────────────┘
                              │
              publishes user query to ALL agents
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌─────────┐     ┌─────────┐     ┌─────────┐
        │ backend │ ◀──▶│frontend │ ◀──▶│ design  │
        └─────────┘     └─────────┘     └─────────┘
              │               │               │
              └───────────────┴───────────────┘
                              ▼
                     ┌──────────────────┐
                     │   messageBus     │ ◀── pub/sub: each agent
                     │   (pub/sub)      │     subscribes to its own
                     └──────────────────┘     inbox at module load
```

### How it works

1. `POST /api/agents-v2 { message }` hits `app/api/agents-v2/route.ts`.
2. Route calls `runAgentsWithCoordination(message)` from `lib/runner.ts`.
3. The runner clears the bus, then publishes the user query to each agent's inbox.
4. A starting agent is chosen **randomly**.
5. Each iteration:
   - Run the current agent with the raw user query as prompt.
   - Inter-agent context arrives via `messageBus.subscribe('frontendAgent', cb)` listeners declared at the top of each agent file (`lib/agents-v2/frontend.ts:10`, etc.) — agents read their own inbox.
   - Agents can `publish` messages addressed to specific peers using their `coordinationTool`.
   - `detectCompletion(result)` checks if the agent called `markCompleted`.
   - Move to next agent in the ring (skip if already completed).
6. Loop ends when **all** agents have marked completed, or after 10 iterations.

### Key properties

- **Decentralized:** no coordinator. Agents talk to each other via the pub/sub bus.
- **Code-driven scheduling:** the runner decides whose turn it is, not an LLM.
- **Per-agent completion:** each agent independently signals when its part is done.
- **Multiple outputs:** the API returns each agent's final output plus the full coordination log.

### When to use v2

- Cross-discipline collaboration where each agent owns a deliverable (backend code, frontend code, design spec).
- You want emergent multi-agent behavior, not a fixed pipeline.
- You want to inspect the conversation between agents, not just one final answer.

---

## Shared Components

### `lib/message-bus.ts`

A `Message` is `{ id, from, to, content, metadata }`. The bus is a singleton `EventEmitter`:

- `publish(msg)` — appends to `messages[]` and emits both `'message'` and `'message:<to>'` events.
- `subscribe(agentId, cb)` — registers a listener on `'message:<agentId>'`. Used by v2 agents.
- `getMessageHistory(filter?)` — read access. Used by v1 orchestrator.
- `clear()` — wipe state. Called between v2 runs.
- `getStats()` — counts by type, unique agents, handoffs.

v1 uses the bus as a **shared log** (publish + read history). v2 uses it as a **pub/sub channel** (publish + subscribe). The bus supports both because it's just an `EventEmitter` with a backing array.

### Models

Both architectures use OpenAI models via `@ai-sdk/openai`:

- v1 coordinator: `gpt-5.5`
- All other agents (v1 specialists + v2): `gpt-5.4-mini`

Set `OPENAI_API_KEY` in `.env.local`.

---

## API Reference

### `POST /api/agents` — v1 (orchestrated)

```bash
curl -X POST http://localhost:3000/api/agents \
  -H 'Content-Type: application/json' \
  -d '{"message":"Write a short blog post about AI agents"}'
```

Response:

```json
{
  "success": true,
  "result": "<final synthesized output>",
  "messageHistory": [...],
  "totalMessages": 14,
  "agentsUsed": ["coordinator", "researcherAgent", "writerAgent", "editorAgent"]
}
```

`GET /api/agents` returns the agent list and bus state.

### `POST /api/agents-v2` — v2 (choreographed)

```bash
curl -X POST http://localhost:3000/api/agents-v2 \
  -H 'Content-Type: application/json' \
  -d '{"message":"Design and build a task management feature with priorities, assignment, and notifications"}'
```

Response:

```json
{
  "success": true,
  "userQuery": "...",
  "startingAgent": "designAgent",
  "iterations": 5,
  "totalDuration": 28341,
  "agentResults": [
    { "agent": "designAgent",   "output": "...", "duration": 9120, "completed": true },
    { "agent": "backendAgent",  "output": "...", "duration": 8410, "completed": true },
    { "agent": "frontendAgent", "output": "...", "duration": 9540, "completed": true }
  ],
  "coordinationMessages": [...],
  "messageBusStats": {...}
}
```

`GET /api/agents-v2` returns the v2 agent list and current bus stats.

---

## Trade-offs

| Concern | v1 | v2 |
|---|---|---|
| Predictability | High — coordinator enforces order | Low — random start, peer messaging |
| Output coherence | High — one final synthesis | Medium — three outputs to combine |
| Inter-agent context | Synthesized by orchestrator | Self-managed by agents |
| Cost | Higher — coordinator runs every iteration | Lower per agent, but all 3 must run |
| Failure modes | Coordinator hallucinates wrong handoff | Agents talk past each other |
| Debuggability | Single linear trace | Concurrent message log |
