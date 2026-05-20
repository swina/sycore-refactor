<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import * as lucideIcons from 'lucide-vue-next'
import { Menu, X } from 'lucide-vue-next'
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
  'audio-capture':() => uiStore.isAudioCaptureOpen = !uiStore.isAudioCaptureOpen,
  visualizer:     () => uiStore.isVisualizerOpen = !uiStore.isVisualizerOpen,
  keyboard:       () => uiStore.isKeyboardOpen = !uiStore.isKeyboardOpen,
  arp:            () => uiStore.isArpOpen = !uiStore.isArpOpen,
  favorites:      () => uiStore.isFavoritesOpen = !uiStore.isFavoritesOpen,
  profile:        () => uiStore.isProfileOpen = !uiStore.isProfileOpen,
  help:           () => uiStore.isHelpOpen = !uiStore.isHelpOpen,
  support:        () => uiStore.isSupportOpen = !uiStore.isSupportOpen,
  manual:         () => uiStore.isManualOpen = !uiStore.isManualOpen,
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
  'midi-performance':() => uiStore.isMidiPerformanceOpen = !uiStore.isMidiPerformanceOpen,
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

<template>
  <div class="fixed bottom-10 left-3 z-[700] flex flex-col items-center gap-3">
    
    <!-- Action Buttons -->
    <TransitionGroup 
      name="speed-dial"
      tag="div"
      class="flex flex-col items-center gap-3 mb-2"
    >
      <div 
        v-for="(action, index) in filteredActions" 
        :key="action.id"
        class="group relative flex items-center"
      >
        <!-- Action Button -->
        <button
          @click="action.onClick(); uiStore.isMainMenuOpen = false"
          :class="[
            'w-16 h-16 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all shadow-xl group',
            uiStore.mainMenuSelectedIndex === index
              ? 'border-2 border-synth-neon scale-110 ring-2 ring-synth-neon/50 bg-neutral-900/90 shadow-[0_0_20px_rgba(0,255,204,0.6)] animate-pulse'
              : 'border border-white/10 bg-black/60 backdrop-blur-md hover:scale-105 hover:border-white/30',
            action.color
          ]"
          :style="{ transitionDelay: `${(filteredActions.length - index) * 50}ms` }"
        >
          <component :is="action.iconComponent" class="w-5 h-5" />
          <span class="text-[8px] font-black uppercase tracking-tighter text-center leading-none opacity-80">
            {{ action.label }}
          </span>
        </button>
      </div>
    </TransitionGroup>

    <!-- Main FAB -->
    <button
      @click="toggle"
      :class="[
        'w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl border-2 z-10',
        uiStore.isMainMenuOpen 
          ? 'bg-white text-black border-white rotate-90' 
          : 'bg-neutral-900 text-synth-neon border-synth-neon/30 hover:border-synth-neon hover:scale-105'
      ]"
    >
      <X v-if="uiStore.isMainMenuOpen" class="w-6 h-6" />
      <Menu v-else class="w-6 h-6" />
    </button>

    <!-- Centered Menu Name Indicator (positioned over the footer) -->
    <Transition name="fade">
      <div 
        v-if="uiStore.isMainMenuOpen && activeLabel"
        class="fixed bottom-0 left-1/2 -translate-x-1/2 h-10 pointer-events-none flex items-center justify-center gap-2 z-[710]"
      >
        <span class="w-1.5 h-1.5 rounded-full bg-synth-neon animate-pulse"></span>
        <span class="text-synth-neon font-black text-[10px] tracking-widest font-mono uppercase">
          MENU: {{ activeLabel }}
        </span>
        <span class="w-1.5 h-1.5 rounded-full bg-synth-neon animate-pulse"></span>
      </div>
    </Transition>

    <!-- Overlay backdrop when open -->
    <div 
      v-if="uiStore.isMainMenuOpen" 
      @click="uiStore.isMainMenuOpen = false"
      class="fixed inset-0 bg-black/20 backdrop-blur-[2px] -z-10"
    ></div>
  </div>
</template>

<style scoped>
/* Speed Dial Transition */
.speed-dial-enter-active,
.speed-dial-leave-active {
  transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

.speed-dial-enter-from,
.speed-dial-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.5);
}

/* Fade Transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

button:not(.bg-white) {
  box-shadow: 0 0 15px rgba(0, 255, 204, 0.1);
}
button:not(.bg-white):hover {
  box-shadow: 0 0 25px rgba(0, 255, 204, 0.3);
}
</style>
