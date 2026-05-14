<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import {
  Maximize2, Settings, History, Zap, Keyboard, Music, BarChart3, Radio,
  LayoutGrid, Layers, Heart, ListMusic, User, BookOpen, Workflow,
  Settings2, Gamepad2, AlertTriangle, Mail, HelpCircle, Activity, Disc3, Mic, Save, RotateCw, Cpu, Play, Square, KeyboardMusic, Cable, Network
} from 'lucide-vue-next'
import { useMidiStore } from '@/stores/useMidiStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { usePresetStore } from '@/stores/usePresetStore'
import { useArpStore } from '@/stores/useArpStore'
import { useUiStore } from '@/stores/useUiStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useLfoStore } from '@/stores/useLfoStore'

// Icon Map for dynamic resolution
const iconMap = {
  LayoutGrid, Layers, Heart, Keyboard: KeyboardMusic, ListMusic, User, BookOpen, 
  Workflow, RotateCw, HelpCircle, Cable, Settings2, Zap, Gamepad2, Activity, 
  Save, AlertTriangle, Settings, Cpu, Play, Square, Mic, History, Network
}

import { useMidiInit } from '@/composables/useMidiInit'
import { useMidiCCListener } from '@/composables/useMidiCCListener'
import { useMidiCapture } from '@/composables/useMidiCapture'
import { useControllerManager } from '@/composables/useControllerManager'

// Components
import GlobalTooltip from '@/components/GlobalTooltip.vue'
import AuthModal from '@/components/AuthModal.vue'
import SoundTypesPanel from '@/components/SoundTypesPanel.vue'
import MidiMappingPanel from '@/components/MidiMappingPanel.vue'
import ArpeggiatorPanel from '@/components/ArpeggiatorPanel.vue'
import VirtualKeyboard from '@/components/VirtualKeyboard.vue'
import LiveSet from '@/components/LiveSet.vue'
import MidiCapture from '@/components/MidiCapture.vue'
import AudioCapture from '@/components/AudioCapture.vue'
import AudioVisualizer from '@/components/AudioVisualizer.vue'
import StepSequencer from '@/components/StepSequencer.vue'
import PresetHistoryPanel from '@/components/PresetHistoryPanel.vue'
import MidiLoggerPanel from '@/components/MidiLoggerPanel.vue'
import MidiPerformancePanel from '@/components/MidiPerformancePanel.vue'
import BackingTrackPlayer from '@/components/BackingTrackPlayer.vue'
import ResultsPanel from '@/components/ResultsPanel.vue'
import Welcome from '@/components/Welcome.vue'
import Tooltip from '@/components/Tooltip.vue'
import AppMidiMapper from '@/components/AppMidiMapper.vue'
import UserProfileModal from '@/components/UserProfileModal.vue'
import AdminPanel from '@/components/AdminPanel.vue'
import SessionManager from '@/components/ui/SessionManager.vue'
import AudioLooper from '@/components/AudioLooper.vue'
import QuickChannelSelector from '@/components/ui/QuickChannelSelector.vue'
import SideBar from '@/components/ui/SideBar.vue'
import MainMenuDial from '@/components/ui/MainMenuDial.vue'
import MidiMatrix from '@/components/MidiMatrix.vue'
import AboutModal from '@/components/AboutModal.vue'
import VelocityMappingDialog from '@/components/VelocityMappingDialog.vue'
import LfoMappingDialog from '@/components/LfoMappingDialog.vue'


// Stores
const midiStore = useMidiStore()
const authStore = useAuthStore()
const presetStore = usePresetStore()
const arpStore = useArpStore()
const uiStore = useUiStore()
const mappingStore = useMappingStore()
const configStore = useConfigStore()
const lfoStore = useLfoStore()
const showPartSelector = computed(() => configStore.enablePartSelector)

// Composables
useMidiInit()
useMidiCCListener()
useControllerManager()
const { captureNotesRef, captureNoteCount } = useMidiCapture()

// Local state
const globalTranspose     = ref(0)
const sessionBpmOverride  = ref(false)

const isAdmin = computed(() => authStore.isAdmin)

