import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useAuthStore } from './useAuthStore'
import { userKey } from '@/lib/userKey'

const STORAGE_KEY = 'SYCORE_MIDI_FLOW_CONFIGS'

export interface MidiFlowConfigEntry {
  name: string
  createdAt: string
  nodes: any[]
  cables: any[]
}

export const useMidiFlowConfigsStore = defineStore('midiFlowConfigs', () => {
  const authStore = useAuthStore()
  const uid = computed(() => authStore.user?.uid)

  const configs = ref<MidiFlowConfigEntry[]>(load())

  function load(): MidiFlowConfigEntry[] {
    try {
      return JSON.parse(localStorage.getItem(userKey(STORAGE_KEY)) ?? '[]')
    } catch {
      return []
    }
  }

  watch(configs, val => {
    localStorage.setItem(userKey(STORAGE_KEY), JSON.stringify(val))
  }, { deep: true })

  watch(uid, (newUid) => {
    configs.value = newUid ? load() : []
  })

  function saveConfig(name: string, nodes: any[], cables: any[]) {
    const idx = configs.value.findIndex(c => c.name === name)
    const entry: MidiFlowConfigEntry = { name, createdAt: new Date().toISOString(), nodes, cables }
    if (idx >= 0) configs.value.splice(idx, 1, entry)
    else configs.value.push(entry)
  }

  function getConfig(name: string): MidiFlowConfigEntry | undefined {
    return configs.value.find(c => c.name === name)
  }

  function deleteConfig(name: string) {
    configs.value = configs.value.filter(c => c.name !== name)
  }

  function hasConfig(name: string): boolean {
    return configs.value.some(c => c.name === name)
  }

  return { configs, saveConfig, getConfig, deleteConfig, hasConfig }
})
