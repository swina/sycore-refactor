import { describe, it, expect, vi, afterEach } from 'vitest'
import { applyParamValue } from '@/composables/useMidiCCListener'

// Only the seq_time / seq_direction branches run: they dispatch an event before any store is read.
const stubs = () => ({
  lfoStore: {}, mappingStore: {}, uiStore: {}, presetStore: { lastPreset: {}, updateFieldValue: vi.fn() },
  midiStore: {}, arpStore: {}, noteLatchStore: {}, drumStore: {}, cpStore: {}, mixerStore: {}, configStore: { midiConfig: [] },
})

describe('MIDI Learn → Sequencer Time / Direction', () => {
  const seen: { type: string; detail: any }[] = []
  const listen = (e: Event) => seen.push({ type: e.type, detail: (e as CustomEvent).detail })
  window.addEventListener('seq-time-set', listen)
  window.addEventListener('seq-direction-set', listen)
  afterEach(() => { seen.length = 0 })

  it('a CC sends its value to the Sequencer', () => {
    applyParamValue('seq_time', 90, false, stubs())
    expect(seen).toEqual([{ type: 'seq-time-set', detail: { value: 90, fromNote: false } }])
  })

  it('a note steps the Direction', () => {
    applyParamValue('seq_direction', 100, true, stubs())
    expect(seen).toEqual([{ type: 'seq-direction-set', detail: { value: 100, fromNote: true } }])
  })
})
