import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { midiService } from '@/core/midi/MidiService'
import { FIELD_TO_CC } from '@/constants/s1-config'
import { useMappingStore } from './useMappingStore'

const LS_CHANNEL = 'midiChannel'
const LS_IN_CHANNEL = 'midiInputChannel'
const LS_SEND_CLOCK = 'midiSendClock'
const LS_SYNC_TRANSPORT = 'midiSyncTransport'

export const useMidiStore = defineStore('midi', () => {
  const midiReady = ref(false)
  const outputs = ref([])
  const inputs = ref([])
  const midiChannel = ref(parseInt(localStorage.getItem(LS_CHANNEL) || '1'))
  const midiInputChannel = ref(parseInt(localStorage.getItem(LS_IN_CHANNEL) || '-1'))
  const sendClock = ref(localStorage.getItem(LS_SEND_CLOCK) === 'true')
  const syncMidiTransport = ref(localStorage.getItem(LS_SYNC_TRANSPORT) === 'true')
  const isTransportPlaying = ref(false)
  const currentBpm = ref(120)

  // Advanced Routing Config
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
    isMulti: false
  })

  let initialConfig = { 
    registrations: {},
    globalThruEnabled: true, 
    thruFilters: { notes: true, cc: true } 
  }
  
  try {
    const saved = localStorage.getItem('SYCORE_ADVANCED_MIDI_ROUTING')
    if (saved) {
      const parsed = JSON.parse(saved)
      // Migration from old inputs/outputs structure to registrations
      if (parsed.outputs || parsed.inputs) {
        const regs = {}
        const allNames = new Set([...Object.keys(parsed.outputs || {}), ...Object.keys(parsed.inputs || {})])
        allNames.forEach(name => {
          // Skip numeric ID keys AND generic "input-X"/"output-X" IDs from old bug/browser defaults
          if (/^\d+$/.test(name) || /^(input|output)-\d+$/i.test(name)) return
          
          const outCfg = parsed.outputs?.[name] || {}
          const inCfg = parsed.inputs?.[name] || {}
          
          // Only migrate if it was actually enabled or has custom settings
          const hasSettings = outCfg.enabled || inCfg.enabled || outCfg.channel !== -1 || inCfg.channel !== -1
          if (!hasSettings) return

          regs[name] = {
            ...defaultRegistration(name),
            inEnabled: inCfg.enabled || false,
            inChannel: inCfg.channel || -1,
            outEnabled: outCfg.enabled || false,
            outChannel: outCfg.channel || -1,
            clock: outCfg.clock !== undefined ? outCfg.clock : true,
            transport: outCfg.transport !== undefined ? outCfg.transport : true,
            notes: outCfg.notes !== undefined ? outCfg.notes : true,
            cc: outCfg.cc !== undefined ? outCfg.cc : true,
            pc: outCfg.pc !== undefined ? outCfg.pc : true,
            isMulti: false
          }
        })
        parsed.registrations = regs
        delete parsed.outputs
        delete parsed.inputs
      }
      initialConfig = parsed
    }
  } catch (e) {
    console.error('[MIDI Store] Failed to parse routing config', e)
  }
  
  const routingConfig = ref(initialConfig)

  // Single source of truth for persistence and service sync
  watch(routingConfig, (newVal) => {
    if (!newVal || !newVal.registrations) return
    localStorage.setItem('SYCORE_ADVANCED_MIDI_ROUTING', JSON.stringify(newVal))
    midiService.setRoutingConfig(JSON.parse(JSON.stringify(newVal)))
  }, { deep: true, immediate: true })

  watch(midiChannel, (newVal) => {
    midiService.setGlobalChannel(newVal - 1)
  }, { immediate: true })

  const isDeviceConnected = computed(() =>
    outputs.value.length > 0
  )

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
  }

  async function init() {
    if (window.SY_LOG) window.SY_LOG('[MidiStore] Requesting MIDI Access from service...')
    console.log('[MidiStore] Initializing...')
    const ok = await midiService.init()
    if (window.SY_LOG) window.SY_LOG(`[MidiStore] MidiService.init result: ${ok}`)
    midiReady.value = ok
    if (!ok) return midiReady.value

    console.log('[MidiStore] Refreshing devices...')
    refreshDevices()

    midiService.addStateChangeListener(() => {
      console.log('[MidiStore] State change detected, refreshing...')
      refreshDevices()
    })

    // Listen for incoming Note On for Velocity Modulation
    midiService.addNoteListener((type, note, velocity, chan) => {
      if (type === 'on') {
        const mappingStore = useMappingStore()
        mappingStore.handleVelocity(velocity, chan)
      }
    })
    
    if (sendClock.value) {
      console.log('[MidiStore] Starting clock...')
      startClock()
    }
    if (window.SY_LOG) window.SY_LOG('[MidiStore] Initialization complete')
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

  function saveRoutingConfig() {
    // No manual saving needed, the deep watcher on routingConfig handles it
    // But we trigger a reactive update just in case
    routingConfig.value = { ...routingConfig.value }
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

  function toggleGlobalTransport() {
    if (isTransportPlaying.value) sendStop()
    else sendStart()
  }

  function sendProgramChange(pcValue) {
    const programNumber = Math.max(0, Math.min(127, pcValue - 1))
    // S-1 receives Program Change on channel 16 (index 15) regardless of the active channel.
    const s1ProgramChangeChannel = 15;
    midiService.sendProgramChange(programNumber, s1ProgramChangeChannel)
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

  function sendNoteOn(note, velocity = 100, skipDeviceId = null) {
    midiService.sendNoteOn(note, velocity, midiChannel.value - 1, skipDeviceId)
    // Also trigger velocity modulation for internal notes
    const mappingStore = useMappingStore()
    mappingStore.handleVelocity(velocity, midiChannel.value - 1)
  }

  function sendNoteOff(note, velocity = 0, skipDeviceId = null) {
    midiService.sendNoteOff(note, velocity, midiChannel.value - 1, skipDeviceId)
  }

  function sendPitchBend(value, skipDeviceId = null) {
    midiService.sendPitchBend(value, midiChannel.value - 1, skipDeviceId)
  }

  function allNotesOff() {
    midiService.allNotesOff(midiChannel.value - 1)
  }

  function sendControlValue(field, value) {
    const cc = FIELD_TO_CC[field]
    if (cc !== undefined) {
      sendCC(cc, value)
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
    midiService.panic() // Kill all notes on stop as requested
  }
  function panic() { midiService.panic() }

  return {
    midiReady, outputs, inputs,
    midiChannel, midiInputChannel,
    isDeviceConnected,
    init, refreshDevices,
    setMidiChannel, setMidiInputChannel,
    sendProgramChange, sendCC, sendNRPN, sendAllCCs, sendControlValue,
    sendNoteOn, sendNoteOff, sendPitchBend,
    allNotesOff, panic, startClock, stopClock, setBpm, sendStart, sendStop,
    sendClock, setSendClock, currentBpm,
    syncMidiTransport, setSyncMidiTransport,
    isTransportPlaying, toggleGlobalTransport,
    routingConfig,
    saveRoutingConfig,
    addRegistration,
    removeRegistration,
    updateRegistration,
    clearRegistrations
  }
})
