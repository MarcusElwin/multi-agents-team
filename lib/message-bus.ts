import { EventEmitter } from 'events';
import * as log from './logger';

export interface Message {
    id: string,
    from: string,
    to: string,
    content: string,
    metadata: {
        timestamp: Date;
        type: 'user' | 'agent' | 'system';
        agentType?: 'coordinator' | 'researcherAgent' | 'writerAgent' | 'editorAgent';
        // Optional extended metadata. Kept loosely typed (consumers narrow at
        // the use site, e.g. orchestrator's HandoffContext); unknown beats any.
        toolResults?: Record<string, unknown>;
        handoffContext?: Record<string, unknown>;
        stepCount?: number;
        workComplete?: boolean;
        error?: boolean;
    };
}

// Canonical agent ids and the aliases LLMs sometimes invent for them.
const AGENT_ALIASES: Record<string, string> = {
    backend: 'backendAgent',
    'backend-agent': 'backendAgent',
    backend_agent: 'backendAgent',
    frontend: 'frontendAgent',
    'frontend-agent': 'frontendAgent',
    frontend_agent: 'frontendAgent',
    design: 'designAgent',
    'design-agent': 'designAgent',
    design_agent: 'designAgent',
    researcher: 'researcherAgent',
    writer: 'writerAgent',
    editor: 'editorAgent',
};

function canonicalizeAgentName(name: string): string {
    return AGENT_ALIASES[name] ?? name;
}

export class MessageBus extends EventEmitter {
    private messages: Message[] = [];
    // Per-recipient inboxes, maintained automatically on publish. This replaces
    // the per-agent module-level `receivedMessages` arrays the v2 agents used to
    // keep, which leaked across requests because they were never cleared.
    private inboxes = new Map<string, Message[]>();

    constructor() {
        super();
        log.debug('MessageBus initialized');
    }

    publish(message: Omit<Message, 'id'>) {
        const canonicalTo = canonicalizeAgentName(message.to);
        const canonicalFrom = canonicalizeAgentName(message.from);
        const msgWithId: Message = {
            id: crypto.randomUUID(),
            ...message,
            from: canonicalFrom,
            to: canonicalTo,
        };
        this.messages.push(msgWithId);

        const inbox = this.inboxes.get(canonicalTo);
        if (inbox) inbox.push(msgWithId);
        else this.inboxes.set(canonicalTo, [msgWithId]);

        log.message(msgWithId.from, msgWithId.to, msgWithId.metadata.type, msgWithId.content);

        this.emit('message', msgWithId);
        this.emit(`message:${msgWithId.to}`, msgWithId);

        return msgWithId;
    }

    subscribe(agentId: string, callback: (message: Message) => void) {
        this.on(`message:${agentId}`, callback);
        log.debug(`Agent ${agentId} subscribed`);
    }

    /** Messages addressed to a given agent, optionally filtered by sender. */
    getInbox(agentId: string, fromAgent?: string): Message[] {
        const inbox = this.inboxes.get(canonicalizeAgentName(agentId)) ?? [];
        if (!fromAgent) return inbox;
        const from = canonicalizeAgentName(fromAgent);
        return inbox.filter((m) => m.from === from);
    }

    // Updated to support optional filtering
    getMessageHistory(filter?: { from?: string; to?: string; type?: 'user' | 'agent' | 'system' }): Message[] {
        if (!filter) {
            return this.messages;
        }
        
        return this.messages.filter(msg => {
            if (filter.from && msg.from !== filter.from) return false;
            if (filter.to && msg.to !== filter.to) return false;
            if (filter.type && msg.metadata.type !== filter.type) return false;
            return true;
        });
    }

    clear() {
        this.messages = [];
        this.inboxes.clear();
        log.debug('Message bus cleared');
    }

    getHandoffMessages(): Message[] {
        return this.messages.filter(msg => msg.metadata.handoffContext);
      }

    getMessagesWithToolResults(): Message[] {
    return this.messages.filter(msg => 
        msg.metadata.toolResults && 
        Object.keys(msg.metadata.toolResults).length > 0
    );
    }
    
    getStats() {
        const agentMessages = this.messages.filter(m => m.metadata.type === 'agent');
        const uniqueAgents = new Set(agentMessages.map(m => m.from));
        
        return {
          totalMessages: this.messages.length,
          userMessages: this.messages.filter(m => m.metadata.type === 'user').length,
          agentMessages: agentMessages.length,
          systemMessages: this.messages.filter(m => m.metadata.type === 'system').length,
          uniqueAgents: Array.from(uniqueAgents),
          handoffs: this.getHandoffMessages().length,
          messagesWithToolResults: this.getMessagesWithToolResults().length
        };
      }
}

export const messageBus = new MessageBus();