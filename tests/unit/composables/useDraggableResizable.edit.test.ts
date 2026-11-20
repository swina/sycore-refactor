import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { defineComponent, h, ref, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useDraggableResizable, setEditFullscreen } from '@/composables/useDraggableResizable'

// EDIT full screen (Performance): also for a panel remounted under the same id — the Sequencer is keyed
// per lane, and the old instance's unmount removed the new one's entries (EDIT stopped maximizing).
const Panel = defineComponent({
  props: { lane: String },
  setup() {
    const { panelStyle } = useDraggableResizable({ panelId: 'edit-test', storageKey: 'EDIT_TEST', initialWidth: 600, initialHeight: 400 })
    return () => h('div', { 'data-panel': '', style: panelStyle.value })
  },
})
const Host = defineComponent({
  setup(_, { expose }) {
    const lane = ref('main')
    expose({ lane })
    return () => h(Panel, { key: lane.value, lane: lane.value })
  },
})

describe('EDIT full screen', () => {
  beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()) })
  it('full screen on EDIT, back on Play view — after a remount (another lane) too', async () => {
    const w = mount(Host)
    const width = () => (w.find('[data-panel]').element as HTMLElement).style.width
    expect(width()).toBe('600px')
    ;(w.vm as any).lane = 'bass'
    await nextTick(); await nextTick()
    setEditFullscreen('edit-test', true)
    await nextTick()
    expect(width()).toBe(`${window.innerWidth}px`)
    setEditFullscreen('edit-test', false)
    await nextTick()
    expect(width()).toBe('600px')
  })
})
