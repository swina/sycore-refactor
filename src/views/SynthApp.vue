<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  Maximize2, Settings, History, Zap, Keyboard, Music, BarChart3, Radio,
  LayoutGrid, Layers, Heart, ListMusic, User, BookOpen, Workflow,
  Settings2, Gamepad2, AlertTriangle, Mail, HelpCircle, Activity, Disc3, Mic, Save, RotateCw, Cpu, Play, Square, KeyboardMusic, Cable, Network, Home, Music2, X, SlidersHorizontal
} from 'lucide-vue-next'

const router = useRouter()
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
  Save, AlertTriangle, Settings, Cpu, Play, Square, Mic, History, Network, Music2, Disc3
}

import { useMidiInit } from '@/composables/useMidiInit'
import { useMidiCCListener } from '@/composables/useMidiCCListener'
import { useMidiCapture } from '@/composables/useMidiCapture'
import { useControllerManager } from '@/composables/useControllerManager'
import { usePushNotifications } from '@/composables/usePushNotifications'
import { useMinimizedModals } from '@/composables/useMinimizedModals'

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
import StepSequencerModal from '@/components/StepSequencerModal.vue'
import ChordProgSequencer from '@/components/ChordProgSequencer.vue'
import PresetHistoryPanel from '@/components/PresetHistoryPanel.vue'
import MidiLoggerPanel from '@/components/MidiLoggerPanel.vue'
import MidiPerformancePanel from '@/components/MidiPerformancePanel.vue'
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
import UnifiedMidiManager from '@/components/UnifiedMidiManager.vue'
import AboutModal from '@/components/AboutModal.vue'
import SlideshowModal from '@/components/SlideshowModal.vue'
import VelocityMappingDialog from '@/components/VelocityMappingDialog.vue'
import LfoMappingDialog from '@/components/LfoMappingDialog.vue'
import ProgramChangeBrowser from '@/components/ProgramChangeBrowser.vue'
import MidiDeviceProgramChangePanel from '@/components/MidiDeviceProgramChangePanel.vue'
import LivePerformancePad from '@/components/LivePerformancePad.vue'
import LiveTimeline       from '@/components/LiveTimeline.vue'
import SoundEngine        from '@/components/SoundEngine.vue'
import AppFooter from '@/components/AppFooter.vue'
import MidiMapContextMenu from '@/components/ui/MidiMapContextMenu.vue'
import MinimizedModalsBar from '@/components/ui/MinimizedModalsBar.vue'

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
const { captureNotesRef, captureNoteCount, captureEnabled, resetCapture } = useMidiCapture()
const { restoreSubscription, isSubscribed, subscribe } = usePushNotifications()
const { minimizedModals } = useMinimizedModals()


// Init push notifications for superadmin
onMounted(async () => {
  if (authStore.user?.email === 'swina.allen@gmail.com') {
    await restoreSubscription()
    if (!isSubscribed.value) await subscribe()
  }
})

// Local state
const globalTranspose       = ref(0)
const sessionBpmOverride    = ref(false)

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
  manual:      { state: 'isGuidesOpen',     icon: BookOpen,      label: 'User Manual' },
  help:        { state: 'isHelpOpen',       icon: HelpCircle,    label: 'Help & Info' },
  guides:      { state: 'isGuidesOpen',    icon: BookOpen,      label: 'Guides' },
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
  'midi-performance':   { state: 'isMidiPerformanceOpen',       icon: Network, label: 'MIDI Performance Grid'    },
  'program-change':         { state: 'isProgramChangeBrowserOpen',       icon: Music2, label: 'Program Change Browser' },
  'device-program-change':  { state: 'isDeviceProgramChangePanelOpen',   icon: Disc3,   label: 'Device Program Change' },
  'live-performance-pad':   { state: 'isLivePerformancePadOpen',         icon: Layers,  label: 'Live Performance' },
  'live-timeline':          { state: 'isLiveTimelineOpen',               icon: ListMusic,        label: 'Live Timeline' },
  'sound-engine':           { state: 'isSoundEngineOpen',                icon: SlidersHorizontal, label: 'Sound Engine' },
  'chord-prog':             { state: 'isChordProgOpen',                  icon: Music2,             label: 'Chord Progression Sequencer' },
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

function focusStyle(key) {
  if (uiStore.focusedModalKey !== key) return {}
  return { position: 'relative', zIndex: 9999, isolation: 'isolate' }
}

