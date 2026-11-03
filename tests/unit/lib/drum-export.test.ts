import { describe, it, expect } from 'vitest'
import { parseMidi } from 'midi-file'
import { buildDrumExportEvents, splitBars, drumEventsToMidi, envelopeLevel, midiVelocity, stepSeconds, fillHasHits } from '@/lib/drum-export'
import type { DrumStep, DrumTrack } from '@/types/drum-machine'

const off = (): DrumStep => ({ active: false, velocity: 100, accent: false, ratchet: 1, tie: 0 })
const on = (o: Partial<DrumStep> = {}): DrumStep => ({ active: true, velocity: 100, accent: false, ratchet: 1, tie: 0, ...o })
function track(hits: Record<number, Partial<DrumStep>>, o: Partial<DrumTrack> = {}): DrumTrack {
  return {
    label: 't', soundId: '', soundLabel: '', soundUrl: '', muted: false, solo: false, volume: 1, length: 16,
    pan: 0, pitch: 0, filterFreq: 20000, reverbSend: 0, delaySend: 0, midiNote: 36,
    steps: Array.from({ length: 16 }, (_, i) => (i in hits ? on(hits[i]) : off())), ...o,
  }
}
const fillOf = (n: number, hits: Record<number, Record<number, Partial<DrumStep>>>) =>
  Array.from({ length: n }, (_, t) => Array.from({ length: 16 }, (_, i) => (hits[t]?.[i] ? on(hits[t][i]) : off())))

describe('drum-export events', () => {
  const st = stepSeconds(120)

  it('plays the pattern twice, the fill replacing steps in the second bar only', () => {
    const tracks = [track({ 0: {}, 8: {} }, { midiNote: 36 }), track({ 4: {} }, { midiNote: 38 })]
    const fill = fillOf(2, { 1: { 14: { velocity: 90 } } })
    const ev = buildDrumExportEvents({ tracks, fillSteps: fill, bpm: 120, swing: 0 })
    const snares = ev.filter(e => e.note === 38).map(e => Math.round(e.time / st))
    expect(snares).toEqual([4, 20, 30])
    expect(ev.filter(e => e.note === 36).map(e => Math.round(e.time / st))).toEqual([0, 8, 16, 24])
  })

  it('applies swing, mute/solo, ratchets and ties', () => {
    const tracks = [
      track({ 1: {} }),
      track({ 0: { ratchet: 3 } }, { midiNote: 40 }),
      track({ 0: {} }, { muted: true, midiNote: 50 }),
    ]
    const ev = buildDrumExportEvents({ tracks, bpm: 120, swing: 50, bars: 1 })
    expect(ev.find(e => e.note === 36)!.time).toBeCloseTo(st + st * 0.25)
    expect(ev.filter(e => e.note === 40)).toHaveLength(3)
    expect(ev.some(e => e.note === 50)).toBe(false)
    const tied = buildDrumExportEvents({ tracks: [track({ 0: { tie: 2 }, 1: {}, 2: {}, 3: {} })], bpm: 120, swing: 0, bars: 1 })
    expect(tied.map(e => Math.round(e.time / st))).toEqual([0, 3])
    expect(tied[0].duration).toBeCloseTo(2 * st)
  })

  it('wraps each track at its own length', () => {
    const ev = buildDrumExportEvents({ tracks: [track({ 0: {} }, { length: 3 })], bpm: 120, swing: 0, bars: 1 })
    expect(ev.map(e => Math.round(e.time / st))).toEqual([0, 3, 6, 9, 12, 15])
  })

  it('bassline voices play on their source pads, which are skipped as drums', () => {
    const tracks = Array.from({ length: 11 }, () => track({ 0: {} }))
    const bass = [track({ 2: { note: 40 } })]
    const ev = buildDrumExportEvents({ tracks, bpm: 120, swing: 0, bars: 1, basslineTracks: bass, basslineSourceSlots: [8, 9, 10] })
    expect(ev.filter(e => e.kind === 'drum')).toHaveLength(8)
    const b = ev.filter(e => e.kind === 'bass')
    expect(b).toEqual([expect.objectContaining({ pad: 8, voice: 0, note: 40 })])
    expect(Math.round(b[0].time / st)).toBe(2)
  })

  it('fillHasHits', () => {
    expect(fillHasHits(fillOf(2, {}))).toBe(false)
    expect(fillHasHits(fillOf(2, { 0: { 3: {} } }))).toBe(true)
  })
})

describe('drum-export split', () => {
  it('splits into the pattern bar and the fill bar, each from 0 and cut at the bar line', () => {
    const st = stepSeconds(120)
    const tracks = [track({ 0: {}, 15: { tie: 3 } }, { midiNote: 36 })]
    const fill = fillOf(1, { 0: { 8: {} } })
    const [bar, fillBar] = splitBars(buildDrumExportEvents({ tracks, fillSteps: fill, bpm: 120, swing: 0 }), 120)
    expect(bar.map(e => Math.round(e.time / st))).toEqual([0, 15])
    expect(bar[1].duration).toBeCloseTo(st)
    // bar 2: step 0 is still under the tie (as on playback), the fill adds step 8
    expect(fillBar.map(e => Math.round(e.time / st))).toEqual([8, 15])
  })
})

describe('drum-export MIDI', () => {
  it('writes a 1-bar file with drums on channel 10 and accents in the velocity', () => {
    const tracks = [track({ 0: { accent: true, velocity: 80 } }), track({ 4: {} }, { midiNote: 38 })]
    const ev = splitBars(buildDrumExportEvents({ tracks, bpm: 100, swing: 0 }), 100)[0]
    const midi = parseMidi(drumEventsToMidi(ev, 100, { name: 'Pattern A' }))
    expect(midi.header.ticksPerBeat).toBe(480)
    const evs = midi.tracks[0]
    expect(evs.find((e: any) => e.type === 'trackName')).toMatchObject({ text: 'Pattern A' })
    expect(evs.find((e: any) => e.type === 'setTempo')).toMatchObject({ microsecondsPerBeat: 600000 })
    const ons = evs.filter((e: any) => e.type === 'noteOn' && e.velocity > 0) as any[]
    expect(ons).toHaveLength(2)
    expect(ons.every(e => e.channel === 9)).toBe(true)
    expect(ons[0].velocity).toBe(midiVelocity({ velocity: 80, accent: true, taper: 1 }))
    const total = evs.reduce((t: number, e: any) => t + e.deltaTime, 0)
    expect(total).toBe(4 * 480)
  })
})

describe('drum-export envelope', () => {
  it('attack, decay to sustain', () => {
    expect(envelopeLevel(0.005, 0.01, 0.1, 0.5)).toBeCloseTo(0.5)
    expect(envelopeLevel(0.06, 0.01, 0.1, 0.5)).toBeCloseTo(0.75)
    expect(envelopeLevel(1, 0.01, 0.1, 0.5)).toBe(0.5)
    expect(envelopeLevel(0.1, 0, 0, 1)).toBe(1)
  })
})
