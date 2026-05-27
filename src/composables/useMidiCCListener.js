import { onMounted, onUnmounted } from 'vue'
import { midiService, MidiSource } from '@/core/midi/MidiService'
import { useMidiStore } from '@/stores/useMidiStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { useUiStore } from '@/stores/useUiStore'
import { usePresetStore } from '@/stores/usePresetStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useLfoStore } from '@/stores/useLfoStore'
import { useArpStore } from '@/stores/useArpStore'
import { FIELD_TO_CC, S1_CC_MAP } from '@/constants/s1-config'

function isS1Device(name) {
  if (!name) return false
  const upper = name.toUpperCase()
  return upper.includes('S-1') || upper.includes('ROLAND S-1')
}

export function useMidiCCListener() {
  const midiStore = useMidiStore()
  const mappingStore = useMappingStore()
  const uiStore = useUiStore()
  const presetStore = usePresetStore()
  const configStore = useConfigStore()
  const lfoStore = useLfoStore()
  const arpStore = useArpStore()

  const originalModValueMap = {}

  // NRPN assembly state keyed by "deviceName:channel"
  const nrpnState = {}

  function onCC(cc, val, chan, inputId) {
    const midiCh = midiStore.midiChannel - 1
    const inputCh = midiStore.midiInputChannel
    // Find device name for mapping lookup - using service directly for latest list
    const inputs = midiService.getInputs()
    const inputDevice = inputs.find(i => i.id === inputId)
    const deviceName = inputDevice?.name || null

    // ── NRPN assembly (CC 99 / 98 / 6) ──────────────────────────────────────
    const nrpnKey = `${deviceName ?? ''}:${chan}`
    if (cc === 99) { // NRPN Parameter Number MSB
      nrpnState[nrpnKey] = { msb: val, lsb: null }
      return
    }
    if (cc === 98) { // NRPN Parameter Number LSB
      if (nrpnState[nrpnKey]) nrpnState[nrpnKey].lsb = val
      return
    }
    if (cc === 6) { // Data Entry MSB — completes an assembled NRPN
      const nrpn = nrpnState[nrpnKey]
      if (nrpn && nrpn.msb !== null && nrpn.lsb !== null) {
        const nrpnFragment = `NRPN:${nrpn.msb}:${nrpn.lsb}`
        delete nrpnState[nrpnKey]

        if (mappingStore.isMidiLearning) {
          mappingStore.incomingNRPN(nrpn.msb, nrpn.lsb, deviceName, chan)
          return
        }

        // Lookup: Device:CH:NRPN:MSB:LSB → Device:NRPN:MSB:LSB → NRPN:MSB:LSB
        const preciseNrpnKey = deviceName
          ? `${deviceName}:CH${chan + 1}:${nrpnFragment}`
          : `CH${chan + 1}:${nrpnFragment}`
        const deviceNrpnKey = deviceName ? `${deviceName}:${nrpnFragment}` : null
        const nrpnMapping =
          mappingStore.midiMappings[preciseNrpnKey] ||
          (deviceNrpnKey ? mappingStore.midiMappings[deviceNrpnKey] : null) ||
          mappingStore.midiMappings[nrpnFragment]

        if (nrpnMapping) {
          const paramName = typeof nrpnMapping === 'object' ? nrpnMapping.paramName : nrpnMapping
          console.log(`[MIDI Listener] NRPN mapped: ${nrpnFragment} -> ${paramName} (${val})`)
          applyParam(paramName, val)
          return
        }
        // No NRPN mapping found — fall through to let CC 6 be handled as a regular CC
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    if (mappingStore.isMidiLearning) {
      mappingStore.incomingCC(cc, deviceName, chan)
      return
    }

    // 1. Check for User Mapping with high specificity (Device + Channel + CC)
    // New format: "Device:CH#:CC#"
    const preciseKey = deviceName
      ? `${deviceName}:CH${chan + 1}:CC${cc}`
      : `CH${chan + 1}:CC${cc}`

    // Fallback formats for backward compatibility
    const deviceCCKey = deviceName ? `${deviceName}:${cc}` : null
    const plainCCKey  = `${cc}`

    const mapping = mappingStore.midiMappings[preciseKey] ||
                    (deviceCCKey ? mappingStore.midiMappings[deviceCCKey] : null) ||
                    mappingStore.midiMappings[plainCCKey]

    if (mapping) {
      const paramName = typeof mapping === 'object' ? mapping.paramName : mapping
      console.log(`[MIDI Listener] Mapped input: ${deviceName || 'Unknown'} CH${chan+1} CC${cc} -> ${paramName} (${val})`)
      applyParam(paramName, val)
      return
    }

    // Filter out messages that do not come from S-1 or a device mapped to S-1
    const isS1 = isS1Device(deviceName)
    const targets = deviceName ? (midiService.getRouting(deviceName) || []) : []
    const isMappedToS1 = targets.some(target => isS1Device(target))

    if (!isS1 && !isMappedToS1) {
      if (cc !== undefined) {
        console.log(`[MIDI Listener] Filtered CC ${cc} from ${deviceName || 'Unknown'} (CH ${chan+1}): Device is not S-1 and not mapped to S-1.`)
      }
      return
    }

    // 2. Standard Channel Filtering for non-mapped messages
    const isControl = chan === midiCh
    const isInput = inputCh === -1 || chan === inputCh
    
    // Check if this device has a fixed input channel in the matrix that matches the incoming channel
    const registration = midiStore.routingConfig.registrations[deviceName]
    const isDeviceMatch = registration && (registration.inChannel === -1 || registration.inChannel === chan)

    if (!isControl && !isInput && !isDeviceMatch) {
       // Only log if it's not a noise/clock message
       if (cc !== undefined) {
         console.log(`[MIDI Listener] Filtered CC ${cc} from ${deviceName || 'Unknown'} (CH ${chan+1}). Active PART: CH ${midiCh+1}, Input: ${inputCh === -1 ? 'OMNI' : inputCh+1}`)
       }
       return
     }

    let effectiveCC = cc
    
    // Legacy mapping (CC only) - Check both string and number keys for safety
    const legacyMapping = mappingStore.midiMappings[cc] || mappingStore.midiMappings[String(cc)]
    if (isInput && !isControl && legacyMapping) {
      const mappedName = typeof legacyMapping === 'object' ? legacyMapping.paramName : legacyMapping
      const cfg = configStore.midiConfig.find(m => m.name === mappedName)
      if (cfg) effectiveCC = cfg.cc
    }

    // Modulation Wheel remapping
    if (effectiveCC === 1 && uiStore.globalModCC !== 1) {
      const targetCfg = configStore.midiConfig.find(m => m.cc === uiStore.globalModCC)
      if (targetCfg) {
        if (val > 3) {
          if (!(uiStore.globalModCC in originalModValueMap)) {
            originalModValueMap[uiStore.globalModCC] =
              presetStore.lastPreset?.data?.[targetCfg.name] ?? 0
          }
          applyParam(targetCfg.name, val)
        } else {
          const base = originalModValueMap[uiStore.globalModCC] ?? 0
          delete originalModValueMap[uiStore.globalModCC]
          applyParam(targetCfg.name, base)
        }
      }
      return
    }

    // Standard Config lookup
    const paramCfg = configStore.midiConfig.find(m => m.cc === effectiveCC)
    if (paramCfg) {
      applyParam(paramCfg.name, val)
      return
    }

    // S-1 Hardware lookup
    const s1Field = S1_CC_MAP[effectiveCC]
    if (s1Field) {
      applyParam(s1Field, val)
      return
    }
  }

  // fromNote=true: Note On trigger → toggle semantics (flip state)
  // fromNote=false: CC trigger → CC >= 64 = on, CC < 64 = off
  function applyParam(fieldName, val, fromNote = false) {
    const on = fromNote ? null : val >= 64

    if (fieldName === 'lfo1_active') {
      const target = fromNote ? !lfoStore.lfo1.active : on
      if (target !== lfoStore.lfo1.active) lfoStore.toggleLfo(1)
      return
    }
    if (fieldName === 'lfo2_active') {
      const target = fromNote ? !lfoStore.lfo2.active : on
      if (target !== lfoStore.lfo2.active) lfoStore.toggleLfo(2)
      return
    }
    if (fieldName === 'lfo1_rate') {
      lfoStore.lfo1.rate = parseFloat((0.01 + (val / 127) * (20 - 0.01)).toFixed(2))
      return
    }
    if (fieldName === 'lfo2_rate') {
      lfoStore.lfo2.rate = parseFloat((0.01 + (val / 127) * (20 - 0.01)).toFixed(2))
      return
    }
    if (fieldName === 'lfo1_depth') {
      lfoStore.lfo1.depth = Math.round((val / 127) * 100)
      return
    }
    if (fieldName === 'lfo2_depth') {
      lfoStore.lfo2.depth = Math.round((val / 127) * 100)
      return
    }
    if (fieldName === 'vel_amount') {
      mappingStore.velocityConfig.amount = Math.round((val / 127) * 200 - 100)
      return
    }
    if (fieldName === 'vel_active') {
      const target = fromNote ? !mappingStore.velocityConfig.active : on
      mappingStore.velocityConfig.active = target
      if (!target) mappingStore.restoreOriginalValues()
      return
    }
    if (fieldName === 'arp_active') {
      arpStore.arpEnabled = fromNote ? !arpStore.arpEnabled : on
      return
    }
    if (fieldName === 'arp_hold') {
      arpStore.arpHold = fromNote ? !arpStore.arpHold : on
      return
    }
    if (fieldName === 'engine_ab') {
      const useB = fromNote ? !presetStore.useAlternativeEngine : on
      presetStore.selectEngine(useB ? 'B' : 'A')
      return
    }
    if (fieldName === 'seq_play_stop') {
      const shouldPlay = fromNote ? !uiStore.isSequencerPlaying : on
      window.dispatchEvent(new CustomEvent('toggle-sequencer', { detail: { play: shouldPlay } }))
      return
    }
    if (fieldName === 'ui_panel_collapse') {
      uiStore.isPanelCollapsed = fromNote ? !uiStore.isPanelCollapsed : on
      return
    }
    if (fieldName === 'ui_cat_grid') {
      if (fromNote || on) uiStore.activeVisualizerCategory = null
      return
    }
    if (fieldName.startsWith('ui_cat_')) {
      if (fromNote || on) uiStore.activeVisualizerCategory = fieldName.slice(7)
      return
    }

    if (!presetStore.lastPreset) return
    presetStore.updateFieldValue(fieldName, val)

    const cc = FIELD_TO_CC[fieldName] ?? configStore.midiConfig.find(m => m.name === fieldName)?.cc
    if (cc !== undefined) {
      midiStore.sendCC(cc, val, null, MidiSource.UI)
    }
  }

  let unsubCC, unsubNote, unsubPitch

  onMounted(() => {
    unsubCC = midiService.addCCListener(onCC)
    unsubNote = midiService.addNoteListener(onNote)
    unsubPitch = midiService.addPitchBendListener(onPitchBend)
  })

  onUnmounted(() => {
    unsubCC?.()
    unsubNote?.()
    unsubPitch?.()
  })

  function onNote(type, note, velocity, chan, inputId) {
    const midiCh = midiStore.midiChannel - 1
    const inputCh = midiStore.midiInputChannel
    const isControl = chan === midiCh
    const isInput = inputCh === -1 || chan === inputCh

    if (!isControl && !isInput) return

    if (mappingStore.isMidiLearning) return // raw listener in MidiMapContextMenu handles this

    if (type === 'on' && velocity > 0) {
      const inputs = midiService.getInputs()
      const inputDevice = inputs.find(i => i.id === inputId)
      const deviceName = inputDevice?.name || null

      const noteFragment = `NOTE${note}`
      const preciseKey = deviceName
        ? `${deviceName}:CH${chan + 1}:${noteFragment}`
        : `CH${chan + 1}:${noteFragment}`
      const deviceKey = deviceName ? `${deviceName}:${noteFragment}` : null

      const mapping =
        mappingStore.midiMappings[preciseKey] ||
        (deviceKey ? mappingStore.midiMappings[deviceKey] : null) ||
        mappingStore.midiMappings[noteFragment]

      if (mapping) {
        const paramName = typeof mapping === 'object' ? mapping.paramName : mapping
        applyParam(paramName, velocity, true)
      }
    }
  }

  function onPitchBend(val, chan, inputId) {
    const midiCh = midiStore.midiChannel - 1
    const inputCh = midiStore.midiInputChannel
    const isControl = chan === midiCh
    const isInput = inputCh === -1 || chan === inputCh
    if (!isControl && !isInput) return

    // Pitch bend logic (already handled by thru in MidiService if enabled)
  }

  return {}
}
