<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useConfigStore } from '@/stores/useConfigStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useUiStore } from '@/stores/useUiStore'
import {
  Radio, Cpu, Info, Zap, LayoutGrid, CircleQuestionMark, Layers, Music2, Workflow,
  Gamepad2, Network, Disc3, RotateCw, Mic, Play, LogIn, X, Presentation
} from 'lucide-vue-next'
import SlideshowModal from '@/components/SlideshowModal.vue'
import AboutModal from '@/components/AboutModal.vue'
import { useMidiInit } from '@/composables/useMidiInit'

const router = useRouter()
const configStore = useConfigStore()
const midiStore = useMidiStore()
const authStore = useAuthStore()
const uiStore = useUiStore()

const isSlideshowOpen = ref(false)
const isHelpSlideshowOpen = ref(false)

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

        <!-- Box 1-A: top 50% -->
        <div class="flex-1 rounded-xl border-neutral-800 bg-neutral-900/40 flex flex-col overflow-hidden items-end bg-sound-design">
          <div class="flex items-end w-full h-full p-4" @click="goWorkspace()"><h1 class="text-2xl font-bold font-mono uppercase w-full text-right text-synth-neon">Sound Design</h1></div>
          <!-- <div class="flex-none px-4 py-2.5 border-b border-neutral-800 flex items-center gap-2">
            <Zap class="w-3.5 h-3.5 text-synth-neon" />
            <span class="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-300 font-mono">Sound Design</span>
          </div> -->
          <!-- <div class="flex-1 grid grid-cols-2 gap-3 p-4">
            <button
              @click="uiStore.isTypesOpen = true; goWorkspace()"
              class="group flex flex-col gap-2 p-4 rounded-lg bg-neutral-800/50 border border-neutral-700/50 hover:border-synth-neon/40 hover:bg-synth-neon/5 transition-all text-left"
            >
              <LayoutGrid class="w-5 h-5 text-synth-neon/70 group-hover:text-synth-neon transition-colors" />
              <span class="text-xs font-black uppercase tracking-widest text-neutral-300 font-mono">Sound Types</span>
              <span class="text-[10px] text-neutral-500 font-mono leading-tight">Browse and generate AI sound categories</span>
            </button>
            <button
              @click="uiStore.isHistoryOpen = true; goWorkspace()"
              class="group flex flex-col gap-2 p-4 rounded-lg bg-neutral-800/50 border border-neutral-700/50 hover:border-synth-neon/40 hover:bg-synth-neon/5 transition-all text-left"
            >
              <Layers class="w-5 h-5 text-synth-neon/70 group-hover:text-synth-neon transition-colors" />
              <span class="text-xs font-black uppercase tracking-widest text-neutral-300 font-mono">Preset Library</span>
              <span class="text-[10px] text-neutral-500 font-mono leading-tight">History and saved patches</span>
            </button>
            <button
              @click="uiStore.isArpOpen = true; goWorkspace()"
              class="group flex flex-col gap-2 p-4 rounded-lg bg-neutral-800/50 border border-neutral-700/50 hover:border-synth-neon/40 hover:bg-synth-neon/5 transition-all text-left"
            >
              <Music2 class="w-5 h-5 text-synth-neon/70 group-hover:text-synth-neon transition-colors" />
              <span class="text-xs font-black uppercase tracking-widest text-neutral-300 font-mono">Arpeggiator</span>
              <span class="text-[10px] text-neutral-500 font-mono leading-tight">Note patterns with BPM sync</span>
            </button>
            <button
              @click="uiStore.isSequencerOpen = true; goWorkspace()"
              class="group flex flex-col gap-2 p-4 rounded-lg bg-neutral-800/50 border border-neutral-700/50 hover:border-synth-neon/40 hover:bg-synth-neon/5 transition-all text-left"
            >
              <Cpu class="w-5 h-5 text-synth-neon/70 group-hover:text-synth-neon transition-colors" />
              <span class="text-xs font-black uppercase tracking-widest text-neutral-300 font-mono">Step Sequencer</span>
              <span class="text-[10px] text-neutral-500 font-mono leading-tight">Pattern programming with two slots</span>
            </button>
          </div> -->
        </div>

        <!-- Box 1-B: bottom 50% -->
        <div @click="uiStore.isLiveTimelineOpen = !uiStore.isLiveTimelineOpen; goWorkspace()" class="flex-1 rounded-xl cursor-pointer border-neutral-800 bg-neutral-900/40 flex flex-col overflow-hidden bg-home-performance">
          <div class="flex items-end w-full h-full p-4"><h1 class="text-2xl font-bold font-mono uppercase w-full text-right text-synth-cyan">Performance</h1></div>
          <!-- <div class="flex-none px-4 py-2.5 border-b border-neutral-800 flex items-center gap-2">
            <Network class="w-3.5 h-3.5 text-synth-neon" />
            <span class="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-300 font-mono">MIDI Control & Live</span>
          </div>
          <div class="flex-1 grid grid-cols-2 gap-3 p-4">
            <button
              @click="uiStore.isMidiMappingOpen = true; goWorkspace()"
              class="group flex flex-col gap-2 p-4 rounded-lg bg-neutral-800/50 border border-neutral-700/50 hover:border-synth-neon/40 hover:bg-synth-neon/5 transition-all text-left"
            >
              <Workflow class="w-5 h-5 text-synth-neon/70 group-hover:text-synth-neon transition-colors" />
              <span class="text-xs font-black uppercase tracking-widest text-neutral-300 font-mono">MIDI Mapping</span>
              <span class="text-[10px] text-neutral-500 font-mono leading-tight">Learn & assign CC controllers</span>
            </button>
            <button
              @click="uiStore.isMidiPerformanceOpen = true; goWorkspace()"
              class="group flex flex-col gap-2 p-4 rounded-lg bg-neutral-800/50 border border-neutral-700/50 hover:border-synth-neon/40 hover:bg-synth-neon/5 transition-all text-left"
            >
              <Gamepad2 class="w-5 h-5 text-synth-neon/70 group-hover:text-synth-neon transition-colors" />
              <span class="text-xs font-black uppercase tracking-widest text-neutral-300 font-mono">Performance Grid</span>
              <span class="text-[10px] text-neutral-500 font-mono leading-tight">Live MIDI performance pads</span>
            </button>
            <button
              @click="uiStore.isLooperOpen = true; goWorkspace()"
              class="group flex flex-col gap-2 p-4 rounded-lg bg-neutral-800/50 border border-neutral-700/50 hover:border-synth-neon/40 hover:bg-synth-neon/5 transition-all text-left"
            >
              <RotateCw class="w-5 h-5 text-synth-neon/70 group-hover:text-synth-neon transition-colors" />
              <span class="text-xs font-black uppercase tracking-widest text-neutral-300 font-mono">Audio Looper</span>
              <span class="text-[10px] text-neutral-500 font-mono leading-tight">Multi-track looping</span>
            </button>
            <button
              @click="uiStore.isBackingTrackOpen = true; goWorkspace()"
              class="group flex flex-col gap-2 p-4 rounded-lg bg-neutral-800/50 border border-neutral-700/50 hover:border-synth-neon/40 hover:bg-synth-neon/5 transition-all text-left"
            >
              <Disc3 class="w-5 h-5 text-synth-neon/70 group-hover:text-synth-neon transition-colors" />
              <span class="text-xs font-black uppercase tracking-widest text-neutral-300 font-mono">Backing Track</span>
              <span class="text-[10px] text-neutral-500 font-mono leading-tight">Play along with audio tracks</span>
            </button>
          </div> -->
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
            <Mic class="w-5 h-5 text-synth-neon" />
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
        <div @click="uiStore.isLivePerformancePadOpen = true; goWorkspace()" class="flex-1 cursor-pointer rounded-xl border-neutral-800 bg-neutral-900/40 backdrop-blur-sm flex flex-col items-center overflow-hidden bg-live-performance">
          <div class="flex-none px-3 py-2 border-b border-neutral-800 flex items-end h-full gap-1.5">
            <Zap class="w-5 h-5 text-synth-neon" />
            <span class="text-[12px] font-black uppercase tracking-[0.3em] text-neutral-400 font-mono">Live Set</span>
          </div>
          <!-- <div class="flex-1 flex flex-col items-center justify-center gap-2 p-3">
            <button
              @click="uiStore.isLivePerformancePadOpen = true; goWorkspace()"
              class="flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 hover:border-synth-neon/40 text-neutral-400 hover:text-synth-neon text-[10px] font-mono uppercase tracking-widest transition-all w-full justify-center"
            >
              <Zap class="w-3.5 h-3.5" />
              Open
            </button>
          </div> -->
        </div>

        <!-- Box 2-4 -->
        <div class="flex-1 cursor-pointer rounded-xl border-neutral-800 bg-neutral-900/60 backdrop-blur-sm flex flex-col overflow-hidden bg-settings">
          <div class="flex items-end w-full h-full p-2">
            <div class="flex flex-col w-1/2 gap-1.5 items-center h-full">
              <div class="flex flex-col bg-neutral-800/70 rounded-md border border-neutral-700/50 px-1 py-1 flex items-center gap-1.5">
                <div class="flex-none px-3 py-2 border-b border-neutral-800 flex items-center gap-1.5">
                  <Radio class="w-3 h-3 text-synth-neon" />
                  <span class="text-[9px] font-black uppercase tracking-[0.3em] text-neutral-400 font-mono">MIDI Status</span>
                </div>
                <span :class="['text-[10px] font-black uppercase tracking-widest font-mono', midiStore.midiReady ? 'text-synth-neon' : 'text-red-400']">
                    {{ midiStore.midiReady ? 'Connected' : 'Waiting S-1' }}
                </span>
                
              </div>
              <div @click="isSlideshowOpen = true" class="flex flex-col bg-neutral-800/70 rounded-md border border-neutral-700/50 px-1 py-1 mb-3 flex items-center gap-1.5 cursor-pointer">
                <div class="flex-none px-3 py-2 border-b border-neutral-800 flex items-center gap-1.5">
                  <Presentation class="w-3 h-3 text-synth-cyan" />
                  <span class="text-[9px] font-black uppercase tracking-[0.3em] text-neutral-400 font-mono">Quick Guide</span>
                </div>
                <span class="text-[10px] font-black text-synth-cyan uppercase tracking-widest font-mono">Before You Start</span>
              </div>
            </div>
            <div class="flex flex-col w-1/2 gap-1.5 items-center h-full">
              <div @click="isHelpSlideshowOpen = true" class="flex flex-col w-full bg-neutral-800/70 rounded-md border border-neutral-700/50 px-1 py-1 flex items-center gap-1.5 cursor-pointer">
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

       

        

        <!-- Box 2-4 -->
        

        <!-- Box 2-5: SY.CORE logo -->
        <div class="flex-none rounded-xl border border-neutral-800 bg-black/60 flex items-center justify-center py-4">
          <div class="flex flex-col items-center gap-1">
            <span class="text-xl font-black uppercase text-synth-neon drop-shadow-[0_0_12px_rgba(0,163,112,0.5)] font-mono">
              <span class="text-white">{{ configStore.appName.split('.')[0] }}.</span>{{ configStore.appName.split('.')[1] }}
            </span>
            <span class="text-[8px] font-mono uppercase tracking-[0.25em] text-neutral-600">
              v{{ configStore.appVersion || '—' }}
            </span>
          </div>
        </div>

      </div>
    </div>

    <SlideshowModal :isOpen="isSlideshowOpen" @close="isSlideshowOpen = false" />
    <SlideshowModal :isOpen="isHelpSlideshowOpen" source="help" @close="isHelpSlideshowOpen = false" />
    <AboutModal v-if="uiStore.isAboutOpen" @close="uiStore.isAboutOpen = false" />
  </div>
</template>
