import { ref } from 'vue'
import { useMidiStore } from '@/stores/useMidiStore'
import { usePresetStore } from '@/stores/usePresetStore'
import { useDeviceRegistry } from '@/composables/useDeviceRegistry'
import { MidiSource, midiService } from '@/core/midi/midi-service'
import {
  loadPerformanceSets,
  persistPerformanceSets,
  migrateLegacyPerformanceSets,
} from '@/lib/midi-performance-sets'

// Module-level shared state — all composable instances share the same ref
// so saving from one panel is immediately visible in all others without
// needing to reload from IndexedDB.
const pcSets   = ref([])
const isLoaded = ref(false)
let _migrated  = false

/**
 * Shared Performance Sets logic — single source of truth used by
 * MidiDeviceProgramChangePanel, MasterPresetsList, LivePerformancePad,
 * LoopMachine and ChordProgSequencer.
 *
 * Sets persist per-user in IndexedDB (see lib/midi-performance-sets.ts).
 * Each device entry carries the FULL per-channel patch map (pcChannels), so
 * saving/recalling a set covers every active channel of a multi-timbral or
 * virtual instrument — not just the one active pcChannel. Recall re-sends
 * bank + program for every recorded channel through midiService (virtual
 * instruments included), which the old per-output-port recall loops could
 * not do.
 */
