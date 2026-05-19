<script setup>
import { ref, computed, watch, onUnmounted, onMounted } from 'vue'
import { Edit3, BookOpen, Play, Square, Copy, Trash2, Save, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Heart, Zap, Layers, ListMusic, LayoutGrid, Grid3x3, Settings2, Plus, RefreshCw, Network, SlidersHorizontal, SlidersVertical} from 'lucide-vue-next'
import { MidiSource } from '@/core/midi/MidiService'
import { usePresetStore } from '@/stores/usePresetStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useArpStore } from '@/stores/useArpStore'
import { useUiStore } from '@/stores/useUiStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { useLfoStore } from '@/stores/useLfoStore'
import { S1_CC_MAP, FIELD_TO_CC } from '@/constants/s1-config'
import AdsrEnvelope from '@/components/AdsrEnvelope.vue'
import FilterEnvelope from '@/components/FilterEnvelope.vue'
import WaveformVisualizer from '@/components/WaveformVisualizer.vue'
import OscMixerVisualizer from '@/components/OscMixerVisualizer.vue'
import EfxMixerVisualizer from '@/components/EfxMixerVisualizer.vue'
import SignalFlowVisualizer from '@/components/SignalFlowVisualizer.vue'
import VisualizerPanel from '@/components/ui/VisualizerPanel.vue'

const presetStore = usePresetStore()
const midiStore = useMidiStore()
const authStore = useAuthStore()
const configStore = useConfigStore()
const arpStore = useArpStore()
const uiStore = useUiStore()
const mappingStore = useMappingStore()
const lfoStore = useLfoStore()

const isEditingName = ref(false)
const tempName = ref('')
const isPanelCollapsed = ref(false)
const showCopyFeedback = ref(false)
const showSaveFeedback = ref(false)
const liveSetFeedback = ref('')
const _previewTimeouts = []
const VISUALIZER_CATEGORIES = ['FLOW', 'LFO', 'OSCILLATOR', 'ENV', 'FILTER', 'EFX']

const activeCategory = computed({
  get: () => uiStore.activeVisualizerCategory,
  set: (val) => { uiStore.activeVisualizerCategory = val }
})

function setActiveCategory(catId) {
  activeCategory.value = catId
  if (isPanelCollapsed.value) isPanelCollapsed.value = false
}

// Set FLOW as default on startup and preset change
onMounted(() => {
  activeCategory.value = 'FLOW'
})

watch(() => presetStore.lastPreset?.id, () => {
  activeCategory.value = 'FLOW'
})

function stopPreview() {
  _previewTimeouts.forEach(id => clearTimeout(id))
  _previewTimeouts.length = 0
  uiStore.isPlayingPreview = false
}

function playPreview() {
  stopPreview()
  uiStore.isPlayingPreview = true

  const bpmScale = 120 / (arpStore.arpBpm || 120)
  const step = 280 * bpmScale

  // Simple ascending arpeggio: C4 major + octave
  const notes = [60, 64, 67, 72, 67, 64, 60]
  notes.forEach((note, i) => {
    _previewTimeouts.push(
      setTimeout(() => midiStore.sendNoteOn(note, 80, undefined, MidiSource.UI), i * step),
      setTimeout(() => midiStore.sendNoteOff(note, 0, undefined, MidiSource.UI), i * step + step * 0.75),
    )
  })
  _previewTimeouts.push(
    setTimeout(() => { uiStore.isPlayingPreview = false }, notes.length * step),
  )
}

function selectEngineA() {
  presetStore.selectEngine('A')
}

function selectEngineB() {
  presetStore.selectEngine('B')
}

function toggleAB() {
  if (presetStore.useAlternativeEngine) selectEngineA()
  else selectEngineB()
}

function addToLiveSet() {
  const raw = localStorage.getItem('S1_LIVESET_SOUNDS')
  const stored = Array.isArray(JSON.parse(raw || 'null')) ? JSON.parse(raw) : []
  const slots = Array(16).fill(null).map((_, i) =>
    stored[i] || { id: `ls_slot_${i}`, name: '', paramValues: {} }
  )

  const emptyIdx = slots.findIndex(s => !s.name)
  if (emptyIdx === -1) {
    liveSetFeedback.value = 'full'
    setTimeout(() => { liveSetFeedback.value = '' }, 2500)
    return
  }

  const paramsRaw = localStorage.getItem('S1_LIVESET_PARAMS')
  const liveParams = Array.isArray(JSON.parse(paramsRaw || 'null')) ? JSON.parse(paramsRaw) : []
  const paramValues = {}
  liveParams.forEach((p, i) => {
    if (p?.cc >= 0) {
      const fieldName = S1_CC_MAP[p.cc]
      if (fieldName !== undefined && activeData.value?.[fieldName] !== undefined) {
        paramValues[i] = activeData.value[fieldName]
      }
    }
  })

  const ccData = {}
  Object.entries(activeData.value || {}).forEach(([field, val]) => {
    const cc = FIELD_TO_CC[field]
    if (cc !== undefined) ccData[cc] = val
  })

  slots[emptyIdx].name = presetStore.currentName
  slots[emptyIdx].category = presetStore.currentCategory
  slots[emptyIdx].ccData = ccData
  slots[emptyIdx].paramValues = paramValues
  localStorage.setItem('S1_LIVESET_SOUNDS', JSON.stringify(slots))

  liveSetFeedback.value = `ok:${emptyIdx + 1}`
  setTimeout(() => { liveSetFeedback.value = '' }, 2500)
}

onUnmounted(() => stopPreview())

const selectedPreset = computed(() => presetStore.lastPreset)

// ─── Control helpers ──────────────────────────────────────────────────────────

const activeData = computed(() => {
  const preset = presetStore.lastPreset
  if (!preset) return null
  return presetStore.useAlternativeEngine ? preset.bVariant?.data : preset.aVariant?.data
})

function getVal(cfg) {
  const name = typeof cfg === 'string' ? cfg : cfg.name
  const min = typeof cfg === 'object' ? (Number(cfg.min) || 0) : 0
  const max = typeof cfg === 'object' ? (Number(cfg.max) || 127) : 127
  const val = activeData.value?.[name] ?? min
  // Strict clamping to respect configured hardware bounds
  return Math.max(min, Math.min(max, Number(val)))
}

function getPercent(cfg) {
  const min = Number(cfg.min) || 0
  const max = Number(cfg.max) || 127
  const val = getVal(cfg)
  if (max === min) return 0
  return ((val - min) / (max - min)) * 100
}

function handleValueUpdate(cfg, rawValue) {
  const min = Number(cfg.min) || 0
  const max = Number(cfg.max) || 127
  const clamped = Math.max(min, Math.min(max, Math.round(rawValue)))
  
  presetStore.updateFieldValue(cfg.name, clamped)
  midiStore.sendCC(cfg.cc, clamped, undefined, MidiSource.UI)
}

// ─── Drag handlers ────────────────────────────────────────────────────────────

function startHDrag(cfg, event) {
  event.preventDefault()
  const rect = event.currentTarget.getBoundingClientRect()
  const min = Number(cfg.min) || 0
  const max = Number(cfg.max) || 127
  const update = (e) => {
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
    const rawVal = min + (x / rect.width) * (max - min)
    handleValueUpdate(cfg, rawVal)
  }
  update(event)
  const onMove = (e) => update(e)
  const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function startVDrag(cfg, event) {
  event.preventDefault()
  const rect = event.currentTarget.getBoundingClientRect()
  const min = Number(cfg.min) || 0
  const max = Number(cfg.max) || 127
  const update = (e) => {
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top))
    const rawVal = min + (1 - y / rect.height) * (max - min)
    handleValueUpdate(cfg, rawVal)
  }
  update(event)
  const onMove = (e) => update(e)
  const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function handleKeyNudge(cfg, event) {
  const val = getVal(cfg)
  if (event.key === 'ArrowUp' || event.key === 'ArrowRight') { event.preventDefault(); handleValueUpdate(cfg, val + 1) }
  else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') { event.preventDefault(); handleValueUpdate(cfg, val - 1) }
}

