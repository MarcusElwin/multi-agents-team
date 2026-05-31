import { Experimental_Agent as Agent, stepCountIs, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { DEFAULT_MODEL, type OpenAIModel } from "../models";

export function createWriterAgent(model: OpenAIModel = DEFAULT_MODEL) {
    return new Agent({
    model: openai(model),
    system: `You are the Writer Agent - an expert in creating engaging, well-structured content.

Your responsibilities:
- Transform research and ideas into polished content
- Structure content logically with clear flow
- Use appropriate tone and style for the target audience
- Format content properly using markdown when appropriate

When you receive a task:
- Review any research findings or context provided
- Create well-organized content with introduction, body, and conclusion
- Use the formatContent tool if special formatting is needed

When your draft is complete:
- Use 'returnToCoordinator' tool to send the draft back
- Usually recommend 'editorAgent' for final review and polish`,

    tools: {
        formatContent: tool({
            description: 'Format content with proper markdown structure',
            inputSchema: z.object({
                content: z.string()
                    .describe('The content to format'),
                style: z.enum(['blog', 'article', 'report', 'documentation', 'email'])
                    .describe('The style/format to apply'),
            }),
            execute: async ({ content, style }) => {
                console.log(`  ✍️  Formatting as: ${style}`);
                
                // Add appropriate structure based on style
                let formatted = content;
                
                switch (style) {
                    case 'blog':
                        formatted = `# Blog Post\n\n${content}\n\n---\n*Published: ${new Date().toLocaleDateString()}*`;
                        break;
                    case 'article':
                        formatted = `# Article\n\n## Introduction\n\n${content}`;
                        break;
                    case 'report':
                        formatted = `# Report\n\n**Date:** ${new Date().toLocaleDateString()}\n\n## Executive Summary\n\n${content}`;
                        break;
                    case 'documentation':
                        formatted = `# Documentation\n\n${content}\n\n## Additional Resources\n\n- [Link](#)\n`;
                        break;
                    case 'email':
                        formatted = `Subject: [Topic]\n\n${content}\n\nBest regards,`;
                        break;
                }
                
                return {
                    formatted,
                    style,
                    wordCount: content.split(/\s+/).length
                };
            }
        }),

        returnToCoordinator: tool({
            description: 'Return draft content to coordinator',
            inputSchema: z.object({
                draft: z.string()
                    .describe('The complete draft content'),
                contentType: z.enum(['blog', 'article', 'report', 'documentation', 'email', 'other'])
                    .describe('Type of content created'),
                nextAgent: z.enum(['editorAgent', 'none'])
                    .describe('Recommended next agent'),
                notes: z.string().optional()
                    .describe('Any notes for the next agent or coordinator')
            }),
            execute: async ({ draft, contentType, nextAgent, notes }) => {
                console.log('  ↩️  Returning to coordinator');
                console.log(`  📝 Draft type: ${contentType}`);
                console.log(`  💡 Recommending: ${nextAgent}`);
                
                return {
                    done: true,
                    draft,
                    contentType,
                    wordCount: draft.split(/\s+/).length,
                    nextAgent,
                    notes: notes || '',
                    fromAgent: 'writerAgent'
                };
            }
        })
    },
    
    stopWhen: stepCountIs(8),
    });
}

export const writerAgent = createWriterAgent();