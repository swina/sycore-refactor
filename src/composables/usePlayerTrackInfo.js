// The Tracks Player's playing track (key, BPM), as the toolbar shows it: TracksPlayer.vue
// broadcasts 'player-state-sync' (partial updates) and answers 'player-state-request'.
import { ref, onMounted, onUnmounted } from 'vue'

export function usePlayerTrackInfo() {
  const hasSrc = ref(false)
  const trackKey = ref('')
  const trackBpm = ref(null)

  function onSync(e) {
    const d = e.detail ?? {}
    if (d.hasSrc !== undefined) hasSrc.value = d.hasSrc
    if (d.playingTrackKey !== undefined) trackKey.value = d.playingTrackKey
    if (d.playingTrackBpm !== undefined) trackBpm.value = d.playingTrackBpm
  }

  onMounted(() => {
    window.addEventListener('player-state-sync', onSync)
    window.dispatchEvent(new CustomEvent('player-state-request'))
  })
  onUnmounted(() => window.removeEventListener('player-state-sync', onSync))

  return { hasSrc, trackKey, trackBpm }
}
