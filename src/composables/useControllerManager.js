import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useMidiStore }    from '@/stores/useMidiStore'
import { useUiStore }      from '@/stores/useUiStore'
import { useArpStore }     from '@/stores/useArpStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { midiService }     from '@/core/midi/MidiService'
import { useLivePadStore } from '@/stores/useLivePadStore'
import { useAppActions }   from './useAppActions'
import { CONTINUOUS_ACTIONS } from '@/lib/app-midi-actions'

// Profiles
import { LaunchpadMiniMK1 } from '../core/controllers/profiles/LaunchpadMiniMK1'

const AVAILABLE_PROFILES = [
  LaunchpadMiniMK1
]

// Helper for logging to the UI panel
const log = (msg) => {
  if (window.SY_LOG) window.SY_LOG(msg)
  console.log(`[ControllerManager] ${msg}`)
}

export function useControllerManager() {
  const midiStore    = useMidiStore()
  const uiStore      = useUiStore()
  const arpStore     = useArpStore()
  const mappingStore = useMappingStore()
  const livePadStore = useLivePadStore()
  const { dispatchAction } = useAppActions()

  const activeControllers = ref([])
  const lastTriggerTimes = new Map()
  const lastCCValuePerMapping = new Map() // tracks last CC value per mapping id for rising-edge detection
  // IDs of controllers that have already received onInit — prevents re-sending the
  // hardware reset sequence when an unrelated device connects/disconnects.
  const initializedControllerIds = new Set()
  let stopWatch = null
  let lastInputCount = 0

  log('Module Loaded')

  function getAppState() {
    return {
      ui: uiStore,
      arp: arpStore,
      livePad: livePadStore,
      mappings: mappingStore.appMidiMappings,
      midiMappings: mappingStore.midiMappings,
      lpp: {
        activePerfSetIdx:  livePadStore.activePerfSetIdx,
        activeDevicePcIdx: livePadStore.activeDevicePcIdx,
        playlistIdx:       livePadStore.playlistIdx,
      },
      getActionStatus: (action) => {
        // Map action string to boolean state
        switch(action) {
          case 'toggle_visualizer': return uiStore.isVisualizerOpen
          case 'toggle_sequencer':  return uiStore.isSequencerOpen
          case 'toggle_arp':        return arpStore.arpEnabled
          case 'toggle_liveset':    return uiStore.isLiveSetOpen
          case 'toggle_looper':     return uiStore.isLooperOpen
          case 'toggle_main_menu':  return uiStore.isMainMenuOpen
          case 'open_midi_matrix':  return uiStore.isMidiMatrixOpen
          case 'toggle_midi_performance': return uiStore.isMidiPerformanceOpen
          case 'toggle_midi_capture': return uiStore.isCaptureOpen
          case 'toggle_panel':      return !uiStore.isPanelCollapsed
          case 'panel_tab_grid':      return uiStore.activeVisualizerCategory === null && !uiStore.isPanelCollapsed
          case 'panel_tab_flow':      return uiStore.activeVisualizerCategory === 'FLOW' && !uiStore.isPanelCollapsed
          case 'panel_tab_lfo':       return uiStore.activeVisualizerCategory === 'LFO' && !uiStore.isPanelCollapsed
          case 'panel_tab_osc':       return uiStore.activeVisualizerCategory === 'OSCILLATOR' && !uiStore.isPanelCollapsed
          case 'panel_tab_env':       return uiStore.activeVisualizerCategory === 'ENV' && !uiStore.isPanelCollapsed
          case 'panel_tab_filter':    return uiStore.activeVisualizerCategory === 'FILTER' && !uiStore.isPanelCollapsed
          case 'panel_tab_efx':       return uiStore.activeVisualizerCategory === 'EFX' && !uiStore.isPanelCollapsed
          case 'panel_tab_poly':      return uiStore.activeVisualizerCategory === 'POLY' && !uiStore.isPanelCollapsed
          case 'panel_tab_advanced':  return uiStore.activeVisualizerCategory === 'ADVANCED' && !uiStore.isPanelCollapsed
          case 'panel_tab_dynamic':   return uiStore.activeVisualizerCategory === 'DYNAMIC' && !uiStore.isPanelCollapsed
          case 'toggle_types':      return uiStore.isTypesOpen
          case 'toggle_history':    return uiStore.isHistoryOpen
          case 'toggle_keyboard':   return uiStore.isKeyboardOpen
          case 'toggle_midilearn':  return uiStore.isMidiMappingOpen
          case 'toggle_manual':    return uiStore.isManualOpen
          case 'toggle_help':      return uiStore.isHelpOpen
          case 'toggle_support':   return uiStore.isSupportOpen
          case 'toggle_profile':   return uiStore.isProfileOpen
          case 'toggle_admin':     return uiStore.isAdminPanelOpen
          default:
            if (action.startsWith('liveset_pad_')) {
              const idx = parseInt(action.replace('liveset_pad_', ''), 10) - 1
              return livePadStore.activePadIndex === idx
            }
            if (action.startsWith('lpp_set_')) {
              const idx = parseInt(action.slice('lpp_set_'.length), 10)
              return livePadStore.activePerfSetIdx === idx
            }
            if (action.startsWith('lpp_devpc_')) {
              const idx = parseInt(action.slice('lpp_devpc_'.length), 10)
              return livePadStore.activeDevicePcIdx === idx
            }
            if (action.startsWith('lpp_bt_')) {
              const idx = parseInt(action.slice('lpp_bt_'.length), 10)
              return livePadStore.playlistIdx === idx
            }
            return false
        }
      },
      getDeviceChannel: (name, type) => {
        const reg = midiStore.routingConfig.registrations[name]
        if (!reg) return 0
        return type === 'input' ? reg.inChannel : reg.outChannel
      }
    }
  }

  function setupControllers() {
    // Capture which controllers were previously active so we can skip re-init.
    // A controller that was already initialized keeps its LED state and doesn't
    // receive the hardware reset sequence just because an unrelated device changed.
    const previousIds = new Set(activeControllers.value.map(c => c.input.id))

    activeControllers.value = []
    const inputs = midiService.getInputs()

    // Evict IDs that are no longer connected so a re-plug triggers a fresh onInit.
    const liveIds = new Set(inputs.map(i => i.id))
    for (const id of initializedControllerIds) {
      if (!liveIds.has(id)) initializedControllerIds.delete(id)
    }
    const outputs = midiService.getOutputs()

    log(`Scanning ${inputs.length} inputs: [${inputs.map(i => i.name || i.id).join(', ')}]`)
    log(`Available outputs: [${outputs.map(o => o.name || o.id).join(', ')}]`)

    inputs.forEach(input => {
      const name = input.name || input.id
      const profile = AVAILABLE_PROFILES.find(p => p.matchName.test(name))

      if (!profile) {
        log(`No profile match for input: "${name}"`)
        return
      }

      log(`Matched profile: ${profile.name} for "${name}"`)

      // Match output by profile regex (not strict name equality) to handle OS port name differences
      const output = outputs.find(o => profile.matchName.test(o.name || o.id))
      if (output) log(`Found matching output: "${output.name}" ID=${output.id}`)
      else log(`WARNING: No output found for "${name}" — feedback disabled, onInit will still run`)

      const sendFn = output ? (data) => midiService.sendRawToDevice(output.id, data) : () => {}

      const isNew = !previousIds.has(input.id) && !initializedControllerIds.has(input.id)
      log(`isNew=${isNew} (previousIds has=${previousIds.has(input.id)}, initializedIds has=${initializedControllerIds.has(input.id)})`)

      if (isNew) {
        log(`Calling onInit for ${name}`)
        profile.onInit(sendFn)
        if (output) {
          sendFn([0xB0, 111, 63])
          setTimeout(() => sendFn([0xB0, 111, 0]), 200)
        }
        initializedControllerIds.add(input.id)
      } else {
        log(`Skipping onInit for "${name}" (already initialized)`)
      }

      activeControllers.value.push({ input, output, profile, sendFn })
    })
  }

  // Define the ingress filter once
  const handleIngress = (e) => {
    const input = e.target
    const inputId = input?.id
    const deviceName = input?.name || midiStore.inputs.find(i => i.id === inputId)?.name || inputId || 'Unknown'
    const data = e.data
    if (!data || data.length < 2) return false


    const status = data[0]
    const type = status & 0xF0
    const chan = status & 0x0F
    const cc   = type === 0xB0 ? data[1] : null
    const note = (type === 0x90 || type === 0x80) ? data[1] : null
    const val  = data[2]

    // 1. Check Custom App Mappings FIRST (User Override)
    const mappings = mappingStore.appMidiMappings

    // Rising-edge tracking: read previous CC values and update for this event.
    // Keyed by mapping id so each mapping tracks its own last-seen value independently.
    const prevCCValues = new Map()
    if (cc !== null) {
      for (const m of mappings) {
        if (m.cc !== cc) continue
        if (m.channel !== -1 && m.channel !== chan) continue
        const mName = (m.device || '').toLowerCase()
        const dName = deviceName.toLowerCase()
        if (mName !== dName && !dName.includes(mName)) continue
        prevCCValues.set(m.id, lastCCValuePerMapping.get(m.id) ?? 0)
        lastCCValuePerMapping.set(m.id, val)
      }
    }

    const matchedMapping = mappings.find(m => {
      // Robust device matching: partial and case-insensitive
      const mName = (m.device || '').toLowerCase()
      const dName = deviceName.toLowerCase()
      if (mName !== dName && !dName.includes(mName)) return false
      
      if (m.channel !== -1 && m.channel !== chan) return false
      if (m.note !== undefined && m.note !== note) return false
      if (m.cc !== undefined && m.cc !== cc) return false
      
      // For Notes: Only trigger on Press (Velocity > 0)
      if (m.note !== undefined && val === 0) return false

      // For CCs: Check trigger mode (Exact, Min threshold, or default > 63)
      if (m.cc !== undefined && !CONTINUOUS_ACTIONS.has(m.action)) {
         const mv = m.value ?? -1
         if (mv !== -1 && val !== mv) return false
         if (mv === -1 && m.minValue !== undefined && val < m.minValue) return false
         if (mv === -1 && m.minValue === undefined && val <= 63) return false
      }
      return true
    })

    if (!matchedMapping && (note !== null || cc !== null)) {
       // log(`No mapping found for ${deviceName} ${note !== null ? 'Note '+note : 'CC '+cc}`)
    }

    if (matchedMapping) {
      const action = matchedMapping.action
      const now = Date.now()
      if (now - (lastTriggerTimes.get(action) || 0) < 50) return true

      // Rising-edge guard for CC discrete (non-continuous) mappings:
      // Only fire when the value transitions INTO the triggered zone.
      // This prevents double-fire when a controller sends the same CC value
      // on both press and release (e.g. 127 + 127 instead of 127 + 0).
      if (cc !== null && matchedMapping.cc !== undefined && !CONTINUOUS_ACTIONS.has(action)) {
        const prevVal = prevCCValues.get(matchedMapping.id) ?? 0
        const mv = matchedMapping.value ?? -1
        const wasTrig = mv !== -1
          ? prevVal === mv
          : (matchedMapping.minValue !== undefined ? prevVal >= matchedMapping.minValue : prevVal > 63)
        if (wasTrig) {
          // Value was already in the triggered zone — consume but do not re-fire.
          updateFeedback()
          return matchedMapping.consume !== false
        }
      }

      lastTriggerTimes.set(action, now)

      log(`User Override: Executing Custom Action ${action}`)
      if (action !== 'pass_thru') {
        // Note mappings: normalize velocity so any press passes the >63 threshold
        const effectiveVal = matchedMapping.note !== undefined ? Math.max(data[2], 64) : data[2]
        dispatchAction(action, effectiveVal)
      }
      updateFeedback()
      return matchedMapping.consume !== false
    }

    // Special case: if a mapping exists for this note but we are at val 0 (release),
    // we MUST consume it to prevent fallthrough to native profiles or synth.
    if (note !== null && val === 0) {
       const mapped = mappings.find(m => m.device === deviceName && m.note === note)
       if (mapped) {
         updateFeedback()
         return mapped.consume !== false
       }
    }

    // 2. Fallback to Native Controller Profiles
    const ctrl = activeControllers.value.find(c => (c.input.id === inputId || (c.input.name || c.input.id) === deviceName))
    if (ctrl) {
      const handled = ctrl.profile.onMidi(data, (action, val) => {
         const now = Date.now()
         if (now - (lastTriggerTimes.get(action) || 0) < 50) return
         lastTriggerTimes.set(action, now)

         log(`Native Driver: Executing Action ${action}`)
         dispatchAction(action, val)
      }, getAppState())
      if (handled) return true
    }

    return false
  }

  function updateFeedback() {
    activeControllers.value.forEach(ctrl => {
      if (ctrl.sendFn) {
        ctrl.profile.updateFeedback(ctrl.sendFn, getAppState())
      }
    })
  }

  onMounted(() => {
    log('Mounted')
    // Set filter immediately
    midiService.setIngressFilter(handleIngress)
    
    // Force one initial check if already ready
    if (midiStore.midiReady) {
      log('MIDI already ready on mount, triggering setup')
      setupControllers()
    }

    stopWatch = watch(
      [
        () => !!midiStore.midiReady,
        () => midiStore.inputs.length,
        () => uiStore.isSequencerOpen,
        () => uiStore.isVisualizerOpen,
        () => arpStore.arpEnabled,
        () => uiStore.isLiveSetOpen,
        () => uiStore.isMidiMatrixOpen,
        () => uiStore.isCaptureOpen,
        () => uiStore.isLooperOpen,
        () => uiStore.isPanelCollapsed,
        () => livePadStore.activePadIndex,
        () => livePadStore.activePerfSetIdx,
        () => livePadStore.activeDevicePcIdx,
        () => livePadStore.playlistIdx,
        () => uiStore.activeVisualizerCategory
      ],
      ([ready, inputsLen]) => {
        if (!ready) return
        
        // Only rescan if input count changed or we have nothing yet
        const currentCount = activeControllers.value.length
        const totalInputs = midiService.getInputs().length
        
        if (currentCount === 0 || totalInputs !== lastInputCount) {
           log(`Device change detected (${totalInputs} inputs). Scanning...`)
           setupControllers()
           lastInputCount = totalInputs
        }
        updateFeedback()
      },
      { immediate: true }
    )
  })

  onUnmounted(() => {
    log('Unmounted')
    if (stopWatch) stopWatch()
    midiService.setIngressFilter(null)
    initializedControllerIds.clear()
  })

  return { setupControllers, updateFeedback }
}
