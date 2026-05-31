import { NextRequest, NextResponse } from 'next/server';
import { runAgentsWithCoordination } from '@/lib/runner';
import { messageBus } from '@/lib/message-bus';
import { resolveModel } from '@/lib/models';
import type { AgentEvent } from '@/lib/agent-events';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { message, model } = await req.json();

  if (!message) {
    return NextResponse.json({ error: 'Message required' }, { status: 400 });
  }

  const resolvedModel = resolveModel(model);

  console.log('\n========================================');
  console.log(`🎬 API REQUEST: v2 workflow · model=${resolvedModel}`);
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
          // controller already closed
        }
      };

      // Keepalive comment every 15s to defeat proxy buffering
      const keepalive = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {
          // ignore
        }
      }, 15_000);

      try {
        await runAgentsWithCoordination(message, { model: resolvedModel }, send);
        // The runner emits its own workflow_complete; don't duplicate it here.

        console.log('\n========================================');
        console.log('✅ API RESPONSE: v2 Workflow Complete');
        console.log('========================================\n');
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown';
        console.error('❌ v2 API Error:', errMsg);
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
    pattern: 'choreography (peer-to-peer, round-robin)',
    agents: ['backendAgent', 'frontendAgent', 'designAgent'],
    messageBusActive: true,
    currentBusStats: messageBus.getStats(),
  });
}
