import { describe, it, expect } from 'vitest'
import { applyParamValue } from '@/composables/useMidiCCListener'

const stubs = (vdStore: any) => ({
  lfoStore: {}, mappingStore: {}, uiStore: {}, presetStore: { lastPreset: {}, updateFieldValue: () => {} },
  midiStore: {}, arpStore: {}, noteLatchStore: {}, drumStore: {}, cpStore: {}, mixerStore: {}, configStore: { midiConfig: [] },
  vdStore,
})

function fakeVd() {
  const calls: string[] = []
  return {
    calls,
    stepCategory: (_d: string, dir: number) => calls.push(`step${dir}`),
    setCategoryFromCc: (_d: string, v: number) => calls.push(`cc${v}`),
  }
}

describe('MIDI Learn → Virtual Device CATEGORY (vdp_category)', () => {
  it('a momentary button steps on each 127, not on the release', () => {
    const vd = fakeVd()
    for (const v of [127, 0, 127, 0]) applyParamValue('vdp_category:Btn', v, false, stubs(vd))
    expect(vd.calls).toEqual(['step1', 'step1'])
  })

  it('a knob (values between 0 and 127) picks the category from its value', () => {
    const vd = fakeVd()
    for (const v of [40, 90, 127]) applyParamValue('vdp_category:Knob', v, false, stubs(vd))
    expect(vd.calls).toEqual(['cc40', 'cc90', 'cc127'])
  })

  it('a momentary stays a step button after a stray value (velocity pad, noisy contact)', () => {
    const vd = fakeVd()
    for (const v of [127, 0, 100, 0, 127, 0, 127, 0]) applyParamValue('vdp_category:Stray', v, false, stubs(vd))
    expect(vd.calls).toEqual(['step1', 'step1', 'step1', 'step1'])
  })

  it('a control first taken for a knob goes back to stepping once it behaves like a button', () => {
    const vd = fakeVd()
    for (const v of [64, 0, 127, 0, 127, 0]) applyParamValue('vdp_category:Back', v, false, stubs(vd))
    expect(vd.calls).toEqual(['cc64', 'step1', 'step1'])
  })

  it('a knob turned through its range keeps picking by value, also at 0 and 127', () => {
    const vd = fakeVd()
    for (const v of [5, 4, 3, 2, 1, 0, 1, 2]) applyParamValue('vdp_category:Sweep', v, false, stubs(vd))
    expect(vd.calls).toEqual(['cc5', 'cc4', 'cc3', 'cc2', 'cc1', 'cc0', 'cc1', 'cc2'])
  })

  it('a note steps on Note On', () => {
    const vd = fakeVd()
    applyParamValue('vdp_category:Note', 100, true, stubs(vd))
    expect(vd.calls).toEqual(['step1'])
  })
})
