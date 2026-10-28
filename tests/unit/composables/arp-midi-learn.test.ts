import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { applyParamValue as rawApply } from '@/composables/useMidiCCListener'
import { useArpStore, ARP_SUBDIVISIONS } from '@/stores/useArpStore'
import { ARP_MODES } from '@/lib/arp-patterns'

// Stub every store applyParamValue would otherwise create (the LFO store
// pulls in Tone.js, which can't run under jsdom); only arpStore is real.
const presetStore = { lastPreset: {}, updateFieldValue: vi.fn() }
const stubs = () => ({
  lfoStore: {}, mappingStore: {}, uiStore: {}, presetStore, midiStore: { sendCC: vi.fn() },
  noteLatchStore: {}, drumStore: {}, cpStore: {}, mixerStore: {}, configStore: { midiConfig: [] },
  arpStore: useArpStore(),
})
const applyParamValue = (field: string, val: number, fromNote = false) => rawApply(field, val, fromNote, stubs())

describe('MIDI Learn → Arpeggiator controls (applyParamValue)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    presetStore.updateFieldValue.mockClear()
  })

  it('arp_rate sweeps the full subdivision list', () => {
    const arp = useArpStore()
    applyParamValue('arp_rate', 0)
    expect(arp.arpSubdivision).toBe(ARP_SUBDIVISIONS[0])
    applyParamValue('arp_rate', 127)
    expect(arp.arpSubdivision).toBe(ARP_SUBDIVISIONS[ARP_SUBDIVISIONS.length - 1])
  })

  it('arp_rate does not leak into the synth preset', () => {
    applyParamValue('arp_rate', 64)
    expect(presetStore.updateFieldValue).not.toHaveBeenCalled()
  })

  it('arp_mode, arp_bpm, arp_octave map onto the panel ranges', () => {
    const arp = useArpStore()
    applyParamValue('arp_mode', 127)
    expect(arp.arpMode).toBe(ARP_MODES[ARP_MODES.length - 1])
    applyParamValue('arp_bpm', 0)
    expect(arp.arpBpm).toBe(40)
    applyParamValue('arp_bpm', 127)
    expect(arp.arpBpm).toBe(250)
    applyParamValue('arp_octave', 0)
    expect(arp.arpOctave).toBe(-3)
    applyParamValue('arp_octave', 127)
    expect(arp.arpOctave).toBe(3)
  })

  it('arp_ignore_off follows CC value and toggles on note', () => {
    const arp = useArpStore()
    applyParamValue('arp_ignore_off', 127)
    expect(arp.arpIgnoreWhenOff).toBe(true)
    applyParamValue('arp_ignore_off', 0)
    expect(arp.arpIgnoreWhenOff).toBe(false)
    applyParamValue('arp_ignore_off', 100, true)
    expect(arp.arpIgnoreWhenOff).toBe(true)
  })
})
