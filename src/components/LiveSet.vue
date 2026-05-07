<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { X, Trash2, GripVertical } from 'lucide-vue-next'
import { useMidiStore } from '@/stores/useMidiStore'
import { usePresetStore } from '@/stores/usePresetStore'
import { useLocalStorage } from '@/composables/useLocalStorage'
import { useConfigStore } from '@/stores/useConfigStore'
import { S1_CC_MAP } from '@/constants/s1-config'
import { useDraggable } from '@/composables/useDraggable'

const props = defineProps({
  isOpen: Boolean,
  isAdmin: Boolean,
})
const emit = defineEmits(['close'])

const midiStore = useMidiStore()
const presetStore = usePresetStore()
const configStore = useConfigStore()

const { x: panelX, y: panelY, startDrag } = useDraggable(
  Math.max(8, (window.innerWidth  - 672) / 2),
  Math.max(8, (window.innerHeight - 620) / 2),
  'S1_LS_POS'
)

const { state: soundsStorage } = useLocalStorage('S1_LIVESET_SOUNDS', [])
const { state: paramsStorage } = useLocalStorage('S1_LIVESET_PARAMS', Array(8).fill(null).map(() => ({ label: '', cc: -1 })))
const { state: sliderModeStorage } = useLocalStorage('S1_LIVESET_SLIDER_MODE', 'vertical')
const { state: currentIdxStorage } = useLocalStorage('S1_LIVESET_CURRENT', -1)

const sounds      = ref([])
const params      = ref([])
const sliderMode  = ref('vertical')
const currentIdx  = ref(Number.isInteger(currentIdxStorage.value) ? currentIdxStorage.value : -1)
const paramValues = ref(Array(8).fill(64))
const tab         = ref('perf')
const setupTab    = ref('sounds')

const S1_CC_OPTIONS = computed(() => {
  return (configStore.midiConfig || [])
    .filter(cfg => cfg.cc !== undefined && cfg.cc !== null)
    .map(cfg => ({ cc: Number(cfg.cc), label: cfg.label || cfg.name || `CC ${cfg.cc}` }))
    .sort((a, b) => a.label.localeCompare(b.label))
})

function loadSounds() {
  try {
    const raw = localStorage.getItem('S1_LIVESET_SOUNDS')
    const arr = raw ? JSON.parse(raw) : []
    return Array(16).fill(null).map((_, i) => {
      const existing = Array.isArray(arr) ? arr[i] : null
      return { id: `ls_slot_${i}`, name: existing?.name || '', category: existing?.category || '', ccData: existing?.ccData || {}, paramValues: existing?.paramValues || {} }
    })
  } catch {
    return Array(16).fill(null).map((_, i) => ({ id: `ls_slot_${i}`, name: '', category: '', ccData: {}, paramValues: {} }))
  }
}

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

onMounted(() => {
  sounds.value = loadSounds()
  params.value = loadParams()
  sliderMode.value = sliderModeStorage.value || 'vertical'
  if (props.isOpen) tab.value = 'perf'
  restoreSelection()
  window.addEventListener('liveset-select-pad', onSelectPad)
  window.addEventListener('liveset-navigate', onNavigate)
})

watch(() => [sounds.value, params.value, sliderMode.value], () => {
  soundsStorage.value = sounds.value
  paramsStorage.value = params.value
  sliderModeStorage.value = sliderMode.value
}, { deep: true })

watch(currentIdx, (v) => { currentIdxStorage.value = v })

watch(() => props.isOpen, (open) => {
  if (!open) return
  sounds.value = loadSounds()
  tab.value = 'perf'
  restoreSelection()
})

onUnmounted(() => {
  window.removeEventListener('liveset-select-pad', onSelectPad)
  window.removeEventListener('liveset-navigate', onNavigate)
})

