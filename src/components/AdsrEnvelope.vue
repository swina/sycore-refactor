<template>
  <div class="adsr-container w-full h-full">
    <svg :viewBox="`0 0 ${width} ${height}`" preserveAspectRatio="xMidYMid meet" width="100%" height="100%" class="adsr-svg m-auto">
      <!-- Grid/Background (Optional) -->
      <rect x="0" y="0" :width="width" :height="height" class="adsr-bg" />
      
      <!-- Envelope Fill (70% opacity of the passed color) -->
      <polygon 
        :points="envelopePoints" 
        :fill="color" 
        fill-opacity="0.4" 
      />
      
      <!-- Envelope Stroke/Line -->
      <polyline 
        :points="envelopePoints" 
        fill="none"
        :stroke="color"
        stroke-width="1.5"
        stroke-linejoin="round"
      />
      
      <!-- Interactive handles/nodes -->
      <circle :cx="points.start.x" :cy="points.start.y" r="2.5" class="adsr-node" :stroke="color" />
      <circle :cx="points.attack.x" :cy="points.attack.y" r="2.5" class="adsr-node" :stroke="color" />
      <circle :cx="points.sustain.x" :cy="points.sustain.y" r="2.5" class="adsr-node" :stroke="color" />
      <circle :cx="points.releaseStart.x" :cy="points.releaseStart.y" r="2.5" class="adsr-node" :stroke="color" />
      <circle :cx="points.end.x" :cy="points.end.y" r="2.5" class="adsr-node" :stroke="color" />
    </svg>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  attack: { type: Number, default: 0 },    // 0-127 Time
  decay: { type: Number, default: 64 },    // 0-127 Time
  sustain: { type: Number, default: 127 }, // 0-127 Level
  release: { type: Number, default: 64 },  // 0-127 Time
  width: { type: Number, default: 300 },   // Total pixel width
  height: { type: Number, default: 120 },  // Total pixel height
  color: { type: String, default: '#00ff88' } // Default color if none passed
})

// Visual constants
const SUSTAIN_HOLD_WIDTH = 40 // Fixed width to visually represent the "hold" phase

// Calculate exact X and Y coordinates based on input props
const points = computed(() => {
  const aNorm = props.attack / 127
  const dNorm = props.decay / 127
  const sNorm = props.sustain / 127
  const rNorm = props.release / 127

  const variableWidth = props.width - SUSTAIN_HOLD_WIDTH
  const maxSegmentWidth = variableWidth / 3

  const aX = aNorm * maxSegmentWidth
  const dX = dNorm * maxSegmentWidth
  const rX = rNorm * maxSegmentWidth

  const baseY = props.height
  const peakY = 0
  const sustainY = props.height - (sNorm * props.height)
  
  return {
    start:        { x: 0, y: baseY },
    attack:       { x: aX, y: peakY },
    sustain:      { x: aX + dX, y: sustainY },
    releaseStart: { x: aX + dX + SUSTAIN_HOLD_WIDTH, y: sustainY },
    end:          { x: aX + dX + SUSTAIN_HOLD_WIDTH + rX, y: baseY }
  }
})

const envelopePoints = computed(() => {
  const p = points.value
  return `${p.start.x},${p.start.y} 
          ${p.attack.x},${p.attack.y} 
          ${p.sustain.x},${p.sustain.y} 
          ${p.releaseStart.x},${p.releaseStart.y} 
          ${p.end.x},${p.end.y}`
})
</script>

<style scoped>
.adsr-container {
  position: relative;
  overflow: hidden;
}

.adsr-bg {
  fill: transparent;
}

.adsr-node {
  fill: #c0880e;
  stroke-width: 1.5;
  transition: all 0.1s ease;
}
</style>
