<script setup>
import { computed } from 'vue'
import { X, Activity, Timer, Zap } from 'lucide-vue-next'
import { useLfoStore } from '@/stores/useLfoStore'
import { useUiStore } from '@/stores/useUiStore'

const props = defineProps({
  lfoId: {
    type: Number,
    required: true // 1 or 2
  }
})

const lfoStore = useLfoStore()
const uiStore = useUiStore()

const isOpen = computed(() => props.lfoId === 1 ? uiStore.isLfo1Open : uiStore.isLfo2Open)
const config = computed(() => props.lfoId === 1 ? lfoStore.lfo1 : lfoStore.lfo2)

const MODULATABLE_FIELDS = [
  'cutoff', 'res', 'attack', 'decay', 'sustain', 'release', 
  'oscLFO', 'pwWidth', 'pwmSrc', 'lfoRate', 'lfoMod', 
  'oscSq', 'oscSaw', 'oscSub', 'oscNoise',
  'delayLvl', 'reverb', 'delayTime', 'expression'
]

const WAVEFORMS = ['sine', 'triangle', 'square', 'saw', 'sh']

const availableParams = computed(() => {
  return MODULATABLE_FIELDS.map(field => ({
    name: field,
    label: field.replace(/([A-Z])/g, ' $1').trim().toUpperCase()
  }))
})

function close() {
  if (props.lfoId === 1) uiStore.isLfo1Open = false
  else uiStore.isLfo2Open = false
}

function toggleStatus() {
  lfoStore.toggleLfo(props.lfoId)
}

function updateField(field, value) {
  config.value[field] = value
}
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
    <div class="absolute inset-0" @click="close"></div>
    
    <div class="relative bg-[#111] border border-neutral-800 p-6 rounded-xl w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-200">
      <button @click="close" class="absolute top-4 right-4 text-neutral-500 hover:text-white transition-colors">
        <X class="w-5 h-5" />
      </button>
      
      <div class="flex items-center gap-3 mb-6">
        <div class="p-2 bg-[#00f3ff]/10 rounded-lg">
          <Activity class="w-5 h-5 text-[#00f3ff]" />
        </div>
        <h2 class="text-sm font-black uppercase tracking-widest text-[#00f3ff]">LFO {{ props.lfoId }} ENGINE</h2>
      </div>
      
      <div class="space-y-6">
        <!-- Status -->
        <div class="flex items-center justify-between bg-neutral-900/50 p-3 rounded-lg border border-neutral-800/50">
          <div class="flex flex-col">
            <span class="text-[10px] font-mono text-neutral-500 font-bold uppercase tracking-widest">ENGINE STATUS</span>
            <span class="text-xs font-mono text-white">{{ config.active ? 'OSCILLATING' : 'IDLE' }}</span>
          </div>
          <button
            @click="toggleStatus"
            :class="['px-6 py-2 text-xs font-mono font-bold uppercase tracking-widest rounded transition-all duration-300', 
              config.active 
                ? 'bg-[#00f3ff] text-black shadow-[0_0_20px_#00f3ff66] scale-105' 
                : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700']"
          >
            {{ config.active ? 'ACTIVE' : 'START' }}
          </button>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <!-- Waveform -->
          <div class="space-y-2">
            <label class="text-[10px] font-mono text-neutral-500 font-bold uppercase tracking-widest">WAVEFORM</label>
            <div class="relative">
              <select
                :value="config.waveform"
                @change="e => updateField('waveform', e.target.value)"
                class="w-full bg-neutral-900 border border-neutral-800 rounded p-2.5 text-[10px] font-mono uppercase tracking-widest text-white outline-none focus:border-[#00f3ff] transition-colors appearance-none cursor-pointer"
              >
                <option v-for="w in WAVEFORMS" :key="w" :value="w">{{ w }}</option>
              </select>
              <div class="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
              </div>
            </div>
          </div>

          <!-- Mode -->
          <div class="space-y-2">
            <label class="text-[10px] font-mono text-neutral-500 font-bold uppercase tracking-widest">TIMING MODE</label>
            <div class="flex bg-neutral-900 rounded p-1 border border-neutral-800">
              <button 
                v-for="m in ['free', 'sync']" 
                :key="m"
                @click="updateField('mode', m)"
                :class="['flex-1 py-1.5 text-[10px] font-mono font-bold uppercase tracking-widest rounded transition-all', 
                  config.mode === m ? 'bg-neutral-800 text-[#00f3ff]' : 'text-neutral-500 hover:text-neutral-300']"
              >
                {{ m }}
              </button>
            </div>
          </div>
        </div>

        <!-- Target Parameter -->
        <div class="space-y-2">
          <label class="text-[10px] font-mono text-neutral-500 font-bold uppercase tracking-widest">MODULATION TARGET</label>
          <div class="relative group">
            <select
              :value="config.targetParameter"
              @change="e => updateField('targetParameter', e.target.value)"
              class="w-full bg-neutral-900 border border-neutral-800 rounded p-3 text-xs font-mono uppercase tracking-widest text-white outline-none focus:border-[#00f3ff] transition-colors appearance-none cursor-pointer"
            >
              <option v-for="p in availableParams" :key="p.name" :value="p.name">{{ p.label }}</option>
            </select>
            <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500 group-hover:text-neutral-300">
              <Zap class="w-4 h-4" />
            </div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-6">
          <div class="space-y-2">
            <div class="flex justify-between items-center text-[10px] font-mono text-neutral-500 font-bold uppercase tracking-widest">
              <label>{{ config.mode === 'free' ? 'RATE' : 'DIVISION' }}</label>
              <span class="text-[#00f3ff]">
                {{ config.mode === 'free' ? config.rate.toFixed(2) + ' Hz' : config.syncDivision }}
              </span>
            </div>
            
            <template v-if="config.mode === 'free'">
              <input
                type="range"
                min="0.01"
                max="20"
                step="0.01"
                v-model.number="config.rate"
                class="w-full accent-[#00f3ff] h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
              />
            </template>
            <template v-else>
              <input
                type="range"
                min="0"
                :max="lfoStore.SYNC_DIVISIONS.length - 1"
                step="1"
                :value="lfoStore.SYNC_DIVISIONS.indexOf(config.syncDivision)"
                @input="e => updateField('syncDivision', lfoStore.SYNC_DIVISIONS[parseInt(e.target.value)])"
                class="w-full accent-[#00f3ff] h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
              />
            </template>
          </div>

          <!-- Depth -->
          <div class="space-y-2">
            <div class="flex justify-between items-center text-[10px] font-mono text-neutral-500 font-bold uppercase tracking-widest">
              <label>DEPTH</label>
              <span class="text-[#00f3ff]">{{ config.depth }}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              v-model.number="config.depth"
              class="w-full accent-[#00f3ff] h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </div>
      </div>
      
      <div class="mt-8 pt-4 border-t border-neutral-800/50">
        <p class="text-[9px] font-mono text-neutral-600 leading-relaxed italic">
          <span class="text-neutral-500 font-bold">STABILITY PROTOCOL:</span> 
          SY.CORE ensures smooth hardware synchronization by centering the target parameter upon activation and using a staggered restoration stream when disabled.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  background: #00f3ff;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 0 10px rgba(0, 243, 255, 0.4);
  transition: transform 0.1s ease;
}
input[type="range"]::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

select {
  background-image: none;
}
</style>
