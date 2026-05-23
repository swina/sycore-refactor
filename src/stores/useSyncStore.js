import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const useSyncStore = defineStore('sync', () => {
  const syncTrack = ref(localStorage.getItem('S1_SYNC_TRACK') === 'true')
  const syncRecordAudioCapture = ref(localStorage.getItem('S1_SYNC_REC_CAPTURE') === 'true')

  watch(syncTrack, v => localStorage.setItem('S1_SYNC_TRACK', v ? 'true' : 'false'))
  watch(syncRecordAudioCapture, v => localStorage.setItem('S1_SYNC_REC_CAPTURE', v ? 'true' : 'false'))

  return { syncTrack, syncRecordAudioCapture }
})
