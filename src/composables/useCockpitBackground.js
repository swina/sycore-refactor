import { ref } from 'vue'
import { idbCockpitBackgroundPut, idbCockpitBackgroundGet, idbCockpitBackgroundDelete } from '@/lib/idb'

// Module-level singleton — shared across every place the DECK is rendered,
// so setting/clearing the background is reflected everywhere immediately.
const backgroundImage = ref(null)  // data: URI, or null for the default background
let loadPromise = null

function ensureLoaded() {
  if (!loadPromise) {
    loadPromise = idbCockpitBackgroundGet().then(dataUrl => { backgroundImage.value = dataUrl ?? null })
  }
  return loadPromise
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function useCockpitBackground() {
  ensureLoaded()

  async function setBackgroundImage(file) {
    const dataUrl = await readAsDataUrl(file)
    await idbCockpitBackgroundPut(dataUrl)
    backgroundImage.value = dataUrl
  }

  async function resetBackgroundImage() {
    await idbCockpitBackgroundDelete()
    backgroundImage.value = null
  }

  return { backgroundImage, setBackgroundImage, resetBackgroundImage }
}
