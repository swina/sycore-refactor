import { ref, watch } from 'vue'

/**
 * A reactive ref that stays in sync with localStorage.
 * Reading .value returns the current value; setting .value persists it.
 */
export function useLocalStorage(key, defaultValue) {
  function read() {
    try {
      const raw = localStorage.getItem(key)
      if (raw === null) return defaultValue
      return JSON.parse(raw)
    } catch {
      return defaultValue
    }
  }

  const state = ref(read())

  watch(state, (val) => {
    if (val === null || val === undefined) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, JSON.stringify(val))
    }
  }, { deep: true })

  // Sync when another tab writes to localStorage
  function onStorageEvent(e) {
    if (e.key === key) state.value = read()
  }
  window.addEventListener('storage', onStorageEvent)

  function stop() {
    window.removeEventListener('storage', onStorageEvent)
  }

  return { state, stop }
}
