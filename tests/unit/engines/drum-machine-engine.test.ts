import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Tone.js without an AudioContext: a transport whose repeat we fire by hand.
const repeats: Array<(time: number) => void> = []
vi.mock('tone', () => {
  const transport = {
    bpm: { value: 120 }, swing: 0, ticks: 0, position: '0:0:0', state: 'stopped',
    scheduleRepeat: (cb: (t: number) => void) => { repeats.push(cb); return repeats.length },
    clear: () => {}, toTicks: () => 48, nextSubdivision: () => 0, start: () => {}, stop: () => {},
  }
  return { getTransport: () => transport, start: () => Promise.resolve(), now: () => 0, getContext: () => ({ currentTime: 0 }) }
})
// The audio engine (samples): recorded, no Web Audio.
const pads: number[] = []
vi.mock('@/lib/drum-engine', () => {
  const noop = () => {}
  return {
    initDrumEngine: noop, loadSample: async () => {}, setDelayTime: noop, setMasterVolume: noop, stopAll: noop,
    triggerPad: (i: number) => { pads.push(i) }, triggerRatchet: (i: number) => { pads.push(i) }, triggerPadWithNote: noop,
    setPadVolume: noop, setPadPan: noop, setPadPitch: noop, setPadFilter: noop, setPadFilterType: noop,
    setPadFilterResonance: noop, setPadAttack: noop, setPadDecay: noop, setPadSustain: noop, setPadRelease: noop,
    setPadReverbSend: noop, setPadDelaySend: noop,
  }
})
vi.mock('@/composables/useFreesoundCache', () => ({
  useFreesoundCache: () => ({ resolveUrl: async () => null, cacheFileBlob: async () => '' }),
}))

// CLK SYS: the Worker ticker replaced by a function the test calls.
let ticker: (() => void) | null = null
vi.mock('@/core/midi/step-scheduler', async (orig) => {
  const m: any = await orig()
  return { ...m, createWorkerTicker: (fn: () => void) => { ticker = fn; return () => { ticker = null } } }
})

import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useDrumMachineEngine, _resetDrumMachineEngine } from '@/core/engines/drum-machine'
import { useDrumMachineStore } from '@/stores/useDrumMachineStore'
import { useUiStore } from '@/stores/useUiStore'
import { flushUi } from '@/lib/ui-clock'
import { rigReports } from '@/lib/rig-live'

const flush = async () => { for (let i = 0; i < 5; i++) { await nextTick(); await Promise.resolve() } }

// The Drum Machine's playback without its panel (Scenario Workspaces, Phase 1).
async function setup() {
  setActivePinia(createPinia())
  const store = useDrumMachineStore()
  store.systemClock = false // the Tone.js repeat (mocked above)
  const engine = useDrumMachineEngine()
  await engine.ready
  // kick (track 0) on step 1 of sequence A
  store.currentPattern[0].steps[0] = { ...store.currentPattern[0].steps[0], active: true, velocity: 100 }
  return { engine, store }
}

