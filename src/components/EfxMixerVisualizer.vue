<template>
  <div class="efx-mixer-container pl-3" :style="{ width: `${width}px`, height: `${height}px` }">
    <svg :width="width" :height="height" class="efx-mixer-svg">
      <!-- Grid/Background -->
      <rect x="0" y="0" :width="width" :height="height" class="efx-mixer-bg" />

      <!-- EFX Level Bars -->
      <g v-for="(efx, index) in effects" :key="efx.name">
        <!-- Effect Icon -->
        <path
          :d="efx.iconPath"
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
          class="efx-bar-track"
        />
        
        <!-- Active Level Fill -->
        <rect
          :x="padding + index * barSpacing"
          :y="trackY + (maxBarHeight - efx.barHeight)"
          :width="barWidth"
          :height="efx.barHeight"
          :fill="color"
          fill-opacity="0.85"
          rx="1.5"
        />
        
        <!-- Text Label -->
        <text
          :x="padding + index * barSpacing + barWidth / 2"
          :y="height - padding"
          class="efx-label"
          :fill="color"
          text-anchor="middle"
        >
          {{ efx.label }}
        </text>
      </g>
    </svg>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  delay:  { type: Number, default: 0 },
  reverb: { type: Number, default: 0 },
  chorus: { type: Number, default: 0 },
  width:  { type: Number, default: 90 }, // Slightly narrower since it's 3 bars, not 5
  height: { type: Number, default: 80 },
  color:  { type: String, default: '#a855f7' } // Default purple for effects
})

const padding = 6
const labelHeight = 10
const iconHeight = 12
const iconGap = 6
const effectsCount = 3

const trackY = padding + iconHeight + iconGap

// Calculate geometric properties based on overall width/height
const barSpacing = computed(() => (props.width - padding * 2) / effectsCount)
const barWidth = computed(() => barSpacing.value * 0.55) // Leave gaps between bars
const maxBarHeight = computed(() => props.height - trackY - labelHeight - padding)

const effects = computed(() => {
  const data = [
    { name: 'delay',  label: 'DLY', val: props.delay },
    { name: 'reverb', label: 'REV', val: props.reverb },
    { name: 'chorus', label: 'CHO', val: props.chorus }
  ]

  const w = barWidth.value
  const h = iconHeight
  const pad = 1

  return data.map(efx => {
    let iconPath = ''
    if (efx.name === 'delay') {
      // Diminishing echo lines
      iconPath = `M ${w*0.2},${pad} L ${w*0.2},${h-pad} M ${w*0.5},${h*0.2} L ${w*0.5},${h*0.8} M ${w*0.8},${h*0.35} L ${w*0.8},${h*0.65}`
    } else if (efx.name === 'reverb') {
      // Expanding arches representing space/reflections
      iconPath = `M 0,${h-pad} Q ${w/2},${-pad} ${w},${h-pad} M ${w*0.2},${h-pad} Q ${w/2},${h*0.4} ${w*0.8},${h-pad}`
    } else if (efx.name === 'chorus') {
      // Intertwined/offset modulation waves
      iconPath = `M 0,${h*0.4} Q ${w/4},${-pad} ${w/2},${h*0.4} T ${w},${h*0.4} M 0,${h*0.8} Q ${w/4},${h*0.3} ${w/2},${h*0.8} T ${w},${h*0.8}`
    }

    return {
      ...efx,
      barHeight: (efx.val / 127) * maxBarHeight.value,
      iconPath
    }
  })
})
</script>

<style scoped>
.efx-mixer-container {
  position: relative;
  background: rgba(0, 0, 0,.60);
  border-radius: 6px;
  overflow: hidden;
  box-shadow: inset 0 0 8px rgba(0,0,0,0.5);
  border: 1px solid #333;
  display: flex;
  align-items: center;
  justify-content: center;
}

.efx-mixer-bg {
  fill:rgba(0, 0, 0, 0);
}

.efx-bar-track {
  fill: #2a2a2a;
  rx: 1.5;
}

.efx-label {
  font-family: monospace;
  font-size: 7px;
  font-weight: 900;
  letter-spacing: -0.5px;
  opacity: 0.7;
}
</style>