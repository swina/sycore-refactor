<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { X, ChevronUp, ChevronDown, Plus, Trash2, Check } from 'lucide-vue-next'
import { useMidiStore } from '@/stores/useMidiStore'
import { useLocalStorage } from '@/composables/useLocalStorage'
import { S1_CC_MAP } from '@/constants/s1-config'

const props = defineProps({
  isOpen: Boolean,
  isAdmin: Boolean,
})
const emit = defineEmits(['close'])

const midiStore = useMidiStore()
const { state: soundsStorage } = useLocalStorage('S1_LIVESET_SOUNDS', [])
const { state: paramsStorage } = useLocalStorage('S1_LIVESET_PARAMS', Array(8).fill(null).map(() => ({ label: '', cc: -1 })))
const { state: sliderModeStorage } = useLocalStorage('S1_LIVESET_SLIDER_MODE', 'horizontal')

const sounds      = ref([])
const params      = ref([])
const sliderMode  = ref('horizontal')
const currentIdx  = ref(-1)
const paramValues = ref(Array(8).fill(64))
const tab         = ref('perf')
const setupTab    = ref('sounds')

const newSoundName = ref('')
const editingId    = ref(null)
const editingName  = ref('')

const S1_CC_OPTIONS = computed(() =>
  Object.entries(S1_CC_MAP)
    .map(([cc, field]) => ({ cc: Number(cc), label: field }))
    .sort((a, b) => a.cc - b.cc)
)

function loadSounds() {
  try {
    const arr = JSON.parse(JSON.stringify(soundsStorage.value || []))
    return arr.map((s, i) => s.id ? s : { ...s, id: `ls_migrated_${i}_${Date.now()}` })
  } catch { return [] }
}

function loadParams() {
  try {
    const p = paramsStorage.value
    if (Array.isArray(p) && p.length === 8) return p
  } catch {}
  return Array(8).fill(null).map(() => ({ label: '', cc: -1 }))
}

onMounted(() => {
  sounds.value = loadSounds()
  params.value = loadParams()
  sliderMode.value = sliderModeStorage.value
  if (props.isOpen) tab.value = 'perf'
})

watch(() => [sounds.value, params.value, sliderMode.value], () => {
  soundsStorage.value = sounds.value
  paramsStorage.value = params.value
  sliderModeStorage.value = sliderMode.value
}, { deep: true })

function sendParamCC(slotIdx, val) {
  if (slotIdx < 0 || slotIdx >= params.value.length) return
  const p = params.value[slotIdx]
  if (!p || p.cc < 0) return
  midiStore.sendCC(p.cc, val)
}

function selectSound(idx) {
  currentIdx.value = idx
  const sound = sounds.value[idx]
  if (sound?.paramValues) {
    paramValues.value = Array(8).fill(64)
    Object.entries(sound.paramValues).forEach(([slot, val]) => {
      paramValues.value[parseInt(slot)] = val
      sendParamCC(parseInt(slot), val)
    })
  }
}

function deleteSound(id) {
  const idx = sounds.value.findIndex(s => s.id === id)
  if (idx >= 0) {
    sounds.value.splice(idx, 1)
    if (currentIdx.value === idx) currentIdx.value = -1
  }
}

