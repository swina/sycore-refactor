<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { X, Radio, CheckCircle2, CircleDashed } from 'lucide-vue-next'
import { useMidiStore }    from '@/stores/useMidiStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { useConfigStore }  from '@/stores/useConfigStore'
import { midiService }     from '@/core/midi/MidiService'
import { S1_CC_MAP }       from '@/constants/s1-config'

const props = defineProps({ embedded: { type: Boolean, default: false } })
const emit  = defineEmits(['close'])

const midiStore    = useMidiStore()
const mappingStore = useMappingStore()
const configStore  = useConfigStore()

const targetParam = ref('')
const lastRawData = ref('')

// Combine S-1 hardware parameters with "registered" controllers from the database
const availableParams = computed(() => {
  const s1Params = Object.values(S1_CC_MAP).map(name => ({
    name,
    label: name.replace(/([A-Z])/g, ' $1').toUpperCase(), // Simple label generation for S1 constants
    category: 'S-1 HARDWARE'
  }))

  const registeredParams = configStore.midiConfig.map(c => ({
    name: c.name,
    label: c.label || c.name,
    category: c.category || 'REGISTERED'
  }))

  // Merge and remove duplicates by name
  const combined = [...s1Params, ...registeredParams]
  const unique = []
  const names = new Set()
  
  combined.forEach(p => {
    if (!names.has(p.name)) {
      names.add(p.name)
      unique.push(p)
    }
  })

  return unique.sort((a, b) => a.label.localeCompare(b.label))
})

// Use centralized raw listener for learning
let _unsubLearn = null

function setupLearn() {
  if (_unsubLearn) {
    _unsubLearn()
    _unsubLearn = null
  }
  if (!mappingStore.isMidiLearning) return

  console.log('[MidiMapping] Starting raw learn listener...')
  _unsubLearn = midiService.addRawListener((event) => {
    if (!event.data || event.data.length === 0) return
    const status = event.data[0]
    
    // Get device name from target
    const inputId = event.target?.id
    const inputPort = midiService.getInputs().find(i => i.id === inputId)
    const deviceName = inputPort?.name || 'Unknown Device'

    lastRawData.value = `Dev: ${deviceName} | Status: 0x${status.toString(16).toUpperCase()} | Data: ${event.data[1]}`
    
    // Filter for CC messages (any channel)
    if ((status & 0xF0) !== 0xB0) return
    
    const channel = status & 0x0F
    console.log(`[MidiMapping] Detected CC via Raw from ${deviceName} on CH ${channel + 1}:`, event.data[1])
    mappingStore.incomingCC(event.data[1], deviceName, channel)
  })
}

watch(() => mappingStore.isMidiLearning, () => {
  setupLearn()
}, { immediate: true })

onMounted(() => {
  // Extra safety: ensure setup if already learning
  if (mappingStore.isMidiLearning) setupLearn()
})

