import { getContext, Gain, Filter, Panner, AmplitudeEnvelope } from 'tone'
import { EffectChain, blankFxChain } from '../core/audio/effects'
import { resonanceToQ, resonanceToGainDb, safeCutoffHz } from '../core/audio/filterMath'
import { DEFAULT_ADSR, safeAdsr } from '../core/audio/envelope'
import { applyModMatrix, applyVelocityModulation } from '../core/audio/modMatrix'
import { useLfoStore } from '@/stores/useLfoStore'

const ACCENT_BOOST = 1.35
const NUM_PADS = 11

let _masterGain         = null
let _compressor         = null
let _captureDestination = null
let _reverb             = null
let _reverbReturn       = null
let _delay              = null
let _delayFeedback      = null
let _delayReturn        = null

const _buffers      = Array(NUM_PADS).fill(null)
const _padGains     = Array(NUM_PADS).fill(null)
const _filters      = Array(NUM_PADS).fill(null)
const _filterTypes  = Array(NUM_PADS).fill('lowpass')
const _filterResonances = Array(NUM_PADS).fill(0)  // 0-127 byte
const _adsr         = Array(NUM_PADS).fill(null)   // { attack, decay, sustain, release }, plain seconds/0-1
const _fxChains     = Array(NUM_PADS).fill(null)
const _panners      = Array(NUM_PADS).fill(null)
const _reverbSends  = Array(NUM_PADS).fill(null)
const _delaySends   = Array(NUM_PADS).fill(null)
const _faderLevels  = Array(NUM_PADS).fill(1.0)
const _pitchOffsets = Array(NUM_PADS).fill(0)    // semitones
let _activeSources  = []

// Modulation Matrix (Phase 5): each pad's true dialed-in baseline for every
// modulatable destination (see core/audio/modMatrix.ts's ModMatrixTargets
// doc comment for why these can't just be read back off the nodes),
// current slot list, and the live-cable Tone.Scale nodes applyModMatrix()
// last built (disposed before every rebuild).
const _filterFreqs        = Array(NUM_PADS).fill(20000)
const _panValues          = Array(NUM_PADS).fill(0)
const _fxWetDryValues     = Array(NUM_PADS).fill(100) // 0-100, FxChain.wetDry scale
const _modMatrixSlots     = Array(NUM_PADS).fill(null)
const _modMatrixCables    = Array(NUM_PADS).fill(null)
let _lfo1Signal = null
let _lfo2Signal = null

function _getCtx() {
  return getContext().rawContext
}

function _makeReverbIR(ctx, duration = 1.5) {
  const sampleRate = ctx.sampleRate
  const length = Math.floor(sampleRate * duration)
  const ir = ctx.createBuffer(2, length, sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5)
    }
  }
  return ir
}

