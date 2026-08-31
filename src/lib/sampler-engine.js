// Web Audio engine for SamplerPanel.
// 8 per-pad chains (6 standard + 2 granular slots) with shared reverb + delay bus.
// Uses Tone.js AudioContext so scheduled times from getTransport() are compatible.
import { getContext, Gain, Filter, Panner, AmplitudeEnvelope } from 'tone'
import { EffectChain, blankFxChain } from '../core/audio/effects'
import { resonanceToQ, resonanceToGainDb } from '../core/audio/filterMath'
import { DEFAULT_ADSR, safeAdsr } from '../core/audio/envelope'
import { applyModMatrix, applyVelocityModulation } from '../core/audio/modMatrix'
import { useLfoStore } from '@/stores/useLfoStore'

const PAD_COUNT = 8

let _ctx           = null
let _masterGain    = null
let _compressor    = null
let _reverb        = null
let _reverbReturn  = null
let _delay         = null
let _delayFeedback = null
let _delayReturn   = null

const _envelopes    = Array(PAD_COUNT).fill(null)   // persistent per-pad Tone.AmplitudeEnvelope
const _padGains      = Array(PAD_COUNT).fill(null)
const _filters       = Array(PAD_COUNT).fill(null)
const _filterTypes   = Array(PAD_COUNT).fill('lowpass')
const _filterResonances = Array(PAD_COUNT).fill(0)  // 0-127 byte
const _fxChains      = Array(PAD_COUNT).fill(null)
const _panners       = Array(PAD_COUNT).fill(null)
const _reverbSends   = Array(PAD_COUNT).fill(null)
const _delaySends    = Array(PAD_COUNT).fill(null)
const _activeSrcs    = Array(PAD_COUNT).fill(null)
const _releaseTimes  = Array(PAD_COUNT).fill(0)     // release seconds per pad

// Modulation Matrix (Phase 5): each pad's true dialed-in baseline for every
// modulatable destination (see core/audio/modMatrix.ts's ModMatrixTargets
// doc comment for why these can't just be read back off the nodes),
// current slot list, and the live-cable Tone.Scale nodes applyModMatrix()
// last built (disposed before every rebuild). Updated in _applyPadParams()
// below, same per-trigger-read pattern as filterType/filterResonance.
const _padGainLevels   = Array(PAD_COUNT).fill(0.85)
const _filterFreqs     = Array(PAD_COUNT).fill(20000)
const _panValues       = Array(PAD_COUNT).fill(0)
const _fxWetDryValues  = Array(PAD_COUNT).fill(100) // 0-100, FxChain.wetDry scale
const _modMatrixSlots  = Array(PAD_COUNT).fill(null)
const _modMatrixCables = Array(PAD_COUNT).fill(null)
let _lfo1Signal = null
let _lfo2Signal = null

// Granular scheduler: padIdx → intervalId
const _granularIntervals = new Map()

// Poly mode: tracks src per "padIdx:note" so Note OFF can target specific voice
const _polyNoteMap = new Map()

// Decoded buffer cache: blobUrl → AudioBuffer
const _bufferCache = new Map()
// Lo-fi downsampled buffer cache: `${blobUrl}:${sampleRate}` → AudioBuffer
const _lofiCache = new Map()

function _makeReverbIR(ctx, duration = 1.5) {
  const len = Math.floor(ctx.sampleRate * duration)
  const ir  = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5)
  }
  return ir
}

