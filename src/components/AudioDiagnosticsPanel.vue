<script setup>
// Audio Diagnostics: live timing of the audio engine, to tell apart the causes of
// "off-time" playback — output buffer latency, Tone.js lookahead, sounds reaching the
// engine after their scheduled time (main-thread stalls longer than the lookahead),
// shared Transport BPM overwritten by another sequencer, MIDI input waiting on the main thread.
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getContext, getTransport, getDraw } from 'tone'
import { Gauge, RotateCcw } from 'lucide-vue-next'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import MacOsButtons from '@/components/ui/MacOsButtons.vue'
import { useDrumMachineStore } from '@/stores/useDrumMachineStore'
import { useArpStore } from '@/stores/useArpStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { midiService } from '@/core/midi/midi-service'
import {
  getDiagnosticsSnapshot, resetDiagnostics, recordMidiIngress, recordStall, seriesAvg,
  recordLongFrameScripts, getTopHogs,
  callerFromStack, recordDrawRun, attributeDrawScript, getDrawByCaller,
} from '@/lib/audio-diagnostics'

const emit = defineEmits(['close'])
const drumStore = useDrumMachineStore()
const arpStore = useArpStore()
const midiStore = useMidiStore()

const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront, maximize } = useDraggableResizable({
  storageKey: 'SYCORE_POS_AUDIO_DIAGNOSTICS',
  minimizeLabel: 'Audio Diagnostics',
  initialWidth: 520,
  initialHeight: 620,
  minWidth: 400,
  minHeight: 360,
  zIndex: 160,
  panelId: 'audio-diagnostics',
})

const STALL_TICK_MS = 50
const audio = ref({})
const clock = ref({})
const stats = ref(getDiagnosticsSnapshot())
const hogs = ref([])
const drawCallers = ref([])
const loafSupported = typeof PerformanceObserver !== 'undefined' &&
  (PerformanceObserver.supportedEntryTypes || []).includes('long-animation-frame')

function poll() {
  const tctx = getContext()
  const raw = tctx.rawContext
  audio.value = {
    state: raw.state,
    sampleRate: raw.sampleRate,
    baseMs: raw.baseLatency != null ? raw.baseLatency * 1000 : null,
    outputMs: raw.outputLatency != null ? raw.outputLatency * 1000 : null,
    lookAheadMs: tctx.lookAhead * 1000,
  }
  const t = getTransport()
  clock.value = {
    transportBpm: t.bpm.value,
    transportState: t.state,
    drumBpm: drumStore.bpm,
    drumPlaying: drumStore.isPlaying,
    globalBpm: arpStore.arpBpm,
  }
  stats.value = getDiagnosticsSnapshot()
  hogs.value = getTopHogs()
  drawCallers.value = getDrawByCaller()
  updateMidiRate()
}

// Long Animation Frames: who kept the main thread busy. Rendering (style/layout/paint)
// has no script entry, so it's added as a pseudo-script from the frame's render phase.
let _loafObserver = null
function onLongFrames(list) {
  for (const f of list.getEntries()) {
    const scripts = (f.scripts || []).map(sc => ({
      invoker: sc.invoker,
      sourceFunctionName: sc.sourceFunctionName,
      sourceURL: sc.sourceURL,
      duration: sc.duration,
    }))
    for (const sc of f.scripts || []) {
      if (sc.sourceFunctionName === '_drawLoop') attributeDrawScript(sc.startTime, sc.duration)
    }
    if (f.renderStart > 0) {
      scripts.push({ invoker: 'Rendering', sourceFunctionName: 'style / layout / paint', sourceURL: '', duration: f.startTime + f.duration - f.renderStart })
    }
    recordLongFrameScripts(scripts)
  }
}

// Main-thread stall probe: a timer due every STALL_TICK_MS; how late it fires is how long
// the main thread was busy. Only runs while the panel is open.
let _stallTimer = null
let _lastTick = 0
function stallTick() {
  const now = performance.now()
  recordStall(Math.max(0, now - _lastTick - STALL_TICK_MS))
  _lastTick = now
}

// incoming message rate, clock (0xF8) apart from everything else
let _inClock = 0
let _inOther = 0
let _clockByPort = new Map()
let _rateSince = performance.now()
const midiRate = ref({ clock: 0, other: 0, clockByPort: [] })
function updateMidiRate() {
  const now = performance.now()
  const secs = (now - _rateSince) / 1000
  if (secs < 1) return
  midiRate.value = {
    clock: _inClock / secs,
    other: _inOther / secs,
    clockByPort: [..._clockByPort].map(([name, n]) => ({ name, rate: n / secs })).sort((a, b) => b.rate - a.rate),
  }
  _inClock = 0
  _inOther = 0
  _clockByPort = new Map()
  _rateSince = now
}