// Map button IDs to their state properties, icons, and actions
const toolbarButtonMap = {
  types:       { state: 'isTypesOpen',      icon: LayoutGrid,    label: 'Sound Types' },
  history:     { state: 'isHistoryOpen',    icon: Layers,        label: 'Sounds'},
  keyboard:    { state: 'isKeyboardOpen',   icon: Keyboard,      label: 'Virtual Keyboard' },
  sequencer:   { state: 'isSequencerOpen',  icon: ListMusic,     label: 'Step Sequencer' },
  profile:     { state: 'isProfileOpen',    icon: User,          label: 'User Profile' },
  portal:      { state: 'isPortalOpen',     icon: BookOpen,      label: 'Back to S1CORE Portal' },
  midilearn:   { state: 'isMidiMappingOpen',icon: Workflow,      label: 'MIDI Mapping (Learn CC)' },
  manual:      { state: 'isManualOpen',     icon: BookOpen,      label: 'User Manual' },
  help:        { state: 'isHelpOpen',       icon: HelpCircle,    label: 'Help & Info' },
  liveset:     { state: 'isLiveSetOpen',    icon: Zap,           label: 'Live Set' },
  midiactions: { state: 'isMidiActionsOpen',icon: Gamepad2,      label: 'MIDI Actions' },
  panic:       { state: null,               icon: AlertTriangle,  label: 'PANIC: All Notes Off', action: 'panic' },
  support:     { state: 'isSupportOpen',    icon: Mail,          label: 'Support Request' },
  capture:       { state: 'isCaptureOpen',      icon: BarChart3, label: 'MIDI Capture', badge: 'capture' },
  'audio-capture': { state: 'isAudioCaptureOpen',  icon: Mic,      label: 'Audio Capture'    },
  visualizer:      { state: 'isVisualizerOpen',    icon: Activity,  label: 'Audio Visualizer' },
  midilogger:      { state: 'isAdminLoggerOpen',  icon: Settings2, label: 'MIDI Logger'      },
  arp:           { state: 'isArpOpen',          icon: BarChart3, label: 'Arpeggiator' },
  session:       { state: 'isSessionOpen',      icon: Save,       label: 'Session' },
  looper:        { state: 'isLooperOpen',       icon: RotateCw,   label: 'Looper' },
  midi_matrix:   { state: 'isMidiMatrixOpen',   icon: Cpu,        label: 'MIDI Matrix' },
  'midi-performance': { state: 'isMidiPerformanceOpen', icon: Network, label: 'MIDI Performance Grid' },
}

function handleToolbarButtonClick(button) {
  const config = toolbarButtonMap[button.id]
  presetStore.isHistoryOpen = false
  if (!config) return

  if (button.id === 'panic') {
    midiStore.panic()
    return
  }

  // Toggle the panel state
  uiStore[config.state] = !uiStore[config.state]
}

function closeAllPanels() {
  uiStore.closeAll()
}

function handleStepSequencerSave(config) {
  uiStore.seqCurrentConfig = config
}

function handleStepSequencerTranspose(val) {
  globalTranspose.value = val
}

onMounted(() => {
  presetStore.init()
  lfoStore.init()
  
  if (authStore.isAdmin && !configStore.appVersion) {
    configStore.init()
  }

  const checkAuth = () => {
    if (!authStore.loadingAuth && !authStore.user) {
      uiStore.isAuthModalOpen = true
    }
  }

  checkAuth()
  const stopWatcher = watch(() => authStore.loadingAuth, checkAuth)

  const handleBpmUpdate = (e) => {
    if (!sessionBpmOverride.value && e.detail?.bpm) {
      arpStore.arpBpm = e.detail.bpm
    }
  }
  window.addEventListener('bpm-update', handleBpmUpdate)

  watch(() => arpStore.arpBpm, (bpm) => {
    midiStore.currentBpm = bpm
    midiStore.setBpm(bpm)
  }, { immediate: true })

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      closeAllPanels()
    }
  }
  window.addEventListener('keydown', handleKeyDown)

  return () => {
    stopWatcher?.()
    window.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('bpm-update', handleBpmUpdate)
  }
})
</script>

