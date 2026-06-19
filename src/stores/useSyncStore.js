import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useAuthStore } from './useAuthStore'
import { userKey } from '@/lib/userKey'

const KEYS = {
  syncTrack:                   'S1_SYNC_TRACK',
  syncRecordAudioCapture:      'S1_SYNC_REC_CAPTURE',
  syncBackingTrackToLooper:    'S1_SYNC_TRACK_LOOPER',
  syncSequencerToLooper:       'S1_SYNC_SEQ_LOOPER',
  syncLooperToMidi:            'S1_SYNC_LOOPER_MIDI',
  syncLooperToSequencer:       'S1_SYNC_LOOPER_SEQ',
  syncLooperToBackingTrack:    'S1_SYNC_LOOPER_TRACK',
  syncLooperToAudioCapture:    'S1_SYNC_LOOPER_CAPTURE',
  syncTimelineToMidi:          'S1_SYNC_TIMELINE_MIDI',
  syncTimelineToSequencer:     'S1_SYNC_TIMELINE_SEQ',
  syncTimelineToBackingTrack:  'S1_SYNC_TIMELINE_TRACK',
  syncTimelineToAudioCapture:  'S1_SYNC_TIMELINE_CAPTURE',
  syncAudioCaptureToMidi:      'S1_SYNC_CAPTURE_MIDI',
  syncAudioCaptureToSequencer: 'S1_SYNC_CAPTURE_SEQ',
  syncAudioCaptureToBackingTrack: 'S1_SYNC_CAPTURE_TRACK',
  syncAudioCaptureToLooper:    'S1_SYNC_CAPTURE_LOOPER',
  syncChordProgToSequencer:    'S1_SYNC_CHORDPROG_SEQ',
  syncChordProgToBackingTrack: 'S1_SYNC_CHORDPROG_TRACK',
  syncChordProgToLooper:       'S1_SYNC_CHORDPROG_LOOPER',
  syncChordProgToAudioCapture: 'S1_SYNC_CHORDPROG_CAPTURE',
  syncLoopPadsToMidi:          'S1_SYNC_LOOPPADS_MIDI',
  syncLoopPadsToSequencer:     'S1_SYNC_LOOPPADS_SEQ',
  syncLoopPadsToBackingTrack:  'S1_SYNC_LOOPPADS_TRACK',
  syncLoopPadsToLooper:        'S1_SYNC_LOOPPADS_LOOPER',
  syncLoopPadsToAudioCapture:  'S1_SYNC_LOOPPADS_CAPTURE',
}

function readBool(k) { return localStorage.getItem(userKey(k)) === 'true' }

export const useSyncStore = defineStore('sync', () => {
  const authStore = useAuthStore()
  const uid = computed(() => authStore.user?.uid)

  const syncTrack                   = ref(readBool(KEYS.syncTrack))
  const syncRecordAudioCapture      = ref(readBool(KEYS.syncRecordAudioCapture))
  const syncBackingTrackToLooper    = ref(readBool(KEYS.syncBackingTrackToLooper))
  const syncSequencerToLooper       = ref(readBool(KEYS.syncSequencerToLooper))
  const syncLooperToMidi            = ref(readBool(KEYS.syncLooperToMidi))
  const syncLooperToSequencer       = ref(readBool(KEYS.syncLooperToSequencer))
  const syncLooperToBackingTrack    = ref(readBool(KEYS.syncLooperToBackingTrack))
  const syncLooperToAudioCapture    = ref(readBool(KEYS.syncLooperToAudioCapture))
  const syncTimelineToMidi          = ref(readBool(KEYS.syncTimelineToMidi))
  const syncTimelineToSequencer     = ref(readBool(KEYS.syncTimelineToSequencer))
  const syncTimelineToBackingTrack  = ref(readBool(KEYS.syncTimelineToBackingTrack))
  const syncTimelineToAudioCapture  = ref(readBool(KEYS.syncTimelineToAudioCapture))
  const syncAudioCaptureToMidi      = ref(readBool(KEYS.syncAudioCaptureToMidi))
  const syncAudioCaptureToSequencer = ref(readBool(KEYS.syncAudioCaptureToSequencer))
  const syncAudioCaptureToBackingTrack = ref(readBool(KEYS.syncAudioCaptureToBackingTrack))
  const syncAudioCaptureToLooper    = ref(readBool(KEYS.syncAudioCaptureToLooper))
  const syncChordProgToSequencer    = ref(readBool(KEYS.syncChordProgToSequencer))
  const syncChordProgToBackingTrack = ref(readBool(KEYS.syncChordProgToBackingTrack))
  const syncChordProgToLooper       = ref(readBool(KEYS.syncChordProgToLooper))
  const syncChordProgToAudioCapture = ref(readBool(KEYS.syncChordProgToAudioCapture))
  const syncLoopPadsToMidi          = ref(readBool(KEYS.syncLoopPadsToMidi))
  const syncLoopPadsToSequencer     = ref(readBool(KEYS.syncLoopPadsToSequencer))
  const syncLoopPadsToBackingTrack  = ref(readBool(KEYS.syncLoopPadsToBackingTrack))
  const syncLoopPadsToLooper        = ref(readBool(KEYS.syncLoopPadsToLooper))
  const syncLoopPadsToAudioCapture  = ref(readBool(KEYS.syncLoopPadsToAudioCapture))

  const REFS = {
    syncTrack, syncRecordAudioCapture, syncBackingTrackToLooper, syncSequencerToLooper,
    syncLooperToMidi, syncLooperToSequencer, syncLooperToBackingTrack, syncLooperToAudioCapture,
    syncTimelineToMidi, syncTimelineToSequencer, syncTimelineToBackingTrack, syncTimelineToAudioCapture,
    syncAudioCaptureToMidi, syncAudioCaptureToSequencer, syncAudioCaptureToBackingTrack, syncAudioCaptureToLooper,
    syncChordProgToSequencer, syncChordProgToBackingTrack, syncChordProgToLooper, syncChordProgToAudioCapture,
    syncLoopPadsToMidi, syncLoopPadsToSequencer, syncLoopPadsToBackingTrack, syncLoopPadsToLooper, syncLoopPadsToAudioCapture,
  }

  Object.entries(REFS).forEach(([name, r]) => {
    watch(r, v => localStorage.setItem(userKey(KEYS[name]), v ? 'true' : 'false'))
  })

  watch(uid, (newUid) => {
    Object.entries(REFS).forEach(([name, r]) => {
      r.value = newUid ? readBool(KEYS[name]) : false
    })
  })

  return REFS
})
