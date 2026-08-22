<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Layers, Clock, Plus, Square, Circle, SlidersHorizontal, BookOpen, Mic, Save, FolderOpen, Trash2, Play, Search } from 'lucide-vue-next'
import { useUiStore }              from '@/stores/useUiStore'
import { useMidiStore }            from '@/stores/useMidiStore'
import { useDrumMachineStore }     from '@/stores/useDrumMachineStore'
import { useMappingStore }      from '@/stores/useMappingStore'
import { useLivePadStore }      from '@/stores/useLivePadStore'
import { usePerformanceSets }   from '@/composables/usePerformanceSets'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import MacOsButtons from '@/components/ui/MacOsButtons.vue'
import { useFreesoundCache }    from '@/composables/useFreesoundCache'
import { useMidiContextMenu }   from '@/composables/useMidiContextMenu'
import { midiService }          from '@/core/midi/midi-service'
import { loopMachineState }     from '@/core/state/loopMachineState'
import { userKey }              from '@/lib/userKey'

const uiStore      = useUiStore()
const midiStore    = useMidiStore()
const mappingStore = useMappingStore()
const livePadStore = useLivePadStore()
const drumStore    = useDrumMachineStore()

const DM_SEQS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

function dmSelectPreset(id) {
  const preset = drumStore.presets.find(p => p.id === id)
  if (preset) drumStore.loadPreset(preset)
}

function dmSwitchSeq(seq) {
  window.dispatchEvent(new CustomEvent('dm-seq-switch', { detail: { seq } }))
}
const { openMenu } = useMidiContextMenu()
const { resolveUrl, cacheFileBlob } = useFreesoundCache()

const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront, maximize } =
  useDraggableResizable({
    storageKey:    'S1_LOOP_MACHINE_DR',
    minimizeLabel: 'Samples Machine',
    openRef:       () => uiStore.isLoopMachineOpen,
    initialWidth:  1020,
    initialHeight: 600,
    minWidth:      720,
    minHeight:     440,
    zIndex:        200,
    panelId:       'loop-machine',
  })


// ── Constants ─────────────────────────────────────────────────────
const LS_KEY      = 'SYCORE_LOOP_MACHINE_PADS'
const LS_LPP_SETS = 'SYCORE_LPP_SETS'
const LS_PRESETS  = 'SYCORE_LM_PRESETS'
const PAD_COUNT   = 24

// ── Pad state (module-level so it survives re-mounts) ─────────────
function _loadPads() {
  try {
    const raw = localStorage.getItem(userKey(LS_KEY))
    const arr = raw ? JSON.parse(raw) : []
    while (arr.length < PAD_COUNT) arr.push(null)
    return arr.slice(0, PAD_COUNT)
  } catch { return Array(PAD_COUNT).fill(null) }
}

const pads       = ref(_loadPads())
const active     = ref(Array(PAD_COUNT).fill(false))
const pending    = ref(Array(PAD_COUNT).fill(false))
const padVolumes = ref(Array(PAD_COUNT).fill(0))
const fadeOutMs      = ref(parseInt(localStorage.getItem(userKey('S1_LM_FADE_MS'))         || '0'))
const fadeInEnabled  = ref(localStorage.getItem(userKey('S1_LM_FADEIN_ENABLED')) === 'true')
const fadeInMs       = ref(parseInt(localStorage.getItem(userKey('S1_LM_FADEIN_MS'))        || '1000'))
const fadeInVol      = ref(parseFloat(localStorage.getItem(userKey('S1_LM_FADEIN_VOL'))     || '0.8'))
watch(fadeOutMs,     v => localStorage.setItem(userKey('S1_LM_FADE_MS'),         String(v)))
watch(fadeInEnabled, v => localStorage.setItem(userKey('S1_LM_FADEIN_ENABLED'),  String(v)))
watch(fadeInMs,      v => localStorage.setItem(userKey('S1_LM_FADEIN_MS'),       String(v)))
watch(fadeInVol,     v => localStorage.setItem(userKey('S1_LM_FADEIN_VOL'),      String(v)))

const lmUseSessionBpm  = ref(localStorage.getItem(userKey('S1_LM_USE_SESSION_BPM'))  === 'true')
const lmVolumeReset    = ref(localStorage.getItem(userKey('S1_LM_VOLUME_RESET'))     === 'true')
watch(lmUseSessionBpm, v => localStorage.setItem(userKey('S1_LM_USE_SESSION_BPM'),  String(v)))
watch(lmVolumeReset,   v => localStorage.setItem(userKey('S1_LM_VOLUME_RESET'),     String(v)))

// Computed two-way binding for the BPM input — v-model compatible
const lmBpm = computed({
  get: () => midiStore.currentBpm,
  set: (v) => {
    const bpm = Math.max(20, Math.min(300, Math.round(+v || 120)))
    midiStore.setGlobalBpm(bpm)
    localStorage.setItem(userKey('S1_LM_SESSION_BPM'), String(bpm))
  },
})

function _applyPlaybackRate(idx) {
  const wa  = _padWA[idx]; if (!wa) return
  const pad = pads.value[idx]
  const rate = (lmUseSessionBpm.value && pad?.bpm) ? midiStore.currentBpm / pad.bpm : 1
  wa.a.playbackRate = rate
  wa.b.playbackRate = rate
}

watch(lmUseSessionBpm, () => {
  for (let i = 0; i < PAD_COUNT; i++) { if (active.value[i]) _applyPlaybackRate(i) }
})
watch(() => midiStore.currentBpm, (bpm) => {
  if (!lmUseSessionBpm.value) return
  localStorage.setItem(userKey('S1_LM_SESSION_BPM'), String(bpm))
  for (let i = 0; i < PAD_COUNT; i++) { if (active.value[i]) _applyPlaybackRate(i) }
})

const syncEnabled = ref(localStorage.getItem(userKey('S1_LM_SYNC')) !== '0')
watch(syncEnabled, v => {
  localStorage.setItem(userKey('S1_LM_SYNC'), v ? '1' : '0')
  loopMachineState.syncEnabled = v
  window.dispatchEvent(new CustomEvent('lm-state-changed'))
})

// ── Capture recording integration ─────────────────────────────────
const lmRecSync = ref(localStorage.getItem(userKey('S1_LM_REC_SYNC')) === '1')
watch(lmRecSync, v => {
  localStorage.setItem(userKey('S1_LM_REC_SYNC'), v ? '1' : '0')
  loopMachineState.recSyncEnabled = v
  window.dispatchEvent(new CustomEvent('lm-state-changed'))
})

watch(active, v => {
  loopMachineState.activePads = [...v]
  window.dispatchEvent(new CustomEvent('lm-state-changed'))
}, { deep: true })

function manualStartRec() {
  window.dispatchEvent(new CustomEvent('capture-start-rec', { detail: { background: true } }))
}
function manualStopRec() {
  window.dispatchEvent(new CustomEvent('capture-stop-rec'))
}

function _savePads() {
  try { localStorage.setItem(userKey(LS_KEY), JSON.stringify(pads.value)) } catch {}
}

// ── Presets ───────────────────────────────────────────────────────
const lmPresets       = ref([])
const showPresetPanel = ref(false)
const newPresetName   = ref('')

function _loadPresets() {
  try { lmPresets.value = JSON.parse(localStorage.getItem(userKey(LS_PRESETS)) || '[]') } catch { lmPresets.value = [] }
}