function _ensureCtx() {
  if (_ctx) return _ctx

  // Shared, app-wide LFO signals (useLfoStore.ts) -- the Modulation
  // Matrix's lfo1/lfo2 sources. Grabbed once here (called lazily, well
  // after the Vue app/Pinia has mounted) rather than at module import time.
  const lfoStore = useLfoStore()
  _lfo1Signal = lfoStore.lfo1Signal
  _lfo2Signal = lfoStore.lfo2Signal
  _ctx = getContext().rawContext

  _compressor = _ctx.createDynamicsCompressor()
  _compressor.threshold.value = -18
  _compressor.knee.value      = 6
  _compressor.ratio.value     = 3
  _compressor.attack.value    = 0.003
  _compressor.release.value   = 0.15
  _compressor.connect(_ctx.destination)

  _masterGain = _ctx.createGain()
  _masterGain.gain.value = 0.85
  _masterGain.connect(_compressor)

  _reverb = _ctx.createConvolver()
  _reverb.buffer = _makeReverbIR(_ctx)
  _reverbReturn = _ctx.createGain()
  _reverbReturn.gain.value = 0.85
  _reverb.connect(_reverbReturn)
  _reverbReturn.connect(_compressor)

  _delay = _ctx.createDelay(2.0)
  _delay.delayTime.value = 0.25
  _delayFeedback = _ctx.createGain()
  _delayFeedback.gain.value = 0.35
  _delayReturn = _ctx.createGain()
  _delayReturn.gain.value = 0.75
  _delay.connect(_delayFeedback)
  _delayFeedback.connect(_delay)
  _delay.connect(_delayReturn)
  _delayReturn.connect(_compressor)

  // envelopeGain/padGain/filter/panner are Tone.js nodes (not raw Web Audio)
  // so the Modulation Matrix (Phase 5) can connect Tone.Signal-based
  // sources onto their frequency/gain/pan params — see
  // docs/plans/Sycore-DSP-Integration-Feasibility.md.
  // fxChain starts fully dry (blankFxChain()) so a pad sounds unchanged until
  // setPadFx() gives it a real chain.
  for (let i = 0; i < PAD_COUNT; i++) {
    _modMatrixSlots[i] = []
    _modMatrixCables[i] = []

    _envelopes[i] = new AmplitudeEnvelope(DEFAULT_ADSR)

    _padGains[i] = new Gain(1.0)

    _filters[i] = new Filter({ frequency: 20000, type: 'lowpass', Q: resonanceToQ(0) })

    _fxChains[i] = new EffectChain()
    _fxChains[i].rebuild(blankFxChain())

    _panners[i] = new Panner(0)

    _reverbSends[i] = _ctx.createGain()
    _reverbSends[i].gain.value = 0

    _delaySends[i] = _ctx.createGain()
    _delaySends[i].gain.value = 0

    // Chain: src → envelope → padGain → filter → fxChain → panner → masterGain / sends
    _envelopes[i].connect(_padGains[i])
    _padGains[i].connect(_filters[i])
    _filters[i].connect(_fxChains[i].input)
    _fxChains[i].output.connect(_panners[i])
    _panners[i].connect(_masterGain)
    _panners[i].connect(_reverbSends[i])
    _panners[i].connect(_delaySends[i])
    _reverbSends[i].connect(_reverb)
    _delaySends[i].connect(_delay)
  }

  return _ctx
}

// Applies this pad's volume/filter/pan/reverb/delay send from its own data
// -- read fresh on every trigger (sycore's pad chain is persistent/shared,
// not built fresh per-voice like Xynchrony's, so there's no other point to
// apply these). Also caches each destination's true dial-in value for the
// Modulation Matrix's one-time velocity source (core/audio/modMatrix.ts) --
// needed because a live lfo1/lfo2 cable's Tone.Scale resets the underlying
// Signal's own intrinsic value at connect time, so reading it back later
// wouldn't reflect what was actually dialed in.
function _applyPadParams(padIdx, pad) {
  const volume = pad.volume ?? 0.85
  const filterFreq = pad.filterFreq ?? 20000
  const type = pad.filterType ?? 'lowpass'
  const resonance = pad.filterResonance ?? 0
  const pan = pad.pan ?? 0

  _padGainLevels[padIdx] = volume
  _filterFreqs[padIdx] = filterFreq
  _filterTypes[padIdx] = type
  _filterResonances[padIdx] = resonance
  _panValues[padIdx] = pan

  _padGains[padIdx].gain.value = volume
  _filters[padIdx].frequency.value = filterFreq
  _filters[padIdx].type = type
  _filters[padIdx].Q.value = resonanceToQ(resonance)
  _filters[padIdx].gain.value = resonanceToGainDb(type, resonance)
  _panners[padIdx].pan.value = pan
  _reverbSends[padIdx].gain.value = pad.reverbSend ?? 0
  _delaySends[padIdx].gain.value = pad.delaySend ?? 0
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
      ampVolume: _padGainLevels[padIdx],
      ampPan: _panValues[padIdx],
      wetDryMix: _fxWetDryValues[padIdx],
    },
  }
}

