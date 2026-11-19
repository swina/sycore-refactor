import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Tone.js without an AudioContext: a transport whose repeats we fire by hand.
const repeats: Array<(time: number) => void> = []
const starts: Array<string | undefined> = [] // each repeat's start position (undefined: now)
vi.mock('tone', () => {
  const transport = {
    bpm: { value: 120 }, swing: 0, swingSubdivision: '16n', ticks: 0, position: '0:0:0',
    scheduleRepeat: (cb: (t: number) => void, _i: string, at?: string) => { repeats.push(cb); starts.push(at); return repeats.length },
    clear: () => {}, toTicks: () => 48, nextSubdivision: () => 0, start: () => {}, stop: () => {}, pause: () => {}, cancel: () => {}, state: 'stopped',
  }
  return { getTransport: () => transport, start: () => Promise.resolve(), getContext: () => ({ currentTime: 0 }) }
})

import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useSequencerEngine, _resetSequencerEngine } from '@/core/engines/sequencer'
import { useMidiStore } from '@/stores/useMidiStore'
import { useSeqLaneStore, useStepSequencerStore } from '@/stores/useStepSequencerStore'
import { MidiSource } from '@/types/midi'
import { rigReports } from '@/lib/rig-live'
import { seqLanePlaying, seqLaneQueued, parseLaneLearn, laneEvent } from '@/lib/seq-lanes'
import { rigLaneRows } from '@/lib/rig-live'
import { rigDensity } from '@/lib/rig-density'
import { applyParamValue } from '@/composables/useMidiCCListener'
import { useTransportManager } from '@/composables/useTransportManager'
import { useGlobalTransportControls } from '@/composables/useGlobalTransportControls'

type Sent = { note: number; ch: number | null; src: string; opts: any }
function setup() {
  setActivePinia(createPinia())
  const midiStore = useMidiStore()
  const on: Sent[] = []
  vi.spyOn(midiStore, 'sendNoteOn').mockImplementation(((note: number, _v: number, ch: number | null, src: string, _s: any, _at: any, opts: any) => { on.push({ note, ch, src, opts }) }) as any)
  vi.spyOn(midiStore, 'sendNoteOff').mockImplementation((() => {}) as any)
  vi.spyOn(midiStore, 'sendCC').mockImplementation((() => {}) as any)
  vi.spyOn(midiStore, 'allNotesOff').mockImplementation((() => {}) as any)
  const main = useSequencerEngine()
  main.systemClock.value = false
  const bass = useSequencerEngine('bass')
  const oneNote = (e: any, n: number) => { e.steps.value = e.steps.value.map((s: any, i: number) => ({ ...s, active: i === 0, notes: [n], gate: 50, probability: 100 })) }
  oneNote(main, 72)
  oneNote(bass, 36)
  return { midiStore, main, bass, on }
}
// applyParamValue's stores, stubbed (the real LFO store needs Tone's Signal)
const stubs = () => ({ lfoStore: {}, mappingStore: {}, uiStore: {}, presetStore: {}, midiStore: {}, arpStore: {}, noteLatchStore: {}, drumStore: {}, cpStore: {}, mixerStore: {}, configStore: {} })
const flush = async () => { await nextTick(); await Promise.resolve(); await Promise.resolve() }

