import { ref, onUnmounted } from 'vue'
import { midiService } from '@/core/midi/midi-service'
import { createControl } from '@/lib/midi-controller-presets'

export function useMidiSweep() {
  const isSweeping = ref(false)
  const selectedDevice = ref('')
  const discovered = ref([])
  const errors = ref([])

  let unsubCC = null
  let unsubNote = null
  let unsubPitch = null

  const ccBuffer = new Map()
  const noteBuffer = new Map()

  function classifyCC(cc, buf) {
    const vals = buf.values
    if (vals.length < 2) return { type: 'slider', label: `CC ${cc}` }
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const spread = max - min
    const isBinary = spread <= 1 && vals.every(v => v === 0 || v === 127 || v === 1)
    if (isBinary) return { type: 'pad-switch', label: `BTN CC${cc}` }
    if (spread <= 10) return { type: 'encoder', label: `Enc CC${cc}` }
    return { type: 'slider', label: `CC ${cc}` }
  }

  function classifyNote(note, buf) {
    if (buf.count < 2) return { type: 'pad-momentary', label: `Pad Note${note}` }
    const isToggle = buf.hasOn && !buf.hasOff
    return { type: isToggle ? 'pad-switch' : 'pad-momentary', label: `Pad Note${note}` }
  }

  function upsertDiscovered(id, patch) {
    const existing = discovered.value.find(d => d.id === id)
    if (existing) {
      Object.assign(existing, patch)
    } else {
      discovered.value.push({ id, ...patch })
    }
  }

  function startSweep(deviceName) {
    if (!deviceName) return
    selectedDevice.value = deviceName
    discovered.value = []
    errors.value = []
    ccBuffer.clear()
    noteBuffer.clear()
    isSweeping.value = true

    unsubCC = midiService.addCCListener((cc, val, chan, inputId) => {
      const input = midiService.getInputs().find(i => i.id === inputId)
      if (!input || input.name !== deviceName) return

      if (!ccBuffer.has(cc)) {
        ccBuffer.set(cc, { values: [], channel: chan, count: 0 })
      }
      const buf = ccBuffer.get(cc)
      buf.values.push(val)
      if (buf.values.length > 20) buf.values.shift()
      buf.count++
      buf.channel = chan

      const { type, label } = classifyCC(cc, buf)
      upsertDiscovered(`cc:${cc}`, {
        type,
        label,
        ccNumber: cc,
        channel: buf.channel + 1,
        count: buf.count,
      })
    })

    unsubNote = midiService.addNoteListener((type, note, velocity, chan, inputId) => {
      const input = midiService.getInputs().find(i => i.id === inputId)
      if (!input || input.name !== deviceName) return

      if (!noteBuffer.has(note)) {
        noteBuffer.set(note, { hasOn: false, hasOff: false, channel: chan, count: 0 })
      }
      const buf = noteBuffer.get(note)
      if (type === 'on' && velocity > 0) buf.hasOn = true
      if (type === 'off' || (type === 'on' && velocity === 0)) buf.hasOff = true
      buf.count++
      buf.channel = chan

      const { type: noteType, label } = classifyNote(note, buf)
      upsertDiscovered(`note:${note}`, {
        type: noteType,
        label,
        noteNumber: note,
        channel: buf.channel + 1,
        count: buf.count,
      })
    })

    unsubPitch = midiService.addPitchBendListener((val, chan, inputId) => {
      const input = midiService.getInputs().find(i => i.id === inputId)
      if (!input || input.name !== deviceName) return

      discovered.value = discovered.value.filter(d => d.id !== 'pitchbend')
      discovered.value.push({
        id: 'pitchbend',
        type: 'pitchbend',
        label: 'Pitch Bend',
        channel: chan + 1,
        count: (discovered.value.find(d => d.id === 'pitchbend')?.count ?? 0) + 1,
      })
    })
  }

  function stopSweep() {
    isSweeping.value = false
    unsubCC?.()
    unsubNote?.()
    unsubPitch?.()
    unsubCC = null
    unsubNote = null
    unsubPitch = null

    for (const [cc, buf] of ccBuffer) {
      if (buf.count < 2) continue
      const { type, label } = classifyCC(cc, buf)
      upsertDiscovered(`cc:${cc}`, { type, label })
    }

    for (const [note, buf] of noteBuffer) {
      if (buf.count < 1) continue
      const { type, label } = classifyNote(note, buf)
      upsertDiscovered(`note:${note}`, { type, label })
    }

    discovered.value = discovered.value.filter(d => d.id !== 'pitchbend').concat(
      discovered.value.filter(d => d.id === 'pitchbend')
    )
  }

  function createControlItem(entry, x, y) {
    return createControl(entry.type, x, y, {
      label: entry.label,
      ccNumber: entry.ccNumber,
      noteNumber: entry.noteNumber,
      channel: entry.channel,
    })
  }

  function clear() {
    stopSweep()
    discovered.value = []
    ccBuffer.clear()
    noteBuffer.clear()
  }

  onUnmounted(() => {
    stopSweep()
  })

  return {
    isSweeping,
    selectedDevice,
    discovered,
    errors,
    startSweep,
    stopSweep,
    createControlItem,
    clear,
  }
}