export function usePerformanceSets() {
  const midiStore      = useMidiStore()
  const presetStore    = usePresetStore()
  const { devices: registryDevices } = useDeviceRegistry()

  // Re-fetch from IndexedDB on every call (not cached) so a set saved in one
  // panel is visible when another panel re-opens. The localStorage migration
  // only runs once per session.
  function loadSets() {
    return (async () => {
      if (!_migrated) {
        _migrated = true
        await migrateLegacyPerformanceSets()
      }
      pcSets.value = await loadPerformanceSets()
      isLoaded.value = true
    })().catch(() => {
      pcSets.value = []
      isLoaded.value = true
    })
  }

  function persistSets() {
    return persistPerformanceSets(pcSets.value)
  }

  // Only the channels this device is actually mapped to (reg.outChannels).
  // Two app registrations pointing at the same standalone multipart synth
  // must not snapshot the full pcChannels map — otherwise each would save
  // every recorded channel and recalling one would re-send all of them,
  // clobbering the other registration's patches. Devices without an
  // outChannels mapping keep every recorded channel.
  function _mappedPcChannels(reg) {
    const all = reg?.pcChannels ? JSON.parse(JSON.stringify(reg.pcChannels)) : {}
    const mapped = reg?.outChannels?.length
      ? new Set(reg.outChannels.map(c => String(c)))
      : null
    if (!mapped) return all
    return Object.fromEntries(Object.entries(all).filter(([ch]) => mapped.has(ch)))
  }

  // Snapshot of the current channel/patch configuration of every PC-enabled
  // device (registrations + virtual instruments), mirroring the device list
  // MidiDeviceProgramChangePanel.vue shows. pcChannels is restricted to the
  // device's mapped channels (see _mappedPcChannels).
  function _snapshotDevices() {
    if (!midiStore.routingConfig?.registrations) return []
    const instrumentNames = new Set(
      registryDevices.value
        .filter(d => d.type === 'instrument-single' || d.type === 'instrument-multi')
        .map(d => d.name)
    )
    midiStore.virtualInstruments.forEach(v => instrumentNames.add(v.name))

    return Object.values(midiStore.routingConfig.registrations)
      .filter(r => r.outEnabled && (r.pcEnabled || r.pc) && instrumentNames.has(r.name))
      .map(dev => {
        const reg  = midiStore.routingConfig.registrations[dev.name]
        const isUi = (midiStore.routingMatrix?.[MidiSource.UI] ?? []).includes(dev.name)
        return {
          deviceName:     dev.name,
          pcChannel:      reg?.pcChannel ?? 0,
          pcBank:         reg?.pcBank    ?? '',
          pcProgram:      reg?.pcProgram ?? 0,
          pcMsb:          reg?.pcMsb ?? 0,
          pcLsb:          reg?.pcLsb ?? 0,
          pcTemplate:     reg?.pcTemplate ?? 'standard',
          pcChannels:     _mappedPcChannels(reg),
          isUiDevice:     isUi,
          lastPresetId:   isUi ? (presetStore.lastPreset?.id   ?? null) : null,
          lastPresetName: isUi ? (presetStore.lastPreset?.name ?? null) : null,
        }
      })
  }

  async function saveSet(name) {
    if (!name?.trim()) return null
    const set = {
      id:          Date.now().toString(),
      name,
      createdAt:   new Date().toISOString(),
      midiChannel: midiStore.midiChannel,
      devices:     _snapshotDevices(),
    }
    pcSets.value = [set, ...pcSets.value]
    await persistSets()
    return set
  }

  async function updateSet(id) {
    const snapshot = _snapshotDevices()
    pcSets.value = pcSets.value.map(s =>
      s.id === id
        ? { ...s, devices: snapshot, midiChannel: midiStore.midiChannel, updatedAt: new Date().toISOString() }
        : s
    )
    await persistSets()
  }

  async function deleteSet(id) {
    pcSets.value = pcSets.value.filter(s => s.id !== id)
    await persistSets()
  }

  async function recallSet(set) {
    if (!set) return
    try {
      if (set.midiChannel) midiStore.setMidiChannel(set.midiChannel)
    } catch (e) {
      console.warn('[PerformanceSets] setMidiChannel failed', e)
    }
    // Restore every device independently — a failing entry (e.g. a UI preset
    // recall error) must never skip the program-change send for the others.
    set.devices.forEach(entry => {
      try {
        const reg = midiStore.routingConfig?.registrations?.[entry.deviceName]
        if (!reg) return
        midiStore.updateRegistration(entry.deviceName, 'pcChannel',  entry.pcChannel)
        midiStore.updateRegistration(entry.deviceName, 'pcBank',     entry.pcBank)
        midiStore.updateRegistration(entry.deviceName, 'pcProgram',  entry.pcProgram)
        midiStore.updateRegistration(entry.deviceName, 'pcMsb',      entry.pcMsb ?? 0)
        midiStore.updateRegistration(entry.deviceName, 'pcLsb',      entry.pcLsb ?? 0)
        midiStore.updateRegistration(entry.deviceName, 'pcChannels', JSON.parse(JSON.stringify(entry.pcChannels ?? {})))
        if (entry.isUiDevice && entry.lastPresetId) {
          const preset = presetStore.history.find(p => p.id === entry.lastPresetId)
          if (preset) presetStore.recallPreset(preset, false)
        }
      } catch (e) {
        console.warn(`[PerformanceSets] Failed to restore device "${entry.deviceName}"`, e)
      }
    })
    // Cycle every program change in the restored registrations — the same
    // data the panel's "Current Program Change" list shows — and send each
    // through the exact port resolution patch clicks use.
    sendStoredProgramChanges(set)
  }

  function _sendToDevice(deviceName, data) {
    if (!deviceName) return
    if (midiStore.virtualInstruments.some(v => v.name === deviceName)) {
      midiService.sendRawToDeviceByName(deviceName, data)
    } else {
      // Same proven resolution as the panel's sendToDeviceMessage(): direct
      // MIDIOutput.send() for physical ports, so recall reaches hardware
      // exactly like clicking a patch does. Logged to the MIDI monitor so
      // the recall shows up under the device's Program Changes.
      const port = midiStore.outputs.find(o => o.name === deviceName)
      if (port) {
        try {
          port.send(data)
          midiService.logOutbound(deviceName, data)
        } catch (e) {
          console.warn(`[PerformanceSets] send to "${deviceName}" failed`, e)
        }
      }
    }
  }

  function sendStoredProgramChanges(set) {
    const names = new Set(set.devices.map(d => d.deviceName))
    Object.values(midiStore.routingConfig?.registrations ?? {})
      .filter(reg => names.has(reg.name))
      .forEach(reg => {
        const isEmu = reg.pcTemplate === 'emulatorx3'
        const mapped = reg.outChannels?.length
          ? new Set(reg.outChannels.map(c => String(c)))
          : null
        const channels = { ...(reg.pcChannels ?? {}) }
        const activeCh = Math.max(0, reg.pcChannel ?? 0)
        const active = channels[activeCh]
          ?? ((mapped && !mapped.has(String(activeCh)))
            ? null
            : (reg.pcProgram != null
              ? { program: reg.pcProgram, msb: reg.pcMsb ?? 0, lsb: reg.pcLsb ?? 0 }
              : null))
        if (active) channels[activeCh] = active
        Object.entries(channels).forEach(([chStr, info]) => {
          if (!info || info.program == null) return
          // Only ever send the device's mapped channels — a legacy set saved
          // before the save-side filter still holds unmapped channels, and
          // those must not be re-sent (they'd clobber another registration
          // that shares this multipart synth).
          if (mapped && !mapped.has(chStr)) return
          const ch = Math.max(0, parseInt(chStr, 10) || 0)
          const msb = info.msb ?? 0
          const lsb = info.lsb ?? 0
          if (isEmu) {
            _sendToDevice(reg.name, [0xB0 | ch, 64, 0])
            _sendToDevice(reg.name, [0xB0 | ch, 32, lsb])
          } else {
            _sendToDevice(reg.name, [0xB0 | ch, 0, msb])
            _sendToDevice(reg.name, [0xB0 | ch, 32, lsb])
          }
          _sendToDevice(reg.name, [0xC0 | ch, info.program])
          console.log(`[PerformanceSets] PC → ${reg.name} ch${ch + 1}: MSB=${msb} LSB=${lsb} PC=${info.program}`)
        })
      })
  }

  return {
    pcSets,
    isLoaded,
    loadSets,
    persistSets,
    saveSet,
    updateSet,
    deleteSet,
    recallSet,
  }
}
