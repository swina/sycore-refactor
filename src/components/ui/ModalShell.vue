<script setup>
import { onMounted, onUnmounted } from 'vue'
import { X } from 'lucide-vue-next'

const props = defineProps({
  title:  { type: String, default: '' },
  size:   { type: String, default: 'md' },   // sm | md | lg | full
  zClass: { type: String, default: 'z-modal' },
})

const emit = defineEmits(['close'])

const sizeMap = {
  sm:   'max-w-sm',
  md:   'max-w-md',
  lg:   'max-w-2xl',
  full: 'w-full h-full max-h-full rounded-none',
}

function onKeydown(e) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      :class="['fixed inset-0 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm', zClass]"
      @click.self="emit('close')"
    >
      <Transition name="sy-modal" appear>
        <div :class="['relative w-full bg-neutral-900/90 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]', sizeMap[size] ?? sizeMap.md]">

          <!-- Header -->
          <div class="shrink-0 flex items-center justify-between p-5 border-b border-neutral-800 bg-neutral-950/50">
            <slot name="header">
              <span class="text-sm font-black uppercase tracking-widest text-white">{{ title }}</span>
            </slot>
            <button
              @click="emit('close')"
              class="ml-3 shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
            >
              <X class="w-4 h-4" />
            </button>
          </div>

          <!-- Body -->
          <div class="flex-1 overflow-y-auto custom-scrollbar min-h-0">
            <slot />
          </div>

          <!-- Footer -->
          <slot name="footer" />

        </div>
      </Transition>
    </div>
  </Teleport>
</template>
