import { NextRequest, NextResponse } from 'next/server';
import { runAgentsWithCoordination } from '@/lib/runner';
import { Conversation, type ConversationTurn } from '@/lib/conversation';
import { resolveModel } from '@/lib/models';
import { resolveCredentials } from '@/lib/provider';
import { describeError } from '@/lib/error-message';
import { validateAgentRunBody } from '@/lib/validate-request';
import type { AgentEvent } from '@/lib/agent-events';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const parsed = validateAgentRunBody(raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { message, model, history, apiKey, provider } = parsed.body;

  const resolvedModel = resolveModel(model);
  const creds = resolveCredentials({ model: resolvedModel, apiKey, provider });
  if ('error' in creds) {
    return NextResponse.json({ error: creds.error }, { status: 400 });
  }
  const priorTurns: ConversationTurn[] = history;

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
        const conversation = new Conversation(priorTurns);
        await runAgentsWithCoordination(message, { model: resolvedModel, apiKey: creds.apiKey, providerId: creds.providerId }, send, conversation);
        // The runner emits its own workflow_complete; don't duplicate it here.

        console.log('\n========================================');
        console.log('✅ API RESPONSE: v2 Workflow Complete');
        console.log('========================================\n');
      } catch (error) {
        const errMsg = describeError(error);
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
  });
}
