import { Experimental_Agent as Agent, stepCountIs, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { MessageBus } from "../message-bus";
import { z } from "zod";
import { DEFAULT_MODEL, type OpenAIModel } from "../models";

// The bus is supplied per-conversation so no state leaks across requests.
// Inbox reads go through bus.getInbox('designAgent', ...).

export function createDesignAgent(model: OpenAIModel = DEFAULT_MODEL, bus: MessageBus = new MessageBus()) {
    return new Agent({
    model: openai(model),
    system: `You are the Design Agent - an expert in Product design, design thinking and user experience.
    You are obsessed with pixels and details! It needs to look good and have taste!

    ITERATIVE WORKFLOW:

    FIRST ITERATION:
    1. Analyze user requirements for UX/UI needs
    2. Create initial design specifications (layouts, colors, typography, flows)
    3. Use 'coordinationTool' to share your design vision with frontend and backend
    4. Ask frontend about technical constraints and component libraries
    5. Ask backend about data that will be available to display
    6. DO NOT call markCompleted yet - wait for their input

    SUBSEQUENT ITERATIONS:
    1. Use 'readMessages' to check for responses from frontend/backend
    2. If you have responses:
       - Refine your design based on technical feasibility
       - Adjust UI based on available data from backend
       - Create detailed design specs frontend can implement
       - If design is refined and everyone is aligned, call 'markCompleted'
    3. If still waiting for technical feedback, continue iterating

    WHEN TO CALL markCompleted:
    - You've shared your initial design vision with other agents
    - You've received feedback on technical feasibility from frontend
    - You've understood what data backend will provide
    - Your design is refined and implementable
    - You've provided detailed specs (colors, spacing, typography, components)
    - All coordination conversations are complete

    CRITICAL RULES:
    - DO create concrete design specifications
    - DO specify actual colors, fonts, layouts, spacing
    - DO respond to technical questions from frontend/backend
    - DO iterate your design based on technical constraints
    - DO call markCompleted only after design is feasible and detailed`,

    tools: {
        coordinationTool: tool({
            description: 'Send a message to another agent via the message bus. Use the exact recipient name.',
            inputSchema: z.object({
                recipientAgent: z.enum(['backendAgent', 'frontendAgent'])
                    .describe('Recipient agent. Must be exactly "backendAgent" or "frontendAgent".'),
                messageContent: z.string()
                    .describe('The content of the message to send')
            }),
            execute: async ({ recipientAgent, messageContent }) => {
                console.log(`  📡 Sending message to ${recipientAgent}...`);
                bus.publish({
                    from: 'designAgent',
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

                const messages = bus.getInbox('designAgent', fromAgent);

                if (messages.length === 0) {
                    return 'No messages received yet.';
                }

                return messages.map(msg =>
                    `From: ${msg.from}\nTime: ${msg.metadata.timestamp}\nContent: ${msg.content}`
                ).join('\n\n---\n\n');
            }
        }),
        markCompleted: tool({
            description: 'Mark the design implementation as completed',
            inputSchema: z.object({
                summary: z.string()
                    .describe('Summary of the completed design implementation')
            }),
            execute: async ({ summary }) => {
                console.log('  ✅ Design implementation marked as completed.');
                // Here you could add additional logic, e.g., notify other agents
                return `Design implementation completed: ${summary}`;
            }
        })
    },
    stopWhen: stepCountIs(20),
    });
}
