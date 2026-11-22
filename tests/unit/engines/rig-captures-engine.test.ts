import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('tone', () => {
  const transport = { bpm: { value: 120 }, ticks: 0, PPQ: 192, nextSubdivision: () => 0, start: () => {}, stop: () => {}, state: 'stopped' }
  return { getTransport: () => transport, getContext: () => ({ currentTime: 0 }) }
})
let ticker: (() => void) | null = null
vi.mock('@/core/midi/step-scheduler', async (orig) => {
  const m: any = await orig()
  return { ...m, createWorkerTicker: (fn: () => void) => { ticker = fn; return () => { ticker = null } } }
})

import { createPinia, setActivePinia } from 'pinia'
import { useRigCaptures, _resetRigCaptures, stopRigCaptures } from '@/core/engines/rig-captures'
import { midiService } from '@/core/midi/midi-service'
import { externalGrid } from '@/core/midi/external-grid'
import { useMidiStore } from '@/stores/useMidiStore'
import { useArpStore } from '@/stores/useArpStore'
import { useSessionTakesStore } from '@/stores/useSessionTakesStore'

let now = 0
type NoteCb = (type: 'on' | 'off', note: number, velocity: number, chan: number, inputId?: string) => void
function setup() {
  setActivePinia(createPinia())
  useArpStore().arpBpm = 120 // a 16th = 125 ms
  const midiStore = useMidiStore()
  const on: Array<[number, number]> = []
  const sources: string[] = []
  vi.spyOn(midiStore, 'sendNoteOn').mockImplementation(((n: number, _v: number, ch: number, src: string) => { on.push([n, ch]); sources.push(src) }) as any)
  vi.spyOn(midiStore, 'sendNoteOff').mockImplementation((() => {}) as any)
  let input: NoteCb | null = null
  vi.spyOn(midiService, 'addNoteListener').mockImplementation(((cb: NoteCb) => { input = cb; return () => { input = null } }) as any)
  const eng = useRigCaptures()
  return { eng, on, sources, midiStore, play: (type: 'on' | 'off', note: number, chan = 0, inputId?: string) => input?.(type, note, 100, chan, inputId) }
}

