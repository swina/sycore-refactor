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
import { MidiSource } from '@/types/midi'

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

  it('Generate, Rhythm Weighted at Sync 0: the bar\'s 1 and the beats; Euclid: evenly spread; the style sets Density and octaves', async () => {
    const { engine } = setup()
    engine.chordsEnabled.value = false
    engine.selectedStyle.value = 'Techno'
    await flush()
    expect(engine.genDensity.value).toBe(65)          // Techno's density
    expect(engine.selectedOctave.value).toBe(2)       // Techno's octaves [2, 3]
    expect(engine.octaveRange.value).toBe(1)
    engine.numSteps.value = 16
    engine.genDensity.value = 25
    engine.rhythmMode.value = 'weighted'
    engine.syncopation.value = 0
    let onBeats = 0
    for (let i = 0; i < 20; i++) {
      engine.generateSequence()
      const act = engine.steps.value.map((st: any, j: number) => (st.active ? j : -1)).filter((j: number) => j >= 0)
      expect(act).toHaveLength(4)
      expect(act).toContain(0)
      onBeats += act.filter((j: number) => j % 4 === 0).length
    }
    expect(onBeats / 80).toBeGreaterThan(0.75)
    engine.rhythmMode.value = 'euclid'
    engine.euclidRotation.value = 0
    engine.generateSequence()
    expect(engine.steps.value.map((st: any) => (st.active ? 1 : 0))).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0])
  })
  it('Generate with Vary 25 keeps most of the pattern; the Rig\'s Mutate too; Vary 100 replaces it', async () => {
    const { engine } = setup()
    engine.chordsEnabled.value = false
    engine.numSteps.value = 16
    engine.genDensity.value = 75
    engine.varyAmount.value = 100
    engine.generateSequence()
    const sig = () => engine.steps.value.map((st: any) => `${st.active ? 1 : 0}:${st.notes.join('.')}:${st.velocity}`)
    let kept = 0
    for (let i = 0; i < 10; i++) {
      const before = sig()
      engine.varyAmount.value = 25
      engine.generateSequence()
      kept += sig().filter((x: string, j: number) => x === before[j]).length
    }
    expect(kept / 160).toBeGreaterThan(0.6)
    // the Rig's Shift + GEN (Mutate) at Vary 100: a quarter
    engine.varyAmount.value = 100
    const before = sig()
    window.dispatchEvent(new CustomEvent('seq-generate', { detail: { mutate: true } }))
    await flush()
    expect(sig().filter((x: string, j: number) => x === before[j]).length).toBeGreaterThan(8)
    // MIDI Learn seq_vary: 0–127 → 0–100
    window.dispatchEvent(new CustomEvent('seq-vary-set', { detail: { value: 127 } }))
    expect(engine.varyAmount.value).toBe(100)
  })
  it('Arpeggio: the tonic chord by default (C major: C E G only), the scale as an option', async () => {
    const { engine } = setup()
    engine.selectedKey.value = 'C'
    engine.selectedScale.value = 'Major'
    engine.selectedStyle.value = 'Arpeggio'
    engine.numSteps.value = 16
    engine.varyAmount.value = 100
    engine.arpNotes.value = 'chord'
    engine.generateSequence()
    const pcs = new Set(engine.steps.value.flatMap((st: any) => st.notes.map((n: number) => n % 12)))
    expect([...pcs].every(pc => [0, 4, 7].includes(pc as number))).toBe(true)
    engine.arpNotes.value = 'scale'
    engine.generateSequence()
    const pcs2 = new Set(engine.steps.value.flatMap((st: any) => st.notes.map((n: number) => n % 12)))
    expect(pcs2.size).toBeGreaterThan(3)
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

  it('a note from a routed input transposes the playing pattern with its panel closed (Follow: Chromatic)', async () => {
    const { engine } = setup()
    useUiStore().seqFollowMode = 'chromatic'
    window.dispatchEvent(new CustomEvent('toggle-sequencer2', { detail: { play: true } }))
    await flush()
    const midiStore = useMidiStore()
    vi.spyOn(midiStore, 'hasExplicitInputRouting').mockReturnValue(true as any)
    vi.spyOn(midiStore, 'isDeviceRoutedToApp').mockReturnValue(true as any)
    window.dispatchEvent(new CustomEvent('virtual-midi-note', { detail: { type: 'on', note: 62, velocity: 100, chan: 1 } }))
    // virtual notes carry no input / app: allowed (no device gate)
    expect(engine.dynamicMidiTranspose.value).toBe(2) // root 60 → 62
  })
  it('Follow: Degree (default) — a note moves the pattern by scale degrees, the semitone transpose stays 0', async () => {
    const { engine } = setup()
    useUiStore().seqFollowMode = 'degree'
    engine.selectedKey.value = 'C'
    engine.selectedScale.value = 'Major'
    window.dispatchEvent(new CustomEvent('toggle-sequencer2', { detail: { play: true } }))
    await flush()
    window.dispatchEvent(new CustomEvent('virtual-midi-note', { detail: { type: 'on', note: 62, velocity: 100, chan: 1 } }))
    expect(engine.dynamicMidiTranspose.value).toBe(0)
    expect(engine.dynamicDegreeShift.value).toBe(1) // D: one degree up
    window.dispatchEvent(new CustomEvent('virtual-midi-note', { detail: { type: 'on', note: 57, velocity: 100, chan: 1 } }))
    expect(engine.dynamicDegreeShift.value).toBe(-2) // A: two degrees down (the nearest way)
  })
  it("Follow: Degree — the Chord Prog's chord moves it by its root from the name, not by each note of the voicing", async () => {
    const { engine } = setup()
    useUiStore().seqFollowMode = 'degree'
    engine.selectedKey.value = 'C'
    engine.selectedScale.value = 'Major'
    const midiStore = useMidiStore()
    vi.spyOn(midiStore, 'hasExplicitInputRouting').mockReturnValue(true as any)
    vi.spyOn(midiStore, 'isDeviceRoutedToApp').mockReturnValue(true as any)
    window.dispatchEvent(new CustomEvent('toggle-sequencer2', { detail: { play: true } }))
    await flush()
    ;(midiStore.sendNoteOn as any).mockRestore()
    // Dm in first inversion (F A D): the root is D, whatever note comes last
    window.dispatchEvent(new CustomEvent('cp-chord-on', { detail: { rootPc: 2, name: 'Dm' } }))
    for (const n of [65, 69, 74]) midiStore.sendNoteOn(n, 100, 1, MidiSource.CHORD_PROG)
    await flush()
    expect(engine.dynamicDegreeShift.value).toBe(1)
    expect(engine.dynamicMidiTranspose.value).toBe(0)
  })
  it("auto-started by the Chord Prog's chord: the chord's stop stops it; started by Play, it plays on", async () => {
    const { engine } = setup()
    useUiStore().seqFollowMode = 'chromatic'
    const midiStore = useMidiStore()
    vi.spyOn(midiStore, 'hasExplicitInputRouting').mockReturnValue(true as any)
    vi.spyOn(midiStore, 'isDeviceRoutedToApp').mockReturnValue(true as any)
    useUiStore().seqAutoStart = true
    ;(midiStore.sendNoteOn as any).mockRestore() // the Chord Prog's real note: it reaches the app listeners
    midiStore.sendNoteOn(57, 100, 1, MidiSource.CHORD_PROG)
    await flush()
    expect(engine.isPlaying.value).toBe(true)
    expect(engine.dynamicMidiTranspose.value).toBe(-3) // root 60 → A 57
    window.dispatchEvent(new CustomEvent('cp-chord-release'))
    await flush()
    expect(engine.isPlaying.value).toBe(false)
    // started by Play (not by the chords): a chord's stop leaves it playing
    window.dispatchEvent(new CustomEvent('toggle-sequencer2', { detail: { play: true } }))
    await flush()
    window.dispatchEvent(new CustomEvent('cp-chord-release'))
    await flush()
    expect(engine.isPlaying.value).toBe(true)
  })

  it('stopped by the user (its Rig pad, its Stop): the chords no longer start it, until the user does', async () => {
    const { engine } = setup()
    useUiStore().seqFollowMode = 'chromatic'
    const midiStore = useMidiStore()
    vi.spyOn(midiStore, 'hasExplicitInputRouting').mockReturnValue(true as any)
    vi.spyOn(midiStore, 'isDeviceRoutedToApp').mockReturnValue(true as any)
    useUiStore().seqAutoStart = true
    ;(midiStore.sendNoteOn as any).mockRestore()
    midiStore.sendNoteOn(57, 100, 1, MidiSource.CHORD_PROG)
    await flush()
    expect(engine.isPlaying.value).toBe(true)
    // the Rig pad's Stop
    window.dispatchEvent(new CustomEvent('toggle-sequencer2', { detail: { play: false, sync: 0, user: true } }))
    await flush()
    expect(engine.isPlaying.value).toBe(false)
    midiStore.sendNoteOn(60, 100, 1, MidiSource.CHORD_PROG)
    await flush()
    expect(engine.isPlaying.value).toBe(false) // held off
    // the user starts it: it follows the chords again (transposed)
    window.dispatchEvent(new CustomEvent('toggle-sequencer2', { detail: { play: true, sync: 0 } }))
    await flush()
    midiStore.sendNoteOn(62, 100, 1, MidiSource.CHORD_PROG)
    await flush()
    expect(engine.dynamicMidiTranspose.value).toBe(2)
    // the panel's Stop holds it off too; Stop All does not
    engine.userTogglePlay()
    await flush()
    midiStore.sendNoteOn(57, 100, 1, MidiSource.CHORD_PROG)
    await flush()
    expect(engine.isPlaying.value).toBe(false)
    engine.userTogglePlay()
    await flush()
    window.dispatchEvent(new CustomEvent('toggle-sequencer2', { detail: { play: false } }))
    await flush()
    midiStore.sendNoteOn(57, 100, 1, MidiSource.CHORD_PROG)
    await flush()
    expect(engine.isPlaying.value).toBe(true)
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
