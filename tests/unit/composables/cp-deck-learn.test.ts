import { describe, it, expect } from 'vitest'
import { applyParamValue } from '@/composables/useMidiCCListener'
import { describeParam } from '@/lib/midi-learn-conflicts'

const stubs = (cpStore: any) => ({
  lfoStore: {}, mappingStore: {}, uiStore: {}, presetStore: { lastPreset: {}, updateFieldValue: () => {} },
  midiStore: {}, arpStore: {}, noteLatchStore: {}, drumStore: {}, cpStore, mixerStore: {}, configStore: { midiConfig: [] },
})

describe('MIDI Learn → DECK Chord Prog (cp_mode, cp_chain, cp_slot_<i>)', () => {
  it('a momentary flips CHORD / ARP on each press, not on the release', () => {
    const cp = { playMode: 'chord', chainEnabled: false }
    applyParamValue('cp_mode', 127, false, stubs(cp)); expect(cp.playMode).toBe('arp')
    applyParamValue('cp_mode', 0, false, stubs(cp));   expect(cp.playMode).toBe('arp')
  })

  it('a note flips Chain ON / OFF on Note On', () => {
    const cp = { playMode: 'chord', chainEnabled: false }
    applyParamValue('cp_chain', 100, true, stubs(cp))
    expect(cp.chainEnabled).toBe(true)
  })

  it('a slot pad selects its slot', () => {
    const seen: number[] = []
    const h = (e: any) => seen.push(e.detail.idx)
    window.addEventListener('cp-slot-select', h)
    applyParamValue('cp_slot_3', 127, false, stubs({}))
    applyParamValue('cp_slot_3', 0, false, stubs({}))
    window.removeEventListener('cp-slot-select', h)
    expect(seen).toEqual([3])
  })

  it('names them for the conflict dialog', () => {
    expect(describeParam('cp_slot_2')).toBe('Chord Prog · Slot C')
    expect(describeParam('cp_mode')).toBe('Chord Prog · Chord / Arp')
    expect(describeParam('cp_chain')).toBe('Chord Prog · Chain On / Off')
  })
})
