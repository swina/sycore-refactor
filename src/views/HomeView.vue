<script setup>
import { useRouter } from 'vue-router'
import {
  LayoutGrid, Layers, Heart, KeyboardMusic, ListMusic, Zap,
  Workflow, Gamepad2, Cpu, Network, Disc3, RotateCw, Mic,
  Play, Info, Presentation, LogIn, User
} from 'lucide-vue-next'
import { useAuthStore } from '@/stores/useAuthStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useUiStore } from '@/stores/useUiStore'
import FeatureCard from '@/components/ui/FeatureCard.vue'

const router = useRouter()
const authStore = useAuthStore()
const configStore = useConfigStore()
const uiStore = useUiStore()

const sections = [
  {
    title: 'Sound Design',
    cards: [
      { icon: LayoutGrid, title: 'Sound Types', description: 'Browse and generate AI sound categories', uiFlag: 'isTypesOpen' },
      { icon: Layers,     title: 'Preset Library', description: 'History and saved patches', uiFlag: 'isHistoryOpen' },
      { icon: Heart,      title: 'Favorites', description: 'Your starred presets', uiFlag: 'isFavoritesOpen' },
      { icon: Zap,        title: 'Generate', description: 'Generate a new preset', uiFlag: 'isTypesOpen'}
    ],
  },
  {
    title: 'Performance',
    cards: [
      { icon: KeyboardMusic, title: 'Virtual Keyboard', description: 'On-screen MIDI keyboard with mod & pitch', uiFlag: 'isKeyboardOpen' },
      { icon: ListMusic,     title: 'Step Sequencer', description: 'Pattern programming with two slots', uiFlag: 'isSequencerOpen' },
      { icon: Zap,           title: 'Arpeggiator', description: 'Note patterns with BPM sync', uiFlag: 'isArpOpen' },
    ],
  },
  {
    title: 'MIDI Control',
    cards: [
      { icon: Workflow, title: 'MIDI Mapping', description: 'Learn & assign CC controllers', uiFlag: 'isMidiMappingOpen' },
      { icon: Gamepad2, title: 'MIDI Actions', description: 'Map MIDI to app actions', uiFlag: 'isMidiActionsOpen' },
      { icon: Cpu,      title: 'MIDI Matrix', description: 'Routing matrix overview', uiFlag: 'isMidiMatrixOpen' },
      { icon: Network,  title: 'Performance Grid', description: 'Live MIDI performance pads', uiFlag: 'isMidiPerformanceOpen' },
    ],
  },
  {
    title: 'Live & Audio',
    cards: [
      { icon: Zap,      title: 'Live Set', description: 'Patch chaining for live use', uiFlag: 'isLiveSetOpen' },
      { icon: Disc3,    title: 'Backing Track', description: 'Play along with audio tracks', uiFlag: 'isBackingTrackOpen' },
      { icon: RotateCw, title: 'Audio Looper', description: 'Multi-track looping', uiFlag: 'isLooperOpen' },
      { icon: Mic,      title: 'Audio Capture', description: 'Record from input devices', uiFlag: 'isAudioCaptureOpen' },
    ],
  },
]

function enterWorkspace() {
  router.push('/workspace')
}
</script>

<template>
  <div class="w-full min-h-screen bg-neutral-950 text-white overflow-y-auto custom-scrollbar">
    <!-- Hero Header -->
    <header class="relative px-6 md:px-12 pt-4 pb-8 border-b border-neutral-900">
      <div class="max-w-6xl mx-auto flex flex-col md:flex-row md:items-end md:justify-between gap-6">
        <div>
          <h1 class="text-4xl md:text-5xl font-black uppercase tracking-tighter text-synth-neon drop-shadow-[0_0_12px_rgba(0,163,112,0.4)]">
            {{ configStore.appName }}
          </h1>
          <p class="mt-2 text-neutral-500 font-mono text-xs uppercase tracking-[0.25em]">
            {{ configStore.appSubtitle }}
          </p>
        </div>

        <div class="flex items-center gap-3">
          <button
            v-if="!authStore.user"
            @click="uiStore.isAuthModalOpen = true"
            class="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-synth-neon text-black font-black uppercase tracking-[0.2em] text-[10px] hover:bg-white active:scale-95 transition-all shadow-[0_0_20px_rgba(0,163,112,0.4)]"
          >
            <LogIn class="w-3.5 h-3.5" />
            Login / Register
          </button>
          <template v-else>
            <!-- <button
              @click="uiStore.isProfileOpen = true; router.push('/')"
              class="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-neutral-900/60 border border-neutral-800 hover:border-synth-neon/50 text-neutral-300 font-mono text-[10px] uppercase tracking-widest transition-all"
            >
              <User class="w-3.5 h-3.5" />
              {{ authStore.user.email || 'Profile' }}
            </button> -->
            <button
              @click="enterWorkspace"
              class="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-synth-neon text-black font-black uppercase tracking-[0.2em] text-[10px] hover:bg-white active:scale-95 transition-all shadow-[0_0_20px_rgba(0,163,112,0.4)]"
            >
              <Play class="w-3.5 h-3.5" />
              Open Workspace
            </button>
          </template>
        </div>
      </div>
    </header>

    <!-- Sections -->
    <main class="max-w-6xl mx-auto px-6 md:px-12 py-10 flex flex-col gap-12">
      <section
        v-for="section in sections"
        :key="section.title"
        class="flex flex-col gap-4"
      >
        <div class="flex items-center gap-3">
          <div class="w-1 h-5 bg-synth-neon shadow-[0_0_8px_rgba(0,163,112,0.8)]" />
          <h2 class="text-sm font-black uppercase tracking-[0.35em] text-neutral-200">
            {{ section.title }}
          </h2>
          <div class="flex-1 h-px bg-gradient-to-r from-neutral-800 to-transparent" />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <FeatureCard
            v-for="card in section.cards"
            :key="card.title"
            :icon="card.icon"
            :title="card.title"
            :description="card.description"
            :ui-flag="card.uiFlag"
          />
        </div>
      </section>
    </main>

    <!-- Footer -->
    <!-- <footer class="max-w-6xl mx-auto px-6 md:px-12 py-8 border-t border-neutral-900 flex flex-col sm:flex-row items-center justify-between gap-4">
      <div class="flex items-center gap-3 text-neutral-600 font-mono text-[10px] uppercase tracking-widest">
        <span>{{ configStore.appName }}</span>
        <span class="text-neutral-800">·</span>
        <span>v{{ configStore.appVersion || '—' }}</span>
      </div>
      <div class="flex items-center gap-2">
        <button
          @click="uiStore.isAboutOpen = true"
          class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-900/40 border border-neutral-800/60 hover:border-synth-neon/40 text-neutral-400 hover:text-synth-neon text-[10px] font-mono uppercase tracking-widest transition-all"
        >
          <Info class="w-3 h-3" />
          About
        </button>
      </div>
    </footer> -->
  </div>
</template>
