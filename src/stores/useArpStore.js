import { defineStore } from 'pinia'
import { ref } from 'vue'

export const ARP_SUBDIVISIONS = [
  '1/1d', '1/1', '1/2d', '1/1t', '1/2', '1/4d', '1/2t', '1/4', '1/8d', '1/4t', '1/8', '1/16d', '1/8t', '1/16', '1/32d', '1/16t', '1/32', '1/64d', '1/32t', '1/64', '1/64t'
]

export const useArpStore = defineStore('arp', () => {
  const arpEnabled     = ref(false)
  const arpMode        = ref('up')        // 'up' | 'down' | 'up-down' | 'random'
  const arpBpm         = ref(120)
  const arpSubdivision = ref('1/8')       // ArpSubdivisionValue
  const arpHold        = ref(false)
  const arpOctave      = ref(0)           // -3 to +3 octaves

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
    arpEnabled, arpMode, arpBpm, arpSubdivision, arpHold, arpOctave,
    heldNoteCount,
    pressNote, releaseNote, getHeldNotes, clearHeldNotes,
  }
})
