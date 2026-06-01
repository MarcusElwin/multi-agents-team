import { Experimental_Agent as Agent, stepCountIs, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { DEFAULT_MODEL, type OpenAIModel } from "../models";
import { type AgentHooks } from "../agent-events";
import { makeStepHook } from "./researcher-agent";
import * as log from "../logger";

export function createEditorAgent(model: OpenAIModel = DEFAULT_MODEL, hooks: AgentHooks = {}) {
    return new Agent({
    model: openai(model),
    system: `You are the Editor Agent - an expert in reviewing and polishing content.

Your responsibilities:
- Review content for clarity, coherence, and quality
- Check grammar, spelling, and punctuation
- Improve sentence structure and flow
- Ensure consistent tone and style
- Verify facts and claims when possible

When you receive content to edit:
- Use assessQuality tool to evaluate the content
- Make improvements to grammar, clarity, and structure
- Maintain the original intent and voice

When editing is complete:
- Use 'returnToCoordinator' tool with the polished version
- Always set nextAgent to 'none' (editing is typically the final step)
- Provide summary of improvements made`,

    tools: {
        assessQuality: tool({
            description: 'Assess the quality of content',
            inputSchema: z.object({
                content: z.string()
                    .describe('Content to assess'),
                criteria: z.array(z.enum([
                    'grammar',
                    'clarity', 
                    'coherence',
                    'engagement',
                    'accuracy',
                    'structure'
                ])).optional().default(['grammar', 'clarity', 'coherence'])
                    .describe('Quality criteria to check')
            }),
            execute: async ({ content, criteria }) => {
                log.detail('📊 assessing', criteria.join(', '));
                
                // Mock quality assessment - in real scenario, could use additional LLM call
                const wordCount = content.split(/\s+/).length;
                const sentenceCount = content.split(/[.!?]+/).filter(s => s.trim()).length;
                
                return {
                    overallScore: 8.5,
                    criteria: criteria.map(c => ({
                        criterion: c,
                        score: 7.5 + Math.random() * 2,
                        feedback: `${c} is generally good with minor improvements possible`
                    })),
                    wordCount,
                    sentenceCount,
                    avgWordsPerSentence: Math.round(wordCount / sentenceCount),
                    readabilityLevel: 'intermediate'
                };
            }
        }),

        returnToCoordinator: tool({
            description: 'Return final polished content to coordinator',
            inputSchema: z.object({
                finalContent: z.string()
                    .describe('The final, polished version of the content'),
                improvements: z.string()
                    .describe('Summary of improvements made'),
                qualityScore: z.number().optional()
                    .describe('Overall quality score (1-10)'),
            }),
            execute: async ({ finalContent, improvements, qualityScore }) => {
                log.complete('editing complete', `quality: ${qualityScore ?? 'N/A'} · ${finalContent.length} chars`);
                
                return {
                    done: true,
                    finalContent,
                    improvements,
                    qualityScore: qualityScore || 9.0,
                    nextAgent: 'none', // Editor is usually the last step
                    fromAgent: 'editorAgent',
                    workflowComplete: true
                };
            }
        })
    },
    
    stopWhen: stepCountIs(8),
    onStepFinish: makeStepHook(hooks),
    });
}