function savePreset() {
  const name = newPresetName.value.trim() || `Preset ${lmPresets.value.length + 1}`
  const preset = {
    id: `lm_preset_${Date.now()}`,
    name,
    savedAt: new Date().toISOString(),
    pads: JSON.parse(JSON.stringify(pads.value)),
    padVolumes: [...padVolumes.value],
    fadeOutMs: fadeOutMs.value,
    syncEnabled: syncEnabled.value,
    lmRecSync: lmRecSync.value,
  }
  lmPresets.value.push(preset)
  try { localStorage.setItem(userKey(LS_PRESETS), JSON.stringify(lmPresets.value)) } catch {}
  newPresetName.value = ''
}

function loadPreset(preset) {
  stopAll()
  pads.value = JSON.parse(JSON.stringify(preset.pads))
  preset.padVolumes.forEach((v, i) => { padVolumes.value[i] = v })
  fadeOutMs.value   = preset.fadeOutMs   ?? 0
  syncEnabled.value = preset.syncEnabled ?? true
  lmRecSync.value   = preset.lmRecSync   ?? false
  _savePads()
}

function overwritePreset(id) {
  const idx = lmPresets.value.findIndex(p => p.id === id)
  if (idx < 0) return
  lmPresets.value[idx] = {
    ...lmPresets.value[idx],
    pads: JSON.parse(JSON.stringify(pads.value)),
    padVolumes: [...padVolumes.value],
    fadeOutMs: fadeOutMs.value,
    syncEnabled: syncEnabled.value,
    lmRecSync: lmRecSync.value,
    savedAt: new Date().toISOString(),
  }
  try { localStorage.setItem(userKey(LS_PRESETS), JSON.stringify(lmPresets.value)) } catch {}
}

function deletePreset(id) {
  lmPresets.value = lmPresets.value.filter(p => p.id !== id)
  try { localStorage.setItem(userKey(LS_PRESETS), JSON.stringify(lmPresets.value)) } catch {}
}

// ── Performance Sets (shared + IndexedDB-backed via usePerformanceSets) ──
const emptySetPad = () => ({ setId: null, setName: null })
const { pcSets, loadSets, recallSet: recallStoredSet } = usePerformanceSets()
const setPads  = ref(Array(16).fill(null).map(emptySetPad))

const activePerfSetIdx = computed({
  get: () => livePadStore.activePerfSetIdx,
  set: v => { livePadStore.activePerfSetIdx = v },
})

function _loadPerfSets() {
  loadSets()
  try {
    const saved  = JSON.parse(localStorage.getItem(userKey(LS_LPP_SETS)) || 'null')
    if (Array.isArray(saved)) {
      const arr = [...saved]
      while (arr.length < 16) arr.push(emptySetPad())
      setPads.value = arr.slice(0, 16)
    }
  } catch {}
}

function recallSet(set) {
  if (!set) return
  recallStoredSet(set)
}

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

// ── Sync master clock ─────────────────────────────────────────────
let _master = null
const _pendingTimers = {}

function _anyLive() {
  return active.value.some(Boolean) || pending.value.some(Boolean)
}

function _setMaster(idx) {
  const pad = pads.value[idx]
  if (!pad) return
  const dur = pad.bpm ? (4 * (60 / pad.bpm)) : (pad.duration || 4)
  _master = { startedAt: performance.now(), duration: Math.max(0.1, dur) }
}

// ── Audio engine ──────────────────────────────────────────────────
let _padCtx = null
const _padWA    = Array(PAD_COUNT).fill(null)
const _padFadeIn = {} // { [idx]: { startTime, endTime, target } } — cleared when fade completes or pad stops

function _getCtx() {
  if (!_padCtx) {
    const AC = window.AudioContext || window.webkitAudioContext
    _padCtx = new AC()
  }
  if (_padCtx.state === 'suspended') _padCtx.resume()
  return _padCtx
}

function _initWA(idx) {
  if (_padWA[idx]) return _padWA[idx]
  const ctx = _getCtx()
  const a = new Audio(); a.preload = 'auto'
  const b = new Audio(); b.preload = 'auto'
  const gainA = ctx.createGain(); gainA.gain.value = 0
  const gainB = ctx.createGain(); gainB.gain.value = 0
  ctx.createMediaElementSource(a).connect(gainA); gainA.connect(ctx.destination)
  ctx.createMediaElementSource(b).connect(gainB); gainB.connect(ctx.destination)
  _padWA[idx] = { a, b, gainA, gainB, side: 'a', rafId: null, crossing: false }
  return _padWA[idx]
}

function _loopTick(idx) {
  const wa = _padWA[idx]
  if (!wa || !active.value[idx]) return
  wa.rafId = requestAnimationFrame(() => _loopTick(idx))
  if (wa.crossing) return

  const cur  = wa.side === 'a' ? wa.a : wa.b
  const next = wa.side === 'a' ? wa.b : wa.a
  const gCur = wa.side === 'a' ? wa.gainA : wa.gainB
  const gNxt = wa.side === 'a' ? wa.gainB : wa.gainA

  const dur = cur.duration
  if (!dur || !isFinite(dur) || cur.currentTime < dur - 0.05) return

  wa.crossing = true
  next.currentTime = 0
  next.play().catch(() => {})

  const now = _getCtx().currentTime
  gCur.gain.cancelScheduledValues(now); gCur.gain.setValueAtTime(0, now)
  gNxt.gain.cancelScheduledValues(now)
  const _fi = _padFadeIn[idx]
  if (_fi && now < _fi.endTime) {
    const progress = Math.max(0, (now - _fi.startTime) / (_fi.endTime - _fi.startTime))
    gNxt.gain.setValueAtTime(progress * _fi.target, now)
    gNxt.gain.linearRampToValueAtTime(_fi.target, _fi.endTime)
  } else {
    gNxt.gain.setValueAtTime(padVolumes.value[idx], now)
  }

  setTimeout(() => {
    cur.pause(); cur.currentTime = 0
    wa.side = wa.side === 'a' ? 'b' : 'a'
    wa.crossing = false
  }, 80)
}

async function _startPad(idx) {
  const pad = pads.value[idx]
  if (!pad) { pending.value[idx] = false; return }

  const url = await resolveUrl(pad.id, pad.url)
  if (!pads.value[idx]) return
  if (!url) { pending.value[idx] = false; return }

  const wa = _initWA(idx)
  if (wa.rafId) { cancelAnimationFrame(wa.rafId); wa.rafId = null }

  wa.side = 'a'; wa.crossing = false
  wa.a.src = url; wa.a.currentTime = 0
  wa.b.src = url; wa.b.currentTime = 0

  const ctx = _getCtx(); const now = ctx.currentTime
  wa.gainA.gain.cancelScheduledValues(now); wa.gainA.gain.setValueAtTime(0, now)
  wa.gainB.gain.cancelScheduledValues(now); wa.gainB.gain.setValueAtTime(0, now)

  try { await wa.a.play() } catch { pending.value[idx] = false; return }

  active.value[idx]  = true
  pending.value[idx] = false
  _applyPlaybackRate(idx)
  const _startNow = _getCtx().currentTime
  if (fadeInEnabled.value && padVolumes.value[idx] === 0) {
    const target  = Math.max(0, Math.min(1, fadeInVol.value))
    const dur     = Math.max(0.05, fadeInMs.value / 1000)
    const endTime = _startNow + dur
    _padFadeIn[idx] = { startTime: _startNow, endTime, target }
    padVolumes.value[idx] = target
    wa.gainA.gain.setValueAtTime(0, _startNow)
    wa.gainA.gain.linearRampToValueAtTime(target, endTime)
    setTimeout(() => { delete _padFadeIn[idx] }, fadeInMs.value + 150)
  } else {
    wa.gainA.gain.setValueAtTime(padVolumes.value[idx], _startNow)
  }
  wa.rafId = requestAnimationFrame(() => _loopTick(idx))

  if (pad.bpm && !lmUseSessionBpm.value) {
    midiStore.setGlobalBpm(pad.bpm)
  }

  const isFirstPad = !_master
  if (isFirstPad) {
    _setMaster(idx)
    if (lmRecSync.value)
      window.dispatchEvent(new CustomEvent('capture-start-rec', { detail: { background: true } }))
  }
}

