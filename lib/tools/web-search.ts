import { tool, generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { DEFAULT_MODEL, type OpenAIModel } from "../models";
import type { AgentHooks } from "../agent-events";
import * as log from "../logger";

/**
 * A reusable OpenAI web-search tool. v1's researcher has its own two-step
 * (search + structure) variant; this is the lean version for any agent that
 * just needs real, sourced web results (e.g. v3 research sub-agents).
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
      log.detail("🔍 search", query);
      hooks.onWebSearch?.({ status: "start", query });
      const spin = log.spinner(
        `searching the web: "${query.slice(0, 50)}${query.length > 50 ? "…" : ""}"`,
      );
      try {
        const { text, sources } = await generateText({
          model: openai.responses(model),
          prompt: `${query}\n\nFocus on: ${extractionGoal}`,
          tools: { web_search: openai.tools.webSearch({}) },
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
