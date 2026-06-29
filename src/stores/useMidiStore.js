import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { midiService, MidiSource } from '@/core/midi/midi-service'
import { deviceRegistry } from '@/core/midi/DeviceRegistry'
import { FIELD_TO_CC } from '@/constants/s1-config'
import { useAuthStore } from './useAuthStore'
import { userKey } from '@/lib/userKey'
import { useMappingStore } from './useMappingStore'
import {
  loadConfigPresets as fetchConfigPresets,
  persistConfigPresets,
  createConfigPreset,
  AUTOSAVE_CONFIG_ID,
} from '@/lib/midi-config-presets'

const LS_CHANNEL = 'midiChannel'
const LS_ACTIVE_CONFIG_PRESET = 'SYCORE_ACTIVE_CONFIG_PRESET'
const LS_IN_CHANNEL = 'midiInputChannel'
const LS_SEND_CLOCK = 'midiSendClock'
const LS_SYNC_TRANSPORT = 'midiSyncTransport'
const LS_SYNC_SEQUENCER_TRANSPORT = 'midiSyncSequencerTransport'
const LS_SYNC_CHORDPROG_TRANSPORT = 'midiSyncChordProgTransport'

export const useMidiStore = defineStore('midi', () => {
  const authStore = useAuthStore()
  const uid = computed(() => authStore.user?.uid)

  const midiReady = ref(false)
  const outputs = ref([])
  const inputs = ref([])
  const incomingBpm  = ref(0)
  const sysexEnabled = ref(midiService.isSysExEnabled())
  const midiChannel = ref(parseInt(localStorage.getItem(userKey(LS_CHANNEL)) || '1'))
  const midiInputChannel = ref(parseInt(localStorage.getItem(userKey(LS_IN_CHANNEL)) || '-1'))
  const sendClock = ref(localStorage.getItem(userKey(LS_SEND_CLOCK)) === 'true')
  const syncMidiTransport = ref(localStorage.getItem(userKey(LS_SYNC_TRANSPORT)) === 'true')
  const syncSequencerTransport = ref(localStorage.getItem(userKey(LS_SYNC_SEQUENCER_TRANSPORT)) === 'true')
  const syncChordProgTransport = ref(localStorage.getItem(userKey(LS_SYNC_CHORDPROG_TRANSPORT)) === 'true')
  const isTransportPlaying = ref(false)
  const currentBpm = ref(120)

  // Smart Latch State
  const isSmartLatchActive = ref(localStorage.getItem(userKey('SYCORE_SMARTLATCH_ACTIVE')) === 'true')
  const smartLatchMaxNotes = ref(parseInt(localStorage.getItem(userKey('SYCORE_SMARTLATCH_MAX')) || '4'))
  const smartLatchReplaceMode = ref(localStorage.getItem(userKey('SYCORE_SMARTLATCH_REPLACE')) !== 'false')
  const smartLatchFadeTime = ref(parseInt(localStorage.getItem(userKey('SYCORE_SMARTLATCH_FADE')) || '0'))

  // Keyboard Split Config
  const defaultSplit = () => ({
    enabled: false,
    splitNote: 60,
    lowDevice: '',
    highDevice: '',
    lowTranspose: 0,
    highTranspose: 0
  })
  let initialSplit = defaultSplit()
  try {
    const raw = localStorage.getItem(userKey('SYCORE_KEYBOARD_SPLIT'))
    if (raw) initialSplit = { ...defaultSplit(), ...JSON.parse(raw) }
  } catch (e) {}
  const splitConfig = ref(initialSplit)

  watch(splitConfig, (val) => {
    localStorage.setItem(userKey('SYCORE_KEYBOARD_SPLIT'), JSON.stringify(val))
    midiService.setSplitConfig(val.enabled ? val : null)
  }, { deep: true, immediate: true })

  function setSplitConfig(patch) {
    splitConfig.value = { ...splitConfig.value, ...patch }
  }

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
    smartLatch: false,
    // Phase 2 additions
    midiThru: true,
    velocityMin: 0,
    velocityMax: 127,
    velocityMap: 'linear',
    receiveSyncIn: false,
    // Device Program Change
    pcEnabled: false,
    pcChannel: 0,
    pcProgram: 0,
    pcBank: '',
    pcChannels: {}  // { [ch: 0-15]: { program, bank, soundName } }
  })

  let initialConfig = { 
    registrations: {},
    globalThruEnabled: true, 
    thruFilters: { notes: true, cc: true } 
  }
  
  try {
    const saved = localStorage.getItem(userKey('SYCORE_ADVANCED_MIDI_ROUTING'))
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
    const rawMatrix = localStorage.getItem(userKey('S1_MIDI_ROUTING'))
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
    localStorage.setItem(userKey('SYCORE_ADVANCED_MIDI_ROUTING'), JSON.stringify(newVal))
    midiService.setRoutingConfig(JSON.parse(JSON.stringify(newVal)))
  }, { deep: true, immediate: true })

  watch(midiChannel, (newVal) => {
    midiService.setGlobalChannel(newVal - 1)
  }, { immediate: true })

  // Smart Latch watchers
  watch(isSmartLatchActive, (val) => {
    localStorage.setItem(userKey('SYCORE_SMARTLATCH_ACTIVE'), val.toString())
    midiService.setSmartLatchActive(val)
  })

  watch([smartLatchMaxNotes, smartLatchReplaceMode, smartLatchFadeTime], ([max, replace, fade]) => {
    localStorage.setItem(userKey('SYCORE_SMARTLATCH_MAX'), max.toString())
    localStorage.setItem(userKey('SYCORE_SMARTLATCH_REPLACE'), replace.toString())
    localStorage.setItem(userKey('SYCORE_SMARTLATCH_FADE'), fade.toString())
    midiService.setSmartLatchConfig(max, replace, fade)
  }, { immediate: true })

  function toggleSmartLatch(active) {
    if (typeof active === 'boolean') isSmartLatchActive.value = active
    else isSmartLatchActive.value = !isSmartLatchActive.value
    localStorage.setItem(userKey('SYCORE_SMARTLATCH_ACTIVE'), isSmartLatchActive.value)
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

    // Sync device registry with current live ports
    deviceRegistry.sync(inputs.value, outputs.value)

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

    // Incoming clock BPM — update reactive ref from service listener
    midiService.addClockBpmListener(bpm => {
      incomingBpm.value = Math.round(bpm * 10) / 10
    })

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
    localStorage.setItem(userKey(LS_CHANNEL), String(ch))
  }

  function setMidiInputChannel(ch) {
    midiInputChannel.value = ch
    localStorage.setItem(userKey(LS_IN_CHANNEL), String(ch))
  }

  function setSendClock(enabled) {
    sendClock.value = enabled
    localStorage.setItem(userKey(LS_SEND_CLOCK), String(enabled))
    if (enabled) {
      midiService.setBpm(currentBpm.value)
      midiService.startClock()
    } else {
      midiService.stopClock()
    }
  }

  function setSyncMidiTransport(enabled) {
    syncMidiTransport.value = enabled
    localStorage.setItem(userKey(LS_SYNC_TRANSPORT), String(enabled))
  }

  function setSyncSequencerTransport(enabled) {
    syncSequencerTransport.value = enabled
    localStorage.setItem(userKey(LS_SYNC_SEQUENCER_TRANSPORT), String(enabled))
  }

  function setSyncChordProgTransport(enabled) {
    syncChordProgTransport.value = enabled
    localStorage.setItem(userKey(LS_SYNC_CHORDPROG_TRANSPORT), String(enabled))
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

  function sendCC(cc, value, channel = null, source = MidiSource.UI, skipDeviceId = null) {
    const targetChannel = channel !== null ? channel - 1 : midiChannel.value - 1
    midiService.sendCC(cc, value, targetChannel, source, skipDeviceId)
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

  function allNotesOff(channel = null) {
    const targetChannel = channel !== null ? channel - 1 : midiChannel.value - 1
    midiService.allNotesOff(targetChannel)
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

  function sendContinue() { midiService.sendContinue() }
  
  function panic() { midiService.panic() }

  async function toggleSysEx() {
    if (sysexEnabled.value) {
      midiService.disableSysEx()
      sysexEnabled.value = false
    } else {
      const ok = await midiService.enableSysEx()
      sysexEnabled.value = ok
    }
  }

  // ─── Config Presets (Phase 6) ───────────────────────────────────────────────

  const configPresets = ref([])
  const activeConfigPresetId = ref(localStorage.getItem(userKey(LS_ACTIVE_CONFIG_PRESET)) || null)

  async function loadConfigPresets() {
    configPresets.value = await fetchConfigPresets()
  }

  function _snapshotState() {
    const mappingStore = useMappingStore()
    return {
      routingMatrix: Object.fromEntries(
        Object.entries(routingMatrix.value).map(([k, v]) => [k, [...(v || [])]])
      ),
      registrations: JSON.parse(JSON.stringify(routingConfig.value.registrations || {})),
      broadcastMode: broadcastMode.value,
      smartLatch: {
        active:      isSmartLatchActive.value,
        maxNotes:    smartLatchMaxNotes.value,
        replaceMode: smartLatchReplaceMode.value,
        fadeTime:    smartLatchFadeTime.value,
      },
      activeMappingPresetId: mappingStore.activePresetId ?? null,
      splitConfig: JSON.parse(JSON.stringify(splitConfig.value)),
      midiChannel:             midiChannel.value,
      midiInputChannel:        midiInputChannel.value,
      sendClock:               sendClock.value,
      syncMidiTransport:       syncMidiTransport.value,
      syncSequencerTransport:  syncSequencerTransport.value,
      syncChordProgTransport:  syncChordProgTransport.value,
    }
  }

  async function saveConfigPreset(name) {
    const isAutosave = name === AUTOSAVE_CONFIG_ID
    const existingIdx = isAutosave
      ? configPresets.value.findIndex(p => p.id === AUTOSAVE_CONFIG_ID)
      : -1

    const snapshot = createConfigPreset(name, {
      id: isAutosave ? AUTOSAVE_CONFIG_ID : undefined,
      ..._snapshotState(),
      updatedAt: Date.now(),
    })

    if (existingIdx >= 0) {
      configPresets.value = configPresets.value.map((p, i) => i === existingIdx ? snapshot : p)
    } else {
      configPresets.value = [...configPresets.value, snapshot]
    }

    activeConfigPresetId.value = snapshot.id
    localStorage.setItem(userKey(LS_ACTIVE_CONFIG_PRESET), snapshot.id)
    await persistConfigPresets(configPresets.value)
    return snapshot.id
  }

  async function loadConfigPreset(id) {
    const preset = configPresets.value.find(p => p.id === id)
    if (!preset) return

    if (preset.midiChannel !== undefined) setMidiChannel(preset.midiChannel)
    if (preset.midiInputChannel !== undefined) setMidiInputChannel(preset.midiInputChannel)
    if (preset.sendClock !== undefined) setSendClock(preset.sendClock)
    if (preset.syncMidiTransport !== undefined) setSyncMidiTransport(preset.syncMidiTransport)
    if (preset.syncSequencerTransport !== undefined) setSyncSequencerTransport(preset.syncSequencerTransport)
    if (preset.syncChordProgTransport !== undefined) setSyncChordProgTransport(preset.syncChordProgTransport)

    if (preset.smartLatch) {
      isSmartLatchActive.value  = preset.smartLatch.active
      smartLatchMaxNotes.value  = preset.smartLatch.maxNotes
      smartLatchReplaceMode.value = preset.smartLatch.replaceMode
      smartLatchFadeTime.value  = preset.smartLatch.fadeTime
    }

    if (preset.splitConfig) {
      splitConfig.value = { ...splitConfig.value, ...preset.splitConfig }
    }

    if (preset.routingMatrix) {
      Object.entries(preset.routingMatrix).forEach(([source, targets]) => {
        setRouting(source, targets)
      })
    }

    if (preset.registrations) {
      routingConfig.value = {
        ...routingConfig.value,
        registrations: JSON.parse(JSON.stringify(preset.registrations)),
      }
    }

    if (preset.activeMappingPresetId) {
      const mappingStore = useMappingStore()
      await mappingStore.loadPreset(preset.activeMappingPresetId)
    }

    activeConfigPresetId.value = id
    localStorage.setItem(userKey(LS_ACTIVE_CONFIG_PRESET), id)
  }

  async function deleteConfigPreset(id) {
    configPresets.value = configPresets.value.filter(p => p.id !== id)
    if (activeConfigPresetId.value === id) {
      activeConfigPresetId.value = null
      localStorage.removeItem(userKey(LS_ACTIVE_CONFIG_PRESET))
    }
    await persistConfigPresets(configPresets.value)
  }

  // Debounced auto-save: only runs if there's an active named preset (not autosave)
  let _cfgAutoSaveTimer = null
  function _scheduleConfigAutoSave() {
    clearTimeout(_cfgAutoSaveTimer)
    _cfgAutoSaveTimer = setTimeout(async () => {
      if (!activeConfigPresetId.value || activeConfigPresetId.value === AUTOSAVE_CONFIG_ID) return
      const idx = configPresets.value.findIndex(p => p.id === activeConfigPresetId.value)
      if (idx < 0) return
      const updated = { ...configPresets.value[idx], ..._snapshotState(), updatedAt: Date.now() }
      configPresets.value = configPresets.value.map((p, i) => i === idx ? updated : p)
      await persistConfigPresets(configPresets.value)
    }, 1000)
  }

  watch(
    [routingConfig, splitConfig, isSmartLatchActive, smartLatchMaxNotes, smartLatchFadeTime],
    _scheduleConfigAutoSave,
    { deep: true }
  )

  watch(uid, async (newUid) => {
    const defaultConfig = { registrations: {}, globalThruEnabled: true, thruFilters: { notes: true, cc: true } }
    if (!newUid) {
      setMidiChannel(1)
      setMidiInputChannel(-1)
      setSendClock(false)
      setSyncMidiTransport(false)
      setSyncSequencerTransport(false)
      setSyncChordProgTransport(false)
      isSmartLatchActive.value = false
      smartLatchMaxNotes.value = 4
      smartLatchReplaceMode.value = true
      smartLatchFadeTime.value = 0
      splitConfig.value = defaultSplit()
      routingConfig.value = defaultConfig
      activeConfigPresetId.value = null
      configPresets.value = []
    } else {
      setMidiChannel(parseInt(localStorage.getItem(userKey(LS_CHANNEL)) || '1'))
      setMidiInputChannel(parseInt(localStorage.getItem(userKey(LS_IN_CHANNEL)) || '-1'))
      setSendClock(localStorage.getItem(userKey(LS_SEND_CLOCK)) === 'true')
      setSyncMidiTransport(localStorage.getItem(userKey(LS_SYNC_TRANSPORT)) === 'true')
      setSyncSequencerTransport(localStorage.getItem(userKey(LS_SYNC_SEQUENCER_TRANSPORT)) === 'true')
      setSyncChordProgTransport(localStorage.getItem(userKey(LS_SYNC_CHORDPROG_TRANSPORT)) === 'true')
      isSmartLatchActive.value = localStorage.getItem(userKey('SYCORE_SMARTLATCH_ACTIVE')) === 'true'
      smartLatchMaxNotes.value = parseInt(localStorage.getItem(userKey('SYCORE_SMARTLATCH_MAX')) || '4')
      smartLatchReplaceMode.value = localStorage.getItem(userKey('SYCORE_SMARTLATCH_REPLACE')) !== 'false'
      smartLatchFadeTime.value = parseInt(localStorage.getItem(userKey('SYCORE_SMARTLATCH_FADE')) || '0')
      try {
        const raw = localStorage.getItem(userKey('SYCORE_KEYBOARD_SPLIT'))
        splitConfig.value = raw ? { ...defaultSplit(), ...JSON.parse(raw) } : defaultSplit()
      } catch { splitConfig.value = defaultSplit() }
      try {
        const saved = localStorage.getItem(userKey('SYCORE_ADVANCED_MIDI_ROUTING'))
        routingConfig.value = saved ? JSON.parse(saved) : defaultConfig
      } catch { routingConfig.value = defaultConfig }
      activeConfigPresetId.value = localStorage.getItem(userKey(LS_ACTIVE_CONFIG_PRESET)) || null
      await loadConfigPresets()
    }
  })

  return {
    midiReady, outputs, inputs,
    midiChannel, midiInputChannel,
    isDeviceConnected, broadcastMode, routingMatrix,
    init, refreshDevices,
    setMidiChannel, setMidiInputChannel,
    setRouting, toggleRouting, toggleBroadcastMode,
    sendProgramChange, sendCC, sendNRPN, sendAllCCs, sendControlValue,
    sendNoteOn, sendNoteOff, sendPitchBend,
    allNotesOff, panic, startClock, stopClock, setBpm, sendStart, sendStop, sendContinue,
    incomingBpm, sysexEnabled, toggleSysEx,
    sendClock, setSendClock, currentBpm,
    syncMidiTransport, setSyncMidiTransport,
    syncSequencerTransport, setSyncSequencerTransport,
    syncChordProgTransport, setSyncChordProgTransport,
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
    splitConfig,
    setSplitConfig,
    configPresets,
    activeConfigPresetId,
    loadConfigPresets,
    saveConfigPreset,
    loadConfigPreset,
    deleteConfigPreset,
    MidiSource
  }
})
