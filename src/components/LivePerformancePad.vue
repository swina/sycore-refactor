<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import {
  X, Minus, Trash2, Play, Pause, SkipBack, SkipForward,
  BookOpen, ListMusic, Save, FolderOpen, Check,
  Volume2, VolumeX, Cpu, Music, AudioLines
} from 'lucide-vue-next'
import { useMidiStore }       from '@/stores/useMidiStore'
import { usePresetStore }     from '@/stores/usePresetStore'
import { useLivePadStore }    from '@/stores/useLivePadStore'
import { useMappingStore }    from '@/stores/useMappingStore'
import { useSyncStore }       from '@/stores/useSyncStore'
import { useUiStore }         from '@/stores/useUiStore'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'
import { useDeviceRegistry }  from '@/composables/useDeviceRegistry'
import { midiService }        from '@/core/midi/MidiService'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import PlaylistPadGrid from '@/components/PlaylistPadGrid.vue'
import PlayList        from '@/components/PlayList.vue'

const props = defineProps({ isOpen: Boolean })
const emit  = defineEmits(['close'])

const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront } = useDraggableResizable({
  storageKey: 'SYCORE_POS_LIVE_PERF',
  minimizeLabel: 'Live Performance',
  initialWidth: 900,
  initialHeight: 700,
  zIndex: 100,
})
watch(() => props.isOpen, (v) => { if (v) bringToFront() })

const midiStore    = useMidiStore()
const presetStore  = usePresetStore()
const livePadStore = useLivePadStore()
const mappingStore = useMappingStore()
const syncStore    = useSyncStore()
const uiStore      = useUiStore()
const { openMenu } = useMidiContextMenu()
const { devices: registeredDevices } = useDeviceRegistry()

const syncRecordAudioCapture = computed({
  get: () => syncStore.syncRecordAudioCapture,
  set: (v) => { syncStore.syncRecordAudioCapture = v },
})

// ── localStorage ─────────────────────────────────────────────────
const LS_PC_SETS        = 'SYCORE_PC_PERFORMANCE_SETS'
const LS_LPP_SETS       = 'SYCORE_LPP_SETS'
const LS_LPP_SNAPSHOTS  = 'SYCORE_LPP_SNAPSHOTS'
const LS_LPP_MIX        = 'SYCORE_LPP_MIX'

function getLS(key, def) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def } catch { return def }
}
function setLS(key, val) { try { localStorage.setItem(key, JSON.stringify(val)) } catch {} }

// ── Performance Sets (saved from MidiDeviceProgramChangePanel) ────
const pcSets = ref([])

const emptySetPad = () => ({ setId: null, setName: null })

// ── 16 Performance Set pads (two rows of 8) ───────────────────────
const setPads = ref(Array(16).fill(null).map(emptySetPad))

// ── Active visual state (in store for controller LED feedback) ────
const activePerfSetIdx = computed({
  get: () => livePadStore.activePerfSetIdx,
  set: v => { livePadStore.activePerfSetIdx = v }
})

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
    setPads: JSON.parse(JSON.stringify(setPads.value)),
  }
  lppSnapshots.value = [entry, ...lppSnapshots.value]
  setLS(LS_LPP_SNAPSHOTS, lppSnapshots.value)
  activeSnapshotId.value = entry.id
  newSnapshotName.value = ''
  showSnapshotDialog.value = false
}

