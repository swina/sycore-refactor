/**
 * rig-captures.js — the Rig's capture clips engine (one per app, module singleton): records a phrase
 * from the MIDI inputs on the song grid (Capt on the Launchpad), keeps 8 slots (row S1–S8 in Captures
 * mode, saved per user) and loops them as MIDI clips from a bar line, on the system clock
 * (StepScheduler: Live's grid when following it, the Tone.js transport's next bar on SY.CORE's own).
 *
 * MIDI Flow app **Live Perf** (MidiSource.LIVE_PERF): IN — the devices (and apps) cabled into it are
 * what Capt records (none cabled: every input; a cable's channel filter: only those channels); OUT —
 * its cables send the clips to a device on the cable's OUT ch (else the device's). The clip itself is
 * channel-free: it goes out on channel 1, which the cable / device remaps. The Rig's own controllers never
 * reach the recording (rigIngress takes their input first). Live's Stop / SY.CORE's Stop stops the
 * clips (they stay in their slots). With nothing playing a pad waits for Play and starts on its 1.
 *
 * Kept: every clip set, recorded over or cleared is journaled in Session takes (app 'capt'); named
 * sets of the 8 pads in IndexedDB (saveSet / loadSet / deleteSet).
 */
import { reactive, watch } from 'vue'
import { getTransport } from 'tone'
import { midiService } from '@/core/midi/midi-service'
import { MidiSource } from '@/types/midi'
import { externalGrid } from '@/core/midi/external-grid'
import { StepScheduler, createWorkerTicker } from '@/core/midi/step-scheduler'
import { audioTimeToPerfMs } from '@/lib/audio-clock'
import { useMidiStore } from '@/stores/useMidiStore'
import { useArpStore } from '@/stores/useArpStore'
import { useTransportManager } from '@/composables/useTransportManager'
import { userKey } from '@/lib/userKey'
import { bigLoad, bigSave } from '@/lib/big-storage'
import { useSessionTakesStore } from '@/stores/useSessionTakesStore'
import { CLIP_SLOTS, buildClip, clipEventsAt, targetSlot, clipSummary } from '@/lib/rig-captures'
import { onStopAll } from '@/lib/stop-hooks'

const LS_KEY = 'SYCORE_RIG_CAPTURES'
/** The named sets (the 8 pads saved under a name) — IndexedDB (lib/big-storage.ts). */
const SETS_KEY = 'SYCORE_RIG_CAPTURE_SETS'
const clone = v => JSON.parse(JSON.stringify(v ?? null))
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

function loadClips() {
  try {
    const raw = JSON.parse(localStorage.getItem(userKey(LS_KEY)) || 'null')
    if (Array.isArray(raw)) return Array.from({ length: CLIP_SLOTS }, (_, i) => raw[i] && Array.isArray(raw[i].notes) ? raw[i] : null)
  } catch {}
  return Array(CLIP_SLOTS).fill(null)
}

let engine = null
let offStopAll = null

