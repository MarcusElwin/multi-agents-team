import { EventEmitter } from 'events';

export interface Message {
    id: string,
    from: string,
    to: string,
    content: string,
    metadata: {
        timestamp: Date;
        type: 'user' | 'agent' | 'system';
        agentType?: 'coordinator' | 'researcherAgent' | 'writerAgent' | 'editorAgent';
        // Add optional extended metadata
        toolResults?: any;
        handoffContext?: any;
        stepCount?: number;
        workComplete?: boolean;
        error?: boolean;
    };
}

export class MessageBus extends EventEmitter {
    private messages: Message[] = [];

    constructor() {
        super();
        console.log('📨 MessageBus initialized');
    }

    publish(message: Omit<Message, 'id'>) {
        const msgWithId: Message = {
            id: crypto.randomUUID(),
            ...message
        };
        this.messages.push(msgWithId);

        console.log(`
        📬 Message Published:
        From: ${msgWithId.from}
        To: ${msgWithId.to}
        Type: ${msgWithId.metadata.type}
        Content: ${msgWithId.content.slice(0, 50)}...
            `);
            
        this.emit('message', msgWithId);
        this.emit(`message:${msgWithId.to}`, msgWithId);
            
        return msgWithId;
    }

    subscribe(agentId: string, callback: (message: Message) => void) {
        this.on(`message:${agentId}`, callback);
        console.log(`🔔 Agent ${agentId} subscribed to messages`);
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
        console.log('🗑️ Message bus cleared');
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