<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  Maximize2, Settings, History, Zap, Keyboard, Music, BarChart3, Radio,
  LayoutGrid, Layers, Heart, ListMusic, User, BookOpen, Workflow, Cable,
  Settings2, Gamepad2, AlertTriangle, Mail, HelpCircle, Activity, Disc3, Mic, Network
} from 'lucide-vue-next'
import * as lucideIcons from 'lucide-vue-next'
import { useMidiStore } from '@/stores/useMidiStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { usePresetStore } from '@/stores/usePresetStore'
import { useArpStore } from '@/stores/useArpStore'
import { useUiStore } from '@/stores/useUiStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { useConfigStore } from '@/stores/useConfigStore'

import { useSeedConfig } from '@/composables/useSeedConfig'
import { useMidiInit } from '@/composables/useMidiInit'
import { useMidiCCListener } from '@/composables/useMidiCCListener'
import { useMidiCapture } from '@/composables/useMidiCapture'

// Components
import GlobalTooltip from '@/components/GlobalTooltip.vue'
import MidiPortConfig from '@/components/MidiPortConfig.vue'
import AuthModal from '@/components/AuthModal.vue'
import SoundTypesPanel from '@/components/SoundTypesPanel.vue'
import MidiMappingPanel from '@/components/MidiMappingPanel.vue'
import ArpeggiatorPanel from '@/components/ArpeggiatorPanel.vue'
import VirtualKeyboard from '@/components/VirtualKeyboard.vue'
import LiveSet from '@/components/LiveSet.vue'
import MidiCapture from '@/components/MidiCapture.vue'
import AudioCapture from '@/components/AudioCapture.vue'
import AudioVisualizer from '@/components/AudioVisualizer.vue'
import UserProfileModal from '@/components/UserProfileModal.vue'
import StepSequencer from '@/components/StepSequencer.vue'
import AdminPanel from '@/components/AdminPanel.vue'
import PresetHistoryPanel from '@/components/PresetHistoryPanel.vue'
import MidiHubPanel from '@/components/MidiHubPanel.vue'
import MidiLoggerPanel from '@/components/MidiLoggerPanel.vue'
import MidiPerformancePanel from '@/components/MidiPerformancePanel.vue'
import BackingTrackPlayer from '@/components/BackingTrackPlayer.vue'
import ResultsPanel from '@/components/ResultsPanel.vue'
import Welcome from '@/components/Welcome.vue'
import Tooltip from '@/components/Tooltip.vue'

// Stores
const midiStore = useMidiStore()
const authStore = useAuthStore()
const presetStore = usePresetStore()
const arpStore = useArpStore()
const uiStore = useUiStore()
const mappingStore = useMappingStore()
const configStore = useConfigStore()

// Composables
useSeedConfig(configStore)
useMidiInit()
useMidiCCListener()
const { captureNotesRef, captureNoteCount } = useMidiCapture()

// Local state
const globalTranspose     = ref(0)
const seqCurrentConfig    = ref(null)
const sessionBpmOverride  = ref(false)

const currentYear = new Date().getFullYear()
const copyrightYear = currentYear > 2026 ? `2026–${currentYear}` : '2026'

const isAdmin = computed(() => authStore.isAdmin)

// Map button IDs to their state properties, icons, and actions
const toolbarButtonMap = {
  types:       { state: 'isTypesOpen',      icon: LayoutGrid,    label: 'Sound Types' },
  history:     { state: 'isHistoryOpen',    icon: Layers,        label: 'Sounds', badge: 'history' },
  keyboard:    { state: 'isKeyboardOpen',   icon: Keyboard,      label: 'Virtual Keyboard' },
  sequencer:   { state: 'isSequencerOpen',  icon: ListMusic,     label: 'Step Sequencer' },
  profile:     { state: 'isProfileOpen',    icon: User,          label: 'User Profile' },
  portal:      { state: 'isPortalOpen',     icon: BookOpen,      label: 'Back to S1CORE Portal' },
  midilearn:   { state: 'isMidiMappingOpen',icon: Workflow,      label: 'MIDI Mapping (Learn CC)' },
  manual:      { state: 'isManualOpen',     icon: BookOpen,      label: 'User Manual' },
  help:        { state: 'isHelpOpen',       icon: HelpCircle,    label: 'Help & Info' },
  routing:     { state: 'isMidiPortOpen',   icon: Cable,         label: 'MIDI Routing' },
  experimental:{ state: 'isExperimentalOpen',icon: Settings2,    label: 'Experimental Multi-MIDI' },
  liveset:     { state: 'isLiveSetOpen',    icon: Zap,           label: 'Live Set' },
  midiactions: { state: 'isMidiMappingOpen',icon: Gamepad2,      label: 'MIDI Actions' },
  panic:       { state: null,               icon: AlertTriangle,  label: 'PANIC: All Notes Off', action: 'panic' },
  support:     { state: 'isSupportOpen',    icon: Mail,          label: 'Support Request' },
  midiports:   { state: 'isMidiPortOpen',   icon: Zap,           label: 'MIDI Ports' },
  capture:       { state: 'isCaptureOpen',      icon: BarChart3, label: 'MIDI Capture', badge: 'capture' },
  'audio-capture': { state: 'isAudioCaptureOpen',  icon: Mic,      label: 'Audio Capture'    },
  visualizer:      { state: 'isVisualizerOpen',    icon: Activity,  label: 'Audio Visualizer' },
  midilogger:      { state: 'isAdminLoggerOpen',  icon: Settings2, label: 'MIDI Logger'      },
  arp:           { state: 'isArpOpen',          icon: BarChart3, label: 'Arpeggiator' },
  'midi-performance': { state: 'isMidiPerformanceOpen', icon: Network, label: 'MIDI Performance Grid' },
}

