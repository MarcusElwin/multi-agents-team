# Multi-Agent AI System

A multi-agent AI playground built with Next.js and the Vercel AI SDK. It ships **two distinct multi-agent architectures** sharing a common message bus, each exposed as its own API route.

## Overview

This repo demonstrates two complementary patterns for coordinating LLM agents:

- **v1 — Orchestrated** (hub-and-spoke): a coordinator agent delegates work to research / writer / editor specialists. Best for content pipelines.
- **v2 — Choreographed** (peer-to-peer): backend / frontend / design agents run in a round-robin and message each other directly via the bus. Best for cross-discipline collaboration.

For the deep-dive comparison, ASCII diagrams, and trade-offs, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Architecture

### v1 — Orchestrated (`lib/agents/` + `lib/orchestrator.ts`)

```
                        ┌──────────────┐
            user ─────▶ │ /api/agents  │
                        └──────┬───────┘
                               ▼
                  ┌────────────────────────┐
                  │  AgentOrchestrator     │ ◀── reads bus, builds prompts
                  │  - LLM-driven routing  │
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
            user ─────▶│ /api/agents-v2   │
                       └────────┬─────────┘
                                ▼
                  ┌─────────────────────────┐
                  │      AgentRunner        │
                  │  - round-robin schedule │
                  │  - max 10 iterations    │
                  │  - all-must-complete    │
                  └───────────┬─────────────┘
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌─────────┐     ┌─────────┐     ┌─────────┐
        │ backend │ ◀──▶│frontend │ ◀──▶│ design  │
        └─────────┘     └─────────┘     └─────────┘
              └─── pub/sub via lib/message-bus.ts ───┘
```

### Specialized Agents

#### v1 agents

| Agent | Model | Role | Tools |
|---|---|---|---|
| **Coordinator** | `gpt-5.5` | Orchestrates the workflow; analyzes requests, delegates, synthesizes results | `analyzeRequest`, `delegateToAgent`, `markComplete` |
| **Researcher** | `gpt-5.4-mini` | Real-time web search, source validation, structured extraction | `webSearch`, `returnToCoordinator` |
| **Writer** | `gpt-5.4-mini` | Content creation in multiple formats (blog, article, report) | `formatContent`, `returnToCoordinator` |
| **Editor** | `gpt-5.4-mini` | Grammar, clarity, polish, final quality assessment | `assessQuality`, `returnToCoordinator` |

#### v2 agents

| Agent | Model | Role | Tools |
|---|---|---|---|
| **Backend** | `gpt-5.4-mini` | Backend / API design contributions | `coordinationTool`, `markCompleted` |
| **Frontend** | `gpt-5.4-mini` | Frontend implementation contributions | `coordinationTool`, `markCompleted` |
| **Design** | `gpt-5.4-mini` | Product design and UX contributions | `coordinationTool`, `markCompleted` |

## Features

### Message Bus Pattern
- Event-driven architecture for agent communication
- Full conversation history with metadata
- Context preservation across handoffs
- Tool results embedded in messages

### Workflow Management
- Sequential agent handoffs
- Context passing between agents
- Automatic completion detection
- Structured data flow

### Advanced Capabilities
- **Web Search Integration**: Real-time information retrieval
- **Structured Output**: Zod schema-based data extraction
- **Multi-step Reasoning**: Complex task decomposition
- **Extensible Tools**: Easy to add new agent capabilities

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Runtime**: React 19
- **AI SDK**: Vercel AI SDK (Experimental Agent API)
- **LLMs**: OpenAI — default `gpt-5`, picked per-request from a dropdown of 8 models (see Chat UI)
- **Validation**: Zod
- **Styling**: Tailwind CSS 4
- **UI**: lucide-react icons, custom inline markdown renderer, `chalk` + `boxen` for terminal logs
- **Language**: TypeScript
- **Package Manager**: pnpm

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm (or npm/yarn)
- OpenAI API key. The model dropdown defaults to `gpt-5`, so make sure your account has access to that one. Other listed models (`gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-5-mini`, `gpt-4.1`, `o4-mini`) will only work if your account/org has them enabled.

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/multi-agents-team.git
cd multi-agents-team
```

2. Install dependencies:
```bash
pnpm install
```

3. Create environment file:
```bash
cp .env.example .env.local
```

4. Add your OpenAI API key to `.env.local`:
```env
OPENAI_API_KEY=sk-...
```

### Running the Application

#### Development Server
```bash
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) to view the Next.js app.

