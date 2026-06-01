import { NextRequest, NextResponse } from 'next/server';
import { resolveInput } from '@/lib/input-registry';

export const dynamic = 'force-dynamic';

/**
 * Delivers a human answer to a paused agent run (see lib/input-registry).
 * The streaming run is awaiting waitForInput(requestId); this unblocks it.
 */
export async function POST(req: NextRequest) {
  const { requestId, answer } = await req.json();

  if (!requestId || typeof requestId !== 'string') {
    return NextResponse.json({ error: 'requestId required' }, { status: 400 });
  }

  const delivered = resolveInput(requestId, typeof answer === 'string' ? answer : '');

  if (!delivered) {
    // No run was waiting — likely already timed out or completed.
    return NextResponse.json({ ok: false, reason: 'no pending request' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
