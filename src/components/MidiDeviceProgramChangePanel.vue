<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { X, Minus, Music2, Search, Send, ChevronDown, AlertTriangle, Loader2, Zap, Layers, Star, Save, RotateCcw, Trash2, Plus, BookOpen, Radio, Upload, FolderOpen, LayoutGrid, FileText, Copy, Braces, Database, CheckCircle2 } from 'lucide-vue-next'
import { useMidiStore } from '@/stores/useMidiStore'
import { useDeviceRegistry } from '@/composables/useDeviceRegistry'
import { userKey } from '@/lib/userKey'
import { usePresetStore } from '@/stores/usePresetStore'
import { useUserBanksStore } from '@/stores/useUserBanksStore'
import { useUiStore } from '@/stores/useUiStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { usePerformanceSets } from '@/composables/usePerformanceSets'
import { parseMfprojz } from '@/composables/useMfprojzParser'
import { parseEmulatorX3 } from '@/composables/useEmulatorX3Parser'
import { parseStandardJson } from '@/composables/useStandardJsonParser'
import { parseKawaiK1 } from '@/composables/useKawaiK1Parser'
import { parseAccessVirusSyx } from '@/composables/useAccessVirusSyxParser'
import { parseArturiaSqlite } from '@/composables/useArturiaSqliteParser'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import MacOsButtons from '@/components/ui/MacOsButtons.vue'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'
import { MidiSource, midiService } from '@/core/midi/midi-service'
import catalogIndex from '@/data/program_change/program_change.json'
import { on } from '@/types/events'

const emit = defineEmits(['close'])

const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront, maximize } = useDraggableResizable({
  storageKey: 'SYCORE_POS_DEVICE_PC',
  minimizeLabel: 'Device PC',
  initialWidth: 900,
  initialHeight: 700,
  zIndex: 100,
  panelId: 'device-program-change',
})

const midiStore      = useMidiStore()
const { devices: registryDevices } = useDeviceRegistry()
const uiStore        = useUiStore()
watch(() => uiStore.isDeviceProgramChangePanelOpen, (v) => { if (v) bringToFront() })
const presetStore    = usePresetStore()
const userBanksStore = useUserBanksStore()
const mappingStore   = useMappingStore()
const { openMenu }   = useMidiContextMenu()

// ── Performance Sets (shared, IndexedDB-backed) ───────────────────
const { pcSets, loadSets, saveSet, updateSet, deleteSet, recallSet: recallStoredSet } = usePerformanceSets()

// ── Device list (left column) — only PC-enabled devices ────────
const devices = computed(() => {
  if (!midiStore.routingConfig?.registrations) return []
  const instrumentNames = new Set(
    registryDevices.value
      .filter(d => d.type === 'instrument-single' || d.type === 'instrument-multi')
      .map(d => d.name)
  )
  // Add virtual instrument names to the set so they pass the filter
  midiStore.virtualInstruments.forEach(v => instrumentNames.add(v.name))

  return Object.values(midiStore.routingConfig.registrations)
    .filter(r => r.outEnabled && (r.pcEnabled || r.pc) && instrumentNames.has(r.name))
    .map(r => ({
      ...r,
      isOnline: midiStore.outputs.some(o => o.name === r.name) || midiStore.virtualInstruments.some(v => v.name === r.name && v.online !== false),
    }))
    .sort((a, b) => b.isOnline - a.isOnline || a.name.localeCompare(b.name))
})

// Left-panel device list — only devices actually online right now. `devices`
// itself stays the full set (online or not): it's also used for Performance
// Set snapshots (which must keep covering a device even if it's temporarily
// offline at save time).
const visibleDevices = computed(() => devices.value.filter(d => d.isOnline))

const selectedDeviceName = ref('')

// Auto-select first online PC-enabled device on open
onMounted(() => {
  const first = visibleDevices.value.find(d => d.pcEnabled) ?? visibleDevices.value[0]
  if (first) selectedDeviceName.value = first.name
  loadSets()
})

const selectedReg = computed(() =>
  selectedDeviceName.value ? midiStore.routingConfig.registrations[selectedDeviceName.value] : null
)

const isDeviceOffline = computed(() => {
  if (!selectedDeviceName.value) return false
  const virtual = midiStore.virtualInstruments.find(v => v.name === selectedDeviceName.value)
  if (virtual) return virtual.online === false
  return !midiStore.outputs.some(o => o.name === selectedDeviceName.value)
})

// A virtual instrument's active channels mirror whatever MIDI Flow has
// configured for it: outChannels (Multi) if any are set, otherwise just its
// single outChannel (Single) — same pattern InstrumentCockpitPanel.vue uses
// for its own per-channel patch list. Previously this always returned all 16
// channels regardless of Single/Multi, so a Single-mode virtual instrument
// wrongly exposed every channel here instead of just the one picked in Flow.
const virtualActiveChannels = computed(() => {
  if (!selectedDeviceName.value) return []
  if (!midiStore.virtualInstruments.some(v => v.name === selectedDeviceName.value)) return []
  const reg = selectedReg.value
  if (!reg) return []
  if (reg.outChannels && reg.outChannels.length > 0) return reg.outChannels
  // outChannel is -1 (OMNI) when Single mode hasn't had an explicit channel
  // picked in MIDI Flow yet — valid there since OMNI just means "don't remap,
  // pass the incoming channel through," but there is no incoming channel for
  // a Program Change this panel sends, so embedding -1 directly into the
  // outgoing status byte (0xC0 | -1) produced an invalid negative byte that
  // MIDIOutput.send() silently rejected — no PC message ever went out.
  return [reg.outChannel >= 0 ? reg.outChannel : 0]
})

