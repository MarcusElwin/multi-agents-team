import type { LucideIcon } from 'lucide-react';
import { Cpu, Network, Triangle } from 'lucide-react';

/**
 * Which execution backend runs a turn:
 *  - `current` — the hand-rolled harness that ships in this app: orchestration,
 *    message bus, and tools run in-process over the Vercel AI SDK. No extra
 *    services; the default.
 *  - `iii` — the iii engine, a separate process exposing a WebSocket bus of
 *    swappable workers (turn FSM, provider streaming, policy, budget, sessions,
 *    tracing). Requires a reachable engine (see lib/iii/config.ts).
 *  - `eve` — Vercel's eve agent framework: a filesystem-first, durable harness
 *    where the same nine runners are exposed as an eve agent (one harness per
 *    architecture) deployed on Vercel Functions. Each turn is a durable session
 *    that checkpoints and resumes. Requires a deployed eve app (see lib/eve/config.ts).
 *
 * Tracked per run and as a global default. See issue #10 for the migration plan.
 */
export type Backend = 'current' | 'iii' | 'eve';

export interface BackendSpec {
  value: Backend;
  /** Short label for the selector trigger. */
  label: string;
  /** Full name. */
  name: string;
  icon: LucideIcon;
  /** One-line description shown under the label. */
  tagline: string;
  /** Longer description for the settings drawer. */
  description: string;
}

export const BACKENDS: Record<Backend, BackendSpec> = {
  current: {
    value: 'current',
    label: 'In-app harness',
    name: 'In-app harness',
    icon: Cpu,
    tagline: 'hand-rolled, runs in this app',
    description:
      'The original harness: orchestration, the message bus, and tools all run in-process in this Next.js app over the Vercel AI SDK. No extra services — works out of the box, and stays the default.',
  },
  iii: {
    value: 'iii',
    label: 'iii engine',
    name: 'iii engine',
    icon: Network,
    tagline: 'composable workers on the iii bus',
    description:
      'Runs the agent loop on the iii engine — a separate process exposing a WebSocket bus of swappable workers (turn FSM, provider streaming, policy, budget, sessions, tracing). Requires a reachable iii engine; set III_ENGINE_URL on the server.',
  },
  eve: {
    value: 'eve',
    label: 'eve (Vercel)',
    name: 'eve agent framework',
    icon: Triangle,
    tagline: 'durable filesystem-first agent on Vercel',
    description:
      "Runs the turn on Vercel's eve — a filesystem-first agent framework where each run is a durable, checkpointed session that survives crashes, deploys, and cold starts. The same nine runners ship as one eve agent (a harness per architecture) deployed on Vercel Functions. Requires a deployed eve app; set EVE_BASE_URL on the server.",
  },
};

export const BACKEND_LIST: BackendSpec[] = [BACKENDS.current, BACKENDS.iii, BACKENDS.eve];

export const DEFAULT_BACKEND: Backend = 'current';

/** Narrow an unknown value to a Backend, for body validation and stored state. */
export function isBackend(v: unknown): v is Backend {
  return v === 'current' || v === 'iii' || v === 'eve';
}

/** Coerce any value to a valid Backend, falling back to the default. */
export function asBackend(v: unknown): Backend {
  return isBackend(v) ? v : DEFAULT_BACKEND;
}

/**
 * Whether the iii backend is advertised as ready in the UI. This only drives a
 * "preview" hint on the selector — the server still attempts a run whenever the
 * backend is `iii`, and surfaces a clear error if the engine is unreachable.
 * Set NEXT_PUBLIC_III_BACKEND_ENABLED=true once an engine is wired up.
 */
export const III_BACKEND_ENABLED =
  process.env.NEXT_PUBLIC_III_BACKEND_ENABLED === 'true';

/**
 * Whether the eve backend is advertised as ready in the UI. Like the iii flag,
 * this only drives a "preview" hint — the server still attempts the run whenever
 * the backend is `eve` and surfaces a clear error if no eve app is configured.
 * Set NEXT_PUBLIC_EVE_BACKEND_ENABLED=true once an eve app is deployed.
 */
export const EVE_BACKEND_ENABLED =
  process.env.NEXT_PUBLIC_EVE_BACKEND_ENABLED === 'true';

/**
 * Whether a backend should show the "preview" badge in the selector (i.e. it's a
 * remote backend that hasn't been advertised as wired-up yet). Centralized so the
 * selector and settings drawer agree. `current` is never a preview.
 */
export function isBackendPreview(b: Backend): boolean {
  if (b === 'iii') return !III_BACKEND_ENABLED;
  if (b === 'eve') return !EVE_BACKEND_ENABLED;
  return false;
}
