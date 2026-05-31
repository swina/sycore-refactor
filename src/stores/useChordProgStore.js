import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useAuthStore } from './useAuthStore'
import { db, doc, collection, getDocs, setDoc, deleteDoc } from '@/lib/idb'

export const DURATION_OPTIONS = [
  '8m', '4m', '2m', '1m',
  '2n.', '2n',
  '4n.', '4n', '4t',
  '8n.', '8n', '8t',
  '16n.', '16n', '16t',
  '32n', '64n', '128n',
]

export const DURATION_LABELS = {
  '8m': '8/1', '4m': '4/1', '2m': '2/1', '1m': '1/1',
  '2n.': '3/4', '2n': '1/2',
  '4n.': '3/8', '4n': '1/4', '4t': '1/4T',
  '8n.': '3/16', '8n': '1/8', '8t': '1/8T',
  '16n.': '3/32', '16n': '1/16', '16t': '1/16T',
  '32n': '1/32', '64n': '1/64', '128n': '1/128',
}

export const DEFAULT_CHORD_STEP = {
  active: false,
  chordName: '—',
  notes: [],
  velocity: 100,
  duration: '4n',
  gate: 80,
  transpose: 0,
}

const STORAGE_KEY = 'SYCORE_CHORD_PROG_STATE'

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
  } catch {
    return null
  }
}

export const useChordProgStore = defineStore('chordProg', () => {
  const authStore = useAuthStore()
  const saved = loadSaved()

  const steps = ref(
    saved?.steps
      ? saved.steps.map(s => ({ ...DEFAULT_CHORD_STEP, ...s }))
      : Array(16).fill(null).map(() => ({ ...DEFAULT_CHORD_STEP }))
  )
  const numSteps = ref(saved?.numSteps ?? 8)
  const isPlaying = ref(false)
  const currentStep = ref(0)
  const selectedStepIdx = ref(0)
  const selectedKey = ref(saved?.selectedKey ?? 0)
  const playMode = ref(saved?.playMode ?? 'chord')
  const arpRate = ref(saved?.arpRate ?? '16n')
  const midiChannel = ref(saved?.midiChannel ?? 1)
  const libraryPatterns = ref([])
  const loadingLibrary = ref(false)

  watch([steps, numSteps, selectedKey, playMode, arpRate, midiChannel], () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        steps: steps.value,
        numSteps: numSteps.value,
        selectedKey: selectedKey.value,
        playMode: playMode.value,
        arpRate: arpRate.value,
        midiChannel: midiChannel.value,
      }))
    } catch {}
  }, { deep: true })

  function setStep(idx, data) {
    if (idx < 0 || idx >= 16) return
    steps.value[idx] = { ...steps.value[idx], ...data }
  }

  function toggleStepActive(idx) {
    if (idx < 0 || idx >= 16) return
    steps.value[idx] = { ...steps.value[idx], active: !steps.value[idx].active }
  }

  function assignChordToStep(idx, chordName, notes) {
    if (idx < 0 || idx >= 16) return
    steps.value[idx] = { ...steps.value[idx], chordName, notes: [...notes], active: true }
  }

  function cycleDuration(idx, reverse = false) {
    const step = steps.value[idx]
    if (!step) return
    const cur = DURATION_OPTIONS.indexOf(step.duration)
    const next = reverse
      ? (cur <= 0 ? DURATION_OPTIONS.length - 1 : cur - 1)
      : (cur + 1) % DURATION_OPTIONS.length
    steps.value[idx] = { ...step, duration: DURATION_OPTIONS[next] }
  }

  function loadProgressionByName(progressionData, name) {
    const chords = progressionData[name]
    if (!chords?.length) return
    for (let i = 0; i < numSteps.value; i++) {
      const chord = chords[i % chords.length]
      steps.value[i] = {
        ...DEFAULT_CHORD_STEP,
        chordName: chord.chordName,
        notes: [...chord.notes],
        active: true,
      }
    }
  }

  function generateAlgorithmic(progressionData) {
    const names = Object.keys(progressionData)
    if (!names.length) return
    const name = names[Math.floor(Math.random() * names.length)]
    loadProgressionByName(progressionData, name)
  }

  function clearSteps() {
    steps.value = Array(16).fill(null).map(() => ({ ...DEFAULT_CHORD_STEP }))
  }

  async function saveToLibrary(name) {
    if (!authStore.user) return false
    const uid = authStore.user.uid
    const id = `chordprog_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    const docRef = doc(db, 'users', uid, 'chord_progressions', id)
    await setDoc(docRef, {
      id,
      name,
      steps: JSON.parse(JSON.stringify(steps.value)),
      numSteps: numSteps.value,
      selectedKey: selectedKey.value,
      playMode: playMode.value,
      arpRate: arpRate.value,
      midiChannel: midiChannel.value,
      createdAt: new Date().toISOString(),
    })
    await loadLibrary()
    return true
  }

  async function loadLibrary() {
    if (!authStore.user) return
    loadingLibrary.value = true
    try {
      const uid = authStore.user.uid
      const colRef = collection(db, 'users', uid, 'chord_progressions')
      const snap = await getDocs(colRef)
      libraryPatterns.value = snap.docs
        .map(d => d.data())
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    } catch (e) {
      console.error('[ChordProgStore] loadLibrary error', e)
    } finally {
      loadingLibrary.value = false
    }
  }

  async function deleteFromLibrary(id) {
    if (!authStore.user) return
    const uid = authStore.user.uid
    const docRef = doc(db, 'users', uid, 'chord_progressions', id)
    await deleteDoc(docRef)
    await loadLibrary()
  }

  function loadFromDocument(pattern) {
    if (pattern.steps) steps.value = pattern.steps.map(s => ({ ...DEFAULT_CHORD_STEP, ...s }))
    if (pattern.numSteps) numSteps.value = pattern.numSteps
    if (pattern.selectedKey !== undefined) selectedKey.value = pattern.selectedKey
    if (pattern.playMode) playMode.value = pattern.playMode
    if (pattern.arpRate) arpRate.value = pattern.arpRate
    if (pattern.midiChannel) midiChannel.value = pattern.midiChannel
  }

  return {
    steps, numSteps, isPlaying, currentStep, selectedStepIdx,
    selectedKey, playMode, arpRate, midiChannel,
    libraryPatterns, loadingLibrary,
    setStep, toggleStepActive, assignChordToStep, cycleDuration,
    loadProgressionByName, generateAlgorithmic, clearSteps,
    saveToLibrary, loadLibrary, deleteFromLibrary, loadFromDocument,
  }
})
