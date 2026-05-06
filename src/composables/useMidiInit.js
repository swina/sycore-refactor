import { onMounted, onUnmounted, watch } from 'vue'
import { useMidiStore } from '@/stores/useMidiStore'
import { useUiStore }  from '@/stores/useUiStore'
import { useArpStore } from '@/stores/useArpStore'
import { midiService } from '@/core/midi/MidiService'

/**
 * Manages the full MIDI initialization lifecycle:
 * - inits WebMIDI on mount, auto-detects Roland S-1
 * - opens port config panel if no S-1 is found
 * - keeps BPM clock in sync with arpStore.arpBpm
 * - tears down clock on unmount
 */
export function useMidiInit() {
  const midiStore = useMidiStore()
  const uiStore   = useUiStore()
  const arpStore  = useArpStore()

  onMounted(async () => {
    const ok = await midiStore.init()
    if (!ok) return

    // Auto-detect Roland S-1 by name
    const s1Out = midiStore.outputs.find(o => o.name?.toLowerCase().includes('s-1'))
    if (s1Out) {
      midiStore.setOutput(s1Out.id)

      // Match input by same name
      const s1In = midiStore.inputs.find(i => i.name === s1Out.name)
      if (s1In) {
        midiStore.setKeyboardInput(s1In.id)
        midiStore.setControlInput(s1In.id)
      }
    } else {
      // No S-1 found — prompt the user to pick a device
      uiStore.isMidiPortOpen = true
    }

    // Start MIDI clock at the current BPM
    midiService.setBpm(arpStore.arpBpm)
    midiStore.startClock()
  })

  // Keep MIDI clock in sync when BPM changes
  const stopBpmWatch = watch(() => arpStore.arpBpm, (bpm) => {
    midiService.setBpm(bpm)
  })

  onUnmounted(() => {
    stopBpmWatch()
    midiStore.stopClock()
  })
}
