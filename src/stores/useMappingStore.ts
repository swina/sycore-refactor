import { defineStore } from 'pinia'
import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'
import { db, getDoc, setDoc, doc } from '@/lib/idb'
import { auth } from '@/lib/auth'
import { userKey } from '@/lib/userKey'
import { useAuthStore } from './useAuthStore'
import { useMidiStore } from './useMidiStore'
import { usePresetStore } from './usePresetStore'
import { FIELD_TO_CC } from '@/constants/s1-config'
import {
  loadMappingPresets,
  persistMappingPresets,
  createPreset as createMappingPreset,
  AUTOSAVE_ID,
  type MappingPreset,
} from '@/lib/midi-mapping-presets'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** NRPN mapping entry */
export interface NrpnMappingEntry {
  nrpn: { msb: number; lsb: number }
  device: string | null
  channel: number | null
  paramName: string
}

/** CC mapping entry */
export interface CcMappingEntry {
  cc: number
  device: string | null
  channel: number | null
  paramName: string
}

/** Note mapping entry */
export interface NoteMappingEntry {
  note: number
  device: string | null
  channel: number | null
  paramName: string
}

/** Union of all mapping entry variants */
export type MappingEntry = NrpnMappingEntry | CcMappingEntry | NoteMappingEntry

/** The full mapping dictionary keyed by mapping string key */
export type MidiMappings = Record<string, MappingEntry | string>

/** Velocity modulation configuration */
export interface VelocityConfig {
  active: boolean
  targetParameter: string
  amount: number
  curve: 'linear' | 'exp' | 'log'
}

/** Snapshot used when saving/duplicating mapping presets */
interface MappingSnapshot {
  mappings: MidiMappings
  appMappings: any[]
  velocityConfig: VelocityConfig
}

// ---------------------------------------------------------------------------
// LocalStorage helpers
// ---------------------------------------------------------------------------

const LS_MIDI_MAPPINGS    = 'midiMappings'
const LS_ACTIVE_PRESET_ID = 'midiMappingActivePresetId'

function userAppMidiDoc() {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Not authenticated')
  return doc(db, 'users', uid, 'system', 'appMidiMappings')
}

