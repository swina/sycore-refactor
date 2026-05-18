<template>
  <div 
    @click="cycleCategory"
    class="visualizer-container h-[80px] w-[140px] flex items-center justify-center bg-black rounded-lg border border-neutral-700/50 overflow-hidden relative group cursor-pointer transition-all hover:scale-[1.02] active:scale-95 shadow-2xl"
  >
    <!-- Hardware Screen Effect Overlays -->
    <div class="absolute inset-0 z-20 pointer-events-none glass-reflection"></div>
    <div class="absolute inset-0 z-10 pointer-events-none scanlines"></div>
    
    <AdsrEnvelope 
      v-if="uiStore.activeVisualizerCategory === 'ENV'" 
      :attack="getVal('attack')" 
      :decay="getVal('decay')" 
      :sustain="getVal('sustain')" 
      :release="getVal('release')" 
      :width="130" :height="60" :color="activeCategoryColor" 
    />
    
    <FilterEnvelope 
      v-else-if="uiStore.activeVisualizerCategory === 'FILTER'" 
      :cutoff="getVal('cutoff')" 
      :resonance="getVal('res')" 
      :width="130" :height="60" :color="activeCategoryColor" 
    />

    <EfxMixerVisualizer 
      v-else-if="uiStore.activeVisualizerCategory === 'EFX'" 
      :delay="getVal('delayLvl')" 
      :reverb="getVal('reverb')" 
      :chorus="getVal('chorusMode')" 
      :width="130" :height="60" :color="activeCategoryColor" 
    />

    <OscMixerVisualizer 
      v-else-if="uiStore.activeVisualizerCategory === 'OSCILLATOR'" 
      :pulse="getVal('oscSq')" 
      :saw="getVal('oscSaw')" 
      :lfo="getVal('oscLFO')" 
      :sub="getVal('oscSub')" 
      :noise="getVal('oscNoise')" 
      :width="130" :height="60" :color="activeCategoryColor" 
    />

    <WaveformVisualizer 
      v-else-if="uiStore.activeVisualizerCategory === 'LFO'" 
      :waveform="getVal('lfoWave')" 
      :rate="getVal('lfoRate')" 
      :lfoFilter="getVal('lfoFilt')"
      :width="130" :height="60" :color="activeCategoryColor" 
    />

    <div v-else class="text-[8px] font-mono text-neutral-600 uppercase tracking-widest animate-pulse">
      {{ uiStore.activeVisualizerCategory }}
    </div>
    
    <!-- Label overlay (Permanently visible) -->
    <div class="absolute top-1 right-1 pointer-events-none z-30">
      <div class="text-[7px] font-mono font-black text-white/40 uppercase tracking-widest bg-black/60 backdrop-blur-md border border-white/5 px-1.5 py-0.5 rounded shadow-lg group-hover:text-white/80 transition-colors">
        {{ uiStore.activeVisualizerCategory }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue'
import { useUiStore } from '@/stores/useUiStore'
import { usePresetStore } from '@/stores/usePresetStore'
import { useConfigStore } from '@/stores/useConfigStore'
import FilterEnvelope from '@/components/FilterEnvelope.vue'
import AdsrEnvelope from '@/components/AdsrEnvelope.vue'
import EfxMixerVisualizer from '@/components/EfxMixerVisualizer.vue'
import OscMixerVisualizer from '@/components/OscMixerVisualizer.vue'
import WaveformVisualizer from '@/components/WaveformVisualizer.vue'

const uiStore = useUiStore()
const presetStore = usePresetStore()
const configStore = useConfigStore()

const VISUALIZER_MODES = ['FILTER', 'OSCILLATOR', 'ENV', 'LFO', 'EFX']

function cycleCategory() {
  const currentIndex = VISUALIZER_MODES.indexOf(uiStore.activeVisualizerCategory)
  const nextIndex = (currentIndex + 1) % VISUALIZER_MODES.length
  uiStore.activeVisualizerCategory = VISUALIZER_MODES[nextIndex]
}

// Get active category color from config store
const activeCategoryColor = computed(() => {
  const cat = configStore.categories.find(c => c.id === uiStore.activeVisualizerCategory)
  return cat?.color || '#00ff88'
})

// Get active data (similar to ResultsPanel)
const activeData = computed(() => {
  const preset = presetStore.lastPreset
  if (!preset) return null
  return presetStore.useAlternativeEngine ? preset.bVariant?.data : preset.aVariant?.data
})

const PARAM_VISUALIZER_MAP = {
  // LFO Visualizer
  lfoFilt: 'LFO', lfoRate: 'LFO', lfoWave: 'LFO', lfoMod: 'LFO',
  // FILTER Visualizer
  cutoff: 'FILTER', res: 'FILTER', envFilt: 'FILTER',
  // ENV Visualizer
  attack: 'ENV', decay: 'ENV', sustain: 'ENV', release: 'ENV',
  // OSCILLATOR Visualizer
  oscSaw: 'OSCILLATOR', oscSq: 'OSCILLATOR', oscSub: 'OSCILLATOR', oscNoise: 'OSCILLATOR',
  pwWidth: 'OSCILLATOR', pwmSrc: 'OSCILLATOR', oscLFO: 'OSCILLATOR',
  // EFX Visualizer
  reverb: 'EFX', delayLvl: 'EFX', chorusMode: 'EFX', delayTime: 'EFX', reverbType: 'EFX'
}

function getVal(name) {
  if (!activeData.value) return 0
  const val = activeData.value[name]
  return typeof val === 'number' ? val : 0
}

// Local cache to track previous values for comparison
let lastValues = activeData.value ? { ...activeData.value } : {}

// State to manage visualizer "stickiness" (prevents flickering)
let switchLockTimer = null
let lockedCategory = null

// Auto-switch visualizer category based on last modified parameter
let currentPresetId = presetStore.lastPreset?.id

watch(activeData, (newVal) => {
  if (!newVal) return
  
  // Check if this is a global preset change (ID change)
  const isNewPreset = presetStore.lastPreset?.id !== currentPresetId
  currentPresetId = presetStore.lastPreset?.id
  
  if (isNewPreset) {
    // Sync lastValues and exit - don't auto-switch on sound change
    lastValues = { ...newVal }
    return
  }

  const changedKeys = Object.keys(newVal).filter(k => {
    const delta = Math.abs((newVal[k] || 0) - (lastValues[k] || 0))
    // Reduced delta to 1 to capture switches/categorical changes
    return delta >= 1 
  })
  
  if (changedKeys.length > 0) {
    // Priority Sort: always check lfoFilt first
    const sortedKeys = [...changedKeys].sort((a, b) => a === 'lfoFilt' ? -1 : b === 'lfoFilt' ? 1 : 0)

    for (const key of sortedKeys) {
      const targetMode = PARAM_VISUALIZER_MAP[key]
      if (!targetMode) continue

      // If we are locked into a category, ignore other switches unless 
      // the new change is also a priority one or we've timed out.
      const isLocked = switchLockTimer !== null
      const isHighPriority = key === 'lfoFilt'

      if (!isLocked || isHighPriority || targetMode === lockedCategory) {
        if (uiStore.activeVisualizerCategory !== targetMode) {
          uiStore.activeVisualizerCategory = targetMode
        }
        
        // Reset/Update the lock timer whenever an intentional change happens
        clearTimeout(switchLockTimer)
        lockedCategory = targetMode
        switchLockTimer = setTimeout(() => {
          switchLockTimer = null
          lockedCategory = null
        }, 1500) // Lock for 1.5 seconds

        break 
      }
    }
  }

  // Always sync lastValues to detect next change correctly
  lastValues = { ...newVal }
}, { deep: true })
</script>

<style scoped>
.visualizer-container {
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

.visualizer-container::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  box-shadow: inset 0 0 10px rgba(255,255,255,0.05);
  z-index: 25;
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
  filter: drop-shadow(0 0 4px v-bind(activeCategoryColor + '66'));
  transition: all 0.3s ease;
}

.visualizer-container:hover :deep(svg) {
  filter: drop-shadow(0 0 8px v-bind(activeCategoryColor + '99'));
}
</style>

