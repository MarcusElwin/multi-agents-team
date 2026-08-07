import type { Mode } from '@/lib/modes';
import type { HarnessSpec } from './types';
import { v1 } from './v1-orchestrated';
import { v2 } from './v2-choreographed';
import { v3 } from './v3-hierarchical';
import { v4 } from './v4-evaluator-optimizer';
import { v5 } from './v5-debate';
import { v6 } from './v6-blackboard';
import { v7 } from './v7-market';
import { v8 } from './v8-self-consistency';
import { v9 } from './v9-swarm';

/**
 * The nine architectures, each adapted as its own eve harness. The eve agent
 * picks the spec for the requested `mode` and runs it inside eve's durable
 * session — so every pattern gets the same durability/parallelism/context-control
 * treatment, tuned per architecture. Adding a tenth pattern is one entry here.
 */
export const HARNESSES: Record<Mode, HarnessSpec> = { v1, v2, v3, v4, v5, v6, v7, v8, v9 };

export const HARNESS_LIST: HarnessSpec[] = Object.values(HARNESSES);

export function harnessFor(mode: Mode): HarnessSpec {
  const spec = HARNESSES[mode];
  if (!spec) throw new Error(`No eve harness for mode: ${String(mode)}`);
  return spec;
}

export type { HarnessSpec, RunnerFn, RunnerOpts } from './types';
