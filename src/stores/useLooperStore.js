import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useLooperStore = defineStore('looper', () => {
  // Config
  const measures = ref(4) // Total loop length in measures
  const beatsPerMeasure = ref(4)
  const takeMeasures = ref(1) // How many measures to record for a new take
  
  // State
  const isArmed = ref(false)
  const isRecording = ref(false)
  const currentMeasure = ref(0)
  const currentBeat = ref(0)
  const progress = ref(0) // 0 to 100
  const rewindOnRecord = ref(true) // Option to rewind to 0 when starting a recording
  const midiTriggerEnabled = ref(true) // Option to wait for MIDI signal to start recording
  const isExporting = ref(false) // State for rendering mixdown
  const isPlaying = ref(false)
  
  // Takes (8 slots instead of 4 for better performance capability)
  const takes = ref(Array.from({ length: 8 }, (_, i) => ({
    id: i + 1,
    buffer: null,
    isMuted: false,
    isEmpty: true,
    name: `Track ${i + 1}`,
    volume: 0.8
  })))
  
  const activeTakeIndex = ref(0)
  
  // Actions
  function arm() {
    isArmed.value = true
  }
  
  function startRecording() {
    isArmed.value = false
    isRecording.value = true
  }
  
  function stopRecording() {
    isRecording.value = false
    isPlaying.value = true
    if (takes.value[activeTakeIndex.value]) {
      takes.value[activeTakeIndex.value].isEmpty = false
      // Find next empty slot
      const nextEmpty = takes.value.findIndex((t, i) => t.isEmpty && i > activeTakeIndex.value)
      if (nextEmpty !== -1) {
        activeTakeIndex.value = nextEmpty
      } else {
        const wrapEmpty = takes.value.findIndex(t => t.isEmpty)
        if (wrapEmpty !== -1) activeTakeIndex.value = wrapEmpty
      }
    }
  }
  
  function stopAll() {
    isPlaying.value = false
  }
  
  function clearTake(index) {
    if (takes.value[index]) {
      takes.value[index].buffer = null
      takes.value[index].isEmpty = true
    }
  }
  
  function clearAll() {
    takes.value.forEach((_, i) => clearTake(i))
    activeTakeIndex.value = 0
    progress.value = 0
  }
  
  function toggleMute(index) {
    if (takes.value[index]) {
      takes.value[index].isMuted = !takes.value[index].isMuted
    }
  }

  function setTakeVolume(index, vol) {
    if (takes.value[index]) {
      takes.value[index].volume = vol
    }
  }

  function resetProgress() {
    progress.value = 0
    currentMeasure.value = 0
  }

  return {
    measures, beatsPerMeasure, takeMeasures,
    isArmed, isRecording, isPlaying, currentMeasure, currentBeat, progress,
    takes, activeTakeIndex, rewindOnRecord, midiTriggerEnabled, isExporting,
    arm, startRecording, stopRecording, clearTake, clearAll, toggleMute,
    setTakeVolume, resetProgress
  }
})