// Velocity is a one-time Modulation Matrix source -- resolved fresh at each
// trigger from `pad._midiVelocity` (set by SamplerPanel.vue's MIDI/app-note
// trigger path alongside the existing `pad._midiNote`; absent = 100,
// neutral/full), nudging this pad's shared filter/padGain/panner/fxChain
// from their cached dial-in baseline. No-op when this pad has no
// velocity-sourced slots.
function _applyVelocityMod(padIdx, pad, time) {
  const slots = _modMatrixSlots[padIdx]
  if (!slots || !slots.length) return
  const velocity01 = (pad._midiVelocity ?? 100) / 127
  applyVelocityModulation(slots, velocity01, _makeModMatrixTargets(padIdx), time)
}

// Rebuilds a pad's LIVE modulation cables (lfo1/lfo2 sources -- velocity is
// one-time, applied fresh on every trigger instead, see _applyVelocityMod()
// above). Editing-time operation, like setPadFx() -- not something to call
// on every trigger.
export function setPadModMatrix(padIdx, slots) {
  _modMatrixSlots[padIdx] = slots ?? []
  for (const d of _modMatrixCables[padIdx] ?? []) d.dispose()
  _modMatrixCables[padIdx] = applyModMatrix(_modMatrixSlots[padIdx], _makeModMatrixTargets(padIdx))
}

// Apply this pad's ADSR and trigger the attack/decay stage at `at`. Voice
// holds at the sustain level until stopPad()/stopPadNote() triggers the
// release stage.
function _applyEnvelope(padIdx, pad, at) {
  const { attack, decay, sustain, release } = safeAdsr(pad)
  const env = _envelopes[padIdx]
  env.attack = attack
  env.decay = decay
  env.sustain = sustain
  env.release = release
  env.triggerAttack(at)
  _releaseTimes[padIdx] = release
}

async function _getLofiBuffer(blobUrl, buffer, targetRate) {
  if (targetRate >= buffer.sampleRate) return buffer
  const key = `${blobUrl}:${targetRate}`
  if (_lofiCache.has(key)) return _lofiCache.get(key)
  const duration = buffer.duration
  const offCtx   = new OfflineAudioContext(buffer.numberOfChannels, Math.ceil(duration * targetRate), targetRate)
  const src      = offCtx.createBufferSource()
  src.buffer     = buffer
  src.connect(offCtx.destination)
  src.start(0)
  const rendered = await offCtx.startRendering()
  _lofiCache.set(key, rendered)
  return rendered
}

async function _getBuffer(blobUrl) {
  if (_bufferCache.has(blobUrl)) return _bufferCache.get(blobUrl)
  const resp = await fetch(blobUrl)
  if (!resp.ok) throw new Error(`sampler-engine: fetch failed ${resp.status}`)
  const ab  = await resp.arrayBuffer()
  const buf = await _ctx.decodeAudioData(ab)
  _bufferCache.set(blobUrl, buf)
  return buf
}