// Channel display state for the multi-channel view: when outChannels are set,
// show a row per active channel (with saved sound or empty); otherwise show
// whatever pcChannels have been recorded.
const multiChannelDisplayState = computed(() => {
  const chList = virtualActiveChannels.value
  if (chList.length === 0) return currentPcState.value
  const pcChannels = selectedReg.value?.pcChannels ?? {}
  return chList.map(ch => ({
    ch,
    ...(pcChannels[ch] ?? { soundName: null, category: null, bank: null, program: null, msb: 0, lsb: 0 }),
  }))
})

// ── UI/Preview instrument detection ────────────────────────────
// A device routed from MidiSource.UI is the app's primary instrument.
// For these, we show the app Sound Library instead of a catalog.
// A 16-channel virtual instrument is excluded even if it's also wired to
// receive Sound Engine output — a per-channel patch table is unambiguously
// for programming an external multitimbral target via MIDI, so it must keep
// showing the MIDI catalog/PC-sending UI rather than being shadowed by the
// internal (non-MIDI) preset browser used for SY.CORE's own preview output.
const isUiDevice = computed(() => {
  if (!selectedDeviceName.value) return false
  // Explicit template assignment always wins over auto-detection.
  if (selectedReg.value?.pcTemplate === 'roland-s1') return true
  if (virtualActiveChannels.value.length > 0) return false
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
// Devices with an explicit pcTemplate assigned (see MIDI Devices) look up
// their catalog entry by exact template→catalog-key mapping instead of
// fuzzy name matching, and templates with no built-in catalog (Emulator X3,
// Standard JSON, Kawai K1, Roland S-1) never show one at all. Devices with
// no template assigned (unset — nobody has migrated them yet) keep today's
// fuzzy-match behavior unchanged.
const TEMPLATE_CATALOG_KEY = {
  mfprojz: 'Arturia MicroFreak',
  seqtrak: 'SEQTRAK-1',
}
const catalogDevice = computed(() => {
  const dn = selectedDeviceName.value?.toLowerCase() ?? ''
  if (!dn) return null
  const tmpl = selectedReg.value?.pcTemplate
  if (tmpl) return TEMPLATE_CATALOG_KEY[tmpl] ?? null
  return Object.keys(catalogIndex).find(k =>
    dn.includes(k.toLowerCase()) || k.toLowerCase().includes(dn)
  ) ?? null
})

const catalogBanks = computed(() => {
  if (!catalogDevice.value) return []
  return Object.keys(catalogIndex[catalogDevice.value])
})

// Legacy (source === undefined) banks were saved before .mfprojz and
// Standard JSON imports were tagged distinctly — keep showing those under
// either template so nothing already imported disappears once a device is
// migrated to an explicit template.
const TEMPLATE_BANK_SOURCES = {
  mfprojz:    ['mfprojz', undefined],
  json:       ['json', undefined],
  emulatorx3: ['emulatorx3'],
  'kawai-k1': ['kawai-k1'],
  'access-virus': ['access-virus'],
  arturia:    ['arturia'],
}
const userBanks = computed(() => {
  const all = userBanksStore.getBanksForDevice(selectedDeviceName.value)
  const tmpl = selectedReg.value?.pcTemplate
  if (!tmpl) return all.map(b => b.name)
  const allowedSources = TEMPLATE_BANK_SOURCES[tmpl]
  if (!allowedSources) return [] // seqtrak / roland-s1 have no user-imported banks
  return all.filter(b => allowedSources.includes(b.source)).map(b => b.name)
})

const availableBanks = computed(() => [...catalogBanks.value, ...userBanks.value])

function isUserBank(bankName) {
  return userBanksStore.hasBank(selectedDeviceName.value, bankName)
}

// ── .mfprojz / Emulator X3 / Standard JSON / Kawai K1 import ─────
const importInput         = ref(null)   // hidden <input type="file"> (.mfprojz)
const importInputX3       = ref(null)   // hidden <input type="file"> (Emulator X3 .txt)
const importInputStandard = ref(null)   // hidden <input type="file"> (Standard JSON)
const importInputKawaiK1  = ref(null)   // hidden <input type="file"> (Kawai K1 .syx)
const importInputVirusSyx = ref(null)   // hidden <input type="file"> (Access Virus .syx)
const importInputArturia  = ref(null)   // hidden <input type="file"> (Arturia db.db3)
const isImporting         = ref(false)
const isImportingX3       = ref(false)
const isImportingStandard = ref(false)
const isImportingKawaiK1  = ref(false)
const isImportingVirusSyx = ref(false)
const isImportingArturia  = ref(false)
const importError        = ref('')
const importArturiaSummary = ref('')
const showImportRename   = ref(false)
const pendingPresets     = ref([])
const pendingBankName    = ref('')
const pendingBankLsb     = ref(0)
const pendingImportSource = ref(undefined)   // 'mfprojz' | 'json' | 'emulatorx3' | 'kawai-k1' | 'access-virus' | 'arturia'

function triggerImport() {
  importError.value = ''
  importInput.value?.click()
}

function triggerImportX3() {
  importError.value = ''
  importInputX3.value?.click()
}

function triggerImportStandard() {
  importError.value = ''
  importInputStandard.value?.click()
}

function triggerImportKawaiK1() {
  importError.value = ''
  importInputKawaiK1.value?.click()
}

function triggerImportArturia() {
  importError.value = ''
  importArturiaSummary.value = ''
  importInputArturia.value?.click()
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
    pendingImportSource.value = 'mfprojz'
    showImportRename.value = true
  } catch (e) {
    importError.value = e.message ?? 'Failed to parse file.'
  } finally {
    isImporting.value = false
    event.target.value = ''
  }
}

async function onImportEmulatorX3File(event) {
  const file = event.target.files?.[0]
  if (!file) return
  isImportingX3.value = true
  importError.value = ''
  try {
    const { bankName, presets } = await parseEmulatorX3(file)
    pendingBankName.value = bankName
    pendingPresets.value  = presets
    pendingImportSource.value = 'emulatorx3'
    showImportRename.value = true
  } catch (e) {
    importError.value = e.message ?? 'Failed to parse file.'
  } finally {
    isImportingX3.value = false
    event.target.value = ''
  }
}

async function onImportStandardFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  isImportingStandard.value = true
  importError.value = ''
  try {
    const presets = await parseStandardJson(file)
    // Default bank name = filename without extension
    pendingBankName.value = file.name.replace(/\.json$/i, '')
    pendingPresets.value  = presets
    pendingImportSource.value = 'json'
    showImportRename.value = true
  } catch (e) {
    importError.value = e.message ?? 'Failed to parse file.'
  } finally {
    isImportingStandard.value = false
    event.target.value = ''
  }
}

