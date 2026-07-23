<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useConfigStore } from '@/stores/useConfigStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useUiStore } from '@/stores/useUiStore'
import { defineAsyncComponent } from 'vue'
import {
  Radio, Info, CircleQuestionMark,
  LogIn, Settings, User, Globe, LayoutGrid,
} from 'lucide-vue-next'
import ThemeToggle from '@/components/ui/ThemeToggle.vue'
import AppLauncher from '@/components/ui/AppLauncher.vue'

const SlideshowModal = defineAsyncComponent(() => import('@/components/SlideshowModal.vue'))
const AboutModal = defineAsyncComponent(() => import('@/components/AboutModal.vue'))
const AdminPanel = defineAsyncComponent(() => import('@/components/AdminPanel.vue'))
const ModuleManagerPanel = defineAsyncComponent(() => import('@/components/ModuleManagerPanel.vue'))
const AuthModal = defineAsyncComponent(() => import('@/components/AuthModal.vue'))

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
  <div class="w-full h-screen flex flex-col overflow-hidden bg-surface-canvas dark:bg-surface-canvas-dark text-ink dark:text-ink-dark">

    <!-- Top bar -->
    <header class="flex-none flex items-center justify-between gap-3 px-4 py-3 sm:px-5
                    border-b border-black/5 dark:border-neutral-900 bg-surface-panel/80 dark:bg-black/60 backdrop-blur">
      <div class="flex items-center gap-3 min-w-0">
        <span class="font-mono font-black text-xl sm:text-[26px] uppercase drop-shadow-[0_0_8px_color-mix(in_srgb,var(--color-brand)_50%,transparent)] shrink-0">
          <span class="text-ink dark:text-white">{{ configStore.appName.split('.')[0] }}.</span><span class="text-brand-strong dark:text-synth-neon">{{ configStore.appName.split('.')[1] }}</span>
        </span>
        <span class="text-ink-muted dark:text-neutral-600 font-mono text-[10px] uppercase tracking-widest hidden md:block truncate">
          {{ configStore.appSubtitle }}
        </span>
      </div>
      <div class="flex items-center gap-2 sm:gap-3 shrink-0">
        <div :class="['hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase font-mono border transition-colors',
          midiStore.midiReady
            ? 'bg-brand/10 text-brand-strong dark:text-synth-neon border-brand/30'
            : 'bg-red-950/10 dark:bg-red-950/30 text-red-500 dark:text-red-400 border-red-500/20']">
          <Radio class="w-3 h-3" />
          {{ midiStore.midiReady ? 'MIDI READY' : 'MIDI WAITING' }}
        </div>
        <ThemeToggle size="sm" />
        <button
          v-if="authStore.isAdmin"
          @click="isAdminPanelOpen = true"
          class="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase font-mono border transition-colors
                 bg-black/5 dark:bg-neutral-900/60 text-ink-muted dark:text-neutral-400 border-black/10 dark:border-neutral-700
                 hover:border-brand/40 hover:text-brand-strong dark:hover:text-synth-neon"
        >
          <Settings class="w-3 h-3" />
          Admin
        </button>
        <a
          v-if="websiteUrl"
          :href="websiteUrl"
          target="_blank"
          rel="noopener"
          class="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase font-mono border transition-colors
                 bg-black/5 dark:bg-neutral-900/60 text-ink-muted dark:text-neutral-400 border-black/10 dark:border-neutral-700
                 hover:border-brand/40 hover:text-brand-strong dark:hover:text-synth-neon"
        >
          <Globe class="w-3 h-3" />
          Website
        </a>
        <button
          v-if="!authStore.user"
          @click="uiStore.isAuthModalOpen = true"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-white dark:text-black font-black uppercase tracking-[0.2em] text-[10px] hover:bg-brand-strong dark:hover:bg-white active:scale-95 transition-all"
        >
          <LogIn class="w-3 h-3" />
          Login
        </button>
      </div>
    </header>

    <!-- Scrollable content area -->
    <div class="flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6 scrollbar-thin">
      <div class="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-5 max-w-[1400px] mx-auto">

        <!-- App launcher -->
        <div class="min-w-0">
          <AppLauncher variant="page" @select="goWorkspace" />
        </div>

        <!-- Utility rail -->
        <aside class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-3 content-start">

          <!-- MIDI Status -->
          <div class="rounded-xl border border-black/10 dark:border-neutral-800/80 bg-surface-panel dark:bg-neutral-900/40 backdrop-blur-sm overflow-hidden shadow-sm dark:shadow-none" :style="lazyBg('/midi-core-engine.png')">
            <div class="px-3 py-2 flex items-center gap-2 border-b border-black/5 dark:border-neutral-800/50">
              <Radio class="w-3 h-3 text-brand-strong dark:text-synth-neon" />
              <span class="text-[9px] font-black uppercase tracking-[0.2em] text-ink-muted dark:text-neutral-500 font-mono">MIDI Status</span>
            </div>
            <div class="p-3">
              <div class="flex items-center gap-2">
                <span :class="['w-2 h-2 rounded-full', midiStore.midiReady ? 'bg-brand-strong dark:bg-synth-neon shadow-[0_0_6px_color-mix(in_srgb,var(--color-brand)_60%,transparent)]' : 'bg-red-500']" />
                <span :class="['text-[10px] font-bold uppercase tracking-widest font-mono', midiStore.midiReady ? 'text-brand-strong dark:text-synth-neon' : 'text-red-500 dark:text-red-400']">
                  {{ midiStore.midiReady ? 'Connected' : 'Waiting S-1' }}
                </span>
              </div>
            </div>
          </div>

          <!-- Profile -->
          <div @click="uiStore.isProfileOpen = true; goWorkspace()" class="rounded-xl border border-black/10 dark:border-neutral-800/80 bg-surface-panel dark:bg-neutral-900/40 backdrop-blur-sm overflow-hidden cursor-pointer hover:border-accent/40 dark:hover:border-synth-cyan/30 transition-colors shadow-sm dark:shadow-none" :style="lazyBg('/bg-performance.png')">
            <div class="px-3 py-2 flex items-center gap-2 border-b border-black/5 dark:border-neutral-800/50">
              <User class="w-3 h-3 text-accent-strong dark:text-synth-cyan" />
              <span class="text-[9px] font-black uppercase tracking-[0.2em] text-ink-muted dark:text-neutral-500 font-mono">User</span>
            </div>
            <div class="p-3">
              <span class="text-[10px] font-bold text-accent-strong dark:text-synth-cyan uppercase tracking-widest font-mono">Profile</span>
            </div>
          </div>

          <!-- Help -->
          <div @click="uiStore.isGuidesOpen = true" class="rounded-xl border border-black/10 dark:border-neutral-800/80 bg-surface-panel dark:bg-neutral-900/40 backdrop-blur-sm overflow-hidden cursor-pointer hover:border-brand/40 dark:hover:border-synth-neon/30 transition-colors shadow-sm dark:shadow-none" :style="lazyBg('/bg-settings.png')">
            <div class="px-3 py-2 flex items-center gap-2 border-b border-black/5 dark:border-neutral-800/50">
              <CircleQuestionMark class="w-3 h-3 text-brand-strong dark:text-synth-neon" />
              <span class="text-[9px] font-black uppercase tracking-[0.2em] text-ink-muted dark:text-neutral-500 font-mono">Help</span>
            </div>
            <div class="p-3">
              <span class="text-[10px] font-bold text-accent-strong dark:text-synth-cyan uppercase tracking-widest font-mono">Manual / Guides</span>
            </div>
          </div>

          <!-- About -->
          <div @click="uiStore.isAboutOpen = true" class="rounded-xl border border-black/10 dark:border-neutral-800/80 bg-surface-panel dark:bg-neutral-900/40 backdrop-blur-sm overflow-hidden cursor-pointer hover:border-accent/40 dark:hover:border-synth-cyan/30 transition-colors shadow-sm dark:shadow-none" :style="lazyBg('/bg-sound-design.png')">
            <div class="px-3 py-2 flex items-center gap-2 border-b border-black/5 dark:border-neutral-800/50">
              <Info class="w-3 h-3 text-accent-strong dark:text-synth-cyan" />
              <span class="text-[9px] font-black uppercase tracking-[0.2em] text-ink-muted dark:text-neutral-500 font-mono">About</span>
            </div>
            <div class="p-3">
              <span class="text-[10px] font-bold text-accent-strong dark:text-synth-cyan uppercase tracking-widest font-mono">About SY.CORE</span>
            </div>
          </div>

          <!-- Admin (conditional) -->
          <button
            v-if="authStore.isAdmin"
            @click="isAdminPanelOpen = true"
            class="rounded-xl border border-black/10 dark:border-neutral-800/80 bg-surface-panel dark:bg-neutral-900/40 backdrop-blur-sm overflow-hidden cursor-pointer hover:border-amber-500/40 transition-colors text-left shadow-sm dark:shadow-none"
          >
            <div class="px-3 py-2 flex items-center gap-2 border-b border-black/5 dark:border-neutral-800/50">
              <Settings class="w-3 h-3 text-amber-600 dark:text-amber-400" />
              <span class="text-[9px] font-black uppercase tracking-[0.2em] text-ink-muted dark:text-neutral-500 font-mono">Admin</span>
            </div>
            <div class="p-3">
              <span class="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest font-mono">Panel</span>
            </div>
          </button>

          <!-- Module Manager (conditional) -->
          <button
            v-if="authStore.isAdmin"
            @click="uiStore.openPanel('module-manager')"
            class="rounded-xl border border-black/10 dark:border-neutral-800/80 bg-surface-panel dark:bg-neutral-900/40 backdrop-blur-sm overflow-hidden cursor-pointer hover:border-brand/40 dark:hover:border-synth-neon/30 transition-colors text-left shadow-sm dark:shadow-none"
          >
            <div class="px-3 py-2 flex items-center gap-2 border-b border-black/5 dark:border-neutral-800/50">
              <LayoutGrid class="w-3 h-3 text-brand-strong dark:text-synth-neon" />
              <span class="text-[9px] font-black uppercase tracking-[0.2em] text-ink-muted dark:text-neutral-500 font-mono">Modules</span>
            </div>
            <div class="p-3">
              <span class="text-[10px] font-bold text-brand-strong dark:text-synth-neon uppercase tracking-widest font-mono">Manager</span>
            </div>
          </button>

        </aside>
      </div>
    </div>

    <SlideshowModal :isOpen="isSlideshowOpen" @close="isSlideshowOpen = false" />
    <SlideshowModal :isOpen="isHelpSlideshowOpen" source="help" @close="isHelpSlideshowOpen = false" />
    <AboutModal v-if="uiStore.isAboutOpen" @close="uiStore.isAboutOpen = false" />
    <AdminPanel :isOpen="isAdminPanelOpen" @close="isAdminPanelOpen = false" />
    <ModuleManagerPanel :isOpen="uiStore.isModuleManagerOpen" @close="uiStore.closePanel('module-manager')" />
    <AuthModal v-if="uiStore.isAuthModalOpen" @close="uiStore.isAuthModalOpen = false" />
  </div>
</template>