#### Test Agents via CLI

```bash
# v1 — orchestrated (coordinator + researcher + writer + editor)
pnpm test:agents

# v2 — choreographed (backend + frontend + design)
pnpm test:runner
```

`pnpm test:agents` exercises the full v1 collaboration:
1. User request: "Write a blog post about multi-agent AI systems"
2. Coordinator analyzes and delegates to Researcher
3. Researcher searches the web and structures findings
4. Writer creates a draft blog post
5. Editor polishes and finalizes content
6. Coordinator returns final output

`pnpm test:runner` exercises v2: agents start in random order, message each other through the bus, and the run ends when all three call `markCompleted`.

### Build for Production
```bash
pnpm build
pnpm start
```

## Chat UI

The app ships with a built-in chat UI at `/` (i.e. `http://localhost:3000` after `pnpm dev`). It mirrors the visual language of the [`agentic-checkout-demo`](../agentic-checkout-demo) app: centered welcome state, suggestion chips, bottom-anchored input with `ArrowUp` send button, rounded message bubbles, lucide icons, and a stone/neutral palette.

### Header controls

- **Model selector** (top-right) — dropdown of OpenAI models, mirrored from `agentic-checkout-demo`'s catalog. The selected model is sent with every request and applied to every agent (coordinator + specialists, or backend/frontend/design) for that run.
- **Mode toggle** — switch between `v1 orchestrated` (coordinator + research/write/edit) and `v2 choreographed` (backend + frontend + design). Routes the request to `/api/agents` or `/api/agents-v2` accordingly.

### Conversation

- **Welcome state** shows mode-aware suggestion chips. Clicking one fires the request immediately.
- **Thinking indicator** is mode-aware ("Coordinator is dispatching specialists…" vs "Agents are coordinating via the message bus…").
- **Per-message metadata pills** under each assistant reply show: mode (orchestrated/choreographed), model id, iterations / message count, total duration, and either `agentsUsed` (v1) or per-agent timing + completion checkmarks (v2).
- **v2 rendering** — since `/api/agents-v2` returns three independent outputs, the assistant message stitches them as `## Backend / ## Frontend / ## Design` markdown sections, each with its own duration/completion badge.

### Available models

The dropdown lists the following (from `lib/models.ts`):

| Model | Description |
|---|---|
| `gpt-5.5` | Highest quality (verify access) |
| `gpt-5.4` | Balanced flagship (verify access) |
| `gpt-5.4-mini` | Fast (verify access) |
| `gpt-5.4-nano` | Fastest, cheapest (verify access) |
| `gpt-5` | **Default.** Reliable general purpose |
| `gpt-5-mini` | Fast and cheap |
| `gpt-4.1` | Legacy fallback |
| `o4-mini` | Reasoning, lightweight |

> **⚠️ Caveat:** the dropdown lets you pick any of these, but if the model id isn't enabled on your OpenAI account/org you'll get a 4xx error in the chat. The list intentionally mirrors what the `agentic-checkout-demo` UI exposes — it is **not** a guarantee that every id is callable. Verify with `curl https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY"` if a request fails.

The default (`gpt-5`) is also what every CLI script (`pnpm test:agents`, `pnpm test:runner`) uses when no model override is supplied.

## API Routes

Both architectures are exposed as REST endpoints. Pick the one that fits your task.

### v1 — Orchestrated

#### POST `/api/agents`

```bash
curl -X POST http://localhost:3000/api/agents \
  -H "Content-Type: application/json" \
  -d '{"message": "Write a blog post about AI agents", "model": "gpt-5"}'
```

`model` is optional — omit it to use the default (`gpt-5`). Unknown values fall back to the default rather than erroring.

Response:
```json
{
  "success": true,
  "model": "gpt-5",
  "result": "Final polished content from the workflow...",
  "messageHistory": [...],
  "totalMessages": 15,
  "agentsUsed": ["coordinator", "researcherAgent", "writerAgent", "editorAgent"]
}
```

- 60-second max duration
- One synthesized final string + full message history
- The chosen `model` applies to every agent in the run

#### GET `/api/agents`

```bash
curl http://localhost:3000/api/agents
```

```json
{
  "status": "ready",
  "agents": ["coordinator", "researcherAgent", "writerAgent", "editorAgent"],
  "messageBusActive": true
}
```

