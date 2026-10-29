<script setup>
// The DECK's FM-1 view: the emulator's LCD mirrored from the FM-1 Emulator panel (which owns the
// iframe and must stay open — minimized is fine) and its controls, sent through the panel's
// bridge as if turned by hand. Encoders: click − / +, or scroll over them. Buttons: held while
// pressed, like the device's own.
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Cpu, X, ExternalLink, Minus, Plus } from 'lucide-vue-next'
import { useUiStore } from '@/stores/useUiStore'
import { FM1_FIRMWARES, fm1Parts } from '@/lib/fm1-firmwares'
import { FM1_CONTROLS } from '@/lib/fm1-controls'
import { FM1_PANEL_ID, FM1_LCD_SIZE, fm1Firmware, fm1Stats, fm1Lcd, fm1Post, watchFm1Lcd, rgb565ToRgba } from '@/lib/fm1-bridge'

const emit = defineEmits(['close'])
const uiStore = useUiStore()

const encoders = FM1_CONTROLS.filter(c => c.target.kind === 'enc')
const buttons = FM1_CONTROLS.filter(c => c.target.kind === 'key')

const parts = computed(() => fm1Parts(fm1Firmware.value).map(ch => ch + 1))

// ── LCD ─────────────────────────────────────────────────────────────────
const canvas = ref(null)
let img = null
function paint(lcd) {
  const ctx = canvas.value?.getContext('2d')
  if (!ctx || !lcd || lcd.length !== FM1_LCD_SIZE * FM1_LCD_SIZE) return
  img ??= ctx.createImageData(FM1_LCD_SIZE, FM1_LCD_SIZE)
  rgb565ToRgba(lcd, img.data)
  ctx.putImageData(img, 0, 0)
}
watch(fm1Lcd, paint)

let stopLcd = null
onMounted(() => {
  stopLcd = watchFm1Lcd()
  paint(fm1Lcd.value)
})

// ── Controls ────────────────────────────────────────────────────────────
function turn(index, clicks) {
  fm1Post({ type: 'sycore-ctl', kind: 'enc', index, clicks })
}
function onWheel(index, e) {
  turn(index, e.deltaY < 0 ? 1 : -1)
}

const held = ref(new Set())
function press(id, down) {
  if (held.value.has(id) === down) return
  const next = new Set(held.value)
  if (down) next.add(id); else next.delete(id)
  held.value = next
  fm1Post({ type: 'sycore-ctl', kind: 'key', id, down })
}

// The device's MASTER pot (0..1023). The page doesn't report its position, so this starts
// unknown and only sends once moved.
const master = ref(null)
function setMaster(v) {
  master.value = v
  fm1Post({ type: 'sycore-ctl', kind: 'pot', value: v })
}

const pct = (v) => (Number.isFinite(v) ? `${Math.round(v * 100)}%` : '…')
const loadClass = (load) =>
  !Number.isFinite(load) ? 'text-neutral-500' : load > 0.95 ? 'text-red-400' : load > 0.75 ? 'text-amber-400' : 'text-emerald-400'

function openPanel() {
  uiStore.openPanel(FM1_PANEL_ID)
}

onUnmounted(() => {
  for (const id of held.value) fm1Post({ type: 'sycore-ctl', kind: 'key', id, down: false })
  stopLcd?.()
})
</script>

