import { defineAgent } from 'eve';

/**
 * The `mat` agent — the multi-agent team's nine coordination patterns exposed on
 * Vercel's eve. eve discovers this directory (instructions, tools, channels) and
 * compiles it into a durable agent deployed on Vercel Functions.
 *
 * The model here is only the *default*; every turn carries its own
 * provider-qualified model from the app (the chat UI's model selector), so a run
 * uses whatever the user picked. The real work is delegated to one of nine
 * per-architecture harnesses (see ./harnesses) by the HTTP channel.
 *
 * Durability, sandboxes, approvals, and context control are eve built-ins; each
 * harness sets how aggressively to use them for its pattern.
 */
export default defineAgent({
  // Provider-qualified default; overridden per-turn by the request's model.
  model: 'anthropic/claude-sonnet-4.6',
  // Harness defaults; per-architecture specs in ./harnesses tune these per run.
  durable: true,
  sandbox: true,
});