// time: optional Tone.js scheduled time; null = fire immediately
export async function triggerPad(padIdx, pad, blobUrl, time = null) {
  if (padIdx < 0 || padIdx >= PAD_COUNT || !blobUrl) return
  const ctx = _ensureCtx()
  if (ctx.state === 'suspended') await ctx.resume()

  let buffer = await _getBuffer(blobUrl)
  const lofiRate = pad.sampleRate ?? 44100
  if (lofiRate < 44100) buffer = await _getLofiBuffer(blobUrl, buffer, lofiRate)

  stopPad(padIdx)

  _applyPadParams(padIdx, pad)

  const at = time ?? ctx.currentTime
  _applyVelocityMod(padIdx, pad, at)
  _applyEnvelope(padIdx, pad, at)

  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.playbackRate.value = Math.pow(2, (pad.pitch ?? 0) / 12)
  src.loop = pad.loopMode ?? false

  const startOffset = (pad.startPoint ?? 0) * buffer.duration
  const endOffset   = (pad.endPoint   ?? 1) * buffer.duration

  // Unlike Tone.Gain/Tone.Panner (whose `.input` IS the wrapped native
  // node), Tone.AmplitudeEnvelope's `.input` is itself a nested Tone.Gain
  // (`this.input = this._gainNode`, a `new Gain(...)`, not a plain
  // `createGain()` node) — a plain native node's `.connect()` needs
  // `.input.input` to actually reach a native node.
  src.connect(_envelopes[padIdx].input.input)
  if (src.loop) {
    src.loopStart = startOffset
    src.loopEnd   = endOffset || buffer.duration
    src.start(at, startOffset)
  } else {
    src.start(at, startOffset, Math.max(0, endOffset - startOffset) || undefined)
  }
  _activeSrcs[padIdx] = src
  if (pad._midiNote != null) {
    const polyKey = `${padIdx}:${pad._midiNote}`
    _polyNoteMap.set(polyKey, src)
    src.onended = () => {
      if (_activeSrcs[padIdx] === src) _activeSrcs[padIdx] = null
      if (_polyNoteMap.get(polyKey) === src) _polyNoteMap.delete(polyKey)
    }
  } else {
    src.onended = () => { if (_activeSrcs[padIdx] === src) _activeSrcs[padIdx] = null }
  }
}

export function stopPad(padIdx) {
  const src = _activeSrcs[padIdx]
  if (!src) return
  _activeSrcs[padIdx] = null
  const release = _releaseTimes[padIdx] ?? 0
  if (release > 0.001 && _ctx) {
    const now = _ctx.currentTime
    _envelopes[padIdx].triggerRelease(now)
    try { src.stop(now + release) } catch {}
  } else {
    try { src.stop() } catch {}
  }
}

export function stopAll() {
  for (let i = 0; i < PAD_COUNT; i++) {
    stopGranular(i)
    stopPad(i)
  }
}

// Live param update without re-triggering (for knobs / FX sliders)
export function setPadParam(padIdx, param, value) {
  if (padIdx < 0 || padIdx >= PAD_COUNT || !_ctx) return
  const now = _ctx.currentTime
  switch (param) {
    case 'volume':
      _padGainLevels[padIdx] = value
      _padGains[padIdx]?.gain.setValueAtTime(value, now)
      break
    case 'filterFreq':
      _filterFreqs[padIdx] = value
      _filters[padIdx]?.frequency.setValueAtTime(value, now)
      break
    case 'filterType': {
      const filter = _filters[padIdx]
      if (filter) {
        _filterTypes[padIdx] = value
        filter.type = value
        filter.gain.setValueAtTime(resonanceToGainDb(value, _filterResonances[padIdx]), now)
      }
      break
    }
    case 'filterResonance': {
      const filter = _filters[padIdx]
      if (filter) {
        _filterResonances[padIdx] = value
        filter.Q.setValueAtTime(resonanceToQ(value), now)
        filter.gain.setValueAtTime(resonanceToGainDb(_filterTypes[padIdx], value), now)
      }
      break
    }
    case 'pan':
      _panValues[padIdx] = value
      _panners[padIdx]?.pan.setValueAtTime(value, now)
      break
    case 'reverbSend': _reverbSends[padIdx]?.gain.setValueAtTime(value, now);        break
    case 'delaySend':  _delaySends[padIdx]?.gain.setValueAtTime(value, now);         break
    case 'delay':      if (_delay) _delay.delayTime.setValueAtTime(value, now);      break
    case 'release':
      _releaseTimes[padIdx] = value
      if (_envelopes[padIdx]) _envelopes[padIdx].release = value
      break
  }
}

