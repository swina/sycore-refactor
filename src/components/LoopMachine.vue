<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { Layers, X, Minus, Clock, Plus, Square, Circle, SlidersHorizontal } from 'lucide-vue-next'
import { useUiStore }           from '@/stores/useUiStore'
import { useMidiStore }         from '@/stores/useMidiStore'
import { useArpStore }          from '@/stores/useArpStore'
import { useMappingStore }      from '@/stores/useMappingStore'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import { useFreesoundCache }    from '@/composables/useFreesoundCache'
import { useMidiContextMenu }   from '@/composables/useMidiContextMenu'
import { midiService }          from '@/core/midi/MidiService'
import { loopMachineState }     from '@/core/state/loopMachineState'

const uiStore      = useUiStore()
const midiStore    = useMidiStore()
const arpStore     = useArpStore()
const mappingStore = useMappingStore()
const { openMenu } = useMidiContextMenu()
const { resolveUrl, cacheFileBlob } = useFreesoundCache()

const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront } =
  useDraggableResizable({
    storageKey:    'S1_LOOP_MACHINE_DR',
    minimizeLabel: 'Loop Machine',
    initialWidth:  880,
    initialHeight: 580,
    minWidth:      640,
    minHeight:     400,
    zIndex:        200,
  })

watch(() => uiStore.isLoopMachineOpen, v => { if (v) bringToFront() })

// ── Constants ─────────────────────────────────────────────────────
const LS_KEY    = 'SYCORE_LOOP_MACHINE_PADS'
const PAD_COUNT = 32

// ── Pad state (module-level so it survives re-mounts) ─────────────
function _loadPads() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    const arr = raw ? JSON.parse(raw) : []
    while (arr.length < PAD_COUNT) arr.push(null)
    return arr.slice(0, PAD_COUNT)
  } catch { return Array(PAD_COUNT).fill(null) }
}

const pads       = ref(_loadPads())
const active     = ref(Array(PAD_COUNT).fill(false))
const pending    = ref(Array(PAD_COUNT).fill(false))
const padVolumes = ref(Array(PAD_COUNT).fill(0.85))
const showMixer  = ref(false)
const fadeOutMs  = ref(parseInt(localStorage.getItem('S1_LM_FADE_MS') || '0'))
watch(fadeOutMs, v => localStorage.setItem('S1_LM_FADE_MS', String(v)))

const syncEnabled = ref(localStorage.getItem('S1_LM_SYNC') !== '0')
watch(syncEnabled, v => {
  localStorage.setItem('S1_LM_SYNC', v ? '1' : '0')
  loopMachineState.syncEnabled = v
  window.dispatchEvent(new CustomEvent('lm-state-changed'))
})

// ── Capture recording integration ─────────────────────────────────
const lmRecSync = ref(localStorage.getItem('S1_LM_REC_SYNC') === '1')
watch(lmRecSync, v => {
  localStorage.setItem('S1_LM_REC_SYNC', v ? '1' : '0')
  loopMachineState.recSyncEnabled = v
  window.dispatchEvent(new CustomEvent('lm-state-changed'))
})

// Sync active pads to shared state so Launchpad LEDs can reflect them
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
  try { localStorage.setItem(LS_KEY, JSON.stringify(pads.value)) } catch {}
}

// ── Sync master clock ─────────────────────────────────────────────
let _master = null          // { startedAt: ms, duration: seconds }
const _pendingTimers = {}   // idx → timer id

function _anyLive() {
  return active.value.some(Boolean) || pending.value.some(Boolean)
}

function _setMaster(idx) {
  const pad = pads.value[idx]
  if (!pad) return
  // Prefer BPM-derived 1-bar duration for tighter sync; fall back to file duration
  const dur = pad.bpm ? (4 * (60 / pad.bpm)) : (pad.duration || 4)
  _master = { startedAt: performance.now(), duration: Math.max(0.1, dur) }
}

// ── Audio engine (dual-buffer crossfade — same pattern as LivePerformancePad) ──
let _padCtx = null
const _padWA = Array(PAD_COUNT).fill(null)

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

// rAF loop: swap buffers at the loop boundary (no gap crossfade)
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
  gNxt.gain.cancelScheduledValues(now); gNxt.gain.setValueAtTime(padVolumes.value[idx], now)

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
  if (!pads.value[idx]) return   // cleared while awaiting
  if (!url) { pending.value[idx] = false; return }

  const wa  = _initWA(idx)
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
  wa.gainA.gain.setValueAtTime(padVolumes.value[idx], _getCtx().currentTime)
  wa.rafId = requestAnimationFrame(() => _loopTick(idx))

  if (pad.bpm) {
    arpStore.arpBpm      = pad.bpm
    midiStore.currentBpm = pad.bpm
    midiStore.setBpm(pad.bpm)
  }

  const isFirstPad = !_master
  if (isFirstPad) {
    _setMaster(idx)
    if (lmRecSync.value) {
      window.dispatchEvent(new CustomEvent('capture-start-rec', { detail: { background: true } }))
    }
  }
}