<template>
  <div class="w-full h-screen bg-neutral-950 text-white overflow-hidden flex flex-col">
    <!-- Floating Vertical Logo -->
    <div class="fixed top-[150px] left-4 z-[100] origin-left -rotate-90 pointer-events-auto cursor-pointer group" @click="uiStore.isAboutOpen = true">
      <h1 class="text-4xl font-black uppercase text-synth-neon/60 mix-blend-screen whitespace-nowrap group-hover:text-synth-neon transition-colors duration-500">
        {{ configStore.appName }}
      </h1>
    </div>

    <!-- STARTUP SPLASH -->
    <Transition name="fade">
      <div v-if="uiStore.isAppInitializing" class="fixed inset-0 z-[1000] bg-neutral-950 flex flex-col items-center justify-center">
        <div class="relative flex flex-col items-center">
          <div class="w-24 h-24 border-t-2 border-synth-neon rounded-full animate-spin mb-8"></div>
          <div class="text-4xl font-black text-synth-neon animate-pulse tracking-[1em] ml-[1em] uppercase">
            SY.CORE
          </div>
          <div class="mt-4 text-neutral-500 font-mono text-[10px] tracking-widest uppercase">
            Initializing Neural Audio Engine...
          </div>
        </div>
      </div>
    </Transition>

    <!-- Main Content Area -->
    <div class="flex-1 overflow-hidden">
      <Welcome v-if="!authStore.user || (!presetStore.lastPreset && !presetStore.showResults)" />
      <ResultsPanel v-else />
    </div>

    <!-- Modals (Teleport to body) -->
    <Teleport to="body">
      <!-- Auth Modal -->
      <AuthModal v-if="uiStore.isAuthModalOpen" @close="uiStore.isAuthModalOpen = false" />

      <!-- Sound Types -->
      <Transition name="panel">
        <SoundTypesPanel
          v-if="uiStore.isTypesOpen"
          @close="uiStore.isTypesOpen = false; uiStore.isHistoryOpen = false"
        />
      </Transition>

      <!-- Preset History -->
      <Transition name="panel">
        <PresetHistoryPanel
          v-if="uiStore.isHistoryOpen"
          @close="uiStore.isHistoryOpen = false"
        />
      </Transition>

      <!-- MIDI MATRIX -->
      <Transition name="panel">
        <MidiMatrix
          v-if="uiStore.isMidiMatrixOpen"
          @close="uiStore.isMidiMatrixOpen = false"
        />
      </Transition>

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
      
      <!-- MIDI APP ACTION MAPPING -->
      <AppMidiMapper v-if="uiStore.isMidiActionsOpen" @close="uiStore.isMidiActionsOpen = false" /> 

      <!-- Arpeggiator -->
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
        :canUseSeqParam2="true"
        :canUseSeqGlobalTranspose="authStore.profile?.features?.canUseSeqGlobalTranspose ?? true"
        :canUseSeqSyncTrack="authStore.profile?.features?.canUseSeqSyncTrack ?? false"
        :midiMappings="mappingStore.appMidiMappings"
        :initialConfig="uiStore.seqCurrentConfig"
        :currentPresetCCValues="presetStore.lastPreset?.data || {}"
        @close="uiStore.isSequencerOpen = false"
        @bpmChange="bpm => midiStore.currentBpm = bpm"
        @transposeChange="handleStepSequencerTranspose"
        @savePattern="handleStepSequencerSave"
        @openKeyboard="uiStore.isKeyboardOpen = !uiStore.isKeyboardOpen"
        @prevSlot="presetStore.navigateHistory('prev')"
        @nextSlot="presetStore.navigateHistory('next')"
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

      <!-- About Modal -->
      <Transition name="modal">
        <AboutModal v-if="uiStore.isAboutOpen" @close="uiStore.isAboutOpen = false" />
      </Transition>

      <!-- Velocity Mapping Dialog -->
      <VelocityMappingDialog v-if="uiStore.isVelocityMapOpen" />

      <!-- LFO Mapping Dialogs -->
      <LfoMappingDialog v-if="uiStore.isLfo1Open" :lfoId="1" />
      <LfoMappingDialog v-if="uiStore.isLfo2Open" :lfoId="2" />

      <!-- Session Manager -->
      <SessionManager />

      <!-- Audio Looper -->
      <Transition name="panel">
        <AudioLooper v-if="uiStore.isLooperOpen" @close="uiStore.isLooperOpen = false" />
      </Transition>

      <!-- MIDI Logger -->
      <MidiLoggerPanel />

      <!-- Global Tooltip -->
      <GlobalTooltip />
    </Teleport>

    <!-- Tooltip Wrapper -->
    <Tooltip content="" />

    <!-- ── System Footer ── -->
    <footer class="fixed bottom-0 left-0 w-full bg-black/95 backdrop-blur-md border-t border-neutral-900/80 z-[210] text-[10px] font-mono tracking-widest text-neutral-500 uppercase h-10">
      <div class="h-full px-4 md:px-6 flex flex-row justify-between items-center gap-2">

        <!-- Left: app meta -->
        <div class="flex-none flex items-center gap-2">
          <!-- Auth User Badge -->
          <Tooltip v-if="authStore.user" :content="`${authStore.user.email} (${authStore.profile?.role || 'demo'})`" :disabled="false" position="top">
            <button
              @click="uiStore.isProfileOpen = true"
              class="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase bg-neutral-900/50 border border-neutral-800 text-neutral-400 hover:text-synth-neon hover:border-synth-neon transition-colors"
            >
              <User class="w-3 h-3" />
              <span class="max-w-[100px] truncate">
                {{ authStore.profile?.name || authStore.user.email.split('@')[0] }}
              </span>
            </button>
          </Tooltip>
          <Tooltip content="MIDI Status" :disabled="false" position="top">
            <div :class="['px-2 py-1 rounded-md text-[10px] font-bold uppercase flex items-center gap-1.5 transition-colors', midiStore.midiReady ? 'bg-synth-neon/10 text-synth-neon' : 'bg-red-950/30 text-red-400']">
              <Radio class="w-3 h-3" />
              {{ midiStore.midiReady ? 'READY' : 'WAITING S-1' }}
            </div>
          </Tooltip>
        </div>

        <!-- Right: controls -->
        <div class="flex-1 flex items-center justify-end gap-3 md:gap-5">
          <!-- Quick Channel Selector -->
          <QuickChannelSelector v-if="showPartSelector" />

          <!-- Global MIDI Transport -->
          <div v-if="authStore.user" class="flex items-center gap-2">
            <div class="flex items-center px-2 py-0.5 bg-neutral-900/40 border border-neutral-800/60 rounded-full group">
              <button 
                @click="midiStore.toggleGlobalTransport()"
                :class="[
                  'flex items-center gap-2 px-2 py-1 rounded-full transition-all active:scale-95 font-black text-[8px] border',
                  midiStore.isTransportPlaying 
                    ? 'text-red-500 bg-red-500/10 border-red-500/30 hover:bg-red-500 hover:text-white' 
                    : 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500 hover:text-black'
                ]"
              >
                <div class="flex items-center gap-1.5">
                  <span class="opacity-50 text-[7px] border border-current px-1 rounded-sm tracking-tighter">MIDI</span>
                  <component :is="midiStore.isTransportPlaying ? Square : Play" class="w-3 h-3 fill-current" />
                  <span>{{ midiStore.isTransportPlaying ? 'STOP' : 'START' }}</span>
                </div>
              </button>
            </div>
          </div>

          <!-- MIDI Panic Button -->
          <button 
            v-if="authStore.user"
            @click="midiStore.panic()"
            class="w-8 h-8 flex items-center justify-center rounded-full bg-red-950/30 border border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white transition-all active:scale-90"
          >
            <AlertTriangle class="w-3.5 h-3.5" />
          </button>

          <!-- Global BPM -->
          <div v-if="authStore.user" class="flex items-center gap-2 relative group">
            <span class="text-neutral-500 text-[10px]">GLOBAL BPM:</span>
            <input
              type="number" min="20" max="300"
              :value="arpStore.arpBpm"
              @change="e => { const v = parseInt(e.target.value); if (!isNaN(v)) { arpStore.arpBpm = v; sessionBpmOverride = true } }"
              class="w-12 bg-neutral-900 border border-neutral-800 rounded px-1 py-0.5 text-center text-synth-neon text-[10px] focus:outline-none focus:border-synth-neon transition-colors"
            />
          </div>
        </div>
      </div>
    </footer>
    <SideBar />
    <MainMenuDial />
    <BackingTrackPlayer />
  </div>
</template>

<style scoped>
.glow-neon {
  text-shadow: 0 0 10px rgba(0, 255, 204, 0.5);
  box-shadow: 0 0 20px rgba(0, 255, 204, 0.2), inset 0 0 20px rgba(0, 255, 204, 0.1);
}
.fade-enter-active, .fade-leave-active { transition: opacity 0.5s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
