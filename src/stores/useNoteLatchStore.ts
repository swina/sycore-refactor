import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface NoteLatchInstance {
  sourceKey: string   // unique routing key, e.g. NOTE_LATCH:1
  name: string        // display name, e.g. "Note Latch 1"
  enabled: boolean
  maxNotes: number
  replace: boolean    // true = FIFO (oldest dropped when full), false = BLOCK (new rejected)
  latchedCount: number
}

// The default instance kept for backward compatibility with the original
// single Note Latch node (MidiSource.NOTE_LATCH).
export const DEFAULT_LATCH_INSTANCE = {
  sourceKey: 'NOTE_LATCH',
  name: 'Note Latch',
}

export const useNoteLatchStore = defineStore('noteLatch', () => {
  const instances = ref<Record<string, NoteLatchInstance>>({})

  const instanceList = computed(() => Object.values(instances.value))

  function makeInstance(sourceKey: string, name: string): NoteLatchInstance {
    return {
      sourceKey,
      name: name || sourceKey,
      enabled: false,
      maxNotes: 1,
      replace: true,
      latchedCount: 0,
    }
  }

  /** Ensure an instance exists (returns the created or existing one). */
  function ensureInstance(sourceKey: string, name?: string): NoteLatchInstance {
    if (!instances.value[sourceKey]) {
      instances.value = {
        ...instances.value,
        [sourceKey]: makeInstance(sourceKey, name || sourceKey),
      }
    }
    return instances.value[sourceKey]
  }

  /** Remove an instance entirely. Returns true if it existed. */
  function removeInstance(sourceKey: string): boolean {
    if (!instances.value[sourceKey]) return false
    const next = { ...instances.value }
    delete next[sourceKey]
    instances.value = next
    return true
  }

  function getInstance(sourceKey: string): NoteLatchInstance | null {
    return instances.value[sourceKey] ?? null
  }

  function setEnabled(sourceKey: string, enabled: boolean) {
    const inst = ensureInstance(sourceKey)
    inst.enabled = enabled
  }

  function setLatchedCount(sourceKey: string, count: number) {
    const inst = ensureInstance(sourceKey)
    inst.latchedCount = count
  }

  // Register the default instance so listeners/UI behave even before a canvas
  // node is dropped (matches the original always-present singleton).
  ensureInstance(DEFAULT_LATCH_INSTANCE.sourceKey, DEFAULT_LATCH_INSTANCE.name)

  return {
    instances, instanceList,
    ensureInstance, removeInstance, getInstance,
    setEnabled, setLatchedCount,
  }
})