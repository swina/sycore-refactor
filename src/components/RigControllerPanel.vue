<script setup>
import ResizeHandles from '@/components/ui/ResizeHandles.vue'
import PlayEditToggle from '@/components/ui/PlayEditToggle.vue'
import RigControlSections from '@/components/RigControlSections.vue'
import { rigControlsHost, RIG_CONTROLS_CTX } from '@/lib/rig-controls-host'
import { usePlayView } from '@/composables/usePlayView'
import { PLAY_LED_CLASS } from '@/lib/play-colors'
// Rig Controller — UI prototype (branch feat/rig-controller-ui).
// Three views of the same simulated rig state (src/lib/rig-controller.ts):
// the reference layout, the Launchpad Mini MK1 mapping and the AKAI MIDImix mapping.
// SIM: a simulated clock stands in for Ableton Live, nothing is driven.
// LIVE (rig-live.ts): the Chord, Drum, Seq, Bass (the Drum Machine's bassline) and Arp rows
// mirror the real apps and the clock is the real one (EXT from Live, or INT); pads send the
// Control Map's commands (Arp: the pads pick its mode).
import { keyLabel, keyRoot, keyFile } from '@/lib/chord-key'
import { externalGrid } from '@/core/midi/external-grid'
import { rigDensity, DENSITY_APPS } from '@/lib/rig-density'
import { rigSlotParam, RIG_ACTION_APPS, rigLedState, ledPaletteFor, parseRigAction } from '@/lib/rig-actions'
import { exportRigTemplate, parseRigTemplate, applyRigTemplate, clearRigMappings, rigMappedDevices, templateMatches, sysexBytes, templateFileName } from '@/lib/rig-template'
import { useMappingStore } from '@/stores/useMappingStore'
import { linkClient, useLinkStore } from '@/stores/useLinkStore'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'
import { reactive, ref, computed, watch, onUnmounted, provide } from 'vue'
import { Grid3X3, Play, Square } from 'lucide-vue-next'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import MacOsButtons from '@/components/ui/MacOsButtons.vue'
import {
  SLOT_LABELS, SECTION_COUNT, SPLIT_COUNT, KEY_NAMES,
  LP_TOP_LABELS, LP_SIDE_LOW_LABELS,
  PRESS_OPTIONS, MOTION_OPTIONS, TRIGGER_SYNC_OPTIONS, POSITION_SYNC_OPTIONS,
  createRigState, slotState, slotColor, slotProgress, pressSlot, releaseSlot, setTrackOption,
  generate, selectSection,
  toggleMute, toggleSolo, toggleLaneMute, selectSplit, shiftKey, panic,
  toggleClockSource, tick, startClock, stopClock, lpGridNote, lpSideNote, lpTopCc,
} from '@/lib/rig-controller'
import {
  isLiveApp, isLiveRow, SLOT_ROWS, rigTransport, rowPadEvents, rigParts, bassSnapshot, arpSnapshot, arpPress, RIG_ARP_MODES, arpOctaveOf, arpOctaveValue, arpRateOf, arpRateValue, rigMutes, rigVelocityScales, rigCc7, intensityMode, loadIntensityModes, saveIntensityModes, loadMuteScopes, saveMuteScopes, LIVE_APP_SOURCE, rigReports, drumSnapshot, chordSnapshot, seqSnapshot, applySnapshot, applyClock, dispatchRig, liveSyncSteps, padEvents, padWhen, rigArmed, armPress, armPlaying, armedDrumLoads, fillLook, rigFollowPlay, stopEvents, LIVE_APPS,
} from '@/lib/rig-live'
import { getTransport } from 'tone'
import { midiService, cableMuteKey } from '@/core/midi/midi-service'
import { isMidimixName, parseMidimixInput, mixLedDiff, mixLedsOff, Pickup, roleId, learnMixMsg, assignMix, mixMsgLabel, loadMixMap, saveMixMap } from '@/lib/rig-midimix'
import { learnToggle, matchToggle, toggleLabel, toggleShortLabel, sameToggle, loadToggle, saveToggle, RIG_TOGGLE_SLOTS } from '@/lib/rig-toggle'
import { rigLinkLaunchpad, parseRigLinkPress } from '@/lib/rig-link-launchpad'
import { rigLaunchpad, isLaunchpadName, parseLaunchpadInput, ledDiff, colorVelocity, RIG_INIT_MESSAGES, muteOtherSenders, unmuteOtherSenders, rigSend } from '@/lib/rig-launchpad'
import { useDrumMachineStore } from '@/stores/useDrumMachineStore'
import { useDrumMachineEngine } from '@/core/engines/drum-machine' // one per app (SynthApp): its chain
import { useChordProgStore, DURATION_LABELS } from '@/stores/useChordProgStore'
import { rigChord } from '@/lib/chord-next'
/** The SY.CORE Rig device's rows (bridge protocol: rows 0–4). */
const RIG_LINK_ORDER = ['chord', 'drum', 'seq', 'bass', 'arp']
import { frameLoop, uiTimeout } from '@/lib/ui-clock'
import { createWorkerTicker } from '@/core/midi/step-scheduler'
import { useStepSequencerStore } from '@/stores/useStepSequencerStore'
import { useArpStore } from '@/stores/useArpStore'
import { useExternalClockStore } from '@/stores/useExternalClockStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { useUiStore } from '@/stores/useUiStore'
import { useGlobalTransportControls } from '@/composables/useGlobalTransportControls'
import { useRigCaptures } from '@/core/engines/rig-captures'
import { clipSummary } from '@/lib/rig-captures'
import { useSyncStore } from '@/stores/useSyncStore'
import { countIn, startCountIn, cancelCountIn } from '@/lib/count-in'

const emit = defineEmits(['close'])
const uiStore = useUiStore()

