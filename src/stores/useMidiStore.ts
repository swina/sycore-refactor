import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { midiService, MidiSource } from '@/core/midi/midi-service'
import { deviceRegistry } from '@/core/midi/DeviceRegistry'
import { FIELD_TO_CC } from '@/constants/s1-config'
import { useAuthStore } from './useAuthStore'
import { userKey } from '@/lib/userKey'
import { useMappingStore } from './useMappingStore'
import { useArpStore } from './useArpStore'
import {
  loadConfigPresets as fetchConfigPresets,
  persistConfigPresets,
  createConfigPreset,
  AUTOSAVE_CONFIG_ID,
  type MidiConfigSnapshot,
  type SmartLatchConfig,
} from '@/lib/midi-config-presets'
import type { DeviceRegistration, RoutingConfig, SplitConfig, VirtualRegistration, MidiSource as MidiSourceType, InputRouteEntry } from '@/types/midi'

// ---------------------------------------------------------------------------
// LocalStorage keys
// ---------------------------------------------------------------------------

const LS_CHANNEL = 'midiChannel'
const LS_ACTIVE_CONFIG_PRESET = 'SYCORE_ACTIVE_CONFIG_PRESET'
const LS_IN_CHANNEL = 'midiInputChannel'
const LS_SEND_CLOCK = 'midiSendClock'
const LS_SYNC_TRANSPORT = 'midiSyncTransport'
const LS_SYNC_SEQUENCER_TRANSPORT = 'midiSyncSequencerTransport'
const LS_SYNC_CHORDPROG_TRANSPORT = 'midiSyncChordProgTransport'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultSplit(): SplitConfig {
  return {
    enabled: false,
    splitNote: 60,
    lowDevice: '',
    highDevice: '',
    lowTranspose: 0,
    highTranspose: 0,
  }
}

function defaultRegistration(name = ''): DeviceRegistration {
  return {
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
    midiThru: true,
    velocityMin: 0,
    velocityMax: 127,
    velocityMap: 'linear',
    receiveSyncIn: false,
  }
}

