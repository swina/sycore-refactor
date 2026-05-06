import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { midiService } from '@/core/midi/MidiService'

const LS_DEVICE     = 'midiDevice'
const LS_INPUT      = 'midiInputDevice'
const LS_CHANNEL    = 'midiChannel'
const LS_IN_CHANNEL = 'midiInputChannel'

export const useMidiStore = defineStore('midi', () => {
  const midiReady          = ref(false)
  const outputs            = ref([])
  const inputs             = ref([])
  const selectedDevice     = ref(localStorage.getItem(LS_DEVICE) || '')
  const selectedInputDevice = ref(localStorage.getItem(LS_INPUT) || '')
  const midiChannel        = ref(parseInt(localStorage.getItem(LS_CHANNEL) || '1'))
  const midiInputChannel   = ref(parseInt(localStorage.getItem(LS_IN_CHANNEL) || '0'))

  const isDeviceConnected = computed(() =>
    outputs.value.some(o => o.id === selectedDevice.value)
  )

  function refreshDevices() {
    outputs.value = midiService.getOutputs()
    inputs.value  = midiService.getInputs()
  }

  async function init() {
    const ok = await midiService.init()
    midiReady.value = ok
    if (!ok) return

    refreshDevices()

    // Re-attach persisted device selections
    if (selectedDevice.value) midiService.setOutput(selectedDevice.value)
    if (selectedInputDevice.value) {
      midiService.setKeyboardInput(selectedInputDevice.value)
      midiService.setControlInput(selectedInputDevice.value)
    }

    midiService.addStateChangeListener(() => refreshDevices())
  }

  function setOutput(id) {
    selectedDevice.value = id
    localStorage.setItem(LS_DEVICE, id)
    midiService.setOutput(id)
  }

  function setKeyboardInput(id) {
    selectedInputDevice.value = id
    localStorage.setItem(LS_INPUT, id)
    midiService.setKeyboardInput(id)
  }

  function setControlInput(id) {
    midiService.setControlInput(id)
  }

  function setMidiChannel(ch) {
    midiChannel.value = ch
    localStorage.setItem(LS_CHANNEL, String(ch))
  }

  function setMidiInputChannel(ch) {
    midiInputChannel.value = ch
    localStorage.setItem(LS_IN_CHANNEL, String(ch))
  }

  function sendCC(cc, value) {
    midiService.sendCC(cc, value, midiChannel.value - 1)
  }

  function sendNRPN(param, value) {
    midiService.sendNRPN(param, value, midiChannel.value - 1)
  }

  function sendAllCCs(ccMap, nrpnCCs) {
    midiService.sendAllCCs(ccMap, midiChannel.value - 1, nrpnCCs)
  }

  function sendNoteOn(note, velocity = 100) {
    midiService.sendNoteOn(note, velocity, midiChannel.value - 1)
  }

  function sendNoteOff(note) {
    midiService.sendNoteOff(note, 0, midiChannel.value - 1)
  }

  function sendPitchBend(value) {
    midiService.sendPitchBend(value, midiChannel.value - 1)
  }

  function allNotesOff() {
    midiService.allNotesOff(midiChannel.value - 1)
  }

  function startClock() { midiService.startClock() }
  function stopClock()  { midiService.stopClock() }
  function setBpm(bpm)  { midiService.setBpm(bpm) }

  return {
    midiReady, outputs, inputs,
    selectedDevice, selectedInputDevice,
    midiChannel, midiInputChannel,
    isDeviceConnected,
    init, refreshDevices,
    setOutput, setKeyboardInput, setControlInput,
    setMidiChannel, setMidiInputChannel,
    sendCC, sendNRPN, sendAllCCs,
    sendNoteOn, sendNoteOff, sendPitchBend,
    allNotesOff, startClock, stopClock, setBpm,
  }
})
