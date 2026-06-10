<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useConfigStore } from '@/stores/useConfigStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useUiStore } from '@/stores/useUiStore'
import {
  Radio, Cable, Cpu, Info, Zap, LayoutGrid, CircleQuestionMark, Layers, Music, Music2, ListMusic, Workflow,
  Gamepad2, Network, Disc3, RotateCw, Mic, Play, LogIn, X, Presentation, Settings, Infinity, Clock, User
} from 'lucide-vue-next'
import SlideshowModal from '@/components/SlideshowModal.vue'
import AboutModal from '@/components/AboutModal.vue'
import AdminPanel from '@/components/AdminPanel.vue'
import { useMidiInit } from '@/composables/useMidiInit'

const router = useRouter()
const configStore = useConfigStore()
const midiStore = useMidiStore()
const authStore = useAuthStore()
const uiStore = useUiStore()

const isSlideshowOpen = ref(false)
const isHelpSlideshowOpen = ref(false)
const isAdminPanelOpen = ref(false)

useMidiInit()

function goWorkspace() {
  router.push('/workspace')
}
</script>

<template>
  <div class="w-full h-screen bg-neutral-950 text-white flex flex-col overflow-hidden">

    <!-- Top bar -->
    <div class="flex-none flex items-center justify-between px-5 py-3 border-b border-neutral-900 bg-black/60">
      <div class="flex items-center gap-3">
        <span class="text-synth-neon font-mono font-black text-[26px] uppercase drop-shadow-[0_0_8px_rgba(0,163,112,0.5)]">
          <span class="text-white">{{ configStore.appName.split('.')[0] }}.</span><span class="text-synth-neon">{{ configStore.appName.split('.')[1] }}</span>
        </span>
        <span class="text-neutral-600 font-mono text-[10px] uppercase tracking-widest hidden md:block">
          {{ configStore.appSubtitle }}
        </span>
      </div>
      <div class="flex items-center gap-3">
        <div :class="['flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase font-mono border transition-colors',
          midiStore.midiReady
            ? 'bg-synth-neon/10 text-synth-neon border-synth-neon/30'
            : 'bg-red-950/30 text-red-400 border-red-500/20']">
          <Radio class="w-3 h-3" />
          {{ midiStore.midiReady ? 'MIDI READY' : 'MIDI WAITING' }}
        </div>
        <!-- Admin Panel -->
        <button
          v-if="authStore.isAdmin"
          @click="isAdminPanelOpen = true"
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase font-mono border transition-colors bg-neutral-900/60 text-neutral-400 border-neutral-700 hover:border-synth-neon/40 hover:text-synth-neon"
        >
          <Settings class="w-3 h-3" />
          Admin
        </button>

        <!-- Presentation Link (Not logged in) -->

        <!-- <button
          v-if="authStore.user"
          @click="goWorkspace"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-synth-neon text-black font-black uppercase tracking-[0.2em] text-[10px] hover:bg-white active:scale-95 transition-all shadow-[0_0_16px_rgba(0,163,112,0.3)]"
        >
          <Play class="w-3 h-3 fill-current" />
          Workspace
        </button> -->
        <button
          v-if="!authStore.user"
          @click="uiStore.isAuthModalOpen = true"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-synth-neon text-black font-black uppercase tracking-[0.2em] text-[10px] hover:bg-white active:scale-95 transition-all"
        >
          <LogIn class="w-3 h-3" />
          Login
        </button>
      </div>
    </div>

    <!-- Main layout: 2 columns -->
    <div class="flex-1 flex overflow-hidden p-3 gap-3 min-h-0">

      <!-- Column 1 — 70% -->
      <div class="flex flex-col gap-3 cursor-pointer" style="flex: 0 0 70%">

        <div class="flex h-1/2 gap-3">
          <!-- Box 1-A: top 50% -->
          <div  @click="uiStore.isSoundEngineOpen = true;goWorkspace()" class="flex-1 rounded-xl border-neutral-800 bg-neutral-900/40 flex flex-col overflow-hidden items-center bg-sound-design">

              <div class="flex-none px-3 py-2 border-b border-neutral-800 flex items-end h-full gap-1.5">
                <Zap class="w-7 h-7 text-synth-neon" />
                <span class="text-[18px] font-black uppercase tracking-[0.3em] text-neutral-400 font-mono">Sound Engine</span>
              </div>  
              <!-- <h1 class="text-2xl font-bold font-mono uppercase w-full text-right text-synth-neon">Sound Design</h1> -->
            
          </div>
          <div @click="uiStore.isLiveTimelineOpen = !uiStore.isLiveTimelineOpen; goWorkspace()" class="flex-1 rounded-xl cursor-pointer border-neutral-800 bg-neutral-900/40 flex flex-col items-center overflow-hidden bg-home-performance">
            <div class="flex-none px-3 py-2 border-b border-neutral-800 flex items-end h-full gap-1.5">
              <Clock class="w-7 h-7 text-synth-neon" />
              <span class="text-[18px] font-black uppercase tracking-[0.3em] text-neutral-400 font-mono">Timeline</span>
            </div>
          <!-- <div class="flex items-end w-full h-full p-4"><h1 class="text-2xl font-bold font-mono uppercase w-full text-right text-synth-cyan">Performance</h1></div> -->
          </div>
        </div>
        <!-- Box 1-B: bottom 50% -->
        <div class="flex h-1/2 gap-3">
          <div @click="uiStore.isLivePerformancePadOpen = true; goWorkspace()" class="flex-1 cursor-pointer rounded-xl border-neutral-800 bg-neutral-900/40 backdrop-blur-sm flex flex-col items-center overflow-hidden bg-live-performance">
          <div class="flex-none px-3 py-2 border-b border-neutral-800 flex items-end h-full gap-1.5">
            <ListMusic class="w-7 h-7 text-synth-neon" />
            <span class="text-[18px] font-black uppercase tracking-[0.3em] text-neutral-400 font-mono">Live Set</span>
          </div>
          </div>
          <div class="flex flex-col gap-3">
            <div class="flex h-1/2 gap-3">
              <!--- Audio Capture -->
              <div @click="uiStore.isAudioCaptureOpen = true; goWorkspace()" class="flex w-1/2 rounded-xl cursor-pointer items-center border-neutral-800 bg-neutral-900/40 backdrop-blur-sm flex flex-col overflow-hidden bg-audio-capture">
                <div class="flex-none px-2 py-1 border-b border-neutral-800 flex items-end h-full gap-1.5">
                  <Mic class="w-7 h-7 text-synth-neon" />
                  <span class="text-[12px] font-black uppercase tracking-[0.3em] text-neutral-400 font-mono">Audio Capture</span>
                </div>
              </div>
              <!-- MIDI Capture-->
              <div @click="uiStore.isCaptureOpen = true; goWorkspace();" class="flex w-1/2 rounded-xl cursor-pointer items-center border-neutral-800 bg-neutral-900/40 backdrop-blur-sm flex flex-col overflow-hidden bg-midi-capture">
                <div class="flex-none px-2 py-1 border-b border-neutral-800 flex items-end h-full gap-1.5">
                  <Cable class="w-5 h-5 text-synth-neon" />
                  <span class="text-[12px] font-black uppercase tracking-[0.3em] text-neutral-400 font-mono">Piano Roll</span>
                </div>
              </div> 
            </div>
            <div class="flex h-1/2 gap-3">
              <!-- Chord Prog -->
              <div @click="uiStore.isChordProgOpen = true;goWorkspace()"  class="flex w-1/2 rounded-xl cursor-pointer items-center border-neutral-800 bg-neutral-900/40 backdrop-blur-sm flex flex-col overflow-hidden  bg-chord-prog-seq">
                <div class="flex-none px-2 py-1 border-b border-neutral-800 flex items-end h-full gap-1.5">
                  <Layers class="w-7 h-7 text-synth-neon" />
                  <span class="text-[12px] font-black uppercase tracking-[0.3em] text-neutral-400 font-mono">Chord Prog</span>
                </div>
              </div>
              <!-- Step Sequencer -->
              <div @click="uiStore.isSequencerOpen = true;goWorkspace()" class="flex w-1/2 rounded-xl cursor-pointer items-center border-neutral-800 bg-neutral-900/40 backdrop-blur-sm flex flex-col overflow-hidden bg-step-sequencer">
                <div class="flex-none px-2 py-1 border-b border-neutral-800 flex items-end h-full gap-1.5">
                  <Music class="w-5 h-5 text-synth-cyan" />
                  <span class="text-[12px] font-black uppercase tracking-[0.3em] text-neutral-400 font-mono">Step Sequencer</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      <!-- Column 2 — 30% -->
      <div class="flex-1 flex flex-col gap-3 min-w-0">

        <!-- Box 2-1 -->
        <div @click="uiStore.showUnifiedMidiManager = true; goWorkspace()" class="flex-1 rounded-xl cursor-pointer border-neutral-800 bg-neutral-900/40 backdrop-blur-sm flex flex-col overflow-hidden bg-midi-core items-center">
          <div class="flex-none px-3 py-2 border-b border-neutral-800 flex items-end h-full gap-1.5">
            <Cpu class="w-5 h-5 text-synth-neon" />
            <span class="text-[12px] font-black uppercase tracking-[0.3em] text-neutral-400 font-mono">MIDI Manager</span>
          </div>
          <!-- <div class="flex-1 flex flex-col items-center justify-center gap-2 p-3">
            <button
              @click="uiStore.showUnifiedMidiManager = true; goWorkspace()"
              class="flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 hover:border-synth-neon/40 text-neutral-400 hover:text-synth-neon text-[10px] font-mono uppercase tracking-widest transition-all w-full justify-center"
            >
              <Network class="w-3.5 h-3.5" />
              Open
            </button>
          </div> -->
        </div>

         <!-- Box 2-2 -->
        <div @click="uiStore.isDeviceProgramChangePanelOpen = true; goWorkspace()" class="flex-1 rounded-xl cursor-pointer items-center border-neutral-800 bg-neutral-900/40 backdrop-blur-sm flex flex-col overflow-hidden bg-midi-knob">
          <div class="flex-none px-3 py-2 border-b border-neutral-800 flex items-end h-full gap-1.5">
            <Cable class="w-5 h-5 text-synth-neon" />
            <span class="text-[12px] font-black uppercase tracking-[0.3em] text-neutral-400 font-mono">Multi Sounds</span>
          </div>
          <!-- <div class="flex-1 flex flex-col items-end justify-center gap-2 p-3">
            <button
              @click="uiStore.isAudioCaptureOpen = true; goWorkspace()"
              class="flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 hover:border-synth-neon/40 text-neutral-400 hover:text-synth-neon text-[10px] font-mono uppercase tracking-widest transition-all w-full justify-center"
            >
              <Mic class="w-3.5 h-3.5" />
              Open
            </button>
          </div> -->
        </div>

        <!-- Box 2-3 -->
        <div class="flex h-1/4 gap-3">
          <div @click="uiStore.isTracksPlayerOpen = true; goWorkspace()" class="flex-1 cursor-pointer rounded-xl border-neutral-800 bg-neutral-900/40 backdrop-blur-sm flex flex-col items-center overflow-hidden bg-backing-tracks">
            <div class="flex-none px-3 py-2 border-b border-neutral-800 flex items-end h-full gap-1.5">
              <Music class="h-5 w-5 text-synth-neon"/>
              <span class="text-[14px] font-black uppercase tracking-[0.3em] text-neutral-400 font-mono">Tracks</span>            
            </div>
          </div>
          <div @click="uiStore.isLoopMachineOpen = true; goWorkspace()" class="flex-1 cursor-pointer rounded-xl border-neutral-800 bg-neutral-900/40 backdrop-blur-sm flex flex-col items-center overflow-hidden bg-loop-machine">
            <div class="flex-none px-3 py-2 border-b border-neutral-800 flex items-end h-full gap-1.5">
              <Infinity class="h-5 w-5 text-synth-neon"/>
              <span class="text-[14px] font-black uppercase tracking-[0.3em] text-neutral-400 font-mono">Loop Machine</span>            
            </div>
          </div>
        </div>
                <!-- Box 2-5: SY.CORE logo -->
        <!-- <div @click="uiStore.isCaptureOpen = true; goWorkspace();" class="cursor-pointer flex-none rounded-xl border border-neutral-800 bg-black/60 flex items-center justify-center py-4 bg-midi-capture">
          <div class="flex items-center gap-1">
            <Cable class="w-5 h-5 text-synth-neon" />
            <span class="text-[12px] font-black uppercase tracking-[0.3em] text-neutral-400 font-mono">Piano Roll</span>
          </div>
        </div> -->
        <!-- Box 2-4 -->
        <div class="flex-1 cursor-pointer rounded-xl border-neutral-800 bg-neutral-900/60 backdrop-blur-sm flex flex-col overflow-hidden bg-settings">
          <div class="flex items-end w-full h-full p-2 gap-2">
            <div class="flex flex-col w-1/2 gap-1.5 items-center h-full">
              <div class="flex flex-col w-full bg-neutral-800/70 rounded-md border border-neutral-700/50 px-1 py-1 flex items-center gap-1.5">
                <div class="flex-none px-3 py-2 border-b border-neutral-800 flex items-center gap-1.5">
                  <Radio class="w-3 h-3 text-synth-neon" />
                  <span class="text-[9px] font-black uppercase tracking-[0.3em] text-neutral-400 font-mono">Status</span>
                </div>
                <span :class="['text-[10px] font-black uppercase tracking-widest font-mono', midiStore.midiReady ? 'text-synth-neon' : 'text-red-400']">
                    {{ midiStore.midiReady ? 'Connected' : 'Waiting S-1' }}
                </span>
                
              </div>
              <div @click="uiStore.isProfileOpen = true;goWorkspace()" class="flex flex-col w-full bg-neutral-800/70 rounded-md border border-neutral-700/50 px-1 py-1 mb-3 flex items-center gap-1.5 cursor-pointer">
                <div class="flex-none px-3 py-2 border-b border-neutral-800 flex items-center gap-1.5">
                  <User class="w-3 h-3 text-synth-cyan" />
                  <span class="text-[9px] font-black uppercase tracking-[0.3em] text-neutral-400 font-mono">User</span>
                </div>
                <span class="text-[10px] font-black text-synth-cyan uppercase tracking-widest font-mono">Profile</span>
              </div>
            </div>
            <div class="flex flex-col w-1/2 gap-1.5 items-center h-full">
              <div @click="uiStore.isGuidesOpen = true" class="flex flex-col w-full bg-neutral-800/70 rounded-md border border-neutral-700/50 px-1 py-1 flex items-center gap-1.5 cursor-pointer">
                <div class="flex-none px-3 py-2 border-b border-neutral-800 flex items-center gap-1.5">
                  <CircleQuestionMark class="w-3 h-3 text-synth-neon" />
                  <span class="text-[9px] font-black uppercase tracking-[0.3em] text-neutral-400 font-mono">HELP</span>
                </div>
                <span class="text-[10px] font-black text-synth-cyan uppercase tracking-widest font-mono">Manual</span>

              </div>
              <div @click="uiStore.isAboutOpen = true" class="flex flex-col w-full bg-neutral-800/70 rounded-md border border-neutral-700/50 px-1 py-1 mb-3 flex items-center gap-1.5 cursor-pointer">
                <div class="flex-none px-3 py-2 border-b border-neutral-800 flex items-center gap-1.5">
                  <Info class="w-3 h-3 text-synth-cyan" />
                  <span class="text-[9px] font-black uppercase tracking-[0.3em] text-neutral-400 font-mono">About</span>
                </div>
                <span class="text-[10px] font-black text-synth-cyan uppercase tracking-widest font-mono">About SY.CORE</span>
              </div>
            </div>
          </div>
        </div>
        



      </div>
    </div>

    <SlideshowModal :isOpen="isSlideshowOpen" @close="isSlideshowOpen = false" />
    <SlideshowModal :isOpen="isHelpSlideshowOpen" source="help" @close="isHelpSlideshowOpen = false" />
    <AboutModal v-if="uiStore.isAboutOpen" @close="uiStore.isAboutOpen = false" />
    <AdminPanel :isOpen="isAdminPanelOpen" @close="isAdminPanelOpen = false" />
  </div>
</template>
