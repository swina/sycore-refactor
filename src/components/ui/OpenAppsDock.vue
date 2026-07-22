<script setup>
import { computed } from 'vue'
import { Maximize2 } from 'lucide-vue-next'
import { useUiStore } from '@/stores/useUiStore'
import { useMinimizedModals } from '@/composables/useMinimizedModals'
import { moduleRegistry } from '@/core/modules/registry'

const uiStore = useUiStore()
const { minimizedModals } = useMinimizedModals()

// Ids in PANEL_ID_REF_LOOKUP with no moduleRegistry entry (e.g. 'panic',
// 'tracks') aren't real "apps" a user would expect in a switcher — skip them.
const entries = computed(() =>
  uiStore.openPanelIds
    .map(id => {
      const m = moduleRegistry.find(mod => mod.id === id)
      if (!m) return null
      const minimized = minimizedModals.value.find(e => e.id === id)
      return { id, label: m.label, icon: m.icon, minimized: minimized ?? null }
    })
    .filter(Boolean)
)

// Fan opens upward from the toggle button in a semicircular arc, wider
// spread per icon up to a capped total arc so many open apps don't overlap.
const RADIUS = 92
const DEG_PER_ICON = 30
const MAX_SPREAD_DEG = 150

function fanStyle(index, total) {
  const spread = Math.min(MAX_SPREAD_DEG, (total - 1) * DEG_PER_ICON)
  const step = total > 1 ? spread / (total - 1) : 0
  const startDeg = -90 - spread / 2
  const angleDeg = total > 1 ? startDeg + step * index : -90
  const rad = (angleDeg * Math.PI) / 180
  const dx = RADIUS * Math.cos(rad)
  const dy = RADIUS * Math.sin(rad)
  // Set as custom properties, not `transform` directly — the base position
  // and the enter/leave transition both need to control `transform` via
  // plain CSS rules (see .fan-icon / .fan-enter-from below), which an inline
  // `style.transform` would silently override.
  return {
    '--dx': `${dx}px`,
    '--dy': `${dy}px`,
    transitionDelay: `${index * 25}ms`,
  }
}

function activate(entry) {
  if (entry.minimized) entry.minimized.restore()
  else uiStore.focusPanel(entry.id)
  uiStore.isOpenAppsDockOpen = false
}
</script>

<template>
  <Teleport to="body">
    <div v-if="uiStore.isOpenAppsDockOpen">
      <!-- Transparent click-catcher to close on outside click. z-index must
           clear SynthApp.vue's focusStyle() (hardcoded z-index:9999 on
           whichever panel is currently Ctrl+Tab/launcher-focused) and the
           highest pre-existing z-[99999] (GlobalTooltip.vue) so the dial
           is never hidden behind an open panel. -->
      <div class="fixed inset-0 z-[999990]" @click="uiStore.isOpenAppsDockOpen = false" />

      <div
        class="fixed z-[999999] pointer-events-none"
        :style="{ left: uiStore.openAppsDockAnchor.x + 'px', top: uiStore.openAppsDockAnchor.y + 'px' }"
      >
        <TransitionGroup name="fan" tag="div">
          <button
            v-for="(entry, index) in entries"
            :key="entry.id"
            :style="fanStyle(index, entries.length)"
            @click="activate(entry)"
            :class="['fan-icon absolute pointer-events-auto group flex items-center justify-center w-11 h-11 rounded-full border shadow-xl backdrop-blur-sm',
              entry.minimized
                ? 'bg-neutral-900/95 border-neutral-700 hover:border-synth-neon/60'
                : 'bg-neutral-900/95 border-synth-neon/50 hover:border-synth-neon/80']"
            :title="entry.minimized ? `Restore: ${entry.label}` : `Focus: ${entry.label}`"
          >
            <component
              :is="entry.minimized ? Maximize2 : entry.icon"
              :class="['w-4 h-4', entry.minimized ? 'text-neutral-500 group-hover:text-synth-neon' : 'text-synth-neon']"
            />
          </button>
        </TransitionGroup>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Base fanned-out position. Kept in one plain CSS rule (not an inline
   `style.transform`) so the enter/leave/hover/active states below can
   cleanly override just the `transform` property via normal cascade. */
.fan-icon {
  left: 0;
  top: 0;
  transform: translate(-50%, -50%) translate(var(--dx), var(--dy));
  transition: transform 0.15s ease;
}
.fan-icon:hover {
  transform: translate(-50%, -50%) translate(var(--dx), var(--dy)) scale(1.1);
}
.fan-icon:active {
  transform: translate(-50%, -50%) translate(var(--dx), var(--dy)) scale(0.95);
}

.fan-enter-active, .fan-leave-active {
  transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.18s ease;
}
.fan-enter-from, .fan-leave-to {
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.3);
}
.fan-move {
  transition: transform 0.22s ease;
}
</style>
