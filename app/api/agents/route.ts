import { NextRequest, NextResponse } from 'next/server';
import { AgentOrchestrator } from '@/lib/orchestrator';
import { messageBus } from '@/lib/message-bus';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();

    if (!message) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    console.log('\n========================================');
    console.log('🎬 API REQUEST: New Agent Workflow');
    console.log('========================================\n');

    const orchestrator = new AgentOrchestrator(messageBus);
    const result = await orchestrator.processUserMessage(message);
    const messageHistory = orchestrator.getMessageHistory();

    console.log('\n========================================');
    console.log('✅ API RESPONSE: Workflow Complete');
    console.log('========================================\n');

    return NextResponse.json({
      success: true,
      result,
      messageHistory,
      totalMessages: messageHistory.length,
      agentsUsed: Array.from(
        new Set(
          messageHistory
            .filter(m => m.metadata.type === 'agent')
            .map(m => m.from)
        )
      )
    });

  } catch (error) {
    console.error('❌ API Error:', error);
    return NextResponse.json(
      { 
        error: 'Workflow failed', 
        details: error instanceof Error ? error.message : 'Unknown' 
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ready',
    agents: ['coordinator', 'researcherAgent', 'writerAgent', 'editorAgent'],
    messageBusActive: true
  });
}