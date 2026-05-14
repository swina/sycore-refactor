<template>
  <div class="osc-mixer-container w-full h-full">
    <svg :viewBox="`0 0 ${width} ${height}`" preserveAspectRatio="xMidYMid meet" width="100%" height="100%" class="osc-mixer-svg">
      <!-- Grid/Background -->
      <rect x="0" y="0" :width="width" :height="height" class="osc-mixer-bg" />

      <!-- Oscillator Level Bars -->
      <g v-for="(osc, index) in oscillators" :key="osc.name">
        <!-- Waveform Icon -->
        <path
          :d="osc.iconPath"
          :transform="`translate(${padding + index * barSpacing}, ${padding})`"
          fill="none"
          :stroke="color"
          stroke-width="1.5"
          stroke-linejoin="round"
          stroke-linecap="round"
        />

        <!-- Bar Background (Track) -->
        <rect
          :x="padding + index * barSpacing"
          :y="trackY"
          :width="barWidth"
          :height="maxBarHeight"
          class="osc-bar-track"
        />
        
        <!-- Active Level Fill -->
        <rect
          :x="padding + index * barSpacing"
          :y="trackY + (maxBarHeight - osc.barHeight)"
          :width="barWidth"
          :height="osc.barHeight"
          :fill="color"
          fill-opacity="0.85"
          rx="1.5"
        />
        
        <!-- Text Label -->
        <text
          :x="padding + index * barSpacing + barWidth / 2"
          :y="height - padding"
          class="osc-label"
          :fill="color"
          text-anchor="middle"
        >
          {{ osc.label }}
        </text>
      </g>
    </svg>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  pulse: { type: Number, default: 0 },
  saw:   { type: Number, default: 0 },
  lfo:   { type: Number, default: 0 },
  sub:   { type: Number, default: 0 },
  noise: { type: Number, default: 0 },
  width: { type: Number, default: 120 },
  height: { type: Number, default: 80 },
  color: { type: String, default: '#00ff88' } // Default neon green
})

const padding = 6
const labelHeight = 10
const iconHeight = 10
const iconGap = 6
const oscillatorsCount = 5

const trackY = padding + iconHeight + iconGap

// Calculate geometric properties based on overall width/height
const barSpacing = computed(() => (props.width - padding * 2) / oscillatorsCount)
const barWidth = computed(() => barSpacing.value * 0.55) // Leave gaps between bars
const maxBarHeight = computed(() => props.height - trackY - labelHeight - padding)

const oscillators = computed(() => {
  const data = [
    { name: 'pulse', label: 'SQU', val: props.pulse },
    { name: 'saw',   label: 'SAW', val: props.saw },
    { name: 'lfo',   label: 'LFO', val: props.lfo },
    { name: 'sub',   label: 'SUB', val: props.sub },
    { name: 'noise', label: 'NOI', val: props.noise }
  ]

  const w = barWidth.value
  const h = iconHeight
  const pad = 1

  return data.map(osc => {
    let iconPath = ''
    if (osc.name === 'pulse') {
      iconPath = `M 0,${h-pad} L 0,${pad} L ${w/2},${pad} L ${w/2},${h-pad} L ${w},${h-pad}`
    } else if (osc.name === 'saw') {
      iconPath = `M 0,${h-pad} L ${w},${pad} L ${w},${h-pad}`
    } else if (osc.name === 'lfo') {
      iconPath = `M 0,${h/2} Q ${w/4},${-pad} ${w/2},${h/2} T ${w},${h/2}`
    } else if (osc.name === 'sub') {
      iconPath = `M 0,${h-pad} L 0,${pad} L ${w*0.75},${pad} L ${w*0.75},${h-pad} L ${w},${h-pad}`
    } else if (osc.name === 'noise') {
      iconPath = `M 0,${h/2} L ${w*0.2},${pad} L ${w*0.4},${h-pad} L ${w*0.6},${pad*2} L ${w*0.8},${h-pad*2} L ${w},${h/2}`
    }

    return {
      ...osc,
      barHeight: (osc.val / 127) * maxBarHeight.value,
      iconPath
    }
  })
})
</script>

<style scoped>
.osc-mixer-container {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.osc-mixer-bg {
  fill: #00000000;
}

.osc-bar-track {
  fill: #2a2a2a;
  rx: 1.5;
}

.osc-label {
  font-family: monospace;
  font-size: 7px;
  font-weight: 900;
  letter-spacing: -0.5px;
  opacity: 0.7;
}
</style>