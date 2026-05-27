import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const useSyncStore = defineStore('sync', () => {
  const syncTrack = ref(localStorage.getItem('S1_SYNC_TRACK') === 'true')
  const syncRecordAudioCapture = ref(localStorage.getItem('S1_SYNC_REC_CAPTURE') === 'true')

  // Backing Track → Looper
  const syncBackingTrackToLooper = ref(localStorage.getItem('S1_SYNC_TRACK_LOOPER') === 'true')
  // Sequencer → Looper
  const syncSequencerToLooper = ref(localStorage.getItem('S1_SYNC_SEQ_LOOPER') === 'true')

  // Audio Looper source → targets
  const syncLooperToMidi = ref(localStorage.getItem('S1_SYNC_LOOPER_MIDI') === 'true')
  const syncLooperToSequencer = ref(localStorage.getItem('S1_SYNC_LOOPER_SEQ') === 'true')
  const syncLooperToBackingTrack = ref(localStorage.getItem('S1_SYNC_LOOPER_TRACK') === 'true')
  const syncLooperToAudioCapture = ref(localStorage.getItem('S1_SYNC_LOOPER_CAPTURE') === 'true')

  // Live Timeline source → targets
  const syncTimelineToMidi          = ref(localStorage.getItem('S1_SYNC_TIMELINE_MIDI')    === 'true')
  const syncTimelineToSequencer     = ref(localStorage.getItem('S1_SYNC_TIMELINE_SEQ')    === 'true')
  const syncTimelineToBackingTrack  = ref(localStorage.getItem('S1_SYNC_TIMELINE_TRACK')  === 'true')
  const syncTimelineToAudioCapture  = ref(localStorage.getItem('S1_SYNC_TIMELINE_CAPTURE') === 'true')

  // Audio Capture source → targets
  const syncAudioCaptureToMidi = ref(localStorage.getItem('S1_SYNC_CAPTURE_MIDI') === 'true')
  const syncAudioCaptureToSequencer = ref(localStorage.getItem('S1_SYNC_CAPTURE_SEQ') === 'true')
  const syncAudioCaptureToBackingTrack = ref(localStorage.getItem('S1_SYNC_CAPTURE_TRACK') === 'true')
  const syncAudioCaptureToLooper = ref(localStorage.getItem('S1_SYNC_CAPTURE_LOOPER') === 'true')

  watch(syncTrack, v => localStorage.setItem('S1_SYNC_TRACK', v ? 'true' : 'false'))
  watch(syncRecordAudioCapture, v => localStorage.setItem('S1_SYNC_REC_CAPTURE', v ? 'true' : 'false'))
  watch(syncBackingTrackToLooper, v => localStorage.setItem('S1_SYNC_TRACK_LOOPER', v ? 'true' : 'false'))
  watch(syncSequencerToLooper, v => localStorage.setItem('S1_SYNC_SEQ_LOOPER', v ? 'true' : 'false'))
  watch(syncLooperToMidi, v => localStorage.setItem('S1_SYNC_LOOPER_MIDI', v ? 'true' : 'false'))
  watch(syncLooperToSequencer, v => localStorage.setItem('S1_SYNC_LOOPER_SEQ', v ? 'true' : 'false'))
  watch(syncLooperToBackingTrack, v => localStorage.setItem('S1_SYNC_LOOPER_TRACK', v ? 'true' : 'false'))
  watch(syncLooperToAudioCapture, v => localStorage.setItem('S1_SYNC_LOOPER_CAPTURE', v ? 'true' : 'false'))
  watch(syncTimelineToMidi,          v => localStorage.setItem('S1_SYNC_TIMELINE_MIDI',    v ? 'true' : 'false'))
  watch(syncTimelineToSequencer,     v => localStorage.setItem('S1_SYNC_TIMELINE_SEQ',    v ? 'true' : 'false'))
  watch(syncTimelineToBackingTrack,  v => localStorage.setItem('S1_SYNC_TIMELINE_TRACK',  v ? 'true' : 'false'))
  watch(syncTimelineToAudioCapture,  v => localStorage.setItem('S1_SYNC_TIMELINE_CAPTURE', v ? 'true' : 'false'))
  watch(syncAudioCaptureToMidi, v => localStorage.setItem('S1_SYNC_CAPTURE_MIDI', v ? 'true' : 'false'))
  watch(syncAudioCaptureToSequencer, v => localStorage.setItem('S1_SYNC_CAPTURE_SEQ', v ? 'true' : 'false'))
  watch(syncAudioCaptureToBackingTrack, v => localStorage.setItem('S1_SYNC_CAPTURE_TRACK', v ? 'true' : 'false'))
  watch(syncAudioCaptureToLooper, v => localStorage.setItem('S1_SYNC_CAPTURE_LOOPER', v ? 'true' : 'false'))

  return {
    syncTrack, syncRecordAudioCapture,
    syncTimelineToMidi, syncTimelineToSequencer, syncTimelineToBackingTrack, syncTimelineToAudioCapture,
    syncBackingTrackToLooper, syncSequencerToLooper,
    syncLooperToMidi, syncLooperToSequencer, syncLooperToBackingTrack, syncLooperToAudioCapture,
    syncAudioCaptureToMidi, syncAudioCaptureToSequencer, syncAudioCaptureToBackingTrack, syncAudioCaptureToLooper,
  }
})
