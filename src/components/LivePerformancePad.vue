<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import {
  X, Minus, Trash2, Play, Pause, SkipBack, SkipForward,
  BookOpen, ListMusic, Save, FolderOpen, Check,
  Music, AudioLines, Repeat, Waves, Zap
} from 'lucide-vue-next'
import { useFreesoundCache }  from '@/composables/useFreesoundCache'
import { useMidiStore }       from '@/stores/useMidiStore'
import { useArpStore }        from '@/stores/useArpStore'
import { usePresetStore }     from '@/stores/usePresetStore'
import { useLivePadStore }    from '@/stores/useLivePadStore'
import { useMappingStore }    from '@/stores/useMappingStore'
import { useSyncStore }       from '@/stores/useSyncStore'
import { useUiStore }         from '@/stores/useUiStore'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'
import { midiService }        from '@/core/midi/MidiService'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import { looperEngine }          from '@/lib/looper-engine'
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

const { resolveUrl: resolveFreesoundUrl, cacheFileBlob } = useFreesoundCache()
const midiStore    = useMidiStore()
const arpStore     = useArpStore()
const presetStore  = usePresetStore()
const livePadStore = useLivePadStore()
const mappingStore = useMappingStore()
const syncStore    = useSyncStore()
const uiStore      = useUiStore()
const { openMenu } = useMidiContextMenu()

// Local session-only REC SYNC toggle — does NOT write to the sync store,
// so it never overrides MidiSyncMatrix settings.
const localRecSync = ref(false)

// Visual indicator: ON if the local override is active OR either sync matrix
// flag (Backing Track → Capture, Loop Pads → Capture) is enabled.
const recSyncActive = computed(() =>
  localRecSync.value ||
  syncStore.syncRecordAudioCapture ||
  syncStore.syncLoopPadsToAudioCapture
)

// ── localStorage ─────────────────────────────────────────────────
const LS_PC_SETS        = 'SYCORE_PC_PERFORMANCE_SETS'
const LS_LPP_SETS       = 'SYCORE_LPP_SETS'
const LS_LPP_SNAPSHOTS  = 'SYCORE_LPP_SNAPSHOTS'
const LS_LPP_LOOP_PADS  = 'SYCORE_LPP_LOOP_PADS'

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

