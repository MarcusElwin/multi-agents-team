# Multi-Agent AI System

A sophisticated multi-agent AI system built with Next.js and the Vercel AI SDK that orchestrates specialized AI agents to complete complex tasks through collaboration. Features real-time streaming UI with live agent status updates.

## Overview

This project demonstrates an advanced agentic AI architecture where specialized agents work together to research, write, and polish content. The system uses a message bus pattern for inter-agent communication and a coordinator agent to manage the workflow.

**✨ New Features:**
- 🎨 **Interactive Chat UI** - Clean, modern interface for interacting with agents
- 📡 **Real-time Streaming** - See agent responses as they're generated
- 📊 **Live Agent Status** - Visual indicators showing which agent is working
- ⏱️ **Progress Tracking** - Watch the workflow progress through each agent
- 📝 **Activity Logs** - Detailed timeline of agent handoffs and actions

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Orchestrator                        │
│  - Manages agent lifecycle and handoffs                      │
│  - Builds context from message bus                          │
│  - Detects completions and routing                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Message Bus                             │
│  - Event-driven communication                                │
│  - Message history and context                              │
│  - Pub/sub pattern for agent coordination                   │
└─────────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │Researcher│    │  Writer  │    │  Editor  │
    │  Agent   │ →  │  Agent   │ →  │  Agent   │
    └──────────┘    └──────────┘    └──────────┘
         ▲                                  │
         │          Coordinator             │
         └──────────  Agent    ─────────────┘
```

### Specialized Agents

#### 1. Coordinator Agent (GPT-5)
- **Role**: Orchestrates the entire workflow
- **Capabilities**:
  - Analyzes user requests
  - Plans optimal agent sequences
  - Delegates tasks to specialists
  - Synthesizes final results
- **Tools**: `analyzeRequest`, `delegateToAgent`, `markComplete`

#### 2. Researcher Agent (GPT-4.1)
- **Role**: Information gathering and analysis
- **Capabilities**:
  - Real-time web search using OpenAI's web search API
  - Structured data extraction
  - Source validation and citation
  - Key insights synthesis
- **Tools**: `webSearch`, `returnToCoordinator`

#### 3. Writer Agent (GPT-4.1)
- **Role**: Content creation
- **Capabilities**:
  - Transforms research into engaging content
  - Multiple content formats (blog, article, report, etc.)
  - Markdown formatting
  - Audience-appropriate tone and style
- **Tools**: `formatContent`, `returnToCoordinator`

#### 4. Editor Agent (GPT-4.1)
- **Role**: Quality assurance and polish
- **Capabilities**:
  - Grammar and spelling checks
  - Clarity and coherence improvements
  - Quality assessment
  - Final content polish
- **Tools**: `assessQuality`, `returnToCoordinator`

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
- **LLM**: OpenAI GPT-4.1 & GPT-5
- **Validation**: Zod
- **Styling**: Tailwind CSS 4
- **Language**: TypeScript
- **Package Manager**: pnpm

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm (or npm/yarn)
- OpenAI API key with access to GPT-4.1 and GPT-5

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
Open [http://localhost:3000](http://localhost:3000) to view the **interactive chat UI**.

The web interface provides:
- Real-time chat with the multi-agent system
- Live visualization of which agent is currently working
- Progress indicators and completion status
- Full message history
- Suggested prompts to get started

#### Test Agents via CLI
```bash
pnpm test:agents
```

This runs a test workflow demonstrating the full agent collaboration:
1. User request: "Write a blog post about multi-agent AI systems"
2. Coordinator analyzes and delegates to Researcher
3. Researcher searches the web and structures findings
4. Writer creates a draft blog post
5. Editor polishes and finalizes content
6. Coordinator returns final output

### Build for Production
```bash
pnpm build
pnpm start
```

## API Routes

The system exposes REST endpoints for triggering agent workflows:

### POST `/api/chat` (Streaming - Recommended)

**New!** Streaming endpoint with real-time agent status updates.

**Request:**
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Write a blog post about AI agents"}]}'
```

**Response:** Server-Sent Events stream with:
- Real-time agent activation notifications
- Agent handoff events
- Workflow progress updates
- Final results

**Stream Events:**
```json
data: {"type":"agent-status","agent":"coordinator","action":"activated","timestamp":"..."}
data: {"type":"agent-handoff","from":"coordinator","to":"researcherAgent","timestamp":"..."}
data: {"type":"agent-response","agent":"researcherAgent","content":"...","timestamp":"..."}
data: {"type":"final-result","content":"Final polished content...","timestamp":"..."}
data: {"type":"workflow-complete","timestamp":"..."}
```

