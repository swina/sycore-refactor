// Live external audio input (USB instrument, line-in, mic) -- see
// docs/plans/Sycore-DSP-Integration-Feasibility.md's "Extension: live
// external-input source" section. Thin config/state wrapper around
// src/lib/live-input-engine.js, same shape as useDrumMachineStore.ts/
// useSamplerStore.ts's relationship to their own engines, just a single
// channel instead of a bank of pads.
import { defineStore } from 'pinia'
import { reactive, ref, watch } from 'vue'
import { userKey } from '@/lib/userKey'
import * as engine from '@/lib/live-input-engine'
import type { FxChain, ModMatrixSlot } from '@/core/audio/types'
import type { FilterType } from '@/core/audio/filterMath'

const LS_KEY = 'SYCORE_LIVE_INPUT'

export interface LiveInputConfig {
  deviceId: string | null
  level: number
  pan: number
  filterFreq: number
  filterType: FilterType
  filterResonance: number
  fx?: FxChain
  modMatrix?: ModMatrixSlot[]
}

function defaultConfig(): LiveInputConfig {
  return {
    deviceId: null,
    level: 0.85,
    pan: 0,
    filterFreq: 20000,
    filterType: 'lowpass',
    filterResonance: 0,
  }
}

function _load(): LiveInputConfig {
  try {
    const raw = localStorage.getItem(userKey(LS_KEY))
    if (raw) return { ...defaultConfig(), ...JSON.parse(raw) }
  } catch {}
  return defaultConfig()
}

export interface InputDeviceOption {
  deviceId: string
  label: string
}

export const useLiveInputStore = defineStore('liveInput', () => {
  const config = reactive<LiveInputConfig>(_load())
  const isOpen = ref(false)
  const deviceLabel = ref('')
  const devices = ref<InputDeviceOption[]>([])
  const error = ref<string | null>(null)

  watch(config, () => {
    try { localStorage.setItem(userKey(LS_KEY), JSON.stringify(config)) } catch {}
  }, { deep: true })

  async function refreshDevices() {
    try {
      const list = await engine.listInputDevices()
      devices.value = list.map(d => ({ deviceId: d.deviceId, label: d.label || '(unnamed input)' }))
    } catch {
      devices.value = []
    }
  }

  function _applyAllToEngine() {
    engine.setLevel(config.level)
    engine.setPan(config.pan)
    engine.setFilter(config.filterFreq)
    engine.setFilterType(config.filterType)
    engine.setFilterResonance(config.filterResonance)
    if (config.fx) engine.setFx(config.fx)
    if (config.modMatrix) engine.setModMatrix(config.modMatrix)
  }

  // deviceId: omit to open the default input, or to reopen the last-used
  // one (config.deviceId). Requires a user gesture (button click) -- browsers
  // block/ignore an unprompted getUserMedia call.
  async function open(deviceId?: string) {
    error.value = null
    try {
      engine.initLiveInputEngine()
      await engine.openInput(deviceId ?? config.deviceId ?? undefined)
      isOpen.value = engine.isInputOpen()
      deviceLabel.value = engine.getInputDeviceLabel() ?? ''
      config.deviceId = deviceId ?? config.deviceId ?? null
      _applyAllToEngine()
      await refreshDevices() // labels only populate after the first permission grant
    } catch (e: any) {
      error.value = e?.message ?? String(e)
      isOpen.value = false
    }
  }

  function close() {
    engine.closeInput()
    isOpen.value = false
    deviceLabel.value = ''
  }

  function setLevel(v: number) { config.level = v; engine.setLevel(v) }
  function setPan(v: number) { config.pan = v; engine.setPan(v) }
  function setFilterFreq(v: number) { config.filterFreq = v; engine.setFilter(v) }
  function setFilterType(v: FilterType) { config.filterType = v; engine.setFilterType(v) }
  function setFilterResonance(v: number) { config.filterResonance = v; engine.setFilterResonance(v) }

  function getInputLevel(): number {
    return engine.getInputLevel()
  }

  return {
    config, isOpen, deviceLabel, devices, error,
    refreshDevices, open, close,
    setLevel, setPan, setFilterFreq, setFilterType, setFilterResonance,
    getInputLevel,
  }
})
