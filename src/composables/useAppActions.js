import { usePresetStore } from '@/stores/usePresetStore'
import { useArpStore } from '@/stores/useArpStore'
import { useUiStore } from '@/stores/useUiStore'
import { useLivePadStore } from '@/stores/useLivePadStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { useLfoStore } from '@/stores/useLfoStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { ARP_SUBDIVISIONS } from '@/stores/useArpStore'
import { CONTINUOUS_ACTIONS } from '@/lib/app-midi-actions'
import { useConfigStore } from '@/stores/useConfigStore'

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
      case 'prev_preset': if (ccVal > 63) presetStore.navigateHistory('prev'); break
      case 'next_preset': if (ccVal > 63) presetStore.navigateHistory('next'); break
      case 'first_preset': if (ccVal > 63) presetStore.navigateHistory('first'); break
      case 'last_preset': if (ccVal > 63) presetStore.navigateHistory('last'); break

      case 'new_sound':
      case 'generate': if (ccVal > 63) presetStore.generate(false); break
      case 'regenerate': if (ccVal > 63) presetStore.generate(true); break

      case 'save_preset':
        if (ccVal > 63 && presetStore.showResults) presetStore.savePreset(); break

      case 'select_sound_a':
        if (ccVal > 63) presetStore.selectEngine('A'); break

      case 'select_sound_b':
        if (ccVal > 63) presetStore.selectEngine('B'); break

      case 'toggle_sound_ab':
        if (ccVal > 63) {
          if (presetStore.useAlternativeEngine) presetStore.selectEngine('A')
          else presetStore.selectEngine('B')
        }
        break

      case 'select_sound_ab_range':
        if (window.SY_LOG) window.SY_LOG(`[AppActions] AB Range selection: val ${ccVal} -> ${ccVal < 64 ? 'A' : 'B'}`);
        if (ccVal < 64) presetStore.selectEngine('A')
        else presetStore.selectEngine('B')
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
      case 'lfo1_waveform_cc': {
        const waveforms = ['sine', 'triangle', 'square', 'saw', 'sh']
        const idx = Math.floor((ccVal / 127.1) * waveforms.length)
        lfoStore.lfo1.waveform = waveforms[idx]
        break
      }
      case 'lfo2_waveform_cc': {
        const waveforms = ['sine', 'triangle', 'square', 'saw', 'sh']
        const idx = Math.floor((ccVal / 127.1) * waveforms.length)
        lfoStore.lfo2.waveform = waveforms[idx]
        break
      }
      case 'lfo1_mode_cc':
        lfoStore.lfo1.mode = ccVal < 64 ? 'free' : 'sync'
        break
      case 'lfo2_mode_cc':
        lfoStore.lfo2.mode = ccVal < 64 ? 'free' : 'sync'
        break
      case 'lfo1_target_cc': {
        const targets = [
          'cutoff', 'res', 'attack', 'decay', 'sustain', 'release', 
          'oscLFO', 'pwWidth', 'pwmSrc', 'lfoRate', 'lfoMod', 
          'oscSq', 'oscSaw', 'oscSub', 'oscNoise',
          'delayLvl', 'reverb', 'delayTime', 'expression'
        ]
        const idx = Math.floor((ccVal / 127.1) * targets.length)
        lfoStore.lfo1.targetParameter = targets[idx]
        break
      }
      case 'lfo2_target_cc': {
        const targets = [
          'cutoff', 'res', 'attack', 'decay', 'sustain', 'release', 
          'oscLFO', 'pwWidth', 'pwmSrc', 'lfoRate', 'lfoMod', 
          'oscSq', 'oscSaw', 'oscSub', 'oscNoise',
          'delayLvl', 'reverb', 'delayTime', 'expression'
        ]
        const idx = Math.floor((ccVal / 127.1) * targets.length)
        lfoStore.lfo2.targetParameter = targets[idx]
        break
      }
      case 'lfo1_rate_cc': {
        if (lfoStore.lfo1.mode === 'free') {
          lfoStore.lfo1.rate = 0.01 + (ccVal / 127) * (20 - 0.01)
        } else if (lfoStore.SYNC_DIVISIONS) {
          const idx = Math.floor((ccVal / 127.1) * lfoStore.SYNC_DIVISIONS.length)
          lfoStore.lfo1.syncDivision = lfoStore.SYNC_DIVISIONS[idx]
        }
        break
      }
      case 'lfo2_rate_cc': {
        if (lfoStore.lfo2.mode === 'free') {
          lfoStore.lfo2.rate = 0.01 + (ccVal / 127) * (20 - 0.01)
        } else if (lfoStore.SYNC_DIVISIONS) {
          const idx = Math.floor((ccVal / 127.1) * lfoStore.SYNC_DIVISIONS.length)
          lfoStore.lfo2.syncDivision = lfoStore.SYNC_DIVISIONS[idx]
        }
        break
      }
      case 'lfo1_depth_cc':
        lfoStore.lfo1.depth = Math.round((ccVal / 127) * 100)
        break
      case 'lfo2_depth_cc':
        lfoStore.lfo2.depth = Math.round((ccVal / 127) * 100)
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
      case 'velocity_target_cc': {
        const targets = [
          'cutoff', 'res', 'attack', 'decay', 'sustain', 'release', 
          'oscLFO', 'pwWidth', 'pwmSrc', 'lfoRate', 'lfoMod', 
          'oscSq', 'oscSaw', 'oscSub', 'oscNoise',
          'delayLvl', 'reverb'
        ]
        const idx = Math.floor((ccVal / 127.1) * targets.length)
        mappingStore.velocityConfig.targetParameter = targets[idx]
        break
      }
      case 'velocity_amount_cc':
        mappingStore.velocityConfig.amount = Math.round((ccVal / 127) * 200) - 100
        break
      case 'velocity_curve_cc': {
        const curves = ['linear', 'exp', 'log']
        const idx = Math.floor((ccVal / 127.1) * curves.length)
        mappingStore.velocityConfig.curve = curves[idx]
        break
      }

      case 'toggle_sequencer':
        if (ccVal > 63) uiStore.isSequencerOpen = !uiStore.isSequencerOpen;
        break
      case 'seq_play':
        if (ccVal > 63) window.dispatchEvent(new CustomEvent('toggle-sequencer', { detail: { play: true } }));
        break
      case 'seq_stop':
        if (ccVal > 63) window.dispatchEvent(new CustomEvent('toggle-sequencer', { detail: { play: false } }));
        break

      case 'seq_bpm_up':
        if (ccVal > 63) arpStore.arpBpm = Math.min(300, arpStore.arpBpm + 1); break
      case 'seq_bpm_down':
        if (ccVal > 63) arpStore.arpBpm = Math.max(20, arpStore.arpBpm - 1); break
      case 'seq_bpm_cc':
        // Map CC value 0-127 → BPM 20-300
        arpStore.arpBpm = 20 + Math.round((ccVal / 127) * 280); break

      case 'toggle_visualizer': if (ccVal > 63) uiStore.isVisualizerOpen = !uiStore.isVisualizerOpen; break
      case 'toggle_midi_capture': if (ccVal > 63) uiStore.isCaptureOpen = !uiStore.isCaptureOpen; break
      case 'toggle_liveset': if (ccVal > 63) uiStore.isLiveSetOpen = !uiStore.isLiveSetOpen; break
      case 'toggle_panel': if (ccVal > 63) uiStore.isPanelCollapsed = !uiStore.isPanelCollapsed; break
      case 'panel_category_cc': {
        const configStore = useConfigStore()
        const base = configStore.categories
          .map(cat => ({
            id: cat.id,
            controllersCount: configStore.midiConfig.filter(cfg => cfg.category === cat.id).length
          }))
          .filter(cat => cat.controllersCount > 0)
          .map(cat => cat.id)

        const categories = [null, 'FLOW', ...base]
        const idx = Math.min(categories.length - 1, Math.floor((ccVal / 127.1) * categories.length))
        uiStore.activeVisualizerCategory = categories[idx]
        uiStore.isPanelCollapsed = false

        if (window.SY_LOG) {
          window.SY_LOG(`[AppActions] panel_category_cc: ccVal=${ccVal}, idx=${idx}/${categories.length}, category=${categories[idx]}, list=${JSON.stringify(categories)}`)
        }
        break
      }
      case 'panel_tab_grid':
        if (window.SY_LOG) window.SY_LOG(`[AppActions] panel_tab_grid: ccVal=${ccVal}`);
        uiStore.activeVisualizerCategory = null; uiStore.isPanelCollapsed = false
        break
      case 'panel_tab_flow':
        if (window.SY_LOG) window.SY_LOG(`[AppActions] panel_tab_flow: ccVal=${ccVal}`);
        uiStore.activeVisualizerCategory = 'FLOW'; uiStore.isPanelCollapsed = false
        break
      case 'panel_tab_lfo':
        if (window.SY_LOG) window.SY_LOG(`[AppActions] panel_tab_lfo: ccVal=${ccVal}`);
        uiStore.activeVisualizerCategory = 'LFO'; uiStore.isPanelCollapsed = false
        break
      case 'panel_tab_osc':
        if (window.SY_LOG) window.SY_LOG(`[AppActions] panel_tab_osc: ccVal=${ccVal}`);
        uiStore.activeVisualizerCategory = 'OSCILLATOR'; uiStore.isPanelCollapsed = false
        break
      case 'panel_tab_env':
        if (window.SY_LOG) window.SY_LOG(`[AppActions] panel_tab_env: ccVal=${ccVal}`);
        uiStore.activeVisualizerCategory = 'ENV'; uiStore.isPanelCollapsed = false
        break
      case 'panel_tab_filter':
        if (window.SY_LOG) window.SY_LOG(`[AppActions] panel_tab_filter: ccVal=${ccVal}`);
        uiStore.activeVisualizerCategory = 'FILTER'; uiStore.isPanelCollapsed = false
        break
      case 'panel_tab_efx':
        if (window.SY_LOG) window.SY_LOG(`[AppActions] panel_tab_efx: ccVal=${ccVal}`);
        uiStore.activeVisualizerCategory = 'EFX'; uiStore.isPanelCollapsed = false
        break
      case 'panel_tab_poly':
        if (window.SY_LOG) window.SY_LOG(`[AppActions] panel_tab_poly: ccVal=${ccVal}`);
        uiStore.activeVisualizerCategory = 'POLY'; uiStore.isPanelCollapsed = false
        break
      case 'panel_tab_advanced':
        if (window.SY_LOG) window.SY_LOG(`[AppActions] panel_tab_advanced: ccVal=${ccVal}`);
        uiStore.activeVisualizerCategory = 'ADVANCED'; uiStore.isPanelCollapsed = false
        break
      case 'panel_tab_dynamic':
        if (window.SY_LOG) window.SY_LOG(`[AppActions] panel_tab_dynamic: ccVal=${ccVal}`);
        uiStore.activeVisualizerCategory = 'DYNAMIC'; uiStore.isPanelCollapsed = false
        break
      case 'toggle_looper': if (ccVal > 63) uiStore.isLooperOpen = !uiStore.isLooperOpen; break
      case 'toggle_audio_capture':
        if (window.SY_LOG) window.SY_LOG(`[AppActions] AUDIO CAPTURE: ${ccVal > 63 ? 'ON' : 'OFF'} (val: ${ccVal})`);
        uiStore.isAudioCaptureOpen = ccVal > 63;
        break
      case 'open_sound_types': uiStore.isTypesOpen = !uiStore.isTypesOpen; break
      case 'open_sound_history': uiStore.isHistoryOpen = !uiStore.isHistoryOpen; break
      case 'open_midi_matrix': if (ccVal > 63) uiStore.isMidiMatrixOpen = !uiStore.isMidiMatrixOpen; break
      case 'toggle_midi_performance': if (ccVal > 63) uiStore.isMidiPerformanceOpen = !uiStore.isMidiPerformanceOpen; break

      case 'midi_panic':
        if (ccVal > 63) midiStore.panic(); break

      case 'global_start_stop':
        if (ccVal > 63) {
          if (!midiStore.isTransportPlaying) midiStore.sendStart()
        } else if (ccVal < 64) {
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
        if (ccVal > 63) window.dispatchEvent(new CustomEvent('toggle-backing-track')); break
      case 'playlist_play_stop':
        if (ccVal > 63) window.dispatchEvent(new CustomEvent('playlist-play-stop')); break
      case 'playlist_next':
        if (ccVal > 63) window.dispatchEvent(new CustomEvent('playlist-next')); break
      case 'playlist_volume_cc':
        window.dispatchEvent(new CustomEvent('playlist-volume', { detail: ccVal / 127 })); break
      case 'capture_rec_toggle':
        if (ccVal > 63) window.dispatchEvent(new CustomEvent('capture-rec-toggle')); break

      case 'arp_mode_cc': {
        const modes = ['up', 'down', 'up-down', 'random']
        const idx = Math.floor((ccVal / 127.1) * modes.length)
        arpStore.arpMode = modes[idx]
        break
      }
      case 'arp_subdivision_cc':
      case 'arp_rate_cc': {
        const idx = Math.floor((ccVal / 127.1) * ARP_SUBDIVISIONS.length)
        arpStore.arpSubdivision = ARP_SUBDIVISIONS[idx]
        break
      }
      case 'arp_hold_cc':
        arpStore.arpHold = ccVal >= 64
        break

      case 'liveset_up':
        window.dispatchEvent(new CustomEvent('liveset-navigate', { detail: { dir: 'up' } })); break
      case 'liveset_down':
        window.dispatchEvent(new CustomEvent('liveset-navigate', { detail: { dir: 'down' } })); break

      case 'transpose_cc':
        // Map CC value 0-127 → transpose -24..+24
        uiStore.globalTranspose = Math.round((ccVal / 127) * 48) - 24; break

      case 'seq_select_1':
        if (ccVal > 63) uiStore.seqActiveSlot = 1
        window.dispatchEvent(new CustomEvent('sequencer-action', { detail: { action, val: ccVal } })); break
      case 'seq_select_2':
        if (ccVal > 63) uiStore.seqActiveSlot = 2
        window.dispatchEvent(new CustomEvent('sequencer-action', { detail: { action, val: ccVal } })); break

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
      case 'seq_skip_step':
      case 'seq_octave_cc':
      case 'seq_range_cc':
      case 'seq_step_select_cc':
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
