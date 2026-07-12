// Web Audio engine for SamplerPanel.
// 7 per-pad chains (6 standard + 1 granular slot) with shared reverb + delay bus.
// Uses Tone.js AudioContext so scheduled times from getTransport() are compatible.
import { getContext } from 'tone'

const PAD_COUNT = 7

let _ctx           = null
let _masterGain    = null
let _compressor    = null
let _reverb        = null
let _reverbReturn  = null
let _delay         = null
let _delayFeedback = null
let _delayReturn   = null

const _envelopeGains = Array(PAD_COUNT).fill(null)  // ADSR envelope gain per pad
const _padGains      = Array(PAD_COUNT).fill(null)
const _filters       = Array(PAD_COUNT).fill(null)
const _panners       = Array(PAD_COUNT).fill(null)
const _reverbSends   = Array(PAD_COUNT).fill(null)
const _delaySends    = Array(PAD_COUNT).fill(null)
const _activeSrcs    = Array(PAD_COUNT).fill(null)
const _releaseTimes  = Array(PAD_COUNT).fill(0)     // release seconds per pad

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

  for (let i = 0; i < PAD_COUNT; i++) {
    _envelopeGains[i] = _ctx.createGain()
    _envelopeGains[i].gain.value = 1.0

    _padGains[i] = _ctx.createGain()
    _padGains[i].gain.value = 1.0

    _filters[i] = _ctx.createBiquadFilter()
    _filters[i].type = 'lowpass'
    _filters[i].frequency.value = 20000
    _filters[i].Q.value = 0.5

    _panners[i] = _ctx.createStereoPanner()
    _panners[i].pan.value = 0

    _reverbSends[i] = _ctx.createGain()
    _reverbSends[i].gain.value = 0

    _delaySends[i] = _ctx.createGain()
    _delaySends[i].gain.value = 0

    // Chain: src → envelopeGain → padGain → filter → panner → masterGain / sends
    _envelopeGains[i].connect(_padGains[i])
    _padGains[i].connect(_filters[i])
    _filters[i].connect(_panners[i])
    _panners[i].connect(_masterGain)
    _panners[i].connect(_reverbSends[i])
    _panners[i].connect(_delaySends[i])
    _reverbSends[i].connect(_reverb)
    _delaySends[i].connect(_delay)
  }

  return _ctx
}

// Apply attack→decay envelope starting at `at`. Gain returns current → 0 on stopPad.
function _applyEnvelope(padIdx, pad, at) {
  const env     = _envelopeGains[padIdx]
  const attack  = Math.max(0.001, pad.attack  ?? 0.005)
  const decay   = pad.decay   ?? 0
  const sustain = Math.max(0, Math.min(1, pad.sustain ?? 1.0))
  const release = pad.release ?? 0.05

  env.gain.cancelScheduledValues(at)
  env.gain.setValueAtTime(0, at)
  env.gain.linearRampToValueAtTime(1, at + attack)
  if (decay > 0.001) {
    // Decay to sustain level; voice holds there until Note OFF triggers release
    env.gain.linearRampToValueAtTime(sustain, at + attack + decay)
  }
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

  _padGains[padIdx].gain.value     = pad.volume      ?? 0.85
  _filters[padIdx].frequency.value = pad.filterFreq  ?? 20000
  _panners[padIdx].pan.value       = pad.pan         ?? 0
  _reverbSends[padIdx].gain.value  = pad.reverbSend  ?? 0
  _delaySends[padIdx].gain.value   = pad.delaySend   ?? 0

  const at = time ?? ctx.currentTime
  _applyEnvelope(padIdx, pad, at)

  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.playbackRate.value = Math.pow(2, (pad.pitch ?? 0) / 12)
  src.loop = pad.loopMode ?? false

  const startOffset = (pad.startPoint ?? 0) * buffer.duration
  const endOffset   = (pad.endPoint   ?? 1) * buffer.duration

  src.connect(_envelopeGains[padIdx])
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
    const env = _envelopeGains[padIdx]
    const now = _ctx.currentTime
    env.gain.cancelScheduledValues(now)
    env.gain.setValueAtTime(env.gain.value, now)
    env.gain.linearRampToValueAtTime(0, now + release)
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
    case 'volume':     _padGains[padIdx]?.gain.setValueAtTime(value, now);           break
    case 'filterFreq': _filters[padIdx]?.frequency.setValueAtTime(value, now);       break
    case 'pan':        _panners[padIdx]?.pan.setValueAtTime(value, now);             break
    case 'reverbSend': _reverbSends[padIdx]?.gain.setValueAtTime(value, now);        break
    case 'delaySend':  _delaySends[padIdx]?.gain.setValueAtTime(value, now);         break
    case 'delay':      if (_delay) _delay.delayTime.setValueAtTime(value, now);      break
    case 'release':    _releaseTimes[padIdx] = value;                               break
  }
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

  _padGains[padIdx].gain.value     = pad.volume      ?? 0.85
  _filters[padIdx].frequency.value = pad.filterFreq  ?? 20000
  _panners[padIdx].pan.value       = pad.pan         ?? 0
  _reverbSends[padIdx].gain.value  = pad.reverbSend  ?? 0
  _delaySends[padIdx].gain.value   = pad.delaySend   ?? 0

  const at = time ?? ctx.currentTime
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

  src.connect(_envelopeGains[padIdx])
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
    const env = _envelopeGains[padIdx]
    env.gain.cancelScheduledValues(now)
    env.gain.setValueAtTime(env.gain.value, now)
    env.gain.linearRampToValueAtTime(0, now + rel)
    try { src.stop(now + rel) } catch {}
  } else {
    try { src.stop() } catch {}
  }
}