function _stopPad(idx, fadeSec = 0) {
  if (_pendingTimers[idx]) { clearTimeout(_pendingTimers[idx]); delete _pendingTimers[idx] }
  delete _padFadeIn[idx]
  active.value[idx]  = false
  pending.value[idx] = false

  // When volume reset is on, honour at least fadeOutMs so the audio ramps down visibly
  const effectiveFade = lmVolumeReset.value
    ? Math.max(fadeSec, fadeOutMs.value / 1000)
    : fadeSec

  if (lmVolumeReset.value) {
    if (effectiveFade > 0) setTimeout(() => { padVolumes.value[idx] = 0 }, effectiveFade * 1000 + 50)
    else padVolumes.value[idx] = 0
  }

  const wa = _padWA[idx]
  if (wa) {
    if (wa.rafId) { cancelAnimationFrame(wa.rafId); wa.rafId = null }
    const ctx = _getCtx(); const now = ctx.currentTime

    if (effectiveFade > 0) {
      wa.gainA.gain.cancelScheduledValues(now)
      wa.gainA.gain.setValueAtTime(wa.gainA.gain.value, now)
      wa.gainA.gain.linearRampToValueAtTime(0, now + effectiveFade)
      wa.gainB.gain.cancelScheduledValues(now)
      wa.gainB.gain.setValueAtTime(wa.gainB.gain.value, now)
      wa.gainB.gain.linearRampToValueAtTime(0, now + effectiveFade)
      setTimeout(() => {
        wa.a.pause(); wa.a.currentTime = 0
        wa.b.pause(); wa.b.currentTime = 0
        wa.crossing = false
      }, effectiveFade * 1000 + 50)
    } else {
      wa.gainA.gain.cancelScheduledValues(now); wa.gainA.gain.setValueAtTime(0, now)
      wa.gainB.gain.cancelScheduledValues(now); wa.gainB.gain.setValueAtTime(0, now)
      wa.a.pause(); wa.a.currentTime = 0
      wa.b.pause(); wa.b.currentTime = 0
      wa.crossing = false
    }
  }
  if (!_anyLive()) _master = null
}

function togglePad(idx) {
  if (!pads.value[idx]) return

  if (active.value[idx]) { _stopPad(idx); return }

  if (pending.value[idx]) {
    if (_pendingTimers[idx]) { clearTimeout(_pendingTimers[idx]); delete _pendingTimers[idx] }
    pending.value[idx] = false
    return
  }

  if (syncEnabled.value && _master && _anyLive()) {
    const elapsed = (performance.now() - _master.startedAt) % (_master.duration * 1000)
    const delay   = _master.duration * 1000 - elapsed
    pending.value[idx] = true
    _pendingTimers[idx] = setTimeout(() => _startPad(idx), Math.max(0, delay))
  } else {
    _startPad(idx)
  }
}

function stopAll() {
  const wasLive = _anyLive()
  const fadeSec = fadeOutMs.value / 1000
  for (let i = 0; i < PAD_COUNT; i++) _stopPad(i, fadeSec)
  _master = null
  if (wasLive && lmRecSync.value) {
    const delay = fadeSec > 0 ? fadeOutMs.value + 50 : 0
    setTimeout(() => window.dispatchEvent(new CustomEvent('capture-stop-rec')), delay)
  }
}

// ── File import ───────────────────────────────────────────────────
const fileInputRef = ref(null)
let _importIdx = -1

function openFileForPad(idx) {
  _importIdx = idx
  fileInputRef.value?.click()
}

function openFolderBrowserForPad(idx) {
  uiStore.soundFolderAssignTarget = {
    label: `Pad ${idx + 1}`,
    onAssign: async (file) => {
      const fileObj  = await file.handle.getFile()
      const blob     = new Blob([await fileObj.arrayBuffer()], { type: fileObj.type || 'audio/wav' })
      let duration   = 0
      try {
        const AC  = window.AudioContext || window.webkitAudioContext
        const ctx = new AC()
        const buf = await ctx.decodeAudioData(await blob.arrayBuffer())
        duration  = buf.duration
        await ctx.close()
      } catch {}
      const id    = `lm_${Date.now()}_${idx}`
      const label = file.name.replace(/\.[^.]+$/, '')
      const url   = await cacheFileBlob(id, label, blob, { author: 'Sound Folder', duration })
      _stopPad(idx)
      pads.value[idx] = { id, label, url, author: 'Sound Folder', duration }
      _savePads()
    },
  }
  uiStore.isSoundFolderBrowserOpen = true
}

async function handleFileImport(e) {
  const file = e.target?.files?.[0]
  if (!file || _importIdx < 0) return
  const idx = _importIdx; _importIdx = -1

  let duration = 0
  let blob
  try {
    blob = new Blob([await file.arrayBuffer()], { type: file.type || 'audio/wav' })
    const AC = window.AudioContext || window.webkitAudioContext
    const ctx = new AC()
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer())
    duration = buf.duration
    await ctx.close()
  } catch { blob = new Blob([await file.arrayBuffer()], { type: file.type || 'audio/wav' }) }

  const id    = `lm_${Date.now()}_${idx}`
  const label = file.name.replace(/\.[^.]+$/, '')
  const url   = await cacheFileBlob(id, label, blob, { author: 'Local file', duration })

  _stopPad(idx)
  pads.value[idx] = { id, label, url, author: 'Local file', duration }
  _savePads()
  e.target.value = ''
}

function clearPad(idx) {
  _stopPad(idx)
  const wa = _padWA[idx]
  if (wa) { wa.a.src = ''; wa.b.src = '' }
  pads.value[idx] = null
  _savePads()
}

async function sendPadToCapture(idx) {
  const pad = pads.value[idx]
  if (!pad) return
  const url = await resolveUrl(pad.id, pad.url)
  if (!url) return
  try {
    const resp = await fetch(url)
    const blob = await resp.blob()
    uiStore.isAudioCaptureOpen = true
    window.dispatchEvent(new CustomEvent('freesound-send-to-capture', {
      detail: { blob, bpm: pad.bpm || null, label: pad.label }
    }))
  } catch (e) {
    console.error('[LoopMachine] Failed to send pad to capture', e)
  }
}

