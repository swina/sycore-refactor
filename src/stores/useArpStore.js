import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useArpStore = defineStore('arp', () => {
  const arpEnabled     = ref(false)
  const arpMode        = ref('up')        // 'up' | 'down' | 'up-down' | 'random'
  const arpBpm         = ref(120)
  const arpSubdivision = ref('1/8')       // ArpSubdivisionValue
  const arpHold        = ref(false)

  // Plain Set — not reactive to avoid thrashing during rapid MIDI note events.
  // Components that need the held notes read heldNoteCount for display.
  const _heldNotes  = new Set()
  const heldNoteCount = ref(0)

  function pressNote(note) {
    _heldNotes.add(note)
    heldNoteCount.value = _heldNotes.size
  }

  function releaseNote(note) {
    _heldNotes.delete(note)
    heldNoteCount.value = _heldNotes.size
  }

  function getHeldNotes() {
    return Array.from(_heldNotes)
  }

  function clearHeldNotes() {
    _heldNotes.clear()
    heldNoteCount.value = 0
  }

  return {
    arpEnabled, arpMode, arpBpm, arpSubdivision, arpHold,
    heldNoteCount,
    pressNote, releaseNote, getHeldNotes, clearHeldNotes,
  }
})
