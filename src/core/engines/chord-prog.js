/**
 * Chord Prog engine — the Chord Progression Sequencer's playback, outside its Vue component
 * (Scenario Workspaces, Phase 1): the clock (Tone.js 384n or CLK SYS), the notes it holds, bass,
 * the stop's fade, chord clicks / previews, the Rig and Control Map events (cp-start, cp-stop,
 * cp-slot-select, cp-slot-cue, cp-generate), MIDI Flow inputs and Learn triggers, slot autosave.
 *
 * One instance for the whole app (useChordProgEngine), created on first use in a detached
 * effectScope: it keeps playing with the Chord Prog panel closed or unmounted. The panel
 * (ChordProgSequencer.vue) renders store + engine state and calls the engine's actions.
 *
 * The code is moved from ChordProgSequencer.vue as it was (2026-11-11); only what tied it to the
 * component changed: `props.isOpen` → `uiStore.isChordProgOpen`, previewChord takes the
 * transpose, the progression data has its own loader, the transport ticks are read by a getter.
 */
import { chordBassNote } from '@/lib/chord-custom'
import { journaled } from '@/lib/session-takes'
import { ref, computed, watch, effectScope, onScopeDispose } from 'vue'
import { getTransport, start as toneStart } from 'tone'
import { drawAt } from '@/lib/ui-clock'
import { useTransportManager } from '@/composables/useTransportManager'
import { midiService, MidiSource } from '@/core/midi/midi-service'
import { isLiveOwned } from '@/core/midi/controller-profiles'
import { findOutputFor } from '@/lib/led-feedback'
import { useMidiStore } from '@/stores/useMidiStore'
import { useArpStore } from '@/stores/useArpStore'
import { userKey } from '@/lib/userKey'
import { useSyncStore } from '@/stores/useSyncStore'
import { useUiStore } from '@/stores/useUiStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { useExternalClockStore } from '@/stores/useExternalClockStore'
import { useChordProgStore, stepPlayMode } from '@/stores/useChordProgStore'
import { useProgressionLoader } from '@/composables/useProgressionLoader'
import { orderChordStrumNotes } from '@/lib/chord-strum'
import { sendPartPresets } from '@/lib/song-composer'
import { nextArpIndex, defaultArpPatternState } from '@/lib/arp-patterns'
import { StepScheduler, createWorkerTicker, chaseNote, VoiceLedger, noteOffDecideAt } from '@/core/midi/step-scheduler'
import { externalGrid } from '@/core/midi/external-grid'
import { stopGate } from '@/core/midi/stop-gate'
import { intGrid } from '@/core/midi/int-grid'
import { linkClient } from '@/stores/useLinkStore'
import { chordAfter, latchIndex } from '@/lib/chord-next'
import { rigReports } from '@/lib/rig-live'
import { audioTimeToPerfMs, perfMsToAudioTime } from '@/lib/audio-clock'
import { chordRootPc, chordPcs } from '@/lib/seq-gen/harmony'

let engine = null
let engineScope = null

/** The Chord Prog engine (created on first call; needs Pinia installed). */
export function useChordProgEngine() {
  if (!engine) {
    engineScope = effectScope(true)
    engine = engineScope.run(createChordProgEngine)
  }
  return engine
}

/** Tests: drop the engine (its watchers and listeners), so the next call makes a new one. */
export function _resetChordProgEngine() {
  engineScope?.stop()
  engineScope = null
  engine = null
}

