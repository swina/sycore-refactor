<script setup>
// Rig Controller — UI prototype (branch feat/rig-controller-ui).
// Three views of the same simulated rig state (src/lib/rig-controller.ts):
// the reference layout, the Launchpad Mini MK1 mapping and the AKAI MIDImix mapping.
// SIM: a simulated clock stands in for Ableton Live, nothing is driven.
// LIVE (rig-live.ts): the Chord, Drum and Seq rows mirror the real apps and the
// clock is the real one (EXT from Live, or INT); pads send the Control Map's commands.
import { reactive, ref, computed, watch, onUnmounted } from 'vue'
import { Grid3X3, Play, Square } from 'lucide-vue-next'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import MacOsButtons from '@/components/ui/MacOsButtons.vue'
import {
  SLOT_LABELS, SECTION_COUNT, SPLIT_COUNT, KEY_NAMES,
  LP_TOP_LABELS, LP_ROW6_LABELS, LP_SIDE_LOW_LABELS,
  PRESS_OPTIONS, MOTION_OPTIONS, TRIGGER_SYNC_OPTIONS, POSITION_SYNC_OPTIONS,
  createRigState, slotState, slotColor, slotProgress, pressSlot, releaseSlot, setTrackOption,
  generate, undo, selectSection,
  toggleMute, toggleSolo, toggleLaneMute, selectSplit, shiftKey, panic,
  toggleClockSource, tick, startClock, stopClock, lpGridNote, lpSideNote, lpTopCc,
} from '@/lib/rig-controller'
import {
  isLiveApp, rigReports, drumSnapshot, chordSnapshot, seqSnapshot, applySnapshot, applyClock, slotEvent, dispatchRig,
} from '@/lib/rig-live'
import { getTransport } from 'tone'
import { midiService } from '@/core/midi/midi-service'
import { rigLaunchpad, isLaunchpadName, parseLaunchpadInput, ledDiff, colorVelocity, RIG_INIT_MESSAGES, muteOtherSenders, unmuteOtherSenders, rigSend } from '@/lib/rig-launchpad'
import { useDrumMachineStore } from '@/stores/useDrumMachineStore'
import { useChordProgStore } from '@/stores/useChordProgStore'
import { useStepSequencerStore } from '@/stores/useStepSequencerStore'
import { useExternalClockStore } from '@/stores/useExternalClockStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { useGlobalTransportControls } from '@/composables/useGlobalTransportControls'

const emit = defineEmits(['close'])

const { panelStyle, onDragStart, isMinimized, toggleMinimize, bringToFront, maximize } = useDraggableResizable({
  storageKey: 'SYCORE_POS_RIG_CONTROLLER',
  minimizeLabel: 'Rig Controller',
  initialWidth: 1040,
  initialHeight: 660,
  minWidth: 760,
  minHeight: 480,
  zIndex: 160,
  panelId: 'rig-controller',
})

const s = reactive(createRigState())
const view = ref('rig')
const showLabels = ref(true)
const focusApp = ref('drum')
const flowConfig = ref('Live — Techno Set')
const FLOW_CONFIGS = ['Live — Techno Set', 'Live — Ambient Set', 'Studio jam']

// ── Mode: LIVE (the real apps) or SIM (simulated) ─────────────────────────
const LS_MODE = 'SYCORE_RIG_MODE'
const mode = ref(localStorage.getItem(LS_MODE) === 'sim' ? 'sim' : 'live')
const live = computed(() => mode.value === 'live')
const drumStore = useDrumMachineStore()
const chordStore = useChordProgStore()
const seqStore = useStepSequencerStore()
const clockStore = useExternalClockStore()
const midiStore = useMidiStore()
const { transportManager, playAll, stopAll } = useGlobalTransportControls()

/** Mirror the real apps and clock into the rig state (LIVE). */
function syncLive() {
  const t = transportManager.isRunning.value ? transportManager.getBarPosition() : { bar: 1, beat: 1, sixteenth: 1 }
  let intBpm = 0
  try { intBpm = getTransport().bpm.value } catch {}
  applyClock(s,
    { following: clockStore.source !== 'internal' && !clockStore.fallbackToInternal, playing: clockStore.state === 'playing', bpm: clockStore.bpm, position: clockStore.position },
    { running: transportManager.isRunning.value, bpm: intBpm, ...t })
  for (const a of s.apps) {
    if (a.id === 'drum') applySnapshot(a, drumSnapshot(drumStore.sequences, drumStore.basslineSequences, drumStore.activeSequence, drumStore.isPlaying, rigReports.queued.drum))
    else if (a.id === 'chord') applySnapshot(a, chordSnapshot(chordStore.slots, chordStore.activeSlotIndex, chordStore.playingSlotIndex, chordStore.isPlaying, rigReports.queued.chord))
    else if (a.id === 'seq') applySnapshot(a, seqSnapshot(seqStore.banks, seqStore.activeBankIndex, rigReports.seqPlaying, rigReports.queued.seq))
  }
}
let liveRaf = null
function liveLoop() { syncLive(); liveRaf = requestAnimationFrame(liveLoop) }

// ── Simulated clock (SIM: stands in for Live's MIDI clock) ────────────────
let timer = null
function restartTimer() {
  clearInterval(timer)
  timer = null
  if (!live.value && s.clock.running) timer = setInterval(() => tick(s), 60000 / s.clock.bpm / 4) // 16ths
}
function togglePlay() {
  if (live.value) {
    if (s.clock.source === 'EXT') { s.display = 'Live is the clock master: Play / Stop from Live'; return }
    if (s.clock.running) stopAll(); else playAll()
    return
  }
  if (s.clock.running) stopClock(s); else startClock(s)
  restartTimer()
}
watch(() => s.clock.bpm, () => { if (!live.value) restartTimer() })
watch(mode, m => {
  localStorage.setItem(LS_MODE, m)
  cancelAnimationFrame(liveRaf)
  Object.assign(s, createRigState())
  restartTimer()
  if (m === 'live') { s.display = 'LIVE · Chord, Drum, Seq connected'; liveLoop() }
}, { immediate: true })
onUnmounted(() => { clearInterval(timer); cancelAnimationFrame(liveRaf) })

