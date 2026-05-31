import { ref } from 'vue'

export const KEY_FILE_NAMES = [
  'C Major / A min', 'Db Major / Bb min', 'D Major / B min',
  'Eb Major / C min', 'E Major / C# min', 'F Major / D min',
  'Gb Major / Eb min', 'G Major / E min', 'Ab Major / F min',
  'A Major / F# min', 'Bb Major / G min', 'B Major / G# min',
  'Modal Chords',
  '· Blues', '· Jazz', '· Pop', '· Rock',
  '· R&B / Soul', '· Latin', '· EDM', '· Funk',
]

const KEY_FILE_MAP = [
  '01-CMajor-Aminor.json',
  '02-DbMajor-Bbminor.json',
  '03-DMajor-Bminor.json',
  '04-EbMajor-Cminor.json',
  '05-EMajor-C#minor.json',
  '06-FMajor-Dminor.json',
  '07-GbMajor-Ebminor.json',
  '08-GMajor-Eminor.json',
  '09-AbMajor-Fminor.json',
  '10-AMajor-F#minor.json',
  '11-BbMajor-Gminor.json',
  '12-BMajor-G#minor.json',
  null,
  'Genre-Blues.json',
  'Genre-Jazz.json',
  'Genre-Pop.json',
  'Genre-Rock.json',
  'Genre-RnB.json',
  'Genre-Latin.json',
  'Genre-EDM.json',
  'Genre-Funk.json',
]

// Vite glob import for all progression JSON files
const progressionModules = import.meta.glob('../data/progressions/*.json')

function normalizeChord(entry) {
  if (!Array.isArray(entry) || entry.length < 2) return null
  const [name, second] = entry
  // Format A (key files): ["ChordName", [note1, note2, ...]]
  if (Array.isArray(second) && (second.length === 0 || typeof second[0] === 'number')) {
    return { chordName: String(name), notes: second.map(Number) }
  }
  // Format B (custom files): ["DisplayName", ["ChordType", [note1, ...]]]
  if (Array.isArray(second) && second.length === 2 && Array.isArray(second[1])) {
    return { chordName: String(name), notes: second[1].map(Number) }
  }
  return null
}

function normalizeRaw(raw) {
  const result = {}
  for (const [name, chords] of Object.entries(raw)) {
    if (Array.isArray(chords)) {
      const normalized = chords.map(normalizeChord).filter(Boolean)
      if (normalized.length) result[name] = normalized
    }
  }
  return result
}

const fileCache = new Map()
let modalChordsCache = null

export function useProgressionLoader() {
  const progressionData = ref({})
  const progressionNames = ref([])
  const loading = ref(false)

  async function loadKeyFile(keyIndex) {
    const filename = KEY_FILE_MAP[keyIndex]
    if (!filename) return

    if (fileCache.has(filename)) {
      const data = fileCache.get(filename)
      progressionData.value = data
      progressionNames.value = Object.keys(data)
      return
    }

    loading.value = true
    try {
      const modulePath = Object.keys(progressionModules).find(k => k.endsWith(filename))
      if (!modulePath) throw new Error(`Progression file not found: ${filename}`)
      const mod = await progressionModules[modulePath]()
      const data = normalizeRaw(mod.default ?? mod)
      fileCache.set(filename, data)
      progressionData.value = data
      progressionNames.value = Object.keys(data)
    } catch (e) {
      console.error('[ProgressionLoader]', e)
    } finally {
      loading.value = false
    }
  }

  async function loadModalChords() {
    if (modalChordsCache) {
      progressionData.value = modalChordsCache
      progressionNames.value = Object.keys(modalChordsCache)
      return
    }

    loading.value = true
    try {
      const modulePath = Object.keys(progressionModules).find(k => k.endsWith('ModalChords.json'))
      if (!modulePath) throw new Error('ModalChords.json not found')
      const mod = await progressionModules[modulePath]()
      modalChordsCache = normalizeRaw(mod.default ?? mod)
      progressionData.value = modalChordsCache
      progressionNames.value = Object.keys(modalChordsCache)
    } catch (e) {
      console.error('[ProgressionLoader] modal chords error', e)
    } finally {
      loading.value = false
    }
  }

  async function loadByIndex(index) {
    if (index === 12) {
      await loadModalChords()
    } else {
      await loadKeyFile(index)
    }
  }

  return { progressionData, progressionNames, loading, loadKeyFile, loadModalChords, loadByIndex }
}