### v2 — Choreographed

#### POST `/api/agents-v2`

```bash
curl -X POST http://localhost:3000/api/agents-v2 \
  -H "Content-Type: application/json" \
  -d '{"message": "Design and build a task management feature with priorities, assignment, and notifications", "model": "gpt-5"}'
```

`model` is optional — same fallback behavior as v1.

Response:
```json
{
  "success": true,
  "model": "gpt-5",
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
  "messageBusStats": { "totalMessages": 17, "uniqueAgents": [...] }
}
```

- 120-second max duration (three agents serially)
- Per-agent outputs + coordination log + bus stats
- The chosen `model` applies to all three agents

#### GET `/api/agents-v2`

```bash
curl http://localhost:3000/api/agents-v2
```

```json
{
  "status": "ready",
  "pattern": "choreography (peer-to-peer, round-robin)",
  "agents": ["backendAgent", "frontendAgent", "designAgent"],
  "messageBusActive": true,
  "currentBusStats": {...}
}
```

> **Note:** the `messageBus` is a process-wide singleton, so concurrent v2 requests will clobber each other's state. Fine for development; for production you'd want per-request bus instances.

## Project Structure

```
multi-agents-team/
├── app/
│   ├── api/
│   │   ├── agents/
│   │   │   └── route.ts             # v1 (orchestrated) endpoint
│   │   └── agents-v2/
│   │       └── route.ts             # v2 (choreographed) endpoint
│   ├── components/
│   │   ├── MarkdownContent.tsx      # inline markdown renderer
│   │   └── ModelSelector.tsx        # OpenAI model dropdown
│   ├── layout.tsx
│   └── page.tsx                     # full chat UI (welcome + conversation)
├── lib/
│   ├── agents/                       # v1 agents (factories + back-compat singletons)
│   │   ├── coordinator-agent.ts
│   │   ├── researcher-agent.ts
│   │   ├── writer-agent.ts
│   │   ├── editor-agent.ts
│   │   └── index.ts
│   ├── agents-v2/                    # v2 agents (same shape)
│   │   ├── backend.ts
│   │   ├── frontend.ts
│   │   └── design.ts
│   ├── utils/
│   │   └── cn.ts                     # clsx + tailwind-merge
│   ├── logger.ts                     # chalk/boxen terminal logger
│   ├── message-bus.ts                # shared pub/sub bus
│   ├── models.ts                     # OpenAI model catalog + resolveModel()
│   ├── orchestrator.ts               # v1 hub-and-spoke orchestrator
│   └── runner.ts                     # v2 round-robin runner
├── scripts/
│   ├── test-agents.ts                # CLI test for v1
│   └── test-runner.ts                # CLI test for v2
├── docs/
│   └── ARCHITECTURE.md               # deep-dive on both architectures
├── package.json
├── tsconfig.json
├── next.config.ts
└── README.md
```

## Usage Examples

### Using the API

```typescript
// Example: Trigger workflow from frontend
async function runAgentWorkflow(userMessage: string) {
  const response = await fetch('/api/agents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: userMessage })
  });

  const data = await response.json();
  console.log('Result:', data.result);
  console.log('Agents used:', data.agentsUsed);
  console.log('Total messages:', data.totalMessages);

  return data;
}

// Use it
await runAgentWorkflow("Research and write about quantum computing");
```

### Using Orchestrator Directly

```typescript
import { AgentOrchestrator } from '@/lib/orchestrator';
import { messageBus } from '@/lib/message-bus';

const orchestrator = new AgentOrchestrator(messageBus);
const result = await orchestrator.processUserMessage(
  "Write a technical report on neural networks"
);

// Get workflow statistics
const stats = orchestrator.getConversationSummary();
console.log('Agents involved:', stats.agentsInvolved);
console.log('Total messages:', stats.totalMessages);
```

### CLI Testing

```bash
# Run the test suite
pnpm test:agents

# Customize test cases in scripts/test-agents.ts
const testCases = [
  {
    name: 'Research Only',
    message: "Research the latest AI trends"
  },
  {
    name: 'Full Workflow',
    message: "Write a comprehensive guide on LLMs"
  }
];
```

## How It Works

### Workflow Example

