import { describe, it, expect, beforeEach, vi } from 'vitest'
vi.mock('tone', () => {
  const transport = { bpm: { value: 120 }, ticks: 0, position: '0:0:0', state: 'stopped', scheduleRepeat: () => 1, clear: () => {}, start: () => {}, stop: () => {} }
  return { getTransport: () => transport, start: () => Promise.resolve(), now: () => 0, getContext: () => ({ currentTime: 0 }) }
})
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DrumPerformRow from '@/components/play/DrumPerformRow.vue'
import KnobDial from '@/components/ui/KnobDial.vue'
import { useMidiStore } from '@/stores/useMidiStore'
import { drumPerform, reloadDrumPerform } from '@/lib/drum-perform'
import { applyParamValue } from '@/composables/useMidiCCListener'
import { MidiSource } from '@/core/midi/midi-service'

describe('Drum Machine performance row', () => {
  beforeEach(() => { localStorage.clear(); reloadDrumPerform(); setActivePinia(createPinia()) })

  it('eight dials in a row; a Drum CC dial sends its CC on the Drum Machine source, the same value not resent', async () => {
    const midi = useMidiStore()
    const send = vi.spyOn(midi, 'sendCC').mockImplementation((() => {}) as any)
    const w = mount(DrumPerformRow, { global: { stubs: { teleport: true } } })
    const dials = w.findAllComponents(KnobDial)
    expect(dials).toHaveLength(8)
    dials[0].vm.$emit('change', 100)
    await w.vm.$nextTick()
    expect(send).toHaveBeenCalledWith(74, 100, null, MidiSource.DRUM_MACHINE)
    dials[0].vm.$emit('change', 100)
    expect(send).toHaveBeenCalledTimes(1)
    expect(w.text()).toContain('Cutoff')
    // Dyn: a wheel step of 5
    await w.find('[data-drum-dial="dyn"] .cursor-ns-resize').trigger('wheel', { deltaY: -1 })
    expect(drumPerform.dynamics).toBe(105)
  })

  it('⚙ opens the CC setup modal: name and CC number of a knob', async () => {
    const w = mount(DrumPerformRow, { global: { stubs: { teleport: true } } })
    expect(w.find('[data-drum-cc-setup]').exists()).toBe(false)
    await w.find('button[title^="Drum CC: names"]').trigger('click')
    expect(w.find('[data-drum-cc-setup]').exists()).toBe(true)
    await w.findAll('[data-drum-cc-name]')[1].setValue('Filter')
    await w.findAll('[data-drum-cc-num]')[1].setValue('20')
    await w.findAll('[data-drum-cc-num]')[1].trigger('change')
    expect(drumPerform.knobs[1]).toMatchObject({ name: 'Filter', cc: 20 })
    await w.findAll('button').find(b => b.text() === 'Done')!.trigger('click')
    expect(w.find('[data-drum-cc-setup]').exists()).toBe(false)
  })

  it('MIDI Learn targets: dm_cc_N, dm_dyn, dm_density, dm_humanize, dm_swing', () => {
    const midi = useMidiStore()
    const send = vi.spyOn(midi, 'sendCC').mockImplementation((() => {}) as any)
    // the other stores stubbed (the LFO store pulls in Tone.js), as in arp-midi-learn.test.ts
    const drumStore = { swing: 0 }
    const stubs = { lfoStore: {}, mappingStore: {}, uiStore: {}, presetStore: { lastPreset: {}, updateFieldValue: vi.fn() }, midiStore: midi,
      noteLatchStore: {}, drumStore, cpStore: {}, mixerStore: {}, configStore: { midiConfig: [] }, arpStore: {} }
    const apply = (f: string, v: number) => applyParamValue(f, v, false, stubs as any)
    apply('dm_cc_2', 90)
    expect(send).toHaveBeenCalledWith(75, 90, null, MidiSource.DRUM_MACHINE)
    apply('dm_dyn', 127)
    expect(drumPerform.dynamics).toBe(200)
    apply('dm_density', 40)
    expect(drumPerform.density).toBe(40)
    apply('dm_humanize', 127)
    expect(drumPerform.humanize).toBe(100)
    apply('dm_swing', 127)
    expect(drumStore.swing).toBe(80)
  })
})
