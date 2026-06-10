// Client-side BPM estimator using the Web Audio API.
// Used as a fallback when Freesound's ac_tempo field is absent.
//
// Algorithm:
//   1. Decode audio with AudioContext
//   2. Downsample to 8 kHz (bass-range focus, faster FFT)
//   3. RMS energy envelope with 46 ms windows / 50 % hop
//   4. Log-energy onset detection function (half-wave rectified flux)
//   5. Adaptive peak picking
//   6. Inter-onset interval (IOI) histogram, votes cast for 0.5×/1×/2×/3× harmonics
//   7. Return smoothed peak BPM in [60, 200]

export async function detectBpmFromUrl(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const arrayBuffer = await res.arrayBuffer()
  return _detectFromBuffer(arrayBuffer)
}

async function _detectFromBuffer(arrayBuffer) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)()
  let decoded
  try {
    decoded = await ctx.decodeAudioData(arrayBuffer)
  } finally {
    ctx.close()
  }
  return _computeBpm(decoded.getChannelData(0), decoded.sampleRate)
}

function _computeBpm(rawData, sampleRate) {
  // Downsample to ~8 kHz
  const targetRate = 8000
  const step = Math.max(1, Math.round(sampleRate / targetRate))
  const len = Math.floor(rawData.length / step)
  if (len < targetRate * 2) return null  // need at least 2 s of audio

  const data = new Float32Array(len)
  for (let i = 0; i < len; i++) data[i] = rawData[i * step]
  const sr = sampleRate / step

  // RMS energy envelope
  const winSamples = Math.round(sr * 0.046)
  const hopSamples = Math.round(winSamples / 2)
  const nFrames = Math.floor((len - winSamples) / hopSamples)
  if (nFrames < 16) return null

  const energy = new Float32Array(nFrames)
  for (let f = 0; f < nFrames; f++) {
    const s = f * hopSamples
    let sum = 0
    for (let i = s; i < s + winSamples; i++) sum += data[i] * data[i]
    energy[f] = Math.sqrt(sum / winSamples)
  }

  // Log-energy onset detection function (positive flux only)
  const odf = new Float32Array(nFrames)
  for (let f = 1; f < nFrames; f++) {
    const delta = Math.log1p(energy[f] * 100) - Math.log1p(energy[f - 1] * 100)
    if (delta > 0) odf[f] = delta
  }

  // Adaptive peak picking: local window ~200 ms
  const hw = Math.max(2, Math.round(0.2 / (hopSamples / sr)))
  const peaks = []
  for (let f = hw; f < nFrames - hw; f++) {
    if (odf[f] === 0) continue
    let isMax = true
    let localSum = 0
    for (let w = f - hw; w <= f + hw; w++) {
      if (odf[w] > odf[f]) { isMax = false; break }
      localSum += odf[w]
    }
    if (!isMax) continue
    const localMean = localSum / (2 * hw + 1)
    if (odf[f] > localMean * 1.25) peaks.push(f)
  }

  if (peaks.length < 4) return null

  // Collect inter-onset intervals in seconds
  const hopSec = hopSamples / sr
  const iois = []
  for (let i = 1; i < peaks.length; i++) {
    const dt = (peaks[i] - peaks[i - 1]) * hopSec
    if (dt > 0.2 && dt < 3.0) iois.push(dt)
  }
  if (iois.length < 2) return null

  // Vote for BPM candidates across harmonic multiples
  const votes = new Uint16Array(301)
  for (const dt of iois) {
    for (const mul of [0.5, 1, 2, 3, 4]) {
      const bpm = Math.round(60 / (dt * mul))
      if (bpm >= 60 && bpm <= 200) votes[bpm]++
    }
  }

  // Smooth and find peak
  let bestBpm = null, bestScore = 0
  for (let b = 61; b <= 199; b++) {
    const score = votes[b - 1] + votes[b] * 2 + votes[b + 1]
    if (score > bestScore) { bestScore = score; bestBpm = b }
  }

  return bestBpm
}