function getToolbarIcon(buttonId) {
  const config = toolbarButtonMap[buttonId]
  return config?.icon || Settings
}

function getToolbarIconFromButton(button) {
  // Try to get the icon from the button's icon property
  if (button.icon && lucideIcons[button.icon]) {
    return lucideIcons[button.icon]
  }
  // Fall back to the hardcoded map
  return getToolbarIcon(button.id)
}

function getIconSize() {
  const size = configStore.toolbarIconSize || 4
  return `w-${size} h-${size}`
}

function getIsButtonActive(buttonId) {
  const config = toolbarButtonMap[buttonId]
  if (!config || !config.state) return false
  if (buttonId === 'favorites') return uiStore.isHistoryOpen && presetStore.historyCategoryFilter === 'favorites'
  if (buttonId === 'arp') return uiStore[config.state] || arpStore.arpEnabled
  return uiStore[config.state]
}

function handleToolbarButtonClick(button) {
  const config = toolbarButtonMap[button.id]
  if (!config) return

  if (button.id === 'panic') {
    midiStore.allNotesOff()
    return
  }

  // Favorites: open history panel filtered to favorites
  if (button.id === 'favorites') {
    const alreadyActive = uiStore.isHistoryOpen && presetStore.historyCategoryFilter === 'favorites'
    if (alreadyActive) {
      uiStore.isHistoryOpen = false
    } else {
      presetStore.historyCategoryFilter = 'favorites'
      uiStore.isHistoryOpen = true
    }
    return
  }

  // Toggle the panel state
  uiStore[config.state] = !uiStore[config.state]

  // Close history when opening sound types
  if (button.id === 'types' && uiStore[config.state]) {
    uiStore.isHistoryOpen = false
  }
}

function closeAllPanels() {
  uiStore.closeAll()
}

function handleStepSequencerSave(config) {
  seqCurrentConfig.value = config
}

function handleStepSequencerTranspose(val) {
  globalTranspose.value = val
}

function onSoundTypeSelect(category) {
  uiStore.isAICategoryOpen = category
}

onMounted(() => {
  // Initialize auth to restore persisted session
  const unsubAuth = authStore.init()

  // Show auth modal only if user is not authenticated after loading completes
  const checkAuth = () => {
    if (!authStore.loadingAuth && !authStore.user) {
      uiStore.isAuthModalOpen = true
    }
  }

  // Check immediately in case auth is already loaded
  checkAuth()

  // Also watch for auth state changes
  const stopWatcher = watch(() => authStore.loadingAuth, checkAuth)

  const handleBpmUpdate = (e) => {
    if (!sessionBpmOverride.value && e.detail?.bpm) {
      arpStore.arpBpm = e.detail.bpm
    }
  }
  window.addEventListener('bpm-update', handleBpmUpdate)

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      closeAllPanels()
    }
  }
  window.addEventListener('keydown', handleKeyDown)

  return () => {
    unsubAuth?.()
    stopWatcher?.()
    window.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('bpm-update', handleBpmUpdate)
  }
})
</script>

