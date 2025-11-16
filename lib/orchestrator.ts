import { coordinatorAgent, researcherAgent, writerAgent, editorAgent } from './agents';
import { MessageBus, messageBus } from './message-bus';

type AgentType = 'coordinator' | 'researcherAgent' | 'writerAgent' | 'editorAgent';

interface AgentResult {
    text: string;
    steps: any[];
}

export class AgentOrchestrator {
    private currentAgent: AgentType = 'coordinator';

    constructor(private bus: MessageBus = messageBus) {
        console.log('🎯 Agent Orchestrator initialized with Message Bus pattern');
    }

    private getAgent(agentType: AgentType) {
        const agents = {
            coordinator: coordinatorAgent,
            researcherAgent: researcherAgent,
            writerAgent: writerAgent,
            editorAgent: editorAgent
        };
        return agents[agentType];
    }

    async processUserMessage(userMessage: string): Promise<string> {
        console.log('\n' + '='.repeat(70));
        console.log('🚀 STARTING MULTI-AGENT WORKFLOW');
        console.log('='.repeat(70));
        console.log(`📨 User: "${userMessage}"`);
        console.log('='.repeat(70) + '\n');

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

        while (iterations < maxIterations) {
            iterations++;

            console.log('\n' + '-'.repeat(70));
            console.log(`ITERATION ${iterations} | AGENT: ${this.currentAgent.toUpperCase()}`);
            console.log('-'.repeat(70) + '\n');

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
                
                console.log(`📝 Prompt length: ${prompt.length} chars`);

                // Generate response from current agent
                const result: AgentResult = await agent.generate({ 
                    prompt 
                });

                console.log(`\n💬 Response: ${result.text.slice(0, 200)}...\n`);
                console.log(`📊 Steps taken: ${result.steps.length}`);

                // Log tool calls
                const toolCalls = result.steps
                    .filter(step => step.toolCalls && step.toolCalls.length > 0)
                    .flatMap(step => step.toolCalls);
                
                if (toolCalls.length > 0) {
                    console.log(`🔧 Tools used: ${toolCalls.map(tc => tc.toolName).join(', ')}`);
                }

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
                    console.log('\n' + '='.repeat(70));
                    console.log('✅ WORKFLOW COMPLETE');
                    console.log('='.repeat(70));
                    console.log(`📊 Total iterations: ${iterations}`);
                    console.log(`📝 Final output length: ${completion.finalOutput.length} chars`);
                    console.log(`📨 Total messages in bus: ${this.bus.getMessageHistory().length}`);
                    console.log('='.repeat(70) + '\n');
                    
                    return completion.finalOutput;
                }

                // Check for handoff to another agent
                const handoff = this.detectHandoff(result);
                if (handoff) {
                    console.log(`\n🔄 Handoff: ${this.currentAgent} → ${handoff.targetAgent}`);
                    
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
                        console.log('\n⚠️  No handoff from specialist, returning to coordinator');
                        
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
                        console.log('\n⚠️  No handoff from coordinator, ending workflow');
                        return result.text;
                    }
                }

            } catch (error) {
                console.error(`\n❌ Error with ${this.currentAgent}:`, error);
                
                // Log error to message bus
                this.bus.publish({
                    from: this.currentAgent,
                    to: 'orchestrator',
                    content: `Error: ${error instanceof Error ? error.message : 'Unknown'}`,
                    metadata: {
                        timestamp: new Date(),
                        type: 'system',
                        error: true
                    } as any
                });
                
                return `Error during ${this.currentAgent} execution: ${error instanceof Error ? error.message : 'Unknown error'}`;
            }
        }

        console.log('\n⚠️  Max iterations reached');
        return 'Workflow incomplete: maximum iterations reached';
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
            prompt = lastUserMessage.content;
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
        console.log('\n🔍 DEBUG: Checking for completion...');
        
        // Check messages for completion signals
        const messages = (result as any).response?.messages || [];
        
        for (const message of messages) {
            if (message.role === 'tool' && message.content) {
                for (const item of message.content) {
                    if (item.type === 'tool-result' && item.output?.value) {
                        const res = item.output.value;
                        
                        // Coordinator marks complete
                        if (res?.complete && res?.finalOutput) {
                            console.log('✅ Found completion signal');
                            return { finalOutput: res.finalOutput };
                        }
                        
                        // Editor marks workflow complete
                        if (res?.workflowComplete && res?.finalContent) {
                            console.log('✅ Found workflow complete');
                            return { finalOutput: res.finalContent };
                        }
                    }
                }
            }
        }
    
        console.log('❌ No completion detected\n');
        return null;
    }

    private detectHandoff(result: AgentResult): {
        targetAgent: AgentType;
        context: any;
    } | null {
        console.log('\n🔍 DEBUG: Checking for handoff...');
        
        // The Agent class stores tool results in response.messages, not steps
        const messages = (result as any).response?.messages || [];
        
        console.log(`Found ${messages.length} messages in response`);
        
        // Look for tool results in messages
        for (const message of messages) {
            if (message.role === 'tool' && message.content) {
                for (const item of message.content) {
                    if (item.type === 'tool-result' && item.output?.value) {
                        const res = item.output.value;
                        console.log('Tool result:', JSON.stringify(res, null, 2));
                        
                        // Coordinator delegating to specialist agent
                        if (res?.handoff && res?.targetAgent) {
                            console.log(`✅ Found handoff to: ${res.targetAgent}`);
                            return {
                                targetAgent: res.targetAgent as AgentType,
                                context: { 
                                    task: res.task, 
                                    previousContext: res.context 
                                }
                            };
                        }
                        
                        // Specialist agent returning to coordinator
                        if (res?.done && res?.fromAgent) {
                            console.log(`✅ Found return from: ${res.fromAgent}`);
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
    
        console.log('❌ No handoff detected\n');
        return null;
    }

    reset() {
        this.currentAgent = 'coordinator';
        this.bus.clear();
        console.log('🔄 Orchestrator reset');
    }

    getMessageHistory() {
        return this.bus.getMessageHistory();
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