import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db, getDoc, setDoc, doc } from '@/lib/idb'
import { useMidiStore } from './useMidiStore'
import { usePresetStore } from './usePresetStore'
import { FIELD_TO_CC } from '@/constants/s1-config'

const LS_MIDI_MAPPINGS = 'midiMappings'
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
  const learnedDevice   = ref(null)
  const learnedChannel  = ref(null)
  
  // Velocity Modulation State (Refactored to match React original)
  const velocityConfig = ref({
    active: false,
    targetParameter: 'cutoff',
    amount: 0,
    curve: 'linear'
  })
  const velocityMemory = ref({}) // Map to store original values before modulation

  const mappingCount = computed(() => Object.keys(midiMappings.value).length)

  function saveMidiMappings() {
    localStorage.setItem(LS_MIDI_MAPPINGS, JSON.stringify(midiMappings.value))
  }

  function startLearn() {
    learnedCC.value      = null
    learnedDevice.value  = null
    learnedChannel.value = null
    isMidiLearning.value = true
  }

  function cancelLearn() {
    learnedCC.value      = null
    learnedDevice.value  = null
    learnedChannel.value = null
    isMidiLearning.value = false
  }

  function confirmLearn(paramName) {
    if (learnedCC.value !== null) {
      // Key format: Device:Channel:CC
      const keyParts = []
      if (learnedDevice.value) keyParts.push(learnedDevice.value)
      if (learnedChannel.value !== null) keyParts.push(`CH${learnedChannel.value + 1}`)
      keyParts.push(`CC${learnedCC.value}`)
      
      const key = keyParts.join(':')
      
      midiMappings.value = {
        ...midiMappings.value,
        [key]: {
          cc: learnedCC.value,
          device: learnedDevice.value,
          channel: learnedChannel.value,
          paramName
        }
      }
      saveMidiMappings()
    }
    learnedCC.value      = null
    learnedDevice.value  = null
    learnedChannel.value = null
    isMidiLearning.value = false
  }

  function removeMapping(key) {
    const next = { ...midiMappings.value }
    delete next[key]
    midiMappings.value = next
    saveMidiMappings()
  }

  function incomingCC(cc, device = null, channel = null) {
    if (isMidiLearning.value) {
      learnedCC.value = cc
      learnedDevice.value = device
      learnedChannel.value = channel
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
    isMidiLearning, learnedCC, learnedDevice, learnedChannel,
    mappingCount,
    startLearn, cancelLearn, confirmLearn, removeMapping, incomingCC,
    loadAppMidiMappings, saveAppMidiMappings,
    velocityConfig, handleVelocity, restoreOriginalValues, toggleVelocityMapping
  }
})
