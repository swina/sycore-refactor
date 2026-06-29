import { watch, onMounted, onUnmounted } from 'vue'
import { useMappingStore } from '@/stores/useMappingStore'
import { useUiStore }      from '@/stores/useUiStore'
import { useArpStore }     from '@/stores/useArpStore'
import { useMidiStore }    from '@/stores/useMidiStore'
import { midiService }     from '@/core/midi/midi-service'

/**
 * Monitors application state and sends MIDI feedback (LEDs) 
 * to controllers based on configured appMidiMappings.
 */
export function useMidiFeedback() {
  const mappingStore = useMappingStore()
  const uiStore      = useUiStore()
  const arpStore     = useArpStore()
  const midiStore    = useMidiStore()

  // Map AppAction -> reactive state getter
  const actionStateMap = {
    'toggle_arp':          () => arpStore.arpEnabled,
    'toggle_sequencer':    () => uiStore.isSequencerOpen,
    'toggle_visualizer':   () => uiStore.isVisualizerOpen,
    'toggle_midi_capture': () => uiStore.isCaptureOpen,
    'toggle_liveset':      () => uiStore.isLiveSetOpen,
    'toggle_panel':        () => !uiStore.isPanelCollapsed,
    'open_midi_matrix':    () => uiStore.isMidiMatrixOpen,
    'toggle_looper':       () => uiStore.isLooperOpen,
    'panel_tab_grid':      () => uiStore.activeVisualizerCategory === null && !uiStore.isPanelCollapsed,
    'panel_tab_flow':      () => uiStore.activeVisualizerCategory === 'FLOW' && !uiStore.isPanelCollapsed,
    'panel_tab_lfo':       () => uiStore.activeVisualizerCategory === 'LFO' && !uiStore.isPanelCollapsed,
    'panel_tab_osc':       () => uiStore.activeVisualizerCategory === 'OSCILLATOR' && !uiStore.isPanelCollapsed,
    'panel_tab_env':       () => uiStore.activeVisualizerCategory === 'ENV' && !uiStore.isPanelCollapsed,
    'panel_tab_filter':    () => uiStore.activeVisualizerCategory === 'FILTER' && !uiStore.isPanelCollapsed,
    'panel_tab_efx':       () => uiStore.activeVisualizerCategory === 'EFX' && !uiStore.isPanelCollapsed,
    'panel_tab_poly':      () => uiStore.activeVisualizerCategory === 'POLY' && !uiStore.isPanelCollapsed,
    'panel_tab_advanced':  () => uiStore.activeVisualizerCategory === 'ADVANCED' && !uiStore.isPanelCollapsed,
    'panel_tab_dynamic':   () => uiStore.activeVisualizerCategory === 'DYNAMIC' && !uiStore.isPanelCollapsed,
  }

  function testFeedback(mapping) {
    if (mapping.feedbackOn === undefined) return
    sendFeedback(mapping, true)
    setTimeout(() => sendFeedback(mapping, false), 500)
  }

  let stopWatch = null

  function sendFeedback(mapping, isOn) {
    if (mapping.feedbackOn === undefined || mapping.feedbackOff === undefined) return
    
    const val = isOn ? mapping.feedbackOn : mapping.feedbackOff
    const chan = mapping.channel === -1 ? 0 : mapping.channel
    
    // Find output device by name
    const outputs = midiService.getOutputs()
    const out = outputs.find(o => (o.name ?? o.id) === mapping.device)
    if (!out) return

    if (mapping.note !== undefined) {
      midiService.sendRawToDevice(out.id, [0x90 | chan, mapping.note, val])
    } else if (mapping.cc !== undefined) {
      midiService.sendRawToDevice(out.id, [0xB0 | chan, mapping.cc, val])
    }
  }

  function updateAllFeedback() {
    if (!midiStore.isReady) return
    const mappings = mappingStore.appMidiMappings
    if (!mappings.length) return

    mappings.forEach(m => {
      const stateGetter = actionStateMap[m.action]
      if (!stateGetter) return
      sendFeedback(m, stateGetter())
    })
  }

  onMounted(() => {
    // Watch for state changes and update corresponding LEDs
    stopWatch = watch(
      [
        () => mappingStore.appMidiMappings,
        () => arpStore.arpEnabled,
        () => uiStore.isSequencerOpen,
        () => uiStore.isVisualizerOpen,
        () => uiStore.isCaptureOpen,
        () => uiStore.isLiveSetOpen,
        () => uiStore.isPanelCollapsed,
        () => uiStore.isMidiMatrixOpen,
        () => uiStore.isLooperOpen,
        () => uiStore.activeVisualizerCategory,
        () => midiStore.outputs.length // In case devices are connected/reconnected
      ],
      () => {
        updateAllFeedback()
      },
      { deep: true, immediate: true }
    )
  })

  onUnmounted(() => {
    if (stopWatch) stopWatch()
  })

  return { updateAllFeedback, testFeedback }
}
