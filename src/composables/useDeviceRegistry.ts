import { ref, computed, onUnmounted } from 'vue'
import { deviceRegistry, type MidiDeviceDescriptor, type DeviceType } from '@/core/midi/DeviceRegistry'

const devices = ref<MidiDeviceDescriptor[]>(deviceRegistry.getAll())

// Single shared listener so all composable instances stay in sync
deviceRegistry.onChange(() => {
  devices.value = deviceRegistry.getAll()
})

export function useDeviceRegistry() {
  const onlineDevices = computed(() => devices.value.filter(d => d.online))
  const offlineDevices = computed(() => devices.value.filter(d => !d.online))
  const controllers = computed(() => devices.value.filter(d => d.type === 'controller'))
  const instruments = computed(() =>
    devices.value.filter(d => d.type === 'instrument-single' || d.type === 'instrument-multi')
  )
  const audioInterfaces = computed(() => devices.value.filter(d => d.type === 'audio-interface'))

  function setDeviceType(id: string, type: DeviceType) {
    deviceRegistry.setType(id, type)
  }

  function removeDevice(id: string) {
    deviceRegistry.remove(id)
  }

  function clearOffline() {
    const offline = devices.value.filter(d => !d.online).map(d => d.id)
    offline.forEach(id => deviceRegistry.remove(id))
  }

  return {
    devices,
    onlineDevices,
    offlineDevices,
    controllers,
    instruments,
    audioInterfaces,
    setDeviceType,
    removeDevice,
    clearOffline,
  }
}
