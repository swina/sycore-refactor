<script setup>
// Asked by lib/midi-learn-conflicts.ts when a MIDI Learn picks a control that already drives
// something else: keep the existing binding (the new learn is dropped) or replace it.
import { onMounted, onUnmounted } from 'vue'
import { AlertTriangle } from 'lucide-vue-next'
import { pendingLearnConflict, describeControl } from '@/lib/midi-learn-conflicts'

const keep    = () => pendingLearnConflict.value?.resolve(false)
const replace = () => pendingLearnConflict.value?.resolve(true)

function onKey(e) {
  if (!pendingLearnConflict.value) return
  if (e.key === 'Escape') { e.stopPropagation(); keep() }
  else if (e.key === 'Enter') { e.stopPropagation(); replace() }
}
onMounted(()  => window.addEventListener('keydown', onKey, true))
onUnmounted(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="pendingLearnConflict"
      class="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      @mousedown.self="keep"
    >
      <div class="w-80 bg-neutral-950 border border-orange-500/40 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden">
        <div class="px-4 pt-3 pb-2 border-b border-neutral-800/80 flex items-center gap-2">
          <AlertTriangle class="w-4 h-4 text-orange-400 shrink-0" />
          <div class="min-w-0">
            <p class="text-[8px] font-mono text-neutral-600 uppercase tracking-widest leading-none mb-0.5">MIDI Learn · control already mapped</p>
            <p class="text-[11px] font-black text-white tracking-tight truncate leading-tight">
              {{ describeControl(pendingLearnConflict.control) }}
            </p>
          </div>
        </div>

        <div class="px-4 py-3 flex flex-col gap-2 text-[10px]">
          <div>
            <p class="text-[8px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Currently drives</p>
            <ul class="flex flex-col gap-0.5">
              <li v-for="o in pendingLearnConflict.owners" :key="o.id" class="font-mono text-orange-300 truncate">{{ o.label }}</li>
            </ul>
          </div>
          <div>
            <p class="text-[8px] font-bold uppercase tracking-widest text-neutral-500 mb-1">New mapping</p>
            <p class="font-mono text-synth-neon truncate">{{ pendingLearnConflict.target }}</p>
          </div>
        </div>

        <div class="px-4 pb-3 flex gap-2">
          <button
            @click="keep"
            class="flex-1 px-3 py-1.5 rounded-lg border border-neutral-700 text-neutral-300 text-[10px] font-bold uppercase tracking-widest hover:border-neutral-500 transition-colors"
          >Keep current</button>
          <button
            @click="replace"
            class="flex-1 px-3 py-1.5 rounded-lg border border-orange-500/60 bg-orange-500/15 text-orange-300 text-[10px] font-bold uppercase tracking-widest hover:bg-orange-500/25 transition-colors"
          >Replace</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
