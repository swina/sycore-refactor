<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { RouterView } from 'vue-router'
import TracksPlayer from '@/components/TracksPlayer.vue'

const tooSmall = ref(false)

function checkSize() {
  tooSmall.value = window.innerWidth < 1024 || window.innerHeight < 768
}

onMounted(() => {
  checkSize()
  window.addEventListener('resize', checkSize)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkSize)
})
</script>

<template>
  <div v-if="tooSmall" class="min-viewport-overlay overflow-hidden">
    <h1>SY.CORE</h1>
    <p>Minimum viewport size required: <strong>1024 &times; 768</strong> pixels.</p>
    <p style="margin-top:0.5rem;font-size:0.65rem;color:#525252">
      Please resize your browser window or launch the PWA in standalone mode.
    </p>
  </div>
  <RouterView />
  <TracksPlayer />
</template>