// one clean clock = 24 pulses per quarter note
const expectedClockRate = computed(() => (midiStore.incomingBpm > 0 ? midiStore.incomingBpm * 24 / 60 : null))
const clockDuplicated = computed(() =>
  expectedClockRate.value != null && midiRate.value.clock > expectedClockRate.value * 1.5
)

function onRawMidi(e) {
  const status = e.data?.[0] ?? 0
  if (status === 0xf8) {
    _inClock++
    const port = e.target?.name || '?'
    _clockByPort.set(port, (_clockByPort.get(port) || 0) + 1)
  } else _inOther++
  // note-on with velocity > 0 only: clock/CC floods would drown the note figures
  if ((status & 0xf0) !== 0x90 || !(e.data[2] > 0)) return
  recordMidiIngress(performance.now() - e.timeStamp)
}

// Wrap Tone.Draw.schedule while open, to know who scheduled each callback.
let _draw = null
let _origSchedule = null
function wrapDraw() {
  _draw = getDraw()
  _origSchedule = _draw.schedule
  _draw.schedule = function (callback, time) {
    const caller = callerFromStack(new Error().stack)
    return _origSchedule.call(this, () => {
      const t0 = performance.now()
      try { callback() } finally { recordDrawRun(t0, caller, performance.now() - t0) }
    }, time)
  }
}
function unwrapDraw() {
  if (_draw && _origSchedule) _draw.schedule = _origSchedule
  _draw = null
  _origSchedule = null
}

let _pollTimer = null
let _offRaw = null
onMounted(() => {
  poll()
  _pollTimer = setInterval(poll, 500)
  _lastTick = performance.now()
  _stallTimer = setInterval(stallTick, STALL_TICK_MS)
  _offRaw = midiService.addRawListener(onRawMidi)
  wrapDraw()
  if (loafSupported) {
    _loafObserver = new PerformanceObserver(onLongFrames)
    _loafObserver.observe({ type: 'long-animation-frame', buffered: false })
  }
})
onUnmounted(() => {
  clearInterval(_pollTimer)
  clearInterval(_stallTimer)
  _offRaw?.()
  _loafObserver?.disconnect()
  unwrapDraw()
})

function reset() {
  resetDiagnostics()
  _lastTick = performance.now()
  poll()
}

const fmt = (v, d = 1) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(d))

const outputTotalMs = computed(() => {
  const { baseMs, outputMs } = audio.value
  if (baseMs == null && outputMs == null) return null
  return (baseMs ?? 0) + (outputMs ?? 0)
})

// Live MIDI → sound: waiting on the main thread + output buffer. Paths that trigger at
// Tone.now() instead of immediately also add the whole lookahead.
const midiToSoundMs = computed(() => {
  const ingress = seriesAvg(stats.value.midiIngressMs)
  if (ingress == null || outputTotalMs.value == null) return null
  return ingress + outputTotalMs.value
})

const bpmMismatch = computed(() =>
  clock.value.drumPlaying && Math.abs(clock.value.transportBpm - clock.value.drumBpm) > 0.5
)

const stallsOverLookahead = computed(() => stats.value.stallMs.max > (audio.value.lookAheadMs ?? Infinity))

// green / amber / red per check
const level = (ok, warn) => (ok ? 'ok' : warn ? 'warn' : 'bad')
const checks = computed(() => [
  {
    label: 'Late scheduled hits',
    value: stats.value.hitMarginMs.count ? `${stats.value.lateHits} / ${stats.value.hitMarginMs.count}` : 'no hits yet',
    state: level(stats.value.lateHits === 0, false),
    hint: stats.value.lateHits
      ? `worst ${fmt(stats.value.maxLateMs)} ms late — these hits fell off the grid`
      : 'every drum hit reached the engine ahead of its time',
  },
  {
    label: 'Transport BPM vs Drum BPM',
    value: `${fmt(clock.value.transportBpm)} / ${fmt(clock.value.drumBpm)}`,
    state: level(!bpmMismatch.value, false),
    hint: bpmMismatch.value
      ? 'the shared Transport runs at a different tempo than the Drum Machine (another sequencer set it)'
      : clock.value.drumPlaying ? 'in sync' : 'Drum Machine stopped',
  },
  {
    label: 'Main-thread stalls (max)',
    value: `${fmt(stats.value.stallMs.max === -Infinity ? null : stats.value.stallMs.max, 0)} ms`,
    state: level(stats.value.stallMs.max < 30, !stallsOverLookahead.value),
    hint: stallsOverLookahead.value
      ? 'longer than the lookahead: scheduled sounds can arrive late'
      : 'shorter than the lookahead: scheduling is safe',
  },
  {
    label: 'MIDI input wait (avg / max)',
    value: stats.value.midiIngressMs.count
      ? `${fmt(seriesAvg(stats.value.midiIngressMs))} / ${fmt(stats.value.midiIngressMs.max)} ms`
      : 'play some notes',
    state: level(!stats.value.midiIngressMs.count || stats.value.midiIngressMs.max < 10, stats.value.midiIngressMs.max < 30),
    hint: `${stats.value.midiIngressMs.count} note-ons measured`,
  },
])

