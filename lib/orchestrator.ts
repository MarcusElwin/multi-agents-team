import {
    createCoordinatorAgent, createResearcherAgent, createWriterAgent, createEditorAgent,
} from './agents';
import { MessageBus, type Message } from './message-bus';
import { Conversation } from './conversation';
import { waitForInput } from './input-registry';
import { DEFAULT_MODEL, estimateCost, formatCost, type OpenAIModel, type ProviderId } from './models';
import { withProvider } from './provider';
import { describeError } from './error-message';
import type { AgentHooks, EventSink } from './agent-events';
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
    // AI SDK usage; field names vary across versions, so read defensively.
    usage?: {
        inputTokens?: number;
        outputTokens?: number;
        promptTokens?: number;
        completionTokens?: number;
    };
}

/** Normalize the AI SDK's usage shape (varies by version) to in/out tokens. */
function readUsage(result: { usage?: AgentResult['usage'] }): { inputTokens: number; outputTokens: number } {
    const u = result.usage ?? {};
    return {
        inputTokens: u.inputTokens ?? u.promptTokens ?? 0,
        outputTokens: u.outputTokens ?? u.completionTokens ?? 0,
    };
}

// Shape of the tool-result `output.value` payloads we read from agent results.
interface ToolResultValue {
    handoff?: boolean;
    targetAgent?: string;
    task?: string;
    context?: string;
    complete?: boolean;
    finalOutput?: string;
    workflowComplete?: boolean;
    finalContent?: string;
    done?: boolean;
    fromAgent?: string;
    nextAgent?: string;
    // analyzeRequest output (for the plan UI)
    userIntent?: string;
    workflow?: Array<{ agent: string; task: string }>;
    // requestUserInput output (human-in-the-loop)
    requestUserInput?: boolean;
    question?: string;
    // concrete artifacts produced by specialists
    draft?: string;
    findings?: string;
    sources?: string[];
}

// Context carried alongside a handoff, stored in message metadata.
interface HandoffContext {
    task?: string;
    previousContext?: string;
    fromAgent?: string;
    recommendedNext?: string;
    nextAgent?: string;
    reasoning?: string;
    findings?: string;
    structuredData?: unknown;
    sources?: string[];
    keyInsights?: string[];
    draft?: string;
    contentType?: string;
    finalContent?: string;
    improvements?: string;
    [key: string]: unknown;
}

interface Handoff {
    targetAgent: AgentType;
    context: HandoffContext;
}

export interface OrchestratorOptions {
    model?: OpenAIModel;
    apiKey?: string;
    providerId?: ProviderId;
}

export class AgentOrchestrator {
    private currentAgent: AgentType = 'coordinator';
    private readonly model: OpenAIModel;
    private apiKey?: string;
    private providerId: ProviderId;
    // Built per-run by buildAgents(), since hooks close over the current run's
    // EventSink and read currentAgent/iteration to attribute live events.
    private agents!: Record<AgentType, { generate(opts: { prompt: string }): Promise<AgentResult> }>;
    private iteration = 0;
    private bus: MessageBus = new MessageBus();
    private conversation: Conversation = new Conversation();
    // Latest concrete artifacts produced by specialists this run. Carried
    // forward automatically so the next specialist always gets the real draft/
    // findings, rather than relying on the LLM coordinator to re-copy them into
    // the delegation context (which weaker models routinely drop).
    private artifacts: { findings?: string; draft?: string; sources?: string[] } = {};

    constructor(options: OrchestratorOptions = {}) {
        this.model = options.model ?? DEFAULT_MODEL;
        this.apiKey = options.apiKey;
        this.providerId = options.providerId ?? 'openai';
        log.debug(`Agent Orchestrator initialized (model: ${this.model})`);
    }

    /**
     * Build the agent set for a run, wiring per-agent hooks that forward live
     * step reasoning and web-search activity to this run's EventSink. Hooks
     * read currentAgent/iteration at fire time so each event is attributed to
     * whichever agent is active.
     */
    private buildAgents(emit: EventSink) {
        // Hooks for the agent currently named `agentName`. The closures read
        // this.currentAgent/this.iteration lazily, so they stay correct as the
        // run hands off between agents.
        const hooksFor = (agentName: AgentType): AgentHooks => ({
            onStep: ({ stepIndex, text, toolNames }) => {
                if (!text && toolNames.length === 0) return;
                emit({
                    type: 'agent_step',
                    agent: agentName,
                    iteration: this.iteration,
                    stepIndex,
                    text,
                    toolNames,
                });
            },
            onWebSearch: ({ status, query, sources }) => {
                emit({ type: 'web_search', agent: agentName, status, query, sources });
            },
        });

        // Agents only expose .generate() to us; the SDK's Agent type is richer,
        // so cast through unknown to the minimal shape we consume.
        this.agents = {
            coordinator: createCoordinatorAgent(this.model, hooksFor('coordinator')),
            researcherAgent: createResearcherAgent(this.model, hooksFor('researcherAgent')),
            writerAgent: createWriterAgent(this.model, hooksFor('writerAgent')),
            editorAgent: createEditorAgent(this.model, hooksFor('editorAgent')),
        } as unknown as typeof this.agents;
    }

