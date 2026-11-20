/**
 * Drum Machine engine — the Drum Machine's playback outside its Vue component (Scenario Workspaces,
 * Phase 1): the clock (Tone.js '16n' repeat or CLK SYS), the steps and bassline voices (samples or
 * MIDI), queued sequence switches, the Rig parts (drums / bassline) and their sync points, Fill,
 * the pattern chain, REC SYNC, Start@bar / Stop@end, sample loading, the last preset and the Default
 * Kit at start, the Rig / Control Map / Timeline events (dm-*, timeline-dm-*) and MIDI Flow inputs.
 *
 * One instance for the whole app (useDrumMachineEngine), created on first use in a detached
 * effectScope: it keeps playing with the Drum Machine panel closed or unmounted. The panel
 * (DrumMachine.vue) renders store + engine state, calls its actions and paints the playhead
 * (setPlayheadPainter).
 *
 * The code is moved from DrumMachine.vue as it was (2026-11-11); only what tied it to the
 * component changed: the playhead goes to the painter the panel registers, handleLoadPreset no
 * longer closes the panel's preset menu, generatePattern no longer closes its style menu, and
 * unmounting the panel stops nothing.
 */
import { ref, computed, watch, nextTick, effectScope, onScopeDispose } from 'vue'
import { storeToRefs } from 'pinia'
import { getTransport, start as toneStart, now as toneNow } from 'tone'
import { drawAt } from '@/lib/ui-clock'
import { audioTimeToPerfMs, perfMsToAudioTime } from '@/lib/audio-clock'
import { StepScheduler, createWorkerTicker, VoiceLedger, noteOffDecideAt } from '@/core/midi/step-scheduler'
import { externalGrid } from '@/core/midi/external-grid'
import { intGrid } from '@/core/midi/int-grid'
import { densityKeeps, densityFor } from '@/lib/rig-density'
import { drumPerform, applyDynamics, humanizeOffsets } from '@/lib/drum-perform'
import { useTransportManager } from '@/composables/useTransportManager'
import { useDrumMachineStore, drumStyleOf } from '@/stores/useDrumMachineStore'
import { journaled } from '@/lib/session-takes'
import { useAudioMixerStore } from '@/stores/useAudioMixerStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { useArpStore } from '@/stores/useArpStore'
import { useSyncStore } from '@/stores/useSyncStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useFreesoundCache } from '@/composables/useFreesoundCache'
import * as drumEngine from '@/lib/drum-engine'
import { midiService, MidiSource } from '@/core/midi/midi-service'
import { useMidiStore } from '@/stores/useMidiStore'
import { userKey } from '@/lib/userKey'
import { resolveDefaultKitAssetUrl } from '@/lib/default-kit-assets'
import { beatPosition, setDrumPosition, resetDrumPosition } from '@/lib/drum-position'
import { fillHasHits } from '@/lib/drum-export'
import { rigReports, rigParts } from '@/lib/rig-live'

let engine = null
let engineScope = null

/** The Drum Machine engine (created on first call; needs Pinia installed). */
export function useDrumMachineEngine() {
  if (!engine) {
    engineScope = effectScope(true)
    engine = engineScope.run(createDrumMachineEngine)
  }
  return engine
}

/** Tests: drop the engine (its watchers and listeners), so the next call makes a new one. */
export function _resetDrumMachineEngine() {
  engineScope?.stop()
  engineScope = null
  engine = null
}

