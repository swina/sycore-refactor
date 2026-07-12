<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { RouterView } from 'vue-router'
import TracksPlayer from '@/components/TracksPlayer.vue'
import GuidesPanel from '@/components/GuidesPanel.vue'
import FreesoundBrowser from '@/components/FreesoundBrowser.vue'
import AudioMixerPanel from '@/components/AudioMixerPanel.vue'
import SoundFolderBrowser from '@/components/SoundFolderBrowser.vue'
import StartupLoader from '@/components/ui/StartupLoader.vue'
import { useUiStore } from '@/stores/useUiStore'

const uiStore = useUiStore()

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
  <StartupLoader />
  <TracksPlayer @close="uiStore.isTracksPlayerOpen = false" />
  <GuidesPanel v-if="uiStore.isGuidesOpen" @close="uiStore.isGuidesOpen = false" />
  <FreesoundBrowser />
  <AudioMixerPanel v-if="uiStore.isAudioMixerOpen" @close="uiStore.isAudioMixerOpen = false" />
  <SoundFolderBrowser />
</template>
