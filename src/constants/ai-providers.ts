import type { AiProvider } from '@/types/ai'

export const AI_PROVIDERS: AiProvider[] = [
  {
    id: 'zen',
    label: 'Zen',
    baseUrl: 'https://opencode.ai/zen/v1',
    requiresKey: false,
    defaultModel: 'opencode-zen',
    headerTemplate: 'Bearer {key}',
  },
  {
    id: 'opencode-go',
    label: 'OpenCode Go',
    baseUrl: '',
    requiresKey: false,
    defaultModel: '',
    headerTemplate: 'Bearer {key}',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    requiresKey: true,
    defaultModel: 'openai/gpt-4o-mini',
    models: [
      'openai/gpt-4o-mini',
      'openai/gpt-4o',
      'openai/o3-mini',
      'anthropic/claude-sonnet-4',
      'anthropic/claude-haiku-4',
      'google/gemini-2.0-flash-001',
      'mistral/mistral-small-24b-instruct-2501',
    ],
    headerTemplate: 'Bearer {key}',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    requiresKey: true,
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    headerTemplate: 'Bearer {key}',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    requiresKey: true,
    defaultModel: 'claude-sonnet-4-20250514',
    models: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250514'],
    headerTemplate: 'x-api-key {key}',
  },
  {
    id: 'google',
    label: 'Google (Gemini)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    requiresKey: true,
    defaultModel: 'gemini-2.0-flash-001',
    models: ['gemini-2.0-flash-001', 'gemini-2.5-flash-001', 'gemini-2.0-flash-lite-001'],
    headerTemplate: 'x-goog-api-key {key}',
  },
  {
    id: 'custom',
    label: 'Custom',
    baseUrl: '',
    requiresKey: false,
    defaultModel: '',
    headerTemplate: 'Bearer {key}',
  },
]

export function getProvider(id: string): AiProvider | undefined {
  return AI_PROVIDERS.find(p => p.id === id)
}