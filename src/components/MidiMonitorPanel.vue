<script setup>
import { ref, computed, shallowRef, onMounted, onUnmounted, nextTick, watch } from 'vue'
import {
  Activity, Pause, Play, Square, Trash2, Download, X, ChevronDown, ChevronUp
} from 'lucide-vue-next'

const props = defineProps({ embedded: { type: Boolean, default: false } })
import { midiService } from '@/core/midi/MidiService'
import { useMappingStore } from '@/stores/useMappingStore'
import { useUiStore } from '@/stores/useUiStore'

const uiStore       = useUiStore()
const mappingStore  = useMappingStore()

// ─── Filter state ─────────────────────────────────────────────────────────────
const direction      = ref('both')   // 'in' | 'out' | 'both'
const monitoring     = ref(false)    // false = stopped (default); true = listener attached
const paused         = ref(false)    // display-only pause while monitoring
const searchText     = ref('')
const showFilters    = ref(false)
const filterDevice   = ref('all')
const filterChannel  = ref(0)        // 0 = All

const typeFilter = ref({
  noteon:    true,
  noteoff:   true,
  cc:        true,
  pc:        true,
  pitchbend: true,
  start:     true,
  stop:      true,
  sysex:     false,
  clock:     false,
  other:     false,
})

// ─── Log buffer ───────────────────────────────────────────────────────────────
let _log = []
const entries    = shallowRef([])
const entryCount = ref(0)
const logEndRef  = ref(null)

// Devices seen — for the filter dropdown
const knownDevices = ref([])

function _appendEntry(entry) {
  if (!monitoring.value || paused.value) return
  knownDevices.value = knownDevices.value.includes(entry.device)
    ? knownDevices.value
    : [...knownDevices.value, entry.device]
  _log = _log.length >= 500 ? [..._log.slice(-499), entry] : [..._log, entry]
  entries.value  = _log
  entryCount.value = _log.length
}

// ─── System log integration ───────────────────────────────────────────────────
function _handleSystemLog(e) {
  if (!uiStore.isMidiMonitorOpen || !monitoring.value) return
  _appendEntry({
    id: Date.now(),
    timestamp: Date.now(),
    direction: 'in',
    device: 'SYSTEM',
    channel: 0,
    type: 'other',
    data: [],
    decoded: e.detail || String(e),
  })
}

// ─── Computed: mapped CCs set (from mapping store) ────────────────────────────
const mappedCCs = computed(() => {
  const s = new Set()
  Object.values(mappingStore.midiMappings).forEach(m => {
    if (typeof m === 'object' && m.cc != null) s.add(m.cc)
  })
  return s
})

// ─── Filtered display list ────────────────────────────────────────────────────
const filteredEntries = computed(() => {
  const q = searchText.value.toLowerCase()
  return entries.value.filter(e => {
    if (direction.value !== 'both' && e.direction !== direction.value) return false
    if (!typeFilter.value[e.type]) return false
    if (filterDevice.value !== 'all' && e.device !== filterDevice.value) return false
    if (filterChannel.value > 0 && e.channel !== filterChannel.value) return false
    if (q && !e.decoded.toLowerCase().includes(q) && !e.device.toLowerCase().includes(q)) return false
    return true
  })
})

// ─── Auto-scroll ──────────────────────────────────────────────────────────────
watch(filteredEntries, async () => {
  await nextTick()
  logEndRef.value?.scrollIntoView({ behavior: 'instant' })
})

