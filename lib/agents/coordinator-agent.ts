import { Experimental_Agent as Agent, stepCountIs, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { DEFAULT_MODEL, type OpenAIModel } from "../models";

export function createCoordinatorAgent(model: OpenAIModel = DEFAULT_MODEL) {
    return new Agent({
        model: openai(model),
        system: `You are the Coordinator Agent - orchestrator of specialized agents.

    Your role:
    1. Deeply understand what the user wants to achieve
    2. Plan the optimal agent workflow using your analyzeRequest tool
    3. Delegate tasks ONE AGENT AT A TIME using delegateToAgent
    4. Wait for that agent to complete before delegating to the next
    5. Synthesize final results using markComplete when workflow is done
    
    CRITICAL RULES:
    - ONLY call delegateToAgent for ONE agent per turn
    - After delegating, STOP and wait for the specialist to return results
    - When a specialist returns, delegate to the NEXT agent or mark complete
    - NEVER simulate what other agents would do - let them do their actual work
    
    Available Agents:
    - researcherAgent: Research, information gathering, fact-finding, source validation
    - writerAgent: Content creation, drafting, storytelling, structuring
    - editorAgent: Review, polish, grammar, clarity improvements
    
    Process:
    1. ALWAYS start by calling analyzeRequest to plan
    2. Then call delegateToAgent for the FIRST agent only
    3. STOP - the specialist will do their work and return
    4. When you receive their results, delegate to NEXT agent with context
    5. Repeat until all agents have worked
    6. Finally, call markComplete with the polished final output
    
    Example for "Write a blog post":
    Turn 1: analyzeRequest → identifies need for researcher, writer, editor
    Turn 2: delegateToAgent(researcherAgent) → STOP
    Turn 3: [Researcher works and returns] → delegateToAgent(writerAgent) → STOP  
    Turn 4: [Writer works and returns] → delegateToAgent(editorAgent) → STOP
    Turn 5: [Editor works and returns] → markComplete → DONE
    `,
    tools: {
        analyzeRequest: tool({
            description: `Deeply analyze the user's request to plan the agent workflow.
            
            Available agents and their capabilities:
            - researcherAgent: Research, fact-finding, information gathering, source citation
            - writerAgent: Content creation, drafting, storytelling, structuring ideas
            - editorAgent: Reviewing, improving clarity, grammar checking, polishing
            
            Determine:
            1. What does the user actually want?
            2. Which agents are needed?
            3. What order makes sense?
            4. What should each agent focus on?`,

            inputSchema: z.object({
                userIntent: z.string()
                    .describe('What you understand the user wants to achieve'),
                selectedAgents: z.array(
                    z.object({
                        agent: z.enum(['researcherAgent', 'writerAgent', 'editorAgent']),
                        task: z.string().describe('What this specific agent should do'),
                        order: z.number().describe('When in sequence (1, 2, 3...)')
                    })
                ).describe('Agents needed and their specific tasks, in order'),
                reasoning: z.string()
                    .describe('Your complete reasoning for this workflow plan')
            }),

            execute: async ({ userIntent, selectedAgents, reasoning }) => {
                console.log('  🔍 Coordinator Analysis:');
                console.log(`     User Intent: ${userIntent}`);
                console.log(`     Reasoning: ${reasoning}`);
                console.log('     Planned Workflow:');

                // Sort agents by order
                const sortedAgents = selectedAgents.sort((a, b) => a.order - b.order);

                sortedAgents.forEach((a, i) => {
                    console.log(`       ${i + 1}. ${a.agent} - ${a.task}`);
                });

                return {
                    userIntent,
                    reasoning,
                    workflow: sortedAgents.map(a => ({
                        agent: a.agent,
                        task: a.task
                    })),
                    nextAgent: sortedAgents[0].agent,
                    nextTask: sortedAgents[0].task
                };
            },
        }),
        delegateToAgent: tool({
            description: `Delegate a task to a specialized agent. Use this after analyzing the request to hand off work.
            
            When to use each agent:
            - researcherAgent: When you need information gathered, facts researched, sources found
            - writerAgent: When you need content created, articles written, drafts composed
            - editorAgent: When you need content reviewed, polished, or refined
            
            Include context from previous agents so the next agent has all needed information.`,

            inputSchema: z.object({
                agentName: z.enum(["researcherAgent", "writerAgent", "editorAgent"])
                    .describe('Which specialized agent to delegate to'),
                taskDetails: z.string()
                    .describe('Clear, specific instructions for what this agent should do'),
                context: z.string().optional()
                    .describe('Relevant context or results from previous agents (research findings, drafts, etc.)'),
                priority: z.enum(['low', 'medium', 'high']).optional().default('medium')
                    .describe('How important/urgent this task is'),
            }),

            async execute({ agentName, taskDetails, context, priority }) {
                console.log(`\n  🎯 DELEGATION:`);
                console.log(`     To: ${agentName}`);
                console.log(`     Task: ${taskDetails.slice(0, 80)}${taskDetails.length > 80 ? '...' : ''}`);
                console.log(`     Priority: ${priority}`);
                if (context) {
                    console.log(`     Context: ${context.slice(0, 60)}${context.length > 60 ? '...' : ''}`);
                }

                // Return handoff signal for orchestrator
                return {
                    handoff: true,              // ← Tells orchestrator to switch agents
                    targetAgent: agentName,     // ← Which agent to switch to
                    task: taskDetails,          // ← What the agent should do
                    context: context || '',     // ← Context from previous work
                    priority,                   // ← Additional metadata
                    delegatedAt: new Date().toISOString()
                };
            },
        }),

        requestUserInput: tool({
            description: `Ask the human user a clarifying question when the request is ambiguous and you cannot proceed confidently without their answer.

            Use this SPARINGLY and only when:
            - The request is genuinely ambiguous (e.g. missing a key choice, audience, or constraint)
            - Proceeding on a guess would likely produce the wrong result

            Do NOT use this for trivial defaults you can reasonably assume. After you receive the answer, continue the workflow normally (analyze/delegate).`,

            inputSchema: z.object({
                question: z.string()
                    .describe('A single, specific question for the user. Keep it short and concrete.'),
            }),

            // The orchestrator intercepts this tool call (it sees the question in
            // the result), emits an input_request event, waits for the answer,
            // and feeds it back into the next coordinator turn.
            async execute({ question }) {
                console.log(`\n  ❓ REQUEST USER INPUT: ${question}`);
                return {
                    requestUserInput: true,
                    question,
                };
            },
        }),

        markComplete: tool({
            description: `Mark the entire workflow as complete and provide the final response to the user.
            
            ONLY use this when:
            - All necessary agents have completed their work
            - You have synthesized their results into a coherent final answer
            - The user's original request has been fully addressed
            
            Do NOT use this if:
            - You still need another agent to do work
            - The workflow is not finished
            - You're waiting for agent results`,

            inputSchema: z.object({
                finalResponse: z.string()
                    .describe('The complete, polished final answer to give the user'),
                workflowSummary: z.string()
                    .describe('Brief summary of what agents did and how the task was completed'),
                agentsUsed: z.array(z.enum(['researcherAgent', 'writerAgent', 'editorAgent']))
                    .optional()
                    .describe('Which agents were involved in this workflow'),
            }),

            async execute({ finalResponse, workflowSummary, agentsUsed }) {
                console.log(`\n  ✅ WORKFLOW COMPLETE`);
                console.log(`     Summary: ${workflowSummary}`);
                if (agentsUsed && agentsUsed.length > 0) {
                    console.log(`     Agents used: ${agentsUsed.join(' → ')}`);
                }
                console.log(`     Response length: ${finalResponse.length} characters`);

                // Return completion signal for orchestrator
                return {
                    complete: true,             // ← Tells orchestrator workflow is done
                    finalOutput: finalResponse, // ← What to return to user
                    summary: workflowSummary,   // ← Summary for logging
                    agentsUsed: agentsUsed || [],
                    completedAt: new Date().toISOString(),
                    success: true
                };
            },
        }),
    },
    stopWhen: stepCountIs(10),

    });
}

export const coordinatorAgent = createCoordinatorAgent();