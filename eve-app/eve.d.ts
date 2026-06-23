/**
 * Minimal ambient declarations for the `eve` framework packages.
 *
 * This file lets the eve agent project typecheck *in this repo* without the
 * `eve` package installed (it isn't a dependency of the Next app). When you
 * actually run or deploy the agent — `npx eve@latest` in this directory, then
 * `eve dev` / `vercel deploy` — eve ships its own, authoritative types and these
 * permissive shims are shadowed. They intentionally describe only the surface
 * this project uses, and are marked VERIFY where the beta API may differ.
 */
declare module 'eve' {
  /** VERIFY (eve beta): defineAgent options — model + runtime/harness config. */
  export interface DefineAgentOptions {
    /** Provider-qualified model id, e.g. "anthropic/claude-sonnet-4.6". */
    model: string;
    /** Free-form runtime/harness configuration passed through to the harness. */
    [key: string]: unknown;
  }
  export function defineAgent(options: DefineAgentOptions): DefineAgentOptions;
}

declare module 'eve/tools' {
  import type { ZodTypeAny, infer as ZodInfer } from 'zod';
  export interface DefineToolOptions<TIn extends ZodTypeAny> {
    description: string;
    inputSchema: TIn;
    execute: (input: ZodInfer<TIn>) => Promise<unknown> | unknown;
  }
  export function defineTool<TIn extends ZodTypeAny>(opts: DefineToolOptions<TIn>): DefineToolOptions<TIn>;
}

declare module 'eve/channels' {
  /** A streaming session context handed to an HTTP channel handler. */
  export interface SessionContext {
    /** Stable durable session id (echoed in the `x-eve-session-id` header). */
    sessionId: string;
    /** Continuation token for resuming this durable session on a later turn. */
    continuationToken?: string;
    /** The parsed request body. */
    body: Record<string, unknown>;
    /** Request headers (lower-cased keys). */
    headers: Record<string, string>;
    /** Emit one NDJSON lifecycle frame to the session stream. */
    emit: (frame: unknown) => void;
    /**
     * Run `fn` as a durable, checkpointed step. eve records the step in the
     * session's event log; on resume it is replayed rather than re-executed.
     * In this shim it simply awaits `fn` (no real durability) — eve provides the
     * checkpointing at runtime.
     */
    step: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
  }
  export interface DefineHttpChannelOptions {
    method?: 'POST' | 'GET';
    path?: string;
    handler: (ctx: SessionContext) => Promise<void> | void;
  }
  export function defineHttpChannel(opts: DefineHttpChannelOptions): DefineHttpChannelOptions;
}
