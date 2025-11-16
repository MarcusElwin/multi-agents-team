'use client';

import { useState } from 'react';
import { AgentStatus } from './agent-status';

type AgentType = 'coordinator' | 'researcherAgent' | 'writerAgent' | 'editorAgent';

interface AgentStatusData {
  type: string;
  agent?: AgentType;
  action?: string;
  from?: AgentType;
  to?: string;
  content?: string;
  timestamp: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentAgent, setCurrentAgent] = useState<AgentType | null>(null);
  const [completedAgents, setCompletedAgents] = useState<AgentType[]>([]);
  const [agentLogs, setAgentLogs] = useState<AgentStatusData[]>([]);
  const [finalResult, setFinalResult] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);
    setCurrentAgent(null);
    setCompletedAgents([]);
    setAgentLogs([]);
    setFinalResult(null);

    // Add user message
    const newMessages: Message[] = [
      ...messages,
      { id: Date.now().toString(), role: 'user', content: userMessage }
    ];
    setMessages(newMessages);

    try {
      // Connect to SSE endpoint
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages })
      });

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Parse SSE data
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6)) as AgentStatusData;

              // Add to logs
              setAgentLogs(prev => [...prev, data]);

              // Handle different event types
              switch (data.type) {
                case 'agent-status':
                  if (data.agent && data.action === 'activated') {
                    setCurrentAgent(data.agent);
                  }
                  break;

                case 'agent-handoff':
                  if (data.from) {
                    setCompletedAgents(prev => {
                      if (!prev.includes(data.from as AgentType)) {
                        return [...prev, data.from as AgentType];
                      }
                      return prev;
                    });
                  }
                  break;

                case 'workflow-complete':
                  setCurrentAgent(prev => {
                    if (prev) {
                      setCompletedAgents(completedPrev => [...completedPrev, prev]);
                    }
                    return null;
                  });
                  break;

                case 'final-result':
                  setFinalResult(data.content || null);
                  break;
              }
            } catch (err) {
              // Ignore JSON parse errors
            }
          }
        }
      }
    } catch (error) {
      console.error('Stream error:', error);
      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: 'Sorry, there was an error processing your request.'
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement> | { target: { value: string } }) => {
    setInput(e.target.value);
  };

  return (
    <div className="flex min-h-screen bg-zinc-50 dark:bg-black">
      <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full">
        {/* Header */}
        <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Multi-Agent AI System
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
            Powered by Coordinator, Researcher, Writer, and Editor agents
          </p>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex gap-4 p-4 overflow-hidden">
          {/* Chat Messages */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 overflow-y-auto space-y-4 mb-4">
              {messages.length === 0 && (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">🤖</div>
                  <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
                    Welcome to the Multi-Agent System
                  </h2>
                  <p className="text-zinc-600 dark:text-zinc-400 max-w-md mx-auto">
                    Ask me to research, write, or create content. I'll coordinate specialized agents to complete your request.
                  </p>
                  <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl mx-auto">
                    <button
                      onClick={() => {
                        handleInputChange({
                          target: { value: 'Write a blog post about the benefits of multi-agent AI systems' }
                        } as any);
                      }}
                      className="p-4 text-left border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <div className="font-medium text-zinc-900 dark:text-zinc-50">📝 Write Content</div>
                      <div className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                        Create a blog post about AI agents
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        handleInputChange({
                          target: { value: 'Research the latest trends in artificial intelligence and summarize the key findings' }
                        } as any);
                      }}
                      className="p-4 text-left border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <div className="font-medium text-zinc-900 dark:text-zinc-50">🔍 Research Topic</div>
                      <div className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                        Investigate AI trends with sources
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {messages.map((message, index) => (
                <div
                  key={message.id || index}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-4 ${
                      message.role === 'user'
                        ? 'bg-blue-500 text-white'
                        : 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 border border-zinc-200 dark:border-zinc-700'
                    }`}
                  >
                    <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                  </div>
                </div>
              ))}

              {/* Final Result */}
              {finalResult && (
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border border-green-200 dark:border-green-800 rounded-lg p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-green-900 dark:text-green-100">
                      Workflow Complete
                    </h3>
                  </div>
                  <div className="prose dark:prose-invert max-w-none">
                    <div className="text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
                      {finalResult}
                    </div>
                  </div>
                </div>
              )}

              {isLoading && messages.length > 0 && (
                <div className="flex justify-start">
                  <div className="bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 border border-zinc-200 dark:border-zinc-700 rounded-lg p-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input Form */}
            <form onSubmit={handleSubmit} className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 rounded-lg">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={handleInputChange}
                  placeholder="Ask the agents to research, write, or create something..."
                  className="flex-1 px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="px-6 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoading ? 'Working...' : 'Send'}
                </button>
              </div>
            </form>
          </div>

          {/* Agent Status Sidebar */}
          <div className="w-80 flex-shrink-0">
            <AgentStatus currentAgent={currentAgent} completedAgents={completedAgents} />

            {/* Agent Activity Log */}
            {agentLogs.length > 0 && (
              <div className="mt-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">
                  Activity Log
                </h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {agentLogs.map((log, idx) => (
                    <div
                      key={idx}
                      className="text-xs p-2 bg-zinc-50 dark:bg-zinc-800 rounded border border-zinc-200 dark:border-zinc-700"
                    >
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">
                        {log.type.replace(/-/g, ' ').toUpperCase()}
                      </div>
                      {log.agent && (
                        <div className="text-zinc-600 dark:text-zinc-400">
                          Agent: {log.agent}
                        </div>
                      )}
                      {log.from && log.to && (
                        <div className="text-zinc-600 dark:text-zinc-400">
                          {log.from} → {log.to}
                        </div>
                      )}
                      <div className="text-zinc-500 dark:text-zinc-500 mt-1">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
