<script setup>
import { ref, computed } from 'vue'
import { X, Radio, CheckCircle2, CircleDashed } from 'lucide-vue-next'
import { useMidiStore }    from '@/stores/useMidiStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { S1_CC_MAP }       from '@/constants/s1-config'

const emit = defineEmits(['close'])

const midiStore    = useMidiStore()
const mappingStore = useMappingStore()

const targetParam = ref('')

const availableParams = computed(() => Object.values(S1_CC_MAP).sort())

function startLearn() {
  targetParam.value = ''
  mappingStore.startLearn()
}

function cancelLearn() {
  targetParam.value = ''
  mappingStore.cancelLearn()
}

function confirmLearn() {
  if (mappingStore.learnedCC !== null && targetParam.value) {
    mappingStore.confirmLearn(targetParam.value)
    targetParam.value = ''
  }
}
</script>

<template>
  <div class="fixed inset-0 z-[160] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
    <div class="bg-neutral-900 border border-synth-neon/30 rounded-2xl p-6 max-w-md w-full max-h-[80vh] flex flex-col shadow-2xl">

      <!-- Header -->
      <div class="flex justify-between items-center mb-4 border-b border-neutral-800 pb-4 shrink-0">
        <h2 class="text-xl font-black text-white tracking-widest uppercase flex items-center gap-2">
          <Radio class="w-6 h-6 text-synth-neon" /> MIDI MAPPING
        </h2>
        <button @click="emit('close')" class="text-neutral-500 hover:text-rose-500 transition-colors p-2">
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Input device selector -->
      <div class="mb-5 shrink-0">
        <label class="block text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-1.5">
          MIDI Input Device
        </label>
        <select
          :value="midiStore.selectedInputDevice"
          @change="midiStore.setKeyboardInput($event.target.value)"
          class="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2 text-neutral-300 font-mono text-sm focus:border-synth-neon outline-none"
        >
          <option value="">— select device —</option>
          <option v-for="d in midiStore.inputs" :key="d.id" :value="d.name ?? d.id">
            {{ d.name ?? `Device ${d.id.slice(0, 8)}` }}
          </option>
        </select>
        <p v-if="midiStore.inputs.length === 0" class="text-[10px] font-mono text-neutral-600 mt-1">
          No MIDI input devices detected.
        </p>
      </div>

      <!-- Learn area -->
      <div class="flex-1 overflow-y-auto custom-scrollbar mb-6 pr-2">

        <!-- Learning in progress -->
        <div v-if="mappingStore.isMidiLearning"
          class="bg-synth-neon/10 border border-synth-neon/30 rounded-xl p-6 text-center flex flex-col items-center justify-center"
        >
          <CircleDashed class="w-10 h-10 text-synth-neon mb-3 animate-spin" />
          <p class="font-bold text-synth-neon tracking-widest uppercase text-sm mb-1">Learning Mode</p>
          <p class="text-neutral-400 text-[10px] uppercase">Tweak a controller on your device</p>
          <button @click="cancelLearn" class="mt-4 text-xs text-neutral-500 hover:text-white underline">Cancel</button>
        </div>

        <!-- CC detected — pick param -->
        <div v-else-if="mappingStore.learnedCC !== null"
          class="bg-neutral-800 border border-neutral-700 rounded-xl p-5 mb-4"
        >
          <div class="text-center mb-4">
            <p class="text-neutral-400 text-[10px] uppercase mb-1">Detected CC</p>
            <p class="text-2xl font-black text-synth-neon">CC# {{ mappingStore.learnedCC }}</p>
          </div>

          <div class="mb-4">
            <label class="block text-neutral-400 text-[10px] uppercase text-center mb-2">Select Target Parameter</label>
            <select
              v-model="targetParam"
              class="w-full bg-black border border-neutral-700 rounded-lg p-3 text-neutral-300 font-mono text-sm focus:border-synth-neon outline-none"
              size="5"
            >
              <option value="" disabled>Select a parameter...</option>
              <option v-for="p in availableParams" :key="p" :value="p">{{ p.toUpperCase() }}</option>
            </select>
          </div>

          <div class="flex gap-2">
            <button @click="cancelLearn"
              class="flex-1 py-3 text-neutral-400 uppercase tracking-widest font-black text-[10px] bg-neutral-900 rounded-lg hover:bg-neutral-800 border border-neutral-700"
            >Cancel</button>
            <button @click="confirmLearn" :disabled="!targetParam"
              class="flex-1 py-3 text-black uppercase tracking-widest font-black text-[10px] bg-synth-neon rounded-lg hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <CheckCircle2 class="w-4 h-4" /> Confirm Mapping
            </button>
          </div>
        </div>

        <!-- Idle — show learn button + current mappings -->
        <template v-else>
          <button @click="startLearn"
            class="w-full bg-synth-neon text-black rounded-lg py-4 font-black tracking-widest uppercase text-xs flex items-center justify-center gap-2 hover:bg-white transition-colors shadow-lg mb-6"
          >
            <Radio class="w-4 h-4" /> MIDI LEARN
          </button>

          <h3 class="text-[10px] font-black text-neutral-500 uppercase tracking-widest mb-3 border-b border-neutral-800 pb-2">
            Current Mappings
          </h3>
          <p v-if="Object.keys(mappingStore.midiMappings).length === 0"
            class="text-neutral-600 text-xs italic text-center py-4 rounded-lg bg-neutral-900 border border-neutral-800 border-dashed"
          >No parameters mapped yet.</p>
          <div v-else class="space-y-2">
            <div v-for="(param, cc) in mappingStore.midiMappings" :key="cc"
              class="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-lg p-3"
            >
              <div class="flex items-center gap-3">
                <span class="bg-black border border-neutral-800 text-synth-neon font-mono text-[10px] px-2 py-1 rounded">CC {{ cc }}</span>
                <span class="text-neutral-300 font-bold uppercase tracking-wide text-[10px]">{{ param }}</span>
              </div>
              <button @click="mappingStore.removeMapping(parseInt(cc))" class="text-neutral-500 hover:text-rose-500 p-1">
                <X class="w-4 h-4" />
              </button>
            </div>
          </div>
        </template>

      </div>
    </div>
  </div>
</template>
