import 'dotenv/config';
import { resolve } from 'path';
import { config } from 'dotenv';

config({ path: resolve(process.cwd(), '.env.local') });

import { AgentOrchestrator } from '../lib/orchestrator';
import { runAgentsWithCoordination } from '../lib/runner';
import { runHierarchical } from '../lib/hierarchical-runner';
import { runEvaluatorOptimizer } from '../lib/evaluator-optimizer-runner';
import { runDebate } from '../lib/debate-runner';
import { runBlackboard } from '../lib/blackboard-runner';
import { runMarket } from '../lib/market-runner';
import { Conversation } from '../lib/conversation';
import type { AgentEvent } from '../lib/agent-events';

/**
 * Fast end-to-end smoke test: run a tiny prompt through every mode (v1–v7) and
 * assert each emits a `workflow_complete`. Calls the runners directly (no
 * server) using the env API key. A "does it all still work" check.
 *
 *   pnpm test:smoke            # all modes
 *   pnpm test:smoke v1 v5      # only the named modes
 *
 * Model defaults to a cheap one; override with SMOKE_MODEL=gpt-4.1 etc.
 */

const MODEL = process.env.SMOKE_MODEL ?? 'gpt-5.4-mini';
const PROMPT = 'Reply with a single short sentence about teamwork.';

type Runner = (
  message: string,
  options: { model?: string },
  onEvent?: (e: AgentEvent) => void,
  conversation?: Conversation,
) => Promise<unknown>;

const MODES: Record<string, Runner> = {
  v1: (m, o, e, c) => new AgentOrchestrator(o).processUserMessage(m, e, c),
  v2: (m, o, e, c) => runAgentsWithCoordination(m, o, e, c),
  v3: (m, o, e, c) => runHierarchical(m, o, e, c),
  v4: (m, o, e, c) => runEvaluatorOptimizer(m, o, e, c),
  v5: (m, o, e, c) => runDebate(m, o, e, c),
  v6: (m, o, e, c) => runBlackboard(m, o, e, c),
  v7: (m, o, e, c) => runMarket(m, o, e, c),
};

async function runMode(name: string): Promise<{ name: string; ok: boolean; detail: string }> {
  let completed = false;
  let errored = '';
  let agents = 0;
  const onEvent = (e: AgentEvent) => {
    if (e.type === 'workflow_complete') completed = true;
    if (e.type === 'workflow_error') errored = e.error;
    if (e.type === 'iteration_end') agents++;
  };
  const start = Date.now();
  try {
    await MODES[name](PROMPT, { model: MODEL }, onEvent, new Conversation());
  } catch (err) {
    errored = err instanceof Error ? err.message : String(err);
  }
  const secs = ((Date.now() - start) / 1000).toFixed(1);
  if (errored) return { name, ok: false, detail: `error: ${errored}` };
  if (!completed) return { name, ok: false, detail: 'no workflow_complete emitted' };
  return { name, ok: true, detail: `${agents} agent step(s) · ${secs}s` };
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not found. Set it in .env.local.');
    process.exit(1);
  }

  const requested = process.argv.slice(2).filter((a) => a in MODES);
  const modes = requested.length ? requested : Object.keys(MODES);

  console.log(`\n🧪 Smoke test · model=${MODEL} · modes: ${modes.join(', ')}\n`);

  // Run sequentially to keep token spend + output readable.
  const results: { name: string; ok: boolean; detail: string }[] = [];
  for (const name of modes) {
    process.stdout.write(`  ${name} … `);
    const r = await runMode(name);
    results.push(r);
    console.log(`${r.ok ? '✓' : '✗'} ${r.detail}`);
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} modes passed\n`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
