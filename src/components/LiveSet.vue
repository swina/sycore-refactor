<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { X, Trash2, GripVertical, ListMusic, ClockArrowDown, SkipBack, Play, Pause, SkipForward, ChevronLeft, ChevronRight, Bookmark } from 'lucide-vue-next'
import { useMidiStore } from '@/stores/useMidiStore'
import { usePresetStore } from '@/stores/usePresetStore'
import { useLivePadStore } from '@/stores/useLivePadStore'
import { useLocalStorage } from '@/composables/useLocalStorage'
import { useConfigStore } from '@/stores/useConfigStore'
import { S1_CC_MAP, FIELD_TO_CC } from '@/constants/s1-config'
import PlayList from '@/components/PlayList.vue'
import PlaylistPadGrid from '@/components/PlaylistPadGrid.vue' // Import the new component

const props = defineProps({
  isOpen: Boolean,
  isAdmin: Boolean,
})
const emit = defineEmits(['close'])

const midiStore = useMidiStore()
const presetStore = usePresetStore()
const configStore = useConfigStore()
const livePadStore = useLivePadStore()

const { state: paramsStorage } = useLocalStorage('S1_LIVESET_PARAMS', Array(8).fill(null).map(() => ({ label: '', cc: -1 })))
const { state: sliderModeStorage } = useLocalStorage('S1_LIVESET_SLIDER_MODE', 'vertical')
const { state: currentIdxStorage } = useLocalStorage('S1_LIVESET_CURRENT', -1)
const { state: sendPcStorage } = useLocalStorage('S1_LIVESET_SEND_PC', true)
const { state: padSyncStorage } = useLocalStorage('S1_LIVESET_PAD_SYNC', false)

const sounds = computed(() => livePadStore.sounds)
const params      = ref([])
const sliderMode  = ref('vertical')
const currentIdx = computed({
  get: () => livePadStore.activePadIndex,
  set: (v) => { livePadStore.activePadIndex = v }
})
const paramValues = ref(Array(8).fill(64))
const sendPcEnabled = ref(sendPcStorage.value !== false)
const padSyncEnabled = ref(padSyncStorage.value === true)
const tab         = ref('perf')
const setupTab    = ref('sounds')

// Preset Library Browsing (Evaluation & Assignment)
const libraryIdx = ref(-1)
const currentLibraryPreset = computed(() => {
  if (libraryIdx.value < 0 || !presetStore.history.length) return null
  return presetStore.history[libraryIdx.value]
})

function nextLibraryPreset() {
  if (!presetStore.history.length) return
  libraryIdx.value = (libraryIdx.value + 1) % presetStore.history.length
  evaluateLibraryPreset()
}

function prevLibraryPreset() {
  if (!presetStore.history.length) return
  libraryIdx.value = (libraryIdx.value - 1 + presetStore.history.length) % presetStore.history.length
  evaluateLibraryPreset()
}

function evaluateLibraryPreset() {
  const p = currentLibraryPreset.value
  if (!p) return
  presetStore.recallPreset(p, false)
  currentIdx.value = -1 // Enter browser/assignment mode
}

function exitLibraryBrowser() {
  libraryIdx.value = -1
}

// Sync store state to local reactive values for the template
const playlist = computed(() => livePadStore.playlist)
const playlistRepeats = computed(() => livePadStore.playlistRepeats)
const playlistIdx = computed(() => livePadStore.playlistIdx)
const playlistCurrentRepeat = computed(() => livePadStore.playlistCurrentRepeat)
const crossfadeSec = computed(() => livePadStore.crossfadeSec)
const loopPlaylist = computed(() => livePadStore.loopPlaylist)
const isPlaylistMode = computed(() => playlistIdx.value >= 0 && playlist.value.length > 0)
const currentTime = ref(0)
const duration = ref(0)
const isPlaying = ref(false)
const volume = ref(0.5)
const totalPlaylistDuration = ref(0)

const totalCurrentTime = computed(() => {
  if (playlistIdx.value < 0 || playlist.value.length === 0) return 0
  let elapsed = 0
  for (let i = 0; i < playlistIdx.value; i++) {
    elapsed += playlist.value[i]?.duration || 0
  }
  return elapsed + currentTime.value
})