function recallSnapshot(snap) {
  const pads = JSON.parse(JSON.stringify(snap.setPads ?? []))
  // migrate old 8-item snapshots to 16
  while (pads.length < 16) pads.push(emptySetPad())
  setPads.value = pads.slice(0, 16)
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
    setPads:   JSON.parse(JSON.stringify(setPads.value)),
    updatedAt: new Date().toISOString(),
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

// ── Recall Performance Set ────────────────────────────────────────
function recallSet(set) {
  if (!set) return
  if (set.midiChannel) midiStore.setMidiChannel(set.midiChannel)
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
  midiStore.outputs.forEach(port => {
    for (let ch = 0; ch < 16; ch++) port.send([0xB0 | ch, 123, 0])
  })
  activePerfSetIdx.value = idx
  recallSet(set)
}

// ── Assignment helpers ────────────────────────────────────────────
function assignSetPad(idx, setId) {
  const set = setId ? pcSets.value.find(s => s.id === setId) : null
  setPads.value[idx] = set ? { setId: set.id, setName: set.name } : emptySetPad()
  persistPads()
}

function clearSetPad(idx) {
  setPads.value[idx] = emptySetPad()
  if (activePerfSetIdx.value === idx) activePerfSetIdx.value = -1
  persistPads()
}

function persistPads() {
  setLS(LS_LPP_SETS, setPads.value)
}

// ── Playlist controls (same event bus as LiveSet/BackingTrackPlayer) ──
function playFromPlaylist(idx) {
  const pl = livePadStore.playlist
  window.dispatchEvent(new CustomEvent('playlist-play', {
    detail: { idx, crossfade: true, ...(pl.length > 0 ? { playlist: pl } : {}) }
  }))
}
function clearPlaylist()        { window.dispatchEvent(new CustomEvent('playlist-clear')) }
function mutatePlaylist(k, v)   { window.dispatchEvent(new CustomEvent('playlist-mutate', { detail: { key: k, value: v } })) }
function prevTrack()            { window.dispatchEvent(new CustomEvent('playlist-prev')) }
function nextTrack()            { window.dispatchEvent(new CustomEvent('playlist-next')) }
function handlePlaylistToggle(idx) {
  if (typeof idx === 'number') {
    playFromPlaylist(idx)
  } else {
    // Ensure BTP has the playlist before toggling play
    const pl = livePadStore.playlist
    if (pl.length > 0 && !isPlaying.value)
      window.dispatchEvent(new CustomEvent('playlist-mutate', { detail: { key: 'playlist', value: pl } }))
    window.dispatchEvent(new CustomEvent('playlist-play-stop'))
  }
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
  if (d.playlist !== undefined) {
    if (d.playlist.length > 0) {
      livePadStore.playlist = d.playlist
    } else if (livePadStore.playlist.length > 0) {
      // BTP started empty (app restart); push persisted playlist back to it
      nextTick(() => {
        window.dispatchEvent(new CustomEvent('playlist-mutate', { detail: { key: 'playlist', value: livePadStore.playlist } }))
        if (livePadStore.playlistRepeats.length > 0)
          window.dispatchEvent(new CustomEvent('playlist-mutate', { detail: { key: 'playlistRepeats', value: livePadStore.playlistRepeats } }))
      })
    }
  }
  if (d.playlistRepeats !== undefined && d.playlistRepeats.length > 0) livePadStore.playlistRepeats = d.playlistRepeats
  if (d.crossfadeSec  !== undefined) livePadStore.crossfadeSec  = d.crossfadeSec
  if (d.loopPlaylist  !== undefined) livePadStore.loopPlaylist   = d.loopPlaylist
  if (d.playlistCurrentRepeat !== undefined) livePadStore.playlistCurrentRepeat = d.playlistCurrentRepeat
  if (d.totalPlaylistDuration !== undefined) totalPlaylistDuration.value = d.totalPlaylistDuration
}

// ── Volume Mix ────────────────────────────────────────────────────
// Only devices that are in the routing config AND are not controllers
const volumeDevices = computed(() => {
  const regs = midiStore.routingConfig?.registrations ?? {}
  return registeredDevices.value.filter(d =>
    (d.type === 'audio-interface' ||
     d.type === 'instrument-single' ||
     d.type === 'instrument-multi') &&
    !!regs[d.name]
  )
})

// Storage key: for multitimbral devices it includes the current channel so each
// part stores its own vol/cc independently. Single/audio-interface: just the name.
function mixKey(name) {
  const dev = registeredDevices.value.find(d => d.name === name)
  return dev?.type === 'instrument-multi'
    ? `${name}:${midiStore.midiChannel}`
    : name
}

// { mixKey: { vol: 0–127, cc: 0–127 } }
const mixState = ref(getLS(LS_LPP_MIX, {}))

function getMix(name) {
  return mixState.value[mixKey(name)] ?? { vol: 100, cc: 7, mute: false }
}

// ── Mute — wraps port.send to block Note On/Off while muted ──────
const _mutedPorts = new Map() // deviceName → original send fn

function _applyMuteWrap(name) {
  const port = midiStore.outputs.find(o => o.name === name)
  if (!port || _mutedPorts.has(name)) return
  const orig = port.send.bind(port)
  _mutedPorts.set(name, { port, orig })
  port.send = (data, ts) => {
    const type = data[0] & 0xF0
    if (type === 0x90 || type === 0x80) return
    orig(data, ts)
  }
}

function _removeMuteWrap(name) {
  const entry = _mutedPorts.get(name)
  if (!entry) return
  entry.port.send = entry.orig
  _mutedPorts.delete(name)
}

function toggleMute(name) {
  const next = !getMix(name).mute
  setMixField(name, 'mute', next)
  if (next) {
    // Silence device immediately across all channels
    const port = midiStore.outputs.find(o => o.name === name)
    if (port) {
      for (let ch = 0; ch < 16; ch++) port.send([0xB0 | ch, 123, 0])
    }
    _applyMuteWrap(name)
  } else {
    _removeMuteWrap(name)
  }
}

function setMixField(name, field, value) {
  const key = mixKey(name)
  mixState.value = { ...mixState.value, [key]: { ...getMix(name), [field]: value } }
  setLS(LS_LPP_MIX, mixState.value)
  if (field === 'vol') sendMixCC(name)
}

function sendMixCC(name) {
  const port = midiStore.outputs.find(o => o.name === name)
  if (!port) return
  const reg = midiStore.routingConfig?.registrations?.[name]
  const dev = registeredDevices.value.find(d => d.name === name)
  const ch  = dev?.type === 'instrument-multi'
    ? midiStore.midiChannel - 1
    : (reg?.outChannel != null && reg.outChannel >= 0) ? reg.outChannel : 0
  const { vol, cc } = getMix(name)
  const ccVal  = Math.min(127, cc)
  const volVal = Math.min(127, Math.round(vol))
  console.log(`[LPP Mix] ${name} | MIDI CH${ch + 1} (byte=${ch}) | CC${ccVal} = ${volVal}`)
  port.send([0xB0 | ch, ccVal, volVal])
}

// ── Init ──────────────────────────────────────────────────────────
function loadState() {
  pcSets.value       = getLS(LS_PC_SETS, [])
  lppSnapshots.value = getLS(LS_LPP_SNAPSHOTS, [])
  const saved = getLS(LS_LPP_SETS, null)
  if (Array.isArray(saved)) {
    // migrate old 8-item saves to 16
    const pads = [...saved]
    while (pads.length < 16) pads.push(emptySetPad())
    setPads.value = pads.slice(0, 16)
  }
}

// ── MIDI trigger listener for lpp_* mapped pads ───────────────────
let _unsubLppMidi = null

function _startLppMidiListener() {
  _unsubLppMidi = midiService.addRawListener((event) => {
    if (!event.data || event.data.length < 3) return
    const status  = event.data[0]
    const type    = status & 0xF0
    const channel = status & 0x0F
    const byte1   = event.data[1]
    const byte2   = event.data[2]

    const isCC   = type === 0xB0
    const isNote = type === 0x90 && byte2 > 0
    if (!isCC && !isNote) return

    const inputId   = event.target?.id
    const inputPort = midiService.getInputs().find(i => i.id === inputId)
    const device    = inputPort?.name || null

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
      if (isCC && byte2 === 0) return
      const idx = parseInt(paramName.slice('lpp_set_'.length))
      if (!isNaN(idx)) triggerSetPad(idx)
    } else if (paramName.startsWith('lpp_bt_')) {
      if (isCC && byte2 === 0) return
      const idx = parseInt(paramName.slice('lpp_bt_'.length))
      if (!isNaN(idx)) playFromPlaylist(idx)
    } else if (paramName.startsWith('lpp_mix_')) {
      if (!isCC) return
      const devName = paramName.slice('lpp_mix_'.length)
      setMixField(devName, 'vol', byte2)
    } else if (paramName === 'lpp_playstop') {
      if (isCC && byte2 === 0) return
      handlePlaylistToggle()
    }
  })
}

