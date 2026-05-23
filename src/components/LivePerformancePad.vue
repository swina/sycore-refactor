<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  X, Trash2, Play, Pause, SkipBack, SkipForward,
  BookOpen, Disc3, ListMusic, Layers
} from 'lucide-vue-next'
import { useMidiStore }    from '@/stores/useMidiStore'
import { usePresetStore }  from '@/stores/usePresetStore'
import { useLivePadStore } from '@/stores/useLivePadStore'
import PlaylistPadGrid from '@/components/PlaylistPadGrid.vue'
import PlayList        from '@/components/PlayList.vue'

const props = defineProps({ isOpen: Boolean })
const emit  = defineEmits(['close'])

const midiStore    = useMidiStore()
const presetStore  = usePresetStore()
const livePadStore = useLivePadStore()

// ── localStorage ─────────────────────────────────────────────────
const LS_PC_SETS   = 'SYCORE_PC_PERFORMANCE_SETS'
const LS_LPP_SETS  = 'SYCORE_LPP_SETS'
const LS_LPP_DEVPC = 'SYCORE_LPP_DEVICE_PC'

function getLS(key, def) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def } catch { return def }
}
function setLS(key, val) { try { localStorage.setItem(key, JSON.stringify(val)) } catch {} }

// ── Performance Sets (saved from MidiDeviceProgramChangePanel) ────
const pcSets = ref([])

const emptySetPad = () => ({ setId: null, setName: null })
const emptyDevPad = () => ({ deviceName: null, channel: 0, program: 0, soundName: '' })

// ── Row 1: Performance Set pads (8) ──────────────────────────────
const setPads = ref(Array(8).fill(null).map(emptySetPad))

// ── Row 2: Device PC pads (8) ────────────────────────────────────
const devicePcPads = ref(Array(8).fill(null).map(emptyDevPad))

// ── Active visual state ───────────────────────────────────────────
const activePerfSetIdx  = ref(-1)
const activeDevicePcIdx = ref(-1)

// ── Tabs ──────────────────────────────────────────────────────────
const tab      = ref('perf')
const setupTab = ref('sets')

// ── Playlist / Backing Tracks (shared with LiveSet via livePadStore) ──
const playlist              = computed(() => livePadStore.playlist)
const playlistIdx           = computed(() => livePadStore.playlistIdx)
const playlistRepeats       = computed(() => livePadStore.playlistRepeats)
const playlistCurrentRepeat = computed(() => livePadStore.playlistCurrentRepeat)
const crossfadeSec          = computed(() => livePadStore.crossfadeSec)
const loopPlaylist          = computed(() => livePadStore.loopPlaylist)
const currentTime           = ref(0)
const duration              = ref(0)
const isPlaying             = ref(false)
const volume                = ref(0.5)
const totalPlaylistDuration = ref(0)
const isPlaylistMode        = computed(() => playlistIdx.value >= 0 && playlist.value.length > 0)

const totalCurrentTime = computed(() => {
  if (playlistIdx.value < 0 || !playlist.value.length) return 0
  let elapsed = 0
  for (let i = 0; i < playlistIdx.value; i++) elapsed += playlist.value[i]?.duration || 0
  return elapsed + currentTime.value
})
const totalProgressPct = computed(() =>
  totalPlaylistDuration.value > 0
    ? Math.min(100, (totalCurrentTime.value / totalPlaylistDuration.value) * 100)
    : 0
)

// ── Output devices ────────────────────────────────────────────────
const outputDevices = computed(() => midiStore.outputs?.map(o => o.name) ?? [])

