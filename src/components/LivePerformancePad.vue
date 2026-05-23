<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import {
  X, Trash2, Play, Pause, SkipBack, SkipForward,
  BookOpen, Disc3, ListMusic, Layers, Save, FolderOpen, Check
} from 'lucide-vue-next'
import { useMidiStore }    from '@/stores/useMidiStore'
import { usePresetStore }  from '@/stores/usePresetStore'
import { useLivePadStore } from '@/stores/useLivePadStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'
import { midiService }    from '@/core/midi/MidiService'
import PlaylistPadGrid from '@/components/PlaylistPadGrid.vue'
import PlayList        from '@/components/PlayList.vue'

const props = defineProps({ isOpen: Boolean })
const emit  = defineEmits(['close'])

const midiStore    = useMidiStore()
const presetStore  = usePresetStore()
const livePadStore = useLivePadStore()
const mappingStore = useMappingStore()
const { openMenu } = useMidiContextMenu()

// ── localStorage ─────────────────────────────────────────────────
const LS_PC_SETS        = 'SYCORE_PC_PERFORMANCE_SETS'
const LS_LPP_SETS       = 'SYCORE_LPP_SETS'
const LS_LPP_DEVPC      = 'SYCORE_LPP_DEVICE_PC'
const LS_LPP_SNAPSHOTS  = 'SYCORE_LPP_SNAPSHOTS'

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

// ── Active visual state (in store for controller LED feedback) ────
const activePerfSetIdx  = computed({ get: () => livePadStore.activePerfSetIdx,  set: v => { livePadStore.activePerfSetIdx  = v } })
const activeDevicePcIdx = computed({ get: () => livePadStore.activeDevicePcIdx, set: v => { livePadStore.activeDevicePcIdx = v } })

// ── Live Performance Snapshots ────────────────────────────────────
const lppSnapshots        = ref([])
const showSnapshotDialog  = ref(false)
const newSnapshotName     = ref('')
const snapshotNameInput   = ref(null)
const activeSnapshotId    = ref(null)

function saveSnapshot() {
  const name = newSnapshotName.value.trim()
  if (!name) return
  const entry = {
    id: Date.now().toString(),
    name,
    savedAt: new Date().toISOString(),
    setPads:      JSON.parse(JSON.stringify(setPads.value)),
    devicePcPads: JSON.parse(JSON.stringify(devicePcPads.value)),
  }
  lppSnapshots.value = [entry, ...lppSnapshots.value]
  setLS(LS_LPP_SNAPSHOTS, lppSnapshots.value)
  activeSnapshotId.value = entry.id
  newSnapshotName.value = ''
  showSnapshotDialog.value = false
}

function recallSnapshot(snap) {
  setPads.value      = JSON.parse(JSON.stringify(snap.setPads))
  devicePcPads.value = JSON.parse(JSON.stringify(snap.devicePcPads))
  activeSnapshotId.value = snap.id
  persistPads()
}

function deleteSnapshot(id) {
  lppSnapshots.value = lppSnapshots.value.filter(s => s.id !== id)
  if (activeSnapshotId.value === id) activeSnapshotId.value = null
  setLS(LS_LPP_SNAPSHOTS, lppSnapshots.value)
}

const activeSnapshot = computed(() =>
  lppSnapshots.value.find(s => s.id === activeSnapshotId.value) ?? null
)

function updateSnapshot() {
  if (!activeSnapshot.value) return
  const idx = lppSnapshots.value.findIndex(s => s.id === activeSnapshotId.value)
  if (idx === -1) return
  lppSnapshots.value[idx] = {
    ...lppSnapshots.value[idx],
    setPads:      JSON.parse(JSON.stringify(setPads.value)),
    devicePcPads: JSON.parse(JSON.stringify(devicePcPads.value)),
    updatedAt:    new Date().toISOString(),
  }
  setLS(LS_LPP_SNAPSHOTS, lppSnapshots.value)
}

function openSnapshotDialog() {
  showSnapshotDialog.value = true
  newSnapshotName.value = ''
  nextTick(() => snapshotNameInput.value?.focus())
}

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
function playFromPlaylist(idx) { window.dispatchEvent(new CustomEvent('playlist-play',  { detail: { idx, crossfade: true } })) }
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
  pcSets.value      = getLS(LS_PC_SETS, [])
  lppSnapshots.value = getLS(LS_LPP_SNAPSHOTS, [])
  const savedSets  = getLS(LS_LPP_SETS,  null)
  const savedDevPc = getLS(LS_LPP_DEVPC, null)
  if (Array.isArray(savedSets)  && savedSets.length  === 8) setPads.value      = savedSets
  if (Array.isArray(savedDevPc) && savedDevPc.length === 8) devicePcPads.value = savedDevPc
}

// ── MIDI trigger listener for lpp_* mapped pads ───────────────────
let _unsubLppMidi = null

