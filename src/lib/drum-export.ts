// Drum Machine export: each pattern (A–H) as 1 bar, and its Fill bar (the Fill on top of the
// pattern's next bar), each to a MIDI file and a WAV. The events follow the live scheduler (DrumMachine.vue `_scheduleCallback`): swing,
// per-track length (polymetry), mute/solo, ties, ratchets, accents, the Fill's active steps
// replacing the pattern's in the second bar, the bassline voices on their source pads.
// The WAV is rendered offline (OfflineAudioContext, no realtime playback): sample, pitch, volume,
// pan, filter and amp envelope per track; the FX chains, reverb/delay sends and Modulation Matrix
// are not rendered (a dry mix).
import type { DrumStep, DrumTrack } from '@/types/drum-machine'
import { resonanceToQ, resonanceToGainDb, safeCutoffHz, type FilterType } from '@/core/audio/filterMath'
import { DEFAULT_ADSR, safeAdsr } from '@/core/audio/envelope'
import { audioBufferToWav } from '@/lib/decode-audio'

export const ACCENT_BOOST = 1.35
export const STEPS_PER_BAR = 16

export interface DrumExportEvent {
  kind: 'drum' | 'bass'
  /** The pad (drum track index) whose sample sounds it. */
  pad: number
  /** MIDI note: the track's MIDI note (drums), the step's note (bassline). */
  note: number
  time: number        // seconds from the start
  duration: number    // seconds (gate)
  velocity: number    // 1–127, before the accent
  accent: boolean
  /** Ratchet subdivision taper (1 = none), as drum-engine.js's triggerRatchet. */
  taper: number
  /** Bassline: the voice (0-based) — its pitch/volume/filter replace the pad's. */
  voice?: number
}

export interface DrumExportInput {
  tracks: DrumTrack[]
  /** The Fill's steps per track (null/empty: no fill, the second bar repeats the pattern). */
  fillSteps?: (DrumStep | null | undefined)[][] | null
  bpm: number
  swing: number
  /** Bassline voices of this pattern, when the bassline is on. */
  basslineTracks?: DrumTrack[] | null
  basslineSourceSlots?: number[]
  bars?: number       // default 2 (the last one with the fill)
}

export const stepSeconds = (bpm: number) => 60 / (bpm * 4)

export function hasActiveSteps(tracks: DrumTrack[] | null | undefined): boolean {
  return !!tracks?.some(t => t.steps?.some(s => s?.active))
}

export function fillHasHits(fill: DrumExportInput['fillSteps']): boolean {
  return !!fill?.some(t => t?.some(s => s?.active))
}

/** The pattern's notes over `bars` bars, the last one with the fill (as the live Fill does). */
export function buildDrumExportEvents(input: DrumExportInput): DrumExportEvent[] {
  const { tracks, fillSteps, bpm, swing } = input
  const bars = input.bars ?? 2
  const stepT = stepSeconds(bpm)
  const soloActive = tracks.some(t => t.solo)
  const bass = input.basslineTracks?.length ? input.basslineTracks : null
  const slots = input.basslineSourceSlots ?? []
  const bassSolo = !!bass?.some(t => t.solo)
  const tie = Array(tracks.length).fill(0)
  const out: DrumExportEvent[] = []

  for (let counter = 0; counter < bars * STEPS_PER_BAR; counter++) {
    const globalStep = counter % STEPS_PER_BAR
    const inFill = Math.floor(counter / STEPS_PER_BAR) === bars - 1
    const time = counter * stepT + (globalStep % 2 === 1 ? stepT * (swing / 200) : 0)

    tracks.forEach((track, ti) => {
      const audible = soloActive ? track.solo : !track.muted
      if (!audible) return
      if (bass && slots.includes(ti)) return
      const len = track.length || STEPS_PER_BAR
      const ts = counter % len
      let step = track.steps[ts]
      const f = inFill ? fillSteps?.[ti]?.[ts] : null
      if (f?.active) step = f
      if (tie[ti] > 0) { tie[ti]--; return }
      if (!step?.active) return
      const dur = step.tie > 0 ? step.tie * stepT : stepT
      const div = Math.max(1, step.ratchet || 1)
      const note = track.midiNote ?? 36
      if (div <= 1) {
        out.push({ kind: 'drum', pad: ti, note, time, duration: dur, velocity: step.velocity, accent: !!step.accent, taper: 1 })
      } else {
        const divDur = Math.min(dur, (stepT / div) * 0.9)
        for (let i = 0; i < div; i++) {
          out.push({ kind: 'drum', pad: ti, note, time: time + (i / div) * stepT, duration: divDur,
            velocity: step.velocity, accent: !!step.accent, taper: Math.max(0, 1 - i * 0.12) })
        }
      }
      if (step.tie > 0) tie[ti] = step.tie
    })

    bass?.forEach((voice, vi) => {
      if (voice.muted || (bassSolo && !voice.solo)) return
      const pad = slots[vi]
      if (pad == null || pad < 0 || pad >= tracks.length) return
      const step = voice.steps[counter % (voice.length || STEPS_PER_BAR)]
      if (!step?.active) return
      out.push({ kind: 'bass', pad, voice: vi, note: step.note ?? 36, time,
        duration: step.tie > 0 ? step.tie * stepT : stepT, velocity: step.velocity, accent: !!step.accent, taper: 1 })
    })
  }
  return out.sort((a, b) => a.time - b.time)
}

