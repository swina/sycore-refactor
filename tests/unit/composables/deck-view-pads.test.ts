import { describe, it, expect, afterEach, vi } from 'vitest'
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

  it('deck_view_next: a momentary steps to the next pad on each 127, not on the release', () => {
    const steps: number[] = []
    const onStep = (e: Event) => steps.push((e as CustomEvent).detail.dir)
    window.addEventListener('deck-view-step', onStep)
    for (const v of [127, 0, 127, 0]) applyParamValue('deck_view_next', v, false, stubs())
    window.removeEventListener('deck-view-step', onStep)
    expect(steps).toEqual([1, 1])
  })

  it('deck_view_next: a release held long (0 after > 700 ms) does not step back', () => {
    const steps: number[] = []
    const onStep = (e: Event) => steps.push((e as CustomEvent).detail.dir)
    window.addEventListener('deck-view-step', onStep)
    const t0 = performance.now()
    const spy = vi.spyOn(performance, 'now')
    ;[[127, 0], [0, 1500], [127, 3000], [0, 4500]].forEach(([v, dt]) => {
      spy.mockReturnValue(t0 + 10_000 + dt)
      applyParamValue('deck_view_next', v, false, stubs())
    })
    spy.mockRestore()
    window.removeEventListener('deck-view-step', onStep)
    expect(steps).toEqual([1, 1])
  })
})
