import {
    coordinatorAgent, researcherAgent, writerAgent, editorAgent,
    createCoordinatorAgent, createResearcherAgent, createWriterAgent, createEditorAgent,
} from './agents';
import { MessageBus } from './message-bus';
import { Conversation } from './conversation';
import { DEFAULT_MODEL, type OpenAIModel } from './models';
import type { EventSink } from './agent-events';
import * as log from './logger';

type AgentType = 'coordinator' | 'researcherAgent' | 'writerAgent' | 'editorAgent';

interface AgentStep {
    toolCalls?: Array<{ toolName: string }>;
}

interface ToolResultItem {
    type: string;
    output?: { value?: Record<string, unknown> };
}

interface ResponseMessage {
    role: string;
    content?: ToolResultItem[];
}

interface AgentResult {
    text: string;
    steps: AgentStep[];
    response?: { messages?: ResponseMessage[] };
}

export interface OrchestratorOptions {
    model?: OpenAIModel;
}

export class AgentOrchestrator {
    private currentAgent: AgentType = 'coordinator';
    private agents: Record<AgentType, { generate(opts: { prompt: string }): Promise<AgentResult> }>;
    private bus: MessageBus = new MessageBus();
    private conversation: Conversation = new Conversation();

    constructor(options: OrchestratorOptions = {}) {
        const model = options.model;
        // Agents only expose .generate() to us; the SDK's Agent type is richer,
        // so cast through unknown to the minimal shape we consume.
        const asAgents = (a: {
            coordinator: unknown;
            researcherAgent: unknown;
            writerAgent: unknown;
            editorAgent: unknown;
        }) => a as unknown as typeof this.agents;
        if (model && model !== DEFAULT_MODEL) {
            log.debug(`Orchestrator using custom model: ${model}`);
            this.agents = asAgents({
                coordinator: createCoordinatorAgent(model),
                researcherAgent: createResearcherAgent(model),
                writerAgent: createWriterAgent(model),
                editorAgent: createEditorAgent(model),
            });
        } else {
            this.agents = asAgents({
                coordinator: coordinatorAgent,
                researcherAgent: researcherAgent,
                writerAgent: writerAgent,
                editorAgent: editorAgent,
            });
        }
        log.debug('Agent Orchestrator initialized');
    }

    private getAgent(agentType: AgentType) {
        return this.agents[agentType];
    }