const totalProgressPct = computed(() => {
  if (totalPlaylistDuration.value <= 0) return 0
  return Math.min(100, (totalCurrentTime.value / totalPlaylistDuration.value) * 100)
})

function playFromPlaylist(idx) { 
  window.dispatchEvent(new CustomEvent('playlist-play', { detail: { idx } })) 
}
function clearPlaylist() { window.dispatchEvent(new CustomEvent('playlist-clear')) }

function mutatePlaylist(key, value) { window.dispatchEvent(new CustomEvent('playlist-mutate', { detail: { key, value } })) }
function prevTrack() { window.dispatchEvent(new CustomEvent('playlist-prev')) }
function nextTrack() { window.dispatchEvent(new CustomEvent('playlist-next')) }
function togglePlayStop() { window.dispatchEvent(new CustomEvent('playlist-play-stop')) }
function handlePlaylistToggle(idx) {
  if (typeof idx === 'number') playFromPlaylist(idx)
  else togglePlayStop()
}
function seekTrack(pos) { window.dispatchEvent(new CustomEvent('playlist-seek', { detail: pos })) }
function updateVolume(v) { 
  volume.value = v; 
  window.dispatchEvent(new CustomEvent('playlist-volume', { detail: v })) 
}

const S1_CC_OPTIONS = computed(() => {
  return (configStore.midiConfig || [])
    .filter(cfg => cfg.cc !== undefined && cfg.cc !== null)
    .map(cfg => ({ cc: Number(cfg.cc), label: cfg.label || cfg.name || `CC ${cfg.cc}` }))
    .sort((a, b) => a.label.localeCompare(b.label))
})

function loadParams() {
  try {
    const p = paramsStorage.value
    if (Array.isArray(p) && p.length === 8) return p
  } catch {}
  return Array(8).fill(null).map(() => ({ label: '', cc: -1 }))
}

function restoreSelection() {
  const idx = currentIdx.value
  if (idx < 0 || idx >= sounds.value.length) return
  const sound = sounds.value[idx]
  paramValues.value = Array(8).fill(64)
  if (sound?.paramValues) {
    Object.entries(sound.paramValues).forEach(([slot, val]) => {
      paramValues.value[parseInt(slot)] = val
    })
  }
}

function onSelectPad(e) {
  const idx = e.detail?.idx
  if (typeof idx === 'number' && idx >= 0 && idx < 16) selectSound(idx)
}

function onNavigate(e) {
  const populated = sounds.value.map((s, i) => ({ s, i })).filter(({ s }) => s.name)
  if (!populated.length) return
  const cur = populated.findIndex(({ i }) => i === currentIdx.value)
  const dir = e.detail?.dir
  const next = dir === 'up'
    ? populated[Math.max(0, cur - 1)]
    : populated[Math.min(populated.length - 1, cur + 1)]
  if (next) selectSound(next.i)
}

function handleStateUpdate(e) {
  const d = e.detail
  if (d.currentTime !== undefined) currentTime.value = d.currentTime
  if (d.duration !== undefined) duration.value = d.duration
  if (d.isPlaying !== undefined) isPlaying.value = d.isPlaying
  if (d.volume !== undefined) volume.value = d.volume
  
  // Update store for session state
  if (d.playlistIdx !== undefined) livePadStore.playlistIdx = d.playlistIdx
  if (d.playlist !== undefined) {
    // AUTO-POPULATE: If both session and active playlist are empty, but library has tracks
    if (livePadStore.playlist.length === 0 && d.playlist.length === 0 && d.tracks?.length > 0) {
      const autoPlaylist = d.tracks.slice(0, 16)
      livePadStore.playlist = autoPlaylist
      // Sync back to player
      window.dispatchEvent(new CustomEvent('playlist-mutate', { detail: { key: 'playlist', value: autoPlaylist } }))
      window.dispatchEvent(new CustomEvent('playlist-mutate', { detail: { key: 'playlistRepeats', value: Array(autoPlaylist.length).fill(1) } }))
    } else {
      // Normal sync: Player is the source of truth
      livePadStore.playlist = d.playlist
    }
  }
  if (d.playlistRepeats !== undefined) livePadStore.playlistRepeats = d.playlistRepeats
  if (d.crossfadeSec !== undefined) livePadStore.crossfadeSec = d.crossfadeSec
  if (d.loopPlaylist !== undefined) livePadStore.loopPlaylist = d.loopPlaylist
  if (d.playlistCurrentRepeat !== undefined) livePadStore.playlistCurrentRepeat = d.playlistCurrentRepeat
  
  if (d.totalPlaylistDuration !== undefined) totalPlaylistDuration.value = d.totalPlaylistDuration
}