function sendParamCC(slotIdx, val) {
  if (slotIdx < 0 || slotIdx >= params.value.length) return
  const p = params.value[slotIdx]
  if (!p || p.cc < 0) return
  midiStore.sendCC(p.cc, val)
}

function selectSound(idx) {
  currentIdx.value = idx
  const sound = sounds.value[idx]
  if (!sound?.name) return
  paramValues.value = Array(8).fill(64)

  const numericCcMap = {}
  if (sound.ccData && Object.keys(sound.ccData).length > 0) {
    Object.entries(sound.ccData).forEach(([cc, val]) => { numericCcMap[Number(cc)] = val })
    midiStore.sendAllCCs(numericCcMap)
  }

  if (sound.paramValues) {
    Object.entries(sound.paramValues).forEach(([slot, val]) => {
      paramValues.value[parseInt(slot)] = val
      sendParamCC(parseInt(slot), val)
    })
  }

  // Sync ResultsPanel: convert CC-keyed data back to field-name-keyed data
  const fieldData = {}
  Object.entries(numericCcMap).forEach(([cc, val]) => {
    const field = S1_CC_MAP[Number(cc)]
    if (field) fieldData[field] = val
  })
  presetStore.lastPreset = { id: sound.id, name: sound.name, category: sound.category, data: fieldData }
  presetStore.currentName = sound.name
  presetStore.showResults = true
}

function clearSound(idx) {
  sounds.value[idx].name = ''
  sounds.value[idx].ccData = {}
  sounds.value[idx].paramValues = {}
  sounds.value[idx].category = ''
  if (currentIdx.value === idx) {
    paramValues.value = Array(8).fill(64)
  }
}

function saveCurrentSound() {
  if (currentIdx.value < 0 || currentIdx.value >= sounds.value.length) return
  const sound = sounds.value[currentIdx.value]
  sound.paramValues = { ...paramValues.value }
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
    { base: 'border-amber-400 text-amber-400 hover:bg-amber-400/20', active: 'bg-amber-400 text-black shadow-[0_0_15px_rgba(251,191,36,0.5)]' },
    { base: 'border-cyan-400 text-cyan-400 hover:bg-cyan-400/20', active: 'bg-cyan-400 text-black shadow-[0_0_15px_rgba(34,211,238,0.5)]' }
  ]
  return isActive ? colors[row].active : colors[row].base
}
</script>

