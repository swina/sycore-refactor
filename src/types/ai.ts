export interface AiProvider {
  id: string
  label: string
  baseUrl: string
  requiresKey: boolean
  defaultModel?: string
  models?: string[]
  headerTemplate: string
}

export interface AiConfig {
  selectedProvider: string
  model: string
  endpoint: string
}

export interface AiCompletionRequest {
  model: string
  messages: { role: 'system' | 'user'; content: string }[]
  temperature?: number
  max_tokens?: number
}

export interface AiCompletionResponse {
  id: string
  choices: {
    index: number
    message: { role: string; content: string }
    finish_reason: string
  }[]
}

export interface AiServiceResult {
  success: boolean
  data?: string
  error?: string
}