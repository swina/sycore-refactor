import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useAuthStore } from './useAuthStore'
import { userKey } from '@/lib/userKey'

const STORAGE_KEY = 'SYCORE_USER_PRESET_BANKS'

export const useUserBanksStore = defineStore('userBanks', () => {
  const authStore = useAuthStore()
  const uid = computed(() => authStore.user?.uid)

  const banks = ref(load())

  function load() {
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

  function getBanksForDevice(deviceName) {
    return banks.value[deviceName] ?? []
  }

  function addBank(deviceName, bankName, presets) {
    if (!banks.value[deviceName]) banks.value[deviceName] = []
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
