<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  min:        { type: Number, default: 0 },
  max:        { type: Number, default: 1 },
  step:       { type: Number, default: 0 },
  defaultVal: { type: Number, default: null },
  size:       { type: Number, default: 34 },
  label:      { type: String, default: '' },
  color:      { type: String, default: '#7c3aed' },
  format:     { type: Function, default: null },
})
const emit = defineEmits(['update:modelValue', 'change'])

const START = -135
const SWEEP = 270
const cx = computed(() => props.size / 2)
const cy = computed(() => props.size / 2)
const R  = computed(() => props.size / 2 - 3)

function pxy(deg, r) {
  const rad = (deg - 90) * Math.PI / 180
  return [cx.value + Math.cos(rad) * r, cy.value + Math.sin(rad) * r]
}

function arc(fromDeg, toDeg) {
  const [sx, sy] = pxy(fromDeg, R.value)
  const [ex, ey] = pxy(toDeg, R.value)
  return `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${R.value} ${R.value} 0 ${toDeg - fromDeg > 180 ? 1 : 0} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`
}

const valDeg   = computed(() => START + ((props.modelValue - props.min) / (props.max - props.min)) * SWEEP)
const trackD   = computed(() => arc(START, START + SWEEP))
const fillD    = computed(() => valDeg.value > START ? arc(START, valDeg.value) : '')
const needle   = computed(() => {
  const [x2, y2] = pxy(valDeg.value, R.value - 1.5)
  return { x2, y2 }
})
const displayVal = computed(() => {
  if (props.format) return props.format(props.modelValue)
  const v = props.modelValue
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`
  return Number.isInteger(v) ? `${v}` : v.toFixed(2)
})

function clamp(v) { return Math.max(props.min, Math.min(props.max, v)) }
function snap(v)  { const s = props.step; return s > 0 ? Math.round(v / s) * s : v }
function set(v)   { const n = snap(clamp(v)); emit('update:modelValue', n); emit('change', n) }

let y0 = 0, v0 = 0
function down(e) {
  e.preventDefault()
  y0 = e.clientY; v0 = props.modelValue
  const move = ev => set(v0 + ((y0 - ev.clientY) / 150) * (props.max - props.min))
  const up   = ()  => { removeEventListener('mousemove', move); removeEventListener('mouseup', up) }
  addEventListener('mousemove', move)
  addEventListener('mouseup', up)
}
</script>

<template>
  <div
    class="flex flex-col items-center gap-0.5 select-none cursor-ns-resize"
    @mousedown="down"
    @dblclick.stop="set(defaultVal ?? min)"
    @wheel.prevent="e => set(modelValue + (e.deltaY < 0 ? 1 : -1) * (step || (max - min) / 100))"
  >
    <svg :width="size" :height="size">
      <path :d="trackD" fill="none" stroke="#3f3f46" stroke-width="2.5" stroke-linecap="round"/>
      <path v-if="fillD" :d="fillD" fill="none" :stroke="color" stroke-width="2.5" stroke-linecap="round"/>
      <line :x1="cx" :y1="cy" :x2="needle.x2" :y2="needle.y2" :stroke="color" stroke-width="1.5" stroke-linecap="round"/>
      <circle :cx="cx" :cy="cy" r="2.5" fill="#52525b"/>
    </svg>
    <span v-if="label" class="text-[9px] text-violet-500 font-mono leading-none">{{ label }}</span>
    <span class="text-[9px] text-neutral-400 font-mono leading-none">{{ displayVal }}</span>
  </div>
</template>
