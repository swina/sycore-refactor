<script setup>
// Shown once when a save didn't fit in the browser's storage (lib/big-storage.ts reportQuota).
import { ref, onMounted, onUnmounted } from 'vue'
const key = ref('')
const on = e => { key.value = e.detail?.key || 'a setting' }
onMounted(() => window.addEventListener('storage-quota', on))
onUnmounted(() => window.removeEventListener('storage-quota', on))
</script>

<template>
  <div v-if="key" class="fixed bottom-16 left-1/2 -translate-x-1/2 z-[2100] max-w-lg px-4 py-3 rounded-xl border border-red-500/60 bg-red-950/90 text-red-100 text-xs shadow-2xl flex items-start gap-3">
    <span class="leading-relaxed">
      <b>Browser storage full</b> — a setting couldn't be saved (<code class="text-red-300">{{ key.replace(/^.*?_(?=[A-Z])/, '') }}</code>) and would be lost on reload.
      Free some space: remove preset banks or Drum Machine presets you don't use, or export and clear old data (MIDI Settings).
    </span>
    <button class="shrink-0 text-red-300 hover:text-white" @click="key = ''">✕</button>
  </div>
</template>
