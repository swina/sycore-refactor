<script setup>
// Workspace switcher (footer): Classic (floating, as before) and the managed workspaces (registry.ts:
// their panels tiled). Switching never stops what plays. Reset: the tiles again.
import { RotateCcw } from 'lucide-vue-next'
import { useWorkspaceStore } from '@/stores/useWorkspaceStore'

const ws = useWorkspaceStore()
</script>

<template>
  <div class="flex items-center gap-1">
    <div class="flex rounded-full border border-neutral-700 overflow-hidden">
      <button
        v-for="w in ws.workspaces" :key="w.id"
        @click="ws.switchTo(w.id)"
        :class="['px-2.5 py-1 text-[9px] font-black uppercase tracking-widest transition-colors',
          ws.active === w.id ? 'bg-synth-neon/20 text-synth-neon' : 'text-neutral-500 hover:text-neutral-300']"
        :title="w.panels ? `${w.label}: ${w.panels.length} panels side by side (what plays keeps playing)` : 'Floating panels, as you leave them'"
      >{{ w.label }}</button>
    </div>
    <button
      v-if="ws.active !== 'classic'"
      @click="ws.resetLayout()"
      class="p-1 rounded-full text-neutral-500 hover:text-neutral-200 transition-colors"
      title="Reset layout: the panels back to their tiles"
    ><RotateCcw class="w-3.5 h-3.5" /></button>
  </div>
</template>
