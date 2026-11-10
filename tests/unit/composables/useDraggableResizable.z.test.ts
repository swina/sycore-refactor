import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// The panels' stacking: clicking a panel raises it above the others — also after hundreds of clicks
// (the counter used to wrap to the floor and drop the clicked panel below all the others).
describe('useDraggableResizable stacking', () => {
  beforeEach(() => { vi.resetModules(); setActivePinia(createPinia()) })
  it('the panel clicked last stays on top, past the z cap, in the others\' order', async () => {
    const { useDraggableResizable } = await import('@/composables/useDraggableResizable')
    const panels = [0, 1, 2].map(() => useDraggableResizable())
    const z = () => panels.map(p => p.panelStyle.value.zIndex as number)
    // all opened at the default z (100): the first one clicked goes above the untouched ones
    panels[1].bringToFront()
    expect(z()[1]).toBeGreaterThan(Math.max(z()[0], z()[2]))
    for (let n = 0; n < 1000; n++) {
      const i = n % 3
      panels[i].bringToFront()
      const top = Math.max(...z())
      expect(z()[i]).toBe(top)
      if (n >= 2) expect(new Set(z()).size).toBe(3)
      expect(top).toBeLessThanOrEqual(399)
    }
    // order kept: 2 under 0 under 1 after clicking 2, 0, 1
    panels[2].bringToFront(); panels[0].bringToFront(); panels[1].bringToFront()
    const [a, b, c] = z()
    expect(c).toBeLessThan(a)
    expect(a).toBeLessThan(b)
  })
  it('clicking the panel already on top changes nothing', async () => {
    const { useDraggableResizable } = await import('@/composables/useDraggableResizable')
    const p = useDraggableResizable(), q = useDraggableResizable()
    p.bringToFront()
    const before = p.panelStyle.value.zIndex
    for (let n = 0; n < 500; n++) p.bringToFront()
    expect(p.panelStyle.value.zIndex).toBe(before)
    expect(q.panelStyle.value.zIndex).toBeLessThan(before as number)
  })
})
