import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import LiveMapSection from '@/components/LiveMapSection.vue'
import { useLiveMapStore } from '@/stores/useLiveMapStore'
import { linkClient } from '@/stores/useLinkStore'

// Map · Live Instruments on a touch screen: vertical sliders (or tiles dragged up / down).
describe('Live Map sliders', () => {
  beforeEach(() => {
    localStorage.clear(); setActivePinia(createPinia())
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => { f(0); return 1 })
  })

  it('TILES ⇄ SLIDERS; a pointer on a slider sets the value there, straight (no pickup)', async () => {
    const map = useLiveMapStore()
    map.info = { track: null, device: { name: 'Synth', cls: 'X' } as any, mode: 'table', slots: [{ name: 'Cutoff', param: 'Cutoff', value: 0.2 } as any, ...Array(15).fill(null)], variations: null }
    map.values[0] = 0.2
    const sent = vi.spyOn(linkClient, 'sendMap').mockReturnValue(true)
    const w = mount(LiveMapSection)
    const toggle = w.findAll('button').find(b => b.text() === 'TILES')!
    await toggle.trigger('click')
    expect(w.text()).toContain('SLIDERS')
    const track = w.find('.cursor-ns-resize')
    ;(track.element as HTMLElement).getBoundingClientRect = () => ({ top: 100, height: 100, left: 0, width: 20, bottom: 200, right: 20, x: 0, y: 100, toJSON() {} })
    await track.trigger('pointerdown', { button: 0, clientY: 125 })
    expect(map.values[0]).toBeCloseTo(0.75)
    expect(sent).toHaveBeenCalledWith(0, 0.75)
  })

  it('KNOBS: Live-style encoders, drag up / down; pan drawn from the centre', async () => {
    const map = useLiveMapStore()
    map.info = { track: null, device: { name: 'Synth', cls: 'X' } as any, mode: 'table',
      slots: [{ name: 'Cutoff', param: 'Cutoff', value: 0.5 } as any, { name: 'Pan', param: 'Pan', value: 0.75 } as any, ...Array(14).fill(null)], variations: null }
    map.values[0] = 0.5; map.values[1] = 0.75
    const sent = vi.spyOn(linkClient, 'sendMap').mockReturnValue(true)
    const w = mount(LiveMapSection)
    await w.findAll('button').find(b => b.text() === 'TILES')!.trigger('click')
    await w.findAll('button').find(b => b.text() === 'SLIDERS')!.trigger('click')
    expect(w.text()).toContain('KNOBS')
    const knobs = w.findAll('svg.cursor-ns-resize')
    expect(knobs).toHaveLength(16)
    expect(w.text()).toContain('50')   // Cutoff 0–100
    expect(w.text()).toContain('25')   // Pan −50…50
    await knobs[0].trigger('pointerdown', { button: 0, clientY: 300 })
    knobs[0].element.dispatchEvent(Object.assign(new Event('pointermove'), { clientY: 260 }))
    expect(map.values[0]).toBeCloseTo(0.7)
    expect(sent).toHaveBeenCalledWith(0, expect.closeTo(0.7))
  })

  it('controls in the header: the section without them follows the view set there', async () => {
    const map = useLiveMapStore()
    const w = mount(LiveMapSection, { props: { controls: false } })
    expect(w.findAll('button').some(b => ['TILES', 'FOLLOW'].includes(b.text()))).toBe(false)
    expect(w.find('select').exists()).toBe(false)
    map.nextView(); map.nextView()
    await w.vm.$nextTick()
    expect(w.findAll('svg.cursor-ns-resize')).toHaveLength(16)
  })

  it('the DECK summary (compact): tiles only, no switch', () => {
    const w = mount(LiveMapSection, { props: { compact: true } })
    expect(w.findAll('button').some(b => b.text() === 'TILES')).toBe(false)
  })
})
