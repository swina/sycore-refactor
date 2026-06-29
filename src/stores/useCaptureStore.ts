import { defineStore } from 'pinia'
import { ref } from 'vue'

export type CapturePhase = 'idle' | 'review'

export interface CaptureNote {
  [key: string]: any
}

export const useCaptureStore = defineStore('capture', () => {
  const frozenNotes  = ref<CaptureNote[]>([])
  const phase        = ref<CapturePhase>('idle')
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