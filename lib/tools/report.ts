import { tool } from "ai";
import { z } from "zod";

/**
 * Structured report spec an agent can emit via the `generateReport` tool, so
 * deliverables can be rich (KPIs, charts, tables) instead of plain markdown.
 * The runner extracts this from the tool result and the UI renders it natively
 * with <ReportView> (recharts). Phase 1: presentation only, no code execution.
 */

const kpiSchema = z.object({
  label: z.string().describe("Short metric label, e.g. 'Total revenue'."),
  value: z.string().describe("The metric value as display text, e.g. '$1.2M' or '4.8/5'."),
  delta: z.string().optional().describe("Optional change, e.g. '+12%' or '-3pp'."),
  trend: z.enum(["up", "down", "flat"]).optional().describe("Direction of the delta."),
});

const chartSchema = z.object({
  type: z.enum(["bar", "line", "pie", "area"]).describe("Chart type."),
  title: z.string().optional(),
  // Rows of { name, <series>: number }. `series` names which numeric keys to plot.
  data: z
    .array(z.record(z.string(), z.union([z.string(), z.number()])))
    .describe("Rows like { name: 'Jan', revenue: 100, cost: 40 }."),
  series: z
    .array(z.string())
    .describe("Numeric keys in each row to plot, e.g. ['revenue','cost']."),
  xKey: z.string().default("name").describe("Row key for the x-axis / category."),
});

const tableSchema = z.object({
  title: z.string().optional(),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.string())).describe("Each row is an array of cells matching columns."),
});

const sectionSchema = z.object({
  heading: z.string(),
  body: z.string().describe("Markdown prose for this section."),
});

export const reportSchema = z.object({
  title: z.string(),
  summary: z.string().describe("A 1–3 sentence executive summary."),
  kpis: z.array(kpiSchema).optional().describe("Headline metrics shown as cards."),
  charts: z.array(chartSchema).optional(),
  tables: z.array(tableSchema).optional(),
  sections: z.array(sectionSchema).optional().describe("Narrative sections, in order."),
});

export type ReportSpec = z.infer<typeof reportSchema>;

/**
 * The generateReport tool. The runner reads its tool-result value (`{ report }`)
 * and surfaces it to the UI. Give this to agents that produce final reports
 * (v1 editor/writer, v3 lead synthesis) — not every step.
 */
export function makeReportTool() {
  return tool({
    description:
      "Produce a structured, visual report (KPIs, charts, tables, narrative sections) " +
      "instead of plain prose. Use this for your FINAL deliverable when the content " +
      "benefits from data viz — comparisons, trends, metrics, breakdowns. Provide real " +
      "numbers in chart/table data; do not invent precise figures you don't have.",
    inputSchema: z.object({ report: reportSchema }),
    execute: async ({ report }) => ({ report }),
  });
}
