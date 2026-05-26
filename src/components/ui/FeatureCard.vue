<script setup>
import { nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/useAuthStore'
import { useUiStore } from '@/stores/useUiStore'
import { usePresetStore } from '@/stores/usePresetStore'

const props = defineProps({
  icon: { type: [Object, Function], required: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  uiFlag: { type: String, default: '' },
  accent: { type: String, default: 'synth-neon' }
})

const router = useRouter()
const authStore = useAuthStore()
const uiStore = useUiStore()
const presetStore = usePresetStore()

async function handleClick() {
  if (!authStore.user) {
    uiStore.isAuthModalOpen = true
    return
  }
  if (router.currentRoute.value.path !== '/workspace') {
    await router.push('/workspace')
  }
  await nextTick()
  if (props.uiFlag && props.uiFlag in uiStore) {
    uiStore.closeAll?.()
    uiStore[props.uiFlag] = true
  }
}
</script>

<template>
  <button
    @click="handleClick"
    class="feature-card group relative flex flex-row items-center gap-3 p-2 rounded-xl bg-neutral-900/40 border border-neutral-800 hover:border-synth-neon/60 hover:bg-neutral-900/70 transition-all duration-200 text-left active:scale-[0.98] shadow-lg hover:shadow-[0_0_30px_rgba(0,163,112,0.25)]"
  >
    <div class="w-11 h-11 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-center text-synth-neon group-hover:bg-synth-neon group-hover:text-black group-hover:border-synth-neon transition-all duration-200 drop-shadow-[0_0_6px_rgba(0,163,112,0.4)]">
      <component :is="icon" class="w-5 h-5" />
    </div>
    <div class="flex flex-col gap-1 min-w-0 w-full">
      <span class="text-[11px] font-black uppercase tracking-[0.18em] text-neutral-100 group-hover:text-synth-neon transition-colors truncate">
        {{ title }}
      </span>
      <span v-if="title == 'Sound Types'" class="text-mono uppercase text-[9px] text-cyan-700">{{ presetStore.currentCategory }}</span>
      <!-- <span v-if="description" class="text-[10px] font-mono text-neutral-500 leading-relaxed line-clamp-2">
        {{ description }}
      </span> -->
    </div>
    <div class="absolute top-3 right-3 w-1.5 h-1.5 rounded-full bg-neutral-800 group-hover:bg-synth-neon group-hover:shadow-[0_0_8px_rgba(0,163,112,0.8)] transition-all" />
  </button>
</template>
