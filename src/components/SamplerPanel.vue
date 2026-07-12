<template>
  <div v-show="uiStore.isSamplerOpen" :style="panelStyle"
    class="fixed flex flex-col bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden shadow-2xl"
    @mousedown="bringToFront"
  >
    <!-- Title bar -->
    <div
      class="flex items-center justify-between px-3 py-2 bg-neutral-900 border-b border-neutral-800 cursor-move select-none shrink-0"
      @mousedown.self="onDragStart"
    >
      <div class="flex items-center gap-2">
        <Music2 class="w-3.5 h-3.5 text-violet-400 pointer-events-none" />
        <span class="text-[11px] font-black uppercase tracking-[0.2em] text-white pointer-events-none">Sampler</span>
        <span class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest pointer-events-none">{{ activePattern?.name }}</span>
      </div>
      <div class="flex items-center gap-1">
        <MacOsButtons @close="uiStore.isSamplerOpen = false" @minimize="toggleMinimize" @maximize="maximize" />
      </div>
    </div>

    <!-- Minimized bar -->
    <div v-if="isMinimized" class="px-3 py-1.5 text-[10px] text-neutral-500 font-mono">
      Sampler — {{ activeBank }} · {{ loadedCount }} pads loaded
    </div>

    <template v-if="!isMinimized">

      <!-- Bank selector A–H -->
      <div class="flex items-center gap-1 px-3 pt-2 pb-1 shrink-0">
        <div v-for="b in BANKS" :key="b" class="relative">
          <button
            @click="samplerStore.activeBank = b"
            @contextmenu.prevent="openMenu($event, { name: 'sampler_bank_' + b, label: 'Sampler: Bank ' + b })"
            :class="[
              'w-7 h-7 rounded text-[10px] font-black uppercase tracking-widest transition-colors border',
              activeBank === b
                ? 'bg-violet-600 border-violet-500 text-white'
                : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:border-violet-500/50 hover:text-white',
              mappingStore.mappedParams?.has('sampler_bank_' + b) ? 'ring-1 ring-amber-500/60' : ''
            ]"
          >{{ b }}</button>
          <span v-if="mappingStore.learningParamName === 'sampler_bank_' + b" class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)] animate-pulse pointer-events-none z-50" />
        </div>
      </div>

      <!-- Pad grid: 7 pads -->
      <div class="grid grid-cols-7 gap-2 px-3 py-2 shrink-0">
        <div
          v-for="(pad, i) in activeBankData?.pads ?? []"
          :key="pad.id"
          class="relative flex flex-col items-center justify-center rounded-lg border-2 cursor-pointer select-none transition-all group"
          :class="[
            padActive[i]
              ? 'border-violet-400 bg-violet-800/40 shadow-[0_0_12px_rgba(167,139,250,0.3)]'
              : padArmed[i]
                ? 'border-violet-700/80 bg-emerald-950/30 hover:bg-violet-700/40'
                : pad.url
                  ? 'border-neutral-600 bg-neutral-900/50 hover:border-violet-500/40'
                  : 'border-neutral-700 bg-neutral-900/50 hover:border-neutral-600',
            selectedPad === i ? 'ring-1 ring-violet-400/60 border-violet-500 bg-violet-700/50' : '',
            i === 6 ? 'border-dashed' : '',
            mappingStore.mappedParams?.has('sampler_pad_' + i) ? 'ring-1 ring-amber-500/60' : '',
          ]"
          style="height: 72px"
          @click="handlePadClick(i)"
          @contextmenu.prevent="handlePadRightClick($event, i)"
        >
          <span class="text-[8px] font-mono text-neutral-600 absolute top-1 left-1.5">{{ i + 1 }}</span>
          <span v-if="i === 6" class="text-[7px] font-mono text-violet-400/50 absolute top-1 right-1.5 uppercase tracking-widest">G</span>
          <span v-if="mappingStore.learningParamName === 'sampler_pad_' + i" class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)] animate-pulse z-50 pointer-events-none" />

          <!-- Mute / Solo -->
          <div class="absolute bottom-1 left-0 right-0 flex justify-center gap-0.5">
            <button
              @click.stop="toggleMute(i)"
              :class="['text-[7px] font-black w-4 h-4 rounded leading-none transition-colors',
                padMuted[i] ? 'bg-yellow-400 text-black' : 'bg-neutral-800 text-neutral-500 hover:text-yellow-400']"
              title="Mute"
            >M</button>
            <button
              @click.stop="toggleSolo(i)"
              :class="['text-[7px] font-black w-4 h-4 rounded leading-none transition-colors',
                padSoloed[i] ? 'bg-cyan-400 text-black' : 'bg-neutral-800 text-neutral-500 hover:text-cyan-400']"
              title="Solo"
            >S</button>
          </div>

          <template v-if="pad.url">
            <span class="text-[9px] font-bold text-center text-white px-1 leading-tight w-full text-center line-clamp-2">
              {{ pad.label || 'Sample' }}
            </span>
            <span v-if="pad.duration" class="text-[8px] font-mono text-neutral-500 mt-0.5">
              {{ formatDur(pad.duration) }}
            </span>
          </template>
          <template v-else>
            <span class="text-[9px] text-neutral-700 group-hover:hidden">empty</span>
            <button
              class="hidden group-hover:flex flex-col items-center gap-0.5 cursor-pointer"
              @click.stop="openFolderBrowser(i)"
            >
              <span class="text-[9px] text-violet-400/80 font-mono">+ load</span>
            </button>
          </template>
        </div>
      </div>

      <!-- Pad detail panel -->
      <div v-if="selectedPad !== null && selectedPadData?.url" class="px-3 pb-2 shrink-0 border-t border-neutral-800/60 pt-2 flex flex-col gap-2">

        <!-- Header row: label · MIDI In · Chromatic · Poly · Loop · Clear -->
        <div class="flex items-center gap-2 flex-wra p-2 rounded bg-neutral-800">
          <div class="flex flex-col min-w-1/3">
            <span class="text-[10px] text-neutral-500 font-mono">Pad {{ selectedPad + 1 }}</span>
            <span class="text-[14px] font-mono text-orange-400 uppercase tracking-widest">{{ selectedPadData.label }}</span>
          </div>

          <!-- MIDI controller filter -->
          <div class="flex flex items-center gap-0.5">
            <span class="text-[9px] text-neutral-500 font-mono mr-2">MIDI In</span>
            <select
              :value="selectedPadData.midiInput ?? 'all'"
              @change="e => updatePadStore(selectedPad, 'midiInput', e.target.value)"
              class="bg-black border border-neutral-700 rounded px-1 py-0.5 text-[11px] font-mono text-white outline-none focus:border-violet-500 max-w-[130px] truncate"
            >
              <option value="all">All controllers</option>
              <option v-for="inp in midiInputs" :key="inp.id" :value="inp.id">{{ inp.name }}</option>
            </select>
          </div>

          <!-- Chromatic toggle -->
          <button
            @click="updatePadStore(selectedPad, 'chromatic', !(selectedPadData.chromatic ?? true))"
            :class="['px-2 py-0.5 rounded border text-[9px] font-black uppercase tracking-widest transition-colors',
              (selectedPadData.chromatic ?? true)
                ? 'bg-violet-600/30 border-violet-500/60 text-violet-300'
                : 'border-neutral-700 text-neutral-500 hover:border-violet-500/40 hover:text-white']"
            title="Chromatic: pitch follows MIDI note relative to root key"
          >Chromatic</button>

          <!-- Poly toggle -->
          <button
            @click="updatePadStore(selectedPad, 'polyMode', !(selectedPadData.polyMode ?? false))"
            :class="['px-2 py-0.5 rounded border text-[9px] font-black uppercase tracking-widest transition-colors',
              (selectedPadData.polyMode ?? false)
                ? 'bg-emerald-600/30 border-emerald-500/60 text-emerald-300'
                : 'border-neutral-700 text-neutral-500 hover:border-emerald-500/40 hover:text-white']"
            title="Poly: multiple simultaneous notes per pad"
          >Poly</button>

          <div class="flex-1" />

          <!-- Loop toggle -->
          <button
            @click="updatePadStore(selectedPad, 'loopMode', !selectedPadData.loopMode)"
            :class="['px-2 py-0.5 rounded border text-[9px] font-black uppercase tracking-widest transition-colors',
              selectedPadData.loopMode
                ? 'bg-violet-600/30 border-violet-500/60 text-violet-300'
                : 'border-neutral-700 text-neutral-500 hover:border-violet-500/40 hover:text-white']"
            title="Loop: repeat sample between start/end points"
          >Loop</button>

          <!-- Clear pad -->
          <button
            @click="clearPad(selectedPad)"
            class="p-1.5 rounded border border-red-500/20 text-red-500/60 hover:text-red-400 hover:border-red-400/40 transition-colors"
            title="Remove sound from pad"
          >
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- Waveform -->
        <div class="flex flex-col gap-1">
          <!-- Zoom controls -->
          <div class="flex items-center gap-2 px-1">
            <div class="flex items-center gap-0.5">
              <button @click="zoomOut()" class="w-5 h-5 flex items-center justify-center rounded border border-neutral-700 text-neutral-400 hover:text-white hover:border-violet-500/50 text-[10px] font-mono transition-colors">−</button>
              <span class="text-[9px] font-mono text-neutral-500 w-8 text-center">{{ zoomLevel.toFixed(1) }}×</span>
              <button @click="zoomIn()" class="w-5 h-5 flex items-center justify-center rounded border border-neutral-700 text-neutral-400 hover:text-white hover:border-violet-500/50 text-[10px] font-mono transition-colors">+</button>
            </div>
            <!-- Scrollbar -->
            <div
              class="flex-1 h-1.5 bg-neutral-800 rounded-full relative cursor-pointer"
              @click="onScrollbarClick"
            >
              <div
                class="absolute top-0 h-full bg-violet-600/50 rounded-full pointer-events-none"
                :style="{ left: (scrollOffset / maxScroll * 100 || 0) + '%', width: (1 / zoomLevel / maxScroll * 100 || 100) + '%' }"
                v-if="zoomLevel > 1"
              />
            </div>
            <button @click="zoomReset()" class="text-[8px] font-mono text-neutral-600 hover:text-neutral-400 transition-colors">Fit</button>
          </div>
          <div class="relative w-full h-54 bg-black/70 rounded overflow-hidden" ref="waveformContainer">
            <canvas
              ref="waveformCanvas"
              class="absolute inset-0 w-full h-full cursor-crosshair"
              @pointerdown="onWaveformPointerDown"
              @pointermove="onWaveformPointerMove"
              @pointerup="onWaveformPointerUp"
              @pointerleave="onWaveformPointerUp"
              @wheel.prevent="onWaveformWheel"
            />
            <!-- Start/End value labels -->
            <div class="absolute top-0 left-0 right-0 flex justify-between px-1 pointer-events-none">
              <span class="text-[8px] font-mono text-violet-400 bg-black/60 px-1 rounded">{{ fmtTime(selectedPadData.startPoint ?? 0, selectedPadData.duration) }}</span>
              <span class="text-[8px] font-mono text-amber-400 bg-black/60 px-1 rounded">{{ fmtTime(selectedPadData.endPoint ?? 1, selectedPadData.duration) }}</span>
            </div>
          </div>
        </div>

        <!-- Control panels -->
        <div class="flex items-start gap-2 flex-nowrap">

          <!-- LEVEL -->
          <div class="flex flex-col w-1/6 items-center gap-2 p-2 bg-neutral-900 rounded">
            <span class="text-[11px] text-violet-500 font-mono uppercase tracking-widest">Level</span>
            <div class="grid grid-cols-2 gap-x-6 gap-y-2">
              <KnobDial :modelValue="selectedPadData.volume"     :min="0"   :max="1"     :step="0.01"  :defaultVal="0.85"  label="Vol"    :format="fmtPct"  @change="v => updatePadParam(selectedPad, 'volume', v)"/>
              <KnobDial :modelValue="selectedPadData.pan"        :min="-1"  :max="1"     :step="0.01"  :defaultVal="0"     label="Pan"    :format="fmtPan"  @change="v => updatePadParam(selectedPad, 'pan', v)" />
              
            </div>
            
          </div>
          <!-- FILTER -->
          <div class="flex flex-col w-1/6 items-center gap-2 p-2 bg-neutral-900 rounded">
            <span class="text-[11px] text-violet-500 font-mono uppercase tracking-widest">Filter</span>
            <div class="grid grid-cols-2 gap-x-6 gap-y-2">
              <KnobDial :modelValue="selectedPadData.pitch"      :min="-24" :max="24"    :step="1"     :defaultVal="0"     label="Pitch"  :format="fmtSemi" @change="v => updatePadParam(selectedPad, 'pitch', v)" />
              <KnobDial :modelValue="selectedPadData.filterFreq" :min="80"  :max="20000" :step="10"    :defaultVal="20000" label="Filter" :format="fmtHz"   @change="v => updatePadParam(selectedPad, 'filterFreq', v)" />
            </div>
            <select :value="selectedPadData.sampleRate ?? 44100" @change="e => updatePadStore(selectedPad, 'sampleRate', +e.target.value)"
              class="bg-black border border-neutral-700 rounded px-1 py-0.5 text-[11px] font-mono text-white outline-none focus:border-violet-500 w-full">
              <option :value="44100">44.1k — Hi-Fi</option>
              <option :value="22050">22k — Cassette</option>
              <option :value="14700">14.7k — Lo-Fi</option>
              <option :value="11025">11k — Crunch</option>
              <option :value="8000">8k — Phone</option>
            </select>
          </div>
          <!-- FX -->
          <div class="flex flex-col w-1/6 items-center gap-2 p-2 bg-neutral-900 rounded">
            <span class="text-[11px] text-violet-500 font-mono uppercase tracking-widest">FX</span>
            <div class="grid grid-cols-2 gap-x-6 gap-y-2">
              <KnobDial :modelValue="selectedPadData.reverbSend" :min="0" :max="1" :step="0.01" :defaultVal="0" label="Rev" :format="fmtPct" @change="v => updatePadParam(selectedPad, 'reverbSend', v)" />
              <KnobDial :modelValue="selectedPadData.delaySend"  :min="0" :max="1" :step="0.01" :defaultVal="0" label="Delay" :format="fmtPct" @change="v => updatePadParam(selectedPad, 'delaySend', v)" />
            </div>
          </div>

          <!-- LOOP -->
          <div class="flex flex-col w-1/6 items-center gap-2 p-2 bg-neutral-900 rounded">
            <span class="text-[11px] text-violet-500 font-mono uppercase tracking-widest">Loop</span>
            <div class="grid grid-cols-2 gap-x-6 gap-y-2">
              <KnobDial :modelValue="selectedPadData.startPoint" :min="0" :max="1" :step="0.001" :defaultVal="0" label="Start" :format="fmtLoopTime" @change="v => updatePadStore(selectedPad, 'startPoint', v)" />
              <KnobDial :modelValue="selectedPadData.endPoint"   :min="0" :max="1" :step="0.001" :defaultVal="1" label="End"   :format="fmtLoopTime" @change="v => updatePadStore(selectedPad, 'endPoint', v)" />
            </div>
            <button @click="updatePadStore(selectedPad, 'loopMode', !selectedPadData.loopMode)"
              :class="['w-full px-2 py-0.5 rounded border text-[11px] font-mono transition-colors',
                selectedPadData.loopMode ? 'bg-violet-600 border-violet-500 text-white' : 'bg-neutral-800 border-neutral-600 text-neutral-500 hover:text-white']"
            >Loop</button>
          </div>

          <!-- ENV (ADSR) -->
          <div class="flex flex-col w-1/6 items-center gap-2 p-2 bg-neutral-900 rounded">
            <span class="text-[11px] text-violet-500 font-mono uppercase tracking-widest">ENV</span>
            <div class="grid grid-cols-2 gap-x-6 gap-y-2">
              <KnobDial :modelValue="selectedPadData.attack  ?? 0.005" :min="0" :max="2"  :step="0.005" :defaultVal="0.005" label="Attack" :format="fmtMs"  @change="v => updatePadParam(selectedPad, 'attack', v)" />
              <KnobDial :modelValue="selectedPadData.decay   ?? 0"     :min="0" :max="3"  :step="0.01"  :defaultVal="0"     label="Decay" :format="fmtMs"  @change="v => updatePadParam(selectedPad, 'decay', v)" />
              <KnobDial :modelValue="selectedPadData.sustain ?? 1"     :min="0" :max="1"  :step="0.01"  :defaultVal="1"     label="Sustain" :format="fmtPct" @change="v => updatePadStore(selectedPad, 'sustain', v)" />
              <KnobDial :modelValue="selectedPadData.release ?? 0.05"  :min="0" :max="3"  :step="0.01"  :defaultVal="0.05"  label="Release" :format="fmtMs"  @change="v => updatePadParam(selectedPad, 'release', v)" />
            </div>
          </div>

          <!-- MAP -->
          <div class="flex flex-col w-1/6 items-center gap-1.5 p-2 bg-neutral-900 rounded">
            <span class="text-[11px] text-violet-500 font-mono uppercase tracking-widest">MAP</span>
            <div class="flex flex-col gap-1">
              <div class="flex items-center gap-1">
                <span class="text-[11px] font-mono text-neutral-500 w-8">Root</span>
                <span class="text-[11px] font-mono text-violet-300 w-7">{{ midiNoteName(selectedPadData.rootKey ?? 72) }}</span>
                <input type="number" min="0" max="127" :value="selectedPadData.rootKey ?? 72"
                  @change="e => updatePadStore(selectedPad, 'rootKey', Math.max(0, Math.min(127, +e.target.value || 72)))"
                  class="w-10 bg-black border border-neutral-700 rounded px-1 py-0.5 text-[11px] font-mono text-white outline-none focus:border-violet-500 text-center" />
              </div>
              <div class="flex items-center gap-1">
                <span class="text-[11px] font-mono text-neutral-500 w-8">Lo</span>
                <span class="text-[11px] font-mono text-neutral-400 w-7">{{ midiNoteName(selectedPadData.minKey ?? 0) }}</span>
                <input type="number" min="0" max="127" :value="selectedPadData.minKey ?? 0"
                  @change="e => updatePadStore(selectedPad, 'minKey', Math.max(0, Math.min(127, +e.target.value)))"
                  class="w-10 bg-black border border-neutral-700 rounded px-1 py-0.5 text-[11px] font-mono text-white outline-none focus:border-violet-500 text-center" />
              </div>
              <div class="flex items-center gap-1">
                <span class="text-[11px] font-mono text-neutral-500 w-8">Hi</span>
                <span class="text-[11px] font-mono text-neutral-400 w-7">{{ midiNoteName(selectedPadData.maxKey ?? 127) }}</span>
                <input type="number" min="0" max="127" :value="selectedPadData.maxKey ?? 127"
                  @change="e => updatePadStore(selectedPad, 'maxKey', Math.max(0, Math.min(127, +e.target.value)))"
                  class="w-10 bg-black border border-neutral-700 rounded px-1 py-0.5 text-[11px] font-mono text-white outline-none focus:border-violet-500 text-center" />
              </div>
            </div>
          </div>

          <!-- GRAIN (pad 7 only) -->
          <div v-if="selectedPadData?.granular" class="flex flex-col w-1/6 items-center gap-2 p-2 bg-neutral-900 rounded">
            <span class="text-[11px] text-violet-400/70 font-mono uppercase tracking-widest">Grain</span>
            <div class="grid grid-cols-2 gap-x-6 gap-y-2">
              <KnobDial :modelValue="selectedPadData.grainSize"     :min="0.02" :max="0.5"  :step="0.01"  :defaultVal="0.1"  label="Size"  :format="fmtMs"  color="#a78bfa" @change="v => updatePadStore(selectedPad, 'grainSize', v)" />
              <KnobDial :modelValue="selectedPadData.grainOverlap"  :min="0"    :max="0.95" :step="0.01"  :defaultVal="0.5"  label="Ovlp"  :format="fmtPct" color="#a78bfa" @change="v => updatePadStore(selectedPad, 'grainOverlap', v)" />
              <KnobDial :modelValue="selectedPadData.grainPosition" :min="0"    :max="1"    :step="0.001" :defaultVal="0.5"  label="Pos"   :format="fmtPct" color="#a78bfa" @change="v => updatePadStore(selectedPad, 'grainPosition', v)" />
              <KnobDial :modelValue="selectedPadData.grainPitch"    :min="-24"  :max="24"   :step="1"     :defaultVal="0"    label="Pitch" :format="fmtSemi" color="#a78bfa" @change="v => updatePadStore(selectedPad, 'grainPitch', v)" />
            </div>
          </div>

        </div>
      </div>


      <!-- Resize handle -->
      <div
        class="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-20 hover:opacity-60 transition-opacity"
        @mousedown.stop="e => onResizeStart(e, 'se')"
      >
        <svg viewBox="0 0 10 10" class="w-4 h-4">
          <path d="M8 2L2 8M5 2L2 5M8 5L5 8" stroke="currentColor" stroke-width="1.5" fill="none" class="text-neutral-400"/>
        </svg>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { Music2, X, Minus, Trash2 } from 'lucide-vue-next'