// ─── Multi helpers ────────────────────────────────────────────────────────────

function getActiveOption(cfg) {
  const val = getVal(cfg)
  const opts = cfg.options || []
  if (!opts.length) return { value: val, label: String(val) }
  const sorted = [...opts].sort((a, b) => a.value - b.value)
  return sorted.find((o, i) =>
    i === sorted.length - 1 ? val >= o.value : val >= o.value && val < sorted[i + 1].value
  ) || sorted[0]
}

// ─── Categories with controllers ─────────────────────────────────────────────

const categoriesWithCtrls = computed(() => {
  const base = configStore.categories
    .map(cat => ({
      ...cat,
      controllers: configStore.midiConfig
        .filter(cfg => cfg.category === cat.id)
        .sort((a, b) => (a.order || 0) - (b.order || 0))
    }))
    .filter(cat => cat.controllers.length > 0)

  // Virtual 'FLOW' category
  const flowCategory = {
    id: 'FLOW',
    name: 'FLOW',
    color: '#38bdf8', // Electric Blue
    controllers: configStore.midiConfig
      .filter(cfg => ['cutoff', 'oscSaw', 'oscSq', 'attack', 'reverb', 'delayLvl', 'chorusMode'].includes(cfg.name))
  }

  return [flowCategory, ...base]
})

const uncategorizedCtrls = computed(() => {
  const catIds = new Set(configStore.categories.map(c => c.id))
  return configStore.midiConfig.filter(cfg => !cfg.category || !catIds.has(cfg.category))
})

function toggleVelocityMod() {
  if (!mappingStore.velocityConfig) return
  mappingStore.velocityConfig.active = !mappingStore.velocityConfig.active
  if (!mappingStore.velocityConfig.active) {
    mappingStore.restoreOriginalValues()
  }
}

// ─── Preset actions ───────────────────────────────────────────────────────────

function startEditingName() { tempName.value = presetStore.currentName; isEditingName.value = true }
function saveName() { if (tempName.value.trim()) presetStore.currentName = tempName.value.trim(); isEditingName.value = false }

async function handleCopyToClipboard() {
  try {
    await navigator.clipboard.writeText(JSON.stringify(activeData.value || {}, null, 2))
    showCopyFeedback.value = true
    setTimeout(() => { showCopyFeedback.value = false }, 2000)
  } catch (e) { console.error('Copy failed', e) }
}

async function handleDeletePreset() {
  if (!selectedPreset.value) return
  
  try {
    await presetStore.deletePreset(selectedPreset.value.id)
    presetStore.showResults = false
  } catch (err) {
    console.error('Failed to delete', err)
  }
}

async function handleSavePreset() {
  try { 
    await presetStore.savePreset()
    showSaveFeedback.value = true
    setTimeout(() => { showSaveFeedback.value = false }, 2000)
  }
  catch (err) { if (err.message === 'slot_limit') alert('Preset slot limit reached.') }
}

function toggleFavorite() {
  const preset = selectedPreset.value
  if (!preset) return
  presetStore.toggleFavorite(preset.id)
}

const isFavorite = computed(() => {
  const id = selectedPreset.value?.id
  return !!(id && presetStore.history.find(h => h.id === id)?.isFavorite)
})

const presetIndexLabel = computed(() => {
  if (!selectedPreset.value) return ''
  const idx = presetStore.history.findIndex(p => p.id === selectedPreset.value.id)
  if (idx === -1) return ''
  return `#${presetStore.history.length - idx} `
})

function getCategoryIcon(cat) {
  const map = { pad:'🎹', lead:'⚡', bass:'🔊', drum:'🥁', synth:'🎛️', ambient:'☁️',
    strings:'🎻', brass:'🎺', piano:'🎹', organ:'🎹', percussion:'🥁', pluck:'🎸',
    bell:'🔔', arp:'↗️', texture:'🌊', drone:'👻', experimental:'🧪', key:'🎵', acid:'⚗️' }
  return map[cat] || '🎵'
}

const getHighlightClass = (cfg) => {
  if (presetStore.lastModifiedField === cfg.name) {
    return 'ring-1 ring-synth-neon/50 ring-offset-1 ring-offset-black scale-[1.02] shadow-[0_0_20px_rgba(0,255,136,0.6)] z-50 animate-pulse-glow relative'
  }
  return 'relative'
}

const isSlider = (c) => !(c.type === 'SWITCH' || (c.max <= 1 && c.min === 0 && !c.type)) && c.type !== 'MULTI'
const isSetting = (c) => (c.type === 'SWITCH' || (c.max <= 1 && c.min === 0 && !c.type)) || c.type === 'MULTI'
const hasSliders = (controllers) => (controllers || []).some(isSlider)
const hasSettings = (controllers) => (controllers || []).some(isSetting)
</script>