    async processUserMessage(
        userMessage: string,
        onEvent?: EventSink,
        conversation: Conversation = new Conversation(),
    ): Promise<string> {
        log.box('🚀 v1 Orchestrated Workflow', 'cyan');
        log.kv({ User: `"${userMessage.slice(0, 80)}${userMessage.length > 80 ? '…' : ''}"` });

        const emit: EventSink = onEvent ?? (() => {});
        emit({ type: 'workflow_start', mode: 'v1', model: DEFAULT_MODEL, query: userMessage, startingAgent: 'coordinator' });

        // Use this conversation's isolated bus, and start from a clean slate so a
        // prior run's messages can't leak into prompt building (which previously
        // made the coordinator respond about a non-existent workflow).
        this.bus = conversation.bus;
        this.conversation = conversation;
        this.bus.clear();

        // Subscribe to bus messages so the UI can show inter-agent traffic.
        const busListener = (msg: any) => {
            emit({
                type: 'bus_message',
                from: msg.from,
                to: msg.to,
                messageType: msg.metadata.type,
                content: msg.content,
            });
        };
        this.bus.on('message', busListener);

        // Publish user message to bus
        this.bus.publish({
            from: 'user',
            to: 'coordinator',
            content: userMessage,
            metadata: { 
                timestamp: new Date(), 
                type: 'user' 
            }
        });

        this.currentAgent = 'coordinator';
        let iterations = 0;
        const maxIterations = 15;

        try {
        while (iterations < maxIterations) {
            iterations++;

            log.iteration(iterations, this.currentAgent);
            emit({ type: 'iteration_start', iteration: iterations, agent: this.currentAgent });
            const iterationStart = Date.now();

            const agent = this.getAgent(this.currentAgent);

            // Publish agent activation
            this.bus.publish({
                from: 'orchestrator',
                to: this.currentAgent,
                content: `Activating ${this.currentAgent}`,
                metadata: {
                    timestamp: new Date(),
                    type: 'system',
                    agentType: this.currentAgent
                }
            });

            try {
                // Build prompt from message bus context
                const prompt = this.buildPromptFromMessageBus(this.currentAgent);

                log.step(`prompt: ${prompt.length} chars`);

                // Generate response from current agent
                const result: AgentResult = await agent.generate({
                    prompt
                });

                log.step(`steps: ${result.steps.length} · response: ${result.text.length} chars`);
                log.debug('response preview', result.text.slice(0, 200));

                // Log tool calls
                const toolCalls = result.steps
                    .flatMap(step => step.toolCalls ?? []);

                for (const tc of toolCalls) {
                    log.tool(tc.toolName);
                    emit({ type: 'tool_call', agent: this.currentAgent, toolName: tc.toolName });
                }

                emit({
                    type: 'iteration_end',
                    iteration: iterations,
                    agent: this.currentAgent,
                    durationMs: Date.now() - iterationStart,
                    stepCount: result.steps.length,
                    outputPreview: result.text.slice(0, 240),
                });

                // Publish agent response to bus WITH structured metadata
                const responseMessage = this.bus.publish({
                    from: this.currentAgent,
                    to: 'orchestrator',
                    content: result.text,
                    metadata: { 
                        timestamp: new Date(), 
                        type: 'agent',
                        agentType: this.currentAgent,
                        // Store tool results in metadata for context building
                        toolResults: this.extractToolResults(result),
                        stepCount: result.steps.length
                    } as any // Extended metadata
                });

                // Check for workflow completion
                const completion = this.detectCompletion(result);
                if (completion) {
                    log.box('✅ Workflow Complete', 'green');
                    log.kv({
                        Iterations: iterations,
                        'Final output': `${completion.finalOutput.length} chars`,
                        'Bus messages': this.bus.getMessageHistory().length,
                    });
                    emit({
                        type: 'workflow_complete',
                        mode: 'v1',
                        result: completion.finalOutput,
                        iterations,
                        agentsUsed: Array.from(
                            new Set(
                                this.bus.getMessageHistory()
                                    .filter(m => m.metadata.type === 'agent')
                                    .map(m => m.from)
                            )
                        ),
                    });
                    return completion.finalOutput;
                }

                // Check for handoff to another agent
                const handoff = this.detectHandoff(result);
                if (handoff) {
                    log.handoff(this.currentAgent, handoff.targetAgent);
                    emit({ type: 'handoff', from: this.currentAgent, to: handoff.targetAgent });

                    const previousAgent = this.currentAgent;
                    this.currentAgent = handoff.targetAgent;
                    
                    // Publish handoff message to bus with context
                    this.bus.publish({
                        from: previousAgent,
                        to: handoff.targetAgent,
                        content: this.formatHandoffContent(handoff),
                        metadata: {
                            timestamp: new Date(),
                            type: 'system',
                            agentType: previousAgent,
                            handoffContext: handoff.context
                        } as any
                    });
                    
                } else {
                    // No handoff and no completion
                    if (this.currentAgent !== 'coordinator') {
                        log.warn('No handoff from specialist; returning to coordinator');

                        const previousAgent = this.currentAgent;
                        this.currentAgent = 'coordinator';
                        
                        // Send completion message to coordinator via bus
                        this.bus.publish({
                            from: previousAgent,
                            to: 'coordinator',
                            content: `Specialist work complete: ${result.text}`,
                            metadata: {
                                timestamp: new Date(),
                                type: 'system',
                                agentType: previousAgent,
                                workComplete: true
                            } as any
                        });
                    } else {
                        log.warn('No handoff from coordinator; ending workflow');
                        emit({ type: 'workflow_complete', mode: 'v1', result: result.text, iterations });
                        return result.text;
                    }
                }

            } catch (error) {
                const errMsg = error instanceof Error ? error.message : String(error);
                log.error(`${this.currentAgent} failed: ${errMsg}`);
                emit({ type: 'workflow_error', error: errMsg });

                // Log error to message bus
                this.bus.publish({
                    from: this.currentAgent,
                    to: 'orchestrator',
                    content: `Error: ${errMsg}`,
                    metadata: {
                        timestamp: new Date(),
                        type: 'system',
                        error: true
                    } as any
                });

                return `Error during ${this.currentAgent} execution: ${errMsg}`;
            }
        }

        log.warn('Max iterations reached');
        emit({ type: 'workflow_complete', mode: 'v1', result: 'Workflow incomplete: maximum iterations reached', iterations });
        return 'Workflow incomplete: maximum iterations reached';
        } finally {
            this.bus.off('message', busListener);
        }
    }