export function useRigCaptures() {
  if (engine) return engine
  const midiStore = useMidiStore()
  const arpStore = useArpStore()
  const transportManager = useTransportManager()
  const takes = useSessionTakesStore()

  const state = reactive({
    clips: loadClips(),
    /** The empty slot picked for the next recording (null: the first empty). */
    selected: null,
    recording: false,
    /** Per slot: 'idle' | 'queued' (starts on the next bar) | 'playing' | 'stopping' (ends on the next bar). */
    play: Array(CLIP_SLOTS).fill('idle'),
    /** The named sets: { name, clips, at }[] (loaded from IndexedDB at start). */
    sets: [],
    /** The set last saved or loaded (the pads may have changed since). */
    setName: null,
  })
  watch(() => state.clips, v => { try { localStorage.setItem(userKey(LS_KEY), JSON.stringify(v)) } catch {} }, { deep: true })

  const bpm = () => arpStore.arpBpm || midiStore.currentBpm || 120
  const stepMs = () => 60000 / ((externalGrid.active && externalGrid.bpm) || bpm()) / 4

  // ── Recording ───────────────────────────────────────────────────────────
  /** Song sixteenth now (float): Live's grid, the transport's, or from the first note (free). */
  let freeT0 = null
  function songPos(t) {
    if (externalGrid.active && externalGrid.anchor && externalGrid.bpm > 0) {
      return externalGrid.anchor.sixteenth + (t - externalGrid.anchor.t) / (60000 / externalGrid.bpm / 4)
    }
    if (transportManager.isRunning.value) {
      const tr = getTransport()
      return tr.ticks / (tr.PPQ / 4)
    }
    if (freeT0 == null) freeT0 = t
    return (t - freeT0) / (60000 / bpm() / 4)
  }

  let recNotes = []
  const held = new Map()
  let offRec = null
  let offRecApp = null
  /** Some input cabled into Live Perf in MIDI Flow: only those are recorded. */
  const anyCabledIn = () => Object.values(midiStore.inputRouting || {}).some(es => (es || []).some(e => e.app === MidiSource.LIVE_PERF))
  function deviceAllowed(inputId, note, chan) {
    if (!anyCabledIn()) return true
    const name = midiService.getInputs().find(i => i.id === inputId)?.name
    return !!name && midiStore.hasExplicitInputRouting(name) && midiStore.isDeviceRoutedToApp(name, MidiSource.LIVE_PERF, note, chan)
  }
  function onRecNote(type, note, velocity, chan) {
    const t = performance.now()
    const key = `${chan}:${note}`
    if (type === 'on' && velocity > 0) {
      const n = { s: songPos(t), pitch: note, velocity, channel: chan + 1, len: 0 }
      recNotes.push(n)
      held.set(key, n)
    } else {
      const n = held.get(key)
      if (n) { n.len = songPos(t) - n.s; held.delete(key) }
    }
  }
  function startRecording() {
    if (state.recording) return
    recNotes = []
    held.clear()
    freeT0 = null
    state.recording = true
    offRec = midiService.addNoteListener((type, note, velocity, chan, inputId) => {
      if (deviceAllowed(inputId, note, chan)) onRecNote(type, note, velocity, chan)
    })
    // an app cabled into Live Perf (e.g. Chord Sequencer → Live Perf) is recorded too
    offRecApp = midiStore.addAppNoteListener((type, note, velocity, chan, sourceApp) => {
      if (sourceApp === MidiSource.LIVE_PERF) return
      if (midiStore.hasExplicitInputRouting(sourceApp) && midiStore.isDeviceRoutedToApp(sourceApp, MidiSource.LIVE_PERF, note)) onRecNote(type, note, velocity, chan)
    })
  }
  /** Stop recording: the clip into the selected slot (else the first empty). Returns a message. */
  function stopRecording() {
    if (!state.recording) return ''
    offRec?.(); offRec = null
    offRecApp?.(); offRecApp = null
    state.recording = false
    const stopS = songPos(performance.now())
    for (const n of held.values()) n.len = stopS - n.s
    held.clear()
    const clip = buildClip(recNotes, stopS)
    recNotes = []
    if (!clip) return 'Capture: no notes played'
    const slot = targetSlot(state.clips, state.selected)
    if (slot == null) return 'Capture: all 8 slots full (Shift + a pad clears it; or, while recording, press a pad to record over it)'
    const over = !!state.clips[slot]
    setClip(slot, clip)
    state.selected = null
    return `Capture → S${slot + 1}${over ? ' (recorded over: the old one is in Session takes)' : ''}: ${clipSummary(clip)} — press S${slot + 1} to play it`
  }
  function toggleRecording() { return state.recording ? stopRecording() : (startRecording(), 'Capture: recording — Capt again to stop') }

  /** The slot picked for the next recording — an empty one, or (while recording) a full one to record
   *  over. A second press: none (the first empty). */
  function select(i) { state.selected = state.selected === i ? null : i }
  /** Put a clip (or null) into a slot, journaled in Session takes (app 'capt'): what was there before
   *  and the new one — a clip recorded over or cleared can be brought back. */
  // journal false: not kept as session takes (the Session panel's Preview / Revert)
  function setClip(i, clip, { journal = true } = {}) {
    const old = state.clips[i]
    if (same(old, clip)) return
    stopSlot(i, true)
    try { if (journal && old) takes.before('capt', i, clone(old)) } catch {}
    state.clips[i] = clip ? clone(clip) : null
    try { if (journal && clip) takes.after('capt', i, clone(clip)) } catch {}
  }
  function clear(i) {
    setClip(i, null)
    if (state.selected === i) state.selected = null
  }

  // ── Named sets: the 8 pads saved under a name (IndexedDB) ────────────────
  const setsReady = bigLoad(userKey(SETS_KEY), []).then(v => { if (Array.isArray(v)) state.sets = v }).catch(() => {})
  async function saveSet(name) {
    name = String(name || '').trim()
    if (!name) return 'Set: give it a name'
    if (state.clips.every(c => !c)) return 'Set: the pads are empty'
    await setsReady
    const set = { name, clips: clone(state.clips), at: Date.now() }
    const i = state.sets.findIndex(s => s.name === name)
    const sets = [...state.sets]
    if (i === -1) sets.push(set); else sets[i] = set
    state.sets = sets
    state.setName = name
    await bigSave(userKey(SETS_KEY), sets)
    return `Set "${name}" ${i === -1 ? 'saved' : 'updated'}`
  }
  /** Load a set onto the pads (they stop; each pad's clip before is kept in Session takes). */
  function loadSet(name) {
    const set = state.sets.find(s => s.name === name)
    if (!set) return ''
    stopAllClips()
    for (let i = 0; i < CLIP_SLOTS; i++) {
      const c = set.clips?.[i]
      setClip(i, c && Array.isArray(c.notes) ? c : null)
    }
    state.selected = null
    state.setName = name
    return `Set "${name}" loaded`
  }
  async function deleteSet(name) {
    await setsReady
    state.sets = state.sets.filter(s => s.name !== name)
    if (state.setName === name) state.setName = null
    await bigSave(userKey(SETS_KEY), state.sets)
    return `Set "${name}" deleted`
  }

  // ── Playback: one grid for all the clips ────────────────────────────────
  let sched = null
  let stopTicker = null
  let offGrid = null
  let startSixteenth = 0
  /** Per slot: the song sixteenth its loop started on. */
  const clipStart = Array(CLIP_SLOTS).fill(0)

  /** Live (followed) or SY.CORE's transport playing: a pad starts on the next bar; else it waits. */
  const clockRunning = () => externalGrid.active || transportManager.isRunning.value
  const anyQueued = () => state.play.some(p => p === 'queued')

  /** The grid from the next bar of the clock playing — or from `at` ({ t, sixteenth, bpm? }: a Play). */
  function startGrid(at = null) {
    if (sched) return
    const now = performance.now()
    let startMs = now + 20
    let tempo = bpm()
    startSixteenth = 0
    if (at) {
      startMs = at.t; startSixteenth = at.sixteenth; tempo = at.bpm || tempo
    } else if (externalGrid.active && externalGrid.anchor) {
      const graceMs = Math.min(80, 15000 / (externalGrid.bpm || tempo) * 0.5)
      const bar = externalGrid.pointAtOrAfter(now, 16, graceMs)
      const t = bar != null ? externalGrid.timeOf(bar) : null
      if (t != null) { startMs = t; tempo = externalGrid.bpm || tempo; startSixteenth = bar }
    } else if (transportManager.isRunning.value) {
      startMs = audioTimeToPerfMs(getTransport().nextSubdivision('1m'))
    }
    sched = new StepScheduler((k, t, late) => onStep(startSixteenth + k, t, late), { name: 'CAPT', startToleranceMs: 150 })
    sched.start(startMs, tempo)
    offGrid = externalGrid.on(e => { if (e.type === 'beat' && sched) sched.anchorTo(e.sixteenth - startSixteenth, e.t, e.bpm) })
    stopTicker = createWorkerTicker(() => sched?.tick(performance.now()))
    sched.tick(performance.now())
  }
  function stopGrid() {
    stopTicker?.(); stopTicker = null
    offGrid?.(); offGrid = null
    sched?.stop(); sched = null
  }
  watch(bpm, v => { if (sched && !externalGrid.active) sched.setTempo(v) })

  function onStep(song, t, late) {
    const bar = song % 16 === 0
    const ms = stepMs()
    for (let i = 0; i < CLIP_SLOTS; i++) {
      const clip = state.clips[i]
      if (!clip) { state.play[i] = 'idle'; continue }
      if (bar && state.play[i] === 'queued') { state.play[i] = 'playing'; clipStart[i] = song }
      else if (bar && state.play[i] === 'stopping') { state.play[i] = 'idle'; continue }
      if (state.play[i] !== 'playing' && state.play[i] !== 'stopping') continue
      if (late) continue
      const pos = (song - clipStart[i]) % clip.steps
      const seen = new Set() // a capture saved before the de-dup (one pitch on several channels): once
      for (const n of clipEventsAt(clip, pos)) {
        if (seen.has(n.pitch)) continue
        seen.add(n.pitch)
        midiStore.sendNoteOn(n.pitch, n.velocity, 1, MidiSource.LIVE_PERF, null, t)
        midiStore.sendNoteOff(n.pitch, 0, 1, MidiSource.LIVE_PERF, null, t + n.len * ms * 0.98)
      }
    }
    if (!state.play.some(p => p !== 'idle')) stopGrid()
  }

  /** A slot's pad: idle → plays from the next bar (nothing playing: waits for Play, starts on its 1);
   *  playing → ends on the next bar; queued → called off. */
  function toggleSlot(i) {
    if (!state.clips[i]) return
    const p = state.play[i]
    if (p === 'idle') { state.play[i] = 'queued'; if (clockRunning()) startGrid() }
    else if (p === 'queued') state.play[i] = 'idle'
    else if (p === 'playing') state.play[i] = 'stopping'
    else state.play[i] = 'playing'
  }
  /** Stop a slot now (`now`) or leave it be. */
  function stopSlot(i, now) {
    if (now) state.play[i] = 'idle'
    if (!state.play.some(p => p !== 'idle')) stopGrid()
  }
  function stopAllClips() {
    for (let i = 0; i < CLIP_SLOTS; i++) state.play[i] = 'idle'
    stopGrid()
  }
  // Play (Live's, SY.CORE's): the pads waiting start on its first bar line. Stop: the clips stop
  // (they stay in their slots).
  externalGrid.on(e => {
    if (e.type === 'stop') { stopAllClips(); return }
    if (sched || !anyQueued()) return
    if (e.type === 'start') {
      const bar = Math.ceil(e.sixteenth / 16) * 16
      const tempo = e.bpm || bpm()
      startGrid({ t: e.t + (bar - e.sixteenth) * 15000 / tempo, sixteenth: bar, bpm: e.bpm })
    } else startGrid()
  })
  watch(() => transportManager.isRunning.value, (run, was) => {
    if (was && !run && !externalGrid.active) { stopAllClips(); return }
    if (run && !was && !externalGrid.active && anyQueued() && !sched) {
      // the transport's first bar line from now (0 on a Play from the top), at its exact audio time
      const tr = getTransport()
      const barTicks = tr.PPQ * 4
      const at = Math.ceil(tr.ticks / barTicks) * barTicks
      try {
        tr.scheduleOnce(time => {
          if (!sched && anyQueued() && transportManager.isRunning.value) startGrid({ t: audioTimeToPerfMs(time), sixteenth: at / (tr.PPQ / 4) })
        }, `${at}i`)
      } catch { startGrid() }
    }
  })

  /** Live Perf has an OUT cable in MIDI Flow (else its clips only reach the broadcast outputs). */
  const hasOutCable = () => { try { return midiService.getRouting(MidiSource.LIVE_PERF).length > 0 } catch { return false } }
  /** A Live Perf node saved by MIDI Flow as a device (no app id — e.g. added while the page was
   *  half-reloaded): its cables are keyed by the name "Live Perf", not LIVE_PERF, so nothing reaches it. */
  const staleNode = () => {
    try {
      return midiService.getRouting('Live Perf').length > 0
        || Object.keys(midiStore.routingConfig?.registrations || {}).includes('Live Perf')
    } catch { return false }
  }

  /** Live Perf's OUT cables (routing matrix targets), for the display. */
  const outTargets = () => { try { return midiService.getRouting(MidiSource.LIVE_PERF) } catch { return [] } }

  // every Stop All stops the clips (stopRigCaptures)
  offStopAll = onStopAll(() => stopRigCaptures())
  engine = { state, hasOutCable, staleNode, outTargets, toggleRecording, startRecording, stopRecording, select, clear, setClip, toggleSlot, stopAllClips, clockRunning, saveSet, loadSet, deleteSet, setsReady }
  return engine
}

/**
 * Every Stop (Stop All: the footer, the Rig's Stop, Live's / the MIDI clock's Stop) stops the clips.
 * The engine's own watch on SY.CORE's transport skips its stop while Live's grid is active — a grid
 * left active (the clock source changed without a Stop) left the clips looping after a Stop.
 */
export function stopRigCaptures() {
  engine?.stopAllClips()
}

/** Tests: a fresh engine. */
export function _resetRigCaptures() {
  engine?.stopAllClips()
  offStopAll?.(); offStopAll = null
  engine = null
}
