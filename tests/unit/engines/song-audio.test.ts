import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// A fake AudioContext: what the engine starts, when and from where.
const started: Array<{ when: number; offset: number; loop: boolean }> = []
const stopped: number[] = []
let lastRate = 1
const ctx: any = {
  currentTime: 10,
  destination: {},
  createGain: () => ({ gain: { value: 1, setTargetAtTime() {}, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {} }),
  createBufferSource: () => {
    const s: any = { loop: false, buffer: null, playbackRate: { value: 1, setValueAtTime(v: number) { s.playbackRate.value = v } }, connect() {}, start(when: number, offset: number) { started.push({ when, offset, loop: s.loop }); lastRate = s.playbackRate.value }, stop(t: number) { stopped.push(t) } }
    return s
  },
  decodeAudioData: async () => ({ duration: 4 }),
}
vi.mock('tone', () => ({ getContext: () => ({ rawContext: ctx }) }))
vi.mock('@/lib/song-samples', () => ({ loadSongSample: async () => new ArrayBuffer(8) }))

import { createPinia, setActivePinia } from 'pinia'
import { useSongAudio, _resetSongAudio } from '@/core/engines/song-audio'

describe('song audio (Tracks / Samples lanes)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    started.length = 0; stopped.length = 0
    ctx.currentTime = 10
    vi.spyOn(performance, 'now').mockReturnValue(10000) // perf 10 000 ms ↔ audio 10 s
  })
  afterEach(() => { _resetSongAudio(); vi.restoreAllMocks() })

  it('starts on the bar line ahead; a bar line already gone: now, from the point it would be at', async () => {
    const a = useSongAudio()
    await a.play('sample', 0, { id: 's', name: 'S', mode: 'oneshot' }, 10500) // 0.5 s ahead
    expect(started.at(-1)).toEqual({ when: 10.5, offset: 0, loop: false })
    await a.play('sample', 1, { id: 's2', name: 'S2', mode: 'oneshot' }, 9000) // 1 s ago
    expect(started.at(-1)).toEqual({ when: 10, offset: 1, loop: false })
    expect(a.state.sample.slot).toBe(1)
  })

  it('Loop: repeats (the offset inside its length); a one-shot already over does not start', async () => {
    const a = useSongAudio()
    await a.play('sample', 0, { id: 'l', name: 'L', mode: 'loop' }, 4000) // 6 s ago, 4 s long: 2 s in
    expect(started.at(-1)).toEqual({ when: 10, offset: 2, loop: true })
    const n = started.length
    await a.play('sample', 1, { id: 'o', name: 'O', mode: 'oneshot' }, 4000) // 6 s ago, 4 s long: over
    expect(started.length).toBe(n)
  })

  it('Varispeed: the track at the song\'s speed (late start: the point at that speed)', async () => {
    const a = useSongAudio()
    await a.play('sample', 0, { id: 'v', name: 'V', mode: 'oneshot' }, 9000, 1.2) // 1 s ago at ×1.2 (the rate as a Track's varispeed gives it)
    expect(started.at(-1)!.offset).toBeCloseTo(1.2)
    expect(lastRate).toBeCloseTo(1.2)
  })

  it('stop: the voice ends on the bar line (after a short fade); mute per lane', async () => {
    const a = useSongAudio()
    await a.play('sample', 0, { id: 's', name: 'S', mode: 'loop' }, 10000)
    a.stop('sample', 12000)
    expect(stopped.at(-1)).toBeCloseTo(12.01)
    expect(a.state.sample.slot).toBeNull()
    a.toggleMute('track')
    expect(a.state.track.muted).toBe(true)
  })
})
