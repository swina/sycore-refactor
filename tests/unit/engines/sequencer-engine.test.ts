import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Tone.js without an AudioContext: a transport whose repeat we fire by hand.
const repeats: Array<(time: number) => void> = []
vi.mock('tone', () => {
  const transport = {
    bpm: { value: 120 }, swing: 0, swingSubdivision: '16n', ticks: 0, position: '0:0:0',
    scheduleRepeat: (cb: (t: number) => void) => { repeats.push(cb); return repeats.length },
    clear: () => {}, toTicks: () => 48, nextSubdivision: () => 0, start: () => {}, stop: () => {}, pause: () => {}, cancel: () => {}, state: 'stopped',
  }
  return { getTransport: () => transport, start: () => Promise.resolve(), getContext: () => ({ currentTime: 0 }) }
})

// CLK SYS: the Worker ticker replaced by a function the test calls.
let ticker: (() => void) | null = null
vi.mock('@/core/midi/step-scheduler', async (orig) => {
  const m: any = await orig()
  return { ...m, createWorkerTicker: (fn: () => void) => { ticker = fn; return () => { ticker = null } } }
})

import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useSequencerEngine, _resetSequencerEngine } from '@/core/engines/sequencer'
import { useMidiStore } from '@/stores/useMidiStore'
import { useStepSequencerStore } from '@/stores/useStepSequencerStore'
import { useUiStore } from '@/stores/useUiStore'

// The Sequencer's playback without its panel (Scenario Workspaces, Phase 1).
function setup() {
  setActivePinia(createPinia())
  const midiStore = useMidiStore()
  const on: number[] = []
  const off: number[] = []
  vi.spyOn(midiStore, 'sendNoteOn').mockImplementation(((n: number) => { on.push(n) }) as any)
  vi.spyOn(midiStore, 'sendNoteOff').mockImplementation(((n: number) => { off.push(n) }) as any)
  vi.spyOn(midiStore, 'sendCC').mockImplementation((() => {}) as any)
  vi.spyOn(midiStore, 'allNotesOff').mockImplementation((() => {}) as any)
  const engine = useSequencerEngine()
  engine.systemClock.value = false // the Tone.js repeat (mocked above)
  engine.steps.value = engine.steps.value.map((s: any, i: number) => ({ ...s, active: i === 0, notes: [60, 64], gate: 400, probability: 100 }))
  return { engine, on, off }
}
const flush = async () => { await nextTick(); await Promise.resolve(); await Promise.resolve() }

describe('Sequencer engine — no panel mounted', () => {
  beforeEach(() => { localStorage.clear(); repeats.length = 0; vi.useFakeTimers() })
  afterEach(() => { _resetSequencerEngine(); vi.useRealTimers(); vi.restoreAllMocks() })

  it('plays from a Play All / Rig event with its panel closed, and a stop ends every note it started', async () => {
    const { engine, on, off } = setup()
    expect(useUiStore().isSequencer2Open).toBe(false)
    window.dispatchEvent(new CustomEvent('toggle-sequencer2', { detail: { play: true } }))
    await flush()
    expect(engine.isPlaying.value).toBe(true)
    expect(repeats.length).toBe(1)
    repeats[0](0) // step 1: C + E, held (gate 400%)
    expect(on.sort()).toEqual([60, 64])
    window.dispatchEvent(new CustomEvent('toggle-sequencer2', { detail: { play: false } }))
    await flush()
    expect(engine.isPlaying.value).toBe(false)
    expect(off.sort()).toEqual([60, 64])
  })

  it('selects a bank and generates from the Rig with its panel closed', async () => {
    const { engine } = setup()
    const seqStore = useStepSequencerStore()
    window.dispatchEvent(new CustomEvent('seq-bank-select', { detail: { idx: 2 } }))
    expect(seqStore.activeBankIndex).toBe(2)
    window.dispatchEvent(new CustomEvent('seq-generate', { detail: { root: 9, mode: 'minor' } }))
    expect(engine.selectedKey.value).toBe('A')
    expect(engine.steps.value.some((s: any) => s.active)).toBe(true)
  })

  it('a note from a routed input transposes the playing pattern with its panel closed', async () => {
    const { engine } = setup()
    window.dispatchEvent(new CustomEvent('toggle-sequencer2', { detail: { play: true } }))
    await flush()
    const midiStore = useMidiStore()
    vi.spyOn(midiStore, 'hasExplicitInputRouting').mockReturnValue(true as any)
    vi.spyOn(midiStore, 'isDeviceRoutedToApp').mockReturnValue(true as any)
    window.dispatchEvent(new CustomEvent('virtual-midi-note', { detail: { type: 'on', note: 62, velocity: 100, chan: 1 } }))
    // virtual notes carry no input / app: allowed (no device gate)
    expect(engine.dynamicMidiTranspose.value).toBe(2) // root 60 → 62
  })
  it('CLK SYS: plays on the system clock (a step falls due → its notes go out)', async () => {
    const { engine, on } = setup()
    engine.systemClock.value = true
    let now = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    await flush() // the clock switch's own restart logic settles (not playing: nothing)
    window.dispatchEvent(new CustomEvent('toggle-sequencer2', { detail: { play: true } }))
    for (let i = 0; i < 5; i++) await flush()
    expect(ticker).not.toBeNull()
    now = 1100 // past the start (now + 20 ms)
    ticker!()
    expect(on.sort()).toEqual([60, 64])
  })
})