function loadMidiMappingsFromStorage(): MidiMappings {
  try {
    const raw = localStorage.getItem(userKey(LS_MIDI_MAPPINGS))
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useMappingStore = defineStore('mapping', () => {
  const authStore = useAuthStore()
  const uid: ComputedRef<string | undefined> = computed(() => authStore.user?.uid)

  // ── Mappings ─────────────────────────────────────────────────────────────
  const midiMappings: Ref<MidiMappings> = ref(loadMidiMappingsFromStorage())
  const appMidiMappings: Ref<any[]> = ref([])

  // ── MIDI Learn state ─────────────────────────────────────────────────────
  const isMidiLearning: Ref<boolean>  = ref(false)
  const learnedCC: Ref<number | null>       = ref(null)
  const learnedNote: Ref<number | null>     = ref(null)
  const learnedNRPN: Ref<{ msb: number; lsb: number } | null> = ref(null)
  const learnedDevice: Ref<string | null>   = ref(null)
  const learnedChannel: Ref<number | null>  = ref(null)

  // ── Mapping Preset State ─────────────────────────────────────────────────
  const presets: Ref<MappingPreset[]> = ref([])
  const activePresetId: Ref<string | null> = ref(localStorage.getItem(userKey(LS_ACTIVE_PRESET_ID)) || null)

  // ── Velocity Modulation ──────────────────────────────────────────────────
  const velocityConfig: Ref<VelocityConfig> = ref({
    active: false,
    targetParameter: 'cutoff',
    amount: 0,
    curve: 'linear',
  })
  const velocityMemory: Ref<Record<string, number>> = ref({})

  // ── Computed ─────────────────────────────────────────────────────────────
  const mappingCount: ComputedRef<number> = computed(() => Object.keys(midiMappings.value).length)

  const mappedParams: ComputedRef<Set<string>> = computed(() => {
    const params = new Set<string>()
    Object.values(midiMappings.value).forEach(mapping => {
      const name = typeof mapping === 'object' ? mapping.paramName : mapping
      if (name) params.add(name)
    })
    return params
  })

  // ── Internal bookkeeping ─────────────────────────────────────────────────
  let _isLoadingPreset = false
  let _autoSaveTimer: ReturnType<typeof setTimeout> | null = null
  let _learnTimer: ReturnType<typeof setTimeout> | null = null

  // ── Persistence ──────────────────────────────────────────────────────────
  function saveMidiMappings() {
    localStorage.setItem(userKey(LS_MIDI_MAPPINGS), JSON.stringify(midiMappings.value))
  }

  // ── Mapping Preset CRUD ──────────────────────────────────────────────────
  async function loadPresets() {
    presets.value = await loadMappingPresets()
  }

  function _currentSnapshot(): MappingSnapshot {
    return {
      mappings: { ...midiMappings.value },
      appMappings: [...appMidiMappings.value],
      velocityConfig: { ...velocityConfig.value },
    }
  }

  async function savePreset(name: string) {
    const existing = presets.value.find(p => p.name === name && p.id !== AUTOSAVE_ID)
    if (existing) {
      existing.mappings      = { ...midiMappings.value }
      existing.appMappings   = [...appMidiMappings.value]
      existing.velocityConfig = { ...velocityConfig.value }
      existing.updatedAt     = Date.now()
    } else {
      const preset = createMappingPreset(name, _currentSnapshot())
      presets.value.push(preset)
      activePresetId.value = preset.id
      localStorage.setItem(userKey(LS_ACTIVE_PRESET_ID), preset.id)
    }
    await persistMappingPresets(presets.value)
  }

  async function loadPreset(id: string) {
    const preset = presets.value.find(p => p.id === id)
    if (!preset) return
    _isLoadingPreset = true
    midiMappings.value = { ...(preset.mappings || {}) } as MidiMappings
    saveMidiMappings()
    if (preset.velocityConfig) velocityConfig.value = { ...preset.velocityConfig } as VelocityConfig
    activePresetId.value = id
    localStorage.setItem(userKey(LS_ACTIVE_PRESET_ID), id)
    _isLoadingPreset = false
  }

  async function deletePreset(id: string) {
    presets.value = presets.value.filter(p => p.id !== id)
    if (activePresetId.value === id) {
      activePresetId.value = null
      localStorage.removeItem(userKey(LS_ACTIVE_PRESET_ID))
    }
    await persistMappingPresets(presets.value)
  }

  async function duplicatePreset(id: string): Promise<string | undefined> {
    const src = presets.value.find(p => p.id === id)
    if (!src) return
    const copy = createMappingPreset(`${src.name} (copy)`, {
      mappings: { ...src.mappings } as MidiMappings,
      appMappings: [...src.appMappings],
      velocityConfig: { ...src.velocityConfig } as VelocityConfig,
    })
    presets.value.push(copy)
    await persistMappingPresets(presets.value)
    return copy.id
  }

  // ── Auto-save watcher ────────────────────────────────────────────────────
  watch(midiMappings, () => {
    if (_isLoadingPreset || !activePresetId.value) return
    clearTimeout(_autoSaveTimer!)
    _autoSaveTimer = setTimeout(async () => {
      const idx = presets.value.findIndex(p => p.id === activePresetId.value)
      if (idx === -1) return
      presets.value[idx] = {
        ...presets.value[idx],
        mappings: { ...midiMappings.value } as any,
        updatedAt: Date.now(),
      }
      await persistMappingPresets(presets.value)
    }, 500)
  }, { deep: true })

  // ── MIDI Learn ───────────────────────────────────────────────────────────
  const lastMappedParam = ref<string | null>(null)
  const learningParamName = ref<string | null>(null)

  function learnForParam(name: string) {
    learningParamName.value = name
    startLearn()
  }

  function startLearn() {
    learnedCC.value      = null
    learnedNote.value    = null
    learnedNRPN.value    = null
    learnedDevice.value  = null
    learnedChannel.value = null
    isMidiLearning.value = true
    if (typeof document !== 'undefined') document.body.classList.add('sy-midi-learn')

    clearTimeout(_learnTimer!)
    _learnTimer = setTimeout(() => {
      if (isMidiLearning.value) {
        cancelLearn()
        const msg = '[MIDI Learn] Timed out — no controller input received within 10s'
        if ((window as any).SY_LOG) (window as any).SY_LOG(msg)
        window.dispatchEvent(new CustomEvent('app-system-log', { detail: msg }))
      }
    }, 10000)
  }

  function cancelLearn() {
    clearTimeout(_learnTimer!)
    learnedCC.value        = null
    learnedNote.value      = null
    learnedNRPN.value      = null
    learnedDevice.value    = null
    learnedChannel.value   = null
    isMidiLearning.value   = false
    learningParamName.value = null
    if (typeof document !== 'undefined') document.body.classList.remove('sy-midi-learn')
  }

  function confirmLearn(paramName: string) {
    clearTimeout(_learnTimer!)
    if (learnedNRPN.value !== null) {
      const { msb, lsb } = learnedNRPN.value
      const keyParts: string[] = []
      if (learnedDevice.value) keyParts.push(learnedDevice.value)
      if (learnedChannel.value !== null) keyParts.push(`CH${learnedChannel.value + 1}`)
      keyParts.push(`NRPN:${msb}:${lsb}`)
      const key = keyParts.join(':')
      midiMappings.value = {
        ...midiMappings.value,
        [key]: { nrpn: { msb, lsb }, device: learnedDevice.value, channel: learnedChannel.value, paramName } as NrpnMappingEntry,
      }
      saveMidiMappings()
    } else if (learnedCC.value !== null) {
      const keyParts: string[] = []
      if (learnedDevice.value) keyParts.push(learnedDevice.value)
      if (learnedChannel.value !== null) keyParts.push(`CH${learnedChannel.value + 1}`)
      keyParts.push(`CC${learnedCC.value}`)
      const key = keyParts.join(':')
      midiMappings.value = {
        ...midiMappings.value,
        [key]: { cc: learnedCC.value, device: learnedDevice.value, channel: learnedChannel.value, paramName } as CcMappingEntry,
      }
      saveMidiMappings()
    } else if (learnedNote.value !== null) {
      const keyParts: string[] = []
      if (learnedDevice.value) keyParts.push(learnedDevice.value)
      if (learnedChannel.value !== null) keyParts.push(`CH${learnedChannel.value + 1}`)
      keyParts.push(`NOTE${learnedNote.value}`)
      const key = keyParts.join(':')
      midiMappings.value = {
        ...midiMappings.value,
        [key]: { note: learnedNote.value, device: learnedDevice.value, channel: learnedChannel.value, paramName } as NoteMappingEntry,
      }
      saveMidiMappings()
    }
    learnedCC.value      = null
    learnedNote.value    = null
    learnedNRPN.value    = null
    learnedDevice.value  = null
    learnedChannel.value = null
    isMidiLearning.value = false
    if (typeof document !== 'undefined') document.body.classList.remove('sy-midi-learn')
    lastMappedParam.value = paramName
    setTimeout(() => { lastMappedParam.value = null }, 1000)
  }

  function incomingNRPN(msb: number, lsb: number, device: string | null = null, channel: number | null = null) {
    if (!isMidiLearning.value) return
    learnedNRPN.value    = { msb, lsb }
    learnedCC.value      = null
    learnedNote.value    = null
    learnedDevice.value  = device
    learnedChannel.value = channel
    if (learningParamName.value) {
      const name = learningParamName.value
      learningParamName.value = null
      confirmLearn(name)
    }
  }

  function removeMapping(key: string) {
    const next = { ...midiMappings.value }
    delete next[key]
    midiMappings.value = next
    saveMidiMappings()
  }

  function incomingCC(cc: number, device: string | null = null, channel: number | null = null) {
    if (!isMidiLearning.value) return
    learnedCC.value      = cc
    learnedNote.value    = null
    learnedDevice.value  = device
    learnedChannel.value = channel
    if (learningParamName.value) {
      const name = learningParamName.value
      learningParamName.value = null
      confirmLearn(name)
    }
  }

  function incomingNote(note: number, device: string | null = null, channel: number | null = null) {
    if (!isMidiLearning.value) return
    learnedNote.value    = note
    learnedCC.value      = null
    learnedNRPN.value    = null
    learnedDevice.value  = device
    learnedChannel.value = channel
    if (learningParamName.value) {
      const name = learningParamName.value
      learningParamName.value = null
      confirmLearn(name)
    }
  }

  // ── Velocity modulation ──────────────────────────────────────────────────
  function handleVelocity(velocity: number, channel: number | null = null) {
    if (!velocityConfig.value.active) return

    const midiStore = useMidiStore()
    const presetStore = usePresetStore()
    const lastPreset = presetStore.lastPreset

    if (!lastPreset) {
      if ((window as any).SY_LOG) (window as any).SY_LOG('[VEL] Blocked: No active preset')
      return
    }

    const field = velocityConfig.value.targetParameter
    const amount = velocityConfig.value.amount
    if (amount === 0) return

    const cc = (FIELD_TO_CC as Record<string, number>)[field]
    if (cc === undefined) {
      if ((window as any).SY_LOG) (window as any).SY_LOG(`[VEL] Blocked: Field ${field} has no CC mapping`)
      return
    }

    const activeVariant = presetStore.useAlternativeEngine ? lastPreset.bVariant : lastPreset.aVariant
    const targetData: Record<string, number> | undefined = activeVariant?.data || (lastPreset as any).data

    if (!targetData || Object.keys(targetData).length === 0) {
      if ((window as any).SY_LOG) (window as any).SY_LOG('[VEL] Blocked: No target data for engine')
      return
    }

    const baseValue = targetData[field] ?? 64
    let x = velocity / 127

    const curve = velocityConfig.value.curve
    if (curve === 'exp') {
      x = Math.pow(x, 2)
    } else if (curve === 'log') {
      x = Math.sqrt(x)
    }

    const modulation = Math.round(x * (amount / 100) * 127)
    const modulatedValue = Math.max(0, Math.min(127, baseValue + modulation))

    if ((window as any).SY_LOG && velocity > 0) {
      (window as any).SY_LOG(`[VEL] Modulating ${field} (CC ${cc}): ${baseValue} -> ${modulatedValue} (vel: ${velocity})`)
    }
    midiStore.sendCC(cc, modulatedValue)
  }

  function restoreOriginalValues() {
    const midiStore = useMidiStore()
    const presetStore = usePresetStore()
    const lastPreset = presetStore.lastPreset
    if (!lastPreset) return

    const field = velocityConfig.value.targetParameter
    const cc = (FIELD_TO_CC as Record<string, number>)[field]
    if (cc === undefined) return

    const activeVariant = presetStore.useAlternativeEngine ? lastPreset.bVariant : lastPreset.aVariant
    const targetData: Record<string, number> | undefined = activeVariant?.data || (lastPreset as any).data

    if (!targetData) return

    const originalValue = targetData[field]
    if (originalValue !== undefined) {
      midiStore.sendCC(cc, originalValue)
    }
  }

  // ── App MIDI Mappings ────────────────────────────────────────────────────
  async function loadAppMidiMappings() {
    try {
      const snap = await getDoc(userAppMidiDoc())
      if (snap.exists() && Array.isArray((snap.data() as any).mappings)) {
        appMidiMappings.value = (snap.data() as any).mappings
      }
    } catch (e) {
      console.error('Failed to load app MIDI mappings', e)
    }
  }

  async function saveAppMidiMappings(mappings: any[]) {
    appMidiMappings.value = mappings
    await setDoc(userAppMidiDoc(), { mappings })
  }

  async function clearAppMidiMappings() {
    await saveAppMidiMappings([])
  }

  function clearMidiMappings() {
    midiMappings.value = {}
    saveMidiMappings()
  }

  // ── Auth watcher ─────────────────────────────────────────────────────────
  watch(uid, async (newUid, oldUid) => {
    if (!newUid) {
      if (oldUid) {
        midiMappings.value = {}
        appMidiMappings.value = []
        presets.value = []
        activePresetId.value = null
      }
    } else {
      if ((window as any).SY_LOG) (window as any).SY_LOG('Loading MIDI configuration for user...')
      midiMappings.value = loadMidiMappingsFromStorage()
      activePresetId.value = localStorage.getItem(userKey(LS_ACTIVE_PRESET_ID)) || null
      await loadPresets()
      await loadAppMidiMappings()
      if ((window as any).SY_LOG) (window as any).SY_LOG(`MIDI configuration loaded (${Object.keys(midiMappings.value).length} mappings, ${appMidiMappings.value.length} app actions)`)
    }
  }, { immediate: true })

  function toggleVelocityMapping() {
    velocityConfig.value.active = !velocityConfig.value.active
    if (!velocityConfig.value.active) {
      restoreOriginalValues()
    }
  }

  console.log('MappingStore initialized with velocityConfig:', !!velocityConfig)

  return {
    midiMappings, appMidiMappings,
    isMidiLearning, learnedCC, learnedNote, learnedNRPN, learnedDevice, learnedChannel,
    mappingCount, mappedParams, lastMappedParam, learningParamName,
    startLearn, cancelLearn, confirmLearn, learnForParam, removeMapping, incomingCC, incomingNote, incomingNRPN,
    loadAppMidiMappings, saveAppMidiMappings, clearAppMidiMappings, clearMidiMappings,
    velocityConfig, handleVelocity, restoreOriginalValues, toggleVelocityMapping,
    presets, activePresetId,
    loadPresets, savePreset, loadPreset, deletePreset, duplicatePreset,
  }
})