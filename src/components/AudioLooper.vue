<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import {
  X, Minus, RotateCw, Trash2, Mic, Square, Play, Pause,
  Volume2, VolumeX, RefreshCcw, Activity, ChevronRight, Settings2, Bookmark,
  Plus, Search, Grid, List, CheckCircle2, FolderSearch, Music2, SkipBack, Zap, ZapOff,
  MicOff, Settings, Download, ListPlus, Loader2
} from 'lucide-vue-next'
import { useLooperStore } from '@/stores/useLooperStore'
import { useUiStore } from '@/stores/useUiStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { usePresetStore } from '@/stores/usePresetStore'
import { useLivePadStore } from '@/stores/useLivePadStore'
import { looperEngine } from '@/lib/looper-engine'
import { midiService } from '@/core/midi/MidiService'
import { useDraggableResizable } from '@/composables/useDraggableResizable'

const looperStore = useLooperStore()
const uiStore = useUiStore()
const midiStore = useMidiStore()
const presetStore = usePresetStore()
const livePadStore = useLivePadStore()

const devices = ref([])
const selectedDeviceId = ref(localStorage.getItem('S1_LOOPER_DEVICE') || 'default')
const isMonitoring = ref(false)
const midiPulse = ref(false)
const error = ref(null)

const activePadIdx = ref(null)
const showPresetBrowser = ref(false)
const showDeviceSelector = ref(false)

let streamRef = null

const emit = defineEmits(['close'])

const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront } = useDraggableResizable({
  storageKey: 'SYCORE_POS_AUDIO_LOOPER',
  minimizeLabel: 'Audio Looper',
  initialWidth: 1000,
  initialHeight: 720,
  minWidth: 600,
  minHeight: 500,
  zIndex: 160,
})
watch(() => uiStore.isLooperOpen, (v) => { if (v) bringToFront() })

async function refreshDevices() {
  try {
    const all = await navigator.mediaDevices.enumerateDevices()
    devices.value = all.filter(d => d.kind === 'audioinput')
  } catch {}
}

async function startMonitor(deviceId) {
  error.value = null
  let stream = null
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId !== 'default' ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      }
    })
  } catch (e) {
    if (deviceId !== 'default') {
      console.warn('[Looper] Selected audio device failed, falling back to default...', e)
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          }
        })
        selectedDeviceId.value = 'default'
        localStorage.setItem('S1_LOOPER_DEVICE', 'default')
      } catch (fallbackErr) {
        handleMonitorError(fallbackErr)
        return
      }
    } else {
      handleMonitorError(e)
      return
    }
  }

  try {
    streamRef = stream
    
    await looperEngine.init(stream)
    syncEngineParams()
    
    looperEngine.onProgressCallback = (p) => {
      looperStore.progress = p * 100
      looperStore.currentMeasure = Math.floor(p * looperStore.measures)
    }

    isMonitoring.value = true
    await refreshDevices()
  } catch (e) {
    handleMonitorError(e)
  }
}

function handleMonitorError(e) {
  console.error('[Looper] Audio Init Error:', e)
  error.value = "Audio access denied or device not found."
  refreshDevices()
}

function syncEngineParams() {
  looperEngine.setSyncParams(midiStore.currentBpm, looperStore.measures)
}

async function handleDeviceChange(id) {
  selectedDeviceId.value = id
  localStorage.setItem('S1_LOOPER_DEVICE', id)
  if (streamRef) {
    streamRef.getTracks().forEach(t => t.stop())
    streamRef = null
  }
  isMonitoring.value = false
  showDeviceSelector.value = false
  await startMonitor(id)
}

let midiCleanup = null

onMounted(async () => {
  await refreshDevices()
  navigator.mediaDevices?.addEventListener('devicechange', refreshDevices)
  
  midiService.reScanInputs()
  if (!midiService.isReady) {
    setTimeout(() => midiService.reScanInputs(), 1000)
  }
  
  await startMonitor(selectedDeviceId.value)
  
  midiCleanup = midiService.addGlobalNoteOnListener((note, velocity) => {
    midiPulse.value = true
    setTimeout(() => midiPulse.value = false, 100)
    
    if (looperStore.midiTriggerEnabled && looperStore.isArmed && !looperStore.isRecording) {
      if (looperStore.rewindOnRecord) {
        looperEngine.resetPlayback()
        looperStore.resetProgress()
      }
      handleStartRecording()
    }
  })

  midiCleanup = midiService.addTransportListener((type) => {
    if (type === 'start') {
      if (looperStore.midiTriggerEnabled && looperStore.isArmed && !looperStore.isRecording) {
        if (looperStore.rewindOnRecord) {
          looperEngine.resetPlayback()
          looperStore.resetProgress()
        }
        handleStartRecording()
      } else if (!looperEngine.isPlaying) {
        startAll()
      }
    } else if (type === 'stop') {
      if (looperEngine.isPlaying) stopAll()
    }
  })
})