// Rebuilds a pad's FX chain from an `FxChain` config (see core/audio/types.ts).
// Tears down and reconstructs the algorithm nodes -- an editing-time
// operation (call when the user changes the chain), not something to call
// on every trigger.
export function setPadFx(padIdx, fxChain) {
  _fxWetDryValues[padIdx] = fxChain?.wetDry ?? 100
  _fxChains[padIdx]?.rebuild(fxChain)
}

// Pre-load a buffer into the cache (call before starting the sequencer)
export async function preloadBuffer(blobUrl) {
  if (!blobUrl || _bufferCache.has(blobUrl)) return
  const ctx = _ensureCtx()
  if (ctx.state === 'suspended') await ctx.resume()
  await _getBuffer(blobUrl)
}

// Pre-render a lo-fi downsampled variant so sync triggers don't have to wait
export async function preloadBufferLofi(blobUrl, targetRate) {
  const ctx = _ensureCtx()
  if (ctx.state === 'suspended') await ctx.resume()
  const buffer = await _getBuffer(blobUrl)
  await _getLofiBuffer(blobUrl, buffer, targetRate)
}

// Sync trigger — assumes buffer already in cache (use after preloadBuffer)
export function triggerPadSync(padIdx, pad, blobUrl, time = null) {
  if (padIdx < 0 || padIdx >= PAD_COUNT || !blobUrl) return
  const ctx = _ctx; if (!ctx) return
  const buffer = _bufferCache.get(blobUrl); if (!buffer) return

  if (!pad.polyMode) stopPad(padIdx)

  _applyPadParams(padIdx, pad)

  const at = time ?? ctx.currentTime
  _applyVelocityMod(padIdx, pad, at)
  _applyEnvelope(padIdx, pad, at)

  const lofiRate = pad.sampleRate ?? 44100
  const lofiKey  = `${blobUrl}:${lofiRate}`
  const buf      = (lofiRate < 44100 && _lofiCache.has(lofiKey)) ? _lofiCache.get(lofiKey) : buffer

  const src = ctx.createBufferSource()
  src.buffer = buf
  src.playbackRate.value = Math.pow(2, (pad.pitch ?? 0) / 12)
  src.loop = pad.loopMode ?? false

  const startOffset = (pad.startPoint ?? 0) * buffer.duration
  const endOffset   = (pad.endPoint   ?? 1) * buffer.duration

  // See the note on this same pattern in triggerPad() above.
  src.connect(_envelopes[padIdx].input.input)
  if (src.loop) {
    src.loopStart = startOffset
    src.loopEnd   = endOffset || buffer.duration
    src.start(at, startOffset)
  } else {
    src.start(at, startOffset, Math.max(0, endOffset - startOffset) || undefined)
  }
  _activeSrcs[padIdx] = src
  if (pad._midiNote != null) {
    const polyKey = `${padIdx}:${pad._midiNote}`
    _polyNoteMap.set(polyKey, src)
    src.onended = () => {
      if (_activeSrcs[padIdx] === src) _activeSrcs[padIdx] = null
      if (_polyNoteMap.get(polyKey) === src) _polyNoteMap.delete(polyKey)
    }
  } else {
    src.onended = () => { if (_activeSrcs[padIdx] === src) _activeSrcs[padIdx] = null }
  }
}