describe('Rig captures engine', () => {
  beforeEach(() => {
    localStorage.clear(); now = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
  })
  afterEach(() => { externalGrid.emit({ type: 'stop' }); _resetRigCaptures(); vi.restoreAllMocks() })

  it('Capt records a phrase into the first empty pad; its pad loops it from the bar', () => {
    const { eng, on, play } = setup()
    eng.toggleRecording()
    expect(eng.state.recording).toBe(true)
    play('on', 60, 1); now = 1100; play('off', 60, 1)   // step 0, played on channel 2 (goes out on 1: the cable's OUT ch remaps it)
    now = 1260; play('on', 64, 1); now = 1400; play('off', 64, 1) // 2.08 → step 2
    now = 3000                                           // a bar later (16 × 125 ms)
    const msg = eng.toggleRecording()
    expect(msg).toMatch(/S1: 1 bar · 2 notes/)
    expect(eng.state.clips[0]!.notes.map(n => [n.step, n.pitch, n.channel])).toEqual([[0, 60, 2], [2, 64, 2]])

    // nothing playing: the pad waits for Play, then starts on its 1 (200 ms lookahead)
    eng.toggleSlot(0)
    expect(eng.state.play[0]).toBe('queued')
    expect(on).toEqual([])
    externalGrid.emit({ type: 'start', sixteenth: 0, t: now, bpm: 120 })
    expect(eng.state.play[0]).toBe('playing')
    expect(on).toEqual([[60, 1]])
    now += 250; ticker!() // step 2 within the lookahead
    expect(on).toEqual([[60, 1], [64, 1]])
    // a second press: ends at the bar line
    eng.toggleSlot(0)
    expect(eng.state.play[0]).toBe('stopping')
    now += 2000; ticker!()
    expect(eng.state.play[0]).toBe('idle')
  })

  it('the pad picked gets the capture; Live\'s Stop stops the clips', () => {
    const { eng, play } = setup()
    eng.select(4)
    eng.toggleRecording(); play('on', 62); now = 1200; play('off', 62); now = 3000
    expect(eng.toggleRecording()).toMatch(/S5/)
    expect(eng.state.clips[4]).not.toBeNull()
    expect(eng.state.selected).toBeNull()
    eng.toggleSlot(4)
    expect(eng.state.play[4]).toBe('queued')
    externalGrid.emit({ type: 'start', sixteenth: 0, t: now, bpm: 120 })
    expect(eng.state.play[4]).toBe('playing')
    externalGrid.emit({ type: 'stop' })
    expect(eng.state.play[4]).toBe('idle')
    eng.clear(4)
    expect(eng.state.clips[4]).toBeNull()
  })

  it('a Stop All stops the clips even with Live\'s grid left active (clock source changed without a Stop)', () => {
    const { eng, play } = setup()
    eng.toggleRecording(); play('on', 60); now = 1200; play('off', 60); now = 3000
    eng.toggleRecording()
    externalGrid.emit({ type: 'start', sixteenth: 0, t: now, bpm: 120 })
    eng.toggleSlot(0)
    ticker?.(); now += 2100; ticker?.()
    expect(eng.state.play[0]).toBe('playing')
    stopRigCaptures() // useGlobalTransportControls.stopAll
    expect(eng.state.play[0]).toBe('idle')
    expect(eng.state.clips[0]).not.toBeNull()
  })

  it('Live Perf IN cabled: only those inputs recorded; clips go out as Live Perf', () => {
    const { eng, on, sources, midiStore, play } = setup()
    midiStore.inputRouting = { KB: [{ app: 'LIVE_PERF' }], Pads: [{ app: 'SEQUENCER2' }] } as any
    vi.spyOn(midiService, 'getInputs').mockReturnValue([{ id: 'kb', name: 'KB' }, { id: 'pads', name: 'Pads' }] as any)
    eng.toggleRecording()
    play('on', 60, 0, 'kb'); play('on', 36, 0, 'pads')
    now = 1200; play('off', 60, 0, 'kb'); play('off', 36, 0, 'pads')
    now = 3000; eng.toggleRecording()
    expect(eng.state.clips[0]!.notes.map(n => n.pitch)).toEqual([60])
    eng.toggleSlot(0)
    externalGrid.emit({ type: 'start', sixteenth: 0, t: now, bpm: 120 })
    expect(on).toEqual([[60, 1]])
    expect(sources).toEqual(['LIVE_PERF'])
  })

  it('Live playing: a pad starts on the next bar; while recording a full pad is recorded over, the old clip kept as a take', () => {
    const { eng, play } = setup()
    eng.toggleRecording(); play('on', 60); now = 1200; play('off', 60); now = 3000; eng.toggleRecording()
    externalGrid.emit({ type: 'start', sixteenth: 0, t: now, bpm: 120 })
    eng.toggleSlot(0)
    expect(eng.state.play[0]).not.toBe('idle')
    // record over S1
    eng.toggleRecording()
    eng.select(0)
    play('on', 67); now += 200; play('off', 67); now += 2000
    expect(eng.toggleRecording()).toMatch(/S1 \(recorded over/)
    expect(eng.state.clips[0]!.notes.map(n => n.pitch)).toEqual([67])
    expect(eng.state.play[0]).toBe('idle')
    const takes = useSessionTakesStore().takes.filter(t => t.app === 'capt' && t.target === 0)
    expect(takes.map(t => (t.data as any).notes[0].pitch)).toEqual([60, 67])
    // Shift + pad: cleared, the clip kept as a take
    eng.clear(0)
    expect(eng.state.clips[0]).toBeNull()
    expect((useSessionTakesStore().lastFor('capt', 0)!.data as any).notes[0].pitch).toBe(67)
  })

  it('named sets: saved and loaded back onto the pads', async () => {
    const { eng, play } = setup()
    eng.toggleRecording(); play('on', 60); now = 1200; play('off', 60); now = 3000; eng.toggleRecording()
    await eng.setsReady
    expect(await eng.saveSet('Jam')).toMatch(/saved/)
    eng.clear(0)
    expect(eng.loadSet('Jam')).toMatch(/loaded/)
    expect(eng.state.clips[0]!.notes[0].pitch).toBe(60)
    expect(eng.state.sets.map(s => s.name)).toEqual(['Jam'])
    await eng.deleteSet('Jam')
    expect(eng.state.sets).toEqual([])
  })

  it('no notes: nothing stored', () => {
    const { eng } = setup()
    eng.toggleRecording(); now = 3000
    expect(eng.toggleRecording()).toMatch(/no notes/)
    expect(eng.state.clips.every(c => !c)).toBe(true)
  })
})

describe('Rig captures engine — out through MIDI Flow', () => {
  beforeEach(() => { localStorage.clear(); now = 1000; vi.spyOn(performance, 'now').mockImplementation(() => now) })
  afterEach(() => { externalGrid.emit({ type: 'stop' }); _resetRigCaptures(); vi.restoreAllMocks(); (midiService as any).midiAccess = null; (midiService as any).routingConfig = null; midiService.setRouting('LIVE_PERF', []) })

  it('a clip reaches the device cabled from Live Perf, on the cable OUT ch, note-off after its length', () => {
    setActivePinia(createPinia())
    useArpStore().arpBpm = 120
    const sent: Array<[number[], number | undefined]> = []
    const emu = { id: 'emu', name: 'Emu', send: (m: number[], at?: number) => sent.push([m, at]) }
    ;(midiService as any).midiAccess = { outputs: new Map([['emu', emu]]), inputs: new Map() }
    ;(midiService as any).routingConfig = { registrations: { Emu: { name: 'Emu', outEnabled: true, inEnabled: true, notes: true, outChannel: 7, outChannels: [] } } }
    midiService.setRouting('LIVE_PERF', ['Emu'])
    let input: any = null
    vi.spyOn(midiService, 'addNoteListener').mockImplementation(((cb: any) => { input = cb; return () => {} }) as any)
    const eng = useRigCaptures()
    // after the stores (the MIDI store pushes its own routing config to the service when created)
    ;(midiService as any).routingConfig = { registrations: { Emu: { name: 'Emu', outEnabled: true, inEnabled: true, notes: true, outChannel: 7, outChannels: [] } } }
    eng.toggleRecording()
    input('on', 60, 100, 0); now = 1250; input('off', 60, 0, 0) // 2 sixteenths long
    now = 3000; eng.toggleRecording()
    eng.toggleSlot(0)
    externalGrid.emit({ type: 'start', sixteenth: 0, t: now + 20, bpm: 120 })
    expect(sent.map(([m]) => m)).toEqual([[0x97, 60, 100], [0x87, 60, 0]]) // ch 8 (device OUT ch 7, 0-based)
    const [onAt, offAt] = sent.map(([, at]) => at!)
    expect(offAt - onAt).toBeGreaterThan(200) // 2 × 125 ms (×0.98)
  })
})