// ── Recall Performance Set ────────────────────────────────────────
function recallSet(set) {
  if (!set) return
  set.devices.forEach(entry => {
    if (!midiStore.routingConfig?.registrations?.[entry.deviceName]) return
    midiStore.updateRegistration(entry.deviceName, 'pcChannel',  entry.pcChannel)
    midiStore.updateRegistration(entry.deviceName, 'pcBank',     entry.pcBank)
    midiStore.updateRegistration(entry.deviceName, 'pcProgram',  entry.pcProgram)
    midiStore.updateRegistration(entry.deviceName, 'pcChannels', JSON.parse(JSON.stringify(entry.pcChannels)))
    if (entry.isUiDevice) {
      if (entry.lastPresetId) {
        const preset = presetStore.history.find(p => p.id === entry.lastPresetId)
        if (preset) presetStore.recallPreset(preset, false)
      }
    } else {
      const port = midiStore.outputs.find(o => o.name === entry.deviceName)
      if (!port) return
      const multi = Object.entries(entry.pcChannels)
      if (multi.length > 0) {
        multi.forEach(([chStr, info]) => {
          const ch = parseInt(chStr)
          port.send([0xB0 | ch, 0,  0])
          port.send([0xB0 | ch, 32, 0])
          port.send([0xC0 | ch, info.program ?? 0])
        })
      } else {
        const ch = entry.pcChannel ?? 0
        port.send([0xB0 | ch, 0,  0])
        port.send([0xB0 | ch, 32, 0])
        port.send([0xC0 | ch, entry.pcProgram ?? 0])
      }
    }
  })
}

// ── Pad triggers ──────────────────────────────────────────────────
function triggerSetPad(idx) {
  const pad = setPads.value[idx]
  if (!pad?.setId) return
  const set = pcSets.value.find(s => s.id === pad.setId)
  if (!set) return
  activePerfSetIdx.value = idx
  recallSet(set)
}

function triggerDevicePcPad(idx) {
  const pad = devicePcPads.value[idx]
  if (!pad?.deviceName) return
  const port = midiStore.outputs.find(o => o.name === pad.deviceName)
  if (!port) return
  const ch = pad.channel ?? 0
  port.send([0xB0 | ch, 0,  0])
  port.send([0xB0 | ch, 32, 0])
  port.send([0xC0 | ch, Math.max(0, Math.min(127, pad.program ?? 0))])
  activeDevicePcIdx.value = idx
}

// ── Assignment helpers ────────────────────────────────────────────
function assignSetPad(idx, setId) {
  const set = setId ? pcSets.value.find(s => s.id === setId) : null
  setPads.value[idx] = set ? { setId: set.id, setName: set.name } : emptySetPad()
  persistPads()
}

function updateDevicePcPad(idx, field, value) {
  devicePcPads.value[idx] = { ...devicePcPads.value[idx], [field]: value }
  persistPads()
}

function clearSetPad(idx) {
  setPads.value[idx] = emptySetPad()
  if (activePerfSetIdx.value === idx) activePerfSetIdx.value = -1
  persistPads()
}

function clearDevicePcPad(idx) {
  devicePcPads.value[idx] = emptyDevPad()
  if (activeDevicePcIdx.value === idx) activeDevicePcIdx.value = -1
  persistPads()
}

function persistPads() {
  setLS(LS_LPP_SETS,   setPads.value)
  setLS(LS_LPP_DEVPC,  devicePcPads.value)
}

// ── Playlist controls (same event bus as LiveSet/BackingTrackPlayer) ──
function playFromPlaylist(idx) { window.dispatchEvent(new CustomEvent('playlist-play',  { detail: { idx } })) }
function clearPlaylist()        { window.dispatchEvent(new CustomEvent('playlist-clear')) }
function mutatePlaylist(k, v)   { window.dispatchEvent(new CustomEvent('playlist-mutate', { detail: { key: k, value: v } })) }
function prevTrack()            { window.dispatchEvent(new CustomEvent('playlist-prev')) }
function nextTrack()            { window.dispatchEvent(new CustomEvent('playlist-next')) }
function handlePlaylistToggle(idx) {
  typeof idx === 'number'
    ? playFromPlaylist(idx)
    : window.dispatchEvent(new CustomEvent('playlist-play-stop'))
}
function seekTrack(pos)   { window.dispatchEvent(new CustomEvent('playlist-seek',   { detail: pos })) }
function updateVolume(v)  { volume.value = v; window.dispatchEvent(new CustomEvent('playlist-volume', { detail: v })) }

