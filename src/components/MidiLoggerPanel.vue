<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { Settings2, Trash2, RefreshCw, X } from 'lucide-vue-next'
import { midiService } from '@/core/midi/MidiService'
import { useUiStore } from '@/stores/useUiStore'

const uiStore = useUiStore()

const logs            = ref([])
const filterNoteOn    = ref(false)
const isFrozen        = ref(false)
const selectedInputId = ref('')
const inputs          = ref([])
const logEndRef       = ref(null)

// ─── Device list ─────────────────────────────────────────────────────────────

function refreshInputs() {
  const available = midiService.getInputs().map(i => ({ id: i.id, name: i.name || 'Unknown' }))
  inputs.value = available
  if (available.length > 0 && !available.find(i => i.id === selectedInputId.value)) {
    selectedInputId.value = available[0].id
  }
}

// ─── MIDI listener ────────────────────────────────────────────────────────────

let _currentInput = null
let _handler      = null

function bindListener(inputId) {
  if (_currentInput && _handler) {
    _currentInput.removeEventListener('midimessage', _handler)
    _currentInput = null
    _handler = null
  }
  if (!inputId || !uiStore.isAdminLoggerOpen) return

  const input = midiService.getInputs().find(i => i.id === inputId)
  if (!input) return

  _handler = (event) => {
    if (isFrozen.value) return
    const data = event.data
    if (!data) return
    const status = data[0]
    if (status >= 0xf8) return

    const type    = status & 0xf0
    const channel = status & 0x0f
    const isNoteOn  = type === 0x90
    const isNoteOff = type === 0x80

    if (filterNoteOn.value && (isNoteOn || isNoteOff)) return

    const time = new Date().toISOString().substring(11, 23)
    const hex  = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ')

    let desc = 'Unknown'
    if (type === 0xb0)         desc = `CC#${data[1]}=${data[2]} (Ch:${channel + 1})`
    else if (status === 0xf0)  desc = `SysEx (${data.length} bytes)`
    else if (isNoteOn)         desc = `Note ON  note:${data[1]} vel:${data[2]} (Ch:${channel + 1})`
    else if (isNoteOff)        desc = `Note OFF note:${data[1]} vel:${data[2]} (Ch:${channel + 1})`
    else if (type === 0xe0)    desc = `Pitch Bend (Ch:${channel + 1})`
    if (desc === 'Unknown') return

    const entry = `[${time}] ${desc} | ${hex}`
    logs.value = logs.value.length >= 500
      ? [...logs.value.slice(logs.value.length - 499), entry]
      : [...logs.value, entry]
  }

  input.addEventListener('midimessage', _handler)
  _currentInput = input
}

// Re-bind when input or panel open state changes
watch([() => uiStore.isAdminLoggerOpen, selectedInputId], ([open, id]) => {
  if (open && id) bindListener(id)
  else if (!open && _currentInput && _handler) {
    _currentInput.removeEventListener('midimessage', _handler)
    _currentInput = null
    _handler = null
  }
})

// ─── Auto-scroll ──────────────────────────────────────────────────────────────

watch(logs, async () => {
  await nextTick()
  logEndRef.value?.scrollIntoView({ behavior: 'smooth' })
})

// ─── Colour helper ────────────────────────────────────────────────────────────

function logClass(log) {
  if (log.includes('[SYSTEM]')) return 'text-indigo-400 font-bold italic'
  if (log.includes('SysEx'))    return 'text-blue-400'
  if (log.includes('CC#'))      return 'text-emerald-400'
  if (log.includes('Note'))     return 'text-yellow-400'
  return 'text-neutral-300'
}

// ─── System Logs ──────────────────────────────────────────────────────────────
const systemBuffer = ref([])
function addLog(entry) {
  logs.value = logs.value.length >= 500
    ? [...logs.value.slice(logs.value.length - 499), entry]
    : [...logs.value, entry]
}

function handleSystemLog(e) {
  const time = new Date().toISOString().substring(11, 23)
  const msg = e.detail || e
  const entry = `[${time}] [SYSTEM] ${msg}`
  if (!uiStore.isAdminLoggerOpen) {
    systemBuffer.value.push(entry)
  } else {
    addLog(entry)
  }
}

// Flush buffer when opened
watch(() => uiStore.isAdminLoggerOpen, (open) => {
  if (open && systemBuffer.value.length > 0) {
    systemBuffer.value.forEach(addLog)
    systemBuffer.value = []
  }
})

// ─── Lifecycle ────────────────────────────────────────────────────────────────

let _unsubState = null

onMounted(() => {
  refreshInputs()
  _unsubState = midiService.addStateChangeListener(() => refreshInputs())
  window.addEventListener('app-system-log', handleSystemLog)
})

onUnmounted(() => {
  if (_currentInput && _handler) _currentInput.removeEventListener('midimessage', _handler)
  _unsubState?.()
  window.removeEventListener('app-system-log', handleSystemLog)
})
</script>

