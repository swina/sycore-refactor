<script setup>
// FM-1 emulator (github.com/joakimeriksson/fm1-emu, MIT) embedded as an iframe — a first
// evaluation step to check latency and MIDI behaviour before a native AudioWorklet integration.
// The emulator page owns its audio (own AudioContext, not routed through SY.CORE's mixer). It is
// served from our own origin (public/fm1), so while this panel is open it is registered as the
// virtual MIDI output "FM-1 Emulator": route SY.CORE apps to it in MIDI Flow and their notes go
// straight in with postMessage (no loopMIDI). The page reports its load once a second.
// MIDI learn (lib/fm1-controls.ts) maps CCs/notes from any input to the device's own encoders,
// MASTER and buttons, so a controller drives any firmware whatever MIDI it implements.
// Firmware, figures and LCD are shared with the DECK's FM-1 view through lib/fm1-bridge.ts.
import { ref, watch, onUnmounted } from 'vue'
import { Cpu, RefreshCw, ExternalLink, SlidersHorizontal, X } from 'lucide-vue-next'
import { useUiStore } from '@/stores/useUiStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import MacOsButtons from '@/components/ui/MacOsButtons.vue'
import { FM1_FIRMWARES, FM1_EMU_URL, fm1EmbedUrl, fm1Parts } from '@/lib/fm1-firmwares'
import { FM1_OUTPUT, FM1_PANEL_ID, fm1Firmware, fm1Stats, fm1Lcd, setFm1Poster, fm1LcdWanted, fm1RemapChannel } from '@/lib/fm1-bridge'
import { FM1_CONTROLS, ENC_MODES, Fm1ControlMapper, findMapping, midiSource, describeMapping } from '@/lib/fm1-controls'
import { midiService } from '@/core/midi/midi-service'

const STORAGE_MAP = 'SYCORE_FM1_MIDI_MAP'
const FM1_VIRTUAL_OUTPUT = FM1_OUTPUT

const emit = defineEmits(['close'])
const uiStore = useUiStore()

const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront, maximize } = useDraggableResizable({
  storageKey: 'SYCORE_POS_FM1_EMULATOR',
  minimizeLabel: 'FM-1 Emulator',
  initialWidth: 760,
  initialHeight: 640,
  minWidth: 420,
  minHeight: 400,
  zIndex: 160,
  panelId: FM1_PANEL_ID,
})

const firmware = fm1Firmware
// bumping the key remounts the iframe: a clean reboot of the emulator
const reloadKey = ref(0)

// While dragging/resizing, the iframe would swallow the mouse events once the
// pointer crosses it: disable its pointer events until the button is released.
const interacting = ref(false)
function endInteract() { interacting.value = false }
function startDrag(e) { interacting.value = true; onDragStart(e) }
function startResize(e, dir) { interacting.value = true; onResizeStart(e, dir) }
window.addEventListener('mouseup', endInteract)

// ── MIDI bridge: SY.CORE routing → emulator ──────────────────────────────
const frame = ref(null)
const midiStore = useMidiStore()
let sentCount = 0
const sent = ref(0)

function post(m) {
  frame.value?.contentWindow?.postMessage(m, location.origin)
}

function sendToEmulator(data) {
  // a mapped CC/note drives a panel control (raw listener below), it does not also reach the
  // firmware's MIDI IN — a note mapped to PLAY must not sound too
  if (findMapping(mappings.value, data)) return
  post({ type: 'sycore-midi', bytes: fm1RemapChannel(Array.from(data), fm1Parts(firmware.value)) })
  if (data[0] < 0xf8) sentCount++
}

midiStore.registerPanelOutput(FM1_VIRTUAL_OUTPUT, sendToEmulator, FM1_PANEL_ID)
setFm1Poster(post)

// A firmware whose parts listen on several channels is marked multi-timbral (Program Change,
// timeline). Routing to FM-1 still applies the node's OUT ch: leave it "as sent" to reach every
// part, set it to pick one.
watch(firmware, (id) => {
  midiStore.updateRegistration(FM1_VIRTUAL_OUTPUT, 'isMulti', fm1Parts(id).length > 1)
}, { immediate: true })

// ── MIDI learn → panel controls ──────────────────────────────────────────
function readMappings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_MAP) || '[]') } catch { return [] }
}
const mappings = ref(readMappings())
watch(mappings, (v) => {
  try { localStorage.setItem(STORAGE_MAP, JSON.stringify(v)) } catch {}
}, { deep: true })

const showControls = ref(false)
const learning = ref(null)          // control id waiting for a CC / note
const mapper = new Fm1ControlMapper(() => mappings.value, (control, mode) => {
  const m = mappingFor(control)
  if (m) m.mode = mode
})

const mappingFor = (id) => mappings.value.find(m => m.control === id)

function toggleLearn(id) {
  learning.value = learning.value === id ? null : id
}

function clearMapping(id) {
  mappings.value = mappings.value.filter(m => m.control !== id)
  mapper.reset()
}

function setMappingField(id, field, value) {
  const m = mappingFor(id)
  if (m) m[field] = value
  mapper.reset()
}

