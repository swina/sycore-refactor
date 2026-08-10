import { defineStore } from 'pinia'
import { ref } from 'vue'

// State for the Note Latch app (NoteLatchPanel.vue) — a MIDI FLOW app source
// (MidiSource.NOTE_LATCH) that holds incoming notes the same way a device's
// own per-registration latch (latchEnabled/latchMaxNotes/latchReplace, see
// MidiWizardFlow.vue's "Multi-CH out" card and midi-smart-latch.ts) does,
// but as an independent, cable-able node instead of a per-destination
// toggle — so one latch can feed several instruments (real or virtual) at
// once, and switching it off releases every latched note through its own
// OUT rather than requiring each destination's latch to be toggled off
// individually.
export const useNoteLatchStore = defineStore('noteLatch', () => {
  const enabled  = ref(false)
  const maxNotes = ref(4)
  const replace  = ref(true) // true = FIFO (oldest note dropped when full), false = BLOCK (new note rejected)

  // Plain number, not a Set/Map — just a UI readout of how many notes are
  // currently held, kept in sync by NoteLatchPanel.vue's own latch state.
  const latchedCount = ref(0)

  return { enabled, maxNotes, replace, latchedCount }
})