Used by the chat UI for real-time updates.

### POST `/api/agents` (Non-Streaming)

Trigger a multi-agent workflow.

**Request:**
```bash
curl -X POST http://localhost:3000/api/agents \
  -H "Content-Type: application/json" \
  -d '{"message": "Write a blog post about AI agents"}'
```

**Response:**
```json
{
  "success": true,
  "result": "Final polished content from the workflow...",
  "messageHistory": [
    {
      "id": "uuid",
      "from": "user",
      "to": "coordinator",
      "content": "Write a blog post...",
      "metadata": {
        "timestamp": "2025-01-15T10:30:00.000Z",
        "type": "user"
      }
    }
  ],
  "totalMessages": 15,
  "agentsUsed": ["coordinator", "researcherAgent", "writerAgent", "editorAgent"]
}
```

**Features:**
- 60-second max duration for long-running workflows
- Full message history returned
- Agents used tracking
- Error handling with detailed messages

### GET `/api/agents`

Check system status and available agents.

**Request:**
```bash
curl http://localhost:3000/api/agents
```

**Response:**
```json
{
  "status": "ready",
  "agents": ["coordinator", "researcherAgent", "writerAgent", "editorAgent"],
  "messageBusActive": true
}
```

## Project Structure

```
multi-agents-team/
├── app/
│   ├── api/
│   │   ├── agents/
│   │   │   └── route.ts        # Non-streaming API endpoint
│   │   └── chat/
│   │       └── route.ts        # Streaming API endpoint (new!)
│   ├── components/
│   │   ├── agent-status.tsx    # Agent progress visualization
│   │   └── chat-interface.tsx  # Main chat UI component
│   ├── layout.tsx              # Root layout
│   └── page.tsx                # Home page with chat interface
├── lib/
│   ├── agents/
│   │   ├── coordinator-agent.ts   # Orchestrator agent
│   │   ├── researcher-agent.ts    # Research specialist
│   │   ├── writer-agent.ts        # Writing specialist
│   │   ├── editor-agent.ts        # Editing specialist
│   │   └── index.ts               # Agent exports
│   ├── message-bus.ts             # Event bus for agents
│   └── orchestrator.ts            # Workflow orchestration
├── scripts/
│   └── test-agents.ts             # CLI test script
├── package.json
├── tsconfig.json
├── next.config.ts
└── README.md
```

## Usage Examples

### Using the Web UI (Recommended)

Simply run `pnpm dev` and visit [http://localhost:3000](http://localhost:3000).

**Features:**
- Type your request in the chat input
- Watch agents activate in real-time on the right sidebar
- See loading indicators for each agent (Coordinator → Researcher → Writer → Editor)
- View activity logs showing agent handoffs
- Get final polished results in a highlighted card

**Example prompts:**
- "Write a blog post about the benefits of multi-agent AI systems"
- "Research the latest trends in artificial intelligence and summarize the key findings"
- "Create a technical report on neural networks with citations"

### Using the Streaming API

```typescript
// Example: Using useChat hook (recommended for React apps)
import { useChat } from '@ai-sdk/react';

function MyComponent() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, data } = useChat({
    api: '/api/chat',
    streamProtocol: 'data'
  });

  // Listen to streaming agent status updates
  useEffect(() => {
    if (data && data.length > 0) {
      const latestEvent = data[data.length - 1];

      if (latestEvent.type === 'agent-status') {
        console.log('Agent activated:', latestEvent.agent);
      }

      if (latestEvent.type === 'final-result') {
        console.log('Final result:', latestEvent.content);
      }
    }
  }, [data]);

  return (/* your UI */);
}
```

### Using the Non-Streaming API

```typescript
// Example: Trigger workflow without streaming
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

Customize which models each agent uses in their respective files:

```typescript
// lib/agents/coordinator-agent.ts
model: openai('gpt-5')  // High-level reasoning

// lib/agents/researcher-agent.ts
model: openai('gpt-4.1')  // Research tasks
```

### Max Iterations

Adjust in `lib/orchestrator.ts`:
```typescript
const maxIterations = 15;  // Prevent infinite loops
```

### API Timeout

Adjust in `app/api/agents/route.ts`:
```typescript
export const maxDuration = 60;  // Max 60 seconds for Vercel
```

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