onMounted(() => {
  params.value = loadParams()
  sliderMode.value = sliderModeStorage.value || 'vertical'
  if (props.isOpen) tab.value = 'perf'
  restoreSelection()
  window.addEventListener('liveset-select-pad', onSelectPad)
  window.addEventListener('liveset-navigate', onNavigate)
  window.addEventListener('player-state-sync', handleStateUpdate)
  window.dispatchEvent(new CustomEvent('player-state-request'))
})

watch(() => [params.value, sliderMode.value, sendPcEnabled.value, padSyncEnabled.value], () => {
  paramsStorage.value = params.value
  sliderModeStorage.value = sliderMode.value
  sendPcStorage.value = sendPcEnabled.value
  padSyncStorage.value = padSyncEnabled.value
}, { deep: true })

watch(currentIdx, (v) => { currentIdxStorage.value = v })

function validatePadsAgainstBank() {
  if (!presetStore.history || presetStore.history.length === 0) return
  sounds.value.forEach((sound, idx) => {
    if (sound.name) {
      const matchedPreset = presetStore.history.find(p => p.name === sound.name)
      if (!matchedPreset) {
        console.warn(`[LiveSet] Sound "${sound.name}" not found in current bank. Clearing pad ${idx + 1}.`)
        clearSound(idx)
      } else if (!sound.preset) {
        // Auto-upgrade legacy pad to store full preset and build accurate CC mapping
        console.log(`[LiveSet] Auto-upgrading legacy pad ${idx + 1} with full preset for "${sound.name}"`)
        const activeVariant = presetStore.useAlternativeEngine ? matchedPreset.bVariant : matchedPreset.aVariant
        const dataValues = activeVariant?.data || matchedPreset.aVariant?.data || matchedPreset.data || {}
        
        const ccData = {}
        Object.entries(dataValues).forEach(([field, val]) => {
          const cc = FIELD_TO_CC[field]
          if (cc !== undefined) {
            ccData[cc] = val
          }
        })
        
        livePadStore.updateSound(idx, {
          preset: JSON.parse(JSON.stringify(matchedPreset)),
          ccData: ccData
        })
      }
    }
  })
}

watch(() => presetStore.history, (newHistory) => {
  if (newHistory && newHistory.length > 0) {
    validatePadsAgainstBank()
  }
}, { immediate: true })

watch(() => props.isOpen, (open) => {
  if (!open) return
  tab.value = 'perf'
  restoreSelection()
})

onUnmounted(() => {
  window.removeEventListener('liveset-select-pad', onSelectPad)
  window.removeEventListener('liveset-navigate', onNavigate)
  window.removeEventListener('player-state-sync', handleStateUpdate)
})

function sendParamCC(slotIdx, val) {
  if (slotIdx < 0 || slotIdx >= params.value.length) return
  const p = params.value[slotIdx]
  if (!p || p.cc < 0) return
  midiStore.sendCC(p.cc, val)
}

