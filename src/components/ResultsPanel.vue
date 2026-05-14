<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { Edit3, Play, Square, Copy, Trash2, Save, ChevronDown, ChevronUp, Heart, Zap, Layers, ListMusic, LayoutGrid } from 'lucide-vue-next'
import { MidiSource } from '@/core/midi/MidiService'
import { usePresetStore } from '@/stores/usePresetStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useArpStore } from '@/stores/useArpStore'
import { useUiStore } from '@/stores/useUiStore'
import { S1_CC_MAP, FIELD_TO_CC } from '@/constants/s1-config'
import AdsrEnvelope from '@/components/AdsrEnvelope.vue'
import FilterEnvelope from '@/components/FilterEnvelope.vue'
import WaveformVisualizer from '@/components/WaveformVisualizer.vue'
import OscMixerVisualizer from '@/components/OscMixerVisualizer.vue'
import EfxMixerVisualizer from '@/components/EfxMixerVisualizer.vue'

const presetStore = usePresetStore()
const midiStore = useMidiStore()
const authStore = useAuthStore()
const configStore = useConfigStore()
const arpStore = useArpStore()
const uiStore = useUiStore()

const isEditingName = ref(false)
const tempName = ref('')
const isPanelCollapsed = ref(false)
const showCopyFeedback = ref(false)
const liveSetFeedback = ref('')
const isPlayingPreview = ref(false)
const _previewTimeouts = []

function stopPreview() {
  _previewTimeouts.forEach(id => clearTimeout(id))
  _previewTimeouts.length = 0
  isPlayingPreview.value = false
}

function playPreview() {
  stopPreview()
  isPlayingPreview.value = true

  const bpmScale = 120 / (arpStore.arpBpm || 120)
  const step = 280 * bpmScale

  // Simple ascending arpeggio: C4 major + octave
  const notes = [60, 64, 67, 72, 67, 64, 60]
  notes.forEach((note, i) => {
    _previewTimeouts.push(
      setTimeout(() => midiStore.sendNoteOn(note, 80, undefined, MidiSource.UI), i * step),
      setTimeout(() => midiStore.sendNoteOff(note, MidiSource.UI), i * step + step * 0.75),
    )
  })
  _previewTimeouts.push(
    setTimeout(() => { isPlayingPreview.value = false }, notes.length * step),
  )
}

function selectEngineA() {
  const wasAlt = presetStore.useAlternativeEngine
  presetStore.useAlternativeEngine = false
  if (wasAlt && presetStore.lastPreset?.data) {
    stopPreview()
    presetStore.applyPresetCCs(presetStore.lastPreset)
  }
}

function selectEngineB() {
  const wasStd = !presetStore.useAlternativeEngine
  presetStore.useAlternativeEngine = true
  if (wasStd && presetStore.lastPreset?.abVariant?.data) {
    stopPreview()
    presetStore.applyPresetCCs({ data: presetStore.lastPreset.abVariant.data })
  }
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

const activeData = computed(() =>
  (presetStore.useAlternativeEngine && presetStore.lastPreset?.abVariant?.data)
    ? presetStore.lastPreset.abVariant.data
    : presetStore.lastPreset?.data
)

function getVal(cfg) {
  return activeData.value?.[cfg.name] ?? cfg.min ?? 0
}

function getPercent(cfg) {
  const val = getVal(cfg)
  const min = cfg.min ?? 0
  const max = cfg.max ?? 127
  return Math.max(0, Math.min(100, ((val - min) / (max - min || 1)) * 100))
}

function handleValueUpdate(cfg, rawValue) {
  const min = cfg.min ?? 0
  const max = cfg.max ?? 127
  const clamped = Math.max(min, Math.min(max, Math.round(rawValue)))
  presetStore.updateFieldValue(cfg.name, clamped)
  if (midiStore.selectedDevice) {
    midiStore.sendCC(cfg.cc, clamped, undefined, MidiSource.UI)
  }
}

// ─── Drag handlers ────────────────────────────────────────────────────────────

function startHDrag(cfg, event) {
  event.preventDefault()
  const rect = event.currentTarget.getBoundingClientRect()
  const min = cfg.min ?? 0
  const max = cfg.max ?? 127
  const update = (e) => {
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
    handleValueUpdate(cfg, min + (x / rect.width) * (max - min))
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
  const min = cfg.min ?? 0
  const max = cfg.max ?? 127
  const update = (e) => {
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top))
    handleValueUpdate(cfg, min + (1 - y / rect.height) * (max - min))
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
  const catIds = new Set(configStore.categories.map(c => c.id))
  return configStore.categories
    .map(cat => ({
      ...cat,
      controllers: configStore.midiConfig
        .filter(cfg => cfg.category === cat.id)
        .sort((a, b) => (a.order || 0) - (b.order || 0)),
    }))
    .filter(cat => cat.controllers.length > 0)
})

