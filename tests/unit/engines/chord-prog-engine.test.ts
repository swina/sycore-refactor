import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useChordProgEngine, _resetChordProgEngine } from '@/core/engines/chord-prog'
import { useChordProgStore } from '@/stores/useChordProgStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { midiService } from '@/core/midi/midi-service'

// The Chord Prog's playback without its panel (Scenario Workspaces, Phase 1): a chord clicked
// plays, a second click stops it — every note-on gets its note-off.
function setup() {
  setActivePinia(createPinia())
  const midiStore = useMidiStore()
  const on: number[] = []
  const off: number[] = []
  vi.spyOn(midiStore, 'sendNoteOn').mockImplementation(((n: number) => { on.push(n) }) as any)
  vi.spyOn(midiStore, 'sendNoteOff').mockImplementation(((n: number) => { off.push(n) }) as any)
  vi.spyOn(midiStore, 'sendCC').mockImplementation((() => {}) as any)
  vi.spyOn(midiStore, 'allNotesOff').mockImplementation((() => {}) as any)
  const store = useChordProgStore()
  store.assignChordToStep(0, 'C', [60, 64, 67])
  store.assignChordToStep(1, 'F', [65, 69, 72])
  store.setStep(0, { active: true, velocity: 100, stepMode: 'chord' })
  store.setStep(1, { active: true, velocity: 100, stepMode: 'chord' })
  const engine = useChordProgEngine()
  return { engine, store, on, off }
}

describe('Chord Prog engine — chords clicked', () => {
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers() })
  afterEach(() => { _resetChordProgEngine(); vi.useRealTimers(); vi.restoreAllMocks() })

  it('a second click on the playing chord stops it: a note-off for each of its notes', () => {
    const { engine, on, off } = setup()
    engine.triggerChordStep(0)
    expect(on.sort()).toEqual([60, 64, 67])
    engine.triggerChordStep(0)
    vi.advanceTimersByTime(1000) // the stop's fade (panic delay)
    expect(off.filter(n => [60, 64, 67].includes(n)).sort()).toEqual([60, 64, 67])
  })

  it('a chord clicked while a stop still fades out is not cut by that stop', () => {
    const { engine, on, off } = setup()
    engine.triggerChordStep(0)
    engine.triggerChordStep(0)   // stop, fading
    vi.advanceTimersByTime(50)
    engine.triggerChordStep(1)   // F, during the fade
    vi.advanceTimersByTime(1000)
    expect(on).toContain(65)
    expect(off.filter(n => [65, 69, 72].includes(n))).toEqual([])
  })

  it('Bass: Live (M4L) is in its outputs while SY.CORE Link is connected, and the bass goes there', () => {
    const { engine } = setup()
    const midiStore = useMidiStore()
    const sent: number[][] = []
    midiStore.registerPanelOutput('Live (M4L)', (data) => { sent.push(data) }, undefined, { bridge: true })
    expect(engine.midiOutputs.value.map((o: { name: string }) => o.name)).toContain('Live (M4L)')
    engine.bassEnabled.value = true
    engine.bassDevice.value = 'Live (M4L)'
    engine.bassChannel.value = 3
    engine.triggerChordStep(0)
    expect(sent.some(d => d[0] === 0x92 && d[2] > 0)).toBe(true) // a note-on on channel 3
    midiService.unregisterVirtualOutput('Live (M4L)')
  })

  it('works with no panel at all (no component mounted)', () => {
    const { engine, store, on } = setup()
    expect(store.isPlaying).toBe(false)
    engine.triggerChordStep(1)
    expect(on.sort()).toEqual([65, 69, 72])
  })
})