/** LIVE: an action not connected to the apps yet. */
const notConnected = what => { s.display = `${what}: not connected yet (SIM only)` }

let taps = []
function tap() {
  const now = performance.now()
  taps = taps.filter(t => now - t < 2500).concat(now)
  if (taps.length >= 2) {
    const avg = (taps.at(-1) - taps[0]) / (taps.length - 1)
    s.clock.bpm = Math.min(240, Math.max(40, Math.round(60000 / avg * 10) / 10))
    s.display = `Tap · ${s.clock.bpm.toFixed(1)} BPM`
  }
}

// ── Hold-to-confirm (Panic, INT) ──────────────────────────────────────────
const HOLD_MS = 700
const holding = reactive({})
const holdTimers = {}
function holdStart(key, fn) {
  holding[key] = true
  holdTimers[key] = setTimeout(() => { holding[key] = false; fn() }, HOLD_MS)
}
function holdEnd(key) {
  clearTimeout(holdTimers[key])
  if (holding[key]) s.display = 'Hold to confirm'
  holding[key] = false
}
const doPanic = () => { panic(s); if (live.value) midiStore.panic() }
const doInt = () => { if (live.value) return notConnected('EXT/INT (use Clock › Source in the transport)'); toggleClockSource(s) }

// ── Actions shared by the three views ─────────────────────────────────────
const liveWhen = (id) => (!s.clock.running ? 'now' : id === 'seq' ? 'at the end of its pattern' : 'on the next bar')
function onSlotDown(appId, slot) {
  focusApp.value = appId
  if (!live.value) return pressSlot(s, appId, slot)
  const a = s.apps.find(x => x.id === appId)
  if (!isLiveApp(appId)) return notConnected(a.label)
  if (!a.filled[slot]) { s.display = `${a.label} ${SLOT_LABELS[slot]}: empty slot`; return }
  dispatchRig(slotEvent(appId, slot))
  s.display = `${a.label} → ${SLOT_LABELS[slot]} ${liveWhen(appId)}`
}
function onSlotUp(appId, slot) { if (!live.value) releaseSlot(s, appId, slot) }
function onGenerate(appId, mutate = false) {
  focusApp.value = appId
  if (!live.value) return generate(s, appId, mutate || s.shift)
  if (appId !== 'drum' || mutate || s.shift) return notConnected(`${s.apps.find(x => x.id === appId).label} ${mutate || s.shift ? 'Mutate' : 'Generate'}`)
  dispatchRig({ name: 'dm-generate' })
  s.display = 'Drum: Generate (current style)'
}
function onFill() {
  if (live.value) { dispatchRig({ name: 'dm-trigger-fill' }); s.display = 'Drum: Fill'; return }
  s.fill = true; s.display = `Fill ${s.clock.running ? 'on the next bar' : 'armed'}`
}
/** A section: every connected app with that slot filled switches to it (LIVE), as the Song Composer does. */
function onSection(i) {
  if (!live.value) return selectSection(s, i)
  const apps = s.apps.filter(a => isLiveApp(a.id) && a.filled[i])
  if (!apps.length) { s.display = `Section ${i + 1}: no app has slot ${SLOT_LABELS[i]}`; return }
  for (const a of apps) dispatchRig(slotEvent(a.id, i))
  s.display = `Section ${i + 1} → ${apps.map(a => a.label).join(', ')} ${SLOT_LABELS[i]} ${s.clock.running ? 'on the next bar' : 'now'}`
}
function repeaterOn() { s.repeater = true; s.display = 'Repeater (hold)' }
function repeaterOff() { if (s.repeater) { s.repeater = false; s.display = 'Repeater off' } }
function toggleLatch() { s.latch = !s.latch; s.display = `Latch ${s.latch ? 'on' : 'off'}` }
function releaseAll() { s.latch = false; s.display = 'Note Latch: all notes released' }
function toggleShift() { s.shift = !s.shift }
function toggleGenMode() { s.generateMode = s.generateMode === 'ai' ? 'builtin' : 'ai'; s.display = `Generate: ${s.generateMode === 'ai' ? 'AI' : 'built-in'}` }
const focused = computed(() => s.apps.find(a => a.id === focusApp.value))

/** Cycle the focused track's Trigger sync (Launchpad top button "Sync"). */
function cycleSync() {
  const i = TRIGGER_SYNC_OPTIONS.findIndex(o => o.value === focused.value.opts.triggerSync)
  setTrackOption(s, focused.value.id, 'triggerSync', TRIGGER_SYNC_OPTIONS[(i + 1) % TRIGGER_SYNC_OPTIONS.length].value)
}

// Track options: labels and short badges for each row
const OPTION_GROUPS = [
  { key: 'press', title: 'Press', options: PRESS_OPTIONS },
  { key: 'motion', title: 'Motion', options: MOTION_OPTIONS },
  { key: 'triggerSync', title: 'Trigger sync', options: TRIGGER_SYNC_OPTIONS },
  { key: 'positionSync', title: 'Position sync', options: POSITION_SYNC_OPTIONS },
]
const optLabel = (group, value) => OPTION_GROUPS.find(g => g.key === group).options.find(o => o.value === value)?.label ?? value
const optHint = (group, value) => OPTION_GROUPS.find(g => g.key === group).options.find(o => o.value === value)?.hint ?? ''
const PRESS_SHORT = { retrigger: 'RTRG', holdStop: 'HOLD', holdMotion: 'H+MO', latch: 'LTCH' }
const MOTION_SHORT = { stay: 'STAY', oneShot: '1SHOT', marchWrap: 'MRCH↺', marchStay: 'MRCH→', marchStop: 'MRCH■', random: 'RND', exclusiveRandom: 'XRND' }
const SYNC_SHORT = { off: 'OFF', '1/4': '¼', '1/2': '½', '1': '1b', '2': '2b', '4': 'BAR', auto: 'AUTO', queue: 'QUEUE', tolerant: 'TOL' }
const rowBadge = a => `${PRESS_SHORT[a.opts.press]} · ${MOTION_SHORT[a.opts.motion]} · ${SYNC_SHORT[a.opts.triggerSync]}`
const queueOrder = (a, i) => { const k = a.queue.indexOf(i); return k === -1 ? null : k + 1 }
const sectionHasContent = i => s.apps.some(a => a.filled[i])
const lanePageOffset = computed(() => (s.shift ? 8 : 0))