// ── Granular engine ──────────────────────────────────────────────────────────

function _spawnGrain(padIdx, pad, buffer) {
  const ctx = _ctx; if (!ctx) return
  const grainSize = pad.grainSize ?? 0.1
  const pos       = pad.grainPosition ?? 0.5
  // Random jitter: ±30% of grain size
  const jitter    = grainSize * 0.3
  const offset    = Math.max(0, Math.min(buffer.duration - grainSize,
    pos * buffer.duration + (Math.random() - 0.5) * jitter * 2))

  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.playbackRate.value = Math.pow(2, ((pad.pitch ?? 0) + (pad.grainPitch ?? 0)) / 12)

  // Hann envelope via gain automation
  const env = ctx.createGain()
  const now = ctx.currentTime
  env.gain.setValueAtTime(0, now)
  env.gain.linearRampToValueAtTime(1, now + grainSize * 0.5)
  env.gain.linearRampToValueAtTime(0, now + grainSize)

  src.connect(env)
  env.connect(_padGains[padIdx])
  src.start(now, offset, grainSize)
  src.onended = () => { try { env.disconnect() } catch {} }
}

// Sync — assumes buffer in cache. Starts the grain cloud (stops previous if any).
export function triggerGranular(padIdx, pad, blobUrl) {
  if (padIdx < 0 || padIdx >= PAD_COUNT || !blobUrl) return
  const ctx = _ctx; if (!ctx) return
  const buffer = _bufferCache.get(blobUrl); if (!buffer) return

  stopGranular(padIdx)

  _padGains[padIdx].gain.value     = pad.volume     ?? 0.85
  _filters[padIdx].frequency.value = pad.filterFreq ?? 20000
  _panners[padIdx].pan.value       = pad.pan        ?? 0
  _reverbSends[padIdx].gain.value  = pad.reverbSend ?? 0
  _delaySends[padIdx].gain.value   = pad.delaySend  ?? 0

  const grainSize = pad.grainSize    ?? 0.1
  const overlap   = pad.grainOverlap ?? 0.5
  const intervalMs = Math.max(10, grainSize * (1 - overlap) * 1000)

  _spawnGrain(padIdx, pad, buffer)
  const id = setInterval(() => _spawnGrain(padIdx, pad, buffer), intervalMs)
  _granularIntervals.set(padIdx, id)
  _activeSrcs[padIdx] = true   // marker so isPlaying() returns true
}

export function stopGranular(padIdx) {
  const id = _granularIntervals.get(padIdx)
  if (id != null) { clearInterval(id); _granularIntervals.delete(padIdx) }
  // Fade out any in-flight grains via the pad gain
  const release = _releaseTimes[padIdx] ?? 0
  if (release > 0.001 && _ctx && _envelopeGains[padIdx]) {
    const now = _ctx.currentTime
    const env = _envelopeGains[padIdx]
    env.gain.cancelScheduledValues(now)
    env.gain.setValueAtTime(env.gain.value, now)
    env.gain.linearRampToValueAtTime(0, now + release)
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
  for (const id of _granularIntervals.values()) clearInterval(id)
  _granularIntervals.clear()
  _polyNoteMap.clear()
  stopAll()
  _ctx = null  // Tone.js owns the context, don't close it
  _masterGain = _compressor = _reverb = _reverbReturn = null
  _delay = _delayFeedback = _delayReturn = null
  _bufferCache.clear()
  _lofiCache.clear()
  for (let i = 0; i < PAD_COUNT; i++) {
    _envelopeGains[i] = _padGains[i] = _filters[i] = _panners[i] = _reverbSends[i] = _delaySends[i] = null
    _activeSrcs[i] = null
    _releaseTimes[i] = 0
  }
}
