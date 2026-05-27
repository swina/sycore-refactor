import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

export const useUiStore = defineStore('ui', () => {
  const isAppInitializing = ref(true)
  // Panel visibility
  const isHistoryOpen      = ref(false)
  const isTypesOpen        = ref(false)
  const isKeyboardOpen     = ref(false)
  const isSequencerOpen    = ref(false)
  const isArpOpen          = ref(false)
  const isMidiPortOpen     = ref(false)
  const isMidiMappingOpen  = ref(false)
  const isProfileOpen      = ref(false)
  const isAuthModalOpen    = ref(false)
  const isAdminPanelOpen   = ref(false)
  const isHelpOpen         = ref(false)
  const isManualOpen       = ref(false)
  const isSupportOpen      = ref(false)
  const isVisualizerOpen   = ref(false)
  const isCaptureOpen       = ref(false)
  const isAudioCaptureOpen  = ref(false)
  const isRoutingOpen       = ref(false)
  const isBackingTrackOpen = ref(false)
  const isLiveSetOpen      = ref(false)
  const isAppMidiMapperOpen = ref(false)
  const isPatchNotesOpen   = ref(false)
  const isVelocityMapOpen  = ref(false)
  const isLfo1Open         = ref(false)
  const isLfo2Open         = ref(false)
  const isAdminLoggerOpen  = ref(false)
  const isFavoritesOpen    = ref(false)
  const isPortalOpen       = ref(false)
  const isMidiActionsOpen  = ref(false)
  const isPanicOpen        = ref(false)
  const isMainMenuOpen     = ref(false)
  const mainMenuSelectedIndex = ref(-1)
  const isSideMenuOpen     = ref(false)
  const isSessionOpen      = ref(false)
  const isLooperOpen       = ref(false)
  const isMidiMatrixOpen   = ref(false)
  const isAboutOpen        = ref(false)
  const isMidiPerformanceOpen = ref(false)
  const isProgramChangeBrowserOpen = ref(false)
  const isDeviceProgramChangePanelOpen = ref(false)
  const isLivePerformancePadOpen = ref(false)
  const isLiveTimelineOpen       = ref(false)
  const isMidiMonitorOpen        = ref(false)
  const isHelpSlideshowOpen      = ref(false)
  const showUnifiedMidiManager   = ref(false)
  const unifiedMidiManagerTab    = ref('devices')
  const midiActionsActiveTab = ref('mapper')
  const midiActionsSelectedDevice = ref('')

  // UI state
  const isPanelCollapsed   = ref(true)
  const showFavoritesOnly  = ref(false)
  const toolbarIconSize    = ref('md')   // 'sm' | 'md' | 'lg'
  const isFullscreen       = ref(false)
  const isPlayingPreview   = ref(false)
  const isPlayingBacking   = ref(false)
  const isSequencerPlaying = ref(false)
  const seqAutoStart       = ref(localStorage.getItem('SYCORE_SEQ_AUTOSTART') !== 'false')

  const isAudioPlaying     = computed(() => isPlayingPreview.value || isPlayingBacking.value)
  const lastPlaylistName   = ref(localStorage.getItem('S1_LAST_PLAYLIST') || '')
  const activeVisualizerCategory = ref('FILTER')
  const seqCurrentConfig        = ref(null)
  const seqCurrentConfig2       = ref(null)
  const seqActiveSlot           = ref(1)

  // Global MIDI modifiers (shared between VirtualKeyboard and ArpeggiatorPanel)
  const globalModCC        = ref(1)   // CC number for mod wheel
  const globalTranspose    = ref(0)   // semitones, -24..+24

  // --- Modal focus cycling (Ctrl+Tab) ---
  const focusedModalKey = ref(null)

  const MODAL_CYCLE_REGISTRY = {
    auth:                () => isAuthModalOpen.value,
    types:               () => isTypesOpen.value,
    history:             () => isHistoryOpen.value,
    keyboard:            () => isKeyboardOpen.value,
    sequencer:           () => isSequencerOpen.value,
    arp:                 () => isArpOpen.value,
    midiMapping:         () => isMidiMappingOpen.value,
    midiActions:         () => isMidiActionsOpen.value,
    midiMatrix:          () => isMidiMatrixOpen.value,
    midiPerformance:     () => isMidiPerformanceOpen.value,
    deviceProgramChange: () => isDeviceProgramChangePanelOpen.value,
    programChangeBrowser:() => isProgramChangeBrowserOpen.value,
    liveSet:             () => isLiveSetOpen.value,
    livePerformancePad:  () => isLivePerformancePadOpen.value,
    liveTimeline:        () => isLiveTimelineOpen.value,
    capture:             () => isCaptureOpen.value,
    audioCapture:        () => isAudioCaptureOpen.value,
    visualizer:          () => isVisualizerOpen.value,
    profile:             () => isProfileOpen.value,
    adminPanel:          () => isAdminPanelOpen.value,
    about:               () => isAboutOpen.value,
    helpSlideshow:       () => isHelpSlideshowOpen.value,
    velocityMap:         () => isVelocityMapOpen.value,
    lfo1:                () => isLfo1Open.value,
    lfo2:                () => isLfo2Open.value,
    session:             () => isSessionOpen.value,
    looper:              () => isLooperOpen.value,
    adminLogger:         () => isAdminLoggerOpen.value,
    midiMonitor:         () => isMidiMonitorOpen.value,
    unifiedMidi:         () => showUnifiedMidiManager.value,
  }

  const openModalKeys = computed(() =>
    Object.entries(MODAL_CYCLE_REGISTRY)
      .filter(([, isOpen]) => isOpen())
      .map(([key]) => key)
  )

  function cycleFocusedModal(reverse = false) {
    const open = openModalKeys.value
    if (open.length === 0) { focusedModalKey.value = null; return }
    if (open.length === 1) { focusedModalKey.value = open[0]; return }
    const idx = focusedModalKey.value ? open.indexOf(focusedModalKey.value) : -1
    const next = reverse
      ? (idx <= 0 ? open.length - 1 : idx - 1)
      : (idx + 1) % open.length
    focusedModalKey.value = open[next]
  }

  watch(openModalKeys, (open) => {
    if (focusedModalKey.value && !open.includes(focusedModalKey.value)) {
      focusedModalKey.value = open.length > 0 ? open[0] : null
    }
  })

  function closeAll() {
    isHistoryOpen.value      = false
    isTypesOpen.value        = false
    isKeyboardOpen.value     = false
    isSequencerOpen.value    = false
    isArpOpen.value          = false
    isMidiPortOpen.value     = false
    isMidiMappingOpen.value  = false
    isProfileOpen.value      = false
    isAuthModalOpen.value    = false
    isAdminPanelOpen.value   = false
    isHelpOpen.value         = false
    isManualOpen.value       = false
    isSupportOpen.value      = false
    isVisualizerOpen.value   = false
    isCaptureOpen.value       = false
    isAudioCaptureOpen.value  = false
    isRoutingOpen.value       = false
    isBackingTrackOpen.value = false
    isLiveSetOpen.value      = false
    isAppMidiMapperOpen.value = false
    isPatchNotesOpen.value   = false
    isVelocityMapOpen.value  = false
    isLfo1Open.value         = false
    isLfo2Open.value         = false
    isAdminLoggerOpen.value  = false
    isFavoritesOpen.value    = false
    isPortalOpen.value       = false
    isMidiActionsOpen.value  = false
    isPanicOpen.value        = false
    isMainMenuOpen.value     = false
    mainMenuSelectedIndex.value = -1
    isSideMenuOpen.value     = false
    isSessionOpen.value      = false
    isMidiMatrixOpen.value   = false
    isAboutOpen.value        = false
    isMidiPerformanceOpen.value = false
    isProgramChangeBrowserOpen.value = false
    isDeviceProgramChangePanelOpen.value = false
    isLivePerformancePadOpen.value = false
    isLiveTimelineOpen.value       = false
    isHelpSlideshowOpen.value      = false
    midiActionsActiveTab.value = 'mapper'
    midiActionsSelectedDevice.value = ''
    focusedModalKey.value = null
  }

  function toggleMainMenu() {
    isMainMenuOpen.value = !isMainMenuOpen.value
    if (isMainMenuOpen.value) {
      isSideMenuOpen.value = false
      mainMenuSelectedIndex.value = -1
    } else {
      mainMenuSelectedIndex.value = -1
    }
  }

  watch(isMainMenuOpen, (isOpen) => {
    if (!isOpen) {
      mainMenuSelectedIndex.value = -1
    }
  })

  function toggleSideMenu() {
    isSideMenuOpen.value = !isSideMenuOpen.value
    if (isSideMenuOpen.value) isMainMenuOpen.value = false
  }

  watch(lastPlaylistName, (v) => {
    localStorage.setItem('S1_LAST_PLAYLIST', v)
  })

  watch(seqAutoStart, (v) => {
    localStorage.setItem('SYCORE_SEQ_AUTOSTART', String(v))
  })

  return {
    isAppInitializing,
    isHistoryOpen, isTypesOpen, isKeyboardOpen, isSequencerOpen,
    isArpOpen, isMidiPortOpen, isMidiMappingOpen, isProfileOpen,
    isAuthModalOpen, isAdminPanelOpen, isHelpOpen, isManualOpen,
    isSupportOpen, isVisualizerOpen, isCaptureOpen, isAudioCaptureOpen, isRoutingOpen,
    isBackingTrackOpen, isLiveSetOpen, isAppMidiMapperOpen,
    isPatchNotesOpen, isVelocityMapOpen, isLfo1Open, isLfo2Open, isAdminLoggerOpen,
    isFavoritesOpen, isPortalOpen, isMidiActionsOpen, isPanicOpen,
    isMainMenuOpen, mainMenuSelectedIndex, isSideMenuOpen, isSessionOpen, isLooperOpen, isMidiMatrixOpen, isAboutOpen,
    isMidiPerformanceOpen, isProgramChangeBrowserOpen, isDeviceProgramChangePanelOpen, isMidiMonitorOpen,
    isLivePerformancePadOpen, isLiveTimelineOpen, isHelpSlideshowOpen,
    showUnifiedMidiManager, unifiedMidiManagerTab,
    midiActionsActiveTab, midiActionsSelectedDevice,
    isPanelCollapsed, showFavoritesOnly, toolbarIconSize, isFullscreen,
    isPlayingPreview, isPlayingBacking, isSequencerPlaying, seqAutoStart, isAudioPlaying, lastPlaylistName,
    activeVisualizerCategory, seqCurrentConfig, seqCurrentConfig2, seqActiveSlot,
    globalModCC, globalTranspose,
    focusedModalKey, openModalKeys, cycleFocusedModal,
    closeAll, toggleMainMenu, toggleSideMenu
  }
})