// ── Tailwind classes ──────────────────────────────────────────────────────
const SLOT_CLASS = {
  empty: 'bg-white/[0.03] border-white/10 text-neutral-600',
  filled: 'bg-amber-500/20 border-amber-400/40 text-amber-200',
  queued: 'bg-amber-400/50 border-amber-300 text-amber-50 animate-pulse',
  playing: 'bg-emerald-500 border-emerald-300 text-black',
}
const LED_CLASS = {
  off: 'bg-neutral-800 border-neutral-700 text-neutral-500',
  amber: 'bg-amber-500/80 border-amber-300/60 text-black shadow-[0_0_8px_rgba(245,158,11,0.45)]',
  amberFlash: 'bg-amber-400 border-amber-200 text-black animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.7)]',
  green: 'bg-green-500 border-green-300 text-black shadow-[0_0_10px_rgba(34,197,94,0.7)]',
  red: 'bg-red-600 border-red-400 text-white shadow-[0_0_10px_rgba(220,38,38,0.7)]',
}
const btn = 'px-2 py-1.5 rounded-md border text-[10px] font-bold uppercase tracking-wider transition-colors select-none'
const btnIdle = 'bg-white/[0.04] border-white/10 text-neutral-300 hover:bg-white/10'
const btnOn = 'bg-emerald-500/80 border-emerald-300 text-black'

// ── Launchpad Mini MK1 view model ─────────────────────────────────────────
const lpTop = computed(() => LP_TOP_LABELS.map((label, i) => {
  let color = 'off'
  if (i === 0) color = s.clock.running ? (s.clock.beat === 1 ? 'green' : 'amber') : 'off'
  if (i === 1) color = s.clock.source === 'EXT' ? 'green' : 'red'
  if (i === 2) color = s.shift ? 'green' : 'amber'
  if (i === 3) color = s.generateMode === 'ai' ? 'green' : 'amber'
  if (i === 4) color = focused.value.opts.triggerSync === '4' ? 'amber' : 'green'
  if (i === 5) color = 'amber'
  if (i === 7) color = holding.panic ? 'amberFlash' : 'red'
  return { label, color, id: `CC ${lpTopCc(i)}` }
}))

function lpPad(row, col) {
  if (row < 5) {
    const a = s.apps[row]
    // The row's first pad names its app (Chord A, Drum A…).
    const short = col === 0 ? `${a.label} ${SLOT_LABELS[col]}` : SLOT_LABELS[col]
    if (live.value && !isLiveApp(a.id)) return { label: `${a.label} ${SLOT_LABELS[col]} (not connected)`, short, color: 'off' }
    const st = slotState(a, col)
    const color = a.muted && st === 'playing' ? 'red' : slotColor(st)
    return { label: `${a.label} ${SLOT_LABELS[col]}`, short, color }
  }
  if (row === 5) {
    const color = s.section === col ? 'green' : s.queuedSection === col ? 'amberFlash' : sectionHasContent(col) ? 'amber' : 'off'
    return { label: `Section ${col + 1}`, short: `S${col + 1}`, color }
  }
  if (row === 6) {
    let color = 'amber'
    if (col < 4) color = s.split === col ? 'green' : 'amber'
    if (col === 4) color = s.fill ? 'amberFlash' : 'amber'
    if (col === 5) color = s.repeater ? 'green' : 'amber'
    if (col === 6) color = s.latch ? 'green' : 'amber'
    return { label: LP_ROW6_LABELS[col], short: LP_ROW6_LABELS[col].replace('Split ', 'Sp'), color }
  }
  const lane = col + lanePageOffset.value
  return { label: `Lane ${lane + 1} mute`, short: `L${lane + 1}`, color: s.laneMutes[lane] ? 'red' : 'green' }
}

function lpSide(row) {
  if (row < 5) {
    // LIVE: only the Drum Machine's Generate is connected so far.
    const off = live.value && (s.apps[row].id !== 'drum' || s.shift)
    return { label: `${s.apps[row].label} ${s.shift ? 'Mutate' : 'Generate'}`, short: s.shift ? 'MUT' : 'GEN', color: off ? 'off' : s.shift ? 'green' : 'amber' }
  }
  if (row === 5) return { label: LP_SIDE_LOW_LABELS[0], short: 'UNDO', color: s.undo ? 'amber' : 'off' }
  return { label: LP_SIDE_LOW_LABELS[row - 5], short: row === 6 ? 'K−' : 'K+', color: 'amber' }
}

function lpTopDown(i) {
  if (i === 0) tap()
  if (i === 1) holdStart('int', doInt)
  if (i === 2) toggleShift()
  if (i === 3) toggleGenMode()
  if (i === 4) cycleSync()
  if (i === 5) view.value = 'rig'
  if (i === 7) holdStart('panic', doPanic)
}
function lpTopUp(i) {
  if (i === 1) holdEnd('int')
  if (i === 7) holdEnd('panic')
}
function lpPadDown(row, col) {
  if (row < 5) return onSlotDown(s.apps[row].id, col)
  if (row === 5) return onSection(col)
  if (row === 6) {
    if (col < 4) return selectSplit(s, col)
    if (col === 4) return onFill()
    if (col === 5) return repeaterOn()
    if (col === 6) return toggleLatch()
    return releaseAll()
  }
  toggleLaneMute(s, col + lanePageOffset.value)
}
function lpPadUp(row, col) {
  if (row < 5) return onSlotUp(s.apps[row].id, col)
  if (row === 6 && col === 5) repeaterOff()
}
function lpSideDown(row) {
  if (row < 5) return onGenerate(s.apps[row].id)
  if (row === 5) return live.value ? notConnected('Undo') : undo(s)
  shiftKey(s, row === 6 ? -1 : 1)
}

// ── Physical Launchpad Mini MK1 in Rig mode (rig-launchpad.ts) ────────────
// On: the Launchpad's buttons are the rig's (no usual mappings) and its LEDs
// show the state above. Off, or the panel closed: its usual mappings come back.
const LS_LP_RIG = 'SYCORE_RIG_LAUNCHPAD'
const lpRig = ref(localStorage.getItem(LS_LP_RIG) === '1')
const lpOutput = computed(() => midiStore.outputs.find(o => isLaunchpadName(o.name)) ?? null)
let lpSent = null