function _ensureGraph() {
  if (_masterGain) return
  const ctx = _getCtx()

  // Shared, app-wide LFO signals (useLfoStore.ts) -- the Modulation
  // Matrix's lfo1/lfo2 sources. Grabbed once here (called lazily, well
  // after the Vue app/Pinia has mounted) rather than at module import time.
  const lfoStore = useLfoStore()
  _lfo1Signal = lfoStore.lfo1Signal
  _lfo2Signal = lfoStore.lfo2Signal

  // Master → compressor → destination
  _compressor = ctx.createDynamicsCompressor()
  _compressor.threshold.value = -18
  _compressor.knee.value      = 6
  _compressor.ratio.value     = 3
  _compressor.attack.value    = 0.003
  _compressor.release.value   = 0.15
  _compressor.connect(ctx.destination)

  // Capture bus — parallel path that bypasses the compressor so the
  // recording gets the full uncompressed level (compressor has no makeup gain
  // and would cause significant headroom in recordings).
  _captureDestination = ctx.createMediaStreamDestination()
  const _captureBus = ctx.createGain()
  _captureBus.gain.value = 1.0
  _captureBus.connect(_captureDestination)

  _masterGain = ctx.createGain()
  _masterGain.gain.value = 0.85
  _masterGain.connect(_compressor)
  _masterGain.connect(_captureBus)

  // Shared reverb send bus
  _reverb = ctx.createConvolver()
  _reverb.buffer = _makeReverbIR(ctx)
  _reverbReturn = ctx.createGain()
  _reverbReturn.gain.value = 0.85
  _reverb.connect(_reverbReturn)
  _reverbReturn.connect(_compressor)

  // Shared delay send bus (1/8 note at 120 BPM default = 0.25 s)
  _delay = ctx.createDelay(2.0)
  _delay.delayTime.value = 0.25
  _delayFeedback = ctx.createGain()
  _delayFeedback.gain.value = 0.35
  _delayReturn = ctx.createGain()
  _delayReturn.gain.value = 0.75
  _delay.connect(_delayFeedback)
  _delayFeedback.connect(_delay)
  _delay.connect(_delayReturn)
  _delayReturn.connect(_compressor)

  // Per-pad chain: padGain → filter → fxChain → panner → masterGain
  //                                            panner → reverbSend → reverb
  //                                            panner → delaySend  → delay
  // padGain/filter/panner are Tone.js nodes (not raw Web Audio) so the
  // Modulation Matrix (Phase 5) can connect Tone.Signal-based sources onto
  // their frequency/gain/pan params — see
  // docs/plans/Sycore-DSP-Integration-Feasibility.md.
  // fxChain starts fully dry (blankFxChain()) so a pad sounds unchanged
  // until setPadFx() gives it a real chain.
  for (let i = 0; i < NUM_PADS; i++) {
    _adsr[i] = { ...DEFAULT_ADSR }
    _modMatrixSlots[i] = []
    _modMatrixCables[i] = []

    _padGains[i] = new Gain(1.0)

    _filters[i] = new Filter({ frequency: 20000, type: 'lowpass', Q: resonanceToQ(0) })

    _fxChains[i] = new EffectChain()
    _fxChains[i].rebuild(blankFxChain())

    _panners[i] = new Panner(0)

    _reverbSends[i] = ctx.createGain()
    _reverbSends[i].gain.value = 0

    _delaySends[i] = ctx.createGain()
    _delaySends[i].gain.value = 0

    _padGains[i].connect(_filters[i])
    _filters[i].connect(_fxChains[i].input)
    _fxChains[i].output.connect(_panners[i])
    _panners[i].connect(_masterGain)
    _panners[i].connect(_reverbSends[i])
    _panners[i].connect(_delaySends[i])
    _reverbSends[i].connect(_reverb)
    _delaySends[i].connect(_delay)
  }
}

export function initDrumEngine() {
  _ensureGraph()
}

export async function loadSample(padIdx, url) {
  if (padIdx < 0 || padIdx >= NUM_PADS) return
  try {
    _ensureGraph()
    const ctx = _getCtx()
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const arrayBuf = await resp.arrayBuffer()
    _buffers[padIdx] = await ctx.decodeAudioData(arrayBuf)
  } catch (e) {
    console.warn(`[DrumEngine] loadSample pad ${padIdx} failed:`, e)
  }
}

// Per-note transient Tone.AmplitudeEnvelope, shaping the already
// velocity/accent-scaled transient `gain` before it reaches the pad's
// persistent chain -- an ADSR envelope is inherently tied to one note's
// lifecycle (attack at note-on, release at note-off/duration-end), unlike
// the pad-level filter/gain/panner/fxChain from earlier phases, which are
// legitimately shared/persistent across every hit on that pad. Replaces
// the old manual gain-ramp duration gate with real attack/decay/sustain/
// release shaping. Caller disposes the returned envelope once its source
// has finished playing (see each trigger function's `src.onended`).
function _triggerVoiceEnvelope(padIdx, gainNode, fireAt, duration) {
  const env = new AmplitudeEnvelope(safeAdsr(_adsr[padIdx] ?? {}))
  // Unlike Tone.Gain/Tone.Panner (whose `.input` IS the wrapped native
  // node), Tone.AmplitudeEnvelope's `.input` is itself a nested Tone.Gain
  // (`this.input = this._gainNode`, a `new Gain(...)`, not a plain
  // `createGain()` node) — a plain native node's `.connect()` needs
  // `.input.input` to actually reach a native node.
  gainNode.connect(env.input.input)
  env.connect(_padGains[padIdx])
  if (duration > 0) {
    env.triggerAttackRelease(duration, fireAt)
  } else {
    env.triggerAttack(fireAt)
  }
  return env
}

// Velocity is a one-time Modulation Matrix source (core/audio/modMatrix.ts)
// -- resolved fresh at each trigger, nudging this pad's shared filter/
// padGain/panner/fxChain from their cached dial-in baseline. No-op when
// this pad has no velocity-sourced slots.
function _applyVelocityMod(padIdx, velocity, fireAt) {
  const slots = _modMatrixSlots[padIdx]
  if (!slots || !slots.length) return
  applyVelocityModulation(slots, velocity / 127, _makeModMatrixTargets(padIdx), fireAt)
}