function createDrumMachineEngine() {
  const drumStore      = useDrumMachineStore()
  const { autofillEnabled, chainEnabled } = storeToRefs(drumStore)
  const mixer          = useAudioMixerStore()
  const mappingStore   = useMappingStore()
  const arpStore       = useArpStore()
  const syncStore      = useSyncStore()
  const configStore    = useConfigStore()
  const midiStore      = useMidiStore()
  const { cacheFileBlob, resolveUrl } = useFreesoundCache()
  const transportManager = useTransportManager()

  // The playhead: painted by the panel while it is mounted (data-playhead on its root; see
  // DrumMachine.vue), nothing otherwise.
  let _painter = null
  let _playhead = -1
  function paintPlayhead(step) { _playhead = step; _painter?.(step) }
  function setPlayheadPainter(fn) { _painter = fn; fn?.(_playhead) }

  // ── State moved from the panel ──
  const selectedStyle   = ref('House')
  const generateAsFill  = ref(false)
  const currentPresetId = ref(null)
  const loadingDefaultKit    = ref(false)
  const showBassline = ref(false)
  const basslineMidiCapture = ref(-1) // voice index awaiting MIDI note, or -1
  const basslineCaptureSeq = ref(null) // its bassline sequence (null = the active one)
  const basslineRootNote = ref(24)

  // Quantized sequence switching — set by tab click, applied at next bar start
  let _pendingSequence = null
  const pendingSequence = ref(null) // UI display only (drives pulsing tab border)
  // Rig Controller (rig-live.ts): the queued sequence, mirrored for the pads.
  watch(pendingSequence, v => { rigReports.queued.drum = v ? 'ABCDEFGH'.indexOf(v) : null })

  // Fill
  const fillActive    = ref(false)
  // Fill on the next bar (drumStore.fillWhen 'bar'): armed until the bar line, then the whole bar.
  let _fillArmed      = false
  const fillArmed     = ref(false)
  watch([fillActive, fillArmed], ([a, b]) => { rigReports.fill = a || b; rigReports.fillArmed = b && !a })
  let _fillAutoStop   = false
  const fillSaveFrom  = ref(1)
  const fillSaveTo    = ref(16)
  const fillPattern = ref(
    Array(drumStore.TRACK_LABELS.length).fill(null).map(() => Array(16).fill(null).map(() => ({ active: false, velocity: 100, accent: false, ratchet: 1, tie: 0 })))
  )

  // REC SYNC — arms at bar start, records 16 × multiplier steps, auto-stops
  let _recSyncArmed          = false
  let _recSyncRecording      = false
  let _recSyncBarsRemaining  = 0
  const recSyncArmed      = ref(false)
  const recSyncActive     = ref(false)
  const recSyncMultiplier = ref(1)

  // ── Sync BPM from arpStore (global BPM) ───────────────────────────────────────
  watch(() => arpStore.arpBpm, v => { drumStore.bpm = v }, { immediate: true })
  watch(() => drumStore.bpm, v => {
    drumEngine.setDelayTime(v)
    // The '16n' grid runs on the Transport, while swing/ratchet/gate use
    // state.bpm: retune the Transport too, or a tempo change while playing
    // leaves the grid on the old BPM and those offsets drift off-beat.
    if (drumStore.isPlaying) getTransport().bpm.value = v
    // System clock on the internal tempo (with an external master the grid follows Live's beats).
    if (_sysSched && !externalGrid.active) { _sysSched.setTempo(v); intGrid.setTempo(v, performance.now()) }
  })

  // ── Tone.js scheduling ────────────────────────────────────────────────────────
  const playStateRef = { current: null }
  let repeatEventIdRef = null
  let stepCounter = 0
  let _tieCountdown = Array(11).fill(0)

  function buildPlayState() {
    return {
      tracks: drumStore.currentPattern.map(t => ({
        muted:  t.muted,
        solo:   t.solo,
        volume: t.volume,
        length: t.length ?? 16,
        midiOutEnabled: t.midiOutEnabled ?? false,
        midiNote: t.midiNote ?? 36,
        steps:  t.steps.map(s => ({ ...s })),
      })),
      basslineEnabled: drumStore.basslineEnabled && showBassline.value,
      basslineTracks: (drumStore.basslineSequences[drumStore.basslineSequence ?? drumStore.activeSequence] ?? []).map(t => ({
        muted:  t.muted,
        solo:   t.solo,
        volume: t.volume,
        pitch:  t.pitch ?? 0,
        length: t.length ?? 16,
        filterFreq: t.filterFreq ?? 20000,
        steps:  t.steps.map(s => ({ ...s })),
      })),
      basslineSourceSlots: [...drumStore.basslineSourceSlots],
      bpm:              drumStore.bpm,
      swing:            drumStore.swing,
      repeaterActive:   drumStore.repeaterActive,
      repeaterDivision: drumStore.repeaterDivision,
      fillActive:       fillActive.value,
      fillSteps:        fillPattern.value.map(steps => steps.map(s => ({ ...s }))),
    }
  }

  const hasSolo = computed(() =>
    drumStore.currentPattern.some(t => t.solo) ||
    (showBassline.value && drumStore.currentBasslinePattern.some(t => t.solo))
  )

  // ── MIDI Out (per-track "play an external drum machine instead") ───────────
  // fireTime is a Tone.js AudioContext time, converted to performance.now() ms
  // (lib/audio-clock.ts) for a timestamped Web MIDI send.
  // Accent has no MIDI equivalent, so it's folded into velocity instead (same
  // ratio as drum-engine.js's own ACCENT_BOOST).
  // Timestamped sends (like the Arpeggiator): the browser puts the note out at `at`, so main-thread
  // stalls and timer jitter don't move it. Before, setTimeout from toneNow() (= currentTime +
  // lookAhead) fired ~a lookahead ahead of the audio and wobbled with the page's load. A time
  // already past (a live pad) goes out now.
  // channel (1–16, optional): a dedicated channel sent as is (the bassline's, bypassing the
  // MIDI Flow OUT channel remap); without it the global channel + routing, as before.
  // Gate: a step's note ends a little before the next step (10% of it, at most 15 ms), not
  // on it: with a 100% gate two 1/16 of the same note had the note-off of the first land on —
  // with a ms of jitter, after — the note-on of the second, and Live ended the new note at
  // once (a sliver). The note-off is counted from the step's time, not from a late send.
  // System clock: notes leave from a Worker-timed queue — not a timestamped send (ignored on
  // Windows MIDI Services loopbacks: on+off together, no sound) nor a page timer — and a note
  // of the same pitch still sounding (a tie, a late send) is ended just before the new one;
  // its own queued note-off is then skipped (_drumVoices, like the Sequencer's).
  const _drumVoices = new VoiceLedger()
  function _sendMidiNote(note, velocity, accent, fireTime, duration, channel = 0) {
    if (_silentStep) return
    const vel = Math.max(1, Math.min(127, Math.round(velocity * (accent ? 1.35 : 1))))
    const now = performance.now()
    const wantAt = fireTime == null ? now : audioTimeToPerfMs(fireTime)
    const onAt  = Math.max(now, wantAt)
    const durMs = duration * 1000
    const offAt = Math.max(onAt + 10, wantAt + durMs - Math.min(15, durMs * 0.1))
    const ch   = channel >= 1 && channel <= 16 ? channel : midiStore.midiChannel
    const opts = channel >= 1 && channel <= 16 ? { exactChannel: true } : {}
    if (!drumStore.systemClock) {
      midiStore.sendNoteOn(note, vel, ch, MidiSource.DRUM_MACHINE, null, onAt, opts)
      midiStore.sendNoteOff(note, 0, ch, MidiSource.DRUM_MACHINE, null, offAt, opts)
      return
    }
    const key = `${ch}:${note}`
    // the previous hit of this pad ends by now: its note-off now, timestamped (else lost, see takeEndedBy)
    const ended = _drumVoices.takeEndedBy(key, onAt)
    if (ended) midiStore.sendNoteOff(note, 0, ch, MidiSource.DRUM_MACHINE, null, Math.min(ended.offAt, onAt - 1), { ...opts, workerTimed: true })
    const prev = _drumVoices.cutKeyAt(key, onAt)
    if (prev) midiStore.sendNoteOff(note, 0, ch, MidiSource.DRUM_MACHINE, null, onAt - 1, { ...opts, workerTimed: true })
    const id = _drumVoices.start(key, offAt, true)
    midiStore.sendNoteOn(note, vel, ch, MidiSource.DRUM_MACHINE, null, onAt, { ...opts, workerTimed: true })
    // decided NOTE_OFF_LEAD_MS early, sent timestamped (not when due: the main thread delayed it). No
    // second strike when a note-off already sent cuts a newer hit (a drum hit twice is worse than short).
    midiService.scheduleOnWorker(noteOffDecideAt(offAt, performance.now()), () => {
      if (_drumVoices.release(key, id)) midiStore.sendNoteOff(note, 0, ch, MidiSource.DRUM_MACHINE, null, offAt, { ...opts, workerTimed: true })
    }, undefined, 'DRUM note-off')
  }

  // ── MIDI OUT ONLY (drumStore.midiOutOnly) — the virtual instruments the Drum Machine is wired to
  // in MIDI Flow; while there's one and the switch is on, every track plays its MIDI note (the
  // channel set there) and no sample sounds: steps, ratchets, bassline voices, pads. ──
  // Panel outputs count too: "Live (M4L)" (SY.CORE Link) and the FM-1 Emulator.
  const midiOutTargets = computed(() => (midiStore.routingMatrix[MidiSource.DRUM_MACHINE] ?? [])
    .filter(name => midiStore.virtualInstruments.some(v => v.name === name) || midiStore.panelOutputs.includes(name)))
  const midiOutOnly = computed(() => drumStore.midiOutOnly && midiOutTargets.value.length > 0)

  // a pad hit (live pad, MIDI-triggered pad, preview): the track's MIDI note instead of its sample
  function _hitPad(trackIdx, velocity) {
    if (midiOutOnly.value) {
      const note = drumStore.currentPattern[trackIdx]?.midiNote ?? 36
      _sendMidiNote(note, velocity, false, null, 0.1)   // live: now
      return
    }
    drumEngine.triggerPad(trackIdx, { velocity, accent: false, time: 0 })
  }

  function _sendMidiRatchet(note, stepTimeSec, divisions, { velocity, accent, baseTime, duration }) {
    // Each subdivision gets its own short gate (rather than the full step
    // duration) so an earlier retrigger's note-off can't race a later
    // retrigger's note-on on external gear that tracks note state.
    const divDur = Math.min(duration, (stepTimeSec / divisions) * 0.9)
    for (let i = 0; i < divisions; i++) {
      const fireTime = baseTime + (i / divisions) * stepTimeSec
      _sendMidiNote(note, velocity, accent, fireTime, divDur)
    }
  }

  // ── System clock (drumStore.systemClock) — steps from a StepScheduler on performance.now(),
  // ticked by a Worker timer, instead of the Tone.js transport (audio clock). With an external
  // master (Ableton Live, P1) the grid re-anchors on every beat of it. _scheduleCallback is the
  // same in both modes: it gets the step's time converted to AudioContext time, as before. ──
  let _silentStep = false      // a step found too late (stalled page): advance, don't sound
  let _sysSched = null
  let _stopTicker = null
  let _offExtGrid = null
  let _sysStartSixteenth = 0   // Live's song sixteenth of the Drum Machine's step 0
  let _startSteps = 0         // this start waits for a sync point: 16 = bar (Start@bar), 8/4 = 2/1 beats (Rig pad)
  // Rig Controller pads (Trigger sync): a stop or a sequence switch on the next sync point of Live's song
  // grid (sixteenths: 16 bar, 8/4 two/one beats), instead of the Drum Machine's own bar line.
  let _rigStopSteps = 0
  let _rigSeqSteps = 0

  // ── Rig Controller rows Drum and Bass: two parts, independent ─────────────────────────────
  // Drums + bassline, drums only, bassline only: each row's pads turn its part on (from a sequence) or
  // off, on its Trigger sync; both off, the Drum Machine stops. 'dm-part' { part, on, seq?, sync }.
  let _drumsOn = true
  let _bassOn = true
  let _partPending = [] // { part, on, seq, steps } waiting for their sync point
  function _applyPart(p) {
    if (p.part === 'drum') {
      if (p.on && p.seq && p.seq !== drumStore.activeSequence) {
        // a bassline playing on the drums' sequence stays where it is
        if (_bassOn && drumStore.basslineSequence === null) drumStore.basslineSequence = drumStore.activeSequence
        drumStore.swapSequence(p.seq)
      }
      _drumsOn = p.on
    } else {
      if (p.on) {
        if (p.seq) drumStore.basslineSequence = p.seq
        drumStore.basslineEnabled = true
        showBassline.value = true
      }
      _bassOn = p.on
    }
    drumStore.drumsOn = _drumsOn
    drumStore.bassOn = _bassOn
  }
  /** The parts' switches still waiting, for the Rig (the slot that will play). */
  function _reportParts() {
    const L = 'ABCDEFGH'
    const q = part => { const p = _partPending.find(x => x.part === part && x.on && x.seq); return p ? L.indexOf(p.seq) : null }
    rigReports.queued.bass = q('bass')
    if (!_rigSeqSteps && !_pendingSequence) rigReports.queued.drum = q('drum')
  }
  function _onPart(e) {
    const { part, on, seq } = e.detail ?? {}
    const sync = e.detail?.sync ?? 0
    if (part !== 'drum' && part !== 'bass') return
    _partPending = _partPending.filter(p => p.part !== part)
    if (!drumStore.isPlaying) {
      if (on) {
        // Starting from this part alone (the other row may join right after, e.g. both armed).
        _drumsOn = part === 'drum'
        _bassOn = part === 'bass'
        _applyPart({ part, on: true, seq })
        requestPlay(true, sync)
      }
      _reportParts()
      return
    }
    if (sync <= 0 || !externalGrid.active) {
      _applyPart({ part, on, seq })
      _reportParts()
      if (!_drumsOn && !_bassOn) { drumStore.isPlaying = false; return }
      playStateRef.current = buildPlayState()
      return
    }
    _partPending.push({ part, on, seq, steps: sync })
    _reportParts()
  }

  function _startSystemClock() {
    _stopSystemClock()
    const now = performance.now()
    let startMs = now + 20
    let bpm = drumStore.bpm || 120
    _sysStartSixteenth = 0
    if (externalGrid.active && externalGrid.anchor) {
      // The bar Live is playing now, even when this start comes late (a busy page after Live's
      // Play): its steps already gone are handed out as late — the pattern advances silently and
      // comes in on the first step still in time, instead of waiting for the next bar.
      let bar = externalGrid.barAtOrBefore(now)
      // Start@bar (a press of PLAY / its MIDI Learn) or a Rig pad's Trigger sync: from the next
      // sync point (bar line, or beat), not mid-bar — unless the press came just after one (a few
      // ms late on the downbeat). Step 0 of the pattern is then that point.
      if (_startSteps && bar != null) {
        const graceMs = Math.min(80, 15000 / (externalGrid.bpm || bpm) * 0.5)
        bar = externalGrid.pointAtOrAfter(now, _startSteps, graceMs) ?? bar
      }
      _startSteps = 0
      const t = bar != null ? externalGrid.timeOf(bar) : null
      if (t != null) { startMs = t; bpm = externalGrid.bpm || bpm; _sysStartSixteenth = bar }
    } else {
      // INT: on the bar grid of the sequences already playing (int-grid.ts) — Start@bar: their next bar
      // line; else in phase with the bar playing. Alone: now, or the Tone.js transport's next bar line
      // when it runs (synced to it, or Start@bar).
      const sync = _startSteps >= 16
      if (transportManager.isRunning.value && (syncStore.syncDrumMachineToTransport.value || sync)) {
        startMs = audioTimeToPerfMs(getTransport().nextSubdivision('1m'))
      }
      startMs = intGrid.join('drum', now, bpm, sync, startMs)
    }
    _startSteps = 0
    _sysSched = new StepScheduler((_step, t, late) => {
      _silentStep = late
      try { _scheduleCallback(perfMsToAudioTime(t)) } finally { _silentStep = false }
    }, { name: 'DRUM', startToleranceMs: 150 })
    _sysSched.start(startMs, bpm)
    _offExtGrid = externalGrid.on(e => {
      if (e.type === 'beat' && _sysSched) _sysSched.anchorTo(e.sixteenth - _sysStartSixteenth, e.t, e.bpm)
    })
    _stopTicker = createWorkerTicker(() => _sysSched?.tick(performance.now()))
    _sysSched.tick(performance.now())
  }

  function _stopSystemClock() {
    intGrid.leave('drum')
    _stopTicker?.(); _stopTicker = null
    _offExtGrid?.(); _offExtGrid = null
    _sysSched?.stop(); _sysSched = null
  }

  function _scheduleCallback(time) {
    let state = playStateRef.current
    if (!state) return

    // Global 16-step position drives the bar boundary and UI highlight.
    // Each track uses its own length for wrapping (per-track polymetry).
    const globalStep = stepCounter % 16

    // ── Rig pad (Trigger sync): stop / switch on the song grid's sync point ──
    const songStep = _sysStartSixteenth + stepCounter
    if (_rigStopSteps && songStep % _rigStopSteps === 0) {
      _rigStopSteps = 0
      _pendingStop = false
      drawAt(() => { drumStore.isPlaying = false; pendingStop.value = false }, time)
      return
    }
    if (_rigSeqSteps && _pendingSequence !== null && !chainEnabled.value && songStep % _rigSeqSteps === 0) {
      _rigSeqSteps = 0
      drumStore.swapSequence(_pendingSequence)
      _pendingSequence = null
      playStateRef.current = buildPlayState()
      state = playStateRef.current
      drawAt(() => { pendingSequence.value = null }, time)
    }
    // ── Rig: a part (drums / bassline) on, off or switched, on its sync point ──
    if (_partPending.length) {
      const due = _partPending.filter(p => songStep % p.steps === 0)
      if (due.length) {
        _partPending = _partPending.filter(p => !due.includes(p))
        for (const p of due) _applyPart(p)
        drawAt(_reportParts, time)
        if (!_drumsOn && !_bassOn) {
          drawAt(() => { drumStore.isPlaying = false }, time)
          return
        }
        playStateRef.current = buildPlayState()
        state = playStateRef.current
      }
    }

    // ── Bar boundary (step 0): pending sequence swap + fill auto-stop ──
    if (globalStep === 0) {
      // Stop@end: on this bar line — or, ending with a fill on the next bar (+Fill, Fill: Bar), the one after.
      if (_pendingStop && --_stopBarsLeft <= 0) {
        _pendingStop = false
        drawAt(() => { drumStore.isPlaying = false; pendingStop.value = false }, time)
        return
      }
      if (chainEnabled.value) {
        _chainSlotIdx = (_chainSlotIdx + 1) % chainLength.value
        let seq = chain.value[_chainSlotIdx]
        if (!seq) {
          for (let j = _chainSlotIdx - 1; j >= 0; j--) {
            if (chain.value[j]) { seq = chain.value[j]; break }
          }
        }
        if (seq) {
          drumStore.swapSequence(seq)
          _pendingSequence = null
          playStateRef.current = buildPlayState()
          state = playStateRef.current
          drawAt(() => { pendingSequence.value = null; chainSlotRef.value = _chainSlotIdx }, time)
        }
      } else if (_pendingSequence !== null && !_rigSeqSteps) {
        drumStore.swapSequence(_pendingSequence)
        _pendingSequence = null
        playStateRef.current = buildPlayState()
        state = playStateRef.current
        drawAt(() => { pendingSequence.value = null }, time)
      }
      _measureCount++
      if (autofillEnabled.value && _measureCount % autofillEvery.value === 0) {
        drawAt(() => { generateFill(); triggerFill('now') }, time)
      }
      if (_fillAutoStop) {
        _fillAutoStop = false
        playStateRef.current = { ...state, fillActive: false }
        state = playStateRef.current
        drawAt(() => { fillActive.value = false }, time)
      }
      // A Fill armed for this bar: from its first step to its end.
      if (_fillArmed) {
        _fillArmed = false
        _fillAutoStop = true
        playStateRef.current = { ...state, fillActive: true }
        state = playStateRef.current
        drawAt(() => { fillArmed.value = false; fillActive.value = true }, time)
      }
      // REC SYNC: stop first (completed 16 steps), then start if newly armed.
      // Both events are deferred via getDraw so they fire at actual playback
      // time, not at Tone.js lookahead schedule time.
      if (_recSyncRecording) {
        _recSyncBarsRemaining--
        if (_recSyncBarsRemaining <= 0) {
          _recSyncRecording = false
          drawAt(() => {
            window.dispatchEvent(new CustomEvent('capture-stop-rec'))
            recSyncActive.value = false
          }, time)
        }
      }
      if (_recSyncArmed) {
        _recSyncArmed = false
        _recSyncRecording = true
        _recSyncBarsRemaining = recSyncMultiplier.value
        // Fire capture-start-rec via setTimeout so the MediaRecorder codec has
        // time to initialise before the beat hits. Pre-roll = 200ms; clamped to
        // however long is left until the bar boundary.
        const PRE_ROLL = 0.2
        const timeUntilBeat = time - toneNow()
        const actualPreRoll = Math.min(PRE_ROLL, Math.max(0, timeUntilBeat))
        const delayMs = Math.max(0, (timeUntilBeat - PRE_ROLL) * 1000)
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('capture-start-rec', {
            detail: { background: true, preRoll: actualPreRoll },
          }))
        }, delayMs)
        drawAt(() => {
          recSyncArmed.value = false
          recSyncActive.value = true
        }, time)
      }
    }

    const stepTimeSec = 60 / (state.bpm * 4)
    const swingOffset = (globalStep % 2 === 1)
      ? stepTimeSec * (state.swing / 200)
      : 0
    const fireTime = time + swingOffset

    const soloActive = state.tracks.some(t => t.solo)

    state.tracks.forEach((track, trackIdx) => {
      if (!_drumsOn) return // Rig: drums off, the bassline may play on
      const audible = soloActive ? track.solo : !track.muted
      if (!audible) return

      // The bassline playing (its part on): its source pads are its voices, not drums. Rig: the
      // drums alone (bass part off) play those pads as drums, like the others.
      if (state.basslineEnabled && _bassOn && state.basslineSourceSlots?.includes(trackIdx)) return

      // Each track wraps at its own length
      const trackStep = stepCounter % (track.length || 16)
      let step = track.steps[trackStep]
      if (state.fillActive && state.fillSteps?.[trackIdx]?.[trackStep]?.active) {
        step = state.fillSteps[trackIdx][trackStep]
      }

      // Tie countdown: if > 0, skip this step and decrement
      if (_tieCountdown[trackIdx] > 0) {
        _tieCountdown[trackIdx]--
        return
      }

      if (!step.active) return
      // Rig Controller Density (LIVE): the weakest steps of the bar on Live's grid go first.
      // With the Drum Machine's own Density (drum-perform.ts) the lower of the two.
      if (!densityKeeps(songStep, !!step.accent, Math.min(densityFor('drum'), drumPerform.density))) return
      // Rig Controller Drum row (LIVE): Mute / Solo and Intensity on the drums only (the bassline has its row).
      if (rigParts.drumMuted) return

      // Gate duration: tie=0 → 1 step, tie=N → N steps
      const stepDur = step.tie > 0 ? step.tie * stepTimeSec : stepTimeSec

      const divisions = state.repeaterActive
        ? state.repeaterDivision
        : step.ratchet

      // Dyn and Humanize (drum-perform.ts): the hit's velocity and a few ms off its time
      const hum = humanizeOffsets(drumPerform.humanize)
      const hitTime = fireTime + hum.time
      const hitVel = (v) => Math.max(1, Math.min(127, applyDynamics(v, drumPerform.dynamics) + hum.velocity))

      if (track.midiOutEnabled || midiOutOnly.value) {
        // MIDI Out (this track, or MIDI OUT ONLY for all): drive an external drum
        // machine/synth's own sound instead of SY.CORE's internal sample.
        const vel = hitVel(step.velocity * rigParts.drumVelocity)
        if (divisions <= 1) {
          _sendMidiNote(track.midiNote, vel, step.accent, hitTime, stepDur)
        } else {
          _sendMidiRatchet(track.midiNote, stepTimeSec, divisions, {
            velocity: vel,
            accent:   step.accent,
            baseTime: hitTime,
            duration: stepDur,
          })
        }
      } else if (!_silentStep) {
        drumEngine.setPadVolume(trackIdx, track.volume * mixer.effectiveDrumsLevel)
        if (divisions <= 1) {
          drumEngine.triggerPad(trackIdx, { velocity: hitVel(step.velocity), accent: step.accent, time: hitTime, duration: stepDur })
        } else {
          drumEngine.triggerRatchet(trackIdx, stepTimeSec, divisions, {
            velocity: hitVel(step.velocity),
            accent:   step.accent,
            baseTime: hitTime,
            duration: stepDur,
          })
        }
      }

      // Set tie countdown for subsequent steps
      if (step.tie > 0) {
        _tieCountdown[trackIdx] = step.tie
      }
    })

    // Not written to drumStore.currentStep: a store mutation per 16th costs (watchers,
    // Pinia devtools) and nothing reads the step any more — see paintPlayhead().
    // MIDI OUT ONLY: the Drum Machine is just a MIDI note source, no transport display.
    if (!midiOutOnly.value) drawAt(() => paintPlayhead(globalStep), time)
    // Toolbar bar.beat badge — once per beat, never per 16th.
    const beatPos = beatPosition(_measureCount, globalStep)
    if (beatPos) drawAt(() => setDrumPosition(beatPos), time)

    // ── Bassline voices (on the same step as the drums) ──
    if (state.basslineEnabled && state.basslineTracks && _bassOn) {
      const bassSoloActive = state.basslineTracks.some(t => t.solo)
      state.basslineTracks.forEach((voice, vi) => {
        if (voice.muted || rigParts.bassMuted) return
        if (bassSoloActive && !voice.solo) return
        const padIdx = state.basslineSourceSlots?.[vi]
        if (padIdx == null || padIdx < 0 || padIdx >= 11) return
        const trackStep = stepCounter % (voice.length || 16)
        const step = voice.steps[trackStep]
        if (!step.active) return
        const bassDur = step.tie > 0 ? step.tie * stepTimeSec : stepTimeSec
        if (midiOutOnly.value) {
          _sendMidiNote(step.note ?? 36, step.velocity * rigParts.bassVelocity, step.accent ?? false, fireTime, bassDur, drumStore.basslineMidiChannel)
          return
        }
        if (_silentStep) return
        drumEngine.setPadVolume(padIdx, (voice.volume ?? 0.85) * mixer.effectiveDrumsLevel)
        drumEngine.setPadPitch(padIdx, voice.pitch ?? 0)
        drumEngine.triggerPadWithNote(padIdx, step.note ?? 36, {
          velocity: step.velocity,
          accent: step.accent ?? false,
          time: fireTime,
          duration: bassDur,
          filterFreq: voice.filterFreq ?? 20000,
        })
      })
    }
    stepCounter++ // no wrap — each track uses its own modulo
  }

  watch(() => drumStore.isPlaying, (playing) => {
    if (!playing) {
      // a Fill armed for the next bar: dropped with the stop
      _fillArmed = false
      fillArmed.value = false
      // Rig parts: both on again for the next start, the bassline back on the drums' sequence.
      _drumsOn = _bassOn = true
      _partPending = []
      drumStore.drumsOn = drumStore.bassOn = true
      drumStore.basslineSequence = null
      rigReports.queued.bass = null
      _startSteps = 0
      _rigStopSteps = 0
      _rigSeqSteps = 0
      _stopSystemClock()
      if (repeatEventIdRef !== null) {
        getTransport().clear(repeatEventIdRef)
        repeatEventIdRef = null
      }
      transportManager.releaseTransport()
      stepCounter = 0
      _tieCountdown = Array(11).fill(0)
      drumStore.currentStep = -1
      paintPlayhead(-1)
      resetDrumPosition()
      chainSlotRef.value = -1
      _pendingStop = false
      _endFillArmed = false
      pendingStop.value = false
      // Cancel any pending or active rec sync
      if (_recSyncRecording) {
        window.dispatchEvent(new CustomEvent('capture-stop-rec'))
      }
      _recSyncArmed         = false
      _recSyncRecording     = false
      _recSyncBarsRemaining = 0
      recSyncArmed.value  = false
      recSyncActive.value = false
      return
    }

    stepCounter = 0
    _tieCountdown = Array(11).fill(0)
    _chainSlotIdx = -1
    _measureCount = 0
    chainSlotRef.value = -1
    resetDrumPosition()

    toneStart().then(() => {
      if (drumStore.systemClock) {
        if (!drumStore.isPlaying) return
        playStateRef.current = buildPlayState()
        _startSystemClock()
        transportManager.acquireTransport()
        return
      }
      getTransport().bpm.value = drumStore.bpm
      playStateRef.current = buildPlayState()

      const atBar = transportManager.isRunning.value && (syncStore.syncDrumMachineToTransport.value || _startSteps >= 16)
      _startSteps = 0
      repeatEventIdRef = getTransport().scheduleRepeat(_scheduleCallback, '16n', atBar ? transportManager.getNextBarPosition() : undefined)
      transportManager.acquireTransport()
    })
  })

  // Keep snapshot live while playing
  watch(
    [
      () => drumStore.currentPattern,
      () => drumStore.bpm,
      () => drumStore.swing,
      () => drumStore.repeaterActive,
      () => drumStore.repeaterDivision,
      fillActive,
      fillPattern,
      // the bassline too: an edit or a new bassline while playing is heard at once
      () => drumStore.basslineSequences[drumStore.basslineSequence ?? drumStore.activeSequence],
      () => drumStore.basslineSequence,
      () => drumStore.basslineEnabled,
      () => drumStore.basslineSourceSlots,
      showBassline,
    ],
    () => {
      if (drumStore.isPlaying) playStateRef.current = buildPlayState()
    },
    { deep: true }
  )

  // ── Sample loading ─────────────────────────────────────────────────────────────
  async function restoreSample(trackIdx, track) {
    // Use this track's own sound, or fall back to the nearest previous sequence's sound
    const resolved = drumStore.resolveTrackSound(trackIdx)
    if (!resolved?.soundId) return
    const url = await resolveUrl(resolved.soundId, '')
    if (!url) return
    // Only write soundUrl back into the track object if it owns the sound
    if (resolved.own) track.soundUrl = url
    await drumEngine.loadSample(trackIdx, url)
  }

  async function loadAllSamples(pattern) {
    for (let i = 0; i < pattern.length; i++) {
      await restoreSample(i, pattern[i])
    }
  }

  // Send MIDI feedback for right-click MIDI-learned mappings (e.g. dm_seq_A).
  // Looks up all entries in mappingStore.midiMappings matching paramNamePrefix
  // and sends value (0 or 127) to the mapped device/output.
  function sendMidiMappingFeedback(paramNamePrefix, isOn) {
    const val = isOn ? 127 : 0
    for (const entry of Object.values(mappingStore.midiMappings)) {
      const m = entry
      if (typeof m !== 'object' || !m.paramName?.startsWith(paramNamePrefix)) continue
      const out = m.device ? midiService.getOutputs().find(o => o.name === m.device) : midiService.getOutputs()[0]
      if (!out) continue
      const ch = (m.channel ?? 0) & 0x0f
      if ('cc' in m) {
        try { out.send([0xB0 | ch, m.cc, val]) } catch {}
      } else if ('note' in m) {
        try { out.send([0x90 | ch, m.note, val]) } catch {}
      }
    }
  }

  watch(() => drumStore.activeSequence, async (newSeq, oldSeq) => {
    await nextTick()
    // MIDI OUT ONLY plays no samples: nothing to load or to push to the audio engine
    if (!midiOutOnly.value) {
      await loadAllSamples(drumStore.currentPattern)
      pushAllFxToEngine(drumStore.currentPattern)
    }
    // Send feedback: on for the active sequence, off for the previous one
    sendMidiMappingFeedback('dm_seq_', false)
    sendMidiMappingFeedback('dm_seq_' + newSeq.toLowerCase(), true)
  })

  // MIDI OUT ONLY: the footer's Vol (master) is CC 7 on the Drum Machine's channel (the notes' channel,
  // routing as them) — sent when it moves and when MIDI OUT ONLY comes on. Track Vols stay sample-only.
  let _lastVolCc = null
  function _sendMasterVolCc(force = false) {
    if (!midiOutOnly.value) return
    const v = Math.max(0, Math.min(127, Math.round(mixer.drumsLevelVol * 127)))
    if (!force && v === _lastVolCc) return
    _lastVolCc = v
    midiStore.sendCC(7, v, null, MidiSource.DRUM_MACHINE)
  }
  watch(() => mixer.drumsLevelVol, () => _sendMasterVolCc())

  watch(midiOutOnly, async (on) => {
    if (on) { paintPlayhead(-1); _sendMasterVolCc(true); return }
    await loadAllSamples(drumStore.currentPattern)
    pushAllFxToEngine(drumStore.currentPattern)
  })

  // ── Master volume (footer) — applied as a multiplier on all track volumes at trigger time ─
  function _setMasterVolume(vol) {
    mixer.setDrumsLevelVol(Math.max(0, Math.min(1, vol)))
  }

  // ── Master volume from AudioMixer — controls the engine's _masterGain node ───
  function _onMasterVolume(e) {
    drumEngine.setMasterVolume(e.detail)
  }

  function _onMidiFill()         { triggerFill() }
  function _onMidiGenerate()     { generatePattern() }
  // Rig Controller Bass GEN: a new bassline in the active sequence, switched on; detail.root (0–11):
  // the Chord Prog's key, else the panel's root note.
  function _onGenerateBass(e) {
    const pc = e.detail?.root
    // into the sequence the bassline plays from (the Rig's Bass row may hold another one than the drums)
    const seq = drumStore.basslineSequence ?? drumStore.activeSequence
    // journaled (lib/session-takes.ts): the bassline it replaces is kept as a session take
    journaled('bass', seq, () => drumStore.generateBassline(Number.isInteger(pc) ? 24 + pc : basslineRootNote.value, seq))
    drumStore.basslineEnabled = true
    showBassline.value = true
  }
  // quantize (Control Map, P3): on the next bar even with Sync Retrig off.
  // detail.sync (Rig pad's Trigger sync, sixteenths): 0 = at once, 4/8/16 = next beat / 2 beats / bar of the song grid.
  function _onMidiSeqSwitch(e) {
    const sync = e.detail?.sync
    if (typeof sync !== 'number') { clickSequenceTab(e.detail?.seq, !!e.detail?.quantize); return }
    const seq = e.detail?.seq
    _rigSeqSteps = 0
    if (!drumStore.isPlaying || sync <= 0 || !externalGrid.active || seq === drumStore.activeSequence) {
      // Stopped, at once, or the one already playing: switch now (and drop a queued switch).
      _pendingSequence = null
      pendingSequence.value = null
      if (seq !== drumStore.activeSequence) drumStore.swapSequence(seq)
      return
    }
    _rigSeqSteps = sync
    _pendingSequence = seq
    pendingSequence.value = seq
  }

  // ── REC SYNC ───────────────────────────────────────────────────────────────────
  function toggleRecSync() {
    if (recSyncActive.value) {
      // Stop recording immediately
      _recSyncRecording = false
      window.dispatchEvent(new CustomEvent('capture-stop-rec'))
      recSyncActive.value = false
    } else if (recSyncArmed.value) {
      // Cancel the arm
      _recSyncArmed = false
      recSyncArmed.value = false
    } else {
      // Arm: will trigger at next bar start (step 0)
      _recSyncArmed = true
      recSyncArmed.value = true
      // Pre-warm AudioCapture monitor so it's ready the moment recording starts
      window.dispatchEvent(new CustomEvent('capture-monitor-pre-arm'))
    }
  }

  function pushAllFxToEngine(pattern) {
    pattern.forEach((track, i) => {
      drumEngine.setPadPan(i, track.pan ?? 0)
      drumEngine.setPadPitch(i, track.pitch ?? 0)
      drumEngine.setPadFilter(i, track.filterFreq ?? 20000)
      drumEngine.setPadFilterType(i, track.filterType ?? 'lowpass')
      drumEngine.setPadFilterResonance(i, track.filterResonance ?? 0)
      drumEngine.setPadAttack(i, track.attack ?? 0.005)
      drumEngine.setPadDecay(i, track.decay ?? 0)
      drumEngine.setPadSustain(i, track.sustain ?? 1)
      drumEngine.setPadRelease(i, track.release ?? 0.05)
      drumEngine.setPadReverbSend(i, track.reverbSend ?? 0)
      drumEngine.setPadDelaySend(i, track.delaySend ?? 0)
    })
  }

  async function _tlDmStartHandler(e) {
    const { presetName, seqKey, chainEnabled: ce, bpm } = e.detail ?? {}
    if (presetName) {
      const preset = drumStore.presets.find(p => p.name === presetName)
      if (preset) await handleLoadPreset(preset)
    }
    // Restore timeline BPM — preset load may have overwritten arpStore.arpBpm
    // (drumStore.bpm follows arpStore.arpBpm via its own watcher, see below)
    if (bpm) midiStore.setGlobalBpm(bpm)
    if (seqKey) drumStore.swapSequence(seqKey)
    if (ce != null) chainEnabled.value = ce
    if (!drumStore.isPlaying) drumStore.isPlaying = true
  }
  function _tlDmStopHandler() { drumStore.isPlaying = false }

  // MIDI FLOW device→app input routing: a device wired to Drum Machine in the
  // canvas starts playback on note-on (see docs/plans/modular/MIDI-Flow-Control.md).
  let _unsubMidiNote = null
  function _onMidiNoteIn(type, note, velocity, chan, inputId) {
    if (type !== 'on' || velocity <= 0) return
    const inputDevice = midiService.getInputs().find(i => i.id === inputId)
    const sourceKey = inputDevice?.name
    // Starting playback is a much bigger deal than just sounding a note, so
    // this requires an explicit MIDI Flow cable to this source — unlike most
    // isDeviceRoutedToApp checks elsewhere, an unwired device must NOT
    // auto-start the drum machine just because nothing's been configured yet.
    if (!midiStore.hasExplicitInputRouting(sourceKey)) return
    if (!midiStore.isDeviceRoutedToApp(sourceKey, MidiSource.DRUM_MACHINE, note)) return
    if (!drumStore.isPlaying) drumStore.isPlaying = true
  }

  // MIDI FLOW app-to-app routing (e.g. Chord Sequencer OUT → Drum Machine IN)
  // — a separate pipeline from device input above, since an app's generated
  // notes never pass through a real MIDI input port.
  let _unsubAppNote = null
  function _onAppNoteIn(type, note, velocity, chan, sourceApp) {
    if (type !== 'on' || velocity <= 0) return
    // Same reasoning as _onMidiNoteIn — an unwired app source (e.g. Chord
    // Sequencer playing) must not auto-start the drum machine by default.
    if (!midiStore.hasExplicitInputRouting(sourceApp)) return
    if (!midiStore.isDeviceRoutedToApp(sourceApp, MidiSource.DRUM_MACHINE, note)) return
    if (!drumStore.isPlaying) drumStore.isPlaying = true
  }

  // ── Timeline DM Rec Sync ─────────────────────────────────────────────────────
  function _tlDmRecSyncHandler(e) {
    const measures = e.detail?.measures ?? 4
    recSyncMultiplier.value = measures
    // Ensure drum machine is playing — the scheduler must run for rec sync
    // to trigger at the next bar boundary (step 0)
    if (!drumStore.isPlaying) {
      drumStore.isPlaying = true
      // Call arm on next tick so the watch handler has time to start transport
      setTimeout(() => toggleRecSync(), 0)
    } else {
      toggleRecSync()
    }
  }

  function _onPadTrigger(e) {
    const { trackIdx, velocity } = e.detail ?? {}
    if (typeof trackIdx === 'number' && trackIdx >= 0 && trackIdx < drumStore.TRACK_LABELS.length) {
      _hitPad(trackIdx, velocity ?? 100)
    }
  }

  const _onBassMidiNote = (e) => {
    if (basslineMidiCapture.value < 0) return
    const note = e.detail?.note
    if (typeof note !== 'number') return
    const voiceIdx = Math.floor(basslineMidiCapture.value / 16)
    const stepIdx = basslineMidiCapture.value % 16
    drumStore.setBasslineNote(voiceIdx, stepIdx, note, basslineCaptureSeq.value)
    // Preview the note
    const padIdx = drumStore.basslineSourceSlots[voiceIdx] ?? 8
    drumEngine.triggerPadWithNote(padIdx, note, { velocity: 100, time: 0 })
    basslineMidiCapture.value = -1
  }

  // Switching the clock while playing: restart on the other one.
  watch(() => drumStore.systemClock, () => {
    if (!drumStore.isPlaying) return
    drumStore.isPlaying = false
    nextTick(() => { drumStore.isPlaying = true })
  })

  function _chainExtra() {
    return {
      chain:            [...chain.value],
      chainLength:      chainLength.value,
      autofillEnabled:  autofillEnabled.value,
      autofillEvery:    autofillEvery.value,
      generatedStyle:   selectedStyle.value,
      bpm:              drumStore.bpm,
      basslineEnabled:  drumStore.basslineEnabled,
      basslineSourceSlots: [...drumStore.basslineSourceSlots],
      basslineSequences: drumStore.basslineSequences,
    }
  }

  async function handleLoadPreset(preset) {
    drumStore.loadPreset(preset)
    currentPresetId.value = preset.id
    const clen = preset.chainLength ?? 16
    chainLength.value  = Math.max(2, Math.min(16, clen))
    chain.value        = preset.chain?.length >= 2 ? (preset.chain.slice(0, chainLength.value).map(s => s ?? null)) : Array(chainLength.value).fill(null)
    autofillEnabled.value = preset.autofillEnabled ?? false
    autofillEvery.value   = preset.autofillEvery   ?? 4
    if (preset.generatedStyle) selectedStyle.value = drumStyleOf(preset.generatedStyle) // an old 'Jungle/DnB': Drum&Bass
    if (preset.bpm)           midiStore.setGlobalBpm(preset.bpm)
    await nextTick()
    await loadAllSamples(drumStore.currentPattern)
  }

  // ── Default Kit — global, admin-published sound assignment ─────────────────
  const DEFAULT_KIT_SEEDED_KEY = 'SYCORE_DM_DEFAULT_KIT_SEEDED'

  async function loadDefaultKit() {
    const slots = configStore.defaultDrumKit?.slots ?? []
    if (!slots.length) return
    loadingDefaultKit.value = true
    try {
      for (const slot of slots) {
        const assetUrl = resolveDefaultKitAssetUrl(slot.fileName)
        if (!assetUrl) continue
        const soundId = `default_kit_${slot.trackIndex}`
        // Reuse the local cache if this user already loaded the Default Kit
        // before — same fetch-once-then-cache pattern as Freesound downloads.
        let url = await resolveUrl(soundId, null)
        if (!url) {
          const res = await fetch(assetUrl)
          const blob = await res.blob()
          url = await cacheFileBlob(soundId, slot.soundLabel, blob)
        }
        drumStore.setTrackSound(slot.trackIndex, { soundId, soundLabel: slot.soundLabel, soundUrl: url })
        await drumEngine.loadSample(slot.trackIndex, url)
      }
    } catch (e) {
      console.error('[DrumMachine] loadDefaultKit failed', e)
    } finally {
      loadingDefaultKit.value = false
    }
  }

  // ── Quantized sequence switching ───────────────────────────────────────────────
  // Sync Retrig: TRUE = switch pattern on next first beat (quantized), FALSE = switch immediately on click
  const syncRetrig = ref(true)

  function clickSequenceTab(seq, quantize = false) {
    if ((syncRetrig.value || quantize) && drumStore.isPlaying && seq !== drumStore.activeSequence) {
      _pendingSequence = seq
      pendingSequence.value = seq
    } else {
      _pendingSequence = null
      pendingSequence.value = null
      drumStore.swapSequence(seq)
    }
  }

  // ── Fill ───────────────────────────────────────────────────────────────────────
  function triggerFill(when = drumStore.fillWhen) {
    // Next bar, playing: armed (pressed again: disarmed); the bar line starts it for the whole bar.
    if (when === 'bar' && drumStore.isPlaying && !fillActive.value) {
      _fillArmed = !_fillArmed
      fillArmed.value = _fillArmed
      if (_fillArmed && (newFillEachTime.value || !fillHasHits(fillPattern.value))) generateFill()
      return
    }
    // Fill always plays something: with no fill yet (never generated, nor loaded) one is made; then
    // the same fill plays on each Fill until it is generated anew — or, with New, a new one each time.
    if (newFillEachTime.value || !fillHasHits(fillPattern.value)) generateFill()
    fillActive.value = true
    _fillAutoStop = true
    if (drumStore.isPlaying) playStateRef.current = buildPlayState()
  }

  function saveFillToPattern() {
    const from = Math.max(1, Math.min(16, fillSaveFrom.value)) - 1
    const to   = Math.max(from, Math.min(15, fillSaveTo.value - 1))
    fillPattern.value.forEach((trackSteps, trackIdx) => {
      const track = drumStore.currentPattern[trackIdx]
      if (!track) return
      for (let s = from; s <= to; s++) {
        if (trackSteps[s]) track.steps[s] = { ...trackSteps[s] }
      }
    })
    if (drumStore.isPlaying) playStateRef.current = buildPlayState()
  }

  function generateFill() {
    const r    = Math.random
    const rnd  = (lo, hi) => Math.floor(r() * (hi - lo + 1)) + lo
    const pick = (...args) => args[Math.floor(r() * args.length)]
    const hit  = (vel) => ({ active: true, velocity: vel, accent: false, ratchet: 1, tie: 0 })
    const hitA = (vel) => ({ active: true, velocity: vel, accent: true,  ratchet: 1, tie: 0 })
    const off  = ()    => ({ active: false, velocity: 100, accent: false, ratchet: 1, tie: 0 })
    const fp   = Array(drumStore.TRACK_LABELS.length).fill(null).map(() => Array(16).fill(null).map(off))

    const archetype = rnd(0, 5)

    if (archetype === 0) {
      // Snare roll — density builds toward end, crash on 16
      const density = pick(4, 6, 8) // how many snare hits
      const pool = [8,9,10,11,12,13,14,15]
      pool.sort(() => r() - 0.5)
      pool.slice(0, density).sort((a,b)=>a-b).forEach((s, i) =>
        fp[1][s] = i === density - 1 ? hitA(127) : hit(rnd(70 + i * 7, 100 + i * 4))
      )
      fp[0][0] = hitA(rnd(100, 120))
      if (r() > 0.4) fp[0][pick(2,4)] = hit(rnd(80, 100))
      fp[7][15] = hitA(rnd(105, 127))

    } else if (archetype === 1) {
      // Tom cascade — toms roll across the bar
      const pairs = pick(
        [[5,4],[5,6],[5,8],[6,9],[6,11],[7,14]],
        [[5,2],[5,5],[6,8],[6,10],[6,12],[7,15]],
        [[5,0],[5,3],[6,6],[6,9],[5,11],[6,13],[7,15]]
      )
      pairs.forEach(([t, s]) => fp[t][s] = hit(rnd(85, 115)))
      fp[7][15] = hitA(rnd(100, 127))
      fp[0][0]  = hit(rnd(90, 110))
      if (r() > 0.5) fp[1][pick(4,8,12)] = hit(rnd(80, 105))

    } else if (archetype === 2) {
      // Kick frenzy — busy syncopated kick + accent snare on 4
      const kicks = pick([0,3,5,7,9,12],[0,2,6,9,11,14],[0,4,6,8,10,13,15])
      kicks.forEach(s => fp[0][s] = s === 0 ? hitA(rnd(105,127)) : hit(rnd(75,105)))
      fp[1][12] = hitA(rnd(100, 120))
      fp[1][15] = hit(rnd(90, 115))
      for (let s = 0; s < 16; s += 2) if (r() > 0.4) fp[2][s] = hit(rnd(45, 70))
      fp[7][15] = hitA(rnd(100, 127))

    } else if (archetype === 3) {
      // HH frenzy — 16th hats driving, open hat stabs
      for (let s = 0; s < 16; s++) fp[2][s] = hit(rnd(55 + (s > 7 ? 15 : 0), 90 + (s > 11 ? 20 : 0)))
      const opens = pick([3,7,15],[7,11,15],[5,10,15],[7,15])
      opens.forEach(s => { fp[2][s] = off(); fp[3][s] = hitA(rnd(90, 120)) })
      fp[0][0] = hitA(rnd(100, 120))
      if (r() > 0.5) fp[0][pick(8,9,10)] = hit(rnd(75, 100))
      fp[1][pick(12,13,14)] = hitA(rnd(95, 120))
      fp[7][15] = hitA(rnd(105, 127))

    } else if (archetype === 4) {
      // Broken/syncopated — ghost snares + clap + scattered kick
      const ghosts = pick([1,3,5,9,11,13],[2,5,7,10,13],[1,4,7,9,12,14])
      ghosts.forEach(s => fp[1][s] = hit(rnd(35, 58)))
      fp[1][pick(12,13,14)] = hitA(rnd(100, 120))
      fp[1][15] = hitA(127)
      fp[0][0]  = hitA(rnd(100, 120))
      if (r() > 0.4) fp[0][pick(6,7,9,10)] = hit(rnd(70, 95))
      fp[4][pick(4,8)] = hit(rnd(85, 110))
      fp[3][pick(7,11,15)] = hit(rnd(80, 105))
      fp[7][15] = hitA(rnd(100, 127))

    } else {
      // Crash & build — sparse start, dense finish, big crash
      const snStart = pick(8, 9, 10)
      for (let s = snStart; s < 16; s++) fp[1][s] = s < 15 ? hit(rnd(60 + (s-snStart)*8, 95 + (s-snStart)*3)) : hitA(127)
      fp[0][0]  = hitA(rnd(100, 120))
      fp[0][8]  = hit(rnd(85, 110))
      fp[5][pick(10,11,12)] = hit(rnd(85, 110))
      fp[6][pick(12,13,14)] = hit(rnd(90, 115))
      fp[7][0]  = hit(rnd(70, 90))
      fp[7][15] = hitA(127)
      for (let s = 2; s < snStart; s += 2) if (r() > 0.5) fp[2][s] = hit(rnd(45, 68))
    }

    fillPattern.value = fp
  }

  // ── Style generation ───────────────────────────────────────────────────────────
  function generatePattern() {
    // journaled (lib/session-takes.ts): the pattern it replaces is kept as a session take
    journaled('drum', drumStore.activeSequence, () => drumStore.generateDrumPattern(selectedStyle.value), { note: selectedStyle.value })
    if (generateAsFill.value) {
      const raw = drumStore.generateDrumPatternRaw(selectedStyle.value)
      if (raw) {
        fillPattern.value = raw.map(track => track.map(s => ({ ...s })))
        if (drumStore.isPlaying) playStateRef.current = buildPlayState()
      }
    }
  }

  // ── Pattern chain ───────────────────────────────────────────────────────────────
  const showChain      = ref(false)
  const chainLength    = ref(16)
  const chain          = ref(Array(16).fill(null))
  const chainSlotRef   = ref(-1)
  let _chainSlotIdx    = -1
  // Chain switched on while playing (the Rig's Drum Chain, the panel): from its first slot on the next bar.
  watch(chainEnabled, on => { if (on) { _chainSlotIdx = -1; chainSlotRef.value = -1 } })

  function resizeChain(len) {
    const clamped = Math.max(2, Math.min(16, len))
    const prev = chain.value
    if (clamped === prev.length) return
    chainLength.value = clamped
    chain.value = Array.from({ length: clamped }, (_, i) => prev[i] ?? null)
    if (_chainSlotIdx >= clamped) _chainSlotIdx = 0
  }

  // Autofill every N bars (the Rig's 4 / 8 / 12 / 16, the panel's field): kept across reloads
  const LS_AUTOFILL_EVERY = 'dm_autofill_every'
  const autofillEvery   = ref((() => { try { const n = Number(localStorage.getItem(userKey(LS_AUTOFILL_EVERY))); return n >= 1 && n <= 128 ? Math.round(n) : 4 } catch { return 4 } })())
  watch(autofillEvery, v => { try { localStorage.setItem(userKey(LS_AUTOFILL_EVERY), String(v)) } catch {} })
  let _measureCount     = 0

  // Start@bar / Stop@end: for a press of PLAY/STOP (panel, DECK card, MIDI Learn dm_play_stop).
  // With Live playing (CLK SYS) the start waits for the next bar line; the stop lets the bar end.
  // Starts from Live's own Start, the Timeline or the Control Map are not affected. Remembered.
  function _loadFlag(key, def) {
    try { const v = localStorage.getItem(key); return v == null ? def : v === '1' } catch { return def }
  }
  const startAtBar   = ref(_loadFlag('S1_DM_START_AT_BAR', false))
  const stopAtEnd    = ref(_loadFlag('S1_DM_STOP_AT_END', false))
  watch(startAtBar, v => { try { localStorage.setItem('S1_DM_START_AT_BAR', v ? '1' : '0') } catch {} })
  watch(stopAtEnd,  v => { try { localStorage.setItem('S1_DM_STOP_AT_END',  v ? '1' : '0') } catch {} })
  const endWithFill  = ref(false)
  // Fill › New: each Fill generates a new fill (off: the same one until Gen). Remembered.
  const newFillEachTime = ref(_loadFlag('S1_DM_NEW_FILL', false))
  watch(newFillEachTime, v => { try { localStorage.setItem('S1_DM_NEW_FILL', v ? '1' : '0') } catch {} })
  const pendingStop  = ref(false)
  let   _pendingStop = false
  let   _stopBarsLeft = 0     // bar lines until the Stop@end stop (2: a +Fill armed for the next bar)
  let   _endFillArmed = false // that fill was armed by the stop (dropped if the stop is called off)
  watch(pendingStop, v => { rigReports.drumStopPending = v }, { flush: 'sync' })

  /** A press asking to play (true) or stop (false), with Start@bar / Stop@end — or, from a Rig pad,
   *  on its Trigger sync (`sync`, sixteenths: 0 = at once, 4/8/16 = next beat / 2 beats / bar). */
  function requestPlay(play, sync) {
    const rig = typeof sync === 'number'
    if (play) {
      if (_pendingStop || _rigStopSteps) { // un-queue the stop
        if (_endFillArmed && _fillArmed) { _fillArmed = false; fillArmed.value = false }
        _pendingStop = false; _endFillArmed = false; _rigStopSteps = 0; pendingStop.value = false; return
      }
      if (drumStore.isPlaying) return
      _startSteps = rig ? Math.max(0, sync) : (startAtBar.value ? 16 : 0)
      drumStore.isPlaying = true
      return
    }
    if (!drumStore.isPlaying) return
    if (!rig) { handlePlayStop(); return }
    if (sync > 0 && externalGrid.active) { _rigStopSteps = sync; pendingStop.value = true } else drumStore.isPlaying = false
  }
  // 'dm-play-stop' (MIDI Learn, DECK card): { play: true/false }, or a toggle like the PLAY button;
  // a Rig pad adds { sync } (its Trigger sync).
  // { play: false, end: true } (Rig Controls' Stop): a stop with Stop@end / +Fill as the panel's STOP;
  // `detail.deferred` says back whether it waits for the bar's end (pressed again while waiting: now).
  function _onPlayStopRequest(e) {
    if (e.detail?.end) {
      if (drumStore.isPlaying) handlePlayStop()
      e.detail.deferred = _pendingStop
      return
    }
    const play = e.detail?.play
    if (typeof play === 'boolean') requestPlay(play, e.detail?.sync); else handlePlayStop()
  }

  function handlePlayStop() {
    if (!drumStore.isPlaying) { requestPlay(true); return }
    if (_pendingStop) { _pendingStop = false; pendingStop.value = false; drumStore.isPlaying = false; return }
    if (stopAtEnd.value) {
      _pendingStop = true
      pendingStop.value = true
      _stopBarsLeft = 1
      _endFillArmed = false
      // +Fill: the ending is a fill — Fill: Now, the rest of this bar; Fill: Bar, the whole next bar
      // (armed: the stop comes at the end of it). A fill already playing is the ending.
      if (endWithFill.value && !fillActive.value) {
        if (drumStore.fillWhen === 'bar') {
          if (!_fillArmed) { _fillArmed = true; fillArmed.value = true; _endFillArmed = true }
          generateFill()
          _stopBarsLeft = 2
        } else { generateFill(); triggerFill('now') }
      }
    } else {
      drumStore.isPlaying = false
    }
  }

  function cycleChainSlot(i) {
    const order = [null, 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    chain.value[i] = order[(order.indexOf(chain.value[i]) + 1) % order.length]
  }

  // ── Init (was the panel's onMounted): audio engine, last preset / samples, Default Kit, listeners ──
  const ready = (async () => {
    drumEngine.initDrumEngine()
    drumEngine.setDelayTime(drumStore.bpm)
    if (drumStore.presets.length) {
      const last = drumStore.presets[drumStore.presets.length - 1]
      await handleLoadPreset(last)
    } else {
      await loadAllSamples(drumStore.currentPattern)
      pushAllFxToEngine(drumStore.currentPattern)
    }

    // Default Kit: seed a genuinely first-time-empty active sequence once, if
    // an admin has published one. The seeded flag is only set once we've
    // actually loaded a kit, so it keeps retrying on later visits until a
    // Default Kit exists — but never re-applies after the user's own sounds
    // (or an intentional clear) touch the sequence.
    if (
      !localStorage.getItem(userKey(DEFAULT_KIT_SEEDED_KEY)) &&
      !drumStore.currentPattern.some(t => t.soundId) &&
      configStore.defaultDrumKit?.slots?.length
    ) {
      await loadDefaultKit()
      localStorage.setItem(userKey(DEFAULT_KIT_SEEDED_KEY), '1')
    }

    window.addEventListener('dm-master-volume',  _onMasterVolume)
    window.addEventListener('dm-trigger-fill',   _onMidiFill)
    window.addEventListener('dm-generate',       _onMidiGenerate)
    window.addEventListener('dm-generate-bass',  _onGenerateBass)
    window.addEventListener('dm-part',           _onPart)
    window.addEventListener('dm-seq-switch',     _onMidiSeqSwitch)
    window.addEventListener('dm-play-stop',      _onPlayStopRequest)
    window.addEventListener('timeline-dm-start', _tlDmStartHandler)
    window.addEventListener('timeline-dm-stop',  _tlDmStopHandler)
    window.addEventListener('timeline-dm-rec-sync', _tlDmRecSyncHandler)
    window.addEventListener('dm-pad-trigger',    _onPadTrigger)

    window.addEventListener('dm-bass-midi-note', _onBassMidiNote)
    _unsubMidiNote = midiService.addNoteListener(_onMidiNoteIn)
    _unsubAppNote  = midiStore.addAppNoteListener(_onAppNoteIn)
  })()

  onScopeDispose(() => {
  rigReports.queued.drum = null
  rigReports.fill = false
  rigReports.fillArmed = false
  _stopSystemClock()
  if (repeatEventIdRef !== null) {
    getTransport().clear(repeatEventIdRef)
    repeatEventIdRef = null
  }
  drumEngine.stopAll()
  if (_recSyncRecording) window.dispatchEvent(new CustomEvent('capture-stop-rec'))
  window.removeEventListener('dm-master-volume',  _onMasterVolume)
  window.removeEventListener('dm-trigger-fill',   _onMidiFill)
  window.removeEventListener('dm-generate',       _onMidiGenerate)
  window.removeEventListener('dm-generate-bass',  _onGenerateBass)
  window.removeEventListener('dm-part',           _onPart)
  window.removeEventListener('dm-seq-switch',     _onMidiSeqSwitch)
  window.removeEventListener('dm-play-stop',      _onPlayStopRequest)
  window.removeEventListener('timeline-dm-start', _tlDmStartHandler)
  window.removeEventListener('timeline-dm-stop',  _tlDmStopHandler)
  window.removeEventListener('timeline-dm-rec-sync', _tlDmRecSyncHandler)
  window.removeEventListener('dm-pad-trigger',    _onPadTrigger)
  window.removeEventListener('dm-bass-midi-note', _onBassMidiNote)
  _unsubMidiNote?.()
  _unsubAppNote?.()
  })

  return {
    ready, setPlayheadPainter,
    // state the panel shows / edits
    selectedStyle, generateAsFill, currentPresetId, loadingDefaultKit, showBassline, basslineMidiCapture, basslineCaptureSeq,
    basslineRootNote, pendingSequence, fillActive, fillSaveFrom, fillSaveTo, fillPattern,
    recSyncArmed, recSyncActive, recSyncMultiplier, hasSolo, midiOutTargets, midiOutOnly, syncRetrig,
    chainLength, chain, chainSlotRef, autofillEvery, startAtBar, stopAtEnd, endWithFill,
    fillArmed,
    newFillEachTime, pendingStop,
    // actions
    buildPlayState, hitPad: _hitPad, setMasterVolume: _setMasterVolume, loadAllSamples, pushAllFxToEngine, sendMidiMappingFeedback,
    toggleRecSync, chainExtra: _chainExtra, handleLoadPreset, loadDefaultKit, clickSequenceTab,
    triggerFill, saveFillToPattern, generateFill, generatePattern, resizeChain, requestPlay,
    handlePlayStop, cycleChainSlot, restartPlayState: () => { if (drumStore.isPlaying) playStateRef.current = buildPlayState() },
  }
}
