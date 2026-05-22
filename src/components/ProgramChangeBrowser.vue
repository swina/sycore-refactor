<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Search, Send, ChevronDown, Music2, AlertTriangle, X, Loader2, Zap, Pencil } from 'lucide-vue-next'
import { useMidiStore } from '@/stores/useMidiStore'
import { useUiStore } from '@/stores/useUiStore'

// ── catalog index ──────────────────────────────────────────────
import catalogIndex from '@/data/program_change/program_change.json'

const midiStore = useMidiStore()
const uiStore   = useUiStore()

// ── Device / bank selectors ─────────────────────────────────────
const selectedDeviceName = computed({
  get: () => uiStore.midiActionsSelectedDevice,
  set: v => { uiStore.midiActionsSelectedDevice = v }
})

const registeredOutputs = computed(() => {
  if (!midiStore.routingConfig?.registrations) return []
  return Object.values(midiStore.routingConfig.registrations)
    .filter(r => r.outEnabled)
    .map(r => ({
      ...r,
      isOnline: midiStore.outputs.some(o => o.name === r.name)
    }))
})

const isDeviceOffline = computed(() => {
  const n = selectedDeviceName.value
  if (!n) return false
  return !midiStore.outputs.some(o => o.name === n)
})

// Derive MIDI channel from registration
const selectedChannel = ref(1)
watch(selectedDeviceName, (n) => {
  if (n && midiStore.routingConfig?.registrations[n]) {
    const reg = midiStore.routingConfig.registrations[n]
    selectedChannel.value = reg.outChannel !== -1 ? reg.outChannel + 1 : midiStore.midiChannel
  } else {
    selectedChannel.value = midiStore.midiChannel
  }
}, { immediate: true })

// ── Catalog state ──────────────────────────────────────────────
// Find which catalog devices match the selected device name (fuzzy)
const catalogDevice = computed(() => {
  const dn = selectedDeviceName.value?.toLowerCase() ?? ''
  if (!dn) return null
  return Object.keys(catalogIndex).find(k => dn.includes(k.toLowerCase()) || k.toLowerCase().includes(dn)) ?? null
})

const availableBanks = computed(() => {
  if (!catalogDevice.value) return []
  return Object.keys(catalogIndex[catalogDevice.value])
})

const selectedBank = ref('')
watch(catalogDevice, () => { selectedBank.value = '' ; sounds.value = [] })

const bankConfig = computed(() => {
  if (!catalogDevice.value || !selectedBank.value) return null
  return catalogIndex[catalogDevice.value][selectedBank.value]
})

// ── Lazy-load sound data ────────────────────────────────────────
const sounds     = ref([])
const isLoading  = ref(false)