const lpLeds = computed(() => {
  const out = []
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) out.push(colorVelocity(lpPad(r, c).color))
  for (let r = 0; r < 8; r++) out.push(colorVelocity(lpSide(r).color))
  for (const t of lpTop.value) out.push(colorVelocity(t.color))
  return out
})

// The raw port (midiStore.outputs holds reactive copies).
const lpPort = () => midiService.getOutputs().find(o => isLaunchpadName(o.name)) ?? null
function lpSend(msgs) {
  const o = lpPort()
  if (!o) return false
  // Other feedback (MIDI Learn LEDs, e.g. the Chord Prog's slot mappings) is muted
  // meanwhile: a 0 from it (no flags) made pads blink with flashing on.
  muteOtherSenders(o)
  for (const m of msgs) rigSend(o, m)
  return true
}
function pushLeds() {
  if (rigLaunchpad.handler !== onLaunchpadMidi) return
  const next = lpLeds.value
  const msgs = ledDiff(lpSent, next)
  if (msgs.length && lpSend(msgs)) lpSent = next.slice()
}
function onLaunchpadMidi(data) {
  const ev = parseLaunchpadInput(data)
  if (!ev) return
  if (ev.kind === 'pad') { if (ev.down) lpPadDown(ev.row, ev.col); else lpPadUp(ev.row, ev.col) }
  else if (ev.kind === 'side') { if (ev.down) lpSideDown(ev.row) }
  else if (ev.down) lpTopDown(ev.index)
  else lpTopUp(ev.index)
}
// Rig mode takes the Launchpad's input over before anything else (MIDI Learn, MIDI Actions,
// the Loop Machine's and Chord Prog's own listeners, Thru): its mappings stay as they are and
// work again when Rig mode is off.
function lpExclusive(e) {
  if (!isLaunchpadName(e.target?.name)) return false
  onLaunchpadMidi(e.data)
  return true
}
function lpRigOn() {
  rigLaunchpad.handler = onLaunchpadMidi
  midiService.setExclusiveInput(lpExclusive)
  lpSent = null
  if (lpSend(RIG_INIT_MESSAGES)) pushLeds()
}
function lpRigOff() {
  if (rigLaunchpad.handler !== onLaunchpadMidi) return
  rigLaunchpad.handler = null
  midiService.setExclusiveInput(null)
  lpSent = null
  unmuteOtherSenders()
  rigLaunchpad.restore?.()
}
watch(lpLeds, pushLeds)
watch(lpRig, on => {
  localStorage.setItem(LS_LP_RIG, on ? '1' : '0')
  if (on) lpRigOn(); else lpRigOff()
}, { immediate: true })
// Plugged in (again) while Rig mode is on: its LEDs were reset — after the
// controller manager's own init of the new port, set it up again.
let lpReinit = null
watch(() => lpOutput.value?.id, id => {
  clearTimeout(lpReinit)
  if (id && lpRig.value) lpReinit = setTimeout(lpRigOn, 400)
})
onUnmounted(() => { clearTimeout(lpReinit); lpRigOff() })

// ── AKAI MIDImix view model ───────────────────────────────────────────────
const mixPage = ref('app') // 'app' | 'lane'
const laneParams = reactive(Array.from({ length: 16 }, () => ({ k1: 64, k2: 64, k3: 64, cc7: 100 })))
const macros = reactive({ transpose: 64, arpRate: 64, spare: 0 })

const mixStrips = computed(() => Array.from({ length: 8 }, (_, i) => {
  if (mixPage.value === 'lane') {
    const lane = i + lanePageOffset.value
    const p = laneParams[lane]
    return {
      title: `Lane ${lane + 1}`,
      knobs: [
        { label: 'CC A', get: () => p.k1, set: v => { p.k1 = v } },
        { label: 'CC B', get: () => p.k2, set: v => { p.k2 = v } },
        { label: 'CC C', get: () => p.k3, set: v => { p.k3 = v } },
      ],
      fader: { label: 'CC 7', get: () => p.cc7, set: v => { p.cc7 = v } },
      mute: { label: 'Mute', on: s.laneMutes[lane], press: () => toggleLaneMute(s, lane) },
      rec: { label: 'Latch', on: s.laneLatch[lane], press: () => { s.laneLatch[lane] = !s.laneLatch[lane]; s.display = `Lane ${lane + 1} latch ${s.laneLatch[lane] ? 'on' : 'off'}` } },
    }
  }
  if (i < 5) {
    const a = s.apps[i]
    return {
      title: a.label,
      knobs: [
        { label: 'Density', get: () => a.density, set: v => { a.density = v } },
        { label: 'Swing', get: () => a.swing, set: v => { a.swing = v } },
        { label: 'Gate', get: () => a.gate, set: v => { a.gate = v } },
      ],
      fader: { label: 'Intensity', get: () => a.intensity, set: v => { a.intensity = v } },
      mute: { label: 'Mute', on: a.muted, press: () => toggleMute(s, a.id) },
      rec: { label: 'Solo', on: a.solo, press: () => toggleSolo(s, a.id) },
    }
  }
  const macroDefs = [['Transpose', 'transpose'], ['Arp rate', 'arpRate'], ['Spare', 'spare']]
  const [label, key] = macroDefs[i - 5]
  return {
    title: label,
    knobs: [{ label, get: () => macros[key], set: v => { macros[key] = v } }],
    fader: null,
    mute: null,
    rec: null,
  }
}))

