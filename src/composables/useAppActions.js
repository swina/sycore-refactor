import { usePresetStore } from '@/stores/usePresetStore'
import { useArpStore } from '@/stores/useArpStore'
import { useUiStore } from '@/stores/useUiStore'
import { useLivePadStore } from '@/stores/useLivePadStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { useLfoStore } from '@/stores/useLfoStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { ARP_SUBDIVISIONS } from '@/stores/useArpStore'
import { CONTINUOUS_ACTIONS } from '@/lib/app-midi-actions'

/**
 * Dispatches AppAction strings to the appropriate store calls.
 * Mirrors the executeAppAction switch block from MidiApp.tsx.
 * Call dispatchAction(action, ccVal) from useMidiCCListener or UI buttons.
 */
export function useAppActions() {
  const presetStore = usePresetStore()
  const arpStore = useArpStore()
  const uiStore = useUiStore()
  const livePadStore = useLivePadStore()
  const midiStore = useMidiStore()
  const lfoStore = useLfoStore()
  const mappingStore = useMappingStore()

  function dispatchAction(action, ccVal = 0) {
    switch (action) {
      case 'prev_preset': presetStore.navigateHistory('prev'); break
      case 'next_preset': presetStore.navigateHistory('next'); break
      case 'first_preset': presetStore.navigateHistory('first'); break
      case 'last_preset': presetStore.navigateHistory('last'); break

      case 'new_sound':
      case 'generate': presetStore.generate(false); break
      case 'regenerate': presetStore.generate(true); break

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

      case 'toggle_arp':
        if (window.SY_LOG) window.SY_LOG(`[AppActions] ARP: ${ccVal > 63 ? 'ON' : 'OFF'} (val: ${ccVal})`);
        arpStore.arpEnabled = ccVal > 63;
        break
      case 'toggle_lfo_1':
        if (window.SY_LOG) window.SY_LOG(`[AppActions] LFO 1: ${ccVal > 63 ? 'ON' : 'OFF'} (val: ${ccVal})`);
        lfoStore.lfo1.active = ccVal > 63;
        break
      case 'toggle_lfo_2':
        if (window.SY_LOG) window.SY_LOG(`[AppActions] LFO 2: ${ccVal > 63 ? 'ON' : 'OFF'} (val: ${ccVal})`);
        lfoStore.lfo2.active = ccVal > 63;
        break
      case 'toggle_velocity_mapping':
        if (window.SY_LOG) window.SY_LOG(`[AppActions] VELOCITY MAPPING: ${ccVal > 63 ? 'ON' : 'OFF'} (val: ${ccVal})`);
        if (ccVal > 63) {
          mappingStore.velocityConfig.active = true;
        } else {
          mappingStore.velocityConfig.active = false;
          mappingStore.restoreOriginalValues();
        }
        break

      case 'toggle_sequencer': uiStore.isSequencerOpen = !uiStore.isSequencerOpen; break
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

      case 'toggle_visualizer': uiStore.isVisualizerOpen = !uiStore.isVisualizerOpen; break
      case 'toggle_midi_capture': uiStore.isCaptureOpen = !uiStore.isCaptureOpen; break
      case 'toggle_liveset': uiStore.isLiveSetOpen = !uiStore.isLiveSetOpen; break
      case 'toggle_panel': uiStore.isPanelCollapsed = !uiStore.isPanelCollapsed; break
      case 'toggle_looper': uiStore.isLooperOpen = !uiStore.isLooperOpen; break
      case 'toggle_audio_capture':
        if (window.SY_LOG) window.SY_LOG(`[AppActions] AUDIO CAPTURE: ${ccVal > 63 ? 'ON' : 'OFF'} (val: ${ccVal})`);
        uiStore.isAudioCaptureOpen = ccVal > 63;
        break
      case 'open_sound_types': uiStore.isTypesOpen = true; break
      case 'open_sound_history': uiStore.isHistoryOpen = true; break
      case 'open_midi_matrix': uiStore.isMidiMatrixOpen = !uiStore.isMidiMatrixOpen; break
      case 'toggle_midi_performance': uiStore.isMidiPerformanceOpen = !uiStore.isMidiPerformanceOpen; break

      case 'midi_panic':
        midiStore.panic(); break

      case 'global_start_stop':
        if (ccVal > 0) {
          if (!midiStore.isTransportPlaying) midiStore.sendStart()
        } else {
          if (midiStore.isTransportPlaying) midiStore.sendStop()
        }
        break

      case 'smart_latch_cc':
        // Turn latch on if CC >= 64, otherwise off
        midiStore.toggleSmartLatch(ccVal >= 64)
        break

      case 'pass_thru':
        // Do nothing in the app, it's just for routing and LED feedback
        break

      case 'toggle_track_player':
        window.dispatchEvent(new CustomEvent('toggle-backing-track')); break
      case 'playlist_play_stop':
        window.dispatchEvent(new CustomEvent('playlist-play-stop')); break
      case 'playlist_next':
        window.dispatchEvent(new CustomEvent('playlist-next')); break
      case 'playlist_volume_cc':
        window.dispatchEvent(new CustomEvent('playlist-volume', { detail: ccVal / 127 })); break
      case 'capture_rec_toggle':
        window.dispatchEvent(new CustomEvent('capture-rec-toggle')); break

      case 'arp_mode_cc': {
        const modes = ['up', 'down', 'up-down', 'random']
        const idx = Math.floor((ccVal / 128) * modes.length)
        arpStore.arpMode = modes[idx]
        break
      }
      case 'arp_subdivision_cc': {
        const idx = Math.floor((ccVal / 128) * ARP_SUBDIVISIONS.length)
        arpStore.arpSubdivision = ARP_SUBDIVISIONS[idx]
        break
      }

      case 'liveset_up':
        window.dispatchEvent(new CustomEvent('liveset-navigate', { detail: { dir: 'up' } })); break
      case 'liveset_down':
        window.dispatchEvent(new CustomEvent('liveset-navigate', { detail: { dir: 'down' } })); break

      case 'transpose_cc':
        // Map CC value 0-127 → transpose -24..+24
        uiStore.globalTranspose = Math.round((ccVal / 127) * 48) - 24; break

      case 'seq_swing_cc':
      case 'seq_density_cc':
      case 'seq_length_cc':
      case 'seq_key_cc':
      case 'seq_scale_cc':
      case 'seq_style_cc':
      case 'seq_transpose_cc':
      case 'seq_gen_trigger':
      case 'seq_duplicate':
      case 'seq_reduce':
        window.dispatchEvent(new CustomEvent('sequencer-action', { detail: { action, val: ccVal } })); break

      default:
        if (action.startsWith('liveset_pad_')) {
          const idx = parseInt(action.replace('liveset_pad_', ''), 10) - 1
          window.dispatchEvent(new CustomEvent('liveset-select-pad', { detail: { idx } }))
        } else if (action === 'grid_pad_press') {
          // Generic grid pad press, can be used by other components
          window.dispatchEvent(new CustomEvent('grid-pad-press', { detail: ccVal }))
        } else {
          console.warn('Unknown AppAction:', action)
        }
    }
  }

  return { dispatchAction, CONTINUOUS_ACTIONS }
}
