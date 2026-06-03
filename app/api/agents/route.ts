import { NextRequest, NextResponse } from 'next/server';
import { AgentOrchestrator } from '@/lib/orchestrator';
import { Conversation, type ConversationTurn } from '@/lib/conversation';
import { resolveModel } from '@/lib/models';
import { resolveCredentials } from '@/lib/provider';
import type { AgentEvent } from '@/lib/agent-events';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { message, model, history, apiKey, provider } = await req.json();

  if (!message) {
    return NextResponse.json({ error: 'Message required' }, { status: 400 });
  }

  const resolvedModel = resolveModel(model);
  const creds = resolveCredentials({ model: resolvedModel, apiKey, provider });
  if ('error' in creds) {
    return NextResponse.json({ error: creds.error }, { status: 400 });
  }
  const priorTurns: ConversationTurn[] = Array.isArray(history) ? history : [];

  console.log('\n========================================');
  console.log(`🎬 API REQUEST: v1 workflow · model=${resolvedModel}`);
  console.log('========================================\n');

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: AgentEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // ignore
        }
      };

      const keepalive = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {
          // ignore
        }
      }, 15_000);

      try {
        const orchestrator = new AgentOrchestrator({ model: resolvedModel, apiKey: creds.apiKey, providerId: creds.providerId });
        const conversation = new Conversation(priorTurns);
        await orchestrator.processUserMessage(message, send, conversation);
        // The orchestrator emits its own workflow_complete; don't duplicate it here.

        console.log('\n========================================');
        console.log('✅ API RESPONSE: Workflow Complete');
        console.log('========================================\n');
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown';
        console.error('❌ API Error:', errMsg);
        send({ type: 'workflow_error', error: errMsg });
      } finally {
        clearInterval(keepalive);
        closed = true;
        try {
          controller.close();
        } catch {
          // ignore
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

export async function GET() {
  return NextResponse.json({
    status: 'ready',
    agents: ['coordinator', 'researcherAgent', 'writerAgent', 'editorAgent'],
    messageBusActive: true,
  });
}
