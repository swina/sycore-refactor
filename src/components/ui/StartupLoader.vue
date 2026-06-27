<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'

const lines = ref([])
const visible = ref(true)
const logEl = ref(null)
let autoCloseTimer = null
let fallbackTimer = null

function addLine(msg) {
  lines.value.push(String(msg))
  nextTick(() => {
    if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight
  })
}

function scheduleClose() {
  if (autoCloseTimer) return
  autoCloseTimer = setTimeout(() => { visible.value = false }, 1400)
}

function onLog(e) {
  const msg = e.detail
  addLine(msg)
  if (typeof msg === 'string' && msg.includes('MIDI Store Init Result')) {
    scheduleClose()
  }
}

onMounted(() => {
  window.addEventListener('app-system-log', onLog)
  addLine('sycore starting up...')
  fallbackTimer = setTimeout(() => { visible.value = false }, 12000)
})

onUnmounted(() => {
  window.removeEventListener('app-system-log', onLog)
  clearTimeout(autoCloseTimer)
  clearTimeout(fallbackTimer)
})
</script>

<template>
  <Transition name="startup-fade">
    <div
      v-if="visible"
      class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-sm"
      @click="visible = false"
    >
      <div
        class="w-[500px] bg-neutral-950 border border-neutral-800 rounded-2xl overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.9)]"
        @click.stop
      >
        <!-- macOS-style title bar -->
        <div class="flex items-center gap-2 px-4 py-3 border-b border-neutral-800/80 bg-black/50">
          <div class="w-3 h-3 rounded-full bg-red-500/60" />
          <div class="w-3 h-3 rounded-full bg-yellow-500/60" />
          <div class="w-3 h-3 rounded-full bg-green-500/60" />
          <span class="ml-3 text-[11px] font-mono tracking-widest text-violet-400/80 uppercase select-none">
            SYCORE — System Startup
          </span>
        </div>

        <!-- Log lines -->
        <div
          ref="logEl"
          class="font-mono text-[11px] leading-relaxed px-4 pt-3 pb-4 space-y-0.5 overflow-y-auto max-h-[260px]"
        >
          <div v-for="(line, i) in lines" :key="i" class="flex gap-2">
            <span class="text-violet-700 shrink-0">›</span>
            <span class="text-green-400/90">{{ line }}</span>
          </div>
          <!-- blinking cursor -->
          <div class="flex gap-2 mt-1">
            <span class="text-violet-700 shrink-0">›</span>
            <span class="inline-block w-1.5 h-3 bg-green-400/70 animate-pulse" />
          </div>
        </div>

        <div class="px-4 pb-3 text-[10px] text-neutral-600 font-mono select-none">
          click anywhere to dismiss
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.startup-fade-enter-active {
  transition: opacity 0.25s ease;
}
.startup-fade-leave-active {
  transition: opacity 0.7s ease;
}
.startup-fade-enter-from,
.startup-fade-leave-to {
  opacity: 0;
}
</style>
