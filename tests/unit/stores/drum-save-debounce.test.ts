import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useDrumMachineStore } from '@/stores/useDrumMachineStore'

const KEY = 'anon_SYCORE_DRUM_MACHINE_V1'

describe('drum machine persistence is debounced', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    setActivePinia(createPinia())
  })
  afterEach(() => vi.useRealTimers())

  it('coalesces a burst of edits into one localStorage write after 300 ms', async () => {
    const store = useDrumMachineStore()
    localStorage.removeItem(KEY)

    for (let i = 0; i < 11; i++) {
      store.currentPattern[i].volume = 0.5 + i / 100
      await nextTick() // each edit flushes the watchers separately, like 11 IndexedDB replies
      vi.advanceTimersByTime(50)
    }
    expect(localStorage.getItem(KEY)).toBeNull()

    vi.advanceTimersByTime(300)
    const saved = JSON.parse(localStorage.getItem(KEY) as string)
    expect(saved.sequences.A[0].volume).toBe(0.5)
    expect(saved.sequences.A[10].volume).toBe(0.6)
  })
})