// Knob drag: vertical mouse movement changes the value (0–127)
function knobDrag(e, knob) {
  const startY = e.clientY
  const start = knob.get()
  const move = ev => knob.set(Math.max(0, Math.min(127, Math.round(start + (startY - ev.clientY) * 0.8))))
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
const knobAngle = v => -135 + (v / 127) * 270
const arcPath = v => {
  const a = (knobAngle(v) - 90) * Math.PI / 180
  const a0 = (-135 - 90) * Math.PI / 180
  const r = 15, cx = 18, cy = 18
  const large = (v / 127) * 270 > 180 ? 1 : 0
  return `M${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`
}
</script>

<template>
  <div class="bg-neutral-950 border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden relative" :style="panelStyle" v-show="!isMinimized" @mousedown.capture="bringToFront">
    <!-- Header -->
    <div class="flex items-center justify-between gap-3 px-4 py-2 bg-gradient-to-b from-white/5 to-transparent shrink-0 cursor-grab active:cursor-grabbing select-none" @mousedown="onDragStart">
      <div class="flex items-center gap-3">
        <div class="p-1.5 bg-amber-500/20 rounded-lg border border-amber-500/20">
          <Grid3X3 class="w-4 h-4 text-amber-400" />
        </div>
        <h2 class="text-sm font-black text-white tracking-[0.1em] uppercase">Rig Controller</h2>
        <span v-if="live" class="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-[9px] font-bold uppercase tracking-wider text-emerald-300" title="Chord, Drum and Seq rows drive the real apps; the other controls are still simulated">Live · Chord, Drum, Seq connected</span>
        <span v-else class="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[9px] font-bold uppercase tracking-wider text-amber-300">Simulation · no MIDI</span>
      </div>
      <div class="flex items-center gap-2" @mousedown.stop>
        <div class="flex rounded-md border border-white/10 overflow-hidden">
          <button v-for="v in [['rig', 'Rig layout'], ['launchpad', 'Launchpad Mini MK1'], ['midimix', 'AKAI MIDImix']]" :key="v[0]"
                  class="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
                  :class="view === v[0] ? 'bg-white/15 text-white' : 'text-neutral-400 hover:text-white hover:bg-white/5'"
                  @click="view = v[0]">{{ v[1] }}</button>
        </div>
        <MacOsButtons @close="emit('close')" @minimize="toggleMinimize" @maximize="maximize" />
      </div>
    </div>

    <!-- Mode bar: LIVE (real apps and clock) or SIM (simulated Live) -->
    <div class="flex items-center gap-3 px-4 py-1.5 border-y border-white/5 bg-white/[0.02] text-[10px] text-neutral-400 shrink-0">
      <div class="flex rounded border border-white/10 overflow-hidden">
        <button v-for="m in [['live', 'Live'], ['sim', 'Sim']]" :key="m[0]" class="px-2 py-0.5 font-bold uppercase"
                :class="mode === m[0] ? (m[0] === 'live' ? 'bg-emerald-500/80 text-black' : 'bg-amber-500/70 text-black') : 'text-neutral-400 hover:text-white'"
                :title="m[0] === 'live' ? 'Drive the real Chord Prog, Drum Machine and Sequencer, on the real clock' : 'A simulated rig and clock: try the track options'"
                @click="mode = m[0]">{{ m[1] }}</button>
      </div>
      <button class="px-2 py-0.5 rounded border font-bold uppercase"
              :class="lpRig ? (lpOutput ? 'bg-emerald-500/80 border-emerald-300 text-black' : 'bg-amber-500/40 border-amber-300 text-amber-50') : 'border-white/15 text-neutral-300 hover:bg-white/10'"
              :title="lpRig ? (lpOutput ? `Rig mode on ${lpOutput.name}: its buttons drive the rig, its LEDs show it. Off: its usual mappings come back` : 'Rig mode on, no Launchpad found') : 'Use the Launchpad Mini MK1 as the rig controller (its usual mappings are paused meanwhile)'"
              @click="lpRig = !lpRig">Launchpad {{ lpRig ? (lpOutput ? 'Rig ●' : 'Rig · not found') : 'Rig off' }}</button>
      <span class="uppercase tracking-widest text-neutral-500">{{ live ? s.clock.source : 'Simulated Live' }}</span>
      <button class="flex items-center gap-1 px-2 py-0.5 rounded border font-bold uppercase"
              :class="s.clock.running ? 'bg-emerald-500/80 border-emerald-300 text-black' : 'border-white/15 text-neutral-200 hover:bg-white/10'"
              @click="togglePlay">
        <component :is="s.clock.running ? Square : Play" class="w-3 h-3" /> {{ s.clock.running ? 'Stop' : 'Play' }}
      </button>
      <label v-if="!live" class="flex items-center gap-1">BPM
        <input v-model.number="s.clock.bpm" type="number" min="40" max="240" step="0.5" class="w-16 bg-black/40 border border-white/10 rounded px-1 py-0.5 text-white font-mono" />
      </label>
      <span v-else class="font-mono text-white">{{ s.clock.bpm.toFixed(1) }} BPM</span>
      <span class="font-mono text-white">{{ s.clock.bar }}.{{ s.clock.beat }}.{{ (s.clock.step % 4) + 1 }}</span>
      <span v-if="live" class="ml-auto truncate">Pads send the Control Map's commands: slots start on the next bar (Seq: at the end of its pattern). Track options, Bass and Arp: SIM only for now.</span>
      <span v-else class="ml-auto truncate">The controller only shows SY.CORE's state; each track's options decide how and when its slots start.</span>
    </div>

    <div class="flex-1 overflow-auto p-4 text-xs">
      <!-- ═══════════ RIG LAYOUT ═══════════ -->
      <div v-if="view === 'rig'" class="grid gap-3" style="grid-template-columns: 220px minmax(420px, 1fr) 230px">
        <!-- Left column -->
        <div class="space-y-3">
          <section class="p-3 rounded-lg bg-white/[0.03] border border-white/10">
            <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Transport / Clock</h3>
            <div class="flex items-center justify-between">
              <span class="px-2 py-0.5 rounded text-[10px] font-black" :class="s.clock.source === 'EXT' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'">{{ s.clock.source }}</span>
              <span class="font-mono text-2xl text-white">{{ s.clock.bpm.toFixed(1) }}</span>
            </div>
            <div class="flex items-center justify-between mt-2">
              <span class="font-mono text-neutral-300">{{ s.clock.bar }}.{{ s.clock.beat }}</span>
              <div class="flex gap-1">
                <span v-for="b in 4" :key="b" class="w-2.5 h-2.5 rounded-full"
                      :class="s.clock.running && s.clock.beat === b ? (b === 1 ? 'bg-emerald-400' : 'bg-amber-400') : 'bg-neutral-700'" />
              </div>
            </div>
            <div class="flex gap-1.5 mt-2">
              <button :class="[btn, btnIdle, 'flex-1']" @click="tap">Tap</button>
              <button :class="[btn, 'flex-1', btnIdle]" :title="`Trigger sync of ${focused.label} — click to cycle`" @click="cycleSync">Sync: {{ SYNC_SHORT[focused.opts.triggerSync] }}</button>
            </div>
          </section>

          <section class="p-3 rounded-lg bg-white/[0.03] border border-white/10">
            <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Sections (Song)</h3>
            <div class="grid grid-cols-4 gap-1.5">
              <button v-for="i in SECTION_COUNT" :key="i"
                      :class="[btn, s.section === i - 1 ? btnOn : s.queuedSection === i - 1 ? 'bg-amber-400/50 border-amber-300 text-white animate-pulse' : btnIdle]"
                      @click="onSection(i - 1)">{{ i }}</button>
            </div>
          </section>

          <section class="p-3 rounded-lg bg-white/[0.03] border border-white/10 space-y-2">
            <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Rig</h3>
            <select v-model="flowConfig" class="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-white" @change="s.display = `Flow: ${flowConfig}`">
              <option v-for="c in FLOW_CONFIGS" :key="c">{{ c }}</option>
            </select>
            <div class="grid grid-cols-4 gap-1.5">
              <button v-for="i in SPLIT_COUNT" :key="i" :class="[btn, s.split === i - 1 ? btnOn : btnIdle]" @click="selectSplit(s, i - 1)">Sp {{ i }}</button>
            </div>
            <div class="flex items-center justify-between text-[10px] text-neutral-500">
              <span>Lane mute {{ lanePageOffset + 1 }}–{{ lanePageOffset + 8 }}</span><span v-if="s.shift" class="text-amber-300">⇧</span>
            </div>
            <div class="grid grid-cols-8 gap-1">
              <button v-for="i in 8" :key="i" class="h-6 rounded border text-[9px] font-bold"
                      :class="s.laneMutes[i - 1 + lanePageOffset] ? 'bg-red-600 border-red-400 text-white' : 'bg-white/[0.04] border-white/10 text-neutral-400'"
                      @click="toggleLaneMute(s, i - 1 + lanePageOffset)">{{ i + lanePageOffset }}</button>
            </div>
          </section>
        </div>

        <!-- Center: slot grid + display -->
        <div class="space-y-3">
          <section class="p-3 rounded-lg bg-white/[0.03] border border-white/10">
            <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Slot grid (A–H)</h3>
            <div class="space-y-1.5">
              <div v-for="a in s.apps" :key="a.id" class="flex items-center gap-1.5" :class="a.muted || (live && !isLiveApp(a.id)) ? 'opacity-40' : ''"
                   :title="live && !isLiveApp(a.id) ? `${a.label}: not connected yet (SIM only)` : ''">
                <button class="w-16 text-left leading-tight" :title="'Track options: ' + rowBadge(a)" @click="focusApp = a.id">
                  <span class="block text-[11px] font-bold" :class="focusApp === a.id ? 'text-amber-300' : 'text-neutral-300'">{{ a.label }}</span>
                  <span class="block text-[8px] font-mono text-neutral-500 truncate">{{ rowBadge(a) }}</span>
                </button>
                <button v-for="(l, i) in SLOT_LABELS" :key="l"
                        class="relative w-9 h-9 rounded-md border text-[11px] font-black transition-colors overflow-hidden"
                        :class="SLOT_CLASS[slotState(a, i)]"
                        :title="`${a.label} ${l}: ${slotState(a, i)} · ${a.lengths[i]} bar${a.lengths[i] > 1 ? 's' : ''}`"
                        @pointerdown="onSlotDown(a.id, i)" @pointerup="onSlotUp(a.id, i)" @pointerleave="a.held !== null && onSlotUp(a.id, i)">
                  {{ l }}
                  <span v-if="a.filled[i] && a.lengths[i] > 1" class="absolute top-0 right-0.5 text-[7px] font-bold opacity-70">{{ a.lengths[i] }}</span>
                  <span v-if="queueOrder(a, i)" class="absolute top-0 left-0.5 text-[7px] font-bold">#{{ queueOrder(a, i) }}</span>
                  <span v-if="a.cursor === i && a.opts.press === 'holdMotion'" class="absolute inset-0 rounded-md ring-2 ring-sky-400 pointer-events-none" />
                  <span v-if="a.playing === i" class="absolute left-0 bottom-0 h-1 bg-black/50" :style="{ width: `${slotProgress(a, i) * 100}%` }" />
                </button>
                <button :class="[btn, a.muted ? 'bg-red-600 border-red-400 text-white' : btnIdle, 'ml-1']" @click="toggleMute(s, a.id)">M</button>
                <button :class="[btn, btnIdle]" @click="onGenerate(a.id)">Gen</button>
                <button :class="[btn, btnIdle]" @click="onGenerate(a.id, true)">Mut</button>
              </div>
            </div>
            <div class="flex gap-3 mt-3 text-[10px] text-neutral-500">
              <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm bg-white/10" />empty</span>
              <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm bg-amber-500/40" />filled</span>
              <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm bg-amber-400 animate-pulse" />queued</span>
              <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm bg-emerald-500" />playing</span>
              <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm ring-2 ring-sky-400" />next press (Hold &amp; motion)</span>
              <span>2 = slot length in bars · #n = queue order</span>
            </div>
          </section>

          <section class="p-3 rounded-lg bg-white/[0.03] border border-white/10">
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Track options · <span class="text-amber-300">{{ focused.label }}</span></h3>
              <div class="flex gap-1">
                <button v-for="a in s.apps" :key="a.id" class="px-1.5 py-0.5 rounded text-[9px] font-bold"
                        :class="focusApp === a.id ? 'bg-amber-500/30 text-amber-200' : 'text-neutral-500 hover:text-neutral-200'"
                        @click="focusApp = a.id">{{ a.label }}</button>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-x-3 gap-y-2">
              <label v-for="g in OPTION_GROUPS" :key="g.key" class="block">
                <span class="text-[10px] text-neutral-400">{{ g.title }}</span>
                <select :value="focused.opts[g.key]" class="w-full mt-0.5 bg-black/40 border border-white/10 rounded px-1.5 py-1 text-white"
                        @change="setTrackOption(s, focused.id, g.key, $event.target.value)">
                  <option v-for="o in g.options" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
                <span class="block mt-0.5 text-[9px] text-neutral-500 leading-snug">{{ optHint(g.key, focused.opts[g.key]) }}</span>
              </label>
            </div>
          </section>

          <section class="p-3 rounded-lg bg-black border border-emerald-500/20 font-mono">
            <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1 font-sans">Display</h3>
            <div class="text-emerald-300 text-sm truncate">{{ s.display }}</div>
            <div class="text-[10px] text-neutral-500 mt-1">
              Generate: {{ s.generateMode === 'ai' ? 'AI' : 'built-in' }} · Key {{ KEY_NAMES[s.key] }} · Flow: {{ flowConfig }} · Split {{ s.split + 1 }}
            </div>
          </section>
        </div>

        <!-- Right column -->
        <div class="space-y-3">
          <section class="p-3 rounded-lg bg-white/[0.03] border border-white/10 space-y-2">
            <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Performance</h3>
            <div class="grid grid-cols-2 gap-1.5">
              <button :class="[btn, s.fill ? 'bg-amber-400/60 border-amber-300 text-white animate-pulse' : btnIdle]" @click="onFill">Fill</button>
              <button :class="[btn, s.repeater ? btnOn : btnIdle]" @pointerdown="repeaterOn" @pointerup="repeaterOff" @pointerleave="repeaterOff">Repeat (hold)</button>
              <button :class="[btn, s.latch ? btnOn : btnIdle]" @click="toggleLatch">Latch</button>
              <button :class="[btn, btnIdle]" @click="releaseAll">Rel all</button>
            </div>
            <div class="flex items-center justify-between">
              <button :class="[btn, btnIdle]" @click="shiftKey(s, -1)">◀</button>
              <span class="font-mono text-white">Key {{ KEY_NAMES[s.key] }}</span>
              <button :class="[btn, btnIdle]" @click="shiftKey(s, 1)">▶</button>
            </div>
            <div class="text-[10px] text-neutral-500">Knobs → <span class="text-amber-300">{{ focused.label }}</span></div>
            <div v-for="k in [['Density', 'density'], ['Swing', 'swing'], ['Gate', 'gate'], ['Intensity', 'intensity']]" :key="k[1]" class="flex items-center gap-2">
              <span class="w-14 text-[10px] text-neutral-400">{{ k[0] }}</span>
              <input v-model.number="focused[k[1]]" type="range" min="0" max="127" class="flex-1 accent-amber-400" />
              <span class="w-7 text-right font-mono text-neutral-300">{{ focused[k[1]] }}</span>
            </div>
            <button :class="[btn, 'w-full', s.generateMode === 'ai' ? btnOn : btnIdle]" @click="toggleGenMode">Generate: {{ s.generateMode === 'ai' ? 'AI' : 'built-in' }}</button>
          </section>

          <section class="p-3 rounded-lg bg-red-950/20 border border-red-500/20 space-y-1.5">
            <h3 class="text-[10px] font-bold uppercase tracking-widest text-red-300/70">Safety</h3>
            <button :class="[btn, 'w-full relative overflow-hidden', holding.panic ? 'bg-red-500 border-red-300 text-white' : 'bg-red-600/30 border-red-500/50 text-red-200']"
                    @pointerdown="holdStart('panic', doPanic)" @pointerup="holdEnd('panic')" @pointerleave="holdEnd('panic')">Panic (hold)</button>
            <button :class="[btn, 'w-full', holding.int ? 'bg-amber-500 border-amber-300 text-black' : btnIdle]"
                    @pointerdown="holdStart('int', doInt)" @pointerup="holdEnd('int')" @pointerleave="holdEnd('int')">{{ s.clock.source === 'EXT' ? '→ INT' : '→ EXT' }} (hold)</button>
            <div class="grid grid-cols-2 gap-1.5">
              <button :class="[btn, btnIdle]" @click="undo(s)">Undo</button>
              <button :class="[btn, s.shift ? btnOn : btnIdle]" @click="toggleShift">Shift</button>
            </div>
          </section>
        </div>
      </div>

      <!-- ═══════════ LAUNCHPAD MINI MK1 ═══════════ -->
      <div v-else-if="view === 'launchpad'" class="flex gap-6 items-start">
        <div class="p-4 rounded-2xl bg-neutral-900 border border-white/10 shadow-inner select-none">
          <div class="grid gap-1.5" style="grid-template-columns: repeat(9, 2.6rem)">
            <!-- top round buttons -->
            <button v-for="(t, i) in lpTop" :key="'t' + i"
                    class="w-9 h-9 mx-auto rounded-full border text-[7px] font-bold leading-tight"
                    :class="LED_CLASS[t.color]" :title="`${t.id} · ${t.label}`"
                    @pointerdown="lpTopDown(i)" @pointerup="lpTopUp(i)" @pointerleave="lpTopUp(i)">{{ showLabels ? t.label : '' }}</button>
            <span />
            <!-- 8 rows: 8 pads + 1 side button -->
            <template v-for="row in 8" :key="'r' + row">
              <button v-for="col in 8" :key="'p' + row + col"
                      class="w-10 h-10 rounded-md border text-[8px] font-bold leading-tight"
                      :class="LED_CLASS[lpPad(row - 1, col - 1).color]"
                      :title="`Note ${lpGridNote(row - 1, col - 1)} · ${lpPad(row - 1, col - 1).label}`"
                      @pointerdown="lpPadDown(row - 1, col - 1)" @pointerup="lpPadUp(row - 1, col - 1)" @pointerleave="lpPadUp(row - 1, col - 1)">{{ showLabels ? lpPad(row - 1, col - 1).short : '' }}</button>
              <button class="w-9 h-9 m-auto rounded-full border text-[7px] font-bold"
                      :class="LED_CLASS[lpSide(row - 1).color]"
                      :title="`Note ${lpSideNote(row - 1)} · ${lpSide(row - 1).label}`"
                      @pointerdown="lpSideDown(row - 1)">{{ showLabels ? lpSide(row - 1).short : '' }}</button>
            </template>
          </div>
        </div>
        <div class="space-y-3 max-w-xs">
          <label class="flex items-center gap-2 text-neutral-300"><input v-model="showLabels" type="checkbox" class="accent-amber-400" /> Show labels (the real pads have none)</label>
          <section class="p-3 rounded-lg bg-white/[0.03] border border-white/10 space-y-1 text-neutral-300">
            <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Map</h3>
            <div>Rows 1–5 · Chord, Drum, Bass, Seq, Arp × slots A–H</div>
            <div>Row 6 · Sections 1–8</div>
            <div>Row 7 · Split 1–4 · Fill · Repeat (hold) · Latch · Rel all</div>
            <div>Row 8 · Lane mute 1–8 (Shift: 9–16)</div>
            <div>Side · Generate per row (Shift: Mutate) · Undo · Key − · Key +</div>
            <div>Top · Beat/Tap · EXT/INT (hold) · Shift · Gen AI · Sync (cycles the focused track's Trigger sync) · Rig · — · Panic (hold)</div>
            <div class="text-[10px] text-neutral-500">Slot pads follow each track's Press mode: hold modes react on release too.</div>
          </section>
          <section class="p-3 rounded-lg bg-white/[0.03] border border-white/10 space-y-1.5">
            <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500">LED colors (MK1: red / green / amber)</h3>
            <div v-for="c in [['off', 'Empty'], ['amber', 'Filled'], ['amberFlash', 'Queued for the next bar'], ['green', 'Playing / on'], ['red', 'Mute · Panic · INT']]" :key="c[0]" class="flex items-center gap-2 text-neutral-300">
              <span class="w-4 h-4 rounded border" :class="LED_CLASS[c[0]]" />{{ c[1] }}
            </div>
            <div class="text-[10px] text-neutral-500 pt-1">Hover a pad for its MIDI note (XY layout: 16·row + col; top row CC 104–111).</div>
          </section>
          <div class="p-2 rounded bg-black border border-emerald-500/20 font-mono text-emerald-300 truncate">{{ s.display }}</div>
        </div>
      </div>

      <!-- ═══════════ AKAI MIDIMIX ═══════════ -->
      <div v-else class="space-y-3">
        <div class="flex items-center gap-2 text-neutral-400">
          <span class="uppercase tracking-widest text-[10px] text-neutral-500">Page</span>
          <span class="px-2 py-0.5 rounded bg-white/10 text-white font-bold">{{ mixPage === 'app' ? 'App' : `Lane ${lanePageOffset + 1}–${lanePageOffset + 8}` }}</span>
          <span class="text-[10px]">Pots and faders are absolute: SY.CORE applies pickup (the value changes once the control reaches it).</span>
        </div>
        <div class="flex gap-3 p-4 rounded-2xl bg-neutral-900 border border-white/10 select-none w-fit">
          <div v-for="(st, i) in mixStrips" :key="i" class="w-20 flex flex-col items-center gap-2 p-2 rounded-lg bg-black/30 border border-white/5">
            <div class="text-[10px] font-bold text-neutral-200 truncate w-full text-center">{{ st.title }}</div>
            <div v-for="k in st.knobs" :key="k.label" class="flex flex-col items-center cursor-ns-resize" @pointerdown.prevent="knobDrag($event, k)">
              <svg viewBox="0 0 36 36" class="w-9 h-9">
                <circle cx="18" cy="18" r="15" fill="#171717" stroke="#404040" stroke-width="2" />
                <path :d="arcPath(k.get())" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" />
                <line x1="18" y1="18" x2="18" y2="7" stroke="#e5e5e5" stroke-width="2" stroke-linecap="round" :transform="`rotate(${knobAngle(k.get())} 18 18)`" />
              </svg>
              <span class="text-[8px] text-neutral-500">{{ k.label }} {{ k.get() }}</span>
            </div>
            <template v-if="st.mute">
              <button class="w-full py-1 rounded border text-[9px] font-bold flex items-center justify-center gap-1"
                      :class="st.mute.on ? 'bg-amber-500 border-amber-300 text-black' : 'bg-white/[0.04] border-white/10 text-neutral-400'"
                      @click="st.mute.press()">{{ st.mute.label }}</button>
              <button class="w-full py-1 rounded border text-[9px] font-bold"
                      :class="st.rec.on ? 'bg-red-600 border-red-400 text-white' : 'bg-white/[0.04] border-white/10 text-neutral-400'"
                      @click="st.rec.press()">{{ st.rec.label }}</button>
            </template>
            <template v-if="st.fader">
              <input type="range" min="0" max="127" :value="st.fader.get()" class="h-28 accent-amber-400" style="writing-mode: vertical-lr; direction: rtl"
                     @input="st.fader.set(Number($event.target.value))" />
              <span class="text-[8px] text-neutral-500">{{ st.fader.label }} {{ st.fader.get() }}</span>
            </template>
          </div>
          <!-- master section -->
          <div class="w-24 flex flex-col items-center gap-2 p-2 rounded-lg bg-black/30 border border-white/5">
            <div class="text-[10px] font-bold text-neutral-200">Master</div>
            <div class="flex gap-1 w-full">
              <button class="flex-1 py-1 rounded border text-[9px] font-bold" :class="mixPage === 'app' ? 'bg-white/15 border-white/30 text-white' : 'bg-white/[0.04] border-white/10 text-neutral-400'" @click="mixPage = 'app'">◀ Bank</button>
              <button class="flex-1 py-1 rounded border text-[9px] font-bold" :class="mixPage === 'lane' ? 'bg-white/15 border-white/30 text-white' : 'bg-white/[0.04] border-white/10 text-neutral-400'" @click="mixPage = 'lane'">Bank ▶</button>
            </div>
            <button class="w-full py-1 rounded border text-[9px] font-bold" :class="s.shift ? 'bg-amber-500 border-amber-300 text-black' : 'bg-white/[0.04] border-white/10 text-neutral-400'" @click="toggleShift">Solo = Shift</button>
            <input v-model.number="s.globalIntensity" type="range" min="0" max="127" class="h-28 accent-amber-400 mt-auto" style="writing-mode: vertical-lr; direction: rtl" />
            <span class="text-[8px] text-neutral-500">Global {{ s.globalIntensity }}</span>
          </div>
        </div>
        <div class="p-2 rounded bg-black border border-emerald-500/20 font-mono text-emerald-300 truncate w-fit min-w-[24rem]">{{ s.display }}</div>
      </div>
    </div>
  </div>
</template>
