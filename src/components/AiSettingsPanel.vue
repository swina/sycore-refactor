<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { X, Sparkles, Check, AlertTriangle, Loader2 } from 'lucide-vue-next'
import { useAiAgentStore } from '@/stores/useAiAgentStore'
import { AI_PROVIDERS } from '@/constants/ai-providers'

const emit = defineEmits(['close'])

const aiStore = useAiAgentStore()

const apiKeyInput = ref(aiStore.apiKey || '')
const isDirty = ref(false)

const statusColor = computed(() => {
  switch (aiStore.connectionStatus) {
    case 'success': return 'text-green-400'
    case 'error': return 'text-red-400'
    default: return 'text-neutral-500'
  }
})

const statusIcon = computed(() => {
  switch (aiStore.connectionStatus) {
    case 'success': return Check
    case 'error': return AlertTriangle
    default: return null
  }
})

const statusText = computed(() => {
  switch (aiStore.connectionStatus) {
    case 'success': return 'Connected'
    case 'error': return aiStore.connectionError || 'Connection failed'
    default: return 'Not tested'
  }
})

async function handleApiKeyBlur() {
  if (apiKeyInput.value !== aiStore.apiKey) {
    await aiStore.setApiKey(apiKeyInput.value)
  }
}

async function handleTest() {
  if (apiKeyInput.value !== aiStore.apiKey) {
    await aiStore.setApiKey(apiKeyInput.value)
  }
  await aiStore.test()
}

onMounted(async () => {
  await aiStore.init()
  apiKeyInput.value = aiStore.apiKey
})
</script>

<template>
  <div class="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
    <div class="bg-neutral-950 border border-neutral-800 rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
      <div class="p-6 border-b border-neutral-900 flex justify-between items-center">
        <div class="flex items-center gap-3">
          <Sparkles class="w-5 h-5 text-synth-neon" />
          <h2 class="text-lg font-black uppercase tracking-widest text-white">AI Agent</h2>
        </div>
        <button @click="emit('close')" class="p-1 text-neutral-400 hover:text-white transition-colors">
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
        <div v-if="!aiStore.isOnline" class="bg-red-900/20 border border-red-800/50 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle class="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <p class="text-sm text-red-300">AI Agent requires an internet connection.</p>
        </div>

        <div class="space-y-3">
          <label class="text-xs font-black uppercase tracking-widest text-neutral-400">Provider</label>
          <select
            :value="aiStore.selectedProvider"
            @change="aiStore.setProvider(($event.target as HTMLSelectElement).value)"
            class="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2.5 text-sm text-white focus:border-synth-neon outline-none"
          >
            <option v-for="p in AI_PROVIDERS" :key="p.id" :value="p.id">{{ p.label }}</option>
          </select>
        </div>

        <div class="space-y-3">
          <label class="text-xs font-black uppercase tracking-widest text-neutral-400">Model</label>
          <div v-if="aiStore.availableModels.length" class="flex flex-col gap-2">
            <select
              :value="aiStore.availableModels.includes(aiStore.model) ? aiStore.model : ''"
              @change="aiStore.setModel(($event.target as HTMLSelectElement).value)"
              class="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2.5 text-sm text-white focus:border-synth-neon outline-none"
            >
              <option value="" disabled>Select a model</option>
              <option v-for="m in aiStore.availableModels" :key="m" :value="m">{{ m }}</option>
            </select>
            <input
              :value="aiStore.model"
              @input="aiStore.setModel(($event.target as HTMLInputElement).value)"
              type="text"
              placeholder="or type custom"
              class="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2.5 text-sm text-white font-mono focus:border-synth-neon outline-none"
            />
          </div>
          <input
            v-else
            :value="aiStore.model"
            @input="aiStore.setModel(($event.target as HTMLInputElement).value)"
            type="text"
            placeholder="e.g. gpt-4o-mini"
            class="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2.5 text-sm text-white font-mono focus:border-synth-neon outline-none"
          />
        </div>

        <div class="space-y-3">
          <label class="text-xs font-black uppercase tracking-widest text-neutral-400">Endpoint</label>
          <input
            :value="aiStore.endpoint"
            @input="aiStore.setEndpoint(($event.target as HTMLInputElement).value)"
            type="text"
            placeholder="https://api.openai.com/v1"
            class="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2.5 text-sm text-white font-mono focus:border-synth-neon outline-none"
          />
        </div>

        <div class="space-y-3">
          <label class="text-xs font-black uppercase tracking-widest text-neutral-400">API Key</label>
          <input
            v-model="apiKeyInput"
            @blur="handleApiKeyBlur"
            type="password"
            placeholder="sk-..."
            class="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2.5 text-sm text-white font-mono focus:border-synth-neon outline-none"
          />
          <p v-if="aiStore.provider?.requiresKey" class="text-xs text-neutral-500">Required for this provider</p>
          <p v-else class="text-xs text-neutral-500">Optional for this provider</p>
        </div>

        <div class="space-y-3">
          <button
            @click="handleTest"
            :disabled="aiStore.isTesting || !aiStore.isOnline"
            class="w-full flex items-center justify-center gap-2 bg-neutral-900 border border-neutral-800 text-neutral-300 rounded-lg px-4 py-2.5 text-sm font-bold uppercase tracking-wider hover:border-synth-neon hover:text-synth-neon transition-colors disabled:opacity-50"
          >
            <Loader2 v-if="aiStore.isTesting" class="w-4 h-4 animate-spin" />
            <template v-else>Test Connection</template>
          </button>
          <div class="flex items-center gap-2 text-xs" :class="statusColor">
            <component :is="statusIcon" v-if="statusIcon" class="w-4 h-4" />
            <span>{{ statusText }}</span>
          </div>
        </div>
      </div>

      <div class="p-6 border-t border-neutral-900 flex justify-end">
        <button
          @click="emit('close')"
          class="px-6 py-2 bg-synth-neon text-black rounded-lg font-black text-sm uppercase hover:bg-white transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  </div>
</template>