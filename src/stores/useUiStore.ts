import { defineStore } from 'pinia'
import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'
import { useAuthStore } from './useAuthStore'
import { useConfigStore } from './useConfigStore'
import { userKey } from '@/lib/userKey'
import { readStoredTheme, storeTheme, applyTheme, type ThemeMode } from '@/lib/theme'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** All boolean panel-visibility flags exposed by the UI store */
export interface PanelVisibility {
  isHistoryOpen: boolean
  isTypesOpen: boolean
  isKeyboardOpen: boolean
  isSequencerOpen: boolean
  isSequencerModalOpen: boolean
  isArpOpen: boolean
  isMidiPortOpen: boolean
  isMidiMappingOpen: boolean
  isProfileOpen: boolean
  isAuthModalOpen: boolean
  isAdminPanelOpen: boolean
  isModuleManagerOpen: boolean
  isHelpOpen: boolean
  isManualOpen: boolean
  isSupportOpen: boolean
  isVisualizerOpen: boolean
  isCaptureOpen: boolean
  isAudioCaptureOpen: boolean
  isRoutingOpen: boolean
  isBackingTrackOpen: boolean
  isTracksPlayerOpen: boolean
  isLiveSetOpen: boolean
  isAppMidiMapperOpen: boolean
  isPatchNotesOpen: boolean
  isVelocityMapOpen: boolean
  isLfo1Open: boolean
  isLfo2Open: boolean
  isAdminLoggerOpen: boolean
  isFavoritesOpen: boolean
  isPortalOpen: boolean
  isMidiActionsOpen: boolean
  isPanicOpen: boolean
  isMainMenuOpen: boolean
  isSideMenuOpen: boolean
  isSessionOpen: boolean
  isLooperOpen: boolean
  isMidiMatrixOpen: boolean
  isAboutOpen: boolean
  isMidiPerformanceOpen: boolean
  isProgramChangeBrowserOpen: boolean
  isDeviceProgramChangePanelOpen: boolean
  isFreesoundBrowserOpen: boolean
  isLoopMachineOpen: boolean
  isDrumMachineOpen: boolean
  isSamplerOpen: boolean
  isLivePerformancePadOpen: boolean
  isLiveTimelineOpen: boolean
  isCaptureRecording: boolean
  isMidiMonitorOpen: boolean
  isHelpSlideshowOpen: boolean
  isSoundEngineOpen: boolean
  isGuidesOpen: boolean
  isChordProgOpen: boolean
  isAudioMixerOpen: boolean
  isSoundFolderBrowserOpen: boolean
  showUnifiedMidiManager: boolean
  isMidiWizardOpen: boolean
  isMidiFlowOpen: boolean
  isMidiControllerDesignerOpen: boolean
  isMidiDevicesOpen: boolean
}

/** A sound-folder-assign target descriptor */
interface SoundFolderAssignTarget {
  label: string
  trackLabels?: string[]
  onAssign: (file: File) => Promise<void>
  onAssignRandom?: (files: File[], slotIndices?: number[]) => Promise<void>
}

/** Toolbar icon size options */
type IconSize = 'sm' | 'md' | 'lg'