import { useUiStore }            from '@/stores/useUiStore'
import { useSamplerStore }       from '@/stores/useSamplerStore'
import { useMappingStore }       from '@/stores/useMappingStore'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import MacOsButtons from '@/components/ui/MacOsButtons.vue'
import { useFreesoundCache }     from '@/composables/useFreesoundCache'
import { useMidiContextMenu }    from '@/composables/useMidiContextMenu'
import * as engine               from '@/lib/sampler-engine'
import { getCachedBuffer }        from '@/lib/sampler-engine'
import { midiService }           from '@/core/midi/midi-service'
import KnobDial                  from '@/components/ui/KnobDial.vue'

const uiStore      = useUiStore()
const samplerStore = useSamplerStore()
const mappingStore = useMappingStore()
const { openMenu } = useMidiContextMenu()
const { cacheFileBlob, resolveUrl } = useFreesoundCache()

const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront, maximize } =
  useDraggableResizable({
    storageKey:    'S1_SAMPLER_DR',
    minimizeLabel: 'Sampler',
    openRef:       () => uiStore.isSamplerOpen,
    initialWidth:  720,
    initialHeight: 460,
    minWidth:      520,
    minHeight:     300,
    zIndex:        200,
  })

watch(() => uiStore.isSamplerOpen, v => { if (v) bringToFront() })