const uncategorizedCtrls = computed(() => {
  const catIds = new Set(configStore.categories.map(c => c.id))
  return configStore.midiConfig.filter(cfg => !cfg.category || !catIds.has(cfg.category))
})

// ─── Preset actions ───────────────────────────────────────────────────────────

function startEditingName() { tempName.value = presetStore.currentName; isEditingName.value = true }
function saveName() { if (tempName.value.trim()) presetStore.currentName = tempName.value.trim(); isEditingName.value = false }

async function handleCopyToClipboard() {
  try {
    await navigator.clipboard.writeText(JSON.stringify(selectedPreset.value?.data || {}, null, 2))
    showCopyFeedback.value = true
    setTimeout(() => { showCopyFeedback.value = false }, 2000)
  } catch (e) { console.error('Copy failed', e) }
}

function handleDeletePreset() {
  if (!selectedPreset.value) return
  if (confirm('Delete this preset? This cannot be undone.')) {
    presetStore.deletePreset(selectedPreset.value.id)
    presetStore.showResults = false
  }
}

async function handleSavePreset() {
  try { await presetStore.savePreset() }
  catch (err) { if (err.message === 'slot_limit') alert('Preset slot limit reached.') }
}

function toggleFavorite() {
  const preset = selectedPreset.value
  if (!preset) return
  if (!presetStore.history.find(h => h.id === preset.id)) { alert('Save the preset first before favoriting.'); return }
  presetStore.toggleFavorite(preset.id)
}

const isFavorite = computed(() => {
  const id = selectedPreset.value?.id
  return !!(id && presetStore.history.find(h => h.id === id)?.isFavorite)
})

function getCategoryIcon(cat) {
  const map = { pad:'🎹', lead:'⚡', bass:'🔊', drum:'🥁', synth:'🎛️', ambient:'☁️',
    strings:'🎻', brass:'🎺', piano:'🎹', organ:'🎹', percussion:'🥁', pluck:'🎸',
    bell:'🔔', arp:'↗️', texture:'🌊', drone:'👻', experimental:'🧪', key:'🎵', acid:'⚗️' }
  return map[cat] || '🎵'
}
</script>