// ── Volume ────────────────────────────────────────────────────────
function formatTime(s) {
  if (!s || isNaN(s)) return ''
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

function setPadVolume(idx, vol) {
  padVolumes.value[idx] = vol
  const wa = _padWA[idx]
  if (!wa || !active.value[idx]) return
  const ctx = _getCtx(); const now = ctx.currentTime
  const gActive = wa.side === 'a' ? wa.gainA : wa.gainB
  gActive.gain.cancelScheduledValues(now)
  gActive.gain.setValueAtTime(vol, now)
}

// ── MIDI listener ─────────────────────────────────────────────────
let _unsubMidi = null

function _startMidiListener() {
  _unsubMidi = midiService.addRawListener((event) => {
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

    const mapping   = mappingStore.midiMappings[key]
    if (!mapping) return
    const paramName = typeof mapping === 'object' ? mapping.paramName : mapping
    if (!paramName) return

    if (paramName.startsWith('lm_vol_')) {
      if (!isCC) return
      const idx = parseInt(paramName.slice('lm_vol_'.length))
      if (!isNaN(idx) && idx >= 0 && idx < PAD_COUNT) setPadVolume(idx, byte2 / 127)
      return
    }

    if (isCC && byte2 === 0) return

    if (paramName.startsWith('lm_pad_')) {
      const idx = parseInt(paramName.slice('lm_pad_'.length))
      if (!isNaN(idx) && idx >= 0 && idx < PAD_COUNT) togglePad(idx)
    } else if (paramName.startsWith('lpp_set_')) {
      const idx = parseInt(paramName.slice('lpp_set_'.length))
      if (!isNaN(idx) && idx >= 0 && idx < 16) triggerSetPad(idx)
    } else if (paramName === 'lm_sync') {
      syncEnabled.value = !syncEnabled.value
    } else if (paramName === 'lm_rec_sync') {
      lmRecSync.value = !lmRecSync.value
    } else if (paramName === 'lm_rec') {
      uiStore.isCaptureRecording ? manualStopRec() : manualStartRec()
    } else if (paramName === 'lm_stop_all') {
      stopAll()
    }
  })
}

// ── Lifecycle ─────────────────────────────────────────────────────
let _assignHandler         = null
let _lppSetAssignHandler   = null
let _lmMasterVolumeHandler = null
let _tlLmStartHandler      = null
let _tlLmStopHandler       = null

onMounted(() => {
  if (lmUseSessionBpm.value) {
    const saved = parseInt(localStorage.getItem(userKey('S1_LM_SESSION_BPM')) || '120')
    midiStore.setGlobalBpm(saved)
  }

  _loadPresets()
  _loadPerfSets()

  _assignHandler = e => {
    const { padIdx, track } = e.detail || {}
    if (padIdx == null || !track || padIdx < 0 || padIdx >= PAD_COUNT) return
    _stopPad(padIdx)
    pads.value[padIdx] = { ...track }
    _savePads()
  }
  window.addEventListener('loop-machine-assign', _assignHandler)

  _lppSetAssignHandler = e => {
    const { setId, padIdx } = e.detail ?? {}
    if (!setId || typeof padIdx !== 'number' || padIdx < 0 || padIdx >= 16) return
    _loadPerfSets()
  }
  window.addEventListener('lpp-set-assign', _lppSetAssignHandler)

  _lmMasterVolumeHandler = e => {
    if (e.detail == null) return
    const scale = Math.max(0, Math.min(1, e.detail))
    for (let i = 0; i < PAD_COUNT; i++) setPadVolume(i, scale)
  }
  window.addEventListener('lm-master-volume', _lmMasterVolumeHandler)

  _tlLmStartHandler = e => {
    const { padIdx, bpm } = e.detail ?? {}
    if (typeof padIdx === 'number' && padIdx >= 0 && padIdx < PAD_COUNT && !active.value[padIdx])
      togglePad(padIdx)
    // _startPad overrides BPM asynchronously after sample load — reassert timeline BPM
    if (bpm) setTimeout(() => midiStore.setGlobalBpm(bpm), 300)
  }
  _tlLmStopHandler = () => stopAll()
  window.addEventListener('timeline-lm-start', _tlLmStartHandler)
  window.addEventListener('timeline-lm-stop',  _tlLmStopHandler)

  _startMidiListener()
})

onUnmounted(() => {
  stopAll()
  if (_padCtx) { _padCtx.close().catch(() => {}); _padCtx = null }
  if (_assignHandler) window.removeEventListener('loop-machine-assign', _assignHandler)
  if (_lppSetAssignHandler) window.removeEventListener('lpp-set-assign', _lppSetAssignHandler)
  if (_lmMasterVolumeHandler) window.removeEventListener('lm-master-volume', _lmMasterVolumeHandler)
  if (_tlLmStartHandler)      window.removeEventListener('timeline-lm-start', _tlLmStartHandler)
  if (_tlLmStopHandler)       window.removeEventListener('timeline-lm-stop',  _tlLmStopHandler)
  if (_unsubMidi) _unsubMidi()
})
</script>

<template>
  <Transition name="sy-modal">
    <div
      v-show="uiStore.isLoopMachineOpen && !isMinimized"
      :style="panelStyle"
      class="relative bg-neutral-950 border border-amber-500/30 rounded-xl shadow-2xl shadow-black/60 flex flex-col overflow-hidden"
      @mousedown.capture="bringToFront"
    >
      <!-- Resize handles -->
      <div @mousedown.stop="e => onResizeStart(e, 'n')"  class="absolute top-0    left-3 right-3  h-1  cursor-n-resize  z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 's')"  class="absolute bottom-0 left-3 right-3  h-1  cursor-s-resize  z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'e')"  class="absolute top-3 bottom-3 right-0   w-1  cursor-e-resize  z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'w')"  class="absolute top-3 bottom-3 left-0    w-1  cursor-w-resize  z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'se')" class="absolute bottom-0 right-0         w-4  h-4 cursor-se-resize z-50" />

      <!-- Header -->
      <div
        class="shrink-0 px-4 py-2 border-b border-neutral-800 flex items-center justify-between bg-gradient-to-r from-amber-950/40 to-transparent cursor-grab active:cursor-grabbing select-none"
        @mousedown="onDragStart"
      >
        <div class="flex items-center gap-3 pointer-events-none">
          <div class="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
            <Layers class="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h2 class="text-sm font-black uppercase tracking-[0.2em] text-white leading-none mb-0.5">SAMPLES MACHINE</h2>
            <p class="text-[9px] font-mono text-amber-500/60 uppercase tracking-widest leading-none">24 samples · 16 perf sets · simultaneous</p>
          </div>
        </div>

        <div class="flex items-center gap-2 pointer-events-auto">
          <!-- Sync toggle -->
          <!-- <div class="relative">
            <button
              @mousedown.stop
              @click="syncEnabled = !syncEnabled"
              @contextmenu.prevent="openMenu($event, { name: 'lm_sync', label: 'Samples Machine: Sync' })"
              :class="['flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all',
                syncEnabled
                  ? 'bg-fuchsia-500/15 border-fuchsia-500/40 text-fuchsia-300'
                  : 'border-neutral-700 text-neutral-500 hover:border-neutral-500 hover:text-neutral-300']"
              title="Sync: new pads start at master loop boundary"
            >
              <Clock class="w-3 h-3" />
              Sync {{ syncEnabled ? 'ON' : 'OFF' }}
            </button>
            <span v-if="mappingStore.learningParamName === 'lm_sync'" class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)] animate-pulse pointer-events-none z-50" />
          </div> -->

          <!-- Sync REC toggle -->
          <!-- <div class="relative">
            <button
              @mousedown.stop
              @click="lmRecSync = !lmRecSync"
              @contextmenu.prevent="openMenu($event, { name: 'lm_rec_sync', label: 'Samples Machine: Rec Sync' })"
              :class="['flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all',
                lmRecSync
                  ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                  : 'border-neutral-700 text-neutral-500 hover:border-neutral-500 hover:text-neutral-300']"
              title="Auto-start Audio Capture recording when first pad fires; auto-stop on Stop All"
            >
              <Circle class="w-3 h-3" :class="lmRecSync && uiStore.isCaptureRecording ? 'fill-rose-400 text-rose-400 animate-pulse' : ''" />
              REC SYNC
            </button>
            <span v-if="mappingStore.learningParamName === 'lm_rec_sync'" class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)] animate-pulse pointer-events-none z-50" />
          </div> -->

          <!-- Manual REC button -->
          <!-- <div class="relative">
            <button
              @mousedown.stop
              @click="uiStore.isCaptureRecording ? manualStopRec() : manualStartRec()"
              @contextmenu.prevent="openMenu($event, { name: 'lm_rec', label: 'Samples Machine: Rec / Stop Rec' })"
              :class="['flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all',
                uiStore.isCaptureRecording
                  ? 'bg-rose-500/20 border-rose-400/60 text-rose-300 animate-pulse'
                  : 'border-neutral-700 text-neutral-500 hover:border-rose-500/50 hover:text-rose-400']"
              :title="uiStore.isCaptureRecording ? 'Stop Capture recording' : 'Start Capture recording now'"
            >
              <Circle class="w-2.5 h-2.5" :class="uiStore.isCaptureRecording ? 'fill-rose-400' : ''" />
              {{ uiStore.isCaptureRecording ? 'Stop' : 'Rec' }}
            </button>
            <span v-if="mappingStore.learningParamName === 'lm_rec'" class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)] animate-pulse pointer-events-none z-50" />
          </div> -->

          <!-- Stop all -->
          <!-- <div class="flex items-center gap-1">
            <div class="relative">
              <button
                @mousedown.stop
                @click="stopAll"
                @contextmenu.prevent="openMenu($event, { name: 'lm_stop_all', label: 'Samples Machine: Stop All' })"
                :disabled="!active.some(Boolean) && !pending.some(Boolean)"
                class="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-neutral-700 text-neutral-500 hover:border-red-500/50 hover:text-red-400 text-[9px] font-black uppercase tracking-widest transition-colors disabled:opacity-30"
                title="Stop all loops"
              >
                <Square class="w-3 h-3 fill-current" /> Stop All
              </button>
              <span v-if="mappingStore.learningParamName === 'lm_stop_all'" class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)] animate-pulse pointer-events-none z-50" />
            </div>
          </div> -->

          <!-- Freesound browser -->
          <button
            @click="uiStore.isFreesoundBrowserOpen = true"
            class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-neutral-700 text-neutral-500 hover:border-cyan-500/40 hover:text-cyan-400 text-[9px] font-black uppercase tracking-widest transition-all"
            title="Browse Freesound"
          >
            <Search class="w-3 h-3" />
            Freesound
          </button>

          <!-- Presets toggle -->
          <button
            @click="showPresetPanel = !showPresetPanel"
            :class="['flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all',
              showPresetPanel
                ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                : 'border-neutral-700 text-neutral-500 hover:border-sky-500/40 hover:text-sky-400']"
            title="Save / Load presets"
          >
            <FolderOpen class="w-3 h-3" />
            Presets
          </button>

          <MacOsButtons @close="uiStore.isLoopMachineOpen = false" @minimize="toggleMinimize" @maximize="maximize" />
        </div>
      </div>

      <!-- Preset panel -->
      <Transition name="lm-preset">
        <div v-if="showPresetPanel" class="shrink-0 border-b border-sky-500/20 bg-sky-950/20 px-4 py-2">
          <div class="flex items-center gap-2 flex-wrap">
            <!-- Save row -->
            <div class="flex items-center gap-1.5 shrink-0">
              <input
                v-model="newPresetName"
                type="text"
                placeholder="Preset name…"
                maxlength="32"
                @mousedown.stop
                @keydown.enter="savePreset"
                class="h-6 px-2 bg-neutral-900 border border-neutral-700 rounded text-[10px] font-mono text-neutral-200 placeholder-neutral-600 outline-none focus:border-sky-500/60 w-36"
              />
              <button
                @mousedown.stop
                @click="savePreset"
                class="flex items-center gap-1 px-2.5 h-6 rounded border border-sky-500/40 bg-sky-500/10 text-sky-300 text-[9px] font-black uppercase tracking-widest hover:bg-sky-500/20 transition-all"
                title="Save current state as preset"
              >
                <Save class="w-3 h-3" /> Save
              </button>
            </div>

            <div class="h-4 w-px bg-neutral-800 shrink-0" />

            <!-- Saved presets -->
            <div v-if="lmPresets.length === 0" class="text-[9px] font-mono text-neutral-600 italic">No presets saved yet</div>
            <div v-else class="flex items-center gap-1.5 flex-wrap">
              <div
                v-for="preset in lmPresets"
                :key="preset.id"
                class="flex items-center gap-0.5 rounded border border-neutral-700 bg-neutral-900/60 overflow-hidden"
              >
                <button
                  @mousedown.stop
                  @click="loadPreset(preset)"
                  class="flex items-center gap-1 px-2 h-6 text-[9px] font-mono text-neutral-300 hover:text-sky-300 hover:bg-sky-500/10 transition-all"
                  :title="`Load: ${preset.name} · saved ${new Date(preset.savedAt).toLocaleString()}`"
                >
                  {{ preset.name }}
                </button>
                <button
                  @mousedown.stop
                  @click="overwritePreset(preset.id)"
                  class="px-1 h-6 text-neutral-600 hover:text-sky-400 hover:bg-sky-500/10 transition-all border-l border-neutral-800"
                  title="Overwrite with current state"
                >
                  <Save class="w-2.5 h-2.5" />
                </button>
                <button
                  @mousedown.stop
                  @click="deletePreset(preset.id)"
                  class="px-1 h-6 text-neutral-600 hover:text-red-400 hover:bg-red-500/10 transition-all border-l border-neutral-800"
                  title="Delete preset"
                >
                  <Trash2 class="w-2.5 h-2.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>

      <!-- Body: pads (left) + mixer (right, always visible) -->
      <div class="flex-1 flex min-h-0 overflow-hidden">

        <!-- Left: Performance Sets + Loop Pads -->
        <div class="flex-1 overflow-auto p-3 flex flex-col gap-3 min-w-0">

          <!-- Performance Sets (16 pads) -->
          <div class="shrink-0">
            <div class="flex items-center gap-2 mb-1.5">
              <BookOpen class="w-3 h-3 text-violet-400/60 shrink-0" />
              <span class="text-[9px] font-black text-neutral-500 uppercase tracking-[0.2em] font-mono">Performance Sets</span>
              <div class="h-px flex-1 bg-neutral-900" />
              <span class="text-[8px] font-mono text-neutral-700">{{ pcSets.length }} saved</span>
            </div>
            <div class="grid grid-cols-8 gap-1.5">
              <button
                v-for="(pad, idx) in setPads"
                :key="'ps-' + idx"
                @click="triggerSetPad(idx)"
                @contextmenu.prevent="openMenu($event, { name: 'lpp_set_' + idx, label: pad.setName || 'Set Pad ' + (idx + 1) })"
                :class="[
                  'relative h-20 rounded-lg border flex flex-col items-center justify-center p-1.5 gap-0.5 transition-all overflow-hidden',
                  pad.setId
                    ? activePerfSetIdx === idx
                      ? 'bg-violet-700/60 border-violet-400 text-white shadow-[0_0_12px_rgba(139,92,246,0.5)]'
                      : 'border-violet-500/40 text-violet-300 hover:bg-violet-500/15 hover:border-violet-400/60'
                    : 'border border-neutral-800 text-neutral-700 cursor-default hover:border-neutral-700'
                ]"
                :title="pad.setId ? `Recall: ${pad.setName}` : `Set Pad ${idx + 1} — assign in Live Set`"
              >
                <span v-if="mappingStore.learningParamName === 'lpp_set_' + idx" class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)] animate-pulse z-50 pointer-events-none" />
                <div v-if="activePerfSetIdx === idx" class="absolute inset-0 bg-white/5 animate-pulse pointer-events-none" />
                <span class="text-[8px] font-black uppercase tracking-tight leading-none text-center truncate w-full px-0.5 z-10">
                  {{ pad.setName || `— ${idx + 1} —` }}
                </span>
                <span v-if="pad.setId" class="text-[6px] font-mono uppercase tracking-widest opacity-40 z-10">SET</span>
              </button>
            </div>
          </div>

          <!-- Loop Pads (24 pads) -->
          <div class="flex-1 min-h-0">
            <div class="flex items-center gap-2 mb-1.5">
              <Layers class="w-3 h-3 text-amber-400/60 shrink-0" />
              <span class="text-[9px] font-black text-neutral-500 uppercase tracking-[0.2em] font-mono">Loop Pads</span>
              <div class="h-px flex-1 bg-neutral-900" />
              <span class="text-[8px] font-mono text-neutral-700">{{ active.filter(Boolean).length + pending.filter(Boolean).length }} active</span>
            </div>
            <div class="grid grid-cols-8 gap-1.5 h-[calc(100%-28px)]" style="grid-template-rows: repeat(3, 1fr)">
              <div
                v-for="(pad, idx) in pads"
                :key="idx"
                @click="pad ? togglePad(idx) : openFolderBrowserForPad(idx)"
                @contextmenu.prevent="openMenu($event, { name: 'lm_pad_' + idx, label: pad?.label || 'Samples Machine Pad ' + (idx + 1) })"
                :class="[
                  'relative group rounded-lg border flex flex-col items-center justify-center cursor-pointer select-none overflow-hidden transition-all duration-150',
                  !pad
                    ? 'border-dashed border-orange-800 hover:border-neutral-600 hover:bg-orange-900/30'
                    : active[idx]
                      ? 'border-amber-800 bg-orange-500/50 shadow-[0_0_14px_rgba(232,121,249,0.25)]'
                      : pending[idx]
                        ? 'border-amber-800/70 bg-orange-400/20'
                        : 'border-orange-700 bg-orange-400/20 hover:border-amber-800/50 hover:bg-orange-500/30',
                ]"
              >
                <!-- Pad number -->
                <span class="absolute top-1 left-1.5 text-[8px] font-black text-neutral-600 leading-none">{{ idx + 1 }}</span>

                <!-- Active indicator -->
                <span v-if="active[idx]" class="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(232,121,249,0.8)] animate-pulse" />

                <!-- Pending-sync icon -->
                <span v-if="pending[idx] && !active[idx]" class="absolute top-1 right-1.5">
                  <Clock class="w-2.5 h-2.5 text-amber-400 animate-pulse" />
                </span>

                <!-- MIDI learning indicator -->
                <span
                  v-if="mappingStore.learningParamName === 'lm_pad_' + idx"
                  class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)] animate-pulse z-50 pointer-events-none"
                />

                <!-- Empty pad -->
                <template v-if="!pad">
                  <Plus class="w-4 h-4 text-neutral-700 group-hover:text-neutral-500 transition-colors" />
                  <span class="text-[7px] text-neutral-700 group-hover:text-neutral-600 mt-0.5 font-mono uppercase tracking-widest">Load</span>
                </template>

                <!-- Loaded pad -->
                <template v-else>
                  <span
                    class="text-[10px] font-mono text-center leading-tight px-1 break-all line-clamp-2"
                    :class="active[idx] ? 'text-fuchsia-200' : 'text-neutral-300'"
                  >{{ pad.label }}</span>
                  <div class="flex items-center gap-1 mt-0.5 flex-wrap justify-center">
                    <span v-if="pad.duration" class="text-[10px] font-mono text-neutral-400">{{ formatTime(pad.duration) }}</span>
                    <span v-if="pad.bpm" class="text-[10px] font-black text-violet-400/80 font-mono">{{ pad.bpm }}bpm</span>
                  </div>
                </template>

                <!-- Volume badge (active pads) -->
                <span
                  v-if="active[idx]"
                  class="absolute bottom-1 left-1.5 text-[8px] font-mono text-cyan-300/80 leading-none bg-black/60 px-0.5 rounded pointer-events-none"
                >{{ Math.round(padVolumes[idx] * 100) }}%</span>

                <!-- Send to Capture button -->
                <button
                  v-if="pad"
                  @click.stop="sendPadToCapture(idx)"
                  class="absolute bottom-0.5 right-5 opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded text-neutral-600 hover:text-sky-400 hover:bg-sky-500/10 transition-all"
                  title="Send to Audio Capture"
                >
                  <Mic class="w-2.5 h-2.5" />
                </button>

                <!-- Clear button -->
                <button
                  v-if="pad"
                  @click.stop="clearPad(idx)"
                  class="absolute bottom-0.5 right-0.5 opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded text-neutral-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                  title="Remove sound"
                >
                  <X class="w-2.5 h-2.5" />
                </button>
              </div>
            </div>
          </div>

        </div>

        <!-- Right: Mixer (always visible) -->
        <div class="w-44 shrink-0 border-l border-neutral-800 flex flex-col bg-neutral-950/60">
          <!-- Mixer header -->
          <div class="shrink-0 px-3 py-1.5 border-b border-neutral-800 flex items-center gap-2">
            <SlidersHorizontal class="w-3 h-3 text-sky-400 shrink-0" />
            <span class="text-[9px] font-black uppercase tracking-[0.2em] text-sky-300">Loops Mixer</span>
            <span class="text-[8px] text-neutral-600 font-mono ml-auto">vol</span>
          </div>

          <!-- Fade controls -->
          <div class="shrink-0 px-2 py-1.5 border-b border-neutral-800 space-y-1">
            <!-- Fade Out -->
            <div class="flex items-center gap-1" title="Stop All fade-out duration (0 = instant, max 10 000 ms)">
              <span class="text-[8px] text-neutral-600 font-mono uppercase tracking-widest w-14 shrink-0">Fade Out</span>
              <input
                type="number"
                min="0" max="10000" step="100"
                v-model.number="fadeOutMs"
                @mousedown.stop @click.stop
                class="flex-1 min-w-0 bg-neutral-900 text-[9px] font-mono text-neutral-300 text-right outline-none border border-neutral-800 rounded px-1 appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span class="text-[8px] text-neutral-600 font-mono shrink-0">ms</span>
            </div>
            <!-- Fade In -->
            <div
              class="flex items-center gap-1 rounded transition-colors"
              title="Auto fade-in: when a pad at volume 0 is triggered, ramp up to the target volume"
            >
              <button
                @mousedown.stop @click.stop="fadeInEnabled = !fadeInEnabled"
                class="text-[8px] font-mono uppercase tracking-widest w-14 shrink-0 text-left transition-colors"
                :class="fadeInEnabled ? 'text-amber-400' : 'text-neutral-600'"
              >Fade In</button>
              <input
                type="number"
                min="0" max="10000" step="100"
                v-model.number="fadeInMs"
                :disabled="!fadeInEnabled"
                @mousedown.stop @click.stop
                class="flex-1 min-w-0 bg-neutral-900 text-[9px] font-mono text-neutral-300 text-right outline-none border border-neutral-800 rounded px-1 appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none disabled:opacity-30"
                title="Fade-in duration (ms)"
              />
              <span class="text-[8px] text-neutral-600 font-mono shrink-0">ms</span>
            </div>
            <!-- Fade In target volume -->
            <div
              v-if="fadeInEnabled"
              class="flex items-center gap-1"
              title="Target volume reached after fade-in (0–1)"
            >
              <span class="text-[8px] text-neutral-600 font-mono uppercase tracking-widest w-14 shrink-0">→ Vol</span>
              <input
                type="number"
                min="0" max="1" step="0.01"
                v-model.number="fadeInVol"
                @mousedown.stop @click.stop
                class="flex-1 min-w-0 bg-neutral-900 text-[9px] font-mono text-amber-300 text-right outline-none border border-amber-800/40 rounded px-1 appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                title="Fade-in target volume"
              />
            </div>
          </div>

          <!-- BPM + session stretch -->
          <div class="shrink-0 px-2 py-1.5 border-b border-neutral-800 space-y-1">
            <div class="flex items-center gap-1" title="Session BPM — updates the global tempo">
              <span class="text-[8px] text-neutral-600 font-mono uppercase tracking-widest w-14 shrink-0">BPM</span>
              <input
                type="number"
                min="20" max="300" step="1"
                v-model.number="lmBpm"
                @mousedown.stop @click.stop
                class="flex-1 min-w-0 bg-neutral-900 text-[9px] font-mono text-sky-300 text-right outline-none border border-neutral-800 rounded px-1 appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>
            <!-- <label
              class="flex items-center gap-1.5 cursor-pointer select-none"
              title="Time-stretch all loops with known BPM to match the session tempo"
            >
              <input
                type="checkbox"
                v-model="lmUseSessionBpm"
                @mousedown.stop @click.stop
                class="accent-sky-400 w-3 h-3 shrink-0"
              />
              <span
                class="text-[8px] font-mono uppercase tracking-widest transition-colors"
                :class="lmUseSessionBpm ? 'text-sky-400' : 'text-neutral-600'"
              >Session BPM</span>
            </label> -->
            <label
              class="flex items-center gap-1.5 cursor-pointer select-none"
              title="Reset slot volume to 0 when a loop is stopped"
            >
              <input
                type="checkbox"
                v-model="lmVolumeReset"
                @mousedown.stop @click.stop
                class="accent-rose-400 w-3 h-3 shrink-0"
              />
              <span
                class="text-[8px] font-mono uppercase tracking-widest transition-colors"
                :class="lmVolumeReset ? 'text-rose-400' : 'text-neutral-600'"
              >Vol Reset</span>
            </label>
          </div>

          <!-- 24 sliders (always shown) -->
          <div class="flex-1 overflow-y-auto custom-scrollbar px-2 py-1.5 space-y-0.5">
            <div
              v-for="(pad, idx) in pads"
              :key="'vol-' + idx"
              @contextmenu.prevent="openMenu($event, { name: 'lm_vol_' + idx, label: 'Samples Machine: Volume Pad ' + (idx + 1) })"
              :class="[
                'relative flex items-center gap-1.5 px-1.5 py-0.5 rounded transition-colors cursor-default',
                mappingStore.learningParamName === 'lm_vol_' + idx
                  ? 'bg-orange-500/10 outline outline-1 outline-orange-500/40'
                  : active[idx]
                    ? 'bg-amber-500/5'
                    : ''
              ]"
              title="Right-click to MIDI learn"
            >
              <!-- Pad number -->
              <span class="text-[8px] font-black text-neutral-600 w-4 shrink-0 text-right leading-none">{{ idx + 1 }}</span>

              <!-- Active dot -->
              <span :class="['w-1 h-1 rounded-full shrink-0', active[idx] ? 'bg-cyan-400 shadow-[0_0_4px_rgba(34,211,238,0.7)]' : 'bg-neutral-800']" />

              <!-- Slider -->
              <input
                type="range"
                min="0" max="1" step="0.01"
                :value="padVolumes[idx]"
                @input="setPadVolume(idx, parseFloat($event.target.value))"
                class="lm-vol-slider flex-1 min-w-0"
              />

              <!-- Value -->
              <span class="text-[8px] font-mono text-neutral-500 w-6 text-right shrink-0 leading-none">
                {{ Math.round(padVolumes[idx] * 100) }}
              </span>

              <!-- MIDI learning dot -->
              <span
                v-if="mappingStore.learningParamName === 'lm_vol_' + idx"
                class="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)] animate-pulse pointer-events-none z-50"
              />
            </div>
          </div>

          <!-- DrumMachine controls -->
          <div class="shrink-0 border-t border-neutral-800">

            <!-- Section header -->
            <div
              class="px-3 py-1.5 border-b border-neutral-800 flex items-center gap-2 cursor-pointer select-none group"
              @mousedown.stop
              @click.stop="uiStore.isDrumMachineOpen = true"
              title="Open Drum Machine"
            >
              <span class="text-[9px] font-black uppercase tracking-[0.2em] text-rose-300/80 group-hover:text-rose-300 transition-colors">Drum Machine</span>
              <span class="ml-auto text-[8px] text-neutral-700 group-hover:text-neutral-500 transition-colors font-mono">↗</span>
            </div>

            <!-- Preset selector -->
            <div class="px-2 py-1.5 border-b border-neutral-800">
              <select
                @change="dmSelectPreset($event.target.value)"
                @mousedown.stop @click.stop
                class="w-full bg-neutral-900 border border-neutral-800 rounded text-[9px] font-mono text-neutral-300 px-1 py-0.5 outline-none cursor-pointer"
              >
                <option value="" disabled selected class="text-neutral-600">— preset —</option>
                <option
                  v-for="p in drumStore.presets"
                  :key="p.id"
                  :value="p.id"
                  class="bg-neutral-900"
                >{{ p.name }}</option>
              </select>
            </div>

            <!-- Pattern switches A–F -->
            <div class="px-2 py-1.5 border-b border-neutral-800 flex gap-0.5">
              <button
                v-for="seq in DM_SEQS"
                :key="seq"
                @mousedown.stop
                @click.stop="dmSwitchSeq(seq)"
                :class="[
                  'flex-1 py-0.5 rounded text-[9px] font-black uppercase border transition-colors',
                  drumStore.activeSequence === seq
                    ? 'bg-rose-500/15 border-rose-500/50 text-rose-300'
                    : 'border-neutral-800 text-neutral-600 hover:border-neutral-600 hover:text-neutral-400'
                ]"
              >{{ seq }}</button>
            </div>

            <!-- Start / Stop sync -->
            <div class="px-2 py-1.5">
              <button
                @mousedown.stop
                @click.stop="drumStore.isPlaying = !drumStore.isPlaying"
                :class="[
                  'w-full flex items-center justify-center gap-1.5 py-1 rounded border text-[9px] font-black uppercase tracking-widest transition-colors',
                  drumStore.isPlaying
                    ? 'border-rose-500/50 text-rose-400 bg-rose-500/10 hover:bg-rose-500/20'
                    : 'border-neutral-700 text-neutral-500 hover:border-rose-500/40 hover:text-rose-400'
                ]"
              >
                <component :is="drumStore.isPlaying ? Square : Play" class="w-2.5 h-2.5" :class="drumStore.isPlaying ? 'fill-rose-400' : ''" />
                {{ drumStore.isPlaying ? 'Stop Drums' : 'Play Drums' }}
              </button>
            </div>

          </div>
        </div>

      </div>

      <div class="flex items-center justify-left gap-2 px-4 py-1.5 border-t border-neutral-800/60 bg-neutral-950/40">
        <!-- Sync toggle -->
          <div class="relative">
            <button
              @mousedown.stop
              @click="syncEnabled = !syncEnabled"
              @contextmenu.prevent="openMenu($event, { name: 'lm_sync', label: 'Samples Machine: Sync' })"
              :class="['flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all',
                syncEnabled
                  ? 'bg-fuchsia-500/15 border-fuchsia-500/40 text-fuchsia-300'
                  : 'border-neutral-700 text-neutral-500 hover:border-neutral-500 hover:text-neutral-300']"
              title="Sync: new pads start at master loop boundary"
            >
              <Clock class="w-3 h-3" />
              Sync {{ syncEnabled ? 'ON' : 'OFF' }}
            </button>
            <span v-if="mappingStore.learningParamName === 'lm_sync'" class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)] animate-pulse pointer-events-none z-50" />
          </div>

          <!-- Sync REC toggle -->
          <div class="relative">
            <button
              @mousedown.stop
              @click="lmRecSync = !lmRecSync"
              @contextmenu.prevent="openMenu($event, { name: 'lm_rec_sync', label: 'Samples Machine: Rec Sync' })"
              :class="['flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all',
                lmRecSync
                  ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                  : 'border-neutral-700 text-neutral-500 hover:border-neutral-500 hover:text-neutral-300']"
              title="Auto-start Audio Capture recording when first pad fires; auto-stop on Stop All"
            >
              <Circle class="w-3 h-3" :class="lmRecSync && uiStore.isCaptureRecording ? 'fill-rose-400 text-rose-400 animate-pulse' : ''" />
              REC SYNC
            </button>
            <span v-if="mappingStore.learningParamName === 'lm_rec_sync'" class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)] animate-pulse pointer-events-none z-50" />
          </div>

          <!-- Manual REC button -->
          <div class="relative">
            <button
              @mousedown.stop
              @click="uiStore.isCaptureRecording ? manualStopRec() : manualStartRec()"
              @contextmenu.prevent="openMenu($event, { name: 'lm_rec', label: 'Samples Machine: Rec / Stop Rec' })"
              :class="['flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all',
                uiStore.isCaptureRecording
                  ? 'bg-rose-500/20 border-rose-400/60 text-rose-300 animate-pulse'
                  : 'border-neutral-700 text-neutral-500 hover:border-rose-500/50 hover:text-rose-400']"
              :title="uiStore.isCaptureRecording ? 'Stop Capture recording' : 'Start Capture recording now'"
            >
              <Circle class="w-2.5 h-2.5" :class="uiStore.isCaptureRecording ? 'fill-rose-400' : ''" />
              {{ uiStore.isCaptureRecording ? 'Stop' : 'Rec' }}
            </button>
            <span v-if="mappingStore.learningParamName === 'lm_rec'" class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)] animate-pulse pointer-events-none z-50" />
          </div>

          <!-- Stop all -->
          <div class="flex items-center gap-1">
            <div class="relative">
              <button
                @mousedown.stop
                @click="stopAll"
                @contextmenu.prevent="openMenu($event, { name: 'lm_stop_all', label: 'Samples Machine: Stop All' })"
                :disabled="!active.some(Boolean) && !pending.some(Boolean)"
                class="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-neutral-700 text-neutral-500 hover:border-red-500/50 hover:text-red-400 text-[9px] font-black uppercase tracking-widest transition-colors disabled:opacity-30"
                title="Stop all loops"
              >
                <Square class="w-3 h-3 fill-current" /> Stop All
              </button>
              <span v-if="mappingStore.learningParamName === 'lm_stop_all'" class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)] animate-pulse pointer-events-none z-50" />
            </div>
          </div>
          <label
              class="flex items-center ml-auto gap-1.5 cursor-pointer select-none"
              title="Time-stretch all loops with known BPM to match the session tempo"
            >
            <button @click.stop="lmUseSessionBpm = !lmUseSessionBpm" class="px-2 rounded border border-neutral-700 flex items-center justify-center transition-colors" :class="lmUseSessionBpm ? 'bg-sky-400 text-black':''">
              <!-- <span v-if="lmUseSessionBpm" class="w-4.5 h-1.5 rounded-full bg-sky-400 shadow-[0_0_4px_rgba(56,189,248,0.7)]" /> -->
              <span
                class="text-[11px] font-mono uppercase tracking-widest transition-colors"
                :class="lmUseSessionBpm ? 'bg-sky-400' : 'text-neutral-600'"
              >Session BPM</span>
            </button>
              <!-- <input
                type="checkbox"
                v-model="lmUseSessionBpm"
                @mousedown.stop @click.stop
                class="accent-sky-400 w-3 h-3 shrink-0"
              /> -->
          </label>
          <span v-if="lmUseSessionBpm" class="text-[11px] font-mono text-sky-500/70 flex items-center gap-1">
            <span class="inline-block w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse shrink-0" />
            ×{{ midiStore.currentBpm }}bpm · playback rate applied
          </span>
          <span v-else class="text-[11px] font-mono text-neutral-600/70 flex items-center gap-1">
            <span class="inline-block w-1.5 h-1.5 rounded-full bg-neutral-600 shrink-0" />
            ×{{ midiStore.currentBpm }}bpm
          </span>
      </div>
      <!-- Footer -->
      <!-- <div class="shrink-0 px-4 py-1.5 border-t border-neutral-800/60 bg-neutral-950/40 flex items-center gap-3">
        
        <span class="text-[9px] text-neutral-700 font-mono">
          Click empty pad to browse folder · Right-click to MIDI learn · Assign from Freesound with <span class="text-fuchsia-500/70">LM</span>
        </span> -->
        <!-- <span v-if="lmUseSessionBpm" class="ml-auto text-[9px] font-mono text-sky-500/70 flex items-center gap-1">
          <span class="inline-block w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse shrink-0" />
          ×{{ midiStore.currentBpm }}bpm · playback rate applied
        </span> -->
      <!-- </div> -->
    </div>
  </Transition>

  <!-- Hidden file input -->
  <input
    ref="fileInputRef"
    type="file"
    accept="audio/*"
    class="hidden"
    @change="handleFileImport"
  />
</template>

<style scoped>
.lm-preset-enter-active,
.lm-preset-leave-active { transition: max-height 0.18s ease, opacity 0.18s ease; overflow: hidden; max-height: 80px; }
.lm-preset-enter-from,
.lm-preset-leave-to { max-height: 0; opacity: 0; }

.lm-vol-slider {
  -webkit-appearance: none;
  appearance: none;
  height: 3px;
  border-radius: 2px;
  background: #2a2a2a;
  outline: none;
  cursor: pointer;
}
.lm-vol-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #38bdf8;
  cursor: pointer;
  box-shadow: 0 0 4px rgba(56, 189, 248, 0.5);
}
.lm-vol-slider::-moz-range-thumb {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #38bdf8;
  cursor: pointer;
  border: none;
  box-shadow: 0 0 4px rgba(56, 189, 248, 0.5);
}
</style>
