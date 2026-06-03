import type { LucideIcon } from 'lucide-react';
import { Workflow, Network, GitBranch, RefreshCw, Scale, LayoutGrid, Gavel } from 'lucide-react';

export type Mode = 'v1' | 'v2' | 'v3' | 'v4' | 'v5' | 'v6' | 'v7';

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
  /** Ordered "how it works" steps, for the architecture panel. */
  howItWorks: string[];
  /** When this pattern is the right choice. */
  whenToUse: string;
  /** The main trade-off / cost of this pattern. */
  tradeoff: string;
  /** Further-reading links for this pattern (optional). */
  references?: { label: string; url: string }[];
  /** A short author's note / field observation (optional). */
  note?: string;
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
    howItWorks: [
      'A coordinator analyzes the request and plans an ordered workflow.',
      'It delegates to one specialist at a time (researcher → writer → editor), passing context forward.',
      'Each specialist does its work and returns to the coordinator.',
      'The coordinator synthesizes the results into a final answer.',
    ],
    whenToUse: 'Linear content pipelines where the steps and their order are clear up front.',
    tradeoff: 'A single coordinator is a bottleneck and a single point of failure; no parallelism.',
    references: [
      { label: 'Anthropic — Building effective agents (Orchestrator-workers)', url: 'https://www.anthropic.com/research/building-effective-agents' },
      { label: 'OpenAI — A practical guide to building agents', url: 'https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf' },
    ],
    note: 'The workhorse pattern. A strong coordinator + cheap specialists is reliable and easy to debug — but the coordinator is a bottleneck, so keep its turns short and its delegation explicit.',
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
    howItWorks: [
      'Backend, frontend, and design agents start with the same brief.',
      'They message each other directly over a shared per-conversation bus — no central coordinator.',
      'Each reads its inbox, refines its part against peers’ feedback, and re-shares.',
      'Each marks itself complete; the run ends when all three are done.',
    ],
    whenToUse: 'Cross-functional design tasks where peers must negotiate a shared artifact.',
    tradeoff: 'Peer negotiation can loop or stall; harder to guarantee convergence than a coordinator.',
    references: [
      { label: 'Anthropic — Building effective agents', url: 'https://www.anthropic.com/research/building-effective-agents' },
      { label: 'Microsoft AutoGen — multi-agent conversation', url: 'https://microsoft.github.io/autogen/' },
    ],
    note: 'Peers negotiating directly can produce richer cross-functional output, but convergence isn’t guaranteed — feed each agent its inbox and give clear "done" criteria or it loops.',
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
    howItWorks: [
      'A lead agent decomposes the task into sub-tasks at runtime.',
      'It spawns a sub-agent per part; sub-agents can spawn their own children (depth-capped).',
      'Sibling children run in parallel; research-y leaves get a real web-search tool.',
      'Each parent synthesizes its children’s deliverables up to a final answer.',
    ],
    whenToUse: 'Open-ended tasks that naturally break into nested, independent subtasks.',
    tradeoff: 'Emergent tree shape is less predictable; recursive spawning + synthesis costs more tokens.',
    references: [
      { label: 'Anthropic — Orchestrator-workers & subagents', url: 'https://www.anthropic.com/research/building-effective-agents' },
      { label: 'Anthropic — How we built our multi-agent research system', url: 'https://www.anthropic.com/engineering/built-multi-agent-research-system' },
    ],
    note: 'Recursive decomposition shines on open-ended work, but the tree shape is emergent — cap depth/width and watch cost, since every parent adds a synthesis pass.',
  },
  v4: {
    value: 'v4',
    label: 'v4 evaluator–optimizer',
    pattern: 'Evaluator–Optimizer',
    icon: RefreshCw,
    tagline: 'generate → critique → revise, until it passes',
    description:
      'A generator produces a draft; a critic scores it (0–10) against a rubric and lists concrete issues; the generator revises. The loop repeats until the critic passes (score ≥ 8) or a max-rounds cap. Best for a single artifact you want iteratively improved — a draft, spec, or piece of analysis.',
    endpoint: '/api/agents-v4',
    agents: [
      { id: 'generator', name: 'Generator', role: 'Produces and revises the deliverable' },
      { id: 'critic', name: 'Critic', role: 'Scores against a rubric and lists issues' },
    ],
    suggestions: [
      'Write a crisp product one-pager for an AI code-review tool, then refine it to a high bar',
      'Draft a tweet thread explaining vector databases, iterated for clarity and punch',
      'Write and polish a function that debounces async calls with cancellation',
      'Produce a tight executive summary of the state of agentic commerce',
    ],
    durationHint: 'up to ~3 min',
    howItWorks: [
      'A generator produces a first draft of the deliverable.',
      'A critic scores it 0–10 against a rubric and lists concrete issues.',
      'The generator revises, addressing each issue.',
      'The loop repeats until the critic passes (score ≥ 8) or a max-rounds cap.',
    ],
    whenToUse: 'A single artifact you want iteratively improved to a quality bar — a draft, spec, or snippet.',
    tradeoff: 'Cost grows with each round; a never-satisfied critic can burn the full round budget.',
    references: [
      { label: 'Anthropic — Building effective agents (Evaluator-optimizer)', url: 'https://www.anthropic.com/research/building-effective-agents' },
      { label: 'Reflexion: language agents with verbal reinforcement learning', url: 'https://arxiv.org/abs/2303.11366' },
    ],
    note: 'A demanding critic + a concrete rubric is the whole game. Vague rubrics give vague gains; specific, actionable issues drive real improvement round over round.',
  },
  v5: {
    value: 'v5',
    label: 'v5 debate',
    pattern: 'Debate',
    icon: Scale,
    tagline: 'opposing sides argue, a judge decides',
    description:
      'Two debaters argue opposing positions on your question across several rounds, each rebutting the other, then a judge picks a winner or synthesizes a consensus with reasoning. Best for decisions and trade-offs where the strongest case for each side should be heard before a verdict.',
    endpoint: '/api/agents-v5',
    agents: [
      { id: 'Affirmative', name: 'Affirmative', role: 'Argues the pro position' },
      { id: 'Opposing', name: 'Opposing', role: 'Argues the con position' },
      { id: 'Judge', name: 'Judge', role: 'Weighs both sides and rules' },
    ],
    suggestions: [
      'SQL vs NoSQL for a new high-traffic analytics product — which should we choose?',
      'Should an early-stage startup build on a monolith or microservices?',
      'Remote-first vs in-office for a 20-person engineering team',
      'Should we adopt an agent framework or build our own harness?',
    ],
    durationHint: 'up to ~3 min',
    howItWorks: [
      'Two debaters are assigned opposing positions on the question.',
      'They argue across several rounds, each directly rebutting the other’s last point.',
      'A judge reads the full transcript.',
      'The judge picks the stronger side or synthesizes a consensus, with reasoning.',
    ],
    whenToUse: 'Decisions and trade-offs where the strongest case for each side should be heard first.',
    tradeoff: 'Adds rounds of argument before any answer; the verdict quality depends on the judge.',
    references: [
      { label: 'Improving factuality and reasoning via multiagent debate', url: 'https://arxiv.org/abs/2305.14325' },
      { label: 'AI safety via debate', url: 'https://arxiv.org/abs/1805.00899' },
    ],
    note: 'Great for surfacing the strongest case on each side of a decision. The judge matters as much as the debaters — a weak judge just averages, a good one weighs.',
  },
  v6: {
    value: 'v6',
    label: 'v6 blackboard',
    pattern: 'Blackboard',
    icon: LayoutGrid,
    tagline: 'agents share one workspace; a controller picks who acts',
    description:
      'Agents share a structured blackboard. A controller inspects the board each round and selects who acts next based on its content — not a fixed schedule. The chosen agent reads the whole board, contributes a section, and writes back, until a solution emerges. Best when an answer assembles from many partial contributions.',
    endpoint: '/api/agents-v6',
    agents: [
      { id: 'analyst', name: 'Analyst', role: 'Frames the problem and facts' },
      { id: 'planner', name: 'Planner', role: 'Proposes the approach/solution' },
      { id: 'critic', name: 'Critic', role: 'Stress-tests and refines the board' },
    ],
    suggestions: [
      'Design a content moderation system: gather facts, plan an approach, critique it',
      'Plan a migration from a monolith to services, building the plan on a shared board',
      'Work out a go-to-market for a developer tool, contributing from multiple angles',
      'Diagnose why a checkout funnel is leaking and converge on fixes',
    ],
    durationHint: 'up to ~4 min',
    howItWorks: [
      'Agents share a structured blackboard of named sections.',
      'Each round, a controller inspects the board and picks who acts next based on its content.',
      'The chosen agent reads the whole board, contributes a section, and writes back.',
      'The loop continues until a solution emerges or the board stops changing.',
    ],
    whenToUse: 'Problems whose answer assembles from many partial contributions converging on a shared artifact.',
    tradeoff: 'Controller selection can loop; no direct peer messaging means coordination is slower.',
    references: [
      { label: 'Exploring LLM multi-agent systems based on blackboard architecture', url: 'https://arxiv.org/abs/2507.01701' },
      { label: 'LLM-based multi-agent blackboard system', url: 'https://arxiv.org/abs/2510.01285' },
    ],
    note: 'Content-driven control (who acts next depends on the board state) is the differentiator. It’s powerful for shared-intelligence problems but slower than direct messaging.',
  },
  v7: {
    value: 'v7',
    label: 'v7 market',
    pattern: 'Market',
    icon: Gavel,
    tagline: 'agents bid on tasks; best bid wins',
    description:
      'A dispatcher decomposes the request into tasks and posts them to a market. A pool of specialist agents bid on tasks (advertising fit and estimated cost); the dispatcher awards each task to the best bidder, winners execute in parallel, and results are synthesized. Best for heterogeneous work where "who should do this?" isn\'t obvious.',
    endpoint: '/api/agents-v7',
    agents: [
      { id: 'dispatcher', name: 'Dispatcher', role: 'Posts tasks and synthesizes results' },
      { id: 'researcher', name: 'Researcher', role: 'Bids on research tasks' },
      { id: 'engineer', name: 'Engineer', role: 'Bids on build tasks' },
      { id: 'designer', name: 'Designer', role: 'Bids on design tasks' },
      { id: 'analyst', name: 'Analyst', role: 'Bids on analysis tasks' },
    ],
    suggestions: [
      'Launch a waitlist landing page for a new SaaS: research, copy, design, and build',
      'Produce a competitive teardown of three note-taking apps',
      'Plan and draft a technical blog post with research, writing, and a diagram',
      'Build a small dashboard spec: data model, API, UI, and an analytics view',
    ],
    durationHint: 'up to ~4 min',
    howItWorks: [
      'A dispatcher decomposes the request into tasks and posts them to a market.',
      'Specialist agents bid on tasks they fit, advertising confidence and estimated cost.',
      'The dispatcher awards each task to the best bidder, capping how many one agent can win.',
      'Winners execute in parallel; the dispatcher synthesizes their deliverables.',
    ],
    whenToUse: 'Heterogeneous work where the best agent for each task is not obvious up front.',
    tradeoff: 'The bid round is extra LLM calls; only worth it for larger, varied agent pools.',
    references: [
      { label: 'The 5th orchestration pattern: market-based task allocation', url: 'https://dev.to/slythefox/the-5th-agent-orchestration-pattern-market-based-task-allocation-db0' },
      { label: 'Consensus-Based Bundle Algorithm (CBBA)', url: 'https://acl.mit.edu/papers/HowTAC2009.pdf' },
    ],
    note: 'Competitive bidding spreads work to the best-fit agent and makes cost visible, but the bid round is extra calls — it pays off mainly with larger, heterogeneous agent pools.',
  },
};

export const MODE_LIST: ModeSpec[] = [MODES.v1, MODES.v2, MODES.v3, MODES.v4, MODES.v5, MODES.v6, MODES.v7];

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
