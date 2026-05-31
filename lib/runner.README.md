# Agent Runner with Completion Tracking

An orchestration layer for multi-agent execution that runs all agents in a round-robin fashion until ALL agents mark their work as completed using the `markCompleted` tool.

## Key Features

- **Round-Robin Execution**: Executes agents in rotation starting with a random agent
- **Completion Tracking**: Monitors which agents have called `markCompleted`
- **Natural Coordination**: Agents coordinate via `coordinationTool` and `readMessages`
- **Automatic Termination**: Stops when all agents mark as completed or max iterations reached
- **Full Audit Trail**: Tracks all coordination messages and agent outputs

## The Problem This Solves

Without completion tracking:
- ❌ Don't know when agents are done
- ❌ Can't coordinate multi-agent workflows effectively
- ❌ No clear termination condition

With this runner:
- ✅ Agents explicitly signal completion
- ✅ Runner ensures all agents finish their work
- ✅ Clear visibility into which agents are done
- ✅ Automatic workflow termination

## How It Works

```
User Query
    │
    ▼
Message Bus ───> All agents receive query
    │
    ▼
Random Starting Agent ───> Randomly pick first agent
    │
    ▼
Round-Robin Execution
    │
    ├─> Execute Agent 1
    │   ├─> Check if markCompleted called
    │   └─> Update completion status
    │
    ├─> Execute Agent 2
    │   ├─> Check if markCompleted called
    │   └─> Update completion status
    │
    └─> Execute Agent 3
        ├─> Check if markCompleted called
        └─> Update completion status
    │
    ▼
All Completed? ───> YES ───> Finish
    │
    NO ───> Continue Round-Robin
```

## Architecture

1. **Initialization**
   - User query published to ALL agents via message bus
   - Random agent selected to start
   - Completion status initialized to `false` for all agents

2. **Round-Robin Execution**
   - Execute agents in rotation: Start → Next → Next → Start...
   - Each execution: agent reads messages, coordinates, produces output
   - Skip agents that have already marked as completed

3. **Completion Detection**
   - After each agent execution, check if they called `markCompleted` tool
   - Update completion status for that agent
   - If agent already completed, skip their turn

4. **Termination**
   - When ALL agents have `markCompleted === true` → Finish
   - Or when max iterations reached (default: 10)

5. **Output**
   - Collect all agent outputs
   - Show completion status per agent
   - Display coordination timeline

## Usage

### Basic Usage

```typescript
import { runAgentsWithCoordination } from './lib/runner';

const summary = await runAgentsWithCoordination(
  'Create a task management feature'
);

// Check completion status
summary.agentResults.forEach(result => {
  console.log(`${result.agent}: ${result.completed ? 'DONE' : 'INCOMPLETE'}`);
});
```

### Advanced Usage

```typescript
import { agentRunner } from './lib/runner';

const summary = await agentRunner.runWithCoordination(userQuery);

// Access detailed results
console.log(`Starting agent: ${summary.startingAgent}`);
console.log(`Total iterations: ${summary.iterations}`);

// View completion status
summary.agentResults.forEach(({ agent, completed, output }) => {
  console.log(`${agent}:`);
  console.log(`  Status: ${completed ? '✅ Complete' : '❌ Incomplete'}`);
  console.log(`  Output: ${output.slice(0, 100)}...`);
});

// Check coordination
summary.coordinationMessages.forEach(msg => {
  console.log(`${msg.from} → ${msg.to}: ${msg.content}`);
});
```

## Running Tests

```bash
npm run test:runner
```

## Agent Tools

Each agent has three coordination tools:

### `coordinationTool`
Send a message to another agent:
```typescript
{
  recipientAgent: 'frontendAgent',
  messageContent: 'Please design the UI for task management'
}
```

### `readMessages`
Read messages from other agents:
```typescript
{
  fromAgent: 'backendAgent' // optional filter
}
```

### `markCompleted`
Signal that the agent has finished its work:
```typescript
{
  summary: 'Backend API design completed with REST endpoints...'
}
```

**IMPORTANT**: Agents must call `markCompleted` to signal they're done!

