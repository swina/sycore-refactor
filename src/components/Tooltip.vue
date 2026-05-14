<script setup>
import { ref } from 'vue'

const props = defineProps({
  content: String,
  disabled: Boolean,
  position: { type: String, default: 'bottom' }
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
        :class="[
          'absolute left-1/2 -translate-x-1/2 z-[1000] px-2 py-1 bg-neutral-900 border border-synth-neon/50 text-synth-neon text-[10px] font-black uppercase tracking-widest rounded whitespace-nowrap pointer-events-none',
          position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
        ]"
      >
        {{ content }}
        <div v-if="position === 'bottom'" class="absolute bottom-full left-1/2 -translate-x-1/2 translate-y-1 w-2 h-2 bg-neutral-900 border-t border-l border-synth-neon/50 rotate-45" />
        <div v-if="position === 'top'" class="absolute top-full left-1/2 -translate-x-1/2 -translate-y-1 w-2 h-2 bg-neutral-900 border-b border-r border-synth-neon/50 rotate-45" />
      </div>
    </Transition>
  </div>
</template>
