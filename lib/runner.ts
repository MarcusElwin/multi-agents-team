import 'dotenv/config';
import { resolve } from 'path';
import { config } from 'dotenv';

// Load .env.local from root directory
config({ path: resolve(process.cwd(), '.env.local') });

import { createBackendAgent } from './agents-v2/backend';
import { createFrontendAgent } from './agents-v2/frontend';
import { createDesignAgent } from './agents-v2/design';
import { MessageBus, Message } from './message-bus';
import { Conversation } from './conversation';
import { DEFAULT_MODEL, type OpenAIModel } from './models';
import type { EventSink } from './agent-events';
import * as log from './logger';
import chalk from 'chalk';

type AgentName = 'backendAgent' | 'frontendAgent' | 'designAgent';

// The three v2 agents have structurally different tool enums (each
// coordinationTool targets the *other* two agents), so they share no single
// Agent<...> type. We only ever call .generate(), so a minimal structural type
// is both sufficient and avoids fighting the SDK's deep generics.
interface V2Agent {
    generate(opts: { prompt: string }): Promise<AgentResult>;
}

interface AgentStep {
    toolCalls?: Array<{ toolName: string; args?: unknown; input?: unknown }>;
}

interface ResponseMessage {
    role: string;
    content?: Array<{ type: string; name?: string }>;
}

interface AgentResult {
    text: string;
    steps: AgentStep[];
    response?: { messages?: ResponseMessage[] };
}

interface AgentExecutionResult {
    agent: AgentName;
    output: string;
    duration: number;
    completed: boolean;
}

interface RunnerSummary {
    userQuery: string;
    startingAgent: AgentName;
    totalDuration: number;
    iterations: number;
    agentResults: AgentExecutionResult[];
    coordinationMessages: Message[];
    messageBusStats: any;
}

export interface RunnerOptions {
    model?: OpenAIModel;
}

export class AgentRunner {
    private model: OpenAIModel;
    private maxIterations = 10;

    constructor(options: RunnerOptions = {}) {
        this.model = options.model ?? DEFAULT_MODEL;
        log.debug(`Agent Runner initialized · model=${this.model}`);
    }

