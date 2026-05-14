import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useMidiStore }    from '@/stores/useMidiStore'
import { useUiStore }      from '@/stores/useUiStore'
import { useArpStore }     from '@/stores/useArpStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { midiService }     from '@/core/midi/MidiService'
import { useLivePadStore } from '@/stores/useLivePadStore'
import { useAppActions }   from './useAppActions'

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
  let stopWatch = null
  let lastInputCount = 0

  log('Module Loaded')

  function getAppState() {
    return {
      ui: uiStore,
      arp: arpStore,
      livePad: livePadStore,
      mappings: mappingStore.appMidiMappings,
      getActionStatus: (action) => {
        // Map action string to boolean state
        switch(action) {
          case 'toggle_visualizer': return uiStore.isVisualizerOpen
          case 'toggle_sequencer':  return uiStore.isSequencerOpen
          case 'toggle_arp':        return arpStore.arpEnabled
          case 'toggle_liveset':    return uiStore.isLiveSetOpen
          case 'toggle_looper':     return uiStore.isLooperOpen
          case 'open_midi_matrix':  return uiStore.isMidiMatrixOpen
          case 'toggle_midi_capture': return uiStore.isCaptureOpen
          case 'toggle_panel':      return !uiStore.isPanelCollapsed
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
    activeControllers.value = []
    const inputs = midiService.getInputs()
    const outputs = midiService.getOutputs()

    log(`Scanning ${inputs.length} inputs...`)

    inputs.forEach(input => {
      const name = input.name || input.id
      const profile = AVAILABLE_PROFILES.find(p => {
        const isMatch = p.matchName.test(name)
        return isMatch
      })

      if (profile) {
        log(`Matched profile: ${profile.name} for ${name}`)
        
        const output = outputs.find(o => (o.name || o.id) === name)
        if (output) log(`Found matching output for ${name}: ID=${output.id}`)
        else log(`WARNING: No output found for ${name}! Feedback will not work.`)

        const sendFn = output ? (data) => midiService.sendRawToDevice(output.id, data) : null

        if (sendFn) {
          profile.onInit(sendFn)
          // Flash the Mixer button for feedback
          sendFn([0xB0, 111, 63])
          setTimeout(() => sendFn([0xB0, 111, 0]), 200)
        }

        activeControllers.value.push({ input, output, profile, sendFn })
      }
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

      // For CCs: Check trigger mode (Exact value or Toggle > 63)
      if (m.cc !== undefined && !['transpose_cc'].includes(m.action)) {
         const mv = m.value ?? -1
         if (mv !== -1 && val !== mv) return false
         if (mv === -1 && val <= 63) return false
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
      lastTriggerTimes.set(action, now)

      log(`User Override: Executing Custom Action ${action}`)
      dispatchAction(action, data[2])
      updateFeedback()
      return true
    }

    // Special case: if a mapping exists for this note but we are at val 0 (release),
    // we MUST consume it to prevent fallthrough to native profiles or synth.
    if (note !== null && val === 0) {
       const hasMapping = mappings.some(m => m.device === deviceName && m.note === note)
       if (hasMapping) {
         updateFeedback()
         return true
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
        () => livePadStore.activePadIndex
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
  })

  return { setupControllers, updateFeedback }
}
