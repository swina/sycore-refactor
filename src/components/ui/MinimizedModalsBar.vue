<script setup>
import { Maximize2 } from 'lucide-vue-next'
import { useMinimizedModals } from '@/composables/useMinimizedModals'

const { minimizedModals } = useMinimizedModals()
</script>

<template>
  <Teleport to="body">
    <Transition name="bar-fade">
      <div
        v-if="minimizedModals.length > 0"
        class="fixed right-3 top-1/2 -translate-y-1/2 z-[990] flex flex-col gap-2 pointer-events-auto"
      >
        <TransitionGroup name="chip" tag="div" class="flex flex-col gap-2">
          <button
            v-for="modal in minimizedModals"
            :key="modal.id"
            @click="modal.restore()"
            class="group flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-900/95 border border-neutral-700 hover:border-synth-neon/60 hover:bg-neutral-800 shadow-xl backdrop-blur-sm transition-all active:scale-95 max-w-[160px]"
            :title="`Restore: ${modal.label}`"
          >
            <Maximize2 class="w-3 h-3 text-neutral-500 group-hover:text-synth-neon shrink-0 transition-colors" />
            <span class="text-[10px] font-black uppercase tracking-widest text-neutral-400 group-hover:text-white truncate transition-colors">
              {{ modal.label }}
            </span>
          </button>
        </TransitionGroup>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.bar-fade-enter-active, .bar-fade-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.bar-fade-enter-from, .bar-fade-leave-to { opacity: 0; transform: translateX(12px); }

.chip-enter-active, .chip-leave-active { transition: all 0.18s ease; }
.chip-enter-from { opacity: 0; transform: translateX(16px); }
.chip-leave-to   { opacity: 0; transform: translateX(16px); }
.chip-move       { transition: transform 0.18s ease; }
</style>
