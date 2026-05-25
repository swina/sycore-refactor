import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const STORAGE_KEY = 'SYCORE_USER_PRESET_BANKS'

// Stored shape: { [deviceName]: [{ name, createdAt, presets }] }

export const useUserBanksStore = defineStore('userBanks', () => {
  const banks = ref(load())

  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    } catch {
      return {}
    }
  }

  watch(banks, val => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(val))
  }, { deep: true })

  function getBanksForDevice(deviceName) {
    return banks.value[deviceName] ?? []
  }

  function addBank(deviceName, bankName, presets) {
    if (!banks.value[deviceName]) banks.value[deviceName] = []
    // Replace if same name exists
    const idx = banks.value[deviceName].findIndex(b => b.name === bankName)
    const entry = { name: bankName, createdAt: new Date().toISOString(), presets }
    if (idx >= 0) banks.value[deviceName].splice(idx, 1, entry)
    else banks.value[deviceName].push(entry)
  }

  function removeBank(deviceName, bankName) {
    if (!banks.value[deviceName]) return
    banks.value[deviceName] = banks.value[deviceName].filter(b => b.name !== bankName)
    if (banks.value[deviceName].length === 0) delete banks.value[deviceName]
  }

  function getPresets(deviceName, bankName) {
    return banks.value[deviceName]?.find(b => b.name === bankName)?.presets ?? []
  }

  function hasBank(deviceName, bankName) {
    return !!banks.value[deviceName]?.some(b => b.name === bankName)
  }

  return { banks, getBanksForDevice, addBank, removeBank, getPresets, hasBank }
})
