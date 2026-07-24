<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'

const isVisible = ref(false)
const content   = ref('')
const coords    = ref({ x: 0, y: 0, isBelow: false })
const tooltipEl = ref(null)

let showTimeout = null

function onMouseOver(e) {
  let el = e.target
  while (el && el !== document.body) {
    if (el.hasAttribute('title')) {
      const title = el.getAttribute('title')
      if (title) {
        el.setAttribute('data-tooltip', title)
        el.removeAttribute('title')
      }
    }
    if (el.hasAttribute('data-tooltip')) break
    el = el.parentElement
  }

  if (el && el.hasAttribute('data-tooltip')) {
    const text = el.getAttribute('data-tooltip') || ''
    if (!text) return

    clearTimeout(showTimeout)
    const rect = el.getBoundingClientRect()

    showTimeout = setTimeout(() => {
      content.value = text
      let y = rect.top - 15
      let isBelow = false
      if (y < 40) { y = rect.bottom + 15; isBelow = true }
      coords.value  = { x: rect.left + rect.width / 2, y, isBelow }
      isVisible.value = true

      // Clamp horizontally so a trigger near the left/right screen edge
      // doesn't push the (variable-width, centered) tooltip off-screen —
      // width is only known once rendered, so measure after mount.
      nextTick(() => {
        const tip = tooltipEl.value
        if (!tip) return
        const margin = 8
        const halfWidth = tip.offsetWidth / 2
        const minX = halfWidth + margin
        const maxX = window.innerWidth - halfWidth - margin
        coords.value = { ...coords.value, x: Math.min(Math.max(coords.value.x, minX), maxX) }
      })
    }, 300)
  }
}

function onMouseOut() {
  clearTimeout(showTimeout)
  isVisible.value = false
}

onMounted(() => {
  document.addEventListener('mouseover', onMouseOver, true)
  document.addEventListener('mouseout',  onMouseOut,  true)
})

onUnmounted(() => {
  clearTimeout(showTimeout)
  document.removeEventListener('mouseover', onMouseOver, true)
  document.removeEventListener('mouseout',  onMouseOut,  true)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="tooltip">
      <div
        v-if="isVisible"
        ref="tooltipEl"
        class="fixed z-[99999] px-3 py-1.5 bg-neutral-950 border border-synth-neon/30 text-synth-neon text-[10px] font-black uppercase tracking-widest rounded-lg shadow-2xl pointer-events-none whitespace-nowrap glow-neon"
        :style="{
          left: coords.x + 'px',
          top:  coords.y + 'px',
          transform: `translate(-50%, ${coords.isBelow ? '0' : '-100%'})`
        }"
      >
        {{ content }}
      </div>
    </Transition>
  </Teleport>
</template>