    /**
     * Run all agents with coordination until all mark as completed.
     * The Conversation owns the per-run MessageBus and prior chat history,
     * so concurrent runs never share state.
     */
    async runWithCoordination(
        userQuery: string,
        conversation: Conversation = new Conversation(),
        onEvent?: EventSink,
    ): Promise<RunnerSummary> {
        log.box('🚀 v2 Choreographed Workflow', 'magenta');
        log.kv({ Query: `"${userQuery.slice(0, 80)}${userQuery.length > 80 ? '…' : ''}"` });

        const emit: EventSink = onEvent ?? (() => {});
        const startTime = Date.now();

        const bus = conversation.bus;
        bus.clear();

        // Build agents bound to THIS conversation's bus. Cast through unknown to
        // the minimal V2Agent shape (see the type's comment for why).
        const agents: Record<AgentName, V2Agent> = {
            backendAgent: createBackendAgent(this.model, bus) as unknown as V2Agent,
            frontendAgent: createFrontendAgent(this.model, bus) as unknown as V2Agent,
            designAgent: createDesignAgent(this.model, bus) as unknown as V2Agent,
        };

        const agentNames: AgentName[] = ['backendAgent', 'frontendAgent', 'designAgent'];

        // Subscribe to bus traffic for the UI
        const busListener = (msg: Message) => {
            emit({
                type: 'bus_message',
                from: msg.from,
                to: msg.to,
                messageType: msg.metadata.type,
                content: msg.content,
            });
        };
        bus.on('message', busListener);

        // Prior conversation context, injected once per run so agents have memory.
        const historyBlock = conversation.renderHistory();
        const queryForAgents = historyBlock
            ? `Prior conversation:\n${historyBlock}\n\n---\n\nCurrent request:\n${userQuery}`
            : userQuery;

        // Publish user query (with history) to ALL agents
        agentNames.forEach(agentName => {
            bus.publish({
                from: 'user',
                to: agentName,
                content: queryForAgents,
                metadata: {
                    timestamp: new Date(),
                    type: 'user'
                }
            });
        });

        log.step('user query published to all agents');

        // Randomly select starting agent
        const startingAgent = agentNames[Math.floor(Math.random() * agentNames.length)];
        log.info(`starting agent (random): ${log.agent(startingAgent)}`);

        emit({
            type: 'workflow_start',
            mode: 'v2',
            model: this.model,
            query: userQuery,
            startingAgent,
        });

        // Track completion status
        const completionStatus: Record<AgentName, boolean> = {
            backendAgent: false,
            frontendAgent: false,
            designAgent: false
        };

        const agentResults: AgentExecutionResult[] = [];
        let iterations = 0;

        // Start with the randomly selected agent
        let currentAgentIndex = agentNames.indexOf(startingAgent);

        try {
            while (iterations < this.maxIterations) {
                iterations++;

                // Check if all agents completed
                const allCompleted = Object.values(completionStatus).every(status => status);
                if (allCompleted) {
                    log.complete('all agents marked completed');
                    break;
                }

                const currentAgent = agentNames[currentAgentIndex];

                // Skip if already completed
                if (completionStatus[currentAgent]) {
                    log.step(`${currentAgent} already completed, skipping`);
                    currentAgentIndex = (currentAgentIndex + 1) % agentNames.length;
                    continue;
                }

                log.iteration(iterations, currentAgent);
                emit({ type: 'iteration_start', iteration: iterations, agent: currentAgent });

                const result = await this.executeAgent(agents[currentAgent], currentAgent, queryForAgents, emit);
                agentResults.push(result);

                // Update completion status
                completionStatus[currentAgent] = result.completed;

                if (result.completed) {
                    log.complete(`${currentAgent} done`, `${result.duration}ms`);
                } else {
                    log.step(`${currentAgent} in progress (${result.duration}ms)`);
                }

                emit({
                    type: 'iteration_end',
                    iteration: iterations,
                    agent: currentAgent,
                    durationMs: result.duration,
                    stepCount: 0,
                    outputPreview: result.output.slice(0, 240),
                    completed: result.completed,
                });

                // Check coordination messages
                const sentMessages = bus.getMessageHistory()
                    .filter(m => m.from === currentAgent && m.metadata.type === 'agent')
                    .slice(-5);

                if (sentMessages.length > 0) {
                    log.step(`coordination messages sent: ${sentMessages.length}`);
                }

                // Move to next agent
                currentAgentIndex = (currentAgentIndex + 1) % agentNames.length;
            }

            if (iterations >= this.maxIterations) {
                log.warn('Max iterations reached');
            }

            const totalDuration = Date.now() - startTime;

            const summary: RunnerSummary = {
                userQuery,
                startingAgent,
                totalDuration,
                iterations,
                agentResults,
                coordinationMessages: bus.getMessageHistory().filter(m => m.metadata.type === 'agent'),
                messageBusStats: bus.getStats()
            };

            this.printSummary(summary, completionStatus);

            emit({
                type: 'workflow_complete',
                mode: 'v2',
                agentResults: agentResults.map(r => ({
                    agent: r.agent,
                    output: r.output,
                    duration: r.duration,
                    completed: r.completed,
                })),
                iterations,
                totalDuration,
                agentsUsed: agentNames,
                messageBusStats: summary.messageBusStats,
            });

            return summary;
        } finally {
            bus.off('message', busListener);
        }
    }

