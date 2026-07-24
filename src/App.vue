<script setup>
import { RouterView } from 'vue-router'
import { Analytics } from '@vercel/analytics/vue'
import TracksPlayer from '@/components/TracksPlayer.vue'
import GuidesPanel from '@/components/GuidesPanel.vue'
import FreesoundBrowser from '@/components/FreesoundBrowser.vue'
import AudioMixerPanel from '@/components/AudioMixerPanel.vue'
import SoundFolderBrowser from '@/components/SoundFolderBrowser.vue'
import StartupLoader from '@/components/ui/StartupLoader.vue'
import { useUiStore } from '@/stores/useUiStore'
import { useViewportClass } from '@/composables/useViewportClass'

const uiStore = useUiStore()

// Tablet-compatible: blocks phones, not iPad-class devices (768x1024 portrait
// and up must render — see docs/plans/modular/UI-Redesign.md).
const { isTooSmall: tooSmall } = useViewportClass()
</script>

<template>
  <div v-if="tooSmall" class="min-viewport-overlay overflow-hidden">
    <h1>SY.CORE</h1>
    <p>Minimum viewport size required: <strong>768 &times; 500</strong> pixels.</p>
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
  <Analytics />
</template>