function _startLppMidiListener() {
  _unsubLppMidi = midiService.addRawListener((event) => {
    if (!event.data || event.data.length < 3) return
    const status = event.data[0]
    const type   = status & 0xF0
    const channel = status & 0x0F
    const byte1  = event.data[1]
    const byte2  = event.data[2]

    // Accept CC (any value > 0) or Note On (velocity > 0)
    const isCC   = type === 0xB0 && byte2 > 0
    const isNote = type === 0x90 && byte2 > 0
    if (!isCC && !isNote) return

    const inputId   = event.target?.id
    const inputPort = midiService.getInputs().find(i => i.id === inputId)
    const device    = inputPort?.name || null

    // Build lookup key matching the format used in confirmLearn
    const keyParts = []
    if (device) keyParts.push(device)
    keyParts.push(`CH${channel + 1}`)
    keyParts.push(isNote ? `NOTE${byte1}` : `CC${byte1}`)
    const key = keyParts.join(':')

    const mapping = mappingStore.midiMappings[key]
    if (!mapping) return
    const paramName = typeof mapping === 'object' ? mapping.paramName : mapping
    if (!paramName?.startsWith('lpp_')) return

    if (paramName.startsWith('lpp_set_')) {
      const idx = parseInt(paramName.slice('lpp_set_'.length))
      if (!isNaN(idx)) triggerSetPad(idx)
    } else if (paramName.startsWith('lpp_devpc_')) {
      const idx = parseInt(paramName.slice('lpp_devpc_'.length))
      if (!isNaN(idx)) triggerDevicePcPad(idx)
    } else if (paramName.startsWith('lpp_bt_')) {
      const idx = parseInt(paramName.slice('lpp_bt_'.length))
      if (!isNaN(idx)) playFromPlaylist(idx)
    }
  })
}

onMounted(() => {
  loadState()
  window.addEventListener('player-state-sync', handleStateUpdate)
  window.dispatchEvent(new CustomEvent('player-state-request'))
  _startLppMidiListener()
})

