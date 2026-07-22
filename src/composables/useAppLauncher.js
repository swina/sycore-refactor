import { ref, watch } from 'vue'
import { useConfigStore } from '@/stores/useConfigStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { moduleRegistry, modulesByCategory, CATEGORY_META } from '@/core/modules/registry'
import { userKey } from '@/lib/userKey'

// Deliberately named "pinned", not "favorites" — module id 'favorites'
// already opens an unrelated sound-preset favorites view (usePresetStore).
const STORAGE_KEY = 'SYCORE_PINNED_MODULES'

function loadPinned() {
  try {
    const v = JSON.parse(localStorage.getItem(userKey(STORAGE_KEY)))
    if (Array.isArray(v)) return v
  } catch {}
  return []
}

// Module-level singleton — one shared pin list across all component
// instances, same pattern as useMinimizedModals.js.
const pinnedModuleIds = ref(loadPinned())

function persist() {
  try { localStorage.setItem(userKey(STORAGE_KEY), JSON.stringify(pinnedModuleIds.value)) } catch {}
}

let _watchingAuth = false

/**
 * Shared launcher data source for AppLauncher.vue (main page + burger-menu
 * modal) and MainMenuDial.vue (MIDI dial cycling). `includeUtilities`
 * controls whether toolbar-only modules (showOnLauncher: false — Profile,
 * Help, Admin, MIDI Mapping, etc.) are included: the main-page launcher
 * tiles omit them (as MainPageOptimized.vue always has), the workspace
 * burger-menu modal includes them (preserving what the old horizontal strip
 * exposed, since several of those utilities have no other entry point once
 * inside /workspace).
 */
export function useAppLauncher() {
  const configStore = useConfigStore()
  const authStore = useAuthStore()

  if (!_watchingAuth) {
    _watchingAuth = true
    watch(() => authStore.user?.uid, () => { pinnedModuleIds.value = loadPinned() })
  }

  function isPinned(id) {
    return pinnedModuleIds.value.includes(id)
  }

  function togglePin(id) {
    pinnedModuleIds.value = isPinned(id)
      ? pinnedModuleIds.value.filter(x => x !== id)
      : [...pinnedModuleIds.value, id]
    persist()
  }

  function isEligible(m, includeUtilities) {
    if (!includeUtilities && m.showOnLauncher === false) return false
    return configStore.isModuleEnabled(m.id)
  }

  function sections({ includeUtilities = false } = {}) {
    return modulesByCategory()
      .map(({ category, items }) => ({
        category,
        title: CATEGORY_META[category]?.title || category,
        icon: CATEGORY_META[category]?.icon,
        items: items.filter(m => isEligible(m, includeUtilities)),
      }))
      .filter(section => section.items.length > 0)
  }

  function pinnedItems({ includeUtilities = false } = {}) {
    return pinnedModuleIds.value
      .map(id => moduleRegistry.find(m => m.id === id))
      .filter(m => m && isEligible(m, includeUtilities))
  }

  /** Pinned-first, then registry order — the flat list MainMenuDial.vue's
   *  hardware dial scrolls through and selects from. */
  function flatCyclableItems({ includeUtilities = false } = {}) {
    const pinned = pinnedItems({ includeUtilities })
    const pinnedIds = new Set(pinned.map(m => m.id))
    const rest = moduleRegistry.filter(m => isEligible(m, includeUtilities) && !pinnedIds.has(m.id))
    return [...pinned, ...rest]
  }

  return { pinnedModuleIds, isPinned, togglePin, sections, pinnedItems, flatCyclableItems }
}
