<template>
  <div class="filter-container" :style="{ width: `${width}px`, height: `${height}px` }">
    <svg :width="width" :height="height" class="filter-svg">
      <!-- Grid/Background -->
      <rect x="0" y="0" :width="width" :height="height" class="filter-bg" />
      
      <!-- Filter Area Fill (70% opacity matching ADSR) -->
      <path 
        :d="filledPath" 
        :fill="color" 
        fill-opacity="0.7" 
      />
      
      <!-- Filter Curve Stroke/Line -->
      <path 
        :d="linePath" 
        fill="none"
        :stroke="color"
        stroke-width="2.5"
        stroke-linejoin="round"
      />
      
      <!-- Interactive node (Cutoff & Resonance representation) -->
      <circle :cx="nodeX" :cy="nodeY" r="5" class="filter-node" :stroke="color" />
    </svg>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  cutoff: { type: Number, default: 127 },    // 0-127 Frequency
  resonance: { type: Number, default: 0 },   // 0-127 Peak
  width: { type: Number, default: 300 },     // Total pixel width
  height: { type: Number, default: 120 },    // Total pixel height
  color: { type: String, default: '#4dcfef' } // Default cyan color
})

// Map cutoff and resonance to X/Y coordinates
const nodeX = computed(() => (props.cutoff / 127) * props.width)
const nodeY = computed(() => {
  const resNorm = props.resonance / 127
  const baseY = props.height * 0.6 // Base volume level for frequencies passing through (60% down)
  return baseY - resNorm * (baseY - 10) // Peak moves up based on resonance, leaving a 10px margin
})

// Construct the SVG path commands for the Low Pass Filter curve
const paths = computed(() => {
  const cutX = nodeX.value
  const peakY = nodeY.value
  const baseY = props.height * 0.6
  const bottomY = props.height + 20 // Extend past the canvas bottom to hide the line's end

  const preWidth = 50  // Width of the resonance rising curve
  const postWidth = 50 // Width of the cutoff drop-off slope

  // Start way off-screen to the left to prevent looping paths when cutoff is 0
  let d = `M -100,${baseY} `
  
  // Flat line until the resonant bump starts
  d += `L ${cutX - preWidth},${baseY} `
  
  // Cubic Bezier S-curve up to the peak (Cutoff/Resonance point)
  d += `C ${cutX - preWidth/2},${baseY} ${cutX - preWidth/4},${peakY} ${cutX},${peakY} `
  
  // Cubic Bezier S-curve down to the floor (Low Pass filter dropping off)
  d += `C ${cutX + postWidth/4},${peakY} ${cutX + postWidth/2},${bottomY} ${cutX + postWidth},${bottomY} `
  
  // Line extending way off-screen to the right
  d += `L ${props.width + 100},${bottomY}`
  
  return d
})

const linePath = computed(() => paths.value)

const filledPath = computed(() => {
  // Complete the polygon bounds way off-canvas so the fill applies correctly
  return `${paths.value} L ${props.width + 100},${props.height + 100} L -100,${props.height + 100} Z`
})
</script>

<style scoped>
.filter-container {
  position: relative;
  background: #111;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: inset 0 0 10px rgba(0,0,0,0.5);
  border: 1px solid #333;
}

.filter-bg {
  fill: #000000;
}

.filter-node {
  fill: #fff;
  stroke-width: 2;
  transition: all 0.1s ease;
}
</style>