<template>
  <div class="max-w-4xl m-auto h-full flex flex-col overflow-hidden bg-neutral-950 relative bg-container">

    <!-- ── NO PRESET: idle prompt ── -->
    <template v-if="!selectedPreset">
      <div class="flex-1 flex flex-col items-center justify-center gap-8 p-8">
        <div class="flex flex-col items-center gap-4">
          <div class="p-4 rounded-2xl bg-synth-neon/10 border border-synth-neon/20">
            <Layers class="w-10 h-10 text-synth-neon" />
          </div>
          <p class="text-neutral-400 font-mono text-sm uppercase tracking-widest text-center">
            Generate a sound or select from your library
          </p>
        </div>
        <div class="flex items-center gap-3">
          <button
            @click="presetStore.generate()"
            :disabled="presetStore.isGenerating || presetStore.limitReached"
            class="flex items-center gap-2 bg-synth-neon text-black px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-white transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
          >
            <Zap class="w-4 h-4" />
            {{ presetStore.isGenerating ? 'Generating...' : 'Generate Sound' }}
          </button>
          <button
            @click="uiStore.isHistoryOpen = false"
            class="flex items-center gap-2 bg-neutral-800 text-neutral-300 px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-neutral-700 transition-colors border border-neutral-700 active:scale-95"
          >
            <Layers class="w-4 h-4" /> Library
          </button>
        </div>
      </div>
    </template>

    <!-- ── ACTIVE PRESET ── -->
    <template v-else>

      <!-- ── NEW THREE-COLUMN HEADER ── -->
      <div class="shrink-0 px-6 py-4 pb-2 border-b border-neutral-900 bg-neutral-900/90 backdrop-blur-2xl flex flex-col lg:grid lg:grid-cols-[1.2fr_auto_1.5fr] items-start gap-4">
        
        <!-- COLUMN 1: IDENTITY & NAV -->
        <div class="flex flex-col gap-3 min-w-0 w-full">
          <!-- Identity block (Hardware Display Style) -->
          <div class="display-glass relative h-[80px] flex items-center gap-4 bg-black rounded-lg border border-neutral-700/50 overflow-hidden px-4 group shadow-2xl">
            <!-- Hardware Screen Effect Overlays -->
            <div class="absolute inset-0 z-20 pointer-events-none glass-reflection"></div>
            <div class="absolute inset-0 z-10 pointer-events-none scanlines"></div>

            <!-- Category icon (No background) -->
            <div class="text-xl flex items-center justify-center select-none z-30 drop-shadow-[0_0_8px_rgba(0,255,136,0.5)]">
              {{ getCategoryIcon(presetStore.currentCategory) }}
            </div>

            <!-- Name, Category & Poly -->
            <div class="flex flex-col min-w-0 z-30">
              <h2
                v-if="!isEditingName"
                @click="startEditingName"
                class="text-base font-black uppercase tracking-tight leading-tight hover:text-synth-neon cursor-pointer transition-colors group flex items-center gap-2 truncate text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.2)]"
              >
                <span class="truncate">
                  <span class="text-neutral-500 font-mono mr-1 text-sm font-normal">{{ presetIndexLabel }}</span>{{ presetStore.hasUnsavedChanges ? `* ${presetStore.currentName}` : presetStore.currentName }}
                </span>
                <Edit3 class="w-3.5 h-3.5 shrink-0 opacity-0 group-hover:opacity-40" />
              </h2>
              <input
                v-else
                v-model="tempName"
                type="text"
                @blur="saveName"
                @keydown.enter="saveName"
                @keydown.esc="isEditingName = false"
                autofocus
                class="bg-neutral-900 text-white text-sm font-black uppercase tracking-tight px-2 py-0.5 rounded border border-synth-neon/50 outline-none w-48 relative z-50"
              />
              
              <div class="flex items-center gap-2 mt-1">
                <span class="text-[9px] font-mono text-synth-neon uppercase tracking-widest font-bold drop-shadow-[0_0_3px_rgba(0,255,136,0.3)]">
                  {{ presetStore.currentCategory }}
                </span>
                <span class="px-1.5 py-0.5 rounded border border-white/5 text-[7px] font-black uppercase text-neutral-400 bg-white/5 backdrop-blur-sm">
                  <span v-if="getVal('polyMode') >= 2" class="text-synth-neon">{{ getVal('polyMode') === 3 ? 'Chord' : 'Poly' }}</span>
                  <span v-else-if="getVal('polyMode') === 1" class="text-orange-400">Unison</span>
                  <span v-else class="text-neutral-400">Mono</span>
                </span>
              </div>
            </div>
          </div>
        </div>  
          <!-- COLUMN 2: VISUALIZER (Centered) -->
        <div class="flex justify-center shrink-0">
          <VisualizerPanel />
        </div>

        <!-- COLUMN 3: ACTIONS -->
        <div class="flex items-center gap-2 justify-center lg:justify-end w-full">
          
          <div class="flex flex-col w-full items-end gap-2">
          <div class="flex items-center gap-2">
            <!-- A/B Switch (Circular) -->
          <button 
            @click="toggleAB"
            :disabled="!presetStore.lastPreset?.bVariant"
            :class="[
              'w-10 h-10 rounded-full border flex items-center justify-center text-[10px] font-black transition-all shadow-lg active:scale-90 disabled:opacity-20 disabled:grayscale disabled:cursor-not-allowed disabled:border-neutral-800',
              presetStore.useAlternativeEngine 
                ? 'bg-violet-500/10 border-violet-500 text-violet-400 shadow-violet-500/20' 
                : 'bg-synth-neon/10 border-synth-neon text-synth-neon shadow-synth-neon/20'
            ]"
            :title="presetStore.lastPreset?.bVariant ? 'Toggle Engine A/B' : 'A/B Variant Not Available'"
          >
            {{ presetStore.useAlternativeEngine ? 'B' : 'A' }}
          </button>

          <div class="w-px h-6 bg-neutral-800/50 mx-1 hidden xl:block"></div>

          <!-- Core Actions -->
          <div class="flex items-center gap-2">
            <!-- Save -->
            <button v-if="authStore.user" @click="handleSavePreset" :disabled="presetStore.isSaving"
              class="w-10 h-10 rounded-full border border-emerald-500/30 flex items-center justify-center bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/30 hover:border-emerald-500 transition-all active:scale-90"
              title="Save Preset">
              <Save class="w-5 h-5" />
            </button>

            <!-- Copy -->
            <button @click="handleCopyToClipboard"
              class="w-10 h-10 rounded-full border border-sky-500/30 flex items-center justify-center bg-sky-500/10 text-sky-400 hover:bg-sky-500/30 hover:border-sky-500 transition-all active:scale-90"
              title="Copy Preset Data">
              <Copy class="w-5 h-5" />
            </button>
            
            <!-- Favorite -->
            <button @click="toggleFavorite" 
              :class="['w-10 h-10 rounded-full border flex items-center justify-center transition-all active:scale-90 shadow-lg', isFavorite ? 'bg-rose-500/20 text-rose-500 border-rose-500 shadow-rose-500/20' : 'bg-neutral-800 border-neutral-700 text-neutral-500 hover:border-neutral-500']"
              title="Toggle Favorite">
              <Heart :class="['w-5 h-5', isFavorite ? 'fill-current' : '']" />
            </button>

            <!-- Regenerate -->
            <button @click="presetStore.generate(true)" :disabled="presetStore.isGenerating"
              class="w-10 h-10 rounded-full bg-synth-neon text-black flex items-center justify-center shadow-[0_0_15px_rgba(0,255,136,0.4)] hover:bg-white transition-all active:scale-90 disabled:opacity-50"
              title="Regenerate">
              <RefreshCw :class="['w-5 h-5', presetStore.isGenerating ? 'animate-spin' : '']" />
            </button>

            <button @click="addToLiveSet" 
              class="w-10 h-10 rounded-full border border-neutral-700 bg-neutral-800 text-neutral-500 flex items-center justify-center hover:text-purple-400 hover:border-purple-500/50 hover:bg-purple-500/10 transition-all active:scale-90"
              title="Add to Live Pad">
              <Grid3x3 class="w-5 h-5" />
            </button>
          </div>

          <div class="w-px h-6 bg-neutral-800/50 mx-1 hidden xl:block"></div>

          <!-- Performance Tools -->
          <div class="flex items-center gap-2">
            <!-- Arp Toggle -->
            <!-- <div class="flex bg-neutral-900 border border-neutral-800 rounded-full p-1 shadow-inner">
              <button @click="arpStore.arpEnabled = !arpStore.arpEnabled"
                :class="['w-10 h-8 rounded-full text-[8px] font-black uppercase tracking-tighter transition-all', arpStore.arpEnabled ? 'bg-synth-neon text-black shadow-lg' : 'text-neutral-600 hover:text-neutral-400']">
                ARP
              </button>
              <button @click="uiStore.isArpOpen = !uiStore.isArpOpen"
                :class="['w-8 h-8 rounded-full flex items-center justify-center transition-all', uiStore.isArpOpen ? 'text-synth-neon' : 'text-neutral-600 hover:text-neutral-400']">
                <Settings2 class="w-4 h-4" />
              </button>
            </div> -->

            <!-- Sequencer -->
            <button @click="uiStore.isSequencerOpen = !uiStore.isSequencerOpen"
              :class="['w-10 h-10 rounded-full border flex items-center justify-center transition-all active:scale-90 shadow-lg', uiStore.isSequencerOpen ? 'bg-amber-500/20 text-amber-400 border-amber-500 shadow-amber-500/20' : 'bg-neutral-800 border-neutral-700 text-neutral-500 hover:border-neutral-500']"
              title="Toggle Sequencer">
              <ListMusic class="w-5 h-5" />
            </button>

            <!-- Play/Preview -->
            <button @click="uiStore.isPlayingPreview ? stopPreview() : playPreview()"
              :class="['w-10 h-10 rounded-full border flex items-center justify-center transition-all active:scale-90 shadow-lg', uiStore.isPlayingPreview ? 'bg-synth-neon/20 text-synth-neon border-synth-neon shadow-synth-neon/30' : 'bg-neutral-800 border-neutral-700 text-neutral-500 hover:border-neutral-500 hover:text-synth-neon']"
              title="Play Sequencer">
              <Square v-if="uiStore.isPlayingPreview" class="w-5 h-5 fill-current" />
              <Play v-else class="w-5 h-5 fill-current ml-0.5" />
            </button>
          </div>
        </div>

        <!-- MODULATION CONTROLS (Sotto i pulsanti, allineati a dx) -->
        <div class="flex justify-end gap-3 mt-1.5">
          
          <!-- LFO Controls -->
          <div class="flex items-center gap-1 ">
            <div class="flex items-center">
              <button @click="lfoStore.toggleLfo(1)"
                :class="['px-2.5 h-10 rounded-l-full text-[10px] font-black uppercase tracking-widest transition-all border-y border-l', 
                  lfoStore.lfo1.active ? 'bg-[#00f3ff] text-black border-[#00f3ff] shadow-[0_0_8px_#00f3ff66]' : 'bg-neutral-900 border-neutral-800 text-neutral-500 hover:text-neutral-300']">
                LFO 1
              </button>
              <button @click="uiStore.isLfo1Open = !uiStore.isLfo1Open"
                :class="['px-1.5 h-10 rounded-r-full text-[10px] transition-all border border-y border-r', 
                  uiStore.isLfo1Open ? 'bg-neutral-800 text-[#00f3ff] border-neutral-700' : 'bg-neutral-900 border-neutral-800 text-neutral-600 hover:text-neutral-400']">
                <Settings2 class="w-4 h-4" />
              </button>
            </div>

            <div class="flex items-center ml-1">
              <button @click="lfoStore.toggleLfo(2)"
                :class="['px-2.5 h-10 rounded-l-full text-[10px] font-black uppercase tracking-widest transition-all border-y border-l', 
                  lfoStore.lfo2.active ? 'bg-[#00f3ff] text-black border-[#00f3ff] shadow-[0_0_8px_#00f3ff66]' : 'bg-neutral-900 border-neutral-800 text-neutral-500 hover:text-neutral-300']">
                LFO 2
              </button>
              <button @click="uiStore.isLfo2Open = !uiStore.isLfo2Open"
                :class="['px-1.5 h-10 rounded-r-full text-[10px] transition-all border border-y border-r', 
                  uiStore.isLfo2Open ? 'bg-neutral-800 text-[#00f3ff] border-neutral-700' : 'bg-neutral-900 border-neutral-800 text-neutral-600 hover:text-neutral-400']">
                <Settings2 class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- Velocity Control -->
          <div class="flex items-center ml-1">
            <div class="flex items-center">
              <button @click="toggleVelocityMod"
                :class="['px-2.5 h-10 rounded-l-full text-[10px] font-black uppercase tracking-widest transition-all border-y border-l', 
                  mappingStore.velocityConfig?.active ? 'bg-[#00f3ff] text-black border-[#00f3ff] shadow-[0_0_8px_#00f3ff66]' : 'bg-neutral-900 border-neutral-800 text-neutral-500 hover:text-neutral-300']">
                VEL
              </button>
              <button @click="uiStore.isVelocityMapOpen = !uiStore.isVelocityMapOpen"
                :class="['px-1.5 h-10 rounded-r-full text-[10px] transition-all border border-y border-r', 
                  uiStore.isVelocityMapOpen ? 'bg-neutral-800 text-[#00f3ff] border-neutral-700' : 'bg-neutral-900 border-neutral-800 text-neutral-600 hover:text-neutral-400']">
                <Settings2 class="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <!-- Arp Toggle -->
          <div class="flex items-center">
            <button @click="arpStore.arpEnabled = !arpStore.arpEnabled"
              :class="['px-2.5 h-10 rounded-l-full text-[10px] font-black uppercase tracking-widest transition-all border-y border-l', arpStore.arpEnabled ? 'bg-[#00f3ff] text-black border-[#00f3ff] shadow-[0_0_8px_#00f3ff66]' : 'bg-neutral-900 border-neutral-800 text-neutral-500 hover:text-neutral-300']">
              ARP
            </button>
            <button @click="uiStore.isArpOpen = !uiStore.isArpOpen"
              :class="['px-1.5 h-10 rounded-r-full text-[10px] transition-all border border-y border-r', uiStore.isArpOpen ? 'bg-neutral-800 text-[#00f3ff] border-neutral-700' : 'bg-neutral-900 border-neutral-800 text-neutral-600 hover:text-neutral-400']">
              <Settings2 class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

      <!-- Nav & Tabs Container -->
      <div class="flex items-center justify-between shrink-0 px-6 py-3 border-b border-neutral-900 bg-neutral-900/90 backdrop-blur-2xl gap-4">
        <!-- LEFT: Nav & Tabs -->
        <div class="flex items-center gap-4 min-w-0 flex-1">
            <!-- History Circular Nav -->
            <div v-if="!presetStore.hasUnsavedChanges" class="flex items-center gap-1.5 shrink-0">
              <button
                @click="presetStore.navigateHistory('prev')"
                :disabled="presetStore.filteredHistory.findIndex(p => p.id === selectedPreset?.id) <= 0"
                class="w-8 h-8 rounded-full border border-neutral-800 flex items-center justify-center text-neutral-500 hover:text-synth-neon hover:border-synth-neon hover:bg-synth-neon/10 disabled:opacity-20 transition-all active:scale-90"
              >
                <ChevronLeft class="w-4 h-4" />
              </button>
              <button
                @click="presetStore.navigateHistory('next')"
                :disabled="presetStore.filteredHistory.findIndex(p => p.id === selectedPreset?.id) >= presetStore.filteredHistory.length - 1"
                class="w-8 h-8 rounded-full border border-neutral-800 flex items-center justify-center text-neutral-500 hover:text-synth-neon hover:border-synth-neon hover:bg-synth-neon/10 disabled:opacity-20 transition-all active:scale-90"
              >
                <ChevronRight class="w-4 h-4" />
              </button>
            </div>

            <div class="w-px h-5 bg-neutral-800/50 shrink-0"></div>

            <!-- CATEGORY TABS -->
            <div class="flex items-center gap-1 overflow-x-auto no-scrollbar py-1 min-w-0">
              <!---@click="isPanelCollapsed = !isPanelCollapsed"-->
              <button
                @click="isPanelCollapsed = !isPanelCollapsed"
                :class="['px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 shrink-0', !isPanelCollapsed ? 'bg-synth-neon text-black shadow-[0_0_12px_rgba(0,255,166,0.4)]' : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/5']" :data-tooltip="!isPanelCollapsed?'Hide Controls':'Show Controls'"
              >
                <SlidersHorizontal class="w-3 h-3" />
              </button>
              <button
                @click="activeCategory = null"
                :class="['px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 shrink-0', !activeCategory ? 'bg-synth-neon text-black shadow-[0_0_12px_rgba(0,255,166,0.4)]' : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/5']"
              >
                <LayoutGrid class="w-3 h-3" />
                Grid
              </button>
              <div class="w-px h-3 bg-neutral-800/50 mx-1 shrink-0"></div>
              <button
                v-for="cat in categoriesWithCtrls"
                :key="cat.id"
                @click="setActiveCategory(cat.id)"
                :class="['px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0 flex items-center gap-2', activeCategory === cat.id ? 'text-black shadow-md' : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/5']"
                :style="activeCategory === cat.id ? { backgroundColor: cat.color, boxShadow: `0 0 12px ${cat.color}66` } : {}"
              >
                <Network v-if="cat.id === 'FLOW'" class="w-3 h-3" />
                {{ cat.name === 'SIGNAL_FLOW' ? 'FLOW' : cat.name }}
              </button>
            </div>
        </div>

        
      </div>
      
      <!-- ── COLLAPSE TOGGLE ── -->
      <button
        @click="isPanelCollapsed = !isPanelCollapsed"
        class="w-full py-1 bg-neutral-900/40 hover:bg-synth-neon/5 text-neutral-700 hover:text-synth-neon transition-all border-b border-neutral-900 flex items-center justify-center gap-2 shrink-0"
      >
        <span class="text-[8px] font-black uppercase tracking-[0.2em]">{{ isPanelCollapsed ? 'Show Controls' : 'Hide Controls' }}</span>
        <ChevronDown v-if="isPanelCollapsed" class="w-2.5 h-2.5" />
        <ChevronUp v-else class="w-2.5 h-2.5" />
      </button>

      <!-- ── CONTROL PANEL BODY ── -->
      <div
        v-if="!isPanelCollapsed"
        class="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-6 pb-32"
        :class = "activeCategory ? 'bg-black border border-black/50 rounded-lg': 'bg-transparent'"
      >
        <div v-if="activeCategory" class="h-full">
          <div v-for="cat in categoriesWithCtrls.filter(c => c.id === activeCategory)" :key="cat.id" class="h-full flex flex-col md:flex-row gap-8 items-start">
            
            <!-- LEFT: VISUALIZER (Glass Style) - Only if category has one -->
            <div v-if="VISUALIZER_CATEGORIES.includes(cat.id)" class="w-full md:w-1/2 flex flex-col gap-3 shrink-0">
              <div class="w-full h-auto aspect-video md:aspect-auto md:min-h-[300px] md:max-h-[380px] relative rounded-lg border border-white/10 bg-neutral-950/80 backdrop-blur-2xl flex items-center justify-center overflow-hidden group shadow-2xl display-glass">
                <!-- Hardware Screen Effect Overlays -->
                <div class="absolute inset-0 z-20 pointer-events-none glass-reflection"></div>
                <div class="absolute inset-0 z-10 pointer-events-none scanlines"></div>
                
                <!-- Responsive visualizer components -->
                <SignalFlowVisualizer v-if="cat.id === 'FLOW'"
                    :data="activeData"
                    :width="600"
                    :height="160"
                    :color="cat.color || '#00ff88'"
                  />
              <EfxMixerVisualizer v-else-if="cat.name =='EFX'"
                  :delay="activeData?.delayLvl || 0"
                  :reverb="activeData?.reverb || 0"
                  :chorus="activeData?.chorusMode || 0"
                  :width="240"
                  :height="120"
                  :color="cat.color"
                />
              <OscMixerVisualizer v-if="cat.name =='OSCILLATOR'"
                  :pulse="activeData?.oscSq || 0"
                  :saw="activeData?.oscSaw || 0"
                  :lfo="activeData?.oscLFO || 0"
                  :sub="activeData?.oscSub || 0"
                  :noise="activeData?.oscNoise || 0"
                  :width="240"
                  :height="120"
                  :color="cat.color"
                />
              <WaveformVisualizer v-if="cat.name =='LFO'"
                  :waveform="activeData?.lfoWave || 0"
                  :rate="activeData?.lfoRate || 64"
                  :lfoFilter="activeData?.lfoFilt || 0"
                  :width="240"
                  :height="120"
                  :color="cat.color"
                />
              <AdsrEnvelope v-if="cat.name =='ENV'"
                  :attack="activeData?.attack || 0"
                  :decay="activeData?.decay || 64"
                  :sustain="activeData?.sustain || 127"
                  :release="activeData?.release || 64"
                  :width="240"
                  :height="120"
                  :color="cat.color"
                />
              <FilterEnvelope v-if="cat.name =='FILTER'"
                  :cutoff="activeData?.cutoff || 0"
                  :resonance="activeData?.res || 0"
                  :width="240"
                  :height="120"
                  :color="cat.color"
                />

              <!-- Back button inside visualizer for mobile? -->
              <div class="absolute bottom-6 left-6 flex items-center gap-3">
                 <div class="h-1 w-8 rounded-full" :style="{ backgroundColor: cat.color }"></div>
                 <span class="text-[10px] font-mono text-neutral-500 uppercase tracking-[0.4em]">REALTIME // DATA_FLOW</span>
              </div>
            </div>

            <!-- Characterization Note for FLOW (Outside) -->
            <div v-if="cat.id === 'FLOW'" class="px-2 py-1.5 border-l-2 border-white/5 ml-2 mt-auto space-y-4">
              <p class="text-[9px] font-mono text-white/30 leading-tight uppercase tracking-[0.1em]">
                Primary controls defining this sound's architecture are listed on the right.
              </p>
              
              <!-- Patch Notes Display -->
              <div v-if="presetStore.currentPatchNotes || presetStore.lastPreset?.patchNotes" class="mt-2 p-2 rounded-lg bg-neutral-900/50 border border-white/5 max-h-[120px] flex flex-col">
                <div class="flex items-center gap-2 mb-2 opacity-40 shrink-0">
                  <BookOpen class="w-3 h-3 text-white" />
                  <span class="text-[8px] font-black uppercase tracking-[0.2em]">Engineering Notes</span>
                </div>
                <div class="flex-1 overflow-y-auto custom-scrollbar pr-1">
                  <p class="text-[9px] font-mono text-light-blue leading-relaxed uppercase tracking-wide">
                    "{{ presetStore.currentPatchNotes || presetStore.lastPreset?.patchNotes }}"
                  </p>
                </div>
              </div>
            </div>
          </div>

            <!-- RIGHT: CONTROLS (List) -->
            <div class="flex-1 w-full space-y-6 md:max-h-[500px] overflow-y-auto px-6 pb-20 custom-scrollbar">
              <div class="flex items-center gap-3 mb-2">
                <h4 class="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Module Controls</h4>
                <div class="h-px flex-1 bg-neutral-900"></div>
              </div>
              
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6 p-2">
                
                <!-- COLUMN 1: SLIDERS -->
                <div v-if="hasSliders(cat.controllers)" class="space-y-2">
                  <div class="flex items-center gap-2 mb-2">
                    <span class="text-[9px] font-black text-neutral-500 uppercase tracking-widest">Parameters</span>
                    <div class="h-px flex-1 bg-neutral-900/50"></div>
                  </div>
                  <template v-for="cfg in cat.controllers" :key="'sl-' + (cfg.id || cfg.cc)">
                    <div
                      v-if="isSlider(cfg)"
                      tabindex="0"
                      @mousedown="startHDrag(cfg, $event)"
                      @keydown="handleKeyNudge(cfg, $event)"
                      :class="['bg-black/60 border border-neutral-900 rounded-sm p-2 flex flex-col gap-2 cursor-ew-resize hover:border-neutral-700 transition-all group/sl', getHighlightClass(cfg)]"
                    >
                      <div class="flex justify-between items-center">
                        <span class="text-sm font-mono font-bold text-white uppercase tracking-tight">{{ cfg.label }}</span>
                        <span class="text-sm font-mono font-bold" :style="{ color: cat.color }">{{ Math.round(getVal(cfg)) }}</span>
                      </div>
                      <div class="h-4 bg-neutral-950 rounded-full p-1 border border-neutral-900 overflow-hidden shadow-inner">
                        <div class="h-full rounded-full transition-all duration-75" :style="{ width: getPercent(cfg) + '%', backgroundColor: cat.color, boxShadow: `0 0 12px ${cat.color}88` }"></div>
                      </div>
                    </div>
                  </template>
                </div>

                <!-- COLUMN 2: SWITCHES & MULTI -->
                <div v-if="hasSettings(cat.controllers)" class="space-y-6">
                  <div class="flex items-center gap-2 mb-2">
                    <span class="text-[9px] font-black text-neutral-500 uppercase tracking-widest">Settings</span>
                    <div class="h-px flex-1 bg-neutral-900/50"></div>
                  </div>
                  <template v-for="cfg in cat.controllers" :key="cfg.id || cfg.cc">
                    <!-- SWITCH -->
                    <div
                      v-if="isSetting(cfg) && cfg.type !== 'MULTI'"
                      tabindex="0"
                      @click="handleValueUpdate(cfg, getVal(cfg) >= 1 ? 0 : 1)"
                      @keydown="handleKeyNudge(cfg, $event)"
                      :class="['bg-black/60 border border-neutral-900 rounded-sm p-1 flex items-center justify-between cursor-pointer hover:border-neutral-700 transition-all group/sw', getHighlightClass(cfg)]"
                    >
                      <span class="text-sm font-mono font-bold text-white uppercase tracking-tight">{{ cfg.label }}</span>
                      <div
                        :class="['px-1 py-1.5 rounded-sm border text-[10px] font-black uppercase transition-all', getVal(cfg) >= 1 ? 'text-black' : 'bg-neutral-900 border-neutral-800 text-neutral-500']"
                        :style="getVal(cfg) >= 1 ? { backgroundColor: cat.color, borderColor: cat.color, boxShadow: `0 0 15px ${cat.color}44` } : {}"
                      >{{ getVal(cfg) >= 1 ? 'Active' : 'Disabled' }}</div>
                    </div>

                    <!-- MULTI -->
                    <div
                      v-else-if="cfg.type === 'MULTI'"
                      :class="['bg-black/60 border border-neutral-900 rounded-sm p-2 space-y-2 transition-all', getHighlightClass(cfg)]"
                    >
                      <div class="flex justify-between items-center">
                        <span class="text-sm font-mono font-bold text-white uppercase tracking-tight">{{ cfg.label }}</span>
                        <span class="text-[10px] font-mono font-bold px-1 py-0.5 rounded-sm uppercase"
                          :style="{ color: cat.color, backgroundColor: cat.color + '1A', border: `1px solid ${cat.color}33` }">
                          {{ getActiveOption(cfg).label }}
                        </span>
                      </div>
                      <div class="flex flex-wrap gap-2">
                        <template v-if="(cfg.options || []).length > 0">
                          <button
                            v-for="opt in cfg.options" :key="opt.value"
                            @click="handleValueUpdate(cfg, opt.value)"
                            :class="['px-2 py-1 rounded-sm border text-[10px] font-mono font-bold uppercase transition-all', getActiveOption(cfg).value === opt.value ? 'text-black' : 'bg-neutral-900/50 border-neutral-800 text-neutral-400 hover:border-neutral-700']"
                            :style="getActiveOption(cfg).value === opt.value ? { backgroundColor: cat.color, borderColor: cat.color } : {}"
                          >{{ opt.label }}</button>
                        </template>
                      </div>
                    </div>

                    <!-- SLIDER (Hidden here as it's in Column 1) -->
                    <div
                      v-if="false"
                      tabindex="0"
                      @mousedown="startHDrag(cfg, $event)"
                      @keydown="handleKeyNudge(cfg, $event)"
                      :class="['bg-black/60 border border-neutral-900 rounded-sm p-2 flex flex-col gap-3 cursor-ew-resize hover:border-neutral-700 transition-all group/sl', getHighlightClass(cfg)]"
                    >
                      <div class="flex justify-between items-center">
                        <span class="text-sm font-mono font-bold text-white uppercase tracking-tight">{{ cfg.label }}</span>
                        <span class="text-sm font-mono font-bold" :style="{ color: cat.color }">{{ Math.round(getVal(cfg)) }}</span>
                      </div>
                      <div class="h-4 bg-neutral-950 rounded-full p-1 border border-neutral-900 overflow-hidden shadow-inner">
                        <div class="h-full rounded-full transition-all duration-75" :style="{ width: getPercent(cfg) + '%', backgroundColor: cat.color, boxShadow: `0 0 12px ${cat.color}88` }"></div>
                      </div>
                    </div>
                  </template>
                </div>
              </div>
            </div>

          </div>
        </div>

        <!-- Compact Grid View (Default) -->
        <div
          v-else-if="categoriesWithCtrls.length > 0"
          class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 gap-x-10 gap-y-12 items-start">
          <div
            v-for="cat in categoriesWithCtrls"
            :key="cat.id"
            class="w-full max-w-[220px] space-y-6"
          >
            <!-- Category header -->
            <div class="flex items-center gap-3 cursor-pointer group/cat" @click="setActiveCategory(cat.id)">
              <div class="h-[2px] w-6 shrink-0 transition-all group-hover/cat:w-10" :style="{ backgroundColor: cat.color }"></div>
              <h3 class="text-[12px] font-black uppercase tracking-[0.3em] whitespace-nowrap transition-colors group-hover/cat:brightness-125" :style="{ color: cat.color }">
                {{ cat.name }}
              </h3>
              <div class="h-[1px] flex-1 bg-neutral-900 group-hover/cat:bg-neutral-800"></div>
            </div>

            <!-- Controllers -->
            <div class="flex flex-col gap-4">
              <EfxMixerVisualizer v-if="cat.name =='EFX'"
                  :delay="activeData?.delayLvl || 0"
                  :reverb="activeData?.reverb || 0"
                  :chorus="activeData?.chorus || 0"
                  :width="170"
                  :height="80"
                  :color="cat.color"
                />
              <OscMixerVisualizer v-if="cat.name =='OSCILLATOR'"
                  :pulse="activeData?.oscSq || 0"
                  :saw="activeData?.oscSaw || 0"
                  :lfo="activeData?.oscLFO || 0"
                  :sub="activeData?.oscSub || 0"
                  :noise="activeData?.oscNoise || 0"
                  :width="170"
                  :height="80"
                  :color="cat.color"
                />
              <WaveformVisualizer v-if="cat.name =='LFO'"
                  :waveform="activeData?.lfoWave || 0"
                  :rate="activeData?.lfoRate || 64"
                  :width="170"
                  :height="80"
                  :color="cat.color"
                />
              <AdsrEnvelope v-if="cat.name =='ENV'"
                  :attack="activeData?.attack || 0"
                  :decay="activeData?.decay || 64"
                  :sustain="activeData?.sustain || 127"
                  :release="activeData?.release || 64"
                  :width="170"
                  :height="80"
                  :color="cat.color"
                />
                <!-- if cat.name == 'FILTER' -->
                <FilterEnvelope v-if="cat.name =='FILTER'"
                  :cutoff="activeData?.cutoff || 0"
                  :resonance="activeData?.res || 0"
                  :width="170"
                  :height="80"
                  :color="cat.color"
                />
              <template v-for="cfg in cat.controllers" :key="cfg.id || cfg.cc">

                <!-- SWITCH -->
                <div
                  v-if="cfg.type === 'SWITCH' || (cfg.max <= 1 && cfg.min === 0 && !cfg.type)"
                  tabindex="0"
                  @click="handleValueUpdate(cfg, getVal(cfg) >= 1 ? 0 : 1)"
                  @keydown="handleKeyNudge(cfg, $event)"
                  :class="['bg-black/60 border border-neutral-900 rounded-xl p-3 flex items-center justify-between cursor-pointer outline-none focus:ring-1 select-none transition-all', getHighlightClass(cfg)]"
                  :style="{ '--tw-ring-color': cat.color }"
                >
                  <span class="text-[12px] font-mono font-bold text-white uppercase truncate pr-2">{{ cfg.label }}</span>
                  <div
                    :class="['px-2 py-0.5 rounded border text-[8px] font-black uppercase transition-all', getVal(cfg) >= 1 ? 'text-black' : 'bg-neutral-900 border-neutral-800 text-white']"
                    :style="getVal(cfg) >= 1 ? { backgroundColor: cat.color, borderColor: cat.color, boxShadow: `0 0 10px ${cat.color}55` } : {}"
                  >{{ getVal(cfg) >= 1 ? 'ON' : 'OFF' }}</div>
                </div>

                <!-- MULTI -->
                <div
                  v-else-if="cfg.type === 'MULTI'"
                  tabindex="0"
                  @keydown="handleKeyNudge(cfg, $event)"
                  :class="['bg-black/60 border border-neutral-900 rounded-xl p-3 space-y-2.5 outline-none focus:ring-1 select-none transition-all', getHighlightClass(cfg)]"
                  :style="{ '--tw-ring-color': cat.color }"
                >
                  <div class="flex justify-between items-center">
                    <span class="text-[12px] font-mono font-bold text-white uppercase truncate pr-2">{{ cfg.label }}</span>
                    <span class="text-[12px] font-mono font-bold px-1 rounded uppercase"
                      :style="{ color: cat.color, backgroundColor: cat.color + '1A' }">
                      {{ getActiveOption(cfg).label }}
                    </span>
                  </div>
                  <div class="flex flex-wrap gap-1">
                    <template v-if="(cfg.options || []).length > 0">
                      <button
                        v-for="opt in cfg.options" :key="opt.value"
                        @click="handleValueUpdate(cfg, opt.value)"
                        :class="['min-w-[40px] h-6 px-2 rounded border text-[8px] font-mono font-bold uppercase transition-all', getActiveOption(cfg).value === opt.value ? 'text-black' : 'bg-neutral-900/50 border-neutral-800 text-white hover:border-neutral-700']"
                        :style="getActiveOption(cfg).value === opt.value ? { backgroundColor: cat.color, borderColor: cat.color } : {}"
                      >{{ opt.label }}</button>
                    </template>
                    <template v-else>
                      <button
                        v-for="i in (cfg.max + 1)" :key="i - 1"
                        @click="handleValueUpdate(cfg, i - 1)"
                        :class="['min-w-[24px] h-6 px-1 rounded border text-[9px] font-mono font-bold transition-all', getVal(cfg) === i - 1 ? 'text-black' : 'bg-neutral-900/50 border-neutral-800 text-white hover:border-neutral-700']"
                        :style="getVal(cfg) === i - 1 ? { backgroundColor: cat.color, borderColor: cat.color } : {}"
                      >{{ i - 1 }}</button>
                    </template>
                  </div>
                </div>

                <!-- VERTICAL SLIDER -->
                <div
                  v-else-if="cfg.type === 'SLIDER_V'"
                  tabindex="0"
                  @keydown="handleKeyNudge(cfg, $event)"
                  :class="['bg-black/60 border border-neutral-900 rounded-xl p-3 flex flex-col items-center gap-3 outline-none focus:ring-1 select-none transition-all', getHighlightClass(cfg)]"
                  :style="{ '--tw-ring-color': cat.color }"
                >
                  <div class="w-full flex justify-between items-center bg-neutral-900/40 rounded px-1.5 py-0.5">
                    <span class="text-[12px] font-mono font-bold text-white uppercase truncate pr-2">{{ cfg.label }}</span>
                    <span class="text-[12px] font-mono font-bold" :style="{ color: cat.color }">{{ Math.round(getVal(cfg)) }}</span>
                  </div>
                  <div
                    class="h-32 w-8 bg-neutral-950 rounded-lg relative overflow-hidden border border-neutral-900 cursor-ns-resize shadow-inner select-none"
                    @mousedown="startVDrag(cfg, $event)"
                  >
                    <div class="absolute inset-x-0 h-full flex flex-col justify-between py-2 pointer-events-none opacity-20">
                      <div v-for="n in 5" :key="n" class="w-full h-px bg-white/20"></div>
                    </div>
                    <div
                      class="absolute bottom-0 left-0 w-full border-t border-white/30"
                      :style="{ height: getPercent(cfg) + '%', backgroundColor: cat.color, boxShadow: `0 0 15px ${cat.color}66` }"
                    >
                      <div class="w-full h-1 bg-white/40 absolute top-0"></div>
                    </div>
                  </div>
                </div>

                <!-- HORIZONTAL SLIDER (default) -->
                <div
                  v-else
                  tabindex="0"
                  @mousedown="startHDrag(cfg, $event)"
                  @keydown="handleKeyNudge(cfg, $event)"
                  :class="['bg-black/60 border border-neutral-900 rounded-xl p-3 flex flex-col gap-2 outline-none focus:ring-1 cursor-ew-resize select-none transition-all', getHighlightClass(cfg)]"
                  :style="{ '--tw-ring-color': cat.color }"
                >
                  <div class="flex justify-between items-center">
                    <span class="text-[12px] font-mono font-bold text-white uppercase truncate pr-2">{{ cfg.label }}</span>
                    <span class="text-[12px] font-mono font-bold" :style="{ color: cat.color }">{{ Math.round(getVal(cfg)) }}</span>
                  </div>
                  <div class="h-3 bg-neutral-950 rounded-full overflow-hidden border border-neutral-900 pointer-events-none">
                    <div class="h-full" :style="{ width: getPercent(cfg) + '%', backgroundColor: cat.color, boxShadow: `0 0 8px ${cat.color}99` }"></div>
                  </div>
                </div>

              </template>
              <!-- if cat.name == 'ENV' -->
              
            </div>
          </div>



        </div>

        <!-- Uncategorized -->
        <div v-if="uncategorizedCtrls.length > 0" class="mt-12 p-6 border-t border-dashed border-neutral-900">
          <div class="flex items-center gap-3 mb-8">
            <div class="h-[2px] w-8 bg-neutral-800"></div>
            <h3 class="text-[12px] font-black text-neutral-600 uppercase tracking-[0.3em]">UNCATEGORIZED</h3>
            <div class="h-[1px] flex-1 bg-neutral-900"></div>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-4 items-start">
            <div
              v-for="cfg in uncategorizedCtrls" :key="cfg.id || cfg.cc"
              tabindex="0"
              @mousedown="startHDrag(cfg, $event)"
              @keydown="handleKeyNudge(cfg, $event)"
              :class="['bg-black/40 border border-neutral-900 rounded-xl p-3 space-y-2 cursor-ew-resize select-none outline-none focus:ring-1 focus:ring-neutral-700 transition-all', getHighlightClass(cfg)]"
            >
              <div class="flex justify-between items-center">
                <span class="text-[12px] font-black text-white uppercase truncate pr-2">{{ cfg.label }}</span>
                <span class="text-[12px] font-mono font-bold text-neutral-400">{{ Math.round(getVal(cfg)) }}</span>
              </div>
              <div class="h-1 bg-neutral-950 rounded-full overflow-hidden">
                <div class="h-full bg-neutral-700" :style="{ width: getPercent(cfg) + '%' }"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Status bar -->
        <!-- <div class="mt-12 py-8 border-t border-neutral-900 flex items-center justify-center gap-4">
          <div class="w-1.5 h-1.5 rounded-full bg-synth-neon animate-pulse"></div>
          <p class="text-[10px] font-mono text-neutral-700 uppercase tracking-widest">
            X-BRIDGE_PROTOCOL_STABLE // {{ new Date().toLocaleTimeString() }}
          </p>
          <div class="w-1.5 h-1.5 rounded-full bg-synth-neon animate-pulse"></div>
        </div> -->
      </div>

    <!-- ── COLLAPSED VIEW: BIG GENERATE BUTTON ── -->
      <div v-else class="flex-1 flex flex-col items-center justify-center bg-grid-neon p-8 overflow-hidden">
        <div class="relative p-12 rounded-full border-4 border-dashed border-neutral-900 flex items-center justify-center">
          <div class="absolute inset-0 rounded-full border-2 border-t-synth-neon border-r-transparent border-l-transparent border-b-transparent opacity-30 animate-spin-slow"></div>
          
          <!-- Background Waveform Animation (any audio playing) -->
          <div v-if="uiStore.isAudioPlaying" class="absolute inset-0 flex items-center justify-center gap-1 opacity-40 pointer-events-none">
            <div v-for="i in 40" :key="i" 
              class="wave-bar w-1.5 rounded-full"
              :style="{ 
                backgroundColor: ['#00ffa6', '#d946ef', '#fb923c', '#22d3ee'][i % 4],
                animationDelay: `${i * 0.02}s`,
                animationDuration: `${0.4 + (i % 5) * 0.1}s`,
                boxShadow: `0 0 15px ${['rgba(0,255,166,0.4)', 'rgba(217,70,239,0.4)', 'rgba(251,146,60,0.4)', 'rgba(34,211,238,0.4)'][i % 4]}`
              }" 
            ></div>
          </div>

          <button
            @click="presetStore.generate()"
            :disabled="presetStore.isGenerating || presetStore.limitReached"
            class="w-48 h-48 md:w-64 md:h-64 rounded-full flex flex-col items-center justify-center gap-4 transition-all duration-300 relative bg-black/30 text-synth-neon border-4 border-synth-neon hover:bg-synth-neon/70 hover:text-black active:scale-95 shadow-[0_0_30px_rgba(0,163,112,0.3)] disabled:opacity-50 disabled:cursor-not-allowed group z-10"
          >
            <div class="absolute inset-2 rounded-full border border-synth-neon/20 pointer-events-none"></div>
            <Zap v-if="!presetStore.isGenerating" class="w-16 h-16 md:w-20 md:h-20 drop-shadow-[0_0_8px_rgba(0,163,112,0.8)] transition-transform group-hover:scale-110" />
            <svg v-else class="w-16 h-16 md:w-20 md:h-20 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <span class="font-black uppercase tracking-[0.4em] text-[10px] mt-2">
              {{ presetStore.isGenerating ? 'Syncing...' : 'Generate' }}
            </span>
          </button>
        </div>
        <p class="text-[12px] font-mono text-neutral-600 uppercase tracking-[0.4em] mt-12">
          Current Type <span class="text-[20px] text-synth-neon border border-synth-neon rounded-lg px-2 py-1">{{ presetStore.currentCategory }}</span>
        </p>
        <p class="text-[10px] font-mono text-neutral-600 uppercase tracking-[0.4em] mt-4 animate-pulse">
          Controls are currently hidden
        </p>
      </div>

    </template>

    <!-- Copy toast -->
    <Transition name="fade">
      <div v-if="showCopyFeedback" class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] pointer-events-none">
        <div class="flex items-center gap-2 bg-emerald-950/90 border border-emerald-800 text-emerald-300 px-4 py-2 rounded-lg text-sm font-medium shadow-xl">
          <span>✓ Copied to clipboard</span>
        </div>
      </div>
    </Transition>

    <!-- Live Set toast -->
    <Transition name="fade">
      <div v-if="liveSetFeedback" class="fixed bottom-16 left-1/2 -translate-x-1/2 z-[200] pointer-events-none">
        <div :class="['flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium shadow-xl border',
          liveSetFeedback === 'full'
            ? 'bg-red-950/90 border-red-800 text-red-300'
            : 'bg-purple-950/90 border-purple-800 text-purple-300']">
          <LayoutGrid class="w-4 h-4 shrink-0" />
          <span>{{ liveSetFeedback === 'full' ? 'Live Pad full — all 16 slots used' : `Added to Live Pad slot ${liveSetFeedback.split(':')[1]}` }}</span>
        </div>
      </div>
    </Transition>

    <!-- Save toast -->
    <Transition name="fade">
      <div v-if="showSaveFeedback" class="fixed bottom-10 left-1/2 -translate-x-1/2 z-[200] pointer-events-none">
        <div class="flex items-center gap-2 bg-emerald-950/90 border border-emerald-800 text-emerald-300 px-4 py-2 rounded-lg text-sm font-medium shadow-xl">
          <Save class="w-4 h-4" />
          <span>✓ Preset Saved</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.display-glass {
  box-shadow: 
    inset 0 0 20px rgba(0,0,0,0.9),
    0 4px 15px rgba(0,0,0,0.5);
}

