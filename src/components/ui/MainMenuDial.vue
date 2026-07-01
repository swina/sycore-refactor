<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { lucideIcons } from '@/lib/lucide-icons'
const { Menu, X } = lucideIcons
import { useUiStore } from '@/stores/useUiStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useAuthStore } from '@/stores/useAuthStore'

const authStore = useAuthStore()
const uiStore = useUiStore()
const configStore = useConfigStore()

const ACTION_MAP = {
  types:          () => uiStore.isTypesOpen = !uiStore.isTypesOpen,
  history:        () => uiStore.isHistoryOpen = !uiStore.isHistoryOpen,
  liveset:        () => uiStore.isLiveSetOpen = !uiStore.isLiveSetOpen,
  tracks:         () => uiStore.isBackingTrackOpen = !uiStore.isBackingTrackOpen,
  sequencer:      () => uiStore.isSequencerOpen = !uiStore.isSequencerOpen,
  'sequencer-modal':() => uiStore.isSequencerModalOpen = !uiStore.isSequencerModalOpen,
  'audio-capture':() => uiStore.isAudioCaptureOpen = !uiStore.isAudioCaptureOpen,
  visualizer:     () => uiStore.isVisualizerOpen = !uiStore.isVisualizerOpen,
  keyboard:       () => uiStore.isKeyboardOpen = !uiStore.isKeyboardOpen,
  arp:            () => uiStore.isArpOpen = !uiStore.isArpOpen,
  favorites:      () => uiStore.isFavoritesOpen = !uiStore.isFavoritesOpen,
  profile:        () => uiStore.isProfileOpen = !uiStore.isProfileOpen,
  help:           () => uiStore.isHelpOpen = !uiStore.isHelpOpen,
  guides:         () => uiStore.isGuidesOpen = !uiStore.isGuidesOpen,
  support:        () => uiStore.isSupportOpen = !uiStore.isSupportOpen,
  manual:         () => uiStore.isGuidesOpen = !uiStore.isGuidesOpen,
  portal:         () => uiStore.isPortalOpen = !uiStore.isPortalOpen,
  panic:          () => uiStore.isPanicOpen = !uiStore.isPanicOpen,
  midilogger:     () => uiStore.isAdminLoggerOpen = !uiStore.isAdminLoggerOpen,
  routing:        () => uiStore.isMidiPortOpen = !uiStore.isMidiPortOpen,
  midiactions:    () => uiStore.isMidiActionsOpen = !uiStore.isMidiActionsOpen,
  midilearn:      () => uiStore.isMidiMappingOpen = !uiStore.isMidiMappingOpen,
  session:        () => uiStore.isSessionOpen = !uiStore.isSessionOpen,
  looper:         () => uiStore.isLooperOpen = !uiStore.isLooperOpen,
  admin:          () => uiStore.isAdminPanelOpen = !uiStore.isAdminPanelOpen,
  midi_matrix:   () => uiStore.isMidiMatrixOpen = !uiStore.isMidiMatrixOpen,
  'midi-performance':     () => uiStore.isMidiPerformanceOpen = !uiStore.isMidiPerformanceOpen,
  'midi-manager':         () => uiStore.showUnifiedMidiManager = !uiStore.showUnifiedMidiManager,
  capture:                () => uiStore.isCaptureOpen = !uiStore.isCaptureOpen,
  'live-timeline':        () => uiStore.isLiveTimelineOpen = !uiStore.isLiveTimelineOpen,
  'sound-engine':         () => uiStore.isSoundEngineOpen = !uiStore.isSoundEngineOpen,
  'tracks-player':        () => uiStore.isTracksPlayerOpen = !uiStore.isTracksPlayerOpen,
  'chord-prog':           () => uiStore.isChordProgOpen = !uiStore.isChordProgOpen,
  'live-performance-pad': () => uiStore.isLivePerformancePadOpen = !uiStore.isLivePerformancePadOpen,
  'device-program-change':() => uiStore.isDeviceProgramChangePanelOpen = !uiStore.isDeviceProgramChangePanelOpen,
  'drum-machine':         () => uiStore.isDrumMachineOpen = !uiStore.isDrumMachineOpen,
  'sampler':              () => uiStore.isSamplerOpen = !uiStore.isSamplerOpen,
  'audio-mixer':          () => uiStore.isAudioMixerOpen = !uiStore.isAudioMixerOpen,
  'sound-folder-browser': () => uiStore.isSoundFolderBrowserOpen = !uiStore.isSoundFolderBrowserOpen,
}

const COLORS = [
  'text-synth-neon', 'text-blue-400', 'text-yellow-400', 'text-emerald-400',
  'text-pink-400', 'text-red-400', 'text-indigo-400', 'text-orange-400',
  'text-rose-400', 'text-cyan-400', 'text-purple-400', 'text-amber-400'
]

const filteredActions = computed(() => {
  if (!uiStore.isMainMenuOpen) return []

  const configButtons = (configStore.toolbarConfig || [])
    .filter(b => b.enabled !== false && (b.fab === 'main' || !b.fab))

  return configButtons.map((b, idx) => ({
    ...b,
    iconComponent: lucideIcons[b.icon] || lucideIcons.HelpCircle,
    color: COLORS[idx % COLORS.length],
    onClick: ACTION_MAP[b.id] || (() => console.warn(`No action for ${b.id}`))
  })).reverse()
})

const toggle = () => uiStore.toggleMainMenu()

const handleMidiMainMenu = (e) => {
  const { action, val } = e.detail
  if (action === 'toggle') {
    if (val > 63) {
      if (uiStore.isMainMenuOpen && uiStore.mainMenuSelectedIndex !== -1) {
        const currentActions = filteredActions.value
        const selectedAction = currentActions[uiStore.mainMenuSelectedIndex]
        if (selectedAction) {
          selectedAction.onClick()
          uiStore.isMainMenuOpen = false
        }
      } else {
        uiStore.toggleMainMenu()
      }
    }
  } else if (action === 'select') {
    if (val > 63 && uiStore.isMainMenuOpen && uiStore.mainMenuSelectedIndex !== -1) {
      const currentActions = filteredActions.value
      const selectedAction = currentActions[uiStore.mainMenuSelectedIndex]
      if (selectedAction) {
        selectedAction.onClick()
        uiStore.isMainMenuOpen = false
      }
    }
  } else if (action === 'scroll') {
    if (uiStore.isMainMenuOpen) {
      const currentActions = filteredActions.value
      if (currentActions.length > 0) {
        const idx = Math.min(
          currentActions.length - 1,
          Math.floor((val / 127.1) * currentActions.length)
        )
        uiStore.mainMenuSelectedIndex = idx
      }
    }
  }
}

onMounted(() => {
  window.addEventListener('midi-main-menu', handleMidiMainMenu)
})

onUnmounted(() => {
  window.removeEventListener('midi-main-menu', handleMidiMainMenu)
})

const activeLabel = computed(() => {
  if (!uiStore.isMainMenuOpen || uiStore.mainMenuSelectedIndex === -1) return ''
  const currentActions = filteredActions.value
  const selectedAction = currentActions[uiStore.mainMenuSelectedIndex]
  return selectedAction ? selectedAction.label : ''
})
</script>

<template></template>