<template>
  <div class="max-w-5xl m-auto h-full flex flex-col overflow-hidden bg-neutral-950 relative">

    <!-- ── NO PRESET: idle prompt ── -->
    <div v-if="!selectedPreset" class="flex-1 flex flex-col items-center justify-center gap-8 p-8">
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
          @click="uiStore.isHistoryOpen = true"
          class="flex items-center gap-2 bg-neutral-800 text-neutral-300 px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-neutral-700 transition-colors border border-neutral-700 active:scale-95"
        >
          <Layers class="w-4 h-4" /> Library
        </button>
      </div>
    </div>

    <!-- ── ACTIVE PRESET ── -->
    <template v-else>

      <!-- ── HEADER ── -->
      <div class="shrink-0 px-4 md:px-2 py-6 border-b border-neutral-900 bg-neutral-900/50 flex flex-col xl:flex-row xl:items-center gap-4">

        <!-- Col 1: Preset identity + primary actions -->
        <div class="flex flex-col items-center gap-4 min-w-0 flex-1 py-4">
          <!-- Preset identity -->
          <div class="flex items-center w-full px-6 gap-2">
            <!-- Category icon -->
            <div class="p-2.5 bg-synth-neon text-black shrink-0 rounded-xl text-lg flex items-center justify-center select-none">
              {{ getCategoryIcon(presetStore.currentCategory) }}
            </div>

            <!-- Name + category -->
            <div class="flex flex-col min-w-0 flex-1">
              <div v-if="isEditingName" class="flex items-center gap-2">
                <input
                  v-model="tempName"
                  type="text"
                  @blur="saveName"
                  @keydown.enter="saveName"
                  @keydown.esc="isEditingName = false"
                  autofocus
                  class="bg-neutral-800 text-white text-base font-black uppercase tracking-tight px-2 py-0.5 rounded border border-synth-neon/50 outline-none w-full"
                />
              </div>
              <h2
                v-else
                @click="startEditingName"
                :class="[
                  'text-2xl font-black uppercase tracking-tight leading-none hover:text-synth-neon cursor-pointer transition-colors group flex items-center gap-2 truncate',
                  presetStore.hasUnsavedChanges ? 'text-neutral-400' : 'text-white'
                ]"
              >
                <span class="truncate">{{ presetStore.hasUnsavedChanges ? `* ${presetStore.currentName}` : presetStore.currentName }}</span>
                <Edit3 class="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-40" />
              </h2>
              <span class="text-[10px] font-mono text-synth-neon uppercase tracking-widest mt-0.5">
                {{ presetStore.currentCategory }} MODE
              </span>
            </div>
          </div>

          <!-- Preset actions -->
          <div class="flex items-center w-full px-6 pt-4 gap-2">
            <!-- Preset action icons -->
            <div class="flex items-center gap-1.5 shrink-0">
              <!-- Prev/Next -->
              <div v-if="presetStore.filteredHistory.length > 0" class="flex bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
                <button
                  @click="presetStore.navigateHistory('prev')"
                  :disabled="presetStore.filteredHistory.findIndex(p => p.id === selectedPreset?.id) <= 0"
                  class="px-2.5 py-2 text-neutral-500 hover:text-synth-neon hover:bg-neutral-800 transition-colors border-r border-neutral-800 disabled:opacity-30 disabled:pointer-events-none"
                >
                  <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                </button>
                <button
                  @click="presetStore.navigateHistory('next')"
                  :disabled="presetStore.filteredHistory.findIndex(p => p.id === selectedPreset?.id) >= presetStore.filteredHistory.length - 1"
                  class="px-2.5 py-2 text-neutral-500 hover:text-synth-neon hover:bg-neutral-800 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                >
                  <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </button>
              </div>

              <!-- Save -->
              <button v-if="authStore.user" @click="handleSavePreset" :disabled="presetStore.isSaving" title="Save"
                class="p-2 rounded-lg border flex items-center justify-center bg-emerald-600/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-600/40 disabled:opacity-50 transition-colors">
                <Save :class="['w-6 h-6', presetStore.isSaving ? 'animate-pulse' : '']" />
              </button>

              <!-- Favorite -->
              <button @click="toggleFavorite" :class="['p-2 rounded-lg border flex items-center justify-center transition-colors', isFavorite ? 'bg-rose-500/20 text-rose-500 border-rose-500/50' : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-rose-500']" title="Favorite">
                <Heart :class="['w-6 h-6', isFavorite ? 'fill-current' : '']" />
              </button>

              <!-- Copy -->
              <button @click="handleCopyToClipboard" :title="showCopyFeedback ? 'Copied!' : 'Copy CC data'"
                class="p-2 rounded-lg border flex items-center justify-center bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white transition-colors">
                <Copy class="w-6 h-6" />
              </button>

              <!-- Add to Live Set -->
              <button @click="addToLiveSet"
                :title="liveSetFeedback === 'full' ? 'Live Set full (16/16)' : liveSetFeedback ? `Added to slot ${liveSetFeedback.split(':')[1]}` : 'Add to Live Set'"
                :class="['p-2 rounded-lg border flex items-center justify-center transition-colors',
                  liveSetFeedback === 'full'
                    ? 'bg-red-950/30 text-red-400 border-red-900/30'
                    : liveSetFeedback
                      ? 'bg-purple-500/20 text-purple-400 border-purple-500/30'
                      : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-purple-400 hover:border-purple-500/30']">
                <Zap class="w-6 h-6" />
              </button>

              <!-- Delete -->
              <button @click="handleDeletePreset" title="Delete"
                class="p-2 rounded-lg border flex items-center justify-center bg-red-950/30 text-red-400 border-red-900/30 hover:bg-red-950/50 transition-colors">
                <Trash2 class="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>

        <!-- Col 2: Generate / ARP / Keyboard -->
        <div class="flex items-center gap-2 shrink-0 flex-wrap">
          <!-- A/B engine -->
          
          <div v-if="presetStore.lastPreset.abVariant" 
            class="flex bg-neutral-900 border border-neutral-800 rounded-xl p-0.5 h-9" title="Generative Engine (A=Standard, B=Alternative)">
            <button @click="selectEngineA"
              :class="['px-3 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all h-full', !presetStore.useAlternativeEngine ? 'bg-neutral-800 text-synth-neon' : 'text-neutral-500 hover:text-neutral-300']">
              A: STD
            </button>
            <button @click="selectEngineB"
              :class="['px-3 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all h-full', presetStore.useAlternativeEngine ? 'bg-neutral-800 text-orange-400' : 'text-orange-400/50 hover:text-orange-300']">
              B: ALT
            </button>
          </div>

          <!-- Regenerate -->
          <button @click="presetStore.generate(true)" :disabled="presetStore.isGenerating"
            class="flex items-center gap-1.5 bg-synth-neon text-black px-4 h-9 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-white transition-colors shadow-lg active:scale-95 shrink-0 disabled:opacity-50">
            <Zap class="w-6 h-6" /> REGEN
          </button>

          <!-- New -->
          <button @click="presetStore.generate(false)" :disabled="presetStore.isGenerating"
            class="flex items-center gap-1.5 bg-neutral-800 text-synth-neon px-4 h-9 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-neutral-700 transition-colors border border-synth-neon/20 active:scale-95 shrink-0 disabled:opacity-50">
            + NEW
          </button>

          <!-- ARP toggle -->
          <div class="flex items-center gap-0 rounded-xl bg-neutral-900 border border-neutral-700 overflow-hidden h-9">
            <button @click="arpStore.arpEnabled = !arpStore.arpEnabled"
              :class="['px-3 text-[9px] font-bold tracking-widest transition-all h-full', arpStore.arpEnabled ? 'bg-synth-neon text-black' : 'text-neutral-500 hover:text-synth-neon/80 hover:bg-neutral-800']">
              ARP {{ arpStore.arpEnabled ? 'ON' : 'OFF' }}
            </button>
            <div class="w-px h-4 bg-neutral-700" />
            <button @click="uiStore.isArpOpen = !uiStore.isArpOpen"
              :class="['px-2.5 h-full flex items-center', uiStore.isArpOpen ? 'text-synth-neon bg-neutral-800' : 'text-neutral-400 hover:text-synth-neon hover:bg-neutral-800']">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h8m-8 6h16"/></svg>
            </button>
          </div>

          <!-- Preview sound -->
          <button
            @click="isPlayingPreview ? stopPreview() : playPreview()"
            :class="['w-9 h-9 rounded-xl border flex items-center justify-center transition-colors shrink-0', isPlayingPreview ? 'bg-synth-neon/20 text-synth-neon border-synth-neon/50' : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white']"
            title="Preview Sound"
          >
            <Square v-if="isPlayingPreview" class="w-6 h-6 fill-current" />
            <Play v-else class="w-6 h-6 fill-current" />
          </button>

          <!-- Sequencer link -->
          <button
            @click="uiStore.isSequencerOpen = !uiStore.isSequencerOpen"
            :class="['h-9 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest border flex items-center gap-1.5 transition-colors shrink-0',
              (uiStore.isSequencerOpen || presetStore.currentSeqConfig)
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/50 shadow-[0_0_8px_rgba(245,158,11,0.15)]'
                : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-amber-400 hover:border-amber-500/30']"
            title="Step Sequencer"
          >
            <ListMusic class="w-6 h-6" /> SEQ
          </button>

          <!-- Keyboard shortcut -->
          <!-- <button @click="uiStore.isKeyboardOpen = !uiStore.isKeyboardOpen"
            :class="['h-9 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-colors shrink-0', uiStore.isKeyboardOpen ? 'bg-synth-neon/20 text-synth-neon border-synth-neon/50' : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white']">
            KBD
          </button> -->
        </div>
      </div>

      <!-- ── COLLAPSE TOGGLE ── -->
      <button
        @click="isPanelCollapsed = !isPanelCollapsed"
        class="w-full py-1 bg-neutral-900/60 hover:bg-synth-neon/5 text-neutral-600 hover:text-synth-neon transition-all border-b border-neutral-900 flex items-center justify-center gap-2 shrink-0"
      >
        <span class="text-[9px] font-black uppercase tracking-widest">{{ isPanelCollapsed ? 'Show Controls' : 'Hide Controls' }}</span>
        <ChevronDown v-if="isPanelCollapsed" class="w-3 h-3" />
        <ChevronUp v-else class="w-3 h-3" />
      </button>

      <!-- ── CONTROL PANEL BODY ── -->
      <div
        v-if="!isPanelCollapsed"
        class="flex-1 overflow-y-auto custom-scrollbar bg-grid-neon p-6 md:p-8 pb-20"
      >
        <!-- Category columns grid -->
        <div
          v-if="categoriesWithCtrls.length > 0"
          class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-12 gap-y-12 items-start"
        >
          <div
            v-for="cat in categoriesWithCtrls"
            :key="cat.id"
            class="w-full max-w-[220px] space-y-6"
          >
            <!-- Category header -->
            <div class="flex items-center gap-3">
              <div class="h-[2px] w-6 shrink-0" :style="{ backgroundColor: cat.color }" />
              <h3 class="text-[12px] font-black uppercase tracking-[0.3em] whitespace-nowrap" :style="{ color: cat.color }">
                {{ cat.name }}
              </h3>
              <div class="h-[1px] flex-1 bg-neutral-900" />
            </div>

            <!-- Controllers -->
            <div class="flex flex-col gap-4">
              <EfxMixerVisualizer v-if="cat.name =='EFX'"
                  :delay="activeData?.delayLvl || 0"
                  :reverb="activeData?.reverb || 0"
                  :chorus="activeData?.chorus || 0"
                  :width="200"
                  :height="100"
                  :color="cat.color"
                />
              <OscMixerVisualizer v-if="cat.name =='OSCILLATOR'"
                  :pulse="activeData?.oscSq || 0"
                  :saw="activeData?.oscSaw || 0"
                  :lfo="activeData?.oscLFO || 0"
                  :sub="activeData?.oscSub || 0"
                  :noise="activeData?.oscNoise || 0"
                  :width="200"
                  :height="100"
                  :color="cat.color"
                />
              <WaveformVisualizer v-if="cat.name =='LFO'"
                  :waveform="activeData?.lfoWave || 0"
                  :rate="activeData?.lfoRate || 64"
                  :width="200"
                  :height="100"
                  :color="cat.color"
                />
              <AdsrEnvelope v-if="cat.name =='ENV'"
                  :attack="activeData?.attack || 0"
                  :decay="activeData?.decay || 64"
                  :sustain="activeData?.sustain || 127"
                  :release="activeData?.release || 64"
                  :width="200"
                  :height="100"
                  :color="cat.color"
                />
                <!-- if cat.name == 'FILTER' -->
                <FilterEnvelope v-if="cat.name =='FILTER'"
                  :cutoff="activeData?.cutoff || 0"
                  :resonance="activeData?.res || 0"
                  :width="200"
                  :height="100"
                  :color="cat.color"
                />
              <template v-for="cfg in cat.controllers" :key="cfg.id || cfg.cc">

                <!-- SWITCH -->
                <div
                  v-if="cfg.type === 'SWITCH' || (cfg.max <= 1 && cfg.min === 0 && !cfg.type)"
                  tabindex="0"
                  @click="handleValueUpdate(cfg, getVal(cfg) >= 1 ? 0 : 1)"
                  @keydown="handleKeyNudge(cfg, $event)"
                  class="bg-black/60 border border-neutral-900 rounded-xl p-3 flex items-center justify-between cursor-pointer outline-none focus:ring-1 select-none"
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
                  class="bg-black/60 border border-neutral-900 rounded-xl p-3 space-y-2.5"
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
                  class="bg-black/60 border border-neutral-900 rounded-xl p-3 flex flex-col items-center gap-3"
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
                      <div v-for="n in 5" :key="n" class="w-full h-px bg-white/20" />
                    </div>
                    <div
                      class="absolute bottom-0 left-0 w-full border-t border-white/30"
                      :style="{ height: getPercent(cfg) + '%', backgroundColor: cat.color, boxShadow: `0 0 15px ${cat.color}66` }"
                    >
                      <div class="w-full h-1 bg-white/40 absolute top-0" />
                    </div>
                  </div>
                </div>

                <!-- HORIZONTAL SLIDER (default) -->
                <div
                  v-else
                  tabindex="0"
                  @mousedown="startHDrag(cfg, $event)"
                  @keydown="handleKeyNudge(cfg, $event)"
                  class="bg-black/60 border border-neutral-900 rounded-xl p-3 flex flex-col gap-2 outline-none focus:ring-1 cursor-ew-resize select-none"
                  :style="{ '--tw-ring-color': cat.color }"
                >
                  <div class="flex justify-between items-center">
                    <span class="text-[12px] font-mono font-bold text-white uppercase truncate pr-2">{{ cfg.label }}</span>
                    <span class="text-[12px] font-mono font-bold" :style="{ color: cat.color }">{{ Math.round(getVal(cfg)) }}</span>
                  </div>
                  <div class="h-3 bg-neutral-950 rounded-full overflow-hidden border border-neutral-900 pointer-events-none">
                    <div class="h-full" :style="{ width: getPercent(cfg) + '%', backgroundColor: cat.color, boxShadow: `0 0 8px ${cat.color}99` }" />
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
            <div class="h-[2px] w-8 bg-neutral-800" />
            <h3 class="text-[12px] font-black text-neutral-600 uppercase tracking-[0.3em]">UNCATEGORIZED</h3>
            <div class="h-[1px] flex-1 bg-neutral-900" />
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-4 items-start">
            <div
              v-for="cfg in uncategorizedCtrls" :key="cfg.id || cfg.cc"
              class="bg-black/40 border border-neutral-900 rounded-xl p-3 space-y-2 cursor-ew-resize select-none"
              @mousedown="startHDrag(cfg, $event)"
            >
              <div class="flex justify-between items-center">
                <span class="text-[12px] font-black text-white uppercase truncate pr-2">{{ cfg.label }}</span>
                <span class="text-[12px] font-mono font-bold text-neutral-400">{{ Math.round(getVal(cfg)) }}</span>
              </div>
              <div class="h-1 bg-neutral-950 rounded-full overflow-hidden">
                <div class="h-full bg-neutral-700" :style="{ width: getPercent(cfg) + '%' }" />
              </div>
            </div>
          </div>
        </div>

        <!-- Status bar -->
        <div class="mt-12 py-8 border-t border-neutral-900 flex items-center justify-center gap-4">
          <div class="w-1.5 h-1.5 rounded-full bg-synth-neon animate-pulse" />
          <p class="text-[10px] font-mono text-neutral-700 uppercase tracking-widest">
            X-BRIDGE_PROTOCOL_STABLE // {{ new Date().toLocaleTimeString() }}
          </p>
          <div class="w-1.5 h-1.5 rounded-full bg-synth-neon animate-pulse" />
        </div>
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
          <span>{{ liveSetFeedback === 'full' ? 'Live Set full — all 16 slots used' : `Added to Live Set slot ${liveSetFeedback.split(':')[1]}` }}</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.cursor-ew-resize, .cursor-ns-resize { -webkit-user-select: none; user-select: none; }
</style>
