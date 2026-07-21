<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { RefreshCw, Cable, Network, Check, ListMusic, Music2, Keyboard as KeyboardIcon, Music, Zap, Layers, Drum, Cpu, X , Gamepad2, Save, FolderOpen, ChevronDown, Trash2, Disc3, ExternalLink, Activity, Filter } from 'lucide-vue-next'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import { useDeviceRegistry } from '@/composables/useDeviceRegistry'
import { useMidiStore } from '@/stores/useMidiStore'
import { useUiStore } from '@/stores/useUiStore'
import { useMidiFlowConfigsStore } from '@/stores/useMidiFlowConfigsStore'
import { midiService, MidiSource } from '@/core/midi/midi-service'
import { dispatch } from '@/types/events'
import { DEVICE_TYPE_META, typeMeta } from '@/lib/device-type-meta'
import MidiSyncFlow from '@/components/MidiSyncFlow.vue'
import MacOsButtons from '@/components/ui/MacOsButtons.vue'

const midiStore  = useMidiStore()
const uiStore    = useUiStore()
const midiFlowConfigsStore = useMidiFlowConfigsStore()
const { devices: registryDevices } = useDeviceRegistry()
const activeTab  = ref('routing')  // 'routing' | 'sync'

function deviceType(name) {
  if (midiStore.virtualInstruments.some(v => v.name === name)) return 'virtual'
  return registryDevices.value.find(d => d.name === name)?.type ?? 'instrument-single'
}

const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront, maximize } = useDraggableResizable({
  storageKey:    'SYCORE_POS_MIDI_FLOW',
  initialWidth:  900,
  initialHeight: 580,
  minWidth:      640,
  minHeight:     400,
  zIndex:        130,
  minimizeLabel: 'MIDI Flow',
  openRef:       () => uiStore.isMidiFlowOpen,
})

// ── Registered devices (matches DeviceListPanel source of truth) ──
const allDevices = computed(() =>
  Object.values(midiStore.routingConfig?.registrations ?? {}).map(reg => ({
    name:   reg.name,
    hasIn:  reg.inEnabled,
    hasOut: reg.outEnabled,
    type:   deviceType(reg.name),
  }))
)

// ── Canvas state ──
const canvasEl    = ref(null)
const canvasNodes = ref([])   // { id, name, hasIn, hasOut, x, y, inChannel, outChannel }
const cables      = ref([])   // { id, fromId, toId }
let nextId = 1

const NODE_W = 220
const PORT_Y = 16  // port dot center Y within node (center of header row)

const CHANNELS = Array.from({ length: 16 }, (_, i) => i + 1)

const FLAGS = [
  { key: 'sync',      label: 'SYNC' },
  { key: 'transport', label: 'TRSP' },
  { key: 'notes',     label: 'NOTE' },
  { key: 'cc',        label: 'CC'   },
  { key: 'pc',        label: 'PC'   },
]

const MIDI_APPS = [
  { name: 'Step Sequencer',    sourceId: MidiSource.SEQUENCER,  icon: ListMusic,    hasIn: true },
  { name: 'Chord Sequencer',   sourceId: MidiSource.CHORD_PROG, icon: Music2,       hasIn: true },
  { name: 'Virtual Keyboard',  sourceId: MidiSource.KEYBOARD,   icon: KeyboardIcon, hasIn: true },
  { name: 'Arpeggiator',       sourceId: MidiSource.ARP,        icon: Music     },
  { name: 'Transport / Clock', sourceId: MidiSource.TRANSPORT,  icon: Zap       },
  { name: 'Sound Engine',      sourceId: MidiSource.UI,         icon: Layers    },
  { name: 'Drum Machine',      sourceId: MidiSource.DRUM_MACHINE, icon: Drum,   hasIn: true },
  { name: 'Sampler',           sourceId: MidiSource.SAMPLER,    icon: Disc3,        hasIn: true },
]

const appIconMap = Object.fromEntries(MIDI_APPS.map(a => [a.sourceId, a.icon]))

// ── App node "open app" shortcut — maps a MIDI_APPS sourceId to the uiStore panel id ──
const APP_PANEL_ID = {
  [MidiSource.SEQUENCER]:    'sequencer',
  [MidiSource.CHORD_PROG]:   'chord-prog',
  [MidiSource.KEYBOARD]:     'keyboard',
  [MidiSource.ARP]:          'arp',
  [MidiSource.UI]:           'sound-engine',
  [MidiSource.DRUM_MACHINE]: 'drum-machine',
  [MidiSource.SAMPLER]:      'sampler',
}
function openApp(sourceId) {
  const panelId = APP_PANEL_ID[sourceId]
  if (panelId) uiStore.openPanel(panelId)
}

// ── Instrument device node "open Program Change panel" shortcut ──
function openDevicePc(deviceName) {
  dispatch('device-pc-open', { deviceName })
}

function virtualInstrumentPort(name) {
  return midiStore.virtualInstruments.find(v => v.name === name)?.midiOutputPort ?? ''
}

function toggleNodeOutChannel(node, ch) {
  if (!node.outChannels) node.outChannels = []
  const i = node.outChannels.indexOf(ch)
  if (i === -1) node.outChannels.push(ch)
  else node.outChannels.splice(i, 1)
}

// ── Sidebar drag-to-canvas ──
function onSidebarDragStart(e, device) {
  e.dataTransfer.setData('midi-device', JSON.stringify(device))
  e.dataTransfer.effectAllowed = 'copy'
}

function onCanvasDrop(e) {
  e.preventDefault()
  const raw = e.dataTransfer.getData('midi-device')
  if (!raw) return
  const device = JSON.parse(raw)
  const rect = canvasEl.value.getBoundingClientRect()
  canvasNodes.value.push({
    id: nextId++,
    name: device.name,
    sourceId: device.sourceId ?? null,   // null = hardware device
    type: device.sourceId ? null : (device.type ?? deviceType(device.name)),
    hasIn:  device.hasIn,
    hasOut: true,
    x: Math.max(0, e.clientX - rect.left - NODE_W / 2),
    y: Math.max(0, e.clientY - rect.top - PORT_Y),
    inChannel:  -1,
    outChannel: -1,
    outChannels: [],
    sync: true, transport: true, notes: true, cc: true, pc: true,
  })
}