describe('Sequencer lanes (Main / Bass / Arp)', () => {
  beforeEach(() => { localStorage.clear(); repeats.length = 0; starts.length = 0; vi.useFakeTimers() })
  afterEach(() => { _resetSequencerEngine(); vi.useRealTimers(); vi.restoreAllMocks() })

  it('each lane is its own engine and banks store; Main keeps its ids', async () => {
    const { main, bass } = setup()
    expect(main).toBe(useSequencerEngine('main'))
    expect(bass).not.toBe(main)
    expect(main.lane).toBe('main')
    expect(bass.lane).toBe('bass')
    expect(useSeqLaneStore('main')).toBe(useStepSequencerStore())
    expect(useSeqLaneStore('bass').$id).toBe('stepSequencer-bass')
    // independent patterns and banks
    expect(main.steps.value[0].notes).toEqual([72])
    expect(bass.steps.value[0].notes).toEqual([36])
    bass.selectBank(2)
    expect(useSeqLaneStore('bass').activeBankIndex).toBe(2)
    expect(useStepSequencerStore().activeBankIndex).toBe(0)
    expect(main.steps.value[0].notes).toEqual([72])
    // a new lane's banks: its own defaults
    expect(useSeqLaneStore('bass').banks[0].selectedOctave).toBe(2)
    expect(useSeqLaneStore('arp').banks[0].selectedStyle).toBe('Arpeggio')
    // one clock for every lane
    main.systemClock.value = true
    expect(bass.systemClock.value).toBe(true)
  })

  it('a lane plays on its own event, source and channel; Main stays on the global channel', async () => {
    const { main, bass, on } = setup()
    bass.laneChannel.value = 3
    window.dispatchEvent(new CustomEvent('toggle-seq-bass', { detail: { play: true } }))
    await flush()
    expect(bass.isPlaying.value).toBe(true)
    expect(main.isPlaying.value).toBe(false)
    expect(seqLanePlaying.bass).toBe(true)
    expect(rigReports.seqPlaying).toBe(false) // the Rig's Seq row: Main's
    expect(repeats.length).toBe(1)
    repeats[0](0)
    expect(on).toEqual([{ note: 36, ch: 3, src: MidiSource.SEQ_BASS, opts: { exactChannel: true } }])

    on.length = 0
    window.dispatchEvent(new CustomEvent('toggle-sequencer2', { detail: { play: true } }))
    await flush()
    repeats[1](0)
    expect(on).toEqual([{ note: 72, ch: useMidiStore().midiChannel, src: MidiSource.SEQUENCER2, opts: undefined }])
    expect(rigReports.seqPlaying).toBe(true)
  })

  it('the channel is saved per lane (0–16), with the lane\'s keys', async () => {
    const { bass } = setup()
    bass.laneChannel.value = 20
    await flush()
    expect(bass.laneChannel.value).toBe(16)
    expect(useStepSequencerStore().midiChannel).toBe(0)
    _resetSequencerEngine()
    setActivePinia(createPinia())
    expect(useSeqLaneStore('bass').midiChannel).toBe(16)
    expect(useSeqLaneStore('arp').midiChannel).toBe(0)
  })

  it('lane events and MIDI Learn names: seq-bass-… / seqbass_…', async () => {
    const { main, bass } = setup()
    expect(laneEvent('bass', 'bank-select')).toBe('seq-bass-bank-select')
    expect(parseLaneLearn('seqarp_bank_3')).toEqual({ lane: 'arp', rest: 'bank_3' })
    expect(parseLaneLearn('seq_play')).toEqual({ lane: 'main', rest: 'play' })
    window.dispatchEvent(new CustomEvent('seq-bass-bank-select', { detail: { idx: 4 } }))
    expect(useSeqLaneStore('bass').activeBankIndex).toBe(4)
    expect(useStepSequencerStore().activeBankIndex).toBe(0)
    applyParamValue('seqbass_steps', 127, false, stubs())
    expect(bass.numSteps.value).toBe(64)
    expect(main.numSteps.value).toBe(16)
    applyParamValue('seqbass_play', 127, false, stubs())
    await flush()
    expect(bass.isPlaying.value).toBe(true)
    expect(main.isPlaying.value).toBe(false)
  })

  it('Bass styles generate on the lane; the Arp mode is saved with the bank', async () => {
    const { bass } = setup()
    bass.selectedStyle.value = 'Offbeat'
    await flush()
    expect(bass.selectedOctave.value).toBe(2)
    bass.selectedKey.value = 'A'
    bass.selectedScale.value = 'Minor'
    bass.numSteps.value = 16
    bass.generateSequence()
    const act = bass.steps.value.map((st: any, j: number) => (st.active ? j : -1)).filter((j: number) => j >= 0)
    expect(act).toEqual(expect.arrayContaining([2, 6, 10, 14]))
    expect(bass.steps.value[2].notes[0] % 12).toBe(9)
    bass.arpModeForGen.value = 'down'
    await flush()
    bass.selectBank(1)
    expect(bass.arpModeForGen.value).toBe('up')
    bass.selectBank(0)
    expect(bass.arpModeForGen.value).toBe('down')
  })

  it('the Rig on the Bass lane: its Density thins it, its queued bank is reported; off its lane, no Density', async () => {
    const { bass, on } = setup()
    bass.steps.value = bass.steps.value.map((st: any) => ({ ...st, active: true, notes: [36], gate: 50, probability: 100 }))
    rigLaneRows.bass = true
    Object.assign(rigDensity, { active: true, bass: 0 })
    window.dispatchEvent(new CustomEvent('toggle-seq-bass', { detail: { play: true } }))
    await flush()
    for (let i = 0; i < 16; i++) repeats[0](0)
    expect(on.length).toBe(1) // Density 0: the downbeat only
    on.length = 0
    rigLaneRows.bass = false
    for (let i = 0; i < 16; i++) repeats[0](0)
    expect(on.length).toBe(16)
    window.dispatchEvent(new CustomEvent('seq-bass-bank-cue', { detail: { idx: 3 } }))
    expect(seqLaneQueued.bass).toBe(3)
    repeats[0](0) // the pattern's end: bank D starts
    expect(seqLaneQueued.bass).toBeNull()
    Object.assign(rigDensity, { active: false, bass: 127 })
    rigLaneRows.bass = true
  })

  it('SYNC: on (default) a start waits for the transport\'s next bar, off it starts now; Play All in phase', async () => {
    const { bass } = setup()
    const tm = useTransportManager()
    tm.acquireTransport() // another app playing: the transport runs
    expect(bass.laneSync.value).toBe(true)
    window.dispatchEvent(new CustomEvent('toggle-seq-bass', { detail: { play: true } }))
    await flush()
    expect(starts.at(-1)).toBeDefined() // the next bar
    expect(bass.startPending.value).toBe(true)
    repeats.at(-1)!(0)
    expect(bass.startPending.value).toBe(false)
    window.dispatchEvent(new CustomEvent('toggle-seq-bass', { detail: { play: false } }))
    await flush()
    bass.laneSync.value = false
    window.dispatchEvent(new CustomEvent('toggle-seq-bass', { detail: { play: true } }))
    await flush()
    expect(starts.at(-1)).toBeUndefined() // now
    tm.forceStopAll()
    setActivePinia(createPinia()) // saved per lane
    expect(useSeqLaneStore('bass').syncStart).toBe(false)
    expect(useSeqLaneStore('arp').syncStart).toBe(true)
  })

  it('Stop All stops the Bass and Arp lanes too', async () => {
    const { bass } = setup()
    const arp = useSequencerEngine('arp')
    window.dispatchEvent(new CustomEvent('toggle-seq-bass', { detail: { play: true } }))
    window.dispatchEvent(new CustomEvent('toggle-seq-arp', { detail: { play: true } }))
    await flush()
    expect(bass.isPlaying.value && arp.isPlaying.value).toBe(true)
    useGlobalTransportControls().stopAll()
    await flush()
    expect(bass.isPlaying.value).toBe(false)
    expect(arp.isPlaying.value).toBe(false)
  })

  it('an empty bank queued while playing: GEN fills it, the bank playing stays as it is', async () => {
    const { bass } = setup()
    const store = useSeqLaneStore('bass')
    bass.laneSync.value = false
    window.dispatchEvent(new CustomEvent('toggle-seq-bass', { detail: { play: true } }))
    await flush()
    const playing = JSON.stringify(bass.steps.value)
    window.dispatchEvent(new CustomEvent('seq-bass-bank-cue', { detail: { idx: 2 } }))
    expect(seqLaneQueued.bass).toBe(2)
    expect(store.banks[2].steps.some((st: any) => st.active)).toBe(false)
    bass.selectedStyle.value = 'Offbeat' // bank A's style (the working copy)
    window.dispatchEvent(new CustomEvent('seq-bass-generate', { detail: {} }))
    await flush()
    expect(store.banks[2].steps.some((st: any) => st.active)).toBe(true)
    expect(store.banks[2].selectedStyle).toBe('Offbeat') // the playing bank's settings
    expect(store.banks[2].steps[2].active).toBe(true)  // Offbeat: on the "and"
    expect(store.activeBankIndex).toBe(0)
    expect(JSON.stringify(bass.steps.value)).toBe(playing)
    expect(seqLaneQueued.bass).toBe(2)
  })
})
