<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { X, Minus, Music2, Search, Send, ChevronDown, AlertTriangle, Loader2, Zap, Layers, Star, Save, RotateCcw, Trash2, Plus, BookOpen, Radio, Upload, FolderOpen, LayoutGrid } from 'lucide-vue-next'
import { useMidiStore } from '@/stores/useMidiStore'
import { userKey } from '@/lib/userKey'
import { usePresetStore } from '@/stores/usePresetStore'
import { useUserBanksStore } from '@/stores/useUserBanksStore'
import { useUiStore } from '@/stores/useUiStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { parseMfprojz } from '@/composables/useMfprojzParser'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'
import { MidiSource, midiService } from '@/core/midi/MidiService'
import catalogIndex from '@/data/program_change/program_change.json'

const emit = defineEmits(['close'])

const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront } = useDraggableResizable({
  storageKey: 'SYCORE_POS_DEVICE_PC',
  minimizeLabel: 'Device PC',
  initialWidth: 900,
  initialHeight: 700,
  zIndex: 100,
})

const midiStore      = useMidiStore()
const uiStore        = useUiStore()
watch(() => uiStore.isDeviceProgramChangePanelOpen, (v) => { if (v) bringToFront() })
const presetStore    = usePresetStore()
const userBanksStore = useUserBanksStore()
const mappingStore   = useMappingStore()
const { openMenu }   = useMidiContextMenu()

// ── Device list (left column) — only PC-enabled devices ────────
const devices = computed(() => {
  if (!midiStore.routingConfig?.registrations) return []
  return Object.values(midiStore.routingConfig.registrations)
    .filter(r => r.outEnabled && r.pcEnabled)
    .map(r => ({ ...r, isOnline: midiStore.outputs.some(o => o.name === r.name) }))
    .sort((a, b) => b.isOnline - a.isOnline || a.name.localeCompare(b.name))
})

const selectedDeviceName = ref('')

// Auto-select first online PC-enabled device on open
onMounted(() => {
  const first = devices.value.find(d => d.pcEnabled && d.isOnline) ?? devices.value[0]
  if (first) selectedDeviceName.value = first.name
  loadSets()
})

const selectedReg = computed(() =>
  selectedDeviceName.value ? midiStore.routingConfig.registrations[selectedDeviceName.value] : null
)

const isDeviceOffline = computed(() =>
  selectedDeviceName.value && !midiStore.outputs.some(o => o.name === selectedDeviceName.value)
)

// ── UI/Preview instrument detection ────────────────────────────
// A device routed from MidiSource.UI is the app's primary instrument.
// For these, we show the app Sound Library instead of a catalog.
const isUiDevice = computed(() => {
  if (!selectedDeviceName.value) return false
  const uiRoutes = midiStore.routingMatrix?.[MidiSource.UI] ?? []
  return uiRoutes.includes(selectedDeviceName.value)
})

// ── UI-mode: history preset browser ────────────────────────────
const uiSearchQuery    = ref('')
const uiCategoryFilter = ref('')

const uiCategories = computed(() =>
  [...new Set(presetStore.history.map(p => p.category).filter(Boolean))].sort()
)

const uiFilteredPresets = computed(() => {
  let list = presetStore.history
  if (uiCategoryFilter.value) list = list.filter(p => p.category === uiCategoryFilter.value)
  if (uiSearchQuery.value.trim()) {
    const q = uiSearchQuery.value.toLowerCase()
    list = list.filter(p => p.name?.toLowerCase().includes(q))
  }
  return list
})

watch(selectedDeviceName, () => {
  uiSearchQuery.value = ''
  uiCategoryFilter.value = ''
})

function selectHistoryPreset(preset) {
  presetStore.recallPreset(preset, false)
}

// ── Catalog match ───────────────────────────────────────────────
const catalogDevice = computed(() => {
  const dn = selectedDeviceName.value?.toLowerCase() ?? ''
  if (!dn) return null
  return Object.keys(catalogIndex).find(k =>
    dn.includes(k.toLowerCase()) || k.toLowerCase().includes(dn)
  ) ?? null
})

const catalogBanks = computed(() => {
  if (!catalogDevice.value) return []
  return Object.keys(catalogIndex[catalogDevice.value])
})

const userBanks = computed(() =>
  userBanksStore.getBanksForDevice(selectedDeviceName.value).map(b => b.name)
)

const availableBanks = computed(() => [...catalogBanks.value, ...userBanks.value])

function isUserBank(bankName) {
  return userBanksStore.hasBank(selectedDeviceName.value, bankName)
}

// ── .mfprojz import ────────────────────────────────────────────
const importInput      = ref(null)   // hidden <input type="file">
const isImporting      = ref(false)
const importError      = ref('')
const showImportRename = ref(false)
const pendingPresets   = ref([])
const pendingBankName  = ref('')

function triggerImport() {
  importError.value = ''
  importInput.value?.click()
}

async function onImportFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  isImporting.value = true
  importError.value = ''
  try {
    const presets = await parseMfprojz(file)
    // Default bank name = filename without extension
    pendingBankName.value = file.name.replace(/\.mfprojz$/i, '')
    pendingPresets.value  = presets
    showImportRename.value = true
  } catch (e) {
    importError.value = e.message ?? 'Failed to parse file.'
  } finally {
    isImporting.value = false
    event.target.value = ''
  }
}

function confirmImport() {
  const name = pendingBankName.value.trim() || 'Imported Bank'
  userBanksStore.addBank(selectedDeviceName.value, name, pendingPresets.value)
  selectedBank.value = name
  showImportRename.value = false
  pendingPresets.value   = []
}

function cancelImport() {
  showImportRename.value = false
  pendingPresets.value   = []
}

function deleteUserBank(bankName) {
  if (selectedBank.value === bankName) { selectedBank.value = ''; sounds.value = [] }
  userBanksStore.removeBank(selectedDeviceName.value, bankName)
}

const selectedBank = ref('')
watch([catalogDevice, selectedDeviceName], () => {
  // restore last-used bank if available, else reset
  const reg = selectedReg.value
  if (reg?.pcBank && availableBanks.value.includes(reg.pcBank)) {
    selectedBank.value = reg.pcBank
  } else {
    selectedBank.value = ''
    sounds.value = []
  }
})

const bankConfig = computed(() => {
  if (!catalogDevice.value || !selectedBank.value) return null
  if (isUserBank(selectedBank.value)) return {
    msb: false, lsb: false, category_field: 'category',
    program_field: 'program', program_base: -1,
  }
  return catalogIndex[catalogDevice.value][selectedBank.value]
})

// ── Lazy-load sound list ────────────────────────────────────────
const sounds    = ref([])
const isLoading = ref(false)