function createChordProgEngine() {
  const midiStore = useMidiStore()
  const arpStore = useArpStore()
  const transportManager = useTransportManager()
  const store = useChordProgStore()
  const syncStore = useSyncStore()
  const uiStore = useUiStore()
  const mappingStore = useMappingStore()
  const clockStore = useExternalClockStore()
  // Its own progression data for the selected key (Generate from the Rig, with the panel closed).
  const { progressionData, loadByIndex } = useProgressionLoader()
  watch(() => store.selectedKey, idx => loadByIndex(idx), { immediate: true })

  // ── Playback ─────────────────────────────────────────────────────────────────

  // Ticks per duration (base = 384th note = 1 tick, i.e. PPQ=96 per quarter)
  // Schedule fires every '384n'; multiply old 128n-based values by 3 so triplets become integers.
  const DURATION_TICKS = {
    '128n': 3,   '64n': 6,   '32n': 12,
    '16n': 24,   '16n.': 36, '16t': 16,
    '8n': 48,    '8n.': 72,  '8t': 32,
    '4n': 96,    '4n.': 144, '4t': 64,
    '2n': 192,   '2n.': 288,
    '1m': 384,   '2m': 768,  '4m': 1536, '8m': 3072,
  }

  const NOTES_NAME = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

  const playStateRef = { current: {} }
  const repeatEventIdRef = ref(null)

  // Plain JS (non-reactive) for timing-critical note tracking.
  // Vue reactive refs cause stale reads and proxy overhead inside nested setTimeout callbacks.
  let _pendingTimeouts = new Set()  // all scheduled timeout IDs
  let _activeNoteKeys = new Set()   // "note-channel" keys currently sounding
  let _activeBassNote = null        // { note, channel, tid } — auto-timed bass note from scheduler
  let heldBassNote = null           // { dev, note, channel } — held bass note from manual trigger
  let _stopPending = false          // set synchronously on stop; blocks any queued tid callbacks
  let _transportTicks = 0          // our own tick counter (384n resolution, resets on each play)
  let _captureArmed = false         // set true on play, consumed by next schedule tick
  let _captureBarsRemaining = 0     // tick counter until auto-stop
  let _captureRecording = false     // set true after pre-roll fires, cleared on stop
  let _lastFollowedSlot = null      // last slot auto-loaded to follow chain playback; null forces a follow on the next tick
  let _lastMidiTriggerStep = -1     // last step index triggered by MIDI
  let _lastMidiTriggerTime = 0      // timestamp of last MIDI trigger
  let _scheduledMidiEventId = null  // Tone.js schedule event ID for deferred trigger

  const seqTranspose = ref(0)
  const loopEnabled = ref(true)

  const bassEnabled = ref(localStorage.getItem(userKey('S1_CP_BASS_ENABLED')) === 'true')
  const bassDevice = ref(localStorage.getItem(userKey('S1_CP_BASS_DEVICE')) || '')
  const bassChannel = ref(parseInt(localStorage.getItem(userKey('S1_CP_BASS_CHANNEL')) ?? '2', 10))
  // Reactive (midiStore.outputs, refreshed on connect / hot-plug): midiService.getOutputs() read
  // once at mount — before Web MIDI was ready — left the list empty. Plus the virtual instruments and
  // the panel outputs (Live (M4L) while SY.CORE Link is connected — the bass on Live's beat to the
  // Link Receive on its channel —, the FM-1 Emulator while its panel is open).
  const midiOutputs = computed(() => {
    const names = new Set()
    const list = []
    for (const o of midiStore.outputs) if (o?.name && !names.has(o.name)) { names.add(o.name); list.push({ name: o.name }) }
    for (const v of midiStore.virtualInstruments) if (v?.name && !names.has(v.name)) { names.add(v.name); list.push({ name: v.name }) }
    for (const name of midiStore.panelOutputs) if (name && !names.has(name)) { names.add(name); list.push({ name }) }
    return list
  })

  watch(bassEnabled, v => localStorage.setItem(userKey('S1_CP_BASS_ENABLED'), v ? 'true' : 'false'))
  watch(bassDevice, v => localStorage.setItem(userKey('S1_CP_BASS_DEVICE'), v))
  watch(bassChannel, v => localStorage.setItem(userKey('S1_CP_BASS_CHANNEL'), v.toString()))

  // ── Audio Capture Sync ────────────────────────────────────────────────────────
  const captureBarCount = ref(parseInt(localStorage.getItem(userKey('S1_CP_CAPTURE_BARS')) ?? '4', 10))
  const captureAutoStop = ref(localStorage.getItem(userKey('S1_CP_CAPTURE_AUTOSTOP')) !== 'false')
  const captureArmed = ref(false)
  const captureRecording = ref(false)

  watch(captureBarCount, v => localStorage.setItem(userKey('S1_CP_CAPTURE_BARS'), v.toString()))
  watch(captureAutoStop, v => localStorage.setItem(userKey('S1_CP_CAPTURE_AUTOSTOP'), v ? 'true' : 'false'))

  function chordNotes (step) {
    if (!step?.active || !step.notes?.length) return []
    return step.notes.map(n => NOTES_NAME[(n + (seqTranspose.value || 0) + (step.transpose || 0)) % 12] + Math.floor((n + (seqTranspose.value || 0) + (step.transpose || 0)) / 12))
  }

  // The bass of a step: a chord symbol's root in octave 2; custom notes: the lowest an octave down (chord-custom.ts)
  function getBassNote(step, shift = 0) {
    return chordBassNote(step, shift)
  }

  // Bass: straight to its own device and channel (midiService.sendNoteTo), not through the
  // Chord Prog's MIDI Flow cables — else it went to the chords' devices, on their channel
  // (remapped by the cable / OUT CH), and never reached e.g. SYC OUT ch 2 for a Live track.
  // `dev` is kept with each note so its note-off reaches the same device after a change.
  function _bassOn(dev, n, velocity, ch, atMs = null, beat = null) {
    const opts = atMs != null ? { workerTimed: true, workerTag: CP_WORKER_TAG, ...(beat != null ? { beat } : {}) } : undefined
    midiService.sendNoteTo(dev, 'noteon', n, velocity, ch - 1, MidiSource.CHORD_PROG, atMs ?? undefined, opts)
  }
  function _bassOff(b, atMs = null, beat = null) {
    if (!b) return
    midiService.sendNoteTo(b.dev, 'noteoff', b.note, 0, b.channel - 1, MidiSource.CHORD_PROG, atMs ?? undefined, atMs != null ? { workerTimed: true, ...(beat != null ? { beat } : {}) } : undefined)
  }

  function sendBassNoteOn(note, velocity, durationMs, atMs = null, onBeat = null) {
    if (atMs != null) {
      // CLK SYS: the previous bass note ends when this one starts, both at their times.
      if (_activeBassNote) {
        const prev = _activeBassNote
        if (prev.tid) { clearTimeout(prev.tid); _pendingTimeouts.delete(prev.tid) }
        // Its own queued note-off is skipped from now on (it could cut this note, same pitch).
        // (its note-off already sent for later — release() — still ends it here: an earlier one)
        if (prev.id == null || _cpVoices.end(prev.key, prev.id) || _cpVoices.sentOffAfter(prev.key, atMs) !== null) {
          _bassOff(prev, atMs - 1)
        }
        _activeBassNote = null
      }
      if (!bassEnabled.value || !bassDevice.value || note === null) return
      const ch = Math.max(1, Math.min(16, bassChannel.value))
      const n = Math.max(0, Math.min(127, note))
      const dev = bassDevice.value
      const key = `bass-${n}-${ch}`
      const bass = { dev, note: n, channel: ch, key, bass: true }
      const offAt = atMs + durationMs
      const id = _cpVoices.start(key, offAt, bass)
      const offBeat = onBeat != null ? onBeat + _msToBeats(durationMs) : null
      _bassOn(dev, n, velocity, ch, atMs, onBeat)
      // a note-off of this pitch already sent for later would cut it: strike it again just after
      const cutBy = _cpVoices.sentOffAfter(key, atMs)
      if (cutBy !== null && cutBy + 1 < offAt) _bassOn(dev, n, velocity, ch, cutBy + 1)
      // decided NOTE_OFF_LEAD_MS early, sent timestamped (not when due: the main thread delayed it)
      midiService.scheduleOnWorker(noteOffDecideAt(offAt, performance.now()), () => {
        if (_cpVoices.release(key, id)) _bassOff(bass, offAt, offBeat)
      }, undefined, 'CHORDS note-off')
      _activeBassNote = { ...bass, tid: null, id }
      return
    }
    stopBassNote()
    if (!bassEnabled.value || !bassDevice.value || note === null) return
    const ch = Math.max(1, Math.min(16, bassChannel.value))
    const n = Math.max(0, Math.min(127, note))
    const bass = { dev: bassDevice.value, note: n, channel: ch }
    _bassOn(bass.dev, n, velocity, ch)
    const tid = window.setTimeout(() => {
      _bassOff(bass)
      _pendingTimeouts.delete(tid)
      _activeBassNote = null
    }, durationMs)
    _pendingTimeouts.add(tid)
    _activeBassNote = { ...bass, tid }
  }

  function stopBassNote() {
    if (!_activeBassNote) return
    const { tid } = _activeBassNote
    if (tid) { clearTimeout(tid); _pendingTimeouts.delete(tid) }
    _bassOff(_activeBassNote)
    _activeBassNote = null
  }
  function buildPlayState() {
    let steps = store.steps
    let numSteps = store.numSteps
    let playMode = store.playMode
    let arpRate = store.arpRate
    let chainSlotIndices = null
    let chainLocalIndices = null
    let chainPositions = null

    if (store.chainEnabled && store.chain.some(i => i >= 0)) {
      const chainSteps = store.getChainSteps()
      steps = chainSteps.steps
      numSteps = chainSteps.numSteps
      chainSlotIndices = chainSteps.slotIndices
      chainLocalIndices = chainSteps.localIndices
      chainPositions = chainSteps.positions
    }

    return {
      isPlaying: store.isPlaying,
      steps,
      numSteps,
      bpm: arpStore.arpBpm || 120,
      channel: midiStore.midiChannel,
      playMode,
      arpRate,
      transpose: seqTranspose.value,
      loop: loopEnabled.value,
      stepPointer: 0,
      tickCounter: 0,
      chainSlotIndices,
      chainLocalIndices,
      chainPositions,
      // Per-step-position arp pattern traversal state, keyed by stepPointer
      // (the position within `steps`, whether a single slot's 16 steps or a
      // longer flattened chain) — each position cycles its own arpMode
      // independently. Lazily populated as positions are first visited;
      // rebuilt fresh on every play start since buildPlayState() is only
      // called then.
      arpPatternStates: new Map(),
    }
  }

  // Drums + Sequencer follow the chain (store.drumFollow): one bar (384 ticks) before the playing
  // slot ends, ask the Drum Machine for the sequence and the Sequencer for the bank of the next
  // slot's letter. Both switch at the slot boundary: the Drum Machine at its next bar start
  // ('dm-seq-switch' is quantized while it plays), the Sequencer when its bank wraps ('seq-bank-cue'). Once per slot instance
  // (a slot instance starts where the chain's local step index is back to 0).
  const SECTION_CUE_TICKS = 384
  // Preset changes per section (store.slotPresets, AI Song Composer): a 16th before the boundary, so
  // the device has switched when the next section's first notes arrive (the last 16th of the
  // section may be cut on synths that silence on a Program Change).
  const SECTION_PC_TICKS = 24
  function cueNextSection(state) {
    const p = state.stepPointer
    if (state.tickCounter === 0 && state.chainLocalIndices[p] === 0) { state.sectionCued = false; state.sectionPcCued = false }
    if (state.sectionCued && state.sectionPcCued) return
    let end = p
    let ticks = 0
    do {
      ticks += DURATION_TICKS[state.steps[end]?.duration] ?? 32
      end++
    } while (end < state.numSteps && state.chainLocalIndices[end] !== 0)
    const left = ticks - state.tickCounter
    if (left > SECTION_CUE_TICKS) return
    const next = end < state.numSteps ? state.chainSlotIndices[end] : (state.loop ? state.chainSlotIndices[0] : null)
    if (next == null || next < 0) { state.sectionCued = state.sectionPcCued = true; return }
    if (!state.sectionCued) {
      state.sectionCued = true
      window.dispatchEvent(new CustomEvent('dm-seq-switch', { detail: { seq: 'ABCDEFGH'[next] } }))
      window.dispatchEvent(new CustomEvent('seq-bank-cue', { detail: { idx: next, fromChordProg: true } }))
    }
    if (!state.sectionPcCued && left <= SECTION_PC_TICKS) {
      state.sectionPcCued = true
      const presets = store.slotPresets?.[next]
      if (presets && next !== state.chainSlotIndices[p]) sendPartPresets(presets)
    }
  }

  let _panicTimeout = null

  // ── System clock (CLK SYS) — the 384n tick from a StepScheduler on performance.now() (steps of
  // 1/96 beat), ticked by a Worker timer, instead of the Tone.js transport (audio clock). The tick
  // callback is the same; while it runs, _sysTickMs holds the tick's time and the notes leave from
  // the Worker-timed queue at their times (strum notes at their own offsets) instead of now + page
  // timers. Off by default (see DrumMachine.vue / Sequencer.vue). ──
  const LS_CP_SYSTEM_CLOCK = 'SYCORE_CP_SYSTEM_CLOCK'
  const systemClock = ref((() => { try { return localStorage.getItem(userKey(LS_CP_SYSTEM_CLOCK)) === '1' } catch { return false } })())
  watch(systemClock, v => { try { localStorage.setItem(userKey(LS_CP_SYSTEM_CLOCK), v ? '1' : '0') } catch {} })
  const CP_WORKER_TAG = 'chord-prog'
  const CP_TICK_BEATS = 1 / 96         // the 384n tick
  let _sysTickMs = null                // CLK SYS: performance.now() ms of the tick being run
  let _sysSilent = false               // a tick found too late (stalled page): advance, don't sound
  let _sysSched = null
  let _stopTicker = null
  let _offExtGrid = null
  let _sysStartSixteenth = 0

  /** CLK SYS "chase": a note whose start is already gone (a late start after Live's Play, a
   *  stalled page) but whose end is still ahead sounds now, for what is left of it — a chord
   *  lasting the whole first bar was skipped, leaving the bar silent. Null: nothing left to play. */
  function _chase(onMs, durMs) {
    return chaseNote(onMs, durMs, performance.now(), _sysSilent)
  }

  /** CLK SYS: who owns each sounding pitch (chords, arp, bass), so a slot switch ends the old
   *  notes and their queued note-offs don't cut the new slot's notes of the same pitch. */
  const _cpVoices = new VoiceLedger()

  /**
   * Following Live over SY.CORE Link: the exact Live beat of the tick being run (null otherwise,
   * or for a late tick). Its notes go to SY.CORE Link with it — a chord on beat 4 is sent as 4.000,
   * not as a beat converted back from its time, which wobbled by some ms with the transport mirror's
   * corrections (heard as jitter on 1/4-note chords).
   */
  function _tickBeat() {
    if (_sysTickMs == null || _sysSilent || !externalGrid.active || !clockStore.isLink) return null
    return (_sysStartSixteenth * 24 + (_transportTicks - 1)) / 96
  }
  /** ms → Live beats, at Live's tempo. */
  function _msToBeats(ms) {
    return ms * (externalGrid.bpm || arpStore.arpBpm || 120) / 60000
  }

  /** A chord about to sound: its root (from the name — chord-follow by scale degree in the Sequencer,
   *  seq-gen/harmony.ts) and its pitch classes (a lane's Fit: Chord), sent before its notes so a follower
   *  moves on the chord, not on each note. */
  function announceChord(name, notes, shift = 0) {
    const pc = chordRootPc(name, notes)
    if (pc === null) return
    const shifted = (notes ?? []).map(n => n + shift)
    // at: CLK SYS, the time the chord sounds (the tick runs ahead of it); null: now
    window.dispatchEvent(new CustomEvent('cp-chord-on', { detail: {
      rootPc: (((pc + shift) % 12) + 12) % 12, name, pcs: chordPcs(shifted),
      note: shifted.length ? Math.min(...shifted) : null, at: _sysTickMs,
    } }))
  }

  /** CLK SYS: a note on at onMs and off durMs later, from the Worker-timed queue (onBeat: its exact
   *  Live beat, see _tickBeat). */
  function _cpNoteAt(note, velocity, channel, onMs, durMs, onBeat = null) {
    const noteKey = `${note}-${channel}`
    const offAt = onMs + durMs
    const beatOpt = b => (b != null ? { beat: b } : {})
    const offBeat = onBeat != null ? onBeat + _msToBeats(durMs) : null
    const id = _cpVoices.start(noteKey, offAt, { note, channel, key: noteKey })
    midiStore.sendNoteOn(note, velocity, channel, MidiSource.CHORD_PROG, null, onMs, { workerTimed: true, workerTag: CP_WORKER_TAG, ...beatOpt(onBeat) })
    // a note-off of this pitch already sent for later would cut it: strike it again just after
    const cutBy = _cpVoices.sentOffAfter(noteKey, onMs)
    if (cutBy !== null && cutBy + 1 < offAt) midiStore.sendNoteOn(note, velocity, channel, MidiSource.CHORD_PROG, null, cutBy + 1, { workerTimed: true, workerTag: CP_WORKER_TAG })
    _activeNoteKeys.add(noteKey)
    // decided NOTE_OFF_LEAD_MS early, sent timestamped (not when due: the main thread delayed it)
    midiService.scheduleOnWorker(noteOffDecideAt(offAt, performance.now()), () => {
      if (!_cpVoices.release(noteKey, id)) return
      midiStore.sendNoteOff(note, 0, channel, MidiSource.CHORD_PROG, null, offAt, { workerTimed: true, ...beatOpt(offBeat) })
      _activeNoteKeys.delete(noteKey)
    }, undefined, 'CHORDS note-off')
  }

  /** CLK SYS, a slot switch at atMs: the notes still sounding then end there. */
  function _cpCutVoicesAt(atMs) {
    for (const v of _cpVoices.cutAt(atMs)) {
      if (v.bass) _bassOff(v, atMs - 1)
      else midiStore.sendNoteOff(v.note, 0, v.channel, MidiSource.CHORD_PROG, null, atMs - 1, { workerTimed: true })
      _activeNoteKeys.delete(v.key)
    }
    _activeBassNote = null
  }

  function _startSystemClock(tickCb, alignToBar) {
    _stopSystemClock()
    const now = performance.now()
    let startMs = now + 20
    let bpm = arpStore.arpBpm || 120
    _sysStartSixteenth = 0
    if (externalGrid.active && externalGrid.anchor) {
      // The bar Live is playing now; ticks already gone pass silently. A Rig pad's start
      // (Trigger sync) waits for the next sync point instead (bar line or beat).
      let bar = externalGrid.barAtOrBefore(now)
      if (_cpStartSteps && bar != null) {
        const graceMs = Math.min(80, 15000 / (externalGrid.bpm || bpm) * 0.5)
        bar = externalGrid.pointAtOrAfter(now, _cpStartSteps, graceMs) ?? bar
      }
      const t = bar != null ? externalGrid.timeOf(bar) : null
      if (t != null) { startMs = t; bpm = externalGrid.bpm || bpm; _sysStartSixteenth = bar }
    } else {
      // INT: on the bar grid of the sequences already playing (int-grid.ts), as the Drum Machine and
      // the Sequencer — a Rig pad's Trigger sync (or the transport's bar) waits for their next bar
      // line; else in phase with the bar playing. Alone: now, or the transport's next bar line.
      const sync = alignToBar || _cpStartSteps >= 16
      if (sync && transportManager.isRunning.value) startMs = audioTimeToPerfMs(getTransport().nextSubdivision('1m'))
      startMs = intGrid.join('chord', now, bpm, sync, startMs)
    }
    _cpStartSteps = 0
    _sysSched = new StepScheduler((_step, t, late) => {
      _sysTickMs = t
      _sysSilent = late
      try { tickCb(perfMsToAudioTime(t)) } finally { _sysTickMs = null; _sysSilent = false }
    }, { name: 'CHORDS' })
    _sysSched.start(startMs, bpm, CP_TICK_BEATS)
    _offExtGrid = externalGrid.on(e => {
      if (e.type === 'beat' && _sysSched) _sysSched.anchorTo(e.sixteenth - _sysStartSixteenth, e.t, e.bpm)
    })
    _stopTicker = createWorkerTicker(() => _sysSched?.tick(performance.now()))
    _sysSched.tick(performance.now())
  }

  function _stopSystemClock() {
    intGrid.leave('chord')
    _stopTicker?.(); _stopTicker = null
    _offExtGrid?.(); _offExtGrid = null
    _sysSched?.stop(); _sysSched = null
    // Note-ons still queued would sound after Stop (their note-offs stay queued: harmless).
    midiService.cancelWorkerTimed(CP_WORKER_TAG)
  }

  /**
   * All Notes Off on the Chord Prog's own channels (chords, bass) — not a PANIC: a global one cut the
   * Sequencer, the Bass line and every other app whenever the Chord Prog stopped (2026-11-10).
   */
  function cpNotesOff(chan) {
    for (const ch of new Set([chan, Math.max(1, Math.min(16, bassChannel.value))])) midiStore.allNotesOff(ch)
  }

  function stopAllNotes() {
    _stopPending = true
    midiService.cancelWorkerTimed(CP_WORKER_TAG)
    store.playingChordName = ''
    store.playingChordDuration = ''
    store.nextChord = null
    _pendingTimeouts.forEach(id => clearTimeout(id))
    _pendingTimeouts.clear()

    // Fade out: ramp CC11 (Expression) down over panic delay, then cut notes. Not CC7: Volume is the
    // channel's level (the preset's / the mixer's), and resetting it to 127 after the stop overwrote
    // it on every channel the Chord Prog plays on. Expression is the performance multiplier on top
    // of it (the Sequencer fades the same way).
    if (_panicTimeout) clearTimeout(_panicTimeout)
    const delay = panicDelayMs.value
    const chan = midiStore.midiChannel
    const steps = 4
    for (let i = 1; i <= steps; i++) {
      const vol = Math.round(127 * (1 - i / steps))
      const tid = window.setTimeout(() => {
        if (_stopPending) midiStore.sendCC(11, vol, chan, MidiSource.CHORD_PROG)
        _pendingTimeouts.delete(tid)
      }, delay * i / steps)
      _pendingTimeouts.add(tid)
    }

    _panicTimeout = window.setTimeout(() => {
      _activeNoteKeys.forEach(key => {
        const [noteStr, chanStr] = key.split('-')
        midiStore.sendNoteOff(parseInt(noteStr), 0, parseInt(chanStr), MidiSource.CHORD_PROG)
      })
      _activeNoteKeys.clear()
      // A chord clicked in chord mode (triggerChordStep) is held in heldChordNotes: explicit note-offs,
      // since the channel's All Notes Off alone doesn't release it in Live (it used to rely on a PANIC).
      heldChordNotes.forEach(({ note, channel }) =>
        midiStore.sendNoteOff(note, 0, channel, MidiSource.CHORD_PROG))
      heldChordNotes.length = 0
      stopBassNote()
      if (heldBassNote) {
        _bassOff(heldBassNote)
        heldBassNote = null
      }
      cpNotesOff(chan)
      // Expression back to full (the channel's CC7 level was never touched)
      setTimeout(() => midiStore.sendCC(11, 127, chan, MidiSource.CHORD_PROG), 10)
      _panicTimeout = null
    }, delay)
  }

  watch(() => store.isPlaying, (playing) => {
    if (!playing) {
      _stopSystemClock()
      _cpCueSlot = null
      _cpCueSteps = 0
      _cpStopSteps = 0
      _cpStartSteps = 0
      _cpCueAtEnd = false
      _cpStopAtEnd = false
      _cpWrapped = false
      cuedSlotIdx.value = null
      if (repeatEventIdRef.value !== null) {
        getTransport().clear(repeatEventIdRef.value)
        repeatEventIdRef.value = null
      }
      transportManager.releaseTransport()
      stopAllNotes()
      window.dispatchEvent(new CustomEvent('cp-chord-release'))
      store.currentStep = 0
      store.playingChordName = ''
      store.playingSlotIndex = null
      store.playingChainPos = -1
      playStateRef.current = {}
      _captureArmed = false
      if (_captureRecording) {
        _captureRecording = false
        captureRecording.value = false
        window.dispatchEvent(new CustomEvent('capture-stop-rec'))
      }
      captureArmed.value = false
      return
    }

    // Reset stop flag and clear stale state before starting
    _stopPending = false
    _transportTicks = 0
    _lastFollowedSlot = null
    _pendingTimeouts.clear()
    _activeNoteKeys.clear()
    _cpVoices.clear()
    playStateRef.current = buildPlayState()
    // Latched before Play: start on that chord
    { const li = _latch(playStateRef.current); if (li >= 0) playStateRef.current.stepPointer = li }

    toneStart().then(() => {
      getTransport().bpm.value = arpStore.arpBpm || 120

  const alignToBar = transportManager.isRunning.value && syncStore.syncChordProgToTransport.value
      const tickCb = (time) => {
        const state = playStateRef.current
        if (!state.isPlaying || _stopPending) return
        // a Stop queued on the bar line (stop-gate.ts): no chord from there on
        if (stopGate.reached(_sysTickMs ?? audioTimeToPerfMs(time))) return

        _transportTicks++
        // Position on Live's song grid (24 ticks per sixteenth), for a Rig pad's Trigger sync.
        const songTick = _sysStartSixteenth * 24 + (_transportTicks - 1)

        // A Rig pad's stop: on its sync point; the chords end there.
        if (_cpStopSteps && songTick % (_cpStopSteps * 24) === 0) {
          _cpStopSteps = 0
          if (_sysTickMs != null) _cpCutVoicesAt(_sysTickMs)
          state.isPlaying = false
          drawAt(() => { store.isPlaying = false }, time)
          return
        }

        // A cued slot (Control Map) starts on the bar line, from its first chord — a Rig pad's on
        // its sync point of the song grid.
        // sync -1 (the Rig's "start only"): at the end of the slot playing — its progression wrapped
        const cueNow = _cpCueAtEnd ? _cpWrapped : _cpCueSteps ? songTick % (_cpCueSteps * 24) === 0 : (_transportTicks - 1) % 384 === 0
        _cpWrapped = false
        if (_cpCueSlot !== null && cueNow && !state.chainSlotIndices) {
          const idx = _cpCueSlot
          _cpCueSlot = null
          _cpCueSteps = 0
          _cpCueAtEnd = false
          // The old slot's notes end on the bar line, not where their own note-offs were.
          if (_sysTickMs != null) _cpCutVoicesAt(_sysTickMs)
          handleSlotSelect(idx)
          state.steps = store.steps
          state.numSteps = store.numSteps
          state.playMode = store.playMode
          state.arpRate = store.arpRate
          state.stepPointer = 0
          state.tickCounter = 0
          state.arpPatternStates = new Map()
          drawAt(() => { cuedSlotIdx.value = null }, time)
        }

        // ── Audio capture sync with pre-roll & auto-stop ─────────────────
        if (syncStore.syncChordProgToAudioCapture) {
          if (_captureArmed) {
            _captureArmed = false
            _captureRecording = true
            captureArmed.value = false
            captureRecording.value = true

            // Total ticks = sum of all chord durations (one full pass through the progression)
            const totalTicks = state.steps.reduce((acc, s) => {
              return acc + (DURATION_TICKS[s?.duration] ?? 32)
            }, 0)
            _captureBarsRemaining = captureAutoStop.value ? totalTicks : Infinity

            const PRE_ROLL = 0.2
            const timeUntilBeat = time - getTransport().now()
            const actualPreRoll = Math.min(PRE_ROLL, Math.max(0, timeUntilBeat))
            const delayMs = Math.max(0, (timeUntilBeat - PRE_ROLL) * 1000)

            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('capture-start-rec', {
                detail: { background: true, preRoll: actualPreRoll },
              }))
            }, delayMs)

            // Count this tick (armed tick is still a real tick)
            _captureBarsRemaining -= 1
          } else if (_captureRecording) {
            // Each schedule fire is 1 tick (384n resolution), so decrement by 1.
            _captureBarsRemaining -= 1
            if (_captureBarsRemaining <= 0) {
              _captureRecording = false
              captureRecording.value = false
              drawAt(() => {
                window.dispatchEvent(new CustomEvent('capture-stop-rec'))
              }, time)
            }
          }
        }

        // Un-capped: a chain's flattened step count can exceed 16 (multiple
        // slots concatenated), unlike a single slot which the UI already
        // bounds to 16 — capping here silently truncated longer chains.
        const activeCount = Math.max(1, state.numSteps)
        const step = state.steps[state.stepPointer]
        const ticksNeeded = DURATION_TICKS[step?.duration] ?? 32
        // Per-step Chord/Arp override — unset means "inherit the slot's global playMode".
        const effectiveMode = stepPlayMode(store.progMode, step?.stepMode, state.playMode) // the header's AUTO / CHORD / ARP

        if (state.chainSlotIndices && store.drumFollow) cueNextSection(state)

        if (state.tickCounter === 0) {
          if (step?.active && step.velocity > 0 && step.notes?.length > 0) announceChord(step.chordName, step.notes, (state.transpose || 0) + (step.transpose || 0))
          drawAt(() => {
            store.playingChordName = step?.active && step.notes?.length ? step.chordName : ''
            store.playingChordDuration = step?.active && step.notes?.length ? step.duration : ''
            // its length (ms, bars of 4/4: 96 ticks a beat) and a counter per step — the Rig device's progress bar
            store.playingChordMs = Math.round(ticksNeeded * 60000 / (state.bpm * 96))
            store.playingChordBars = ticksNeeded / 384
            store.playingChordSeq++
            const li = _latch(state)
            const nx = li >= 0 ? { step: state.steps[li], wraps: false } : chordAfter(state.steps, state.numSteps, state.stepPointer, state.loop)
            store.nextChord = nx ? { name: nx.step.chordName, duration: nx.step.duration, wraps: nx.wraps } : null
            if (state.chainSlotIndices) {
              const slotIdx = state.chainSlotIndices[state.stepPointer]
              store.currentStep = state.chainLocalIndices[state.stepPointer]
              store.playingChainPos = state.chainPositions?.[state.stepPointer] ?? -1
              store.playingSlotIndex = slotIdx
              // Follow the chain: switch the displayed/editable slot to show
              // the chords actually playing right now. Only on a slot
              // boundary crossing (not every tick) — slotLoad() swaps
              // store.steps/numSteps/playMode/arpRate, which the "sync live
              // edits" watcher above is guarded to ignore during chain
              // playback specifically so this can't corrupt the running
              // flattened sequence in state.steps.
              if (slotIdx !== _lastFollowedSlot) {
                _lastFollowedSlot = slotIdx
                store.slotLoad(slotIdx)
              }
            } else {
              store.currentStep = state.stepPointer
              store.playingSlotIndex = store.activeSlotIndex
              store.playingChainPos = -1
            }
          }, time)

          if (step?.active && step.velocity > 0 && step.notes?.length > 0 && effectiveMode !== 'arp') {
            const tickMs = 60000 / (state.bpm * 96)
            const stepMs = tickMs * ticksNeeded
            const noteDurationMs = Math.max(10, stepMs * ((step.gate ?? 80) / 100))
            const channel = state.channel

            if (_sysTickMs != null) {
              // CLK SYS: every note at its time — together, or strummed at its own offset;
              // late (chase): now, for what is left of the chord.
              const play = _chase(_sysTickMs, noteDurationMs)
              const ordered = step.chordMode ? orderChordStrumNotes(step.notes, step.chordMode) : step.notes
              const strumStepMs = step.chordMode ? Math.min(25, stepMs / (ordered.length + 1)) : 0
              // exact beat only for a chord on its time (not a chased one)
              const beat = play && play.onMs === _sysTickMs ? _tickBeat() : null
              if (play) ordered.forEach((note, i) => {
                const clampedNote = Math.max(0, Math.min(127, note + (state.transpose || 0) + (step.transpose || 0)))
                _cpNoteAt(clampedNote, step.velocity, channel, play.onMs + strumStepMs * i, play.durMs,
                  beat != null ? beat + _msToBeats(strumStepMs * i) : null)
              })
            } else if (!step.chordMode) {
              // Simultaneous — today's only behavior, unchanged.
              step.notes.forEach(note => {
                const clampedNote = Math.max(0, Math.min(127, note + (state.transpose || 0) + (step.transpose || 0)))
                const noteKey = `${clampedNote}-${channel}`
                midiStore.sendNoteOn(clampedNote, step.velocity, channel, MidiSource.CHORD_PROG)
                _activeNoteKeys.add(noteKey)
                const tid = window.setTimeout(() => {
                  _pendingTimeouts.delete(tid)
                  midiStore.sendNoteOff(clampedNote, 0, channel, MidiSource.CHORD_PROG)
                  _activeNoteKeys.delete(noteKey)
                }, noteDurationMs)
                _pendingTimeouts.add(tid)
              })
            } else {
              // Staggered strum in step.chordMode's direction. Spread across a
              // small slice of the step, capped so it always reads as a fast
              // strum rather than stretching into the step's own duration on
              // slow steps or big chords.
              const orderedNotes = orderChordStrumNotes(step.notes, step.chordMode)
              const strumStepMs = Math.min(25, stepMs / (orderedNotes.length + 1))

              orderedNotes.forEach((note, i) => {
                const clampedNote = Math.max(0, Math.min(127, note + (state.transpose || 0) + (step.transpose || 0)))
                const noteKey = `${clampedNote}-${channel}`
                const onTid = window.setTimeout(() => {
                  _pendingTimeouts.delete(onTid)
                  if (_stopPending) return
                  midiStore.sendNoteOn(clampedNote, step.velocity, channel, MidiSource.CHORD_PROG)
                  _activeNoteKeys.add(noteKey)
                  const offTid = window.setTimeout(() => {
                    _pendingTimeouts.delete(offTid)
                    midiStore.sendNoteOff(clampedNote, 0, channel, MidiSource.CHORD_PROG)
                    _activeNoteKeys.delete(noteKey)
                  }, noteDurationMs)
                  _pendingTimeouts.add(offTid)
                }, strumStepMs * i)
                _pendingTimeouts.add(onTid)
              })
            }
          }  // closes if (effectiveMode !== 'arp')

          // Bass note: send lowest note to dedicated bass device/channel on step start
          if (bassEnabled.value && bassDevice.value && step?.active && step.velocity > 0 && step.notes?.length > 0) {
            const bassNote = getBassNote(step, (state.transpose || 0) + (step.transpose || 0))
            if (bassNote !== null) {
              const tickMs = 60000 / (state.bpm * 96)
              const stepMs = tickMs * ticksNeeded
              const bassDurationMs = Math.max(10, stepMs * ((step.gate ?? 80) / 100))
              if (_sysTickMs == null) sendBassNoteOn(bassNote, step.velocity, bassDurationMs)
              else {
                const play = _chase(_sysTickMs, bassDurationMs)
                if (play) sendBassNoteOn(bassNote, step.velocity, play.durMs, play.onMs, play.onMs === _sysTickMs ? _tickBeat() : null)
              }
            }
          }
        }  // closes if (state.tickCounter === 0)

        if (effectiveMode === 'arp' && step?.active && step.velocity > 0 && step.notes?.length > 0) {
          const arpTicks = DURATION_TICKS[step.arpRate ?? state.arpRate] ?? 8
          if (state.tickCounter % arpTicks === 0) {
            if (_stopPending) return
            const tickMs = 60000 / (state.bpm * 96)
            const arpMs = tickMs * arpTicks
            const noteDurationMs = Math.max(10, arpMs * ((step.gate ?? 80) / 100))
            const channel = state.channel

            if (!state.arpPatternStates.has(state.stepPointer)) {
              state.arpPatternStates.set(state.stepPointer, defaultArpPatternState())
            }
            const patternState = state.arpPatternStates.get(state.stepPointer)
            const sortedNotes = [...step.notes].sort((a, b) => a - b)
            const noteIdx = nextArpIndex(step.arpMode ?? 'up', patternState, sortedNotes.length)
            if (noteIdx < 0) return

            const clampedNote = Math.max(0, Math.min(127, sortedNotes[noteIdx] + (state.transpose || 0) + (step.transpose || 0)))
            if (_sysTickMs != null) {
              if (!_sysSilent) _cpNoteAt(clampedNote, step.velocity, channel, _sysTickMs, arpMs, _tickBeat())
            } else {
              const noteKey = `${clampedNote}-${channel}`
              midiStore.sendNoteOn(clampedNote, step.velocity, channel, MidiSource.CHORD_PROG)
              _activeNoteKeys.add(noteKey)
              const tid = window.setTimeout(() => {
                _pendingTimeouts.delete(tid)
                midiStore.sendNoteOff(clampedNote, 0, channel, MidiSource.CHORD_PROG)
                _activeNoteKeys.delete(noteKey)
              }, arpMs)
              _pendingTimeouts.add(tid)
            }
          }
        }

        state.tickCounter++
        if (state.tickCounter >= ticksNeeded) {
          state.tickCounter = 0
          // Latch: the latched chord again (or now, from the chord that was sounding), no advance
          const li = _latch(state)
          if (li >= 0) state.stepPointer = li
          else {
            const nextPointer = state.stepPointer + 1
            if (nextPointer >= activeCount) {
              // the end of the slot: a "start only" stop ends here, a cued slot comes in on the next tick
              if (!state.loop || _cpStopAtEnd) {
                if (_cpStopAtEnd && _sysTickMs != null) _cpCutVoicesAt(_sysTickMs)
                _cpStopAtEnd = false
                drawAt(() => { store.isPlaying = false }, time)
              }
              _cpWrapped = true
              state.stepPointer = 0
            } else {
              state.stepPointer = nextPointer
            }
            _chainSwitch(state)
          }
        }
      }

      if (systemClock.value) {
        if (!store.isPlaying) return
        _startSystemClock(tickCb, alignToBar)
        transportManager.acquireTransport()
        return
      }
      repeatEventIdRef.value = getTransport().scheduleRepeat(tickCb, '384n', alignToBar ? transportManager.getNextBarPosition() : undefined)

      transportManager.acquireTransport()
    })
  })

  // Latch (store.latchStep, the Rig's row 8): the position of the latched chord of the slot playing
  // (-1: none — the progression goes on).
  function _latch(state) {
    return latchIndex(state.steps, state.numSteps, state.stepPointer, store.latchStep,
      state.chainSlotIndices ? { localIndices: state.chainLocalIndices, positions: state.chainPositions, slotIndices: state.chainSlotIndices } : null)
  }

  // Chain switched on / off while playing (the Rig's Chord Chain, the panel): at the end of the slot
  // playing (its next chord is its first) — on: the chain from its start; off: the slot that was
  // playing, looped. Called after the pointer moved to the next chord.
  function _chainSwitch(state) {
    const want = store.chainEnabled && store.chain.some(i => i >= 0)
    const has = !!state.chainSlotIndices
    if (want === has) return
    const local = has ? state.chainLocalIndices[state.stepPointer] : state.stepPointer
    if (local !== 0) return
    if (want) {
      const c = store.getChainSteps()
      state.steps = c.steps
      state.numSteps = c.numSteps
      state.chainSlotIndices = c.slotIndices
      state.chainLocalIndices = c.localIndices
      state.chainPositions = c.positions
      _lastFollowedSlot = store.activeSlotIndex
    } else {
      const prev = state.stepPointer === 0 ? state.numSteps - 1 : state.stepPointer - 1
      const slot = state.chainSlotIndices[prev]
      if (slot != null && store.activeSlotIndex !== slot) handleSlotSelect(slot)
      state.steps = store.steps
      state.numSteps = store.numSteps
      state.playMode = store.playMode
      state.arpRate = store.arpRate
      state.chainSlotIndices = null
      state.chainLocalIndices = null
      state.chainPositions = null
    }
    state.stepPointer = 0
    state.arpPatternStates = new Map()
  }

  // Sync live state changes into playStateRef without restarting.
  // Skipped during chain playback: state.steps there is the flattened,
  // multi-slot chain array built once at play-start (buildPlayState), not
  // store.steps — syncing store.steps into it would replace the actively
  // playing chain sequence with whichever single slot auto-follow just
  // switched into view (see the chain-follow block below).
  watch([() => store.steps, () => store.numSteps, () => store.playMode, () => store.arpRate, () => midiStore.midiChannel], () => {
    if (playStateRef.current && store.isPlaying && !playStateRef.current.chainSlotIndices) {
      playStateRef.current.steps = store.steps
      playStateRef.current.numSteps = store.numSteps
      playStateRef.current.playMode = store.playMode
      playStateRef.current.arpRate = store.arpRate
      playStateRef.current.channel = midiStore.midiChannel
    }
  }, { deep: true })

  watch(seqTranspose, v => { if (playStateRef.current) playStateRef.current.transpose = v })
  watch(loopEnabled, v => { if (playStateRef.current) playStateRef.current.loop = v })

  watch(() => store.isPlaying, (playing) => {
    if (midiStore.syncChordProgTransport) {
      if (playing) midiStore.sendStart()
      else midiStore.sendStop()
    }
    if (syncStore.syncChordProgToAudioCapture) {
      if (playing) {
        // Arm capture — the next transport tick will fire start-rec with pre-roll
        _captureArmed = true
        captureArmed.value = true
      } else {
        _captureArmed = false
        captureArmed.value = false
        if (_captureRecording) {
          _captureRecording = false
          captureRecording.value = false
          window.dispatchEvent(new CustomEvent('capture-stop-rec'))
        }
      }
    }
  })

  watch(() => arpStore.arpBpm, (bpm) => {
    if (playStateRef.current && store.isPlaying) {
      playStateRef.current.bpm = bpm
      getTransport().bpm.value = bpm
    }
    // System clock on the internal tempo (with an external master the grid follows Live's beats).
    if (_sysSched && !externalGrid.active) { _sysSched.setTempo(bpm); intGrid.setTempo(bpm, performance.now()) }
  })

  // Switching the clock while playing: restart on the other one.
  watch(systemClock, () => {
    if (!store.isPlaying) return
    store.isPlaying = false
    setTimeout(() => { store.isPlaying = true }, 0)
  })
  const panicDelayMs = ref(250)
  function handleSlotSelect(idx) {
    if (store.activeSlotIndex !== idx) {
      store.slotSave(store.activeSlotIndex)
      store.slotLoad(idx)
    }
  }
  function previewStep(idx) {
    const step = store.steps[idx]
    if (!step?.active || !step.notes?.length) return
    previewTimeouts.forEach(id => clearTimeout(id))
    previewTimeouts.length = 0
    previewActiveNotes.forEach(({ note, channel }) =>
      midiStore.sendNoteOff(note, 0, channel, MidiSource.CHORD_PROG))
    previewActiveNotes.length = 0
    const channel = midiStore.midiChannel
    const shift = (seqTranspose.value || 0) + (step.transpose || 0)
    announceChord(step.chordName, step.notes, shift)
    step.notes.forEach(note => {
      const n = Math.max(0, Math.min(127, note + shift))
      midiStore.sendNoteOn(n, 90, channel, MidiSource.CHORD_PROG)
      previewActiveNotes.push({ note: n, channel })
      previewTimeouts.push(window.setTimeout(() => {
        midiStore.sendNoteOff(n, 0, channel, MidiSource.CHORD_PROG)
        const i = previewActiveNotes.findIndex(x => x.note === n && x.channel === channel)
        if (i !== -1) previewActiveNotes.splice(i, 1)
      }, 1000))
    })
  }
  const previewTimeouts = []
  const previewActiveNotes = [] // { note, channel } — track exactly what's sounding
  const heldChordNotes = [] // { note, channel } — notes from MIDI Learn-triggered chords, held until next trigger
  function stopHeldChord() {
    store.playingChordName = ''
    store.playingChordDuration = ''
    heldChordNotes.forEach(({ note, channel }) =>
      midiStore.sendNoteOff(note, 0, channel, MidiSource.CHORD_PROG))
    heldChordNotes.length = 0
    _pendingTimeouts.forEach(id => clearTimeout(id))
    _pendingTimeouts.clear()
    _activeNoteKeys.forEach(key => {
      const [noteStr, chanStr] = key.split('-')
      midiStore.sendNoteOff(parseInt(noteStr), 0, parseInt(chanStr), MidiSource.CHORD_PROG)
    })
    _activeNoteKeys.clear()
    if (heldBassNote) {
      _bassOff(heldBassNote)
      heldBassNote = null
    }
  }

  /** Stop a chord played on its own (no Play): the panel's STOP, MIDI cp_panic, a click on the chord
   *  sounding. A Sequencer the chords auto-started (MIDI Flow Chord Prog → Sequencer) stops with it. */
  function releaseChord() {
    stopHeldChord()
    store.currentStep = -1
    window.dispatchEvent(new CustomEvent('cp-chord-release'))
  }

  function triggerChordStep(idx, forcePlay = false) {
    const step = store.steps[idx]
    if (!step?.active || !step.notes?.length) return

    // Toggle off only on manual click; MIDI controllers always play
    if (!forcePlay && store.currentStep === idx && heldChordNotes.length > 0) {
      stopAllNotes()
      store.currentStep = -1
      store.selectedStepIdx = idx
      window.dispatchEvent(new CustomEvent('cp-chord-release'))
      return
    }

    const channel = midiStore.midiChannel
    const shift = (seqTranspose.value || 0) + (step.transpose || 0)
    const effectiveMode = stepPlayMode(store.progMode, step.stepMode, store.playMode)
    announceChord(step.chordName, step.notes, shift)

    // Stop any held chord + any preview notes
    stopHeldChord()
    // A stop still fading out (stopAllNotes): cancel its end, or it would release this new chord;
    // Expression back to full (the fade lowered it).
    if (_panicTimeout) {
      clearTimeout(_panicTimeout)
      _panicTimeout = null
      _stopPending = false
      midiStore.sendCC(11, 127, channel, MidiSource.CHORD_PROG)
    }
    previewTimeouts.forEach(id => clearTimeout(id))
    previewTimeouts.length = 0
    previewActiveNotes.forEach(({ note, channel }) =>
      midiStore.sendNoteOff(note, 0, channel, MidiSource.CHORD_PROG))
    previewActiveNotes.length = 0
    store.selectedStepIdx = idx
    store.currentStep = idx
    store.playingChordName = step.chordName

    if (effectiveMode === 'arp') {
      const sortedNotes = [...step.notes].sort((a, b) => a - b)

      const arpRate = step.arpRate ?? store.arpRate
      const arpTicks = DURATION_TICKS[arpRate] ?? 8
      const bpm = arpStore.arpBpm || 120
      const tickMs = 60000 / (bpm * 96)
      const arpMs = tickMs * arpTicks
      const noteDurationMs = Math.max(10, arpMs * ((step.gate ?? 80) / 100))
      const patternState = defaultArpPatternState()
      const velocity = step.velocity || 90

      _stopPending = false

      function tickArp() {
        if (_stopPending) return
        const noteIdx = nextArpIndex(step.arpMode ?? 'up', patternState, sortedNotes.length)
        if (noteIdx < 0) return
        const clampedNote = Math.max(0, Math.min(127, sortedNotes[noteIdx] + shift))
        const noteKey = `${clampedNote}-${channel}`
        midiStore.sendNoteOn(clampedNote, velocity, channel, MidiSource.CHORD_PROG)
        _activeNoteKeys.add(noteKey)
        const offTid = window.setTimeout(() => {
          _pendingTimeouts.delete(offTid)
          midiStore.sendNoteOff(clampedNote, 0, channel, MidiSource.CHORD_PROG)
          _activeNoteKeys.delete(noteKey)
        }, noteDurationMs)
        _pendingTimeouts.add(offTid)
        const nextTid = window.setTimeout(tickArp, arpMs)
        _pendingTimeouts.add(nextTid)
      }

      tickArp()

      // Bass note for arp mode: hold the lowest note for the step duration
      if (bassEnabled.value && bassDevice.value) {
        const bassNote = getBassNote(step, shift)
        if (bassNote !== null) {
          const n = Math.max(0, Math.min(127, bassNote))
          heldBassNote = { dev: bassDevice.value, note: n, channel: Math.max(1, Math.min(16, bassChannel.value)) }
          _bassOn(heldBassNote.dev, n, velocity, heldBassNote.channel)
        }
      }
    } else {
      step.notes.forEach(note => {
        const n = Math.max(0, Math.min(127, note + shift))
        midiStore.sendNoteOn(n, step.velocity || 90, channel, MidiSource.CHORD_PROG)
        heldChordNotes.push({ note: n, channel })
      })

      // Bass note for chord mode
      if (bassEnabled.value && bassDevice.value) {
        const bassNote = getBassNote(step, shift)
        if (bassNote !== null) {
          const n = Math.max(0, Math.min(127, bassNote))
          heldBassNote = { dev: bassDevice.value, note: n, channel: Math.max(1, Math.min(16, bassChannel.value)) }
          _bassOn(heldBassNote.dev, n, step.velocity || 90, heldBassNote.channel)
        }
      }
    }
  }

  /** A library chord heard for 1 s (`transpose`: the library's transpose). */
  function previewChord(chord, transpose = 0) {
    // Cancel all pending note-offs
    previewTimeouts.forEach(id => clearTimeout(id))
    previewTimeouts.length = 0
    // Explicitly stop every note that is currently sounding
    previewActiveNotes.forEach(({ note, channel }) => {
      midiStore.sendNoteOff(note, 0, channel, MidiSource.CHORD_PROG)
    })
    previewActiveNotes.length = 0

    const channel = midiStore.midiChannel
    const velocity = 90
    announceChord(chord.name ?? chord.chordName, chord.notes, transpose)
    chord.notes.forEach(note => {
      const n = Math.max(0, Math.min(127, note + transpose))
      midiStore.sendNoteOn(n, velocity, channel, MidiSource.CHORD_PROG)
      previewActiveNotes.push({ note: n, channel })
      previewTimeouts.push(window.setTimeout(() => {
        midiStore.sendNoteOff(n, 0, channel, MidiSource.CHORD_PROG)
        const idx = previewActiveNotes.findIndex(x => x.note === n && x.channel === channel)
        if (idx !== -1) previewActiveNotes.splice(idx, 1)
      }, 1000))
    })
  }
  // journaled (lib/session-takes.ts): the progression it replaces is kept as a session take
  // name: that progression of the Source (the Progressions browser), else one picked for the style
  function handleGenerate(name) {
    journaled('chord', store.activeSlotIndex, () => {
      // the style decides the chords' durations (chord-gen-style.ts); Fill › Dur sets them all after
      store.generateAlgorithmic(progressionData.value, typeof name === 'string' ? name : undefined)
    })
  }
  /** A progression of the Source into the slot as written (the Progressions browser's AS IS). */
  function loadProgressionAsIs(name) {
    journaled('chord', store.activeSlotIndex, () => store.loadProgressionByName(progressionData.value, name))
  }
  // A Rig pad adds { sync } (its Trigger sync, sixteenths): the start waits for that sync point of
  // Live's song grid (0 = at once), the stop lets the chords play up to it.
  const _onCpStart = (e) => {
    const sync = e?.detail?.sync
    if (_cpStopSteps || _cpStopAtEnd) { _cpStopSteps = 0; _cpStopAtEnd = false; return } // a queued stop: un-queue it
    if (store.isPlaying) return
    _cpStartSteps = typeof sync === 'number' ? Math.max(0, sync) : 0
    store.isPlaying = true
  }
  const _onCpStop = (e) => {
    const sync = e?.detail?.sync
    // -1 (the Rig's "start only"): at the end of the slot playing
    if (sync === -1 && store.isPlaying) { _cpStopAtEnd = true; return }
    // Queued for the sync point, on Live's grid or SY.CORE's own clock.
    if (typeof sync === 'number' && sync > 0 && store.isPlaying) { _cpStopSteps = sync; return }
    store.isPlaying = false
  }
  const _onCpSlotSelect = (e) => { handleSlotSelect(e.detail?.idx ?? 0) }
  // A slot's own tempo (store.slotBpm): set when that slot comes in, playing — SY.CORE's, or Live's
  // over SY.CORE Link; following a plain MIDI clock the master owns the tempo.
  watch(() => store.playingSlotIndex, idx => {
    if (idx == null || !store.isPlaying) return
    const bpm = Number(store.slotBpm?.[idx])
    if (!(bpm >= 20 && bpm <= 300)) return
    if (clockStore.source !== 'internal' && !clockStore.fallbackToInternal) {
      if (clockStore.isLink) linkClient.sendTempo(bpm)
      return
    }
    if (Math.abs((midiStore.currentBpm ?? 0) - bpm) > 0.05) midiStore.setGlobalBpm(bpm)
  })
  // The Rig's Mute (Shift + the Chord row): the chord sounding ends now, not at its note-off.
  const _onCpVoicesCut = () => { _cpCutVoicesAt(performance.now() + 1) }
  // Rig Controller GEN (LIVE): a new progression into the active slot, played from its next chord.
  // { mode: 'ai' } asks the AI (key and length of the slot); not configured or failed → built-in.
  let _cpGenBusy = false
  const _onCpGenerate = async (e) => {
    if (e?.detail?.mode === 'ai' && !_cpGenBusy) {
      _cpGenBusy = true
      try {
        if (await journaled('chord', store.activeSlotIndex, () => store.generateFromAiPrompt('A fresh chord progression for a live set, different from the current one, same key'), { source: 'ai' })) return
      } catch {} finally { _cpGenBusy = false }
    }
    handleGenerate()
  }

  // Control Map (P3, 'cp-slot-cue'): while playing, the slot starts on the next bar line, from its
  // first chord (as a clip launched in Live's Session View); stopped — or during chain playback,
  // where the chain decides — it's selected at once.
  const cuedSlotIdx = ref(null)
  // Rig Controller (rig-live.ts): the queued slot, mirrored for the pads.
  watch(cuedSlotIdx, v => { rigReports.queued.chord = v })
  let _cpCueSlot = null
  let _cpCueSteps = 0    // Rig pad (Trigger sync): the cue's sync point, sixteenths (1 = next sixteenth, "at once")
  let _cpStopSteps = 0   // Rig pad: a stop queued for that sync point
  let _cpStartSteps = 0  // Rig pad: the next start waits for that sync point
  let _cpCueAtEnd = false   // Rig "start only": the cued slot comes in at the end of the slot playing
  let _cpStopAtEnd = false  // Rig "start only": the stop at the end of the slot playing
  let _cpWrapped = false    // the progression just wrapped (the end of the slot)
  const _onCpSlotCue = (e) => {
    const idx = e.detail?.idx
    if (idx == null || idx < 0 || idx >= (store.SLOT_COUNT ?? 8)) return
    if (!store.isPlaying || playStateRef.current?.chainSlotIndices) { handleSlotSelect(idx); return }
    const sync = e.detail?.sync
    _cpCueAtEnd = sync === -1
    _cpCueSteps = typeof sync === 'number' && sync > 0 ? Math.max(1, sync) : typeof sync === 'number' && sync === 0 ? 1 : 0
    _cpCueSlot = idx === store.activeSlotIndex ? null : idx
    cuedSlotIdx.value = _cpCueSlot
  }

  // ── MIDI feedback for Learn-mapped params ──────────────────────────────────
  // cp_play / cp_slot_*: core/midi/led-feedback-service.ts; here only cp_panic's flash.
  function sendChMappingFeedback(paramNamePrefix, isOn) {
    const val = isOn ? 127 : 0
    for (const entry of Object.values(mappingStore.midiMappings)) {
      const m = entry
      if (typeof m !== 'object' || !m.paramName?.startsWith(paramNamePrefix)) continue
      if (!m.device || isLiveOwned(m.device)) continue
      const out = findOutputFor(m.device, midiService.getOutputs())
      if (!out) continue
      const ch = (m.channel ?? 0) & 0x0f
      if ('cc' in m) {
        try { out.send([0xB0 | ch, m.cc, val]) } catch {}
      } else if ('note' in m) {
        try { out.send([0x90 | ch, m.note, val]) } catch {}
      }
    }
  }

  // MIDI FLOW device→app input routing: a device wired to Chord Sequencer in
  // the canvas starts playback on note-on (see docs/plans/modular/MIDI-Flow-Control.md).
  let _unsubMidiNote = null
  let _unsubRawMidi = null
  function _onMidiNoteIn(type, note, velocity, chan, inputId) {
    if (type !== 'on' || velocity <= 0) return
    if (!uiStore.isChordProgOpen) return  // as before: only while its panel is open
    const inputDevice = midiService.getInputs().find(i => i.id === inputId)
    const sourceKey = inputDevice?.name
    // Starting playback is a much bigger deal than just sounding a note, so
    // this requires an explicit MIDI Flow cable to this source — unlike most
    // isDeviceRoutedToApp checks elsewhere, an unwired device must NOT
    // auto-start the sequencer just because nothing's been configured yet.
    if (!midiStore.hasExplicitInputRouting(sourceKey)) return
    if (!midiStore.isDeviceRoutedToApp(sourceKey, MidiSource.CHORD_PROG, note)) return
    _onCpStart()
  }

  // MIDI FLOW app-to-app routing (e.g. Step Sequencer OUT → Chord Sequencer
  // IN) — a separate pipeline from device input above, since an app's
  // generated notes never pass through a real MIDI input port.
  let _unsubAppNote = null
  function _onAppNoteIn(type, note, velocity, chan, sourceApp) {
    if (type !== 'on' || velocity <= 0) return
    if (!uiStore.isChordProgOpen) return  // as before: only while its panel is open
    // Same reasoning as _onMidiNoteIn — an unwired app source must not
    // auto-start this sequencer's playback by default.
    if (!midiStore.hasExplicitInputRouting(sourceApp)) return
    if (!midiStore.isDeviceRoutedToApp(sourceApp, MidiSource.CHORD_PROG, note)) return
    _onCpStart()
  }
  function _onRawMidiIn(event) {
    if (!uiStore.isChordProgOpen) return  // as before: only while its panel is open
    if (!event.data || event.data.length < 3) return
    const status  = event.data[0]
    const type    = status & 0xF0
    const channel = status & 0x0F
    const byte1   = event.data[1]
    const byte2   = event.data[2]
    const isCC    = type === 0xB0 && byte2 > 1
    const isNote  = type === 0x90 && byte2 > 1
    if (!isCC && !isNote) return
    const inputPort = midiService.getInputs().find(i => i.id === event.target?.id)
    const device    = inputPort?.name || null
    const keyParts  = []
    if (device) keyParts.push(device)
    keyParts.push(`CH${channel + 1}`)
    keyParts.push(isNote ? `NOTE${byte1}` : `CC${byte1}`)
    const key     = keyParts.join(':')
    const mapping = mappingStore.midiMappings[key]
    if (!mapping) return
    const paramName = typeof mapping === 'object' ? mapping.paramName : mapping
    if (!paramName.startsWith('cp_step_') && paramName !== 'cp_panic') return
    if (paramName === 'cp_panic') {
      releaseChord()
      sendChMappingFeedback('cp_panic', true)
      setTimeout(() => sendChMappingFeedback('cp_panic', false), 100)
      return
    }
    const idx = parseInt(paramName.slice('cp_step_'.length))
    if (!isNaN(idx) && idx >= 0 && idx < 16 && idx < store.numSteps) {
      // Guard against double-trigger from controllers that send duplicate
      // messages on press (e.g. some momentary buttons send 127 twice).
      const now = Date.now()
      if (_lastMidiTriggerStep === idx && now - _lastMidiTriggerTime < 200) return
      _lastMidiTriggerStep = idx
      _lastMidiTriggerTime = now

      // Cancel any previously scheduled deferred trigger
      if (_scheduledMidiEventId !== null) {
        getTransport().cancel(_scheduledMidiEventId)
        _scheduledMidiEventId = null
      }

      if (syncStore.syncChordProgManualTrigger && transportManager.isRunning.value) {
        // Don't stop the current chord — let it play until the bar boundary,
        // then the scheduled triggerChordStep will naturally stop it and play
        // the new step at the transition point.
        const barPos = transportManager.getNextBarPosition()
        _scheduledMidiEventId = getTransport().schedule(() => {
          _scheduledMidiEventId = null
          triggerChordStep(idx, true)
        }, barPos)
      } else {
        triggerChordStep(idx, true)
      }
    }
  }

  // Auto-save current slot whenever steps/numSteps/playMode/arpRate change
  watch([() => store.steps, () => store.numSteps, () => store.playMode, () => store.arpRate], () => {
    store.slotSave(store.activeSlotIndex)
  }, { deep: true })
  const fillDuration = ref('1m')
  const fillDurationRandom = ref(false)

  const events = { 'cp-start': _onCpStart, 'cp-stop': _onCpStop, 'cp-slot-select': _onCpSlotSelect, 'cp-slot-cue': _onCpSlotCue, 'cp-generate': _onCpGenerate, 'cp-voices-cut': _onCpVoicesCut }
  for (const [name, fn] of Object.entries(events)) window.addEventListener(name, fn)
  const unsubs = [
    midiService.addNoteListener(_onMidiNoteIn),
    midiStore.addAppNoteListener(_onAppNoteIn),
    midiService.addRawListener(_onRawMidiIn),
  ]
  onScopeDispose(() => {
    for (const [name, fn] of Object.entries(events)) window.removeEventListener(name, fn)
    for (const u of unsubs) { try { u?.() } catch {} }
    _stopSystemClock()
  })

  return {
    // settings and state the panel shows / edits
    seqTranspose, loopEnabled, bassEnabled, bassDevice, bassChannel, midiOutputs,
    captureBarCount, captureAutoStop, captureArmed, captureRecording,
    systemClock, panicDelayMs, cuedSlotIdx, fillDuration, fillDurationRandom,
    /** Our own tick counter (384n), for the transport position readout. */
    getTransportTicks: () => _transportTicks,
    // actions
    chordNotes, handleSlotSelect, triggerChordStep, stopHeldChord, releaseChord, stopAllNotes,
    previewChord, previewStep, handleGenerate, loadProgressionAsIs,
  }
}