function handleStateUpdate(e) {
  const d = e.detail
  if (d.currentTime   !== undefined) currentTime.value   = d.currentTime
  if (d.duration      !== undefined) duration.value      = d.duration
  if (d.isPlaying     !== undefined) isPlaying.value     = d.isPlaying
  if (d.volume        !== undefined) volume.value        = d.volume
  if (d.playlistIdx   !== undefined) livePadStore.playlistIdx   = d.playlistIdx
  if (d.playlist      !== undefined) livePadStore.playlist      = d.playlist
  if (d.playlistRepeats !== undefined) livePadStore.playlistRepeats = d.playlistRepeats
  if (d.crossfadeSec  !== undefined) livePadStore.crossfadeSec  = d.crossfadeSec
  if (d.loopPlaylist  !== undefined) livePadStore.loopPlaylist   = d.loopPlaylist
  if (d.playlistCurrentRepeat !== undefined) livePadStore.playlistCurrentRepeat = d.playlistCurrentRepeat
  if (d.totalPlaylistDuration !== undefined) totalPlaylistDuration.value = d.totalPlaylistDuration
}

// ── Init ──────────────────────────────────────────────────────────
function loadState() {
  pcSets.value = getLS(LS_PC_SETS, [])
  const savedSets  = getLS(LS_LPP_SETS,  null)
  const savedDevPc = getLS(LS_LPP_DEVPC, null)
  if (Array.isArray(savedSets)  && savedSets.length  === 8) setPads.value      = savedSets
  if (Array.isArray(savedDevPc) && savedDevPc.length === 8) devicePcPads.value = savedDevPc
}

onMounted(() => {
  loadState()
  window.addEventListener('player-state-sync', handleStateUpdate)
  window.dispatchEvent(new CustomEvent('player-state-request'))
})

onUnmounted(() => {
  window.removeEventListener('player-state-sync', handleStateUpdate)
})

// Refresh PC sets list and sync pad names when panel opens
watch(() => props.isOpen, (open) => {
  if (!open) return
  pcSets.value = getLS(LS_PC_SETS, [])
  setPads.value = setPads.value.map(pad => {
    if (!pad.setId) return pad
    const set = pcSets.value.find(s => s.id === pad.setId)
    return set ? { setId: set.id, setName: set.name } : emptySetPad()
  })
})