const unsubRaw = midiService.addRawListener((event) => {
  const data = event.data
  if (!data) return
  if (learning.value) {
    const s = midiSource(data)
    if (!s || (s.type === 'note' && !s.on)) return
    const control = learning.value
    // one source drives one control: drop the source's old use and this control's old source
    const next = mappings.value.filter(m =>
      m.control !== control && !(m.type === s.type && m.channel === s.channel && m.number === s.number))
    const isEnc = control.startsWith('enc:')
    next.push({ control, type: s.type, channel: s.channel, number: s.number, ...(isEnc && s.type === 'cc' ? { mode: 'auto', div: 2 } : {}) })
    mappings.value = next
    learning.value = null
    mapper.reset()
    return
  }
  const action = mapper.handle(data)
  if (action) post({ type: 'sycore-ctl', ...action })
})

// ── Performance figures posted by the emulator page (public/fm1/main.js) ─
const stats = fm1Stats
function onFrameMessage(e) {
  if (e.origin !== location.origin || e.source !== frame.value?.contentWindow) return
  const type = e.data?.type
  if (type === 'fm1-lcd') {
    if (fm1LcdWanted()) fm1Lcd.value = e.data.lcd
  } else if (type === 'fm1-ready') {
    // a (re)loaded page: ask again for the LCD if the DECK shows it
    if (fm1LcdWanted()) post({ type: 'sycore-lcd', on: true })
  } else if (type === 'fm1-stats') {
    stats.value = e.data
    sent.value = sentCount
    sentCount = 0
  }
}
window.addEventListener('message', onFrameMessage)
watch([firmware, reloadKey], () => { stats.value = null; fm1Lcd.value = null })

const pct = (v) => (Number.isFinite(v) ? `${Math.round(v * 100)}%` : '…')
const ms = (v) => (Number.isFinite(v) ? `${Math.round(v * 1000)} ms` : '?')
function loadClass(load) {
  if (!Number.isFinite(load)) return 'text-neutral-400'
  return load > 0.95 ? 'text-red-400' : load > 0.75 ? 'text-amber-400' : 'text-emerald-400'
}

onUnmounted(() => {
  window.removeEventListener('mouseup', endInteract)
  window.removeEventListener('message', onFrameMessage)
  midiStore.unregisterPanelOutput(FM1_VIRTUAL_OUTPUT)
  setFm1Poster(null)
  stats.value = null
  fm1Lcd.value = null
  unsubRaw()
})
</script>

