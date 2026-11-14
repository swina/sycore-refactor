import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { createPinia, setActivePinia } from 'pinia'
import { useDrumMachineStore } from '@/stores/useDrumMachineStore'
import { useChordProgStore } from '@/stores/useChordProgStore'
import { useStepSequencerStore } from '@/stores/useStepSequencerStore'
import { useSessionTakesStore, TAKES_PER_APP } from '@/stores/useSessionTakesStore'
import { journaled, applyTake, snapshot, takeSummary } from '@/lib/session-takes'

// Session takes: Generate keeps the slot it writes over and what it made; any of them loads back.
describe('session takes', () => {
  beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()) })

  it('a Generate keeps the slot before (start, the first of the session) and after', () => {
    const dm = useDrumMachineStore()
    const takes = useSessionTakesStore()
    const before = snapshot('drum', dm.activeSequence)
    journaled('drum', dm.activeSequence, () => dm.generateDrumPattern('House' as any), { note: 'House' })
    expect(takes.takes.map(t => t.kind)).toEqual(['start', 'gen'])
    expect(takes.takes[0].data).toEqual(before)
    expect(takes.takes[1].data).toEqual(snapshot('drum', dm.activeSequence))
    expect(takeSummary(takes.takes[1])).toMatch(/^House · \d+ hits$/)
    // a second Generate: its 'before' equals the last take → not kept twice
    journaled('drum', dm.activeSequence, () => dm.generateDrumPattern('House' as any))
    expect(takes.takes.filter(t => t.kind !== 'gen').length).toBe(1)
  })

  it('an edit between two Generates is kept as a "before" take', () => {
    const dm = useDrumMachineStore()
    const takes = useSessionTakesStore()
    journaled('drum', 'A', () => dm.generateDrumPattern('House' as any))
    dm.sequences.A[0].steps[1].active = !dm.sequences.A[0].steps[1].active
    const edited = snapshot('drum', 'A')
    journaled('drum', 'A', () => dm.generateDrumPattern('House' as any))
    const b = takes.takes.find(t => t.kind === 'before')!
    expect(b.data).toEqual(edited)
  })

  it('loads the session start back, and into another slot; the replaced content is kept too', () => {
    const dm = useDrumMachineStore()
    const takes = useSessionTakesStore()
    const start = snapshot('drum', 'A')
    journaled('drum', 'A', () => dm.generateDrumPattern('Techno' as any))
    const gen = snapshot('drum', 'A')
    expect(applyTake(takes.takes[0], 'A')).toBe(true)
    expect(snapshot('drum', 'A')).toEqual(start)
    expect(applyTake(takes.takes[1], 'C')).toBe(true)
    expect(snapshot('drum', 'C')).toEqual(gen)
    expect(takes.takes.some(t => t.target === 'C' && t.kind === 'start')).toBe(true)
  })

  it('Chord Prog: the active slot is its working copy; a take loads into another slot too', () => {
    const cp = useChordProgStore()
    const takes = useSessionTakesStore()
    cp.steps[0] = { ...cp.steps[0], chordName: 'Am', notes: [57, 60, 64], active: true }
    journaled('chord', cp.activeSlotIndex, () => { cp.steps[0] = { ...cp.steps[0], chordName: 'F', notes: [53, 57, 60] } })
    expect(takeSummary(takes.takes[0])).toContain('Am')
    expect(takeSummary(takes.takes[1])).toContain('F')
    applyTake(takes.takes[0], cp.activeSlotIndex)
    expect(cp.steps[0].chordName).toBe('Am')
    applyTake(takes.takes[1], 3)
    expect(cp.slots[3].steps[0].chordName).toBe('F')
  })

  it('Sequencer: a bank snapshot and its restore', () => {
    const seq = useStepSequencerStore()
    const takes = useSessionTakesStore()
    journaled('seq', 0, () => { seq.banks[0] = { ...seq.banks[0], selectedKey: 'D', selectedScale: 'Minor' } })
    expect(takes.takes.map(t => t.kind)).toEqual(['start', 'gen'])
    applyTake(takes.takes[0], 0)
    expect(seq.banks[0].selectedKey).toBe(takes.takes[0].data && (takes.takes[0].data as any).selectedKey)
    applyTake(takes.takes[1], 5)
    expect(seq.banks[5].selectedKey).toBe('D')
  })

  it('an AI Generate that fails keeps only the before; one that works, the after as AI', async () => {
    const cp = useChordProgStore()
    const takes = useSessionTakesStore()
    await journaled('chord', 0, async () => false, { source: 'ai' })
    expect(takes.takes.map(t => t.kind)).toEqual(['start'])
    await journaled('chord', 0, async () => { cp.steps[2] = { ...cp.steps[2], chordName: 'G', notes: [55, 59, 62], active: true }; return true }, { source: 'ai' })
    expect(takes.takes.at(-1)).toMatchObject({ kind: 'gen', source: 'ai' })
  })

  it('keeps the last takes per app (the start ones always) and clears', () => {
    const takes = useSessionTakesStore()
    for (let i = 0; i < TAKES_PER_APP + 10; i++) takes.after('chord', 0, { i })
    takes.before('chord', 1, { start: true })
    expect(takes.takes.filter(t => t.app === 'chord' && t.kind !== 'start').length).toBe(TAKES_PER_APP)
    takes.before('drum', 'A', [[1]])
    takes.clear()
    expect(takes.takes).toEqual([])
  })
})
