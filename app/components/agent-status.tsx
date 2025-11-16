'use client';

type AgentType = 'coordinator' | 'researcherAgent' | 'writerAgent' | 'editorAgent';

interface AgentStatusProps {
  currentAgent: AgentType | null;
  completedAgents: AgentType[];
}

const agentInfo: Record<AgentType, { name: string; icon: string; color: string; description: string }> = {
  coordinator: {
    name: 'Coordinator',
    icon: '🎯',
    color: 'bg-blue-500',
    description: 'Planning workflow'
  },
  researcherAgent: {
    name: 'Researcher',
    icon: '🔍',
    color: 'bg-green-500',
    description: 'Gathering information'
  },
  writerAgent: {
    name: 'Writer',
    icon: '✍️',
    color: 'bg-purple-500',
    description: 'Creating content'
  },
  editorAgent: {
    name: 'Editor',
    icon: '📝',
    color: 'bg-orange-500',
    description: 'Polishing content'
  }
};

export function AgentStatus({ currentAgent, completedAgents }: AgentStatusProps) {
  const agents: AgentType[] = ['coordinator', 'researcherAgent', 'writerAgent', 'editorAgent'];

  return (
    <div className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">
        Agent Workflow
      </h3>

      <div className="space-y-2">
        {agents.map((agent, index) => {
          const info = agentInfo[agent];
          const isActive = currentAgent === agent;
          const isCompleted = completedAgents.includes(agent);
          const isPending = !isActive && !isCompleted;

          return (
            <div
              key={agent}
              className={`flex items-center gap-3 p-2 rounded-md transition-all ${
                isActive
                  ? 'bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800'
                  : isCompleted
                  ? 'bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800'
                  : 'bg-zinc-50 dark:bg-zinc-800/50 border border-transparent'
              }`}
            >
              {/* Status Indicator */}
              <div className="flex-shrink-0">
                {isCompleted ? (
                  <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : isActive ? (
                  <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                    <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                )}
              </div>

              {/* Agent Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{info.icon}</span>
                  <span className={`text-sm font-medium ${
                    isActive
                      ? 'text-blue-700 dark:text-blue-300'
                      : isCompleted
                      ? 'text-green-700 dark:text-green-300'
                      : 'text-zinc-500 dark:text-zinc-400'
                  }`}>
                    {info.name}
                  </span>
                </div>
                {isActive && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                    {info.description}
                  </p>
                )}
              </div>

              {/* Loading Spinner */}
              {isActive && (
                <div className="flex-shrink-0">
                  <svg
                    className="animate-spin h-5 w-5 text-blue-500"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
