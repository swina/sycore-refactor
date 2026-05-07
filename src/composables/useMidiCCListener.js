import { onMounted, onUnmounted } from 'vue'
import { midiService }      from '@/core/midi/MidiService'
import { useMidiStore }     from '@/stores/useMidiStore'
import { useMappingStore }  from '@/stores/useMappingStore'
import { useUiStore }       from '@/stores/useUiStore'
import { usePresetStore }   from '@/stores/usePresetStore'
import { useConfigStore }   from '@/stores/useConfigStore'
import { useAppActions }    from './useAppActions'
import { CONTINUOUS_ACTIONS } from '@/lib/app-midi-actions'
import { FIELD_TO_CC, S1_CC_MAP } from '@/constants/s1-config'

/**
 * Registers CC, note, and pitch-bend listeners once on mount.
 * Handlers read current store state at call time (no stale-closure issue
 * since Pinia state is always live).
 *
 * Routing order for CC messages:
 *   1. MIDI Learn capture (mappingStore.isMidiLearning)
 *   2. Custom CC→param mapping (mappingStore.midiMappings)
 *   3. AppAction mapping (mappingStore.appMidiMappings — handled via raw listener)
 *   4. Normal param update (presetStore.lastPreset + send to hardware if echo)
 */
export function useMidiCCListener() {
  const midiStore    = useMidiStore()
  const mappingStore = useMappingStore()
  const uiStore      = useUiStore()
  const presetStore  = usePresetStore()
  const configStore  = useConfigStore()
  const { dispatchAction } = useAppActions()

  // Stable mod-wheel override map (mirrors MidiApp's originalModValueMap ref)
  const originalModValueMap = {}

  function onCC(cc, val, chan) {
    const midiCh    = midiStore.midiChannel - 1
    const inputCh   = midiStore.midiInputChannel    // -1 = OMNI
    const isControl = chan === midiCh
    const isInput   = inputCh === -1 || chan === inputCh

    if (!isControl && !isInput) return

    // 1. MIDI Learn capture
    if (mappingStore.isMidiLearning) {
      mappingStore.incomingCC(cc)
      return
    }

    // 2. Remap CC via custom mapping (only from input channel, not control channel)
    let effectiveCC = cc
    if (isInput && !isControl && mappingStore.midiMappings[cc]) {
      const mappedName = mappingStore.midiMappings[cc]
      const cfg = configStore.midiConfig.find(m => m.name === mappedName)
      if (cfg) effectiveCC = cfg.cc
    }

    // 3. Echo / thru logic — forward when input and output are different devices
    const thruMode  = midiStore.selectedInputDevice &&
                      midiStore.selectedDevice &&
                      midiStore.selectedInputDevice !== midiStore.selectedDevice
    const shouldEcho = thruMode

    // 4. Global mod-wheel CC redirect
    if (effectiveCC === 1 && uiStore.globalModCC !== 1) {
      const targetCfg = configStore.midiConfig.find(m => m.cc === uiStore.globalModCC)
      if (targetCfg) {
        if (val > 3) {
          if (!(uiStore.globalModCC in originalModValueMap)) {
            originalModValueMap[uiStore.globalModCC] =
              presetStore.lastPreset?.data?.[targetCfg.name] ?? 0
          }
          if (shouldEcho) midiStore.sendCC(uiStore.globalModCC, val)
          applyParam(targetCfg.name, val)
        } else {
          const base = originalModValueMap[uiStore.globalModCC] ?? 0
          delete originalModValueMap[uiStore.globalModCC]
          if (shouldEcho) midiStore.sendCC(uiStore.globalModCC, base)
          applyParam(targetCfg.name, base)
        }
      } else if (shouldEcho) {
        midiStore.sendCC(uiStore.globalModCC, val)
      }
      return
    }

    // 5. Normal param update via dynamic config
    const paramCfg = configStore.midiConfig.find(m => m.cc === effectiveCC)
    if (paramCfg) {
      applyParam(paramCfg.name, val)
      if (shouldEcho) midiStore.sendCC(effectiveCC, val)
      return
    }

    // 5b. Fallback: S-1 hardware CC map — ensures knob moves always update
    //     lastPreset even when midiConfig doesn't cover every CC
    const s1Field = S1_CC_MAP[effectiveCC]
    if (s1Field) {
      applyParam(s1Field, val)
      if (shouldEcho) midiStore.sendCC(effectiveCC, val)
      return
    }

    // 6. Fallback: echo raw CC
    if (shouldEcho) midiStore.sendCC(effectiveCC, val)
  }

  function applyParam(fieldName, val) {
    if (!presetStore.lastPreset) return
    presetStore.updateFieldValue(fieldName, val)
  }

  // AppAction raw listeners (per-device, direct midimessage events)
  const appActionHandlers = []

  function setupAppActionListeners() {
    cleanupAppActionListeners()
    const mappings = mappingStore.appMidiMappings
    if (!mappings.length || !midiStore.inputs.length) return

    midiStore.inputs.forEach(input => {
      const devMappings = mappings.filter(m => m.device === input.name)
      if (!devMappings.length) return

      const fn = (e) => {
        const data = e.data
        if (!data || data.length < 3) return
        const status = data[0]
        if ((status & 0xF0) !== 0xB0) return
        const chan = status & 0x0F
        const cc   = data[1]
        const val  = data[2]

        for (const mapping of devMappings) {
          if (mapping.cc !== cc) continue
          if (mapping.channel !== -1 && mapping.channel !== chan) continue
          if (!CONTINUOUS_ACTIONS.has(mapping.action)) {
            const mv = mapping.value ?? -1
            if (mv === -1) { if (val <= 63) continue }
            else { if (val !== mv) continue }
          }
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

  let unsubCC, unsubNote, unsubPitch

  onMounted(() => {
    // Subscribe once — handlers read live store state at call time
    unsubCC    = midiService.addCCListener(onCC)
    unsubNote  = midiService.addNoteListener(onNote)
    unsubPitch = midiService.addPitchBendListener(onPitchBend)
    setupAppActionListeners()
  })

  onUnmounted(() => {
    unsubCC?.()
    unsubNote?.()
    unsubPitch?.()
    cleanupAppActionListeners()
  })

  function onNote(type, note, velocity, chan) {
    const midiCh  = midiStore.midiChannel - 1
    const inputCh = midiStore.midiInputChannel
    const isControl = chan === midiCh
    const isInput   = inputCh === -1 || chan === inputCh
    if (!isControl && !isInput) return

    const thruMode   = midiStore.selectedInputDevice &&
                       midiStore.selectedDevice &&
                       midiStore.selectedInputDevice !== midiStore.selectedDevice
    const shouldEcho = thruMode && !isControl

    if (shouldEcho) {
      if (type === 'on' && velocity > 0) midiStore.sendNoteOn(note, velocity)
      else midiStore.sendNoteOff(note)
    }
  }

  function onPitchBend(val, chan) {
    const midiCh  = midiStore.midiChannel - 1
    const inputCh = midiStore.midiInputChannel
    const isControl = chan === midiCh
    const isInput   = inputCh === -1 || chan === inputCh
    if (!isControl && !isInput) return

    const thruMode   = midiStore.selectedInputDevice &&
                       midiStore.selectedDevice &&
                       midiStore.selectedInputDevice !== midiStore.selectedDevice
    const shouldEcho = thruMode && !isControl
    if (shouldEcho) midiStore.sendPitchBend(val)
  }

  return { setupAppActionListeners }
}
