import { Experimental_Agent as Agent, stepCountIs, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { messageBus, Message } from "../message-bus";
import { z } from "zod";
import { DEFAULT_MODEL, type OpenAIModel } from "../models";

// Storage for received messages
const receivedMessages: Message[] = [];

// Subscribe to messages addressed to this agent
messageBus.subscribe('frontendAgent', (message: Message) => {
    console.log(`  📬 Frontend Agent received message from ${message.from}`);
    receivedMessages.push(message);
});

export function createFrontendAgent(model: OpenAIModel = DEFAULT_MODEL) {
    return new Agent({
    model: openai(model),
    system: `You are the Frontend Agent - an expert in frontend development and visual design.

    ITERATIVE WORKFLOW:

    FIRST ITERATION:
    1. Analyze user requirements for frontend needs
    2. Design initial frontend architecture (components, state, layouts)
    3. Use 'coordinationTool' to share your component structure with backend and design
    4. Ask backend for API specs you'll need
    5. Ask design for UI/UX guidelines and styling
    6. DO NOT call markCompleted yet - wait for their responses

    SUBSEQUENT ITERATIONS:
    1. Use 'readMessages' to check for responses from backend/design
    2. If you have responses:
       - Refine your frontend design based on backend API specs
       - Update component structure based on design feedback
       - Share updated architecture if needed
       - If you have all the info you need and design is solid, call 'markCompleted'
    3. If still waiting for responses, continue iterating

    WHEN TO CALL markCompleted:
    - You've shared your frontend architecture with other agents
    - You've received backend API specifications
    - You've received design guidelines and styling specs
    - Your components integrate well with backend APIs
    - Your implementation follows design specifications
    - All coordination is complete

    CRITICAL RULES:
    - DO create concrete component designs
    - DO share actual component names, state structure, API calls
    - DO respond to messages from other agents with your requirements
    - DO iterate and refine based on feedback
    - DO call markCompleted only after you have what you need from others`,

    tools: {
        coordinationTool: tool({
            description: 'Send a message to another agent via the message bus. Use the exact recipient name.',
            inputSchema: z.object({
                recipientAgent: z.enum(['backendAgent', 'designAgent'])
                    .describe('Recipient agent. Must be exactly "backendAgent" or "designAgent".'),
                messageContent: z.string()
                    .describe('The content of the message to send')
            }),
            execute: async ({ recipientAgent, messageContent }) => {
                console.log(`  📡 Sending message to ${recipientAgent}...`);
                messageBus.publish({
                    from: 'frontendAgent',
                    to: recipientAgent,
                    content: messageContent,
                    metadata: {
                        timestamp: new Date(),
                        type: 'agent',
                        agentType: 'coordinator'
                    }
                });
                return `Message sent to ${recipientAgent}`;
            }
        }),
        readMessages: tool({
            description: 'Read messages received from other agents',
            inputSchema: z.object({
                fromAgent: z.string().optional()
                    .describe('Optional: filter messages from a specific agent')
            }),
            execute: async ({ fromAgent }) => {
                console.log('  📖 Reading received messages...');

                let messages = receivedMessages;
                if (fromAgent) {
                    messages = receivedMessages.filter(msg => msg.from === fromAgent);
                }

                if (messages.length === 0) {
                    return 'No messages received yet.';
                }

                return messages.map(msg =>
                    `From: ${msg.from}\nTime: ${msg.metadata.timestamp}\nContent: ${msg.content}`
                ).join('\n\n---\n\n');
            }
        }),
        markCompleted: tool({
            description: 'Mark the frontend implementation as completed',
            inputSchema: z.object({
                summary: z.string()
                    .describe('Summary of the completed frontend implementation')
            }),
            execute: async ({ summary }) => {
                console.log('  ✅ Frontend implementation marked as completed.');
                // In a real scenario, this could update a project management system or notify other agents
                return `Frontend implementation completed: ${summary}`;
            }
        }),
    },
stopWhen: stepCountIs(20)
    });
}

export const frontendAgent = createFrontendAgent();