## Return Types

### RunnerSummary

```typescript
interface RunnerSummary {
  userQuery: string;
  startingAgent: AgentName;
  totalDuration: number;
  iterations: number;
  agentResults: {
    agent: AgentName;
    output: string;
    duration: number;
    completed: boolean;  // Did agent call markCompleted?
  }[];
  coordinationMessages: Message[];
  messageBusStats: any;
}
```

## Example Output

```
🚀 AGENT RUNNER - COORDINATED EXECUTION
================================================================================
📝 User Query: "Create a task management feature..."
================================================================================

📨 User query published to all agents

🎲 Randomly selected starting agent: backendAgent

────────────────────────────────────────────────────────────────────────────────
ITERATION 1 | EXECUTING: BACKENDAGENT
────────────────────────────────────────────────────────────────────────────────

🤖 Executing backendAgent...
✅ backendAgent completed execution
📊 Steps: 8
📤 Output: I'll design the backend architecture...

✅ backendAgent marked as COMPLETED

📧 Coordination messages sent (2):
  → To frontendAgent: Please design the UI...
  → To designAgent: Create visual mockups...

────────────────────────────────────────────────────────────────────────────────
ITERATION 2 | EXECUTING: FRONTENDAGENT
────────────────────────────────────────────────────────────────────────────────

🤖 Executing frontendAgent...
✅ frontendAgent completed execution
📊 Steps: 6
📤 Output: Based on backend specs, I'll create the UI...

⏳ frontendAgent not yet completed

────────────────────────────────────────────────────────────────────────────────
ITERATION 3 | EXECUTING: DESIGNAGENT
────────────────────────────────────────────────────────────────────────────────

🤖 Executing designAgent...
✅ designAgent completed execution
✅ designAgent marked as COMPLETED

────────────────────────────────────────────────────────────────────────────────
ITERATION 4 | EXECUTING: FRONTENDAGENT
────────────────────────────────────────────────────────────────────────────────

🤖 Executing frontendAgent...
✅ frontendAgent marked as COMPLETED

✅ All agents have marked as completed!

================================================================================
📊 EXECUTION SUMMARY
================================================================================
🎲 Starting Agent: backendAgent
⏱️  Total Duration: 12540ms
🔄 Total Iterations: 4
🤖 Agents Executed: 4
📧 Coordination Messages: 5

✅ COMPLETION STATUS:
  ✅ backendAgent: COMPLETED
  ✅ frontendAgent: COMPLETED
  ✅ designAgent: COMPLETED
================================================================================
```

## How Agents Coordinate

**Example Workflow:**

1. **Iteration 1 - Backend Agent**:
   - Reads user query
   - Designs backend architecture
   - Sends coordination messages to frontend & design
   - Calls `markCompleted` → ✅

2. **Iteration 2 - Frontend Agent**:
   - Reads messages from backend
   - Starts UI design
   - Needs more info, doesn't call `markCompleted` → ⏳

3. **Iteration 3 - Design Agent**:
   - Creates mockups
   - Calls `markCompleted` → ✅

4. **Iteration 4 - Frontend Agent** (second turn):
   - Reads design mockups
   - Completes UI implementation
   - Calls `markCompleted` → ✅

5. **All Complete**: Runner terminates

## Key Design Decisions

**Why round-robin?**
- Fair: Every agent gets a turn
- Simple: Easy to understand execution order
- Flexible: Agents can take multiple turns if needed

**Why track completion?**
- Clear termination: Workflow finishes when all done
- Explicit signaling: Agents declare when complete
- Prevents premature exit: Ensures all work is done

**Why start with random agent?**
- Eliminates bias in who goes first
- Tests agent robustness
- More realistic coordination scenarios

## Configuration

- `maxIterations`: Default 10, prevents infinite loops
- Agents can be executed multiple times if they don't mark as completed

## Notes

- All agents must call `markCompleted` to finish the workflow
- Agents can coordinate via message bus between executions
- If an agent doesn't call `markCompleted`, it will be executed again in the next round
- Max iterations prevents infinite loops
- Simple, predictable, easy to debug
