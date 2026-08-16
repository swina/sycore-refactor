import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from './useAuthStore'
import { getProvider, AI_PROVIDERS } from '@/constants/ai-providers'
import { testConnection } from '@/lib/ai-service'
import { db, getDoc, setDoc, doc } from '@/lib/idb'
import { userKey } from '@/lib/userKey'

const LS_CONFIG_KEY = userKey('SYCORE_AI_CONFIG')
const LS_API_KEY = userKey('SYCORE_AI_API_KEY')

function loadFromLS(): { selectedProvider: string; model: string; endpoint: string; apiKey: string } | null {
  try {
    const raw = localStorage.getItem(LS_CONFIG_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return null
}

function saveToLS(data: { selectedProvider: string; model: string; endpoint: string; apiKey: string }) {
  try {
    localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(data))
  } catch {}
}

export const useAiAgentStore = defineStore('aiAgent', () => {
  const saved = loadFromLS()

  const selectedProvider = ref(saved?.selectedProvider || 'openrouter')
  const model = ref(saved?.model || '')
  const endpoint = ref(saved?.endpoint || '')
  const apiKey = ref(saved?.apiKey || '')
  const isTesting = ref(false)
  const connectionStatus = ref<'idle' | 'success' | 'error'>('idle')
  const connectionError = ref('')
  const initialized = ref(false)

  const isOnline = computed(() => navigator.onLine)

  const provider = computed(() => getProvider(selectedProvider.value))

  const availableModels = computed(() => {
    const p = provider.value
    if (p?.models?.length) return p.models
    return []
  })

  const isConfigured = computed(() => {
    const p = provider.value
    if (!p) return false
    if (p.requiresKey && !apiKey.value) return false
    return !!model.value
  })

  function persistLocal() {
    saveToLS({
      selectedProvider: selectedProvider.value,
      model: model.value,
      endpoint: endpoint.value,
      apiKey: apiKey.value,
    })
  }

  async function init(): Promise<void> {
    if (initialized.value) return
    initialized.value = true
    try {
      const snap = await getDoc(doc(db, 'system', 'ai_config'))
      if (snap.exists()) {
        const data = snap.data() as any
        selectedProvider.value = data.selectedProvider || selectedProvider.value
        model.value = data.model || model.value
        endpoint.value = data.endpoint || endpoint.value
        persistLocal()
      }
    } catch (e) {
      console.error('[AiAgentStore] Failed to load IndexedDB config', e)
    }
    const authStore = useAuthStore()
    if (authStore.profile?.aiApiKey) {
      apiKey.value = authStore.profile.aiApiKey
      persistLocal()
    }
  }

  function setProvider(id: string) {
    selectedProvider.value = id
    const p = getProvider(id)
    if (p) {
      endpoint.value = p.baseUrl || ''
      model.value = p.defaultModel || ''
    }
    connectionStatus.value = 'idle'
    connectionError.value = ''
    persistLocal()
    saveToDb()
  }

  function setModel(m: string) {
    model.value = m
    connectionStatus.value = 'idle'
    persistLocal()
    saveToDb()
  }

  function setEndpoint(url: string) {
    endpoint.value = url
    connectionStatus.value = 'idle'
    persistLocal()
    saveToDb()
  }

  async function setApiKey(key: string) {
    apiKey.value = key
    persistLocal()
    const authStore = useAuthStore()
    await authStore.saveAiApiKey(key)
    connectionStatus.value = 'idle'
  }

  async function test(): Promise<void> {
    isTesting.value = true
    connectionStatus.value = 'idle'
    connectionError.value = ''
    try {
      const result = await testConnection(
        selectedProvider.value,
        endpoint.value,
        model.value,
        apiKey.value,
      )
      if (result.success) {
        connectionStatus.value = 'success'
      } else {
        connectionStatus.value = 'error'
        connectionError.value = result.error || 'Connection failed'
      }
    } catch (err: any) {
      connectionStatus.value = 'error'
      connectionError.value = err.message || 'Connection failed'
    } finally {
      isTesting.value = false
    }
  }

  async function saveToDb(): Promise<void> {
    try {
      await setDoc(doc(db, 'system', 'ai_config'), {
        selectedProvider: selectedProvider.value,
        model: model.value,
        endpoint: endpoint.value,
        updatedAt: new Date().toISOString(),
      })
    } catch (e) {
      console.error('[AiAgentStore] Failed to save to IndexedDB', e)
    }
  }

  return {
    selectedProvider, model, endpoint, apiKey,
    isTesting, connectionStatus, connectionError,
    isOnline, provider, availableModels, isConfigured,
    init, setProvider, setModel, setEndpoint, setApiKey, test, saveToDb,
  }
})