async function handleStepSequencerSave(config) {
  if (uiStore.seqActiveSlot === 2) {
    uiStore.seqCurrentConfig2 = config
  } else {
    uiStore.seqCurrentConfig = config
  }
  if (presetStore.lastPreset) {
    try {
      await presetStore.savePreset()
    } catch (e) {
      console.error('Failed to save preset with sequencer data:', e)
    }
  }
}

function handleStepSequencerTranspose(val) {
  globalTranspose.value = val
}

function setCaptureEnabled(val) {
  captureEnabled.value = val
}

function handleSendToSequencer(config) {
  if (uiStore.seqActiveSlot === 2) {
    uiStore.seqCurrentConfig2 = config
  } else {
    uiStore.seqCurrentConfig = config
  }
  uiStore.isSequencerOpen = true
  uiStore.isCaptureOpen = false
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
    if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
      e.preventDefault()
      uiStore.isHelpSlideshowOpen = !uiStore.isHelpSlideshowOpen
    }
    if (e.ctrlKey && e.key === 'Tab') {
      e.preventDefault()
      uiStore.cycleFocusedModal(e.shiftKey)
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
    <div class="fixed top-[150px] left-4 z-[50] origin-left -rotate-90 pointer-events-auto cursor-pointer group" @click="router.push('/')">
      <h1 class="text-4xl mt-8 font-black uppercase text-synth-neon/60 mix-blend-screen whitespace-nowrap group-hover:text-synth-neon transition-colors duration-500">
        <span class="text-white">{{ configStore.appName.split('.')[0] }}.</span>{{ configStore.appName.split('.')[1] }}
      </h1>
    </div>

    <!-- Home Button -->
    <!-- <button
      @click="router.push('/')"
      title="Home"
      class="fixed top-2 left-4 z-[200] w-9 h-9 rounded-lg bg-neutral-900/70 border border-neutral-800 hover:border-synth-neon/60 hover:bg-neutral-900 text-neutral-400 hover:text-synth-neon flex items-center justify-center transition-all active:scale-95 shadow-lg"
    >
      <Home class="w-4 h-4" />
    </button> -->

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
      <Welcome v-if="!authStore.user || !presetStore.showResults" />
      <SoundEngine  v-else/>
      <!-- <ResultsPanel v-else /> -->
    </div>

    <!-- Modals (Teleport to body) -->
    <Teleport to="body">
      <!-- Auth Modal -->
      <div :style="focusStyle('auth')">
        <AuthModal v-if="uiStore.isAuthModalOpen" @close="uiStore.isAuthModalOpen = false" />
      </div>

      <!-- Sound Types -->
      <div :style="focusStyle('types')">
        <Transition name="sy-modal">
          <SoundTypesPanel
            v-if="uiStore.isTypesOpen"
            @close="uiStore.isTypesOpen = false; uiStore.isHistoryOpen = false"
          />
        </Transition>
      </div>

      <!-- Preset History -->
      <div :style="focusStyle('history')">
        <Transition name="sy-modal">
          <PresetHistoryPanel
            v-if="uiStore.isHistoryOpen"
            @close="uiStore.isHistoryOpen = false"
          />
        </Transition>
      </div>

      <!-- MIDI MATRIX -->
      <div :style="focusStyle('midiMatrix')">
        <Transition name="sy-modal">
          <MidiMatrix
            v-if="uiStore.isMidiMatrixOpen"
            @close="uiStore.isMidiMatrixOpen = false"
          />
        </Transition>
      </div>

      <!-- DEVICE PROGRAM CHANGE PANEL -->
      <div :style="focusStyle('deviceProgramChange')">
        <Transition name="sy-modal">
          <MidiDeviceProgramChangePanel
            v-if="uiStore.isDeviceProgramChangePanelOpen"
            @close="uiStore.isDeviceProgramChangePanelOpen = false"
          />
        </Transition>
      </div>

      <!-- MIDI PERFORMANCE GRID -->
      <div :style="focusStyle('midiPerformance')">
        <MidiPerformancePanel
          v-if="uiStore.isMidiPerformanceOpen"
          @close="uiStore.isMidiPerformanceOpen = false"
        />
      </div>

      <!-- MIDI Mapping -->
      <div :style="focusStyle('midiMapping')">
        <Transition name="sy-modal">
          <MidiMappingPanel
            v-if="uiStore.isMidiMappingOpen"
            @close="uiStore.isMidiMappingOpen = false"
          />
        </Transition>
      </div>

      <!-- MIDI APP ACTION MAPPING -->
      <div :style="focusStyle('midiActions')">
        <AppMidiMapper v-if="uiStore.isMidiActionsOpen" @close="uiStore.isMidiActionsOpen = false" />
      </div>

      <!-- UNIFIED MIDI MANAGER -->
      <div :style="focusStyle('unifiedMidi')">
        <UnifiedMidiManager />
      </div>

      <!-- PROGRAM CHANGE BROWSER -->
      <div :style="focusStyle('programChangeBrowser')">
        <Transition name="sy-drawer">
          <div
            v-if="uiStore.isProgramChangeBrowserOpen"
            class="fixed top-0 right-0 bottom-10 w-full max-w-sm bg-neutral-950 border-l border-neutral-900 shadow-2xl z-[440] flex flex-col overflow-hidden"
          >
            <div class="px-5 py-4 border-b border-neutral-900 flex items-center justify-between bg-black/50 backdrop-blur-xl shrink-0">
              <div class="flex items-center gap-2.5">
                <Music2 class="w-4 h-4 text-violet-400" />
                <span class="text-xs font-black uppercase tracking-[0.2em] text-neutral-300">Program Change</span>
              </div>
              <button @click="uiStore.isProgramChangeBrowserOpen = false" class="p-1.5 hover:bg-neutral-900 rounded-lg text-neutral-500 hover:text-white transition-colors">
                <X class="w-4 h-4" />
              </button>
            </div>
            <div class="flex-1 overflow-y-auto p-4">
              <ProgramChangeBrowser />
            </div>
          </div>
        </Transition>
      </div>

      <!-- Arpeggiator -->
      <div :style="focusStyle('arp')">
        <ArpeggiatorPanel
          :isOpen="uiStore.isArpOpen"
          :channel="midiStore.midiChannel - 1"
          :inputChannel="midiStore.midiInputChannel"
          @close="uiStore.isArpOpen = false"
        />
      </div>

      <!-- Virtual Keyboard -->
      <div :style="focusStyle('keyboard')">
        <Transition name="sy-modal">
          <VirtualKeyboard
            v-if="uiStore.isKeyboardOpen"
            :channel="midiStore.midiChannel"
            :inputChannel="midiStore.midiInputChannel"
            @close="uiStore.isKeyboardOpen = false"
          />
        </Transition>
      </div>

      <!-- Live Set -->
      <div :style="focusStyle('liveSet')">
        <Transition name="sy-modal">
          <LiveSet
            v-if="uiStore.isLiveSetOpen"
            :isOpen="uiStore.isLiveSetOpen"
            :isAdmin="isAdmin"
            @close="uiStore.isLiveSetOpen = false"
          />
        </Transition>
      </div>

      <div :style="focusStyle('livePerformancePad')">
        <Transition name="sy-modal">
          <LivePerformancePad
            v-show="uiStore.isLivePerformancePadOpen"
            :isOpen="uiStore.isLivePerformancePadOpen"
            @close="uiStore.isLivePerformancePadOpen = false"
          />
        </Transition>
      </div>

      <!-- Live Timeline -->
      <div :style="focusStyle('liveTimeline')">
        <Transition name="sy-modal">
          <LiveTimeline
            v-if="uiStore.isLiveTimelineOpen"
            :isOpen="uiStore.isLiveTimelineOpen"
            @close="uiStore.isLiveTimelineOpen = false"
          />
        </Transition>
      </div>

      <!-- Sound Engine (floating modal) -->
      <div :style="focusStyle('soundEngine')">
        <SoundEngine
          :isOpen="uiStore.isSoundEngineOpen"
          @close="uiStore.isSoundEngineOpen = false"
        />
      </div>

      <!-- MIDI Capture -->
      <div :style="focusStyle('capture')">
        <MidiCapture
          v-if="uiStore.isCaptureOpen"
          :isOpen="uiStore.isCaptureOpen"
          :notesRef="captureNotesRef"
          :noteCount="captureNoteCount"
          :captureEnabled="captureEnabled"
          :bpm="midiStore.currentBpm || 120"
          @close="uiStore.isCaptureOpen = false"
          @reset="resetCapture"
          @update:captureEnabled="setCaptureEnabled"
          @sendToSequencer="handleSendToSequencer"
        />
      </div>

      <!-- Audio Capture -->
      <div :style="focusStyle('audioCapture')">
        <AudioCapture @close="uiStore.isAudioCaptureOpen = false" />
      </div>

      <!-- Audio Visualizer -->
      <div :style="focusStyle('visualizer')">
        <AudioVisualizer />
      </div>

      <!-- Step Sequencer -->
      <div :style="focusStyle('sequencer')">
        <StepSequencerModal
          :isOpen="uiStore.isSequencerOpen && !uiStore.isSoundEngineOpen"
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
          :initialConfig="uiStore.seqActiveSlot === 2 ? uiStore.seqCurrentConfig2 : uiStore.seqCurrentConfig"
          :currentPresetCCValues="presetStore.lastPreset?.data || {}"
          :activeSlot="uiStore.seqActiveSlot"
          @close="uiStore.isSequencerOpen = false"
          @bpmChange="bpm => { arpStore.arpBpm = bpm; sessionBpmOverride = true }"
          @transposeChange="handleStepSequencerTranspose"
          @configChange="config => {
            if (uiStore.seqActiveSlot === 2) {
              uiStore.seqCurrentConfig2 = config
            } else {
              uiStore.seqCurrentConfig = config
            }
          }"
          @savePattern="handleStepSequencerSave"
          @openKeyboard="uiStore.isKeyboardOpen = !uiStore.isKeyboardOpen"
          @prevSlot="presetStore.navigateHistory('prev')"
          @nextSlot="presetStore.navigateHistory('next')"
          @activeSlotChange="slot => uiStore.seqActiveSlot = slot"
          @stop="() => {}"
        />
      </div>

      <!-- Chord Progression Sequencer -->
      <div :style="focusStyle('chordProg')">
        <ChordProgSequencer
          :isOpen="uiStore.isChordProgOpen"
          :bpm="midiStore.currentBpm || 120"
          :channel="midiStore.midiChannel"
          @close="uiStore.isChordProgOpen = false"
        />
      </div>

      <!-- User Profile Modal -->
      <div :style="focusStyle('profile')">
        <UserProfileModal v-if="uiStore.isProfileOpen" @close="uiStore.isProfileOpen = false" />
      </div>

      <!-- Admin Panel -->
      <div :style="focusStyle('adminPanel')">
        <Transition name="sy-drawer">
          <AdminPanel v-if="uiStore.isAdminPanelOpen" :isOpen="uiStore.isAdminPanelOpen" @close="uiStore.isAdminPanelOpen = false" />
        </Transition>
      </div>

      <!-- About Modal -->
      <div :style="focusStyle('about')">
        <AboutModal v-if="uiStore.isAboutOpen" @close="uiStore.isAboutOpen = false" />
      </div>

      <!-- Help Slideshow -->
      <div :style="focusStyle('helpSlideshow')">
        <SlideshowModal :isOpen="uiStore.isHelpSlideshowOpen" source="help" @close="uiStore.isHelpSlideshowOpen = false" />
      </div>

      <!-- Velocity Mapping Dialog -->
      <div :style="focusStyle('velocityMap')">
        <VelocityMappingDialog v-if="uiStore.isVelocityMapOpen" />
      </div>

      <!-- LFO Mapping Dialogs -->
      <div :style="focusStyle('lfo1')">
        <LfoMappingDialog v-if="uiStore.isLfo1Open" :lfoId="1" />
      </div>
      <div :style="focusStyle('lfo2')">
        <LfoMappingDialog v-if="uiStore.isLfo2Open" :lfoId="2" />
      </div>

      <!-- Session Manager -->
      <div :style="focusStyle('session')">
        <SessionManager />
      </div>

      <!-- Audio Looper -->
      <div :style="focusStyle('looper')">
        <Transition name="sy-modal">
          <AudioLooper v-if="uiStore.isLooperOpen" @close="uiStore.isLooperOpen = false" />
        </Transition>
      </div>

      <!-- MIDI Logger -->
      <div :style="focusStyle('adminLogger')">
        <MidiLoggerPanel />
      </div>

      <!-- Global Tooltip -->
      <GlobalTooltip />

      <!-- Global MIDI Map context menu (always mounted, Teleports to body) -->
      <MidiMapContextMenu />

      <!-- Minimized modals restore bar -->
      <MinimizedModalsBar />
    </Teleport>

    <!-- Tooltip Wrapper -->
    <Tooltip content="" />

    <AppFooter @bpm-override="sessionBpmOverride = true" />
    <!-- <SideBar /> -->
    <MainMenuDial />
  </div>
</template>

<style scoped>

.fade-enter-active, .fade-leave-active { transition: opacity 0.5s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