// ─── Helpers ──────────────────────────────────────────────────────────────────
function clear() {
  _log = []
  entries.value  = _log
  entryCount.value = 0
  midiService.clearMonitorBuffer()
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(filteredEntries.value, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `midi-monitor-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function rowClass(e) {
  if (e.device === 'SYSTEM') return 'text-indigo-400 italic'
  if (e.type === 'noteon')    return 'text-emerald-400'
  if (e.type === 'noteoff')   return 'text-emerald-700'
  if (e.type === 'cc')        return 'text-cyan-400'
  if (e.type === 'pc')        return 'text-violet-400'
  if (e.type === 'start')     return 'text-yellow-400'
  if (e.type === 'stop')      return 'text-yellow-600'
  if (e.type === 'pitchbend') return 'text-blue-400'
  if (e.type === 'sysex')     return 'text-orange-400'
  if (e.type === 'clock')     return 'text-neutral-600'
  return 'text-neutral-400'
}

function directionBadge(e) {
  return e.direction === 'in' ? '↓' : '↑'
}

function isMapped(e) {
  return e.type === 'cc' && e.data.length >= 2 && mappedCCs.value.has(e.data[1])
}

function fmtTime(ts) {
  return new Date(ts).toISOString().substring(11, 23)
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────
let _unsub = null

// Attach / detach listener based on monitoring state
watch(monitoring, (active) => {
  if (active) {
    _unsub = midiService.addMonitorListener(_appendEntry)
  } else {
    _unsub?.()
    _unsub = null
    paused.value = false
  }
})

onMounted(() => {
  // Listener is NOT attached on mount — user must press Start
  window.addEventListener('app-system-log', _handleSystemLog)
})

onUnmounted(() => {
  _unsub?.()
  window.removeEventListener('app-system-log', _handleSystemLog)
})
</script>

<template>
  <Transition name="monitor">
    <div
      v-if="props.embedded || uiStore.isMidiMonitorOpen"
      :class="props.embedded
        ? 'flex flex-col h-full overflow-hidden'
        : 'fixed bottom-[52px] left-1/2 -translate-x-1/2 z-[998] w-[680px] max-w-[calc(100vw-1rem)] bg-neutral-900 border border-cyan-500/30 rounded-xl shadow-2xl shadow-cyan-900/10 flex flex-col overflow-hidden'"
    >
      <!-- ── Header ──────────────────────────────────────────────────────── -->
      <div class="flex items-center justify-between border-b border-neutral-800 px-3 py-2 bg-cyan-900/10 gap-2 flex-wrap">
        <h3 class="text-cyan-400 text-[10px] font-black tracking-widest uppercase flex items-center gap-1.5 shrink-0">
          <Activity class="w-3 h-3" />
          MIDI MONITOR
        </h3>

        <div class="flex items-center gap-1.5 flex-wrap flex-1 justify-end">

          <!-- Direction toggle -->
          <div class="flex text-[9px] font-mono border border-neutral-700 rounded overflow-hidden">
            <button v-for="d in ['in','both','out']" :key="d"
              @click="direction = d"
              :class="[
                'px-2 py-1 uppercase tracking-wider transition-colors',
                direction === d ? 'bg-cyan-500/20 text-cyan-400' : 'text-neutral-500 hover:text-neutral-300'
              ]"
            >{{ d }}</button>
          </div>

          <!-- Filter toggle -->
          <button @click="showFilters = !showFilters"
            :class="['p-1 rounded border transition-colors text-[10px] flex items-center gap-1',
              showFilters ? 'border-cyan-500/40 text-cyan-400' : 'border-neutral-700 text-neutral-500 hover:text-cyan-400']"
            title="Toggle filters"
          >
            <span class="text-[9px] font-mono uppercase tracking-wider">Filters</span>
            <component :is="showFilters ? ChevronUp : ChevronDown" class="w-3 h-3" />
          </button>

          <!-- Search -->
          <input
            v-model="searchText"
            placeholder="Search…"
            class="bg-black border border-neutral-700 text-[10px] text-neutral-300 px-2 py-1 rounded w-28
                   focus:outline-none focus:border-cyan-500/50 placeholder-neutral-600"
          />

          <span class="w-px h-4 bg-neutral-700 shrink-0" />

          <!-- Start / Stop monitoring -->
          <button @click="monitoring = !monitoring"
            :class="['px-2 py-1 rounded border text-[9px] font-black uppercase tracking-wider flex items-center gap-1 transition-colors',
              monitoring
                ? 'border-rose-500/40 text-rose-400 hover:bg-rose-500/10'
                : 'border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10']"
            :title="monitoring ? 'Stop monitoring' : 'Start monitoring'"
          >
            <component :is="monitoring ? Square : Play" class="w-2.5 h-2.5 fill-current" />
            {{ monitoring ? 'Stop' : 'Start' }}
          </button>

          <!-- Pause / Resume display (only while monitoring) -->
          <button v-if="monitoring" @click="paused = !paused"
            :class="['p-1 rounded border transition-colors',
              paused ? 'border-amber-500/40 text-amber-400' : 'border-neutral-700 text-neutral-500 hover:text-amber-400']"
            :title="paused ? 'Resume display' : 'Pause display'"
          >
            <component :is="paused ? Play : Pause" class="w-3 h-3" />
          </button>

          <!-- Clear -->
          <button @click="clear"
            class="p-1 rounded border border-neutral-700 text-neutral-500 hover:text-rose-500 transition-colors"
            title="Clear log"
          >
            <Trash2 class="w-3 h-3" />
          </button>

          <!-- Export -->
          <button @click="exportJSON"
            class="p-1 rounded border border-neutral-700 text-neutral-500 hover:text-cyan-400 transition-colors"
            title="Export JSON"
          >
            <Download class="w-3 h-3" />
          </button>

          <!-- Close -->
          <button v-if="!props.embedded" @click="uiStore.isMidiMonitorOpen = false"
            class="p-1 text-neutral-500 hover:text-white transition-colors"
            title="Close"
          >
            <X class="w-3 h-3" />
          </button>
        </div>
      </div>

      <!-- ── Filter panel ────────────────────────────────────────────────── -->
      <Transition name="filters">
        <div v-if="showFilters"
          class="border-b border-neutral-800 px-3 py-2 bg-black/40 flex flex-wrap gap-x-4 gap-y-2"
        >
          <!-- Message types -->
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-[9px] text-neutral-500 uppercase tracking-wider shrink-0">Types</span>
            <label v-for="(label, key) in {
              noteon:'Note ON', noteoff:'Note OFF', cc:'CC', pc:'PC',
              pitchbend:'Bend', start:'Start', stop:'Stop', sysex:'SysEx', clock:'Clock', other:'Other'
            }" :key="key"
              class="flex items-center gap-1 text-[9px] font-mono cursor-pointer hover:text-white transition-colors"
              :class="typeFilter[key] ? 'text-neutral-300' : 'text-neutral-600'"
            >
              <input type="checkbox" v-model="typeFilter[key]" class="w-2.5 h-2.5 accent-cyan-500" />
              {{ label }}
            </label>
          </div>

          <!-- Device filter -->
          <div class="flex items-center gap-2">
            <span class="text-[9px] text-neutral-500 uppercase tracking-wider">Device</span>
            <select v-model="filterDevice"
              class="bg-black border border-neutral-700 text-[9px] text-neutral-300 px-1.5 py-0.5 rounded
                     focus:outline-none focus:border-cyan-500/50 max-w-[160px] truncate"
            >
              <option value="all">All</option>
              <option v-for="d in knownDevices" :key="d" :value="d">{{ d }}</option>
            </select>
          </div>

          <!-- Channel filter -->
          <div class="flex items-center gap-2">
            <span class="text-[9px] text-neutral-500 uppercase tracking-wider">Ch</span>
            <select v-model.number="filterChannel"
              class="bg-black border border-neutral-700 text-[9px] text-neutral-300 px-1.5 py-0.5 rounded
                     focus:outline-none focus:border-cyan-500/50 w-14"
            >
              <option :value="0">All</option>
              <option v-for="c in 16" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>
        </div>
      </Transition>

      <!-- ── Stopped banner ────────────────────────────────────────────── -->
      <div v-if="!monitoring" class="px-3 py-1.5 bg-neutral-900/60 border-b border-neutral-800 flex items-center gap-2">
        <Play class="w-3 h-3 text-emerald-400 shrink-0" />
        <span class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest">Monitoring stopped — press <span class="text-emerald-400 font-black">Start</span> to begin capturing MIDI messages</span>
      </div>

      <!-- ── Pause banner ────────────────────────────────────────────────── -->
      <div v-else-if="paused" class="px-3 py-1 bg-amber-950/20 border-b border-amber-900/30 flex items-center gap-1.5">
        <span class="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
        <span class="text-[9px] font-mono text-amber-400 uppercase tracking-widest">Display paused — messages are still captured</span>
      </div>

      <!-- ── Log rows ────────────────────────────────────────────────────── -->
      <div class="h-64 overflow-y-auto font-mono text-[10px] leading-tight bg-black p-2 custom-scrollbar">
        <div
          v-for="e in filteredEntries"
          :key="e.id"
          :class="['mb-px px-1 flex items-baseline gap-1.5 whitespace-nowrap overflow-hidden', rowClass(e)]"
        >
          <!-- Timestamp -->
          <span class="text-neutral-600 shrink-0">{{ fmtTime(e.timestamp) }}</span>
          <!-- Direction badge -->
          <span class="shrink-0" :class="e.direction === 'in' ? 'text-cyan-600' : 'text-violet-600'">
            {{ directionBadge(e) }}
          </span>
          <!-- Device -->
          <span class="text-neutral-500 shrink-0 max-w-[120px] truncate" :title="e.device">{{ e.device }}</span>
          <!-- Message -->
          <span class="truncate flex-1">{{ e.decoded }}</span>
          <!-- Mapped badge -->
          <span v-if="isMapped(e)"
            class="shrink-0 text-[8px] px-1 py-px rounded bg-cyan-900/50 text-cyan-400 border border-cyan-700/40 uppercase tracking-wider"
          >mapped</span>
        </div>

        <span v-if="filteredEntries.length === 0" class="text-neutral-600 italic px-1">
          {{ !monitoring ? 'Press Start to begin logging.' : paused ? 'Display paused.' : 'Waiting for MIDI messages…' }}
        </span>

        <div ref="logEndRef" />
      </div>

      <!-- ── Footer ─────────────────────────────────────────────────────── -->
      <div class="px-3 py-1.5 border-t border-neutral-800 flex items-center justify-between bg-black/40">
        <span class="text-[9px] font-mono text-neutral-600 uppercase tracking-widest">
          {{ filteredEntries.length }} / {{ entryCount }} entries
        </span>
        <span class="flex items-center gap-1 text-[9px] font-mono"
          :class="!monitoring ? 'text-neutral-600' : paused ? 'text-amber-500' : 'text-cyan-500'"
        >
          <span class="w-1.5 h-1.5 rounded-full shrink-0"
            :class="!monitoring ? 'bg-neutral-700' : paused ? 'bg-amber-500' : 'bg-cyan-500 animate-pulse'"
          />
          {{ !monitoring ? 'STOPPED' : paused ? 'PAUSED' : 'LIVE' }}
        </span>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.monitor-enter-active,
.monitor-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.monitor-enter-from,
.monitor-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
.filters-enter-active,
.filters-leave-active {
  transition: opacity 0.1s ease, max-height 0.15s ease;
  overflow: hidden;
  max-height: 200px;
}
.filters-enter-from,
.filters-leave-to {
  opacity: 0;
  max-height: 0;
}
</style>
