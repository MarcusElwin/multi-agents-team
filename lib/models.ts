export type OpenAIModel =
  | 'gpt-5.5'
  | 'gpt-5.4'
  | 'gpt-5.4-mini'
  | 'gpt-5.4-nano'
  | 'gpt-5'
  | 'gpt-5-mini'
  | 'gpt-4.1'
  | 'o4-mini';

export interface ModelOption {
  value: OpenAIModel;
  label: string;
  description?: string;
}

export const MODEL_OPTIONS: ModelOption[] = [
  { value: 'gpt-5.5', label: 'GPT-5.5', description: 'Highest quality (verify access)' },
  { value: 'gpt-5.4', label: 'GPT-5.4', description: 'Balanced flagship (verify access)' },
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', description: 'Fast (verify access)' },
  { value: 'gpt-5.4-nano', label: 'GPT-5.4 Nano', description: 'Fastest, cheapest (verify access)' },
  { value: 'gpt-5', label: 'GPT-5', description: 'Reliable general purpose' },
  { value: 'gpt-5-mini', label: 'GPT-5 Mini', description: 'Fast and cheap' },
  { value: 'gpt-4.1', label: 'GPT-4.1', description: 'Legacy fallback' },
  { value: 'o4-mini', label: 'o4-mini', description: 'Reasoning, lightweight' },
];

export const DEFAULT_MODEL: OpenAIModel = 'gpt-5';

const VALID = new Set<string>(MODEL_OPTIONS.map((m) => m.value));

export function resolveModel(input?: string): OpenAIModel {
  if (input && VALID.has(input)) return input as OpenAIModel;
  return DEFAULT_MODEL;
}
