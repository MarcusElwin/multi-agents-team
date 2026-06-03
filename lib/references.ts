/**
 * Curated reading list on multi-agent systems, rendered at /references.
 * Hand-picked + categorized; extend freely. Per-pattern links also live on
 * each MODES[*].references, but this is the broader library.
 */

export type RefType = 'Paper' | 'Post' | 'Docs' | 'Talk' | 'Repo';

export interface Reference {
  title: string;
  source: string;
  url: string;
  type: RefType;
  note?: string;
}

export interface ReferenceSection {
  heading: string;
  blurb?: string;
  items: Reference[];
}

/**
 * Brand logos (local SVGs under /public/logos, sourced from thesvg.org).
 * Keyed by a normalized source/host. White-filled logos (openai, anthropic,
 * vercel) are listed in DARK_LOGOS so the UI renders them on a dark tile.
 */
const LOGO_BY_SOURCE: Record<string, string> = {
  anthropic: 'anthropic',
  'anthropic engineering': 'anthropic',
  openai: 'openai',
  vercel: 'vercel',
  langchain: 'langchain',
  microsoft: 'microsoft',
  crewai: 'crewai',
  'mit acl': 'arxiv', // no MIT mark on thesvg.org — use the paper/arxiv glyph
  wikipedia: 'wikipedia',
  medium: 'medium',
};
const HOST_LOGO: Array<[RegExp, string]> = [
  [/arxiv\.org/, 'arxiv'],
  [/github\.com/, 'github'],
  [/anthropic\.com/, 'anthropic'],
  [/openai\.com/, 'openai'],
  [/ai-sdk\.dev|vercel/, 'vercel'],
  [/langchain/, 'langchain'],
  [/microsoft/, 'microsoft'],
  [/crewai/, 'crewai'],
  [/wikipedia\.org/, 'wikipedia'],
  [/medium\.com/, 'medium'],
];
/** Logos whose artwork is white/light and need a dark tile behind them. */
export const DARK_LOGOS = new Set(['openai', 'anthropic', 'vercel']);

/** Resolve a local logo slug for a reference (by source name, then URL host). */
export function logoFor(source: string, url: string): string | null {
  const s = source.toLowerCase().trim();
  if (LOGO_BY_SOURCE[s]) return LOGO_BY_SOURCE[s];
  for (const [re, slug] of HOST_LOGO) if (re.test(url)) return slug;
  return null;
}

