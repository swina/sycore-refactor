import { onMounted, onUnmounted, watch } from 'vue'
import { midiService } from '@/core/midi/MidiService'
import { useMidiStore } from '@/stores/useMidiStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { useUiStore } from '@/stores/useUiStore'
import { usePresetStore } from '@/stores/usePresetStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useAppActions } from './useAppActions'
import { CONTINUOUS_ACTIONS } from '@/lib/app-midi-actions'
import { FIELD_TO_CC, S1_CC_MAP } from '@/constants/s1-config'

export function useMidiCCListener() {
  const midiStore = useMidiStore()
  const mappingStore = useMappingStore()
  const uiStore = useUiStore()
  const presetStore = usePresetStore()
  const configStore = useConfigStore()
  const { dispatchAction } = useAppActions()

  const originalModValueMap = {}

  function onCC(cc, val, chan, inputId) {
    const midiCh = midiStore.midiChannel - 1
    const inputCh = midiStore.midiInputChannel
    // Find device name for mapping lookup - using service directly for latest list
    const inputs = midiService.getInputs()
    const inputDevice = inputs.find(i => i.id === inputId)
    const deviceName = inputDevice?.name || null

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

  function applyParam(fieldName, val) {
    if (!presetStore.lastPreset) return
    presetStore.updateFieldValue(fieldName, val)
  }

  const appActionHandlers = []

  function setupAppActionListeners() {
    cleanupAppActionListeners()
    const mappings = mappingStore.appMidiMappings
    if (!mappings.length || !midiStore.inputs.length) return

    midiStore.inputs.forEach(input => {
      const devName = input.name || input.id
      const devMappings = mappings.filter(m => m.device === devName)
      if (!devMappings.length) return

      const fn = (e) => {
        const data = e.data
        if (!data || data.length < 3) return
        const status = data[0]
        const chan = status & 0x0F
        const isNoteOn  = (status & 0xF0) === 0x90
        const isNoteOff = (status & 0xF0) === 0x80
        const isCC      = (status & 0xF0) === 0xB0
        
        if (!isNoteOn && !isNoteOff && !isCC) return

        const note = (isNoteOn || isNoteOff) ? data[1] : null
        const cc   = isCC ? data[1] : null
        const val  = data[2]
        
        for (const mapping of devMappings) {
          // Check message type match
          if (mapping.note !== undefined && note !== mapping.note) continue
          if (mapping.cc !== undefined && cc !== mapping.cc) continue
          
          if (mapping.channel !== -1 && mapping.channel !== chan) continue
          
          // For triggers (non-continuous), check value or simply Note On
          const isContinuous = CONTINUOUS_ACTIONS.has(mapping.action)
          if (window.SY_LOG) window.SY_LOG(`[MIDI Listener] Action: ${mapping.action}, Val: ${val}, IsContinuous: ${isContinuous}`);

          if (!isContinuous) {
            // IGNORE ALL RELEASE MESSAGES for triggers
            // (Note Off or Note On with velocity 0)
            if (mapping.note !== undefined) {
              if (isNoteOff || (isNoteOn && val === 0)) continue
            } else {
              // CC trigger logic
              const mv = mapping.value ?? -1
              if (mv === -1) {
                if (val <= 63) {
                  if (window.SY_LOG) window.SY_LOG(`[MIDI Listener] Skipping trigger val ${val} for ${mapping.action}`);
                  continue
                }
              } else {
                if (val !== mv) {
                  if (window.SY_LOG) window.SY_LOG(`[MIDI Listener] Skipping non-matching val ${val} (expected ${mv}) for ${mapping.action}`);
                  continue
                }
              }
            }
          }

          if (window.SY_LOG) window.SY_LOG(`[MIDI Listener] Dispatching ${mapping.action} with val ${val}`);
          dispatchAction(mapping.action, val)
          break
        }
      }

      input.addEventListener('midimessage', fn)
      appActionHandlers.push({ input, fn })
    })
  }

  function cleanupAppActionListeners() {
    appActionHandlers.forEach(({ input, fn }) => input.removeEventListener('midimessage', fn))
    appActionHandlers.length = 0
  }

  const hwCCHandlers = []

  function setupHardwareCCListeners() {
    // Handled by onCC which is called from MidiService
  }

  function cleanupHardwareCCListeners() {
    hwCCHandlers.forEach(({ input, fn }) => input.removeEventListener('midimessage', fn))
    hwCCHandlers.length = 0
  }

  let unsubCC, unsubNote, unsubPitch, stopInputWatch

  onMounted(() => {
    unsubCC = midiService.addCCListener(onCC)
    unsubNote = midiService.addNoteListener(onNote)
    unsubPitch = midiService.addPitchBendListener(onPitchBend)
    setupAppActionListeners()
    setupHardwareCCListeners()
    
    stopInputWatch = watch(
      [() => midiStore.inputs.length, () => mappingStore.appMidiMappings], 
      () => {
        setupHardwareCCListeners()
        setupAppActionListeners()
      },
      { deep: true, immediate: true }
    )
  })

  onUnmounted(() => {
    unsubCC?.()
    unsubNote?.()
    unsubPitch?.()
    stopInputWatch?.()
    cleanupAppActionListeners()
    cleanupHardwareCCListeners()
  })

  function onNote(type, note, velocity, chan, inputId) {
    const midiCh = midiStore.midiChannel - 1
    const inputCh = midiStore.midiInputChannel
    const isControl = chan === midiCh
    const isInput = inputCh === -1 || chan === inputCh
    
    if (!isControl && !isInput) {
      // console.log(`[MIDI Debug] Ignoring note from ch ${chan+1} (Target Input Ch: ${inputCh === -1 ? 'OMNI' : inputCh+1})`)
      return
    }

    if (type === 'on' && velocity > 0) {
      // Note logic (already handled by thru in MidiService if enabled)
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

  return { setupAppActionListeners }
}
