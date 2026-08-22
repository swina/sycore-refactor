import { ref } from 'vue'
import { useMidiStore } from '@/stores/useMidiStore'
import { MidiSource, midiService } from '@/core/midi/midi-service'
import {
  loadSoloSets as loadSoloSetsFromIdb,
  persistSoloSets as persistSoloSetsToIdb,
  LS_SOLO_SLOTS,
} from '@/lib/midi-performance-sets'
import { userKey } from '@/lib/userKey'

// ─── Module-level shared state ──────────────────────────────────────────────
const soloSets   = ref([])
const soloSlots  = ref([])
const isLoaded   = ref(false)

// ─── Slot letters A-H ───────────────────────────────────────────────────────
export const SOLO_SLOT_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

// ─── Helpers ─────────────────────────────────────────────────────────────────
function loadSlotsFromLs() {
  try {
    const raw = localStorage.getItem(userKey(LS_SOLO_SLOTS))
    return raw ? JSON.parse(raw) : Array(8).fill(null)
  } catch {
    return Array(8).fill(null)
  }
}

function saveSlotsToLs(slots) {
  try {
    localStorage.setItem(userKey(LS_SOLO_SLOTS), JSON.stringify(slots))
  } catch {}
}

// ─── Composable ─────────────────────────────────────────────────────────────
export function useSoloPerformanceSets() {
  const midiStore = useMidiStore()

  async function load() {
    soloSets.value = await loadSoloSetsFromIdb()
    soloSlots.value = loadSlotsFromLs()
    isLoaded.value = true
  }

  async function saveSoloSet(name, deviceName, pcData) {
    if (!name?.trim() || !deviceName) return null
    const set = {
      id: Date.now().toString(),
      name: name.trim(),
      deviceName,
      pcChannel: pcData.pcChannel ?? 0,
      pcProgram: pcData.pcProgram ?? 0,
      pcMsb: pcData.pcMsb ?? 0,
      pcLsb: pcData.pcLsb ?? 0,
      pcTemplate: pcData.pcTemplate ?? 'standard',
      soundName: pcData.soundName ?? '',
      createdAt: new Date().toISOString(),
    }
    soloSets.value = [set, ...soloSets.value]
    await persistSoloSetsToIdb(soloSets.value)
    return set
  }

  async function deleteSoloSet(id) {
    soloSets.value = soloSets.value.filter(s => s.id !== id)
    // Clear any slot referencing this set
    soloSlots.value = soloSlots.value.map(slot => slot?.soloSetId === id ? null : slot)
    saveSlotsToLs(soloSlots.value)
    await persistSoloSetsToIdb(soloSets.value)
  }

  function assignSlot(idx, soloSetId) {
    if (idx < 0 || idx > 7) return
    const slots = [...soloSlots.value]
    slots[idx] = soloSetId ? { idx, soloSetId } : null
    soloSlots.value = slots
    saveSlotsToLs(slots)
  }

  function clearSlot(idx) {
    assignSlot(idx, null)
  }

  function triggerSlot(idx) {
    const slot = soloSlots.value[idx]
    if (!slot?.soloSetId) return
    const set = soloSets.value.find(s => s.id === slot.soloSetId)
    if (!set) return
    const ch = set.pcChannel ?? 0
    const msb = set.pcMsb ?? 0
    const lsb = set.pcLsb ?? 0
    const prog = set.pcProgram
    if (prog == null) return

    if (set.pcTemplate === 'emulatorx3') {
      midiService.sendRawToDeviceByName(set.deviceName, [0xB0 | ch, 64, 0])
      midiService.sendRawToDeviceByName(set.deviceName, [0xB0 | ch, 32, lsb])
    } else {
      midiService.sendRawToDeviceByName(set.deviceName, [0xB0 | ch, 0, msb])
      midiService.sendRawToDeviceByName(set.deviceName, [0xB0 | ch, 32, lsb])
    }
    midiService.sendRawToDeviceByName(set.deviceName, [0xC0 | ch, prog])
  }

  function getSetById(id) {
    return soloSets.value.find(s => s.id === id) ?? null
  }

  function getSlotAssignment(idx) {
    const slot = soloSlots.value[idx]
    if (!slot?.soloSetId) return null
    return getSetById(slot.soloSetId)
  }

  return {
    soloSets,
    soloSlots,
    isLoaded,
    load,
    saveSoloSet,
    deleteSoloSet,
    assignSlot,
    clearSlot,
    triggerSlot,
    getSetById,
    getSlotAssignment,
  }
}