onUnmounted(() => {
  window.removeEventListener('player-state-sync', handleStateUpdate)
  if (_unsubLppMidi) _unsubLppMidi()
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
  <div v-if="isOpen" class="fixed inset-x-0 top-0 bottom-10 z-[500] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
    <div class="bg-neutral-950 border border-neutral-900 rounded-2xl w-full max-w-5xl overflow-hidden flex flex-col h-[90vh] shadow-[0_0_50px_rgba(0,0,0,0.8)]">

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
      <!-- Save buttons — context-aware -->
      <div class="flex items-center gap-2 mr-3">
        <!-- Update active snapshot -->
        <button
          v-if="activeSnapshot"
          @click="updateSnapshot"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-violet-500/50 bg-violet-500/10 text-violet-300 text-[10px] font-black uppercase tracking-widest hover:bg-violet-500/20 hover:border-violet-400 transition-all"
          :title="`Update snapshot: ${activeSnapshot.name}`"
        >
          <Save class="w-3.5 h-3.5" />
          Save
        </button>
        <!-- Save new snapshot -->
        <button
          @click="openSnapshotDialog"
          :class="[
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-all',
            activeSnapshot
              ? 'border-neutral-700 text-neutral-500 hover:border-neutral-500 hover:text-neutral-300'
              : 'border-violet-500/30 text-violet-400 hover:bg-violet-500/10 hover:border-violet-400/50'
          ]"
          title="Save current pad layout as a new snapshot"
        >
          <Save class="w-3.5 h-3.5" />
          {{ activeSnapshot ? 'Save New' : 'Save' }}
        </button>
        <!-- Active snapshot label -->
        <span v-if="activeSnapshot" class="text-[9px] font-mono text-violet-500/70 max-w-[100px] truncate" :title="activeSnapshot.name">
          {{ activeSnapshot.name }}
        </span>
      </div>
      <button @click="emit('close')" class="text-neutral-600 hover:text-white transition-colors">
        <X class="w-5 h-5" />
      </button>
    </div>

    <!-- Snapshot save dialog -->
    <Transition name="fade-down">
      <div v-if="showSnapshotDialog"
        class="absolute top-[60px] right-4 z-20 bg-neutral-900 border border-violet-500/40 rounded-2xl p-4 shadow-2xl w-72"
      >
        <p class="text-[10px] font-black text-violet-400 uppercase tracking-widest mb-3">New Snapshot</p>
        <input
          ref="snapshotNameInput"
          v-model="newSnapshotName"
          type="text"
          placeholder="Snapshot name…"
          maxlength="30"
          @keydown.enter="saveSnapshot"
          @keydown.esc="showSnapshotDialog = false"
          class="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white font-mono outline-none focus:border-violet-500/70 placeholder:text-neutral-700 mb-3"
        />
        <div class="flex gap-2">
          <button
            @click="saveSnapshot"
            :disabled="!newSnapshotName.trim()"
            class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-widest transition-all"
          >
            <Check class="w-3.5 h-3.5" /> Save
          </button>
          <button
            @click="showSnapshotDialog = false"
            class="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 text-xs font-bold transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </Transition>

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
            @contextmenu.prevent="openMenu($event, { name: 'lpp_set_' + idx, label: pad.setName || 'Set Pad ' + (idx + 1) })"
            :class="[
              'h-16 rounded-xl border-2 flex flex-col items-center justify-center p-2 gap-0.5 transition-all relative overflow-hidden',
              pad.setId
                ? activePerfSetIdx === idx
                  ? 'bg-violet-500 border-violet-400 text-black shadow-[0_0_15px_rgba(139,92,246,0.6)]'
                  : 'border-violet-500/50 text-violet-300 hover:bg-violet-500/20 hover:border-violet-400/70'
                : 'border border-neutral-800 text-neutral-700 cursor-default hover:border-neutral-700'
            ]"
            :title="pad.setId ? `Recall: ${pad.setName}` : 'Assign in Setup → Performance Sets'"
          >
            <span v-if="mappingStore.learningParamName === 'lpp_set_' + idx" class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)] animate-pulse z-50 pointer-events-none" />
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
            @contextmenu.prevent="openMenu($event, { name: 'lpp_devpc_' + idx, label: pad.soundName || 'Device PC ' + (idx + 1) })"
            :class="[
              'h-16 rounded-xl border-2 flex flex-col items-center justify-center p-2 gap-0.5 transition-all relative overflow-hidden',
              pad.deviceName
                ? activeDevicePcIdx === idx
                  ? 'bg-sky-500 border-sky-400 text-black shadow-[0_0_15px_rgba(14,165,233,0.6)]'
                  : 'border-sky-500/50 text-sky-300 hover:bg-sky-500/20 hover:border-sky-400/70'
                : 'border border-neutral-800 text-neutral-700 cursor-default hover:border-neutral-700'
            ]"
            :title="pad.deviceName ? `${pad.deviceName} · CH${pad.channel + 1} · PC${pad.program}` : 'Assign in Setup → Device PC'"
          >
            <span v-if="mappingStore.learningParamName === 'lpp_devpc_' + idx" class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)] animate-pulse z-50 pointer-events-none" />
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
          midiMapPrefix="lpp_bt"
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
            { id: 'snapshots', label: 'Snapshots',        icon: FolderOpen },
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

      <!-- Snapshots list -->
      <div v-if="setupTab === 'snapshots'" class="flex-1 overflow-y-auto custom-scrollbar p-6">
        <div class="flex items-center justify-between mb-4">
          <p class="text-[9px] font-mono text-neutral-600 leading-relaxed">
            Save and recall complete pad layouts — both Performance Sets and Device PC assignments.
          </p>
          <button
            @click="openSnapshotDialog"
            class="shrink-0 flex items-center gap-1.5 ml-4 px-3 py-1.5 rounded-lg border border-violet-500/30 text-violet-400 text-[10px] font-black uppercase tracking-widest hover:bg-violet-500/10 hover:border-violet-400/50 transition-all"
          >
            <Save class="w-3 h-3" /> Save current
          </button>
        </div>
        <p v-if="lppSnapshots.length === 0"
          class="text-[10px] font-mono text-neutral-700 italic text-center py-8"
        >
          No snapshots saved yet. Click "Save current" to create one.
        </p>
        <div v-else class="space-y-2">
          <div
            v-for="snap in lppSnapshots"
            :key="snap.id"
            :class="[
              'flex items-center gap-3 rounded-xl px-4 py-3 border transition-all',
              activeSnapshotId === snap.id
                ? 'bg-violet-500/10 border-violet-500/40'
                : 'bg-neutral-900/40 border-neutral-800/40 hover:border-neutral-700/60'
            ]"
          >
            <FolderOpen
              :class="['w-4 h-4 shrink-0', activeSnapshotId === snap.id ? 'text-violet-400' : 'text-neutral-600']"
            />
            <div class="flex-1 min-w-0">
              <p :class="['text-[11px] font-black truncate', activeSnapshotId === snap.id ? 'text-violet-300' : 'text-neutral-300']">
                {{ snap.name }}
              </p>
              <p class="text-[8px] font-mono text-neutral-700 mt-0.5">
                {{ new Date(snap.savedAt).toLocaleString() }}
              </p>
            </div>
            <span class="text-[8px] font-mono text-neutral-600 shrink-0">
              {{ snap.setPads?.filter(p => p.setId).length ?? 0 }}S
              · {{ snap.devicePcPads?.filter(p => p.deviceName).length ?? 0 }}D
            </span>
            <button
              @click="recallSnapshot(snap)"
              class="shrink-0 px-3 py-1 rounded-lg bg-violet-600/20 hover:bg-violet-600/40 text-violet-300 text-[10px] font-black uppercase tracking-wider transition-all"
            >
              Load
            </button>
            <button
              @click="deleteSnapshot(snap.id)"
              class="shrink-0 p-1.5 rounded-lg text-neutral-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>
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
  </div>
</template>

<style scoped>
.fade-down-enter-active, .fade-down-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.fade-down-enter-from, .fade-down-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
