<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { Star } from 'lucide-vue-next'
import { useUiStore } from '@/stores/useUiStore'
import { useAppLauncher } from '@/composables/useAppLauncher'

const props = defineProps({
  // 'modal' = compact icon tiles + includes toolbar-only utilities (what the
  // old burger-menu strip exposed). 'page' = the main-page bg-image cards,
  // launcher tiles only (matches MainPageOptimized.vue's prior look).
  variant: { type: String, default: 'page' },
})

const emit = defineEmits(['select'])

const uiStore = useUiStore()
const { isPinned, togglePin, sections, pinnedItems } = useAppLauncher()

const compact = computed(() => props.variant === 'modal')
const includeUtilities = computed(() => props.variant === 'modal')

const allSections = computed(() => sections({ includeUtilities: includeUtilities.value }))
const pinned = computed(() => pinnedItems({ includeUtilities: includeUtilities.value }))

const activeCategory = ref(allSections.value[0]?.category ?? '')
watch(allSections, (secs) => {
  if (!secs.some(s => s.category === activeCategory.value)) {
    activeCategory.value = secs[0]?.category ?? ''
  }
}, { immediate: true })

const activeSection = computed(() => allSections.value.find(s => s.category === activeCategory.value))

// Background images only load after idle, and only for the non-compact
// (main-page) variant — mirrors MainPageOptimized.vue's prior lazyBg.
const bgLoaded = ref(false)
onMounted(() => {
  if (compact.value) return
  requestIdleCallback(() => { bgLoaded.value = true }, { timeout: 500 })
})
function lazyBg(url) {
  if (compact.value || !bgLoaded.value || !url) return {}
  return { backgroundImage: `linear-gradient(to bottom, rgba(10,10,10,0.3), rgba(10,10,10,0.3)), url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }
}

function selectItem(m) {
  uiStore.openPanel(m.id)
  emit('select', m.id)
}
</script>

<template>
  <div class="flex flex-col gap-4 min-h-0">
    <!-- Pinned row — always visible, no scrolling needed to reach it -->
    <section v-if="pinned.length">
      <div class="flex items-center gap-2 mb-2 px-1">
        <Star class="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
        <h2 class="text-[10px] font-black uppercase tracking-[0.3em] text-ink-muted dark:text-neutral-500 font-mono">Pinned</h2>
        <div class="flex-1 h-px bg-black/10 dark:bg-neutral-800/60" />
      </div>
      <div :class="compact
        ? 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2'
        : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3'">
        <div
          v-for="m in pinned"
          :key="'pinned-' + m.id"
          @click="selectItem(m)"
          :class="compact
            ? 'group relative flex flex-col items-center justify-center gap-1.5 rounded-lg border border-black/10 dark:border-neutral-800/80 bg-surface-panel dark:bg-neutral-900/40 p-2.5 cursor-pointer transition-all active:scale-[0.97] hover:border-brand/40 dark:hover:border-synth-neon/30'
            : 'group relative aspect-[3/2] rounded-xl border overflow-hidden cursor-pointer transition-all duration-200 active:scale-[0.97] border-black/10 dark:border-neutral-800/80 bg-surface-panel dark:bg-neutral-900/40 backdrop-blur-sm hover:border-brand/40 dark:hover:border-synth-neon/30 hover:bg-surface-panel dark:hover:bg-neutral-900/70 shadow-sm dark:shadow-none'"
          :style="lazyBg(m.bg)"
        >
          <template v-if="compact">
            <component :is="m.icon" class="w-5 h-5 text-brand-strong dark:text-synth-neon" />
            <span class="text-[9px] font-bold uppercase tracking-wider text-ink dark:text-neutral-300 font-mono text-center leading-tight truncate w-full">{{ m.label }}</span>
          </template>
          <template v-else>
            <div class="absolute inset-0 bg-gradient-to-t from-white/80 via-white/40 to-transparent dark:from-black/70 dark:via-black/20 dark:to-transparent" />
            <div class="absolute inset-0 flex flex-col justify-end p-3">
              <div class="flex items-center gap-2 min-w-0">
                <component :is="m.icon" class="w-4 h-4 text-brand-strong dark:text-synth-neon shrink-0" />
                <span class="text-[10px] font-bold uppercase tracking-[0.15em] text-ink dark:text-neutral-300 font-mono truncate">{{ m.label }}</span>
              </div>
            </div>
          </template>
          <button
            @click.stop="togglePin(m.id)"
            title="Unpin"
            class="absolute top-1.5 right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-black/30 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Star class="w-3 h-3 text-amber-400 fill-amber-400" />
          </button>
        </div>
      </div>
    </section>

    <!-- Category tabs -->
    <div class="flex items-center gap-1.5 overflow-x-auto scrollbar-thin -mx-1 px-1 shrink-0">
      <button
        v-for="section in allSections"
        :key="section.category"
        @click="activeCategory = section.category"
        :class="['flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest font-mono whitespace-nowrap transition-colors shrink-0',
          activeCategory === section.category
            ? 'bg-brand/15 text-brand-strong dark:bg-synth-neon/15 dark:text-synth-neon border border-brand/30 dark:border-synth-neon/30'
            : 'text-ink-muted dark:text-neutral-500 border border-transparent hover:bg-black/5 dark:hover:bg-white/5']"
      >
        <component :is="section.icon" class="w-3.5 h-3.5" />
        {{ section.title }}
      </button>
    </div>

    <!-- Active category grid -->
    <div :class="compact
      ? 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2'
      : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3'">
      <div
        v-for="m in (activeSection?.items ?? [])"
        :key="m.id"
        @click="selectItem(m)"
        :class="compact
          ? 'group relative flex flex-col items-center justify-center gap-1.5 rounded-lg border border-black/10 dark:border-neutral-800/80 bg-surface-panel dark:bg-neutral-900/40 p-2.5 cursor-pointer transition-all active:scale-[0.97] hover:border-brand/40 dark:hover:border-synth-neon/30'
          : 'group relative aspect-[3/2] rounded-xl border overflow-hidden cursor-pointer transition-all duration-200 active:scale-[0.97] border-black/10 dark:border-neutral-800/80 bg-surface-panel dark:bg-neutral-900/40 backdrop-blur-sm hover:border-brand/40 dark:hover:border-synth-neon/30 hover:bg-surface-panel dark:hover:bg-neutral-900/70 shadow-sm dark:shadow-none'"
        :style="lazyBg(m.bg)"
      >
        <template v-if="compact">
          <component :is="m.icon" class="w-5 h-5 text-brand-strong dark:text-synth-neon" />
          <span class="text-[9px] font-bold uppercase tracking-wider text-ink dark:text-neutral-300 font-mono text-center leading-tight truncate w-full">{{ m.label }}</span>
        </template>
        <template v-else>
          <div class="absolute inset-0 bg-gradient-to-t from-white/80 via-white/40 to-transparent dark:from-black/70 dark:via-black/20 dark:to-transparent" />
          <div class="absolute inset-0 flex flex-col justify-end p-3">
            <div class="flex items-center gap-2 min-w-0">
              <component :is="m.icon" class="w-4 h-4 text-brand-strong dark:text-synth-neon shrink-0 group-hover:drop-shadow-[0_0_6px_color-mix(in_srgb,var(--color-brand)_60%,transparent)] transition-all" />
              <span class="text-[10px] font-bold uppercase tracking-[0.15em] text-ink dark:text-neutral-300 font-mono group-hover:text-brand-strong dark:group-hover:text-white transition-colors truncate">{{ m.label }}</span>
              <span
                v-if="m.badge"
                class="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0"
              >
                {{ m.badge }}
              </span>
            </div>
          </div>
        </template>
        <button
          @click.stop="togglePin(m.id)"
          :title="isPinned(m.id) ? 'Unpin' : 'Pin'"
          class="absolute top-1.5 right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-black/30 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Star :class="['w-3 h-3', isPinned(m.id) ? 'text-amber-400 fill-amber-400' : 'text-white/70']" />
        </button>
      </div>
    </div>
  </div>
</template>