function defaultRoutingConfig(): RoutingConfig {
  return {
    registrations: {},
    globalThruEnabled: true,
    thruFilters: { notes: true, cc: true },
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useMidiStore = defineStore('midi', () => {
  const authStore = useAuthStore()
  const uid = computed(() => authStore.user?.uid)

  // ── State ────────────────────────────────────────────────────────────────
  const midiReady = ref(false)
  const outputs = ref<MIDIOutput[]>([])
  const inputs = ref<MIDIInput[]>([])
  const incomingBpm = ref(0)
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
  let initialSplit = defaultSplit()
  try {
    const raw = localStorage.getItem(userKey('SYCORE_KEYBOARD_SPLIT'))
    if (raw) initialSplit = { ...defaultSplit(), ...JSON.parse(raw) }
  } catch {}
  const splitConfig = ref<SplitConfig>(initialSplit)

  watch(splitConfig, (val) => {
    localStorage.setItem(userKey('SYCORE_KEYBOARD_SPLIT'), JSON.stringify(val))
    midiService.setSplitConfig(val.enabled ? val : null)
  }, { deep: true, immediate: true })

  function setSplitConfig(patch: Partial<SplitConfig>) {
    splitConfig.value = { ...splitConfig.value, ...patch }
  }

  // Advanced Routing Config
  let initialConfig: RoutingConfig = defaultRoutingConfig()
  try {
    const saved = localStorage.getItem(userKey('SYCORE_ADVANCED_MIDI_ROUTING'))
    if (saved) initialConfig = JSON.parse(saved)
  } catch {
    console.error('[MIDI Store] Failed to parse routing config')
  }
  const routingConfig = ref<RoutingConfig>(initialConfig)

  // Source-based Routing Matrix
  const broadcastMode = ref(midiService.getBroadcastMode())
  const initialMatrix: Record<string, string[]> = {
    [MidiSource.SEQUENCER]: midiService.getRouting(MidiSource.SEQUENCER),
    [MidiSource.KEYBOARD]: midiService.getRouting(MidiSource.KEYBOARD),
    [MidiSource.ARP]: midiService.getRouting(MidiSource.ARP),
    [MidiSource.UI]: midiService.getRouting(MidiSource.UI),
    [MidiSource.TRANSPORT]: midiService.getRouting(MidiSource.TRANSPORT),
  }
  try {
    const rawMatrix = localStorage.getItem(userKey('S1_MIDI_ROUTING'))
    if (rawMatrix) {
      const data = JSON.parse(rawMatrix)
      Object.keys(data).forEach(key => {
        initialMatrix[key] = midiService.getRouting(key)
      })
    }
  } catch {}
  const routingMatrix = ref<Record<string, string[]>>(initialMatrix)

  // Device → App input routing (MIDI FLOW's "MIDI IN to apps" feature).
  // Keyed by input device name — the inverse direction of routingMatrix.
  let initialInputRouting: Record<string, InputRouteEntry[]> = {}
  try {
    const rawInputRouting = localStorage.getItem(userKey('SYCORE_INPUT_ROUTING'))
    if (rawInputRouting) initialInputRouting = JSON.parse(rawInputRouting)
  } catch {}
  const inputRouting = ref<Record<string, InputRouteEntry[]>>(initialInputRouting)

  // ── Virtual Instruments ──────────────────────────────────────────────────
  const VIRTUAL_INSTRUMENTS_KEY = 'S1_VIRTUAL_INSTRUMENTS'

  function loadVirtualInstruments(): VirtualRegistration[] {
    try {
      const raw = localStorage.getItem(userKey(VIRTUAL_INSTRUMENTS_KEY))
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  }

  function persistVirtualInstruments() {
    try {
      localStorage.setItem(userKey(VIRTUAL_INSTRUMENTS_KEY), JSON.stringify(virtualInstruments.value))
    } catch {}
  }

  const virtualInstruments = ref<VirtualRegistration[]>(loadVirtualInstruments())

  function addVirtualInstrument(name: string, midiOutputPort?: string) {
    if (!name || virtualInstruments.value.some(v => v.name === name)) return
    virtualInstruments.value.push({
      name,
      channel: 0,
      bankMsb: 0,
      bankLsb: 0,
      program: 0,
      midiOutputPort: midiOutputPort ?? '',
    })
    persistVirtualInstruments()
    // Register with the MIDI service — forward data to the real MIDI output port
    midiService.registerVirtualOutput(name, (data) => {
      const v = virtualInstruments.value.find(x => x.name === name)
      if (v && v.midiOutputPort) {
        midiService.sendRawToDeviceByName(v.midiOutputPort, data)
      }
    })
    // Add a registration in the routing config so it behaves like a real device
    if (!routingConfig.value.registrations[name]) {
      addRegistration(name)
    }
    refreshDevices()
  }

  function removeVirtualInstrument(name: string) {
    virtualInstruments.value = virtualInstruments.value.filter(v => v.name !== name)
    persistVirtualInstruments()
    midiService.unregisterVirtualOutput(name)
    removeRegistration(name)
    refreshDevices()
  }

  function updateVirtualInstrument(name: string, data: Partial<VirtualRegistration>) {
    const idx = virtualInstruments.value.findIndex(v => v.name === name)
    if (idx < 0) return
    virtualInstruments.value[idx] = { ...virtualInstruments.value[idx], ...data }
    persistVirtualInstruments()
  }

  // Register all virtual instruments with the MIDI service on init
  function registerAllVirtualInstruments() {
    virtualInstruments.value.forEach(v => {
      midiService.registerVirtualOutput(v.name, (data) => {
        if (v.midiOutputPort) {
          midiService.sendRawToDeviceByName(v.midiOutputPort, data)
        }
      })
    })
  }

  // ── Watchers ─────────────────────────────────────────────────────────────
  watch(routingConfig, (newVal) => {
    if (!newVal || !newVal.registrations) return
    localStorage.setItem(userKey('SYCORE_ADVANCED_MIDI_ROUTING'), JSON.stringify(newVal))
    midiService.setRoutingConfig(JSON.parse(JSON.stringify(newVal)))
  }, { deep: true, immediate: true })

  watch(inputRouting, (newVal) => {
    localStorage.setItem(userKey('SYCORE_INPUT_ROUTING'), JSON.stringify(newVal))
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

  // ── Computed ─────────────────────────────────────────────────────────────
  const isDeviceConnected = computed(() => outputs.value.length > 0)

  // ── Smart Latch actions ──────────────────────────────────────────────────

  function toggleSmartLatch(active?: boolean) {
    if (typeof active === 'boolean') isSmartLatchActive.value = active
    else isSmartLatchActive.value = !isSmartLatchActive.value
    localStorage.setItem(userKey('SYCORE_SMARTLATCH_ACTIVE'), String(isSmartLatchActive.value))
  }

  function toggleDeviceLatch(deviceName: string) {
    const reg = routingConfig.value.registrations[deviceName]
    if (reg) {
      reg.smartLatch = !reg.smartLatch
      saveRoutingConfig()
    }
  }

  // ── Device registration ──────────────────────────────────────────────────

  function addRegistration(name: string) {
    if (!name || routingConfig.value.registrations[name]) return
    routingConfig.value.registrations[name] = defaultRegistration(name)
    saveRoutingConfig()
  }

  function removeRegistration(name: string) {
    if (routingConfig.value.registrations[name]) {
      delete routingConfig.value.registrations[name]
      saveRoutingConfig()
    }
  }

  function clearRegistrations() {
    routingConfig.value.registrations = {}
    saveRoutingConfig()
  }

  function updateRegistration(name: string, field: string, value: any) {
    if (routingConfig.value.registrations[name]) {
      (routingConfig.value.registrations[name] as any)[field] = value
      saveRoutingConfig()
    }
  }

  function saveRoutingConfig() {
    routingConfig.value = { ...routingConfig.value }
  }

  // ── Device refresh ───────────────────────────────────────────────────────

  function refreshDevices() {
    outputs.value = midiService.getOutputs() as MIDIOutput[]
    inputs.value = midiService.getInputs() as MIDIInput[]

    deviceRegistry.sync(inputs.value, outputs.value)

    broadcastMode.value = midiService.getBroadcastMode()
    Object.keys(routingMatrix.value).forEach(source => {
      routingMatrix.value[source] = midiService.getRouting(source)
    })
  }

  // ── Init ─────────────────────────────────────────────────────────────────

  async function init(): Promise<boolean> {
    const ok = await midiService.init()
    midiReady.value = ok
    if (!ok) return midiReady.value

    refreshDevices()
    registerAllVirtualInstruments()

    midiService.addStateChangeListener(() => refreshDevices())

    midiService.addClockBpmListener((bpm: number) => {
      incomingBpm.value = Math.round(bpm * 10) / 10
    })

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

  // ── MIDI channel ─────────────────────────────────────────────────────────

  function setMidiChannel(ch: number) {
    midiChannel.value = ch
    midiService.setGlobalChannel(ch - 1)
    localStorage.setItem(userKey(LS_CHANNEL), String(ch))
  }

  function setMidiInputChannel(ch: number) {
    midiInputChannel.value = ch
    localStorage.setItem(userKey(LS_IN_CHANNEL), String(ch))
  }

  // ── Clock / Transport ────────────────────────────────────────────────────

  function setSendClock(enabled: boolean) {
    sendClock.value = enabled
    localStorage.setItem(userKey(LS_SEND_CLOCK), String(enabled))
    if (enabled) {
      midiService.setBpm(currentBpm.value)
      midiService.startClock()
    } else {
      midiService.stopClock()
    }
  }

  function setSyncMidiTransport(enabled: boolean) {
    syncMidiTransport.value = enabled
    localStorage.setItem(userKey(LS_SYNC_TRANSPORT), String(enabled))
  }

  function setSyncSequencerTransport(enabled: boolean) {
    syncSequencerTransport.value = enabled
    localStorage.setItem(userKey(LS_SYNC_SEQUENCER_TRANSPORT), String(enabled))
  }

  function setSyncChordProgTransport(enabled: boolean) {
    syncChordProgTransport.value = enabled
    localStorage.setItem(userKey(LS_SYNC_CHORDPROG_TRANSPORT), String(enabled))
  }

  function toggleGlobalTransport() {
    if (isTransportPlaying.value) sendStop()
    else sendStart()
  }

  // ── MIDI Send ────────────────────────────────────────────────────────────

  function sendProgramChange(pcValue: number, source: MidiSourceType = MidiSource.UI) {
    const programNumber = Math.max(0, Math.min(127, pcValue - 1))
    midiService.sendProgramChange(programNumber, 15, source)
  }

  function setRouting(source: string, outputNames: string[]) {
    routingMatrix.value[source] = outputNames
    midiService.setRouting(source, outputNames)
  }

  function toggleRouting(source: string, outputName: string) {
    midiService.toggleRouting(source, outputName)
    routingMatrix.value[source] = midiService.getRouting(source)
  }

  function setInputRouting(deviceName: string, entries: InputRouteEntry[]) {
    if (entries.length === 0) {
      // Nothing to clear — skip the reactive write. finish() calls this
      // unconditionally for every canvas node on every edit, so avoiding a
      // no-op churn here matters.
      if (!(deviceName in inputRouting.value)) return
      const next = { ...inputRouting.value }
      delete next[deviceName]
      inputRouting.value = next
    } else {
      inputRouting.value[deviceName] = entries
    }
  }

  // No explicit routing configured for a source yet = legacy "open to
  // everything" default — preserves zero-config behavior for every app that
  // already worked without MIDI FLOW, until the user wires at least one
  // explicit cable for that specific source, at which point it becomes
  // exclusive to what's wired. `sourceKey` is a hardware/virtual device
  // name for device→app routing, or another app's MidiSource id for
  // app-to-app routing — inputRouting is just string-keyed, so both share
  // this one function and one data model.
  function isDeviceRoutedToApp(sourceKey: string, appSourceId: string, note?: number): boolean {
    const entries = inputRouting.value[sourceKey]
    if (!entries || entries.length === 0) return true
    const entry = entries.find(e => e.app === appSourceId)
    if (!entry) return false
    if (note == null || !entry.filter) return true
    const lo = entry.filter.lowNote  ?? 0
    const hi = entry.filter.highNote ?? 127
    return note >= lo && note <= hi
  }

  // ── App-to-app note routing (MIDI FLOW app→app cables) ────────────────────
  // Apps generate notes via sendNoteOn/sendNoteOff below, which is a separate
  // pipeline from midiService.addNoteListener (that one only ever sees real/
  // virtual MIDI *input ports* — hardware controllers, not another app's
  // internally-generated notes). This is the missing link: any app's send
  // also notifies these listeners, tagged with its MidiSource id as the
  // "source", so a downstream app can gate on it via isDeviceRoutedToApp
  // exactly like it already does for a physical device's inputId.
  type AppNoteListener = (type: 'on' | 'off', note: number, velocity: number, channel: number, sourceApp: string) => void
  const _appNoteListeners: AppNoteListener[] = []

  function addAppNoteListener(cb: AppNoteListener): () => void {
    _appNoteListeners.push(cb)
    return () => {
      const idx = _appNoteListeners.indexOf(cb)
      if (idx !== -1) _appNoteListeners.splice(idx, 1)
    }
  }

  function notifyAppNoteListeners(type: 'on' | 'off', note: number, velocity: number, channel: number, sourceApp: string) {
    _appNoteListeners.forEach(l => l(type, note, velocity, channel, sourceApp))
  }

  function toggleBroadcastMode() {
    midiService.toggleBroadcastMode()
    broadcastMode.value = midiService.getBroadcastMode()
  }

  function sendCC(cc: number, value: number, channel: number | null = null, source: MidiSourceType = MidiSource.UI, skipDeviceId: string | null = null) {
    const targetChannel = channel !== null ? channel - 1 : midiChannel.value - 1
    midiService.sendCC(cc, value, targetChannel, source, skipDeviceId)
  }

  function sendNRPN(param: number, value: number, channel: number | null = null, source: MidiSourceType = MidiSource.UI) {
    const targetChannel = channel !== null ? channel - 1 : midiChannel.value - 1
    midiService.sendNRPN(param, value, targetChannel, source)
  }

  function sendAllCCs(ccMap: Record<number, number>, nrpnCCs: number[], source: MidiSourceType = MidiSource.UI) {
    midiService.sendAllCCs(ccMap, midiChannel.value - 1, nrpnCCs, source)
  }

  function sendNoteOn(note: number, velocity = 100, channel: number | null = null, source: MidiSourceType = MidiSource.UI, skipDeviceId: string | null = null) {
    const targetChannel = channel !== null ? channel - 1 : midiChannel.value - 1
    midiService.sendNoteOn(note, velocity, targetChannel, source, skipDeviceId)
    const mappingStore = useMappingStore()
    mappingStore.handleVelocity(velocity, targetChannel)
    notifyAppNoteListeners('on', note, velocity, targetChannel, source)
  }

  function sendNoteOff(note: number, velocity = 0, channel: number | null = null, source: MidiSourceType = MidiSource.UI, skipDeviceId: string | null = null) {
    const targetChannel = channel !== null ? channel - 1 : midiChannel.value - 1
    midiService.sendNoteOff(note, velocity, targetChannel, source, skipDeviceId)
    notifyAppNoteListeners('off', note, velocity, targetChannel, source)
  }

  function sendPitchBend(value: number, channel: number | null = null, source: MidiSourceType = MidiSource.UI, skipDeviceId: string | null = null) {
    const targetChannel = channel !== null ? channel - 1 : midiChannel.value - 1
    midiService.sendPitchBend(value, targetChannel, source, skipDeviceId)
  }

  function allNotesOff(channel: number | null = null) {
    const targetChannel = channel !== null ? channel - 1 : midiChannel.value - 1
    midiService.allNotesOff(targetChannel)
  }

  function sendControlValue(field: string, value: number, source: MidiSourceType = MidiSource.UI) {
    const cc = (FIELD_TO_CC as Record<string, number>)[field]
    if (cc !== undefined) {
      sendCC(cc, value, null, source)
    }
  }

  function startClock() { if (sendClock.value) midiService.startClock() }
  function stopClock() { midiService.stopClock() }
  function setBpm(bpm: number) { midiService.setBpm(bpm) }

  // Single choke point for a global tempo change — fans out to every BPM
  // copy in the app (arpStore.arpBpm, currentBpm, outgoing MIDI clock timing)
  // so callers don't have to remember to touch each one by hand. Sequencer
  // components (StepSequencer/ChordProgSequencer/DrumMachine) each already
  // watch arpStore.arpBpm or currentBpm and retune their own Tone.js
  // transport from that, so this alone is enough to keep everything in sync.
  function setGlobalBpm(bpm: number) {
    const clamped = Math.round(Math.max(20, Math.min(300, bpm)))
    useArpStore().arpBpm = clamped
    currentBpm.value = clamped
    midiService.setBpm(clamped)
  }

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

  // ── Config Presets ──────────────────────────────────────────────────────

  const configPresets = ref<MidiConfigSnapshot[]>([])
  const activeConfigPresetId = ref<string | null>(localStorage.getItem(userKey(LS_ACTIVE_CONFIG_PRESET)) || null)

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
        active: isSmartLatchActive.value,
        maxNotes: smartLatchMaxNotes.value,
        replaceMode: smartLatchReplaceMode.value,
        fadeTime: smartLatchFadeTime.value,
      },
      activeMappingPresetId: mappingStore.activePresetId ?? null,
      splitConfig: JSON.parse(JSON.stringify(splitConfig.value)),
      midiChannel: midiChannel.value,
      midiInputChannel: midiInputChannel.value,
      sendClock: sendClock.value,
      syncMidiTransport: syncMidiTransport.value,
      syncSequencerTransport: syncSequencerTransport.value,
      syncChordProgTransport: syncChordProgTransport.value,
    }
  }

  async function saveConfigPreset(name: string): Promise<string | undefined> {
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

  async function loadConfigPreset(id: string) {
    const preset = configPresets.value.find(p => p.id === id)
    if (!preset) return

    if (preset.midiChannel !== undefined) setMidiChannel(preset.midiChannel)
    if (preset.midiInputChannel !== undefined) setMidiInputChannel(preset.midiInputChannel)
    if (preset.sendClock !== undefined) setSendClock(preset.sendClock)
    if (preset.syncMidiTransport !== undefined) setSyncMidiTransport(preset.syncMidiTransport)
    if (preset.syncSequencerTransport !== undefined) setSyncSequencerTransport(preset.syncSequencerTransport)
    if (preset.syncChordProgTransport !== undefined) setSyncChordProgTransport(preset.syncChordProgTransport)

    if (preset.smartLatch) {
      isSmartLatchActive.value = preset.smartLatch.active
      smartLatchMaxNotes.value = preset.smartLatch.maxNotes
      smartLatchReplaceMode.value = preset.smartLatch.replaceMode
      smartLatchFadeTime.value = preset.smartLatch.fadeTime
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

  async function deleteConfigPreset(id: string) {
    configPresets.value = configPresets.value.filter(p => p.id !== id)
    if (activeConfigPresetId.value === id) {
      activeConfigPresetId.value = null
      localStorage.removeItem(userKey(LS_ACTIVE_CONFIG_PRESET))
    }
    await persistConfigPresets(configPresets.value)
  }

  // Debounced auto-save
  let _cfgAutoSaveTimer: ReturnType<typeof setTimeout> | null = null

  function _scheduleConfigAutoSave() {
    clearTimeout(_cfgAutoSaveTimer!)
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
    [routingConfig, splitConfig, isSmartLatchActive, smartLatchMaxNotes, smartLatchFadeTime] as const,
    _scheduleConfigAutoSave,
    { deep: true },
  )

  // ── Auth watcher ─────────────────────────────────────────────────────────

  watch(uid, async (newUid) => {
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
      routingConfig.value = defaultRoutingConfig()
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
        routingConfig.value = saved ? JSON.parse(saved) : defaultRoutingConfig()
      } catch { routingConfig.value = defaultRoutingConfig() }
      activeConfigPresetId.value = localStorage.getItem(userKey(LS_ACTIVE_CONFIG_PRESET)) || null
      await loadConfigPresets()
    }
  })

  return {
    midiReady, outputs, inputs,
    midiChannel, midiInputChannel,
    isDeviceConnected, broadcastMode, routingMatrix,
    inputRouting, setInputRouting, isDeviceRoutedToApp, addAppNoteListener,
    init, refreshDevices,
    setMidiChannel, setMidiInputChannel,
    setRouting, toggleRouting, toggleBroadcastMode,
    sendProgramChange, sendCC, sendNRPN, sendAllCCs, sendControlValue,
    sendNoteOn, sendNoteOff, sendPitchBend,
    allNotesOff, panic, startClock, stopClock, setBpm, setGlobalBpm, sendStart, sendStop, sendContinue,
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
    MidiSource,
    // Virtual Instruments
    virtualInstruments,
    addVirtualInstrument,
    removeVirtualInstrument,
    updateVirtualInstrument,
  }
})