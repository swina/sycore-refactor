import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Resizing: pointer events (mouse, pen, touch) from any edge; a workspace with play views
// (Performance) allows smaller panels than the Classic minimums.
describe('useDraggableResizable resize', () => {
  beforeEach(() => {
    vi.resetModules(); setActivePinia(createPinia()); localStorage.clear()
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => { f(0); return 1 })
  })
  const ptr = (type: string, x: number, y: number) => Object.assign(new Event(type), { clientX: x, clientY: y, button: 0, preventDefault() {}, stopPropagation() {} })

  async function resizeBy(min: { w: number; h: number } | null, dx: number, dy: number, dir = 'se') {
    const m = await import('@/composables/useDraggableResizable')
    m.setResizeMinimum(() => min)
    const p = m.useDraggableResizable({ initialWidth: 800, initialHeight: 600, minWidth: 500, minHeight: 400 })
    p.onResizeStart(ptr('pointerdown', 500, 500), dir)
    window.dispatchEvent(ptr('pointermove', 500 + dx, 500 + dy))
    window.dispatchEvent(ptr('pointerup', 500 + dx, 500 + dy))
    return p.panelStyle.value
  }

  it('Classic: not below the panel\'s minimum', async () => {
    const st = await resizeBy(null, -600, -500)
    expect(parseInt(st.width as string)).toBe(500)
    expect(parseInt(st.height as string)).toBe(400)
  })
  it('Performance: down to the workspace\'s minimum, width and height', async () => {
    const st = await resizeBy({ w: 160, h: 36 }, -500, -500)
    expect(parseInt(st.width as string)).toBe(300)
    expect(parseInt(st.height as string)).toBe(100)
  })
})