function selectSound(idx) {
  if (idx < 0 || idx >= livePadStore.sounds.length) return
  
  // Toggle logic
  if (currentIdx.value === idx) {
    currentIdx.value = -1
    return
  }

  // IF we are in Library Evaluation mode, Clicking a pad ASSIGNS the sound
  if (currentLibraryPreset.value) {
    const p = currentLibraryPreset.value
    
    // Construct ccData from the active variant or layout data
    const activeVariant = presetStore.useAlternativeEngine ? p.bVariant : p.aVariant
    const dataValues = activeVariant?.data || p.aVariant?.data || p.data || {}
    
    const ccData = {}
    Object.entries(dataValues).forEach(([field, val]) => {
      const cc = FIELD_TO_CC[field]
      if (cc !== undefined) {
        ccData[cc] = val
      }
    })

    livePadStore.updateSound(idx, {
      name: p.name,
      category: p.category,
      ccData: ccData,
      paramValues: Array(8).fill(64),
      preset: JSON.parse(JSON.stringify(p))
    })
    currentIdx.value = idx
    return
  }

  // Normal recall/assign mode
  currentIdx.value = idx
  const sound = livePadStore.sounds[idx]
  
  if (!sound.name) {
    const last = presetStore.lastPreset
    if (last) {
      const activeVariant = presetStore.useAlternativeEngine ? last.bVariant : last.aVariant
      const dataValues = activeVariant?.data || last.aVariant?.data || last.data || {}
      
      const ccData = {}
      Object.entries(dataValues).forEach(([field, val]) => {
        const cc = FIELD_TO_CC[field]
        if (cc !== undefined) {
          ccData[cc] = val
        }
      })

      livePadStore.updateSound(idx, {
        name: last.name,
        category: last.category,
        ccData: ccData,
        paramValues: Array(8).fill(64),
        preset: JSON.parse(JSON.stringify(last))
      })
    }
  } else {
    // Normal recall: sync with global preset store so all UI/engine updates
    if (sound.preset) {
      presetStore.recallPreset(sound.preset, padSyncEnabled.value)
    } else {
      // Compatibility Layer: convert CC numbers back to fields for legacy pads
      const data = {}
      if (sound.ccData) {
        Object.entries(sound.ccData).forEach(([cc, val]) => {
          const field = S1_CC_MAP[Number(cc)]
          if (field) {
            data[field] = val
          }
        })
      }
      presetStore.recallPreset({
        name: sound.name,
        category: sound.category,
        data: data,
        pc: sound.pc
      }, padSyncEnabled.value)
    }

    // Also update local Live Set sliders and send MIDI CCs
    if (sound.paramValues) {
      Object.entries(sound.paramValues).forEach(([slot, val]) => {
        const slotIdx = parseInt(slot)
        if (slotIdx >= 0 && slotIdx < 8) {
          paramValues.value[slotIdx] = val
          sendParamCC(slotIdx, val)
        }
      })
    }

    // Send any additional CC data stored in the pad
    if (sound.ccData && Object.keys(sound.ccData).length > 0) {
      const numericCcMap = {}
      Object.entries(sound.ccData).forEach(([cc, val]) => { 
        numericCcMap[Number(cc)] = val 
      })
      midiStore.sendAllCCs(numericCcMap)
    }
  }
}

function clearSound(idx) {
  livePadStore.updateSound(idx, {
    name: '',
    ccData: {},
    paramValues: {},
    category: '',
    preset: null,
    pc: idx + 1
  })
  if (currentIdx.value === idx) {
    paramValues.value = Array(8).fill(64)
  }
}

function saveCurrentSound() {
  if (currentIdx.value < 0 || currentIdx.value >= livePadStore.sounds.length) return
  livePadStore.updateSound(currentIdx.value, {
    paramValues: { ...paramValues.value }
  })
}

function updateParamValue(idx, val) {
  paramValues.value[idx] = val
  sendParamCC(idx, val)
  saveCurrentSound()
}

function getPadColorClass(idx, isActive) {
  const row = Math.floor(idx / 4)
  const colors = [
    { base: 'border-synth-neon text-synth-neon hover:bg-synth-neon/20', active: 'bg-synth-neon text-black shadow-[0_0_15px_rgba(0,255,136,0.5)]' },
    { base: 'border-fuchsia-500 text-fuchsia-500 hover:bg-fuchsia-500/20', active: 'bg-fuchsia-500 text-black shadow-[0_0_15px_rgba(217,70,239,0.5)]' },
    { base: 'border-orange-700 text-orange-700 hover:bg-orange-700/20', active: 'bg-orange-700 text-black shadow-[0_0_15px_rgba(251,191,36,0.5)]' },
    { base: 'border-cyan-400 text-cyan-400 hover:bg-cyan-400/20', active: 'bg-cyan-400 text-black shadow-[0_0_15px_rgba(34,211,238,0.5)]' }
  ]
  return isActive ? colors[row].active : colors[row].base
}

