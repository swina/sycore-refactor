import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUiStore = defineStore('ui', () => {
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
  const isCaptureOpen      = ref(false)
  const isRoutingOpen      = ref(false)
  const isBackingTrackOpen = ref(false)
  const isLiveSetOpen      = ref(false)
  const isAppMidiMapperOpen = ref(false)
  const isPatchNotesOpen   = ref(false)
  const isVelocityMapOpen  = ref(false)
  const isAdminLoggerOpen  = ref(false)
  const isFavoritesOpen    = ref(false)
  const isPortalOpen       = ref(false)
  const isExperimentalOpen = ref(false)
  const isMidiActionsOpen  = ref(false)
  const isPanicOpen        = ref(false)

  // UI state
  const isPanelCollapsed   = ref(false)
  const showFavoritesOnly  = ref(false)
  const toolbarIconSize    = ref('md')   // 'sm' | 'md' | 'lg'
  const isFullscreen       = ref(false)

  // Global MIDI modifiers (shared between VirtualKeyboard and ArpeggiatorPanel)
  const globalModCC        = ref(1)   // CC number for mod wheel
  const globalTranspose    = ref(0)   // semitones, -24..+24

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
    isCaptureOpen.value      = false
    isRoutingOpen.value      = false
    isBackingTrackOpen.value = false
    isLiveSetOpen.value      = false
    isAppMidiMapperOpen.value = false
    isPatchNotesOpen.value   = false
    isVelocityMapOpen.value  = false
    isAdminLoggerOpen.value  = false
    isFavoritesOpen.value    = false
    isPortalOpen.value       = false
    isExperimentalOpen.value = false
    isMidiActionsOpen.value  = false
    isPanicOpen.value        = false
  }

  return {
    isHistoryOpen, isTypesOpen, isKeyboardOpen, isSequencerOpen,
    isArpOpen, isMidiPortOpen, isMidiMappingOpen, isProfileOpen,
    isAuthModalOpen, isAdminPanelOpen, isHelpOpen, isManualOpen,
    isSupportOpen, isVisualizerOpen, isCaptureOpen, isRoutingOpen,
    isBackingTrackOpen, isLiveSetOpen, isAppMidiMapperOpen,
    isPatchNotesOpen, isVelocityMapOpen, isAdminLoggerOpen,
    isFavoritesOpen, isPortalOpen, isExperimentalOpen, isMidiActionsOpen, isPanicOpen,
    isPanelCollapsed, showFavoritesOnly, toolbarIconSize, isFullscreen,
    globalModCC, globalTranspose,
    closeAll,
  }
})