<template>
  <div class="bg-neutral-950 border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden relative" :style="panelStyle" v-show="!isMinimized" @mousedown.capture="bringToFront">
    <!-- Header -->
    <div class="flex items-center justify-between gap-3 px-4 py-2 bg-gradient-to-b from-white/5 to-transparent shrink-0 cursor-grab active:cursor-grabbing select-none" @mousedown="startDrag">
      <div class="flex items-center gap-3 min-w-0">
        <div class="p-1.5 bg-cyan-500/20 rounded-lg border border-cyan-500/20">
          <Cpu class="w-4 h-4 text-cyan-400" />
        </div>
        <h2 class="text-sm font-black text-white tracking-[0.1em] uppercase whitespace-nowrap">FM-1 Emulator</h2>
        <span class="bg-amber-400/70 text-[8px] rounded font-mono px-2 text-black">BETA</span>
      </div>

      <div class="flex items-center gap-2" @mousedown.stop>
        <select
          v-model="firmware"
          class="bg-neutral-900 border border-white/10 rounded px-2 py-1 text-[11px] text-white font-mono max-w-[180px]"
          title="Firmware"
        >
          <option v-for="f in FM1_FIRMWARES" :key="f.id" :value="f.id">{{ f.name }}</option>
        </select>
        <button
          class="p-1.5 rounded hover:bg-white/10"
          :class="showControls ? 'text-cyan-400' : 'text-neutral-400 hover:text-white'"
          title="MIDI controls: map CCs / notes to the device's knobs and buttons"
          @click="showControls = !showControls; learning = null"
        >
          <SlidersHorizontal class="w-3.5 h-3.5" />
        </button>
        <button class="p-1.5 rounded hover:bg-white/10 text-neutral-400 hover:text-white" title="Reboot emulator" @click="reloadKey++">
          <RefreshCw class="w-3.5 h-3.5" />
        </button>
        <a :href="FM1_EMU_URL" target="_blank" rel="noopener" class="p-1.5 rounded hover:bg-white/10 text-neutral-400 hover:text-white" title="Open full emulator page">
          <ExternalLink class="w-3.5 h-3.5" />
        </a>
        <MacOsButtons @close="emit('close')" @minimize="toggleMinimize" @maximize="maximize" />
      </div>
    </div>

    <div class="px-4 pb-2 text-[10px] text-neutral-500 shrink-0">
      Click the device to start audio. While this panel is open, route SY.CORE apps and controllers to the <span class="text-neutral-300">{{ FM1_VIRTUAL_OUTPUT }}</span> output in MIDI Flow (the emulator's own MIDI input is off here). Audio does not pass through the SY.CORE mixer.
    </div>

    <div class="px-4 pb-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono shrink-0" title="Load: share of the audio thread the emulator takes (over 100%: the sound breaks up). Drift: how far the audio clock falls behind the wall clock. Latency: the emulator's AudioContext base + output latency.">
      <template v-if="stats">
        <span>load <span :class="loadClass(stats.load)">{{ pct(stats.load) }}</span></span>
        <span class="text-neutral-400">speed {{ Number.isFinite(stats.speed) ? stats.speed.toFixed(1) + 'x' : '…' }}</span>
        <span :class="stats.drift > 0.02 ? 'text-red-400' : 'text-neutral-400'">drift {{ (stats.drift * 100).toFixed(1) }}%</span>
        <span class="text-neutral-400">worst quantum {{ Number.isFinite(stats.worst) ? stats.worst.toFixed(1) + ' ms' : '?' }}</span>
        <span class="text-neutral-400">latency {{ ms(stats.baseLatency) }} + {{ ms(stats.outputLatency) }} ({{ stats.latency }})</span>
        <span class="text-neutral-400">{{ stats.mhz }} MHz</span>
        <span class="text-neutral-400">MIDI in {{ sent }}/s</span>
        <span v-if="stats.halted" class="text-red-400">CPU halted</span>
      </template>
      <span v-else class="text-neutral-600">waiting for the emulator to start…</span>
    </div>

    <div v-if="showControls" class="mx-4 mb-2 border border-white/10 rounded-lg bg-neutral-900/60 shrink-0 max-h-[45%] overflow-y-auto" @mousedown.stop>
      <div class="px-3 py-1.5 text-[10px] text-neutral-500 border-b border-white/5">
        Click <span class="text-neutral-300">Learn</span>, then move a knob or press a key/pad on any MIDI input. Mapped CCs/notes drive the device's panel and are not sent to the firmware's MIDI IN.
      </div>
      <div
        v-for="c in FM1_CONTROLS"
        :key="c.id"
        class="flex items-center gap-2 px-3 py-1 text-[11px] font-mono border-b border-white/5 last:border-0"
      >
        <span class="w-16 text-white shrink-0">{{ c.label }}</span>
        <span class="flex-1 min-w-0 truncate" :class="mappingFor(c.id) ? 'text-cyan-300' : 'text-neutral-600'">
          {{ learning === c.id ? 'waiting for MIDI…' : (mappingFor(c.id) ? describeMapping(mappingFor(c.id)) : '—') }}
        </span>
        <template v-if="c.target.kind === 'enc' && mappingFor(c.id)?.type === 'cc'">
          <select
            :value="mappingFor(c.id).mode === 'rel' ? 'rel2c' : (mappingFor(c.id).mode ?? 'auto')"
            class="bg-neutral-950 border border-white/10 rounded px-1 py-0.5 text-[10px] text-white"
            title="auto: detects the encoder type · abs: knob 0..127 · rel 64 / rel 2c / rel sb: relative encoders"
            @change="e => setMappingField(c.id, 'mode', e.target.value)"
          >
            <option v-for="o in ENC_MODES" :key="o.value" :value="o.value" :title="o.title">{{ o.label }}</option>
          </select>
          <select
            v-if="['abs', 'auto'].includes(mappingFor(c.id).mode ?? 'auto')"
            :value="mappingFor(c.id).div ?? 2"
            class="bg-neutral-950 border border-white/10 rounded px-1 py-0.5 text-[10px] text-white"
            title="CC steps per encoder click (higher = slower)"
            @change="e => setMappingField(c.id, 'div', Number(e.target.value))"
          >
            <option v-for="d in [1, 2, 4, 8]" :key="d" :value="d">÷{{ d }}</option>
          </select>
        </template>
        <button
          class="px-2 py-0.5 rounded border text-[10px]"
          :class="learning === c.id ? 'border-amber-400 text-amber-300 animate-pulse' : 'border-white/10 text-neutral-300 hover:bg-white/10'"
          @click="toggleLearn(c.id)"
        >{{ learning === c.id ? 'Cancel' : 'Learn' }}</button>
        <button
          class="p-0.5 rounded text-neutral-500 hover:text-red-400 disabled:opacity-20"
          :disabled="!mappingFor(c.id)"
          title="Clear"
          @click="clearMapping(c.id)"
        ><X class="w-3 h-3" /></button>
      </div>
    </div>

    <iframe
      ref="frame"
      :key="`${firmware}-${reloadKey}`"
      :src="fm1EmbedUrl(firmware)"
      class="flex-1 w-full border-0 bg-black"
      :class="{ 'pointer-events-none': interacting }"
      allow="midi; autoplay"
      title="FM-1 Emulator"
    />

    <div @mousedown.stop="e => startResize(e, 'se')" class="absolute bottom-1 right-1 w-3 h-3 cursor-se-resize z-50 opacity-40 hover:opacity-80" style="background:radial-gradient(circle,#aaa 1px,transparent 1px) 0 0/3px 3px" />
  </div>
</template>