// When the local REC SYNC override is ON, mirror backing-track play/stop → capture.
watch(isPlaying, (playing) => {
  if (!localRecSync.value) return
  if (playing) window.dispatchEvent(new CustomEvent('capture-start-rec', { detail: { background: true } }))
  else         window.dispatchEvent(new CustomEvent('capture-stop-rec'))
})
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
    midiStore.updateRegistration(entry.deviceName, 'pcMsb',      entry.pcMsb ?? 0)
    midiStore.updateRegistration(entry.deviceName, 'pcLsb',      entry.pcLsb ?? 0)
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
          port.send([0xB0 | ch, 0,  info.msb ?? 0])
          port.send([0xB0 | ch, 32, info.lsb ?? 0])
          port.send([0xC0 | ch, info.program ?? 0])
        })
      } else {
        const ch = entry.pcChannel ?? 0
        port.send([0xB0 | ch, 0,  entry.pcMsb ?? 0])
        port.send([0xB0 | ch, 32, entry.pcLsb ?? 0])
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

// ── Loop Pads ─────────────────────────────────────────────────────
const LOOP_PAD_VOL = 0.8

const loopPads   = ref(Array(16).fill(null))
const loopActive = ref(Array(16).fill(false))

watch(loopActive, (v) => { livePadStore.loopActivePads = [...v] }, { deep: true })

// Per-pad Web Audio state: { a, b, gainA, gainB, active:'a'|'b', rafId, isCrossfading }
let _padCtx = null
const _padWA = Array(16).fill(null)

function _getAudioCtx() {
  if (!_padCtx) {
    const AC = window.AudioContext || window.webkitAudioContext
    _padCtx = new AC()
  }
  if (_padCtx.state === 'suspended') _padCtx.resume()
  return _padCtx
}

function _initPadWA(idx) {
  if (_padWA[idx]) return _padWA[idx]
  const ctx  = _getAudioCtx()
  const a    = new Audio(); a.preload = 'auto'
  const b    = new Audio(); b.preload = 'auto'
  a.addEventListener('error', () => { loopActive.value[idx] = false })
  const gainA = ctx.createGain(); gainA.gain.value = 0
  const gainB = ctx.createGain(); gainB.gain.value = 0
  ctx.createMediaElementSource(a).connect(gainA); gainA.connect(ctx.destination)
  ctx.createMediaElementSource(b).connect(gainB); gainB.connect(ctx.destination)
  _padWA[idx] = { a, b, gainA, gainB, active: 'a', rafId: null, isCrossfading: false }
  return _padWA[idx]
}

function _fadeSec() {
  return Math.max(0.3, Math.min(crossfadeSec.value ?? 1, 3))
}

function _stopPadRaf(idx) {
  const wa = _padWA[idx]; if (!wa) return
  if (wa.rafId) { cancelAnimationFrame(wa.rafId); wa.rafId = null }
  wa.isCrossfading = false
}

function _clearFade(idx) { _stopPadRaf(idx) }

// rAF loop: watches playback position, triggers crossfade before the loop boundary
function _padLoopTick(idx) {
  const wa = _padWA[idx]
  if (!wa || !loopActive.value[idx]) return
  wa.rafId = requestAnimationFrame(() => _padLoopTick(idx))
  if (wa.isCrossfading) return

  const activeEl   = wa.active === 'a' ? wa.a   : wa.b
  const nextEl     = wa.active === 'a' ? wa.b   : wa.a
  const activeGain = wa.active === 'a' ? wa.gainA : wa.gainB
  const nextGain   = wa.active === 'a' ? wa.gainB : wa.gainA

  const dur = activeEl.duration
  if (!dur || !isFinite(dur)) return

  const fadeTime  = Math.min(_fadeSec(), dur * 0.45)
  if (activeEl.currentTime < dur - fadeTime - 0.05) return

  wa.isCrossfading = true
  nextEl.currentTime = 0
  nextEl.play().catch(() => {})

  const ctx = _getAudioCtx()
  const now = ctx.currentTime
  if (fadeTime > 0) {
    activeGain.gain.cancelScheduledValues(now)
    activeGain.gain.setValueAtTime(activeGain.gain.value, now)
    activeGain.gain.linearRampToValueAtTime(0, now + fadeTime)
    nextGain.gain.cancelScheduledValues(now)
    nextGain.gain.setValueAtTime(0, now)
    nextGain.gain.linearRampToValueAtTime(LOOP_PAD_VOL, now + fadeTime)
  } else {
    activeGain.gain.setValueAtTime(0, now)
    nextGain.gain.setValueAtTime(LOOP_PAD_VOL, now)
  }

  setTimeout(() => {
    activeEl.pause()
    activeEl.currentTime = 0
    wa.active = wa.active === 'a' ? 'b' : 'a'
    wa.isCrossfading = false
  }, (fadeTime + 0.08) * 1000)
}

function _startPadRaf(idx) { _stopPadRaf(idx); _padLoopTick(idx) }

function _fadeInPad(idx) {
  const wa = _padWA[idx]; if (!wa) return
  const ctx = _getAudioCtx(); const now = ctx.currentTime
  const fadeSec    = _fadeSec()
  const activeGain = wa.active === 'a' ? wa.gainA : wa.gainB
  activeGain.gain.cancelScheduledValues(now)
  activeGain.gain.setValueAtTime(0, now)
  activeGain.gain.linearRampToValueAtTime(LOOP_PAD_VOL, now + fadeSec)
}

function _fadeOutPad(idx) {
  const wa = _padWA[idx]; if (!wa) return
  _stopPadRaf(idx)
  const ctx  = _getAudioCtx(); const now = ctx.currentTime
  const fadeSec    = _fadeSec()
  const activeGain = wa.active === 'a' ? wa.gainA : wa.gainB
  const otherGain  = wa.active === 'a' ? wa.gainB : wa.gainA
  activeGain.gain.cancelScheduledValues(now)
  activeGain.gain.setValueAtTime(activeGain.gain.value, now)
  activeGain.gain.linearRampToValueAtTime(0, now + fadeSec)
  otherGain.gain.cancelScheduledValues(now); otherGain.gain.setValueAtTime(0, now)
  setTimeout(() => {
    wa.a.pause(); wa.a.currentTime = 0
    wa.b.pause(); wa.b.currentTime = 0
    loopActive.value[idx] = false
  }, fadeSec * 1000)
}

function _stopPadInstant(idx) {
  const wa = _padWA[idx]; if (!wa) return
  _stopPadRaf(idx)
  const ctx = _getAudioCtx(); const now = ctx.currentTime
  wa.gainA.gain.cancelScheduledValues(now); wa.gainA.gain.setValueAtTime(0, now)
  wa.gainB.gain.cancelScheduledValues(now); wa.gainB.gain.setValueAtTime(0, now)
  wa.a.pause(); wa.a.currentTime = 0
  wa.b.pause(); wa.b.currentTime = 0
  loopActive.value[idx] = false
}

function _fireSyncActions(starting) {
  if (syncStore.syncLoopPadsToMidi) {
    if (starting) midiStore.sendStart()
    else midiStore.sendStop()
  }
  if (syncStore.syncLoopPadsToSequencer) {
    window.dispatchEvent(new CustomEvent('toggle-sequencer', { detail: { play: starting, source: 'loop-pads' } }))
  }
  if (syncStore.syncLoopPadsToBackingTrack) {
    // Guard: only toggle if it would move in the desired direction
    if (starting !== isPlaying.value)
      window.dispatchEvent(new CustomEvent('playlist-play-stop'))
  }
  if (syncStore.syncLoopPadsToLooper) {
    if (starting) looperEngine.startAll()
    else looperEngine.stopAllPlayback()
  }
  if (syncStore.syncLoopPadsToAudioCapture) {
    if (starting) window.dispatchEvent(new CustomEvent('capture-start-rec', { detail: { background: true } }))
    else window.dispatchEvent(new CustomEvent('capture-stop-rec'))
  }
}

async function toggleLoopPad(idx) {
  const pad = loopPads.value[idx]
  if (!pad?.url) return
  const instant = !!pad.noCrossfade

  if (loopActive.value[idx]) {
    if (instant) { _stopPadInstant(idx) } else { _fadeOutPad(idx) }
    _fireSyncActions(false)
    return
  }

  // Stop every other active pad (respects each pad's own crossfade setting)
  loopPads.value.forEach((otherPad, i) => {
    if (i === idx || !loopActive.value[i]) return
    if (otherPad?.noCrossfade) { _stopPadInstant(i) } else { _fadeOutPad(i) }
  })

  const url = await resolveFreesoundUrl(pad.id, pad.url)
  // Guard: pad may have been cleared during async URL resolution
  if (!loopPads.value[idx]?.url) return

  const wa  = _initPadWA(idx)
  _stopPadRaf(idx)

  // Set URL on both elements so the crossfade partner is always ready
  wa.active = 'a'
  wa.a.src  = url; wa.a.currentTime = 0
  wa.b.src  = url; wa.b.currentTime = 0
  const ctx = _getAudioCtx(); const now = ctx.currentTime
  wa.gainA.gain.cancelScheduledValues(now); wa.gainA.gain.setValueAtTime(0, now)
  wa.gainB.gain.cancelScheduledValues(now); wa.gainB.gain.setValueAtTime(0, now)

  try { await wa.a.play() } catch { loopActive.value[idx] = false; return }

  loopActive.value[idx] = true
  if (instant) {
    wa.gainA.gain.setValueAtTime(LOOP_PAD_VOL, _getAudioCtx().currentTime)
  } else {
    _fadeInPad(idx)
  }
  _startPadRaf(idx)

  if (pad.bpm) {
    arpStore.arpBpm      = pad.bpm
    midiStore.currentBpm = pad.bpm
    midiStore.setBpm(pad.bpm)
  }
  _fireSyncActions(true)
}

function toggleLoopPadNoCrossfade(idx) {
  const pad = loopPads.value[idx]
  if (!pad) return
  loopPads.value = loopPads.value.map((p, i) => i === idx ? { ...p, noCrossfade: !p.noCrossfade } : p)
  setLS(LS_LPP_LOOP_PADS, loopPads.value)
}

function clearLoopPad(idx) {
  _stopPadInstant(idx)
  const wa = _padWA[idx]
  if (wa) { wa.a.src = ''; wa.b.src = '' }
  loopPads.value = loopPads.value.map((p, i) => i === idx ? null : p)
  setLS(LS_LPP_LOOP_PADS, loopPads.value)
}

function openFreesoundBrowser() {
  uiStore.isFreesoundBrowserOpen = true
}

// ── Open local file for a loop pad ───────────────────────────────
const loopFileInputRef  = ref(null)
const loopFileTargetIdx = ref(null)

function openFileForPad(idx) {
  loopFileTargetIdx.value = idx
  loopFileInputRef.value?.click()
}

async function handleLoopFileSelect(e) {
  const file = e.target?.files?.[0]
  const idx  = loopFileTargetIdx.value
  loopFileTargetIdx.value = null
  e.target.value = ''
  if (!file || idx == null) return

  // Stop whatever is playing on this pad
  _stopPadInstant(idx)
  const wa = _padWA[idx]
  if (wa) { wa.a.src = ''; wa.b.src = '' }

  try {
    const blob = new Blob([await file.arrayBuffer()], { type: file.type || 'audio/mpeg' })
    const id   = `file_${Date.now()}`
    const name = file.name.replace(/\.[^.]+$/, '')

    // Probe duration via a temporary Audio element
    let duration = 0
    const tmpUrl = URL.createObjectURL(blob)
    try {
      await new Promise((resolve) => {
        const a = new Audio()
        a.onloadedmetadata = () => { duration = isFinite(a.duration) ? a.duration : 0; resolve() }
        a.onerror = resolve
        a.src = tmpUrl
        setTimeout(resolve, 3000)
      })
    } finally {
      URL.revokeObjectURL(tmpUrl)
    }

    // Store blob in IDB so resolveFreesoundUrl finds it on future sessions
    const url = await cacheFileBlob(id, name, blob, { duration })

    loopPads.value = loopPads.value.map((p, i) =>
      i === idx ? { id, label: name, url, author: '', duration } : p
    )
    setLS(LS_LPP_LOOP_PADS, loopPads.value)
  } catch (err) {
    console.error('[LivePerformancePad] File load failed', err)
  }
}

function _handleLoopPadAssign(e) {
  const { padIdx, track } = e.detail || {}
  if (padIdx == null || padIdx < 0 || padIdx >= 16 || !track) return
  if (loopActive.value[padIdx]) {
    _stopPadInstant(padIdx)
    const wa = _padWA[padIdx]
    if (wa) { wa.a.src = ''; wa.b.src = '' }
  }
  loopPads.value = loopPads.value.map((p, i) => i === padIdx ? { ...track } : p)
  setLS(LS_LPP_LOOP_PADS, loopPads.value)
}

// ── Init ──────────────────────────────────────────────────────────
function loadState() {
  pcSets.value       = getLS(LS_PC_SETS, [])
  lppSnapshots.value = getLS(LS_LPP_SNAPSHOTS, [])
  const saved = getLS(LS_LPP_SETS, null)
  if (Array.isArray(saved)) {
    const pads = [...saved]
    while (pads.length < 16) pads.push(emptySetPad())
    setPads.value = pads.slice(0, 16)
  }
  const savedLoops = getLS(LS_LPP_LOOP_PADS, null)
  if (Array.isArray(savedLoops)) {
    const lp = [...savedLoops]
    while (lp.length < 16) lp.push(null)
    loopPads.value = lp.slice(0, 16)
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
    } else if (paramName.startsWith('lpp_loop_')) {
      if (isCC && byte2 === 0) return
      const idx = parseInt(paramName.slice('lpp_loop_'.length))
      if (!isNaN(idx)) toggleLoopPad(idx)
    } else if (paramName.startsWith('lpp_bt_')) {
      if (isCC && byte2 === 0) return
      const idx = parseInt(paramName.slice('lpp_bt_'.length))
      if (!isNaN(idx)) playFromPlaylist(idx)
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

function _onLppSetAssign(e) {
  const { setId, padIdx } = e.detail ?? {}
  if (!setId || typeof padIdx !== 'number' || padIdx < 0 || padIdx >= 16) return
  pcSets.value = getLS(LS_PC_SETS, [])
  assignSetPad(padIdx, setId)
}

onMounted(() => {
  loadState()
  window.addEventListener('player-state-sync', handleStateUpdate)
  window.addEventListener('timeline-trigger-perf-set', _onTimelinePerfSet)
  window.addEventListener('timeline-load-perf-set', _onTimelineLoadPerfSet)
  window.dispatchEvent(new CustomEvent('player-state-request'))
  _startLppMidiListener()
  window.addEventListener('loop-pad-assign', _handleLoopPadAssign)
  window.addEventListener('lpp-set-assign', _onLppSetAssign)
})

onUnmounted(() => {
  window.removeEventListener('player-state-sync', handleStateUpdate)
  window.removeEventListener('timeline-trigger-perf-set', _onTimelinePerfSet)
  window.removeEventListener('timeline-load-perf-set', _onTimelineLoadPerfSet)
  window.removeEventListener('loop-pad-assign', _handleLoopPadAssign)
  window.removeEventListener('lpp-set-assign', _onLppSetAssign)
  if (_unsubLppMidi) _unsubLppMidi()
  _padWA.forEach((wa, i) => { if (wa) _stopPadInstant(i) })
  if (_padCtx) { _padCtx.close().catch(() => {}); _padCtx = null }
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

      <!-- Loop Pads -->
      <div class="shrink-0">
        <div class="flex items-center gap-3 mb-2">
          <Repeat class="w-3.5 h-3.5 text-cyan-500/50 shrink-0" />
          <span class="text-[10px] font-black text-neutral-500 uppercase tracking-[0.25em] font-mono whitespace-nowrap">Loop Pads</span>
          <div class="h-px flex-1 bg-neutral-900" />
          <button
            @click="openFreesoundBrowser"
            class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-cyan-500/30 bg-cyan-500/5 text-cyan-400 text-[9px] font-black uppercase tracking-widest hover:bg-cyan-500/15 hover:border-cyan-400/50 transition-all shrink-0"
            title="Open Freesound browser"
          >
            <Repeat class="w-2.5 h-2.5" />
            Freesound
          </button>
          <input
            ref="loopFileInputRef"
            type="file"
            accept=".mp3,.wav,.ogg,audio/*"
            class="hidden"
            @change="handleLoopFileSelect"
          />
        </div>
        <div class="grid grid-cols-8 gap-2">
          <div v-for="(pad, idx) in loopPads" :key="'lp-' + idx" class="relative group">
            <button
              @click="toggleLoopPad(idx)"
              @contextmenu.prevent="openMenu($event, { name: 'lpp_loop_' + idx, label: (pad?.label || 'Loop Pad ' + (idx + 1)) })"
              :class="[
                'w-full h-16 rounded-xl border-2 flex flex-col items-center justify-center p-1.5 gap-0.5 transition-all relative overflow-hidden',
                pad
                  ? loopActive[idx]
                    ? 'bg-cyan-700/30 border-cyan-400 text-white shadow-[0_0_14px_rgba(34,211,238,0.45)]'
                    : 'border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 hover:border-cyan-400/60'
                  : 'border border-neutral-800 text-neutral-700 cursor-default'
              ]"
              :title="pad ? (loopActive[idx] ? 'Stop loop' : 'Start loop: ' + pad.label) : 'Assign from Freesound browser'"
            >
              <div v-if="loopActive[idx]" class="absolute inset-0 bg-cyan-500/10 animate-pulse pointer-events-none" />
              <span class="text-[9px] font-black uppercase tracking-tight leading-none text-center line-clamp-2 w-full px-0.5 z-10">
                {{ pad ? pad.label : `— ${idx + 1} —` }}
              </span>
              <span v-if="pad?.author" class="text-[7px] font-mono opacity-50 z-10 truncate w-full text-center normal-case">{{ pad.author }}</span>
              <div v-if="pad?.duration || pad?.bpm" class="flex items-center justify-center gap-1 z-10">
                <span v-if="pad.duration" class="text-[7px] font-mono text-cyan-500/50">{{ formatTime(pad.duration) }}</span>
                <span v-if="pad.duration && pad.bpm" class="text-[6px] text-neutral-700">·</span>
                <span v-if="pad.bpm" class="text-[7px] font-mono text-violet-400/70">{{ pad.bpm }}bpm</span>
              </div>
              <span v-if="!pad" class="text-[7px] font-mono uppercase tracking-widest opacity-30 z-10">loop</span>
            </button>
            <!-- Open local file -->
            <button
              @click.stop="openFileForPad(idx)"
              class="absolute bottom-0.5 left-0.5 w-4 h-4 rounded border border-neutral-700 bg-neutral-900 text-neutral-500 hover:text-emerald-400 hover:border-emerald-500/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20"
              title="Load local file (MP3 / WAV / OGG)"
            >
              <FolderOpen class="w-2.5 h-2.5" />
            </button>
            <!-- Crossfade toggle -->
            <button
              v-if="pad"
              @click.stop="toggleLoopPadNoCrossfade(idx)"
              :class="[
                'absolute -top-1 -left-1 w-4 h-4 rounded-full border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20',
                pad.noCrossfade
                  ? 'bg-neutral-900 border-yellow-600/50 text-yellow-500 hover:border-yellow-400'
                  : 'bg-neutral-900 border-cyan-600/50 text-cyan-400 hover:border-cyan-400'
              ]"
              :title="pad.noCrossfade ? 'Crossfade: OFF (instant) — click to enable' : 'Crossfade: ON — click to disable'"
            >
              <Zap  v-if="pad.noCrossfade" class="w-2 h-2" />
              <Waves v-else                 class="w-2 h-2" />
            </button>
            <!-- Clear -->
            <button
              v-if="pad"
              @click.stop="clearLoopPad(idx)"
              class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-neutral-900 border border-neutral-700 text-neutral-500 hover:text-red-400 hover:border-red-500/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20"
              title="Remove sound"
            >
              <X class="w-2.5 h-2.5" />
            </button>
            <!-- MIDI learning indicator -->
            <span
              v-if="mappingStore.learningParamName === 'lpp_loop_' + idx"
              class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)] animate-pulse z-50 pointer-events-none"
            />
          </div>
        </div>
      </div>

    </div>

    <!-- ── Performance footer player ── -->
    <div v-if="tab === 'perf'"
      :class="[
        'shrink-0 border-t border-neutral-900 flex items-center justify-between px-8 py-2 transition-all duration-500 relative overflow-hidden',
        recSyncActive && isPlaying
          ? 'bg-red-950/60'
          : recSyncActive
            ? 'bg-black/60'
            : 'bg-black/60'
      ]"
    >
      <!-- Audio capture sync background pulse -->
      <div
        v-if="recSyncActive && isPlaying"
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
              recSyncActive && isPlaying
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
          @click="localRecSync = !localRecSync"
        >
          <span
            :class="[
              'w-1.5 h-1.5 rounded-full transition-all duration-300',
              recSyncActive && isPlaying ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)] animate-pulse'
              : recSyncActive ? 'bg-red-500/60'
              : 'bg-neutral-700'
            ]"
          />
          <span :class="[
            'text-[11px] font-mono uppercase tracking-widest transition-colors duration-300',
            recSyncActive && isPlaying ? 'text-red-400'
            : recSyncActive ? 'text-red-500/60 hover:text-red-400'
            : 'text-neutral-600 hover:text-neutral-500'
          ]">REC SYNC</span>
        </div>
        <!--- Open Audio Capture-->
        <div v-if="recSyncActive && !isPlaying" @click="uiStore.isAudioCaptureOpen = true" class="cursor-pointer text-synth-cyan text-mono text-xs uppercase text-[9px]">
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