function formatTime(t) {
  if (isNaN(t) || !isFinite(t)) return '0:00'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
</script>

<template>
  <div v-if="isOpen"
    class="fixed z-[500] bg-neutral-950 border border-neutral-900 rounded-2xl top-[100px] bottom-[60px] left-1/2 -translate-x-1/2 w-full max-w-4xl flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden transition-all duration-300"
  >
        <div class="px-6 py-2 border-b border-neutral-900 flex items-center shrink-0 bg-black/40 backdrop-blur-md">
          <div class="flex items-center gap-8">
            <div class="flex flex-col">
              <h2 class="text-sm font-black uppercase tracking-[0.3em] text-synth-neon">Live Pad</h2>
              <span class="text-[9px] font-mono text-neutral-600 uppercase tracking-widest">Jam Mode / Controller</span>
            </div>
            
            <!-- Tabs -->
            <nav class="flex items-center gap-6 ml-4">
              <button @click="tab = 'perf'"
                :class="['relative py-1 text-[11px] font-black uppercase tracking-[0.2em] transition-all', 
                  tab === 'perf' ? 'text-white' : 'text-neutral-600 hover:text-neutral-400']"
              >
                Performance
                <div v-if="tab === 'perf'" class="absolute -bottom-[17px] left-0 w-full h-[2px] bg-synth-neon shadow-[0_0_10px_rgba(0,255,136,0.8)]"></div>
              </button>
              <button @click="tab = 'setup'"
                :class="['relative py-1 text-[11px] font-black uppercase tracking-[0.2em] transition-all', 
                  tab === 'setup' ? 'text-white' : 'text-neutral-600 hover:text-neutral-400']"
              >
                Setup
                <div v-if="tab === 'setup'" class="absolute -bottom-[17px] left-0 w-full h-[2px] bg-synth-neon/50"></div>
              </button>
            </nav>
          </div>

          <div class="flex-1" />

          <!-- Header actions -->
          <div class="flex items-center gap-6">
            <div @click="padSyncEnabled = !padSyncEnabled" class="cursor-pointer group flex items-center gap-2" title="Enable MIDI START/STOP on Pad selection">
              <span class="text-[9px] font-mono text-neutral-600 uppercase tracking-widest group-hover:text-neutral-400 transition-colors">SYNC</span>
              <span :class="['text-[9px] font-mono font-bold transition-colors', padSyncEnabled ? 'text-synth-neon' : 'text-rose-500']">
                {{ padSyncEnabled ? "ON" : "OFF" }}
              </span>
            </div>

            <div @click="sendPcEnabled = !sendPcEnabled" class="cursor-pointer group flex items-center gap-2">
              <span class="text-[9px] font-mono text-neutral-600 uppercase tracking-widest group-hover:text-neutral-400 transition-colors">PC</span>
              <span :class="['text-[9px] font-mono font-bold transition-colors', sendPcEnabled ? 'text-synth-neon' : 'text-rose-500']">
                {{ sendPcEnabled ? "ON" : "OFF" }}
              </span>
            </div>
            
            <button @click="emit('close')" class="text-neutral-600 hover:text-white transition-colors">
              <X class="w-5 h-5" />
            </button>
          </div>
        </div>



            <div v-if="tab === 'perf'" class="flex-1 flex flex-col min-h-0 bg-neutral-950/50 p-6 overflow-y-hidden custom-scrollbar">
              
              <!-- SECTION: SOUND PADS -->
              <div class="mb-4">
                <div class="flex items-center justify-between mb-4 px-1">
                  <div class="flex items-center gap-3">
                    <h3 class="text-[10px] font-black text-neutral-500 uppercase tracking-[0.25em] font-mono">Preset Launchpad</h3>
                    
                    <!-- Library Browser / Evaluator -->
                    <div class="flex items-center gap-1 bg-neutral-900 border border-neutral-800 rounded-xl p-1 ml-2">
                      <button @click="prevLibraryPreset" class="p-2 sm:p-3 hover:text-synth-neon transition-colors active:scale-90" title="Previous Preset">
                        <ChevronLeft class="w-5 h-5 sm:w-6 sm:h-6" />
                      </button>
                      
                      <div class="px-4 py-1 min-w-[140px] text-center flex flex-col justify-center">
                        <span class="text-[9px] font-black text-neutral-500 uppercase leading-none mb-1 tracking-tighter">
                          {{ currentLibraryPreset ? "EVALUATING" : "LIBRARY" }}
                        </span>
                        <span :class="['text-[11px] font-bold uppercase truncate max-w-[180px] leading-tight', currentLibraryPreset ? 'text-white' : 'text-neutral-600']">
                          {{ currentLibraryPreset ? currentLibraryPreset.name : "SELECT..." }}
                        </span>
                      </div>

                      <button @click="nextLibraryPreset" class="p-2 sm:p-3 hover:text-synth-neon transition-colors active:scale-90" title="Next Preset">
                        <ChevronRight class="w-5 h-5 sm:w-6 sm:h-6" />
                      </button>

                      <button v-if="currentLibraryPreset" @click="exitLibraryBrowser" class="p-2 sm:p-3 text-rose-500 hover:text-rose-400 transition-colors ml-1 active:scale-90" title="Cancel Evaluation">
                        <X class="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>
                    </div>

                    <!-- Single CLEAR button for the selected pad -->
                    <button 
                      v-if="currentIdx >= 0 && sounds[currentIdx]?.name"
                      @click="clearSound(currentIdx)"
                      class="ml-2 px-3 py-1.5 rounded-xl border border-rose-900/40 bg-rose-950/40 hover:bg-rose-900/20 text-rose-400 hover:text-rose-300 text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center gap-1.5 shadow-[0_0_15px_rgba(244,63,94,0.1)] h-9 shrink-0"
                      title="Clear Selected Pad"
                    >
                      <Trash2 class="w-3.5 h-3.5 text-rose-500" />
                      Clear
                    </button>
                  </div>
                  <div class="h-px flex-1 bg-neutral-900 mx-4"></div>
                  
                  <!-- Info/Helper -->
                  <div v-if="currentLibraryPreset" class="text-[9px] font-mono text-synth-neon animate-pulse uppercase tracking-widest hidden sm:block">
                    Click any pad to assign
                  </div>
                </div>
                
                <div class="grid grid-cols-8 gap-3">
                  <button v-for="(sound, idx) in sounds" :key="idx"
                    @click="selectSound(idx)"
                    :class="[
                      'h-20 rounded-xl border-2 flex flex-col items-center justify-center p-2 gap-1 transition-all relative overflow-hidden group',
                      getPadColorClass(idx, currentIdx === idx)
                    ]"
                  >
                    <div v-if="currentIdx === idx" class="absolute inset-0 bg-white/5 animate-pulse pointer-events-none"></div>
                    <span class="w-full text-center text-[11px] font-black uppercase tracking-tight leading-tight line-clamp-2 break-words z-10">{{ sound.name || `PAD ${idx + 1}` }}</span>
                    <span v-if="sound.name && sound.category" class="w-full text-center text-[9px] font-mono uppercase tracking-widest opacity-40 z-10">{{ sound.category }}</span>
                    
                  </button>
                </div>
              </div>

              <!-- SECTION: TRACK PADS -->
              <div class="mb-4 ">
                <div class="flex items-center justify-between mb-4 px-1 overflow-y-hidden">
                  <h3 class="text-[10px] font-black text-neutral-500 uppercase tracking-[0.25em] font-mono">Backing Tracks</h3>
                  <div class="h-px flex-1 bg-neutral-900 mx-4"></div>
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

            <!-- PERFORMANCE FOOTER PLAYER -->
            <div v-if="tab === 'perf'" class="shrink-0 p-4 bg-black/60 border-t border-neutral-900 flex items-center justify-between px-8 py-2">
              <!-- Left: Stats -->
              <div class="flex flex-col gap-1">
                <span class="text-[9px] font-mono text-neutral-600 uppercase tracking-widest">Total Playlist</span>
                <span class="text-xs font-black text-neutral-300 font-mono tracking-wider">{{ formatTime(totalPlaylistDuration) }}</span>
              </div>

              <!-- Center: Controls -->
              <div class="flex items-center gap-6">
                <button @click="prevTrack" class="p-2 text-neutral-500 hover:text-white transition-colors active:scale-90">
                  <SkipBack class="w-6 h-6" />
                </button>
                
                <button @click="handlePlaylistToggle" 
                  class="w-12 h-12 rounded-full bg-synth-neon text-black flex items-center justify-center shadow-[0_0_20px_rgba(0,255,136,0.3)] hover:scale-105 active:scale-95 transition-all">
                  <Pause v-if="isPlaying" class="w-7 h-7 fill-current" />
                  <Play v-else class="w-7 h-7 fill-current translate-x-0.5" />
                </button>

                <button @click="nextTrack" class="p-2 text-neutral-500 hover:text-white transition-colors active:scale-90">
                  <SkipForward class="w-6 h-6" />
                </button>
              </div>

              <!-- Right: Volume/Status -->
              <div class="flex flex-col items-end gap-1">
                <span class="text-[9px] font-mono text-neutral-600 uppercase tracking-widest">Active Slot</span>
                <span class="text-xs font-black text-synth-neon font-mono">{{ playlistIdx >= 0 ? `#${playlistIdx + 1}` : 'IDLE' }}</span>
              </div>
            </div>

            <!-- Global Playlist Progress Bar -->
            <div v-if="tab === 'perf' && totalPlaylistDuration > 0" class="h-1 bg-neutral-900 w-full shrink-0 relative">
              <div 
                class="absolute inset-y-0 left-0 bg-synth-neon shadow-[0_0_10px_rgba(0,255,136,0.5)] transition-all duration-300"
                :style="{ width: `${totalProgressPct}%` }"
              />
            </div>
          
          <!-- Setup tab -->
          <div v-if="tab === 'setup'" class="flex flex-col space-y-6 w-full p-6">
            <div class="flex w-full gap-1 border-b border-neutral-900 pb-2">
              <button @click="setupTab = 'sounds'"
                :class="['px-3 py-2 text-xs font-bold uppercase tracking-widest transition-colors', setupTab === 'sounds' ? 'text-synth-neon border-b-2 border-synth-neon' : 'text-neutral-500 hover:text-neutral-400']"
              >Pads (Sounds)</button>
              <button @click="setupTab = 'playlist'"
                :class="['px-3 py-2 text-xs font-bold uppercase tracking-widest transition-colors', setupTab === 'playlist' ? 'text-synth-neon border-b-2 border-synth-neon' : 'text-neutral-500 hover:text-neutral-400']"
              >Playlist</button>
              <!-- <button @click="setupTab = 'params'"
                :class="['px-3 py-2 text-xs font-bold uppercase tracking-widest transition-colors', setupTab === 'params' ? 'text-synth-neon border-b-2 border-synth-neon' : 'text-neutral-500 hover:text-neutral-400']"
              >Sliders (Params)</button> -->
            </div>

            <!-- Manage sounds -->
            <div v-if="setupTab === 'sounds'" class="space-y-4">
              <div class="flex items-center justify-between bg-neutral-900 rounded-lg p-3 border border-neutral-800">
                <div class="flex flex-col">
                  <span class="text-[10px] font-bold uppercase tracking-widest text-neutral-300">Send Program Change</span>
                  <span class="text-[9px] font-mono text-neutral-500 mt-0.5">Change hardware patches automatically when selecting pads.</span>
                </div>
                <button @click="sendPcEnabled = !sendPcEnabled"
                  :class="['w-10 h-5 rounded-full relative transition-colors shrink-0', sendPcEnabled ? 'bg-synth-neon' : 'bg-neutral-700']">
                  <div :class="['w-3 h-3 bg-black rounded-full absolute top-1 transition-all', sendPcEnabled ? 'left-6' : 'left-1']"></div>
                </button>
              </div>
              <div class="flex flex-col overflow-y-auto custom-overflow max-h-[300px]">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div v-for="(sound, idx) in sounds" :key="sound.id" class="flex items-center gap-2 bg-neutral-900 rounded-lg p-2 border border-neutral-800">
                  <span class="text-xs font-mono font-bold text-neutral-500 w-6 text-right">{{ idx + 1 }}.</span>
                  <input v-model="sound.name" type="text" :placeholder="`Pad ${idx + 1} Name...`" class="flex-1 bg-black border border-neutral-700 rounded px-2 py-1.5 text-xs text-white focus:border-synth-neon outline-none transition-colors" />
                  <div class="flex items-center gap-1.5 bg-black border border-neutral-700 rounded px-2 py-1.5 shrink-0" title="Program Change">
                    <span class="text-[9px] font-mono text-neutral-500 uppercase">PC</span>
                    <input v-model.number="sound.pc" type="number" min="0" max="128" class="w-8 bg-transparent text-xs text-center text-white focus:outline-none custom-number-input" />
                  </div>
                  <button @click="clearSound(idx)" class="p-1.5 text-neutral-500 hover:text-red-500 transition-colors" title="Clear Pad">
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </div>
              </div>
            </div>

            <!-- Manage playlist -->
            <div v-if="setupTab === 'playlist'" class="space-y-3">
              <!-- Playlist Panel -->
              <div class="w-2/3 flex-1 border-l border-neutral-900 bg-neutral-950/30 overflow-y-auto custom-scrollbar p-4 flex flex-col min-w-[320px]">
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
            <!-- Manage parameters -->
            <!-- <div v-if="setupTab === 'params'" class="space-y-3">
              <div v-for="(p, i) in params" :key="i" class="flex flex-col sm:flex-row sm:items-center gap-3 bg-neutral-900 rounded-lg p-3 border border-neutral-800">
                <div class="flex items-center gap-2 w-16">
                  <span class="text-xs font-mono font-bold text-neutral-500">S{{ i + 1 }}.</span>
                </div>
                <div class="flex-1 flex flex-col gap-1">
                  <label class="text-[9px] font-mono text-neutral-400 uppercase tracking-widest">Label</label>
                  <input v-model="params[i].label" type="text" placeholder="e.g., Filter Cutoff" class="bg-black border border-neutral-800 rounded px-2 py-1.5 text-xs text-white focus:border-synth-neon outline-none" />
                </div>
                <div class="flex-1 flex flex-col gap-1">
                  <label class="text-[9px] font-mono text-neutral-400 uppercase tracking-widest">CC Assignment</label>
                  <select v-model.number="params[i].cc" class="bg-black border border-neutral-800 rounded px-2 py-1.5 text-xs text-neutral-300 focus:border-synth-neon outline-none">
                    <option :value="-1">— unassigned —</option>
                    <option v-for="opt in S1_CC_OPTIONS" :key="opt.cc" :value="opt.cc">
                      {{ opt.label }} (CC {{ opt.cc }})
                    </option>
                  </select>
                </div>
              </div>
            </div> -->
          </div>
         
        <!-- </div> -->
    </div>
</template>

<style scoped>
.vertical-slider {
  -webkit-appearance: slider-vertical;
  appearance: slider-vertical;
  writing-mode: bt-lr;
}

.vertical-slider::-webkit-slider-runnable-track {
  width: 4px;
  background: #262626; /* neutral-800 */
  border-radius: 4px;
}

.vertical-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  height: 16px;
  width: 16px;
  border-radius: 50%;
  background: #00ff88; /* synth-neon */
  cursor: pointer;
  box-shadow: 0 0 10px rgba(0, 255, 136, 0.5);
  margin-top: -6px; /* center thumb on track */
}

.vertical-slider:focus {
  outline: none;
}

.custom-number-input::-webkit-outer-spin-button,
.custom-number-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.custom-number-input {
  -moz-appearance: textfield;
}
</style>
