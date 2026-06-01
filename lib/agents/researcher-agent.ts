import { Experimental_Agent as Agent, stepCountIs, tool, generateObject, generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { DEFAULT_MODEL, type OpenAIModel } from "../models";
import type { AgentHooks } from "../agent-events";
import * as log from "../logger";

export function createResearcherAgent(model: OpenAIModel = DEFAULT_MODEL, hooks: AgentHooks = {}) {
    return new Agent({
    model: openai(model),
    system: `You are the Researcher Agent - an expert in gathering and analyzing information.

    Your responsibilities:
    - Conduct thorough research using the webSearch tool (which uses OpenAI's real web search)
    - Extract and structure key information from search results
    - Find credible sources and cite them properly
    - Synthesize findings into clear, actionable insights
    
    CRITICAL: When your research is complete, you MUST call the returnToCoordinator tool.
    DO NOT just provide a text response - you must use the tool to return results.
    
    When your research is complete:
    - Use 'returnToCoordinator' tool to send findings back
    - Include all sources you found
    - Recommend next agent (usually 'writerAgent' if content needs to be created)
    
    IMPORTANT: Always end your work by calling returnToCoordinator. Never just respond with text.`,
    tools: {
        webSearch: tool({
            description: 'Search the web using OpenAI web search and get real-time information with sources',
            inputSchema: z.object({
                query: z.string()
                    .describe('The search query to research'),
                extractionGoal: z.string()
                    .describe('What specific information to extract (e.g., "key benefits", "recent statistics", "main challenges")'),
            }),
            execute: async ({ query, extractionGoal }) => {
                log.detail('🔍 search', query);
                log.detail('🎯 goal', extractionGoal);
                hooks.onWebSearch?.({ status: 'start', query });

                // Single active-spinner ref so the catch can always stop the
                // one that's running, whichever phase failed.
                let spin = log.spinner(`searching the web: "${query.slice(0, 50)}${query.length > 50 ? '…' : ''}"`);
                try {
                    // Step 1: OpenAI web search with sourced citations. Uses the
                    // run's selected model (was hardcoded to gpt-4.1). Tool key
                    // must be `web_search` for the current openai.tools.webSearch.
                    const { text, sources } = await generateText({
                        model: openai.responses(model),
                        prompt: `${query}\n\nFocus on: ${extractionGoal}`,
                        tools: {
                            web_search: openai.tools.webSearch({}),
                        },
                    });

                    spin.succeed(`found ${sources?.length ?? 0} source${sources?.length === 1 ? '' : 's'} · ${text.length} chars`);
                    hooks.onWebSearch?.({ status: 'done', query, sources: sources?.length ?? 0 });

                    spin = log.spinner('structuring findings…');
                    // Step 2: Use generateObject to structure the findings
                    const structuredData = await generateObject({
                        model: openai.responses(model),
                        schema: z.object({
                            summary: z.string()
                                .describe('Brief summary of findings'),
                            keyFindings: z.array(
                                z.object({
                                    finding: z.string().describe('The key finding or fact'),
                                    importance: z.enum(['high', 'medium', 'low']).describe('How important this finding is'),
                                    sourceIndex: z.number().optional().describe('Index of source in sources array')
                                })
                            ).describe('List of key findings extracted'),
                            statistics: z.array(
                                z.object({
                                    stat: z.string().describe('The statistic or data point'),
                                    context: z.string().describe('Context for this statistic'),
                                    year: z.string().optional().describe('Year this data is from')
                                })
                            ).optional().describe('Relevant statistics if found'),
                            suggestedTopics: z.array(z.string())
                                .describe('Related topics that might need further research')
                        }),
                        prompt: `Extract structured information from this web search about "${query}":

${text}

Focus on: ${extractionGoal}

Identify key findings, relevant statistics, and related topics that might need further research.`
                    });

                    const nStats = structuredData.object.statistics?.length ?? 0;
                    spin.succeed(
                        `extracted ${structuredData.object.keyFindings.length} finding${structuredData.object.keyFindings.length === 1 ? '' : 's'}` +
                        (nStats ? ` · ${nStats} stat${nStats === 1 ? '' : 's'}` : '')
                    );

                    return {
                        success: true,
                        rawText: text,
                        sources: sources || [],
                        structured: structuredData.object,
                    };

                } catch (error) {
                    spin.fail(`web search failed: ${error instanceof Error ? error.message : 'unknown error'}`);

                    // Fallback to mock data if web search fails
                    return {
                        success: false,
                        error: error instanceof Error ? error.message : 'Unknown error',
                        rawText: `Research on ${query} failed. Please try again.`,
                        sources: [],
                        structured: {
                            summary: `Unable to complete web search for: ${query}`,
                            keyFindings: [
                                {
                                    finding: `Web search unavailable. Using general knowledge about ${query}.`,
                                    importance: 'medium' as const
                                }
                            ],
                            suggestedTopics: ['Retry search', 'Use alternative sources']
                        }
                    };
                }
            }
        }),

        returnToCoordinator: tool({
            description: 'Return comprehensive research findings to coordinator with structured data and sources',
            inputSchema: z.object({
                findings: z.string()
                    .describe('Summary of all research findings'),
                structuredData: z.object({
                    keyFindings: z.array(z.object({
                        finding: z.string(),
                        importance: z.enum(['high', 'medium', 'low'])
                    })),
                    sources: z.array(z.object({
                        title: z.string().optional(),
                        url: z.string().optional(),
                    })),
                    statistics: z.array(z.string()).optional()
                }).describe('Structured research data'),
                nextAgent: z.enum(['writerAgent', 'editorAgent', 'none'])
                    .describe('Recommended next agent'),
                reasoning: z.string()
                    .describe('Why you recommend this next step')
            }),
            execute: async ({ findings, structuredData, nextAgent, reasoning }) => {
                log.complete('research returned to coordinator',
                    `${structuredData.keyFindings.length} findings · ${structuredData.sources.length} sources · next: ${nextAgent}`);
                
                return {
                    done: true,
                    findings,
                    structuredData,
                    keyInsights: structuredData.keyFindings
                        .filter(f => f.importance === 'high')
                        .map(f => f.finding),
                    sources: structuredData.sources
                        .map(s => s.url || s.title)
                        .filter(Boolean),
                    nextAgent,
                    reasoning,
                    fromAgent: 'researcherAgent'
                };
            }
        })
    },

    stopWhen: stepCountIs(20),
    onStepFinish: makeStepHook(hooks),
    });
}

/**
 * Builds an onStepFinish callback that forwards each step's reasoning text and
 * tool names to the run via hooks.onStep. Shared shape across all agents.
 */
export function makeStepHook(hooks: AgentHooks) {
    let stepIndex = 0;
    return (step: { text?: string; toolCalls?: Array<{ toolName: string }> }) => {
        const toolNames = (step.toolCalls ?? []).map((t) => t.toolName);
        hooks.onStep?.({
            stepIndex: stepIndex++,
            text: (step.text ?? '').trim(),
            toolNames,
        });
    };
}