const { BANKS } = samplerStore

const activePattern  = computed(() => samplerStore.activePattern)
const activeBank     = computed(() => samplerStore.activeBank)
const activeBankData = computed(() => samplerStore.activeBankData)
const loadedCount    = computed(() => activeBankData.value?.pads.filter(p => p.url).length ?? 0)
const selectedPad    = ref(null)
const selectedPadData = computed(() =>
  selectedPad.value !== null ? activeBankData.value?.pads[selectedPad.value] : null
)
const samplerMasterVol = ref(1.0)

const padActive = ref(Array(7).fill(false))  // currently playing (audio)
const padArmed  = ref(Array(7).fill(false))  // armed = responds to MIDI IN
const padMuted  = ref(Array(7).fill(false))
const padSoloed = ref(Array(7).fill(false))
const _bankState = new Map()  // bank → { armed, muted, soloed }
const anySoloed = computed(() => padSoloed.value.some(Boolean))

function padShouldPlay(padIdx) {
  if (padMuted.value[padIdx]) return false
  if (anySoloed.value && !padSoloed.value[padIdx]) return false
  return true
}

function toggleMute(padIdx) {
  padMuted.value = padMuted.value.map((v, i) => i === padIdx ? !v : v)
  if (padMuted.value[padIdx] && padActive.value[padIdx]) {
    const pad = activeBankData.value?.pads[padIdx]
    pad?.granular ? engine.stopGranular(padIdx) : engine.stopPad(padIdx)
    padActive.value = padActive.value.map((v, i) => i === padIdx ? false : v)
  }
}