<template>
  <div class="w-full h-screen bg-neutral-950 text-white overflow-hidden flex flex-col">
    <!-- Main Toolbar -->
    <div class="flex items-center justify-between h-18 px-4 border-b border-neutral-900 bg-black/50 backdrop-blur-xl z-350">
      <div class="flex items-center gap-4 py-4">
        <h1 class="text-lg font-black uppercase tracking-tighter text-synth-neon">{{configStore.appName}}</h1>
        <span class="text-[10px] font-mono text-neutral-500">{{configStore.appSubtitle}}</span>
      </div>

      <!-- Main Controls -->
      <div class="flex items-center gap-2 min-w-3/4">
        <!-- MIDI Status -->
        <Tooltip content="MIDI Status" :disabled="false">
          <div :class="['px-3 py-1.5 rounded-lg text-xs font-bold uppercase flex items-center gap-2', midiStore.midiReady ? 'bg-synth-neon/10 text-synth-neon' : 'bg-red-950/30 text-red-400']">
            <Radio class="w-3 h-3" />
            {{ midiStore.midiReady ? 'Ready' : 'No MIDI' }}
          </div>
        </Tooltip>

        <!-- Auth User Badge -->
        <Tooltip v-if="authStore.user" :content="`${authStore.user.email} (${authStore.profile?.role || 'demo'})`" :disabled="false">
          <button
            @click="uiStore.isProfileOpen = true"
            class="px-3 py-1.5 rounded-lg text-xs font-bold uppercase bg-emerald-950/30 text-emerald-400 hover:bg-emerald-950/50 transition-colors"
          >
            {{ authStore.user.email.split('@')[0] }}
          </button>
        </Tooltip>

        <!-- Toolbar Buttons (Dynamic) -->
        <div class="flex items-center justify-end w-full gap-1 border-l border-neutral-900 pl-2 ml-2">
          <template v-for="button in configStore.toolbarConfig" :key="button.id">
            <template v-if="button.enabled && (!isAdmin || button.id !== 'admin')">
              <Tooltip :content="button.label" :disabled="false">
                <button
                  @click="handleToolbarButtonClick(button)"
                  :class="['ml-2 p-2 rounded-lg border-1 rounded-lg  bg-neutral-900/80 border-neutral-800 transition-colors relative cursor-pointer', getIsButtonActive(button.id) ? 'bg-synth-neon/20 text-synth-neon' : 'text-neutral-400 hover:text-synth-neon hover:border-synth-neon']"
                >
                  <component :is="getToolbarIconFromButton(button)" :class="getIconSize()" />
                  <!-- Badge indicators -->
                  <span v-if="button.id === 'history' && presetStore.history.length > 0" class="absolute top-0 right-0 w-2 h-2 bg-synth-neon rounded-full" />
                  <span v-if="button.id === 'capture' && captureNoteCount > 0" class="absolute top-0 right-0 w-2 h-2 bg-orange-500 rounded-full" />
                </button>
              </Tooltip>
            </template>
          </template>

          <!-- Admin-only buttons -->
          <template v-if="isAdmin">
            <Tooltip content="Admin Settings" :disabled="false">
              <button
                @click="uiStore.isAdminPanelOpen = !uiStore.isAdminPanelOpen"
                :class="['ml-1 p-2 rounded-lg border-1 bg-neutral-900/80 border-neutral-800 transition-colors relative cursor-pointer', uiStore.isAdminPanelOpen ? 'bg-synth-neon/20 text-synth-neon' : 'text-neutral-400 hover:text-synth-neon hover:border-synth-neon']"
              >
                <Settings :class="getIconSize()" />
              </button>
            </Tooltip>
          </template>
        </div>
      </div>
    </div>

    <!-- Main Content Area -->
    <div class="flex-1 overflow-hidden">
      <Welcome v-if="!authStore.user || (!presetStore.lastPreset && !presetStore.showResults)" />
      <ResultsPanel v-else />
    </div>

    <!-- Modals (Teleport to body) -->
    <Teleport to="body">
      <!-- Auth Modal -->
      <AuthModal v-if="uiStore.isAuthModalOpen" @close="uiStore.isAuthModalOpen = false" />

      <!-- MIDI Port Config -->
      <Transition name="modal">
        <MidiPortConfig
          v-if="uiStore.isMidiPortOpen"
          :selectedOutput="midiStore.selectedDevice"
          :selectedInput="midiStore.selectedInputDevice"
          :outputs="midiStore.outputs"
          :inputs="midiStore.inputs"
          :channel="midiStore.midiChannel"
          :inputChannel="midiStore.midiInputChannel"
          @selectOutput="id => midiStore.setOutput(id)"
          @selectInput="id => midiStore.setKeyboardInput(id)"
          @setChannel="ch => midiStore.midiChannel = ch"
          @setInputChannel="ch => midiStore.setControlInput(ch)"
          @close="uiStore.isMidiPortOpen = false"
        />
      </Transition>

      <!-- Sound Types -->
      <Transition name="panel">
        <SoundTypesPanel
          v-if="uiStore.isTypesOpen"
          @close="uiStore.isTypesOpen = false; uiStore.isHistoryOpen = true"
        />
      </Transition>

      <!-- Preset History -->
      <Transition name="panel">
        <PresetHistoryPanel
          v-if="uiStore.isHistoryOpen"
          @close="uiStore.isHistoryOpen = false"
        />
      </Transition>



      <!-- MIDI HUB (Experimental Multi-MIDI Router) -->
      <MidiHubPanel
        v-if="uiStore.isExperimentalOpen"
        @close="uiStore.isExperimentalOpen = false"
      />

      <!-- MIDI PERFORMANCE GRID -->
      <MidiPerformancePanel
        v-if="uiStore.isMidiPerformanceOpen"
        @close="uiStore.isMidiPerformanceOpen = false"
      />

      <!-- MIDI Mapping -->
      <Transition name="panel">
        <MidiMappingPanel
          v-if="uiStore.isMidiMappingOpen"
          @close="uiStore.isMidiMappingOpen = false"
        />
      </Transition>

      <!-- Arpeggiator — always mounted so the engine runs even when the panel is closed -->
      <ArpeggiatorPanel
        :isOpen="uiStore.isArpOpen"
        :channel="midiStore.midiChannel - 1"
        :inputChannel="midiStore.midiInputChannel"
        @close="uiStore.isArpOpen = false"
      />

      <!-- Virtual Keyboard -->
      <Transition name="panel">
        <VirtualKeyboard
          v-if="uiStore.isKeyboardOpen"
          :channel="midiStore.midiChannel"
          :inputChannel="midiStore.midiInputChannel"
          @close="uiStore.isKeyboardOpen = false"
        />
      </Transition>

      <!-- Live Set -->
      <Transition name="panel">
        <LiveSet
          v-if="uiStore.isLiveSetOpen"
          :isOpen="uiStore.isLiveSetOpen"
          :isAdmin="isAdmin"
          @close="uiStore.isLiveSetOpen = false"
        />
      </Transition>

      <!-- MIDI Capture -->
      <Transition name="modal">
        <MidiCapture
          v-if="uiStore.isCaptureOpen"
          :isOpen="uiStore.isCaptureOpen"
          :notesRef="captureNotesRef"
          :noteCount="captureNoteCount"
          @close="uiStore.isCaptureOpen = false"
          @reset="captureNotesRef.current = []"
        />
      </Transition>

      <!-- Audio Capture -->
      <AudioCapture />

      <!-- Audio Visualizer -->
      <AudioVisualizer />

      <!-- Step Sequencer -->
      <StepSequencer
        v-if="uiStore.isSequencerOpen"
        :isOpen="uiStore.isSequencerOpen"
        :bpm="midiStore.currentBpm || 120"
        :channel="midiStore.midiChannel"
        :currentSoundName="presetStore.currentName || ''"
        :currentCategory="presetStore.currentCategory || 'pad'"
        :polyModeString="'poly'"
        :isKeyboardOpen="uiStore.isKeyboardOpen"
        :globalTranspose="globalTranspose"
        :seqStepsLimit="64"
        :canUseSeqGen="authStore.profile?.features?.canUseSeqGen ?? true"
        :canUseSeqParam2="authStore.profile?.features?.canUseSeqParam2 ?? false"
        :canUseSeqGlobalTranspose="authStore.profile?.features?.canUseSeqGlobalTranspose ?? true"
        :canUseSeqSyncTrack="authStore.profile?.features?.canUseSeqSyncTrack ?? false"
        :midiMappings="mappingStore.appMidiMappings"
        :initialConfig="seqCurrentConfig"
        :currentPresetCCValues="presetStore.lastPreset?.data || {}"
        @close="uiStore.isSequencerOpen = false"
        @bpmChange="bpm => midiStore.currentBpm = bpm"
        @transposeChange="handleStepSequencerTranspose"
        @savePattern="handleStepSequencerSave"
        @stop="() => {}"
      />

      <!-- User Profile Modal -->
      <Transition name="modal">
        <UserProfileModal v-if="uiStore.isProfileOpen" @close="uiStore.isProfileOpen = false" />
      </Transition>

      <!-- Admin Panel -->
      <Transition name="panel">
        <AdminPanel v-if="uiStore.isAdminPanelOpen" :isOpen="uiStore.isAdminPanelOpen" @close="uiStore.isAdminPanelOpen = false" />
      </Transition>

      <!-- MIDI Logger (floating FAB — always mounted, self-managed) -->
      <MidiLoggerPanel />

      <!-- Global Tooltip -->
      <GlobalTooltip />
    </Teleport>

    <!-- Tooltip Wrapper -->
    <Tooltip content="" />

    <!-- ── System Footer ── -->
    <footer class="fixed bottom-0 left-0 w-full bg-black/90 backdrop-blur border-t border-neutral-900/50 z-[210] text-[9px] font-mono tracking-widest text-neutral-500 uppercase">
      <div class="py-3 px-4 md:px-8 flex flex-col md:flex-row justify-between items-center gap-4">

        <!-- Left: app meta -->
        <div class="flex flex-wrap items-center justify-center md:justify-start gap-4 md:gap-6 flex-1">
          <span v-if="configStore.osTarget" class="hover:text-synth-neon transition-colors">OS: {{ configStore.osTarget }}</span>
          <span v-if="configStore.appEngine" class="hover:text-synth-neon transition-colors">ENGINE: {{ configStore.appEngine }}</span>
          <span v-if="configStore.appVersion" class="hover:text-synth-neon transition-colors">VERSION: {{ configStore.appVersion }}</span>
        </div>

        <!-- Center: Backing Track Player (logged-in only, hides on small screens) -->
        <div v-if="authStore.user" class="flex-none hidden lg:block">
          <BackingTrackPlayer :isAdmin="isAdmin" />
        </div>

        <!-- Right: controls -->
        <div class="flex flex-wrap items-center justify-center md:justify-end gap-4 md:gap-6 flex-1">
          <span class="hover:text-synth-neon transition-colors">
            CREATED BY: A.Nardone — {{ copyrightYear }}
          </span>

          <!-- Global BPM -->
          <div v-if="authStore.user" class="flex items-center gap-2 relative group">
            <span class="text-neutral-500">GLOBAL BPM:</span>
            <input
              type="number" min="20" max="300"
              :value="arpStore.arpBpm"
              @change="e => { const v = parseInt(e.target.value); if (!isNaN(v)) { arpStore.arpBpm = v; sessionBpmOverride = true } }"
              class="w-14 bg-neutral-900 border border-neutral-800 rounded px-1 py-0.5 text-center text-synth-neon focus:outline-none focus:border-synth-neon transition-colors"
            />
            <button
              v-if="sessionBpmOverride"
              @click="sessionBpmOverride = false"
              class="absolute -top-6 right-0 opacity-0 group-hover:opacity-100 bg-neutral-800 text-neutral-300 px-2 py-1 rounded text-[8px] transition-opacity whitespace-nowrap"
              title="Unlock BPM (allow auto-detect)"
            >UNLOCK</button>
          </div>

          <!-- MIDI Capture -->
          <button
            v-if="authStore.user"
            @click="uiStore.isCaptureOpen = !uiStore.isCaptureOpen"
            :class="['relative px-2 py-1 rounded border flex items-center gap-1.5 transition-colors', uiStore.isCaptureOpen ? 'border-red-400/40 text-red-400 bg-red-400/10' : 'border-neutral-800 text-neutral-500 hover:text-red-400 hover:border-red-400/30']"
            title="MIDI Capture"
          >
            <Disc3 class="w-3 h-3" />
            <span class="text-[8px] font-bold uppercase tracking-widest hidden sm:inline">Capture</span>
            <span v-if="captureNoteCount > 0" class="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[7px] font-black rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
              {{ captureNoteCount > 99 ? '99+' : captureNoteCount }}
            </span>
          </button>

          <!-- MIDI Status -->
          <div
            v-if="authStore.user"
            :class="['px-2 py-1 rounded border flex items-center gap-2', midiStore.midiReady ? 'border-synth-neon/20 text-synth-neon/60' : 'border-red-900/20 text-red-500']"
          >
            <span :class="['w-1.5 h-1.5 rounded-full', midiStore.midiReady ? 'bg-synth-neon animate-pulse' : 'bg-red-500']" />
            {{ midiStore.midiReady ? 'CONNECTED' : 'OFFLINE' }}
          </div>
        </div>

      </div>
    </footer>
  </div>
</template>

<style scoped>
.glow-neon {
  text-shadow: 0 0 10px rgba(0, 255, 204, 0.5);
  box-shadow: 0 0 20px rgba(0, 255, 204, 0.2), inset 0 0 20px rgba(0, 255, 204, 0.1);
}
</style>