/**
 * Splits 2-bar events into the pattern bar and the fill bar, each starting at 0 and cut at its
 * bar's end (a tie or ring past the bar line is shortened), so each file is exactly 1 bar.
 */
export function splitBars(events: DrumExportEvent[], bpm: number, bars = 2): DrumExportEvent[][] {
  const barLen = STEPS_PER_BAR * stepSeconds(bpm)
  const out: DrumExportEvent[][] = Array.from({ length: bars }, () => [])
  for (const e of events) {
    const b = Math.min(bars - 1, Math.floor(e.time / barLen + 1e-9))
    const time = e.time - b * barLen
    out[b].push({ ...e, time, duration: Math.max(0.001, Math.min(e.duration, barLen - time)) })
  }
  return out
}

export const midiVelocity = (e: Pick<DrumExportEvent, 'velocity' | 'accent' | 'taper'>) =>
  Math.max(1, Math.min(127, Math.round(e.velocity * (e.accent ? ACCENT_BOOST : 1) * (e.taper ?? 1))))

function varLen(n: number): number[] {
  const out = [n & 0x7f]
  n >>>= 7
  while (n) { out.unshift((n & 0x7f) | 0x80); n >>>= 7 }
  return out
}

/**
 * Standard MIDI file, format 0, 480 ticks per beat: tempo, 4/4, the name, drums on `drumChannel`
 * (default 10), bassline on `bassChannel` (default 2) — 1-based channels.
 */
export function drumEventsToMidi(events: DrumExportEvent[], bpm: number,
  { name = 'Drums', drumChannel = 10, bassChannel = 2, bars = 1 } = {}): Uint8Array {
  const tpb = 480
  const tick = (sec: number) => Math.max(0, Math.round((sec * bpm / 60) * tpb))
  const uspb = Math.round(60_000_000 / bpm)
  const evs: { t: number; b: number[]; off: boolean }[] = []
  for (const e of events) {
    const ch = ((e.kind === 'bass' ? bassChannel : drumChannel) - 1) & 0x0f
    const on = tick(e.time)
    const off = Math.max(on + 1, tick(e.time + e.duration))
    evs.push({ t: on, b: [0x90 | ch, e.note & 0x7f, midiVelocity(e)], off: false })
    evs.push({ t: off, b: [0x80 | ch, e.note & 0x7f, 0], off: true })
  }
  // at the same tick a note off goes first (a retrigger must not be cut by its own off)
  evs.sort((a, b) => a.t - b.t || Number(b.off) - Number(a.off))

  const nameBytes = Array.from(new TextEncoder().encode(name))
  const tr: number[] = [
    0x00, 0xff, 0x03, ...varLen(nameBytes.length), ...nameBytes,
    0x00, 0xff, 0x51, 0x03, (uspb >> 16) & 0xff, (uspb >> 8) & 0xff, uspb & 0xff,
    0x00, 0xff, 0x58, 0x04, 4, 2, 24, 8,
  ]
  let prev = 0
  for (const ev of evs) { tr.push(...varLen(ev.t - prev), ...ev.b); prev = ev.t }
  // end of track at the end of the last bar, so the file is exactly `bars` long
  const end = Math.max(prev, bars * 4 * tpb)
  tr.push(...varLen(end - prev), 0xff, 0x2f, 0x00)
  const len = tr.length
  return new Uint8Array([
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (tpb >> 8) & 0xff, tpb & 0xff,
    0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff,
    ...tr,
  ])
}

