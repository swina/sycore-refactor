import { ref } from 'vue'

// Module-level singleton — one shared registry across all component instances
const _entries = ref([])

export function useMinimizedModals() {
  return { minimizedModals: _entries }
}

export function registerMinimized(id, label, restore) {
  if (!_entries.value.find(e => e.id === id)) {
    _entries.value.push({ id, label, restore })
  }
}

export function unregisterMinimized(id) {
  const idx = _entries.value.findIndex(e => e.id === id)
  if (idx !== -1) _entries.value.splice(idx, 1)
}