async function onImportKawaiK1File(event) {
  const file = event.target.files?.[0]
  if (!file) return
  isImportingKawaiK1.value = true
  importError.value = ''
  try {
    const presets = await parseKawaiK1(file)
    // Default bank name = filename without extension
    pendingBankName.value = file.name.replace(/\.syx$/i, '')
    pendingPresets.value  = presets
    pendingImportSource.value = 'kawai-k1'
    showImportRename.value = true
  } catch (e) {
    importError.value = e.message ?? 'Failed to parse file.'
  } finally {
    isImportingKawaiK1.value = false
    event.target.value = ''
  }
}

// Arturia imports every playlist in the db at once — no single-bank rename
// dialog (that flow is for one bank at a time; this produces N banks).
async function onImportArturiaFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  isImportingArturia.value = true
  importError.value = ''
  importArturiaSummary.value = ''
  try {
    const banks = await parseArturiaSqlite(file)
    const names = Object.keys(banks)
    for (const [name, presets] of Object.entries(banks)) {
      userBanksStore.addBank(selectedDeviceName.value, name, presets, 'arturia')
    }
    selectedBank.value = names[0] ?? ''
    importArturiaSummary.value = `Imported ${names.length} playlist${names.length === 1 ? '' : 's'}: ${names.join(', ')}`
  } catch (e) {
    importError.value = e.message ?? 'Failed to parse Arturia database.'
  } finally {
    isImportingArturia.value = false
    event.target.value = ''
  }
}

function triggerImportVirusSyx() {
  importError.value = ''
  importInputVirusSyx.value?.click()
}

async function onImportVirusSyxFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  isImportingVirusSyx.value = true
  importError.value = ''
  try {
    const presets = await parseAccessVirusSyx(file)
    pendingBankName.value = file.name.replace(/\.syx$/i, '')
    pendingBankLsb.value = presets.length > 0 ? presets[0].msb : 0
    pendingPresets.value  = presets
    pendingImportSource.value = 'access-virus'
    showImportRename.value = true
  } catch (e) {
    importError.value = e.message ?? 'Failed to parse Access Virus file.'
  } finally {
    isImportingVirusSyx.value = false
    event.target.value = ''
  }
}

function confirmImport() {
  const name = pendingBankName.value.trim() || 'Imported Bank'
  // Apply the bank LSB to every preset so sendCatalogSound sends the correct CC32 value
  if (pendingImportSource.value === 'access-virus' && pendingBankLsb.value > 0) {
    pendingPresets.value = pendingPresets.value.map(p => ({ ...p, lsb: pendingBankLsb.value }))
  }
  userBanksStore.addBank(selectedDeviceName.value, name, pendingPresets.value, pendingImportSource.value)
  selectedBank.value = name
  showImportRename.value = false
  pendingPresets.value   = []
  pendingBankLsb.value   = 0
  pendingImportSource.value = undefined
}

function cancelImport() {
  showImportRename.value = false
  pendingPresets.value   = []
  pendingBankLsb.value   = 0
  pendingImportSource.value = undefined
}

function deleteUserBank(bankName) {
  if (selectedBank.value === bankName) { selectedBank.value = ''; sounds.value = [] }
  userBanksStore.removeBank(selectedDeviceName.value, bankName)
}

const selectedBank = ref('')
// Also re-runs on pcChannel changes — each channel can carry its own saved
// bank (reg.pcChannels[ch].bank, written by recordChannelState), so picking
// a different channel row in "Current Program Change" needs to restore
// *that* channel's bank, not just whatever bank happened to be open. Falls
// back to reg.pcBank (the device-level "last written" bank) for a
// single-channel device or a channel that's never had a patch assigned yet.
watch([catalogDevice, selectedDeviceName, () => selectedReg.value?.pcChannel], () => {
  // restore last-used bank if available, else reset
  const reg = selectedReg.value
  const activeCh = reg?.pcChannel ?? 0
  const bank = reg?.pcChannels?.[activeCh]?.bank || reg?.pcBank
  if (bank && availableBanks.value.includes(bank)) {
    selectedBank.value = bank
  } else {
    selectedBank.value = ''
    sounds.value = []
  }
})

const bankConfig = computed(() => {
  if (!selectedBank.value) return null
  const userEntry = userBanksStore.getBanksForDevice(selectedDeviceName.value)
    .find(b => b.name === selectedBank.value)
  if (userEntry?.source === 'emulatorx3') return {
    msb: false, lsb: false, category_field: 'category',
    program_field: 'program', program_base: 0,
    bankSelect: 'emulatorx3', bank_field: 'bank',
  }
  if (userEntry?.source === 'arturia') return {
    msb: true, lsb: false, category_field: 'category',
    program_field: 'program', program_base: -1,
  }
  if (isUserBank(selectedBank.value)) return {
    msb: false, lsb: false, category_field: 'category',
    program_field: 'program', program_base: -1,
  }
  if (!catalogDevice.value) return null
  return catalogIndex[catalogDevice.value][selectedBank.value]
})

// ── Lazy-load sound list ────────────────────────────────────────
const sounds    = ref([])
const isLoading = ref(false)

