import type { LucideIcon } from 'lucide-react';
import { Workflow, Network, GitBranch } from 'lucide-react';

export type Mode = 'v1' | 'v2' | 'v3';

export interface AgentSpec {
  /** Canonical agent id used on the bus / in events. */
  id: string;
  /** Display name. */
  name: string;
  /** One-line capability summary. */
  role: string;
}

export interface ModeSpec {
  value: Mode;
  /** Short label for the dropdown trigger. */
  label: string;
  /** Coordination pattern, e.g. "Orchestrated". */
  pattern: string;
  icon: LucideIcon;
  /** One-line description shown under the label. */
  tagline: string;
  /** Longer description of what this system can do, for the architecture panel. */
  description: string;
  /** API endpoint this mode posts to. */
  endpoint: string;
  /** The agents in this system, in their conceptual order. */
  agents: AgentSpec[];
  /** Example prompts shown on the empty state. */
  suggestions: string[];
  /** Rough expected duration, shown as a hint. */
  durationHint: string;
}

export const MODES: Record<Mode, ModeSpec> = {
  v1: {
    value: 'v1',
    label: 'v1 orchestrated',
    pattern: 'Orchestrated',
    icon: Workflow,
    tagline: 'coordinator + research / write / edit',
    description:
      'A central coordinator analyzes your request, plans a workflow, and delegates to specialists one at a time — researcher, writer, then editor — synthesizing their results into a final answer. Best for content tasks with a clear linear pipeline.',
    endpoint: '/api/agents',
    agents: [
      { id: 'coordinator', name: 'Coordinator', role: 'Plans the workflow and delegates to specialists' },
      { id: 'researcherAgent', name: 'Researcher', role: 'Gathers facts, sources, and information' },
      { id: 'writerAgent', name: 'Writer', role: 'Drafts and structures the content' },
      { id: 'editorAgent', name: 'Editor', role: 'Polishes clarity, grammar, and tone' },
    ],
    suggestions: [
      'Write a short blog post about AI agents in 2026',
      'Research recent breakthroughs in multi-agent systems',
      'Draft a product launch announcement for a developer tool',
      'Summarize the state of open-source LLM frameworks',
    ],
    durationHint: '~30–90s',
  },
  v2: {
    value: 'v2',
    label: 'v2 choreographed',
    pattern: 'Choreographed',
    icon: Network,
    tagline: 'backend / frontend / design peers',
    description:
      'Three peer agents — backend, frontend, and design — collaborate directly over a shared message bus with no central coordinator. They message each other, exchange specs, and each marks itself complete when its needs are met. Best for cross-functional design tasks where peers negotiate.',
    endpoint: '/api/agents-v2',
    agents: [
      { id: 'backendAgent', name: 'Backend', role: 'APIs, data models, services' },
      { id: 'frontendAgent', name: 'Frontend', role: 'Components, state, layouts' },
      { id: 'designAgent', name: 'Design', role: 'UI/UX, styling, visual guidelines' },
    ],
    suggestions: [
      // Leads with a "self-contained component" so the Frontend agent emits
      // renderable JSX → exercises the code preview + live Preview tab.
      'Build a self-contained React analytics dashboard card: title, big metric, trend arrow, and a small bar chart, Tailwind styled',
      'Design a self-contained HTML pricing page: monthly/annual toggle, three tiers, feature comparison table',
      'Create a notification preferences settings page with channel toggles, quiet hours, and a digest summary',
      'Design a Kanban board with draggable cards, columns, and a card detail drawer',
    ],
    durationHint: 'up to ~5 min',
  },
  v3: {
    value: 'v3',
    label: 'v3 hierarchical',
    pattern: 'Hierarchical',
    icon: GitBranch,
    tagline: 'a lead spawns sub-agents on the fly',
    description:
      'A lead agent decomposes the task at runtime, spawning sub-agents for each part — and those sub-agents can spawn their own, forming a tree (depth-capped). Children run in parallel; each parent synthesizes its children\'s results up to a final answer. Best for open-ended tasks that break into nested subtasks.',
    endpoint: '/api/agents-v3',
    agents: [
      { id: 'lead', name: 'Lead', role: 'Decomposes the task and synthesizes results' },
      { id: 'subagent', name: 'Sub-agent', role: 'Spawned dynamically with an invented role' },
    ],
    suggestions: [
      'Plan and build a habit-tracker app: research best practices, then design the data model, API, and a UI component',
      'Research the top 3 vector databases and produce a comparison table plus a recommendation',
      'Break down launching a developer newsletter into research, content, and growth subtasks',
      'Design a URL shortener: split into API design, storage, and a self-contained React stats UI',
    ],
    durationHint: 'up to ~5 min',
  },
};

export const MODE_LIST: ModeSpec[] = [MODES.v1, MODES.v2, MODES.v3];

/** Pretty-print an agent id like "writerAgent" → "Writer". */
export function prettyAgentName(id: string): string {
  for (const mode of MODE_LIST) {
    const found = mode.agents.find((a) => a.id === id);
    if (found) return found.name;
  }
  return id
    .replace(/Agent$/, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}