export function stopPadNote(padIdx, note, release) {
  const key = `${padIdx}:${note}`
  const src = _polyNoteMap.get(key)
  if (!src) return
  _polyNoteMap.delete(key)
  const rel = release ?? _releaseTimes[padIdx] ?? 0
  if (rel > 0.001 && _ctx) {
    const now = _ctx.currentTime
    _envelopes[padIdx].triggerRelease(now)
    try { src.stop(now + rel) } catch {}
  } else {
    try { src.stop() } catch {}
  }
}

// ── Granular engine ──────────────────────────────────────────────────────────

// Create a reversed grain-sized AudioBuffer from the source buffer
function _reverseSegment(buffer, offset, grainSize) {
  const ctx = _ctx
  const sampleRate = buffer.sampleRate
  const startSample = Math.floor(offset * sampleRate)
  const numSamples = Math.min(Math.floor(grainSize * sampleRate), buffer.length - startSample)
  if (numSamples < 1) return null
  const reversed = ctx.createBuffer(buffer.numberOfChannels, numSamples, sampleRate)
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch)
    const dst = reversed.getChannelData(ch)
    for (let i = 0; i < numSamples; i++) {
      dst[i] = src[startSample + numSamples - 1 - i]
    }
  }
  return reversed
}

function _spawnGrain(padIdx, pad, buffer) {
  const ctx = _ctx; if (!ctx) return
  const grainSize = pad.grainSize ?? 0.1
  const pos       = pad.grainPosition ?? 0.5
  const spray     = pad.grainSpray ?? 0
  const direction = pad.grainDirection ?? 0
  const stereo    = pad.grainStereo ?? 0

  // Position spray: randomize the start point
  const sprayAmount = spray * grainSize * 2  // up to 2× grain size of jitter
  const offset = Math.max(0, Math.min(buffer.duration - grainSize,
    pos * buffer.duration + (Math.random() - 0.5) * sprayAmount))

  // Direction: reverse the grain segment when going backward
  let isReverse = false
  if (direction === 1) isReverse = true
  else if (direction === 2) isReverse = Math.random() < 0.5
  else if (direction === 3) isReverse = Math.random() < 0.5

  let grainBuffer = buffer
  let grainOffset = offset
  if (isReverse) {
    const rev = _reverseSegment(buffer, offset, grainSize)
    if (rev) {
      grainBuffer = rev
      grainOffset = 0
    }
  }

  const src = ctx.createBufferSource()
  src.buffer = grainBuffer
  const pitchShift = (pad.pitch ?? 0) + (pad.grainPitch ?? 0)
  src.playbackRate.value = Math.pow(2, pitchShift / 12)

  // Hann envelope
  const env = ctx.createGain()
  const now = ctx.currentTime
  env.gain.setValueAtTime(0, now)
  env.gain.linearRampToValueAtTime(1, now + grainSize * 0.5)
  env.gain.linearRampToValueAtTime(0, now + grainSize)

  // Stereo width: randomize pan per grain
  // (`.input` — see the note on `_envelopes`/`src.connect()` above — `_padGains`
  // is now a Tone.Gain, so a native node can't `.connect()` it directly.)
  if (stereo > 0) {
    const panner = ctx.createStereoPanner()
    panner.pan.value = (Math.random() * 2 - 1) * stereo
    src.connect(env)
    env.connect(panner)
    panner.connect(_padGains[padIdx].input)
  } else {
    src.connect(env)
    env.connect(_padGains[padIdx].input)
  }

  src.start(now, grainOffset, grainSize)
  src.onended = () => { try { env.disconnect() } catch {} }
}

