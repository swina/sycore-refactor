import { ref, readonly } from 'vue'
import { getTransport } from 'tone'

let participantCount = 0
let _isRunning = false

export function useTransportManager() {
  const isRunning = ref(false)

  function acquireTransport(): void {
    participantCount++
    if (!_isRunning) {
      _isRunning = true
      getTransport().start()
      isRunning.value = true
    }
  }

  function releaseTransport(): void {
    participantCount = Math.max(0, participantCount - 1)
    if (participantCount === 0 && _isRunning) {
      getTransport().stop()
      _isRunning = false
      isRunning.value = false
    }
  }

  function forceStopAll(): void {
    participantCount = 0
    if (_isRunning) {
      getTransport().stop()
      _isRunning = false
      isRunning.value = false
    }
  }

  function getBarPosition(): { bar: number; beat: number; sixteenth: number } {
    const raw = String(getTransport().position).split('.')[0]
    const parts = raw.split(':')
    return {
      bar: parseInt(parts[0]) + 1,
      beat: parseInt(parts[1]) + 1,
      sixteenth: parseInt(parts[2]) + 1,
    }
  }

  /**
   * Returns a Tone.js position string for the next whole-bar boundary
   * (e.g. "4:0:0"). Uses Tone's 0-indexed bar numbering.
   */
  function getNextBarPosition(): string {
    const raw = String(getTransport().position).split('.')[0]
    const parts = raw.split(':')
    const currentBar = parseInt(parts[0])
    return `${currentBar + 1}:0:0`
  }

  return {
    isRunning: readonly(isRunning),
    acquireTransport,
    releaseTransport,
    forceStopAll,
    getBarPosition,
    getNextBarPosition,
  }
}