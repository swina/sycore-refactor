<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  Maximize2, Settings, History, Zap, Keyboard, Music, BarChart3, Radio,
  LayoutGrid, Layers, Heart, ListMusic, User, BookOpen, Workflow,
  Settings2, Gamepad2, AlertTriangle, Mail, HelpCircle, Activity, Disc3, Mic, Save, RotateCw, Cpu, Play, Square, KeyboardMusic, Cable, Network, Home, Music2, X, SlidersHorizontal, Volume2, FolderOpen
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
  Save, AlertTriangle, Settings, Cpu, Play, Square, Mic, History, Network, Music2, Disc3, Radio
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
import NoteLatchPanel from '@/components/NoteLatchPanel.vue'
import VirtualKeyboard from '@/components/VirtualKeyboard.vue'
import LiveSet from '@/components/LiveSet.vue'
import MidiCapture from '@/components/MidiCapture.vue'
import AudioCapture from '@/components/AudioCapture.vue'
import AudioVisualizer from '@/components/AudioVisualizer.vue'
import StepSequencer from '@/components/StepSequencer.vue'
import Sequencer from '@/components/Sequencer.vue'
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
import PushNotificationsModal from '@/components/PushNotificationsModal.vue'
import ModuleManagerPanel from '@/components/ModuleManagerPanel.vue'
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
import LoopMachine        from '@/components/LoopMachine.vue'
import DrumMachine        from '@/components/DrumMachine.vue'
import MidiWizard         from '@/components/MidiWizard.vue'
import MidiWizardFlow     from '@/components/MidiWizardFlow.vue'
import MidiMonitorPanel   from '@/components/MidiMonitorPanel.vue'
import InstrumentCockpit  from '@/components/InstrumentCockpit.vue'
import SamplerPanel            from '@/components/SamplerPanel.vue'
import MidiControllerDesigner from '@/components/MidiControllerDesigner.vue'
import MidiDevices from '@/components/MidiDevices.vue'
import LiveTimeline       from '@/components/LiveTimeline.vue'
import SoundEngine        from '@/components/SoundEngine.vue'
import AppFooter from '@/components/AppFooter.vue'
import MidiMapContextMenu from '@/components/ui/MidiMapContextMenu.vue'
import OpenAppsDock from '@/components/ui/OpenAppsDock.vue'

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


// Init push notifications for any logged-in user — prompts for browser
// permission on first visit so they're added to the subscriber list; only
// the superadmin can actually broadcast to it (see AdminPanel.vue / sendPush).
onMounted(async () => {
  if (authStore.user) {
    await restoreSubscription()
    if (!isSubscribed.value) await subscribe()
  }
})

// Local state
const globalTranspose       = ref(0)
const sessionBpmOverride    = ref(false)

const isAdmin = computed(() => authStore.isAdmin)

function closeAllPanels() {
  uiStore.closeAll()
}

function focusStyle(key) {
  if (uiStore.focusedModalKey !== key) return {}
  // Capped at 399 (useDraggableResizable's own DRAGGABLE_Z_MAX) — never
  // exceed it. Sub-dialogs owned by a panel (e.g. LiveTimeline's Add Marker
  // dialog, SoundFolderBrowser) Teleport to body at z-[600]+ on the
  // assumption that nothing panel-related ever goes above ~399; letting
  // this go to 9999 let the currently-focused panel bury its own dialogs
  // whenever focusedModalKey stayed pinned to it (which is now much more
  // often, since useUiStore.focusPanel() sets it on every launcher/dial
  // open, not just Ctrl+Tab cycling).
  return { position: 'relative', zIndex: 399, isolation: 'isolate' }
}

// ── Consolidated panel groups (see docs/plans/modular-panel-system.md) ────
// Only panels with zero cross-store props are collapsed into a loop here;
// panels needing extra props (channel, bpm, capture state, etc.) stay as
// explicit blocks below. `focusKey` is the pre-existing camelCase key used
// by focusStyle()/cycleFocusedModal — a separate namespace from the
// kebab-case ids used by uiStore.isPanelOpen/closePanel (PANEL_ID_REF_LOOKUP)
// until MODAL_CYCLE_REGISTRY is migrated to the same ids (not done yet).

// Always mounted, no props/events — each self-guards its own visibility.
const alwaysMountedPanels = [
  { focusKey: 'unifiedMidi', component: UnifiedMidiManager },
  { focusKey: 'loopMachine', component: LoopMachine },
  { focusKey: 'drumMachine', component: DrumMachine },
  { focusKey: 'sampler', component: SamplerPanel },
  { focusKey: 'midiControllerDesigner', component: MidiControllerDesigner },
  { focusKey: 'visualizer', component: AudioVisualizer },
  { focusKey: 'session', component: SessionManager },
  { focusKey: 'adminLogger', component: MidiLoggerPanel },
]

