import { onMounted, onUnmounted, watch } from 'vue'
import { useMidiStore } from '@/stores/useMidiStore'
import { useUiStore }  from '@/stores/useUiStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useArpStore } from '@/stores/useArpStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { midiService } from '@/core/midi/MidiService'

/**
 * Manages the full MIDI initialization lifecycle:
 * - inits WebMIDI on mount, auto-detects Roland S-1
 * - opens port config panel if no S-1 is found or if connection is lost
 * - keeps BPM clock in sync with arpStore.arpBpm
 * - tears down clock on unmount
 */
export function useMidiInit() {
  const midiStore = useMidiStore()
  const uiStore   = useUiStore()
  const authStore = useAuthStore()
  const arpStore  = useArpStore()
  const mappingStore = useMappingStore()

  function checkLaunchpadMini() {
    const log = (msg) => window.SY_LOG ? window.SY_LOG(msg) : console.log(msg)

    const lpOut = midiService.getOutputs().find(o => o.name?.toLowerCase().includes('launchpad'))
    const lpIn  = midiService.getInputs().find(i => i.name?.toLowerCase().includes('launchpad'))

    if (!lpOut && !lpIn) {
      log('[Launchpad Mini] Not detected in inputs or outputs — skipping check.')
      return
    }

    log(`[Launchpad Mini] Found — Output: ${lpOut?.name ?? 'none'}, Input: ${lpIn?.name ?? 'none'}`)

    // Send: All Notes Off (CC 123 val 0, ch 1) as a benign presence ping
    if (lpOut) {
      try {
        lpOut.send([0xB0, 0x7B, 0x00])
        log(`[Launchpad Mini] Send OK — All Notes Off sent to ${lpOut.name}`)
      } catch (err) {
        log(`[Launchpad Mini] Send FAILED — ${err.message}`)
      }
    }

    // Receive: listen for any incoming message within 1.5 s
    if (lpIn) {
      let received = false
      const timeout = setTimeout(() => {
        if (!received) {
          log('[Launchpad Mini] Receive check — no messages in 1.5 s (device may be idle)')
        }
      }, 1500)

      const handler = (e) => {
        const inputId = e.target?.id
        const inputPort = midiService.getInputs().find(i => i.id === inputId)
        if (!inputPort?.name?.toLowerCase().includes('launchpad')) return
        if (received) return
        received = true
        clearTimeout(timeout)
        unsub()
        const bytes = Array.from(e.data ?? []).map(b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
        log(`[Launchpad Mini] Receive OK — got message: [${bytes}]`)
      }

      const unsub = midiService.addRawListener(handler)
    }
  }

  let isInitializing = false
  async function checkAndAutoSelect() {
    if (isInitializing) return
    isInitializing = true

    if (window.SY_LOG) window.SY_LOG('Starting MIDI Init Sequence...')
    
    // Load app actions mappings, mapping presets, and MIDI config presets
    if (window.SY_LOG) window.SY_LOG('Loading App Mappings...')
    await Promise.all([
      mappingStore.loadAppMidiMappings(),
      mappingStore.loadPresets(),
      midiStore.loadConfigPresets(),
    ])
    if (window.SY_LOG) window.SY_LOG('App Mappings Loaded.')
 
    if (window.SY_LOG) window.SY_LOG('Initializing MIDI Store...')
    
    // Safety timeout for browser hang
    const timeout = setTimeout(() => {
       if (!midiStore.midiReady && window.SY_LOG) {
         window.SY_LOG('[WARNING] MIDI access is taking too long. Check browser permissions or click the page.')
       }
    }, 3000)

    const ok = await midiStore.init()
    clearTimeout(timeout)
    
    if (window.SY_LOG) window.SY_LOG(`MIDI Store Init Result: ${ok}`)
    isInitializing = false
    if (!ok) return

    checkLaunchpadMini()

    // Auto-detect Roland S-1 by name
    const s1Out = midiStore.outputs.find(o => o.name?.toLowerCase().includes('s-1'))
    if (s1Out) {
      const name = s1Out.name
      if (!midiStore.routingConfig.registrations[name]) {
        midiStore.addRegistration(name)
      }
      midiStore.updateRegistration(name, 'outEnabled', true)

      const s1In = midiStore.inputs.find(i => i.name === s1Out.name)
             ?? midiStore.inputs.find(i => i.name?.toLowerCase().includes('s-1'))
      if (s1In) {
        const inName = s1In.name
        if (!midiStore.routingConfig.registrations[inName]) {
          midiStore.addRegistration(inName)
        }
        midiStore.updateRegistration(inName, 'inEnabled', true)
      }
      
      midiStore.saveRoutingConfig()
    } else {
      // No S-1 found — prompt the user to pick a device
      if (authStore.user) {
        // We don't force it open anymore to avoid annoyance, 
        // but we keep the logic if needed for legacy
      }
    }

    // Broadcast tempo to all devices via clock pulses, then stop after 5ms
    midiService.setBpm(arpStore.arpBpm)
    midiService.startClock()
    setTimeout(() => midiService.sendStop(), 5)
  }

  const handleClickInit = () => {
    if (!midiStore.midiReady) {
      if (window.SY_LOG) window.SY_LOG('User clicked page — retrying MIDI init...')
      checkAndAutoSelect()
    }
  }

  onMounted(() => {
    // Attempt auto-init after a short delay to prevent startup race conditions
    setTimeout(() => {
      if (!midiStore.midiReady) checkAndAutoSelect()
    }, 1000)
    
    window.addEventListener('click', handleClickInit)
  })

  // Watch for connection status: if user is logged in and S-1 is NOT connected, open the modal
  watch([() => authStore.user, () => midiStore.isDeviceConnected], ([user, isConnected]) => {
    if (user && !isConnected && !uiStore.isMidiPortOpen) {
      console.log('MIDI connection lost or missing — opening routing modal')
      uiStore.isMidiPortOpen = true
    }
  })

  // Keep MIDI clock in sync when BPM changes
  const stopBpmWatch = watch(() => arpStore.arpBpm, (bpm) => {
    midiService.setBpm(bpm)
  })

  onUnmounted(() => {
    window.removeEventListener('click', handleClickInit)
    stopBpmWatch()
    midiStore.stopClock()
  })
}
