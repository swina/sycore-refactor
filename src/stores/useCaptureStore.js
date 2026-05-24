import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useCaptureStore = defineStore('capture', () => {
  // Persists across panel open/close; cleared only by explicit user reset
  const frozenNotes  = ref([])
  const phase        = ref('idle')   // 'idle' | 'review' (never 'capturing' — not persisted)
  const rangeStartMs = ref(0)
  const rangeEndMs   = ref(0)

  function clear() {
    frozenNotes.value  = []
    phase.value        = 'idle'
    rangeStartMs.value = 0
    rangeEndMs.value   = 0
  }

  return { frozenNotes, phase, rangeStartMs, rangeEndMs, clear }
})