// v-if gated on a single flag, single @close, no other props.
const simpleTogglePanels = [
  { openId: 'history', focusKey: 'history', component: PresetHistoryPanel, transition: 'sy-modal' },
  { openId: 'midi_matrix', focusKey: 'midiMatrix', component: MidiMatrix, transition: 'sy-modal' },
  { openId: 'midilearn', focusKey: 'midiMapping', component: MidiMappingPanel, transition: 'sy-modal' },
  { openId: 'looper', focusKey: 'looper', component: AudioLooper, transition: 'sy-modal' },
  { openId: 'midi-performance', focusKey: 'midiPerformance', component: MidiPerformancePanel, transition: null },
  { openId: 'midiactions', focusKey: 'midiActions', component: AppMidiMapper, transition: null },
  { openId: 'profile', focusKey: 'profile', component: UserProfileModal, transition: null },
  { openId: 'about', focusKey: 'about', component: AboutModal, transition: null },
]

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
      midiStore.setGlobalBpm(e.detail.bpm)
    }
  }
  window.addEventListener('bpm-update', handleBpmUpdate)

  // setGlobalBpm() (called by every BPM-changing action app-wide) already
  // keeps arpStore.arpBpm and midiStore.currentBpm in sync and re-times
  // outgoing MIDI clock — apply the current value once on mount so a
  // restored/default BPM is reflected in the clock immediately.
  midiStore.setGlobalBpm(arpStore.arpBpm)

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
  <div class="w-full h-screen bg-neutral-950 text-white overflow-hidden flex flex-col bg-container">
    <!-- Floating Vertical Logo -->
    <div class="fixed top-[150px] left-4 origin-left -rotate-90 pointer-events-auto cursor-pointer group" @click="router.push('/')">
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

      <!-- Always-mounted panels (no props) + simple single-flag toggle panels -->
      <div v-for="m in alwaysMountedPanels" :key="m.focusKey" :style="focusStyle(m.focusKey)">
        <component :is="m.component" />
      </div>
      <template v-for="m in simpleTogglePanels" :key="m.openId">
        <div :style="focusStyle(m.focusKey)">
          <Transition v-if="m.transition" :name="m.transition">
            <component :is="m.component" v-if="uiStore.isPanelOpen(m.openId)" @close="uiStore.closePanel(m.openId)" />
          </Transition>
          <component
            v-else-if="uiStore.isPanelOpen(m.openId)"
            :is="m.component"
            @close="uiStore.closePanel(m.openId)"
          />
        </div>
      </template>

      <!-- DEVICE PROGRAM CHANGE PANEL -->
      <div :style="focusStyle('deviceProgramChange')">
        <Transition name="sy-modal">
          <MidiDeviceProgramChangePanel
            v-show="uiStore.isDeviceProgramChangePanelOpen"
            @close="uiStore.isDeviceProgramChangePanelOpen = false"
          />
        </Transition>
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
          @close="uiStore.isArpOpen = false"
        />
      </div>

      <!-- Note Latch -->
      <div :style="focusStyle('noteLatch')">
        <NoteLatchPanel
          :isOpen="uiStore.isNoteLatchOpen"
          @close="uiStore.isNoteLatchOpen = false"
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

      <MidiWizard     v-if="uiStore.isMidiWizardOpen" />
      <MidiWizardFlow />
      <MidiMonitorPanel />
      <InstrumentCockpit />
      <MidiDevices    v-if="uiStore.isMidiDevicesOpen" />

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

      <!-- Step Sequencer -->
      <div :style="focusStyle('sequencer')">
        <StepSequencer
          :isOpen="uiStore.isSequencerOpen || uiStore.isSequencerModalOpen"
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
          @close="uiStore.isSequencerOpen = false; uiStore.isSequencerModalOpen = false"
          @bpmChange="bpm => { midiStore.setGlobalBpm(bpm); sessionBpmOverride = true }"
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

      <!-- Sequencer (new piano-roll-style step editor — see
           docs/plans/modular/new-step-sequencer.md. Independent MIDI FLOW app
           (MidiSource.SEQUENCER2/'sequencer2'); no preset-embedded pattern
           storage, so no initialConfig/configChange/activeSlot/savePattern —
           it persists purely via its own local autosave + Save/Load Library. -->
      <div :style="focusStyle('sequencer2')">
        <Sequencer
          :isOpen="uiStore.isSequencer2Open"
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
          :currentPresetCCValues="presetStore.lastPreset?.data || {}"
          @close="uiStore.isSequencer2Open = false"
          @bpmChange="bpm => { midiStore.setGlobalBpm(bpm); sessionBpmOverride = true }"
          @transposeChange="handleStepSequencerTranspose"
          @openKeyboard="uiStore.isKeyboardOpen = !uiStore.isKeyboardOpen"
          @prevSlot="presetStore.navigateHistory('prev')"
          @nextSlot="presetStore.navigateHistory('next')"
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

      <!-- Admin Panel -->
      <div :style="focusStyle('adminPanel')">
        <Transition name="sy-drawer">
          <AdminPanel v-if="uiStore.isAdminPanelOpen" :isOpen="uiStore.isAdminPanelOpen" @close="uiStore.isAdminPanelOpen = false" />
        </Transition>
      </div>

      <!-- Push Notifications -->
      <div :style="focusStyle('pushNotifications')">
        <PushNotificationsModal v-if="uiStore.isPushNotificationsOpen" @close="uiStore.isPushNotificationsOpen = false" />
      </div>

      <!-- Module Manager -->
      <div :style="focusStyle('moduleManager')">
        <ModuleManagerPanel
          v-if="uiStore.isModuleManagerOpen"
          :isOpen="uiStore.isModuleManagerOpen"
          @close="uiStore.closePanel('module-manager')"
        />
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

      <!-- Open-apps dock (all open panels, not just minimized ones) -->
      <OpenAppsDock />
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