function _stopPad(idx, fadeSec = 0) {
  if (_pendingTimers[idx]) { clearTimeout(_pendingTimers[idx]); delete _pendingTimers[idx] }
  // Mark inactive immediately so _loopTick won't restart the rAF loop
  active.value[idx]  = false
  pending.value[idx] = false

  const wa = _padWA[idx]
  if (wa) {
    if (wa.rafId) { cancelAnimationFrame(wa.rafId); wa.rafId = null }
    const ctx = _getCtx(); const now = ctx.currentTime

    if (fadeSec > 0) {
      wa.gainA.gain.cancelScheduledValues(now)
      wa.gainA.gain.setValueAtTime(wa.gainA.gain.value, now)
      wa.gainA.gain.linearRampToValueAtTime(0, now + fadeSec)
      wa.gainB.gain.cancelScheduledValues(now)
      wa.gainB.gain.setValueAtTime(wa.gainB.gain.value, now)
      wa.gainB.gain.linearRampToValueAtTime(0, now + fadeSec)
      setTimeout(() => {
        wa.a.pause(); wa.a.currentTime = 0
        wa.b.pause(); wa.b.currentTime = 0
        wa.crossing = false
      }, fadeSec * 1000 + 50)
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

  if (active.value[idx]) {
    _stopPad(idx)
    return
  }

  if (pending.value[idx]) {
    // cancel queued sync start
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

// ── External assignment (from FreesoundBrowser) ───────────────────
let _assignHandler = null
let _unsubMidi     = null

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

    const mapping = mappingStore.midiMappings[key]
    if (!mapping) return
    const paramName = typeof mapping === 'object' ? mapping.paramName : mapping
    if (!paramName) return

    // Volume sliders accept the full CC range 0-127 (including 0 = mute)
    if (paramName.startsWith('lm_vol_')) {
      if (!isCC) return
      const idx = parseInt(paramName.slice('lm_vol_'.length))
      if (!isNaN(idx) && idx >= 0 && idx < PAD_COUNT) setPadVolume(idx, byte2 / 127)
      return
    }

    // Toggle params: ignore zero-value CC (treat like note-off)
    if (isCC && byte2 === 0) return

    if (paramName.startsWith('lm_pad_')) {
      const idx = parseInt(paramName.slice('lm_pad_'.length))
      if (!isNaN(idx) && idx >= 0 && idx < PAD_COUNT) togglePad(idx)
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

onMounted(() => {
  _assignHandler = e => {
    const { padIdx, track } = e.detail || {}
    if (padIdx == null || !track || padIdx < 0 || padIdx >= PAD_COUNT) return
    _stopPad(padIdx)
    pads.value[padIdx] = { ...track }
    _savePads()
  }
  window.addEventListener('loop-machine-assign', _assignHandler)
  _startMidiListener()
})

onUnmounted(() => {
  stopAll()
  if (_padCtx) { _padCtx.close().catch(() => {}); _padCtx = null }
  if (_assignHandler) window.removeEventListener('loop-machine-assign', _assignHandler)
  if (_unsubMidi) _unsubMidi()
})
</script>

<template>
  <Transition name="sy-modal">
    <div
      v-show="uiStore.isLoopMachineOpen && !isMinimized"
      :style="panelStyle"
      class="relative bg-neutral-950 border border-amber-500/30 rounded-xl shadow-2xl shadow-black/60 flex flex-col overflow-hidden"
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
            <h2 class="text-sm font-black uppercase tracking-[0.2em] text-white leading-none mb-0.5">LOOP MACHINE</h2>
            <p class="text-[9px] font-mono text-amber-500/60 uppercase tracking-widest leading-none">32 pads · simultaneous loops</p>
          </div>
        </div>

        <div class="flex items-center gap-2 pointer-events-auto">
          <!-- Sync toggle -->
          <div class="relative">
            <button
              @mousedown.stop
              @click="syncEnabled = !syncEnabled"
              @contextmenu.prevent="openMenu($event, { name: 'lm_sync', label: 'Loop Machine: Sync' })"
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
              @contextmenu.prevent="openMenu($event, { name: 'lm_rec_sync', label: 'Loop Machine: Rec Sync' })"
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
              @contextmenu.prevent="openMenu($event, { name: 'lm_rec', label: 'Loop Machine: Rec / Stop Rec' })"
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

          <!-- Mixer toggle -->
          <button
            @mousedown.stop
            @click="showMixer = !showMixer"
            :class="['flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all',
              showMixer
                ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                : 'border-neutral-700 text-neutral-500 hover:border-sky-500/40 hover:text-sky-400']"
            title="Open Mixer"
          >
            <SlidersHorizontal class="w-3 h-3" />
            Mixer
          </button>

          <!-- Fade out + Stop all -->
          <div class="flex items-center gap-1">
            <!-- Fade ms input -->
            <div class="flex items-center gap-1 px-2 py-1 rounded-lg border border-neutral-800 bg-neutral-900/60" title="Stop All fade-out duration (0 = instant, max 10 000 ms)">
              <span class="text-[8px] text-neutral-600 font-mono uppercase tracking-widest shrink-0">Fade</span>
              <input
                type="number"
                min="0" max="10000" step="100"
                v-model.number="fadeOutMs"
                @mousedown.stop
                @click.stop
                class="w-12 bg-transparent text-[9px] font-mono text-neutral-300 text-right outline-none border-none appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span class="text-[8px] text-neutral-600 font-mono shrink-0">ms</span>
            </div>

            <div class="relative">
              <button
                @mousedown.stop
                @click="stopAll"
                @contextmenu.prevent="openMenu($event, { name: 'lm_stop_all', label: 'Loop Machine: Stop All' })"
                :disabled="!active.some(Boolean) && !pending.some(Boolean)"
                class="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-neutral-700 text-neutral-500 hover:border-red-500/50 hover:text-red-400 text-[9px] font-black uppercase tracking-widest transition-colors disabled:opacity-30"
                title="Stop all loops"
              >
                <Square class="w-3 h-3 fill-current" /> Stop All
              </button>
              <span v-if="mappingStore.learningParamName === 'lm_stop_all'" class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)] animate-pulse pointer-events-none z-50" />
            </div>
          </div>

          <button @mousedown.stop @click="toggleMinimize" title="Minimize"
            class="p-1.5 rounded-full hover:bg-white/5 text-neutral-500 hover:text-yellow-400 transition-colors">
            <Minus class="w-4 h-4" />
          </button>
          <button @mousedown.stop @click="uiStore.isLoopMachineOpen = false"
            class="p-1.5 rounded-full hover:bg-white/5 text-neutral-500 hover:text-white transition-colors">
            <X class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- Mixer overlay -->
      <Transition name="sy-fade">
        <div
          v-if="showMixer"
          class="absolute inset-x-0 top-[53px] bottom-[36px] z-40 bg-neutral-950/96 backdrop-blur-sm flex flex-col"
          @mousedown.stop
        >
          <div class="shrink-0 px-4 py-2 border-b border-neutral-800 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <SlidersHorizontal class="w-3.5 h-3.5 text-sky-400" />
              <span class="text-[10px] font-black uppercase tracking-[0.2em] text-sky-300">Mixer</span>
              <span class="text-[9px] text-neutral-500 font-mono ml-1">· per-pad volume</span>
            </div>
            <button @click="showMixer = false" class="p-1 rounded hover:bg-white/5 text-neutral-500 hover:text-white transition-colors">
              <X class="w-3.5 h-3.5" />
            </button>
          </div>

          <div class="flex-1 overflow-y-auto px-4 py-3">
            <div v-if="pads.every(p => !p)" class="h-full flex items-center justify-center">
              <span class="text-[10px] text-neutral-600 font-mono">No sounds loaded yet</span>
            </div>
            <div v-else class="grid gap-2" style="grid-template-columns: repeat(auto-fill, minmax(200px, 1fr))">
              <template v-for="(pad, idx) in pads" :key="idx">
                <div
                  v-if="pad"
                  @contextmenu.prevent="openMenu($event, { name: 'lm_vol_' + idx, label: 'Loop Machine: Volume Pad ' + (idx + 1) })"
                  :class="[
                    'relative flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors',
                    mappingStore.learningParamName === 'lm_vol_' + idx
                      ? 'border-orange-500/60 bg-orange-500/5'
                      : active[idx]
                        ? 'border-amber-500/40 bg-amber-500/5'
                        : 'border-neutral-800 bg-neutral-900/40'
                  ]"
                  title="Right-click to MIDI learn"
                >
                  <!-- Pad number + active dot -->
                  <div class="flex flex-col items-center gap-0.5 shrink-0 w-5">
                    <span class="text-[8px] font-black text-neutral-500 leading-none">{{ idx + 1 }}</span>
                    <span
                      :class="['w-1.5 h-1.5 rounded-full transition-colors', active[idx] ? 'bg-cyan-400 shadow-[0_0_5px_rgba(34,211,238,0.7)]' : 'bg-neutral-700']"
                    />
                  </div>

                  <!-- Label -->
                  <span class="flex-1 text-[9px] text-neutral-300 font-mono truncate min-w-0" :title="pad.label">{{ pad.label }}</span>

                  <!-- Slider -->
                  <input
                    type="range"
                    min="0" max="1" step="0.01"
                    :value="padVolumes[idx]"
                    @input="setPadVolume(idx, parseFloat($event.target.value))"
                    class="lm-vol-slider w-20 shrink-0"
                  />

                  <!-- Value -->
                  <span class="text-[9px] font-mono text-neutral-400 w-8 text-right shrink-0">
                    {{ Math.round(padVolumes[idx] * 100) }}%
                  </span>

                  <!-- MIDI learning indicator -->
                  <span
                    v-if="mappingStore.learningParamName === 'lm_vol_' + idx"
                    class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)] animate-pulse pointer-events-none z-50"
                  />
                </div>
              </template>
            </div>
          </div>
        </div>
      </Transition>

      <!-- Pad grid -->
      <div class="flex-1 overflow-auto p-3 min-h-0">
        <div class="grid grid-cols-8 gap-1.5 h-full" style="grid-template-rows: repeat(4, 1fr)">
          <div
            v-for="(pad, idx) in pads"
            :key="idx"
            @click="pad ? togglePad(idx) : openFileForPad(idx)"
            @contextmenu.prevent="openMenu($event, { name: 'lm_pad_' + idx, label: pad?.label || 'Loop Machine Pad ' + (idx + 1) })"
            :class="[
              'relative group rounded-lg border flex flex-col items-center justify-center cursor-pointer select-none overflow-hidden transition-all duration-150',
              !pad
                ? 'border-dashed border-neutral-800 hover:border-neutral-600 hover:bg-neutral-900/60'
                : active[idx]
                  ? 'border-amber-400 bg-amber-500/40 shadow-[0_0_14px_rgba(232,121,249,0.25)]'
                  : pending[idx]
                    ? 'border-amber-400/70 bg-amber-500/10'
                    : 'border-neutral-700 bg-amber-500/10 hover:border-amber-500/50 hover:bg-amber-500/5',
            ]"
          >
            <!-- Pad number badge -->
            <span class="absolute top-1 left-1.5 text-[8px] font-black text-neutral-600 leading-none">{{ idx + 1 }}</span>

            <!-- Active pulse indicator -->
            <span
              v-if="active[idx]"
              class="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(232,121,249,0.8)] animate-pulse"
            />

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
                class="text-[10px] font-bold text-center leading-tight px-1 break-all line-clamp-2"
                :class="active[idx] ? 'text-fuchsia-200' : 'text-neutral-300'"
              >{{ pad.label }}</span>
              <div class="flex items-center gap-1 mt-1 flex-wrap justify-center">
                <span v-if="pad.duration" class="text-[11px] font-mono text-neutral-400">{{ formatTime(pad.duration) }}</span>
                <span v-if="pad.bpm" class="text-[11px] font-black text-violet-400/80 font-mono">{{ pad.bpm }}bpm</span>
              </div>
            </template>

            <!-- Volume badge (active pads only) -->
            <span
              v-if="active[idx]"
              class="absolute bottom-1 left-1.5 text-[9px] font-mono text-cyan-300/80 leading-none bg-black p-1 rounded pointer-events-none"
            >{{ Math.round(padVolumes[idx] * 100) }}%</span>

            <!-- Clear button (hover on loaded pad) -->
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

      <!-- Footer -->
      <div class="shrink-0 px-4 py-1.5 border-t border-neutral-800/60 bg-neutral-950/40 flex items-center gap-3">
        <span class="text-[9px] text-neutral-700 font-mono">
          Click empty pad to load · Right-click any pad to MIDI learn · Assign from Freesound with <span class="text-fuchsia-500/70">LM</span>
        </span>
        <span class="ml-auto text-[9px] text-neutral-600 font-mono">
          {{ active.filter(Boolean).length + pending.filter(Boolean).length }} active
        </span>
      </div>
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
.lm-vol-slider {
  -webkit-appearance: none;
  appearance: none;
  height: 3px;
  border-radius: 2px;
  background: #404040;
  outline: none;
  cursor: pointer;
}
.lm-vol-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #38bdf8;
  cursor: pointer;
  box-shadow: 0 0 6px rgba(56, 189, 248, 0.5);
}
.lm-vol-slider::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #38bdf8;
  cursor: pointer;
  border: none;
  box-shadow: 0 0 6px rgba(56, 189, 248, 0.5);
}

.sy-fade-enter-active,
.sy-fade-leave-active {
  transition: opacity 0.15s ease;
}
.sy-fade-enter-from,
.sy-fade-leave-to {
  opacity: 0;
}
</style>
