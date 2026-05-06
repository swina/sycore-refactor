<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const isVisible = ref(false)
const content   = ref('')
const coords    = ref({ x: 0, y: 0, isBelow: false })

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
