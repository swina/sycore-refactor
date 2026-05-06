import { usePresetStore } from '@/stores/usePresetStore'
import { useArpStore }    from '@/stores/useArpStore'
import { useUiStore }     from '@/stores/useUiStore'
import { CONTINUOUS_ACTIONS } from '@/lib/app-midi-actions'

/**
 * Dispatches AppAction strings to the appropriate store calls.
 * Mirrors the executeAppAction switch block from MidiApp.tsx.
 * Call dispatchAction(action, ccVal) from useMidiCCListener or UI buttons.
 */
export function useAppActions() {
  const presetStore = usePresetStore()
  const arpStore    = useArpStore()
  const uiStore     = useUiStore()

  function dispatchAction(action, ccVal = 0) {
    switch (action) {
      case 'prev_preset':        presetStore.navigateHistory('prev');  break
      case 'next_preset':        presetStore.navigateHistory('next');  break
      case 'first_preset':       presetStore.navigateHistory('first'); break
      case 'last_preset':        presetStore.navigateHistory('last');  break

      case 'new_sound':
      case 'generate':           presetStore.generate(false); break
      case 'regenerate':         presetStore.generate(true);  break

      case 'save_preset':
        if (presetStore.showResults) presetStore.savePreset(); break

      case 'select_sound_a':
        presetStore.useAlternativeEngine = false
        if (presetStore.engineCacheA) presetStore.recallPreset(presetStore.engineCacheA)
        break

      case 'select_sound_b':
        presetStore.useAlternativeEngine = true
        if (presetStore.engineCacheB) presetStore.recallPreset(presetStore.engineCacheB)
        break

      case 'toggle_arp':         arpStore.arpEnabled = !arpStore.arpEnabled; break

      case 'toggle_sequencer':   uiStore.isSequencerOpen = !uiStore.isSequencerOpen; break
      case 'seq_play':
        window.dispatchEvent(new CustomEvent('toggle-sequencer', { detail: { play: true } })); break
      case 'seq_stop':
        window.dispatchEvent(new CustomEvent('toggle-sequencer', { detail: { play: false } })); break

      case 'seq_bpm_up':
        arpStore.arpBpm = Math.min(300, arpStore.arpBpm + 1); break
      case 'seq_bpm_down':
        arpStore.arpBpm = Math.max(20, arpStore.arpBpm - 1); break
      case 'seq_bpm_cc':
        // Map CC value 0-127 → BPM 20-300
        arpStore.arpBpm = 20 + Math.round((ccVal / 127) * 280); break

      case 'toggle_visualizer':    uiStore.isVisualizerOpen    = !uiStore.isVisualizerOpen;    break
      case 'toggle_midi_capture':  uiStore.isCaptureOpen       = !uiStore.isCaptureOpen;       break
      case 'toggle_liveset':       uiStore.isLiveSetOpen       = !uiStore.isLiveSetOpen;       break
      case 'toggle_panel':         uiStore.isPanelCollapsed    = !uiStore.isPanelCollapsed;    break
      case 'open_sound_types':     uiStore.isTypesOpen         = true;                        break
      case 'open_sound_history':   uiStore.isHistoryOpen       = true;                        break

      case 'toggle_track_player':
        window.dispatchEvent(new CustomEvent('toggle-backing-track')); break
      case 'playlist_play_stop':
        window.dispatchEvent(new CustomEvent('playlist-play-stop')); break
      case 'playlist_next':
        window.dispatchEvent(new CustomEvent('playlist-next')); break

      case 'liveset_up':
        window.dispatchEvent(new CustomEvent('liveset-navigate', { detail: { dir: 'up' } })); break
      case 'liveset_down':
        window.dispatchEvent(new CustomEvent('liveset-navigate', { detail: { dir: 'down' } })); break

      case 'transpose_cc':
        // Map CC value 0-127 → transpose -24..+24
        uiStore.globalTranspose = Math.round((ccVal / 127) * 48) - 24; break

      default:
        console.warn('Unknown AppAction:', action)
    }
  }

  return { dispatchAction, CONTINUOUS_ACTIONS }
}