export const REFERENCE_SECTIONS: ReferenceSection[] = [
  {
    heading: 'Start here',
    blurb: 'The clearest overviews of how to think about agents and multi-agent patterns.',
    items: [
      {
        title: 'Building effective agents',
        source: 'Anthropic',
        url: 'https://www.anthropic.com/research/building-effective-agents',
        type: 'Post',
        note: 'The canonical taxonomy — prompt chaining, routing, parallelization, orchestrator-workers, evaluator-optimizer. The backbone of this project.',
      },
      {
        title: 'A practical guide to building agents',
        source: 'OpenAI',
        url: 'https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf',
        type: 'Post',
        note: 'Single-agent vs. multi-agent, when to add orchestration, guardrails.',
      },
      {
        title: 'How we built our multi-agent research system',
        source: 'Anthropic Engineering',
        url: 'https://www.anthropic.com/engineering/built-multi-agent-research-system',
        type: 'Post',
        note: 'A production lead/subagent (hierarchical) system — token economics, orchestration, evaluation.',
      },
    ],
  },
  {
    heading: 'Foundational papers',
    blurb: 'The research the patterns are built on.',
    items: [
      {
        title: 'ReAct: Synergizing Reasoning and Acting in Language Models',
        source: 'arXiv 2210.03629',
        url: 'https://arxiv.org/abs/2210.03629',
        type: 'Paper',
        note: 'The reason-act-observe loop underneath tool-using agents.',
      },
      {
        title: 'Reflexion: Language Agents with Verbal Reinforcement Learning',
        source: 'arXiv 2303.11366',
        url: 'https://arxiv.org/abs/2303.11366',
        type: 'Paper',
        note: 'Self-critique and revision — the idea behind the evaluator-optimizer (v4).',
      },
      {
        title: 'Self-Consistency Improves Chain of Thought Reasoning',
        source: 'arXiv 2203.11171',
        url: 'https://arxiv.org/abs/2203.11171',
        type: 'Paper',
        note: 'Sample many reasoning paths, take the consensus — the basis of v8.',
      },
      {
        title: 'Improving Factuality and Reasoning via Multiagent Debate',
        source: 'arXiv 2305.14325',
        url: 'https://arxiv.org/abs/2305.14325',
        type: 'Paper',
        note: 'Multiple agents debate to better answers — the basis of v5.',
      },
      {
        title: 'AI Safety via Debate',
        source: 'arXiv 1805.00899',
        url: 'https://arxiv.org/abs/1805.00899',
        type: 'Paper',
        note: 'The original argument for adversarial debate between agents.',
      },
      {
        title: 'Exploring LLM Multi-Agent Systems Based on Blackboard Architecture',
        source: 'arXiv 2507.01701',
        url: 'https://arxiv.org/abs/2507.01701',
        type: 'Paper',
        note: 'Content-driven control over a shared workspace — the basis of v6.',
      },
      {
        title: 'Consensus-Based Bundle Algorithm (CBBA)',
        source: 'MIT ACL',
        url: 'https://acl.mit.edu/projects/consensus-based-bundle-algorithm',
        type: 'Paper',
        note: 'Market/auction task allocation from multi-robot systems — the basis of v7.',
      },
    ],
  },
  {
    heading: 'Frameworks & SDKs',
    blurb: 'Tools for building agentic systems.',
    items: [
      {
        title: 'Vercel AI SDK',
        source: 'Vercel',
        url: 'https://ai-sdk.dev/',
        type: 'Docs',
        note: 'What this project is built on — providers, tools, streaming, the Experimental Agent API.',
      },
      {
        title: 'LangGraph',
        source: 'LangChain',
        url: 'https://langchain-ai.github.io/langgraph/',
        type: 'Docs',
        note: 'Graph-based agent orchestration with durable state.',
      },
      {
        title: 'AutoGen',
        source: 'Microsoft',
        url: 'https://microsoft.github.io/autogen/',
        type: 'Docs',
        note: 'Multi-agent conversation framework — the choreographed/peer model.',
      },
      {
        title: 'CrewAI',
        source: 'CrewAI',
        url: 'https://docs.crewai.com/',
        type: 'Docs',
        note: 'Role-based agent “crews” with task decomposition.',
      },
      {
        title: 'OpenAI Swarm',
        source: 'OpenAI',
        url: 'https://github.com/openai/swarm',
        type: 'Repo',
        note: 'Lightweight handoff-based multi-agent orchestration — the basis of v9.',
      },
      {
        title: 'iii — build your own agent harness',
        source: 'iii',
        url: 'https://iii.dev/blog/how-to-build-your-own-agent-harness/',
        type: 'Post',
        note: 'A WebSocket-bus harness where each responsibility is a swappable worker (see issue #10).',
      },
    ],
  },
  {
    heading: 'Patterns & posts',
    blurb: 'Practical write-ups on coordination patterns.',
    items: [
      {
        title: 'Agent orchestration patterns: swarm vs mesh vs hierarchical',
        source: 'gurusup',
        url: 'https://gurusup.com/blog/agent-orchestration-patterns',
        type: 'Post',
      },
      {
        title: 'The 5th orchestration pattern: market-based task allocation',
        source: 'DEV',
        url: 'https://dev.to/slythefox/the-5th-agent-orchestration-pattern-market-based-task-allocation-db0',
        type: 'Post',
      },
      {
        title: 'Multi-agent coordination patterns: architectures beyond the hype',
        source: 'Medium',
        url: 'https://medium.com/@ohusiev_6834/multi-agent-coordination-patterns-architectures-beyond-the-hype-3f61847e4f86',
        type: 'Post',
      },
      {
        title: 'Stigmergy — coordination via a shared environment',
        source: 'Wikipedia',
        url: 'https://en.wikipedia.org/wiki/Stigmergy',
        type: 'Post',
        note: 'The biology behind swarm coordination (v9).',
      },
    ],
  },
];