// Sync — assumes buffer in cache. Starts the grain cloud (stops previous if any).
export function triggerGranular(padIdx, pad, blobUrl) {
  if (padIdx < 0 || padIdx >= PAD_COUNT || !blobUrl) return
  const ctx = _ctx; if (!ctx) return
  const buffer = _bufferCache.get(blobUrl); if (!buffer) return

  stopGranular(padIdx)

  _applyPadParams(padIdx, pad)
  _applyVelocityMod(padIdx, pad, _ctx.currentTime)

  // Reset ADSR envelope so grains aren't muted by the stopGranular fade-out
  _applyEnvelope(padIdx, pad, _ctx.currentTime)

  const grainSize = pad.grainSize    ?? 0.1
  const overlap   = pad.grainOverlap ?? 0.5
  const grainCount = pad.grainCount ?? 4
  const intervalMs = Math.max(10, grainSize * (1 - overlap) * 1000)

  // Spawn initial grains for each voice
  for (let v = 0; v < grainCount; v++) {
    _spawnGrain(padIdx, pad, buffer)
  }

  // Schedule periodic grain spawning for each voice, staggered by interval
  const intervals = []
  for (let v = 0; v < grainCount; v++) {
    const id = setInterval(() => _spawnGrain(padIdx, pad, buffer), intervalMs)
    intervals.push(id)
  }
  _granularIntervals.set(padIdx, intervals)
  _activeSrcs[padIdx] = true
}

export function stopGranular(padIdx) {
  const ids = _granularIntervals.get(padIdx)
  if (ids != null) {
    for (const id of ids) clearInterval(id)
    _granularIntervals.delete(padIdx)
  }
  // NOTE: grains connect straight to `_padGains[padIdx]` (see _spawnGrain
  // above), not through `_envelopes[padIdx]` -- this release trigger is a
  // pre-existing no-op for granular's actual audio, kept as-is here since
  // fixing it is outside Phase 4's scope (a mechanical envelope-gain →
  // Tone.AmplitudeEnvelope swap).
  const release = _releaseTimes[padIdx] ?? 0
  if (release > 0.001 && _ctx && _envelopes[padIdx]) {
    _envelopes[padIdx].triggerRelease(_ctx.currentTime)
  }
  _activeSrcs[padIdx] = null
}

// Call after replacing a sample so the stale buffer isn't replayed
export function getCachedBuffer(blobUrl) {
  return _bufferCache.get(blobUrl) || null
}

export function invalidateBuffer(url) {
  _bufferCache.delete(url)
  // Also drop any lo-fi cached variants
  for (const k of _lofiCache.keys()) { if (k.includes(url)) _lofiCache.delete(k) }
}

export function isPlaying(padIdx) {
  return _activeSrcs[padIdx] != null
}

export function dispose() {
  for (const ids of _granularIntervals.values()) {
    for (const id of ids) clearInterval(id)
  }
  _granularIntervals.clear()
  _polyNoteMap.clear()
  stopAll()
  _ctx = null  // Tone.js owns the context, don't close it
  _masterGain = _compressor = _reverb = _reverbReturn = null
  _delay = _delayFeedback = _delayReturn = null
  _bufferCache.clear()
  _lofiCache.clear()
  for (let i = 0; i < PAD_COUNT; i++) {
    // Tone.js nodes wrap internal signal/param objects that plain GC won't
    // clean up — dispose() them explicitly before dropping the references.
    _envelopes[i]?.dispose()
    _padGains[i]?.dispose()
    _filters[i]?.dispose()
    _fxChains[i]?.dispose()
    _panners[i]?.dispose()
    for (const d of _modMatrixCables[i] ?? []) d.dispose()
    _envelopes[i] = _padGains[i] = _filters[i] = _fxChains[i] = _panners[i] = _reverbSends[i] = _delaySends[i] = null
    _activeSrcs[i] = null
    _releaseTimes[i] = 0
    _filterTypes[i] = 'lowpass'
    _filterResonances[i] = 0
    _padGainLevels[i] = 0.85
    _filterFreqs[i] = 20000
    _panValues[i] = 0
    _fxWetDryValues[i] = 100
    _modMatrixSlots[i] = []
    _modMatrixCables[i] = []
  }
}
