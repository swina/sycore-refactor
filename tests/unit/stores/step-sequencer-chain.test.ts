import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useStepSequencerStore, normalizeChain, CHAIN_COUNT } from '@/stores/useStepSequencerStore'

describe('Sequencer chain: 16 slots', () => {
  beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()) })

  it('has 16 slots', () => {
    expect(CHAIN_COUNT).toBe(16)
    expect(useStepSequencerStore().chain).toHaveLength(16)
  })
  it('a chain saved with 8 slots keeps them, the other 8 empty', () => {
    expect(normalizeChain([0, 1, null, 2, 3, null, null, 7])).toEqual([0, 1, null, 2, 3, null, null, 7, ...Array(8).fill(null)])
    expect(normalizeChain(undefined)).toEqual(Array(16).fill(null))
    expect(normalizeChain([9, -1, 'x', 4])).toEqual([null, null, null, 4, ...Array(12).fill(null)])
  })
  it('a preset with an 8-slot chain is restored, not dropped; slot 16 plays', () => {
    const s = useStepSequencerStore()
    s.restoreChainFromPreset({ chain: [2, 3, null, null, null, null, null, null], chainEnabled: true })
    expect(s.chain.slice(0, 2)).toEqual([2, 3])
    s.cycleChainSlot(15) // → A
    expect(s.chain[15]).toBe(0)
    expect(s.playbackSteps.chainSlotIndices).toContain(15)
  })
  it('Save → All Slots: the 8 banks, the chain and the active bank round-trip (an older entry padded)', () => {
    const s = useStepSequencerStore()
    s.banks[2].selectedStyle = 'Acid'
    s.banks[2].steps[0] = { ...s.banks[2].steps[0], active: true, notes: [48] }
    s.restoreChainFromPreset({ chain: [2, 0], chainEnabled: true })
    s.setActiveBank(2)
    const snap = JSON.parse(JSON.stringify(s.captureAllBanks()))
    expect(snap.banks).toHaveLength(8)

    setActivePinia(createPinia()); localStorage.clear()
    const t = useStepSequencerStore()
    t.restoreAllBanks(snap)
    expect(t.activeBankIndex).toBe(2)
    expect(t.banks[2].selectedStyle).toBe('Acid')
    expect(t.banks[2].steps[0].notes).toEqual([48])
    expect(t.chain.slice(0, 2)).toEqual([2, 0])
    expect(t.chainEnabled).toBe(true)

    t.restoreAllBanks({ banks: [{ selectedStyle: 'Jazz' }], activeBankIndex: 9 })
    expect(t.banks).toHaveLength(8)
    expect(t.banks[0].selectedStyle).toBe('Jazz')
    expect(t.banks[0].steps).toHaveLength(16)
    expect(t.activeBankIndex).toBe(0)
  })
})
