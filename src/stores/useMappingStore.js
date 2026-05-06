import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db, getDoc, setDoc, doc } from '@/lib/idb'

const LS_MIDI_MAPPINGS = 'midiMappings'
const IDB_APP_MAPPINGS = 'system/appMidiMappings'

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

  const mappingCount = computed(() => Object.keys(midiMappings.value).length)

  function saveMidiMappings() {
    localStorage.setItem(LS_MIDI_MAPPINGS, JSON.stringify(midiMappings.value))
  }

  function startLearn() {
    learnedCC.value    = null
    isMidiLearning.value = true
  }

  function cancelLearn() {
    learnedCC.value     = null
    isMidiLearning.value = false
  }

  function confirmLearn(paramName) {
    if (learnedCC.value !== null) {
      midiMappings.value = {
        ...midiMappings.value,
        [learnedCC.value]: paramName,
      }
      saveMidiMappings()
    }
    learnedCC.value     = null
    isMidiLearning.value = false
  }

  function removeMapping(cc) {
    const next = { ...midiMappings.value }
    delete next[cc]
    midiMappings.value = next
    saveMidiMappings()
  }

  function incomingCC(cc) {
    if (isMidiLearning.value) {
      learnedCC.value = cc
    }
  }

  async function loadAppMidiMappings() {
    try {
      const snap = await getDoc(doc(db, IDB_APP_MAPPINGS, 'data'))
      if (snap.exists() && Array.isArray(snap.data().mappings)) {
        appMidiMappings.value = snap.data().mappings
      }
    } catch (e) {
      console.error('Failed to load app MIDI mappings', e)
    }
  }

  async function saveAppMidiMappings(mappings) {
    appMidiMappings.value = mappings
    await setDoc(doc(db, IDB_APP_MAPPINGS, 'data'), { mappings })
  }

  return {
    midiMappings, appMidiMappings,
    isMidiLearning, learnedCC,
    mappingCount,
    startLearn, cancelLearn, confirmLearn, removeMapping, incomingCC,
    loadAppMidiMappings, saveAppMidiMappings,
  }
})
