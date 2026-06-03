import { NextRequest, NextResponse } from 'next/server';
import { runEvaluatorOptimizer } from '@/lib/evaluator-optimizer-runner';
import { Conversation, type ConversationTurn } from '@/lib/conversation';
import { resolveModel } from '@/lib/models';
import type { AgentEvent } from '@/lib/agent-events';

export const maxDuration = 180;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { message, model, history } = await req.json();

  if (!message) {
    return NextResponse.json({ error: 'Message required' }, { status: 400 });
  }

  const resolvedModel = resolveModel(model);
  const priorTurns: ConversationTurn[] = Array.isArray(history) ? history : [];

  console.log('\n========================================');
  console.log(`🎬 API REQUEST: v4 evaluator-optimizer · model=${resolvedModel}`);
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

      const keepalive = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {
          // ignore
        }
      }, 15_000);

      try {
        const conversation = new Conversation(priorTurns);
        await runEvaluatorOptimizer(message, { model: resolvedModel }, send, conversation);
        // runEvaluatorOptimizer emits its own workflow_complete.

        console.log('\n========================================');
        console.log('✅ API RESPONSE: v4 Workflow Complete');
        console.log('========================================\n');
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown';
        console.error('❌ v4 API Error:', errMsg);
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
    pattern: 'evaluator-optimizer (generate → critique → revise)',
  });
}
