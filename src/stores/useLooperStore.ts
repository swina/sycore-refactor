import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface LooperTake {
  id: number
  buffer: AudioBuffer | null
  isMuted: boolean
  isEmpty: boolean
  name: string
  volume: number
}

export const useLooperStore = defineStore('looper', () => {
  const measures = ref(4)
  const beatsPerMeasure = ref(4)
  const takeMeasures = ref(1)

  const isArmed = ref(false)
  const isRecording = ref(false)
  const currentMeasure = ref(0)
  const currentBeat = ref(0)
  const progress = ref(0)
  const rewindOnRecord = ref(true)
  const midiTriggerEnabled = ref(true)
  const isExporting = ref(false)
  const isPlaying = ref(false)

  const takes = ref<LooperTake[]>(
    Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      buffer: null,
      isMuted: false,
      isEmpty: true,
      name: `Track ${i + 1}`,
      volume: 0.8,
    }))
  )

  const activeTakeIndex = ref(0)

  function arm() { isArmed.value = true }

  function startRecording() {
    isArmed.value = false
    isRecording.value = true
  }

  function stopRecording() {
    isRecording.value = false
    isPlaying.value = true
    if (takes.value[activeTakeIndex.value]) {
      takes.value[activeTakeIndex.value].isEmpty = false
      const nextEmpty = takes.value.findIndex((t, i) => t.isEmpty && i > activeTakeIndex.value)
      if (nextEmpty !== -1) {
        activeTakeIndex.value = nextEmpty
      } else {
        const wrapEmpty = takes.value.findIndex(t => t.isEmpty)
        if (wrapEmpty !== -1) activeTakeIndex.value = wrapEmpty
      }
    }
  }

  function stopAll() { isPlaying.value = false }

  function clearTake(index: number) {
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

  function toggleMute(index: number) {
    if (takes.value[index]) {
      takes.value[index].isMuted = !takes.value[index].isMuted
    }
  }

  function setTakeVolume(index: number, vol: number) {
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
    setTakeVolume, resetProgress,
  }
})