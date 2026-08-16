import type { AiCompletionRequest, AiServiceResult } from '@/types/ai'
import { getProvider } from '@/constants/ai-providers'

async function fetchCompletion(
  endpoint: string,
  headers: Record<string, string>,
  body: AiCompletionRequest,
  signal?: AbortSignal,
): Promise<AiServiceResult> {
  try {
    const res = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal,
    })
    if (!res.ok) {
      let detail = ''
      try { const j = await res.json(); detail = j.error?.message || j.error || '' } catch {}
      return { success: false, error: `API error ${res.status}${detail ? ': ' + detail : ''}` }
    }
    const json = await res.json()
    const content = json.choices?.[0]?.message?.content
    if (!content) return { success: false, error: 'Empty response from API' }
    return { success: true, data: content }
  } catch (err: any) {
    if (err.name === 'AbortError') return { success: false, error: 'Request cancelled' }
    return { success: false, error: err.message || 'Network error' }
  }
}

export async function sendAiPrompt(
  providerId: string,
  endpoint: string,
  model: string,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
): Promise<AiServiceResult> {
  const provider = getProvider(providerId)
  const baseUrl = endpoint || provider?.baseUrl || ''
  if (!baseUrl) return { success: false, error: 'No endpoint configured' }
  if (!model) return { success: false, error: 'No model configured' }

  const headerKey = provider?.headerTemplate || 'Bearer {key}'
  const authHeader = headerKey.replace('{key}', apiKey || '')
  const headers: Record<string, string> = {}

  if (authHeader && apiKey) {
    if (headerKey.startsWith('x-api-key') || headerKey.startsWith('x-goog-api-key')) {
      headers[headerKey.split(' ')[0]] = authHeader
    } else {
      headers['Authorization'] = authHeader
    }
  }

  const body: AiCompletionRequest = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 2048,
  }

  return fetchCompletion(baseUrl, headers, body, signal)
}

export async function testConnection(
  providerId: string,
  endpoint: string,
  model: string,
  apiKey: string,
): Promise<AiServiceResult> {
  return sendAiPrompt(
    providerId, endpoint, model, apiKey,
    'You are a test assistant. Reply with exactly "ok".',
    'Say ok',
  )
}