watch(selectedBank, async (bank) => {
  if (!bank) { sounds.value = []; return }

  // User-imported bank: load directly from store
  if (isUserBank(bank)) {
    sounds.value = userBanksStore.getPresets(selectedDeviceName.value, bank)
    return
  }

  if (!bankConfig.value) { sounds.value = []; return }
  isLoading.value = true
  try {
    const match = bankConfig.value.data.match(/^\.\/([^/]+)\/(.+)$/)
    if (!match) throw new Error('Bad data path')
    const [, folder, filename] = match
    const res = await fetch(`/data/program_change/${folder}/${filename}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    sounds.value = await res.json()
  } catch (e) {
    console.error('[DevicePCPanel] Failed to load sounds', e)
    sounds.value = []
  } finally {
    isLoading.value = false
  }
})

// ── Filters ─────────────────────────────────────────────────────
const searchQuery      = ref('')
const selectedCategory = ref('')

watch(selectedBank, () => { selectedCategory.value = ''; searchQuery.value = '' })

const categories = computed(() => {
  const field = bankConfig.value?.category_field ?? 'category'
  return [...new Set(sounds.value.map(s => s[field]))].filter(Boolean).sort()
})

const filteredSounds = computed(() => {
  let list = sounds.value
  if (selectedCategory.value) {
    const field = bankConfig.value?.category_field ?? 'category'
    list = list.filter(s => s[field] === selectedCategory.value)
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(s => s.name?.toLowerCase().includes(q))
  }
  return list
})

// ── Active sound tracking ───────────────────────────────────────
const activeSound = ref(null)
const lastSent    = ref(null)

watch(selectedDeviceName, () => { activeSound.value = null; lastSent.value = null })

// Scroll the preset list to the entry matching the device's current pcProgram/pcMsb.
// Uses the same progIdx formula as sendCatalogSound so bank offsets are respected.
function scrollToCurrentProgram() {
  const list = filteredSounds.value
  if (!list.length || !bankConfig.value) return
  const reg = selectedReg.value
  if (!reg) return

  const targetProg = reg.pcProgram ?? 0
  const targetMsb  = reg.pcMsb  ?? 0
  const pField = bankConfig.value.program_field ?? 'program'
  const base   = bankConfig.value.program_base  ?? 0

  const idx = list.findIndex(s => {
    const progIdx = (s[pField] ?? 0) + base
    const progNum = Math.max(0, Math.min(127, progIdx % 128))
    const msb     = bankConfig.value.msb ? (s.msb ?? 0) : Math.max(0, Math.floor(progIdx / 128))
    return progNum === targetProg && msb === targetMsb
  })
  if (idx < 0) return

  activeSound.value = list[idx]
  nextTick(() => {
    presetButtonsEl.value?.querySelectorAll('button')[idx]
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

// Auto-scroll when the sound list loads and no sound has been manually selected yet
watch(filteredSounds, (list, prev) => {
  if (list.length && !prev?.length && !activeSound.value) scrollToCurrentProgram()
})

// ── pcChannels persistence helper ──────────────────────────────
function recordChannelState(ch, program, bank, soundName, category, msb = 0, lsb = 0) {
  const reg = selectedReg.value
  if (!reg) return
  const updated = { ...(reg.pcChannels ?? {}), [ch]: { program, bank, soundName, category: category ?? '', msb, lsb } }
  midiStore.updateRegistration(selectedDeviceName.value, 'pcChannels', updated)
  midiStore.updateRegistration(selectedDeviceName.value, 'pcProgram', program)
  midiStore.updateRegistration(selectedDeviceName.value, 'pcMsb', msb)
  midiStore.updateRegistration(selectedDeviceName.value, 'pcLsb', lsb)
  midiStore.updateRegistration(selectedDeviceName.value, 'pcBank', bank)
}

// ── Current PC state (for display) ─────────────────────────────
const currentPcState = computed(() => {
  const reg = selectedReg.value
  if (!reg) return []
  const channels = reg.pcChannels ?? {}
  return Object.entries(channels)
    .map(([ch, info]) => ({ ch: parseInt(ch), ...info }))
    .sort((a, b) => a.ch - b.ch)
})

// ── Send from catalog ───────────────────────────────────────────
function selectSound(sound) {
  activeSound.value = sound
  sendCatalogSound(sound)
}

function sendCatalogSound(sound) {
  const reg = selectedReg.value
  if (!reg) return
  const port = midiStore.outputs.find(o => o.name === selectedDeviceName.value)
  if (!port) return

  const cfg    = bankConfig.value
  const ch     = reg.pcChannel ?? 0
  const pField = cfg?.program_field ?? 'program'
  const prog   = sound[pField] ?? 0

  // Normalize to 0-indexed absolute MIDI program number using program_base,
  // then derive bank MSB and within-bank PC consistently from the same index.
  // This avoids the old formula's bug at multiples of 128 (e.g. prog=128 gave
  // MSB=1,PC=0 instead of MSB=0,PC=127 for 1-indexed catalogs with base=-1).
  const progIdx = prog + (cfg.program_base ?? 0)           // 0-indexed absolute program
  const msb    = cfg.msb ? (sound.msb ?? 0) : Math.max(0, Math.floor(progIdx / 128))
  const lsb    = cfg.lsb ? (sound.lsb ?? 0) : 0
  const progNum = Math.max(0, Math.min(127, progIdx % 128))

  port.send([0xB0 | ch, 0,  msb])
  port.send([0xB0 | ch, 32, lsb])
  port.send([0xC0 | ch, progNum])

  lastSent.value = sound
  recordChannelState(ch, progNum, selectedBank.value, sound.name, sound[bankConfig.value?.category_field ?? 'category'], msb, lsb)
  showPcNotification(selectedDeviceName.value, sound.name, sound[bankConfig.value?.category_field ?? 'category'] ?? '')

  const msg = `[Device PC] → ${selectedDeviceName.value} ch${ch + 1}: MSB=${msb} LSB=${lsb} PC=${progNum} | ${sound.name}`
  if (window.SY_LOG) window.SY_LOG(msg); else console.log(msg)

  if (midiStore.sendClock) {
    setTimeout(() => midiStore.startClock(), 100)
  }
}

// ── Manual fallback ─────────────────────────────────────────────
const manualMsb  = ref(0)
const manualLsb  = ref(0)
const manualProg = ref(1)
const sendMsb    = ref(false)
const sendLsb    = ref(false)

function sendManual() {
  const reg = selectedReg.value
  if (!reg) return
  const port = midiStore.outputs.find(o => o.name === selectedDeviceName.value)
  if (!port) return
  const ch = reg.pcChannel ?? 0
  if (sendMsb.value) port.send([0xB0 | ch, 0,  manualMsb.value])
  if (sendLsb.value) port.send([0xB0 | ch, 32, manualLsb.value])
  const prog = Math.max(0, Math.min(127, manualProg.value - 1))
  port.send([0xC0 | ch, prog])
  recordChannelState(ch, prog, '', `PC ${manualProg.value}`)
  lastSent.value = { name: `PC ${manualProg.value}` }
  showPcNotification(selectedDeviceName.value, `PC ${manualProg.value}`)
}

// ── Channel helper ──────────────────────────────────────────────
function setChannel(ch) {
  midiStore.updateRegistration(selectedDeviceName.value, 'pcChannel', ch - 1)
}

// ── Preset list scroll (wheel + MIDI CC) ────────────────────────
const LS_SCROLL_CC    = 'SYCORE_PC_SCROLL_CC'
const presetListEl    = ref(null)
const presetButtonsEl = ref(null)

function loadScrollCC() {
  try { return JSON.parse(localStorage.getItem(userKey(LS_SCROLL_CC))) ?? null } catch { return null }
}

const scrollCCMap         = ref(loadScrollCC()) // { cc, channel, device } | null
const isLearningScrollCC  = ref(false)
const lastScrollCCVal     = ref(null)

function navigatePresetList(delta) {
  const list = filteredSounds.value
  if (!list.length) return
  const cur = activeSound.value
  const idx = cur ? list.findIndex(s => s.name === cur.name && (s.no ?? s.program) === (cur.no ?? cur.program)) : -1
  const next = Math.max(0, Math.min(list.length - 1, (idx < 0 ? 0 : idx) + delta))
  selectSound(list[next])
  nextTick(() => {
    presetButtonsEl.value?.querySelectorAll('button')[next]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

function onPresetListWheel(e) {
  e.preventDefault()
  e.stopPropagation()
  navigatePresetList(e.deltaY > 0 ? 1 : -1)
}

let _unsubScrollCC = null

function startScrollCCListener() {
  _unsubScrollCC?.()
  _unsubScrollCC = midiService.addRawListener((event) => {
    if (!event.data || event.data.length < 3) return
    const status  = event.data[0]
    const type    = status & 0xF0
    const channel = status & 0x0F
    if (type !== 0xB0) return
    const cc  = event.data[1]
    const val = event.data[2]

    // Always use CC#38 (NRPN Data Entry LSB) — handles lists > 127 items
    if (cc !== 38) return

    if (isLearningScrollCC.value) {
      const inputId = event.target?.id
      const device  = midiService.getInputs().find(i => i.id === inputId)?.name ?? null
      scrollCCMap.value = { cc: 38, channel, device }
      localStorage.setItem(userKey(LS_SCROLL_CC),JSON.stringify(scrollCCMap.value))
      isLearningScrollCC.value = false
      lastScrollCCVal.value = val
      return
    }

    const m = scrollCCMap.value
    if (!m) return
    if (m.device) {
      const inputId = event.target?.id
      const device  = midiService.getInputs().find(i => i.id === inputId)?.name ?? null
      if (device !== m.device) return
    }
    if (lastScrollCCVal.value !== null) {
      const delta = val - lastScrollCCVal.value
      if (delta !== 0) navigatePresetList(delta > 0 ? 1 : -1)
    }
    lastScrollCCVal.value = val
  })
}

function startScrollLearn() {
  isLearningScrollCC.value = true
  lastScrollCCVal.value = null
}

function cancelScrollLearn() {
  isLearningScrollCC.value = false
}

function clearScrollCC() {
  scrollCCMap.value = null
  lastScrollCCVal.value = null
  localStorage.removeItem(userKey(LS_SCROLL_CC))
}

let _pcNavHandler   = null
let _unsubDevMidi   = null

function _startDevMidiListener() {
  _unsubDevMidi?.()
  _unsubDevMidi = midiService.addRawListener((event) => {
    if (!event.data || event.data.length < 2) return
    const status  = event.data[0]
    const type    = status & 0xF0
    const channel = status & 0x0F
    const byte1   = event.data[1]
    const byte2   = event.data[2]

    // Incoming Program Change → show toast notification
    if (type === 0xC0) {
      const progNum = byte1
      const matchedDev = devices.value.find(d => {
        const reg = midiStore.routingConfig.registrations[d.name]
        return reg?.pcEnabled && reg?.pcChannel === channel
      })
      if (matchedDev) {
        const reg = midiStore.routingConfig.registrations[matchedDev.name]
        const storedInfo = reg?.pcChannels?.[channel]
        const matched = storedInfo?.program === progNum ? storedInfo : null
        const name = matched?.soundName ?? `PC ${progNum + 1}`
        const category = matched?.category ?? ''
        showPcNotification(matchedDev.name, name, category)
      }
      return
    }

    if (event.data.length < 3) return

    const isCC   = type === 0xB0
    const isNote = type === 0x90 && byte2 > 0
    if (!isCC && !isNote) return
    if (isCC && byte2 === 0) return

    const inputId   = event.target?.id
    const inputPort = midiService.getInputs().find(i => i.id === inputId)
    const device    = inputPort?.name || null

    const keyParts = []
    if (device) keyParts.push(device)
    keyParts.push(`CH${channel + 1}`)
    keyParts.push(isNote ? `NOTE${byte1}` : `CC${byte1}`)
    const key = keyParts.join(':')

    const mapping = mappingStore.midiMappings[key]
    if (!mapping) return
    const paramName = typeof mapping === 'object' ? mapping.paramName : mapping
    if (!paramName?.startsWith('pc_dev_')) return

    const idx = parseInt(paramName.slice('pc_dev_'.length))
    if (!isNaN(idx) && idx >= 0 && idx < devices.value.length) {
      selectDevice(devices.value[idx].name)
    }
  })
}

onMounted(() => {
  startScrollCCListener()
  _startDevMidiListener()
  _pcNavHandler = e => navigatePresetList(e.detail?.delta ?? 1)
  window.addEventListener('device-pc-preset-navigate', _pcNavHandler)
})
onUnmounted(() => {
  _unsubScrollCC?.()
  _unsubDevMidi?.()
  if (_pcNavHandler) window.removeEventListener('device-pc-preset-navigate', _pcNavHandler)
  clearTimeout(_pcNotifTimer)
})

// ── PC Toast Notification ───────────────────────────────────────
function selectDevice(name) {
  selectedDeviceName.value = name
  const reg = midiStore.routingConfig.registrations[name]
  if (!reg) return
  const ch = reg.pcChannel ?? 0
  const chInfo = reg.pcChannels?.[ch]
  if (chInfo?.soundName) {
    showPcNotification(name, chInfo.soundName, chInfo.category ?? '')
  } else if (reg.pcProgram != null) {
    showPcNotification(name, `PC ${reg.pcProgram + 1}`)
  }
}

const pcNotification = ref({ visible: false, device: '', name: '', category: '' })
let _pcNotifTimer = null

function showPcNotification(device, name, category = '') {
  clearTimeout(_pcNotifTimer)
  pcNotification.value = { visible: true, device, name, category }
  _pcNotifTimer = setTimeout(() => { pcNotification.value.visible = false }, 3000)
}

// ── Performance Sets ────────────────────────────────────────────
const LS_PC_SETS = 'SYCORE_PC_PERFORMANCE_SETS'
const pcSets         = ref([])
const activeSetId    = ref(null)
const showSaveDialog = ref(false)
const newSetName     = ref('')
const newSetNameInput = ref(null)

function loadSets() {
  try {
    const raw = localStorage.getItem(userKey(LS_PC_SETS))
    if (raw) pcSets.value = JSON.parse(raw)
  } catch { pcSets.value = [] }
}

function persistSets() {
  localStorage.setItem(userKey(LS_PC_SETS),JSON.stringify(pcSets.value))
}

function openSaveDialog() {
  newSetName.value = ''
  showSaveDialog.value = true
  nextTick(() => newSetNameInput.value?.focus())
}

function saveCurrentSet() {
  const name = newSetName.value.trim()
  if (!name) return

  const snapshot = devices.value.map(dev => {
    const reg  = midiStore.routingConfig.registrations[dev.name]
    const isUi = (midiStore.routingMatrix?.[MidiSource.UI] ?? []).includes(dev.name)
    return {
      deviceName:     dev.name,
      pcChannel:      reg?.pcChannel ?? 0,
      pcBank:         reg?.pcBank    ?? '',
      pcProgram:      reg?.pcProgram ?? 0,
      pcMsb:          reg?.pcMsb ?? 0,
      pcLsb:          reg?.pcLsb ?? 0,
      pcChannels:     reg?.pcChannels ? JSON.parse(JSON.stringify(reg.pcChannels)) : {},
      isUiDevice:     isUi,
      lastPresetId:   isUi ? (presetStore.lastPreset?.id   ?? null) : null,
      lastPresetName: isUi ? (presetStore.lastPreset?.name ?? null) : null,
    }
  })

  pcSets.value = [{
    id:          Date.now().toString(),
    name,
    createdAt:   new Date().toISOString(),
    midiChannel: midiStore.midiChannel,
    devices:     snapshot,
  }, ...pcSets.value]

  persistSets()
  showSaveDialog.value = false
}

function recallSet(set) {
  activeSetId.value = set.id
  if (set.midiChannel) midiStore.setMidiChannel(set.midiChannel)
  set.devices.forEach(entry => {
    if (!midiStore.routingConfig.registrations[entry.deviceName]) return

    midiStore.updateRegistration(entry.deviceName, 'pcChannel',  entry.pcChannel)
    midiStore.updateRegistration(entry.deviceName, 'pcBank',     entry.pcBank)
    midiStore.updateRegistration(entry.deviceName, 'pcProgram',  entry.pcProgram)
    midiStore.updateRegistration(entry.deviceName, 'pcMsb',     entry.pcMsb ?? 0)
    midiStore.updateRegistration(entry.deviceName, 'pcLsb',     entry.pcLsb ?? 0)
    midiStore.updateRegistration(entry.deviceName, 'pcChannels', JSON.parse(JSON.stringify(entry.pcChannels)))

    if (entry.isUiDevice) {
      if (entry.lastPresetId) {
        const preset = presetStore.history.find(p => p.id === entry.lastPresetId)
        if (preset) presetStore.recallPreset(preset, false)
      }
    } else {
      const port = midiStore.outputs.find(o => o.name === entry.deviceName)
      if (!port) return
      const multiEntries = Object.entries(entry.pcChannels)
      if (multiEntries.length > 0) {
        multiEntries.forEach(([chStr, info]) => {
          const ch = parseInt(chStr)
          port.send([0xB0 | ch, 0,  info.msb ?? 0])
          port.send([0xB0 | ch, 32, info.lsb ?? 0])
          port.send([0xC0 | ch, info.program ?? 0])
        })
      } else {
        const ch = entry.pcChannel ?? 0
        port.send([0xB0 | ch, 0,  entry.pcMsb ?? 0])
        port.send([0xB0 | ch, 32, entry.pcLsb ?? 0])
        port.send([0xC0 | ch, entry.pcProgram ?? 0])
      }
    }
  })
  // Scroll the preset list to reflect the recalled program for the selected device
  nextTick(() => scrollToCurrentProgram())
}

function updateSet(id) {
  const snapshot = devices.value.map(dev => {
    const reg  = midiStore.routingConfig.registrations[dev.name]
    const isUi = (midiStore.routingMatrix?.[MidiSource.UI] ?? []).includes(dev.name)
    return {
      deviceName:     dev.name,
      pcChannel:      reg?.pcChannel ?? 0,
      pcBank:         reg?.pcBank    ?? '',
      pcProgram:      reg?.pcProgram ?? 0,
      pcMsb:          reg?.pcMsb ?? 0,
      pcLsb:          reg?.pcLsb ?? 0,
      pcChannels:     reg?.pcChannels ? JSON.parse(JSON.stringify(reg.pcChannels)) : {},
      isUiDevice:     isUi,
      lastPresetId:   isUi ? (presetStore.lastPreset?.id   ?? null) : null,
      lastPresetName: isUi ? (presetStore.lastPreset?.name ?? null) : null,
    }
  })
  pcSets.value = pcSets.value.map(s =>
    s.id === id ? { ...s, devices: snapshot, midiChannel: midiStore.midiChannel, updatedAt: new Date().toISOString() } : s
  )
  persistSets()
}

function deleteSet(id) {
  pcSets.value = pcSets.value.filter(s => s.id !== id)
  persistSets()
}

// ── Assign set to LPP performance pad ───────────────────────────
const LS_LPP_SETS    = 'SYCORE_LPP_SETS'
const assigningSetId = ref(null)
const lppSetPads     = ref([])   // mirrors LivePerformancePad's setPads from localStorage

function refreshLppPads() {
  try { lppSetPads.value = JSON.parse(localStorage.getItem(userKey(LS_LPP_SETS))) ?? [] }
  catch { lppSetPads.value = [] }
}

// setId → padIdx reverse map (null if not assigned)
const lppPadBySetId = computed(() => {
  const map = {}
  lppSetPads.value.forEach((pad, idx) => { if (pad?.setId) map[pad.setId] = idx })
  return map
})

function togglePadPicker(setId) {
  if (assigningSetId.value === setId) { assigningSetId.value = null; return }
  refreshLppPads()
  assigningSetId.value = setId
}

function assignToPad(setId, padIdx) {
  window.dispatchEvent(new CustomEvent('lpp-set-assign', { detail: { setId, padIdx } }))
  // Optimistic local update so the picker reflects the change instantly
  const pads = [...lppSetPads.value]
  while (pads.length < 16) pads.push({ setId: null, setName: null })
  for (let i = 0; i < pads.length; i++) {
    if (pads[i]?.setId === setId) pads[i] = { setId: null, setName: null }
  }
  pads[padIdx] = { setId, setName: pcSets.value.find(s => s.id === setId)?.name ?? '' }
  lppSetPads.value = pads
  assigningSetId.value = null
}
</script>

<template>
  <div class="overflow-hidden">
    <Transition name="performance" appear>
      <div class="bg-neutral-900 max-h-[94vh] border border-violet-500/30 rounded-xl overflow-hidden shadow-[0_0_50px_rgba(139,92,246,0.15)] flex flex-col" :style="panelStyle" v-show="!isMinimized">

        <!-- Header -->
        <div class="px-4 py-2 border-b border-neutral-800 flex items-center justify-between bg-gradient-to-r from-violet-950/40 to-transparent shrink-0 cursor-grab active:cursor-grabbing select-none" @mousedown="onDragStart">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <Music2 class="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h2 class="text-sm font-black uppercase tracking-[0.2em] text-white leading-none mb-1">MULTI SOUND</h2>
              <p class="text-[9px] font-mono text-violet-500/60 uppercase tracking-widest">Per-Device Bank & Preset Browser</p>
            </div>
          </div>
          <div class="flex items-center gap-1">
            <button @click="toggleMinimize" title="Minimize"
              class="p-2 rounded-full hover:bg-white/5 text-neutral-500 hover:text-yellow-400 transition-colors">
              <Minus class="w-4 h-4" />
            </button>
            <button @click="emit('close')" class="p-2 text-neutral-500 hover:text-white transition-colors rounded-full hover:bg-white/5">
              <X class="w-5 h-5" />
            </button>
          </div>
        </div>

        <!-- Body: two columns -->
        <div class="flex flex-1 overflow-hidden">

          <!-- ── LEFT: PC-enabled device list + Performance Sets ── -->
          <div class="w-64 shrink-0 border-r border-neutral-800 flex flex-col overflow-hidden">

            <!-- Device list (scrollable) -->
            <div class="flex-1 flex flex-col overflow-y-auto custom-scrollbar">
              <div class="px-4 py-3 border-b border-neutral-800 shrink-0">
                <span class="text-[8px] font-mono text-neutral-600 uppercase tracking-widest">PC Devices</span>
              </div>

              <div v-if="devices.length === 0" class="flex-1 flex flex-col items-center justify-center p-6 text-center gap-2">
                <p class="text-[10px] font-mono text-neutral-600 italic">No devices with PC enabled.</p>
                <p class="text-[9px] font-mono text-neutral-700">Enable PC on devices in MIDI Matrix.</p>
              </div>

              <button
                v-for="(dev, devIdx) in devices"
                :key="dev.name"
                @click="selectDevice(dev.name)"
                @contextmenu.prevent="openMenu($event, { name: 'pc_dev_' + devIdx, label: dev.name })"
                :class="[
                  'relative w-full text-left px-4 py-3 border-b border-neutral-800/60 transition-all',
                  selectedDeviceName === dev.name
                    ? 'bg-violet-500/10 border-l-2 border-l-violet-500'
                    : 'hover:bg-white/[0.03] border-l-2 border-l-transparent'
                ]"
              >
                <!-- MIDI learning indicator -->
                <span
                  v-if="mappingStore.learningParamName === 'pc_dev_' + devIdx"
                  class="absolute top-1 right-1 w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)] animate-pulse pointer-events-none"
                />
                <div class="flex items-center gap-2.5">
                  <div :class="['w-1.5 h-1.5 rounded-full shrink-0 mt-0.5', dev.isOnline ? 'bg-emerald-500' : 'bg-neutral-700']" />
                  <div class="flex flex-col min-w-0 flex-1">
                    <span class="text-[11px] font-bold text-white truncate leading-tight">{{ dev.name }}</span>
                    <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <template v-if="(midiStore.routingMatrix?.[MidiSource.UI] ?? []).includes(dev.name)">
                        <span class="text-[7px] font-black uppercase tracking-tighter px-1 py-0.5 rounded bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center gap-0.5">
                          <Layers class="w-2 h-2" />UI
                        </span>
                        <span class="text-[7px] font-mono text-neutral-500">{{ presetStore.lastPreset?.name ?? '—' }}</span>
                      </template>
                      <template v-else-if="dev.isMulti">
                        <span class="text-[7px] font-black uppercase tracking-tighter px-1 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">Multi</span>
                        <span v-if="Object.keys(dev.pcChannels ?? {}).length > 0" class="text-[7px] font-mono text-neutral-500">
                          {{ Object.keys(dev.pcChannels).length }} ch set
                        </span>
                      </template>
                      <template v-else>
                        <span v-if="Object.keys(dev.pcChannels ?? {}).length > 0" class="text-[7px] font-mono text-neutral-500">CH{{ (dev.pcChannel ?? 0) + 1 }}</span>
                        <span v-if="Object.keys(dev.pcChannels ?? {}).length > 0" class="text-[7px] font-black font-mono text-violet-400/70">
                          <template v-if="(dev.pcMsb ?? 0) > 0">B{{ dev.pcMsb }}·</template>PC{{ dev.pcProgram }}
                        </span>
                      </template>
                      <span v-if="!dev.isOnline" class="text-[7px] font-mono text-neutral-700 uppercase">offline</span>
                    </div>
                  </div>
                </div>
              </button>
            </div>

            <!-- ── Performance Sets section ── -->
            <div class="shrink-0 border-t border-neutral-900 flex flex-col max-h-[40%]">

              <!-- Sets header + save button -->
              <div class="px-4 py-2.5 flex items-center justify-between shrink-0">
                <div class="flex items-center gap-1.5">
                  <BookOpen class="w-3 h-3 text-violet-400/60" />
                  <span class="text-[8px] font-mono text-violet-400/60 uppercase tracking-widest">Performance Sets</span>
                  <span v-if="pcSets.length > 0" class="text-[7px] font-black px-1 py-0.5 rounded bg-violet-500/15 text-violet-400 border border-violet-500/20">{{ pcSets.length }}</span>
                </div>
                <button
                  @click="openSaveDialog"
                  title="Save current configuration as a new set"
                  class="flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 hover:bg-violet-500/20 hover:border-violet-500/40 transition-all text-[8px] font-black uppercase tracking-wider"
                >
                  <Plus class="w-2.5 h-2.5" />Save
                </button>
              </div>

              <!-- Inline save dialog -->
              <div v-if="showSaveDialog" class="shrink-0 px-3 pb-2.5 flex gap-2 items-center">
                <input
                  ref="newSetNameInput"
                  v-model="newSetName"
                  type="text"
                  placeholder="Set name…"
                  maxlength="40"
                  @keydown.enter="saveCurrentSet"
                  @keydown.esc="showSaveDialog = false"
                  class="flex-1 min-w-0 bg-black/60 border border-violet-500/40 rounded-lg px-2.5 py-1.5 text-[11px] text-white font-mono outline-none focus:border-violet-400 placeholder:text-neutral-700"
                />
                <button
                  @click="saveCurrentSet"
                  :disabled="!newSetName.trim()"
                  class="shrink-0 px-2 py-1.5 rounded-lg bg-violet-500 text-black text-[8px] font-black uppercase tracking-widest hover:bg-violet-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Save class="w-3 h-3" />
                </button>
                <button @click="showSaveDialog = false" class="shrink-0 p-1.5 rounded-lg text-neutral-600 hover:text-neutral-400 transition-colors">
                  <X class="w-3 h-3" />
                </button>
              </div>

              <!-- Saved sets list -->
              <div v-if="pcSets.length > 0" class="overflow-y-auto custom-scrollbar">
                <template v-for="set in pcSets" :key="set.id">
                  <!-- Set row -->
                  <div
                    :class="[
                      'group flex items-center gap-2 px-3 py-2 border-t border-neutral-900/60 transition-colors',
                      activeSetId === set.id
                        ? 'bg-violet-500/10 border-l-2 border-l-violet-500'
                        : 'hover:bg-white/[0.02] border-l-2 border-l-transparent'
                    ]"
                  >
                    <div class="flex-1 min-w-0">
                      <p :class="['text-[10px] font-bold truncate leading-none mb-0.5', activeSetId === set.id ? 'text-violet-300' : 'text-neutral-300']">{{ set.name }}</p>
                      <p class="text-[8px] font-mono text-neutral-700 flex items-center gap-1">
                        {{ set.devices.length }} device{{ set.devices.length !== 1 ? 's' : '' }}
                        <span v-if="lppPadBySetId[set.id] != null" class="text-violet-500/70">· Pad {{ lppPadBySetId[set.id] + 1 }}</span>
                      </p>
                    </div>
                    <button
                      @click="recallSet(set)"
                      title="Recall this set"
                      class="shrink-0 p-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 hover:bg-violet-500 hover:text-black hover:border-violet-500 transition-all"
                    >
                      <RotateCcw class="w-2.5 h-2.5" />
                    </button>
                    <button
                      @click="togglePadPicker(set.id)"
                      :title="lppPadBySetId[set.id] != null ? `Assigned to Pad ${lppPadBySetId[set.id] + 1} — click to reassign` : 'Assign to a performance pad'"
                      :class="[
                        'shrink-0 p-1.5 rounded-lg border transition-all opacity-0 group-hover:opacity-100',
                        assigningSetId === set.id
                          ? 'bg-violet-500/20 border-violet-500/50 text-violet-300'
                          : lppPadBySetId[set.id] != null
                            ? 'bg-violet-500/10 border-violet-500/30 text-violet-400 opacity-100'
                            : 'text-neutral-600 border-transparent hover:bg-violet-500/10 hover:text-violet-400 hover:border-violet-500/20'
                      ]"
                    >
                      <LayoutGrid class="w-2.5 h-2.5" />
                    </button>
                    <button
                      @click="updateSet(set.id)"
                      title="Update this set with current state"
                      class="shrink-0 p-1.5 rounded-lg text-neutral-600 hover:bg-emerald-500/10 hover:text-emerald-400 hover:border hover:border-emerald-500/20 transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Save class="w-2.5 h-2.5" />
                    </button>
                    <button
                      @click="deleteSet(set.id)"
                      title="Delete this set"
                      class="shrink-0 p-1.5 rounded-lg text-neutral-700 hover:bg-red-500/10 hover:text-red-400 hover:border hover:border-red-500/20 transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 class="w-2.5 h-2.5" />
                    </button>
                  </div>

                  <!-- Pad picker (expands inline below the row) -->
                  <div v-if="assigningSetId === set.id" class="px-3 py-2 bg-black/50 border-t border-neutral-900/40">
                    <p class="text-[7px] font-mono text-violet-400/60 uppercase tracking-widest mb-1.5">Assign to pad</p>
                    <div class="grid grid-cols-4 gap-1">
                      <button
                        v-for="padIdx in 16"
                        :key="padIdx"
                        @click="assignToPad(set.id, padIdx - 1)"
                        :title="lppSetPads[padIdx - 1]?.setId && lppSetPads[padIdx - 1].setId !== set.id ? `Replace: ${lppSetPads[padIdx - 1].setName}` : `Assign to Pad ${padIdx}`"
                        :class="[
                          'flex flex-col items-center justify-center h-8 rounded border text-center transition-all',
                          lppSetPads[padIdx - 1]?.setId === set.id
                            ? 'bg-violet-500/30 border-violet-400/60 text-violet-200'
                            : lppSetPads[padIdx - 1]?.setId
                              ? 'bg-neutral-900/60 border-neutral-800 text-neutral-600 hover:border-violet-500/40 hover:text-violet-400'
                              : 'bg-neutral-900/40 border-neutral-800/60 text-neutral-500 hover:border-violet-500/40 hover:text-violet-400 hover:bg-violet-500/10'
                        ]"
                      >
                        <span class="text-[8px] font-black leading-none">{{ padIdx }}</span>
                        <span v-if="lppSetPads[padIdx - 1]?.setId && lppSetPads[padIdx - 1].setId !== set.id" class="text-[6px] font-mono leading-none mt-0.5 truncate w-full px-0.5 opacity-60">
                          {{ lppSetPads[padIdx - 1].setName }}
                        </span>
                        <span v-else-if="lppSetPads[padIdx - 1]?.setId === set.id" class="text-[6px] font-black leading-none mt-0.5 text-violet-300">✓</span>
                      </button>
                    </div>
                  </div>
                </template>
              </div>

              <div v-else-if="!showSaveDialog" class="px-4 py-3 text-[9px] font-mono text-neutral-700 italic">
                No sets saved yet
              </div>

            </div>
          </div>

          <!-- ── RIGHT: browser ── -->
          <div class="flex-1 flex flex-col overflow-hidden">

            <!-- No device selected -->
            <div v-if="!selectedDeviceName" class="flex-1 flex flex-col items-center justify-center gap-3">
              <Music2 class="w-10 h-10 text-neutral-700" />
              <p class="text-[10px] font-mono text-neutral-600 text-center">Select a device on the left<br>to browse its preset catalog</p>
            </div>

            <template v-else>

              <!-- ── 1. Device header + channel selector ── -->
              <div class="shrink-0 px-6 pt-5 pb-4 flex items-center justify-between border-b border-neutral-900">
                <div class="flex items-center gap-3">
                  <div :class="['w-2 h-2 rounded-full', isDeviceOffline ? 'bg-neutral-700' : 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]']" />
                  <span class="text-sm font-black text-white uppercase tracking-wider">{{ selectedDeviceName }}</span>
                  <span v-if="isDeviceOffline" class="text-[8px] font-black bg-amber-950/40 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full uppercase">Offline</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-[9px] font-mono text-neutral-500 uppercase">Channel</span>
                  <div class="relative">
                    <select
                      :value="(selectedReg?.pcChannel ?? 0) + 1"
                      @change="e => setChannel(parseInt(e.target.value))"
                      class="appearance-none bg-black/60 border border-neutral-800 rounded-lg px-3 py-1.5 text-violet-300 font-mono text-[11px] outline-none focus:border-violet-500/50 pr-7 cursor-pointer"
                    >
                      <option v-for="ch in 16" :key="ch" :value="ch" class="bg-black">CH {{ ch }}</option>
                    </select>
                    <ChevronDown class="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-600 pointer-events-none" />
                  </div>
                </div>
              </div>

              <!-- ── 2. Offline warning ── -->
              <div v-if="isDeviceOffline" class="shrink-0 mx-6 mt-3 bg-amber-950/30 border border-amber-500/30 rounded-xl px-4 py-2.5 flex items-center gap-2">
                <AlertTriangle class="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span class="text-[9px] font-mono text-amber-400">Device offline — messages will not transmit</span>
              </div>

              <!-- ══ UI DEVICE MODE (primary instrument via MidiSource.UI) ══ -->
              <template v-if="isUiDevice">

                <!-- 3-UI. Currently loaded preset -->
                <div class="shrink-0 mx-6 mt-3 bg-black/30 border border-sky-500/20 rounded-2xl overflow-hidden">
                  <div class="px-4 py-2 border-b border-neutral-900 flex items-center justify-between">
                    <span class="text-[8px] font-mono text-sky-400/70 uppercase tracking-widest">Currently Loaded</span>
                    <span class="text-[7px] font-black px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 border border-sky-500/30 uppercase tracking-tighter flex items-center gap-0.5">
                      <Layers class="w-2 h-2" />Sound Library
                    </span>
                  </div>
                  <div v-if="presetStore.lastPreset" class="flex items-center gap-3 px-4 py-2.5">
                    <Star class="w-3 h-3 text-sky-400 shrink-0" />
                    <span class="text-[11px] font-bold text-white truncate flex-1">{{ presetStore.lastPreset.name }}</span>
                    <span v-if="presetStore.lastPreset.category" class="text-[7px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 border border-sky-500/25">
                      {{ presetStore.lastPreset.category }}
                    </span>
                  </div>
                  <div v-else class="flex items-center gap-2 px-4 py-2.5">
                    <span class="text-[10px] font-mono text-neutral-600">No preset loaded</span>
                  </div>
                </div>

                <!-- 4-UI. Sound Library header -->
                <div class="shrink-0 px-6 mt-4 flex items-center justify-between">
                  <span class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest">Sound Library</span>
                  <span class="text-[8px] font-mono text-neutral-600">{{ presetStore.history.length }} presets</span>
                </div>

                <!-- 5-UI. Search + Category -->
                <div class="shrink-0 px-6 mt-2 pb-3 flex gap-2 items-center border-b border-neutral-900">
                  <div class="relative flex-1">
                    <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-600" />
                    <input
                      v-model="uiSearchQuery"
                      type="text"
                      placeholder="Search sound library…"
                      class="w-full bg-black/50 border border-neutral-800 rounded-xl pl-7 pr-3 py-1.5 text-[11px] text-neutral-300 font-mono outline-none focus:border-sky-500/50 placeholder:text-neutral-700"
                    />
                    <button v-if="uiSearchQuery" @click="uiSearchQuery = ''" class="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-600 hover:text-white">
                      <X class="w-3 h-3" />
                    </button>
                  </div>
                  <div class="relative">
                    <select
                      v-model="uiCategoryFilter"
                      class="appearance-none bg-black/50 border border-neutral-800 rounded-xl px-3 py-1.5 text-[10px] text-neutral-400 font-mono outline-none focus:border-sky-500/50 pr-6 cursor-pointer"
                    >
                      <option value="" class="bg-black">All categories</option>
                      <option v-for="cat in uiCategories" :key="cat" :value="cat" class="bg-black">{{ cat }}</option>
                    </select>
                    <ChevronDown class="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-600 pointer-events-none" />
                  </div>
                </div>

                <!-- 6-UI. Sound Library preset list -->
                <div class="flex-1 overflow-y-auto custom-scrollbar px-6 py-4">
                  <div v-if="uiFilteredPresets.length === 0" class="flex flex-col items-center justify-center py-12 gap-2">
                    <Music2 class="w-6 h-6 text-neutral-700" />
                    <span class="text-[10px] font-mono text-neutral-600">No presets found</span>
                  </div>
                  <div v-else class="space-y-0.5">
                    <button
                      v-for="preset in uiFilteredPresets"
                      :key="preset.id ?? preset.name"
                      @click="selectHistoryPreset(preset)"
                      :class="[
                        'w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all group text-left',
                        presetStore.lastPreset?.id === preset.id
                          ? 'bg-sky-500/15 border-sky-500/30 shadow-[0_0_10px_rgba(14,165,233,0.1)]'
                          : 'bg-black/20 border-transparent hover:border-neutral-800 hover:bg-white/[0.03]'
                      ]"
                    >
                      <div class="flex items-center gap-2.5 min-w-0">
                        <Star :class="[
                          'shrink-0 w-3 h-3 transition-colors',
                          preset.isFavorite ? 'text-amber-400' : 'text-neutral-800 group-hover:text-neutral-600'
                        ]" />
                        <span :class="[
                          'text-[11px] font-medium truncate',
                          presetStore.lastPreset?.id === preset.id ? 'text-sky-200' : 'text-neutral-400 group-hover:text-neutral-200'
                        ]">{{ preset.name }}</span>
                      </div>
                      <div class="flex items-center gap-1.5 shrink-0 ml-2">
                        <span v-if="preset.category" class="text-[8px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded bg-neutral-900 text-neutral-500 border border-neutral-800/50">
                          {{ preset.category }}
                        </span>
                        <Zap v-if="presetStore.lastPreset?.id === preset.id" class="w-2.5 h-2.5 text-sky-400" />
                      </div>
                    </button>
                  </div>
                </div>

              </template>

              <!-- ══ CATALOG / MANUAL MODE ══ -->
              <template v-else>

                <!-- ── 3. Current Program Change ── -->
                <div v-if="currentPcState.length > 0" class="shrink-0 mx-6 mt-3 bg-black/30 border border-violet-500/20 rounded-2xl overflow-hidden">
                  <div class="px-4 py-2 border-b border-neutral-900 flex items-center justify-between">
                    <span class="text-[8px] font-mono text-violet-400/70 uppercase tracking-widest">Current Program Change</span>
                    <span v-if="selectedReg?.isMulti" class="text-[7px] font-black px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30 uppercase tracking-tighter">Multi-Timbral</span>
                  </div>
                  <!-- Multi-timbral: capped height with own scroll -->
                  <div v-if="selectedReg?.isMulti" class="overflow-y-auto custom-scrollbar divide-y divide-neutral-900/60" style="max-height: 20vh">
                    <div
                      v-for="entry in currentPcState"
                      :key="entry.ch"
                      :class="[
                        'flex items-center gap-3 px-4 py-2.5 transition-colors',
                        entry.ch === (selectedReg?.pcChannel ?? 0) ? 'bg-violet-500/10' : 'hover:bg-white/[0.02]'
                      ]"
                    >
                      <span :class="[
                        'shrink-0 w-10 text-center text-[8px] font-black rounded px-1.5 py-0.5 border',
                        entry.ch === (selectedReg?.pcChannel ?? 0)
                          ? 'bg-violet-500/20 text-violet-300 border-violet-500/40'
                          : 'bg-neutral-900 text-neutral-500 border-neutral-800'
                      ]">CH {{ entry.ch + 1 }}</span>
                      <span class="text-[10px] font-bold text-white truncate flex-1">{{ entry.soundName }}</span>
                      <div class="flex items-center gap-2 shrink-0">
                        <span v-if="entry.category" class="text-[7px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400/80 border border-violet-500/20">{{ entry.category }}</span>
                        <span v-if="entry.bank" class="text-[7px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded bg-neutral-900 text-neutral-500 border border-neutral-800/60">{{ entry.bank }}</span>
                        <span class="text-[8px] font-black font-mono text-violet-400/80 text-right whitespace-nowrap">
                          <template v-if="(entry.msb ?? 0) > 0 || (entry.lsb ?? 0) > 0">B{{ entry.msb ?? 0 }}·</template>PC{{ entry.program }}
                        </span>
                      </div>
                    </div>
                  </div>
                  <!-- Mono: single row, no scroll needed -->
                  <div v-else class="flex items-center gap-3 px-4 py-2.5">
                    <span class="shrink-0 w-10 text-center text-[8px] font-black rounded px-1.5 py-0.5 border bg-violet-500/20 text-violet-300 border-violet-500/40">
                      CH {{ (currentPcState[0]?.ch ?? 0) + 1 }}
                    </span>
                    <span class="text-[10px] font-bold text-white truncate flex-1">{{ currentPcState[0]?.soundName }}</span>
                    <div class="flex items-center gap-2 shrink-0">
                      <span v-if="currentPcState[0]?.category" class="text-[7px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400/80 border border-violet-500/20">{{ currentPcState[0].category }}</span>
                      <span v-if="currentPcState[0]?.bank" class="text-[7px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded bg-neutral-900 text-neutral-500 border border-neutral-800/60">{{ currentPcState[0].bank }}</span>
                      <span class="text-[8px] font-black font-mono text-violet-400/80 text-right whitespace-nowrap">
                        <template v-if="((currentPcState[0]?.msb ?? 0) > 0) || ((currentPcState[0]?.lsb ?? 0) > 0)">B{{ currentPcState[0]?.msb ?? 0 }}·</template>PC{{ currentPcState[0]?.program }}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- ── 4. Bank selector ── -->
                <template v-if="catalogDevice || userBanks.length > 0">
                  <!-- Hidden file input for .mfprojz import -->
                  <input
                    ref="importInput"
                    type="file"
                    accept=".mfprojz"
                    class="hidden"
                    @change="onImportFile"
                  />

                  <div class="shrink-0 px-6 mt-4">
                    <div class="flex items-center justify-between mb-2">
                      <label class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest">Bank</label>
                      <!-- Import button -->
                      <button
                        @click="triggerImport"
                        :disabled="isImporting"
                        class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-500/10 border border-teal-500/25 text-teal-400 hover:bg-teal-500/20 hover:border-teal-500/40 transition-all text-[8px] font-black uppercase tracking-wider disabled:opacity-40"
                        title="Import a .mfprojz bank from Arturia MIDI Control Center"
                      >
                        <Loader2 v-if="isImporting" class="w-2.5 h-2.5 animate-spin" />
                        <Upload v-else class="w-2.5 h-2.5" />
                        Import .mfprojz
                      </button>
                    </div>

                    <!-- Import error -->
                    <div v-if="importError" class="mb-2 flex items-center gap-2 bg-red-950/40 border border-red-500/30 rounded-lg px-3 py-1.5">
                      <AlertTriangle class="w-3 h-3 text-red-400 shrink-0" />
                      <span class="text-[9px] font-mono text-red-400">{{ importError }}</span>
                    </div>

                    <!-- Rename dialog shown after file is parsed -->
                    <div v-if="showImportRename" class="mb-3 bg-teal-950/30 border border-teal-500/25 rounded-xl px-3 py-2.5 flex flex-col gap-2">
                      <span class="text-[8px] font-mono text-teal-400/70 uppercase tracking-widest">
                        {{ pendingPresets.length }} presets parsed — name this bank:
                      </span>
                      <div class="flex gap-2 items-center">
                        <input
                          v-model="pendingBankName"
                          type="text"
                          placeholder="Bank name…"
                          @keydown.enter="confirmImport"
                          @keydown.escape="cancelImport"
                          class="flex-1 bg-black/60 border border-teal-500/30 rounded-lg px-2.5 py-1.5 text-[11px] text-teal-200 font-mono outline-none focus:border-teal-500/60 placeholder:text-neutral-700"
                        />
                        <button @click="confirmImport" class="px-2.5 py-1.5 rounded-lg bg-teal-500/20 border border-teal-500/40 text-teal-300 hover:bg-teal-500/30 transition-all text-[9px] font-black uppercase">Add</button>
                        <button @click="cancelImport" class="p-1.5 rounded-lg text-neutral-600 hover:text-neutral-400 transition-colors">
                          <X class="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <!-- Bank buttons -->
                    <div class="flex gap-2 flex-wrap">
                      <button
                        v-for="bank in availableBanks"
                        :key="bank"
                        @click="selectedBank = bank"
                        :class="[
                          'group flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border',
                          selectedBank === bank
                            ? isUserBank(bank)
                              ? 'bg-teal-500/20 border-teal-500/40 text-teal-300 shadow-[0_0_8px_rgba(20,184,166,0.15)]'
                              : 'bg-violet-500/20 border-violet-500/40 text-violet-300 shadow-[0_0_8px_rgba(139,92,246,0.15)]'
                            : 'bg-black/40 border-neutral-800 text-neutral-500 hover:border-neutral-600 hover:text-neutral-300'
                        ]"
                      >
                        <FolderOpen v-if="isUserBank(bank)" class="w-2.5 h-2.5 shrink-0" />
                        {{ bank }}
                        <!-- Delete user bank -->
                        <span
                          v-if="isUserBank(bank)"
                          @click.stop="deleteUserBank(bank)"
                          class="opacity-0 group-hover:opacity-100 ml-0.5 text-neutral-600 hover:text-red-400 transition-all"
                          title="Delete this bank"
                        >
                          <X class="w-2.5 h-2.5" />
                        </span>
                      </button>
                    </div>
                  </div>

                  <!-- ── 5. Search + Category ── -->
                  <div v-if="selectedBank" class="shrink-0 px-6 mt-3 pb-3 flex gap-2 items-center border-b border-neutral-900">
                    <div class="relative flex-1">
                      <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-600" />
                      <input
                        v-model="searchQuery"
                        type="text"
                        placeholder="Search presets…"
                        class="w-full bg-black/50 border border-neutral-800 rounded-xl pl-7 pr-3 py-1.5 text-[11px] text-neutral-300 font-mono outline-none focus:border-violet-500/50 placeholder:text-neutral-700"
                      />
                      <button v-if="searchQuery" @click="searchQuery = ''" class="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-600 hover:text-white">
                        <X class="w-3 h-3" />
                      </button>
                    </div>
                    <div class="relative">
                      <select
                        v-model="selectedCategory"
                        class="appearance-none bg-black/50 border border-neutral-800 rounded-xl px-3 py-1.5 text-[10px] text-neutral-400 font-mono outline-none focus:border-violet-500/50 pr-6 cursor-pointer"
                      >
                        <option value="" class="bg-black">All categories</option>
                        <option v-for="cat in categories" :key="cat" :value="cat" class="bg-black">{{ cat }}</option>
                      </select>
                      <ChevronDown class="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-600 pointer-events-none" />
                    </div>
                  </div>
                </template>

                <!-- ── 6. Scrollable preset list ── -->
                <div ref="presetListEl" class="flex-1 overflow-y-auto custom-scrollbar px-6 py-4" @wheel="onPresetListWheel">

                  <!-- Catalog: loading -->
                  <div v-if="catalogDevice && selectedBank && isLoading" class="flex items-center justify-center py-12 gap-2">
                    <Loader2 class="w-5 h-5 text-violet-400 animate-spin" />
                    <span class="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Loading catalog…</span>
                  </div>

                  <!-- Catalog: preset list -->
                  <template v-else-if="catalogDevice && selectedBank && filteredSounds.length > 0">
                    <div class="flex items-center justify-between mb-2 px-1">
                      <div class="flex items-center gap-2">
                        <span class="text-[8px] font-mono text-neutral-600 uppercase tracking-widest">{{ filteredSounds.length }} presets</span>
                        <span class="text-[7px] font-mono text-neutral-700 uppercase tracking-widest">· scroll or NRPN/CC38</span>
                      </div>
                      <div class="flex items-center gap-1.5">
                        <span v-if="lastSent" class="flex items-center gap-1 text-[8px] font-mono text-violet-400 uppercase tracking-widest">
                          <Zap class="w-2.5 h-2.5" />{{ lastSent.name }}
                        </span>
                        <!-- MIDI Learn: learning state -->
                        <template v-if="isLearningScrollCC">
                          <div class="flex items-center gap-1 px-2 py-1 rounded-lg bg-orange-500/15 border border-orange-500/40 text-orange-400 text-[8px] font-black uppercase tracking-widest animate-pulse">
                            <Radio class="w-2.5 h-2.5" />Move CC#38…
                          </div>
                          <button @click="cancelScrollLearn" class="p-1 text-neutral-600 hover:text-neutral-400 transition-colors rounded">
                            <X class="w-3 h-3" />
                          </button>
                        </template>
                        <!-- MIDI Learn: mapped state -->
                        <template v-else-if="scrollCCMap">
                          <div class="flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 text-[8px] font-black font-mono uppercase tracking-widest">
                            <Radio class="w-2.5 h-2.5" />NRPN/CC38 CH{{ scrollCCMap.channel + 1 }}{{ scrollCCMap.device ? ' · ' + scrollCCMap.device : '' }}
                          </div>
                          <button @click="clearScrollCC" title="Remove CC mapping" class="p-1 text-neutral-600 hover:text-red-400 transition-colors rounded">
                            <X class="w-3 h-3" />
                          </button>
                        </template>
                        <!-- MIDI Learn: idle state -->
                        <button
                          v-else
                          @click="startScrollLearn"
                          title="MIDI Learn: move a NRPN/CC#38 knob to bind device + channel"
                          class="flex items-center gap-1 px-2 py-1 rounded-lg bg-black/40 border border-neutral-800 text-neutral-600 hover:text-orange-400 hover:border-orange-500/30 hover:bg-orange-500/10 transition-all text-[8px] font-black uppercase tracking-widest"
                        >
                          <Radio class="w-2.5 h-2.5" />MIDI
                        </button>
                      </div>
                    </div>
                    <div ref="presetButtonsEl" class="space-y-0.5">
                      <button
                        v-for="sound in filteredSounds"
                        :key="sound.no ?? sound.name"
                        @click="selectSound(sound)"
                        :class="[
                          'w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all group text-left',
                          activeSound?.no === sound.no && activeSound?.name === sound.name
                            ? 'bg-violet-500/15 border-violet-500/30 shadow-[0_0_10px_rgba(139,92,246,0.1)]'
                            : 'bg-black/20 border-transparent hover:border-neutral-800 hover:bg-white/[0.03]'
                        ]"
                      >
                        <div class="flex items-center gap-2.5 min-w-0">
                          <span :class="[
                            'shrink-0 w-7 text-center text-[8px] font-black font-mono rounded px-1 py-0.5',
                            activeSound?.no === sound.no && activeSound?.name === sound.name
                              ? 'bg-violet-500 text-black'
                              : 'bg-neutral-900 text-neutral-600 group-hover:bg-neutral-800 group-hover:text-neutral-400'
                          ]">
                            {{ sound[bankConfig?.program_field ?? 'program'] ?? 0 }}
                          </span>
                          <span :class="[
                            'text-[11px] font-medium truncate',
                            activeSound?.no === sound.no && activeSound?.name === sound.name
                              ? 'text-violet-200'
                              : 'text-neutral-400 group-hover:text-neutral-200'
                          ]">
                            {{ sound.name }}
                          </span>
                        </div>
                        <div class="flex items-center gap-1.5 shrink-0 ml-2">
                          <span
                            v-if="sound[bankConfig?.category_field ?? 'category']"
                            class="text-[8px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded bg-neutral-900 text-neutral-500 border border-neutral-800/50"
                          >
                            {{ sound[bankConfig?.category_field ?? 'category'] }}
                          </span>
                          <Send v-if="activeSound?.no === sound.no && activeSound?.name === sound.name" class="w-2.5 h-2.5 text-violet-400" />
                        </div>
                      </button>
                    </div>
                  </template>

                  <!-- Catalog: empty results -->
                  <div v-else-if="catalogDevice && selectedBank && !isLoading" class="flex flex-col items-center justify-center py-12 gap-2">
                    <Music2 class="w-6 h-6 text-neutral-700" />
                    <span class="text-[10px] font-mono text-neutral-600">No presets found</span>
                  </div>

                  <!-- Manual fallback (no catalog match) -->
                  <div v-else-if="!catalogDevice" class="bg-neutral-900/30 border border-neutral-800 rounded-2xl p-5 space-y-4">
                    <p class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest">Manual Bank / Program Change</p>
                    <div class="grid grid-cols-2 gap-3">
                      <div class="bg-black/40 border border-neutral-800 rounded-xl p-3 space-y-2">
                        <label class="flex items-center gap-2 cursor-pointer select-none">
                          <input type="checkbox" v-model="sendMsb" class="w-3.5 h-3.5 accent-violet-500" />
                          <span class="text-[9px] font-black uppercase text-neutral-400">Bank MSB (CC 0)</span>
                        </label>
                        <input type="number" min="0" max="127" v-model.number="manualMsb" :disabled="!sendMsb"
                          class="w-full bg-black border border-neutral-700 rounded-lg px-3 py-1.5 text-neutral-300 font-mono text-[11px] outline-none focus:border-violet-500 disabled:opacity-30 text-center" />
                      </div>
                      <div class="bg-black/40 border border-neutral-800 rounded-xl p-3 space-y-2">
                        <label class="flex items-center gap-2 cursor-pointer select-none">
                          <input type="checkbox" v-model="sendLsb" class="w-3.5 h-3.5 accent-violet-500" />
                          <span class="text-[9px] font-black uppercase text-neutral-400">Bank LSB (CC 32)</span>
                        </label>
                        <input type="number" min="0" max="127" v-model.number="manualLsb" :disabled="!sendLsb"
                          class="w-full bg-black border border-neutral-700 rounded-lg px-3 py-1.5 text-neutral-300 font-mono text-[11px] outline-none focus:border-violet-500 disabled:opacity-30 text-center" />
                      </div>
                    </div>
                    <div class="bg-black/40 border border-neutral-800 rounded-xl p-3 space-y-2">
                      <div class="flex items-center justify-between">
                        <span class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest">Program (1–128)</span>
                        <input type="number" min="1" max="128" v-model.number="manualProg"
                          class="w-14 bg-black border border-neutral-700 rounded px-2 py-0.5 text-center text-violet-300 font-mono text-[11px] focus:border-violet-400 outline-none" />
                      </div>
                      <input type="range" min="1" max="128" v-model.number="manualProg" class="w-full accent-violet-500 h-1 bg-black rounded-lg cursor-pointer" />
                    </div>
                    <button
                      @click="sendManual"
                      :disabled="!selectedDeviceName || isDeviceOffline"
                      class="w-full bg-violet-500 text-black rounded-xl py-3 font-black tracking-widest uppercase text-[10px] flex items-center justify-center gap-2 hover:bg-violet-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-violet-500/20"
                    >
                      <Send class="w-3.5 h-3.5" />
                      Send Program Change
                    </button>
                  </div>

                </div>

              </template>
            </template>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-3 bg-black/40 border-t border-neutral-900 flex items-center justify-between shrink-0">
          <div class="flex items-center gap-2">
            <div class="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
            <span class="text-[9px] font-mono text-violet-500/60 uppercase tracking-widest">Program Change Browser · SY.CORE</span>
          </div>
          <span class="text-[9px] font-mono text-neutral-700 uppercase tracking-widest">
            {{ devices.filter(d => d.pcEnabled).length }} device(s) PC-enabled
          </span>
        </div>

      <!-- resize handles -->
      <div @mousedown.stop="e => onResizeStart(e, 'n')"  class="absolute top-0    left-3 right-3 h-1   cursor-n-resize  z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 's')"  class="absolute bottom-0 left-3 right-3 h-1   cursor-s-resize  z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'e')"  class="absolute top-3 bottom-3 right-0  w-1   cursor-e-resize  z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'w')"  class="absolute top-3 bottom-3 left-0   w-1   cursor-w-resize  z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'ne')" class="absolute top-0    right-0  w-3 h-3 cursor-ne-resize z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'nw')" class="absolute top-0    left-0   w-3 h-3 cursor-nw-resize z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'sw')" class="absolute bottom-0 left-0   w-3 h-3 cursor-sw-resize z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'se')" class="absolute bottom-1 right-1  w-3 h-3 cursor-se-resize z-50 opacity-40 hover:opacity-80" style="background:radial-gradient(circle,#aaa 1px,transparent 1px) 0 0/3px 3px" />
      </div>
    </Transition>

    <!-- PC Notification Toast -->
    <Teleport to="body">
    <Transition name="pc-toast">
      <div
        v-if="pcNotification.visible"
        class="fixed bottom-8 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none"
      >
        <div class="flex items-center gap-3 px-5 py-3 rounded-2xl bg-neutral-900/95 border border-violet-500/40 shadow-[0_0_30px_rgba(139,92,246,0.25)] backdrop-blur-md">
          <div class="w-1.5 h-1.5 rounded-full bg-violet-400 shadow-[0_0_6px_rgba(139,92,246,0.8)] animate-pulse shrink-0" />
          <span class="text-[10px] font-black uppercase tracking-widest text-violet-400">{{ pcNotification.device }}</span>
          <span class="text-[10px] font-mono text-neutral-500">·</span>
          <span class="text-[11px] font-bold text-white">{{ pcNotification.name }}</span>
          <span
            v-if="pcNotification.category"
            class="text-[8px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30"
          >{{ pcNotification.category }}</span>
        </div>
      </div>
    </Transition>
  </Teleport>
  </div>
</template>

<style scoped>
.performance-enter-active,
.performance-leave-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.performance-enter-from,
.performance-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.98);
}

.pc-toast-enter-active { transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1); }
.pc-toast-leave-active { transition: all 0.3s ease-in; }
.pc-toast-enter-from,
.pc-toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(12px) scale(0.95);
}
</style>