    /**
     * Build prompt for agent by reading relevant messages from the bus
     */
    private buildPromptFromMessageBus(targetAgent: AgentType): string {
        // Get all messages relevant to this agent
        const messagesToAgent = this.bus.getMessageHistory({ to: targetAgent });
        const messagesFromAgent = this.bus.getMessageHistory({ from: targetAgent });
        
        // Get the most recent user message
        const lastUserMessage = messagesToAgent
            .filter(m => m.metadata.type === 'user')
            .slice(-1)[0];
        
        // Get the most recent handoff message
        const lastHandoff = messagesToAgent
            .filter(m => (m.metadata as any).handoffContext)
            .slice(-1)[0];
    
        let prompt = '';
    
        // If this is the coordinator with initial user message
        if (targetAgent === 'coordinator' && lastUserMessage && messagesFromAgent.length === 0) {
            const historyBlock = this.conversation.renderHistory();
            prompt = historyBlock
                ? `Prior conversation:\n${historyBlock}\n\n---\n\nCurrent request:\n${lastUserMessage.content}`
                : lastUserMessage.content;
        }
        // If this is a handoff from coordinator to specialist
        else if (lastHandoff && targetAgent !== 'coordinator') {
            const handoffMeta = lastHandoff.metadata as any;
            prompt = `You have been assigned a task by the coordinator.\n\n`;
            prompt += `**Task:** ${handoffMeta.handoffContext?.task || lastHandoff.content}\n\n`;
            
            if (handoffMeta.handoffContext?.previousContext) {
                prompt += `**Context from previous work:**\n${handoffMeta.handoffContext.previousContext}\n\n`;
            }
            
            prompt += 'Please complete your specialized work on this task.';
        }
        // If coordinator is receiving results from specialist
        else if (targetAgent === 'coordinator') {
            // Get recent messages from specialists (agents returning work)
            const recentAgentMessages = this.bus.getMessageHistory()
                .filter(m => 
                    m.to === 'coordinator' && 
                    m.metadata.type === 'system' && 
                    (m.metadata as any).handoffContext
                )
                .slice(-1);  // Get the most recent handoff back to coordinator
            
            if (recentAgentMessages.length > 0) {
                const lastReturn = recentAgentMessages[0];
                const context = (lastReturn.metadata as any).handoffContext;
                
                prompt = `A specialist agent has completed their work and returned results.\n\n`;
                prompt += `**Agent:** ${context.fromAgent || lastReturn.from}\n\n`;
                
                // Add research findings
                if (context.findings) {
                    prompt += `**Research Findings:**\n${context.findings}\n\n`;
                }
                
                if (context.structuredData) {
                    prompt += `**Structured Data:** ${JSON.stringify(context.structuredData, null, 2)}\n\n`;
                }
                
                if (context.sources && context.sources.length > 0) {
                    prompt += `**Sources (${context.sources.length}):**\n`;
                    context.sources.slice(0, 5).forEach((source: string, idx: number) => {
                        prompt += `${idx + 1}. ${source}\n`;
                    });
                    prompt += '\n';
                }
                
                if (context.keyInsights && context.keyInsights.length > 0) {
                    prompt += `**Key Insights:**\n`;
                    context.keyInsights.forEach((insight: string, idx: number) => {
                        prompt += `${idx + 1}. ${insight}\n`;
                    });
                    prompt += '\n';
                }
                
                // Add draft content
                if (context.draft) {
                    prompt += `**Draft Content:**\n${context.draft}\n\n`;
                    prompt += `**Content Type:** ${context.contentType}\n\n`;
                }
                
                // Add final edited content
                if (context.finalContent) {
                    prompt += `**Final Polished Content:**\n${context.finalContent}\n\n`;
                    prompt += `**Improvements Made:** ${context.improvements}\n\n`;
                }
                
                // Add recommendation
                if (context.nextAgent && context.nextAgent !== 'none') {
                    prompt += `**Specialist's Recommendation:** Route to ${context.nextAgent}\n`;
                    if (context.reasoning) {
                        prompt += `**Reasoning:** ${context.reasoning}\n`;
                    }
                    prompt += '\n';
                }
                
                prompt += `Based on this work, determine the next step:\n`;
                prompt += `- If more work is needed, delegate to the appropriate next agent with full context\n`;
                prompt += `- If the workflow is complete, call markComplete with the final output\n`;
            } else {
                // Fallback
                prompt = 'Awaiting specialist agent results. Please check the workflow status.';
            }
        }
        // Fallback: build from recent conversation
        else {
            const recentMessages = this.bus.getMessageHistory()
                .filter(m => 
                    m.to === targetAgent || 
                    m.from === targetAgent ||
                    m.metadata.type === 'user'
                )
                .slice(-5);
            
            prompt = 'Recent conversation:\n\n';
            recentMessages.forEach(msg => {
                prompt += `${msg.from} → ${msg.to}: ${msg.content.slice(0, 150)}...\n\n`;
            });
        }
    
        return prompt;
    }