```typescript
// User request
const userMessage = "Write a blog post about multi-agent AI systems";

// 1. Coordinator analyzes
coordinator.analyzeRequest({
  userIntent: "Create blog content",
  selectedAgents: [
    { agent: 'researcherAgent', task: 'Research multi-agent systems', order: 1 },
    { agent: 'writerAgent', task: 'Write blog post', order: 2 },
    { agent: 'editorAgent', task: 'Polish content', order: 3 }
  ]
});

// 2. Researcher gathers info
researcher.webSearch({
  query: "multi-agent AI systems benefits",
  extractionGoal: "key benefits and use cases"
});

// 3. Writer creates content
writer.formatContent({
  content: researchFindings,
  style: 'blog'
});

// 4. Editor polishes
editor.assessQuality({ content: draft });

// 5. Coordinator marks complete
coordinator.markComplete({ finalResponse: polishedContent });
```

## Configuration

### Agent Models

Each agent ships as both a default singleton **and** a factory function so you can override the model per request:

```typescript
// Default singletons (use DEFAULT_MODEL = 'gpt-5')
export const coordinatorAgent = createCoordinatorAgent();
export const researcherAgent = createResearcherAgent();

// Per-request override
import { createCoordinatorAgent } from '@/lib/agents';
const fastCoordinator = createCoordinatorAgent('gpt-5-mini');
```

The catalog and default live in `lib/models.ts`:

```typescript
export const DEFAULT_MODEL: OpenAIModel = 'gpt-5';
export const MODEL_OPTIONS = [...]; // see "Available models" above
export function resolveModel(input?: string): OpenAIModel; // safe, with fallback
```

`AgentOrchestrator` and `AgentRunner` both accept `{ model }` in their constructor / convenience function — when set to anything other than `DEFAULT_MODEL`, they rebuild every agent with the chosen model:

```typescript
new AgentOrchestrator(messageBus, { model: 'gpt-5-mini' });
runAgentsWithCoordination('build a thing', { model: 'gpt-5.4-mini' });
```

### Max Iterations

- v1 — `lib/orchestrator.ts`: `const maxIterations = 15`
- v2 — `lib/runner.ts`: `private maxIterations = 10`

### API Timeout

- v1 — `app/api/agents/route.ts`: `export const maxDuration = 60`
- v2 — `app/api/agents-v2/route.ts`: `export const maxDuration = 120`

## Extending the System

### Adding a New Agent

1. Create agent file in `lib/agents/`:

```typescript
// lib/agents/fact-checker-agent.ts
export const factCheckerAgent = new Agent({
  model: openai('gpt-4.1'),
  system: `You are a fact-checking specialist...`,
  tools: {
    verifyFact: tool({ /* ... */ }),
    returnToCoordinator: tool({ /* ... */ })
  }
});
```

2. Add to `lib/agents/index.ts`:
```typescript
export { factCheckerAgent } from './fact-checker-agent';
```

3. Update orchestrator types and routing

### Adding a New Tool

```typescript
// In any agent file
tools: {
  yourNewTool: tool({
    description: 'What this tool does',
    inputSchema: z.object({
      param: z.string()
    }),
    execute: async ({ param }) => {
      // Tool logic
      return { result: 'value' };
    }
  })
}
```

## Troubleshooting

### Common Issues

1. **"OPENAI_API_KEY not found"**
   - Ensure `.env.local` exists with valid API key
   - Restart dev server after adding env vars

2. **Agent timeouts**
   - Check network connection
   - Verify OpenAI API status
   - Increase `maxIterations` if needed

3. **Workflow incomplete**
   - Check agent logs for errors
   - Verify tool schemas match expected inputs
   - Review message bus history for handoff issues

4. **API timeout (Vercel)**
   - Workflows exceeding 60s will timeout on Vercel
   - Consider using serverless functions with longer timeouts
   - Or implement streaming responses

## Performance Considerations

- **Token Usage**: Each agent interaction consumes tokens. Monitor via OpenAI dashboard.
- **Latency**: Web searches and multiple agent hops add latency (typically 10-30s for full workflow)
- **Rate Limits**: OpenAI API rate limits apply
- **Caching**: Message bus maintains full history (consider cleanup for long sessions)

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme).

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Add environment variables in Vercel dashboard
# Settings → Environment Variables → Add OPENAI_API_KEY
```

## License

MIT License

## Acknowledgments

- Built with [Vercel AI SDK](https://sdk.vercel.ai/)
- Powered by [OpenAI](https://openai.com/)

---

**Note**: This project uses OpenAI's experimental Agent API. Features may change as the SDK evolves.
