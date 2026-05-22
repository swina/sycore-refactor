<script setup>
import { ref, computed } from 'vue'
import { lucideIcons } from '@/lib/lucide-icons'
const { Settings, X } = lucideIcons
import { useUiStore } from '@/stores/useUiStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useConfigStore } from '@/stores/useConfigStore'

const uiStore = useUiStore()
const authStore = useAuthStore()
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
  midiactions:    () => uiStore.isMidiActionsOpen = !uiStore.isMidiActionsOpen,
  midilearn:      () => uiStore.isMidiMappingOpen = !uiStore.isMidiMappingOpen,
  session:        () => uiStore.isSessionOpen = !uiStore.isSessionOpen,
  admin:          () => uiStore.isAdminPanelOpen = !uiStore.isAdminPanelOpen,
  midi_matrix:    () => uiStore.isMidiMatrixOpen = !uiStore.isMidiMatrixOpen,
  'midi-performance': () => uiStore.isMidiPerformanceOpen = !uiStore.isMidiPerformanceOpen,
  'program-change':   () => uiStore.isProgramChangeBrowserOpen = !uiStore.isProgramChangeBrowserOpen,
}

const COLORS = [
  'text-cyan-400', 'text-purple-400', 'text-yellow-400', 'text-orange-400',
  'text-green-400', 'text-blue-400', 'text-emerald-400', 'text-amber-400', 'text-red-500'
]

const filteredActions = computed(() => {
  if (!uiStore.isSideMenuOpen) return []
  const configButtons = (configStore.toolbarConfig || [])
    .filter(b => {
      if (b.enabled === false || b.fab !== 'settings') return false
      // Strict ID-based admin check for sensitive buttons
      if (b.id === 'admin' || b.id === 'midilogger') return authStore.isAdmin
      return true
    })

  // Always inject Admin Settings for admins if not already there
  if (authStore.isAdmin && !configButtons.find(b => b.id === 'admin')) {
    configButtons.push({
      id: 'admin',
      label: 'ADMIN',
      icon: 'Shield',
      fab: 'settings',
      enabled: true
    })
  }

  return configButtons.map((b, idx) => ({
    ...b,
    iconComponent: lucideIcons[b.icon] || lucideIcons.HelpCircle,
    color: COLORS[idx % COLORS.length],
    onClick: ACTION_MAP[b.id] || (() => console.warn(`No action for ${b.id}`))
  })).reverse()
})

const toggle = () => uiStore.toggleSideMenu()
</script>

<template>
  <div class="fixed bottom-10 right-3 z-[700] flex flex-col items-center gap-3">
    
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
        <!-- Label Tooltip -->
        <span class="absolute right-full mr-4 px-2 py-1 rounded bg-black/80 border border-white/10 text-[10px] font-bold text-white uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          {{ action.label }}
        </span>
        
        <!-- Action Button -->
        <button
          @click="action.onClick(); uiStore.isSideMenuOpen = false"
          :class="[
            'w-16 h-16 rounded-2xl border border-white/10 bg-black/60 backdrop-blur-md flex flex-col items-center justify-center gap-1 transition-all hover:scale-105 hover:border-white/30 shadow-xl group',
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
        uiStore.isSideMenuOpen 
          ? 'bg-white text-black border-white rotate-90' 
          : 'bg-neutral-900 text-synth-neon border-synth-neon/30 hover:border-synth-neon hover:scale-105'
      ]"
    >
      <X v-if="uiStore.isSideMenuOpen" class="w-6 h-6" />
      <Settings v-else class="w-6 h-6 animate-spin-slow" />
    </button>

    <!-- Overlay backdrop when open -->
    <div 
      v-if="uiStore.isSideMenuOpen" 
      @click="uiStore.isSideMenuOpen = false"
      class="fixed inset-0 bg-black/20 backdrop-blur-[2px] -z-10"
    ></div>
  </div>
</template>

<style scoped>
.animate-spin-slow {
  animation: spin 8s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

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

/* Glow effect for main button when closed */
button:not(.bg-white) {
  box-shadow: 0 0 15px rgba(0, 255, 204, 0.1);
}
button:not(.bg-white):hover {
  box-shadow: 0 0 25px rgba(0, 255, 204, 0.3);
}
</style>