function removeNode(id) {
  const node = canvasNodes.value.find(n => n.id === id)
  canvasNodes.value = canvasNodes.value.filter(n => n.id !== id)
  cables.value      = cables.value.filter(c => c.fromId !== id && c.toId !== id)
  // The removed node no longer appears in canvasNodes for finish() to walk,
  // so its routing keys need clearing explicitly (otherwise a stale route
  // to/from a deleted node would keep sending after auto-apply). Both
  // directions: output routing (it was a source of hardware/app output)
  // and input routing (it was a source of device/app→app input routing —
  // e.g. removing an app after wiring it into another app's IN).
  if (node) {
    midiStore.setRouting(node.sourceId ?? node.name, [])
    midiStore.setInputRouting(node.sourceId ?? node.name, [])
  }
}

// ── Node dragging ──
const draggingNode = ref(null)  // { id, ox, oy }

function onNodeMousedown(e, node) {
  if (['SELECT', 'BUTTON'].includes(e.target.tagName)) return
  e.preventDefault()
  e.stopPropagation()
  const rect = canvasEl.value.getBoundingClientRect()
  draggingNode.value = {
    id: node.id,
    ox: e.clientX - rect.left - node.x,
    oy: e.clientY - rect.top  - node.y,
  }
}

// ── Port positions (canvas-relative coords) ──
const outPos = (n) => ({ x: n.x + NODE_W, y: n.y + PORT_Y })
const inPos  = (n) => ({ x: n.x,          y: n.y + PORT_Y })

// ── Cable drawing ──
const pendingCable = ref(null)  // { fromId, mx, my }

function onOutPortMousedown(e, node) {
  e.preventDefault()
  e.stopPropagation()
  const rect = canvasEl.value.getBoundingClientRect()
  pendingCable.value = {
    fromId: node.id,
    mx: e.clientX - rect.left,
    my: e.clientY - rect.top,
  }
}

function onInPortMouseup(e, node) {
  if (!pendingCable.value || pendingCable.value.fromId === node.id) {
    pendingCable.value = null
    return
  }
  const exists = cables.value.some(c => c.fromId === pendingCable.value.fromId && c.toId === node.id)
  if (!exists) cables.value.push({ id: nextId++, fromId: pendingCable.value.fromId, toId: node.id })
  pendingCable.value = null
}

function removeCable(id) { cables.value = cables.value.filter(c => c.id !== id) }

function finish() {
  // Group destinations by source, keeping the whole cable object (not just
  // the target id) so the app-routing branch below can read cable.filter.
  const bySource = new Map()
  for (const cable of cables.value) {
    if (!bySource.has(cable.fromId)) bySource.set(cable.fromId, [])
    bySource.get(cable.fromId).push(cable)
  }

  const outputPorts = midiService.getOutputs()

  // Device→device Thru filters (MIDI Flow's "MIDI Controller → Instrument"
  // note-range splits) — rebuilt fresh from the whole canvas each apply,
  // same as routingMatrix/inputRouting, then committed once at the end.
  const newOutputFilters = {}

  // Walk every node still on the canvas (not just ones with active cables)
  // so a source that just lost its last cable gets its routing explicitly
  // cleared instead of left stale from a previous apply.
  for (const src of canvasNodes.value) {
    const dstCables = bySource.get(src.id) ?? []
    const hwCables  = dstCables.filter(c => !canvasNodes.value.find(n => n.id === c.toId)?.sourceId)
    const appCables = dstCables.filter(c =>  canvasNodes.value.find(n => n.id === c.toId)?.sourceId)

    if (!src.sourceId && hwCables.length > 0) {
      midiStore.addRegistration(src.name)
      midiStore.updateRegistration(src.name, 'inEnabled', true)
      midiStore.updateRegistration(src.name, 'inChannel', src.inChannel)
    }

    const outputNames = []
    for (const cable of hwCables) {
      const dst = canvasNodes.value.find(n => n.id === cable.toId)
      if (!dst) continue
      // Resolve the canonical Web MIDI port name so the routing matrix
      // entry matches the exact name that Web MIDI reports at send time.
      const webMidiPort = outputPorts.find(p => p.name === dst.name)
      const canonicalName = webMidiPort?.name ?? dst.name
      midiStore.addRegistration(canonicalName)
      midiStore.updateRegistration(canonicalName, 'outEnabled',  true)
      midiStore.updateRegistration(canonicalName, 'outChannel',  dst.outChannel)
      midiStore.updateRegistration(canonicalName, 'outChannels', dst.outChannels ?? [])
      midiStore.updateRegistration(canonicalName, 'clock',       dst.sync)
      midiStore.updateRegistration(canonicalName, 'transport',   dst.transport)
      midiStore.updateRegistration(canonicalName, 'notes',       dst.notes)
      midiStore.updateRegistration(canonicalName, 'cc',          dst.cc)
      midiStore.updateRegistration(canonicalName, 'pc',          dst.pc)
      midiStore.updateRegistration(canonicalName, 'pcEnabled',   dst.pc)
      outputNames.push(canonicalName)

      // Note-range filter for device→device cables (Controller → Instrument,
      // real or virtual) — app-sourced cables use inputRouting instead (see
      // appCables below), so this only applies when the source is hardware.
      if (!src.sourceId && cable.filter) {
        const { lowNote = 0, highNote = 127 } = cable.filter
        if (lowNote > 0 || highNote < 127) {
          newOutputFilters[`${src.name}→${canonicalName}`] = cable.filter
        }
      }
    }

    // Wire the routing matrix: apps use MidiSource enum, hardware uses device name
    midiStore.setRouting(src.sourceId ?? src.name, outputNames)

    // Device/app → app input routing (MIDI FLOW's MIDI IN to apps). Keyed by
    // the source's routing key — a hardware/virtual device name, or another
    // app's MidiSource id when the source is itself an app (app-to-app
    // routing, e.g. Chord Sequencer → Virtual Keyboard). inputRouting is
    // just string-keyed so both share one data model and one gate
    // (isDeviceRoutedToApp) — see useMidiStore.ts's app-note broadcast for
    // how an app's generated notes reach a downstream app's listener.
    const inputEntries = appCables.map(cable => {
      const dst = canvasNodes.value.find(n => n.id === cable.toId)
      return { app: dst.sourceId, filter: cable.filter }
    })
    midiStore.setInputRouting(src.sourceId ?? src.name, inputEntries)
  }

  // Sync each device/virtual-instrument node's own settings (channel
  // config, flags) even when nothing is cabled to it on the canvas — the
  // loop above only ever touches a dst node's settings as a side effect of
  // walking hwCables, so a device relying on Broadcast Mode (the default —
  // actively receiving notes with zero explicit cables) never got its
  // Multi-CH out / OUT ch / flag changes committed at all.
  for (const node of canvasNodes.value) {
    if (node.sourceId) continue
    const webMidiPort = outputPorts.find(p => p.name === node.name)
    const canonicalName = webMidiPort?.name ?? node.name
    const isRegistered = !!midiStore.routingConfig?.registrations?.[canonicalName]
    if (!isRegistered) continue
    midiStore.updateRegistration(canonicalName, 'outChannel',  node.outChannel)
    midiStore.updateRegistration(canonicalName, 'outChannels', node.outChannels ?? [])
    midiStore.updateRegistration(canonicalName, 'clock',       node.sync)
    midiStore.updateRegistration(canonicalName, 'transport',   node.transport)
    midiStore.updateRegistration(canonicalName, 'notes',       node.notes)
    midiStore.updateRegistration(canonicalName, 'cc',          node.cc)
    midiStore.updateRegistration(canonicalName, 'pc',          node.pc)
    midiStore.updateRegistration(canonicalName, 'pcEnabled',   node.pc)
  }

  midiStore.setOutputRouteFilters(newOutputFilters)
}