<template>
  <!-- Always-visible FAB + conditionally visible log panel -->
  <div class="fixed bottom-[52px] left-1/2 -translate-x-1/2 z-[999] flex flex-col items-center gap-3 pointer-events-none">

    <!-- Log panel (slides up when active) -->
    <Transition name="logger">
      <div
        v-if="uiStore.isAdminLoggerOpen"
        class="w-[500px] max-w-[calc(100vw-2rem)] bg-neutral-900 border border-emerald-500/40 rounded-xl shadow-2xl shadow-emerald-900/20 flex flex-col overflow-hidden pointer-events-auto"
      >
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-neutral-800 px-3 py-2 bg-emerald-900/20 gap-2 flex-wrap">
          <h3 class="text-emerald-400 text-[10px] font-black tracking-widest uppercase flex items-center gap-1.5 shrink-0">
            <Settings2 class="w-3 h-3" />
            MIDI LOGGER
          </h3>
          <div class="flex items-center gap-1.5 flex-wrap">
            <select
              v-model="selectedInputId"
              class="bg-black border border-neutral-800 text-[10px] text-neutral-300 px-1.5 py-1 rounded max-w-[150px] truncate focus:outline-none focus:border-emerald-500/50"
            >
              <option value="" disabled>Select port…</option>
              <option v-for="i in inputs" :key="i.id" :value="i.id">{{ i.name }}</option>
            </select>
            <button
              @click="refreshInputs"
              class="text-neutral-500 hover:text-emerald-400 p-1 rounded border border-neutral-800 transition-colors"
              title="Refresh MIDI ports"
            >
              <RefreshCw class="w-3 h-3" />
            </button>
            <span class="w-px h-4 bg-neutral-800 shrink-0" />
            <label class="flex items-center gap-1 text-[10px] text-neutral-400 cursor-pointer hover:text-emerald-400 transition-colors">
              <input type="checkbox" v-model="filterNoteOn" class="accent-emerald-500 w-3 h-3" />
              Hide Notes
            </label>
            <span class="w-px h-4 bg-neutral-800 shrink-0" />
            <label class="flex items-center gap-1 text-[10px] cursor-pointer transition-colors"
              :class="isFrozen ? 'text-amber-400' : 'text-neutral-400 hover:text-amber-400'"
            >
              <input type="checkbox" v-model="isFrozen" class="accent-amber-500 w-3 h-3" />
              Freeze
            </label>
            <span class="w-px h-4 bg-neutral-800 shrink-0" />
            <button @click="logs = []" class="text-neutral-500 hover:text-rose-500 p-1 rounded transition-colors" title="Clear">
              <Trash2 class="w-3 h-3" />
            </button>
            <button @click="uiStore.isAdminLoggerOpen = false" class="text-neutral-500 hover:text-white p-1 transition-colors" title="Close">
              <X class="w-3 h-3" />
            </button>
          </div>
        </div>

        <!-- No inputs warning -->
        <div v-if="inputs.length === 0" class="px-3 py-1.5 bg-yellow-950/20 border-b border-yellow-900/30">
          <p class="text-yellow-500/80 text-[10px] font-mono flex items-center gap-1">
            No MIDI inputs found. Connect a device and click
            <RefreshCw class="inline w-2.5 h-2.5 mx-0.5" />.
          </p>
        </div>

        <!-- Frozen badge -->
        <div v-if="isFrozen" class="px-3 py-1 bg-amber-950/20 border-b border-amber-900/30 flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
          <span class="text-[10px] font-mono text-amber-400 uppercase tracking-widest">Log frozen</span>
        </div>

        <!-- Log output -->
        <div class="h-60 overflow-y-auto font-mono text-[10px] leading-tight bg-black p-2 custom-scrollbar">
          <div
            v-for="(log, i) in logs"
            :key="i"
            :class="['mb-0.5 px-1 whitespace-pre-wrap break-all', logClass(log)]"
          >{{ log }}</div>
          <span v-if="logs.length === 0" class="text-neutral-600 italic px-1">
            {{ selectedInputId ? 'Waiting for MIDI messages on selected port…' : 'Select a MIDI input port above.' }}
          </span>
          <div ref="logEndRef" />
        </div>

        <!-- Footer -->
        <div class="px-3 py-1.5 border-t border-neutral-800 flex items-center justify-between bg-black/40">
          <span class="text-[9px] font-mono text-neutral-600 uppercase tracking-widest">
            {{ logs.length }} / 500 entries
          </span>
          <span v-if="selectedInputId" class="flex items-center gap-1 text-[9px] font-mono"
            :class="isFrozen ? 'text-amber-500' : 'text-emerald-500'"
          >
            <span class="w-1.5 h-1.5 rounded-full shrink-0"
              :class="isFrozen ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'"
            />
            {{ isFrozen ? 'FROZEN' : 'LISTENING' }}
          </span>
        </div>
      </div>
    </Transition>

    <!-- Persistent FAB button -->
    <!-- <button
      @click="uiStore.isAdminLoggerOpen = !uiStore.isAdminLoggerOpen"
      :class="[
        'pointer-events-auto p-3 rounded-full shadow-lg border transition-all',
        uiStore.isAdminLoggerOpen
          ? 'bg-emerald-500 text-black border-emerald-400 shadow-emerald-500/30'
          : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-emerald-500 hover:border-emerald-500/50'
      ]"
      title="MIDI Logger"
    >
      <Settings2 class="w-5 h-5" />
    </button> -->
  </div>
</template>

<style scoped>
.logger-enter-active,
.logger-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.logger-enter-from,
.logger-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
