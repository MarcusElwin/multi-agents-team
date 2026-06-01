import { MessageBus } from './message-bus';

/**
 * A single turn of user-facing conversation. Persisted by the client and
 * replayed into each run so the agent system has memory across turns.
 */
export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Per-conversation context. Owns its own MessageBus (no cross-request leaks)
 * and the prior chat history. One Conversation per run; constructed fresh in
 * the API route from the history the client sends.
 *
 * This replaces the module-level `messageBus` singleton and the per-agent
 * `receivedMessages` arrays, both of which leaked state across requests and
 * were not safe under concurrency.
 */
export class Conversation {
  readonly bus: MessageBus;
  readonly history: ConversationTurn[];

  constructor(history: ConversationTurn[] = [], bus: MessageBus = new MessageBus()) {
    this.bus = bus;
    this.history = history;
  }

  /**
   * Render prior turns as a compact transcript for injection into an agent
   * prompt. Excludes the current (just-sent) user message, which callers pass
   * separately as the live task. Returns '' when there is no prior history.
   */
  renderHistory(maxTurns = 10, maxCharsPerTurn = 600): string {
    if (this.history.length === 0) return '';
    const turns = this.history.slice(-maxTurns);
    const lines = turns.map((t) => {
      const who = t.role === 'user' ? 'User' : 'Assistant';
      const body =
        t.content.length > maxCharsPerTurn
          ? t.content.slice(0, maxCharsPerTurn) + '…'
          : t.content;
      return `${who}: ${body}`;
    });
    return lines.join('\n\n');
  }

  /** True when this is a follow-up turn (there is prior conversation). */
  get hasHistory(): boolean {
    return this.history.length > 0;
  }
}