onUnmounted(() => {
  if (midiCleanup) midiCleanup()
  if (streamRef) {
    streamRef.getTracks().forEach(t => t.stop())
  }
  navigator.mediaDevices?.removeEventListener('devicechange', refreshDevices)
})

async function handleStartRecording() {
  if (looperEngine.audioCtx && looperEngine.audioCtx.state === 'suspended') {
    await looperEngine.audioCtx.resume()
  }

  const nextIdx = looperStore.takes.findIndex(t => t.isEmpty)
  if (nextIdx !== -1) {
    looperStore.isArmed = false
    looperStore.isRecording = true
    looperStore.activeTakeIndex = nextIdx
    looperEngine.startArmedRecord(nextIdx)
    
    // If we are not currently playing, start the global transport
    if (!looperStore.isPlaying) {
      looperStore.isPlaying = true
      midiStore.sendStart()
    }
    
    const beatsToRecord = looperStore.takeMeasures * looperStore.beatsPerMeasure
    const msPerBeat = (60 / midiStore.currentBpm) * 1000
    const durationMs = beatsToRecord * msPerBeat
    
    setTimeout(() => {
      if (looperStore.isRecording) handleStopRecording()
    }, durationMs)
  }
}

function handleStopRecording() {
  looperStore.stopRecording()
  looperEngine.stopRecord()
}

function toggleMute(index) {
  looperStore.toggleMute(index)
  const take = looperStore.takes[index]
  if (take) {
    looperEngine.toggleMute(index, take.isMuted)
  }
}

function updateVolume(index, vol) {
  looperStore.setTakeVolume(index, vol)
  looperEngine.setTakeVolume(index, vol)
}

function clearTake(index) {
  looperStore.clearTake(index)
  looperEngine.clearTake(index)
}

function clearAll() {
  looperStore.clearAll()
  looperEngine.clearAll()
  looperEngine.stopAllPlayback()
  looperStore.isPlaying = false
  midiStore.sendStop()
}

function stopAll() {
  looperEngine.stopAllPlayback()
  looperStore.isPlaying = false
  midiStore.sendStop()
}

function startAll() {
  looperEngine.startAll()
  looperStore.isPlaying = true
  midiStore.sendStart()
}

function handleRecordToggle() {
  if (!looperStore.isRecording && !looperStore.isArmed) {
    if (looperStore.midiTriggerEnabled) {
      looperStore.arm()
      if (!looperEngine.isPlaying) {
        looperEngine.startAll()
      }
    } else {
      if (looperStore.rewindOnRecord) {
        looperEngine.resetPlayback()
        looperStore.resetProgress()
      }
      handleStartRecording()
    }
  } else if (looperStore.isArmed) {
    looperStore.isArmed = false
  } else {
    handleStopRecording()
  }
}