function _onTimelinePerfSet(e) {
  const idx = e.detail?.idx
  if (typeof idx === 'number' && idx >= 0 && idx < 16) triggerSetPad(idx)
}

function _onTimelineLoadPerfSet(e) {
  const setId = e.detail?.setId
  if (!setId) return
  // Refresh sets from storage to ensure latest data
  pcSets.value = getLS(LS_PC_SETS, [])
  const set = pcSets.value.find(s => s.id === setId)
  if (set) {
    activePerfSetIdx.value = -1
    recallSet(set)
  }
}

onMounted(() => {
  loadState()
  window.addEventListener('player-state-sync', handleStateUpdate)
  window.addEventListener('timeline-trigger-perf-set', _onTimelinePerfSet)
  window.addEventListener('timeline-load-perf-set', _onTimelineLoadPerfSet)
  window.dispatchEvent(new CustomEvent('player-state-request'))
  _startLppMidiListener()
  // Reapply any mutes that were persisted from a previous session
  volumeDevices.value.forEach(dev => {
    if (getMix(dev.name).mute) _applyMuteWrap(dev.name)
  })
})

onUnmounted(() => {
  window.removeEventListener('player-state-sync', handleStateUpdate)
  window.removeEventListener('timeline-trigger-perf-set', _onTimelinePerfSet)
  window.removeEventListener('timeline-load-perf-set', _onTimelineLoadPerfSet)
  if (_unsubLppMidi) _unsubLppMidi()
  // Restore all wrapped ports so mute doesn't outlive the component
  _mutedPorts.forEach(({ port, orig }) => { port.send = orig })
  _mutedPorts.clear()
})