describe('Drum Machine engine — no panel mounted', () => {
  beforeEach(() => { localStorage.clear(); repeats.length = 0; pads.length = 0 })
  afterEach(() => { _resetDrumMachineEngine(); vi.restoreAllMocks() })

  it('plays from a Rig / DECK event with its panel closed, and stops', async () => {
    const { store } = await setup()
    expect(useUiStore().isDrumMachineOpen).toBe(false)
    window.dispatchEvent(new CustomEvent('dm-play-stop', { detail: { play: true } }))
    await flush()
    expect(store.isPlaying).toBe(true)
    expect(repeats.length).toBe(1)
    repeats[0](0)
    expect(pads).toContain(0)
    window.dispatchEvent(new CustomEvent('dm-play-stop', { detail: { play: false } }))
    await flush()
    expect(store.isPlaying).toBe(false)
  })

  it('switches sequence from the Rig with its panel closed (stopped: at once)', async () => {
    const { store } = await setup()
    window.dispatchEvent(new CustomEvent('dm-seq-switch', { detail: { seq: 'C', sync: 16 } }))
    expect(store.activeSequence).toBe('C')
  })

  it('a Fill from the Rig plays with its panel closed', async () => {
    const { engine, store } = await setup()
    window.dispatchEvent(new CustomEvent('dm-play-stop', { detail: { play: true } }))
    await flush()
    window.dispatchEvent(new CustomEvent('dm-trigger-fill'))
    expect(engine.fillActive.value).toBe(true)
    expect(store.isPlaying).toBe(true)
  })

  it('Fill on the next bar: armed (not playing yet), a second press cancels it, a stop drops it', async () => {
    const { engine, store } = await setup()
    store.fillWhen = 'bar'
    window.dispatchEvent(new CustomEvent('dm-play-stop', { detail: { play: true } }))
    await flush()
    window.dispatchEvent(new CustomEvent('dm-trigger-fill'))
    expect(engine.fillArmed.value).toBe(true)
    expect(engine.fillActive.value).toBe(false)
    window.dispatchEvent(new CustomEvent('dm-trigger-fill'))
    expect(engine.fillArmed.value).toBe(false)
    window.dispatchEvent(new CustomEvent('dm-trigger-fill'))
    window.dispatchEvent(new CustomEvent('dm-play-stop', { detail: { play: false } }))
    await flush()
    expect(engine.fillArmed.value).toBe(false)
  })

  it('the Rig turns the drums part on from a sequence: the Drum Machine starts', async () => {
    const { store } = await setup()
    window.dispatchEvent(new CustomEvent('dm-part', { detail: { part: 'drum', on: true, seq: 'B', sync: 0 } }))
    await flush()
    expect(store.activeSequence).toBe('B')
    expect(store.isPlaying).toBe(true)
  })
  it('CLK SYS: plays on the system clock (a step falls due → its pad sounds)', async () => {
    const { store } = await setup()
    store.systemClock = true
    await flush()
    let now = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    window.dispatchEvent(new CustomEvent('dm-play-stop', { detail: { play: true } }))
    await flush()
    expect(ticker).not.toBeNull()
    now = 1100
    ticker!()
    expect(pads).toContain(0)
  })

  // Stop@end + Fill, asked by Rig Controls' Stop ({ end: true }): the stop waits, the ending is a fill.
  const bars = (n: number) => { for (let i = 0; i < n * 16; i++) { repeats[0](0); flushUi() } }
  async function playing() {
    const r = await setup()
    r.engine.stopAtEnd.value = true
    r.engine.endWithFill.value = true
    window.dispatchEvent(new CustomEvent('dm-play-stop', { detail: { play: true } }))
    await flush()
    repeats[0](0); flushUi() // step 1 of bar 1
    return r
  }

  it('Stop@end + Fill (Fill: Now): the fill plays the rest of this bar, the stop comes on the bar line', async () => {
    const { engine, store } = await playing()
    store.fillWhen = 'now'
    const detail: any = { play: false, end: true }
    window.dispatchEvent(new CustomEvent('dm-play-stop', { detail }))
    expect(detail.deferred).toBe(true)
    expect(rigReports.drumStopPending).toBe(true)
    expect(engine.fillActive.value).toBe(true)
    for (let i = 0; i < 15; i++) { repeats[0](0); flushUi() }
    expect(store.isPlaying).toBe(true)
    repeats[0](0); flushUi() // bar line
    expect(store.isPlaying).toBe(false)
    await flush()
    expect(rigReports.drumStopPending).toBe(false)
  })

  it('Stop@end + Fill (Fill: Bar): this bar ends, the whole next bar is the fill, then the stop', async () => {
    const { engine, store } = await playing()
    store.fillWhen = 'bar'
    const detail: any = { play: false, end: true }
    window.dispatchEvent(new CustomEvent('dm-play-stop', { detail }))
    expect(detail.deferred).toBe(true)
    expect(engine.fillArmed.value).toBe(true)
    expect(engine.fillActive.value).toBe(false)
    bars(15 / 16) // to the end of bar 1
    repeats[0](0); flushUi() // bar 2: the fill
    expect(store.isPlaying).toBe(true)
    expect(engine.fillActive.value).toBe(true)
    bars(15 / 16)
    expect(store.isPlaying).toBe(true)
    repeats[0](0); flushUi() // bar 3's line: stop
    expect(store.isPlaying).toBe(false)
  })

  it('Stop@end: pressed again while waiting stops at once; a Play calls it off (and drops the ending fill)', async () => {
    const { engine, store } = await playing()
    store.fillWhen = 'bar'
    window.dispatchEvent(new CustomEvent('dm-play-stop', { detail: { play: false, end: true } }))
    window.dispatchEvent(new CustomEvent('dm-play-stop', { detail: { play: true } }))
    expect(rigReports.drumStopPending).toBe(false)
    expect(engine.fillArmed.value).toBe(false)
    expect(store.isPlaying).toBe(true)
    window.dispatchEvent(new CustomEvent('dm-play-stop', { detail: { play: false, end: true } }))
    const again: any = { play: false, end: true }
    window.dispatchEvent(new CustomEvent('dm-play-stop', { detail: again }))
    expect(again.deferred).toBe(false)
    expect(store.isPlaying).toBe(false)
  })

  it('Chain switched on while playing: the chain from its first slot on the next bar', async () => {
    const { engine, store } = await setup()
    engine.chain.value = ['C', 'B', null, null, null, null, null, null, null, null, null, null, null, null, null, null]
    window.dispatchEvent(new CustomEvent('dm-play-stop', { detail: { play: true } }))
    await flush()
    for (let i = 0; i < 20; i++) { repeats[0](0); flushUi() } // into bar 2, no chain: still A
    expect(store.activeSequence).toBe('A')
    store.chainEnabled = true
    await flush()
    for (let i = 0; i < 13; i++) { repeats[0](0); flushUi() } // bar 3's line
    expect(store.activeSequence).toBe('C')
    for (let i = 0; i < 16; i++) { repeats[0](0); flushUi() }
    expect(store.activeSequence).toBe('B')
  })
})
