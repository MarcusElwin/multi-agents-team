import type { ConversationTurn } from './conversation';
import type { ProviderId } from './models';
import { asBackend, type Backend } from './backends';

/**
 * Defensive bounds for the agent-run request body. The downstream
 * Conversation.renderHistory already caps how much history reaches a prompt,
 * but the *route boundary* must reject oversized or malformed bodies up front —
 * otherwise a public BYO-key deploy can be made to buffer/parse arbitrarily
 * large payloads (memory/cost abuse) before any of those caps apply.
 */
export const LIMITS = {
  /** Max characters in the live user message. ~messages are short prompts. */
  MESSAGE_MAX_CHARS: 8_000,
  /** Max prior turns accepted (renderHistory only reads the last 10 anyway). */
  HISTORY_MAX_TURNS: 50,
  /** Max characters per history turn before we reject the body. */
  HISTORY_TURN_MAX_CHARS: 20_000,
  /** Max length of an API key string (defends against junk-key memory abuse). */
  API_KEY_MAX_CHARS: 400,
} as const;

export interface AgentRunBody {
  message: string;
  model?: string;
  history: ConversationTurn[];
  apiKey?: string;
  provider?: ProviderId;
  /** Which execution backend runs this turn. Defaults to the in-app harness. */
  backend: Backend;
}

export type ValidationResult =
  | { ok: true; body: AgentRunBody }
  | { ok: false; error: string };

/**
 * Validate + normalize the shared agent-run request body. Returns a clean,
 * bounded `AgentRunBody` or a human-readable error (caller responds 400).
 * Never throws on malformed input.
 */
export function validateAgentRunBody(raw: unknown): ValidationResult {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'Invalid request body.' };
  }
  const b = raw as Record<string, unknown>;

  const message = b.message;
  if (typeof message !== 'string' || message.trim().length === 0) {
    return { ok: false, error: 'Message required.' };
  }
  if (message.length > LIMITS.MESSAGE_MAX_CHARS) {
    return { ok: false, error: `Message too long (max ${LIMITS.MESSAGE_MAX_CHARS} characters).` };
  }

  // History is optional; tolerate absent/garbage by treating it as empty, but
  // reject an over-large array or oversized turns rather than silently buffering.
  let history: ConversationTurn[] = [];
  if (b.history != null) {
    if (!Array.isArray(b.history)) {
      return { ok: false, error: 'History must be an array.' };
    }
    if (b.history.length > LIMITS.HISTORY_MAX_TURNS) {
      return { ok: false, error: `Too many history turns (max ${LIMITS.HISTORY_MAX_TURNS}).` };
    }
    for (const turn of b.history) {
      if (
        typeof turn !== 'object' ||
        turn === null ||
        ((turn as ConversationTurn).role !== 'user' && (turn as ConversationTurn).role !== 'assistant') ||
        typeof (turn as ConversationTurn).content !== 'string'
      ) {
        return { ok: false, error: 'Malformed history turn.' };
      }
      if ((turn as ConversationTurn).content.length > LIMITS.HISTORY_TURN_MAX_CHARS) {
        return { ok: false, error: 'A history turn is too long.' };
      }
    }
    history = b.history as ConversationTurn[];
  }

  const apiKey =
    typeof b.apiKey === 'string' && b.apiKey.trim() ? b.apiKey.trim() : undefined;
  if (apiKey && apiKey.length > LIMITS.API_KEY_MAX_CHARS) {
    return { ok: false, error: 'API key looks invalid (too long).' };
  }

  const model = typeof b.model === 'string' ? b.model : undefined;
  const provider =
    b.provider === 'openai' || b.provider === 'anthropic' || b.provider === 'mistral' || b.provider === 'fireworks'
      ? (b.provider as ProviderId)
      : undefined;

  // Backend is optional from older clients; coerce to a valid value (default
  // 'current') rather than rejecting, so existing chats keep working.
  const backend = asBackend(b.backend);

  return { ok: true, body: { message, model, history, apiKey, provider, backend } };
}