async function handleExportMp3() {
  if (looperStore.isExporting) return
  looperStore.isExporting = true
  try {
    const blob = await looperEngine.renderMixdown()
    if (blob) {
      const now = new Date()
      const dateStr = now.toISOString().split('T')[0]
      const timeStr = now.getHours().toString().padStart(2, '0') + '-' + now.getMinutes().toString().padStart(2, '0')
      const label = `SyCore_Loop_${dateStr}-${timeStr}`
      
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${label}.mp3`
      a.click()
      URL.revokeObjectURL(url)
    }
  } catch (e) {
    console.error('[Looper] Export failed', e)
  } finally {
    looperStore.isExporting = false
  }
}

async function handleAddToPlaylist() {
  if (looperStore.isExporting) return
  looperStore.isExporting = true
  try {
    const blob = await looperEngine.renderMixdown()
    if (blob) {
      const now = new Date()
      const dateStr = now.toISOString().split('T')[0]
      const timeStr = now.getHours().toString().padStart(2, '0') + '-' + now.getMinutes().toString().padStart(2, '0')
      const label = `SyCore_Loop_${dateStr}-${timeStr}`
      
      const newTrack = livePadStore.addBlobToPlaylist(blob, label)
      
      // Dispatch event for BackingTrackPlayer to pick it up immediately
      window.dispatchEvent(new CustomEvent('playlist-add-from-capture', {
        detail: { 
          url: newTrack.url, 
          label: label 
        }
      }))
    }
  } catch (e) {
    console.error('[Looper] Add to playlist failed', e)
  } finally {
    looperStore.isExporting = false
  }
}

function handlePadClick(idx) {
  const sound = livePadStore.sounds[idx]
  activePadIdx.value = idx
  
  if (!sound || !sound.name) {
    showPresetBrowser.value = true
  } else {
    if (sound.preset) {
      presetStore.recallPreset(sound.preset)
    }
  }
}

function assignPreset(preset) {
  if (activePadIdx.value !== null) {
    livePadStore.assignPresetToPad(activePadIdx.value, preset)
    presetStore.recallPreset(preset)
    showPresetBrowser.value = false
  }
}

const isDragging = ref(null)
function startDrag(idx, e) {
  isDragging.value = idx
  handleDrag(e)
  window.addEventListener('mousemove', handleDrag)
  window.addEventListener('mouseup', stopDrag)
  window.addEventListener('touchmove', handleTouchDrag)
  window.addEventListener('touchend', stopDrag)
}
function handleTouchDrag(e) {
  if (e.touches.length > 0) handleDrag(e.touches[0])
}
function handleDrag(e) {
  if (isDragging.value === null) return
  const trackId = isDragging.value
  const faderContainer = document.getElementById(`fader-track-${trackId}`)
  if (!faderContainer) return
  const rect = faderContainer.getBoundingClientRect()
  const y = e.clientY - rect.top
  const h = rect.height
  const val = 1 - Math.max(0, Math.min(1, y / h))
  updateVolume(trackId, val)
}
function stopDrag() {
  isDragging.value = null
  window.removeEventListener('mousemove', handleDrag)
  window.removeEventListener('mouseup', stopDrag)
  window.removeEventListener('touchmove', handleTouchDrag)
  window.removeEventListener('touchend', stopDrag)
}

watch(() => midiStore.currentBpm, () => syncEngineParams())
watch(() => looperStore.measures, () => syncEngineParams())

const currentDeviceLabel = computed(() => {
  if (selectedDeviceId.value === 'default') return 'System Default'
  const d = devices.value.find(dev => dev.deviceId === selectedDeviceId.value)
  return d ? d.label : 'Audio Input'
})

const getTakeClass = (index) => {
  const take = looperStore.takes[index]
  const isActive = looperStore.activeTakeIndex === index
  
  return {
    'border-violet-500/40 bg-violet-500/5': isActive && !take.isEmpty,
    'border-white/5 bg-black/20 opacity-40': take.isEmpty,
    'border-rose-500/50 bg-rose-500/10': looperStore.isRecording && isActive,
    'border-amber-500/50 bg-amber-500/10 animate-pulse': looperStore.isArmed && isActive
  }
}

const hasTakes = computed(() => looperStore.takes.some(t => !t.isEmpty))

</script>

<template>
  <div class="bg-neutral-950 z-[1000]border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden relative" :style="panelStyle" v-show="!isMinimized">
      
      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-3 bg-gradient-to-b from-white/5 to-transparent shrink-0 cursor-grab active:cursor-grabbing select-none" @mousedown="onDragStart">
        <div class="flex items-center gap-4">
          <div class="p-2 bg-violet-500/20 rounded-xl border border-violet-500/20">
            <RotateCw class="w-5 h-5 text-violet-400 animate-spin-slow" />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-lg font-black text-white tracking-[0.1em] uppercase">Looper</h2>
              <div class="px-1.5 py-0.5 bg-violet-500/20 rounded text-[9px] font-mono text-violet-400 border border-violet-500/20 uppercase tracking-widest">Live Engine </div><span class="bg-amber-400/70 text-[8px] rounded font-mono px-2 text-black">BETA</span>
            </div>
            <div class="flex items-center gap-3 mt-0.5">
              <button 
                @click="showDeviceSelector = true"
                class="flex items-center gap-1.5 group hover:text-white transition-colors"
              >
                <span class="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Input:</span>
                <span class="text-cyan-400 text-[10px] font-mono font-bold">{{ currentDeviceLabel }}</span>
                <Settings class="w-3 h-3 text-neutral-600 group-hover:text-cyan-400" />
              </button>
            </div>
          </div>
        </div>
        
        <div class="flex items-center gap-4 text-[10px] font-mono font-bold text-white">
          <span class="text-neutral-500 uppercase tracking-tighter">Sync</span> {{ midiStore.currentBpm }} BPM
        </div>

        <div class="flex items-center gap-2">
          <button @click="toggleMinimize" title="Minimize"
            class="p-2 hover:bg-white/5 rounded-full transition-all active:scale-90 text-neutral-500 hover:text-yellow-400">
            <Minus class="w-4 h-4" />
          </button>
          <button @click="uiStore.isLooperOpen = false" class="p-2 hover:bg-white/5 rounded-full transition-all active:scale-90">
            <X class="w-5 h-5 text-neutral-500 hover:text-white" />
          </button>
        </div>
      </div>

      <!-- Main Layout -->
      <div class="flex-1 overflow-hidden flex flex-col p-6 pt-2 space-y-5 min-h-0">
        
        <!-- Config & Timeline -->
        <div class="grid grid-cols-12 gap-6 items-end shrink-0">
          <div class="col-span-3 space-y-2">
             <label class="text-[8px] font-black text-neutral-500 uppercase tracking-widest flex items-center gap-1.5">
              <RefreshCcw class="w-3 h-3 text-cyan-400" /> Loop Cycles
            </label>
            <div class="flex p-1 bg-black/40 border border-white/5 rounded-xl h-9 shadow-inner">
              <button v-for="m in [1, 2, 4, 8, 16]" :key="m" @click="looperStore.measures = m"
                :class="['flex-1 text-[10px] font-mono font-bold rounded-lg transition-all', looperStore.measures === m ? 'bg-cyan-600 text-white shadow-lg' : 'text-neutral-500 hover:text-white']">
                {{ m }}
              </button>
            </div>
          </div>

          <div class="col-span-3 space-y-2">
            <label class="text-[8px] font-black text-neutral-500 uppercase tracking-widest flex items-center gap-1.5">
              <Settings2 class="w-3 h-3 text-violet-400" /> Rec Length
            </label>
            <div class="flex p-1 bg-black/40 border border-white/5 rounded-xl h-9 shadow-inner">
              <button v-for="m in [1, 2, 4, 8]" :key="m" @click="looperStore.takeMeasures = m"
                :class="['flex-1 text-[10px] font-mono font-bold rounded-lg transition-all', looperStore.takeMeasures === m ? 'bg-violet-600 text-white shadow-lg' : 'text-neutral-500 hover:text-white']">
                {{ m }}
              </button>
            </div>
          </div>

          <!-- Timeline -->
          <div class="col-span-6 space-y-2">
            <div class="flex justify-between px-1">
              <span v-for="m in looperStore.measures" :key="m" class="text-[8px] font-black text-white/10 uppercase">Bar {{ m }}</span>
            </div>
            <div class="h-9 bg-black/60 rounded-xl border border-white/5 p-1 relative group overflow-hidden shadow-inner">
              <div class="absolute inset-0 flex pointer-events-none">
                <div v-for="m in looperStore.measures" :key="m" class="flex-1 border-r border-white/5 last:border-0"></div>
              </div>
              <div class="h-full bg-gradient-to-r from-violet-600 via-cyan-500 to-emerald-400 rounded-lg shadow-[0_0_20px_rgba(139,92,246,0.2)] transition-all duration-100 ease-linear relative"
                :style="{ width: looperStore.progress + '%' }"></div>
              <div class="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_10px_white] z-10" :style="{ left: `calc(${looperStore.progress}% - 1px)` }"></div>
            </div>
          </div>
        </div>

        <!-- Mixer Area -->
        <div class="flex-1 bg-black/40 border border-white/5 rounded-[2rem] p-6 flex gap-4 overflow-x-auto custom-scrollbar min-h-0 shadow-2xl">
          <div v-for="(take, index) in looperStore.takes" :key="take.id"
            class="flex-1 min-w-[90px] flex flex-col p-4 rounded-2xl border transition-all duration-500 relative group/track shadow-lg"
            :class="getTakeClass(index)">
            <div class="flex-1 flex flex-col items-center mb-3">
              <div :id="`fader-track-${index}`" class="relative w-10 h-full flex items-center justify-center cursor-ns-resize"
                @mousedown="startDrag(index, $event)" @touchstart.prevent="startDrag(index, $event)">
                <div class="w-3.5 h-full bg-black/60 rounded-full border border-white/10 relative overflow-hidden">
                  <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-violet-600 to-cyan-400 transition-all duration-75"
                    :style="{ height: (take.volume * 100) + '%' }"></div>
                </div>
                <div class="absolute left-1/2 -translate-x-1/2 w-10 h-4 bg-neutral-100 rounded border border-neutral-400 shadow-xl z-20 flex flex-col items-center justify-center gap-0.5 pointer-events-none"
                  :style="{ bottom: `calc(${take.volume * 100}% - 8px)` }">
                  <div class="w-6 h-[1.5px] bg-neutral-400"></div>
                  <div class="w-6 h-[1.5px] bg-neutral-400"></div>
                </div>
              </div>
            </div>
            <div class="text-center space-y-0.5 mb-2 shrink-0">
              <div class="text-[9px] font-black text-white/30 uppercase tracking-widest">{{ take.name }}</div>
              <div class="text-[10px] font-mono font-bold" :class="take.volume > 0.8 ? 'text-rose-400' : 'text-cyan-400'">{{ Math.round(take.volume * 100) }}%</div>
            </div>
            <div class="flex items-center justify-between pt-3 border-t border-white/5 shrink-0">
              <button @click="toggleMute(index)" class="p-2 rounded-lg transition-all active:scale-90" :class="take.isMuted ? 'bg-rose-500/20 text-rose-400' : 'hover:bg-white/5 text-neutral-600 hover:text-white'">
                <VolumeX v-if="take.isMuted" class="w-4 h-4" />
                <Volume2 v-else class="w-4 h-4" />
              </button>
              <button @click="clearTake(index)" class="p-2 rounded-lg hover:bg-rose-500/20 text-neutral-700 hover:text-rose-400 transition-all active:scale-90">
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
            <div v-if="looperStore.activeTakeIndex === index" class="absolute inset-0 border border-violet-500/30 rounded-2xl pointer-events-none"></div>
          </div>
        </div>

        <!-- Dashboard -->
        <div class="grid grid-cols-12 gap-6 items-center shrink-0">
          <!-- Transport & Options -->
          <div class="col-span-4 flex flex-col gap-2.5">
            <div class="bg-neutral-900/80 border border-white/10 p-1.5 rounded-[1.5rem] flex items-center gap-1 shadow-2xl">
              <button @click="clearAll" class="w-12 h-12 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 transition-all text-neutral-500 hover:text-rose-400">
                <RefreshCcw class="w-5 h-5" />
              </button>
              <div class="flex-1 flex items-center justify-center gap-3">
                <button @click="stopAll" class="p-2 transition-all" :class="!looperStore.isPlaying ? 'text-white' : 'text-neutral-600 hover:text-white'"><Square class="w-5 h-5 fill-current" /></button>
                <button @click="startAll" class="p-2 transition-all" :class="looperStore.isPlaying ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'text-neutral-600 hover:text-white'"><Play class="w-5 h-5 fill-current" /></button>
              </div>
              <button 
                @click="handleRecordToggle"
                class="w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 border-2"
                :class="[
                  looperStore.isRecording ? 'bg-rose-600 border-rose-400 animate-pulse shadow-[0_0_15px_rgba(244,63,94,0.4)]' : 
                  looperStore.isArmed ? 'bg-amber-500 border-amber-300 scale-105' : 
                  'bg-white/5 border-transparent hover:bg-white/10 text-white'
                ]"
              >
                <Mic v-if="!looperStore.isRecording && !looperStore.isArmed" class="w-6 h-6" />
                <MicOff v-else-if="looperStore.isArmed" class="w-6 h-6" />
                <Square v-else class="w-6 h-6" />
              </button>
            </div>

            <div class="flex gap-2">
              <button @click="looperStore.rewindOnRecord = !looperStore.rewindOnRecord"
                class="flex-1 h-9 flex items-center justify-center gap-2 bg-neutral-900 border border-white/5 rounded-xl transition-all"
                :class="looperStore.rewindOnRecord ? 'text-amber-400 border-amber-500/20' : 'text-neutral-600 opacity-60'">
                <SkipBack class="w-3.5 h-3.5" />
                <span class="text-[9px] font-black uppercase tracking-widest">Rewind</span>
              </button>
              <button @click="looperStore.midiTriggerEnabled = !looperStore.midiTriggerEnabled"
                class="flex-1 h-9 flex items-center justify-center gap-2 bg-neutral-900 border border-white/5 rounded-xl transition-all"
                :class="looperStore.midiTriggerEnabled ? 'text-cyan-400 border-cyan-500/20' : 'text-neutral-600 opacity-60'">
                <Zap v-if="looperStore.midiTriggerEnabled" class="w-3.5 h-3.5 fill-current" />
                <ZapOff v-else class="w-3.5 h-3.5" />
                <span class="text-[9px] font-black uppercase tracking-widest">Sync</span>
              </button>
            </div>
          </div>

          <!-- Export & Mixdown Actions -->
          <div class="col-span-2 flex flex-col gap-2">
             <div class="text-[8px] font-black text-neutral-500 uppercase tracking-widest flex items-center gap-2 px-1">
              <Activity class="w-3 h-3 text-emerald-400" /> Export Mix
            </div>
            <div class="flex flex-col gap-2 p-2 bg-neutral-900/40 border border-white/5 rounded-2xl">
              <button 
                @click="handleExportMp3"
                :disabled="!hasTakes || looperStore.isExporting"
                class="h-10 rounded-xl flex items-center justify-center gap-2 transition-all border border-white/5 shadow-lg group relative overflow-hidden"
                :class="hasTakes ? 'bg-white/5 text-white hover:bg-emerald-500/20 hover:border-emerald-500/30' : 'opacity-20 cursor-not-allowed'"
              >
                <Loader2 v-if="looperStore.isExporting" class="w-4 h-4 animate-spin text-emerald-400" />
                <Download v-else class="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                <span class="text-[9px] font-black uppercase tracking-widest">MP3 Export</span>
              </button>
              
              <button 
                @click="handleAddToPlaylist"
                :disabled="!hasTakes || looperStore.isExporting"
                class="h-10 rounded-xl flex items-center justify-center gap-2 transition-all border border-white/5 shadow-lg group"
                :class="hasTakes ? 'bg-white/5 text-white hover:bg-sky-500/20 hover:border-sky-500/30' : 'opacity-20 cursor-not-allowed'"
              >
                <Loader2 v-if="looperStore.isExporting" class="w-4 h-4 animate-spin text-sky-400" />
                <ListPlus v-else class="w-4 h-4 text-sky-400 group-hover:scale-110 transition-transform" />
                <span class="text-[9px] font-black uppercase tracking-widest">+ Playlist</span>
              </button>
            </div>
          </div>

          <!-- Pads Section -->
          <div class="col-span-6 flex flex-col gap-2">
            <div class="flex items-center justify-between px-1">
              <div class="text-[9px] font-black text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                <Bookmark class="w-3 h-3 text-violet-500" /> Sound Slots
              </div>
              <button 
                @click="showPresetBrowser = true" :disabled="activePadIdx === null"
                class="px-3 py-1 rounded-lg flex items-center gap-2 transition-all border-2 text-[9px] font-black uppercase tracking-widest"
                :class="activePadIdx !== null ? 'bg-violet-600 border-violet-400 text-white shadow-lg shadow-violet-600/20' : 'bg-neutral-900 border-white/5 text-neutral-600 grayscale'"
              >
                <FolderSearch class="w-3.5 h-3.5" /> Load
              </button>
            </div>
            <div class="grid grid-cols-8 gap-1.5">
              <button v-for="i in 8" :key="i" @click="handlePadClick(i - 1)"
                class="aspect-square border rounded-xl flex flex-col items-center justify-center gap-1 transition-all relative overflow-hidden group shadow-xl"
                :class="[activePadIdx === i - 1 ? 'bg-rose-600 border-rose-400 shadow-rose-600/30' : (livePadStore.sounds[i-1]?.name ? 'bg-neutral-900 border-white/10 hover:bg-neutral-800' : 'bg-black/40 border-dashed border-white/10 opacity-40 hover:opacity-100')]">
                <div class="text-[9px] font-black" :class="activePadIdx === i - 1 ? 'text-white' : 'text-neutral-600 group-hover:text-white'">{{ i }}</div>
                <div v-if="livePadStore.sounds[i-1]?.name" class="text-[7px] font-black uppercase truncate px-1 text-center w-full leading-tight text-white/60 group-hover:text-white">{{ livePadStore.sounds[i-1].name }}</div>
                <Plus v-else class="w-3 h-3 text-neutral-800" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Overlays -->
      <Transition name="fade">
        <div v-if="showDeviceSelector" class="absolute inset-0 z-[180] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-6">
          <div class="bg-neutral-900 border border-white/10 rounded-3xl w-full max-lg p-6 shadow-2xl">
            <div class="flex items-center justify-between mb-6">
              <div class="flex items-center gap-3"><Settings class="w-6 h-6 text-cyan-400" /><h3 class="text-xl font-black text-white uppercase tracking-widest">Audio Source</h3></div>
              <button @click="showDeviceSelector = false" class="p-2 hover:bg-white/5 rounded-full"><X class="w-6 h-6 text-neutral-500" /></button>
            </div>
            <div class="space-y-2 max-h-[50vh] overflow-y-auto custom-scrollbar pr-2">
              <button @click="handleDeviceChange('default')" class="w-full p-4 rounded-2xl flex items-center justify-between transition-all border-2" :class="selectedDeviceId === 'default' ? 'bg-cyan-500/10 border-cyan-500/40 text-white' : 'bg-white/5 border-transparent hover:bg-white/10 text-neutral-400'">
                <span class="font-bold">System Default</span><CheckCircle2 v-if="selectedDeviceId === 'default'" class="w-5 h-5 text-cyan-400" />
              </button>
              <button v-for="d in devices" :key="d.deviceId" @click="handleDeviceChange(d.deviceId)" class="w-full p-4 rounded-2xl flex items-center justify-between transition-all border-2" :class="selectedDeviceId === d.deviceId ? 'bg-cyan-500/10 border-cyan-500/40 text-white' : 'bg-white/5 border-transparent hover:bg-white/10 text-neutral-400'">
                <span class="font-bold truncate pr-4">{{ d.label || 'Audio Input' }}</span><CheckCircle2 v-if="selectedDeviceId === d.deviceId" class="w-5 h-5 text-cyan-400" />
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <Transition name="fade">
        <div v-if="showPresetBrowser" class="absolute inset-0 z-[170] bg-black/95 backdrop-blur-2xl flex flex-col p-12">
          <div class="flex items-center justify-between mb-8">
            <div class="flex items-center gap-4"><div class="p-3 bg-violet-600 rounded-2xl shadow-xl border border-white/10"><Music2 class="w-7 h-7 text-white" /></div><div><h3 class="text-2xl font-black text-white uppercase tracking-widest">Sound for Pad {{ (activePadIdx || 0) + 1 }}</h3><p class="text-[10px] text-white/30 uppercase font-black tracking-[0.4em] mt-1 italic">Sy.Core Library Select</p></div></div>
            <button @click="showPresetBrowser = false" class="p-4 hover:bg-white/5 rounded-full transition-all"><X class="w-8 h-8 text-neutral-500 hover:text-white" /></button>
          </div>
          <div class="flex-1 overflow-y-auto custom-scrollbar pr-4">
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <button v-for="p in presetStore.history" :key="p.id" @click="assignPreset(p)" class="flex flex-col p-5 bg-white/5 border border-white/5 rounded-2xl hover:border-violet-500/50 hover:bg-violet-500/10 transition-all text-left group shadow-lg">
                <div class="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">{{ p.category }}</div><div class="text-sm font-bold text-white group-hover:text-violet-400 transition-colors truncate">{{ p.name }}</div>
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <!-- Footer -->
      <div class="px-8 py-2 bg-white/5 border-t border-white/5 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-3">
          <Activity class="w-3.5 h-3.5 text-emerald-400" />
          <span class="text-[8px] font-mono text-neutral-600 uppercase tracking-[0.2em] font-black">Audio Core Online</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-1.5 h-1.5 rounded-full transition-all" :class="midiPulse ? 'bg-white shadow-[0_0_10px_white]' : 'bg-emerald-500'"></div>
          <span class="text-[8px] font-mono text-neutral-700 uppercase tracking-widest font-bold">MIDI Activity</span>
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
</template>

<style scoped>
.animate-spin-slow { animation: spin 15s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.3); border-radius: 10px; }
.fade-enter-active, .fade-leave-active { transition: all 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: scale(0.95); }
.cursor-ns-resize { user-select: none; touch-action: none; }
</style>
