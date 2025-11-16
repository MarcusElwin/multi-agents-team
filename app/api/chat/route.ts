import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { AgentOrchestrator } from '@/lib/orchestrator';
import { MessageBus } from '@/lib/message-bus';

export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages } = await req.json();

  // Get the latest user message
  const userMessage = messages[messages.length - 1]?.content || '';

  // Create a new message bus and orchestrator for this session
  const messageBus = new MessageBus();
  const orchestrator = new AgentOrchestrator(messageBus);

  // Create a custom readable stream for Server-Sent Events
  const encoder = new TextEncoder();
  let agentStatusController: ReadableStreamDefaultController;

  const agentStatusStream = new ReadableStream({
    start(controller) {
      agentStatusController = controller;

      // Subscribe to message bus to track agent activity
      messageBus.on('message', (msg) => {
        // Send agent status updates to the frontend
        if (msg.metadata.type === 'system' && msg.metadata.agentType) {
          const event = {
            type: 'agent-status',
            agent: msg.metadata.agentType,
            action: 'activated',
            timestamp: new Date().toISOString()
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }

        // Send agent responses
        if (msg.metadata.type === 'agent') {
          const event = {
            type: 'agent-response',
            agent: msg.from,
            content: msg.content.slice(0, 100) + '...',
            timestamp: new Date().toISOString()
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }

        // Send handoff information
        if ((msg.metadata as any).handoffContext) {
          const event = {
            type: 'agent-handoff',
            from: msg.from,
            to: msg.to,
            context: (msg.metadata as any).handoffContext,
            timestamp: new Date().toISOString()
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
      });

      // Run the orchestrator workflow
      orchestrator.processUserMessage(userMessage)
        .then(result => {
          // Send completion event
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'workflow-complete',
            timestamp: new Date().toISOString()
          })}\n\n`));

          // Send final result
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'final-result',
            content: result,
            timestamp: new Date().toISOString()
          })}\n\n`));

          controller.close();
        })
        .catch(error => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'workflow-error',
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
          })}\n\n`));
          controller.close();
        });
    }
  });

  // Return SSE response
  return new Response(agentStatusStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