watch(selectedBank, async (bank) => {
  if (!bank || !bankConfig.value) { sounds.value = []; return }
  isLoading.value = true
  try {
    // Dynamic import — Vite resolves relative to /src
    const url = bankConfig.value.data.replace(/^\.\//, '/src/data/program_change/' + catalogDevice.value.toLowerCase().replace(/\s+/g, '') + '/')
    // Use Vite glob to load; fall back to fetch
    const data = await loadSoundData(bankConfig.value.data, catalogDevice.value)
    sounds.value = data
  } catch (e) {
    console.error('[ProgramChangeBrowser] Failed to load sounds', e)
    sounds.value = []
  } finally {
    isLoading.value = false
  }
})

async function loadSoundData(relativePath, _deviceName) {
  // Extract folder and filename directly from the data path (e.g. "./seqtrak/awm2_flat.json")
  const match = relativePath.match(/^\.\/([^/]+)\/(.+)$/)
  if (!match) throw new Error(`Unexpected data path format: ${relativePath}`)
  const [, folder, filename] = match
  const res = await fetch(`/src/data/program_change/${folder}/${filename}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ── Filters ─────────────────────────────────────────────────────
const searchQuery     = ref('')
const selectedCategory = ref('')

const categories = computed(() => {
  const cats = [...new Set(sounds.value.map(s => s[bankConfig.value?.category_field ?? 'category']))]
  return cats.filter(Boolean).sort()
})

watch(selectedBank, () => { selectedCategory.value = ''; searchQuery.value = '' })

const filteredSounds = computed(() => {
  let list = sounds.value
  if (selectedCategory.value) {
    const field = bankConfig.value?.category_field ?? 'category'
    list = list.filter(s => s[field] === selectedCategory.value)
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(s => s.name?.toLowerCase().includes(q))
  }
  return list
})

// ── Selected sound & send ───────────────────────────────────────
const activeSound = ref(null)
const lastSent    = ref(null)

function selectSound(sound) {
  if (assignTarget.value !== null) {
    assignPad(assignTarget.value.series, assignTarget.value.pad, sound)
  }
  activeSound.value = sound
  sendProgramChange(sound)
}

function sendProgramChange(sound) {
  const deviceName = selectedDeviceName.value
  if (!deviceName) return
  const port = midiStore.outputs.find(o => o.name === deviceName)
  if (!port) return

  const cfg    = bankConfig.value
  
  const ch     = selectedChannel.value - 1   // 0-based
  const pField = cfg?.program_field ?? 'program'
  const prog   = (sound[pField] ?? 0)         // 0-based in data
  let progNum = prog
  let msb = sound.msb
  let lsb = sound.lsb

  if (progNum >= 128) {
    progNum = progNum % 128
  }
  progNum = Math.max(0, Math.min(127, progNum + cfg.program_base))
  
  if (!cfg.msb ) {
    msb = Math.floor(prog / 128 )
  }
  if (!cfg.lsb){
    lsb = 0
  }
  // console.log ( "msb" , msb , "lsb" , lsb , "prog" , progNum )

  port.send([0xB0 | ch, 0, msb ])
  port.send([0xB0 | ch, 32, lsb ])
  port.send([0xC0 | ch, progNum ])//(prog + cfg.program_base)])
  lastSent.value = sound

  const msg = `[PC Browser] → ${deviceName} ch${selectedChannel.value}: MSB=${sound.msb ?? '-'} LSB=${sound.lsb ?? '-'} PC=${prog} | ${sound.name}`
  if (window.SY_LOG) window.SY_LOG(msg)
  else console.log(msg)

  // After sending Program Change, send the current tempo/clock if clock is active to restore sync
  if (midiStore.sendClock) {
    setTimeout(() => {
      midiStore.startClock()
      const clockMsg = `[MIDI PC] Clock restarted to send current tempo: ${midiStore.currentBpm} BPM`
      if (window.SY_LOG) {
        window.SY_LOG(clockMsg)
      } else {
        console.log(clockMsg)
      }
    }, 100)
  }
}

// ── Manual PC fallback (no catalog match) ────────────────────────
const manualMsb  = ref(0)
const manualLsb  = ref(0)
const manualProg = ref(1)
const sendMsb    = ref(false)
const sendLsb    = ref(false)

function sendManual() {
  const deviceName = selectedDeviceName.value
  if (!deviceName) return
  const port = midiStore.outputs.find(o => o.name === deviceName)
  if (!port) return
  const ch = selectedChannel.value - 1
  if (sendMsb.value) port.send([0xB0 | ch, 0,  manualMsb.value])
  if (sendLsb.value) port.send([0xB0 | ch, 32, manualLsb.value])
  port.send([0xC0 | ch, manualProg.value - 1])
}

// ── Quick-launch pads ────────────────────────────────────────────
// Each pad stores pre-computed MIDI values so it can fire independently.
// null = unassigned slot.
const PADS_KEY = 'SY_PC_PADS'

const defaultSeries = () => [
  { id: 'A', deviceName: '', channel: 1, pads: [null, null, null, null] },
  { id: 'B', deviceName: '', channel: 1, pads: [null, null, null, null] },
]

const padSeries = ref(defaultSeries())

// { series: 0|1, pad: 0..3 } when a pad is waiting to be assigned
const assignTarget = ref(null)

function loadPads() {
  try {
    const stored = localStorage.getItem(PADS_KEY)
    if (stored) padSeries.value = JSON.parse(stored)
  } catch {}
}

function savePads() {
  localStorage.setItem(PADS_KEY, JSON.stringify(padSeries.value))
}

function toggleAssignTarget(seriesIdx, padIdx) {
  const t = assignTarget.value
  assignTarget.value = (t?.series === seriesIdx && t?.pad === padIdx) ? null : { series: seriesIdx, pad: padIdx }
}

function assignPad(seriesIdx, padIdx, sound) {
  const cfg = bankConfig.value
  if (!cfg) return

  const pField = cfg.program_field ?? 'program'
  const prog   = sound[pField] ?? 0
  let progNum  = prog >= 128 ? prog % 128 : prog
  progNum      = Math.max(0, Math.min(127, progNum + cfg.program_base))
  const msb    = cfg.msb ? (sound.msb ?? 0) : Math.floor(prog / 128)
  const lsb    = cfg.lsb ? (sound.lsb ?? 0) : 0

  padSeries.value = padSeries.value.map((s, si) =>
    si === seriesIdx
      ? { ...s, pads: s.pads.map((p, pi) => pi === padIdx ? { name: sound.name, msb, lsb, pc: progNum } : p) }
      : s
  )
  savePads()
  assignTarget.value = null
}

function clearPad(seriesIdx, padIdx) {
  padSeries.value = padSeries.value.map((s, si) =>
    si === seriesIdx
      ? { ...s, pads: s.pads.map((p, pi) => pi === padIdx ? null : p) }
      : s
  )
  savePads()
}

function sendPadPreset(seriesIdx, padIdx) {
  const series = padSeries.value[seriesIdx]
  const pad    = series.pads[padIdx]
  if (!pad) return

  const port = midiStore.outputs.find(o => o.name === series.deviceName)
  if (!port) return

  const ch = series.channel - 1
  port.send([0xB0 | ch, 0,  pad.msb])
  port.send([0xB0 | ch, 32, pad.lsb])
  port.send([0xC0 | ch,     pad.pc])

  const msg = `[PC Pad ${series.id}${padIdx + 1}] → ${series.deviceName} ch${series.channel}: MSB=${pad.msb} LSB=${pad.lsb} PC=${pad.pc} | ${pad.name}`
  if (window.SY_LOG) window.SY_LOG(msg); else console.log(msg)
}

function handlePcPadFire(e) {
  const { series, pad } = e.detail
  sendPadPreset(series === 'A' ? 0 : 1, pad)
}

onMounted(() => {
  loadPads()
  window.addEventListener('pc-pad-fire', handlePcPadFire)
})

onUnmounted(() => {
  window.removeEventListener('pc-pad-fire', handlePcPadFire)
})
</script>

<template>
  <div class="flex flex-col gap-4 h-full">

    <!-- ── Quick-launch Pads ──────────────────────────── -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest">Quick Launch Pads</span>
        <button
          v-if="assignTarget !== null"
          @click="assignTarget = null"
          class="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-amber-400 hover:text-white transition-colors"
        >
          <X class="w-2.5 h-2.5" /> Cancel assign
        </button>
      </div>

      <!-- Assign banner -->
      <div
        v-if="assignTarget !== null"
        class="bg-amber-950/30 border border-amber-500/30 rounded-lg px-3 py-1.5 text-[9px] font-mono text-amber-300 flex items-center gap-2"
      >
        <Pencil class="w-3 h-3 shrink-0" />
        Click a preset below to assign it to
        <strong class="text-amber-200">Pad {{ padSeries[assignTarget.series].id }}{{ assignTarget.pad + 1 }}</strong>
      </div>

      <!-- Series A & B -->
      <div
        v-for="(series, si) in padSeries"
        :key="series.id"
        class="rounded-xl border p-2.5 space-y-2"
        :class="si === 0
          ? 'border-violet-900/50 bg-violet-950/10'
          : 'border-cyan-900/50 bg-cyan-950/10'"
      >
        <!-- Series header: label + device + channel -->
        <div class="flex items-center gap-2">
          <span
            class="text-[8px] font-black uppercase tracking-widest w-4 shrink-0"
            :class="si === 0 ? 'text-violet-400' : 'text-cyan-400'"
          >{{ series.id }}</span>

          <div class="relative flex-1">
            <select
              v-model="series.deviceName"
              @change="savePads()"
              class="w-full appearance-none bg-black/60 border border-neutral-800 rounded-lg px-2 py-1 text-neutral-300 font-mono text-[9px] focus:outline-none pr-5"
              :class="si === 0 ? 'focus:border-violet-600' : 'focus:border-cyan-600'"
            >
              <option value="" class="bg-black">— device —</option>
              <option v-for="d in registeredOutputs" :key="d.name" :value="d.name" class="bg-black">
                {{ d.name }} {{ d.isOnline ? '●' : '○' }}
              </option>
            </select>
            <ChevronDown class="absolute right-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-neutral-600 pointer-events-none" />
          </div>

          <div class="relative shrink-0">
            <select
              v-model.number="series.channel"
              @change="savePads()"
              class="appearance-none bg-black/60 border border-neutral-800 rounded-lg px-2 py-1 text-neutral-400 font-mono text-[9px] focus:outline-none pr-5 w-16"
              :class="si === 0 ? 'focus:border-violet-600' : 'focus:border-cyan-600'"
            >
              <option v-for="ch in 16" :key="ch" :value="ch" class="bg-black">CH {{ ch }}</option>
            </select>
            <ChevronDown class="absolute right-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-neutral-600 pointer-events-none" />
          </div>
        </div>

        <!-- 4 pads -->
        <div class="grid grid-cols-4 gap-1.5">
          <div
            v-for="(pad, pi) in series.pads"
            :key="pi"
            class="relative group"
          >
            <!-- Fire button -->
            <button
              @click="pad ? sendPadPreset(si, pi) : toggleAssignTarget(si, pi)"
              :disabled="!pad && !series.deviceName"
              :class="[
                'w-full rounded-lg border text-center transition-all py-2 px-1',
                assignTarget?.series === si && assignTarget?.pad === pi
                  ? 'border-amber-500/60 bg-amber-950/40 shadow-[0_0_8px_rgba(245,158,11,0.2)]'
                  : pad
                    ? si === 0
                      ? 'border-violet-700/40 bg-violet-950/30 hover:border-violet-500/60 hover:bg-violet-900/30'
                      : 'border-cyan-700/40 bg-cyan-950/30 hover:border-cyan-500/60 hover:bg-cyan-900/30'
                    : 'border-neutral-800/60 bg-black/20 hover:border-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed'
              ]"
            >
              <span class="block text-[7px] font-black uppercase tracking-widest mb-0.5"
                :class="assignTarget?.series === si && assignTarget?.pad === pi
                  ? 'text-amber-400'
                  : si === 0 ? 'text-violet-600' : 'text-cyan-600'"
              >{{ series.id }}{{ pi + 1 }}</span>
              <span
                class="block text-[8px] font-bold leading-tight truncate px-0.5"
                :class="pad
                  ? si === 0 ? 'text-violet-200' : 'text-cyan-200'
                  : 'text-neutral-700'"
              >{{ pad ? pad.name : '+' }}</span>
            </button>

            <!-- Hover controls (assign / clear) -->
            <div class="absolute -top-1.5 -right-1.5 hidden group-hover:flex gap-0.5 z-10">
              <button
                @click.stop="toggleAssignTarget(si, pi)"
                :title="assignTarget?.series === si && assignTarget?.pad === pi ? 'Cancel' : 'Assign preset'"
                :class="[
                  'w-4 h-4 rounded flex items-center justify-center transition-all',
                  assignTarget?.series === si && assignTarget?.pad === pi
                    ? 'bg-amber-500 text-black'
                    : 'bg-neutral-800 text-neutral-400 hover:bg-violet-600 hover:text-white'
                ]"
              ><Pencil class="w-2 h-2" /></button>
              <button
                v-if="pad"
                @click.stop="clearPad(si, pi)"
                title="Clear pad"
                class="w-4 h-4 rounded bg-neutral-800 text-neutral-400 hover:bg-red-600 hover:text-white flex items-center justify-center transition-all"
              ><X class="w-2 h-2" /></button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Device Row ─────────────────────────────────── -->
    <div class="grid grid-cols-2 gap-3">
      <!-- Target Device -->
      <div>
        <label class="block text-[9px] font-mono text-neutral-500 uppercase tracking-widest mb-1">Target Device</label>
        <div class="relative">
          <select
            v-model="selectedDeviceName"
            class="w-full appearance-none bg-black/60 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-300 font-mono text-[11px] focus:border-violet-500/60 outline-none pr-7"
          >
            <option value="" class="bg-black">— select device —</option>
            <option v-for="d in registeredOutputs" :key="d.name" :value="d.name" class="bg-black">
              {{ d.name }} {{ d.isOnline ? '●' : '○' }}
            </option>
          </select>
          <ChevronDown class="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-600 pointer-events-none" />
        </div>
      </div>

      <!-- MIDI Channel -->
      <div>
        <label class="block text-[9px] font-mono text-neutral-500 uppercase tracking-widest mb-1">MIDI Channel</label>
        <div class="relative">
          <select
            v-model.number="selectedChannel"
            class="w-full appearance-none bg-black/60 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-300 font-mono text-[11px] focus:border-violet-500/60 outline-none pr-7"
          >
            <option v-for="ch in 16" :key="ch" :value="ch" class="bg-black">CH {{ ch }}</option>
          </select>
          <ChevronDown class="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-600 pointer-events-none" />
        </div>
      </div>
    </div>

    <!-- Offline warning -->
    <div v-if="isDeviceOffline"
      class="bg-amber-950/30 border border-amber-500/30 rounded-xl px-3 py-2 flex items-center gap-2"
    >
      <AlertTriangle class="w-3.5 h-3.5 text-amber-400 shrink-0" />
      <span class="text-[9px] font-mono text-amber-400">Device offline — messages will not transmit</span>
    </div>

    <!-- ── Catalog Browser ─────────────────────────────── -->
    <template v-if="selectedDeviceName && catalogDevice">

      <!-- Bank selector -->
      <div>
        <label class="block text-[9px] font-mono text-neutral-500 uppercase tracking-widest mb-1">Bank</label>
        <div class="flex gap-2 flex-wrap">
          <button
            v-for="bank in availableBanks"
            :key="bank"
            @click="selectedBank = bank"
            :class="[
              'px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border',
              selectedBank === bank
                ? 'bg-violet-500/20 border-violet-500/40 text-violet-300 shadow-[0_0_8px_rgba(139,92,246,0.15)]'
                : 'bg-black/40 border-neutral-800 text-neutral-500 hover:border-neutral-600 hover:text-neutral-300'
            ]"
          >
            {{ bank }}
          </button>
        </div>
      </div>

      <template v-if="selectedBank">
        <!-- Filters Row -->
        <div class="flex gap-2 items-center">
          <!-- Search -->
          <div class="relative flex-1">
            <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-600" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search presets…"
              class="w-full bg-black/50 border border-neutral-800 rounded-xl pl-7 pr-3 py-1.5 text-[11px] text-neutral-300 font-mono outline-none focus:border-violet-500/50 placeholder:text-neutral-700"
            />
            <button v-if="searchQuery" @click="searchQuery = ''" class="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-600 hover:text-white">
              <X class="w-3 h-3" />
            </button>
          </div>

          <!-- Category filter -->
          <div class="relative">
            <select
              v-model="selectedCategory"
              class="appearance-none bg-black/50 border border-neutral-800 rounded-xl px-3 py-1.5 text-[10px] text-neutral-400 font-mono outline-none focus:border-violet-500/50 pr-6 cursor-pointer"
            >
              <option value="" class="bg-black">All categories</option>
              <option v-for="cat in categories" :key="cat" :value="cat" class="bg-black">{{ cat }}</option>
            </select>
            <ChevronDown class="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-600 pointer-events-none" />
          </div>
        </div>

        <!-- Loading -->
        <div v-if="isLoading" class="flex items-center justify-center py-10 gap-2">
          <Loader2 class="w-5 h-5 text-violet-400 animate-spin" />
          <span class="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Loading catalog…</span>
        </div>

        <!-- Sound List -->
        <div v-else-if="filteredSounds.length > 0" class="flex-1 overflow-y-auto max-h-[45vh] custom-scrollbar space-y-0.5 -mx-1 px-1">
          <!-- Stats bar -->
          <div class="flex items-center justify-between mb-2 px-1">
            <span class="text-[8px] font-mono text-neutral-600 uppercase tracking-widest">{{ filteredSounds.length }} presets</span>
            <span v-if="lastSent" class="flex items-center gap-1 text-[8px] font-mono text-violet-400 uppercase tracking-widest">
              <Zap class="w-2.5 h-2.5" />
              {{ lastSent.name }}
            </span>
          </div>

          <button
            v-for="sound in filteredSounds"
            :key="sound.no ?? sound.name"
            @click="selectSound(sound)"
            :class="[
              'w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all group text-left',
              assignTarget !== null
                ? 'bg-amber-950/10 border-amber-900/30 hover:border-amber-500/50 hover:bg-amber-950/30'
                : activeSound?.no === sound.no && activeSound?.name === sound.name
                  ? 'bg-violet-500/15 border-violet-500/30 shadow-[0_0_10px_rgba(139,92,246,0.1)]'
                  : 'bg-black/20 border-transparent hover:border-neutral-800 hover:bg-white/[0.03]'
            ]"
          >
            <div class="flex items-center gap-2.5 min-w-0">
              <!-- Program number badge -->
              <span
                :class="[
                  'shrink-0 w-7 text-center text-[8px] font-black font-mono rounded px-1 py-0.5',
                  activeSound?.no === sound.no && activeSound?.name === sound.name
                    ? 'bg-violet-500 text-black'
                    : 'bg-neutral-900 text-neutral-600 group-hover:bg-neutral-800 group-hover:text-neutral-400'
                ]"
              >
                {{ sound[bankConfig?.program_field ?? 'program'] ?? 0 }}
              </span>
              <!-- Name -->
              <span
                :class="[
                  'text-[11px] font-medium truncate',
                  activeSound?.no === sound.no && activeSound?.name === sound.name
                    ? 'text-violet-200'
                    : 'text-neutral-400 group-hover:text-neutral-200'
                ]"
              >
                {{ sound.name }}
              </span>
            </div>

            <!-- Category + MSB/LSB badges -->
            <div class="flex items-center gap-1.5 shrink-0 ml-2">
              <span
                v-if="sound[bankConfig?.category_field ?? 'category']"
                class="text-[8px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded bg-neutral-900 text-neutral-500 border border-neutral-800/50"
              >
                {{ sound[bankConfig?.category_field ?? 'category'] }}
              </span>
              <span
                v-if="activeSound?.no === sound.no && activeSound?.name === sound.name"
                class="text-[8px] font-black text-violet-400 uppercase tracking-tighter"
              >
                <Send class="w-2.5 h-2.5" />
              </span>
            </div>
          </button>
        </div>

        <!-- Empty state -->
        <div v-else-if="!isLoading" class="flex flex-col items-center justify-center py-10 gap-2">
          <Music2 class="w-6 h-6 text-neutral-700" />
          <span class="text-[10px] font-mono text-neutral-600">No presets found</span>
        </div>
      </template>

    </template>

    <!-- ── Manual Fallback (no catalog match) ─────────────── -->
    <template v-else-if="selectedDeviceName && !catalogDevice">
      <div class="bg-neutral-900/30 border border-neutral-800 rounded-xl p-4 space-y-4">
        <p class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest">Manual Bank / Program Change</p>

        <div class="grid grid-cols-2 gap-3">
          <!-- MSB -->
          <div class="bg-black/40 border border-neutral-800 rounded-xl p-3 space-y-2">
            <label class="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" v-model="sendMsb" class="w-3.5 h-3.5 accent-violet-500" />
              <span class="text-[9px] font-black uppercase text-neutral-400">Bank MSB (CC 0)</span>
            </label>
            <input
              type="number" min="0" max="127" v-model.number="manualMsb" :disabled="!sendMsb"
              class="w-full bg-black border border-neutral-700 rounded-lg px-3 py-1.5 text-neutral-300 font-mono text-[11px] outline-none focus:border-violet-500 disabled:opacity-30 text-center"
            />
          </div>
          <!-- LSB -->
          <div class="bg-black/40 border border-neutral-800 rounded-xl p-3 space-y-2">
            <label class="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" v-model="sendLsb" class="w-3.5 h-3.5 accent-violet-500" />
              <span class="text-[9px] font-black uppercase text-neutral-400">Bank LSB (CC 32)</span>
            </label>
            <input
              type="number" min="0" max="127" v-model.number="manualLsb" :disabled="!sendLsb"
              class="w-full bg-black border border-neutral-700 rounded-lg px-3 py-1.5 text-neutral-300 font-mono text-[11px] outline-none focus:border-violet-500 disabled:opacity-30 text-center"
            />
          </div>
        </div>

        <!-- Program -->
        <div class="bg-black/40 border border-neutral-800 rounded-xl p-3 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest">Program (1–128)</span>
            <input
              type="number" min="1" max="128" v-model.number="manualProg"
              class="w-14 bg-black border border-neutral-700 rounded px-2 py-0.5 text-center text-violet-300 font-mono text-[11px] focus:border-violet-400 outline-none"
            />
          </div>
          <input
            type="range" min="1" max="128" v-model.number="manualProg"
            class="w-full accent-violet-500 h-1 bg-black rounded-lg cursor-pointer"
          />
        </div>

        <button
          @click="sendManual"
          :disabled="!selectedDeviceName || isDeviceOffline"
          class="w-full bg-violet-500 text-black rounded-xl py-3 font-black tracking-widest uppercase text-[10px] flex items-center justify-center gap-2 hover:bg-violet-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-violet-500/20"
        >
          <Send class="w-3.5 h-3.5" />
          Send Program Change
        </button>
      </div>
    </template>

    <!-- ── Empty device selection state ───────────────────── -->
    <div v-else class="flex flex-col items-center justify-center py-10 gap-3 border-2 border-dashed border-neutral-800/50 rounded-2xl">
      <Music2 class="w-8 h-8 text-neutral-700" />
      <p class="text-[10px] font-mono text-neutral-600 text-center">
        Select a registered MIDI output device<br>to browse its preset catalog
      </p>
    </div>

  </div>
</template>

<style scoped>
.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: #262626 transparent;
}
.custom-scrollbar::-webkit-scrollbar { width: 3px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #262626; border-radius: 10px; }
</style>