    /**
     * Execute a single agent
     */
    private async executeAgent(
        agent: V2Agent,
        agentName: AgentName,
        userQuery: string,
        emit: EventSink = () => {},
    ): Promise<AgentExecutionResult> {
        const agentStartTime = Date.now();

        try {
            const result: AgentResult = await agent.generate({
                prompt: userQuery
            });

            const agentDuration = Date.now() - agentStartTime;
            const output = result.text;

            log.step(`steps: ${result.steps.length} · output: ${output.length} chars · ${agentDuration}ms`);
            log.debug('output preview', output.slice(0, 300));

            // Emit tool calls from each step for the UI debug view
            for (const step of result.steps ?? []) {
                if (step.toolCalls && step.toolCalls.length > 0) {
                    for (const tc of step.toolCalls) {
                        emit({
                            type: 'tool_call',
                            agent: agentName,
                            toolName: tc.toolName,
                            preview: safeJsonPreview(tc.args ?? tc.input),
                        });
                    }
                }
            }

            const completed = this.detectCompletion(result);

            return {
                agent: agentName,
                output,
                duration: agentDuration,
                completed
            };

        } catch (error) {
            log.error(`${agentName} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return {
                agent: agentName,
                output: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                duration: Date.now() - agentStartTime,
                completed: false
            };
        }
    }

    /**
     * Detect if agent called markCompleted tool
     */
    private detectCompletion(result: AgentResult): boolean {
        // Check tool calls in steps
        for (const step of result.steps) {
            if (step.toolCalls && step.toolCalls.length > 0) {
                for (const toolCall of step.toolCalls) {
                    if (toolCall.toolName === 'markCompleted') {
                        return true;
                    }
                }
            }
        }

        // Also check in response messages
        const messages = (result as any).response?.messages || [];
        for (const message of messages) {
            if (message.role === 'assistant' && message.content) {
                for (const item of message.content) {
                    if (item.type === 'tool-use' && item.name === 'markCompleted') {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    /**
     * Print execution summary
     */
    private printSummary(summary: RunnerSummary, completionStatus: Record<AgentName, boolean>): void {
        log.box('📊 Execution Summary', 'green');
        log.kv({
            'Starting agent': summary.startingAgent,
            'Total duration': `${summary.totalDuration}ms`,
            Iterations: summary.iterations,
            'Agents executed': summary.agentResults.length,
            'Coordination msgs': summary.coordinationMessages.length,
            'Bus messages': summary.messageBusStats.totalMessages,
        });

        log.rule('Completion');
        for (const [agentName, completed] of Object.entries(completionStatus)) {
            if (completed) log.complete(agentName);
            else log.warn(`${agentName} not completed`);
        }

        if (summary.coordinationMessages.length > 0 && log.isDebug()) {
            log.rule('Coordination timeline');
            summary.coordinationMessages.forEach((msg, idx) => {
                const time = msg.metadata.timestamp.toISOString().split('T')[1].slice(0, 12);
                log.step(`${idx + 1}. [${time}] ${msg.from} → ${msg.to} — ${msg.content.slice(0, 80)}`);
            });
        }

        log.rule('Agent outputs');
        summary.agentResults.forEach(({ agent: agentName, output, duration, completed }) => {
            console.log();
            console.log(
                log.agent(agentName) +
                    ' ' +
                    (completed ? chalk.green('✓ completed') : chalk.yellow('⏳ in progress')) +
                    ' ' +
                    chalk.gray(`(${duration}ms)`)
            );
            console.log(output.slice(0, 500) + (output.length > 500 ? '…' : ''));
        });
        console.log();
    }

}

function safeJsonPreview(value: unknown): string | undefined {
    if (value === undefined || value === null) return undefined;
    try {
        const s = typeof value === 'string' ? value : JSON.stringify(value);
        return s.length > 240 ? s.slice(0, 240) + '…' : s;
    } catch {
        return undefined;
    }
}

// Export convenience function. Pass a model to override the default for this run
// and a Conversation to carry prior chat history + an isolated message bus.
export async function runAgentsWithCoordination(
    userQuery: string,
    options: RunnerOptions = {},
    onEvent?: EventSink,
    conversation: Conversation = new Conversation(),
): Promise<RunnerSummary> {
    const runner = new AgentRunner(options);
    return runner.runWithCoordination(userQuery, conversation, onEvent);
}