/** Modal cycle registry entry — a key and its open-check function */
type ModalRegistryEntry = () => boolean

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useUiStore = defineStore('ui', () => {
  const isAppInitializing = ref(true)

  // ── Panel visibility ─────────────────────────────────────────────────────
  const isHistoryOpen      = ref(false)
  const isTypesOpen        = ref(false)
  const isKeyboardOpen     = ref(false)
  const isSequencerOpen    = ref(false)
  const isSequencerModalOpen = ref(false)
  const isArpOpen          = ref(false)
  const isMidiPortOpen     = ref(false)
  const isMidiMappingOpen  = ref(false)
  const isProfileOpen      = ref(false)
  const isAuthModalOpen    = ref(false)
  const isAdminPanelOpen   = ref(false)
  const isModuleManagerOpen = ref(false)
  const isHelpOpen         = ref(false)
  const isManualOpen       = ref(false)
  const isSupportOpen      = ref(false)
  const isVisualizerOpen   = ref(false)
  const isCaptureOpen       = ref(false)
  const isAudioCaptureOpen  = ref(false)
  const isRoutingOpen       = ref(false)
  const isBackingTrackOpen  = ref(false)
  const isTracksPlayerOpen  = ref(false)
  const isLiveSetOpen       = ref(false)
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
  const isFreesoundBrowserOpen   = ref(false)
  const isLoopMachineOpen        = ref(false)
  const isDrumMachineOpen        = ref(false)
  const isSamplerOpen            = ref(false)
  const isLivePerformancePadOpen = ref(false)
  const isLiveTimelineOpen       = ref(false)
  const isCaptureRecording       = ref(false)
  const isMidiMonitorOpen        = ref(false)
  const isHelpSlideshowOpen      = ref(false)
  const isSoundEngineOpen        = ref(false)
  const isGuidesOpen             = ref(false)
  const isChordProgOpen          = ref(false)
  const isAudioMixerOpen         = ref(false)
  const isSoundFolderBrowserOpen = ref(false)
  const soundFolderAssignTarget  = ref<SoundFolderAssignTarget | null>(null)
  const showUnifiedMidiManager   = ref(false)
  const unifiedMidiManagerTab    = ref('devices')
  const isMidiWizardOpen              = ref(false)
  const isMidiFlowOpen                = ref(false)
  const isMidiControllerDesignerOpen  = ref(false)
  const isMidiDevicesOpen             = ref(false)
  const midiActionsActiveTab = ref('mapper')
  const midiActionsSelectedDevice = ref('')
  const enabledControllerDesignerPresetIds = ref<string[]>([])

  // ── UI state ─────────────────────────────────────────────────────────────
  const isPanelCollapsed   = ref(true)
  const showFavoritesOnly  = ref(false)
  const toolbarIconSize    = ref<IconSize>('md')
  const isFullscreen       = ref(false)
  const isPlayingPreview   = ref(false)
  const isPlayingBacking   = ref(false)
  const isSequencerPlaying = ref(false)
  const authStore = useAuthStore()
  const configStore = useConfigStore()
  const uid: ComputedRef<string | undefined> = computed(() => authStore.user?.uid)

  const seqAutoStart: Ref<boolean> = ref(localStorage.getItem(userKey('SYCORE_SEQ_AUTOSTART')) !== 'false')

  // ── Theme (light/dark) — applied to <html> synchronously at main.js's
  // first line, before this store even exists; this ref just mirrors that
  // state for reactive UI (ThemeToggle) and re-applies on change ──
  const theme: Ref<ThemeMode> = ref(readStoredTheme())
  function toggleTheme(): void {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
    storeTheme(theme.value)
    applyTheme(theme.value)
  }

  const isAudioPlaying: ComputedRef<boolean> = computed(() => isPlayingPreview.value || isPlayingBacking.value)
  const lastPlaylistName: Ref<string> = ref(localStorage.getItem(userKey('S1_LAST_PLAYLIST')) || '')
  const activeVisualizerCategory: Ref<string> = ref('FILTER')
  const seqCurrentConfig: Ref<any> = ref(null)
  const seqCurrentConfig2: Ref<any> = ref(null)
  const seqActiveSlot: Ref<number> = ref(1)

  // Global MIDI modifiers (shared between VirtualKeyboard and ArpeggiatorPanel)
  const globalModCC: Ref<number> = ref(1)
  const globalTranspose: Ref<number> = ref(0)   // semitones, -24..+24

  // ── Modal focus cycling (Ctrl+Tab) ───────────────────────────────────────
  const focusedModalKey = ref<string | null>(null)

  const MODAL_CYCLE_REGISTRY: Record<string, ModalRegistryEntry> = {
    auth:                () => isAuthModalOpen.value,
    types:               () => isTypesOpen.value,
    history:             () => isHistoryOpen.value,
    keyboard:            () => isKeyboardOpen.value,
    sequencer:           () => isSequencerOpen.value,
    sequencerModal:      () => isSequencerModalOpen.value,
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
    moduleManager:       () => isModuleManagerOpen.value,
    about:               () => isAboutOpen.value,
    helpSlideshow:       () => isHelpSlideshowOpen.value,
    velocityMap:         () => isVelocityMapOpen.value,
    lfo1:                () => isLfo1Open.value,
    lfo2:                () => isLfo2Open.value,
    session:             () => isSessionOpen.value,
    looper:              () => isLooperOpen.value,
    adminLogger:         () => isAdminLoggerOpen.value,
    midiMonitor:         () => isMidiMonitorOpen.value,
    soundEngine:         () => isSoundEngineOpen.value,
    guides:              () => isGuidesOpen.value,
    unifiedMidi:         () => showUnifiedMidiManager.value,
    chordProg:           () => isChordProgOpen.value,
    tracksPlayer:        () => isTracksPlayerOpen.value,
    freesoundBrowser:    () => isFreesoundBrowserOpen.value,
    loopMachine:         () => isLoopMachineOpen.value,
    drumMachine:         () => isDrumMachineOpen.value,
    sampler:             () => isSamplerOpen.value,
    midiControllerDesigner: () => isMidiControllerDesignerOpen.value,
    midiDevices:           () => isMidiDevicesOpen.value,
  }

  const openModalKeys: ComputedRef<string[]> = computed(() =>
    Object.entries(MODAL_CYCLE_REGISTRY)
      .filter(([, isOpen]) => isOpen())
      .map(([key]) => key)
  )

  // Refs keyed by MODAL_CYCLE_REGISTRY key — used to close others on open
  const MODAL_REFS: Record<string, Ref<boolean>> = {
    auth:                isAuthModalOpen,
    types:               isTypesOpen,
    history:             isHistoryOpen,
    keyboard:            isKeyboardOpen,
    sequencer:           isSequencerOpen,
    sequencerModal:      isSequencerModalOpen,
    arp:                 isArpOpen,
    midiMapping:         isMidiMappingOpen,
    midiActions:         isMidiActionsOpen,
    midiMatrix:          isMidiMatrixOpen,
    midiPerformance:     isMidiPerformanceOpen,
    deviceProgramChange: isDeviceProgramChangePanelOpen,
    programChangeBrowser:isProgramChangeBrowserOpen,
    liveSet:             isLiveSetOpen,
    livePerformancePad:  isLivePerformancePadOpen,
    liveTimeline:        isLiveTimelineOpen,
    capture:             isCaptureOpen,
    audioCapture:        isAudioCaptureOpen,
    visualizer:          isVisualizerOpen,
    profile:             isProfileOpen,
    adminPanel:          isAdminPanelOpen,
    moduleManager:       isModuleManagerOpen,
    about:               isAboutOpen,
    helpSlideshow:       isHelpSlideshowOpen,
    velocityMap:         isVelocityMapOpen,
    lfo1:                isLfo1Open,
    lfo2:                isLfo2Open,
    session:             isSessionOpen,
    looper:              isLooperOpen,
    adminLogger:         isAdminLoggerOpen,
    midiMonitor:         isMidiMonitorOpen,
    soundEngine:         isSoundEngineOpen,
    guides:              isGuidesOpen,
    unifiedMidi:         showUnifiedMidiManager,
    chordProg:           isChordProgOpen,
    tracksPlayer:        isTracksPlayerOpen,
    freesoundBrowser:    isFreesoundBrowserOpen,
    loopMachine:         isLoopMachineOpen,
    drumMachine:         isDrumMachineOpen,
    sampler:             isSamplerOpen,
    midiControllerDesigner: isMidiControllerDesignerOpen,
    midiDevices:           isMidiDevicesOpen,
  }

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
    isSequencerModalOpen.value = false
    isArpOpen.value          = false
    isMidiPortOpen.value     = false
    isMidiMappingOpen.value  = false
    isProfileOpen.value      = false
    isAuthModalOpen.value    = false
    isAdminPanelOpen.value   = false
    isModuleManagerOpen.value = false
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
    isSoundEngineOpen.value        = false
    isGuidesOpen.value             = false
    isLoopMachineOpen.value        = false
    isDrumMachineOpen.value        = false
    isSamplerOpen.value                   = false
    isMidiControllerDesignerOpen.value    = false
    isMidiDevicesOpen.value               = false
    isChordProgOpen.value                 = false
    isSoundFolderBrowserOpen.value = false
    soundFolderAssignTarget.value  = null
    midiActionsActiveTab.value = 'mapper'
    midiActionsSelectedDevice.value = ''
    enabledControllerDesignerPresetIds.value = []
    focusedModalKey.value = null
  }

  // ── Generic per-id panel API (canonical toolbar/module ids — kebab-case) ──
  // Single source of truth for "which flag does this id toggle", mirroring the
  // mapping previously copy-pasted across AppFooter.vue, SideBar.vue,
  // MainMenuDial.vue (each had their own ACTION_MAP) and SynthApp.vue's
  // toolbarButtonMap. New code should prefer isPanelOpen/togglePanel over the
  // named isXOpen refs above. See docs/plans/modular-panel-system.md.
  const PANEL_ID_REF_LOOKUP: Record<string, Ref<boolean>> = {
    types: isTypesOpen,
    history: isHistoryOpen,
    liveset: isLiveSetOpen,
    tracks: isBackingTrackOpen,
    sequencer: isSequencerOpen,
    'sequencer-modal': isSequencerModalOpen,
    'audio-capture': isAudioCaptureOpen,
    visualizer: isVisualizerOpen,
    keyboard: isKeyboardOpen,
    arp: isArpOpen,
    favorites: isFavoritesOpen,
    profile: isProfileOpen,
    help: isHelpOpen,
    guides: isGuidesOpen,
    support: isSupportOpen,
    manual: isGuidesOpen,
    portal: isPortalOpen,
    panic: isPanicOpen,
    midilogger: isAdminLoggerOpen,
    routing: isMidiPortOpen,
    midiactions: isMidiActionsOpen,
    midilearn: isMidiMappingOpen,
    session: isSessionOpen,
    looper: isLooperOpen,
    'audio-looper': isLooperOpen,
    admin: isAdminPanelOpen,
    'module-manager': isModuleManagerOpen,
    midi_matrix: isMidiMatrixOpen,
    'midi-performance': isMidiPerformanceOpen,
    'midi-manager': showUnifiedMidiManager,
    capture: isCaptureOpen,
    'live-timeline': isLiveTimelineOpen,
    'sound-engine': isSoundEngineOpen,
    'tracks-player': isTracksPlayerOpen,
    'chord-prog': isChordProgOpen,
    'live-performance-pad': isLivePerformancePadOpen,
    'loop-machine': isLoopMachineOpen,
    'drum-machine': isDrumMachineOpen,
    sampler: isSamplerOpen,
    'device-program-change': isDeviceProgramChangePanelOpen,
    'freesound-browser': isFreesoundBrowserOpen,
    'audio-mixer': isAudioMixerOpen,
    'sound-folder-browser': isSoundFolderBrowserOpen,
    'midi-flow': isMidiFlowOpen,
    'controller-designer': isMidiControllerDesignerOpen,
    'midi-devices': isMidiDevicesOpen,
    'program-change': isProgramChangeBrowserOpen,
    'midi-monitor': isMidiMonitorOpen,
    about: isAboutOpen,
  }

  function isPanelOpen(id: string): boolean {
    return PANEL_ID_REF_LOOKUP[id]?.value ?? false
  }
  // Closing is always allowed (even a since-disabled module can be closed);
  // opening is gated on configStore.isModuleEnabled — this is the defense-in-
  // depth backstop so a disabled module can't be opened via a MIDI action
  // mapping, keyboard shortcut, or stale deep link that bypasses the UI
  // (launcher/toolbar) which already filters disabled modules out visually.
  function togglePanel(id: string): void {
    const ref = PANEL_ID_REF_LOOKUP[id]
    if (!ref) { console.warn(`[useUiStore] togglePanel: unknown panel id "${id}"`); return }
    const next = !ref.value
    if (next && !configStore.isModuleEnabled(id)) {
      console.warn(`[useUiStore] togglePanel: "${id}" is disabled`)
      return
    }
    ref.value = next
  }
  function openPanel(id: string): void {
    const ref = PANEL_ID_REF_LOOKUP[id]
    if (!ref) return
    if (!configStore.isModuleEnabled(id)) {
      console.warn(`[useUiStore] openPanel: "${id}" is disabled`)
      return
    }
    ref.value = true
  }
  function closePanel(id: string): void {
    const ref = PANEL_ID_REF_LOOKUP[id]
    if (ref) ref.value = false
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
    localStorage.setItem(userKey('S1_LAST_PLAYLIST'), v)
  })

  watch(seqAutoStart, (v) => {
    localStorage.setItem(userKey('SYCORE_SEQ_AUTOSTART'), String(v))
  })

  watch(uid, (newUid) => {
    if (!newUid) {
      lastPlaylistName.value = ''
      seqAutoStart.value = false
    } else {
      lastPlaylistName.value = localStorage.getItem(userKey('S1_LAST_PLAYLIST')) || ''
      seqAutoStart.value = localStorage.getItem(userKey('SYCORE_SEQ_AUTOSTART')) !== 'false'
    }
  })

  watch(isSoundFolderBrowserOpen, (open) => {
    if (!open) soundFolderAssignTarget.value = null
  })

  return {
    isAppInitializing,
    isHistoryOpen, isTypesOpen, isKeyboardOpen, isSequencerOpen, isSequencerModalOpen,
    isArpOpen, isMidiPortOpen, isMidiMappingOpen, isProfileOpen,
    isAuthModalOpen, isAdminPanelOpen, isModuleManagerOpen, isHelpOpen, isManualOpen,
    isSupportOpen, isVisualizerOpen, isCaptureOpen, isAudioCaptureOpen, isRoutingOpen,
    isBackingTrackOpen, isTracksPlayerOpen, isLiveSetOpen, isAppMidiMapperOpen,
    isPatchNotesOpen, isVelocityMapOpen, isLfo1Open, isLfo2Open, isAdminLoggerOpen,
    isFavoritesOpen, isPortalOpen, isMidiActionsOpen, isPanicOpen,
    isMainMenuOpen, mainMenuSelectedIndex, isSideMenuOpen, isSessionOpen, isLooperOpen, isMidiMatrixOpen, isAboutOpen,
    isMidiPerformanceOpen, isProgramChangeBrowserOpen, isDeviceProgramChangePanelOpen, isMidiMonitorOpen, isSoundEngineOpen, isGuidesOpen, isChordProgOpen, isAudioMixerOpen, isSoundFolderBrowserOpen, soundFolderAssignTarget,
    isFreesoundBrowserOpen, isLoopMachineOpen, isDrumMachineOpen, isSamplerOpen, isMidiControllerDesignerOpen,
    isMidiDevicesOpen,
    isLivePerformancePadOpen, isLiveTimelineOpen, isHelpSlideshowOpen, isCaptureRecording,
    showUnifiedMidiManager, unifiedMidiManagerTab, isMidiWizardOpen, isMidiFlowOpen,
    midiActionsActiveTab, midiActionsSelectedDevice, enabledControllerDesignerPresetIds,
    isPanelCollapsed, showFavoritesOnly, toolbarIconSize, isFullscreen,
    isPlayingPreview, isPlayingBacking, isSequencerPlaying, seqAutoStart, isAudioPlaying, lastPlaylistName,
    activeVisualizerCategory, seqCurrentConfig, seqCurrentConfig2, seqActiveSlot,
    globalModCC, globalTranspose,
    theme, toggleTheme,
    focusedModalKey, openModalKeys, cycleFocusedModal,
    closeAll, toggleMainMenu, toggleSideMenu,
    isPanelOpen, togglePanel, openPanel, closePanel,
  }
})