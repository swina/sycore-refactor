import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useAuthStore } from './useAuthStore'
import { userKey } from '@/lib/userKey'

const STORAGE_KEY = 'SYCORE_USER_PRESET_BANKS'

export interface PresetBankEntry {
  name: string
  createdAt: string
  presets: any[]
  // undefined = legacy (.mfprojz or Standard JSON, saved before these were
  // distinguishable) — treated permissively as belonging to either template.
  source?: 'emulatorx3' | 'mfprojz' | 'json' | 'kawai-k1' | 'arturia'
}

export interface PresetBanks {
  [deviceName: string]: PresetBankEntry[]
}

export const useUserBanksStore = defineStore('userBanks', () => {
  const authStore = useAuthStore()
  const uid = computed(() => authStore.user?.uid)

  const banks = ref<PresetBanks>(load())

  function load(): PresetBanks {
    try {
      return JSON.parse(localStorage.getItem(userKey(STORAGE_KEY)) ?? '{}')
    } catch {
      return {}
    }
  }

  watch(banks, val => {
    localStorage.setItem(userKey(STORAGE_KEY), JSON.stringify(val))
  }, { deep: true })

  watch(uid, (newUid) => {
    banks.value = newUid ? load() : {}
  })

  function getBanksForDevice(deviceName: string): PresetBankEntry[] {
    return banks.value[deviceName] ?? []
  }

  function addBank(deviceName: string, bankName: string, presets: any[], source?: PresetBankEntry['source']) {
    if (!banks.value[deviceName]) banks.value[deviceName] = []
    const idx = banks.value[deviceName].findIndex(b => b.name === bankName)
    const entry: PresetBankEntry = { name: bankName, createdAt: new Date().toISOString(), presets, source }
    if (idx >= 0) banks.value[deviceName].splice(idx, 1, entry)
    else banks.value[deviceName].push(entry)
  }

  function removeBank(deviceName: string, bankName: string) {
    if (!banks.value[deviceName]) return
    banks.value[deviceName] = banks.value[deviceName].filter(b => b.name !== bankName)
    if (banks.value[deviceName].length === 0) delete banks.value[deviceName]
  }

  function getPresets(deviceName: string, bankName: string): any[] {
    return banks.value[deviceName]?.find(b => b.name === bankName)?.presets ?? []
  }

  function hasBank(deviceName: string, bankName: string): boolean {
    return !!banks.value[deviceName]?.some(b => b.name === bankName)
  }

  return { banks, getBanksForDevice, addBank, removeBank, getPresets, hasBank }
})