.glass-reflection {
  background: linear-gradient(
    135deg, 
    rgba(255,255,255,0.12) 0%, 
    rgba(255,255,255,0.05) 40%, 
    rgba(255,255,255,0) 50%,
    rgba(255,255,255,0.02) 100%
  );
  border-radius: inherit;
}

.scanlines {
  background: linear-gradient(
    rgba(18, 16, 16, 0) 50%, 
    rgba(0, 0, 0, 0.1) 50%
  ), linear-gradient(
    90deg, 
    rgba(255, 0, 0, 0.02), 
    rgba(0, 255, 0, 0.01), 
    rgba(0, 0, 255, 0.02)
  );
  background-size: 100% 2px, 3px 100%;
}

.display-glass::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  box-shadow: inset 0 0 10px rgba(255,255,255,0.05);
  z-index: 25;
}

.presets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 1rem;
}
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.cursor-ew-resize, .cursor-ns-resize { -webkit-user-select: none; user-select: none; }

@keyframes spin-slow {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.animate-spin-slow {
  animation: spin-slow 8s linear infinite;
}
@keyframes pulse-glow {
  0% { box-shadow: 0 0 8px rgba(0, 255, 136, 0.3); transform: scale(1.02); }
  50% { box-shadow: 0 0 20px rgba(0, 255, 136, 0.7); transform: scale(1.025); }
  100% { box-shadow: 0 0 8px rgba(0, 255, 136, 0.3); transform: scale(1.02); }
}
.animate-pulse-glow {
  animation: pulse-glow 0.8s ease-in-out infinite;
  z-index: 50 !important;
  isolation: isolate;
}

.wave-bar {
  height: 160px;
  transform-origin: center;
  animation: wave-pulse 0.5s ease-in-out infinite alternate;
  box-shadow: 0 0 15px rgba(0, 255, 136, 0.4);
}

@keyframes wave-pulse {
  0% { transform: scaleY(0.1); opacity: 0.2; }
  100% { transform: scaleY(2.0); opacity: 0.8; }
}
/* Remove internal component backgrounds to match the panel */
:deep(.adsr-container),
:deep(.filter-container),
:deep(.efx-mixer-container),
:deep(.osc-mixer-container),
:deep(.waveform-container) {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}

:deep(svg) {
  filter: drop-shadow(0 0 4px rgba(255,255,255,0.1));
  transition: all 0.3s ease;
}
</style>