// ── Helpers ───────────────────────────────────────────────────────
function formatTime(t) {
  if (isNaN(t) || !isFinite(t)) return '0:00'
  const m = Math.floor(t / 60); const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
</script>

<template>
  <div v-if="isOpen"
    class="fixed z-[500] bg-neutral-950 border border-neutral-900 rounded-2xl top-[100px] bottom-[60px] left-1/2 -translate-x-1/2 w-full max-w-4xl flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden transition-all duration-300"
  >

    <!-- ── Header ── -->
    <div class="px-6 py-2 border-b border-neutral-900 flex items-center shrink-0 bg-black/40 backdrop-blur-md">
      <div class="flex items-center gap-8">
        <div class="flex flex-col">
          <h2 class="text-sm font-black uppercase tracking-[0.3em] text-violet-400">Live Performance</h2>
          <span class="text-[9px] font-mono text-neutral-600 uppercase tracking-widest">PC Sets · Device PC · Backing Tracks</span>
        </div>
        <nav class="flex items-center gap-6 ml-4">
          <button @click="tab = 'perf'"
            :class="['relative py-1 text-[11px] font-black uppercase tracking-[0.2em] transition-all',
              tab === 'perf' ? 'text-white' : 'text-neutral-600 hover:text-neutral-400']">
            Performance
            <div v-if="tab === 'perf'" class="absolute -bottom-[9px] left-0 w-full h-[2px] bg-violet-500 shadow-[0_0_10px_rgba(139,92,246,0.8)]" />
          </button>
          <button @click="tab = 'setup'"
            :class="['relative py-1 text-[11px] font-black uppercase tracking-[0.2em] transition-all',
              tab === 'setup' ? 'text-white' : 'text-neutral-600 hover:text-neutral-400']">
            Setup
            <div v-if="tab === 'setup'" class="absolute -bottom-[9px] left-0 w-full h-[2px] bg-violet-500/50" />
          </button>
        </nav>
      </div>
      <div class="flex-1" />
      <button @click="emit('close')" class="text-neutral-600 hover:text-white transition-colors">
        <X class="w-5 h-5" />
      </button>
    </div>

    <!-- ══ PERFORMANCE TAB ══ -->
    <div v-if="tab === 'perf'" class="flex-1 flex flex-col min-h-0 px-5 pt-4 pb-2 gap-4 overflow-y-auto custom-scrollbar">

      <!-- Row 1: Performance Sets -->
      <div class="shrink-0">
        <div class="flex items-center gap-3 mb-2">
          <BookOpen class="w-3.5 h-3.5 text-violet-400/50 shrink-0" />
          <span class="text-[10px] font-black text-neutral-500 uppercase tracking-[0.25em] font-mono whitespace-nowrap">Performance Sets</span>
          <div class="h-px flex-1 bg-neutral-900" />
          <span class="text-[8px] font-mono text-neutral-700 shrink-0">{{ pcSets.length }} saved</span>
        </div>
        <div class="grid grid-cols-8 gap-2">
          <button
            v-for="(pad, idx) in setPads" :key="'ps-' + idx"
            @click="triggerSetPad(idx)"
            :class="[
              'h-16 rounded-xl border-2 flex flex-col items-center justify-center p-2 gap-0.5 transition-all relative overflow-hidden',
              pad.setId
                ? activePerfSetIdx === idx
                  ? 'bg-violet-500 border-violet-400 text-black shadow-[0_0_15px_rgba(139,92,246,0.6)]'
                  : 'border-violet-500/50 text-violet-300 hover:bg-violet-500/20 hover:border-violet-400/70'
                : 'border-dashed border-neutral-800 text-neutral-700 cursor-default hover:border-neutral-700'
            ]"
            :title="pad.setId ? `Recall: ${pad.setName}` : 'Assign in Setup → Performance Sets'"
          >
            <div v-if="activePerfSetIdx === idx" class="absolute inset-0 bg-white/10 animate-pulse pointer-events-none" />
            <span class="text-[10px] font-black uppercase tracking-tight leading-none text-center truncate w-full px-1 z-10">
              {{ pad.setName || `— ${idx + 1} —` }}
            </span>
            <span v-if="pad.setId" class="text-[7px] font-mono uppercase tracking-widest opacity-50 z-10">SET</span>
          </button>
        </div>
      </div>

      <!-- Row 2: Device PC -->
      <div class="shrink-0">
        <div class="flex items-center gap-3 mb-2">
          <Disc3 class="w-3.5 h-3.5 text-sky-400/50 shrink-0" />
          <span class="text-[10px] font-black text-neutral-500 uppercase tracking-[0.25em] font-mono whitespace-nowrap">Device Program Change</span>
          <div class="h-px flex-1 bg-neutral-900" />
        </div>
        <div class="grid grid-cols-8 gap-2">
          <button
            v-for="(pad, idx) in devicePcPads" :key="'dp-' + idx"
            @click="triggerDevicePcPad(idx)"
            :class="[
              'h-16 rounded-xl border-2 flex flex-col items-center justify-center p-2 gap-0.5 transition-all relative overflow-hidden',
              pad.deviceName
                ? activeDevicePcIdx === idx
                  ? 'bg-sky-500 border-sky-400 text-black shadow-[0_0_15px_rgba(14,165,233,0.6)]'
                  : 'border-sky-500/50 text-sky-300 hover:bg-sky-500/20 hover:border-sky-400/70'
                : 'border-dashed border-neutral-800 text-neutral-700 cursor-default hover:border-neutral-700'
            ]"
            :title="pad.deviceName ? `${pad.deviceName} · CH${pad.channel + 1} · PC${pad.program}` : 'Assign in Setup → Device PC'"
          >
            <div v-if="activeDevicePcIdx === idx" class="absolute inset-0 bg-white/10 animate-pulse pointer-events-none" />
            <span class="text-[10px] font-black uppercase tracking-tight leading-none text-center truncate w-full px-1 z-10">
              {{ pad.soundName || (pad.deviceName ? `PC ${pad.program}` : `— ${idx + 1} —`) }}
            </span>
            <span v-if="pad.deviceName" class="text-[7px] font-mono uppercase tracking-widest opacity-50 truncate w-full text-center z-10">
              {{ pad.deviceName.split(' ').slice(0, 2).join(' ') }}
            </span>
          </button>
        </div>
      </div>

      <!-- Rows 3-4: Backing Tracks (PlaylistPadGrid) -->
      <div class="shrink-0">
        <div class="flex items-center gap-3 mb-2">
          <ListMusic class="w-3.5 h-3.5 text-neutral-500 shrink-0" />
          <span class="text-[10px] font-black text-neutral-500 uppercase tracking-[0.25em] font-mono whitespace-nowrap">Backing Tracks</span>
          <div class="h-px flex-1 bg-neutral-900" />
          <span class="text-[8px] font-mono text-neutral-700 shrink-0">{{ playlist.length }}/16 slots</span>
        </div>
        <PlaylistPadGrid
          :playlist="playlist"
          :playlist-idx="playlistIdx"
          :is-playing="isPlaying"
          :current-time="currentTime"
          @play="playFromPlaylist"
          @prev="prevTrack"
          @next="nextTrack"
          @togglePlay="handlePlaylistToggle"
        />
      </div>

    </div>

    <!-- ── Performance footer player ── -->
    <div v-if="tab === 'perf'" class="shrink-0 bg-black/60 border-t border-neutral-900 flex items-center justify-between px-8 py-2">
      <div class="flex flex-col gap-0.5">
        <span class="text-[8px] font-mono text-neutral-600 uppercase tracking-widest">Total</span>
        <span class="text-xs font-black text-neutral-300 font-mono">{{ formatTime(totalPlaylistDuration) }}</span>
      </div>
      <div class="flex items-center gap-6">
        <button @click="prevTrack" class="p-2 text-neutral-500 hover:text-white transition-colors active:scale-90">
          <SkipBack class="w-5 h-5" />
        </button>
        <button @click="handlePlaylistToggle"
          class="w-10 h-10 rounded-full bg-violet-500 text-black flex items-center justify-center shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:scale-105 active:scale-95 transition-all"
        >
          <Pause v-if="isPlaying" class="w-5 h-5 fill-current" />
          <Play  v-else           class="w-5 h-5 fill-current translate-x-0.5" />
        </button>
        <button @click="nextTrack" class="p-2 text-neutral-500 hover:text-white transition-colors active:scale-90">
          <SkipForward class="w-5 h-5" />
        </button>
      </div>
      <div class="flex flex-col items-end gap-0.5">
        <span class="text-[8px] font-mono text-neutral-600 uppercase tracking-widest">Active</span>
        <span class="text-xs font-black text-violet-400 font-mono">{{ playlistIdx >= 0 ? `#${playlistIdx + 1}` : 'IDLE' }}</span>
      </div>
    </div>

    <!-- Playlist progress bar -->
    <div v-if="tab === 'perf' && totalPlaylistDuration > 0" class="h-1 bg-neutral-900 w-full shrink-0 relative">
      <div class="absolute inset-y-0 left-0 bg-violet-500 shadow-[0_0_10px_rgba(139,92,246,0.4)] transition-all duration-300"
        :style="{ width: `${totalProgressPct}%` }" />
    </div>

    <!-- ══ SETUP TAB ══ -->
    <div v-if="tab === 'setup'" class="flex-1 flex flex-col overflow-hidden">

      <!-- Setup subtabs -->
      <div class="flex gap-1 border-b border-neutral-900 px-6 pt-1 shrink-0">
        <button
          v-for="t in [
            { id: 'sets',      label: 'Performance Sets', icon: BookOpen },
            { id: 'device-pc', label: 'Device PC',        icon: Disc3 },
            { id: 'playlist',  label: 'Playlist',         icon: ListMusic },
          ]"
          :key="t.id"
          @click="setupTab = t.id"
          :class="['flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-widest transition-colors border-b-2',
            setupTab === t.id
              ? 'text-violet-400 border-violet-500'
              : 'text-neutral-500 border-transparent hover:text-neutral-400']"
        >
          <component :is="t.icon" class="w-3 h-3" />
          {{ t.label }}
        </button>
      </div>

      <!-- Performance Sets assignment -->
      <div v-if="setupTab === 'sets'" class="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-2">
        <p class="text-[9px] font-mono text-neutral-600 mb-4 leading-relaxed">
          Assign a saved Performance Set to each of the 8 pads. Click the pad in Performance mode to instantly recall all device PC states in that set.
        </p>
        <div
          v-for="(pad, idx) in setPads" :key="'su-ps-' + idx"
          class="flex items-center gap-3 bg-neutral-900/40 rounded-xl px-4 py-3 border border-neutral-800/40"
        >
          <span class="text-[11px] font-black font-mono text-violet-400/50 w-5 shrink-0">{{ idx + 1 }}</span>
          <select
            :value="pad.setId || ''"
            @change="e => assignSetPad(idx, e.target.value || null)"
            class="flex-1 appearance-none bg-black border border-neutral-700 rounded-lg px-3 py-2 text-[11px] text-neutral-300 font-mono outline-none focus:border-violet-500/50 cursor-pointer"
          >
            <option value="" class="bg-black">— Unassigned —</option>
            <option v-for="s in pcSets" :key="s.id" :value="s.id" class="bg-black">
              {{ s.name }} ({{ s.devices?.length ?? 0 }} device{{ s.devices?.length !== 1 ? 's' : '' }})
            </option>
          </select>
          <span v-if="pad.setId" class="text-[9px] font-mono text-violet-400/60 truncate max-w-[120px]">{{ pad.setName }}</span>
          <button v-if="pad.setId" @click="clearSetPad(idx)"
            class="shrink-0 p-1.5 rounded-lg text-neutral-600 hover:text-red-400 hover:bg-red-500/10 transition-all">
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>
        <p v-if="pcSets.length === 0" class="text-[10px] font-mono text-neutral-700 pt-4 italic text-center">
          No performance sets saved yet — save one in the Device Program Change panel.
        </p>
      </div>

      <!-- Device PC assignment -->
      <div v-if="setupTab === 'device-pc'" class="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-2">
        <p class="text-[9px] font-mono text-neutral-600 mb-4 leading-relaxed">
          Assign a device, MIDI channel, and program number to each pad. Clicking the pad in Performance mode immediately sends the Program Change.
        </p>
        <div
          v-for="(pad, idx) in devicePcPads" :key="'su-dp-' + idx"
          class="flex items-center gap-2 bg-neutral-900/40 rounded-xl px-4 py-3 border border-neutral-800/40"
        >
          <span class="text-[11px] font-black font-mono text-sky-400/50 w-5 shrink-0">{{ idx + 1 }}</span>

          <!-- Label -->
          <input
            :value="pad.soundName"
            @input="e => updateDevicePcPad(idx, 'soundName', e.target.value)"
            type="text" placeholder="Label…" maxlength="20"
            class="w-24 shrink-0 bg-black border border-neutral-700 rounded-lg px-2 py-1.5 text-[11px] text-white font-mono outline-none focus:border-sky-500/50 placeholder:text-neutral-700"
          />

          <!-- Device -->
          <select
            :value="pad.deviceName || ''"
            @change="e => updateDevicePcPad(idx, 'deviceName', e.target.value || null)"
            class="flex-1 min-w-0 appearance-none bg-black border border-neutral-700 rounded-lg px-2 py-1.5 text-[11px] text-neutral-300 font-mono outline-none focus:border-sky-500/50 cursor-pointer"
          >
            <option value="" class="bg-black">— Device —</option>
            <option v-for="d in outputDevices" :key="d" :value="d" class="bg-black">{{ d }}</option>
          </select>

          <!-- Channel -->
          <select
            :value="pad.channel"
            @change="e => updateDevicePcPad(idx, 'channel', parseInt(e.target.value))"
            class="w-[72px] shrink-0 appearance-none bg-black border border-neutral-700 rounded-lg px-2 py-1.5 text-[11px] text-neutral-300 font-mono outline-none focus:border-sky-500/50 cursor-pointer"
          >
            <option v-for="ch in 16" :key="ch" :value="ch - 1" class="bg-black">CH {{ ch }}</option>
          </select>

          <!-- Program -->
          <div class="flex items-center gap-1 shrink-0">
            <span class="text-[8px] font-mono text-neutral-600 uppercase">PC</span>
            <input
              :value="pad.program"
              @input="e => updateDevicePcPad(idx, 'program', Math.max(0, Math.min(127, parseInt(e.target.value) || 0)))"
              type="number" min="0" max="127"
              class="w-12 bg-black border border-neutral-700 rounded-lg px-2 py-1.5 text-[11px] text-center text-sky-300 font-mono outline-none focus:border-sky-500/50"
            />
          </div>

          <!-- Clear -->
          <button v-if="pad.deviceName" @click="clearDevicePcPad(idx)"
            class="shrink-0 p-1.5 rounded-lg text-neutral-600 hover:text-red-400 hover:bg-red-500/10 transition-all">
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <!-- Playlist setup (reuses PlayList component exactly as LiveSet does) -->
      <div v-if="setupTab === 'playlist'" class="flex-1 overflow-y-auto custom-scrollbar p-4">
        <PlayList
          :playlist="playlist"
          :playlistRepeats="playlistRepeats"
          :playlistIdx="playlistIdx"
          :playlistCurrentRepeat="playlistCurrentRepeat"
          :crossfadeSec="crossfadeSec"
          :loopPlaylist="loopPlaylist"
          :is-playlist-mode="isPlaylistMode"
          :current-time="currentTime"
          :duration="duration"
          :total-playlist-duration="totalPlaylistDuration"
          :is-playing="isPlaying"
          :volume="volume"
          @update:playlist="v => mutatePlaylist('playlist', v)"
          @update:playlistRepeats="v => mutatePlaylist('playlistRepeats', v)"
          @update:playlistIdx="v => mutatePlaylist('playlistIdx', v)"
          @update:playlistCurrentRepeat="v => mutatePlaylist('playlistCurrentRepeat', v)"
          @update:crossfadeSec="v => mutatePlaylist('crossfadeSec', v)"
          @update:loopPlaylist="v => mutatePlaylist('loopPlaylist', v)"
          @play="playFromPlaylist"
          @clear="clearPlaylist"
          @seek="seekTrack"
          @prev="prevTrack"
          @next="nextTrack"
          @togglePlay="handlePlaylistToggle"
          @update:volume="updateVolume"
        />
      </div>

    </div>

  </div>
</template>