// Reapply mutes when outputs come online (e.g. device reconnect)
watch(() => midiStore.outputs, () => {
  volumeDevices.value.forEach(dev => {
    if (getMix(dev.name).mute) _applyMuteWrap(dev.name)
  })
}, { deep: false })

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
  <div v-show="isOpen">
    <div class="bg-neutral-950 border border-neutral-900 rounded-2xl overflow-hidden flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.8)]" :style="panelStyle" v-show="!isMinimized">

    <!-- ── Header ── -->
    <div class="px-6 py-2 border-b border-violet-900 flex items-center shrink-0 bg-gradient-to-r from-violet-950/40 backdrop-blur-md cursor-grab active:cursor-grabbing select-none" @mousedown="onDragStart">
      <div class="flex items-center gap-8">
        <div class="flex flex-col">
          
          <div class="flex">
              <ListMusic class="w-5 h-5 text-violet-400 mr-2" />
              <h2 class="text-sm font-black uppercase tracking-[0.3em] text-violet-400">Live Set</h2></div>
          <span class="text-[9px] font-mono text-neutral-600 uppercase tracking-widest">PC Sets · Backing Tracks</span>
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
      <div class="flex items-center gap-1">
        <button @click="toggleMinimize" title="Minimize"
          class="p-1 rounded-lg hover:bg-neutral-800 text-neutral-600 hover:text-yellow-400 transition-colors">
          <Minus class="w-4 h-4" />
        </button>
        <button @click="emit('close')" class="text-neutral-600 hover:text-white transition-colors p-1">
          <X class="w-5 h-5" />
        </button>
      </div>
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

      <!-- Row 1: Performance Sets (pads 1–8) -->
      <div class="shrink-0">
        <div class="flex items-center gap-3 mb-2">
          <BookOpen class="w-3.5 h-3.5 text-violet-400/50 shrink-0" />
          <span class="text-[10px] font-black text-neutral-500 uppercase tracking-[0.25em] font-mono whitespace-nowrap">Performance Sets</span>
          <div class="h-px flex-1 bg-neutral-900" />
          <span class="text-[8px] font-mono text-neutral-700 shrink-0">{{ pcSets.length }} saved</span>
        </div>
        <div class="grid grid-cols-8 gap-2">
          <button
            v-for="(pad, idx) in setPads.slice(0, 8)" :key="'ps-' + idx"
            @click="triggerSetPad(idx)"
            @contextmenu.prevent="openMenu($event, { name: 'lpp_set_' + idx, label: pad.setName || 'Set Pad ' + (idx + 1) })"
            :class="[
              'h-16 rounded-xl border-2 bg-neutral-900 flex flex-col items-center justify-center p-2 gap-0.5 transition-all relative overflow-hidden',
              pad.setId
                ? activePerfSetIdx === idx
                  ? 'bg-violet-700 border-violet-400 text-white shadow-[0_0_15px_rgba(139,92,246,0.6)]'
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

      <!-- Row 2: Performance Sets (pads 9–16) -->
      <div class="shrink-0">
        <div class="flex items-center gap-3 mb-2">
          <BookOpen class="w-3.5 h-3.5 text-violet-400/30 shrink-0" />
          <span class="text-[10px] font-black text-neutral-600 uppercase tracking-[0.25em] font-mono whitespace-nowrap">Performance Sets B</span>
          <div class="h-px flex-1 bg-neutral-900" />
        </div>
        <div class="grid grid-cols-8 gap-2">
          <button
            v-for="(pad, i) in setPads.slice(8, 16)" :key="'ps-' + (i + 8)"
            @click="triggerSetPad(i + 8)"
            @contextmenu.prevent="openMenu($event, { name: 'lpp_set_' + (i + 8), label: pad.setName || 'Set Pad ' + (i + 9) })"
            :class="[
              'h-16 rounded-xl border-2 flex flex-col items-center justify-center p-2 gap-0.5 transition-all relative overflow-hidden',
              pad.setId
                ? activePerfSetIdx === (i + 8)
                  ? 'bg-violet-500 border-violet-400 text-black shadow-[0_0_15px_rgba(139,92,246,0.6)]'
                  : 'border-violet-500/50 text-violet-300 hover:bg-violet-500/20 hover:border-violet-400/70'
                : 'border border-neutral-800 text-neutral-700 cursor-default hover:border-neutral-700'
            ]"
            :title="pad.setId ? `Recall: ${pad.setName}` : 'Assign in Setup → Performance Sets'"
          >
            <span v-if="mappingStore.learningParamName === 'lpp_set_' + (i + 8)" class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)] animate-pulse z-50 pointer-events-none" />
            <div v-if="activePerfSetIdx === (i + 8)" class="absolute inset-0 bg-white/10 animate-pulse pointer-events-none" />
            <span class="text-[10px] font-black uppercase tracking-tight leading-none text-center truncate w-full px-1 z-10">
              {{ pad.setName || `— ${i + 9} —` }}
            </span>
            <span v-if="pad.setId" class="text-[7px] font-mono uppercase tracking-widest opacity-50 z-10">SET</span>
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

      <!-- Volume Mix -->
      <div v-if="volumeDevices.length > 0" class="shrink-0">
        <div class="flex items-center gap-3 mb-2">
          <Volume2 class="w-3.5 h-3.5 text-emerald-500/50 shrink-0" />
          <span class="text-[10px] font-black text-neutral-500 uppercase tracking-[0.25em] font-mono whitespace-nowrap">Volume Mix</span>
          <div class="h-px flex-1 bg-neutral-900" />
          <span class="text-[8px] font-mono text-neutral-700 shrink-0">right-click to MIDI map</span>
        </div>
        <div class="grid gap-1.5">
          <div
            v-for="dev in volumeDevices"
            :key="dev.id"
            @contextmenu.prevent="openMenu($event, { name: 'lpp_mix_' + dev.name, label: dev.name + ' Volume' })"
            class="flex items-center gap-3 bg-neutral-900/40 border border-neutral-800/40 rounded-xl px-3 py-2 relative cursor-context-menu"
          >
            <!-- MIDI learn orange dot -->
            <span
              v-if="mappingStore.learningParamName === 'lpp_mix_' + dev.name"
              class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)] animate-pulse z-50 pointer-events-none"
            />
            <!-- Mute button -->
            <button
              @click.stop="toggleMute(dev.name)"
              :class="[
                'shrink-0 w-7 h-7 rounded-lg border flex items-center justify-center transition-all',
                getMix(dev.name).mute
                  ? 'bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30'
                  : 'border-neutral-700 text-neutral-600 hover:border-neutral-500 hover:text-neutral-400'
              ]"
              :title="getMix(dev.name).mute ? 'Unmute — click to re-enable MIDI notes' : 'Mute — block MIDI notes to this device'"
            >
              <VolumeX v-if="getMix(dev.name).mute" class="w-3.5 h-3.5" />
              <Volume2 v-else class="w-3.5 h-3.5" />
            </button>
            <!-- Online dot + type icon -->
            <div class="flex items-center gap-1.5 shrink-0">
              <div :class="['w-1.5 h-1.5 rounded-full', dev.online ? 'bg-emerald-500' : 'bg-neutral-700']" />
              <component
                :is="dev.type === 'audio-interface' ? Cpu : Music"
                :class="['w-3 h-3', dev.type === 'audio-interface' ? 'text-amber-400/70' : 'text-emerald-400/70']"
              />
            </div>
            <!-- Name + part badge for multitimbral -->
            <div class="flex items-center gap-1.5 w-28 shrink-0 min-w-0">
              <span class="text-[10px] font-bold text-neutral-300 truncate" :title="dev.name">{{ dev.name }}</span>
              <span
                v-if="dev.type === 'instrument-multi'"
                class="shrink-0 text-[7px] font-black px-1 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30 leading-none"
              >CH{{ midiStore.midiChannel }}</span>
            </div>
            <!-- Slider -->
            <input
              type="range"
              min="0"
              max="127"
              :value="getMix(dev.name).vol"
              @input="e => setMixField(dev.name, 'vol', parseInt(e.target.value))"
              :disabled="!dev.online || getMix(dev.name).mute"
              :class="[
                'flex-1 h-1 rounded appearance-none cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed',
                getMix(dev.name).mute ? 'accent-red-500 bg-red-900/30' : 'accent-emerald-500 bg-neutral-800'
              ]"
            />
            <!-- Volume value -->
            <span :class="['text-[9px] font-mono w-7 text-right shrink-0', getMix(dev.name).mute ? 'text-red-500/50 line-through' : 'text-emerald-400']">
              {{ getMix(dev.name).vol }}
            </span>
            <!-- CC# picker -->
            <div class="flex items-center gap-1 shrink-0 ml-1 border-l border-neutral-800 pl-2">
              <span class="text-[8px] font-mono text-neutral-600 uppercase">CC</span>
              <input
                type="number"
                min="0"
                max="127"
                :value="getMix(dev.name).cc"
                @change="e => setMixField(dev.name, 'cc', Math.min(127, Math.max(0, parseInt(e.target.value) || 0)))"
                class="w-9 bg-black border border-neutral-700 rounded px-1 py-0.5 text-center text-[9px] font-mono text-violet-300 outline-none focus:border-violet-500"
              />
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- ── Performance footer player ── -->
    <div v-if="tab === 'perf'"
      :class="[
        'shrink-0 border-t border-neutral-900 flex items-center justify-between px-8 py-2 transition-all duration-500 relative overflow-hidden',
        syncRecordAudioCapture && isPlaying
          ? 'bg-red-950/60'
          : syncRecordAudioCapture
            ? 'bg-black/60'
            : 'bg-black/60'
      ]"
    >
      <!-- Audio capture sync background pulse -->
      <div
        v-if="syncRecordAudioCapture && isPlaying"
        class="absolute inset-0 pointer-events-none"
        style="background: radial-gradient(ellipse at center, rgba(239,68,68,0.08) 0%, transparent 70%); animation: rec-pulse 2s ease-in-out infinite;"
      />

      <div class="flex flex-col gap-0.5 relative z-10">
        <span class="text-[8px] font-mono text-neutral-600 uppercase tracking-widest">Total</span>
        <span class="text-xs font-black text-neutral-300 font-mono">{{ formatTime(totalPlaylistDuration) }}</span>
      </div>
      <div class="flex items-center gap-6 relative z-10">
        <button @click="prevTrack" class="p-2 text-neutral-500 hover:text-white transition-colors active:scale-90">
          <SkipBack class="w-5 h-5" />
        </button>
        <!-- Play/Stop button with MIDI learn support -->
        <div class="relative">
          <span
            v-if="mappingStore.learningParamName === 'lpp_playstop'"
            class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)] animate-pulse z-50 pointer-events-none"
          />
          <button
            @click="handlePlaylistToggle"
            @contextmenu.prevent="openMenu($event, { name: 'lpp_playstop', label: 'Play / Stop' })"
            :class="[
              'w-10 h-10 rounded-full text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all',
              syncRecordAudioCapture && isPlaying
                ? 'bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.6)]'
                : 'bg-violet-500 shadow-[0_0_20px_rgba(139,92,246,0.3)]'
            ]"
          >
            <Pause v-if="isPlaying" class="w-5 h-5 fill-current" />
            <Play  v-else           class="w-5 h-5 fill-current translate-x-0.5" />
          </button>
        </div>
        <button @click="nextTrack" class="p-2 text-neutral-500 hover:text-white transition-colors active:scale-90">
          <SkipForward class="w-5 h-5" />
        </button>
      </div>
      <div class="flex flex-col items-end gap-0.5 relative z-10">
        <div class="flex items-center gap-1.5 mb-0.5">
        <!-- Audio capture sync toggle -->
        <div
          class="flex items-center gap-1.5 mb-0.5 cursor-pointer select-none"
          @click="syncRecordAudioCapture = !syncRecordAudioCapture"
        >
          <span
            :class="[
              'w-1.5 h-1.5 rounded-full transition-all duration-300',
              syncRecordAudioCapture && isPlaying ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)] animate-pulse'
              : syncRecordAudioCapture ? 'bg-red-500/60'
              : 'bg-neutral-700'
            ]"
          />
          <span :class="[
            'text-[11px] font-mono uppercase tracking-widest transition-colors duration-300',
            syncRecordAudioCapture && isPlaying ? 'text-red-400'
            : syncRecordAudioCapture ? 'text-red-500/60 hover:text-red-400'
            : 'text-neutral-600 hover:text-neutral-500'
          ]">REC SYNC</span>
        </div>
        <!--- Open Audio Capture-->
        <div v-if="syncRecordAudioCapture && !isPlaying" @click="uiStore.isAudioCaptureOpen = true" class="cursor-pointer text-synth-cyan text-mono text-xs uppercase text-[9px]">
          <AudioLines title="Audio Capture" class="w-5 h-5" />
        </div>
        <!-- <span class="text-[8px] font-mono text-neutral-600 uppercase tracking-widest" :class="syncRecordAudioCapture?'text-red-500':''">{{ syncRecordAudioCapture ? 'ON' : 'OFF' }}  </span> -->
        </div>
        <span class="text-xs font-black text-violet-400 font-mono">{{ playlistIdx >= 0 ? `#${playlistIdx + 1} ${playlist[playlistIdx]?.label || ''}` : 'IDLE' }}</span>
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

      <!-- Performance Sets assignment (16 pads) -->
      <div v-if="setupTab === 'sets'" class="grid grid-cols-2 gap-4 overflow-y-auto custom-scrollbar p-6 space-y-2">
        <p class="col-span-2 text-[9px] font-mono text-neutral-600 mb-4 leading-relaxed">
          Assign a saved Performance Set to each of the 16 pads. Click the pad in Performance mode to instantly recall all device PC states in that set.
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
          <!-- <span v-if="pad.setId" class="text-[9px] font-mono text-violet-400/60 truncate max-w-[120px]">{{ pad.setName }}</span> -->
          <button v-if="pad.setId" @click="clearSetPad(idx)"
            class="shrink-0 p-1.5 rounded-lg text-neutral-600 hover:text-red-400 hover:bg-red-500/10 transition-all">
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>
        <p v-if="pcSets.length === 0" class="text-[10px] font-mono text-neutral-700 pt-4 italic text-center">
          No performance sets saved yet — save one in the Device Program Change panel.
        </p>
      </div>

      <!-- Snapshots list -->
      <div v-if="setupTab === 'snapshots'" class="flex-1 overflow-y-auto custom-scrollbar p-6">
        <div class="flex items-center justify-between mb-4">
          <p class="text-[9px] font-mono text-neutral-600 leading-relaxed">
            Save and recall complete pad layouts — all 16 Performance Set assignments.
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
              {{ snap.setPads?.filter(p => p.setId).length ?? 0 }} sets
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

      <!-- resize handles -->
      <div @mousedown.stop="e => onResizeStart(e, 'n')"  class="absolute top-0    left-3 right-3 h-1   cursor-n-resize  z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 's')"  class="absolute bottom-0 left-3 right-3 h-1   cursor-s-resize  z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'e')"  class="absolute top-3 bottom-3 right-0  w-1   cursor-e-resize  z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'w')"  class="absolute top-3 bottom-3 left-0   w-1   cursor-w-resize  z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'ne')" class="absolute top-0    right-0  w-3 h-3 cursor-ne-resize z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'nw')" class="absolute top-0    left-0   w-3 h-3 cursor-nw-resize z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'sw')" class="absolute bottom-0 left-0   w-3 h-3 cursor-sw-resize z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'se')" class="absolute bottom-1 right-1  w-3 h-3 cursor-se-resize z-50 opacity-40 hover:opacity-80" style="background:radial-gradient(circle,#aaa 1px,transparent 1px) 0 0/3px 3px" />
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
@keyframes rec-pulse {
  0%, 100% { opacity: 0.4; }
  50%       { opacity: 1; }
}
</style>