// ── Canvas mouse events ──
function onCanvasMousemove(e) {
  if (!draggingNode.value && !pendingCable.value) return
  const rect = canvasEl.value.getBoundingClientRect()
  const cx = e.clientX - rect.left
  const cy = e.clientY - rect.top
  if (draggingNode.value) {
    const n = canvasNodes.value.find(n => n.id === draggingNode.value.id)
    if (n) { n.x = Math.max(0, cx - draggingNode.value.ox); n.y = Math.max(0, cy - draggingNode.value.oy) }
  }
  if (pendingCable.value) { pendingCable.value.mx = cx; pendingCable.value.my = cy }
}

function onCanvasMouseup() { draggingNode.value = null; pendingCable.value = null }

function initFromStore() {
  const regs         = midiStore.routingConfig?.registrations ?? {}
  const matrix       = midiStore.routingMatrix ?? {}
  const inputRouting = midiStore.inputRouting ?? {}
  const hasInputRouting = Object.values(inputRouting).some(v => v?.length)
  if (!Object.keys(regs).length && !Object.values(matrix).some(v => v?.length) && !hasInputRouting) return

  const appNames   = new Set(MIDI_APPS.map(a => a.name))
  const nodeMap    = new Map()
  const sourceKeys = new Set(Object.keys(matrix).filter(k => matrix[k]?.length))
  const destNames  = new Set(Object.values(matrix).flat().filter(Boolean))

  // Device/app → app input routing (MIDI FLOW's MIDI IN to apps): any
  // source with input-routing entries — a hardware device, or another app
  // (app-to-app routing) — is also a canvas "source" (it now originates a
  // cable, even if it has no hardware-output cables); an app fed by any
  // source becomes a valid node too, even with zero outgoing routing.
  const inputSourceKeys = new Set(Object.keys(inputRouting).filter(k => inputRouting[k]?.length))
  const inputDestApps = new Set(Object.values(inputRouting).flat().map(e => e.app))

  const sourceNodes = []  // left column — things that send MIDI out
  const destNodes   = []  // right column — things that receive MIDI in

  // Hardware device nodes — skip unconnected ones and any app names leaked in
  for (const reg of Object.values(regs)) {
    if (appNames.has(reg.name)) { midiStore.removeRegistration(reg.name); continue }
    const isSource = sourceKeys.has(reg.name) || inputSourceKeys.has(reg.name)
    const isDest   = destNames.has(reg.name)
    if (!isSource && !isDest) continue

    const id = nextId++
    nodeMap.set(reg.name, id)
    const node = {
      id, name: reg.name, sourceId: null,
      type: deviceType(reg.name),
      hasIn: reg.inEnabled, hasOut: reg.outEnabled,
      x: 0, y: 0,
      inChannel: reg.inChannel ?? -1, outChannel: reg.outChannel ?? -1,
      // Copy, not reference — node.outChannels is mutated in place by
      // toggleNodeOutChannel (splice/push). Sharing the store's own array
      // here would let that mutation silently corrupt the live registration
      // before finish()/updateRegistration ever runs its before/after diff.
      outChannels: [...(reg.outChannels ?? [])],
      sync: reg.clock ?? true, transport: reg.transport ?? true,
      notes: reg.notes ?? true, cc: reg.cc ?? true, pc: reg.pc ?? true,
    }
    if (isDest) destNodes.push(node)
    else sourceNodes.push(node)
  }

  // MIDI App nodes — placed if they have active output routing (source),
  // route their own notes into another app (also a source — app-to-app
  // routing), or are fed by a device/app's input routing (destination); an
  // app that's any kind of source stays on the source side, matching
  // hardware's isDest-takes-priority convention above.
  for (const app of MIDI_APPS) {
    const isOutputSource = sourceKeys.has(app.sourceId)
    const isInputSource  = inputSourceKeys.has(app.sourceId)
    const isInputDest    = inputDestApps.has(app.sourceId)
    if (!isOutputSource && !isInputSource && !isInputDest) continue

    const id = nextId++
    nodeMap.set(app.sourceId, id)
    const node = {
      id, name: app.name, sourceId: app.sourceId,
      hasIn: app.hasIn ?? false, hasOut: true,
      x: 0, y: 0,
      inChannel: -1, outChannel: -1,
      sync: true, transport: true, notes: true, cc: true, pc: true,
    }
    if (isOutputSource || isInputSource) sourceNodes.push(node)
    else destNodes.push(node)
  }

  // Layout: sources on left, destinations on right
  const HW_ROW_H  = 140
  const APP_ROW_H = 52
  const LEFT_X    = 20
  const RIGHT_X   = NODE_W + 140

  let leftY = 20
  sourceNodes.forEach(node => {
    node.x = LEFT_X; node.y = leftY
    leftY += node.sourceId ? APP_ROW_H : HW_ROW_H
    canvasNodes.value.push(node)
  })
  let rightY = 20
  destNodes.forEach(node => {
    node.x = RIGHT_X; node.y = rightY
    rightY += node.sourceId ? APP_ROW_H : HW_ROW_H
    canvasNodes.value.push(node)
  })

  // Cables from routing matrix
  for (const [sourceKey, outputNames] of Object.entries(matrix)) {
    const fromId = nodeMap.get(sourceKey)
    if (!fromId) continue
    for (const outName of (outputNames ?? [])) {
      const toId = nodeMap.get(outName)
      if (toId) cables.value.push({ id: nextId++, fromId, toId })
    }
  }

  // Cables from device/app → app input routing (sourceKey is a device name
  // or, for app-to-app routing, another app's MidiSource id — nodeMap holds
  // both kinds of node under the same key space, so this needs no branching)
  for (const [sourceKey, entries] of Object.entries(inputRouting)) {
    const fromId = nodeMap.get(sourceKey)
    if (!fromId) continue
    for (const entry of (entries ?? [])) {
      const toId = nodeMap.get(entry.app)
      if (toId) cables.value.push({ id: nextId++, fromId, toId, filter: entry.filter })
    }
  }
}

