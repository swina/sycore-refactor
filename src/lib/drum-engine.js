import { getContext } from 'tone'

const ACCENT_BOOST = 1.35
const NUM_PADS = 8

let _masterGain    = null
let _compressor    = null
let _reverb        = null
let _reverbReturn  = null
let _delay         = null
let _delayFeedback = null
let _delayReturn   = null

const _buffers      = Array(NUM_PADS).fill(null)
const _padGains     = Array(NUM_PADS).fill(null)
const _filters      = Array(NUM_PADS).fill(null)
const _panners      = Array(NUM_PADS).fill(null)
const _reverbSends  = Array(NUM_PADS).fill(null)
const _delaySends   = Array(NUM_PADS).fill(null)
const _faderLevels  = Array(NUM_PADS).fill(1.0)
const _pitchOffsets = Array(NUM_PADS).fill(0)    // semitones
let _activeSources  = []

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

  // Master → compressor → destination
  _compressor = ctx.createDynamicsCompressor()
  _compressor.threshold.value = -18
  _compressor.knee.value      = 6
  _compressor.ratio.value     = 3
  _compressor.attack.value    = 0.003
  _compressor.release.value   = 0.15
  _compressor.connect(ctx.destination)

  _masterGain = ctx.createGain()
  _masterGain.gain.value = 0.85
  _masterGain.connect(_compressor)

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

  // Per-pad chain: padGain → filter → panner → masterGain
  //                                 panner → reverbSend → reverb
  //                                 panner → delaySend  → delay
  for (let i = 0; i < NUM_PADS; i++) {
    _padGains[i] = ctx.createGain()
    _padGains[i].gain.value = 1.0

    _filters[i] = ctx.createBiquadFilter()
    _filters[i].type = 'lowpass'
    _filters[i].frequency.value = 20000
    _filters[i].Q.value = 0.5

    _panners[i] = ctx.createStereoPanner()
    _panners[i].pan.value = 0

    _reverbSends[i] = ctx.createGain()
    _reverbSends[i].gain.value = 0

    _delaySends[i] = ctx.createGain()
    _delaySends[i].gain.value = 0

    _padGains[i].connect(_filters[i])
    _filters[i].connect(_panners[i])
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

export function triggerPad(padIdx, { velocity = 100, accent = false, time = 0 } = {}) {
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
  gain.connect(_padGains[padIdx])

  const fireAt = Math.max(ctx.currentTime, time)
  src.start(fireAt)

  _activeSources.push(src)
  src.onended = () => { _activeSources = _activeSources.filter(s => s !== src) }
}

export function triggerRatchet(padIdx, stepTimeSec, divisions, { velocity = 100, accent = false, baseTime = 0 } = {}) {
  const buf = _buffers[padIdx]
  if (!buf || divisions <= 1) {
    triggerPad(padIdx, { velocity, accent, time: baseTime })
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
    gain.connect(_padGains[padIdx])

    const fireAt = Math.max(ctx.currentTime, fireTime)
    src.start(fireAt)

    _activeSources.push(src)
    src.onended = () => { _activeSources = _activeSources.filter(s => s !== src) }
  }
}

export function setPadVolume(padIdx, vol) {
  _faderLevels[padIdx] = Math.max(0, Math.min(1, vol))
}

export function setPadPan(padIdx, pan) {
  if (_panners[padIdx]) _panners[padIdx].pan.value = Math.max(-1, Math.min(1, pan))
}

export function setPadPitch(padIdx, semitones) {
  _pitchOffsets[padIdx] = Math.max(-24, Math.min(24, semitones))
}

export function setPadFilter(padIdx, freq) {
  if (_filters[padIdx]) _filters[padIdx].frequency.value = Math.max(20, Math.min(20000, freq))
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
