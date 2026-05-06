<script setup>
import { ref } from 'vue'

const props = defineProps({
  content: String,
  disabled: Boolean,
})

const isVisible = ref(false)
</script>

<template>
  <div
    @mouseenter="!disabled && (isVisible = true)"
    @mouseleave="isVisible = false"
    class="relative inline-flex"
  >
    <slot />
    <Transition name="tooltip">
      <div v-if="isVisible && !disabled"
        class="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 px-2 py-1 bg-neutral-900 border border-synth-neon/50 text-synth-neon text-[10px] font-black uppercase tracking-widest rounded whitespace-nowrap pointer-events-none"
      >
        {{ content }}
        <div class="absolute bottom-full left-1/2 -translate-x-1/2 translate-y-1 w-2 h-2 bg-neutral-900 border-t border-l border-synth-neon/50 rotate-45" />
      </div>
    </Transition>
  </div>
</template>