<template>
  <Transition name="panel">
    <div v-if="isOpen"
      :style="{ left: panelX + 'px', top: panelY + 'px' }"
      class="fixed z-[100] bg-neutral-950 border border-neutral-800 rounded-2xl w-[672px] max-w-[95vw] max-h-[90vh] flex flex-col shadow-2xl"
    >
        <!-- Header -->
        <div class="p-4 border-b border-neutral-900 flex items-center shrink-0">
          <!-- Drag handle -->
          <div class="flex items-center gap-2 flex-1 min-w-0 cursor-grab active:cursor-grabbing select-none"
               @mousedown="startDrag">
            <GripVertical class="w-4 h-4 text-neutral-600 shrink-0" />
            <h2 class="text-lg font-black uppercase tracking-widest text-white truncate">Live Pad</h2>
          </div>
          <button @click="emit('close')" class="p-1 ml-3 text-neutral-400 hover:text-white transition-colors shrink-0">
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- Tabs -->
        <div class="flex gap-1 p-2 border-b border-neutral-900 bg-neutral-900/50 shrink-0">
          <button @click="tab = 'perf'"
            :class="['px-4 py-1 rounded-lg text-sm font-bold uppercase tracking-widest transition-all', tab === 'perf' ? 'bg-synth-neon text-black' : 'text-neutral-400 hover:text-white']"
          >Performance</button>
          <button @click="tab = 'setup'"
            :class="['px-4 py-1 rounded-lg text-sm font-bold uppercase tracking-widest transition-all', tab === 'setup' ? 'bg-synth-neon text-black' : 'text-neutral-400 hover:text-white']"
          >Setup</button>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto custom-scrollbar p-6">

          <!-- Performance tab -->
          <div v-if="tab === 'perf'" class="flex flex-col h-full space-y-8">
            <!-- 4x4 Grid -->
            <div class="grid grid-cols-4 gap-3">
              <button v-for="(sound, idx) in sounds" :key="idx"
                @click="selectSound(idx)"
                :class="[
                  'h-20 rounded-xl border-2 flex flex-col items-center justify-center p-2 gap-0.5 transition-all overflow-hidden',
                  getPadColorClass(idx, currentIdx === idx)
                ]"
              >
                <span class="w-full text-center text-[10px] font-black uppercase tracking-tight leading-tight line-clamp-2 break-words">{{ sound.name || `PAD ${idx + 1}` }}</span>
                <span v-if="sound.name && sound.category" class="w-full text-center text-[8px] font-mono uppercase tracking-widest opacity-60 truncate">{{ sound.category }}</span>
              </button>
            </div>

            <!-- Vertical Sliders -->
            <!-- <div v-if="currentIdx >= 0" class="flex justify-between gap-4 h-48 bg-neutral-900/50 p-4 rounded-xl border border-neutral-900">
              <div v-for="(p, i) in params" :key="i" class="flex flex-col items-center flex-1 gap-2 min-w-0">
                <div class="text-[9px] font-mono text-neutral-400 text-center w-full truncate px-1" :title="p.label || `PARAM ${i+1}`">
                  {{ p.label || `PARAM ${i+1}` }}
                </div>
                <input v-model.number="paramValues[i]" type="range" min="0" max="127" 
                  @input="updateParamValue(i, paramValues[i])" 
                  class="flex-1 w-full max-w-[20px] cursor-ns-resize vertical-slider" 
                />
                <div class="text-[10px] font-mono text-synth-neon font-bold h-4">{{ paramValues[i] }}</div>
              </div>
            </div>
            <div v-else class="flex items-center justify-center h-48 border border-dashed border-neutral-800 rounded-xl">
              <span class="text-xs font-mono text-neutral-600 uppercase tracking-widest">Select a pad to view controls</span>
            </div> -->
          </div>

          <!-- Setup tab -->
          <div v-else class="space-y-6">
            <div class="flex gap-1 border-b border-neutral-900 pb-2">
              <button @click="setupTab = 'sounds'"
                :class="['px-3 py-2 text-xs font-bold uppercase tracking-widest transition-colors', setupTab === 'sounds' ? 'text-synth-neon border-b-2 border-synth-neon' : 'text-neutral-500 hover:text-neutral-400']"
              >Pads (Sounds)</button>
              <button @click="setupTab = 'params'"
                :class="['px-3 py-2 text-xs font-bold uppercase tracking-widest transition-colors', setupTab === 'params' ? 'text-synth-neon border-b-2 border-synth-neon' : 'text-neutral-500 hover:text-neutral-400']"
              >Sliders (Params)</button>
            </div>

            <!-- Manage sounds -->
            <div v-if="setupTab === 'sounds'" class="space-y-4">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div v-for="(sound, idx) in sounds" :key="sound.id" class="flex items-center gap-2 bg-neutral-900 rounded-lg p-2 border border-neutral-800">
                  <span class="text-xs font-mono font-bold text-neutral-500 w-6 text-right">{{ idx + 1 }}.</span>
                  <input v-model="sound.name" type="text" :placeholder="`Pad ${idx + 1} Name...`" class="flex-1 bg-black border border-neutral-700 rounded px-2 py-1.5 text-xs text-white focus:border-synth-neon outline-none transition-colors" />
                  <button @click="clearSound(idx)" class="p-1.5 text-neutral-500 hover:text-red-500 transition-colors" title="Clear Pad">
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <!-- Manage parameters -->
            <div v-else class="space-y-3">
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
            </div>
          </div>

        </div>

    </div>
  </Transition>
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
</style>