onUnmounted(() => {
  if (_unsubLearn) _unsubLearn()
})

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
  <div :class="embedded ? '' : 'fixed inset-0 z-[160] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4'">
    <div :class="embedded ? 'flex flex-col h-full overflow-hidden p-4' : 'bg-neutral-900 border border-synth-neon/30 rounded-2xl p-6 max-w-md w-full max-h-[80vh] flex flex-col shadow-2xl'">

      <!-- Header -->
      <div class="flex justify-between items-center mb-4 border-b border-neutral-800 pb-4 shrink-0">
        <h2 class="text-xl font-black text-white tracking-widest uppercase flex items-center gap-2">
          <Radio class="w-6 h-6 text-synth-neon" /> MIDI MAPPING
        </h2>
        <button v-if="!props.embedded" @click="emit('close')" class="text-neutral-500 hover:text-rose-500 transition-colors p-2">
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Preset Switcher -->
      <div class="mb-4 shrink-0">
        <div class="flex items-center gap-2">
          <select
            :value="mappingStore.activePresetId || ''"
            @change="e => e.target.value && mappingStore.loadPreset(e.target.value)"
            class="flex-1 bg-black border border-neutral-700 text-[11px] font-mono text-neutral-300 px-2 py-1.5 rounded focus:outline-none focus:border-synth-neon/50"
          >
            <option value="">— No preset —</option>
            <option v-for="p in mappingStore.presets" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <button
            @click="mappingStore.savePreset(mappingStore.activePresetId ? mappingStore.presets.find(p => p.id === mappingStore.activePresetId)?.name || 'Preset' : 'New Preset')"
            class="text-[10px] px-2 py-1.5 rounded border border-synth-neon/30 text-synth-neon hover:bg-synth-neon/10 transition-colors whitespace-nowrap"
            title="Save current mappings to active preset"
          >Save</button>
          <button
            v-if="mappingStore.activePresetId"
            @click="mappingStore.duplicatePreset(mappingStore.activePresetId)"
            class="text-[10px] px-2 py-1.5 rounded border border-neutral-700 text-neutral-400 hover:text-neutral-200 transition-colors"
            title="Duplicate preset"
          >Dup</button>
          <button
            v-if="mappingStore.activePresetId"
            @click="mappingStore.deletePreset(mappingStore.activePresetId)"
            class="text-[10px] px-2 py-1.5 rounded border border-rose-900/40 text-rose-500 hover:bg-rose-900/20 transition-colors"
            title="Delete preset"
          >Del</button>
        </div>
        <p v-if="mappingStore.activePresetId" class="text-[9px] text-neutral-600 mt-1 font-mono">
          Active: {{ mappingStore.presets.find(p => p.id === mappingStore.activePresetId)?.name }}
          · {{ mappingStore.mappingCount }} mapping{{ mappingStore.mappingCount !== 1 ? 's' : '' }}
        </p>
      </div>

      <!-- Learn area -->
      <div class="flex-1 overflow-y-auto custom-scrollbar mb-6 pr-2">

        <!-- Unified Mapping Screen (Learning + Picking) -->
        <div v-if="mappingStore.isMidiLearning" class="bg-neutral-800 border border-neutral-700 rounded-xl p-5 mb-4">
          
          <!-- MIDI Detection Status -->
          <div class="bg-black/40 rounded-lg p-4 mb-6 border border-neutral-700 text-center">
            <template v-if="mappingStore.learnedCC === null">
              <CircleDashed class="w-8 h-8 text-synth-neon mb-2 animate-spin mx-auto" />
              <p class="text-synth-neon font-bold text-[10px] uppercase tracking-widest">Waiting for MIDI...</p>
              <p class="text-neutral-500 text-[8px] uppercase">Move a knob or fader</p>
              
              <div v-if="lastRawData" class="mt-3 pt-3 border-t border-neutral-800">
                <p class="text-[8px] text-neutral-600 uppercase mb-1">Last Data In</p>
                <p class="text-[10px] font-mono text-neutral-500">{{ lastRawData }}</p>
              </div>
            </template>
            <template v-else>
              <CheckCircle2 class="w-8 h-8 text-synth-neon mb-2 mx-auto" />
              <p class="text-neutral-400 text-[10px] uppercase mb-1">Detected Controller</p>
              <p class="text-2xl font-black text-synth-neon">CC# {{ mappingStore.learnedCC }}</p>
              <div class="flex items-center justify-center gap-2 mt-1">
                <span class="text-[9px] text-neutral-500 uppercase bg-neutral-800 px-1.5 py-0.5 rounded">{{ mappingStore.learnedDevice }}</span>
                <span class="text-[9px] text-violet-400 font-mono bg-violet-400/10 px-1.5 py-0.5 rounded border border-violet-400/20">CH {{ mappingStore.learnedChannel + 1 }}</span>
              </div>
            </template>
          </div>

          <!-- Parameter Selection (Always available) -->
          <div class="mb-6">
            <label class="block text-neutral-400 text-[10px] uppercase text-center mb-2">Assign to Parameter</label>
            <div class="space-y-1">
              <select
                v-model="targetParam"
                class="w-full bg-black border border-neutral-700 rounded-lg p-3 text-neutral-300 font-mono text-sm focus:border-synth-neon outline-none"
              >
                <option value="" disabled>Select a parameter...</option>
                <option v-for="p in availableParams" :key="p.name" :value="p.name">
                  {{ p.label }}
                </option>
              </select>
              <p class="text-[8px] text-neutral-600 text-right uppercase font-mono">{{ availableParams.length }} parameters available</p>
            </div>
          </div>

          <div class="flex gap-2">
            <button @click="cancelLearn"
              class="flex-1 py-3 text-neutral-400 uppercase tracking-widest font-black text-[10px] bg-neutral-900 rounded-lg hover:bg-neutral-800 border border-neutral-700"
            >Cancel</button>
            <button @click="confirmLearn" :disabled="!targetParam || mappingStore.learnedCC === null"
              class="flex-1 py-3 text-black uppercase tracking-widest font-black text-[10px] bg-synth-neon rounded-lg hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              Confirm Mapping
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
            <div v-for="(mapping, key) in mappingStore.midiMappings" :key="key"
              class="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-lg p-3"
            >
              <div class="flex flex-col gap-0.5">
                <div class="flex items-center gap-2">
                  <span class="bg-black border border-neutral-800 text-synth-neon font-mono text-[9px] px-2 py-0.5 rounded">CC {{ typeof mapping === 'object' ? mapping.cc : key }}</span>
                  <span class="text-neutral-300 font-bold uppercase tracking-wide text-[10px]">
                    {{ typeof mapping === 'object' ? mapping.paramName : mapping }}
                  </span>
                </div>
                <div v-if="typeof mapping === 'object' && (mapping.device || mapping.channel !== undefined)" class="flex items-center gap-1.5 mt-1">
                  <span v-if="mapping.device" class="text-[9px] text-neutral-400 font-mono bg-neutral-800/50 px-1.5 py-0.5 rounded border border-neutral-700/30">
                    {{ mapping.device }}
                  </span>
                  <span v-if="mapping.channel !== undefined" class="text-[9px] text-violet-400 font-mono bg-violet-400/5 px-1.5 py-0.5 rounded border border-violet-400/10">
                    CH {{ mapping.channel + 1 }}
                  </span>
                </div>
              </div>
              <button @click="mappingStore.removeMapping(key)" class="text-neutral-500 hover:text-rose-500 p-1">
                <X class="w-4 h-4" />
              </button>
            </div>
          </div>
        </template>

      </div>
    </div>
  </div>
</template>
