<script setup>
import { Zap, Lock, RotateCw } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/useAuthStore'
import { usePresetStore } from '@/stores/usePresetStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useUiStore } from '@/stores/useUiStore'
import { useMidiStore } from '@/stores/useMidiStore'

const authStore = useAuthStore()
const presetStore = usePresetStore()
const configStore = useConfigStore()
const uiStore = useUiStore()
const midiStore = useMidiStore()
</script>

<template>
  <div class="w-full h-full flex flex-col items-center justify-center p-8 overflow-y-auto custom-scrollbar">

    <!-- Not logged in -->
    <div v-if="!authStore.user" class="flex flex-col items-center justify-center gap-8">
      <div class="text-center">
        <h2 class="text-4xl font-black uppercase tracking-tighter text-synth-neon mb-2">
          {{ configStore.appName }}
        </h2>
        <p class="text-neutral-400 font-mono text-sm">{{ configStore.appSubtitle }}</p>
      </div>

      <!-- Login CTA with spinning ring -->
      <div class="relative p-12 rounded-full border-4 border-dashed border-neutral-900 flex items-center justify-center">
        <div class="absolute inset-0 rounded-full border-2 border-t-synth-neon border-r-transparent border-l-transparent border-b-transparent opacity-30 animate-spin-slow" />
        <button
          @click="uiStore.isAuthModalOpen = true"
          class="w-48 h-48 md:w-64 md:h-64 rounded-full flex flex-col items-center justify-center gap-4 transition-all duration-300 relative bg-black text-synth-neon border-4 border-synth-neon hover:bg-synth-neon hover:text-black active:scale-95 shadow-[0_0_30px_rgba(0,163,112,0.3)]"
        >
          <div class="absolute inset-2 rounded-full border border-synth-neon/20 pointer-events-none" />
          <Zap class="w-16 h-16 md:w-20 md:h-20 drop-shadow-[0_0_8px_rgba(0,163,112,0.8)]" />
          <span class="font-black uppercase tracking-[0.4em] text-[10px] mt-2">Login / Register</span>
        </button>
      </div>

      <p class="text-neutral-600 font-mono text-xs uppercase tracking-widest">
        Sign in to start generating sounds
      </p>
    </div>

    <!-- Logged in but loading presets -->
    <div v-else-if="authStore.loadingAuth" class="flex flex-col items-center gap-4">
      <Zap class="w-12 h-12 text-synth-neon animate-pulse drop-shadow-[0_0_8px_rgba(0,163,112,0.8)]" />
      <span class="font-black uppercase tracking-[0.4em] text-[10px] text-synth-neon animate-pulse">Initializing...</span>
    </div>

    <!-- Logged in, limit reached -->
    <div v-else-if="presetStore.limitReached" class="flex flex-col items-center gap-6 max-w-sm text-center">
      <div class="p-6 bg-red-950/20 border border-red-900/50 rounded-2xl flex flex-col items-center gap-4">
        <Lock class="w-10 h-10 text-red-500" />
        <div>
          <p class="text-red-400 font-bold uppercase tracking-tight text-sm">Hardware Sync Restricted</p>
          <p class="text-neutral-500 text-[10px] font-mono mt-1 leading-relaxed">
            You've reached your free daily quota. Upgrade to PRO for unlimited generation.
          </p>
        </div>
        <button class="bg-synth-neon text-black px-6 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-white transition-all shadow-lg">
          Upgrade to PRO Core
        </button>
      </div>
    </div>

    <!-- Logged in, no MIDI device connected -->
    <div v-else-if="!midiStore.midiReady" class="flex flex-col items-center gap-6 text-center">
      <div class="text-center mb-4">
        <h2 class="text-4xl font-black uppercase tracking-tighter text-synth-neon mb-2">
          {{ configStore.appName }}
        </h2>
        <p class="text-neutral-400 font-mono text-sm">{{ configStore.appSubtitle }}</p>
      </div>

      <!-- Generate pad (works even without MIDI, just won't send) -->
      <div class="relative p-12 rounded-full border-4 border-dashed border-neutral-900 flex items-center justify-center">
        <div class="absolute inset-0 rounded-full border-2 border-t-synth-neon border-r-transparent border-l-transparent border-b-transparent opacity-30 animate-spin-slow" />
        <button
          @click="presetStore.generate()"
          :disabled="presetStore.isGenerating || presetStore.limitReached"
          class="w-48 h-48 md:w-64 md:h-64 rounded-full flex flex-col items-center justify-center gap-4 transition-all duration-300 relative bg-black text-synth-neon border-4 border-synth-neon hover:bg-synth-neon hover:text-black active:scale-95 shadow-[0_0_30px_rgba(0,163,112,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div class="absolute inset-2 rounded-full border border-synth-neon/20 pointer-events-none" />
          <Zap v-if="!presetStore.isGenerating" class="w-16 h-16 md:w-20 md:h-20 drop-shadow-[0_0_8px_rgba(0,163,112,0.8)]" />
          <svg v-else class="w-16 h-16 md:w-20 md:h-20 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <span class="font-black uppercase tracking-[0.4em] text-[10px] mt-2">
            {{ presetStore.isGenerating ? 'Syncing...' : 'Generate' }}
          </span>
        </button>
      </div>

      <div class="flex flex-col items-center gap-2 py-6 px-10 border-2 border-dashed border-neutral-900 rounded-2xl">
        <div class="flex items-center gap-3">
          <div class="w-2 h-2 bg-synth-neon animate-ping rounded-full" />
          <span class="text-synth-neon font-mono text-sm tracking-[0.2em] font-bold animate-pulse">
            WAITING FOR USB BRIDGE ...
          </span>
        </div>
        <p class="text-neutral-700 text-[10px] font-mono uppercase tracking-widest text-center max-w-[200px]">
          Connect Roland S-1 or select a MIDI interface from the menu above
        </p>
      </div>
      
      <!-- Current Sound Type & Part indicator (pre-midi) -->
      <div class="flex flex-col items-center gap-3">
        <div class="flex flex-col items-center gap-1.5">
          <span class="text-[9px] font-black font-mono text-neutral-600 uppercase tracking-[0.3em]">Current Engine Profile</span>
          <span class="text-xs font-black uppercase tracking-widest text-synth-neon bg-synth-neon/10 px-4 py-1 rounded-full border border-synth-neon/20 shadow-[0_0_15px_rgba(0,163,112,0.1)]">
            {{ presetStore.currentCategory }}
          </span>
        </div>
        
        <div v-if="midiStore.midiChannel > 1" class="flex flex-col items-center gap-1">
          <span class="text-[7px] font-black font-mono text-neutral-700 uppercase tracking-widest">Active Part</span>
          <span class="text-[10px] font-mono font-bold text-emerald-500/60 uppercase">Channel {{ midiStore.midiChannel }}</span>
        </div>
      </div>

    </div>

    <!-- Logged in, MIDI ready — main generate pad -->
    <div v-else class="flex flex-col items-center gap-8">
      <div class="text-center">
        <h2 class="text-4xl font-black uppercase tracking-tighter text-synth-neon mb-2">
          {{ configStore.appName }}
        </h2>
        <p class="text-neutral-400 font-mono text-sm">{{ configStore.appSubtitle }}</p>
      </div>

      <!-- Reactor pad -->
      <div class="relative p-12 rounded-full border-4 border-dashed border-neutral-900 flex items-center justify-center">
        <div class="absolute inset-0 rounded-full border-2 border-t-synth-neon border-r-transparent border-l-transparent border-b-transparent opacity-30 animate-spin-slow" />
        <button
          @click="presetStore.generate()"
          :disabled="presetStore.isGenerating || presetStore.limitReached"
          :class="[
            'w-48 h-48 md:w-64 md:h-64 rounded-full flex flex-col items-center justify-center gap-4 transition-all duration-300 relative active:scale-95',
            presetStore.limitReached
              ? 'bg-neutral-900 text-neutral-700 cursor-not-allowed border-4 border-neutral-800'
              : 'bg-black text-synth-neon border-4 border-synth-neon hover:bg-synth-neon hover:text-black shadow-[0_0_30px_rgba(0,163,112,0.3)]'
          ]"
        >
          <div class="absolute inset-2 rounded-full border border-synth-neon/20 pointer-events-none" />
          <Zap v-if="!presetStore.isGenerating" class="w-16 h-16 md:w-20 md:h-20 drop-shadow-[0_0_8px_rgba(0,163,112,0.8)]" />
          <svg v-else class="w-16 h-16 md:w-20 md:h-20 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <span class="font-black uppercase tracking-[0.4em] text-[10px] mt-2">
            {{ presetStore.isGenerating ? 'Syncing...' : 'Generate' }}
          </span>
        </button>
      </div>

      <!-- Restore Last Sound Link -->
      <div v-if="presetStore.lastPreset" class="mt-4 animate-in fade-in slide-in-from-bottom-2 duration-700 delay-300">
        <button 
          @click="presetStore.recallPreset(presetStore.lastPreset); presetStore.showResults = true"
          class="flex items-center gap-3 px-5 py-2.5 bg-neutral-900/30 border border-neutral-800/50 rounded-full hover:border-synth-neon/40 hover:bg-neutral-900/50 transition-all group active:scale-95 shadow-lg"
        >
          <div class="flex flex-col items-start text-left">
            <span class="text-[8px] font-black font-mono text-neutral-600 uppercase tracking-[0.2em]">Restore Last Session</span>
            <span class="text-[11px] font-bold text-neutral-200 uppercase group-hover:text-synth-neon transition-colors">{{ presetStore.lastPreset.name }}</span>
          </div>
          <div class="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center group-hover:bg-synth-neon group-hover:text-black transition-all">
            <RotateCw class="w-3.5 h-3.5" />
          </div>
        </button>
      </div>

      <!-- Current Sound Type & Part indicator -->
      <div class="flex flex-col items-center gap-4 mt-8">
        <div class="flex flex-col items-center gap-1.5">
          <span class="text-[9px] font-black font-mono text-neutral-600 uppercase tracking-[0.3em]">Current Engine Profile</span>
          <span class="text-xs font-black uppercase tracking-widest text-synth-neon bg-synth-neon/10 px-4 py-1 rounded-full border border-synth-neon/20 shadow-[0_0_15px_rgba(0,163,112,0.1)]">
            {{ presetStore.currentCategory }}
          </span>
        </div>

        <div v-if="midiStore.midiChannel > 1" class="flex flex-col items-center gap-1 animate-in fade-in zoom-in duration-500">
          <span class="text-[7px] font-black font-mono text-neutral-700 uppercase tracking-widest">Targeting Multi-Part</span>
          <div class="px-3 py-0.5 rounded bg-emerald-500/5 border border-emerald-500/20">
            <span class="text-[10px] font-mono font-bold text-emerald-500 uppercase tracking-widest">Channel {{ midiStore.midiChannel }}</span>
          </div>
        </div>
      </div>

    </div>

  </div>
</template>

<style scoped>
@keyframes spin-slow {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
.animate-spin-slow {
  animation: spin-slow 10s linear infinite;
}
</style>