export function triggerPad(padIdx, { velocity = 100, accent = false, time = 0, duration = 0 } = {}) {
  const buf = _buffers[padIdx]
  if (!buf) return
  _ensureGraph()
  const ctx = _getCtx()

  const src = ctx.createBufferSource()
  src.buffer = buf
  src.playbackRate.value = 2 ** (_pitchOffsets[padIdx] / 12)

  const gain = ctx.createGain()
  const volScale = (velocity / 127) * _faderLevels[padIdx] * (accent ? ACCENT_BOOST : 1.0)
  gain.gain.value = Math.min(1.5, volScale)

  src.connect(gain)

  const fireAt = Math.max(ctx.currentTime, time)
  _applyVelocityMod(padIdx, velocity, fireAt)
  const env = _triggerVoiceEnvelope(padIdx, gain, fireAt, duration)
  src.start(fireAt)

  _activeSources.push(src)
  src.onended = () => {
    _activeSources = _activeSources.filter(s => s !== src)
    env.dispose()
  }
}

export function triggerPadWithNote(padIdx, midiNote, { velocity = 100, accent = false, time = 0, duration = 0, filterFreq = null } = {}) {
  const buf = _buffers[padIdx]
  if (!buf) return
  _ensureGraph()
  const ctx = _getCtx()
  const semitoneOffset = midiNote - 60 + _pitchOffsets[padIdx]
  const playbackRate = 2 ** (semitoneOffset / 12)

  const src = ctx.createBufferSource()
  src.buffer = buf
  src.playbackRate.value = playbackRate

  const gain = ctx.createGain()
  const volScale = (velocity / 127) * _faderLevels[padIdx] * (accent ? ACCENT_BOOST : 1.0)
  gain.gain.value = Math.min(1.5, volScale)

  // Per-trigger filter override
  if (filterFreq != null && _filters[padIdx]) {
    const cur = _filters[padIdx].frequency.value
    _filters[padIdx].frequency.setValueAtTime(cur, ctx.currentTime)
    _filters[padIdx].frequency.linearRampToValueAtTime(Math.max(20, Math.min(20000, filterFreq)), Math.max(ctx.currentTime, time))
  }

  src.connect(gain)

  const fireAt = Math.max(ctx.currentTime, time)
  _applyVelocityMod(padIdx, velocity, fireAt)
  const env = _triggerVoiceEnvelope(padIdx, gain, fireAt, duration)
  src.start(fireAt)

  _activeSources.push(src)
  src.onended = () => {
    _activeSources = _activeSources.filter(s => s !== src)
    env.dispose()
  }
}

export function triggerRatchet(padIdx, stepTimeSec, divisions, { velocity = 100, accent = false, baseTime = 0, duration = 0 } = {}) {
  const buf = _buffers[padIdx]
  if (!buf || divisions <= 1) {
    triggerPad(padIdx, { velocity, accent, time: baseTime, duration })
    return
  }
  _ensureGraph()
  const ctx = _getCtx()
  const pitch = 2 ** (_pitchOffsets[padIdx] / 12)

  for (let i = 0; i < divisions; i++) {
    const fireTime = baseTime + (i / divisions) * stepTimeSec
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = pitch

    const taper = 1 - i * 0.12
    const volScale = (velocity / 127) * _faderLevels[padIdx] * (accent ? ACCENT_BOOST : 1.0) * taper
    const gain = ctx.createGain()
    gain.gain.value = Math.min(1.5, Math.max(0, volScale))

    src.connect(gain)

    const fireAt = Math.max(ctx.currentTime, fireTime)
    _applyVelocityMod(padIdx, velocity, fireAt)
    const env = _triggerVoiceEnvelope(padIdx, gain, fireAt, duration)
    src.start(fireAt)

    _activeSources.push(src)
    src.onended = () => {
      _activeSources = _activeSources.filter(s => s !== src)
      env.dispose()
    }
  }
}

export function setPadVolume(padIdx, vol) {
  _faderLevels[padIdx] = Math.max(0, Math.min(1, vol))
}

export function setPadPan(padIdx, pan) {
  const v = Math.max(-1, Math.min(1, pan))
  _panValues[padIdx] = v
  if (_panners[padIdx]) _panners[padIdx].pan.value = v
}

export function setPadPitch(padIdx, semitones) {
  _pitchOffsets[padIdx] = Math.max(-24, Math.min(24, semitones))
}

export function setPadFilter(padIdx, freq) {
  const v = safeCutoffHz(freq)
  _filterFreqs[padIdx] = v
  if (_filters[padIdx]) _filters[padIdx].frequency.value = v
}

