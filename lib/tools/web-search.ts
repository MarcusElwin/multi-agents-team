import { tool, generateText } from "ai";
import { z } from "zod";
import { DEFAULT_MODEL, type OpenAIModel } from "../models";
import { provider, webSearchAvailable } from "../provider";
import { policyCheck, PolicyDeniedError } from "../iii/policy-context";
import type { AgentHooks } from "../agent-events";
import * as log from "../logger";

/**
 * A reusable web-search tool. It uses OpenAI's web search (Responses API), so
 * it's only available when the active run provider is OpenAI. Under a non-OpenAI
 * provider (e.g. Anthropic, BYO key), it degrades gracefully — the model
 * proceeds on general knowledge rather than crashing the run.
 *
 * Emits the same onWebSearch hook events as v1 so the UI/debug stream and the
 * timeline show search activity uniformly across modes.
 */
export function makeWebSearchTool(model: OpenAIModel = DEFAULT_MODEL, hooks: AgentHooks = {}) {
  return tool({
    description:
      "Search the web for real-time, sourced information. Use for facts, current " +
      "events, statistics, or anything beyond your training data.",
    inputSchema: z.object({
      query: z.string().describe("The search query."),
      extractionGoal: z
        .string()
        .describe('What to extract, e.g. "recent statistics", "best practices", "comparison".'),
    }),
    execute: async ({ query, extractionGoal }) => {
      // Policy gate (iii backend only; a no-op on the in-app path). Web search
      // reaches the public internet, so it's the meaningful boundary to guard.
      try {
        await policyCheck({ tool: "web_search", input: { query } });
      } catch (err) {
        if (err instanceof PolicyDeniedError) {
          return {
            success: false,
            findings: `Web search was blocked by policy for "${query}": ${err.result.reason ?? err.result.decision}.`,
            sources: "",
          };
        }
        throw err;
      }
      // Web search is OpenAI-only; skip cleanly under other providers.
      if (!webSearchAvailable()) {
        return {
          success: false,
          findings: `Web search isn't available with the current model provider. Proceed using general knowledge for "${query}".`,
          sources: "",
        };
      }
      log.detail("🔍 search", query);
      hooks.onWebSearch?.({ status: "start", query });
      const spin = log.spinner(
        `searching the web: "${query.slice(0, 50)}${query.length > 50 ? "…" : ""}"`,
      );
      try {
        const p = provider();
        const { text, sources } = await generateText({
          model: p.responses!(model) as Parameters<typeof generateText>[0]["model"],
          prompt: `${query}\n\nFocus on: ${extractionGoal}`,
          tools: { web_search: p.tools!.webSearch({}) as never },
        });
        const n = sources?.length ?? 0;
        spin.succeed(`found ${n} source${n === 1 ? "" : "s"} · ${text.length} chars`);
        hooks.onWebSearch?.({ status: "done", query, sources: n });

        const sourceList = (sources ?? [])
          .slice(0, 8)
          .map((s, i) => {
            const src = s as { url?: string; title?: string };
            return `${i + 1}. ${src.title ?? src.url ?? "source"}${src.url ? ` — ${src.url}` : ""}`;
          })
          .join("\n");

        return {
          success: true,
          findings: text,
          sources: sourceList || "(no sources returned)",
        };
      } catch (error) {
        spin.fail(`web search failed: ${error instanceof Error ? error.message : "unknown"}`);
        return {
          success: false,
          findings: `Web search unavailable for "${query}". Proceed using general knowledge.`,
          sources: "",
        };
      }
    },
  });
}

/** Heuristic: does this role/task call for real web research? */
export function needsWebSearch(roleAndTask: string): boolean {
  return /\b(research|investigat|find out|web|online|source|cite|latest|current|trend|benchmark|compare|competitor|market)\b/i.test(
    roleAndTask,
  );
}