// Also keyed on selectedDeviceName, not just selectedBank — two devices can
// legitimately have the same bank *name* selected (e.g. both pointed at the
// same imported user bank), in which case selectedBank's own value never
// changes on switch, and this watcher wouldn't otherwise re-fire at all,
// leaving the previous device's patch list on screen.
watch([selectedBank, selectedDeviceName], async ([bank]) => {
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

// Also clears on pcChannel change (switching which channel row is active in
// "Current Program Change") — activeSound must reset so scrollToCurrentProgram
// re-evaluates for the newly selected channel's own saved patch, instead of
// staying stuck highlighting whatever the previous channel had selected.
watch([selectedDeviceName, () => selectedReg.value?.pcChannel], () => { activeSound.value = null; lastSent.value = null; showCopyMapPicker.value = false })

// Scroll the preset list to the entry matching the *currently selected
// channel's* own saved patch (reg.pcChannels[pcChannel]), not the device-level
// pcProgram/pcMsb/pcLsb fields — those just hold whichever channel was most
// recently written to (see recordChannelState), not necessarily the channel
// that's currently active, so channel-switching would otherwise scroll/
// highlight against the wrong (previous channel's) target. Falls back to the
// device-level fields for a single-channel device that's never recorded
// per-channel state.
// Uses the same progIdx formula as sendCatalogSound so bank offsets are respected.
function scrollToCurrentProgram() {
  const list = filteredSounds.value
  if (!list.length || !bankConfig.value) return
  const reg = selectedReg.value
  if (!reg) return

  const activeCh = reg.pcChannel ?? 0
  const chInfo   = reg.pcChannels?.[activeCh]
  const pcProgram = chInfo?.program ?? reg.pcProgram
  const pcMsb     = chInfo?.msb ?? reg.pcMsb
  const pcLsb     = chInfo?.lsb ?? reg.pcLsb

  const cfg    = bankConfig.value
  const pField = cfg.program_field ?? 'program'

  const idx = list.findIndex(s => {
    if (cfg.bankSelect === 'emulatorx3') {
      const bank    = s[cfg.bank_field ?? 'bank'] ?? 0
      const progNum = Math.max(0, Math.min(127, s[pField] ?? 0))
      return progNum === (pcProgram ?? 0) && bank === (pcLsb ?? 0)
    }
    const progIdx = (s[pField] ?? 0) + (cfg.program_base ?? 0)
    const progNum = Math.max(0, Math.min(127, progIdx % 128))
    const msb     = cfg.msb ? (s.msb ?? 0) : Math.max(0, Math.floor(progIdx / 128))
    return progNum === (pcProgram ?? 0) && msb === (pcMsb ?? 0)
  })
  if (idx < 0) return

  activeSound.value = list[idx]
  nextTick(() => {
    presetButtonsEl.value?.querySelectorAll('button')[idx]
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

// Auto-scroll/highlight whenever the sound list (re)loads and no sound has
// been manually clicked yet — not just on an empty→non-empty transition,
// since switching devices can reload the list without it ever passing
// through empty (e.g. both devices resolve to a same-sized bank), which
// left the previously selected device's item highlighted instead of the
// newly selected device's actual current patch.
watch(filteredSounds, (list) => {
  if (list.length && !activeSound.value) scrollToCurrentProgram()
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

// ── Send to a device (real MIDI output or virtual) ───────────────
function sendToDeviceMessage(data, deviceName) {
  const dn = deviceName ?? selectedDeviceName.value
  if (!dn) return
  midiService.sendRawToDeviceByName(dn, data)
}

// ── Send from catalog ───────────────────────────────────────────
function selectSound(sound) {
  activeSound.value = sound
  sendCatalogSound(sound)
}

function sendCatalogSound(sound) {
  const reg = selectedReg.value
  if (!reg) return
  const cfg    = bankConfig.value
  // Clamp a stale/OMNI (-1) pcChannel to 0 — there's no incoming channel to
  // pass through for an outgoing Program Change, so -1 can't be embedded
  // directly into the status byte (0xC0 | -1 is an invalid negative byte
  // that MIDIOutput.send() silently rejects, i.e. no PC ever goes out).
  const ch     = Math.max(0, reg.pcChannel ?? 0)
  const pField = cfg?.program_field ?? 'program'
  const prog   = sound[pField] ?? 0

  // Normalize to 0-indexed absolute MIDI program number using program_base,
  // then derive bank MSB and within-bank PC consistently from the same index.
  // This avoids the old formula's bug at multiples of 128 (e.g. prog=128 gave
  // MSB=1,PC=0 instead of MSB=0,PC=127 for 1-indexed catalogs with base=-1).
  let msb, lsb, progNum

  if (cfg?.bankSelect === 'emulatorx3') {
    // Emulator X3 wire format: CC64 = 0 (fixed), CC32 = bank, PC = program.
    // "msb"/"lsb" below are recorded purely as the raw bytes sent (for
    // currentPcState display / scrollToCurrentProgram matching); CC0 (bank
    // MSB) is intentionally never sent for this device.
    const bank = sound[cfg.bank_field ?? 'bank'] ?? 0
    msb = 0
    lsb = bank
    progNum = Math.max(0, Math.min(127, prog))

    sendToDeviceMessage([0xB0 | ch, 64, 0])
    sendToDeviceMessage([0xB0 | ch, 32, bank])
    sendToDeviceMessage([0xC0 | ch, progNum])
  } else {
    // Normalize to 0-indexed absolute MIDI program number using program_base,
    // then derive bank MSB and within-bank PC consistently from the same index.
    // This avoids the old formula's bug at multiples of 128 (e.g. prog=128 gave
    // MSB=1,PC=0 instead of MSB=0,PC=127 for 1-indexed catalogs with base=-1).
    const progIdx = prog + (cfg.program_base ?? 0)           // 0-indexed absolute program
    msb = cfg.msb ? (sound.msb ?? 0) : Math.max(0, Math.floor(progIdx / 128))
    lsb = cfg.lsb ? (sound.lsb ?? 0) : 0
    progNum = Math.max(0, Math.min(127, progIdx % 128))
    sendToDeviceMessage([0xB0 | ch, 0,  sound.msb])
    sendToDeviceMessage([0xB0 | ch, 32, sound.lsb])
    sendToDeviceMessage([0xC0 | ch, progNum])
  }

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
  const ch = Math.max(0, reg.pcChannel ?? 0)
  if (sendMsb.value) sendToDeviceMessage([0xB0 | ch, 0,  manualMsb.value])
  if (sendLsb.value) sendToDeviceMessage([0xB0 | ch, 32, manualLsb.value])
  const prog = Math.max(0, Math.min(127, manualProg.value - 1))
  sendToDeviceMessage([0xC0 | ch, prog])
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
let _unsubDevicePcOpen = null
let _unsubDevicePcSelect = null

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

    const deviceName = paramName.slice('pc_dev_'.length)
    if (deviceName && devices.value.some(d => d.name === deviceName)) {
      selectDevice(deviceName)
    }
  })
}

onMounted(() => {
  startScrollCCListener()
  _startDevMidiListener()
  _pcNavHandler = e => navigatePresetList(e.detail?.delta ?? 1)
  window.addEventListener('device-pc-preset-navigate', _pcNavHandler)
  // Opened from elsewhere (e.g. the MIDI Flow canvas's per-device shortcut icon)
  // with a specific device already in mind — jump straight to it.
  _unsubDevicePcOpen = on('device-pc-open', ({ deviceName }) => {
    uiStore.openPanel('device-program-change')
    selectDevice(deviceName)
  })
  // Like 'device-pc-open' but doesn't steal focus — used by the Instrument
  // Cockpit so clicking an instrument (or one of its channels) there just
  // gets it ready to view here, without popping this panel to the front.
  _unsubDevicePcSelect = on('device-pc-select', ({ deviceName, channel }) => {
    selectDevice(deviceName)
    if (channel != null) setChannel(channel)
  })
})
onUnmounted(() => {
  _unsubScrollCC?.()
  _unsubDevMidi?.()
  if (_pcNavHandler) window.removeEventListener('device-pc-preset-navigate', _pcNavHandler)
  _unsubDevicePcOpen?.()
  _unsubDevicePcSelect?.()
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

function promptAddVirtualInstrument() {
  const name = window.prompt('Virtual instrument name:')
  if (name && name.trim()) {
    midiStore.addVirtualInstrument(name.trim())
  }
}

// ── Copy channel map (another virtual instrument = same standalone app) ──
const showCopyMapPicker = ref(false)

// Other virtual instruments the current selection's 16-channel patch map
// can be copied onto — useful when two virtual instrument entries route to
// the same standalone synth/app and should share the same per-channel patches.
const copyMapTargets = computed(() =>
  midiStore.virtualInstruments
    .map(v => v.name)
    .filter(name => name !== selectedDeviceName.value)
)

function copyChannelMapTo(targetName) {
  const reg = selectedReg.value
  if (!reg || !targetName) return
  if (!midiStore.routingConfig.registrations[targetName]) return

  const pcChannels = reg.pcChannels ? JSON.parse(JSON.stringify(reg.pcChannels)) : {}
  midiStore.updateRegistration(targetName, 'pcChannels', pcChannels)
  midiStore.updateRegistration(targetName, 'pcChannel',  reg.pcChannel ?? 0)
  midiStore.updateRegistration(targetName, 'pcBank',     reg.pcBank ?? '')
  midiStore.updateRegistration(targetName, 'pcProgram',  reg.pcProgram ?? 0)
  midiStore.updateRegistration(targetName, 'pcMsb',      reg.pcMsb ?? 0)
  midiStore.updateRegistration(targetName, 'pcLsb',      reg.pcLsb ?? 0)

  showCopyMapPicker.value = false
  const count = Object.keys(pcChannels).length
  showPcNotification(targetName, `Map copied from ${selectedDeviceName.value} (${count} ch)`)
}

const pcNotification = ref({ visible: false, device: '', name: '', category: '' })
let _pcNotifTimer = null

function showPcNotification(device, name, category = '') {
  clearTimeout(_pcNotifTimer)
  pcNotification.value = { visible: true, device, name, category }
  _pcNotifTimer = setTimeout(() => { pcNotification.value.visible = false }, 3000)
}

// ── Performance Sets (shared + IndexedDB-backed via usePerformanceSets) ──
const activeSetId    = ref(null)
const showSaveDialog = ref(false)
const newSetName     = ref('')
const newSetNameInput = ref(null)

function openSaveDialog() {
  newSetName.value = ''
  showSaveDialog.value = true
  nextTick(() => newSetNameInput.value?.focus())
}

async function saveCurrentSet() {
  const name = newSetName.value.trim()
  if (!name) return
  await saveSet(name)
  showSaveDialog.value = false
}

async function recallSet(set) {
  activeSetId.value = set.id
  await recallStoredSet(set)
  // Scroll/highlight the preset list to the *active* channel's restored patch
  // (scrollToCurrentProgram re-evaluates per-channel saved state).
  nextTick(() => scrollToCurrentProgram())
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
      <div class="bg-neutral-900 max-h-[94vh] border border-violet-500/30 rounded-xl overflow-hidden shadow-[0_0_50px_rgba(139,92,246,0.15)] flex flex-col" :style="panelStyle" v-show="!isMinimized" @mousedown.capture="bringToFront">

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
            <MacOsButtons @close="emit('close')" @minimize="toggleMinimize" @maximize="maximize" />
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

              <div v-if="visibleDevices.length === 0" class="flex-1 flex flex-col items-center justify-center p-6 text-center gap-2">
                <p class="text-[10px] font-mono text-neutral-600 italic">{{ devices.length > 0 ? 'No devices currently online.' : 'No devices with PC enabled.' }}</p>
                <p v-if="devices.length === 0" class="text-[9px] font-mono text-neutral-700">Enable PC on devices in MIDI Matrix.</p>
              </div>

              <button
                v-for="dev in visibleDevices"
                :key="dev.name"
                @click="selectDevice(dev.name)"
                @contextmenu.prevent="openMenu($event, { name: 'pc_dev_' + dev.name, label: dev.name })"
                :class="[
                  'relative w-full text-left px-4 py-3 border-b border-neutral-800/60 transition-all',
                  selectedDeviceName === dev.name
                    ? 'bg-violet-500/10 border-l-2 border-l-violet-500'
                    : 'hover:bg-white/[0.03] border-l-2 border-l-transparent'
                ]"
              >
                <!-- MIDI learning indicator -->
                <span
                  v-if="mappingStore.learningParamName === 'pc_dev_' + dev.name"
                  class="absolute top-1 right-1 w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)] animate-pulse pointer-events-none"
                />
                <div class="flex items-center gap-2.5">
                  <div class="w-1.5 h-1.5 rounded-full shrink-0 mt-0.5 bg-emerald-500" />
                  <div class="flex flex-col min-w-0 flex-1">
                    <span class="text-[11px] font-bold text-white truncate leading-tight">{{ dev.name }}</span>
                    <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <template v-if="(midiStore.routingMatrix?.[MidiSource.UI] ?? []).includes(dev.name)">
                        <span class="text-[7px] font-black uppercase tracking-tighter px-1 py-0.5 rounded bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center gap-0.5">
                          <Layers class="w-2 h-2" />UI
                        </span>
                        <span class="text-[7px] font-mono text-neutral-500">{{ presetStore.lastPreset?.name ?? '—' }}</span>
                      </template>
                      <template v-else-if="midiStore.virtualInstruments.some(v => v.name === dev.name)">
                        <span class="text-[7px] font-black uppercase tracking-tighter px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-0.5">
                          <Radio class="w-2 h-2" />Virtual
                        </span>
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
                    </div>
                  </div>
                </div>
              </button>

              <!-- Add Virtual Instrument -->
              <div class="px-4 py-2 border-b border-neutral-800/60">
                <button
                  @click="promptAddVirtualInstrument"
                  class="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-neutral-700 text-neutral-500 hover:text-amber-400 hover:border-amber-500/40 hover:bg-amber-500/5 transition-all text-[9px] font-bold uppercase tracking-wider"
                >
                  <Plus class="w-3 h-3" />
                  Add Virtual Instrument
                </button>
              </div>
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

                  <!-- Copy this device's 16-channel patch map onto another virtual instrument
                       (e.g. two virtual instrument entries routed to the same standalone synth app) -->
                  <div v-if="virtualActiveChannels.length > 0 && copyMapTargets.length > 0" class="relative">
                    <button
                      @click="showCopyMapPicker = !showCopyMapPicker"
                      title="Copy this 16-channel patch map to another virtual instrument"
                      :class="[
                        'flex items-center gap-1 px-2 py-1 rounded-lg border text-[8px] font-black uppercase tracking-widest transition-all',
                        showCopyMapPicker
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                          : 'bg-neutral-900 border-neutral-700 text-neutral-500 hover:border-amber-500/40 hover:text-amber-400'
                      ]"
                    >
                      <Copy class="w-2.5 h-2.5" />
                      Copy Map
                    </button>
                    <div
                      v-if="showCopyMapPicker"
                      class="absolute left-0 top-full mt-1 z-20 w-52 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl overflow-hidden"
                    >
                      <div class="px-3 py-1.5 border-b border-neutral-800">
                        <span class="text-[7px] font-mono text-neutral-500 uppercase tracking-widest">Copy map to…</span>
                      </div>
                      <button
                        v-for="name in copyMapTargets"
                        :key="name"
                        @click="copyChannelMapTo(name)"
                        class="w-full text-left px-3 py-2 text-[10px] font-bold text-neutral-300 hover:bg-amber-500/10 hover:text-amber-300 transition-colors truncate"
                      >
                        {{ name }}
                      </button>
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-[9px] font-mono text-neutral-500 uppercase">Channel</span>
                  <!-- Virtual instrument: one button per MIDI channel, each independently assignable -->
                  <template v-if="virtualActiveChannels.length > 0">
                    <div class="flex gap-1 flex-wrap max-w-[420px]">
                      <button
                        v-for="ch in virtualActiveChannels"
                        :key="ch"
                        @click="setChannel(ch + 1)"
                        :class="[
                          'flex flex-col items-center gap-0.5 px-2 py-1 rounded border text-[8px] font-black font-mono transition-all',
                          (selectedReg?.pcChannel ?? 0) === ch
                            ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-[0_0_6px_rgba(245,158,11,0.2)]'
                            : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200'
                        ]"
                        :title="selectedReg?.pcChannels?.[ch]?.soundName || `CH ${ch + 1} — no preset assigned`"
                      >
                        <span>CH {{ ch + 1 }}</span>
                        <span class="text-[6px] font-mono font-normal max-w-[48px] truncate leading-none"
                          :class="selectedReg?.pcChannels?.[ch]?.soundName ? 'text-amber-400/70' : 'text-neutral-700'">
                          {{ selectedReg?.pcChannels?.[ch]?.soundName ?? '—' }}
                        </span>
                      </button>
                    </div>
                  </template>
                  <!-- Single channel: normal dropdown -->
                  <template v-else>
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
                  </template>
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
                <div v-if="multiChannelDisplayState.length > 0" class="shrink-0 mx-6 mt-3 bg-black/30 border border-violet-500/20 rounded-2xl overflow-hidden">
                  <div class="px-4 py-2 border-b border-neutral-900 flex items-center justify-between">
                    <span class="text-[8px] font-mono text-violet-400/70 uppercase tracking-widest">Current Program Change</span>
                    <span v-if="selectedReg?.isMulti || virtualActiveChannels.length > 1"
                      class="text-[7px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter"
                      :class="virtualActiveChannels.length > 1
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'">
                      {{ virtualActiveChannels.length > 1 ? `${virtualActiveChannels.length}-Channel` : 'Multi-Timbral' }}
                    </span>
                  </div>
                  <!-- Multi-channel / Multi-timbral: capped height with own scroll, rows clickable to switch active channel -->
                  <div v-if="selectedReg?.isMulti || virtualActiveChannels.length > 0"
                    class="overflow-y-auto custom-scrollbar divide-y divide-neutral-900/60" style="max-height: 20vh">
                    <div
                      v-for="entry in multiChannelDisplayState"
                      :key="entry.ch"
                      @click="setChannel(entry.ch + 1)"
                      :class="[
                        'flex items-center gap-3 px-4 py-2.5 transition-colors cursor-pointer',
                        entry.ch === (selectedReg?.pcChannel ?? 0)
                          ? virtualActiveChannels.length > 0 ? 'bg-amber-500/10' : 'bg-violet-500/10'
                          : 'hover:bg-white/[0.03]'
                      ]"
                      :title="`Click to send next preset to CH ${entry.ch + 1}`"
                    >
                      <span :class="[
                        'shrink-0 w-10 text-center text-[8px] font-black rounded px-1.5 py-0.5 border',
                        entry.ch === (selectedReg?.pcChannel ?? 0)
                          ? virtualActiveChannels.length > 0
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-violet-500/20 text-violet-300 border-violet-500/40'
                          : 'bg-neutral-900 text-neutral-500 border-neutral-800'
                      ]">CH {{ entry.ch + 1 }}</span>
                      <span class="text-[10px] font-bold truncate flex-1"
                        :class="entry.soundName ? 'text-white' : 'text-neutral-600 italic'">
                        {{ entry.soundName ?? 'No preset' }}
                      </span>
                      <div class="flex items-center gap-2 shrink-0">
                        <span v-if="entry.category" class="text-[7px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400/80 border border-violet-500/20">{{ entry.category }}</span>
                        <span v-if="entry.bank" class="text-[7px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded bg-neutral-900 text-neutral-500 border border-neutral-800/60">{{ entry.bank }}</span>
                        <span v-if="entry.program != null" class="text-[8px] font-black font-mono text-violet-400/80 text-right whitespace-nowrap">
                          <template v-if="(entry.msb ?? 0) > 0 || (entry.lsb ?? 0) > 0">B{{ entry.msb ?? 0 }}·</template>PC{{ entry.program }}
                        </span>
                      </div>
                    </div>
                  </div>
                  <!-- Mono: single row -->
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
                <!-- Legacy (no pcTemplate assigned): show whenever there's a catalog match,
                     already-imported banks, or the device is virtual — same as before.
                     Explicit template assigned: always show, even before anything's been
                     imported yet, so the one relevant import button stays reachable. -->
                <template v-if="selectedReg?.pcTemplate || catalogDevice || userBanks.length > 0 || midiStore.virtualInstruments.some(v => v.name === selectedDeviceName)">
                  <!-- Hidden file input for .mfprojz import -->
                  <input
                    ref="importInput"
                    type="file"
                    accept=".mfprojz"
                    class="hidden"
                    @change="onImportFile"
                  />
                  <!-- Hidden file input for Emulator X3 import -->
                  <input
                    ref="importInputX3"
                    type="file"
                    accept=".txt"
                    class="hidden"
                    @change="onImportEmulatorX3File"
                  />
                  <!-- Hidden file input for Standard JSON import -->
                  <input
                    ref="importInputStandard"
                    type="file"
                    accept=".json,application/json"
                    class="hidden"
                    @change="onImportStandardFile"
                  />
                  <!-- Hidden file input for Kawai K1 import -->
                  <input
                    ref="importInputKawaiK1"
                    type="file"
                    accept=".syx"
                    class="hidden"
                    @change="onImportKawaiK1File"
                  />
                  <!-- Hidden file input for Access Virus SysEx import -->
                  <input
                    ref="importInputVirusSyx"
                    type="file"
                    accept=".syx"
                    class="hidden"
                    @change="onImportVirusSyxFile"
                  />
                  <!-- Hidden file input for Arturia db.db3 import -->
                  <input
                    ref="importInputArturia"
                    type="file"
                    accept=".db3,.db"
                    class="hidden"
                    @change="onImportArturiaFile"
                  />

                  <div class="shrink-0 px-6 mt-4">
                    <div class="flex items-center justify-between mb-2">
                      <label class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest">Bank</label>
                      <div class="flex items-center gap-1.5">
                        <!-- Emulator X3 import button — explicit template, or (legacy) any virtual instrument -->
                        <button
                          v-if="selectedReg?.pcTemplate === 'emulatorx3' || (!selectedReg?.pcTemplate && midiStore.virtualInstruments.some(v => v.name === selectedDeviceName))"
                          @click="triggerImportX3"
                          :disabled="isImportingX3"
                          class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/40 transition-all text-[8px] font-black uppercase tracking-wider disabled:opacity-40"
                          title="Import an Emulator X3 preset/sample listing (.txt)"
                        >
                          <Loader2 v-if="isImportingX3" class="w-2.5 h-2.5 animate-spin" />
                          <FileText v-else class="w-2.5 h-2.5" />
                          Import Emulator X3
                        </button>
                        <!-- .mfprojz import button — explicit template, or legacy (unset) -->
                        <button
                          v-if="!selectedReg?.pcTemplate || selectedReg.pcTemplate === 'mfprojz'"
                          @click="triggerImport"
                          :disabled="isImporting"
                          class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-500/10 border border-teal-500/25 text-teal-400 hover:bg-teal-500/20 hover:border-teal-500/40 transition-all text-[8px] font-black uppercase tracking-wider disabled:opacity-40"
                          title="Import a .mfprojz bank from Arturia MIDI Control Center"
                        >
                          <Loader2 v-if="isImporting" class="w-2.5 h-2.5 animate-spin" />
                          <Upload v-else class="w-2.5 h-2.5" />
                          Import .mfprojz
                        </button>
                        <!-- Standard JSON import button — explicit template, or legacy (unset) -->
                        <button
                          v-if="!selectedReg?.pcTemplate || selectedReg.pcTemplate === 'json'"
                          @click="triggerImportStandard"
                          :disabled="isImportingStandard"
                          class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/10 border border-sky-500/25 text-sky-400 hover:bg-sky-500/20 hover:border-sky-500/40 transition-all text-[8px] font-black uppercase tracking-wider disabled:opacity-40"
                          title="Import a bank from a Standard JSON file — an array of { pc: 1-128, name } entries"
                        >
                          <Loader2 v-if="isImportingStandard" class="w-2.5 h-2.5 animate-spin" />
                          <Braces v-else class="w-2.5 h-2.5" />
                          Import JSON
                        </button>
                        <!-- Kawai K1 import button — explicit template only (no legacy fallback, it's brand new) -->
                        <button
                          v-if="selectedReg?.pcTemplate === 'kawai-k1'"
                          @click="triggerImportKawaiK1"
                          :disabled="isImportingKawaiK1"
                          class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-400 hover:bg-rose-500/20 hover:border-rose-500/40 transition-all text-[8px] font-black uppercase tracking-wider disabled:opacity-40"
                          title="Import a Kawai K1 SysEx bank dump (.syx)"
                        >
                          <Loader2 v-if="isImportingKawaiK1" class="w-2.5 h-2.5 animate-spin" />
                          <FileText v-else class="w-2.5 h-2.5" />
                          Import Kawai K1
                        </button>
                        <!-- Access Virus .syx import button — explicit template only -->
                        <button
                          v-if="selectedReg?.pcTemplate === 'access-virus'"
                          @click="triggerImportVirusSyx"
                          :disabled="isImportingVirusSyx"
                          class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-pink-500/10 border border-pink-500/25 text-pink-400 hover:bg-pink-500/20 hover:border-pink-500/40 transition-all text-[8px] font-black uppercase tracking-wider disabled:opacity-40"
                          title="Import an Access Virus SysEx bank dump (.syx)"
                        >
                          <Loader2 v-if="isImportingVirusSyx" class="w-2.5 h-2.5 animate-spin" />
                          <FileText v-else class="w-2.5 h-2.5" />
                          Import Access Virus
                        </button>
                        <!-- Arturia db.db3 import button — explicit template only (no legacy fallback, it's brand new) -->
                        <button
                          v-if="selectedReg?.pcTemplate === 'arturia'"
                          @click="triggerImportArturia"
                          :disabled="isImportingArturia"
                          class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/25 text-indigo-400 hover:bg-indigo-500/20 hover:border-indigo-500/40 transition-all text-[8px] font-black uppercase tracking-wider disabled:opacity-40"
                          title="Import Analog Lab playlists from an Arturia db.db3 database — every playlist becomes its own bank"
                        >
                          <Loader2 v-if="isImportingArturia" class="w-2.5 h-2.5 animate-spin" />
                          <Database v-else class="w-2.5 h-2.5" />
                          Import Arturia DB
                        </button>
                      </div>
                    </div>

                    <!-- Import error -->
                    <div v-if="importError" class="mb-2 flex items-center gap-2 bg-red-950/40 border border-red-500/30 rounded-lg px-3 py-1.5">
                      <AlertTriangle class="w-3 h-3 text-red-400 shrink-0" />
                      <span class="text-[9px] font-mono text-red-400">{{ importError }}</span>
                    </div>

                    <!-- Arturia import success summary -->
                    <div v-if="importArturiaSummary" class="mb-2 flex items-center gap-2 bg-emerald-950/40 border border-emerald-500/30 rounded-lg px-3 py-1.5">
                      <CheckCircle2 class="w-3 h-3 text-emerald-400 shrink-0" />
                      <span class="text-[9px] font-mono text-emerald-400">{{ importArturiaSummary }}</span>
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
                        <div v-if="pendingImportSource === 'access-virus'" class="flex items-center gap-1.5 shrink-0">
                          <span class="text-[8px] font-mono text-neutral-500 uppercase tracking-widest">Bank</span>
                          <input
                            v-model.number="pendingBankLsb"
                            type="number"
                            min="0" max="127"
                            class="w-14 bg-black/60 border border-neutral-700 rounded-lg px-2 py-1.5 text-[11px] text-teal-200 font-mono outline-none focus:border-teal-500/60 text-center"
                          />
                        </div>
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
                          class="ml-0.5 text-neutral-600 hover:text-red-400 transition-colors"
                          title="Delete this bank"
                        >
                          <Trash2 class="w-2.5 h-2.5" />
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
                  <div v-if="selectedBank && isLoading" class="flex items-center justify-center py-12 gap-2">
                    <Loader2 class="w-5 h-5 text-violet-400 animate-spin" />
                    <span class="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Loading catalog…</span>
                  </div>

                  <!-- Catalog: preset list -->
                  <template v-else-if="selectedBank && filteredSounds.length > 0">
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
                  <div v-else-if="selectedBank && !isLoading" class="flex flex-col items-center justify-center py-12 gap-2">
                    <Music2 class="w-6 h-6 text-neutral-700" />
                    <span class="text-[10px] font-mono text-neutral-600">No presets found</span>
                  </div>

                  <!-- Manual fallback (no catalog match, nothing selected) -->
                  <div v-else-if="!catalogDevice && !selectedBank" class="bg-neutral-900/30 border border-neutral-800 rounded-2xl p-5 space-y-4">
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
