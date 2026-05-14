<script setup>
import { computed } from 'vue'
import { X } from 'lucide-vue-next'
import { useMappingStore } from '@/stores/useMappingStore'
import { useUiStore } from '@/stores/useUiStore'
import { FIELD_TO_CC } from '@/constants/s1-config'

const mappingStore = useMappingStore()
const uiStore = useUiStore()

// We only show parameters that are actually useful for velocity modulation
const MODULATABLE_FIELDS = [
  'cutoff', 'res', 'attack', 'decay', 'sustain', 'release', 
  'oscLFO', 'pwWidth', 'pwmSrc', 'lfoRate', 'lfoMod', 
  'oscSq', 'oscSaw', 'oscSub', 'oscNoise',
  'delayLvl', 'reverb'
]

const availableParams = computed(() => {
  return MODULATABLE_FIELDS.map(field => ({
    name: field,
    label: field.replace(/([A-Z])/g, ' $1').trim().toUpperCase()
  }))
})

const config = computed(() => mappingStore.velocityConfig)

function close() {
  uiStore.isVelocityMapOpen = false
}

function toggleStatus() {
  mappingStore.velocityConfig.active = !mappingStore.velocityConfig.active
  if (!mappingStore.velocityConfig.active) {
    mappingStore.restoreOriginalValues()
  }
}

function updateCurve(curve) {
  mappingStore.velocityConfig.curve = curve
}

function updateTarget(field) {
  mappingStore.velocityConfig.targetParameter = field
}
</script>

<template>
  <div v-if="uiStore.isVelocityMapOpen" class="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
    <div class="absolute inset-0" @click="close"></div>
    
    <div class="relative bg-[#111] border border-neutral-800 p-6 rounded-xl w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-200">
      <button @click="close" class="absolute top-4 right-4 text-neutral-500 hover:text-white transition-colors">
        <X class="w-5 h-5" />
      </button>
      
      <h2 class="text-sm font-black uppercase tracking-widest text-[#00ff9d] mb-6">VELOCITY MODULATION</h2>
      
      <div class="space-y-6">
        <!-- Status -->
        <div class="flex items-center justify-between">
          <span class="text-xs font-mono text-neutral-400 font-bold uppercase tracking-widest">STATUS</span>
          <button
            @click="toggleStatus"
            :class="['px-4 py-2 text-xs font-mono font-bold uppercase tracking-widest rounded transition-colors', config.active ? 'bg-[#00ff9d] text-black shadow-[0_0_15px_#00ff9d66]' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700']"
          >
            {{ config.active ? 'ACTIVE' : 'OFF' }}
          </button>
        </div>

        <!-- Target Parameter -->
        <div class="space-y-2">
          <label class="text-xs font-mono text-neutral-400 font-bold uppercase tracking-widest">TARGET PARAMETER</label>
          <div class="relative group">
            <select
              :value="config.targetParameter"
              @change="e => updateTarget(e.target.value)"
              class="w-full bg-neutral-900 border border-neutral-800 rounded p-3 text-xs font-mono uppercase tracking-widest text-white outline-none focus:border-[#00ff9d] transition-colors appearance-none cursor-pointer"
            >
              <option v-for="p in availableParams" :key="p.name" :value="p.name">{{ p.label }}</option>
            </select>
            <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500 group-hover:text-neutral-300">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            </div>
          </div>
        </div>

        <!-- Amount -->
        <div class="space-y-2">
          <div class="flex justify-between items-center text-xs font-mono text-neutral-400 font-bold uppercase tracking-widest">
            <label>AMOUNT</label>
            <span :class="config.amount === 0 ? 'text-neutral-600' : 'text-[#00ff9d]'">
              {{ config.amount > 0 ? '+' : '' }}{{ config.amount }}%
            </span>
          </div>
          <input
            type="range"
            min="-100"
            max="100"
            v-model.number="mappingStore.velocityConfig.amount"
            class="w-full accent-[#00ff9d] h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
          />
          <div class="flex justify-between text-[10px] font-mono text-neutral-600">
            <span>-100%</span>
            <span>0%</span>
            <span>+100%</span>
          </div>
        </div>

        <!-- Response Curve -->
        <div class="space-y-2">
          <label class="text-xs font-mono text-neutral-400 font-bold uppercase tracking-widest">RESPONSE CURVE</label>
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="curve in ['linear', 'exp', 'log']"
              :key="curve"
              @click="updateCurve(curve)"
              :class="['py-3 text-xs font-mono font-bold uppercase tracking-widest rounded border transition-colors', config.curve === curve ? 'bg-[#00ff9d]/10 border-[#00ff9d] text-[#00ff9d] shadow-[0_0_10px_#00ff9d33]' : 'bg-neutral-900 border-neutral-800 text-neutral-500 hover:border-neutral-700']"
            >
              {{ curve }}
            </button>
          </div>
          <p class="text-[10px] font-mono text-neutral-500 pt-1">
            {{ config.curve === 'linear' ? 'Direct 1:1 mapping.' : config.curve === 'exp' ? 'More sensitive at high velocity.' : 'More sensitive at low velocity.' }}
          </p>
        </div>
      </div>
      
      <div class="mt-8 pt-4 border-t border-neutral-800 text-[10px] font-mono text-neutral-500 italic leading-relaxed">
        Note: This applies a fake modulation by sending CC messages per Note On. It affects all playing notes globally on the S-1. Make sure your "MIDI IN" is enabled.
      </div>
    </div>
  </div>
</template>

<style scoped>
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  background: #00ff9d;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 0 10px rgba(0, 255, 157, 0.4);
  transition: transform 0.1s ease;
}
input[type="range"]::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}
</style>
