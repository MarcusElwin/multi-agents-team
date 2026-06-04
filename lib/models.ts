import { createOpenAI, openai as envOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createMistral } from '@ai-sdk/mistral';
import { createFireworks } from '@ai-sdk/fireworks';

export type ProviderId = 'openai' | 'anthropic' | 'mistral' | 'fireworks';

/**
 * A model id. Kept as a broad string at the catalog/boundary so adding
 * providers doesn't fight a union everywhere. `OpenAIModel` remains an alias so
 * existing signatures (runners, agent factories typed `model: OpenAIModel`)
 * keep compiling — any catalog id is assignable.
 */
export type ModelId = string;
export type OpenAIModel = ModelId;

export interface ModelOption {
  value: ModelId;
  label: string;
  provider: ProviderId;
  description?: string;
}

export const MODEL_OPTIONS: ModelOption[] = [
  // OpenAI
  { value: 'gpt-5.5', label: 'GPT-5.5', provider: 'openai', description: 'Flagship — best for coding & reasoning' },
  { value: 'gpt-5.4', label: 'GPT-5.4', provider: 'openai', description: 'More affordable flagship-class' },
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', provider: 'openai', description: 'Strong mini — fast, lower cost' },
  { value: 'gpt-5.4-nano', label: 'GPT-5.4 Nano', provider: 'openai', description: 'Fastest, most cost-efficient' },
  { value: 'gpt-4.1', label: 'GPT-4.1', provider: 'openai', description: 'Legacy fallback' },
  { value: 'o4-mini', label: 'o4-mini', provider: 'openai', description: 'Reasoning, lightweight' },
  // Anthropic
  { value: 'claude-opus-4-8', label: 'Claude Opus 4.8', provider: 'anthropic', description: 'Most capable Claude' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'anthropic', description: 'Balanced Claude' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', provider: 'anthropic', description: 'Fast, low-cost Claude' },
  // Mistral — `-latest` aliases track the newest stable snapshot of each tier.
  { value: 'mistral-large-latest', label: 'Mistral Large', provider: 'mistral', description: 'Top-tier reasoning & multilingual' },
  { value: 'mistral-medium-latest', label: 'Mistral Medium 3', provider: 'mistral', description: 'Balanced cost/performance' },
  { value: 'magistral-medium-latest', label: 'Magistral Medium', provider: 'mistral', description: 'Reasoning-focused' },
  { value: 'mistral-small-latest', label: 'Mistral Small 3', provider: 'mistral', description: 'Fast, low-cost' },
  // Fireworks — open-weight models on serverless inference.
  { value: 'accounts/fireworks/models/deepseek-v4-pro', label: 'DeepSeek V4 Pro', provider: 'fireworks', description: 'Flagship open MoE — 1M context, tools' },
  { value: 'accounts/fireworks/models/kimi-k2p6', label: 'Kimi K2.6', provider: 'fireworks', description: 'Strong open MoE — reasoning & tools' },
  { value: 'accounts/fireworks/models/gpt-oss-120b', label: 'GPT-OSS 120B', provider: 'fireworks', description: 'OpenAI open-weight — fast, tools' },
];

// Flagship by default — orchestration is most reliable on the strongest model.
export const DEFAULT_MODEL: ModelId = 'gpt-5.5';

const VALID = new Set<string>(MODEL_OPTIONS.map((m) => m.value));

export function resolveModel(input?: string): ModelId {
  if (input && VALID.has(input)) return input;
  return DEFAULT_MODEL;
}

/** Which provider a model id belongs to (defaults to openai for unknowns). */
export function providerForModel(model: ModelId): ProviderId {
  return MODEL_OPTIONS.find((m) => m.value === model)?.provider ?? 'openai';
}

/**
 * Provider registry. Each entry knows how to build a model-provider client from
 * an API key, plus its env var and key prefix (for the settings UI). OpenAI and
 * Anthropic ship now; adding another is a new entry here.
 */
export const PROVIDERS: Record<
  ProviderId,
  {
    id: ProviderId;
    label: string;
    envVar: string;
    keyPrefix: string;
    keysUrl: string;
    /** Build a model-provider bound to a specific API key. */
    createClient: (apiKey: string) => (model: string) => unknown;
  }
> = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    envVar: 'OPENAI_API_KEY',
    keyPrefix: 'sk-',
    keysUrl: 'https://platform.openai.com/api-keys',
    createClient: (apiKey: string) => createOpenAI({ apiKey }),
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    envVar: 'ANTHROPIC_API_KEY',
    keyPrefix: 'sk-ant-',
    keysUrl: 'https://console.anthropic.com/settings/keys',
    createClient: (apiKey: string) => createAnthropic({ apiKey }),
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral AI',
    envVar: 'MISTRAL_API_KEY',
    keyPrefix: '',
    keysUrl: 'https://console.mistral.ai/api-keys',
    createClient: (apiKey: string) => createMistral({ apiKey }),
  },
  fireworks: {
    id: 'fireworks',
    label: 'Fireworks AI',
    envVar: 'FIREWORKS_API_KEY',
    keyPrefix: 'fw_',
    keysUrl: 'https://fireworks.ai/account/api-keys',
    createClient: (apiKey: string) => createFireworks({ apiKey }),
  },
};

export const PROVIDER_LIST = Object.values(PROVIDERS);

/** The env-default OpenAI provider (reads OPENAI_API_KEY) — today's behavior. */
export { envOpenAI };

/**
 * Indicative USD pricing per 1M tokens (input / output). Estimates for the cost
 * readout — not billing-accurate. Update as pricing changes.
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-5.5': { input: 1.75, output: 14 },
  'gpt-5.4': { input: 1.25, output: 10 },
  'gpt-5.4-mini': { input: 0.25, output: 2 },
  'gpt-5.4-nano': { input: 0.05, output: 0.4 },
  'gpt-4.1': { input: 2, output: 8 },
  'o4-mini': { input: 1.1, output: 4.4 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  'mistral-large-latest': { input: 2, output: 6 },
  'mistral-medium-latest': { input: 0.4, output: 2 },
  'magistral-medium-latest': { input: 2, output: 5 },
  'mistral-small-latest': { input: 0.1, output: 0.3 },
  'accounts/fireworks/models/deepseek-v4-pro': { input: 0.9, output: 0.9 },
  'accounts/fireworks/models/kimi-k2p6': { input: 0.6, output: 2.5 },
  'accounts/fireworks/models/gpt-oss-120b': { input: 0.15, output: 0.6 },
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** Estimate USD cost for a token usage on a given model. */
export function estimateCost(model: ModelId, usage: TokenUsage): number {
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
