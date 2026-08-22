import { ref } from 'vue'
import { MidiSource, midiService } from '@/core/midi/midi-service'
import { userKey } from '@/lib/userKey'

const LS_SLOTS = 'SYCORE_SOLO_SLOTS_V2'
const LS_SETS = 'SYCORE_SOLO_NAMED_SETS'

function loadSlots() {
  try {
    const raw = localStorage.getItem(userKey(LS_SLOTS))
    return raw ? JSON.parse(raw) : Array(8).fill(null)
  } catch { return Array(8).fill(null) }
}

function saveSlots(slots) {
  try { localStorage.setItem(userKey(LS_SLOTS), JSON.stringify(slots)) }
  catch {}
}

function loadNamedSets() {
  try {
    const raw = localStorage.getItem(userKey(LS_SETS))
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveNamedSets(sets) {
  try { localStorage.setItem(userKey(LS_SETS), JSON.stringify(sets)) }
  catch {}
}

export const SOLO_SLOT_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

// Module-level shared state
const soloSlots = ref(loadSlots())
const activeSlotIdx = ref(-1)
const namedSets = ref(loadNamedSets())

export function useSoloPerformanceSets() {
  function persist() { saveSlots(soloSlots.value) }

  function assignSlot(idx, deviceName, pcData) {
    if (idx < 0 || idx > 7) return
    const slots = [...soloSlots.value]
    slots[idx] = { deviceName, ...pcData }
    soloSlots.value = slots
    persist()
  }

  function clearSlot(idx) {
    if (idx < 0 || idx > 7) return
    const slots = [...soloSlots.value]
    slots[idx] = null
    soloSlots.value = slots
    if (activeSlotIdx.value === idx) activeSlotIdx.value = -1
    persist()
  }

  function triggerSlot(idx) {
    const slot = soloSlots.value[idx]
    if (!slot?.deviceName || slot.pcProgram == null) return
    const ch = slot.pcChannel ?? 0
    if (slot.pcTemplate === 'emulatorx3') {
      midiService.sendRawToDeviceByName(slot.deviceName, [0xB0 | ch, 64, 0])
      midiService.sendRawToDeviceByName(slot.deviceName, [0xB0 | ch, 32, slot.pcLsb ?? 0])
    } else {
      midiService.sendRawToDeviceByName(slot.deviceName, [0xB0 | ch, 0, slot.pcMsb ?? 0])
      midiService.sendRawToDeviceByName(slot.deviceName, [0xB0 | ch, 32, slot.pcLsb ?? 0])
    }
    midiService.sendRawToDeviceByName(slot.deviceName, [0xC0 | ch, slot.pcProgram])
  }

  // Named set save/recall
  function saveNamedSet(name) {
    if (!name?.trim()) return null
    const set = {
      id: Date.now().toString(),
      name: name.trim(),
      slots: JSON.parse(JSON.stringify(soloSlots.value)),
      createdAt: new Date().toISOString(),
    }
    namedSets.value = [set, ...namedSets.value]
    saveNamedSets(namedSets.value)
    return set
  }

  function deleteNamedSet(id) {
    namedSets.value = namedSets.value.filter(s => s.id !== id)
    saveNamedSets(namedSets.value)
  }

  function recallNamedSet(id) {
    const set = namedSets.value.find(s => s.id === id)
    if (!set) return
    soloSlots.value = JSON.parse(JSON.stringify(set.slots))
    activeSlotIdx.value = -1
    persist()
  }

  function refreshNamedSets() {
    namedSets.value = loadNamedSets()
  }

  return {
    soloSlots, activeSlotIdx, namedSets,
    assignSlot, clearSlot, triggerSlot,
    saveNamedSet, deleteNamedSet, recallNamedSet, refreshNamedSets,
  }
}