    private getAgent(agentType: AgentType) {
        return this.agents[agentType];
    }

    async processUserMessage(
        userMessage: string,
        onEvent?: EventSink,
        conversation: Conversation = new Conversation(),
    ): Promise<string> {
        return withProvider({ providerId: this.providerId, apiKey: this.apiKey }, async () => {
        log.box('🚀 v1 Orchestrated Workflow', 'cyan');
        log.kv({ User: `"${userMessage.slice(0, 80)}${userMessage.length > 80 ? '…' : ''}"` });

        const emit: EventSink = onEvent ?? (() => {});
        const runStart = Date.now();
        emit({ type: 'workflow_start', mode: 'v1', model: this.model, query: userMessage, startingAgent: 'coordinator' });

        // Build agents for this run with hooks bound to this run's EventSink.
        this.buildAgents(emit);

        // Use this conversation's isolated bus, and start from a clean slate so a
        // prior run's messages can't leak into prompt building (which previously
        // made the coordinator respond about a non-existent workflow).
        this.bus = conversation.bus;
        this.conversation = conversation;
        this.bus.clear();
        this.artifacts = {};

        // Subscribe to bus messages so the UI can show inter-agent traffic.
        const busListener = (msg: Message) => {
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
        // Accumulate token usage + cost across the whole run.
        let totalIn = 0;
        let totalOut = 0;
        let totalCost = 0;

        try {
        while (iterations < maxIterations) {
            iterations++;
            this.iteration = iterations;

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

                // Token usage + cost for this iteration.
                const usage = readUsage(result);
                const costUsd = estimateCost(this.model, usage);
                totalIn += usage.inputTokens;
                totalOut += usage.outputTokens;
                totalCost += costUsd;

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
                    inputTokens: usage.inputTokens,
                    outputTokens: usage.outputTokens,
                    costUsd,
                });

                // Publish agent response to bus WITH structured metadata
                this.bus.publish({
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
                    }
                });

                // Capture any concrete artifacts this agent produced (draft,
                // findings, sources) so we can carry them forward automatically.
                this.captureArtifacts(result);

                // Surface the coordinator's plan to the UI as soon as it analyzes.
                const plan = this.detectPlan(result);
                if (plan) {
                    emit({
                        type: 'agent_plan',
                        agent: this.currentAgent,
                        intent: plan.intent,
                        steps: plan.steps,
                    });
                }

                // Check whether the coordinator is asking the human a question.
                const inputReq = this.detectInputRequest(result);
                if (inputReq) {
                    const requestId = crypto.randomUUID();
                    log.step(`requesting user input: ${inputReq.question}`);
                    emit({
                        type: 'input_request',
                        requestId,
                        agent: this.currentAgent,
                        question: inputReq.question,
                    });

                    // Pause until the client delivers an answer (or it times out).
                    const answer = await waitForInput(requestId);
                    log.step(`received user input (${answer.length} chars)`);

                    // Feed the answer back into the conversation so the next
                    // coordinator turn sees it as fresh user context.
                    this.bus.publish({
                        from: 'user',
                        to: 'coordinator',
                        content: answer
                            ? `Answer to "${inputReq.question}": ${answer}`
                            : `(no answer provided for "${inputReq.question}" — proceed with sensible defaults)`,
                        metadata: { timestamp: new Date(), type: 'user' },
                    });
                    // Loop again so the coordinator continues with the answer.
                    continue;
                }

                // Check for workflow completion
                const completion = this.detectCompletion(result);
                if (completion) {
                    log.box('✅ Workflow Complete', 'green');
                    log.kv({
                        Iterations: iterations,
                        'Final output': `${completion.finalOutput.length} chars`,
                        'Bus messages': this.bus.getMessageHistory().length,
                        'Est. cost': `${formatCost(totalCost)} (${(totalIn + totalOut).toLocaleString()} tokens)`,
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
                        totalInputTokens: totalIn,
                        totalOutputTokens: totalOut,
                        totalCostUsd: totalCost,
                        totalDuration: Date.now() - runStart,
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
                        }
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
                            }
                        });
                    } else {
                        log.warn('No handoff from coordinator; ending workflow');
                        emit({ type: 'workflow_complete', mode: 'v1', result: result.text, iterations, totalDuration: Date.now() - runStart });
                        return result.text;
                    }
                }

            } catch (error) {
                const errMsg = describeError(error);
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
                    }
                });

                return `Error during ${this.currentAgent} execution: ${errMsg}`;
            }
        }

        log.warn('Max iterations reached');
        emit({ type: 'workflow_complete', mode: 'v1', result: 'Workflow incomplete: maximum iterations reached', iterations, totalDuration: Date.now() - runStart });
        return 'Workflow incomplete: maximum iterations reached';
        } finally {
            this.bus.off('message', busListener);
        }
        });
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
            .filter(m => m.metadata.handoffContext)
            .slice(-1)[0];
    
        let prompt = '';
    
        // If this is the coordinator with initial user message
        if (targetAgent === 'coordinator' && lastUserMessage && messagesFromAgent.length === 0) {
            const historyBlock = this.conversation.renderHistory();
            // Explicitly frame this as a NEW request the coordinator must fulfil.
            // Without this, weaker models treat the orchestration framing as a
            // cue to "check workflow status" and ask nonsense questions.
            const guard =
                'This is a brand-new user request. There is NO pre-existing workflow, ' +
                'no prior agent results to retrieve, and nothing to "check". Your job is ' +
                'to fulfil the request below: analyze it, then delegate to a specialist. ' +
                'Only call requestUserInput if the request is genuinely too ambiguous to start.';
            prompt = historyBlock
                ? `${guard}\n\nPrior conversation:\n${historyBlock}\n\n---\n\nCurrent request:\n${lastUserMessage.content}`
                : `${guard}\n\nRequest:\n${lastUserMessage.content}`;
        }
        // Coordinator resuming after asking the user a question: a fresh user
        // message arrived AFTER the coordinator's own last output. (We can't just
        // check the very last message, since the orchestrator publishes an
        // "Activating coordinator" system message right before this runs.)
        else if (targetAgent === 'coordinator' && lastUserMessage && this.isResumeAfterInput()) {
            const historyBlock = this.conversation.renderHistory();
            prompt =
                (historyBlock ? `Prior conversation:\n${historyBlock}\n\n---\n\n` : '') +
                `${lastUserMessage.content}\n\n` +
                `Treat the above as the task. Analyze it and delegate to the appropriate agent, or mark complete if done. Do NOT ask about workflow status.`;
        }
        // If this is a handoff from coordinator to specialist
        else if (lastHandoff && targetAgent !== 'coordinator') {
            const handoffContext = lastHandoff.metadata.handoffContext as HandoffContext | undefined;
            prompt = `You have been assigned a task by the coordinator.\n\n`;
            prompt += `**Task:** ${handoffContext?.task || lastHandoff.content}\n\n`;

            if (handoffContext?.previousContext) {
                prompt += `**Context from previous work:**\n${handoffContext.previousContext}\n\n`;
            }

            // Carry the real artifacts forward automatically. The coordinator
            // often summarizes or omits the draft/findings in the delegation
            // context; the editor/writer need the actual text to work on.
            if (this.artifacts.findings && targetAgent === 'writerAgent') {
                prompt += `**Research findings to use:**\n${this.artifacts.findings}\n\n`;
            }
            if (this.artifacts.draft && targetAgent === 'editorAgent') {
                prompt += `**Draft to edit (full text):**\n${this.artifacts.draft}\n\n`;
            }
            if (this.artifacts.sources?.length) {
                prompt += `**Sources:**\n${this.artifacts.sources.slice(0, 8).map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n`;
            }

            prompt += 'Please complete your specialized work on this task using the material above.';
        }
        // If coordinator is receiving results from specialist
        else if (targetAgent === 'coordinator') {
            // Get recent messages from specialists (agents returning work)
            const recentAgentMessages = this.bus.getMessageHistory()
                .filter(m =>
                    m.to === 'coordinator' &&
                    m.metadata.type === 'system' &&
                    m.metadata.handoffContext
                )
                .slice(-1);  // Get the most recent handoff back to coordinator

            if (recentAgentMessages.length > 0) {
                const lastReturn = recentAgentMessages[0];
                const context = lastReturn.metadata.handoffContext as HandoffContext;
                
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
    private formatHandoffContent(handoff: Handoff): string {
        let content = `Task delegated: ${handoff.context.task || 'Work required'}\n`;
        
        if (handoff.context.previousContext) {
            content += `\nContext: ${handoff.context.previousContext}`;
        }
        
        return content;
    }

    /**
     * Extract tool results from agent result for storage in message metadata
     */
    private extractToolResults(result: AgentResult): Record<string, unknown> {
        const allResults: Record<string, unknown> = {};
        const messages = result.response?.messages ?? [];

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

    /**
     * True when a user message arrived after the coordinator's most recent
     * output — i.e. the coordinator asked the user something and we're resuming
     * with their answer. Distinguishes the resume case from the "receiving
     * specialist results" case, which would otherwise hit the wrong prompt.
     */
    private isResumeAfterInput(): boolean {
        const history = this.bus.getMessageHistory();
        let lastUserIdx = -1;
        let lastCoordOutputIdx = -1;
        history.forEach((m, i) => {
            if (m.metadata.type === 'user') lastUserIdx = i;
            if (m.from === 'coordinator' && m.metadata.type === 'agent') lastCoordOutputIdx = i;
        });
        return lastUserIdx > lastCoordOutputIdx && lastUserIdx !== -1;
    }

    /** Record the latest draft/findings/sources an agent returned. */
    private captureArtifacts(result: AgentResult): void {
        this.forEachToolResult(result, (res) => {
            if (res.draft) this.artifacts.draft = res.draft;
            if (res.findings) this.artifacts.findings = res.findings;
            if (Array.isArray(res.sources) && res.sources.length) this.artifacts.sources = res.sources;
            // The editor's polished output supersedes the draft.
            if (res.finalContent) this.artifacts.draft = res.finalContent;
        });
    }

    /** Iterate over tool-result payloads in an agent result. */
    private forEachToolResult(result: AgentResult, fn: (res: ToolResultValue) => void): void {
        for (const message of result.response?.messages ?? []) {
            if (message.role === 'tool' && message.content) {
                for (const item of message.content) {
                    if (item.type === 'tool-result' && item.output?.value) {
                        fn(item.output.value as ToolResultValue);
                    }
                }
            }
        }
    }

    /** Extract the coordinator's analyzeRequest plan, if present. */
    private detectPlan(result: AgentResult): { intent: string; steps: Array<{ agent: string; task: string }> } | null {
        let plan: { intent: string; steps: Array<{ agent: string; task: string }> } | null = null;
        this.forEachToolResult(result, (res) => {
            if (res.userIntent && Array.isArray(res.workflow)) {
                plan = { intent: res.userIntent, steps: res.workflow };
            }
        });
        return plan;
    }

    /** Detect a requestUserInput tool call, if the coordinator asked the user. */
    private detectInputRequest(result: AgentResult): { question: string } | null {
        let req: { question: string } | null = null;
        this.forEachToolResult(result, (res) => {
            if (res.requestUserInput && res.question) {
                req = { question: res.question };
            }
        });
        return req;
    }

    private detectCompletion(result: AgentResult): { finalOutput: string } | null {
        const messages = result.response?.messages ?? [];

        for (const message of messages) {
            if (message.role === 'tool' && message.content) {
                for (const item of message.content) {
                    if (item.type === 'tool-result' && item.output?.value) {
                        const res = item.output.value as ToolResultValue;

                        if (res.complete && res.finalOutput) {
                            log.complete('completion signal received');
                            return { finalOutput: res.finalOutput };
                        }

                        if (res.workflowComplete && res.finalContent) {
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

    private detectHandoff(result: AgentResult): Handoff | null {
        const messages = result.response?.messages ?? [];
        log.debug(`scanning ${messages.length} response messages for handoff`);

        for (const message of messages) {
            if (message.role === 'tool' && message.content) {
                for (const item of message.content) {
                    if (item.type === 'tool-result' && item.output?.value) {
                        const res = item.output.value as ToolResultValue;
                        log.debug('tool result', res);

                        if (res.handoff && res.targetAgent) {
                            return {
                                targetAgent: res.targetAgent as AgentType,
                                context: {
                                    task: res.task,
                                    previousContext: res.context
                                }
                            };
                        }

                        if (res.done && res.fromAgent) {
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