const STATE_CLASS = {
  ok: 'bg-emerald-400',
  warn: 'bg-amber-400',
  bad: 'bg-rose-500',
}
</script>

<template>
  <div class="bg-neutral-950 border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden relative" :style="panelStyle" v-show="!isMinimized" @mousedown.capture="bringToFront">
    <div class="flex items-center justify-between gap-3 px-4 py-2 bg-gradient-to-b from-white/5 to-transparent shrink-0 cursor-grab active:cursor-grabbing select-none" @mousedown="onDragStart">
      <div class="flex items-center gap-3">
        <div class="p-1.5 bg-emerald-500/20 rounded-lg border border-emerald-500/20">
          <Gauge class="w-4 h-4 text-emerald-400" />
        </div>
        <h2 class="text-sm font-black text-white tracking-[0.1em] uppercase">Audio Diagnostics</h2>
      </div>
      <div class="flex items-center gap-2" @mousedown.stop>
        <button class="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase text-neutral-400 hover:text-white hover:bg-white/10" title="Reset counters" @click="reset">
          <RotateCcw class="w-3 h-3" /> Reset
        </button>
        <MacOsButtons @close="emit('close')" @minimize="toggleMinimize" @maximize="maximize" />
      </div>
    </div>

    <div class="flex-1 overflow-y-auto px-4 pb-4 space-y-4 text-xs">
      <!-- Checks -->
      <section class="space-y-1.5">
        <div v-for="c in checks" :key="c.label" class="flex items-start gap-2.5 p-2 rounded-lg bg-white/[0.03] border border-white/5">
          <span class="mt-1 w-2 h-2 rounded-full shrink-0" :class="STATE_CLASS[c.state]" />
          <div class="flex-1 min-w-0">
            <div class="flex justify-between gap-2">
              <span class="text-neutral-300 font-semibold">{{ c.label }}</span>
              <span class="font-mono text-white">{{ c.value }}</span>
            </div>
            <div class="text-[10px] text-neutral-500">{{ c.hint }}</div>
          </div>
        </div>
      </section>

      <!-- MIDI clock -->
      <section>
        <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">MIDI traffic &amp; clock</h3>
        <dl class="grid grid-cols-2 gap-x-4 gap-y-1 font-mono">
          <dt class="text-neutral-500">Incoming clock</dt><dd class="text-right text-white">{{ fmt(midiRate.clock, 0) }} msg/s<span v-if="midiStore.incomingBpm > 0" class="text-neutral-500"> · {{ fmt(midiStore.incomingBpm) }} BPM</span></dd>
          <template v-for="p in midiRate.clockByPort" :key="p.name">
            <dt class="text-neutral-600 pl-3 truncate" :title="p.name">↳ {{ p.name }}</dt><dd class="text-right text-neutral-400">{{ fmt(p.rate, 0) }} msg/s</dd>
          </template>
          <dt class="text-neutral-500">Incoming other</dt><dd class="text-right text-white">{{ fmt(midiRate.other, 0) }} msg/s</dd>
          <dt class="text-neutral-500">Outgoing clock</dt><dd class="text-right text-white">{{ midiService.isClockRunning ? 'running' : 'off' }} · send {{ midiStore.sendClock ? 'on' : 'off' }}</dd>
        </dl>
        <p v-if="clockDuplicated" class="mt-1 text-[10px] text-rose-400">
          Clock arrives ~{{ fmt(midiRate.clock / expectedClockRate, 1) }}× (expected {{ fmt(expectedClockRate, 0) }} msg/s): duplicated or looped back — check the ports above and disable clock out / sync in where it echoes.
        </p>
        <p class="mt-1 text-[10px] text-neutral-600">
          A/B test: note the MIDI input wait, then stop the clock (here or on the device sending it), Reset, and compare.
        </p>
      </section>

      <!-- Main-thread hogs -->
      <section>
        <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Main-thread hogs (long frames)</h3>
        <p v-if="!loafSupported" class="text-[10px] text-neutral-600">Needs Chrome/Edge 123+ (Long Animation Frames API).</p>
        <p v-else-if="!hogs.length" class="text-[10px] text-neutral-600">No frame over 50 ms yet.</p>
        <table v-else class="w-full font-mono text-[10px]">
          <thead class="text-neutral-500">
            <tr><th class="text-left font-normal">Function · file</th><th class="text-right font-normal">n</th><th class="text-right font-normal">total</th><th class="text-right font-normal">max</th></tr>
          </thead>
          <tbody>
            <tr v-for="h in hogs" :key="h.key" class="border-t border-white/5 align-top">
              <td class="py-0.5 pr-2">
                <div class="text-white break-all">{{ h.fn }}<span v-if="h.file" class="text-neutral-500"> · {{ h.file }}</span></div>
                <div class="text-neutral-600 break-all">{{ h.invoker }}</div>
              </td>
              <td class="text-right text-neutral-400">{{ h.count }}</td>
              <td class="text-right text-white">{{ fmt(h.totalMs, 0) }}</td>
              <td class="text-right text-neutral-400">{{ fmt(h.maxMs, 0) }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Tone.Draw callers -->
      <section v-if="drawCallers.length">
        <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">_drawLoop by caller</h3>
        <table class="w-full font-mono text-[10px]">
          <thead class="text-neutral-500">
            <tr><th class="text-left font-normal">Scheduled from</th><th class="text-right font-normal">long frames</th><th class="text-right font-normal">total</th><th class="text-right font-normal">max</th><th class="text-right font-normal" title="callback's own synchronous time (avg / max), excluding the re-render it queues">sync avg/max</th></tr>
          </thead>
          <tbody>
            <tr v-for="d in drawCallers" :key="d.caller" class="border-t border-white/5">
              <td class="py-0.5 pr-2 text-white break-all">{{ d.caller }}</td>
              <td class="text-right text-neutral-400">{{ d.frames }}</td>
              <td class="text-right text-white">{{ fmt(d.totalMs, 0) }}</td>
              <td class="text-right text-neutral-400">{{ fmt(d.maxMs, 0) }}</td>
              <td class="text-right text-neutral-400">{{ fmt(d.runs ? d.syncMs / d.runs : null) }} / {{ fmt(d.syncMaxMs) }}</td>
            </tr>
          </tbody>
        </table>
        <p class="mt-1 text-[10px] text-neutral-600">Long <code>_drawLoop</code> time split across the components whose Draw callbacks ran in it (includes the Vue re-render they trigger). <b>sync</b> = the callback alone: high sync → the code it runs (store writes, watchers, devtools); low sync but high total → the re-render it triggers. Only callbacks scheduled while this panel is open.</p>
      </section>

      <!-- Audio output -->
      <section>
        <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Audio output</h3>
        <dl class="grid grid-cols-2 gap-x-4 gap-y-1 font-mono">
          <dt class="text-neutral-500">Context</dt><dd class="text-right text-white">{{ audio.state }} · {{ audio.sampleRate }} Hz</dd>
          <dt class="text-neutral-500">Base latency</dt><dd class="text-right text-white">{{ fmt(audio.baseMs) }} ms</dd>
          <dt class="text-neutral-500">Output latency</dt><dd class="text-right text-white">{{ fmt(audio.outputMs) }} ms</dd>
          <dt class="text-neutral-500">Tone.js lookahead</dt><dd class="text-right text-white">{{ fmt(audio.lookAheadMs, 0) }} ms</dd>
          <dt class="text-neutral-500">Live MIDI → sound (est.)</dt>
          <dd class="text-right text-white">{{ fmt(midiToSoundMs) }} ms</dd>
        </dl>
        <p class="mt-1 text-[10px] text-neutral-600">
          Estimate = MIDI input wait + base + output latency. Sounds triggered at <code>Tone.now()</code> add the lookahead on top.
        </p>
      </section>

      <!-- Scheduling -->
      <section>
        <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Drum hit scheduling margin</h3>
        <dl class="grid grid-cols-2 gap-x-4 gap-y-1 font-mono">
          <dt class="text-neutral-500">Hits</dt><dd class="text-right text-white">{{ stats.hitMarginMs.count }}</dd>
          <dt class="text-neutral-500">Margin avg</dt><dd class="text-right text-white">{{ fmt(seriesAvg(stats.hitMarginMs)) }} ms</dd>
          <dt class="text-neutral-500">Margin min</dt><dd class="text-right text-white">{{ fmt(stats.hitMarginMs.count ? stats.hitMarginMs.min : null) }} ms</dd>
          <dt class="text-neutral-500">Transport</dt><dd class="text-right text-white">{{ clock.transportState }} · global {{ fmt(clock.globalBpm, 0) }} BPM</dd>
        </dl>
        <p class="mt-1 text-[10px] text-neutral-600">
          Margin = how far ahead of its time a hit reached the engine. Close to 0 or negative = timing at risk.
        </p>
      </section>
    </div>

    <div @mousedown.stop="e => onResizeStart(e, 'se')" class="absolute bottom-1 right-1 w-3 h-3 cursor-se-resize z-50 opacity-40 hover:opacity-80" style="background:radial-gradient(circle,#aaa 1px,transparent 1px) 0 0/3px 3px" />
  </div>
</template>
