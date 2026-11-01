<script setup>
// A short "Generating…" modal, driven from outside through the exposed run(): its state lives
// here, so opening it re-renders only this component (not a big parent like the Drum Machine),
// and run() waits until the modal is painted before doing the work.
import { ref } from 'vue'
import { Loader2 } from 'lucide-vue-next'

const visible = ref(false)
const detail  = ref('')
let hideTimer = null

/** wait until the browser has painted the current DOM */
function afterPaint() {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}

/** Show the modal, run `work` once it's on screen, keep it up at least `minMs` from the click. */
async function run(work, { label = '', minMs = 500 } = {}) {
  clearTimeout(hideTimer)
  detail.value = label
  visible.value = true
  const shownAt = performance.now()
  await afterPaint()
  try { await work() } finally {
    const left = Math.max(0, minMs - (performance.now() - shownAt))
    hideTimer = setTimeout(() => { visible.value = false }, left)
  }
}

defineExpose({ run })
</script>

<template>
  <Teleport to="body">
    <Transition leave-active-class="transition-opacity duration-200" leave-to-class="opacity-0">
      <div v-if="visible" class="fixed inset-0 z-[400] flex items-center justify-center bg-black/50">
        <div class="bg-neutral-950 border border-neutral-800 rounded-2xl px-8 py-6 shadow-2xl flex flex-col items-center gap-3">
          <Loader2 class="w-8 h-8 text-amber-400 animate-spin" />
          <p class="text-sm text-neutral-300">Generating…</p>
          <p v-if="detail" class="text-[11px] font-mono text-amber-300/80 uppercase tracking-widest">{{ detail }}</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
