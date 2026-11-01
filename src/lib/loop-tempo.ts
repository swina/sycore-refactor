// The tempo of an audio loop, and the playback rate that plays it at the song's tempo (Live Set
// Loop Pads). Pure.
//
// A loop's BPM comes from, in order: its name ("Funk Groove 96bpm", "kick_128_BPM"), else its
// length — a loop lasts a whole number of 4/4 bars, so BPM = 240 × bars / seconds — choosing the
// bar count that agrees with the detected tempo (onset analysis is often off by a few BPM or by an
// octave; the length is exact), else the detected tempo alone.

const BAR_COUNTS = [1, 2, 4, 8, 16, 32]
const BPM_MIN = 60
const BPM_MAX = 200

/** An explicit tempo in a file name ("96bpm", "128 BPM", "bpm120"); null when there's none. */
export function bpmFromName(name: string): number | null {
  const m = /(\d{2,3}(?:\.\d+)?)[\s_-]*bpm(?![a-z])/i.exec(name) ?? /(?<![a-z])bpm[\s_-]*(\d{2,3}(?:\.\d+)?)/i.exec(name)
  if (!m) return null
  const bpm = Number(m[1])
  return bpm >= 40 && bpm <= 300 ? bpm : null
}

/** The tempos a loop of `duration` seconds can have (whole 4/4 bars, 60–200 BPM). */
export function bpmCandidates(duration: number): Array<{ bars: number; bpm: number }> {
  if (!(duration > 0)) return []
  return BAR_COUNTS.map(bars => ({ bars, bpm: (240 * bars) / duration })).filter(c => c.bpm >= BPM_MIN && c.bpm <= BPM_MAX)
}

const round1 = (v: number) => Math.round(v * 10) / 10

/**
 * The loop's BPM (one decimal): the name's, else the bar-length tempo closest to the detected one
 * when within 6% (else to double / half of it), else the detected one; with nothing detected, the
 * bar-length tempo closest to 120. null when there's nothing to go on.
 */
export function loopBpm(opts: { name?: string; duration?: number; detected?: number | null }): number | null {
  const named = opts.name ? bpmFromName(opts.name) : null
  if (named) return named
  const cands = bpmCandidates(opts.duration ?? 0)
  const det = opts.detected && opts.detected > 0 ? opts.detected : null
  if (det) {
    // the detected tempo itself first, then at double / half tempo
    for (const d of [det, det * 2, det / 2]) {
      let best: { bpm: number; err: number } | null = null
      for (const c of cands) {
        const err = Math.abs(c.bpm - d) / d
        if (!best || err < best.err) best = { bpm: c.bpm, err }
      }
      if (best && best.err <= 0.06) return round1(best.bpm)
    }
    return round1(det)
  }
  if (!cands.length) return null
  return round1(cands.reduce((a, c) => (Math.abs(c.bpm - 120) < Math.abs(a.bpm - 120) ? c : a)).bpm)
}

/**
 * The playback rate that puts a `loopBpm` loop on `songBpm`: song / loop, folded by octaves into
 * about ×0.71–×1.41 (a 70 BPM loop on a 140 BPM song plays at ×1, in half time, not at ×2).
 */
export function loopPlaybackRate(songBpm: number, loopBpmValue: number | null | undefined): number {
  if (!(songBpm > 0) || !loopBpmValue || !(loopBpmValue > 0)) return 1
  let r = songBpm / loopBpmValue
  while (r > Math.SQRT2) r /= 2
  while (r < Math.SQRT1_2) r *= 2
  return r
}
