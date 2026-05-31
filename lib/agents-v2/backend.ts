import { Experimental_Agent as Agent, stepCountIs, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { messageBus, Message } from "../message-bus";
import { z } from "zod";
import { DEFAULT_MODEL, type OpenAIModel } from "../models";

// Storage for received messages
const receivedMessages: Message[] = [];

// Subscribe to messages addressed to this agent
messageBus.subscribe('backendAgent', (message: Message) => {
    console.log(`  📬 Backend Agent received message from ${message.from}`);
    receivedMessages.push(message);
});

export function createBackendAgent(model: OpenAIModel = DEFAULT_MODEL) {
    return new Agent({
    model: openai(model),
    system: `You are the Backend Agent - an expert in backend development and API design.

    ITERATIVE WORKFLOW:

    FIRST ITERATION:
    1. Analyze user requirements for backend needs
    2. Design initial backend architecture (database, APIs, services)
    3. Use 'coordinationTool' to share your design with frontend and design agents
    4. Ask them specific questions about their needs
    5. DO NOT call markCompleted yet - wait for their feedback

    SUBSEQUENT ITERATIONS:
    1. Use 'readMessages' to check for feedback from other agents
    2. If you have feedback:
       - Refine your design based on their input
       - Share updated specs if needed
       - If everyone's requirements are addressed, call 'markCompleted'
    3. If no feedback yet, wait (don't call markCompleted)

    WHEN TO CALL markCompleted:
    - You've shared your backend design with other agents
    - You've received and incorporated feedback from frontend/design
    - Your APIs align with what frontend needs
    - Your data model supports what design requires
    - All coordination conversations have concluded

    CRITICAL RULES:
    - DO create concrete designs (not just "I'll coordinate")
    - DO share actual API specs, endpoints, data models
    - DO ask other agents for their specific needs
    - DO iterate based on feedback
    - DO call markCompleted only after coordination is done`,

    tools: {
        coordinationTool: tool({
            description: 'Send a message to another agent via the message bus. Use the exact recipient name.',
            inputSchema: z.object({
                recipientAgent: z.enum(['frontendAgent', 'designAgent'])
                    .describe('Recipient agent. Must be exactly "frontendAgent" or "designAgent".'),
                messageContent: z.string()
                    .describe('The content of the message to send')
            }),
            execute: async ({ recipientAgent, messageContent }) => {
                console.log(`  📡 Sending message to ${recipientAgent}...`);
                messageBus.publish({
                    from: 'backendAgent',
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
            description: 'Mark the backend implementation as completed',
            inputSchema: z.object({
                summary: z.string()
                    .describe('Summary of the backend implementation completed')
            }),
            execute: async ({ summary }) => {
                console.log('  ✅ Backend implementation marked as completed.');
                return `Backend implementation completed: ${summary}`;
            }
        }),
    },
stopWhen: stepCountIs(20),
    });
}

export const backendAgent = createBackendAgent();
