<script setup>
import { ref, computed, onMounted } from 'vue'
import { Mic, Volume2, RefreshCw, CheckCircle2, Circle, SlidersHorizontal, X } from 'lucide-vue-next'
import ModalShell from '@/components/ui/ModalShell.vue'
import { useUiStore } from '@/stores/useUiStore'
import { userKey } from '@/lib/userKey'

const uiStore = useUiStore()

const props = defineProps({
  selectedInputId: { type: String, default: 'default' },
})

const emit = defineEmits(['close', 'select-input', 'select-output'])

const allDevices   = ref([])
const activeTab    = ref('input')
const isRefreshing = ref(false)

const inputDevices  = computed(() => allDevices.value.filter(d => d.kind === 'audioinput'))
const outputDevices = computed(() => allDevices.value.filter(d => d.kind === 'audiooutput'))

const selectedInput  = ref(props.selectedInputId || localStorage.getItem(userKey('S1_CAPTURE_DEVICE')) || 'default')
const selectedOutput = ref(localStorage.getItem(userKey('S1_AUDIO_OUTPUT_DEVICE')) || 'default')

async function refresh() {
  isRefreshing.value = true
  try {
    // Request permission so labels are populated
    await navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(s => s.getTracks().forEach(t => t.stop())).catch(() => {})
    allDevices.value = await navigator.mediaDevices.enumerateDevices()
  } catch {}
  isRefreshing.value = false
}

function selectInput(deviceId) {
  selectedInput.value = deviceId
  localStorage.setItem(userKey('S1_CAPTURE_DEVICE'), deviceId)
  emit('select-input', deviceId)
}

function selectOutput(deviceId) {
  selectedOutput.value = deviceId
  localStorage.setItem(userKey('S1_AUDIO_OUTPUT_DEVICE'), deviceId)
  emit('select-output', deviceId)
}

function deviceLabel(d) {
  if (d.label) return d.label
  const short = d.deviceId === 'default' ? 'default' : d.deviceId.slice(0, 8)
  return d.kind === 'audioinput' ? `Input (${short})` : `Output (${short})`
}

function isDefaultOrCommunications(d) {
  return d.deviceId === 'default' || d.deviceId === 'communications'
}

onMounted(refresh)
</script>

