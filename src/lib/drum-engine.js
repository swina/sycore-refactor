import { getContext } from 'tone'

const ACCENT_BOOST = 1.35
const NUM_PADS = 8

let _masterGain = null
const _buffers = Array(NUM_PADS).fill(null)
const _padGains = Array(NUM_PADS).fill(null)
const _faderLevels = Array(NUM_PADS).fill(1.0)
let _activeSources = []

function _getCtx() {
  // Use Tone.js's AudioContext so scheduled times share the same clock
  return getContext().rawContext
}

function _ensureGraph() {
  if (_masterGain) return
  const ctx = _getCtx()
  _masterGain = ctx.createGain()
  _masterGain.gain.value = 0.85
  _masterGain.connect(ctx.destination)
  for (let i = 0; i < NUM_PADS; i++) {
    _padGains[i] = ctx.createGain()
    _padGains[i].gain.value = 1.0
    _padGains[i].connect(_masterGain)
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

  const gain = ctx.createGain()
  const volScale = (velocity / 127) * _faderLevels[padIdx] * (accent ? ACCENT_BOOST : 1.0)
  gain.gain.value = Math.min(1.5, volScale)

  src.connect(gain)
  gain.connect(_padGains[padIdx])

  const fireAt = Math.max(ctx.currentTime, time)
  src.start(fireAt)

  _activeSources.push(src)
  src.onended = () => {
    _activeSources = _activeSources.filter(s => s !== src)
  }
}

export function triggerRatchet(padIdx, stepTimeSec, divisions, { velocity = 100, accent = false, baseTime = 0 } = {}) {
  const buf = _buffers[padIdx]
  if (!buf || divisions <= 1) {
    triggerPad(padIdx, { velocity, accent, time: baseTime })
    return
  }
  _ensureGraph()
  const ctx = _getCtx()

  for (let i = 0; i < divisions; i++) {
    const fireTime = baseTime + (i / divisions) * stepTimeSec
    const src = ctx.createBufferSource()
    src.buffer = buf

    const taper = 1 - i * 0.12
    const volScale = (velocity / 127) * _faderLevels[padIdx] * (accent ? ACCENT_BOOST : 1.0) * taper
    const gain = ctx.createGain()
    gain.gain.value = Math.min(1.5, Math.max(0, volScale))

    src.connect(gain)
    gain.connect(_padGains[padIdx])

    const fireAt = Math.max(ctx.currentTime, fireTime)
    src.start(fireAt)

    _activeSources.push(src)
    src.onended = () => {
      _activeSources = _activeSources.filter(s => s !== src)
    }
  }
}

export function setPadVolume(padIdx, vol) {
  _faderLevels[padIdx] = Math.max(0, Math.min(1, vol))
}

export function setMasterVolume(vol) {
  if (_masterGain) {
    _masterGain.gain.value = Math.max(0, Math.min(1, vol))
  }
}

export function stopAll() {
  for (const src of _activeSources) {
    try { src.stop() } catch {}
  }
  _activeSources = []
}

export function resumeContext() {
  // Tone.js manages context resumption; nothing needed here
}
