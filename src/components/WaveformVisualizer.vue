<template>
  <div class="waveform-container" :style="{ width: `${width}px`, height: `${height}px` }">
    <svg :width="width" :height="height" class="waveform-svg">
      <!-- Grid/Background -->
      <rect x="0" y="0" :width="width" :height="height" class="waveform-bg" />
      
      <!-- Background Glow (Optional, adds a nice synth aesthetic) -->
      <polyline 
        :points="points" 
        fill="none"
        :stroke="color"
        stroke-width="6"
        stroke-opacity="0.2"
        stroke-linejoin="round"
      />

      <!-- Main Waveform Line -->
      <polyline 
        :points="points" 
        fill="none"
        :stroke="color"
        stroke-width="2.5"
        stroke-linejoin="round"
      />
    </svg>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  waveform: { type: Number, default: 0 },    // 0: Saw, 1: Rev Saw, 2: Sine, 3: Pulse, 4: Random, 5: Noise
  width: { type: Number, default: 120 },     // Total pixel width
  height: { type: Number, default: 60 },     // Total pixel height
  color: { type: String, default: '#00ff88' }, // Default green
  rate: { type: Number, default: 64 }        // 0-127 Frequency
})

const points = computed(() => {
  const w = props.width
  const h = props.height
  const pad = 5 // Padding to prevent stroke clipping on top/bottom edges
  const effH = h - pad * 2
  const cy = h / 2 // Center Y

  // Map rate (0-127) to a visual number of cycles (1 to 8)
  const cycles = 1 + Math.floor((props.rate / 127) * 7)
  const cw = w / cycles

  switch (props.waveform) {
    case 0: // Saw (Ramp Up)
      let sawPts = []
      for(let c = 0; c < cycles; c++) {
        sawPts.push(`${c * cw},${h - pad}`)
        sawPts.push(`${(c + 1) * cw},${pad}`)
      }
      return sawPts.join(' ')
      
    case 1: // Reverse Saw (Ramp Down)
      let rsawPts = []
      for(let c = 0; c < cycles; c++) {
        rsawPts.push(`${c * cw},${pad}`)
        rsawPts.push(`${(c + 1) * cw},${h - pad}`)
      }
      return rsawPts.join(' ')
      
    case 2: // Sine (Multi period)
      let sinePts = []
      for (let i = 0; i <= 100; i++) {
        const x = (i / 100) * w
        const y = cy - Math.sin((i / 100) * Math.PI * 2 * cycles) * (effH / 2)
        sinePts.push(`${x},${y}`)
      }
      return sinePts.join(' ')
      
    case 3: // Pulse / Square
      let pulsePts = []
      for(let c = 0; c < cycles; c++) {
        const sx = c * cw
        const mx = sx + cw / 2
        const ex = (c + 1) * cw
        pulsePts.push(`${sx},${pad}`, `${mx},${pad}`)
        pulsePts.push(`${mx},${h - pad}`, `${ex},${h - pad}`)
      }
      return pulsePts.join(' ')
      
    case 4: // Random / Sample & Hold (Stepped)
      let shPts = []
      const steps = cycles * 3
      const stepW = w / steps
      for (let i = 0; i < steps; i++) {
        const r = Math.abs((Math.sin((i + 1) * 13.9898) * 43758.5453) % 1)
        const valY = pad + r * effH
        shPts.push(`${i * stepW},${valY}`)
        shPts.push(`${(i + 1) * stepW},${valY}`)
      }
      return shPts.join(' ')
      
    case 5: // Noise
      let noisePts = []
      const res = 64 + cycles * 16 // Increase density with higher rates
      for (let i = 0; i <= res; i++) {
        const x = (i / res) * w
        const r = Math.abs((Math.sin(i * 13.9898) * 43758.5453) % 1)
        const y = pad + r * effH
        noisePts.push(`${x},${y}`)
      }
      return noisePts.join(' ')
      
    default: // Flatline fallback
      return `0,${cy} ${w},${cy}`
  }
})
</script>

<style scoped>
.waveform-container {
  position: relative;
  background: #111;
  border-radius: 6px;
  overflow: hidden;
  box-shadow: inset 0 0 8px rgba(0,0,0,0.5);
  border: 1px solid #333;
  display: flex;
  align-items: center;
}

.waveform-bg {
  fill: #000000;
}
</style>