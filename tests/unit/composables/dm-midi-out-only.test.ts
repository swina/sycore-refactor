import { describe, it, expect } from 'vitest'
import { applyParamValue } from '@/composables/useMidiCCListener'

const stubs = (drumStore: any) => ({
  lfoStore: {}, mappingStore: {}, uiStore: {}, presetStore: { lastPreset: {}, updateFieldValue: () => {} },
  midiStore: {}, arpStore: {}, noteLatchStore: {}, drumStore, cpStore: {}, mixerStore: {}, configStore: { midiConfig: [] },
})

describe('MIDI Learn → Drum Machine MIDI OUT ONLY', () => {
  it('a momentary CC button flips the switch on each press, not on release', () => {
    const drum = { midiOutOnly: false }
    applyParamValue('dm_midi_out_only', 127, false, stubs(drum))
    applyParamValue('dm_midi_out_only', 0, false, stubs(drum))      // release, right after
    expect(drum.midiOutOnly).toBe(true)
  })

  it('a note flips it on each Note On', () => {
    const drum = { midiOutOnly: true }
    applyParamValue('dm_midi_out_only', 100, true, stubs(drum))
    expect(drum.midiOutOnly).toBe(false)
  })
})
