import type { AgentEvent } from '@/lib/agent-events';
import type { ConversationTurn } from '@/lib/conversation';
import type { Mode } from '@/lib/modes';
import type { ProviderId } from '@/lib/models';

/** Options every runner takes — the same shape the Next routes pass. */
export interface RunnerOpts {
  model: string;
  apiKey?: string;
  providerId: ProviderId;
}

/**
 * A runner: drives one architecture for a turn, emitting AgentEvents. Runners
 * return a per-pattern summary (the final `workflow_complete` is also emitted),
 * which the harness ignores — the event stream is the contract — so the return
 * is typed `unknown`.
 */
export type RunnerFn = (
  message: string,
  opts: RunnerOpts,
  history: ConversationTurn[],
  emit: (e: AgentEvent) => void,
) => Promise<unknown>;

/**
 * How an architecture maps onto eve's durable harness.
 *
 * eve gives every run durable execution (checkpointed steps, replay on resume),
 * isolated sandboxes for fan-out, approval gates for human-in-the-loop, and
 * explicit context control. Each of the nine patterns wants those knobs set
 * differently — that's what a per-architecture *harness* captures here. The
 * `run` field binds the spec to this repo's existing runner so behavior is
 * identical to the in-app backend; the surrounding knobs tell eve how to make
 * that run durable, parallel, and context-bounded.
 */
export interface HarnessSpec {
  mode: Mode;
  /** Human name of the pattern. */
  name: string;
  /** One-line description of the coordination pattern. */
  summary: string;
  /** eve harness knobs adapted for this architecture. */
  harness: {
    /**
     * Durable checkpoint granularity — the unit eve writes to the event log so a
     * crash/deploy resumes from the last completed unit rather than the top:
     *  - `iteration` (v1 loop), `round` (v5/v6/v9), `sample` (v8),
     *  - `node` (v3 tree), `turn` (v2/v4/v7 — checkpoint each whole turn).
     */
    checkpoint: 'iteration' | 'round' | 'sample' | 'node' | 'turn';
    /** Whether the pattern fans out into parallel durable sub-runs (eve sandboxes). */
    parallel: boolean;
    /** Max concurrent sub-runs eve should allow (mirrors the runner's width cap). */
    maxConcurrency: number;
    /** Whether the run can pause for a human approval/answer (eve approval gate). */
    humanInLoop: boolean;
    /**
     * Context-control strategy — how the growing transcript/workspace is fed to
     * the model on each step, the eve "context control" concept applied per pattern:
     *  - `append`          full running transcript (short linear runs)
     *  - `summarize`       compact prior steps once they exceed a budget
     *  - `shared-workspace` a named board/scratchpad is the context (v6/v9)
     *  - `per-branch`      each sub-agent gets only its own branch's context (v3)
     *  - `fan-in`          independent samples, judged together at the end (v8)
     */
    contextControl: 'append' | 'summarize' | 'shared-workspace' | 'per-branch' | 'fan-in';
    /** Soft upper bound on durable steps before the harness forces synthesis. */
    maxSteps: number;
  };
  /** The lib/ runner that executes the turn for this architecture. */
  run: RunnerFn;
}
