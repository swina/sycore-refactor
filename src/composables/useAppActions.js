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
import { userKey } from '@/lib/userKey'
import { dispatch } from '@/types/events'


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
      case 'generate':
        if (!presetStore.isGenerating) presetStore.generate(false).catch(err => console.error('[AppActions] generate failed', err))
        break
      case 'regenerate':
        if (!presetStore.isGenerating) presetStore.generate(true).catch(err => console.error('[AppActions] regenerate failed', err))
        break

      case 'save_preset':
        if (ccVal >= 0 && presetStore.lastPreset && !presetStore.isSaving)
          presetStore.savePreset().catch(err => { if (err?.message !== 'slot_limit') console.error('[AppActions] save_preset failed', err) })
        break

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
        uiStore.isSequencerOpen = !uiStore.isSequencerOpen;
        break
      case 'seq_play':
        if (ccVal > 63) window.dispatchEvent(new CustomEvent('toggle-sequencer', { detail: { play: true } }));
        break
      case 'seq_stop':
        if (ccVal > 63) window.dispatchEvent(new CustomEvent('toggle-sequencer', { detail: { play: false } }));
        break

      case 'seq_bpm_up':
        if (ccVal > 63) midiStore.setGlobalBpm(arpStore.arpBpm + 1); break
      case 'seq_bpm_down':
        if (ccVal > 63) midiStore.setGlobalBpm(arpStore.arpBpm - 1); break
      case 'seq_bpm_cc':
        // Map CC value 0-127 → BPM 20-300
        midiStore.setGlobalBpm(20 + Math.round((ccVal / 127) * 280)); break

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
      case 'open_loop_machine':  uiStore.isLoopMachineOpen           = ccVal > 63; break
      case 'open_sound_types':   uiStore.isTypesOpen                  = ccVal > 63; break
      case 'open_sound_history': uiStore.isHistoryOpen                = ccVal > 63; break
      case 'open_midi_matrix':   uiStore.isMidiMatrixOpen             = ccVal > 63; break
      case 'open_lpp':           uiStore.isLivePerformancePadOpen     = ccVal > 63; break
      case 'open_sampler':       uiStore.isSamplerOpen                = ccVal > 63; break
      case 'open_drum_machine':  uiStore.isDrumMachineOpen            = ccVal > 63; break
      case 'open_chord_prog':    uiStore.isChordProgOpen              = ccVal > 63; break
      case 'open_sound_engine':  uiStore.isSoundEngineOpen            = ccVal > 63; break
      case 'open_live_timeline': uiStore.isLiveTimelineOpen           = ccVal > 63; break
      case 'open_tracks_player': uiStore.isTracksPlayerOpen           = ccVal > 63; break
      case 'timeline_add_dm_rec_sync':
        if (ccVal > 63) window.dispatchEvent(new CustomEvent('timeline-add-mkr-dm-rec-sync')); break
      case 'timeline_add_audio_trim_start':
        if (ccVal > 63) window.dispatchEvent(new CustomEvent('timeline-add-mkr-audio-trim-start')); break
      case 'timeline_add_audio_set_loop':
        if (ccVal > 63) window.dispatchEvent(new CustomEvent('timeline-add-mkr-audio-set-loop')); break
      case 'timeline_add_audio_crop':
        if (ccVal > 63) window.dispatchEvent(new CustomEvent('timeline-add-mkr-audio-crop')); break
      case 'timeline_add_audio_save_wav':
        if (ccVal > 63) window.dispatchEvent(new CustomEvent('timeline-add-mkr-audio-save-wav')); break
      case 'toggle_midi_performance': if (ccVal > 63) uiStore.isMidiPerformanceOpen = !uiStore.isMidiPerformanceOpen; break

      case 'toggle_main_menu':
        if (ccVal > 63) {
          window.dispatchEvent(new CustomEvent('midi-main-menu', { detail: { action: 'toggle', val: ccVal } }))
        }
        break
      case 'main_menu_scroll_cc':
        window.dispatchEvent(new CustomEvent('midi-main-menu', { detail: { action: 'scroll', val: ccVal } }))
        break
      case 'main_menu_select':
        if (ccVal > 63) {
          window.dispatchEvent(new CustomEvent('midi-main-menu', { detail: { action: 'select', val: ccVal } }))
        }
        break

      case 'midi_panic':
        if (ccVal > 63) midiStore.panic(); break

      case 'global_start_stop':
        if (ccVal > 63) {
          if (!midiStore.isTransportPlaying) midiStore.sendStart()
        } else if (ccVal < 64) {
          if (midiStore.isTransportPlaying) midiStore.sendStop()
        }
        break

      case 'transport_play_all':
        if (ccVal > 63) window.dispatchEvent(new CustomEvent('transport-play-all'))
        break
      case 'transport_stop_all':
        if (ccVal > 63) window.dispatchEvent(new CustomEvent('transport-stop-all'))
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

      case 'pc_preset_up':
        if (ccVal > 63) window.dispatchEvent(new CustomEvent('device-pc-preset-navigate', { detail: { delta: -1 } })); break
      case 'pc_preset_down':
        if (ccVal > 63) window.dispatchEvent(new CustomEvent('device-pc-preset-navigate', { detail: { delta: 1 } })); break

      case 'liveset_up':
        window.dispatchEvent(new CustomEvent('liveset-navigate', { detail: { dir: 'up' } })); break
      case 'liveset_down':
        window.dispatchEvent(new CustomEvent('liveset-navigate', { detail: { dir: 'down' } })); break

      case 'focus_next_modal':
        if (ccVal > 0) uiStore.cycleFocusedModal(); break

      case 'channel_up':
        if (ccVal > 63) {
          const ch = midiStore.midiChannel
          midiStore.setMidiChannel(ch >= 16 ? 1 : ch + 1)
        }
        break
      case 'channel_down':
        if (ccVal > 63) {
          const ch = midiStore.midiChannel
          midiStore.setMidiChannel(ch <= 1 ? 16 : ch - 1)
        }
        break
      case 'channel_cc':
        midiStore.setMidiChannel(Math.max(1, Math.round((ccVal / 127) * 15) + 1))
        break

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
        if (action.startsWith('pc_pad_')) {
          // pc_pad_a1 → series 'A', pad 0  |  pc_pad_b3 → series 'B', pad 2
          const m = action.match(/^pc_pad_([ab])(\d)$/i)
          if (m && ccVal > 63) {
            const seriesIdx = m[1].toLowerCase() === 'a' ? 0 : 1
            const padIdx    = parseInt(m[2], 10) - 1
            try {
              const stored = localStorage.getItem(userKey('SY_PC_PADS'))
              if (stored) {
                const allSeries = JSON.parse(stored)
                const series    = allSeries[seriesIdx]
                const pad       = series?.pads[padIdx]
                if (pad && series.deviceName) {
                  const port = midiStore.outputs.find(o => o.name === series.deviceName)
                  if (port) {
                    const ch = (series.channel ?? 1) - 1
                    port.send([0xB0 | ch, 0,  pad.msb])
                    port.send([0xB0 | ch, 32, pad.lsb])
                    port.send([0xC0 | ch,     pad.pc])
                    const msg = `[PC Pad ${series.id}${padIdx + 1}] → ${series.deviceName} ch${series.channel}: MSB=${pad.msb} LSB=${pad.lsb} PC=${pad.pc} | ${pad.name}`
                    if (window.SY_LOG) window.SY_LOG(msg); else console.log(msg)
                    if (midiStore.sendClock) {
                      setTimeout(() => {
                        midiStore.startClock()
                        const clockMsg = `[MIDI PC] Clock restarted to send current tempo: ${midiStore.currentBpm} BPM`
                        if (window.SY_LOG) window.SY_LOG(clockMsg); else console.log(clockMsg)
                      }, 100)
                    }
                  }
                }
              }
            } catch (e) {
              console.warn('[useAppActions] pc_pad error:', e)
            }
          }
        } else if (action.startsWith('liveset_pad_')) {
          const idx = parseInt(action.replace('liveset_pad_', ''), 10) - 1
          window.dispatchEvent(new CustomEvent('liveset-select-pad', { detail: { idx } }))
        } else if (action.startsWith('backing_track_pad_')) {
          if (ccVal > 63) {
            const idx = parseInt(action.replace('backing_track_pad_', ''), 10) - 1
            if (livePadStore.playlistIdx === idx) {
              window.dispatchEvent(new CustomEvent('playlist-play-stop'))
            } else {
              window.dispatchEvent(new CustomEvent('playlist-play', { detail: { idx } }))
            }
          }
        } else if (action === 'grid_pad_press') {
          // Generic grid pad press, can be used by other components
          window.dispatchEvent(new CustomEvent('grid-pad-press', { detail: ccVal }))
        } else if (action.startsWith('midi_config_preset_')) {
          if (ccVal > 63) {
            const slotIdx = parseInt(action.replace('midi_config_preset_', ''), 10) - 1
            const namedPresets = midiStore.configPresets.filter(p => p.id !== '__autosave__')
            const preset = namedPresets[slotIdx]
            if (preset) midiStore.loadConfigPreset(preset.id)
          }
        } else {
          console.warn('Unknown AppAction:', action)
        }
    }
  }

  return { dispatchAction, CONTINUOUS_ACTIONS }
}
