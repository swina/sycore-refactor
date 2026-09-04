<script setup lang="ts">
import { ref, computed } from 'vue'
import { X, Sparkles, Loader2, Check, RotateCcw, Clock, History } from 'lucide-vue-next'
import { useAiAgentStore } from '@/stores/useAiAgentStore'
import { sendAiPrompt } from '@/lib/ai-service'
import { userKey } from '@/lib/userKey'

const props = defineProps<{
  systemPrompt: string
  placeholder?: string
  buttonLabel?: string
  /** Stable identifier for the app this modal is embedded in — used to
   *  scope the saved "last prompt" so each app remembers its own. Falls
   *  back to a slug derived from systemPrompt when not given. */
  appKey?: string
}>()

const emit = defineEmits<{
  result: [data: string]
  close: []
}>()

const aiStore = useAiAgentStore()
const prompt = ref('')
const isLoading = ref(false)
const error = ref('')
const resultRaw = ref('')

// ── Last submitted prompt (per app) ─────────────────────────────
// The same modal is reused by Chord Progression, Drum Machine, both
// sequencers, the Sound preview panel, etc. — each has its own systemPrompt,
// so the remembered prompt is scoped by appKey (see sites that pass it).
const LS_LAST_PROMPT = 'SYCORE_AI_LAST_PROMPT'

function defaultAppKey() {
  return props.systemPrompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

const appId = computed(() => props.appKey || defaultAppKey())

function loadLastPrompt() {
  try {
    return localStorage.getItem(userKey(`${LS_LAST_PROMPT}_${appId.value}`)) ?? ''
  } catch { return '' }
}

const lastPrompt = ref(loadLastPrompt())

function persistLastPrompt() {
  const text = prompt.value.trim()
  if (!text) return
  lastPrompt.value = text
  try {
    localStorage.setItem(userKey(`${LS_LAST_PROMPT}_${appId.value}`), text)
  } catch {}
}

function reuseLastPrompt() {
  if (!lastPrompt.value) return
  prompt.value = lastPrompt.value
  resultRaw.value = ''
  error.value = ''
}

const canGenerate = computed(() => aiStore.isConfigured && aiStore.isOnline && prompt.value.trim() && !isLoading.value)
const hasResult = computed(() => resultRaw.value.length > 0)

const previewText = computed(() => {
  if (!resultRaw.value) return ''
  try {
    const raw = resultRaw.value.replace(/```json|```/g, '').trim()
    const start = raw.indexOf('[')
    const end = raw.lastIndexOf(']')
    if (start !== -1 && end !== -1) {
      const parsed = JSON.parse(raw.slice(start, end + 1))
      if (Array.isArray(parsed)) {
        const names = parsed.map((c: any) => c.chordName || c.name || '').filter(Boolean)
        if (names.length) return names.join('  →  ')
      }
    }
  } catch {}
  return resultRaw.value
})

function reset() {
  resultRaw.value = ''
  error.value = ''
}

async function handleGenerate() {
  if (!canGenerate.value) return
  persistLastPrompt()
  isLoading.value = true
  error.value = ''
  resultRaw.value = ''
  try {
    const res = await sendAiPrompt(
      aiStore.selectedProvider,
      aiStore.endpoint,
      aiStore.model,
      aiStore.apiKey,
      props.systemPrompt,
      prompt.value,
    )
    if (res.success && res.data) {
      resultRaw.value = res.data
    } else {
      error.value = res.error || 'Generation failed'
    }
  } catch (err: any) {
    error.value = err.message || 'Generation failed'
  } finally {
    isLoading.value = false
  }
}

function handleApply() {
  if (resultRaw.value) {
    emit('result', resultRaw.value)
  }
  emit('close')
}

function handleDiscard() {
  reset()
}
</script>

<template>
  <div class="fixed inset-0 z-[400] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
    <div class="bg-neutral-950 border border-neutral-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
      <div class="p-6 border-b border-neutral-900 flex justify-between items-center">
        <div class="flex items-center gap-3">
          <Sparkles class="w-5 h-5 text-synth-neon" />
          <h2 class="text-lg font-black uppercase tracking-widest text-white">AI Prompt</h2>
        </div>
        <button @click="emit('close')" class="p-1 text-neutral-400 hover:text-white transition-colors">
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="p-6 space-y-4">
        <div v-if="!aiStore.isOnline" class="bg-red-900/20 border border-red-800/50 rounded-lg p-3 text-sm text-red-300">
          AI Agent requires an internet connection. Configure it in AI Agent settings.
        </div>
        <div v-else-if="!aiStore.isConfigured" class="bg-amber-900/20 border border-amber-800/50 rounded-lg p-3 text-sm text-amber-300">
          AI Agent not configured. Open AI Agent settings to set up a provider and model.
        </div>

        <template v-if="!hasResult">
          <!-- Last prompt indicator -->
          <div
            v-if="lastPrompt && !isLoading"
            class="flex items-center gap-1.5 text-[10px] font-mono text-neutral-500 mb-1"
          >
            <Clock class="w-3 h-3 shrink-0" />
            <span class="truncate flex-1 min-w-0">Last: {{ lastPrompt }}</span>
            <button
              @click="reuseLastPrompt"
              title="Reuse this prompt"
              class="shrink-0 px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-synth-neon hover:border-synth-neon/30 transition-colors text-[8px] font-bold uppercase tracking-wider"
            >
              <History class="w-2.5 h-2.5" />
            </button>
          </div>
          <textarea
            v-if="!isLoading"
            v-model="prompt"
            :placeholder="placeholder || 'Describe what you want to generate...'"
            rows="4"
            class="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-synth-neon transition-all resize-none"
          />

          <div v-else class="flex flex-col items-center gap-3 py-8">
            <Loader2 class="w-8 h-8 text-synth-neon animate-spin" />
            <p class="text-sm text-neutral-400">Generating...</p>
          </div>

          <p v-if="error" class="text-sm text-red-400">{{ error }}</p>

          <button
            v-if="!isLoading"
            @click="handleGenerate"
            :disabled="!canGenerate"
            class="w-full flex items-center justify-center gap-2 bg-synth-neon text-black rounded-xl px-6 py-3 font-black text-sm uppercase tracking-widest hover:bg-white transition-colors disabled:opacity-50"
          >
            <Sparkles class="w-4 h-4" />
            {{ buttonLabel || 'Generate' }}
          </button>
        </template>

        <template v-else>
          <div class="bg-neutral-900 border border-neutral-800 rounded-xl p-4 max-h-48 overflow-y-auto custom-scrollbar">
            <div v-if="previewText !== resultRaw" class="text-sm text-synth-neon font-bold text-center py-2 tracking-wider">
              {{ previewText }}
            </div>
            <pre v-else class="text-sm text-neutral-200 font-mono whitespace-pre-wrap break-words">{{ resultRaw }}</pre>
          </div>

          <div class="flex items-center gap-3">
            <button
              @click="handleDiscard"
              class="flex-1 flex items-center justify-center gap-2 border border-neutral-700 text-neutral-400 rounded-xl px-6 py-3 font-black text-xs uppercase tracking-widest hover:bg-neutral-800 hover:text-white transition-colors"
            >
              <RotateCcw class="w-4 h-4" /> Discard
            </button>
            <button
              @click="handleApply"
              class="flex-1 flex items-center justify-center gap-2 bg-synth-neon text-black rounded-xl px-6 py-3 font-black text-xs uppercase tracking-widest hover:bg-white transition-colors"
            >
              <Check class="w-4 h-4" /> Apply
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>