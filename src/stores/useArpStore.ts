import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ArpMode } from '@/lib/arp-patterns'

export const ARP_SUBDIVISIONS = [
  '1/1d', '1/1', '1/2d', '1/1t', '1/2', '1/4d', '1/2t', '1/4', '1/8d', '1/4t',
  '1/8', '1/16d', '1/8t', '1/16', '1/32d', '1/16t', '1/32', '1/64d', '1/32t',
  '1/64', '1/64t',
] as const

export type ArpSubdivision = typeof ARP_SUBDIVISIONS[number]
// Was hardcoded to 'up' | 'down' | 'up-down' | 'random' — stale relative to
// the 10 modes actually offered/used (ArpeggiatorPanel.vue's arpModes ref);
// now sourced from the shared pattern module so it can't drift again.
export type { ArpMode }

export const useArpStore = defineStore('arp', () => {
  const arpEnabled     = ref(false)
  const arpMode        = ref<ArpMode>('up')
  const arpBpm         = ref(120)
  const arpSubdivision = ref<ArpSubdivision>('1/8')
  const arpHold        = ref(false)
  const arpOctave      = ref(0)           // -3 to +3 octaves

  // Plain Set — not reactive to avoid thrashing during rapid MIDI note events
  const _heldNotes  = new Set<number>()
  const heldNoteCount = ref(0)

  function pressNote(note: number) {
    _heldNotes.add(note)
    heldNoteCount.value = _heldNotes.size
  }

  function releaseNote(note: number) {
    _heldNotes.delete(note)
    heldNoteCount.value = _heldNotes.size
  }

  function getHeldNotes(): number[] {
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