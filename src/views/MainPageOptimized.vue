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
  Mic, LogIn, Settings, Infinity, Clock, User, Globe,
  Monitor, GitBranch, Piano, Package, Search, FolderOpen, Play,
  Disc3, Headphones, PanelRightOpen
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

// ─── Section definitions ───────────────────────────────────────────────────

const sections = [
  {
    title: 'MIDI Configuration',
    icon: Cpu,
    items: [
      { label: 'Devices', icon: Radio, bg: '/midi-core-engine.png', onClick: () => { uiStore.isMidiDevicesOpen = true; goWorkspace() } },
      { label: 'MIDI Flow', icon: GitBranch, bg: '/midi-flow.png', onClick: () => { uiStore.isMidiFlowOpen = true; goWorkspace() } },
      { label: 'Controller Designer', icon: Piano, bg: '/midi-knob.png', onClick: () => { uiStore.isMidiControllerDesignerOpen = true; goWorkspace() } },
      { label: 'MIDI Monitor', icon: Monitor, bg: '/midi-monitor.png', onClick: () => { uiStore.isMidiMonitorOpen = true; goWorkspace() } },
    ],
  },
  {
    title: 'Sound Design',
    icon: Zap,
    items: [
      { label: 'Sound Engine', icon: Zap, bg: '/bg-sound-design-2.png', onClick: () => { uiStore.isSoundEngineOpen = true; goWorkspace() } },
      { label: 'Sampler', badge: 'Beta', icon: Disc3, bg: '/sycore-lab.png', onClick: () => { uiStore.isSamplerOpen = true; goWorkspace() } },
    ],
  },
  {
    title: 'MIDI Tools',
    icon: Music,
    items: [
      { label: 'Step Sequencer', icon: Music, bg: '/step-sequencer-square.png', onClick: () => { uiStore.isSequencerOpen = true; goWorkspace() } },
      { label: 'Chord Progression', icon: Layers, bg: '/chord-progression-sequencer.png', onClick: () => { uiStore.isChordProgOpen = true; goWorkspace() } },
      { label: 'Piano Roll', icon: Cable, bg: '/midi-capture.jpg', onClick: () => { uiStore.isCaptureOpen = true; goWorkspace() } },
      { label: 'Multi Sounds', icon: Package, bg: '/device-program-change.png', onClick: () => { uiStore.isDeviceProgramChangePanelOpen = true; goWorkspace() } },
    ],
  },
  {
    title: 'Audio Tools',
    icon: Headphones,
    items: [
      { label: 'Audio Capture', icon: Mic, bg: '/audio-capture-mixer.jpg', onClick: () => { uiStore.isAudioCaptureOpen = true; goWorkspace() } },
      { label: 'Freesound Browser', icon: Search, bg: '/bg-sound-design.png', onClick: () => { uiStore.isFreesoundBrowserOpen = true; goWorkspace() } },
      { label: 'Sound Folder Browser', icon: FolderOpen, bg: '/bg-settings.png', onClick: () => { uiStore.isSoundFolderBrowserOpen = true; goWorkspace() } },
    ],
  },
  {
    title: 'Performance Tools',
    icon: Play,
    items: [
      { label: 'Live Timeline', icon: Clock, bg: '/home-performance-synths.png', onClick: () => { uiStore.isLiveTimelineOpen = true; goWorkspace() } },
      { label: 'Drum Machine', icon: Drum, bg: '/drum-machine.png', onClick: () => { uiStore.isDrumMachineOpen = true; goWorkspace() } },
      { label: 'Live Set', icon: ListMusic, bg: '/live-performance-2.png', onClick: () => { uiStore.isLivePerformancePadOpen = true; goWorkspace() } },
      { label: 'Samples Machine', icon: Infinity, bg: '/loop-machine.png', onClick: () => { uiStore.isLoopMachineOpen = true; goWorkspace() } },
      { label: 'Tracks Player', icon: Music, bg: '/backing-tracks.jpg', onClick: () => { uiStore.isTracksPlayerOpen = true; goWorkspace() } },
    ],
  },
]
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

    <!-- Scrollable content area -->
    <div class="flex-1 flex overflow-hidden p-3 gap-3 min-h-0">

      <!-- Main sections -->
      <div class="flex-1 flex flex-col gap-5 overflow-y-auto pr-1 scrollbar-thin">

        <section v-for="(section, sIdx) in sections" :key="sIdx">
          <!-- Section header -->
          <div class="flex items-center gap-2 mb-3 px-1">
            <component :is="section.icon" class="w-4 h-4 text-synth-neon" />
            <h2 class="text-[11px] font-black uppercase tracking-[0.3em] text-neutral-500 font-mono">
              {{ section.title }}
            </h2>
            <div class="flex-1 h-px bg-neutral-800/60" />
          </div>

          <!-- Section cards -->
          <div class="flex flex-wrap gap-3">
            <div
              v-for="(item, iIdx) in section.items"
              :key="iIdx"
              @click="item.onClick"
              class="group relative flex-none w-[155px] h-[100px] rounded-xl border border-neutral-800/80 bg-neutral-900/40 backdrop-blur-sm overflow-hidden cursor-pointer hover:border-synth-neon/30 hover:bg-neutral-900/70 transition-all duration-200 active:scale-[0.97]"
              :style="lazyBg(item.bg)"
            >
              <!-- Gradient overlay -->
              <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

              <!-- Content -->
              <div class="absolute inset-0 flex flex-col justify-end p-3">
                <div class="flex items-center gap-2">
                  <component :is="item.icon" class="w-4 h-4 text-synth-neon shrink-0 group-hover:drop-shadow-[0_0_6px_rgba(0,163,112,0.6)] transition-all" />
                  <span class="text-[10px] font-bold uppercase tracking-[0.15em] text-neutral-300 font-mono group-hover:text-white transition-colors">
                    {{ item.label }}
                  </span>
                  <span
                    v-if="item.badge"
                    class="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  >
                    {{ item.badge }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Bottom spacer -->
        <div class="h-2" />
      </div>

      <!-- Right column — utilities -->
      <div class="flex flex-col gap-3 w-[180px] shrink-0">

        <!-- MIDI Status -->
        <div class="rounded-xl border border-neutral-800/80 bg-neutral-900/40 backdrop-blur-sm overflow-hidden" :style="lazyBg('/midi-core-engine.png')">
          <div class="px-3 py-2 flex items-center gap-2 border-b border-neutral-800/50">
            <Radio class="w-3 h-3 text-synth-neon" />
            <span class="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-500 font-mono">MIDI Status</span>
          </div>
          <div class="p-3">
            <div class="flex items-center gap-2">
              <span :class="['w-2 h-2 rounded-full', midiStore.midiReady ? 'bg-synth-neon shadow-[0_0_6px_rgba(0,163,112,0.6)]' : 'bg-red-500']" />
              <span :class="['text-[10px] font-bold uppercase tracking-widest font-mono', midiStore.midiReady ? 'text-synth-neon' : 'text-red-400']">
                {{ midiStore.midiReady ? 'Connected' : 'Waiting S-1' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Profile -->
        <div @click="uiStore.isProfileOpen = true; goWorkspace()" class="rounded-xl border border-neutral-800/80 bg-neutral-900/40 backdrop-blur-sm overflow-hidden cursor-pointer hover:border-synth-cyan/30 transition-colors" :style="lazyBg('/bg-performance.png')">
          <div class="px-3 py-2 flex items-center gap-2 border-b border-neutral-800/50">
            <User class="w-3 h-3 text-synth-cyan" />
            <span class="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-500 font-mono">User</span>
          </div>
          <div class="p-3">
            <span class="text-[10px] font-bold text-synth-cyan uppercase tracking-widest font-mono">Profile</span>
          </div>
        </div>

        <!-- Help -->
        <div @click="uiStore.isGuidesOpen = true" class="rounded-xl border border-neutral-800/80 bg-neutral-900/40 backdrop-blur-sm overflow-hidden cursor-pointer hover:border-synth-neon/30 transition-colors" :style="lazyBg('/bg-settings.png')">
          <div class="px-3 py-2 flex items-center gap-2 border-b border-neutral-800/50">
            <CircleQuestionMark class="w-3 h-3 text-synth-neon" />
            <span class="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-500 font-mono">Help</span>
          </div>
          <div class="p-3">
            <span class="text-[10px] font-bold text-synth-cyan uppercase tracking-widest font-mono">Manual / Guides</span>
          </div>
        </div>

        <!-- About -->
        <div @click="uiStore.isAboutOpen = true" class="rounded-xl border border-neutral-800/80 bg-neutral-900/40 backdrop-blur-sm overflow-hidden cursor-pointer hover:border-synth-cyan/30 transition-colors" :style="lazyBg('/bg-sound-design.png')">
          <div class="px-3 py-2 flex items-center gap-2 border-b border-neutral-800/50">
            <Info class="w-3 h-3 text-synth-cyan" />
            <span class="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-500 font-mono">About</span>
          </div>
          <div class="p-3">
            <span class="text-[10px] font-bold text-synth-cyan uppercase tracking-widest font-mono">About SY.CORE</span>
          </div>
        </div>

        <!-- Admin (conditional) -->
        <button
          v-if="authStore.isAdmin"
          @click="isAdminPanelOpen = true"
          class="rounded-xl border border-neutral-800/80 bg-neutral-900/40 backdrop-blur-sm overflow-hidden cursor-pointer hover:border-amber-500/30 transition-colors text-left"
        >
          <div class="px-3 py-2 flex items-center gap-2 border-b border-neutral-800/50">
            <Settings class="w-3 h-3 text-amber-400" />
            <span class="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-500 font-mono">Admin</span>
          </div>
          <div class="p-3">
            <span class="text-[10px] font-bold text-amber-400 uppercase tracking-widest font-mono">Panel</span>
          </div>
        </button>

      </div>
    </div>

    <SlideshowModal :isOpen="isSlideshowOpen" @close="isSlideshowOpen = false" />
    <SlideshowModal :isOpen="isHelpSlideshowOpen" source="help" @close="isHelpSlideshowOpen = false" />
    <AboutModal v-if="uiStore.isAboutOpen" @close="uiStore.isAboutOpen = false" />
    <AdminPanel :isOpen="isAdminPanelOpen" @close="isAdminPanelOpen = false" />
  </div>
</template>