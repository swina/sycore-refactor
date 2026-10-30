<script setup>
// The DECK's FM-1 view: the device's front panel as the emulator draws it, without the keyboard —
// MASTER / SELECT / PRESETS / ALGORITHM and OCT−/+ on the left, the LCD (mirrored from the FM-1
// Emulator panel, which owns the iframe and must stay open — minimized is fine) in the middle,
// KNOB1–4 and the 12 buttons on the right. Everything goes through the panel's bridge as if
// turned by hand. Encoders: drag up / down or scroll (endless, as on the device). MASTER: drag
// or scroll. Buttons: held while pressed, like the device's own.
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Cpu, X, ExternalLink } from 'lucide-vue-next'
import { useUiStore } from '@/stores/useUiStore'
import { FM1_FIRMWARES, fm1Parts } from '@/lib/fm1-firmwares'
import { FM1_CONTROLS } from '@/lib/fm1-controls'
import { FM1_PANEL_ID, FM1_LCD_SIZE, fm1Firmware, fm1Stats, fm1Lcd, fm1Post, watchFm1Lcd, rgb565ToRgba } from '@/lib/fm1-bridge'

const emit = defineEmits(['close'])
const uiStore = useUiStore()

const enc = (label) => FM1_CONTROLS.find(c => c.target.kind === 'enc' && c.label === label)
const key = (label) => FM1_CONTROLS.find(c => c.target.kind === 'key' && c.label === label)

// the device's own layout (fm1-emu's panel)
const leftEncoders = [[enc('SELECT')], [enc('PRESETS'), enc('ALGORITHM')]]
const knobs = ['K1', 'K2', 'K3', 'K4'].map((l, i) => ({ ...enc(l), label: `KNOB${i + 1}` }))
const octKeys = [key('OCT−'), key('OCT+')]
const buttonRows = [
  ['FX', 'SCL', 'ENV', 'LFO', 'EDIT', 'GLO'].map(key),
  ['HOME', 'SAVE', 'ARP', 'SEQ', 'PLAY', 'REC'].map(key),
]

const parts = computed(() => fm1Parts(fm1Firmware.value).map(ch => ch + 1))
const firmwareName = computed(() => FM1_FIRMWARES.find(f => f.id === fm1Firmware.value)?.name ?? '')

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

// ── Encoders (endless): the pointer only shows the turns made here ─────────
const ENC_STEP_PX = 6      // drag distance per click
const ENC_STEP_DEG = 15    // pointer turn per click
const encAngle = ref({})
function turn(index, clicks) {
  if (!clicks) return
  encAngle.value = { ...encAngle.value, [index]: ((encAngle.value[index] ?? 0) + clicks * ENC_STEP_DEG) % 360 }
  fm1Post({ type: 'sycore-ctl', kind: 'enc', index, clicks })
}
function onEncWheel(index, e) {
  turn(index, e.deltaY < 0 ? 1 : -1)
}
function dragEncoder(index, e) {
  const el = e.currentTarget
  el.setPointerCapture(e.pointerId)
  let lastY = e.clientY
  const move = (ev) => {
    const clicks = Math.trunc((lastY - ev.clientY) / ENC_STEP_PX)
    if (clicks) { lastY -= clicks * ENC_STEP_PX; turn(index, clicks) }
  }
  const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up) }
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
}

// ── MASTER pot (0..1023, a 270° sweep). The page doesn't report its position, so it starts
// unknown (drawn at noon, dimmed) and only sends once moved. ──
const master = ref(null)
function setMaster(v) {
  master.value = Math.max(0, Math.min(1023, Math.round(v)))
  fm1Post({ type: 'sycore-ctl', kind: 'pot', value: master.value })
}
const masterAngle = computed(() => ((master.value ?? 512) / 1023) * 270 - 135)
function onMasterWheel(e) {
  setMaster((master.value ?? 512) + (e.deltaY < 0 ? 32 : -32))
}
function dragMaster(e) {
  const el = e.currentTarget
  el.setPointerCapture(e.pointerId)
  let lastY = e.clientY
  const move = (ev) => { setMaster((master.value ?? 512) + (lastY - ev.clientY) * 6); lastY = ev.clientY }
  const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up) }
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
}