// Filter type (lowpass/highpass/bandpass/lowshelf/highshelf/notch/allpass/
// peaking) — also recomputes `gain` since only lowshelf/highshelf/peaking
// use it (see filterMath.ts's resonanceToGainDb).
export function setPadFilterType(padIdx, type) {
  const filter = _filters[padIdx]
  if (!filter) return
  _filterTypes[padIdx] = type
  filter.type = type
  filter.gain.value = resonanceToGainDb(type, _filterResonances[padIdx])
}

// Resonance, 0-127 byte (same convention as velocity/rootKey/etc elsewhere
// in sycore) — maps to Q for every filter type, and additionally to `gain`
// for the shelf/peaking types (see filterMath.ts).
export function setPadFilterResonance(padIdx, resonance) {
  const filter = _filters[padIdx]
  if (!filter) return
  _filterResonances[padIdx] = resonance
  filter.Q.value = resonanceToQ(resonance)
  filter.gain.value = resonanceToGainDb(_filterTypes[padIdx], resonance)
}

// Rebuilds a pad's FX chain from an `FxChain` config (see core/audio/types.ts).
// Tears down and reconstructs the algorithm nodes -- an editing-time
// operation (call when the user changes the chain), not something to call
// on every trigger.
export function setPadFx(padIdx, fxChain) {
  _fxWetDryValues[padIdx] = fxChain?.wetDry ?? 100
  _fxChains[padIdx]?.rebuild(fxChain)
}

// Builds this pad's ModMatrixTargets from its current nodes + cached
// dial-in baselines (core/audio/modMatrix.ts).
function _makeModMatrixTargets(padIdx) {
  return {
    filter: _filters[padIdx],
    padGain: _padGains[padIdx],
    panner: _panners[padIdx],
    fxChain: _fxChains[padIdx],
    lfo1Signal: _lfo1Signal ?? undefined,
    lfo2Signal: _lfo2Signal ?? undefined,
    baseValues: {
      filterFreq: _filterFreqs[padIdx],
      filterQ: resonanceToQ(_filterResonances[padIdx]),
      ampVolume: 1.0, // _padGains[padIdx] is a pure pass-through -- no volume knob touches it (see triggerPad's transient gain)
      ampPan: _panValues[padIdx],
      wetDryMix: _fxWetDryValues[padIdx],
    },
  }
}

// Rebuilds a pad's LIVE modulation cables (lfo1/lfo2 sources -- velocity is
// one-time, applied fresh on every trigger instead, see triggerPad/
// triggerPadWithNote/triggerRatchet). Editing-time operation, like
// setPadFx() -- not something to call on every trigger.
export function setPadModMatrix(padIdx, slots) {
  _modMatrixSlots[padIdx] = slots ?? []
  for (const d of _modMatrixCables[padIdx] ?? []) d.dispose()
  _modMatrixCables[padIdx] = applyModMatrix(_modMatrixSlots[padIdx], _makeModMatrixTargets(padIdx))
}

// Amp envelope (attack/decay/release in seconds, sustain normalized 0-1) --
// read by _triggerVoiceEnvelope() to build each note's transient
// Tone.AmplitudeEnvelope. Takes effect on the next trigger, not
// retroactively on any currently-sounding note (same as every other synth's
// ADSR knobs -- there's no well-defined way to reshape a curve already
// mid-flight).
export function setPadAttack(padIdx, attack) {
  if (_adsr[padIdx]) _adsr[padIdx].attack = attack
}
export function setPadDecay(padIdx, decay) {
  if (_adsr[padIdx]) _adsr[padIdx].decay = decay
}
export function setPadSustain(padIdx, sustain) {
  if (_adsr[padIdx]) _adsr[padIdx].sustain = sustain
}
export function setPadRelease(padIdx, release) {
  if (_adsr[padIdx]) _adsr[padIdx].release = release
}

export function setPadReverbSend(padIdx, amt) {
  if (_reverbSends[padIdx]) _reverbSends[padIdx].gain.value = Math.max(0, Math.min(1, amt))
}

export function setPadDelaySend(padIdx, amt) {
  if (_delaySends[padIdx]) _delaySends[padIdx].gain.value = Math.max(0, Math.min(1, amt))
}

export function setDelayTime(bpm) {
  if (_delay) _delay.delayTime.value = (60 / bpm) / 2
}

export function setMasterVolume(vol) {
  if (_masterGain) _masterGain.gain.value = Math.max(0, Math.min(1, vol))
}

export function stopAll() {
  for (const src of _activeSources) {
    try { src.stop() } catch {}
  }
  _activeSources = []
}

export function resumeContext() {}

export function getCaptureStream() {
  _ensureGraph()
  return _captureDestination?.stream ?? null
}
