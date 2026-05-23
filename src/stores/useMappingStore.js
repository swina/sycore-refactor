import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { db, getDoc, setDoc, doc } from '@/lib/idb'
import { useMidiStore } from './useMidiStore'
import { usePresetStore } from './usePresetStore'
import { FIELD_TO_CC } from '@/constants/s1-config'
import {
  loadMappingPresets,
  persistMappingPresets,
  createPreset,
  AUTOSAVE_ID,
} from '@/lib/midi-mapping-presets'

const LS_MIDI_MAPPINGS    = 'midiMappings'
const LS_ACTIVE_PRESET_ID = 'midiMappingActivePresetId'
const IDB_COLLECTION = 'system'
const IDB_DOC_NAME   = 'appMidiMappings'

function loadMidiMappingsFromStorage() {
  try {
    const raw = localStorage.getItem(LS_MIDI_MAPPINGS)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export const useMappingStore = defineStore('mapping', () => {
  // CC# (number key as string) → param field name
  const midiMappings    = ref(loadMidiMappingsFromStorage())
  // Hardware CC → AppAction bindings
  const appMidiMappings = ref([])
  const isMidiLearning  = ref(false)
  const learnedCC       = ref(null)
  const learnedNote     = ref(null)   // MIDI note number when learned via Note On
  const learnedNRPN     = ref(null)   // { msb, lsb } when learning NRPN, else null
  const learnedDevice   = ref(null)
  const learnedChannel  = ref(null)

  // Mapping Preset State
  const presets         = ref([])
  const activePresetId  = ref(localStorage.getItem(LS_ACTIVE_PRESET_ID) || null)
  
  // Velocity Modulation State (Refactored to match React original)
  const velocityConfig = ref({
    active: false,
    targetParameter: 'cutoff',
    amount: 0,
    curve: 'linear'
  })
  const velocityMemory = ref({}) // Map to store original values before modulation

  const mappingCount = computed(() => Object.keys(midiMappings.value).length)

  // Set of param field names that have at least one active CC/NRPN mapping
  const mappedParams = computed(() => {
    const params = new Set()
    Object.values(midiMappings.value).forEach(mapping => {
      const name = typeof mapping === 'object' ? mapping.paramName : mapping
      if (name) params.add(name)
    })
    return params
  })

  function saveMidiMappings() {
    localStorage.setItem(LS_MIDI_MAPPINGS, JSON.stringify(midiMappings.value))
  }

  // ── Mapping Preset CRUD ────────────────────────────────────────────────────

  async function loadPresets() {
    presets.value = await loadMappingPresets()
  }

  function _currentSnapshot() {
    return {
      mappings: { ...midiMappings.value },
      appMappings: [...appMidiMappings.value],
      velocityConfig: { ...velocityConfig.value },
    }
  }

  async function savePreset(name) {
    const existing = presets.value.find(p => p.name === name && p.id !== AUTOSAVE_ID)
    if (existing) {
      existing.mappings      = { ...midiMappings.value }
      existing.appMappings   = [...appMidiMappings.value]
      existing.velocityConfig = { ...velocityConfig.value }
      existing.updatedAt     = Date.now()
    } else {
      const preset = createPreset(name, _currentSnapshot())
      presets.value.push(preset)
      activePresetId.value = preset.id
      localStorage.setItem(LS_ACTIVE_PRESET_ID, preset.id)
    }
    await persistMappingPresets(presets.value)
  }

  async function loadPreset(id) {
    const preset = presets.value.find(p => p.id === id)
    if (!preset) return
    // Suppress auto-save watcher during load
    _isLoadingPreset = true
    midiMappings.value = { ...(preset.mappings || {}) }
    saveMidiMappings()
    if (preset.velocityConfig) velocityConfig.value = { ...preset.velocityConfig }
    activePresetId.value = id
    localStorage.setItem(LS_ACTIVE_PRESET_ID, id)
    _isLoadingPreset = false
  }

  async function deletePreset(id) {
    presets.value = presets.value.filter(p => p.id !== id)
    if (activePresetId.value === id) {
      activePresetId.value = null
      localStorage.removeItem(LS_ACTIVE_PRESET_ID)
    }
    await persistMappingPresets(presets.value)
  }

  async function duplicatePreset(id) {
    const src = presets.value.find(p => p.id === id)
    if (!src) return
    const copy = createPreset(`${src.name} (copy)`, {
      mappings: { ...src.mappings },
      appMappings: [...src.appMappings],
      velocityConfig: { ...src.velocityConfig },
    })
    presets.value.push(copy)
    await persistMappingPresets(presets.value)
    return copy.id
  }

  // Auto-save current mappings to the active preset (debounced 500 ms)
  let _isLoadingPreset = false
  let _autoSaveTimer = null

  watch(midiMappings, () => {
    if (_isLoadingPreset || !activePresetId.value) return
    clearTimeout(_autoSaveTimer)
    _autoSaveTimer = setTimeout(async () => {
      const idx = presets.value.findIndex(p => p.id === activePresetId.value)
      if (idx === -1) return
      presets.value[idx] = {
        ...presets.value[idx],
        mappings: { ...midiMappings.value },
        updatedAt: Date.now(),
      }
      await persistMappingPresets(presets.value)
    }, 500)
  }, { deep: true })

  const lastMappedParam    = ref(null)   // param name, set for 1 s after confirmLearn
  const learningParamName  = ref(null)   // set when learn is triggered from context menu
  let _learnTimer = null

  // Context-menu shortcut: arms learn pre-targeted to a specific param.
  // The next incoming CC/NRPN auto-confirms to this param with no user action.
  function learnForParam(name) {
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

    clearTimeout(_learnTimer)
    _learnTimer = setTimeout(() => {
      if (isMidiLearning.value) {
        cancelLearn()
        const msg = '[MIDI Learn] Timed out — no controller input received within 10s'
        if (window.SY_LOG) window.SY_LOG(msg)
        window.dispatchEvent(new CustomEvent('app-system-log', { detail: msg }))
      }
    }, 10000)
  }

  function cancelLearn() {
    clearTimeout(_learnTimer)
    learnedCC.value        = null
    learnedNote.value      = null
    learnedNRPN.value      = null
    learnedDevice.value    = null
    learnedChannel.value   = null
    isMidiLearning.value   = false
    learningParamName.value = null
    if (typeof document !== 'undefined') document.body.classList.remove('sy-midi-learn')
  }

  function confirmLearn(paramName) {
    clearTimeout(_learnTimer)
    if (learnedNRPN.value !== null) {
      // NRPN mapping — key format: Device:CH#:NRPN:MSB:LSB
      const { msb, lsb } = learnedNRPN.value
      const keyParts = []
      if (learnedDevice.value) keyParts.push(learnedDevice.value)
      if (learnedChannel.value !== null) keyParts.push(`CH${learnedChannel.value + 1}`)
      keyParts.push(`NRPN:${msb}:${lsb}`)
      const key = keyParts.join(':')
      midiMappings.value = {
        ...midiMappings.value,
        [key]: { nrpn: { msb, lsb }, device: learnedDevice.value, channel: learnedChannel.value, paramName }
      }
      saveMidiMappings()
    } else if (learnedCC.value !== null) {
      // CC mapping — key format: Device:CH#:CC#
      const keyParts = []
      if (learnedDevice.value) keyParts.push(learnedDevice.value)
      if (learnedChannel.value !== null) keyParts.push(`CH${learnedChannel.value + 1}`)
      keyParts.push(`CC${learnedCC.value}`)
      const key = keyParts.join(':')
      midiMappings.value = {
        ...midiMappings.value,
        [key]: { cc: learnedCC.value, device: learnedDevice.value, channel: learnedChannel.value, paramName }
      }
      saveMidiMappings()
    } else if (learnedNote.value !== null) {
      // Note mapping — key format: Device:CH#:NOTE#
      const keyParts = []
      if (learnedDevice.value) keyParts.push(learnedDevice.value)
      if (learnedChannel.value !== null) keyParts.push(`CH${learnedChannel.value + 1}`)
      keyParts.push(`NOTE${learnedNote.value}`)
      const key = keyParts.join(':')
      midiMappings.value = {
        ...midiMappings.value,
        [key]: { note: learnedNote.value, device: learnedDevice.value, channel: learnedChannel.value, paramName }
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

  // Called by useMidiCCListener when NRPN is assembled during learn mode
  function incomingNRPN(msb, lsb, device = null, channel = null) {
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

  function removeMapping(key) {
    const next = { ...midiMappings.value }
    delete next[key]
    midiMappings.value = next
    saveMidiMappings()
  }

  function incomingCC(cc, device = null, channel = null) {
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

  function incomingNote(note, device = null, channel = null) {
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

  /**
   * Handle incoming velocity to modulate target CCs
   */
  function handleVelocity(velocity, channel = null) {
    if (!velocityConfig.value.active) return

    const midiStore = useMidiStore()
    const presetStore = usePresetStore()
    const lastPreset = presetStore.lastPreset
    
    if (!lastPreset) {
      if (window.SY_LOG) window.SY_LOG(`[VEL] Blocked: No active preset`);
      return
    }

    const field = velocityConfig.value.targetParameter
    const amount = velocityConfig.value.amount
    
    if (amount === 0) {
      // Silence log if amount is 0 to avoid clutter
      return
    }

    const cc = FIELD_TO_CC[field]
    if (cc === undefined) {
      if (window.SY_LOG) window.SY_LOG(`[VEL] Blocked: Field ${field} has no CC mapping`);
      return
    }

    // Get base value from current preset data (account for AB engine with symmetric A/B variants)
    const activeVariant = presetStore.useAlternativeEngine ? lastPreset.bVariant : lastPreset.aVariant
    const targetData = activeVariant?.data || lastPreset.data || {}

    if (!targetData || Object.keys(targetData).length === 0) {
      if (window.SY_LOG) window.SY_LOG(`[VEL] Blocked: No target data for engine`);
      return
    }

    const baseValue = targetData[field] ?? 64
    
    // Normalize velocity (0-127) to 0-1
    let x = velocity / 127

    const curve = velocityConfig.value.curve
    // Apply Curve
    if (curve === 'exp') {
      x = Math.pow(x, 2)
    } else if (curve === 'log') {
      x = Math.sqrt(x)
    }

    // Calculate modulation: amount is percentage (-100 to 100)
    const modulation = Math.round(x * (amount / 100) * 127)
    
    const modulatedValue = Math.max(0, Math.min(127, baseValue + modulation))
    
    // Send CC
    if (window.SY_LOG && velocity > 0) {
      window.SY_LOG(`[VEL] Modulating ${field} (CC ${cc}): ${baseValue} -> ${modulatedValue} (vel: ${velocity})`);
    }
    midiStore.sendCC(cc, modulatedValue)
  }

  /**
   * Restore original values from the preset for all modulated fields
   */
  function restoreOriginalValues() {
    const midiStore = useMidiStore()
    const presetStore = usePresetStore()
    const lastPreset = presetStore.lastPreset
    if (!lastPreset) return

    const field = velocityConfig.value.targetParameter
    const cc = FIELD_TO_CC[field]
    if (cc === undefined) return

    // Account for AB engine with symmetric A/B variants
    const activeVariant = presetStore.useAlternativeEngine ? lastPreset.bVariant : lastPreset.aVariant
    const targetData = activeVariant?.data || lastPreset.data || {}

    if (!targetData) return;

    const originalValue = targetData[field]
    if (originalValue !== undefined) {
      midiStore.sendCC(cc, originalValue)
    }
  }

  async function loadAppMidiMappings() {
    try {
      const snap = await getDoc(doc(db, IDB_COLLECTION, IDB_DOC_NAME))
      if (snap.exists() && Array.isArray(snap.data().mappings)) {
        appMidiMappings.value = snap.data().mappings
      }
    } catch (e) {
      console.error('Failed to load app MIDI mappings', e)
    }
  }

  async function saveAppMidiMappings(mappings) {
    appMidiMappings.value = mappings
    await setDoc(doc(db, IDB_COLLECTION, IDB_DOC_NAME), { mappings })
  }

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
    loadAppMidiMappings, saveAppMidiMappings,
    velocityConfig, handleVelocity, restoreOriginalValues, toggleVelocityMapping,
    presets, activePresetId,
    loadPresets, savePreset, loadPreset, deletePreset, duplicatePreset,
  }
})
