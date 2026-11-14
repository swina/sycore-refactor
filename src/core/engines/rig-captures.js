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
 * clips (they stay in their slots).
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
import { CLIP_SLOTS, buildClip, clipEventsAt, targetSlot, clipSummary } from '@/lib/rig-captures'

const LS_KEY = 'SYCORE_RIG_CAPTURES'

function loadClips() {
  try {
    const raw = JSON.parse(localStorage.getItem(userKey(LS_KEY)) || 'null')
    if (Array.isArray(raw)) return Array.from({ length: CLIP_SLOTS }, (_, i) => raw[i] && Array.isArray(raw[i].notes) ? raw[i] : null)
  } catch {}
  return Array(CLIP_SLOTS).fill(null)
}

let engine = null

export function useRigCaptures() {
  if (engine) return engine
  const midiStore = useMidiStore()
  const arpStore = useArpStore()
  const transportManager = useTransportManager()

  const state = reactive({
    clips: loadClips(),
    /** The empty slot picked for the next recording (null: the first empty). */
    selected: null,
    recording: false,
    /** Per slot: 'idle' | 'queued' (starts on the next bar) | 'playing' | 'stopping' (ends on the next bar). */
    play: Array(CLIP_SLOTS).fill('idle'),
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
    if (slot == null) return 'Capture: all 8 slots full (Shift + a pad clears it)'
    stopSlot(slot, true)
    state.clips[slot] = clip
    state.selected = null
    return `Capture → S${slot + 1}: ${clipSummary(clip)} — press S${slot + 1} to play it`
  }
  function toggleRecording() { return state.recording ? stopRecording() : (startRecording(), 'Capture: recording — Capt again to stop') }

  /** An empty slot picked for the next recording (a second press: none). */
  function select(i) { state.selected = state.selected === i ? null : i }
  function clear(i) {
    stopSlot(i, true)
    state.clips[i] = null
    if (state.selected === i) state.selected = null
  }

  // ── Playback: one grid for all the clips ────────────────────────────────
  let sched = null
  let stopTicker = null
  let offGrid = null
  let startSixteenth = 0
  /** Per slot: the song sixteenth its loop started on. */
  const clipStart = Array(CLIP_SLOTS).fill(0)

  function startGrid() {
    if (sched) return
    const now = performance.now()
    let startMs = now + 20
    let tempo = bpm()
    startSixteenth = 0
    if (externalGrid.active && externalGrid.anchor) {
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

  /** A slot's pad: idle → plays from the next bar; playing → ends on the next bar; queued → called off. */
  function toggleSlot(i) {
    if (!state.clips[i]) return
    const p = state.play[i]
    if (p === 'idle') { state.play[i] = 'queued'; startGrid() }
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
  // The transport's Stop (Live's, SY.CORE's): the clips stop, they stay in their slots.
  externalGrid.on(e => { if (e.type === 'stop') stopAllClips() })
  watch(() => transportManager.isRunning.value, (run, was) => { if (was && !run && !externalGrid.active) stopAllClips() })

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

  engine = { state, hasOutCable, staleNode, outTargets, toggleRecording, startRecording, stopRecording, select, clear, toggleSlot, stopAllClips }
  return engine
}

/** Tests: a fresh engine. */
export function _resetRigCaptures() {
  engine?.stopAllClips()
  engine = null
}