<template>
  <ModalShell title="Audio Device Settings" size="md" zClass="z-[130]" @close="emit('close')">

    <!-- Tab bar -->
    <template #header>
      <div class="flex items-center gap-3">
        <SlidersHorizontal class="w-4 h-4 text-synth-neon" />
        <span class="text-sm font-black uppercase tracking-widest text-white">Audio Device Settings</span>
      </div>
    </template>

    <div class="flex gap-1 border-b border-neutral-800 bg-neutral-900/40 px-4">
      <button
        v-for="tab in [{ id: 'input', label: 'Input', icon: 'Mic' }, { id: 'output', label: 'Output', icon: 'Volume2' }]"
        :key="tab.id"
        @click="activeTab = tab.id"
        :class="['px-4 py-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors',
          activeTab === tab.id
            ? 'border-synth-neon text-synth-neon'
            : 'border-transparent text-neutral-400 hover:text-white']"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="p-4 space-y-3">

      <!-- Refresh row -->
      <div class="flex items-center justify-between mb-1">
        <p class="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">
          {{ activeTab === 'input' ? 'Registered Input Devices' : 'Registered Output Devices' }}
        </p>
        <button
          @click="refresh"
          :disabled="isRefreshing"
          class="flex items-center gap-1.5 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider text-neutral-400 border border-neutral-700 hover:text-white hover:border-neutral-500 transition-colors disabled:opacity-40"
        >
          <RefreshCw :class="['w-3 h-3', isRefreshing ? 'animate-spin' : '']" />
          Refresh
        </button>
      </div>

      <!-- Input devices list -->
      <template v-if="activeTab === 'input'">
        <div v-if="inputDevices.length === 0" class="text-center py-8 text-neutral-600 text-xs">
          No input devices detected. Click Refresh to scan.
        </div>

        <!-- Default entry -->
        <button
          @click="selectInput('default')"
          :class="['w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors text-left',
            selectedInput === 'default'
              ? 'border-synth-neon/50 bg-synth-neon/5 text-white'
              : 'border-neutral-800 hover:border-neutral-600 text-neutral-300 hover:text-white']"
        >
          <CheckCircle2 v-if="selectedInput === 'default'" class="w-4 h-4 text-synth-neon shrink-0" />
          <Circle v-else class="w-4 h-4 text-neutral-600 shrink-0" />
          <Mic class="w-3.5 h-3.5 shrink-0 text-neutral-500" />
          <div class="flex-1 min-w-0">
            <div class="text-xs font-semibold truncate">System Default</div>
            <div class="text-[10px] text-neutral-500 font-mono">default</div>
          </div>
          <span v-if="selectedInput === 'default'" class="text-[9px] font-black uppercase tracking-wider text-synth-neon px-1.5 py-0.5 rounded bg-synth-neon/10 border border-synth-neon/20">
            Active
          </span>
        </button>

        <button
          v-for="d in inputDevices.filter(d => d.deviceId !== 'default')"
          :key="d.deviceId"
          @click="selectInput(d.deviceId)"
          :class="['w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors text-left',
            selectedInput === d.deviceId
              ? 'border-synth-neon/50 bg-synth-neon/5 text-white'
              : 'border-neutral-800 hover:border-neutral-600 text-neutral-300 hover:text-white']"
        >
          <CheckCircle2 v-if="selectedInput === d.deviceId" class="w-4 h-4 text-synth-neon shrink-0" />
          <Circle v-else class="w-4 h-4 text-neutral-600 shrink-0" />
          <Mic class="w-3.5 h-3.5 shrink-0 text-neutral-500" />
          <div class="flex-1 min-w-0">
            <div class="text-xs font-semibold truncate">{{ deviceLabel(d) }}</div>
            <div class="text-[10px] text-neutral-500 font-mono truncate">{{ d.deviceId.slice(0, 20) }}…</div>
          </div>
          <span v-if="selectedInput === d.deviceId" class="text-[9px] font-black uppercase tracking-wider text-synth-neon px-1.5 py-0.5 rounded bg-synth-neon/10 border border-synth-neon/20 shrink-0">
            Active
          </span>
        </button>
      </template>

      <!-- Output devices list -->
      <template v-else>
        <div v-if="outputDevices.length === 0" class="text-center py-8 text-neutral-600 text-xs">
          No output devices detected. Click Refresh to scan.
        </div>

        <button
          @click="selectOutput('default')"
          :class="['w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors text-left',
            selectedOutput === 'default'
              ? 'border-cyan-400/50 bg-cyan-400/5 text-white'
              : 'border-neutral-800 hover:border-neutral-600 text-neutral-300 hover:text-white']"
        >
          <CheckCircle2 v-if="selectedOutput === 'default'" class="w-4 h-4 text-cyan-400 shrink-0" />
          <Circle v-else class="w-4 h-4 text-neutral-600 shrink-0" />
          <Volume2 class="w-3.5 h-3.5 shrink-0 text-neutral-500" />
          <div class="flex-1 min-w-0">
            <div class="text-xs font-semibold truncate">System Default</div>
            <div class="text-[10px] text-neutral-500 font-mono">default</div>
          </div>
          <span v-if="selectedOutput === 'default'" class="text-[9px] font-black uppercase tracking-wider text-cyan-400 px-1.5 py-0.5 rounded bg-cyan-400/10 border border-cyan-400/20 shrink-0">
            Active
          </span>
        </button>

        <button
          v-for="d in outputDevices.filter(d => d.deviceId !== 'default')"
          :key="d.deviceId"
          @click="selectOutput(d.deviceId)"
          :class="['w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors text-left',
            selectedOutput === d.deviceId
              ? 'border-cyan-400/50 bg-cyan-400/5 text-white'
              : 'border-neutral-800 hover:border-neutral-600 text-neutral-300 hover:text-white']"
        >
          <CheckCircle2 v-if="selectedOutput === d.deviceId" class="w-4 h-4 text-cyan-400 shrink-0" />
          <Circle v-else class="w-4 h-4 text-neutral-600 shrink-0" />
          <Volume2 class="w-3.5 h-3.5 shrink-0 text-neutral-500" />
          <div class="flex-1 min-w-0">
            <div class="text-xs font-semibold truncate">{{ deviceLabel(d) }}</div>
            <div class="text-[10px] text-neutral-500 font-mono truncate">{{ d.deviceId.slice(0, 20) }}…</div>
          </div>
          <span v-if="selectedOutput === d.deviceId" class="text-[9px] font-black uppercase tracking-wider text-cyan-400 px-1.5 py-0.5 rounded bg-cyan-400/10 border border-cyan-400/20 shrink-0">
            Active
          </span>
        </button>

        <p class="text-[9px] text-neutral-600 mt-2 leading-relaxed">
          Output device selection applies to the Web Audio API sink. Browser support varies — some browsers require additional permissions.
        </p>
      </template>

    </div>

    <!-- Footer summary -->
    <template #footer>
      <div class="px-4 py-3 border-t border-neutral-800 bg-neutral-950/60 flex items-center justify-between gap-4">
        <div class="text-[10px] text-neutral-500 font-mono space-y-0.5">
          <div><span class="text-neutral-400">IN:</span> {{ inputDevices.length }} device{{ inputDevices.length !== 1 ? 's' : '' }} registered</div>
          <div><span class="text-neutral-400">OUT:</span> {{ outputDevices.length }} device{{ outputDevices.length !== 1 ? 's' : '' }} registered</div>
        </div>
        <div class="flex items-center gap-2">
          <button
            @click="uiStore.isAudioMixerOpen = true; emit('close')"
            class="flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-widest rounded-lg border border-amber-500/30 text-amber-400 hover:bg-amber-400/10 transition-colors"
          >
            <SlidersHorizontal class="w-3.5 h-3.5" />
            Mixer
          </button>
          <button
            @click="emit('close')"
            class="px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </template>

  </ModalShell>
</template>
