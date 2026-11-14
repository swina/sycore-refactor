import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useAuthStore } from './useAuthStore'
import { userKey } from '@/lib/userKey'
import { bigLoad, bigSave } from '@/lib/big-storage'

const STORAGE_KEY = 'SYCORE_USER_PRESET_BANKS'

export interface PresetBankEntry {
  name: string
  createdAt: string
  presets: any[]
  // undefined = legacy (.mfprojz or Standard JSON, saved before these were
  // distinguishable) — treated permissively as belonging to either template.
  source?: 'emulatorx3' | 'mfprojz' | 'json' | 'kawai-k1' | 'arturia' | 'access-virus' | 'roland-s1'
}

export interface PresetBanks {
  [deviceName: string]: PresetBankEntry[]
}

export const useUserBanksStore = defineStore('userBanks', () => {
  const authStore = useAuthStore()
  const uid = computed(() => authStore.user?.uid)

  // In IndexedDB (lib/big-storage.ts: 2 MB of banks filled localStorage). Loaded async: nothing is
  // saved before the load is in, so an empty start never overwrites what's stored.
  const banks = ref<PresetBanks>({})
  let loadedKey: string | null = null
  async function load() {
    const key = userKey(STORAGE_KEY)
    loadedKey = null
    const v = await bigLoad<PresetBanks>(key, {})
    if (key !== userKey(STORAGE_KEY)) return // the user changed meanwhile
    banks.value = v && typeof v === 'object' ? v : {}
    loadedKey = key
  }
  const ready = load()

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  watch(banks, () => {
    if (!loadedKey) return
    const key = loadedKey
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => { saveTimer = null; bigSave(key, banks.value) }, 300)
  }, { deep: true })

  watch(uid, (newUid) => {
    loadedKey = null
    banks.value = {}
    if (newUid) load()
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

  return { banks, ready, getBanksForDevice, addBank, removeBank, getPresets, hasBank }
})