    /**
     * Format handoff content for message bus
     */
    private formatHandoffContent(handoff: any): string {
        let content = `Task delegated: ${handoff.context.task || 'Work required'}\n`;
        
        if (handoff.context.previousContext) {
            content += `\nContext: ${handoff.context.previousContext}`;
        }
        
        return content;
    }

    /**
     * Extract tool results from agent result for storage in message metadata
     */
    private extractToolResults(result: AgentResult): any {
        const allResults: any = {};
        const messages = (result as any).response?.messages || [];
        
        for (const message of messages) {
            if (message.role === 'tool' && message.content) {
                for (const item of message.content) {
                    if (item.type === 'tool-result' && item.output?.value) {
                        Object.assign(allResults, item.output.value);
                    }
                }
            }
        }
        
        return allResults;
    }

    private detectCompletion(result: AgentResult): { finalOutput: string } | null {
        const messages = (result as any).response?.messages || [];

        for (const message of messages) {
            if (message.role === 'tool' && message.content) {
                for (const item of message.content) {
                    if (item.type === 'tool-result' && item.output?.value) {
                        const res = item.output.value;

                        if (res?.complete && res?.finalOutput) {
                            log.complete('completion signal received');
                            return { finalOutput: res.finalOutput };
                        }

                        if (res?.workflowComplete && res?.finalContent) {
                            log.complete('workflow complete (editor)');
                            return { finalOutput: res.finalContent };
                        }
                    }
                }
            }
        }

        log.debug('no completion detected');
        return null;
    }

    private detectHandoff(result: AgentResult): {
        targetAgent: AgentType;
        context: any;
    } | null {
        const messages = (result as any).response?.messages || [];
        log.debug(`scanning ${messages.length} response messages for handoff`);

        for (const message of messages) {
            if (message.role === 'tool' && message.content) {
                for (const item of message.content) {
                    if (item.type === 'tool-result' && item.output?.value) {
                        const res = item.output.value;
                        log.debug('tool result', res);

                        if (res?.handoff && res?.targetAgent) {
                            return {
                                targetAgent: res.targetAgent as AgentType,
                                context: {
                                    task: res.task,
                                    previousContext: res.context
                                }
                            };
                        }

                        if (res?.done && res?.fromAgent) {
                            return {
                                targetAgent: 'coordinator' as AgentType,
                                context: {
                                    ...res,
                                    fromAgent: res.fromAgent,
                                    recommendedNext: res.nextAgent
                                }
                            };
                        }
                    }
                }
            }
        }

        return null;
    }

    reset() {
        this.currentAgent = 'coordinator';
        this.bus.clear();
        log.debug('Orchestrator reset');
    }

    getMessageHistory() {
        return this.bus.getMessageHistory();
    }

    /** Stats for the most recent run's bus (used by dev test scripts). */
    getStats() {
        return this.bus.getStats();
    }

    getConversationSummary() {
        const history = this.bus.getMessageHistory();
        const agentMessages = history.filter(m => m.metadata.type === 'agent');
        const uniqueAgents = new Set(agentMessages.map(m => m.from));
        
        return {
            totalMessages: history.length,
            agentsInvolved: Array.from(uniqueAgents),
            userMessages: history.filter(m => m.metadata.type === 'user').length,
            systemMessages: history.filter(m => m.metadata.type === 'system').length,
            agentMessages: agentMessages.length,
        };
    }
}