// Bulk canvas repopulation (initial load, reload) shouldn't trigger the
// auto-apply watcher below — it would just write the same state straight
// back to the store it was just read from. Only genuine edits (cable
// connect/disconnect, channel/flag changes, node add/remove) should apply.
let suppressAutoApply = false
function withSuppressedAutoApply(fn) {
  suppressAutoApply = true
  fn()
  nextTick(() => { suppressAutoApply = false })
}

function reloadConfig() {
  withSuppressedAutoApply(() => {
    canvasNodes.value = []
    cables.value = []
    nextId = 1
    initFromStore()
  })
  currentConfigName.value = ''
}

// ── Auto-apply routing on any Input/Output change in the canvas ──
const routingSignature = computed(() => JSON.stringify([
  canvasNodes.value.map(n => ({
    id: n.id, name: n.name, sourceId: n.sourceId,
    inChannel: n.inChannel, outChannel: n.outChannel, outChannels: n.outChannels,
    sync: n.sync, transport: n.transport, notes: n.notes, cc: n.cc, pc: n.pc,
  })),
  cables.value.map(c => ({ fromId: c.fromId, toId: c.toId, filter: c.filter })),
]))

watch(routingSignature, () => {
  if (suppressAutoApply) return
  finish()
})

// ── Sidebar section collapse state ──
const showDevicesSection = ref(true)
const showAppsSection    = ref(true)

// ── Named saved canvas configurations ──
const showConfigsMenu  = ref(false)
const newConfigName    = ref('')
const currentConfigName = ref('')   // name of the loaded/last-saved config, shown in the footer

// Persist whichever config is active so a page reload can restore the label
// (not the canvas — initFromStore() already correctly rebuilds the canvas
// from the live routing state, which reflects any edits made after loading
// this config; re-loading the named config's own saved snapshot here could
// silently discard those). Whatever sets currentConfigName — load, save,
// overwrite, or clearing it — flows through this one watcher instead of
// each call site remembering to persist it individually.
watch(currentConfigName, (name) => {
  midiFlowConfigsStore.setLastConfigName(name)
})

function cloneCanvas() {
  return {
    nodes:  JSON.parse(JSON.stringify(canvasNodes.value)),
    cables: JSON.parse(JSON.stringify(cables.value)),
  }
}

function saveCurrentConfig() {
  const name = newConfigName.value.trim()
  if (!name) return
  const { nodes, cables: c } = cloneCanvas()
  midiFlowConfigsStore.saveConfig(name, nodes, c)
  currentConfigName.value = name
  newConfigName.value = ''
}

// Overwrite an existing saved config with the current canvas state — the
// floppy-icon "quick save" action, as opposed to saveCurrentConfig()'s
// "save as" (which names a new or different entry).
function overwriteConfig(name) {
  const { nodes, cables: c } = cloneCanvas()
  midiFlowConfigsStore.saveConfig(name, nodes, c)
  currentConfigName.value = name
}

function loadConfig(name) {
  const entry = midiFlowConfigsStore.getConfig(name)
  if (!entry) return
  canvasNodes.value = JSON.parse(JSON.stringify(entry.nodes))
  cables.value      = JSON.parse(JSON.stringify(entry.cables))
  const maxId = Math.max(0, ...canvasNodes.value.map(n => n.id), ...cables.value.map(c => c.id))
  nextId = maxId + 1
  currentConfigName.value = name
  showConfigsMenu.value = false
}

function deleteConfigEntry(e, name) {
  e.stopPropagation()
  midiFlowConfigsStore.deleteConfig(name)
  if (currentConfigName.value === name) currentConfigName.value = ''
}

onMounted(() => {
  window.addEventListener('mouseup', onCanvasMouseup)
  // Reload the last-used saved configuration's own snapshot on startup —
  // takes priority over deriving the canvas from the live routing state,
  // so a reload always lands back on exactly what was last explicitly
  // saved/loaded, discarding any unsaved live edits from before the reload.
  const lastName = midiFlowConfigsStore.lastConfigName
  if (lastName && midiFlowConfigsStore.hasConfig(lastName)) {
    loadConfig(lastName)
  } else if (!canvasNodes.value.length) {
    withSuppressedAutoApply(() => initFromStore())
  }
})
onUnmounted(() => window.removeEventListener('mouseup', onCanvasMouseup))

