import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { createPinia, setActivePinia } from 'pinia'
import { useUiStore } from '@/stores/useUiStore'

/**
 * Canonical id -> named-ref pairs. Intentionally duplicated here rather than
 * imported from useUiStore.ts's internal PANEL_ID_REF_LOOKUP, so a typo in
 * that lookup table fails this test instead of silently agreeing with itself.
 * Mirrors docs/plans/modular-panel-system.md.
 */
const ID_TO_REF: [string, string][] = [
  ['types', 'isTypesOpen'],
  ['history', 'isHistoryOpen'],
  ['liveset', 'isLiveSetOpen'],
  ['tracks', 'isBackingTrackOpen'],
  ['sequencer', 'isSequencerOpen'],
  ['sequencer-modal', 'isSequencerModalOpen'],
  ['audio-capture', 'isAudioCaptureOpen'],
  ['visualizer', 'isVisualizerOpen'],
  ['keyboard', 'isKeyboardOpen'],
  ['arp', 'isArpOpen'],
  ['favorites', 'isFavoritesOpen'],
  ['profile', 'isProfileOpen'],
  ['help', 'isHelpOpen'],
  ['guides', 'isGuidesOpen'],
  ['support', 'isSupportOpen'],
  ['manual', 'isGuidesOpen'],
  ['portal', 'isPortalOpen'],
  ['panic', 'isPanicOpen'],
  ['midilogger', 'isAdminLoggerOpen'],
  ['routing', 'isMidiPortOpen'],
  ['midiactions', 'isMidiActionsOpen'],
  ['midilearn', 'isMidiMappingOpen'],
  ['session', 'isSessionOpen'],
  ['looper', 'isLooperOpen'],
  ['audio-looper', 'isLooperOpen'],
  ['admin', 'isAdminPanelOpen'],
  ['midi_matrix', 'isMidiMatrixOpen'],
  ['midi-performance', 'isMidiPerformanceOpen'],
  ['midi-manager', 'showUnifiedMidiManager'],
  ['capture', 'isCaptureOpen'],
  ['live-timeline', 'isLiveTimelineOpen'],
  ['sound-engine', 'isSoundEngineOpen'],
  ['tracks-player', 'isTracksPlayerOpen'],
  ['chord-prog', 'isChordProgOpen'],
  ['live-performance-pad', 'isLivePerformancePadOpen'],
  ['loop-machine', 'isLoopMachineOpen'],
  ['drum-machine', 'isDrumMachineOpen'],
  ['sampler', 'isSamplerOpen'],
  ['device-program-change', 'isDeviceProgramChangePanelOpen'],
  ['freesound-browser', 'isFreesoundBrowserOpen'],
  ['audio-mixer', 'isAudioMixerOpen'],
  ['sound-folder-browser', 'isSoundFolderBrowserOpen'],
  ['midi-flow', 'isMidiFlowOpen'],
  ['controller-designer', 'isMidiControllerDesignerOpen'],
  ['midi-devices', 'isMidiDevicesOpen'],
  ['program-change', 'isProgramChangeBrowserOpen'],
  ['midi-monitor', 'isMidiMonitorOpen'],
  ['about', 'isAboutOpen'],
]

describe('useUiStore generic panel API', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it.each(ID_TO_REF)('togglePanel(%s) flips the same state as uiStore.%s', (id, refName) => {
    const uiStore = useUiStore() as any
    expect(uiStore[refName]).toBe(false)
    expect(uiStore.isPanelOpen(id)).toBe(false)

    uiStore.togglePanel(id)
    expect(uiStore[refName]).toBe(true)
    expect(uiStore.isPanelOpen(id)).toBe(true)

    uiStore.togglePanel(id)
    expect(uiStore[refName]).toBe(false)
    expect(uiStore.isPanelOpen(id)).toBe(false)
  })

  it('openPanel/closePanel set state directly and idempotently', () => {
    const uiStore = useUiStore()
    uiStore.openPanel('drum-machine')
    expect(uiStore.isDrumMachineOpen).toBe(true)
    uiStore.openPanel('drum-machine')
    expect(uiStore.isDrumMachineOpen).toBe(true)

    uiStore.closePanel('drum-machine')
    expect(uiStore.isDrumMachineOpen).toBe(false)
    uiStore.closePanel('drum-machine')
    expect(uiStore.isDrumMachineOpen).toBe(false)
  })

  it('togglePanel on an unknown id does not throw and stays closed', () => {
    const uiStore = useUiStore()
    expect(() => uiStore.togglePanel('not-a-real-module')).not.toThrow()
    expect(uiStore.isPanelOpen('not-a-real-module')).toBe(false)
  })

  it('aliased ids (manual/guides, looper/audio-looper) share the same underlying flag', () => {
    const uiStore = useUiStore()
    uiStore.togglePanel('manual')
    expect(uiStore.isGuidesOpen).toBe(true)
    expect(uiStore.isPanelOpen('guides')).toBe(true)

    uiStore.togglePanel('audio-looper')
    expect(uiStore.isLooperOpen).toBe(true)
    expect(uiStore.isPanelOpen('looper')).toBe(true)
  })
})