const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront, maximize } = useDraggableResizable({
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
// Performance (play view): the Launchpad layout filling the panel, in the play views' amber scheme
// (dark: filled · blinking: queued / armed · full: playing), labels on; the mode bar folded (clock,
// tempo and position are in the toolbar). EDIT: the views as usual.
const { play } = usePlayView('rig-controller')
const shownView = computed(() => play.value ? 'launchpad' : view.value)
const ledClass = (c) => (play.value ? PLAY_LED_CLASS : LED_CLASS)[c]
const showLabels = ref(true)
const focusApp = ref('drum')
const flowConfig = ref('Live — Techno Set')
const FLOW_CONFIGS = ['Live — Techno Set', 'Live — Ambient Set', 'Studio jam']

// ── Mode: LIVE (the real apps) or SIM (simulated) ─────────────────────────
const LS_MODE = 'SYCORE_RIG_MODE'
const mode = ref(localStorage.getItem(LS_MODE) === 'sim' ? 'sim' : 'live')
const live = computed(() => mode.value === 'live')
const drumStore = useDrumMachineStore()
// Row S1–S8: Sections (standard) or Captures (clips recorded live with Capt — core/engines/rig-captures.js)
const captures = useRigCaptures()
const LS_SMODE = 'S1_RIG_S_MODE'
const sMode = ref((() => { try { return localStorage.getItem(LS_SMODE) === 'captures' ? 'captures' : 'sections' } catch { return 'sections' } })())
watch(sMode, v => { try { localStorage.setItem(LS_SMODE, v) } catch {} })
function toggleSMode() {
  sMode.value = sMode.value === 'captures' ? 'sections' : 'captures'
  s.display = sMode.value === 'captures'
    ? 'Row S: Captures — Capt records, a pad plays its capture (an empty pad: picks it for the next one; Shift + pad: clears)'
    : 'Row S: Sections'
}
function onCapt() {
  s.display = captures.toggleRecording()
}
/** A capture pad clicked in the panel: Shift held = the Rig's Shift (clear). */
function onCapturePadClick(e, i) {
  const was = s.shift
  if (e.shiftKey) s.shift = true
  onCapturePad(i)
  if (e.shiftKey) s.shift = was
}
// Capture sets (named, IndexedDB): the 8 pads saved / loaded under a name
const captSetName = ref('')
const captSetPick = ref('')
async function onSaveSet() {
  const name = captSetName.value || captures.state.setName || ''
  s.display = await captures.saveSet(name)
  if (captures.state.setName === name.trim()) { captSetPick.value = name.trim(); captSetName.value = '' }
}
function onLoadSet() {
  if (!captSetPick.value) return
  s.display = captures.loadSet(captSetPick.value)
}
async function onDeleteSet() {
  const name = captSetPick.value
  if (!name || !window.confirm(`Delete the capture set "${name}"?`)) return
  s.display = await captures.deleteSet(name)
  captSetPick.value = ''
}
function onCapturePad(i) {
  const c = captures.state
  if (s.shift) { if (c.clips[i]) { captures.clear(i); s.display = `S${i + 1} cleared (back from Session takes › Capt)` } return }
  // while recording, a pad picks where the capture goes — a full one is recorded over
  if (c.recording) {
    captures.select(i)
    s.display = c.selected !== i ? 'Capture goes to: the first empty pad'
      : c.clips[i] ? `Capture goes to S${i + 1}: records over it (the old one kept in Session takes)` : `Capture goes to S${i + 1}`
    return
  }
  if (!c.clips[i]) {
    captures.select(i)
    s.display = c.selected === i ? `S${i + 1} picked for the next capture` : 'Next capture: the first empty pad'
    return
  }
  const was = c.play[i]
  captures.toggleSlot(i)
  const p = c.play[i]
  const started = was === 'idle' && p !== 'idle'
  s.display = `S${i + 1} (${clipSummary(c.clips[i])}): ${p === 'queued' ? (captures.clockRunning() ? 'plays from the next bar' : 'waits for Play (starts on its 1)') : p === 'stopping' ? 'stops at the end of the bar' : p === 'playing' ? 'plays on' : 'called off'}`
    + (!started ? '' : captures.hasOutCable() ? ` → ${captures.outTargets().join(', ')}`
      : captures.staleNode() ? ' — MIDI Flow: the Live Perf node was saved as a device (no app id): reload the page, delete it and drag Live Perf in again, then cable it'
      : ' — MIDI Flow: cable Live Perf → your device (no cable: broadcast outputs only)')
}
const chordStore = useChordProgStore()
const seqStore = useStepSequencerStore()
const arpStore = useArpStore()
const clockStore = useExternalClockStore()
const linkStore = useLinkStore()
// The big Play of Rig Controls: following Live over SY.CORE Link it plays / stops Live, so it shows
// Live's own transport (as reported, one change per Play / Stop); else the rig clock.
const playOn = computed(() => live.value && s.clock.source === 'EXT' && clockStore.isLink && linkStore.ready ? linkStore.livePlaying : s.clock.running)
// Diagnostics: the rig clock's running flag flipping back and forth (seen: the Play button
// alternating Play / Stop while Live played). Prints what the clock sources said, at most every 5 s.
let flips = []
let flipLogAt = 0
watch(() => s.clock.running, (now) => {
  const t = performance.now()
  flips = [...flips.filter(x => t - x < 2000), t]
  if (flips.length >= 4 && t - flipLogAt > 5000) {
    flipLogAt = t
    console.warn(`[Rig] clock running flapping: ${flips.length} changes in 2 s (now ${now}) · source ${s.clock.source} · clock ${clockStore.source}${clockStore.isLink ? ' (Link)' : ''} state ${clockStore.state} fallbackINT ${clockStore.fallbackToInternal} · Live playing ${linkClient.transport.playing} · Tone running ${transportManager.isRunning.value} · mode ${mode.value}`)
  }
})
const midiStore = useMidiStore()
const { transportManager, playAll, stopAll } = useGlobalTransportControls()
const syncStore = useSyncStore()

/** Mirror the real apps and clock into the rig state (LIVE). */
function syncLive() {
  const t = transportManager.isRunning.value ? transportManager.getBarPosition() : { bar: 1, beat: 1, sixteenth: 1 }
  let intBpm = 0
  try { intBpm = getTransport().bpm.value } catch {}
  applyClock(s,
    { following: clockStore.source !== 'internal' && !clockStore.fallbackToInternal, playing: clockStore.state === 'playing', bpm: clockStore.bpm || midiStore.currentBpm, position: clockStore.position }, // no tempo from the source yet: SY.CORE's (not the rig's default)
    { running: transportManager.isRunning.value, bpm: intBpm, ...t })
  for (const a of s.apps) {
    // Drum and Bass: the Drum Machine's two parts, each on its own (drums only / bass only / both).
    if (a.id === 'drum') applySnapshot(a, drumSnapshot(drumStore.sequences, undefined, drumStore.activeSequence, drumStore.isPlaying && drumStore.drumsOn, rigReports.queued.drum ?? rigArmed.drum))
    else if (a.id === 'chord') applySnapshot(a, chordSnapshot(chordStore.slots, chordStore.activeSlotIndex, chordStore.playingSlotIndex, chordStore.isPlaying, rigReports.queued.chord ?? rigArmed.chord))
    else if (a.id === 'seq') applySnapshot(a, seqSnapshot(seqStore.banks, seqStore.activeBankIndex, rigReports.seqPlaying, rigReports.queued.seq ?? rigArmed.seq))
    else if (a.id === 'bass') applySnapshot(a, bassSnapshot(drumStore.basslineSequences, drumStore.basslineEnabled, drumStore.basslineSequence ?? drumStore.activeSequence, drumStore.isPlaying && drumStore.bassOn, rigReports.queued.bass ?? rigArmed.bass))
    else if (a.id === 'arp') { applySnapshot(a, arpSnapshot(arpStore.arpEnabled, arpStore.arpMode)); mirrorArp(a) }
    // Density: the panel's value and a MIDI-learned encoder both drive rigDensity (the one that moved wins).
    if (DENSITY_APPS.includes(a.id)) {
      if (a.density !== lastDensity[a.id]) rigDensity[a.id] = a.density
      else a.density = rigDensity[a.id]
      lastDensity[a.id] = a.density
    }
  }
  syncSection()
}
const lastDensity = {}
/** The focused row's knobs: on the Arp row in LIVE, Density is its Octave and Intensity its Rate. */
const arpKnobs = () => live.value && focused.value?.id === 'arp'
const knobLabel = k => (arpKnobs() && k[1] === 'density' ? 'Octave' : arpKnobs() && k[1] === 'intensity' ? 'Rate' : k[0])
function knobValue(key) {
  const v = focused.value[key]
  if (arpKnobs() && key === 'density') { const o = arpOctaveOf(v); return o > 0 ? `+${o}` : `${o}` }
  if (arpKnobs() && key === 'intensity') return arpRateOf(v)
  return v
}
function knobTitle(key) {
  if (key !== 'density' && key !== 'intensity') return ''
  if (arpKnobs()) return `${key === 'density' ? "The Arpeggiator's octave range (−3…+3)" : "The Arpeggiator's rate"}. Right-click: MIDI Learn`
  if (key === 'density' && live.value && ['drum', 'seq'].includes(focused.value.id)) return 'Density on the real app: 127 = as written, lower thins the weakest steps out. Right-click: MIDI Learn'
  return ''
}
/** Arp row (LIVE): Density = the Arpeggiator's octave range, Intensity = its rate. The control that
 *  moved writes the Arpeggiator; otherwise the row follows it (changed in its panel). */
const lastArp = { density: null, intensity: null }
function mirrorArp(a) {
  if (lastArp.density !== null && a.density !== lastArp.density) arpStore.arpOctave = arpOctaveOf(a.density)
  else if (arpOctaveOf(a.density) !== arpStore.arpOctave) a.density = arpOctaveValue(arpStore.arpOctave)
  if (lastArp.intensity !== null && a.intensity !== lastArp.intensity) arpStore.arpSubdivision = arpRateOf(a.intensity)
  else if (arpRateOf(a.intensity) !== arpStore.arpSubdivision) a.intensity = arpRateValue(arpStore.arpSubdivision)
  lastArp.density = a.density
  lastArp.intensity = a.intensity
}
let liveSection = null // LIVE: the section last launched (onSection / syncSection)
const { openMenu } = useMidiContextMenu()
/** Right-click on a Density control (LIVE, Drum / Seq): MIDI Learn it, e.g. on a Worlde encoder. */
function densityMenu(ev, a) {
  if (!live.value || !(DENSITY_APPS.includes(a.id) || a.id === 'arp')) return
  openMenu(ev, { name: `rig_density_${a.id}`, label: a.id === 'arp' ? 'Rig: Arp Octave' : `Rig: ${a.label} Density` })
}
// Mute / Solo on the real apps (LIVE): their note-ons are dropped at the MIDI service —
// the whole app, or only the cables picked in its scope (e.g. Chord → Live ch 2 only).
// SIM, or the panel closed: nothing is muted.
const muteScopes = reactive(loadMuteScopes())
/** The devices a real app is cabled to (MIDI Flow), plus the ones in its scope no longer cabled. */
function appCables(id) {
  const cabled = midiService.getCableTargets(LIVE_APP_SOURCE[id])
  return [...new Set([...cabled, ...(muteScopes[id] ?? [])])]
}
function toggleScope(id, dev) {
  const cur = muteScopes[id] ?? []
  muteScopes[id] = cur.includes(dev) ? cur.filter(d => d !== dev) : [...cur, dev]
  saveMuteScopes({ ...muteScopes })
}
function clearScope(id) {
  muteScopes[id] = []
  saveMuteScopes({ ...muteScopes })
}
watch(() => {
  if (!live.value) return '{"sources":[],"cables":[],"parts":{}}'
  return JSON.stringify(rigMutes(s.apps, muteScopes))
}, json => {
  const m = JSON.parse(json)
  rigParts.drumMuted = !!m.parts.drum
  rigParts.bassMuted = !!m.parts.bass
  midiService.setMutedSources(m.sources)
  midiService.setMutedCables(m.cables.map(([src, dev]) => cableMuteKey(src, dev)))
}, { immediate: true })
// Intensity × Global → each real app's CC 7 (volume) and/or note-on velocity, on the same scopes.
const intensityModes = reactive(loadIntensityModes())
function setIntensityMode(id, mode) {
  intensityModes[id] = mode
  saveIntensityModes({ ...intensityModes })
}
const intensityOpts = () => ({ bassChannel: drumStore.basslineMidiChannel })
watch(() => {
  if (!live.value) return '{"sources":{},"cables":[],"parts":{}}'
  return JSON.stringify(rigVelocityScales(s.apps, s.globalIntensity, muteScopes, intensityModes, intensityOpts()))
}, json => {
  const v = JSON.parse(json)
  rigParts.drumVelocity = v.parts.drum ?? 1
  rigParts.bassVelocity = v.parts.bass ?? 1
  midiService.setVelocityScales(v.sources, Object.fromEntries(v.cables.map(([src, dev, f]) => [cableMuteKey(src, dev), f])))
}, { immediate: true })
onUnmounted(() => {
  midiService.setMutedSources([]); midiService.setMutedCables([]); midiService.setVelocityScales({})
  Object.assign(rigParts, { drumMuted: false, bassMuted: false, drumVelocity: 1, bassVelocity: 1 })
})

// CC 7: sent through the app's own routing (its cables' OUT channels, like its notes),
// only when the value changes — opening the panel sends nothing. A CC 7 sent below 127
// is put back to 127 when it stops applying (mode or scope changed, SIM, panel closed),
// so a track is never left silent.
const cc7Sent = new Map() // `${source}|${targets}` → { value, source, targets }
let cc7Timer = null
let cc7Pending = []
const appChannel = id => (id === 'chord' ? chordStore.midiChannel : id === 'bass' ? drumStore.basslineMidiChannel : midiStore.midiChannel) - 1
function sendCc7(source, targets, value, id) {
  // Bass: on the bassline's own channel, as its notes (rigCc7 sends Bass only when it has one).
  const opts = { ...(targets.length ? { onlyTargets: targets } : {}), ...(id === 'bass' ? { exactChannel: true } : {}) }
  midiService.sendCC(7, value, Math.max(0, appChannel(id) ?? 0), source, null, Object.keys(opts).length ? opts : undefined)
}
function flushCc7() {
  cc7Timer = null
  const now = new Set()
  for (const c of cc7Pending) {
    const key = `${c.id}|${c.source}|${c.targets.join(',')}`
    now.add(key)
    const prev = cc7Sent.get(key)
    if (prev?.value === c.value) continue
    if (!prev && c.value === 127) continue // never sent and at full: nothing to do
    cc7Sent.set(key, { value: c.value, source: c.source, targets: c.targets, id: c.id })
    sendCc7(c.source, c.targets, c.value, c.id)
  }
  for (const [key, prev] of cc7Sent) {
    if (now.has(key)) continue
    if (prev.value < 127) sendCc7(prev.source, prev.targets, 127, prev.id)
    cc7Sent.delete(key)
  }
}
watch(() => (live.value ? JSON.stringify(rigCc7(s.apps, s.globalIntensity, intensityModes, muteScopes, intensityOpts())) : '[]'), json => {
  cc7Pending = JSON.parse(json)
  if (!cc7Timer) cc7Timer = uiTimeout(flushCc7, 20) // a knob turned with Live in front: not 1 s late
})
onUnmounted(() => { cc7Timer?.(); cc7Pending = []; flushCc7() })
/** Readout for the Track options: the velocity scale now applied to a real app, and where. */
function velocityReadout(a) {
  const f = (a.intensity / 127) * (s.globalIntensity / 127)
  const scope = muteScopes[a.id] ?? []
  const where = scope.length ? scope.map(d => `→ ${d}`).join(', ') : 'whole app'
  const mode = intensityMode(intensityModes, a.id)
  const parts = []
  const noCc7 = a.id === 'bass' && !(drumStore.basslineMidiChannel >= 1) // Bass: CC 7 needs the bassline's own channel
  if (mode !== 'velocity' && !noCc7) parts.push(`CC 7 = ${Math.round(a.intensity * s.globalIntensity / 127)}`)
  if (mode !== 'cc7' || noCc7) parts.push(`Velocity ×${f.toFixed(2)}`)
  return `${parts.join(' · ')} (Intensity ${a.intensity} · Global ${s.globalIntensity}) · ${where}`
}
// Every frame — and every 40 ms with SY.CORE's window hidden (Live in front): rAF alone stopped
// there, and the rig acted on an old state (ui-clock.ts).
let stopLiveLoop = null
function liveLoop() { stopLiveLoop?.(); stopLiveLoop = frameLoop(syncLive) }
const endLiveLoop = () => { stopLiveLoop?.(); stopLiveLoop = null }

/** Following Live (or another external master) as the clock. */
const followingLive = () => clockStore.source !== 'internal' && !clockStore.fallbackToInternal
// Play (Live's or SY.CORE's): only the armed slots start (playAll skips the rig's apps — no
// last progression starting on its own). Live's Stop: the real apps stop at once (Live's grid is
// gone: no bar left to finish on), armed slots are kept and the slots that were playing are armed
// (the next Play starts them again; a press on an armed pad disarms it).
function startArmed() {
  if (!rigFollowPlay.value) { s.display = 'Live Play: nothing started (Live Play off)'; return }
  for (const id of SLOT_ROWS) {
    const slot = rigArmed[id]
    if (slot === null) continue
    rigArmed[id] = null
    for (const ev of rowPadEvents(id, slot, null, 0)) dispatchRig(ev)
  }
}
rigTransport.onPlayAll = startArmed
watch(live, v => { rigTransport.live = v }, { immediate: true })
/** The slots playing now, by row (what a Stop keeps armed). */
const playingSlots = () => Object.fromEntries(SLOT_ROWS.map(id => [id, s.apps.find(x => x.id === id)?.playing]))
// A Stop from Rig Controls: the slots playing when it was pressed — by the time Live stops, the Drum
// Machine may have ended (Stop@end) and the others stopped, so Live's Stop would find none playing.
let stopArm = null
const offLiveGrid = externalGrid.on(e => {
  if (!live.value || e.type !== 'stop') return
  armPlaying(stopArm ?? playingSlots()); stopArm = null
  for (const id of LIVE_APPS) for (const ev of stopEvents(id)) dispatchRig(ev)
})
onUnmounted(() => {
  offLiveGrid(); rigDensity.active = false; for (const id of SLOT_ROWS) rigArmed[id] = null
  rigTransport.live = false; if (rigTransport.onPlayAll === startArmed) rigTransport.onPlayAll = null
})

// ── Simulated clock (SIM: stands in for Live's MIDI clock) ────────────────
let timer = null
function restartTimer() {
  clearInterval(timer)
  timer = null
  if (!live.value && s.clock.running) timer = setInterval(() => tick(s), 60000 / s.clock.bpm / 4) // 16ths
}
// Stop with the Drum Machine's Stop@end (+Fill): it finishes its bar (its fill) first, then `stop`
// (Live's Stop, or SY.CORE's). Pressed again while waiting: the Drum Machine stops now, then `stop`.
// Called off (a pad starts the drums again): nothing stops.
let endingStop = null
function stopAtDrumEnd(stop) {
  if (!endingStop) stopArm = playingSlots()
  if (endingStop) { window.dispatchEvent(new CustomEvent('dm-play-stop', { detail: { play: false, end: true } })); return }
  const detail = { play: false, end: true, deferred: false }
  if (drumStore.isPlaying) window.dispatchEvent(new CustomEvent('dm-play-stop', { detail }))
  if (!detail.deferred) { stop(); return }
  s.display = 'Stop at the end of the bar (Drum Machine Stop@end) — press again: now'
  endingStop = watch([() => drumStore.isPlaying, () => rigReports.drumStopPending], ([playing, pending]) => {
    if (playing && pending) return
    endingStop(); endingStop = null
    if (!playing) stop(); else stopArm = null // called off
  })
}
// Play with the sync panel's Count-in (lib/count-in.ts): the bars counted on screen first, then
// `go` (Live's Play over SY.CORE Link, or the simulated clock). Pressed again while counting: off.
function countedPlay(go) {
  if (cancelCountIn()) { s.display = 'Count-in cancelled'; return }
  if (!startCountIn(syncStore.countInBars, s.clock.bpm, go)) go()
}
function togglePlay() {
  if (live.value) {
    if (s.clock.source === 'EXT') {
      // Live is the clock: Play / Stop Live itself (SY.CORE Link 1.5+); its transport report follows
      const on = !linkClient.transport.playing
      const send = () => {
        const sent = linkClient.sendPlay(on)
        if (!sent) stopArm = null
        s.display = sent ? `Live: ${on ? 'Play' : 'Stop'}` : 'Live is the clock master: Play / Stop from Live (SY.CORE Link 1.5+ plays it from here)'
      }
      if (countIn.active) { cancelCountIn(); s.display = 'Count-in cancelled'; return }
      if (on) { stopArm = null; countedPlay(send) } else stopAtDrumEnd(send)
      return
    }
    if (s.clock.running) stopAtDrumEnd(() => { const arm = stopArm; stopAll(); if (arm) armPlaying(arm); stopArm = null }); else playAll()
    return
  }
  if (s.clock.running) { stopClock(s); restartTimer() } else countedPlay(() => { startClock(s); restartTimer() })
}
watch(() => s.clock.bpm, () => { if (!live.value) restartTimer() })
watch(mode, m => {
  localStorage.setItem(LS_MODE, m)
  endLiveLoop()
  Object.assign(s, createRigState())
  for (const id of SLOT_ROWS) rigArmed[id] = null
  liveSection = null
  lastArp.density = lastArp.intensity = null
  // Density acts on the real apps in LIVE only; it starts from their current value (127 = as written).
  rigDensity.active = m === 'live'
  for (const a of s.apps) if (DENSITY_APPS.includes(a.id)) { if (m === 'live') a.density = rigDensity[a.id]; lastDensity[a.id] = a.density }
  restartTimer()
  if (m === 'live') { s.display = 'LIVE · Chord, Drum, Seq, Bass, Arp connected'; liveLoop() }
}, { immediate: true })
onUnmounted(() => { clearInterval(timer); endLiveLoop(); endingStop?.(); endingStop = null })

/** LIVE: an action not connected to the apps yet. */
const notConnected = what => { s.display = `${what}: not connected yet (SIM only)` }

let taps = []
// ── Tempo: TAP, − / + and the tempo knob ─────────────────────────────────
// LIVE following Live over SY.CORE Link: Live's tempo (bridge 1.6+; SY.CORE follows its report);
// LIVE on the internal clock: SY.CORE's tempo (whole BPM); a MIDI clock master: its own; SIM: the rig's.
function setTempo(bpm) {
  const b = Math.round(Math.min(240, Math.max(40, bpm)) * 10) / 10
  if (!live.value) { s.clock.bpm = b; return `${b.toFixed(1)} BPM` }
  if (s.clock.source === 'EXT') {
    if (!clockStore.isLink) { s.display = 'Tempo: from the MIDI clock master'; return null }
    if (!linkClient.sendTempo(b)) { s.display = 'Tempo: Live\'s (SY.CORE Link 1.6+ sets it from here)'; return null }
    return `Live ${b.toFixed(1)} BPM`
  }
  midiStore.setGlobalBpm(b)
  return `${Math.round(b)} BPM`
}
function tap() {
  const now = performance.now()
  taps = taps.filter(t => now - t < 2500).concat(now)
  if (taps.length >= 2) {
    const avg = (taps.at(-1) - taps[0]) / (taps.length - 1)
    // whole BPM: a tapped tempo is never exact (124.3, 123.8…)
    const said = setTempo(Math.round(60000 / avg))
    if (said) s.display = `Tap · ${said}`
  }
}
/** Round: the tempo to the nearest whole BPM (after the knob, or a tempo set in Live). */
function tempoRound() {
  const said = setTempo(Math.round(s.clock.bpm))
  if (said) s.display = `Tempo ${said}`
}
/** Tempo − / +: 1 BPM, with Shift 0.1. */
function tempoStep(dir) {
  const said = setTempo(s.clock.bpm + dir * (s.shift ? 0.1 : 1))
  if (said) s.display = `Tempo ${said}`
}
// The tempo knob (MIDI Learn rig_tempo): relative — each step it moves is 0.5 BPM, so a knob
// picked up anywhere never jumps the tempo.
let tempoKnobLast = null
function tempoKnob(value) {
  const prev = tempoKnobLast
  tempoKnobLast = value
  if (prev === null || value === prev) return
  const said = setTempo(s.clock.bpm + (value - prev) * 0.5)
  if (said) s.display = `Tempo ${said}`
}
// On the screen: drag the BPM up / down (mouse, touch), 0.1 BPM per 2 px.
function tempoDrag(e) {
  if (e.button !== 0) return
  const el = e.currentTarget
  el.setPointerCapture?.(e.pointerId)
  const y0 = e.clientY
  const b0 = s.clock.bpm
  let raf = 0, pending = null
  const move = ev => {
    pending = b0 + Math.round((y0 - ev.clientY) / 2) / 10
    if (raf) return
    raf = requestAnimationFrame(() => { raf = 0; if (pending !== null) { const said = setTempo(pending); if (said) s.display = `Tempo ${said}` } })
  }
  const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up) }
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
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
function onSlotDown(appId, slot) {
  focusApp.value = appId
  if (!live.value) return pressSlot(s, appId, slot)
  const a = s.apps.find(x => x.id === appId)
  if (!isLiveRow(appId)) return notConnected(a.label)
  // Arp: the pad picks a mode and switches the Arpeggiator on; the mode playing switches it off.
  if (appId === 'arp') {
    const p = arpPress(a.playing, slot)
    if (p.mode) arpStore.arpMode = p.mode
    arpStore.arpEnabled = p.enabled
    s.display = p.enabled ? `Arp ${SLOT_LABELS[slot]}: ${p.mode} on` : 'Arp off'
    return
  }
  if (!a.filled[slot]) { s.display = `${a.label} ${SLOT_LABELS[slot]}: ${appId === 'bass' ? 'no bassline' : 'empty slot'}`; return }
  // Drum and Bass are the Drum Machine's two parts: each row turns its own on / off / to a sequence.
  const playing = a.playing
  const what = `${a.label} ${SLOT_LABELS[slot]}`
  // Following Live while it is stopped: the pad arms the slot (selected now); the app starts from it
  // on Live's Start. The armed pad again: disarmed.
  if (followingLive() && !externalGrid.active && playing === null) {
    rigArmed[appId] = armPress(rigArmed[appId], slot)
    if (rigArmed[appId] === null) { s.display = `${what}: not armed`; return }
    selectSlot(appId, slot)
    s.display = `${what} armed: starts on Live's Play`
    return
  }
  // Latch with the track's Trigger sync: the playing slot stops, another switches, a stopped app starts.
  // The sync point is on Live's grid: with Live stopped (or SY.CORE on its own clock), at once.
  const sync = liveSyncSteps(a.opts.triggerSync, externalGrid.active)
  for (const ev of rowPadEvents(appId, slot, playing, sync)) dispatchRig(ev)
  s.display = `${what} ${padWhen(appId, playing, slot, sync)}`
}
/** Arming: Chord and Seq select the slot now; Drum and Bass load theirs from the watcher below. */
function selectSlot(id, slot) {
  if (id === 'chord' || id === 'seq') dispatchRig(padEvents(id, slot, null, 0)[0])
}
// Drum and Bass armed with the Drum Machine stopped (a pad with Live stopped, or the slots kept
// armed at Live's Stop): the slot is loaded at once, as Chord and Seq — the drums' sequence and the
// bassline's own (pinned to its armed slot: the drums' switch doesn't move it). Not armed: the
// bassline follows the drums' sequence, as when stopped before. The start on Live's Play is
// unchanged (each part from its armed slot). After the engine's reset at a stop (flush 'post').
watch(() => [rigArmed.drum, rigArmed.bass, drumStore.isPlaying, live.value], ([drum, bass, playing, isLive]) => {
  if (!isLive || playing) return
  const load = armedDrumLoads({ drum: drum ?? null, bass: bass ?? null }, drumStore.activeSequence)
  if (drumStore.basslineSequence !== load.bassline) drumStore.basslineSequence = load.bassline
  if (load.drums) dispatchRig({ name: 'dm-seq-switch', detail: { seq: load.drums, sync: 0 } })
}, { flush: 'post' })
/** The rows whose GEN is connected in LIVE. */
const GEN_APPS = ['drum', 'chord', 'seq', 'bass']
function onSlotUp(appId, slot) { if (!live.value) releaseSlot(s, appId, slot) }
// Generates done per row (any source: panel, controller, Rig device): the devices flash GEN on each.
const genCount = reactive({})
function onGenerate(appId, mutate = false) {
  focusApp.value = appId
  if (!live.value) { genCount[appId] = (genCount[appId] ?? 0) + 1; return generate(s, appId, mutate || s.shift) }
  // LIVE: Mutate (Shift + GEN) is connected for the Sequencer (a part of its pattern: Lock / Vary)
  const mut = mutate || s.shift
  if (!GEN_APPS.includes(appId) || (mut && appId !== 'seq')) return notConnected(`${s.apps.find(x => x.id === appId).label} ${mut ? 'Mutate' : 'Generate'}`)
  genCount[appId] = (genCount[appId] ?? 0) + 1
  if (appId === 'bass') {
    // A new bassline in the Drum Machine's active sequence, on the Chord Prog's key when it has an exact one.
    const mode = chordStore.keyMode
    const root = mode ? keyRoot(chordStore.selectedKey, mode) : null
    dispatchRig({ name: 'dm-generate-bass', detail: root !== null ? { root } : {} })
    s.display = `Bass: Generate ${root !== null ? `on ${KEY_NAMES[root]}` : '(its root note)'}`
    return
  }
  if (appId === 'seq') {
    // A new sequence, in the Chord Prog's key when it has an exact one (Major / Minor), else in its own.
    const mode = chordStore.keyMode
    const root = mode ? keyRoot(chordStore.selectedKey, mode) : null
    dispatchRig({ name: 'seq-generate', detail: { ...(root !== null ? { root, mode } : {}), ...(mut ? { mutate: true } : {}) } })
    s.display = `Seq: ${mut ? 'Mutate' : 'Generate'} ${root !== null ? `in ${keyText.value}` : '(its own key)'}`
    return
  }
  if (appId === 'chord') {
    // A new progression in the active slot (AI or built-in, per the rig's Generate mode).
    dispatchRig({ name: 'cp-generate', detail: { mode: s.generateMode } })
    s.display = `Chord: Generate (${s.generateMode === 'ai' ? 'AI — built-in if not configured' : 'built-in'})`
    return
  }
  dispatchRig({ name: 'dm-generate' })
  s.display = 'Drum: Generate (current style)'
}
/** A row's Fill button (rig layout; Mutate stays on Shift + Generate): the Drum Machine's Fill in LIVE. */
function onRowFill(appId) {
  focusApp.value = appId
  if (live.value && appId !== 'drum') return notConnected(`${s.apps.find(x => x.id === appId).label} Fill (Drum Machine only)`)
  onFill()
}
function onFill() {
  if (live.value) { dispatchRig({ name: 'dm-trigger-fill' }); s.display = drumStore.fillWhen === 'bar' && drumStore.isPlaying ? 'Drum: Fill on the next bar' : 'Drum: Fill'; return }
  s.fill = true; s.display = `Fill ${s.clock.running ? 'on the next bar' : 'armed'}`
}
/**
 * A section (LIVE), like a scene in Session View: every connected app with that slot filled goes to
 * it as with its pad — on its track's Trigger sync, a stopped app starts; following Live while it
 * is stopped, the slots are armed and start on Live's Play. An app already on that slot is left as
 * it is (a section never stops anything). Drum and Bass each go to it as their own part; Arp is left out.
 */
function onSection(i) {
  if (!live.value) return selectSection(s, i)
  const apps = s.apps.filter(a => SLOT_ROWS.includes(a.id) && a.filled[i])
  if (!apps.length) { s.display = `Section ${i + 1}: no app has slot ${SLOT_LABELS[i]}`; return }
  const arming = followingLive() && !externalGrid.active
  for (const a of apps) {
    if (arming) {
      if (a.playing !== null) continue
      rigArmed[a.id] = i
      selectSlot(a.id, i)
    } else if (a.playing !== i) {
      for (const ev of rowPadEvents(a.id, i, a.playing, liveSyncSteps(a.opts.triggerSync, externalGrid.active))) dispatchRig(ev)
    }
  }
  liveSection = i
  s.display = `Section ${i + 1} → ${apps.map(a => a.label).join(', ')} ${SLOT_LABELS[i]}${arming ? ": armed, starts on Live's Play" : externalGrid.active ? ' on their Trigger sync' : ' now'}`
}
/** LIVE: the section shown — lit while its apps play it, blinking while one is still queued or armed;
 *  dropped when none of them is on it any more (or one moved to another slot). */
function syncSection() {
  const i = liveSection
  const apps = i === null ? [] : s.apps.filter(a => SLOT_ROWS.includes(a.id) && a.filled[i])
  const waiting = apps.some(a => a.queued === i)
  const on = apps.some(a => a.playing === i) || waiting
  const left = apps.some(a => a.playing !== null && a.playing !== i && a.queued !== i)
  if (!on || left) liveSection = null
  s.section = liveSection !== null && !waiting ? liveSection : null
  s.queuedSection = liveSection !== null && waiting ? liveSection : null
}
// Repeat (hold): LIVE = the Drum Machine's Repeat (each step of the drums rolled ÷2 / ÷3 / ÷4, its
// panel's division) while held; back as it was on release (on if it was on in the panel).
let repeatWasOn = false
function repeaterOn() {
  if (s.repeater) return
  s.repeater = true
  if (live.value) {
    repeatWasOn = drumStore.repeaterActive
    drumStore.repeaterActive = true
    s.display = `Drum: Repeat ÷${drumStore.repeaterDivision} (hold)`
    return
  }
  s.display = 'Repeater (hold)'
}
function repeaterOff() {
  if (!s.repeater) return
  s.repeater = false
  if (live.value) drumStore.repeaterActive = repeatWasOn
  s.display = 'Repeater off'
}
function toggleLatch() { s.latch = !s.latch; s.display = `Latch ${s.latch ? 'on' : 'off'}` }
function toggleShift() { s.shift = !s.shift }
function toggleGenMode() { s.generateMode = s.generateMode === 'ai' ? 'builtin' : 'ai'; s.display = `Generate: ${s.generateMode === 'ai' ? 'AI' : 'built-in'}` }
const focused = computed(() => s.apps.find(a => a.id === focusApp.value))
/** The app the knobs act on (Rig Controls' app buttons). */
function setFocus(id) { focusApp.value = id; s.display = `Knobs → ${focused.value?.label ?? id}` }
const anySolo = computed(() => s.apps.some(a => a.solo))

/** Cycle the focused track's Trigger sync (Launchpad top button "Sync"). */
function cycleSync() {
  const i = TRIGGER_SYNC_OPTIONS.findIndex(o => o.value === focused.value.opts.triggerSync)
  setTrackOption(s, focused.value.id, 'triggerSync', TRIGGER_SYNC_OPTIONS[(i + 1) % TRIGGER_SYNC_OPTIONS.length].value)
}

// ── Rig actions from any MIDI-learned controller (rig-actions.ts) ─────────
// useMidiCCListener sends a mapped control as 'rig-action'; the panel acts on it while open.
function onRigAction(e) {
  const { action: a, value } = e.detail ?? {}
  if (!a) return
  const app = a.app ? s.apps.find(x => x.id === a.app) : null
  switch (a.kind) {
    case 'slot': onSlotDown(a.app, a.slot); onSlotUp(a.app, a.slot); return
    case 'gen': return onGenerate(a.app)
    case 'mute': return toggleMute(s, a.app)
    case 'solo': return toggleSolo(s, a.app)
    case 'sync':
      focusApp.value = a.app
      cycleSync()
      s.display = `${app.label} Trigger sync: ${SYNC_SHORT[app.opts.triggerSync]}`
      return
    case 'fill': return onFill()
    case 'chain': return toggleChain(a.app)
    case 'play': return togglePlay()
    case 'section': return onSection(a.index)
    case 'key_down': return onKeyShift(-1)
    case 'key_up': return onKeyShift(1)
    case 'key_mode': return onKeyMode()
    case 'intensity': if (app) app.intensity = value; return
    case 'density': if (app) app.density = value; return // Arp: octave (Drum / Seq go to rigDensity directly)
    case 'global': s.globalIntensity = value; return
    case 'tap': return tap()
    case 'tempo_down': return tempoStep(-1)
    case 'tempo_up': return tempoStep(1)
    case 'tempo_round': return tempoRound()
    case 'tempo': return tempoKnob(value)
  }
}
window.addEventListener('rig-action', onRigAction)
onUnmounted(() => window.removeEventListener('rig-action', onRigAction))

// ── SY.CORE Rig device in Live (through SY.CORE Link): the grid's state out, its clicks in ──
const rigLinkState = () => ({
  // the device's rows in its order (Chord, Drum, Seq, Bass, Arp), whatever the Rig's row order
  rows: RIG_LINK_ORDER.map(id => s.apps.find(a => a.id === id)).map(a => ({
    filled: a.filled.reduce((m, f, i) => (f ? m | (1 << i) : m), 0),
    playing: a.playing ?? -1, queued: a.queued ?? -1, muted: !!a.muted, solo: !!a.solo, gen: genCount[a.id] ?? 0,
  })),
  section: s.section ?? -1,
  queuedSection: s.queuedSection ?? -1,
  fill: live.value ? rigReports.fill : s.fill,
  chord: chordStore.isPlaying ? rigChord(
    { name: chordStore.playingChordName, duration: chordStore.playingChordDuration, ms: chordStore.playingChordMs, bars: chordStore.playingChordBars, seq: chordStore.playingChordSeq },
    chordStore.nextChord,
    chordQueuedSlot(),
    DURATION_LABELS,
  ) : null,
  // the Launchpad layout as on screen (top 8, pads 8×8 by rows, side 8): the device draws it as is
  lp: rigLinkLaunchpad({
    top: lpTop.value.map(t => ({ label: t.label, color: t.color })),
    pads: Array.from({ length: 64 }, (_, i) => { const p = lpPad(Math.floor(i / 8), i % 8); return { label: p.short, color: p.color } }),
    side: Array.from({ length: 8 }, (_, i) => { const p = lpSide(i); return { label: p.short, color: p.color } }),
  }),
})
// The Chord slot that takes over at the end of the one playing (Trigger sync / armed), if another.
function chordQueuedSlot() {
  const q = rigReports.queued.chord ?? rigArmed.chord
  return q !== null && q !== undefined && q !== chordStore.playingSlotIndex ? chordStore.slots[q] ?? null : null
}

/** Right-click on a rig control: MIDI Learn it (any controller). The learned ones get an amber ring. */
const mappingStore = useMappingStore()
function learnMenu(ev, name, label) {
  ev.preventDefault()
  openMenu(ev, { name, label: `Rig: ${label}` })
}
const learnedRing = name => (mappingStore.mappedParams.has(name) ? 'ring-1 ring-amber-500/70' : '')

// LED feedback to MIDI-learned rig controls: the same note / CC sent back to the controller, with
// the controller's palette (rig-actions.ts: Launchpad MK1 colours, else lit 127 / dark 0) — slots
// filled / playing / blinking while queued or armed; Mute / Solo while on. Only changes are sent;
// all dark when the panel closes.
// Applied templates' LED palette and init SysEx are kept per MIDI port.
const LS_RIG_TPL = 'S1_RIG_TEMPLATE_LEDS'
const tplLeds = reactive((() => { try { return JSON.parse(localStorage.getItem(LS_RIG_TPL) || '{}') } catch { return {} } })())
const ledBlink = ref(false)
const stopBlink = createWorkerTicker(() => { ledBlink.value = !ledBlink.value }, 300) // not throttled while hidden
const ledSent = new Map()
function sendRigLed(m, val) {
  const out = m.device ? midiService.getOutputs().find(o => o.name === m.device) : null
  if (!out) return
  const ch = (m.channel ?? 0) & 0x0f
  try {
    if ('cc' in m) out.send([0xB0 | ch, m.cc, val])
    else if ('note' in m) out.send([0x90 | ch, m.note, val])
  } catch {}
}
function rigLeds(off = false) {
  const apps = s.apps.map(a => ({ id: a.id, playing: a.playing, queued: a.queued, muted: a.muted, solo: a.solo, filled: a.filled }))
  for (const [key, m] of Object.entries(mappingStore.midiMappings)) {
    if (typeof m !== 'object' || !m.paramName?.startsWith('rig_')) continue
    const st = off ? 'off' : rigLedState(m.paramName, apps, ledBlink.value)
    if (st === null) continue
    const val = { ...ledPaletteFor(m.device), ...(tplLeds[m.device]?.palette ?? {}) }[st]
    if (ledSent.get(key) === val) continue
    ledSent.set(key, val)
    sendRigLed(m, val)
  }
}
watch(() => [ledBlink.value, mappingStore.midiMappings, ...s.apps.map(a => `${a.playing}/${a.queued}/${a.muted}/${a.solo}/${a.filled.join('')}`)], () => rigLeds(), { deep: true })
onUnmounted(() => { stopBlink(); ledSent.clear(); rigLeds(true) })

// ── Controller templates (rig-template.ts): a controller's rig mappings as a JSON file ──
const saveTplLeds = () => { try { localStorage.setItem(LS_RIG_TPL, JSON.stringify(tplLeds)) } catch {} }
const tplDevice = ref('')
const tplMsg = ref('')
const tplFile = ref(null)
const inputNames = ref([])
const refreshInputs = () => { inputNames.value = midiService.getInputs().map(i => i.name).filter(Boolean) }
const mappedDevices = computed(() => rigMappedDevices(mappingStore.midiMappings))
/** The ports to pick from: connected inputs, plus the ones with rig controls learned. */
const tplDevices = computed(() => [...new Set([...inputNames.value, ...mappedDevices.value.map(d => d.device)])])
const tplCount = computed(() => mappedDevices.value.find(d => d.device === tplDevice.value)?.count ?? 0)
function sendInit(device, init) {
  const out = midiService.getOutputs().find(o => o.name === device)
  if (!out) return
  for (const hex of init ?? []) { const b = sysexBytes(hex); if (b) try { out.send(b) } catch {} }
}
// Controllers that need their init (e.g. a programmer mode) get it again when the panel opens.
for (const [dev, t] of Object.entries(tplLeds)) sendInit(dev, t.init)
refreshInputs()
tplDevice.value = mappedDevices.value[0]?.device ?? inputNames.value[0] ?? ''

function exportTemplate() {
  const dev = tplDevice.value
  if (!dev || !tplCount.value) { tplMsg.value = 'No rig controls learned on this controller yet'; return }
  const kept = tplLeds[dev]
  const t = exportRigTemplate(mappingStore.midiMappings, dev, dev, {
    ...(kept?.init?.length ? { init: kept.init } : {}),
    ...(kept?.palette ? { leds: { palette: kept.palette } } : {}),
  })
  const url = URL.createObjectURL(new Blob([JSON.stringify(t, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = templateFileName(t)
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  tplMsg.value = `Exported ${Object.keys(t.controls).length} controls`
}
async function importTemplate(ev) {
  const file = ev.target.files?.[0]
  ev.target.value = ''
  if (!file) return
  const res = parseRigTemplate(await file.text())
  if ('error' in res) { tplMsg.value = res.error; return }
  const { template: t, warnings } = res
  refreshInputs()
  // The port named by the template (connected), else the one picked here.
  const dev = inputNames.value.find(n => templateMatches(t, n)) ?? tplDevice.value
  if (!dev) { tplMsg.value = `Connect the controller${t.match ? ` (${t.match})` : ''} or pick a port`; return }
  const existing = mappedDevices.value.find(d => d.device === dev)?.count ?? 0
  if (existing && !window.confirm(`Replace the ${existing} rig controls learned on ${dev} with "${t.name}"?`)) return
  mappingStore.midiMappings = applyRigTemplate(mappingStore.midiMappings, t, dev)
  mappingStore.saveMidiMappings()
  tplLeds[dev] = { name: t.name, palette: t.leds?.palette ?? null, init: t.init ?? [] }
  saveTplLeds()
  sendInit(dev, t.init)
  tplDevice.value = dev
  ledSent.clear()
  rigLeds()
  tplMsg.value = `"${t.name}" → ${dev}: ${Object.keys(t.controls).length} controls${warnings.length ? ` · ${warnings.length} skipped: ${warnings.join('; ')}` : ''}`
}
function clearTemplate() {
  const dev = tplDevice.value
  if (!dev || !tplCount.value) return
  if (!window.confirm(`Forget the ${tplCount.value} rig controls learned on ${dev}?`)) return
  rigLeds(true)
  mappingStore.midiMappings = clearRigMappings(mappingStore.midiMappings, dev)
  mappingStore.saveMidiMappings()
  delete tplLeds[dev]
  saveTplLeds()
  ledSent.clear()
  tplMsg.value = `Rig controls of ${dev} forgotten`
}
const isRigApp = id => RIG_ACTION_APPS.includes(id)

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
/** The Launchpad's row 6 (Performance pads). */
const LP_PERF_LABELS = ['Fill', 'Auto', 'Now/Bar', 'Repeat', 'Latch', 'Drum Chain', 'Chord Chain', 'Seq Chain']
// Row 6, pads 6–8: the apps' Chain mode (dark red off · red blinking on), taken at the end of the bar /
// slot / pattern playing (on: the chain from its start; off: what was playing, looped).
const CHAIN_PADS = { 5: 'drum', 6: 'chord', 7: 'seq' }
const CHAIN_SHORT = { drum: 'D·CHN', chord: 'C·CHN', seq: 'S·CHN' }
const CHAIN_NAME = { drum: 'Drum', chord: 'Chord', seq: 'Seq' }
function chainOn(id) {
  return id === 'drum' ? drumStore.chainEnabled : id === 'chord' ? chordStore.chainEnabled : seqStore.chainEnabled
}
function chainEmpty(id) {
  return id === 'drum' ? !useDrumMachineEngine().chain.value.some(Boolean)
    : id === 'chord' ? !chordStore.chain.some(i => i >= 0)
    : !seqStore.chain.some(i => i !== null && i >= 0)
}
function toggleChain(id) {
  const on = !chainOn(id)
  if (id === 'drum') drumStore.chainEnabled = on
  else if (id === 'chord') chordStore.chainEnabled = on
  else seqStore.setChainEnabled(on)
  const when = id === 'drum' ? 'next bar' : id === 'chord' ? 'end of the slot' : 'end of the pattern'
  s.display = `${CHAIN_NAME[id]} Chain ${on ? 'on' : 'off'}${chainEmpty(id) ? ' (no chain set: set it in its panel)' : ` — from the ${when}`}`
}

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
  redDim: 'bg-red-950/70 border-red-900/80 text-red-300/80',
  redFlash: 'bg-red-600 border-red-400 text-white animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.7)]',
}
const btn = 'px-2 py-1.5 rounded-md border text-[10px] font-bold uppercase tracking-wider transition-colors select-none'
const btnIdle = 'bg-white/[0.04] border-white/10 text-neutral-300 hover:bg-white/10'
const btnOn = 'bg-emerald-500/80 border-emerald-300 text-black'
// The Fill buttons (Rig layout, Rig Controls): dark amber idle · light amber blinking waiting · red playing
const FILL_CLASS = {
  idle: 'bg-amber-950/60 border-amber-900/70 text-amber-200/80 hover:bg-amber-900/60',
  waiting: 'bg-amber-400/80 border-amber-200 text-black animate-pulse',
  playing: 'bg-red-600 border-red-400 text-white',
}
const fillClass = computed(() => FILL_CLASS[live.value ? fillLook(rigReports) : s.fill ? 'playing' : 'idle'])

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
    if (live.value && !isLiveRow(a.id)) return { label: `${a.label} ${SLOT_LABELS[col]} (not connected)`, short, color: 'off' }
    const st = slotState(a, col)
    const color = a.muted && st === 'playing' ? 'red' : slotColor(st)
    return { label: `${a.label} ${SLOT_LABELS[col]}`, short, color }
  }
  // Row 6: Fill (the Drum Machine's), Auto Fill (its Autofill on / off), the Fill's Now / Bar, Repeat
  // (hold: the Drum Machine's Repeat), Latch (not connected in LIVE: the master keyboard's), Drum / Chord / Seq Chain.
  if (row === 5) {
    const label = LP_PERF_LABELS[col]
    if (!label) return { label: '—', short: '', color: 'off' }
    // Fill: dark amber idle · light amber blinking waiting (armed for the next bar) · red playing
    if (col === 0) {
      const look = live.value ? fillLook(rigReports) : s.fill ? 'playing' : 'idle'
      return { label, short: label, color: look === 'playing' ? 'red' : look === 'waiting' ? 'amberFlash' : 'amber' }
    }
    // the Drum Machine's Autofill (a fill every N bars): on green · off amber
    if (col === 1) return { label: `Auto Fill ${drumStore.autofillEnabled ? 'on' : 'off'}`, short: 'AUTO', color: drumStore.autofillEnabled ? 'green' : 'amber' }
    // the Fill's when: Now (amber) · Bar (green — armed, the whole next bar)
    if (col === 2) return drumStore.fillWhen === 'bar'
      ? { label: 'Fill: next bar', short: 'BAR', color: 'green' }
      : { label: 'Fill: now', short: 'NOW', color: 'amber' }
    if (col === 3) return { label: 'Repeat (hold)', short: label, color: s.repeater || (live.value && drumStore.repeaterActive) ? 'green' : 'amber' }
    if (CHAIN_PADS[col]) {
      const id = CHAIN_PADS[col], on = chainOn(id)
      return { label: `${label} ${on ? 'on' : 'off'}`, short: CHAIN_SHORT[id], color: on ? 'redFlash' : 'redDim' }
    }
    if (live.value) return { label: `${label} (not connected)`, short: label, color: 'off' }
    return { label, short: label, color: s.latch ? 'green' : 'amber' }
  }
  // Row 7: the sections (scenes A–H on every app).
  if (row === 6 && sMode.value === 'captures') {
    const c = captures.state, p = c.play[col]
    if (!c.clips[col]) {
      const picked = c.selected === col
      return { label: `Capture ${col + 1}: empty${picked ? ' (next capture)' : ''}`, short: `C${col + 1}`, color: picked ? (c.recording ? 'redFlash' : 'redDim') : 'off' }
    }
    if (c.recording && c.selected === col) return { label: `Capture ${col + 1}: ${clipSummary(c.clips[col])} · recorded over by the capture`, short: `C${col + 1}`, color: 'redFlash' }
    const color = p === 'playing' ? 'green' : p === 'queued' || p === 'stopping' ? 'amberFlash' : 'amber'
    return { label: `Capture ${col + 1}: ${clipSummary(c.clips[col])} · ${p === 'queued' && !captures.clockRunning() ? 'waits for Play' : p}`, short: `C${col + 1}`, color }
  }
  if (row === 6) {
    const color = s.section === col ? 'green' : s.queuedSection === col ? 'amberFlash' : sectionHasContent(col) ? 'amber' : 'off'
    return { label: `Section ${col + 1}`, short: `S${col + 1}`, color }
  }
  // Row 8: Mute 1–5 = the app rows (Drums, Chords, Sequencer, Bassline, Arp), as the MIDImix's Mute; 6–8 free.
  const a = s.apps[col]
  if (!a) return { label: `Mute ${col + 1} (free)`, short: '', color: 'off' }
  return { label: `Mute ${col + 1} · ${a.label}`, short: `Mute ${col + 1}`, color: a.muted ? 'red' : 'amber' }
}

function lpSide(row) {
  // Side: GEN Drum / Chord / Seq / Bass · Key − · Key + (Shift: Maj/Min) · Capt · Row S mode
  if (row === 4) return { label: LP_SIDE_LOW_LABELS[1], short: 'K−', color: 'amber' }
  if (row === 5) return { label: LP_SIDE_LOW_LABELS[2], short: 'K+', color: 'amber' }
  if (row === 6) return { label: captures.state.recording ? 'Capture: recording (press: stop)' : 'Capture (press: record)', short: 'Capt', color: captures.state.recording ? 'redFlash' : 'redDim' }
  if (row === 7) return sMode.value === 'captures'
    ? { label: 'Row S: Captures (press: Sections)', short: 'S·CAP', color: 'red' }
    : { label: 'Row S: Sections (press: Captures)', short: 'S·SEC', color: 'amber' }
  if (row < 5) {
    // LIVE: Generate is connected for the Drum Machine, Chord Prog and Sequencer; Mutate (Shift) for the Sequencer.
    const off = live.value && (!GEN_APPS.includes(s.apps[row].id) || (s.shift && s.apps[row].id !== 'seq'))
    return { label: `${s.apps[row].label} ${s.shift ? 'Mutate' : 'Generate'}`, short: s.shift ? 'MUT' : 'GEN', color: off ? 'off' : s.shift ? 'green' : 'amber' }
  }
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
function toggleFollowPlay() {
  rigFollowPlay.value = !rigFollowPlay.value
  s.display = rigFollowPlay.value ? 'Live Play: starts the armed slots' : 'Live Play off: Live\'s Play starts nothing (listen back) — pads still start their slots'
}
function toggleAutoFill() {
  drumStore.autofillEnabled = !drumStore.autofillEnabled
  s.display = `Drum: Auto Fill ${drumStore.autofillEnabled ? 'on' : 'off'}`
}
function toggleFillWhen() {
  drumStore.fillWhen = drumStore.fillWhen === 'bar' ? 'now' : 'bar'
  s.display = `Fill: ${drumStore.fillWhen === 'bar' ? 'the whole next bar' : 'now, to the end of this bar'}`
}
function lpPadDown(row, col) {
  if (row < 5) return onSlotDown(s.apps[row].id, col)
  if (row === 5) {
    if (col === 0) return onFill()
    if (col === 1) return toggleAutoFill()
    if (col === 2) return toggleFillWhen()
    if (col === 3) return repeaterOn()
    if (CHAIN_PADS[col]) return toggleChain(CHAIN_PADS[col])
    if (col !== 4) return
    if (live.value) return notConnected('Latch (the master keyboard\'s)')
    return toggleLatch()
  }
  if (row === 6) return sMode.value === 'captures' ? onCapturePad(col) : onSection(col)
  if (s.apps[col]) toggleMute(s, s.apps[col].id)
}
function lpPadUp(row, col) {
  if (row < 5) return onSlotUp(s.apps[row].id, col)
  if (row === 5 && col === 3) repeaterOff()
}
function lpSideDown(row) {
  if (row < 4) return onGenerate(s.apps[row].id)
  if (row === 6) return onCapt()
  if (row === 7) return toggleSMode()
  if (s.shift && live.value) return onKeyMode()
  onKeyShift(row === 4 ? -1 : 1)
}

// The device's state out / presses in — set up here, after the Launchpad view it sends (lpTop…).
let rigLinkJson = ''
watch(() => JSON.stringify(rigLinkState()), json => { rigLinkJson = json; linkClient.sendRig(JSON.parse(json)) }, { immediate: true })
const offRigLink = linkClient.on(e => {
  // (re)connected: the devices get the state again; a click on a device: as a learned rig button
  if (e.type === 'hello' && rigLinkJson) linkClient.sendRig(JSON.parse(rigLinkJson))
  else if (e.type === 'rig-press') {
    // the device's Launchpad layout: a pad / side / top button pressed or released, as on the Launchpad
    const lp = parseRigLinkPress(e.name)
    if (lp) {
      if (lp.kind === 'pad') { if (lp.down) lpPadDown(lp.row, lp.col); else lpPadUp(lp.row, lp.col) }
      else if (lp.kind === 'side') { if (lp.down) lpSideDown(lp.index) }
      else if (lp.down) lpTopDown(lp.index)
      else lpTopUp(lp.index)
      return
    }
    const action = parseRigAction(e.name)
    if (action) window.dispatchEvent(new CustomEvent('rig-action', { detail: { action } }))
  }
})
onUnmounted(() => { offRigLink(); linkClient.sendRig(null) })

// ── Key (LIVE: the Chord Prog's key, root + mode — chord-key.ts) ──────────
/** The key shown: LIVE = the Chord Prog's ("Cm", "Bb", "Eb/Cm"); SIM = the rig's own. */
const keyText = computed(() => (live.value ? keyLabel(chordStore.selectedKey, chordStore.keyMode) || '—' : KEY_NAMES[s.key]))
/** Key ◀ ▶: LIVE moves the Chord Prog's tonic a semitone, in the same mode (a genre / modal library
 *  goes back to the keys, from C). */
function onKeyShift(delta) {
  if (!live.value) return shiftKey(s, delta)
  const mode = chordStore.keyMode
  const root = keyRoot(chordStore.selectedKey, mode) ?? (mode === 'minor' ? 9 : 0)
  chordStore.selectedKey = keyFile(root + delta + 12, mode)
  s.display = `Key ${keyText.value} (Chord Prog)`
}
/** Maj/Min (Launchpad: Shift + Key): LIVE switches the Chord Prog between the major and the minor
 *  key on the same tonic (C ↔ Cm); from Both, it picks the major. */
function onKeyMode() {
  if (!live.value) return notConnected('Major / minor')
  const mode = chordStore.keyMode
  const root = keyRoot(chordStore.selectedKey, mode ?? 'major') ?? 0
  const next = mode === 'major' ? 'minor' : 'major'
  chordStore.keyMode = next
  chordStore.selectedKey = keyFile(root, next)
  s.display = `Key ${keyText.value} (Chord Prog)`
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
// Rig mode takes the Launchpad's input over before anything else (rigIngress below: MIDI
// Learn, MIDI Actions, the Loop Machine's and Chord Prog's own listeners, Thru): its mappings
// stay as they are and work again when Rig mode is off.
const lpActive = () => rigLaunchpad.handler === onLaunchpadMidi
function lpRigOn() {
  rigLaunchpad.handler = onLaunchpadMidi
  lpSent = null
  if (lpSend(RIG_INIT_MESSAGES)) pushLeds()
}
function lpRigOff() {
  if (!lpActive()) return
  rigLaunchpad.handler = null
  lpSent = null
  unmuteOtherSenders(p => isLaunchpadName(p.name))
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

// ── Physical AKAI MIDImix in Rig mode (rig-midimix.ts) ─────────────────────
// On: its pots, faders and buttons are the strips above (no usual mappings),
// absolute pots with pickup; Mute/Rec Arm/Bank LEDs show the state.
const LS_MIX_RIG = 'SYCORE_RIG_MIDIMIX'
const mixRig = ref(localStorage.getItem(LS_MIX_RIG) === '1')
const mixOutput = computed(() => midiStore.outputs.find(o => isMidimixName(o.name)) ?? null)
const mixPickup = new Pickup()
const mixMap = ref(loadMixMap()) // learned controls (a MIDImix reprogrammed with the Akai editor)
let mixActive = false
let mixSent = null

const mixLeds = computed(() => {
  const st = mixStrips.value
  return [
    ...st.map(x => !!x.mute?.on),
    ...st.map(x => !!x.rec?.on),
    mixPage.value === 'app', mixPage.value === 'lane',
  ]
})
const mixPort = () => midiService.getOutputs().find(o => isMidimixName(o.name)) ?? null
const mixLastOut = ref('')
function mixSend(msgs) {
  const o = mixPort()
  if (!o) { mixLastOut.value = 'no MIDImix output port'; return false }
  mixLastOut.value = `${o.name}: ${msgs.slice(-2).map(m => hex(m)).join(' · ')}`
  muteOtherSenders(o) // MIDI Learn feedback would overwrite the rig's LEDs
  for (const m of msgs) rigSend(o, m)
  return true
}
function pushMixLeds() {
  if (!mixActive) return
  const next = mixLeds.value
  const msgs = mixLedDiff(mixSent, next, mixMap.value)
  if (msgs.length && mixSend(msgs)) mixSent = next.slice()
}
/** Apply an absolute pot/fader through pickup; while it hasn't reached the value, show where to move it. */
function mixTake(key, label, hw, get, set) {
  const cur = get()
  const v = mixPickup.take(`${mixPage.value}:${lanePageOffset.value}:${key}`, hw, cur)
  if (v !== null) { set(v); s.display = `${label} ${v}`; return }
  s.display = `${label} ${cur} · pickup: move ${hw < cur ? 'up ▲' : 'down ▼'} (${hw})`
}
// Diagnostics: the last message from a MIDImix-named input (Rig mode on or off) and how it was read.
const mixLastIn = ref('')
const hex = d => Array.from(d, b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
function onMidimixMidi(data) {
  const ev = parseMidimixInput(data, mixMap.value)
  mixLastIn.value = `${hex(data)} → ${ev ? ev.kind + ('strip' in ev ? ` ${ev.strip + 1}` : '') + ('down' in ev ? (ev.down ? ' down' : ' up') : ` ${ev.value}`) : 'not a MIDImix control'}`
  if (!ev) return
  const st = mixStrips.value
  switch (ev.kind) {
    case 'knob': {
      const k = st[ev.strip]?.knobs[ev.row]
      if (k) mixTake(`${ev.strip}k${ev.row}`, `${st[ev.strip].title} ${k.label}`, ev.value, k.get, k.set)
      return
    }
    case 'fader': {
      const f = st[ev.strip]?.fader
      if (f) mixTake(`${ev.strip}f`, `${st[ev.strip].title} ${f.label}`, ev.value, f.get, f.set)
      return
    }
    case 'master':
      mixTake('master', 'Global', ev.value, () => s.globalIntensity, v => { s.globalIntensity = v })
      return
    case 'mute': if (ev.down) st[ev.strip]?.mute?.press(); return
    case 'rec': if (ev.down) st[ev.strip]?.rec?.press(); return
    case 'solo': // a Mute button with SOLO held: Solo on the App page, lanes 9–16 on the Lane page
      if (!ev.down) return
      if (mixPage.value === 'app') st[ev.strip]?.rec?.press()
      else { const was = s.shift; s.shift = true; mixStrips.value[ev.strip]?.mute?.press(); s.shift = was }
      return
    case 'soloButton': s.shift = ev.down; return
    case 'bankLeft': if (ev.down) mixPage.value = 'app'; return
    case 'bankRight': if (ev.down) mixPage.value = 'lane'; return
  }
}
function mixRigOn() {
  mixActive = true
  mixSent = null
  mixPickup.reset()
  pushMixLeds()
}
function mixRigOff() {
  if (!mixActive) return
  mixActive = false
  const o = mixPort()
  if (o) for (const m of mixLedsOff(mixMap.value)) rigSend(o, m)
  mixSent = null
  unmuteOtherSenders(p => isMidimixName(p.name))
}
watch(mixLeds, pushMixLeds)

// ── MIDImix map Learn: pick a control on screen, then move/press it on the MIDImix ──
// Roles in learning order (strip by strip, then the master section); after each
// one the next is picked. Roles not learned keep the factory message.
const MIX_LEARN_ROWS = [
  ['knob', 0, 'K1'], ['knob', 1, 'K2'], ['knob', 2, 'K3'],
  ['mute', null, 'Mute'], ['solo', null, 'Solo+Mute'], ['rec', null, 'Rec Arm'], ['fader', null, 'Fader'],
]
const MIX_MASTER_ROLES = [['bankLeft', 'Bank ◀'], ['bankRight', 'Bank ▶'], ['soloButton', 'SOLO'], ['master', 'Master']]
const MIX_ROLE_ORDER = [
  ...Array.from({ length: 8 }, (_, strip) => MIX_LEARN_ROWS.map(([kind, row]) => roleId({ kind, strip, row: row ?? undefined }))).flat(),
  ...MIX_MASTER_ROLES.map(([r]) => r),
]
const mixLearn = ref(false)
const mixLearnRole = ref(null)
let mixLearnLastKey = null // the message just learned: its release / further values don't learn the next role
watch(mixLearn, on => { mixLearnRole.value = on ? MIX_ROLE_ORDER[0] : null; mixLearnLastKey = null })
const mixRoleLabel = role => mixMsgLabel(mixMap.value, role)
const mixRoleLearned = role => !!mixMap.value[role]
function mixLearnMessage(d) {
  const key = `${d[0] & 0xEF}:${d[1]}`
  if (key === mixLearnLastKey) return
  const m = learnMixMsg(d)
  if (!m || !mixLearnRole.value) return
  const role = mixLearnRole.value
  mixMap.value = assignMix(mixMap.value, role, m)
  saveMixMap(mixMap.value)
  mixLearnLastKey = key
  s.display = `MIDImix ${role} = ${mixRoleLabel(role)}`
  const next = MIX_ROLE_ORDER[MIX_ROLE_ORDER.indexOf(role) + 1]
  mixLearnRole.value = next ?? null
  if (!next) mixLearn.value = false
}
function mixMapReset() {
  mixMap.value = {}
  saveMixMap({})
  s.display = 'MIDImix map: factory'
}
watch(mixMap, () => { mixSent = null; pushMixLeds() })
watch(mixRig, on => {
  localStorage.setItem(LS_MIX_RIG, on ? '1' : '0')
  if (on) mixRigOn(); else mixRigOff()
}, { immediate: true })
let mixReinit = null
watch(() => mixOutput.value?.id, id => {
  clearTimeout(mixReinit)
  if (id && mixRig.value) mixReinit = setTimeout(mixRigOn, 400)
})
onUnmounted(() => { clearTimeout(mixReinit); mixRigOff() })

// ── Rig keys: hardware buttons ("Ableton Live mode"), learned ─────────────
// All: both controllers — off remembers which were on, on puts them back (both by default).
// LP / Mix: that controller only.
const toggleBindings = reactive(Object.fromEntries(RIG_TOGGLE_SLOTS.map(k => [k, loadToggle(k)])))
const learningToggle = ref(null) // the slot being learned, or null
const TOGGLE_SLOT_LABEL = { all: 'All', lp: 'LP', mix: 'Mix' }
const LS_TOGGLE_SET = 'SYCORE_RIG_TOGGLE_SET'
function toggleRigMode() {
  if (lpRig.value || mixRig.value) {
    localStorage.setItem(LS_TOGGLE_SET, JSON.stringify({ lp: lpRig.value, mix: mixRig.value }))
    lpRig.value = false
    mixRig.value = false
    s.display = 'Rig mode off · usual mappings back'
    return
  }
  let set = { lp: true, mix: true }
  try { set = { ...set, ...JSON.parse(localStorage.getItem(LS_TOGGLE_SET) ?? '{}') } } catch {}
  if (!set.lp && !set.mix) set = { lp: true, mix: true }
  lpRig.value = set.lp
  mixRig.value = set.mix
  s.display = 'Rig mode on'
}
function toggleSlot(slot) {
  if (slot === 'all') return toggleRigMode()
  if (slot === 'lp') { lpRig.value = !lpRig.value; s.display = `Launchpad Rig ${lpRig.value ? 'on' : 'off'}` }
  else { mixRig.value = !mixRig.value; s.display = `MIDImix Rig ${mixRig.value ? 'on' : 'off'}` }
}
function setToggle(slot, b) {
  // One button, one slot: learning it here takes it away from another slot.
  if (b) for (const k of RIG_TOGGLE_SLOTS) if (k !== slot && sameToggle(toggleBindings[k], b)) setToggle(k, null)
  toggleBindings[slot] = b
  saveToggle(b, slot)
}
function clearToggle(slot) {
  setToggle(slot, null)
  learningToggle.value = null
}

// One exclusive input for the rig: the toggle button, then the controllers in Rig mode.
function rigIngress(e) {
  const d = e.data
  if (!d || d.length < 2 || d[0] >= 0xF0) return false
  const name = e.target?.name
  if (learningToggle.value) {
    const b = learnToggle(name, d)
    if (b) {
      const slot = learningToggle.value
      setToggle(slot, b)
      learningToggle.value = null
      s.display = `Rig key ${TOGGLE_SLOT_LABEL[slot]}: ${toggleLabel(b)}`
      return true
    }
  }
  if (mixLearn.value && isMidimixName(name)) {
    mixLearnMessage(d)
    mixLastIn.value = `${hex(d)} → learn`
    return true
  }
  for (const slot of RIG_TOGGLE_SLOTS) {
    const t = matchToggle(toggleBindings[slot], name, d)
    if (t) { if (t === 'press') toggleSlot(slot); return true }
  }
  if (lpActive() && isLaunchpadName(name)) { onLaunchpadMidi(d); return true }
  if (mixActive && isMidimixName(name)) { onMidimixMidi(d); return true }
  if (isMidimixName(name)) mixLastIn.value = `${hex(d)} → Rig off (${name})`
  return false
}
midiService.setExclusiveInput(rigIngress)
onUnmounted(() => midiService.setExclusiveInput(null))

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

// The controls' sections (RigControlSections): here in the Rig layout, and in the Rig Controls panel
// (Performance), teleported there while it is open.
provide(RIG_CONTROLS_CTX, {
  s, live, focused, btn, btnIdle, btnOn, tap, cycleSync, SYNC_SHORT, isRigApp, learnMenu, tplDevice, refreshInputs, tplDevices, mappedDevices, tplLeds, tplCount, exportTemplate, importTemplate, clearTemplate, tplMsg, onFill, repeaterOn, repeaterOff, toggleLatch, chainOn, toggleChain, setFocus, learnedRing, onKeyShift, tempoStep, tempoDrag, tempoRound, drumStore, fillClass, toggleAutoFill, rigFollowPlay, toggleFollowPlay, keyText, onKeyMode, knobLabel, knobTitle, knobValue, densityMenu, toggleGenMode, holding, holdStart, holdEnd, doPanic, doInt, toggleShift,
})
</script>

<template>
  <div class="bg-neutral-950 border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden relative" :style="panelStyle" v-show="!isMinimized" @mousedown.capture="bringToFront">
    <!-- Header -->
    <div class="flex items-center justify-between gap-3 px-4 py-2 bg-gradient-to-b from-white/5 to-transparent shrink-0 touch-none cursor-grab active:cursor-grabbing select-none" @pointerdown="onDragStart">
      <div class="flex items-center gap-3">
        <div class="p-1.5 bg-amber-500/20 rounded-lg border border-amber-500/20">
          <Grid3X3 class="w-4 h-4 text-amber-400" />
        </div>
        <h2 class="text-sm font-black text-white tracking-[0.1em] uppercase">Rig Controller</h2>
        <span @mousedown.stop><PlayEditToggle panel-id="rig-controller" /></span>
        <span v-if="live && !play" class="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-[9px] font-bold uppercase tracking-wider text-emerald-300" title="Chord, Drum, Seq, Bass and Arp rows drive the real apps; the other controls are still simulated">Live · all rows connected</span>
        <span v-else-if="!live" class="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[9px] font-bold uppercase tracking-wider text-amber-300">Simulation · no MIDI</span>
      </div>
      <div class="flex items-center gap-2" @mousedown.stop>
        <div v-if="!play" class="flex rounded-md border border-white/10 overflow-hidden">
          <button v-for="v in [['rig', 'Rig layout'], ['launchpad', 'Launchpad Mini MK1'], ['midimix', 'AKAI MIDImix']]" :key="v[0]"
                  class="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
                  :class="view === v[0] ? 'bg-white/15 text-white' : 'text-neutral-400 hover:text-white hover:bg-white/5'"
                  @click="view = v[0]">{{ v[1] }}</button>
        </div>
        <MacOsButtons @close="emit('close')" @minimize="toggleMinimize" @maximize="maximize" />
      </div>
    </div>

    <!-- Mode bar: LIVE (real apps and clock) or SIM (simulated Live) -->
    <div v-if="!play" class="flex items-center gap-3 px-4 py-1.5 border-y border-white/5 bg-white/[0.02] text-[10px] text-neutral-400 shrink-0">
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
      <button class="px-2 py-0.5 rounded border font-bold uppercase"
              :class="mixRig ? (mixOutput ? 'bg-emerald-500/80 border-emerald-300 text-black' : 'bg-amber-500/40 border-amber-300 text-amber-50') : 'border-white/15 text-neutral-300 hover:bg-white/10'"
              :title="mixRig ? (mixOutput ? `Rig mode on ${mixOutput.name}: its pots, faders and buttons drive the rig (pickup), its LEDs show it. Off: its usual mappings come back` : 'Rig mode on, no MIDImix found') : 'Use the AKAI MIDImix as the rig mixer (its usual mappings are paused meanwhile)'"
              @click="mixRig = !mixRig">MIDImix {{ mixRig ? (mixOutput ? 'Rig ●' : 'Rig · not found') : 'Rig off' }}</button>
      <span class="flex items-center gap-1">
        <span class="uppercase tracking-widest text-neutral-500" title="Hardware buttons that switch Rig mode: All = both controllers (the ones that were on), LP = the Launchpad only, Mix = the MIDImix only">Rig keys</span>
        <template v-for="slot in RIG_TOGGLE_SLOTS" :key="slot">
          <button class="px-1.5 py-0.5 rounded border font-bold"
                  :class="learningToggle === slot ? 'bg-amber-500 border-amber-300 text-black animate-pulse' : toggleBindings[slot] ? 'border-emerald-400/50 text-emerald-300 hover:bg-white/10' : 'border-white/15 text-neutral-400 hover:bg-white/10'"
                  :title="`${{ all: 'Both controllers', lp: 'Launchpad only', mix: 'MIDImix only' }[slot]} · ${toggleBindings[slot] ? toggleLabel(toggleBindings[slot]) + ' · click to learn again' : 'click, then press a button'}`"
                  @click="learningToggle = learningToggle === slot ? null : slot">{{ TOGGLE_SLOT_LABEL[slot] }} {{ learningToggle === slot ? '…' : toggleShortLabel(toggleBindings[slot]) }}</button>
          <button v-if="toggleBindings[slot] && learningToggle !== slot" class="px-0.5 text-neutral-500 hover:text-white" :title="`Forget the ${TOGGLE_SLOT_LABEL[slot]} Rig key`" @click="clearToggle(slot)">✕</button>
        </template>
      </span>
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
      <span v-if="live" class="ml-auto truncate">Pads: Latch on the track's Trigger sync, on Live's grid. Live stopped: a pad arms its slot, it starts on Live's Play; Live's Stop stops all. Seq switches at the end of its pattern. Drum and Bass: independent parts of the Drum Machine. Arp: pads pick its mode.</span>
      <span v-else class="ml-auto truncate">The controller only shows SY.CORE's state; each track's options decide how and when its slots start.</span>
    </div>

    <div :class="['flex-1 text-xs min-h-0', play ? 'overflow-hidden p-3 flex flex-col gap-2' : 'overflow-auto p-4']">
      <!-- ═══════════ RIG LAYOUT ═══════════ -->
      <div v-if="shownView === 'rig'" class="grid gap-3" style="grid-template-columns: 220px minmax(420px, 1fr) 230px">
        <!-- Left column -->
        <div class="space-y-3">
          <RigControlSections only="transport" />

          <section class="p-3 rounded-lg bg-white/[0.03] border border-white/10">
            <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Sections (Song)</h3>
            <div class="grid grid-cols-4 gap-1.5">
              <button v-for="i in SECTION_COUNT" :key="i"
                      :class="[btn, s.section === i - 1 ? btnOn : s.queuedSection === i - 1 ? 'bg-amber-400/50 border-amber-300 text-white animate-pulse' : btnIdle]"
                      @contextmenu="learnMenu($event, `rig_section_${i}`, `Section ${i}`)"
                      @click="onSection(i - 1)">{{ i }}</button>
            </div>
          </section>

          <section class="p-3 rounded-lg bg-white/[0.03] border border-white/10">
            <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2" title="Row S in Captures mode (S·CAP): Capt records, a pad plays its capture. Sets: the 8 pads saved under a name">Captures (Live Perf)</h3>
            <div class="grid grid-cols-4 gap-1.5 mb-2">
              <button v-for="i in 8" :key="i"
                      :class="[btn, captures.state.recording && captures.state.selected === i - 1 ? 'bg-red-500/50 border-red-300 text-white animate-pulse'
                        : captures.state.play[i - 1] === 'playing' ? btnOn
                        : captures.state.play[i - 1] !== 'idle' ? 'bg-amber-400/50 border-amber-300 text-white animate-pulse'
                        : captures.state.clips[i - 1] ? 'bg-amber-500/20 border-amber-400/50 text-amber-100'
                        : captures.state.selected === i - 1 ? 'bg-red-500/20 border-red-400/50 text-red-100' : btnIdle]"
                      :title="`S${i}: ${clipSummary(captures.state.clips[i - 1])} · Shift-click: clear`"
                      @click="onCapturePadClick($event, i - 1)">{{ i }}</button>
            </div>
            <button :class="[btn, 'w-full mb-2', captures.state.recording ? 'bg-red-500/60 border-red-300 text-white animate-pulse' : btnIdle]" @click="onCapt">
              {{ captures.state.recording ? 'Capt ● stop' : 'Capt' }}</button>
            <div class="flex gap-1 mb-1">
              <input v-model="captSetName" placeholder="Set name" class="flex-1 min-w-0 bg-black/40 border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white" @keydown.enter="onSaveSet" />
              <button :class="[btn, btnIdle, 'px-2']" title="Save the 8 pads as a set (same name: updated)" @click="onSaveSet">Save</button>
            </div>
            <div class="flex gap-1">
              <select v-model="captSetPick" class="flex-1 min-w-0 bg-black/40 border border-white/10 rounded px-1 py-0.5 text-[10px] text-white">
                <option value="">{{ captures.state.sets.length ? 'Sets…' : 'No sets saved' }}</option>
                <option v-for="st in captures.state.sets" :key="st.name" :value="st.name">{{ st.name }}{{ st.name === captures.state.setName ? ' ●' : '' }}</option>
              </select>
              <button :class="[btn, btnIdle, 'px-2']" :disabled="!captSetPick" title="Load onto the pads (the pads' clips before are kept in Session takes › Capt)" @click="onLoadSet">Load</button>
              <button :class="[btn, btnIdle, 'px-2']" :disabled="!captSetPick" title="Delete the set" @click="onDeleteSet">✕</button>
            </div>
          </section>

          <RigControlSections only="template" />

          <!-- Flow, splits and lane mutes: not connected to the apps yet — SIM only -->
          <section v-if="!live" class="p-3 rounded-lg bg-white/[0.03] border border-white/10 space-y-2">
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
              <div v-for="a in s.apps" :key="a.id" class="flex items-center gap-1.5" :class="a.muted || (anySolo && !a.solo) || (live && !isLiveRow(a.id)) ? 'opacity-40' : ''"
                   :title="live && !isLiveRow(a.id) ? `${a.label}: not connected yet (SIM only)` : ''">
                <button class="w-16 text-left leading-tight" :title="'Track options: ' + rowBadge(a)" @click="focusApp = a.id">
                  <span class="block text-[11px] font-bold" :class="focusApp === a.id ? 'text-amber-300' : 'text-neutral-300'">{{ a.label }}</span>
                  <span class="block text-[8px] font-mono text-neutral-500 truncate">{{ rowBadge(a) }}</span>
                </button>
                <button v-for="(l, i) in SLOT_LABELS" :key="l"
                        class="relative w-9 h-9 rounded-md border text-[11px] font-black transition-colors overflow-hidden"
                        :class="[SLOT_CLASS[slotState(a, i)], isRigApp(a.id) ? learnedRing(rigSlotParam(a.id, i)) : '']"
                        :title="`${a.label} ${l}${live && a.id === 'arp' ? ` (${RIG_ARP_MODES[i]})` : ''}: ${slotState(a, i)} · ${a.lengths[i]} bar${a.lengths[i] > 1 ? 's' : ''}${isRigApp(a.id) ? ' · right-click: MIDI Learn' : ''}`"
                        @contextmenu="isRigApp(a.id) && learnMenu($event, rigSlotParam(a.id, i), `${a.label} slot ${l}`)"
                        @pointerdown="onSlotDown(a.id, i)" @pointerup="onSlotUp(a.id, i)" @pointerleave="a.held !== null && onSlotUp(a.id, i)">
                  {{ l }}
                  <span v-if="a.filled[i] && a.lengths[i] > 1" class="absolute top-0 right-0.5 text-[7px] font-bold opacity-70">{{ a.lengths[i] }}</span>
                  <span v-if="queueOrder(a, i)" class="absolute top-0 left-0.5 text-[7px] font-bold">#{{ queueOrder(a, i) }}</span>
                  <span v-if="a.cursor === i && a.opts.press === 'holdMotion'" class="absolute inset-0 rounded-md ring-2 ring-sky-400 pointer-events-none" />
                  <span v-if="a.playing === i" class="absolute left-0 bottom-0 h-1 bg-black/50" :style="{ width: `${slotProgress(a, i) * 100}%` }" />
                </button>
                <button :class="[btn, a.muted ? 'bg-red-600 border-red-400 text-white' : btnIdle, 'ml-1', isRigApp(a.id) ? learnedRing(`rig_mute_${a.id}`) : '']" @click="toggleMute(s, a.id)"
                        @contextmenu="isRigApp(a.id) && learnMenu($event, `rig_mute_${a.id}`, `${a.label} Mute`)">M</button>
                <button :class="[btn, a.solo ? 'bg-sky-500 border-sky-300 text-black' : btnIdle, isRigApp(a.id) ? learnedRing(`rig_solo_${a.id}`) : '']" @click="toggleSolo(s, a.id)"
                        :title="`${a.label} Solo: only the soloed row plays${isRigApp(a.id) ? ' · right-click: MIDI Learn' : ''}`"
                        @contextmenu="isRigApp(a.id) && learnMenu($event, `rig_solo_${a.id}`, `${a.label} Solo`)">S</button>
                <button :class="[btn, btnIdle, isRigApp(a.id) ? learnedRing(`rig_gen_${a.id}`) : '']" @click="onGenerate(a.id)"
                        @contextmenu="isRigApp(a.id) && learnMenu($event, `rig_gen_${a.id}`, `${a.label} GEN`)">Gen</button>
                <button :class="[btn, a.id === 'drum' ? fillClass : btnIdle, live && a.id !== 'drum' ? 'opacity-40' : '']"
                        :title="a.id === 'drum' ? 'Fill (on the next bar)' : live ? 'Fill: Drum Machine only' : 'Fill'"
                        @contextmenu="learnMenu($event, 'rig_fill', 'Fill')"
                        @click="onRowFill(a.id)">Fill</button>
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

          <!-- SY.CORE Map (P12): encoders → the instrument in focus in Live — its own panel (and the DECK) -->
          <button v-if="live" class="w-full p-2 rounded-lg bg-white/[0.03] border border-white/10 text-left text-[10px] text-neutral-400 hover:text-white hover:bg-white/[0.06]"
                  @click="uiStore.openPanel('live-map')">
            <span class="font-bold uppercase tracking-widest text-neutral-300">Map · Live instruments ↗</span>
            <span class="ml-2">encoders on the instrument in focus in Live (also in the DECK)</span>
          </button>

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
            <!-- Mute / Solo scope (LIVE, real apps): the whole app or some of its MIDI Flow cables -->
            <div v-if="live && isLiveRow(focused.id)" class="mt-3 pt-2 border-t border-white/5">
              <span class="text-[10px] text-neutral-400">Mute / Solo / Intensity act on</span>
              <div v-if="focused.id === 'bass'" class="mt-1 text-[9px] text-neutral-500">the Drum Machine's bassline only (Drum, on the whole app: its drums only). Its pads turn the bassline on from a sequence or off, the drums go on. CC 7 needs the bassline's own MIDI channel.</div>
              <div v-else class="flex flex-wrap gap-1 mt-1">
                <button class="px-1.5 py-0.5 rounded border text-[9px] font-bold"
                        :class="!(muteScopes[focused.id] ?? []).length ? 'bg-amber-500/30 border-amber-400/50 text-amber-200' : 'border-white/10 text-neutral-400 hover:text-white'"
                        title="Mute/Solo and Intensity act on the whole app, on every device it's cabled to" @click="clearScope(focused.id)">Whole app</button>
                <button v-for="dev in appCables(focused.id)" :key="dev" class="px-1.5 py-0.5 rounded border text-[9px]"
                        :class="(muteScopes[focused.id] ?? []).includes(dev) ? 'bg-amber-500/30 border-amber-400/50 text-amber-200' : 'border-white/10 text-neutral-400 hover:text-white'"
                        :title="`Mute/Solo and Intensity act only on the cable ${focused.label} → ${dev}${midiService.getCableTargets(LIVE_APP_SOURCE[focused.id]).includes(dev) ? '' : ' (not cabled in MIDI Flow now)'}`"
                        @click="toggleScope(focused.id, dev)">→ {{ dev }}</button>
                <span v-if="!appCables(focused.id).length" class="text-[9px] text-neutral-600">no cables in MIDI Flow</span>
              </div>
              <div v-if="focused.id !== 'arp'" class="flex items-center gap-1 mt-2">
                <span class="text-[10px] text-neutral-400">Intensity sends</span>
                <button v-for="m in [['cc7', 'CC 7 (volume)'], ['velocity', 'Velocity'], ['both', 'Both']]" :key="m[0]" class="px-1.5 py-0.5 rounded border text-[9px]"
                        :class="intensityMode(intensityModes, focused.id) === m[0] ? 'bg-amber-500/30 border-amber-400/50 text-amber-200' : 'border-white/10 text-neutral-400 hover:text-white'"
                        :title="{ cc7: 'CC 7 = Intensity × Global, on the app\'s channel: MIDI-map it in Live to the track volume (any instrument)', velocity: 'Note-on velocity scaled by Intensity × Global (the instrument must respond to velocity)', both: 'CC 7 and velocity' }[m[0]]"
                        @click="setIntensityMode(focused.id, m[0])">{{ m[1] }}</button>
              </div>
              <div v-if="focused.id === 'arp'" class="mt-1 text-[9px] text-neutral-500">Arp: Mute / Solo only — its Density is the octave range, its Intensity the rate.</div>
              <div v-else class="mt-1 font-mono text-[9px]" :class="focused.intensity * s.globalIntensity < 127 * 127 ? 'text-amber-300' : 'text-neutral-500'">{{ velocityReadout(focused) }}</div>
            </div>
          </section>

          <section class="p-3 rounded-lg bg-black border border-emerald-500/20 font-mono">
            <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1 font-sans">Display</h3>
            <div class="text-emerald-300 text-sm truncate">{{ s.display }}</div>
            <div class="text-[10px] text-neutral-500 mt-1">
              Generate: {{ s.generateMode === 'ai' ? 'AI' : 'built-in' }} · Key {{ keyText }} · Flow: {{ flowConfig }} · Split {{ s.split + 1 }}
            </div>
          </section>
        </div>

        <!-- Right column -->
        <div class="space-y-3">
          <RigControlSections only="performance" />

          <RigControlSections only="safety" />
        </div>
      </div>

      <!-- ═══════════ LAUNCHPAD MINI MK1 ═══════════ -->
      <div v-else-if="shownView === 'launchpad'" :class="play ? 'flex-1 min-h-0 flex justify-center' : 'flex gap-6 items-start'">
        <div :class="play ? 'h-full aspect-square max-w-full select-none [container-type:size]' : 'p-4 rounded-2xl bg-neutral-900 border border-white/10 shadow-inner select-none'">
          <div class="grid gap-1.5" :class="play ? 'h-full' : ''"
               :style="play ? 'grid-template-columns: repeat(9, minmax(0, 1fr)); grid-template-rows: repeat(9, minmax(0, 1fr))' : 'grid-template-columns: repeat(9, 2.6rem)'">
            <!-- top round buttons -->
            <button v-for="(t, i) in lpTop" :key="'t' + i"
                    :class="['mx-auto rounded-full border font-sans font-semibold tracking-tight leading-tight', play ? 'w-4/5 h-4/5 my-auto text-[clamp(9px,2.1cqmin,15px)]' : 'w-9 h-9 text-[9px]', ledClass(t.color)]" :title="`${t.id} · ${t.label}`"
                    @pointerdown="lpTopDown(i)" @pointerup="lpTopUp(i)" @pointerleave="lpTopUp(i)">{{ showLabels || play ? t.label : '' }}</button>
            <span />
            <!-- 8 rows: 8 pads + 1 side button -->
            <template v-for="row in 8" :key="'r' + row">
              <button v-for="col in 8" :key="'p' + row + col"
                      :class="['rounded-md border font-sans font-semibold tracking-tight leading-tight', play ? 'w-full h-full text-[clamp(10px,2.6cqmin,18px)]' : 'w-10 h-10 text-[10px]', ledClass(lpPad(row - 1, col - 1).color)]"
                      :title="`Note ${lpGridNote(row - 1, col - 1)} · ${lpPad(row - 1, col - 1).label}`"
                      @pointerdown="lpPadDown(row - 1, col - 1)" @pointerup="lpPadUp(row - 1, col - 1)" @pointerleave="lpPadUp(row - 1, col - 1)">{{ showLabels || play ? lpPad(row - 1, col - 1).short : '' }}</button>
              <button :class="['m-auto rounded-full border font-sans font-semibold tracking-tight leading-tight', play ? 'w-4/5 h-4/5 text-[clamp(9px,2.1cqmin,15px)]' : 'w-9 h-9 text-[9px]', ledClass(lpSide(row - 1).color)]"
                      :title="`Note ${lpSideNote(row - 1)} · ${lpSide(row - 1).label}`"
                      @pointerdown="lpSideDown(row - 1)">{{ showLabels || play ? lpSide(row - 1).short : '' }}</button>
            </template>
          </div>
        </div>
        <div v-if="!play" class="space-y-3 max-w-xs">
          <label class="flex items-center gap-2 text-neutral-300"><input v-model="showLabels" type="checkbox" class="accent-amber-400" /> Show labels (the real pads have none)</label>
          <section class="p-3 rounded-lg bg-white/[0.03] border border-white/10 space-y-1 text-neutral-300">
            <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Map</h3>
            <div>Rows 1–5 · Drum, Chord, Seq, Bass, Arp × slots A–H (Arp: modes)</div>
            <div>Row 6 · Fill · Auto Fill · Now/Bar · Repeat (hold) · Latch · Drum Chain · Chord Chain · Seq Chain (dark red off · red blinking on)</div>
            <div>Row 7 · Sections 1–8 — or Captures 1–8 (side S·SEC / S·CAP)</div>
            <div>Row 8 · Mute 1–5 (Drum, Chord, Seq, Bass, Arp)</div>
            <div>Side · Generate Drum, Chord, Seq, Bass (Shift: Mutate) · Key − · Key + (Shift: Maj/Min) · Capt (record a capture) · Row S: Sections / Captures</div>
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
          <button class="ml-auto px-2 py-0.5 rounded border text-[10px] font-bold"
                  :class="mixLearn ? 'bg-amber-500 border-amber-300 text-black' : 'border-white/15 text-neutral-300 hover:bg-white/10'"
                  title="Learn the MIDImix's map (a MIDImix reprogrammed with the Akai editor, e.g. buttons sending CCs): pick a control, then move or press it"
                  @click="mixLearn = !mixLearn">{{ mixLearn ? 'Learning… done' : 'Learn map' }}</button>
          <button v-if="Object.keys(mixMap).length" class="px-2 py-0.5 rounded border border-white/15 text-[10px] text-neutral-300 hover:bg-white/10"
                  title="Forget the learned controls: back to the factory map" @click="mixMapReset">Factory map</button>
          <span class="font-mono text-[10px] text-amber-200/80" title="The last LED messages the rig sent to the MIDImix">LED out: {{ mixLastOut || '—' }}</span>
          <span class="font-mono text-[10px]" :class="mixLastIn ? 'text-sky-300' : 'text-neutral-600'" title="The last message from the MIDImix and how the rig read it">MIDImix in: {{ mixLastIn || '—' }}</span>
        </div>
        <!-- Learn map: every control of the MIDImix, with the message it sends -->
        <div v-if="mixLearn" class="p-3 rounded-2xl bg-neutral-900 border border-amber-500/30 select-none w-fit space-y-2">
          <div class="text-[10px] text-amber-200">Pick a control (the next one is picked after each), then move or press it on the MIDImix. Set the buttons to <b>momentary</b> in the Akai editor. Highlighted: learned; grey: factory.</div>
          <div class="flex gap-2">
            <div v-for="strip in 8" :key="strip" class="flex flex-col gap-1 w-20">
              <div class="text-[9px] text-center text-neutral-400 font-bold">Strip {{ strip }}</div>
              <button v-for="r in MIX_LEARN_ROWS" :key="r[0] + r[1]"
                      class="px-1 py-0.5 rounded border text-[8px] leading-tight text-left"
                      :class="mixLearnRole === roleId({ kind: r[0], strip: strip - 1, row: r[1] ?? undefined }) ? 'bg-amber-500 border-amber-300 text-black animate-pulse'
                        : mixRoleLearned(roleId({ kind: r[0], strip: strip - 1, row: r[1] ?? undefined })) ? 'border-emerald-400/50 text-emerald-200' : 'border-white/10 text-neutral-500'"
                      @click="mixLearnRole = roleId({ kind: r[0], strip: strip - 1, row: r[1] ?? undefined })">
                <b>{{ r[2] }}</b><br>{{ mixRoleLabel(roleId({ kind: r[0], strip: strip - 1, row: r[1] ?? undefined })) }}
              </button>
            </div>
            <div class="flex flex-col gap-1 w-20">
              <div class="text-[9px] text-center text-neutral-400 font-bold">Master</div>
              <button v-for="r in MIX_MASTER_ROLES" :key="r[0]"
                      class="px-1 py-0.5 rounded border text-[8px] leading-tight text-left"
                      :class="mixLearnRole === r[0] ? 'bg-amber-500 border-amber-300 text-black animate-pulse' : mixRoleLearned(r[0]) ? 'border-emerald-400/50 text-emerald-200' : 'border-white/10 text-neutral-500'"
                      @click="mixLearnRole = r[0]">
                <b>{{ r[1] }}</b><br>{{ mixRoleLabel(r[0]) }}
              </button>
            </div>
          </div>
        </div>
        <div v-else class="flex gap-3 p-4 rounded-2xl bg-neutral-900 border border-white/10 select-none w-fit">
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
            <input v-model.number="s.globalIntensity" @contextmenu="learnMenu($event, 'rig_global', 'Global intensity')" title="Right-click: MIDI Learn" type="range" min="0" max="127" class="h-28 accent-amber-400 mt-auto" style="writing-mode: vertical-lr; direction: rtl" />
            <span class="text-[8px] text-neutral-500">Global {{ s.globalIntensity }}</span>
          </div>
        </div>
        <div class="p-2 rounded bg-black border border-emerald-500/20 font-mono text-emerald-300 truncate w-fit min-w-[24rem]">{{ s.display }}</div>
      </div>
      <div v-if="play" class="shrink-0 px-2 py-1 rounded bg-black border border-amber-900/40 font-mono text-[11px] text-amber-200/80 truncate">{{ s.display }}</div>
    </div>

    <ResizeHandles :start="onResizeStart" />

    <!-- Performance: the controls in the Rig Controls panel (lib/rig-controls-host.ts) -->
    <Teleport v-if="play && rigControlsHost" :to="rigControlsHost">
      <div class="flex flex-col gap-2 text-xs min-h-0 h-full">
        <RigControlSections only="transport" />
        <RigControlSections only="performance" />
        <RigControlSections only="safety" />
        <!-- no Controller template here: set up in EDIT (the Rig layout), not while performing -->
        <button class="mt-auto shrink-0 h-14 flex items-center justify-center gap-2 rounded-lg border text-sm font-black uppercase tracking-widest select-none"
                :class="[playOn ? 'bg-emerald-500/80 border-emerald-300 text-black' : 'bg-neutral-800 border-white/15 text-neutral-200 hover:bg-neutral-700', learnedRing('rig_play')]"
                :title="(live && s.clock.source === 'EXT' ? 'Play / Stop Ableton Live (SY.CORE Link)' : 'Play / Stop the clock') + ' — right-click: MIDI Learn'"
                @click="togglePlay" @contextmenu="learnMenu($event, 'rig_play', 'Play / Stop')">
          <component :is="playOn ? Square : Play" class="w-5 h-5" /> {{ countIn.active ? `Count ${countIn.left}` : playOn ? 'Stop' : 'Play' }}
        </button>
      </div>
    </Teleport>
  </div>
</template>
