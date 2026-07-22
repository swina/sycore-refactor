import { ref, computed } from 'vue'

// Module-level singleton — one shared resize listener across all component
// instances, same pattern as useMinimizedModals.js.
const width = ref(typeof window !== 'undefined' ? window.innerWidth : 1024)
const height = ref(typeof window !== 'undefined' ? window.innerHeight : 768)

function _onResize() {
  width.value = window.innerWidth
  height.value = window.innerHeight
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', _onResize)
}

// Same thresholds as the pre-existing check in App.vue.
const isTooSmall = computed(() => width.value < 768 || height.value < 500)
// Aligned to the Tailwind md (768px) / lg (1024px) breakpoints already used
// throughout the app's responsive grid classes.
const isTabletSize = computed(() => width.value >= 768 && width.value < 1024)
const isDesktopSize = computed(() => width.value >= 1024)

export function useViewportClass() {
  return { width, height, isTooSmall, isTabletSize, isDesktopSize }
}