function toggleSolo(padIdx) {
  padSoloed.value = padSoloed.value.map((v, i) => i === padIdx ? !v : v)
  // Stop pads that are now silenced by solo
  if (anySoloed.value) {
    for (let i = 0; i < 7; i++) {
      if (!padSoloed.value[i] && padActive.value[i]) {
        const p = activeBankData.value?.pads[i]
        p?.granular ? engine.stopGranular(i) : engine.stopPad(i)
        padActive.value = padActive.value.map((v, j) => j === i ? false : v)
      }
    }
  }
}

// KnobDial format helpers
const fmtPct  = v => `${(v * 100).toFixed(0)}%`
const fmtMs   = v => `${(v * 1000).toFixed(0)}ms`
const fmtSemi = v => v === 0 ? '0' : v > 0 ? `+${v}` : `${v}`
const fmtHz   = v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)
const fmtPan  = v => v === 0 ? 'C' : v < 0 ? `L${(-v * 100).toFixed(0)}` : `R${(v * 100).toFixed(0)}`
const fmtTime = (pct, duration) => duration ? `${(pct * duration * 1000).toFixed(0)}ms` : `${(pct * 100).toFixed(0)}%`
const fmtLoopTime = v => fmtTime(v, selectedPadData.value?.duration)

// Parse a MIDI root key from a sample filename (e.g. "Piano_C4.wav" → 72)
function parseRootKeyFromName(name) {
  const IDX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
  const m   = name.match(/\b([A-Ga-g])([#b]?)(-?\d)/)
  if (!m) return null
  let semi = IDX[m[1].toUpperCase()]
  if (semi === undefined) return null
  if (m[2] === '#') semi++
  else if (m[2] === 'b') semi--
  semi = ((semi % 12) + 12) % 12
  const midi = (parseInt(m[3], 10) + 2) * 12 + semi
  return midi >= 0 && midi <= 127 ? midi : null
}

function formatDur(s) {
  const m = Math.floor(s / 60)
  const sec = (s % 60).toFixed(1)
  return m > 0 ? `${m}:${sec.padStart(4, '0')}` : `${sec}s`
}

function handlePadClick(padIdx) {
  selectedPad.value = padIdx
  padArmed.value = padArmed.value.map((v, i) => i === padIdx ? true : v)
}

function handlePadRightClick(event, padIdx) {
  selectedPad.value = padIdx
  const pad = activeBankData.value?.pads[padIdx]
  openMenu(event, { name: `sampler_pad_${padIdx}`, label: pad?.label ? `Sampler: ${pad.label}` : `Sampler Pad ${padIdx + 1}` })
}

function clearPad(padIdx) {
  engine.stopPad(padIdx)
  padActive.value = padActive.value.map((v, i) => i === padIdx ? false : v)
  padArmed.value  = padArmed.value.map((v, i)  => i === padIdx ? false : v)
  _midiNotePlaying.delete(padIdx)
  samplerStore.clearPad(activeBank.value, padIdx)
}

function updatePadParam(padIdx, param, value) {
  samplerStore.setPad(activeBank.value, padIdx, { [param]: value })
  engine.setPadParam(padIdx, param, value)
}

function updatePadStore(padIdx, param, value) {
  samplerStore.setPad(activeBank.value, padIdx, { [param]: value })
  // Live-update granular cloud when tweaking grain params on an active pad
  if (selectedPadData.value?.granular && engine.isPlaying(padIdx)) {
    const pad = activeBankData.value?.pads[padIdx]
    const blobUrl = _blobUrlCache[padIdx]
    if (pad && blobUrl) engine.triggerGranular(padIdx, pad, blobUrl)
  }
  // Pre-warm lofi buffer when sample rate changes so sequencer sync triggers are ready
  if (param === 'sampleRate' && value < 44100) {
    const blobUrl = _blobUrlCache[padIdx]
    if (blobUrl) engine.preloadBufferLofi(blobUrl, value)
  }
}

// Live MIDI input list for per-pad controller filter
const midiInputs = ref([])

// ── Waveform ────────────────────────────────────────────────────────────────
const waveformCanvas = ref(null)
const waveformContainer = ref(null)
let _wfBuffer = null  // current AudioBuffer reference
const zoomLevel = ref(1)
const scrollOffset = ref(0)
const _zoomState = {}  // 'bank:padIdx' → { zoom, scroll }

const maxScroll = computed(() => Math.max(0, 1 - 1 / zoomLevel.value))

function saveZoomState() {
  if (selectedPad.value === null) return
  const key = `${activeBank.value}:${selectedPad.value}`
  _zoomState[key] = { zoom: zoomLevel.value, scroll: scrollOffset.value }
}

function loadZoomState() {
  if (selectedPad.value === null) {
    zoomLevel.value = 1
    scrollOffset.value = 0
    return
  }
  const key = `${activeBank.value}:${selectedPad.value}`
  const saved = _zoomState[key]
  if (saved) {
    zoomLevel.value = saved.zoom
    scrollOffset.value = saved.scroll
  } else {
    zoomLevel.value = 1
    scrollOffset.value = 0
  }
}

// Visible window in absolute [0,1] space
function viewStart() { return scrollOffset.value }
function viewEnd() { return scrollOffset.value + 1 / zoomLevel.value }
function viewRange() { return 1 / zoomLevel.value }

// Convert absolute percentage to visible canvas x (0-1)
function absToViewX(absPct) {
  const vs = viewStart()
  const vr = viewRange()
  return vr > 0 ? (absPct - vs) / vr : 0.5
}

// Convert visible canvas x (0-1) to absolute percentage
function viewXToAbs(vx) {
  const vs = viewStart()
  const vr = viewRange()
  return vs + vx * vr
}

function zoomIn() {
  const center = viewStart() + viewRange() / 2
  zoomLevel.value = Math.min(20, zoomLevel.value * 1.4)
  const newRange = 1 / zoomLevel.value
  scrollOffset.value = Math.max(0, Math.min(maxScroll.value, center - newRange / 2))
  saveZoomState()
  redrawWaveform()
}

function zoomOut() {
  const center = viewStart() + viewRange() / 2
  zoomLevel.value = Math.max(1, zoomLevel.value / 1.4)
  const newRange = 1 / zoomLevel.value
  scrollOffset.value = Math.max(0, Math.min(maxScroll.value, center - newRange / 2))
  saveZoomState()
  redrawWaveform()
}

function zoomReset() {
  zoomLevel.value = 1
  scrollOffset.value = 0
  saveZoomState()
  redrawWaveform()
}

function onScrollbarClick(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  const maxS = 1 - 1 / zoomLevel.value
  scrollOffset.value = Math.max(0, Math.min(maxS, ((e.clientX - rect.left) / rect.width) * (maxS + 1 / zoomLevel.value)))
  drawWaveform()
  saveZoomState()
}

async function loadWaveform() {
  const padIdx = selectedPad.value
  if (padIdx === null) { _wfBuffer = null; redrawWaveform(); return }

  const pad = activeBankData.value?.pads[padIdx]
  if (!pad?.url) { _wfBuffer = null; redrawWaveform(); return }

  // Try blob URL cache first, then resolve from IDB
  let blobUrl = _blobUrlCache[padIdx]
  if (!blobUrl) {
    blobUrl = await resolveUrl(pad.url, '')
    if (blobUrl) _blobUrlCache[padIdx] = blobUrl
  }
  if (!blobUrl) { _wfBuffer = null; redrawWaveform(); return }

  // Check buffer cache, preload if missing
  let buf = getCachedBuffer(blobUrl)
  if (!buf) {
    try {
      await engine.preloadBuffer(blobUrl)
      buf = getCachedBuffer(blobUrl)
    } catch {
      _wfBuffer = null; redrawWaveform(); return
    }
  }
  _wfBuffer = buf
  redrawWaveform()
}

function redrawWaveform() {
  // Defer to next frame so canvas dimensions are settled
  nextTick(drawWaveform)
}

function drawWaveform() {
  const canvas = waveformCanvas.value
  if (!canvas) return

  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  canvas.width = rect.width * dpr
  canvas.height = rect.height * dpr
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  const w = rect.width
  const h = rect.height
  const mid = h / 2

  ctx.clearRect(0, 0, w, h)

  // Compute peaks from raw buffer for the visible range
  const buf = _wfBuffer
  if (!buf) {
    ctx.strokeStyle = '#404060'
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(0, mid)
    ctx.lineTo(w, mid)
    ctx.stroke()
    return
  }

  const data = buf.getChannelData(0)
  const totalLen = data.length
  const vs = viewStart()
  const ve = viewEnd()

  // Map canvas pixels to sample range at pixel-level resolution
  const sampleStart = Math.floor(vs * totalLen)
  const sampleEnd = Math.ceil(ve * totalLen)
  const sampleRange = sampleEnd - sampleStart
  const bins = Math.min(w, sampleRange)
  const blockSize = Math.max(1, Math.floor(sampleRange / bins))

  const peaks = new Float32Array(bins)
  for (let i = 0; i < bins; i++) {
    let max = 0
    const s = sampleStart + i * blockSize
    const e = Math.min(s + blockSize, sampleEnd)
    for (let j = s; j < e; j++) {
      const abs = Math.abs(data[j])
      if (abs > max) max = abs
    }
    peaks[i] = max
  }

  // Draw waveform filled shape
  ctx.fillStyle = '#a78bfa40'
  ctx.beginPath()
  ctx.moveTo(0, mid)
  const step = w / bins
  for (let i = 0; i < bins; i++) {
    const x = i * step
    const amp = peaks[i] * (h * 0.4)
    ctx.lineTo(x, mid - amp)
  }
  ctx.lineTo(w, mid)
  for (let i = bins - 1; i >= 0; i--) {
    const x = i * step
    const amp = peaks[i] * (h * 0.4)
    ctx.lineTo(x, mid + amp)
  }
  ctx.closePath()
  ctx.fill()

  // Center line
  ctx.strokeStyle = '#404060'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(0, mid)
  ctx.lineTo(w, mid)
  ctx.stroke()

  // Draw loop region and markers
  const pad = selectedPadData.value
  if (!pad) return
  const sx = absToViewX(pad.startPoint ?? 0) * w
  const ex = absToViewX(pad.endPoint ?? 1) * w

  if (ex >= 0 && sx <= w) {
    const drawSx = Math.max(0, sx)
    const drawEx = Math.min(w, ex)
    ctx.fillStyle = 'rgba(168, 85, 247, 0.15)'
    ctx.fillRect(drawSx, 0, drawEx - drawSx, h)

    // Subtle top/bottom borders for the loop region
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.25)'
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(drawSx, 0)
    ctx.lineTo(drawEx, 0)
    ctx.moveTo(drawSx, h - 0.5)
    ctx.lineTo(drawEx, h - 0.5)
    ctx.stroke()

    if (sx >= 0) {
      ctx.strokeStyle = '#a78bfa'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(sx, 0)
      ctx.lineTo(sx, h)
      ctx.stroke()
      ctx.fillStyle = '#a78bfa'
      ctx.beginPath()
      ctx.arc(sx, 4, 4, 0, Math.PI * 2)
      ctx.fill()
    }

    if (ex <= w) {
      ctx.strokeStyle = '#fbbf24'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(ex, 0)
      ctx.lineTo(ex, h)
      ctx.stroke()
      ctx.fillStyle = '#fbbf24'
      ctx.beginPath()
      ctx.arc(ex, 4, 4, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // ── Grain position / size overlay ────────────────────────────────────────
  if (pad.granular && pad.duration) {
    const gPos   = pad.grainPosition ?? 0.5
    const gSize  = pad.grainSize ?? 0.1  // seconds
    const gSpan  = gSize / pad.duration  // fraction of sample
    const gx     = absToViewX(gPos) * w
    const gHalf  = (gSpan / viewRange()) * w * 0.35  // ~70% of grain width visible

    // Grain region fill (lighter teal)
    ctx.fillStyle = 'rgba(45, 212, 191, 0.12)'
    ctx.fillRect(gx - gHalf, 0, gHalf * 2, h)

    // Grain position line
    ctx.strokeStyle = 'rgba(45, 212, 191, 0.7)'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(gx, 0)
    ctx.lineTo(gx, h)
    ctx.stroke()
    ctx.setLineDash([])

    // Grain width brackets at top
    ctx.strokeStyle = 'rgba(45, 212, 191, 0.5)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(gx - gHalf, 4)
    ctx.lineTo(gx + gHalf, 4)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(gx - gHalf, 2)
    ctx.lineTo(gx - gHalf, 6)
    ctx.moveTo(gx + gHalf, 2)
    ctx.lineTo(gx + gHalf, 6)
    ctx.stroke()
  }
}

let _wfDragging = null  // 'start' | 'end'
let _wfScrolling = false
let _wfScrollStartX = 0
let _wfScrollStartOff = 0

function onWaveformPointerDown(e) {
  const canvas = waveformCanvas.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const vx = (e.clientX - rect.left) / rect.width  // visible x [0,1]
  const x = viewXToAbs(vx)  // absolute percentage
  const pad = selectedPadData.value
  if (!pad) return
  const sx = pad.startPoint ?? 0
  const ex = pad.endPoint ?? 1

  // Check proximity to markers (in visible space)
  const vsx = absToViewX(sx)
  const vex = absToViewX(ex)
  const pctPerPx = 1 / rect.width
  const snap = 8 * pctPerPx

  if (Math.abs(vx - vsx) <= snap) {
    _wfDragging = 'start'
  } else if (Math.abs(vx - vex) <= snap) {
    _wfDragging = 'end'
  } else if (e.button === 0 && zoomLevel.value > 1) {
    // Left click on empty area = scroll/pan
    _wfScrolling = true
    _wfScrollStartX = e.clientX
    _wfScrollStartOff = scrollOffset.value
    canvas.style.cursor = 'grabbing'
    return
  } else {
    // Place nearest marker
    const distStart = Math.abs(x - sx)
    const distEnd = Math.abs(x - ex)
    _wfDragging = distStart <= distEnd ? 'start' : 'end'
  }
  updateWaveformMarker(x)
}

function onWaveformPointerMove(e) {
  if (_wfScrolling) {
    const canvas = waveformCanvas.value
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const dx = (e.clientX - _wfScrollStartX) / rect.width * viewRange()
    scrollOffset.value = Math.max(0, Math.min(maxScroll.value, _wfScrollStartOff - dx))
    drawWaveform()
    saveZoomState()
    return
  }
  if (!_wfDragging) return
  const canvas = waveformCanvas.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const vx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  const x = viewXToAbs(vx)
  updateWaveformMarker(x)
}

function onWaveformPointerUp() {
  if (_wfScrolling) {
    _wfScrolling = false
    if (waveformCanvas.value) waveformCanvas.value.style.cursor = 'crosshair'
    return
  }
  if (_wfDragging && selectedPad.value !== null) {
    const padIdx = selectedPad.value
    const pad = selectedPadData.value
    if (pad) {
      // Keep the marker exactly where the user placed it
      if (_wfDragging === 'start') {
        updatePadStore(padIdx, 'startPoint', pad.startPoint ?? 0)
      } else {
        updatePadStore(padIdx, 'endPoint', pad.endPoint ?? 1)
      }
    }
  }
  _wfDragging = null
}

function onWaveformWheel(e) {
  const canvas = waveformCanvas.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const mouseVx = (e.clientX - rect.left) / rect.width
  const mouseAbs = viewXToAbs(mouseVx)

  const dir = e.deltaY < 0 ? 1 : -1
  const factor = dir > 0 ? 1.2 : 1 / 1.2
  const newZoom = Math.max(1, Math.min(20, zoomLevel.value * factor))
  if (newZoom === zoomLevel.value) return

  const newRange = 1 / newZoom
  const newStart = mouseAbs - mouseVx * newRange
  zoomLevel.value = newZoom
  scrollOffset.value = Math.max(0, Math.min(maxScroll.value, newStart))
  drawWaveform()
  saveZoomState()
}

function updateWaveformMarker(x) {
  const padIdx = selectedPad.value
  if (padIdx === null) return
  const clamped = Math.max(0, Math.min(1, x))
  if (_wfDragging === 'start') {
    const end = selectedPadData.value?.endPoint ?? 1
    updatePadStore(padIdx, 'startPoint', Math.min(clamped, end - 0.001))
  } else if (_wfDragging === 'end') {
    const start = selectedPadData.value?.startPoint ?? 0
    updatePadStore(padIdx, 'endPoint', Math.max(clamped, start + 0.001))
  }
}

// Snap to nearest zero-crossing on release
function snapToZeroCrossing(padIdx, pct, searchRadius) {
  const blobUrl = _blobUrlCache[padIdx]
  if (!blobUrl) return pct
  const buf = getCachedBuffer(blobUrl)
  if (!buf) return pct
  const data = buf.getChannelData(0)
  const len = data.length
  const sampleIdx = Math.round(pct * (len - 1))
  const radius = Math.round(searchRadius * len)
  const start = Math.max(1, sampleIdx - radius)
  const end = Math.min(len - 1, sampleIdx + radius)
  let bestIdx = sampleIdx
  let bestDist = Infinity
  for (let i = start; i <= end; i++) {
    // Check if this sample crosses zero (sign change from previous)
    if (data[i] === 0 || (data[i - 1] > 0 && data[i] <= 0) || (data[i - 1] < 0 && data[i] >= 0)) {
      const dist = Math.abs(i - sampleIdx)
      if (dist < bestDist) {
        bestDist = dist
        bestIdx = i
      }
    }
  }
  return bestIdx / (len - 1)
}

// Recompute peaks and redraw when selected pad changes
watch(() => selectedPad.value, (newPad, oldPad) => {
  // Save zoom state under the OLD pad's key (selectedPad has already changed)
  if (oldPad !== null && oldPad !== newPad) {
    const oldKey = `${activeBank.value}:${oldPad}`
    _zoomState[oldKey] = { zoom: zoomLevel.value, scroll: scrollOffset.value }
  }
  // Load zoom state for the new pad
  loadZoomState()
  nextTick(loadWaveform)
})

// Redraw when start/end points change
watch(() => selectedPadData.value?.startPoint, () => nextTick(drawWaveform))
watch(() => selectedPadData.value?.endPoint, () => nextTick(drawWaveform))
watch(() => selectedPadData.value?.grainPosition, () => nextTick(drawWaveform))
watch(() => selectedPadData.value?.grainSize, () => nextTick(drawWaveform))

// Redraw on resize
let _resizeObs = null
onMounted(() => {
  if (waveformContainer.value) {
    _resizeObs = new ResizeObserver(() => nextTick(drawWaveform))
    _resizeObs.observe(waveformContainer.value)
  }
})
onUnmounted(() => {
  _resizeObs?.disconnect()
})

function refreshMidiInputs() {
  midiInputs.value = midiService.getInputs().map(i => ({ id: i.id, name: i.name }))
}
watch(() => uiStore.isSamplerOpen, v => { if (v) refreshMidiInputs() })
watch(selectedPad, () => refreshMidiInputs())

async function openFolderBrowser(padIdx) {
  refreshMidiInputs()
  uiStore.soundFolderAssignTarget = {
    label: `Sampler Pad ${padIdx + 1}`,
    onAssign: async (file) => {
      const fileObj   = await file.handle.getFile()
      const id        = `sampler_file_${Date.now()}_${padIdx}`
      const arrayBuf  = await fileObj.arrayBuffer()
      const blob      = new Blob([arrayBuf], { type: fileObj.type })
      let duration = 0
      try {
        const AC     = window.AudioContext || window.webkitAudioContext
        const tmpCtx = new AC()
        const decoded = await tmpCtx.decodeAudioData(arrayBuf.slice(0))
        duration = decoded.duration
        await tmpCtx.close()
      } catch {}
      const blobUrl   = await cacheFileBlob(id, file.name.replace(/\.[^.]+$/, ''), blob, { duration })
      const baseName  = file.name.replace(/\.[^.]+$/, '')
      const autoKey   = parseRootKeyFromName(file.name)
      engine.invalidateBuffer(blobUrl)
      _blobUrlCache[padIdx] = blobUrl
      const padUpdate = { id, label: baseName, url: id, duration }
      if (autoKey !== null) padUpdate.rootKey = autoKey
      samplerStore.setPad(activeBank.value, padIdx, padUpdate)
      selectedPad.value = padIdx
    },
  }
  uiStore.isSoundFolderBrowserOpen = true
}


// Blob URL cache for MIDI performance (lazy-loaded in _onMidiNote)
const _blobUrlCache = {}   // padIdx → blobUrl

// Save/restore per-bank pad state on bank switch
watch(() => samplerStore.activeBank, (newBank, oldBank) => {
  if (oldBank) _bankState.set(oldBank, {
    armed:  [...padArmed.value],
    muted:  [...padMuted.value],
    soloed: [...padSoloed.value],
  })
  padActive.value = Array(7).fill(false)
  _midiNotePlaying.clear()
  Object.keys(_blobUrlCache).forEach(k => delete _blobUrlCache[k])
  const saved = _bankState.get(newBank)
  padArmed.value  = saved ? [...saved.armed]  : Array(7).fill(false)
  padMuted.value  = saved ? [...saved.muted]  : Array(7).fill(false)
  padSoloed.value = saved ? [...saved.soloed] : Array(7).fill(false)
})

// Receive sounds from FreesoundBrowser (dispatches 'sampler-pad-assign' event)
function _onSamplerPadAssign(e) {
  const { padIdx, track, bank } = e.detail || {}
  if (padIdx == null || !track?.blobUrl) return
  const targetBank = bank ?? activeBank.value
  const stableId = String(track.id)
  samplerStore.setPad(targetBank, padIdx, {
    id: stableId,
    label: track.label,
    url: stableId,   // stable IDB key — never store blob URLs in persisted state
    author: track.author ?? '',
    duration: track.duration ?? 0,
    bpm: track.bpm ?? null,
  })
  // Pre-warm runtime cache so first MIDI hit is synchronous (no IDB round-trip)
  if (!bank || bank === activeBank.value) _blobUrlCache[padIdx] = track.blobUrl
}

// ── MIDI Note trigger ────────────────────────────────────────────────────────
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
function midiNoteName(n) {
  n = Math.max(0, Math.min(127, n))
  return `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 2}`
}

let _unsubMidiNote = null
let _unsubMidiRaw  = null
// Tracks which MIDI note triggered each pad so Note OFF can match
const _midiNotePlaying = new Map()

function _startMidiMappingListener() {
  _unsubMidiRaw = midiService.addRawListener((event) => {
    if (!event.data || event.data.length < 3) return
    const status  = event.data[0]
    const type    = status & 0xF0
    const channel = status & 0x0F
    const byte1   = event.data[1]
    const byte2   = event.data[2]

    const isCC   = type === 0xB0
    const isNote = type === 0x90 && byte2 > 0
    if (!isCC && !isNote) return
    if (isCC && byte2 === 0) return

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

    if (paramName.startsWith('sampler_bank_')) {
      const bank = paramName.slice('sampler_bank_'.length)
      if (samplerStore.BANKS.includes(bank)) samplerStore.activeBank = bank
    } else if (paramName.startsWith('sampler_pad_')) {
      const padIdx = parseInt(paramName.slice('sampler_pad_'.length))
      if (!isNaN(padIdx) && padIdx >= 0 && padIdx < 7)
        padArmed.value = padArmed.value.map((v, i) => i === padIdx ? !v : v)
    }
  })
}

async function _onMidiNote(type, note, velocity, _chan, inputId) {
  const bank = samplerStore.activeBankData
  if (!bank) return
  for (let padIdx = 0; padIdx < 7; padIdx++) {
    const pad = bank.pads[padIdx]
    if (!pad?.url || !padArmed.value[padIdx] || !padShouldPlay(padIdx)) continue
    // Per-pad MIDI input filter — pad.midiInput stores the device ID
    if (pad.midiInput && pad.midiInput !== 'all' && inputId !== pad.midiInput) continue
    const minKey  = pad.minKey  ?? 0
    const maxKey  = pad.maxKey  ?? 127
    if (note < minKey || note > maxKey) continue

    const chromatic = pad.chromatic ?? true
    // Non-chromatic: only exact rootKey triggers
    if (!chromatic && note !== (pad.rootKey ?? 72)) continue

    if (type === 'off' || (type === 'on' && velocity === 0)) {
      if (pad.polyMode) {
        engine.stopPadNote(padIdx, note, pad.release)
      } else if (_midiNotePlaying.get(padIdx) === note) {
        pad.granular ? engine.stopGranular(padIdx) : engine.stopPad(padIdx)
        padActive.value = padActive.value.map((v, i) => i === padIdx ? false : v)
        _midiNotePlaying.delete(padIdx)
      }
    } else if (type === 'on') {
      const rootKey    = pad.rootKey ?? 72
      const pitchShift = chromatic ? (note - rootKey) : 0
      const volScaled  = (pad.volume ?? 0.85) * (velocity / 127) * samplerMasterVol.value
      const effectivePad = { ...pad, volume: volScaled, pitch: (pad.pitch ?? 0) + pitchShift, _midiNote: note }

      let blobUrl = _blobUrlCache[padIdx]
      if (!blobUrl) {
        blobUrl = await resolveUrl(pad.url, '')
        if (!blobUrl) continue
        await engine.preloadBuffer(blobUrl)
        _blobUrlCache[padIdx] = blobUrl
      }

      _midiNotePlaying.set(padIdx, note)
      if (pad.granular) engine.triggerGranular(padIdx, effectivePad, blobUrl)
      else engine.triggerPadSync(padIdx, effectivePad, blobUrl)
      padActive.value = padActive.value.map((v, i) => i === padIdx ? true : v)
      const check = setInterval(() => {
        if (!engine.isPlaying(padIdx)) {
          padActive.value = padActive.value.map((v, i) => i === padIdx ? false : v)
          clearInterval(check)
        }
      }, 100)
    }
  }
}

function _onSamplerMasterVol(e) { samplerMasterVol.value = e.detail }

onMounted(() => {
  window.addEventListener('sampler-pad-assign', _onSamplerPadAssign)
  window.addEventListener('sampler-master-volume', _onSamplerMasterVol)
  _unsubMidiNote = midiService.addNoteListener(_onMidiNote)
  _startMidiMappingListener()
})

onUnmounted(() => {
  window.removeEventListener('sampler-pad-assign', _onSamplerPadAssign)
  window.removeEventListener('sampler-master-volume', _onSamplerMasterVol)
  _unsubMidiNote?.()
  _unsubMidiRaw?.()
  engine.stopAll()
})
</script>
