import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('tone', () => {
  const transport = { bpm: { value: 120 }, swing: 0, swingSubdivision: '16n', ticks: 0, position: '0:0:0',
    scheduleRepeat: () => 1, clear: () => {}, toTicks: () => 48, nextSubdivision: () => 0,
    start: () => {}, stop: () => {}, pause: () => {}, cancel: () => {}, state: 'stopped', toSeconds: () => 2 }
  return { getTransport: () => transport, start: () => Promise.resolve(), getContext: () => ({ currentTime: 0 }) }
})
const tickers = new Set<() => void>()
vi.mock('@/core/midi/step-scheduler', async (orig) => {
  const m: any = await orig()
  return { ...m, createWorkerTicker: (fn: () => void) => { tickers.add(fn); return () => { tickers.delete(fn) } } }
})
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useSequencerEngine, _resetSequencerEngine } from '@/core/engines/sequencer'
import { useMidiStore } from '@/stores/useMidiStore'
import { midiService } from '@/core/midi/midi-service'
import { useUiStore } from '@/stores/useUiStore'
import { useChordProgStore } from '@/stores/useChordProgStore'
import { MidiSource } from '@/types/midi'
const flush = async () => { await nextTick(); await Promise.resolve(); await Promise.resolve() }
async function run({ routed, keyCp, toggleAt }: { routed: boolean; keyCp: boolean; toggleAt?: number }) {
    vi.useFakeTimers()
    let now = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    setActivePinia(createPinia())
    const midiStore = useMidiStore()
    const ui = useUiStore()
    ui.seqFollowMode = 'degree'
    ui.seqGenKeyFromProg = keyCp
    useChordProgStore().isPlaying = true
    vi.spyOn(midiStore, 'hasExplicitInputRouting').mockReturnValue(routed as any)
    vi.spyOn(midiStore, 'isDeviceRoutedToApp').mockReturnValue(routed as any)
    const out: [number, number][] = []
    vi.spyOn(midiService, 'sendNoteOn').mockImplementation(((n: number, _v: any, _c: any, src: string, _s: any, at: any) => { if (src === MidiSource.SEQ_ARP) out.push([Math.round(at ?? now), n]) }) as any)
    vi.spyOn(midiService, 'sendNoteOff').mockImplementation((() => {}) as any)
    vi.spyOn(midiService, 'scheduleOnWorker').mockImplementation((() => {}) as any)
    const main = useSequencerEngine()
    main.systemClock.value = true
    const arp = useSequencerEngine('arp')
    arp.laneSync.value = false
    arp.selectedKey.value = 'C'; arp.selectedScale.value = 'Major'
    const pat = [[60], [64], [67], [72]]
    arp.steps.value = arp.steps.value.slice(0, 4).map((s: any, i: number) => ({ ...s, active: true, notes: pat[i], gate: 50, probability: 100 }))
    arp.numSteps.value = 4
    await flush()
    const { useSeqLaneStore } = await import('@/stores/useStepSequencerStore')
    const st = useSeqLaneStore('arp')
    const pat2 = [[48], [52], [55], [60]]
    st.banks[1] = { ...st.banks[0], selectedKey: 'C', selectedScale: 'Major', numSteps: 4, steps: st.banks[0].steps.slice(0, 4).map((x: any, i: number) => ({ ...x, active: true, notes: pat2[i], gate: 50, probability: 100 })) }
    window.dispatchEvent(new CustomEvent('toggle-seq-arp', { detail: { play: true } }))
    for (let i = 0; i < 5; i++) await flush()
    const chords: Record<number, [number, number[], number]> = { 1500: [9, [0, 4, 9], 57], 2000: [5, [0, 5, 9], 53], 2500: [7, [2, 7, 11], 55], 3000: [0, [0, 4, 7], 48], 3500: [9, [0, 4, 9], 57] }
    for (let t = 1000; t < 4000; t += 10) {
      now = t
      for (const [T, c] of Object.entries(chords)) {
        if (Number(T) - 200 === t) {
          window.dispatchEvent(new CustomEvent('cp-chord-on', { detail: { rootPc: c[0], name: '', pcs: c[1], note: c[2], at: Number(T) } }))
          midiStore.sendNoteOn(c[2], 100, 1, MidiSource.CHORD_PROG, null, Number(T))
        }
      }
      if (toggleAt === t) { arp.fitMode.value = 'scale'; await flush(); arp.fitMode.value = 'chord' }
      if (t === 1600) window.dispatchEvent(new CustomEvent('seq-arp-bank-cue', { detail: { idx: 1 } }))
      vi.advanceTimersByTime(10)
      for (const f of [...tickers]) f()
      await flush()
    }
    _resetSequencerEngine()
    vi.useRealTimers(); vi.restoreAllMocks()
    return out.map(([, n]) => n)
}

// The lanes on the Chord Prog's chords, CLK SYS (a chord announced 200 ms ahead, its notes at its time):
// C (bars from 1000 ms) → Am 1500 → F 2000 (bank B from there) → G 2500 → C 3000 → Am 3500.
const FOLLOWED = [60, 64, 67, 72, 57, 60, 64, 69, 53, 57, 60, 65, 43, 47, 50, 55, 48, 52, 55, 60, 45, 48, 52, 57, 45, 48]
describe('Sequencer lanes following the Chord Prog (Arp lane, Fit CHD)', () => {
  beforeEach(() => { localStorage.clear(); tickers.clear() })
  it('routed (MIDI Flow): on every chord, on time, across a bank switch', async () => {
    expect(await run({ routed: true, keyCp: false })).toEqual(FOLLOWED)
  })
  it('Key: CP on, no cable: the same', async () => {
    expect(await run({ routed: false, keyCp: true })).toEqual(FOLLOWED)
  })
  it("neither: it doesn't move — switching CHD off / on doesn't pin it to the chord of that moment", async () => {
    const out = await run({ routed: false, keyCp: false, toggleAt: 2100 })
    expect(out.slice(0, 8)).toEqual([60, 64, 67, 72, 60, 64, 67, 72])
    expect(out.slice(12, 16)).toEqual([48, 52, 55, 60]) // bank B as written, after the toggle too
  })
})
