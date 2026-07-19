import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { createPinia, setActivePinia } from 'pinia'
import { moduleRegistry, modulesByCategory } from '@/core/modules/registry'
import { useUiStore } from '@/stores/useUiStore'

describe('moduleRegistry', () => {
  it('has unique ids', () => {
    const ids = moduleRegistry.map(m => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every entry has a label, icon, category, and launcher background', () => {
    for (const m of moduleRegistry) {
      expect(m.label, `${m.id} is missing a label`).toBeTruthy()
      expect(m.icon, `${m.id} is missing an icon`).toBeTruthy()
      expect(m.category, `${m.id} is missing a category`).toBeTruthy()
      expect(m.bg, `${m.id} is missing a launcher background`).toBeTruthy()
    }
  })

  it('modulesByCategory groups every module exactly once', () => {
    const groups = modulesByCategory()
    const total = groups.reduce((sum, g) => sum + g.items.length, 0)
    expect(total).toBe(moduleRegistry.length)
  })

  it('modulesByCategory does not split a category across two groups', () => {
    const groups = modulesByCategory()
    const categories = groups.map(g => g.category)
    expect(new Set(categories).size).toBe(categories.length)
  })

  describe('every registry id is actually wired to a useUiStore panel flag', () => {
    // This is the regression check for the exact class of bug that motivated
    // this test file: a launcher card whose id doesn't match the id used in
    // useUiStore's PANEL_ID_REF_LOOKUP (e.g. the pre-existing drift between
    // 'ctrl-designer' in SynthApp.vue's dead toolbarButtonMap vs
    // 'controller-designer' everywhere else). Unlike the ui-store-panels
    // test, this one imports the real moduleRegistry — no hardcoded id list
    // to fall out of sync.
    beforeEach(() => {
      setActivePinia(createPinia())
    })

    it.each(moduleRegistry.map(m => [m.id, m.label] as const))(
      'id "%s" (%s) toggles a real panel, not a no-op',
      (id) => {
        const uiStore = useUiStore()
        expect(uiStore.isPanelOpen(id), `"${id}" should start closed`).toBe(false)
        uiStore.togglePanel(id)
        expect(uiStore.isPanelOpen(id), `"${id}" did not open — check PANEL_ID_REF_LOOKUP in useUiStore.ts`).toBe(true)
      }
    )
  })
})
