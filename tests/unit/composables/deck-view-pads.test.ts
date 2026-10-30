import { describe, it, expect, afterEach } from 'vitest'
import { applyParamValue } from '@/composables/useMidiCCListener'

const stubs = () => ({
  lfoStore: {}, mappingStore: {}, uiStore: {}, presetStore: { lastPreset: {}, updateFieldValue: () => {} },
  midiStore: {}, arpStore: {}, noteLatchStore: {}, drumStore: {}, cpStore: {}, mixerStore: {}, configStore: { midiConfig: [] },
})

describe('MIDI Learn → DECK instrument pads (deck_view:<name>)', () => {
  const seen: string[] = []
  const on = (e: Event) => seen.push((e as CustomEvent).detail.name)
  window.addEventListener('deck-view-select', on)
  afterEach(() => { seen.length = 0 })

  it('a momentary CC button selects the instrument on press, not on release', () => {
    applyParamValue('deck_view:Emulator X3', 127, false, stubs())
    applyParamValue('deck_view:Emulator X3', 0, false, stubs())
    expect(seen).toEqual(['Emulator X3'])
  })

  it('a note selects it on Note On, names with colons kept whole', () => {
    applyParamValue('deck_view:FM-1 Emulator', 100, true, stubs())
    expect(seen).toEqual(['FM-1 Emulator'])
  })
})
