import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { midiService, MidiSource } from '@/core/midi/MidiService'
import { FIELD_TO_CC } from '@/constants/s1-config'
import { useMappingStore } from './useMappingStore'

const LS_CHANNEL = 'midiChannel'
const LS_IN_CHANNEL = 'midiInputChannel'
const LS_SEND_CLOCK = 'midiSendClock'
const LS_SYNC_TRANSPORT = 'midiSyncTransport'
const LS_SYNC_SEQUENCER_TRANSPORT = 'midiSyncSequencerTransport'

export const useMidiStore = defineStore('midi', () => {
  const midiReady = ref(false)
  const outputs = ref([])
  const inputs = ref([])
  const midiChannel = ref(parseInt(localStorage.getItem(LS_CHANNEL) || '1'))
  const midiInputChannel = ref(parseInt(localStorage.getItem(LS_IN_CHANNEL) || '-1'))
  const sendClock = ref(localStorage.getItem(LS_SEND_CLOCK) === 'true')
  const syncMidiTransport = ref(localStorage.getItem(LS_SYNC_TRANSPORT) === 'true')
  const syncSequencerTransport = ref(localStorage.getItem(LS_SYNC_SEQUENCER_TRANSPORT) === 'true')
  const isTransportPlaying = ref(false)
  const currentBpm = ref(120)

  // Smart Latch State
  const isSmartLatchActive = ref(localStorage.getItem('SYCORE_SMARTLATCH_ACTIVE') === 'true')
  const smartLatchMaxNotes = ref(parseInt(localStorage.getItem('SYCORE_SMARTLATCH_MAX') || '4'))
  const smartLatchReplaceMode = ref(localStorage.getItem('SYCORE_SMARTLATCH_REPLACE') !== 'false')
  const smartLatchFadeTime = ref(parseInt(localStorage.getItem('SYCORE_SMARTLATCH_FADE') || '0'))

  // Advanced Routing Config (Per-Device Registration)
  const defaultRegistration = (name = '') => ({
    name,
    inEnabled: true,
    inChannel: -1,
    outEnabled: true,
    outChannel: -1,
    clock: true,
    transport: true,
    notes: true,
    cc: true,
    pc: true,
    isMulti: false,
    smartLatch: false
  })

  let initialConfig = { 
    registrations: {},
    globalThruEnabled: true, 
    thruFilters: { notes: true, cc: true } 
  }
  
  try {
    const saved = localStorage.getItem('SYCORE_ADVANCED_MIDI_ROUTING')
    if (saved) {
      initialConfig = JSON.parse(saved)
    }
  } catch (e) {
    console.error('[MIDI Store] Failed to parse routing config', e)
  }
  
  const routingConfig = ref(initialConfig)

  // Source-based Routing Matrix (Performance Grid)
  const broadcastMode      = ref(midiService.getBroadcastMode())
  const initialMatrix = {
    [MidiSource.SEQUENCER]: midiService.getRouting(MidiSource.SEQUENCER),
    [MidiSource.KEYBOARD]: midiService.getRouting(MidiSource.KEYBOARD),
    [MidiSource.ARP]: midiService.getRouting(MidiSource.ARP),
    [MidiSource.UI]: midiService.getRouting(MidiSource.UI),
    [MidiSource.TRANSPORT]: midiService.getRouting(MidiSource.TRANSPORT)
  }
  try {
    const rawMatrix = localStorage.getItem('S1_MIDI_ROUTING')
    if (rawMatrix) {
      const data = JSON.parse(rawMatrix)
      Object.keys(data).forEach(key => {
        initialMatrix[key] = midiService.getRouting(key)
      })
    }
  } catch (e) {}

  const routingMatrix = ref(initialMatrix)

  // Watchers for service sync and persistence
  watch(routingConfig, (newVal) => {
    if (!newVal || !newVal.registrations) return
    localStorage.setItem('SYCORE_ADVANCED_MIDI_ROUTING', JSON.stringify(newVal))
    midiService.setRoutingConfig(JSON.parse(JSON.stringify(newVal)))
  }, { deep: true, immediate: true })

  watch(midiChannel, (newVal) => {
    midiService.setGlobalChannel(newVal - 1)
  }, { immediate: true })

  // Smart Latch watchers
  watch(isSmartLatchActive, (val) => {
    localStorage.setItem('SYCORE_SMARTLATCH_ACTIVE', val.toString())
    midiService.setSmartLatchActive(val)
  })

  watch([smartLatchMaxNotes, smartLatchReplaceMode, smartLatchFadeTime], ([max, replace, fade]) => {
    localStorage.setItem('SYCORE_SMARTLATCH_MAX', max.toString())
    localStorage.setItem('SYCORE_SMARTLATCH_REPLACE', replace.toString())
    localStorage.setItem('SYCORE_SMARTLATCH_FADE', fade.toString())
    midiService.setSmartLatchConfig(max, replace, fade)
  }, { immediate: true })

  function toggleSmartLatch(active) {
    if (typeof active === 'boolean') isSmartLatchActive.value = active
    else isSmartLatchActive.value = !isSmartLatchActive.value
    localStorage.setItem('SYCORE_SMARTLATCH_ACTIVE', isSmartLatchActive.value)
  }

  function toggleDeviceLatch(deviceName) {
    const reg = routingConfig.value.registrations[deviceName]
    if (reg) {
      reg.smartLatch = !reg.smartLatch
      saveRoutingConfig()
    }
  }

  const isDeviceConnected = computed(() => outputs.value.length > 0)

  function addRegistration(name) {
    if (!name || routingConfig.value.registrations[name]) return
    routingConfig.value.registrations[name] = defaultRegistration(name)
    saveRoutingConfig()
  }

  function removeRegistration(name) {
    if (routingConfig.value.registrations[name]) {
      delete routingConfig.value.registrations[name]
      saveRoutingConfig()
    }
  }

  function clearRegistrations() {
    routingConfig.value.registrations = {}
    saveRoutingConfig()
  }

  function updateRegistration(name, field, value) {
    if (routingConfig.value.registrations[name]) {
      routingConfig.value.registrations[name][field] = value
      saveRoutingConfig()
    }
  }

  function saveRoutingConfig() {
    routingConfig.value = { ...routingConfig.value }
  }

  function refreshDevices() {
    outputs.value = midiService.getOutputs()
    inputs.value = midiService.getInputs()
    
    // Sync Matrix State from service (case devices were refreshed)
    broadcastMode.value = midiService.getBroadcastMode()
    Object.keys(routingMatrix.value).forEach(source => {
      routingMatrix.value[source] = midiService.getRouting(source)
    })
  }

  async function init() {
    const ok = await midiService.init()
    midiReady.value = ok
    if (!ok) return midiReady.value

    refreshDevices()

    midiService.addStateChangeListener(() => refreshDevices())

    // Listen for incoming Note On for Velocity Modulation
    midiService.addNoteListener((type, note, velocity, chan) => {
      if (type === 'on') {
        const mappingStore = useMappingStore()
        mappingStore.handleVelocity(velocity, chan)
      }
    })
    
    if (sendClock.value) {
      startClock()
    }
    return midiReady.value
  }

  function setMidiChannel(ch) {
    midiChannel.value = ch
    midiService.setGlobalChannel(ch - 1)
    localStorage.setItem(LS_CHANNEL, String(ch))
  }

  function setMidiInputChannel(ch) {
    midiInputChannel.value = ch
    localStorage.setItem(LS_IN_CHANNEL, String(ch))
  }

  function setSendClock(enabled) {
    sendClock.value = enabled
    localStorage.setItem(LS_SEND_CLOCK, String(enabled))
    if (enabled) {
      midiService.setBpm(currentBpm.value)
      midiService.startClock()
    } else {
      midiService.stopClock()
    }
  }

  function setSyncMidiTransport(enabled) {
    syncMidiTransport.value = enabled
    localStorage.setItem(LS_SYNC_TRANSPORT, String(enabled))
  }

  function setSyncSequencerTransport(enabled) {
    syncSequencerTransport.value = enabled
    localStorage.setItem(LS_SYNC_SEQUENCER_TRANSPORT, String(enabled))
  }

  function toggleGlobalTransport() {
    if (isTransportPlaying.value) sendStop()
    else sendStart()
  }

  function sendProgramChange(pcValue, source = MidiSource.UI) {
    const programNumber = Math.max(0, Math.min(127, pcValue - 1))
    // S-1 receives Program Change on channel 16 (index 15) regardless of the active channel.
    // However, with source-based routing, we might want to respect the source.
    midiService.sendProgramChange(programNumber, 15, source)
  }

  function setRouting(source, outputNames) {
    routingMatrix.value[source] = outputNames
    midiService.setRouting(source, outputNames)
  }

  function toggleRouting(source, outputName) {
    midiService.toggleRouting(source, outputName)
    routingMatrix.value[source] = midiService.getRouting(source)
  }

  function toggleBroadcastMode() {
    midiService.toggleBroadcastMode()
    broadcastMode.value = midiService.getBroadcastMode()
  }

  function sendCC(cc, value, channel = null, source = MidiSource.UI) {
    const targetChannel = channel !== null ? channel - 1 : midiChannel.value - 1
    midiService.sendCC(cc, value, targetChannel, source)
  }

  function sendNRPN(param, value, channel = null, source = MidiSource.UI) {
    const targetChannel = channel !== null ? channel - 1 : midiChannel.value - 1
    midiService.sendNRPN(param, value, targetChannel, source)
  }

  function sendAllCCs(ccMap, nrpnCCs, source = MidiSource.UI) {
    midiService.sendAllCCs(ccMap, midiChannel.value - 1, nrpnCCs, source)
  }

  function sendNoteOn(note, velocity = 100, channel = null, source = MidiSource.UI, skipDeviceId = null) {
    const targetChannel = channel !== null ? channel - 1 : midiChannel.value - 1
    midiService.sendNoteOn(note, velocity, targetChannel, source, skipDeviceId)
    // Also trigger velocity modulation for internal notes
    const mappingStore = useMappingStore()
    mappingStore.handleVelocity(velocity, targetChannel)
  }

  function sendNoteOff(note, velocity = 0, channel = null, source = MidiSource.UI, skipDeviceId = null) {
    const targetChannel = channel !== null ? channel - 1 : midiChannel.value - 1
    midiService.sendNoteOff(note, velocity, targetChannel, source, skipDeviceId)
  }

  function sendPitchBend(value, channel = null, source = MidiSource.UI, skipDeviceId = null) {
    const targetChannel = channel !== null ? channel - 1 : midiChannel.value - 1
    midiService.sendPitchBend(value, targetChannel, source, skipDeviceId)
  }

  function allNotesOff() {
    midiService.allNotesOff(midiChannel.value - 1)
  }

  function sendControlValue(field, value, source = MidiSource.UI) {
    const cc = FIELD_TO_CC[field]
    if (cc !== undefined) {
      sendCC(cc, value, null, source)
    }
  }

  function startClock() { if (sendClock.value) midiService.startClock() }
  function stopClock() { midiService.stopClock() }
  function setBpm(bpm) { midiService.setBpm(bpm) }
  
  function sendStart() { 
    isTransportPlaying.value = true
    midiService.sendStart() 
  }
  
  function sendStop() { 
    isTransportPlaying.value = false
    midiService.sendStop() 
  }
  
  function panic() { midiService.panic() }

  return {
    midiReady, outputs, inputs,
    midiChannel, midiInputChannel,
    isDeviceConnected, broadcastMode, routingMatrix,
    init, refreshDevices,
    setMidiChannel, setMidiInputChannel,
    setRouting, toggleRouting, toggleBroadcastMode,
    sendProgramChange, sendCC, sendNRPN, sendAllCCs, sendControlValue,
    sendNoteOn, sendNoteOff, sendPitchBend,
    allNotesOff, panic, startClock, stopClock, setBpm, sendStart, sendStop,
    sendClock, setSendClock, currentBpm,
    syncMidiTransport, setSyncMidiTransport,
    syncSequencerTransport, setSyncSequencerTransport,
    isTransportPlaying, toggleGlobalTransport,
    routingConfig,
    saveRoutingConfig,
    addRegistration,
    removeRegistration,
    updateRegistration,
    clearRegistrations,
    isSmartLatchActive,
    smartLatchMaxNotes,
    smartLatchReplaceMode,
    smartLatchFadeTime,
    toggleSmartLatch,
    toggleDeviceLatch,
    MidiSource
  }
})