/** Amp envelope level `t` seconds after the note on (linear attack/decay, as an approximation). */
export function envelopeLevel(t: number, a: number, d: number, s: number): number {
  if (a > 0 && t <= 0) return 0
  if (t < a) return t / a
  if (d > 0 && t < a + d) return 1 - (1 - s) * ((t - a) / d)
  return s
}

/**
 * Renders the events to a stereo AudioBuffer of exactly `bars` bars (loop length; what rings past
 * the end is cut). `buffers[pad]`: the pad's sample (none: that pad is silent).
 */
export async function renderDrumEvents(events: DrumExportEvent[], tracks: DrumTrack[],
  buffers: (AudioBuffer | null | undefined)[], bpm: number,
  { bars = 1, sampleRate = 44100, basslineTracks = null as DrumTrack[] | null } = {}): Promise<AudioBuffer> {
  const length = Math.ceil(bars * STEPS_PER_BAR * stepSeconds(bpm) * sampleRate)
  const ctx = new OfflineAudioContext(2, length, sampleRate)
  const master = ctx.createGain()
  master.gain.value = 0.85
  master.connect(ctx.destination)

  // per pad (and per bassline voice: its own filter frequency): filter → panner → master
  const buses = new Map<string, AudioNode>()
  function bus(pad: number, voice?: number): AudioNode {
    const key = voice == null ? `p${pad}` : `b${voice}`
    let node = buses.get(key)
    if (node) return node
    const t = tracks[pad]
    const type = (t?.filterType ?? 'lowpass') as FilterType
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = safeCutoffHz(voice == null ? (t?.filterFreq ?? 20000) : (basslineTracks?.[voice]?.filterFreq ?? 20000))
    filter.Q.value = resonanceToQ(t?.filterResonance ?? 0)
    filter.gain.value = resonanceToGainDb(type, t?.filterResonance ?? 0)
    const pan = ctx.createStereoPanner()
    pan.pan.value = Math.max(-1, Math.min(1, t?.pan ?? 0))
    filter.connect(pan)
    pan.connect(master)
    buses.set(key, filter)
    return filter
  }

  for (const e of events) {
    const buf = buffers[e.pad]
    if (!buf) continue
    const t = tracks[e.pad]
    const voice = e.voice != null ? basslineTracks?.[e.voice] : null
    const { attack: a, decay: d, sustain: s, release: r } = safeAdsr(t ?? {}, DEFAULT_ADSR)
    const semis = e.kind === 'bass' ? e.note - 60 + (voice?.pitch ?? 0) : (t?.pitch ?? 0)
    const vol = Math.max(0, Math.min(1, (voice ?? t)?.volume ?? 1))

    const src = ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = 2 ** (semis / 12)
    const hit = ctx.createGain()
    hit.gain.value = Math.min(1.5, (e.velocity / 127) * vol * (e.accent ? ACCENT_BOOST : 1) * e.taper)
    const env = ctx.createGain()
    const g = env.gain
    const t0 = e.time, rel = t0 + Math.max(0.001, e.duration)
    g.setValueAtTime(a > 0 ? 0 : 1, t0)
    if (a > 0 && e.duration > a) g.linearRampToValueAtTime(1, t0 + a)
    if (d > 0 && e.duration > a + d) g.linearRampToValueAtTime(s, t0 + a + d)
    g.linearRampToValueAtTime(envelopeLevel(e.duration, a, d, s), rel)
    g.linearRampToValueAtTime(0, rel + Math.max(0.001, r))
    src.connect(hit)
    hit.connect(env)
    env.connect(bus(e.pad, e.voice))
    src.start(t0)
    src.stop(rel + Math.max(0.001, r) + 0.01)
  }

  const rendered = await ctx.startRendering()
  // no clipping: bring a peak over full scale down (never up)
  let peak = 0
  for (let c = 0; c < rendered.numberOfChannels; c++) {
    const data = rendered.getChannelData(c)
    for (let i = 0; i < data.length; i++) { const v = Math.abs(data[i]); if (v > peak) peak = v }
  }
  if (peak > 0.99) {
    const k = 0.99 / peak
    for (let c = 0; c < rendered.numberOfChannels; c++) {
      const data = rendered.getChannelData(c)
      for (let i = 0; i < data.length; i++) data[i] *= k
    }
  }
  return rendered
}

export { audioBufferToWav }
