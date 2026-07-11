<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useConfigStore } from '@/stores/useConfigStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useUiStore } from '@/stores/useUiStore'
import { defineAsyncComponent } from 'vue'
import {
  Radio, Cable, Cpu, Info, Zap, CircleQuestionMark, Drum, Layers, Music, ListMusic,
  Mic, LogIn, Settings, Infinity, Clock, User, Globe
} from 'lucide-vue-next'

const SlideshowModal = defineAsyncComponent(() => import('@/components/SlideshowModal.vue'))
const AboutModal = defineAsyncComponent(() => import('@/components/AboutModal.vue'))
const AdminPanel = defineAsyncComponent(() => import('@/components/AdminPanel.vue'))

const router = useRouter()
const configStore = useConfigStore()
const midiStore = useMidiStore()
const authStore = useAuthStore()
const uiStore = useUiStore()

const isSlideshowOpen = ref(false)
const isHelpSlideshowOpen = ref(false)
const isAdminPanelOpen = ref(false)
const websiteUrl = import.meta.env.VITE_WEBSITE_URL || ''

const bgLoaded = ref(false)

onMounted(() => {
  requestIdleCallback(() => { bgLoaded.value = true }, { timeout: 500 })
})

function lazyBg(url) {
  if (!bgLoaded.value) return {}
  return { backgroundImage: `linear-gradient(to bottom, rgba(10,10,10,0.3), rgba(10,10,10,0.3)), url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }
}

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
        <button
          v-if="authStore.isAdmin"
          @click="isAdminPanelOpen = true"
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase font-mono border transition-colors bg-neutral-900/60 text-neutral-400 border-neutral-700 hover:border-synth-neon/40 hover:text-synth-neon"
        >
          <Settings class="w-3 h-3" />
          Admin
        </button>
        <a
          v-if="websiteUrl"
          :href="websiteUrl"
          target="_blank"
          rel="noopener"
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase font-mono border transition-colors bg-neutral-900/60 text-neutral-400 border-neutral-700 hover:border-synth-neon/40 hover:text-synth-neon"
        >
          <Globe class="w-3 h-3" />
          Website
        </a>
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
          <div @click="uiStore.isSoundEngineOpen = true; goWorkspace()" class="flex-1 rounded-xl border-neutral-800 bg-neutral-900/40 flex flex-col overflow-hidden items-center" :style="lazyBg('/bg-sound-design-2.png')">
            <div class="flex-none px-3 py-2 border-b border-neutral-800 flex items-end h-full gap-1.5">
              <Zap class="w-7 h-7 text-synth-neon" />
              <span class="text-[18px] font-black uppercase tracking-[0.3em] text-neutral-400 font-mono">Sound Engine</span>
            </div>
          </div>
          <div @click="uiStore.isLiveTimelineOpen = !uiStore.isLiveTimelineOpen; goWorkspace()" class="flex-1 rounded-xl cursor-pointer border-neutral-800 bg-neutral-900/40 flex flex-col items-center overflow-hidden" :style="lazyBg('/home-performance-synths.png')">
            <div class="flex-none px-3 py-2 border-b border-neutral-800 flex items-end h-full gap-1.5">
              <Clock class="w-7 h-7 text-synth-neon" />
              <span class="text-[18px] font-black uppercase tracking-[0.3em] text-neutral-400 font-mono">Timeline</span>
            </div>
          </div>
        </div>

        <div class="flex h-1/2 gap-3">
          <div @click="uiStore.isLivePerformancePadOpen = true; goWorkspace()" class="flex-1 cursor-pointer rounded-xl border-neutral-800 bg-neutral-900/40 backdrop-blur-sm flex flex-col items-center overflow-hidden" :style="lazyBg('/live-performance-2.png')">
            <div class="flex-none px-3 py-2 border-b border-neutral-800 flex items-end h-full gap-1.5">
              <ListMusic class="w-7 h-7 text-synth-neon" />
              <span class="text-[18px] font-black uppercase tracking-[0.3em] text-neutral-400 font-mono">Live Set</span>
            </div>
          </div>
          <div class="flex flex-col gap-3">
            <div class="flex h-1/2 gap-3">
              <div @click="uiStore.isAudioCaptureOpen = true; goWorkspace()" class="flex w-1/2 rounded-xl cursor-pointer items-center border-neutral-800 bg-neutral-900/40 backdrop-blur-sm flex flex-col overflow-hidden" :style="lazyBg('/audio-capture-mixer.jpg')">
                <div class="flex-none px-2 py-1 border-b border-neutral-800 flex items-end h-full gap-1.5">
                  <Mic class="w-7 h-7 text-synth-neon" />
                  <span class="text-[12px] font-black uppercase tracking-[0.3em] text-neutral-400 font-mono">Audio Capture</span>
                </div>
              </div>
              <div @click="uiStore.isCaptureOpen = true; goWorkspace()" class="flex w-1/2 rounded-xl cursor-pointer items-center border-neutral-800 bg-neutral-900/40 backdrop-blur-sm flex flex-col overflow-hidden" :style="lazyBg('/midi-capture.png')">
                <div class="flex-none px-2 py-1 border-b border-neutral-800 flex items-end h-full gap-1.5">
                  <Cable class="w-5 h-5 text-synth-neon" />
                  <span class="text-[12px] font-black uppercase tracking-[0.3em] text-neutral-400 font-mono">Piano Roll</span>
                </div>
              </div>
            </div>
            <div class="flex h-1/2 gap-3">
              <div @click="uiStore.isChordProgOpen = true; goWorkspace()" class="flex w-1/2 rounded-xl cursor-pointer items-center border-neutral-800 bg-neutral-900/40 backdrop-blur-sm flex flex-col overflow-hidden" :style="lazyBg('/chord-progression-sequencer.png')">
                <div class="flex-none px-2 py-1 border-b border-neutral-800 flex items-end h-full gap-1.5">
                  <Layers class="w-7 h-7 text-synth-neon" />
                  <span class="text-[12px] font-black uppercase tracking-[0.3em] text-neutral-400 font-mono">Chord Prog</span>
                </div>
              </div>
              <div @click="uiStore.isSequencerOpen = true; goWorkspace()" class="flex w-1/2 rounded-xl cursor-pointer items-center border-neutral-800 bg-neutral-900/40 backdrop-blur-sm flex flex-col overflow-hidden" :style="lazyBg('/step-sequencer-square.png')">
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

        <div @click="uiStore.showUnifiedMidiManager = true; goWorkspace()" class="flex-1 rounded-xl cursor-pointer border-neutral-800 bg-neutral-900/40 backdrop-blur-sm flex flex-col overflow-hidden items-center" :style="lazyBg('/midi-core-engine.png')">
          <div class="flex-none px-3 py-2 border-b border-neutral-800 flex items-end h-full gap-1.5">
            <Cpu class="w-5 h-5 text-synth-neon" />
            <span class="text-[12px] font-black uppercase tracking-[0.3em] text-neutral-400 font-mono">MIDI Manager</span>
          </div>
        </div>

        <div class="flex h-1/4 gap-3">
          <div @click="uiStore.isDrumMachineOpen = true; goWorkspace()" class="flex-1 cursor-pointer rounded-xl border-neutral-800 bg-neutral-900/40 backdrop-blur-sm flex flex-col items-center overflow-hidden" :style="lazyBg('/drum-machine.png')">
            <div class="flex-none px-3 py-2 border-b border-neutral-800 flex items-end h-full gap-1.5">
              <Drum class="h-5 w-5 text-synth-neon"/>
              <span class="text-[14px] font-black uppercase tracking-[0.3em] text-neutral-400 font-mono">Drum Machine</span>
            </div>
          </div>
          <div @click="uiStore.isLoopMachineOpen = true; goWorkspace()" class="flex-1 cursor-pointer rounded-xl border-neutral-800 bg-neutral-900/40 backdrop-blur-sm flex flex-col items-center overflow-hidden" :style="lazyBg('/loop-machine.png')">
            <div class="flex-none px-3 py-2 border-b border-neutral-800 flex items-end h-full gap-1.5">
              <Infinity class="h-5 w-5 text-synth-neon"/>
              <span class="text-[14px] font-black uppercase tracking-[0.3em] text-neutral-400 font-mono">Samples Machine</span>
            </div>
          </div>
        </div>

        <div class="flex h-1/4 gap-3">
          <div @click="uiStore.isTracksPlayerOpen = true; goWorkspace()" class="flex-1 cursor-pointer rounded-xl border-neutral-800 bg-neutral-900/40 backdrop-blur-sm flex flex-col items-center overflow-hidden" :style="lazyBg('/backing-tracks.jpg')">
            <div class="flex-none px-3 py-2 border-b border-neutral-800 flex items-end h-full gap-1.5">
              <Music class="h-5 w-5 text-synth-neon"/>
              <span class="text-[14px] font-black uppercase tracking-[0.3em] text-neutral-400 font-mono">Tracks</span>
            </div>
          </div>
          <div @click="uiStore.isMultiSoundsOpen = true; goWorkspace()" class="flex-1 cursor-pointer rounded-xl border-neutral-800 bg-neutral-900/40 backdrop-blur-sm flex flex-col items-center overflow-hidden" :style="lazyBg('/midi-knob.png')">
            <div class="flex-none px-3 py-2 border-b border-neutral-800 flex items-end h-full gap-1.5">
              <Cable class="w-5 h-5 text-synth-neon" />
              <span class="text-[12px] font-black uppercase tracking-[0.3em] text-neutral-400 font-mono">Multi Sounds</span>
            </div>
          </div>
        </div>

        <div class="flex-1 cursor-pointer rounded-xl border-neutral-800 bg-neutral-900/60 backdrop-blur-sm flex flex-col overflow-hidden" :style="lazyBg('/bg-settings.png')">
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
              <div @click="uiStore.isProfileOpen = true; goWorkspace()" class="flex flex-col w-full bg-neutral-800/70 rounded-md border border-neutral-700/50 px-1 py-1 mb-3 flex items-center gap-1.5 cursor-pointer">
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