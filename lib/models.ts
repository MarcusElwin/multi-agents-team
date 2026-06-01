export type OpenAIModel =
  | 'gpt-5.5'
  | 'gpt-5.4'
  | 'gpt-5.4-mini'
  | 'gpt-5.4-nano'
  | 'gpt-4.1'
  | 'o4-mini';

export interface ModelOption {
  value: OpenAIModel;
  label: string;
  description?: string;
}

export const MODEL_OPTIONS: ModelOption[] = [
  { value: 'gpt-5.5', label: 'GPT-5.5', description: 'Flagship — best for coding & reasoning' },
  { value: 'gpt-5.4', label: 'GPT-5.4', description: 'More affordable flagship-class' },
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', description: 'Strong mini — fast, lower cost' },
  { value: 'gpt-5.4-nano', label: 'GPT-5.4 Nano', description: 'Fastest, most cost-efficient' },
  { value: 'gpt-4.1', label: 'GPT-4.1', description: 'Legacy fallback' },
  { value: 'o4-mini', label: 'o4-mini', description: 'Reasoning, lightweight' },
];

// Flagship by default — the coordinator/agent orchestration is most reliable
// on the strongest model. Users can switch to mini/nano in the UI.
export const DEFAULT_MODEL: OpenAIModel = 'gpt-5.5';

const VALID = new Set<string>(MODEL_OPTIONS.map((m) => m.value));

export function resolveModel(input?: string): OpenAIModel {
  if (input && VALID.has(input)) return input as OpenAIModel;
  return DEFAULT_MODEL;
}

/**
 * Indicative USD pricing per 1M tokens (input / output). Estimates for the
 * cost readout in the UI — not billing-accurate. Update as pricing changes.
 */
export const MODEL_PRICING: Record<OpenAIModel, { input: number; output: number }> = {
  'gpt-5.5': { input: 1.75, output: 14 },
  'gpt-5.4': { input: 1.25, output: 10 },
  'gpt-5.4-mini': { input: 0.25, output: 2 },
  'gpt-5.4-nano': { input: 0.05, output: 0.4 },
  'gpt-4.1': { input: 2, output: 8 },
  'o4-mini': { input: 1.1, output: 4.4 },
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** Estimate USD cost for a token usage on a given model. */
export function estimateCost(model: OpenAIModel, usage: TokenUsage): number {
  const p = MODEL_PRICING[model] ?? MODEL_PRICING[DEFAULT_MODEL];
  return (usage.inputTokens * p.input + usage.outputTokens * p.output) / 1_000_000;
}

/** Format a USD cost compactly: <$0.01 shows more precision. */
export function formatCost(usd: number): string {
  if (usd <= 0) return '$0.00';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}