function addSound() {
  if (!newSoundName.value.trim()) return
  const sound = {
    id: `ls_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    name: newSoundName.value,
    paramValues: { ...paramValues.value }
  }
  sounds.value.push(sound)
  newSoundName.value = ''
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

function startEdit(sound) {
  editingId.value = sound.id
  editingName.value = sound.name
}

function confirmEdit() {
  const sound = sounds.value.find(s => s.id === editingId.value)
  if (sound) {
    sound.name = editingName.value
  }
  editingId.value = null
}
</script>

<template>
  <Transition name="panel" appear>
    <div v-if="isOpen"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div class="bg-neutral-950 border border-neutral-800 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">

        <!-- Header -->
        <div class="p-4 border-b border-neutral-900 flex justify-between items-center">
          <h2 class="text-lg font-black uppercase tracking-widest text-white">Live Set</h2>
          <button @click="emit('close')" class="p-1 text-neutral-400 hover:text-white transition-colors">
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- Tabs -->
        <div class="flex gap-1 p-2 border-b border-neutral-900 bg-neutral-900/50">
          <button @click="tab = 'perf'"
            :class="['px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-widest transition-all', tab === 'perf' ? 'bg-synth-neon text-black' : 'text-neutral-400 hover:text-white']"
          >Performance</button>
          <button @click="tab = 'setup'"
            :class="['px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-widest transition-all', tab === 'setup' ? 'bg-synth-neon text-black' : 'text-neutral-400 hover:text-white']"
          >Setup</button>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto custom-scrollbar p-4">

          <!-- Performance tab -->
          <div v-if="tab === 'perf'" class="space-y-6">
            <!-- Sounds list -->
            <div>
              <h3 class="text-xs font-black text-neutral-500 uppercase tracking-widest mb-3">Sounds</h3>
              <div class="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
                <button v-for="(sound, idx) in sounds" :key="sound.id"
                  @click="selectSound(idx)"
                  :class="['w-full text-left px-3 py-2 rounded-lg text-xs font-mono transition-all', currentIdx === idx ? 'bg-synth-neon text-black' : 'bg-neutral-900 text-neutral-300 hover:bg-neutral-800']"
                >{{ sound.name }}</button>
                <p v-if="sounds.length === 0" class="text-xs text-neutral-600 italic py-4 text-center">No sounds saved.</p>
              </div>
            </div>

            <!-- Param sliders -->
            <div v-if="currentIdx >= 0" class="space-y-3">
              <h3 class="text-xs font-black text-neutral-500 uppercase tracking-widest">Parameters</h3>
              <div v-for="(p, i) in params" :key="`${currentIdx}-${i}`" class="flex flex-col gap-1">
                <div class="flex justify-between items-center">
                  <span class="text-[10px] font-mono text-neutral-400">{{ p.label || `Slot ${i + 1}` }}</span>
                  <span class="text-[10px] font-mono text-synth-neon font-bold">{{ paramValues[i] }}</span>
                </div>
                <input v-model.number="paramValues[i]" type="range" min="0" max="127" @change="updateParamValue(i, paramValues[i])" class="w-full" />
              </div>
            </div>
          </div>

          <!-- Setup tab -->
          <div v-else class="space-y-6">
            <div class="flex gap-1 border-b border-neutral-900 pb-2">
              <button @click="setupTab = 'sounds'"
                :class="['px-3 py-2 text-xs font-bold uppercase tracking-widest', setupTab === 'sounds' ? 'text-synth-neon border-b-2 border-synth-neon' : 'text-neutral-500']"
              >Sounds</button>
              <button @click="setupTab = 'params'"
                :class="['px-3 py-2 text-xs font-bold uppercase tracking-widest', setupTab === 'params' ? 'text-synth-neon border-b-2 border-synth-neon' : 'text-neutral-500']"
              >Parameters</button>
            </div>

            <!-- Manage sounds -->
            <div v-if="setupTab === 'sounds'" class="space-y-4">
              <div class="flex gap-2">
                <input v-model="newSoundName" type="text" placeholder="Sound name..." class="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:border-synth-neon outline-none" />
                <button @click="addSound" class="px-4 py-2 bg-synth-neon text-black rounded-lg font-black text-xs flex items-center gap-1">
                  <Plus class="w-3 h-3" /> Add
                </button>
              </div>
              <div class="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                <div v-for="sound in sounds" :key="sound.id" class="flex items-center justify-between bg-neutral-900 rounded-lg p-3">
                  <div class="flex-1">
                    <div v-if="editingId === sound.id" class="flex gap-2">
                      <input v-model="editingName" type="text" class="flex-1 bg-black border border-neutral-700 rounded px-2 py-1 text-xs text-white focus:border-synth-neon outline-none" />
                      <button @click="confirmEdit" class="p-1 text-synth-neon hover:text-white">
                        <Check class="w-4 h-4" />
                      </button>
                    </div>
                    <span v-else @dblclick="startEdit(sound)" class="text-xs text-neutral-300 font-mono cursor-pointer">{{ sound.name }}</span>
                  </div>
                  <button @click="deleteSound(sound.id)" class="p-1 text-neutral-500 hover:text-red-500">
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <!-- Manage parameters -->
            <div v-else class="space-y-3">
              <div v-for="(p, i) in params" :key="i" class="flex flex-col gap-2 bg-neutral-900 rounded-lg p-3">
                <label class="text-[10px] font-mono text-neutral-400 uppercase">Slot {{ i + 1 }} Label</label>
                <input v-model="params[i].label" type="text" placeholder="e.g., Filter Cutoff" class="bg-black border border-neutral-800 rounded px-2 py-1 text-xs text-white focus:border-synth-neon outline-none" />
                <label class="text-[10px] font-mono text-neutral-400 uppercase">CC Assignment</label>
                <select v-model.number="params[i].cc" class="bg-black border border-neutral-800 rounded px-2 py-1 text-xs text-neutral-300 focus:border-synth-neon outline-none">
                  <option :value="-1">— unassigned —</option>
                  <option v-for="opt in S1_CC_OPTIONS" :key="opt.cc" :value="opt.cc">
                    CC {{ opt.cc }}: {{ opt.label }}
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
