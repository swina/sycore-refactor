<template>
  <div class="signal-flow-container w-full h-full relative overflow-hidden bg-neutral-950/20 rounded-xl border border-white/5 p-4 flex flex-col justify-center">
    <!-- Animated background patterns -->
    <div class="absolute inset-0 z-0 opacity-10 pointer-events-none">
      <div class="absolute inset-0 bg-grid-white/[0.02] bg-[size:20px_20px]"></div>
    </div>

    <svg :viewBox="`0 0 ${width} ${height}`" preserveAspectRatio="xMidYMid meet" class="signal-flow-svg relative z-10 w-full h-full">
      <defs>
        <linearGradient id="flowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" :stop-color="color" stop-opacity="0" />
          <stop offset="50%" :stop-color="color" stop-opacity="1" />
          <stop offset="100%" :stop-color="color" stop-opacity="0" />
        </linearGradient>
        
        <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      <!-- Connection Lines -->
      <g class="connections">
        <!-- OSC to FILTER -->
        <path d="M 120,60 L 180,60" class="flow-line" :stroke="color" />
        <!-- FILTER to ENV -->
        <path d="M 260,60 L 320,60" class="flow-line" :stroke="color" />
        <!-- ENV to EFX -->
        <path d="M 400,60 L 460,60" class="flow-line" :stroke="color" />
        <!-- EFX to OUTPUT -->
        <path d="M 540,60 L 580,60" class="flow-line" :stroke="color" />

        <!-- LFO Modulation paths (Dashed) -->
        <path d="M 190,110 L 220,90" class="mod-line" :stroke="color" stroke-dasharray="2,2" />
        <path d="M 120,110 L 120,80" class="mod-line" :stroke="color" stroke-dasharray="2,2" />
      </g>

      <!-- Pulse Animations -->
      <circle r="2" :fill="color" filter="url(#neonGlow)">
        <animateMotion dur="2s" repeatCount="indefinite" path="M 120,60 L 180,60" />
      </circle>
      <circle r="2" :fill="color" filter="url(#neonGlow)">
        <animateMotion dur="2.5s" repeatCount="indefinite" path="M 260,60 L 320,60" />
      </circle>
      <circle r="2" :fill="color" filter="url(#neonGlow)">
        <animateMotion dur="1.8s" repeatCount="indefinite" path="M 400,60 L 460,60" />
      </circle>

      <!-- Nodes -->
      
      <!-- OSC NODE -->
      <g transform="translate(40, 30)">
        <rect width="80" height="60" rx="4" class="node-box" :stroke="color" />
        <text x="40" y="25" class="node-title" fill="white">OSC</text>
        <text x="40" y="42" class="node-value" :fill="color">{{ oscType }}</text>
      </g>

      <!-- FILTER NODE -->
      <g transform="translate(180, 30)">
        <rect width="80" height="60" rx="4" class="node-box" :stroke="color" />
        <text x="40" y="25" class="node-title" fill="white">FILTER</text>
        <text x="40" y="42" class="node-value" :fill="color">{{ cutoffPercent }}%</text>
      </g>

      <!-- ENV NODE -->
      <g transform="translate(320, 30)">
        <rect width="80" height="60" rx="4" class="node-box" :stroke="color" />
        <text x="40" y="25" class="node-title" fill="white">AMP</text>
        <text x="40" y="42" class="node-value" :fill="color">{{ decayPercent }}ms</text>
      </g>

      <!-- EFX NODE -->
      <g transform="translate(460, 30)">
        <rect width="80" height="60" rx="4" class="node-box" :stroke="color" />
        <text x="40" y="25" class="node-title" fill="white">EFX</text>
        <text x="40" y="42" class="node-value" :fill="color">{{ efxStatus }}</text>
      </g>

      <!-- LFO NODE (Bottom) -->
      <g transform="translate(180, 100)">
        <rect width="80" height="40" rx="4" class="node-box mod-node" :stroke="color" />
        <text x="40" y="18" class="node-title sm" fill="white">LFO</text>
        <text x="40" y="32" class="node-value sm" :fill="color">{{ lfoRatePercent }}Hz</text>
      </g>

    </svg>

    <!-- Legend / Summary Info -->
    <div class="absolute bottom-4 left-4 right-4 flex justify-between items-end">
      <div class="flex flex-col gap-1">
        <span class="text-[8px] font-mono text-white/30 uppercase tracking-[0.2em]">Signal Strength</span>
        <div class="h-1 w-32 bg-white/5 rounded-full overflow-hidden">
          <div class="h-full rounded-full transition-all duration-500" :style="{ width: signalStrength + '%', backgroundColor: color }"></div>
        </div>
      </div>
      <div class="text-right">
        <!-- Text removed to avoid overlap with parent note -->
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  width: { type: Number, default: 600 },
  height: { type: Number, default: 160 },
  color: { type: String, default: '#00ff88' }
})

// Logic to interpret data into labels
const oscType = computed(() => {
  if (props.data.oscSaw > 64) return 'SAW'
  if (props.data.oscSq > 64) return 'SQUARE'
  if (props.data.oscSub > 64) return 'SUB'
  return 'MIXED'
})

const cutoffPercent = computed(() => Math.round((props.data.cutoff / 127) * 100))
const decayPercent = computed(() => Math.round((props.data.decay / 127) * 1000))
const lfoRatePercent = computed(() => (props.data.lfoRate / 10).toFixed(1))

const efxStatus = computed(() => {
  let count = 0
  if (props.data.delayLvl > 10) count++
  if (props.data.reverb > 10) count++
  if (props.data.chorusMode > 0) count++
  return count > 0 ? `${count} ACTIVE` : 'BYPASS'
})

const signalStrength = computed(() => {
  const sum = (props.data.oscSaw || 0) + (props.data.oscSq || 0) + (props.data.oscSub || 0)
  return Math.min(100, Math.round((sum / 255) * 100))
})
</script>

<style scoped>
.node-box {
  fill: rgba(0, 0, 0, 0.4);
  stroke-width: 1.5;
}

.mod-node {
  stroke-dasharray: 4,2;
  opacity: 0.8;
}

.node-title {
  font-family: monospace;
  font-size: 12px;
  font-weight: 900;
  text-anchor: middle;
  letter-spacing: 1px;
  text-transform: uppercase;
}

.node-title.sm { font-size: 10px; }

.node-value {
  font-family: monospace;
  font-size: 15px;
  font-weight: 900;
  text-anchor: middle;
}

.node-value.sm { font-size: 12px; }

.flow-line {
  fill: none;
  stroke-width: 1.5;
  stroke-linecap: round;
  opacity: 0.3;
}

.mod-line {
  fill: none;
  stroke-width: 1;
  opacity: 0.2;
}

@keyframes dash {
  to {
    stroke-dashoffset: -20;
  }
}

.flow-line {
  /* Optional: animation to show direction */
}
</style>
