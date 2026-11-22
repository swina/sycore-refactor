<template>
  <div v-if="authStore.user && needsFirstProject" class="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 backdrop-blur-sm">
    <div class="w-[420px] max-w-[calc(100vw-32px)] bg-neutral-900 border border-violet-500/40 rounded-xl shadow-2xl p-5 flex flex-col gap-4">
      <div>
        <div class="text-[10px] font-black uppercase tracking-widest text-violet-400">Welcome · your first project</div>
        <h2 class="text-lg font-black text-white mt-1">Create a project</h2>
      </div>
      <p class="text-[11px] text-neutral-400 leading-relaxed">
        A project holds your rig, in three steps:
      </p>
      <ol class="text-[11px] text-neutral-300 leading-relaxed flex flex-col gap-1.5 list-none">
        <li><span class="font-black text-synth-neon">1 · MIDI Flow</span>: connect your devices, controllers and apps.</li>
        <li><span class="font-black text-violet-300">2 · Control</span>: what your controllers do (Controller Designer).</li>
        <li><span class="font-black text-neutral-500">3 · Session</span>: performance, presets, patterns (coming later).</li>
      </ol>
      <input v-model="name" placeholder="Project name"
             class="bg-black border border-neutral-700 rounded px-3 py-2 text-[12px] text-white font-mono outline-none focus:border-violet-500/60"
             @keydown.enter="create(true)" />
      <div class="flex items-center justify-end gap-2">
        <button class="px-3 py-1.5 rounded text-neutral-400 text-[10px] font-black uppercase tracking-wider hover:text-white"
                title="Create it and set it up later" @click="create(false)">Later</button>
        <button class="px-3 py-1.5 rounded bg-violet-500 text-white text-[10px] font-black uppercase tracking-wider hover:bg-violet-400 disabled:opacity-40"
                :disabled="!name.trim()" @click="create(true)">Create · open MIDI Flow</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { needsFirstProject, newProject } from '@/core/projects'
import { useAuthStore } from '@/stores/useAuthStore'
import { useUiStore } from '@/stores/useUiStore'

const authStore = useAuthStore()
const uiStore = useUiStore()
const name = ref('My project')

// "Later" still creates the project (the name given, or "My project"): every step can wait,
// the project can't — everything the user sets up from now on belongs to it.
function create(openFlow) {
  newProject(name.value.trim() || 'My project')
  if (openFlow) uiStore.isMidiFlowOpen = true
}
</script>