<template>
  <div class="flex flex-col h-full min-h-0 text-[9px] font-mono">
    <div class="flex items-center justify-between gap-2 shrink-0 mb-1.5">
      <span class="flex items-center gap-1.5 text-cyan-400 font-black uppercase tracking-widest text-[10px]">
        <Cpu class="w-3 h-3" /> FM-1
      </span>
      <div class="flex items-center gap-1 min-w-0">
        <select v-model="fm1Firmware" title="Firmware (reboots the emulator)"
          class="bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5 text-[9px] text-neutral-200 max-w-[140px]"
        >
          <option v-for="f in FM1_FIRMWARES" :key="f.id" :value="f.id">{{ f.name }}</option>
        </select>
        <button @click="openPanel" title="Open FM-1 Emulator"
          class="p-1 rounded border border-neutral-700 text-neutral-400 hover:text-synth-neon hover:border-synth-neon/50 transition-colors"
        >
          <ExternalLink class="w-3 h-3" />
        </button>
        <button @click="emit('close')" title="Back"
          class="p-1 rounded border border-neutral-700 text-neutral-400 hover:text-rose-400 hover:border-rose-500/50 transition-colors"
        >
          <X class="w-3 h-3" />
        </button>
      </div>
    </div>

    <div class="flex-1 min-h-0 flex gap-2">
      <!-- LCD: the display's height, at most its native 240 px (scaled up it gets grainy);
           smooth scaling when smaller, so no pixel rows are dropped from the characters -->
      <div class="h-full max-h-[240px] aspect-square shrink-0 rounded border-2 border-neutral-900 bg-black relative overflow-hidden">
        <canvas ref="canvas" :width="FM1_LCD_SIZE" :height="FM1_LCD_SIZE" class="w-full h-full" />
        <span v-if="!fm1Lcd" class="absolute inset-0 flex items-center justify-center text-center px-2 text-neutral-600">
          {{ fm1Stats ? 'waiting for the screen…' : 'click the device in the FM-1 panel to start' }}
        </span>
      </div>

      <div class="flex-1 min-w-0 flex flex-col gap-1.5 overflow-y-auto custom-scrollbar">
      <div class="flex items-center gap-2 text-neutral-500">
        <span>load <span :class="loadClass(fm1Stats?.load)">{{ pct(fm1Stats?.load) }}</span></span>
        <span>CH {{ parts.join(',') }}</span>
        <span v-if="fm1Stats?.halted" class="text-red-400">CPU halted</span>
      </div>

      <!-- Encoders -->
      <div class="flex flex-wrap gap-1">
        <div v-for="c in encoders" :key="c.id" @wheel.prevent="onWheel(c.target.index, $event)"
          class="flex items-center gap-0.5 rounded border border-neutral-800 bg-neutral-950/60 px-0.5 py-0.5"
          :title="c.label + ': click − / + or scroll'"
        >
          <button @click="turn(c.target.index, -1)" class="p-0.5 rounded text-neutral-400 hover:text-cyan-300 hover:bg-white/5"><Minus class="w-2.5 h-2.5" /></button>
          <span class="w-14 text-center text-neutral-300 truncate">{{ c.label }}</span>
          <button @click="turn(c.target.index, 1)" class="p-0.5 rounded text-neutral-400 hover:text-cyan-300 hover:bg-white/5"><Plus class="w-2.5 h-2.5" /></button>
        </div>
      </div>

      <!-- Buttons -->
      <div class="flex flex-wrap gap-1">
        <button v-for="c in buttons" :key="c.id"
          @pointerdown.prevent="e => { e.currentTarget.setPointerCapture(e.pointerId); press(c.target.id, true) }"
          @pointerup="press(c.target.id, false)"
          @pointercancel="press(c.target.id, false)"
          class="w-11 py-1 rounded border font-bold uppercase transition-colors select-none"
          :class="held.has(c.target.id)
            ? 'bg-cyan-600/40 border-cyan-400 text-white'
            : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-white'"
        >{{ c.label }}</button>
      </div>

      <!-- MASTER -->
      <label class="flex items-center gap-2 text-neutral-500 pb-1" title="The device's MASTER knob">
        MASTER
        <input type="range" min="0" max="1023" step="1" :value="master ?? 512"
          @input="setMaster(Number($event.target.value))"
          class="flex-1 accent-cyan-400 h-1" :class="master == null ? 'opacity-50' : ''"
        />
      </label>
      </div>
    </div>
  </div>
</template>