// ── Buttons ─────────────────────────────────────────────────────────────
const held = ref(new Set())
function press(id, down) {
  if (held.value.has(id) === down) return
  const next = new Set(held.value)
  if (down) next.add(id); else next.delete(id)
  held.value = next
  fm1Post({ type: 'sycore-ctl', kind: 'key', id, down })
}
function pressDown(id, e) {
  e.currentTarget.setPointerCapture(e.pointerId)
  press(id, true)
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
  <!-- Shown in the DECK's center column at the Virtual Device view's size (same chrome as VirtualDeviceView) -->
  <div class="flex flex-col min-h-0 max-h-full font-mono">
    <!-- Header -->
    <div class="flex items-center justify-between gap-3 px-4 py-2 bg-gradient-to-b from-white/5 to-transparent shrink-0 select-none">
      <div class="flex items-center gap-3 min-w-0">
        <div class="p-1.5 bg-cyan-500/20 rounded-lg border border-cyan-500/20">
          <Cpu class="w-4 h-4 text-cyan-300" />
        </div>
        <h2 class="text-sm font-black text-white tracking-[0.1em] uppercase whitespace-nowrap">FM-1</h2>
        <span class="text-[10px] text-neutral-500 whitespace-nowrap">
          load <span :class="loadClass(fm1Stats?.load)">{{ pct(fm1Stats?.load) }}</span>
          · CH {{ parts.join(',') }}
          <span v-if="fm1Stats?.halted" class="text-red-400">· CPU halted</span>
        </span>
      </div>
      <div class="flex items-center gap-2">
        <select v-model="fm1Firmware" title="Firmware (reboots the emulator)"
          class="bg-neutral-900 border border-white/10 rounded px-2 py-1 text-[11px] text-white font-mono max-w-[200px]"
        >
          <option v-for="f in FM1_FIRMWARES" :key="f.id" :value="f.id">{{ f.name }}</option>
        </select>
        <button @click="openPanel" title="Open FM-1 Emulator"
          class="p-1.5 rounded hover:bg-white/10 text-neutral-400 hover:text-white"
        >
          <ExternalLink class="w-3.5 h-3.5" />
        </button>
        <button @click="emit('close')" title="Back to the DECK display"
          class="p-1.5 rounded hover:bg-white/10 text-neutral-400 hover:text-rose-400"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <div class="flex-1 min-h-0 overflow-auto custom-scrollbar px-3 pb-3">
      <!-- Front panel, keyboard left out -->
      <div class="fm1-face mx-auto w-fit flex items-start gap-4 rounded-2xl px-5 py-4 select-none">
        <!-- Left: MASTER, SELECT / PRESETS, ALGORITHM, OCT −/+ -->
        <div class="flex flex-col gap-4 pt-1">
          <div class="grid grid-cols-2 gap-x-5 gap-y-3">
            <div class="flex flex-col items-center gap-1" title="MASTER (volume): drag up / down or scroll">
              <span class="fm1-label">MASTER</span>
              <div class="fm1-knob w-[60px] h-[60px]" :class="master == null ? 'opacity-70' : ''"
                @pointerdown.prevent="dragMaster" @wheel.prevent="onMasterWheel">
                <div class="fm1-cap"><div class="fm1-pointer" :style="{ transform: `rotate(${masterAngle}deg)` }" /></div>
              </div>
            </div>
            <template v-for="(row, r) in leftEncoders" :key="r">
              <div v-for="c in row" :key="c.id" class="flex flex-col items-center gap-1" :title="c.label + ': drag up / down or scroll'">
                <span class="fm1-label">{{ c.label }}</span>
                <div class="fm1-knob w-[60px] h-[60px]"
                  @pointerdown.prevent="dragEncoder(c.target.index, $event)" @wheel.prevent="onEncWheel(c.target.index, $event)">
                  <div class="fm1-cap"><div class="fm1-pointer" :style="{ transform: `rotate(${encAngle[c.target.index] ?? 0}deg)` }" /></div>
                </div>
              </div>
            </template>
          </div>
          <div class="fm1-well flex gap-1.5 p-1.5">
            <button v-for="c in octKeys" :key="c.id"
              @pointerdown.prevent="pressDown(c.target.id, $event)" @pointerup="press(c.target.id, false)" @pointercancel="press(c.target.id, false)"
              class="fm1-btn w-[72px] h-7" :class="held.has(c.target.id) ? 'fm1-btn-on' : ''"
            >{{ c.label }}</button>
          </div>
        </div>

        <!-- LCD at its native 240 px (scaled up it gets grainy) -->
        <div class="flex flex-col items-center gap-1">
          <div class="rounded-xl bg-neutral-950 p-2.5 shadow-inner">
            <div class="w-[240px] h-[240px] bg-black relative overflow-hidden">
              <canvas ref="canvas" :width="FM1_LCD_SIZE" :height="FM1_LCD_SIZE" class="w-full h-full" />
              <span v-if="!fm1Lcd" class="absolute inset-0 flex items-center justify-center text-center px-4 text-[11px] text-neutral-600">
                {{ fm1Stats ? 'waiting for the screen…' : 'click the device in the FM-1 panel to start' }}
              </span>
            </div>
          </div>
          <span class="text-[8px] tracking-widest text-neutral-400/80 uppercase">FM-1 · {{ firmwareName }}</span>
        </div>

        <!-- Right: KNOB1–4, then the 12 buttons -->
        <div class="flex flex-col gap-4">
          <div class="flex gap-3">
            <div v-for="c in knobs" :key="c.id" class="flex flex-col items-center gap-1" :title="c.label + ': drag up / down or scroll'">
              <span class="fm1-label">{{ c.label }}</span>
              <div class="fm1-knob w-[50px] h-[50px]"
                @pointerdown.prevent="dragEncoder(c.target.index, $event)" @wheel.prevent="onEncWheel(c.target.index, $event)">
                <div class="fm1-cap"><div class="fm1-pointer" :style="{ transform: `rotate(${encAngle[c.target.index] ?? 0}deg)` }" /></div>
              </div>
            </div>
          </div>
          <div class="fm1-well grid grid-cols-6 gap-1 p-1.5">
            <template v-for="(row, r) in buttonRows" :key="r">
              <button v-for="c in row" :key="c.id"
                @pointerdown.prevent="pressDown(c.target.id, $event)" @pointerup="press(c.target.id, false)" @pointercancel="press(c.target.id, false)"
                class="fm1-btn w-[38px] h-11" :class="held.has(c.target.id) ? 'fm1-btn-on' : ''"
              >{{ c.label }}</button>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fm1-face {
  background: linear-gradient(#5d6066, #50535a);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 4px 16px rgba(0, 0, 0, 0.5);
}
.fm1-label {
  font-size: 11px;
  letter-spacing: 0.05em;
  color: #e5e7eb;
  line-height: 1;
}
.fm1-knob {
  border-radius: 9999px;
  padding: 5px;
  cursor: ns-resize;
  touch-action: none;
  background: repeating-conic-gradient(#2a2b2f 0deg 6deg, #3b3d42 6deg 12deg);
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.5);
}
.fm1-cap {
  width: 100%;
  height: 100%;
  border-radius: 9999px;
  background: radial-gradient(circle at 35% 30%, #5b5e66, #2f3136 75%);
  position: relative;
}
.fm1-pointer {
  position: absolute;
  inset: 0;
}
.fm1-pointer::after {
  content: '';
  position: absolute;
  left: calc(50% - 1px);
  top: 12%;
  width: 2px;
  height: 34%;
  border-radius: 1px;
  background: #f4f4f5;
}
.fm1-well {
  border-radius: 8px;
  background: #2b2c30;
}
.fm1-btn {
  border-radius: 4px;
  background: linear-gradient(#5f6269, #50535a);
  color: #d4d4d8;
  font-size: 11px;
  touch-action: none;
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.45);
  transition: background 80ms;
}
.fm1-btn:hover {
  color: #fff;
}
.fm1-btn-on {
  background: linear-gradient(#0e7490, #155e75);
  color: #fff;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.6);
}
</style>