// ── SVG bezier path ──
function bezier(x1, y1, x2, y2) {
  const cx = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${cx} ${y1} ${cx} ${y2} ${x2} ${y2}`
}

function cablePath(cable) {
  const from = canvasNodes.value.find(n => n.id === cable.fromId)
  const to   = canvasNodes.value.find(n => n.id === cable.toId)
  if (!from || !to) return ''
  const p1 = outPos(from), p2 = inPos(to)
  return bezier(p1.x, p1.y, p2.x, p2.y)
}

function isAppCable(cable) {
  return !!canvasNodes.value.find(n => n.id === cable.fromId)?.sourceId
}

// ── Note-range filter popover (any cable landing on an app's IN port —
// device→app or app→app — gets the editable filter instead of click-to-
// delete; "keyboard split" for device sources, same idea for app sources) ──
function isDeviceToAppCable(cable) {
  const to = canvasNodes.value.find(n => n.id === cable.toId)
  return !!(to && to.sourceId)
}

// Device→device cables (Controller → Instrument, real or virtual) — also
// filterable, enforced in the hardware Thru path (see
// MidiRouter.routeMessageToOutputs / MidiService.routeMessageToVirtualOutputs)
// rather than an app's own input gate, since neither end is an app.
function isHwToHwCable(cable) {
  return !isAppCable(cable) && !isDeviceToAppCable(cable)
}

function isCableFilterable(cable) {
  return isDeviceToAppCable(cable) || isHwToHwCable(cable)
}

const editingCableId = ref(null)

function onCableClick(cable) {
  if (isCableFilterable(cable)) {
    if (!cable.filter) cable.filter = { lowNote: 0, highNote: 127 }
    editingCableId.value = editingCableId.value === cable.id ? null : cable.id
  } else {
    removeCable(cable.id)
  }
}

function cableMidpoint(cable) {
  const from = canvasNodes.value.find(n => n.id === cable.fromId)
  const to   = canvasNodes.value.find(n => n.id === cable.toId)
  if (!from || !to) return { x: 0, y: 0 }
  const p1 = outPos(from), p2 = inPos(to)
  return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
}

const editingCable = computed(() => cables.value.find(c => c.id === editingCableId.value) ?? null)
const editingCablePos = computed(() => editingCable.value ? cableMidpoint(editingCable.value) : { x: 0, y: 0 })

function removeEditingCable() {
  if (editingCable.value) removeCable(editingCable.value.id)
  editingCableId.value = null
}

function pendingPath() {
  if (!pendingCable.value) return ''
  const from = canvasNodes.value.find(n => n.id === pendingCable.value.fromId)
  if (!from) return ''
  const p1 = outPos(from)
  return bezier(p1.x, p1.y, pendingCable.value.mx, pendingCable.value.my)
}
</script>

<template>
  <div v-show="uiStore.isMidiFlowOpen && !isMinimized" class="fixed select-none" :style="panelStyle" @mousedown="bringToFront">
    <!-- resize handles -->
    <div class="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-50" @mousedown.stop="onResizeStart($event, 'se')" />
    <div class="absolute bottom-0 left-3 right-4 h-1.5 cursor-s-resize z-50"  @mousedown.stop="onResizeStart($event, 's')" />
    <div class="absolute top-3 bottom-4 right-0 w-1.5 cursor-e-resize z-50"   @mousedown.stop="onResizeStart($event, 'e')" />

    <div class="h-full flex flex-col bg-neutral-950 border border-synth-neon/30 rounded-2xl overflow-hidden shadow-2xl">

      <!-- Header -->
      <div
        class="flex items-center gap-3 px-4 py-3 bg-neutral-900/60 border-b border-neutral-800 cursor-grab active:cursor-grabbing shrink-0"
        @mousedown.stop="onDragStart"
      >
        <span class="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-synth-neon shrink-0">
          <Cable class="w-4 h-4" /> MIDI FLOW
        </span>
        <!-- Tabs -->
        <!-- <div class="flex gap-1 bg-neutral-900 border border-neutral-800 rounded-lg p-0.5" @mousedown.stop>
          <button
            @click="activeTab = 'routing'"
            class="px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-md transition-colors"
            :class="activeTab === 'routing' ? 'bg-synth-neon text-black' : 'text-neutral-500 hover:text-white'"
          >Routing</button>
          <button
            @click="activeTab = 'sync'"
            class="px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-md transition-colors"
            :class="activeTab === 'sync' ? 'bg-synth-neon text-black' : 'text-neutral-500 hover:text-white'"
          >Sync Flow</button>
        </div> -->
        <span v-if="activeTab === 'routing'" class="text-[9px] font-mono text-neutral-600 flex-1 truncate">
          Drag devices → canvas &nbsp;·&nbsp; OUT● → ●IN to connect &nbsp;·&nbsp; click cable to remove
        </span>
        <span class="flex-1" v-else />

        <!-- Saved canvas configurations -->
        <div v-if="activeTab === 'routing'" class="relative shrink-0" @mousedown.stop>
          <button
            @click="showConfigsMenu = !showConfigsMenu"
            :class="showConfigsMenu ? 'text-synth-neon' : 'text-neutral-400 hover:text-synth-neon'"
            class="flex items-center gap-1 p-1 transition-colors"
            title="Saved configurations"
          >
            <FolderOpen class="w-4 h-4" />
            <ChevronDown class="w-3 h-3" />
          </button>

          <div v-if="showConfigsMenu">
            <div class="fixed inset-0 z-40" @click="showConfigsMenu = false" />
            <div class="absolute top-full right-0 mt-2 w-64 bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl z-50 overflow-hidden">
              <div class="p-2.5 border-b border-neutral-800 flex items-center gap-1.5">
                <input
                  v-model="newConfigName"
                  type="text"
                  placeholder="Config name…"
                  @keydown.enter="saveCurrentConfig"
                  class="flex-1 min-w-0 bg-black border border-neutral-700 rounded px-2 py-1 text-[10px] text-white font-mono outline-none focus:border-synth-neon/60 placeholder:text-neutral-700"
                />
                <button
                  @click="saveCurrentConfig"
                  :disabled="!newConfigName.trim()"
                  title="Save current canvas as a new configuration"
                  class="shrink-0 flex items-center gap-1 px-2 py-1 rounded bg-synth-neon/10 border border-synth-neon/30 text-synth-neon text-[9px] font-black uppercase tracking-wider hover:bg-synth-neon/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Save class="w-2.5 h-2.5" /> Save
                </button>
              </div>
              <div class="max-h-64 overflow-y-auto custom-scrollbar">
                <div v-if="!midiFlowConfigsStore.configs.length" class="px-3 py-4 text-center text-[9px] font-mono text-neutral-700 uppercase tracking-widest">
                  No saved configurations
                </div>
                <button
                  v-for="cfg in midiFlowConfigsStore.configs"
                  :key="cfg.name"
                  @click="loadConfig(cfg.name)"
                  class="group w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-neutral-800/60 transition-colors"
                >
                  <span class="min-w-0">
                    <span class="flex items-center gap-1 min-w-0">
                      <span class="block text-[10px] font-bold text-white truncate">{{ cfg.name }}</span>
                      <span v-if="cfg.name === currentConfigName" class="shrink-0 text-[7px] font-black uppercase tracking-wider px-1 py-0.5 rounded bg-synth-neon/15 text-synth-neon">Current</span>
                    </span>
                    <span class="block text-[8px] font-mono text-neutral-600">{{ cfg.nodes.length }} nodes · {{ cfg.cables.length }} cables</span>
                  </span>
                  <span class="shrink-0 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                    <span
                      @click.stop="overwriteConfig(cfg.name)"
                      class="text-neutral-600 hover:text-synth-neon transition-colors"
                      title="Overwrite with current canvas"
                    >
                      <Save class="w-3 h-3" />
                    </span>
                    <span
                      @click.stop="deleteConfigEntry($event, cfg.name)"
                      class="text-neutral-600 hover:text-red-400 transition-colors"
                      title="Delete this configuration"
                    >
                      <Trash2 class="w-3 h-3" />
                    </span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <button v-if="activeTab === 'routing'" @click="reloadConfig" title="Reload config" class="p-1 text-neutral-400 hover:text-synth-neon transition-colors shrink-0">
          <RefreshCw class="w-4 h-4" />
        </button>
        <button
          @click="uiStore.isMidiControllerDesignerOpen = !uiStore.isMidiControllerDesignerOpen"
          :class="uiStore.isMidiControllerDesignerOpen ? 'text-violet-400' : 'text-neutral-400 hover:text-violet-400'"
          class="p-1 transition-colors shrink-0"
          title="Controller Designer"
        >
          <Gamepad2 class="w-4 h-4 hover:text-synth-neon" />
        </button>
        <MacOsButtons @close="uiStore.isMidiFlowOpen = false" @minimize="toggleMinimize" @maximize="maximize" />
      </div>

      <!-- Sync Flow tab -->
      <div v-show="activeTab === 'sync'" class="flex-1 overflow-hidden">
        <MidiSyncFlow />
      </div>

      <!-- Routing tab body -->
      <div v-show="activeTab === 'routing'" class="flex flex-1 overflow-hidden">

        <!-- Sidebar -->
        <div class="w-44 shrink-0 bg-neutral-900/40 border-r border-neutral-800 flex flex-col overflow-y-auto custom-scrollbar p-3 gap-1.5">

          <!-- MIDI Devices -->
          <button
            @click="showDevicesSection = !showDevicesSection"
            class="flex items-center justify-between px-1 group bg-red-900/60 p-1 rounded"
          >
            <span class="text-[8px] font-bold uppercase tracking-widest text-neutral-300 group-hover:text-neutral-400 transition-colors">MIDI Devices</span>
            <ChevronDown
              class="w-3 h-3 text-neutral-600 group-hover:text-neutral-400 transition-transform"
              :class="showDevicesSection ? '' : '-rotate-90'"
            />
          </button>
          <template v-if="showDevicesSection">
            <!-- Type legend -->
            <div class="flex flex-col gap-0.5 px-1 mb-1.5">
              <span v-for="(meta, key) in DEVICE_TYPE_META" :key="key" class="flex items-center gap-1.5 text-[7px] font-mono text-neutral-500">
                <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="meta.dot" />{{ meta.label }}
              </span>
            </div>
            <div v-if="!allDevices.length" class="text-[9px] text-neutral-700 font-mono text-center pt-2">
              No devices detected
            </div>
            <div
              v-for="dev in allDevices"
              :key="dev.name"
              draggable="true"
              @dragstart="onSidebarDragStart($event, dev)"
              class="flex flex-col gap-1 px-3 py-2 rounded-lg border border-l-2 border-neutral-800 bg-neutral-900 hover:bg-neutral-800/60 cursor-grab active:cursor-grabbing transition-colors"
              :class="typeMeta(dev.type).accent"
            >
              <span class="flex items-center gap-1.5 min-w-0">
                <component :is="typeMeta(dev.type).icon" class="w-2.5 h-2.5 shrink-0" :class="typeMeta(dev.type).text" />
                <span class="text-[9px] font-mono font-bold text-white truncate leading-tight">{{ dev.name }}</span>
              </span>
              <div class="flex gap-1">
                <span v-if="dev.hasIn"  class="text-[7px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 uppercase tracking-wide">IN</span>
                <span v-if="dev.hasOut" class="text-[7px] font-bold px-1.5 py-0.5 rounded bg-synth-neon/20 text-synth-neon uppercase tracking-wide">OUT</span>
              </div>
            </div>
          </template>

          <!-- MIDI Apps -->
          <button
            @click="showAppsSection = !showAppsSection"
            class="flex items-center justify-between px-1 mt-2 group bg-emerald-900/60 p-1 rounded"
          >
            <span class="text-[8px] font-bold uppercase tracking-widest text-white-600 group-hover:text-neutral-400 transition-colors">MIDI Apps</span>
            <ChevronDown
              class="w-3 h-3 text-neutral-600 group-hover:text-neutral-400 transition-transform"
              :class="showAppsSection ? '' : '-rotate-90'"
            />
          </button>
          <template v-if="showAppsSection">
            <div
              v-for="app in MIDI_APPS"
              :key="app.sourceId"
              draggable="true"
              @dragstart="onSidebarDragStart($event, { name: app.name, sourceId: app.sourceId, hasIn: app.hasIn ?? false, hasOut: true })"
              class="flex items-center gap-2 px-3 py-2 rounded-lg border border-purple-900/50 bg-purple-950/20 hover:border-purple-500/50 hover:bg-purple-900/20 cursor-grab active:cursor-grabbing transition-colors"
            >
              <component :is="app.icon" class="w-3 h-3 text-purple-400 shrink-0" />
              <span class="text-[9px] font-mono font-bold text-purple-200 truncate leading-tight">{{ app.name }}</span>
            </div>
          </template>
        </div>

        <!-- Canvas -->
        <div
          ref="canvasEl"
          class="relative flex-1 overflow-auto custom-scrollbar"
          style="background-color:#09090b; background-image:radial-gradient(circle,#121212 1px,transparent 1px); background-size:24px 24px;"
          @dragover.prevent
          @drop="onCanvasDrop"
          @mousemove="onCanvasMousemove"
          @mouseup="onCanvasMouseup"
        >
          <!-- Empty hint -->
          <div v-if="!canvasNodes.length" class="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span class="text-[10px] font-mono text-neutral-700 uppercase tracking-widest">Drag devices here to build your routing</span>
          </div>

          <!-- SVG cable layer -->
          <svg
            class="absolute inset-0 w-full h-full overflow-visible"
            style="pointer-events:none; z-index:1"
          >
            <g v-for="cable in cables" :key="cable.id">
              <!-- wide invisible hit area -->
              <path
                :d="cablePath(cable)"
                fill="none" stroke="transparent" stroke-width="14"
                style="pointer-events:stroke; cursor:pointer;"
                @click="onCableClick(cable)"
              />
              <!-- visible cable -->
              <path
                :d="cablePath(cable)"
                fill="none"
                :stroke="isDeviceToAppCable(cable) ? '#3b82f6' : (isAppCable(cable) ? '#8b5cf6' : '#a3e635')"
                stroke-width="2" stroke-opacity="0.65"
                :stroke-dasharray="isCableFilterable(cable) && cable.filter && (cable.filter.lowNote > 0 || cable.filter.highNote < 127) ? '5 3' : null"
                style="pointer-events:none;"
              />
            </g>
            <!-- pending cable while dragging -->
            <path
              v-if="pendingCable"
              :d="pendingPath()"
              fill="none" stroke="#a3e635" stroke-width="2" stroke-opacity="0.4" stroke-dasharray="6 4"
            />
          </svg>

          <!-- Filter icon — a dedicated, always-visible click target for each
               device→app cable's note-range popover. Clicking the thin cable
               line itself can be finicky near the ports (a mousedown that
               starts on/near a port is a drag gesture, not a click), so this
               gives a reliable button instead. -->
          <button
            v-for="cable in cables.filter(isCableFilterable)"
            :key="'filter:' + cable.id"
            @click.stop="onCableClick(cable)"
            @mousedown.stop
            class="absolute z-20 w-5 h-5 rounded-full border flex items-center justify-center transition-colors"
            :class="cable.filter && (cable.filter.lowNote > 0 || cable.filter.highNote < 127)
              ? 'bg-blue-500/30 border-blue-400/60 text-blue-200 hover:bg-blue-500/50'
              : 'bg-neutral-900 border-neutral-700 text-neutral-500 hover:text-blue-300 hover:border-blue-400/50'"
            :style="{ left: cableMidpoint(cable).x + 'px', top: cableMidpoint(cable).y + 'px', transform: 'translate(-50%, -50%)' }"
            title="Set note-range filter (keyboard split)"
          >
            <Filter class="w-2.5 h-2.5" />
          </button>

          <!-- Note-range filter popover (device→app cables — "keyboard split") -->
          <template v-if="editingCable">
            <div class="fixed inset-0 z-30" @click="editingCableId = null" />
            <div
              class="absolute z-40 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl p-2.5 flex flex-col gap-2"
              :style="{ left: editingCablePos.x + 'px', top: editingCablePos.y + 'px', transform: 'translate(-50%, -50%)' }"
              @mousedown.stop
            >
              <div class="flex items-center justify-between gap-4">
                <span class="text-[8px] font-mono text-neutral-500 uppercase tracking-widest">Note Range</span>
                <button @click="editingCableId = null" class="text-neutral-600 hover:text-white transition-colors">
                  <X class="w-3 h-3" />
                </button>
              </div>
              <div class="flex items-end gap-2">
                <div class="flex flex-col gap-0.5">
                  <span class="text-[7px] font-bold uppercase tracking-widest text-neutral-500">Low</span>
                  <input
                    type="number" min="0" max="127" v-model.number="editingCable.filter.lowNote"
                    class="w-14 bg-black border border-neutral-700 rounded px-1.5 py-1 text-[10px] text-white font-mono outline-none focus:border-synth-neon/60"
                  />
                </div>
                <span class="text-neutral-700 pb-1.5">–</span>
                <div class="flex flex-col gap-0.5">
                  <span class="text-[7px] font-bold uppercase tracking-widest text-neutral-500">High</span>
                  <input
                    type="number" min="0" max="127" v-model.number="editingCable.filter.highNote"
                    class="w-14 bg-black border border-neutral-700 rounded px-1.5 py-1 text-[10px] text-white font-mono outline-none focus:border-synth-neon/60"
                  />
                </div>
              </div>
              <button
                @click="removeEditingCable"
                class="flex items-center justify-center gap-1 text-[8px] font-black uppercase tracking-wider text-red-400/80 hover:text-red-400 transition-colors pt-1.5 border-t border-neutral-800"
              >
                <X class="w-2.5 h-2.5" /> Remove Connection
              </button>
            </div>
          </template>

          <!-- Nodes -->
          <div
            v-for="node in canvasNodes"
            :key="node.id"
            class="absolute"
            :style="{ left: node.x + 'px', top: node.y + 'px', width: NODE_W + 'px', zIndex: 2 }"
            @mousedown="onNodeMousedown($event, node)"
          >
            <!-- IN port (hardware, or an app that supports MIDI IN) -->
            <svg
              v-if="!node.sourceId || node.hasIn"
              class="absolute"
              :style="{ left: '-9px', top: (PORT_Y - 8) + 'px', width: '18px', height: '18px', zIndex: 3, pointerEvents: 'all', cursor: 'crosshair' }"
              @mouseup.stop="onInPortMouseup($event, node)"
            >
              <circle cx="9" cy="9" r="5" fill="#0f172a" stroke="#3b82f6" stroke-width="2" />
              <title>IN</title>
            </svg>

            <!-- Card -->
            <div
              class="rounded-xl overflow-hidden shadow-xl transition-colors cursor-grab active:cursor-grabbing border"
              :class="node.sourceId
                ? 'bg-purple-950/30 border-purple-800/50 hover:border-purple-500/50'
                : typeMeta(node.type).card"
            >
              <!-- Card header -->
              <div
                class="flex items-center justify-between px-3 py-2 border-b"
                :class="node.sourceId ? 'bg-purple-900/30 border-purple-900/50' : typeMeta(node.type).header"
              >
                <span class="flex items-center gap-1.5 flex-1 pr-2 min-w-0">
                  <component v-if="node.sourceId" :is="appIconMap[node.sourceId]" class="w-3 h-3 text-purple-400 shrink-0" />
                  <component v-else :is="typeMeta(node.type).icon" class="w-3 h-3 shrink-0" :class="typeMeta(node.type).text" />
                  <span class="text-[9px] font-mono font-bold truncate leading-tight"
                    :class="node.sourceId ? 'text-purple-200' : 'text-white'"
                  >{{ node.name }}</span>
                </span>
                <span class="flex items-center gap-1.5 shrink-0">
                  <button
                    v-if="node.sourceId && APP_PANEL_ID[node.sourceId]"
                    @click.stop="openApp(node.sourceId)"
                    class="text-purple-400/70 hover:text-purple-300 transition-colors"
                    title="Open app"
                  >
                    <ExternalLink class="w-3 h-3" />
                  </button>
                  <button
                    v-if="!node.sourceId && node.type !== 'controller'"
                    @click.stop="openDevicePc(node.name)"
                    class="transition-colors"
                    :class="typeMeta(node.type).text + ' opacity-70 hover:opacity-100'"
                    title="Open Program Change panel"
                  >
                    <ExternalLink class="w-3 h-3" />
                  </button>
                  <button
                    @click.stop="removeNode(node.id)"
                    class="text-neutral-600 hover:text-red-400 transition-colors"
                  >
                    <X class="w-3 h-3" />
                  </button>
                </span>
              </div>
              <!-- Hardware-only: flags + channels -->
              <template v-if="!node.sourceId">
                <div class="flex gap-1 px-3 pt-2 flex-wrap" @mousedown.stop>
                  <button
                    v-for="flag in FLAGS" :key="flag.key"
                    @click.stop="node[flag.key] = !node[flag.key]"
                    class="px-1.5 py-0.5 text-[7px] font-black uppercase tracking-widest rounded border transition-colors"
                    :class="node[flag.key] ? 'bg-synth-neon/10 border-synth-neon/50 text-synth-neon' : 'bg-neutral-900 border-neutral-700 text-neutral-600'"
                  >{{ flag.label }}</button>
                </div>
                <!-- Virtual instruments aren't real WebMIDI ports — bind which
                     real output physically carries their MIDI data. -->
                <div v-if="node.type === 'virtual'" class="flex flex-col gap-0.5 px-3 pt-2" @mousedown.stop>
                  <span class="text-[7px] font-bold uppercase tracking-widest text-amber-400/70">Output port</span>
                  <select
                    :value="virtualInstrumentPort(node.name)"
                    @change="e => midiStore.setVirtualInstrumentPort(node.name, e.target.value)"
                    class="bg-neutral-950 border border-neutral-700 rounded text-[9px] font-mono focus:outline-none cursor-pointer px-1 py-0.5 w-full"
                  >
                    <option value="" class="bg-neutral-950">— none —</option>
                    <option v-for="p in midiStore.outputs" :key="p.name" :value="p.name" class="bg-neutral-950">{{ p.name }}</option>
                  </select>
                </div>
                <div class="flex items-start gap-2 px-3 py-2">
                  <div class="flex flex-col gap-0.5 flex-1">
                    <span class="text-[7px] font-bold uppercase tracking-widest text-blue-400/70">IN ch</span>
                    <select v-model.number="node.inChannel" class="bg-neutral-950 border border-neutral-700 rounded text-[9px] font-mono focus:outline-none cursor-pointer px-1 py-0.5 w-full" @mousedown.stop>
                      <option :value="-1" class="bg-neutral-950">OMNI</option>
                      <option v-for="ch in CHANNELS" :key="ch" :value="ch - 1" class="bg-neutral-950">{{ ch }}</option>
                    </select>
                  </div>
                  <div class="flex flex-col gap-0.5 flex-1">
                    <span class="text-[7px] font-bold uppercase tracking-widest text-synth-neon/70 text-right">OUT ch</span>
                    <select
                      v-model.number="node.outChannel"
                      :disabled="node.outChannels?.length > 0"
                      :title="node.outChannels?.length > 0 ? 'Overridden by the multi-channel selection below' : ''"
                      class="bg-neutral-950 border border-neutral-700 rounded text-[9px] font-mono focus:outline-none cursor-pointer px-1 py-0.5 w-full disabled:opacity-30 disabled:cursor-not-allowed"
                      @mousedown.stop
                    >
                      <option :value="-1" class="bg-neutral-950">OMNI</option>
                      <option v-for="ch in CHANNELS" :key="ch" :value="ch - 1" class="bg-neutral-950">{{ ch }}</option>
                    </select>
                  </div>
                </div>
                <!-- Multi-timbral fanout — duplicate outgoing notes/CC/PC onto
                     every selected channel instead of just one (e.g. a 16-part
                     virtual rack split across CH 1, 2, 4). Overrides OUT ch
                     above when at least one channel is selected. -->
                <div v-if="node.type === 'virtual'" class="flex flex-col gap-1 px-3 pb-2" @mousedown.stop>
                  <span class="text-[7px] font-bold uppercase tracking-widest text-amber-400/70">
                    Multi-CH out{{ node.outChannels?.length ? ` (${node.outChannels.length})` : '' }}
                  </span>
                  <div class="grid grid-cols-8 gap-0.5">
                    <button
                      v-for="ch in CHANNELS" :key="ch"
                      @click.stop="toggleNodeOutChannel(node, ch - 1)"
                      :title="`Duplicate onto channel ${ch}`"
                      class="text-[8px] font-mono py-0.5 rounded border transition-colors"
                      :class="node.outChannels?.includes(ch - 1)
                        ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                        : 'bg-neutral-900 border-neutral-700 text-neutral-600 hover:border-neutral-600'"
                    >{{ ch }}</button>
                  </div>
                </div>
              </template>
            </div>

            <!-- OUT port -->
            <svg
              class="absolute"
              :style="{ right: '-9px', top: (PORT_Y - 8) + 'px', width: '18px', height: '18px', zIndex: 3, pointerEvents: 'all', cursor: 'crosshair' }"
              @mousedown.stop="onOutPortMousedown($event, node)"
            >
              <circle cx="9" cy="9" r="5" fill="#0f172a" stroke="#a3e635" stroke-width="2" />
              <title>OUT — drag to connect</title>
            </svg>
          </div>
        </div>
      </div>

      <!-- Footer (routing tab only) -->
      <div v-show="activeTab === 'routing'" class="flex items-center justify-between px-4 py-2.5 border-t border-neutral-800 bg-neutral-900/40 shrink-0">
        <span class="flex items-center gap-2 text-[9px] font-mono text-neutral-600 min-w-0">
          <span class="flex items-center gap-1 text-emerald-400 font-black uppercase tracking-wider shrink-0" title="Routing changes apply automatically">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Live
          </span>
          <span class="shrink-0">{{ cables.length }} connection{{ cables.length !== 1 ? 's' : '' }}</span>
          <template v-if="currentConfigName">
            <span class="text-neutral-700 shrink-0">·</span>
            <FolderOpen class="w-3 h-3 text-neutral-600 shrink-0" />
            <span class="truncate text-neutral-400">{{ currentConfigName }}</span>
            <button
              @click="overwriteConfig(currentConfigName)"
              title="Save changes to this configuration"
              class="shrink-0 text-neutral-600 hover:text-synth-neon transition-colors"
            >
              <Save class="w-3 h-3" />
            </button>
          </template>
        </span>
        <span class="flex items-center gap-2 shrink-0">
          <button
            @click="uiStore.openPanel('midi-monitor')"
            title="Open MIDI Monitor — watch live MIDI messages while you configure routing"
            class="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg border border-neutral-700 text-neutral-400 hover:text-synth-neon hover:border-synth-neon/50 transition-colors"
          >
            <Activity class="w-3.5 h-3.5" /> Monitor
          </button>
          <button
            :disabled="!cables.length"
            @click="finish"
            title="Routing already applies automatically — use this to force a re-sync"
            class="flex items-center gap-2 px-4 py-1.5 text-xs font-black uppercase tracking-widest rounded-lg transition-colors"
            :class="cables.length
              ? 'bg-synth-neon text-black hover:bg-synth-neon/80'
              : 'bg-neutral-800 text-neutral-600 cursor-not-allowed'"
          >
            <Check class="w-3.5 h-3.5" /> Re-apply
          </button>
        </span>
      </div>
    </div>
  </div>
</template>
