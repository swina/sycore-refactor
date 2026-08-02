import { ref } from 'vue'
import { idbDeviceImagePut, idbDeviceImageDelete, idbDeviceImageGetAll } from '@/lib/idb'

// Module-level singleton — one shared image map across every panel that
// shows devices (DeviceListPanel.vue, MidiDevices.vue), so uploading/removing
// an image in one place is reflected everywhere immediately.
const images = ref({})   // deviceName -> data: URI
let loadPromise = null

function ensureLoaded() {
  if (!loadPromise) {
    loadPromise = idbDeviceImageGetAll().then(all => { images.value = all })
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

export function useDeviceImages() {
  ensureLoaded()

  async function setImage(deviceName, file) {
    const dataUrl = await readAsDataUrl(file)
    await idbDeviceImagePut(deviceName, dataUrl)
    images.value = { ...images.value, [deviceName]: dataUrl }
  }

  async function removeImage(deviceName) {
    await idbDeviceImageDelete(deviceName)
    const next = { ...images.value }
    delete next[deviceName]
    images.value = next
  }

  // Carries an uploaded image over to a device's new name — used when
  // renaming a virtual instrument so its image doesn't just vanish.
  async function renameImage(oldName, newName) {
    const dataUrl = images.value[oldName]
    if (!dataUrl) return
    await idbDeviceImagePut(newName, dataUrl)
    await idbDeviceImageDelete(oldName)
    const next = { ...images.value }
    delete next[oldName]
    next[newName] = dataUrl
    images.value = next
  }

  return { images, setImage, removeImage, renameImage }
}
