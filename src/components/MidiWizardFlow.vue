<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { RefreshCw, Cable, Network, Check, ListMusic, Music2, Keyboard as KeyboardIcon, Music, Zap, Layers, Drum, Cpu, X , Gamepad2, Save, FolderOpen, ChevronDown, Trash2 } from 'lucide-vue-next'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import { useMidiStore } from '@/stores/useMidiStore'
import { useUiStore } from '@/stores/useUiStore'
import { useMidiFlowConfigsStore } from '@/stores/useMidiFlowConfigsStore'
import { midiService, MidiSource } from '@/core/midi/midi-service'
import MidiSyncFlow from '@/components/MidiSyncFlow.vue'
import MacOsButtons from '@/components/ui/MacOsButtons.vue'

const midiStore  = useMidiStore()
const uiStore    = useUiStore()
const midiFlowConfigsStore = useMidiFlowConfigsStore()
const activeTab  = ref('routing')  // 'routing' | 'sync'

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
  { name: 'Step Sequencer',    sourceId: MidiSource.SEQUENCER,  icon: ListMusic },
  { name: 'Chord Sequencer',   sourceId: MidiSource.CHORD_PROG, icon: Music2    },
  { name: 'Virtual Keyboard',  sourceId: MidiSource.KEYBOARD,   icon: KeyboardIcon },
  { name: 'Arpeggiator',       sourceId: MidiSource.ARP,        icon: Music     },
  { name: 'Transport / Clock', sourceId: MidiSource.TRANSPORT,  icon: Zap       },
  { name: 'UI / Preview',      sourceId: MidiSource.UI,         icon: Layers    },
  { name: 'Drum Machine',      sourceId: MidiSource.DRUM_MACHINE, icon: Drum    },
]

const appIconMap = Object.fromEntries(MIDI_APPS.map(a => [a.sourceId, a.icon]))

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
    hasIn:  device.sourceId ? false : device.hasIn,
    hasOut: true,
    x: Math.max(0, e.clientX - rect.left - NODE_W / 2),
    y: Math.max(0, e.clientY - rect.top - PORT_Y),
    inChannel:  -1,
    outChannel: -1,
    sync: true, transport: true, notes: true, cc: true, pc: true,
  })
}

function removeNode(id) {
  canvasNodes.value = canvasNodes.value.filter(n => n.id !== id)
  cables.value      = cables.value.filter(c => c.fromId !== id && c.toId !== id)
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
  // Group destinations by source so we can call setRouting once per source
  const bySource = new Map()
  for (const cable of cables.value) {
    if (!bySource.has(cable.fromId)) bySource.set(cable.fromId, [])
    bySource.get(cable.fromId).push(cable.toId)
  }

  const outputPorts = midiService.getOutputs()

  for (const [srcId, dstIds] of bySource) {
    const src = canvasNodes.value.find(n => n.id === srcId)
    if (!src) continue

    if (!src.sourceId) {
      midiStore.addRegistration(src.name)
      midiStore.updateRegistration(src.name, 'inEnabled', true)
      midiStore.updateRegistration(src.name, 'inChannel', src.inChannel)
    }

    const outputNames = []
    for (const dstId of dstIds) {
      const dst = canvasNodes.value.find(n => n.id === dstId)
      if (!dst) continue
      // Resolve the canonical Web MIDI port name so the routing matrix
      // entry matches the exact name that Web MIDI reports at send time.
      const webMidiPort = outputPorts.find(p => p.name === dst.name)
      const canonicalName = webMidiPort?.name ?? dst.name
      midiStore.addRegistration(canonicalName)
      midiStore.updateRegistration(canonicalName, 'outEnabled',  true)
      midiStore.updateRegistration(canonicalName, 'outChannel',  dst.outChannel)
      midiStore.updateRegistration(canonicalName, 'clock',       dst.sync)
      midiStore.updateRegistration(canonicalName, 'transport',   dst.transport)
      midiStore.updateRegistration(canonicalName, 'notes',       dst.notes)
      midiStore.updateRegistration(canonicalName, 'cc',          dst.cc)
      midiStore.updateRegistration(canonicalName, 'pc',          dst.pc)
      midiStore.updateRegistration(canonicalName, 'pcEnabled',   dst.pc)
      outputNames.push(canonicalName)
    }

    // Wire the routing matrix: apps use MidiSource enum, hardware uses device name
    midiStore.setRouting(src.sourceId ?? src.name, outputNames)
  }
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
  const regs   = midiStore.routingConfig?.registrations ?? {}
  const matrix = midiStore.routingMatrix ?? {}
  if (!Object.keys(regs).length && !Object.values(matrix).some(v => v?.length)) return

  const appNames   = new Set(MIDI_APPS.map(a => a.name))
  const nodeMap    = new Map()
  const sourceKeys = new Set(Object.keys(matrix).filter(k => matrix[k]?.length))
  const destNames  = new Set(Object.values(matrix).flat().filter(Boolean))

  const sourceNodes = []  // left column — things that send MIDI out
  const destNodes   = []  // right column — things that receive MIDI in

  // Hardware device nodes — skip unconnected ones and any app names leaked in
  for (const reg of Object.values(regs)) {
    if (appNames.has(reg.name)) { midiStore.removeRegistration(reg.name); continue }
    const isSource = sourceKeys.has(reg.name)
    const isDest   = destNames.has(reg.name)
    if (!isSource && !isDest) continue

    const id = nextId++
    nodeMap.set(reg.name, id)
    const node = {
      id, name: reg.name, sourceId: null,
      hasIn: reg.inEnabled, hasOut: reg.outEnabled,
      x: 0, y: 0,
      inChannel: reg.inChannel ?? -1, outChannel: reg.outChannel ?? -1,
      sync: reg.clock ?? true, transport: reg.transport ?? true,
      notes: reg.notes ?? true, cc: reg.cc ?? true, pc: reg.pc ?? true,
    }
    if (isDest) destNodes.push(node)
    else sourceNodes.push(node)
  }

  // MIDI App nodes — only if they have active routing (always sources)
  for (const app of MIDI_APPS) {
    if (!sourceKeys.has(app.sourceId)) continue
    const id = nextId++
    nodeMap.set(app.sourceId, id)
    sourceNodes.push({
      id, name: app.name, sourceId: app.sourceId,
      hasIn: false, hasOut: true,
      x: 0, y: 0,
      inChannel: -1, outChannel: -1,
      sync: true, transport: true, notes: true, cc: true, pc: true,
    })
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
  destNodes.forEach((node, i) => { node.x = RIGHT_X; node.y = 20 + i * HW_ROW_H; canvasNodes.value.push(node) })

  // Cables from routing matrix
  for (const [sourceKey, outputNames] of Object.entries(matrix)) {
    const fromId = nodeMap.get(sourceKey)
    if (!fromId) continue
    for (const outName of (outputNames ?? [])) {
      const toId = nodeMap.get(outName)
      if (toId) cables.value.push({ id: nextId++, fromId, toId })
    }
  }
}

function reloadConfig() {
  canvasNodes.value = []
  cables.value = []
  nextId = 1
  initFromStore()
}

// ── Named saved canvas configurations ──
const showConfigsMenu = ref(false)
const newConfigName   = ref('')

function saveCurrentConfig() {
  const name = newConfigName.value.trim()
  if (!name) return
  midiFlowConfigsStore.saveConfig(
    name,
    JSON.parse(JSON.stringify(canvasNodes.value)),
    JSON.parse(JSON.stringify(cables.value)),
  )
  newConfigName.value = ''
}

function loadConfig(name) {
  const entry = midiFlowConfigsStore.getConfig(name)
  if (!entry) return
  canvasNodes.value = JSON.parse(JSON.stringify(entry.nodes))
  cables.value      = JSON.parse(JSON.stringify(entry.cables))
  const maxId = Math.max(0, ...canvasNodes.value.map(n => n.id), ...cables.value.map(c => c.id))
  nextId = maxId + 1
  showConfigsMenu.value = false
}

function deleteConfigEntry(e, name) {
  e.stopPropagation()
  midiFlowConfigsStore.deleteConfig(name)
}

onMounted(() => {
  window.addEventListener('mouseup', onCanvasMouseup)
  if (!canvasNodes.value.length) initFromStore()
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
                    <span class="block text-[10px] font-bold text-white truncate">{{ cfg.name }}</span>
                    <span class="block text-[8px] font-mono text-neutral-600">{{ cfg.nodes.length }} nodes · {{ cfg.cables.length }} cables</span>
                  </span>
                  <span
                    @click="deleteConfigEntry($event, cfg.name)"
                    class="shrink-0 opacity-0 group-hover:opacity-100 text-neutral-600 hover:text-red-400 transition-all"
                    title="Delete this configuration"
                  >
                    <Trash2 class="w-3 h-3" />
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

          <!-- MIDI Apps -->
          <p class="text-[8px] font-bold uppercase tracking-widest text-neutral-600 mb-1 px-1">MIDI Apps</p>
          <div
            v-for="app in MIDI_APPS"
            :key="app.sourceId"
            draggable="true"
            @dragstart="onSidebarDragStart($event, { name: app.name, sourceId: app.sourceId, hasIn: false, hasOut: true })"
            class="flex items-center gap-2 px-3 py-2 rounded-lg border border-purple-900/50 bg-purple-950/20 hover:border-purple-500/50 hover:bg-purple-900/20 cursor-grab active:cursor-grabbing transition-colors"
          >
            <component :is="app.icon" class="w-3 h-3 text-purple-400 shrink-0" />
            <span class="text-[9px] font-mono font-bold text-purple-200 truncate leading-tight">{{ app.name }}</span>
          </div>

          <!-- MIDI Devices -->
          <p class="text-[8px] font-bold uppercase tracking-widest text-neutral-600 mt-2 mb-1 px-1">MIDI Devices</p>
          <div v-if="!allDevices.length" class="text-[9px] text-neutral-700 font-mono text-center pt-2">
            No devices detected
          </div>
          <div
            v-for="dev in allDevices"
            :key="dev.name"
            draggable="true"
            @dragstart="onSidebarDragStart($event, dev)"
            class="flex flex-col gap-1 px-3 py-2 rounded-lg border border-neutral-800 bg-neutral-900 hover:border-synth-neon/40 hover:bg-neutral-800/60 cursor-grab active:cursor-grabbing transition-colors"
          >
            <span class="text-[9px] font-mono font-bold text-white truncate leading-tight">{{ dev.name }}</span>
            <div class="flex gap-1">
              <span v-if="dev.hasIn"  class="text-[7px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 uppercase tracking-wide">IN</span>
              <span v-if="dev.hasOut" class="text-[7px] font-bold px-1.5 py-0.5 rounded bg-synth-neon/20 text-synth-neon uppercase tracking-wide">OUT</span>
            </div>
          </div>
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
                @click="removeCable(cable.id)"
              />
              <!-- visible cable -->
              <path
                :d="cablePath(cable)"
                fill="none" :stroke="isAppCable(cable) ? '#8b5cf6' : '#a3e635'" stroke-width="2" stroke-opacity="0.65"
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

          <!-- Nodes -->
          <div
            v-for="node in canvasNodes"
            :key="node.id"
            class="absolute"
            :style="{ left: node.x + 'px', top: node.y + 'px', width: NODE_W + 'px', zIndex: 2 }"
            @mousedown="onNodeMousedown($event, node)"
          >
            <!-- IN port (hardware only) -->
            <svg
              v-if="!node.sourceId"
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
                : 'bg-neutral-900 border-neutral-700 hover:border-synth-neon/30'"
            >
              <!-- Card header -->
              <div
                class="flex items-center justify-between px-3 py-2 border-b"
                :class="node.sourceId ? 'bg-purple-900/30 border-purple-900/50' : 'bg-neutral-800/50 border-neutral-800'"
              >
                <span class="flex items-center gap-1.5 flex-1 pr-2 min-w-0">
                  <component v-if="node.sourceId" :is="appIconMap[node.sourceId]" class="w-3 h-3 text-purple-400 shrink-0" />
                  <span class="text-[9px] font-mono font-bold truncate leading-tight"
                    :class="node.sourceId ? 'text-purple-200' : 'text-white'"
                  >{{ node.name }}</span>
                </span>
                <button
                  @click.stop="removeNode(node.id)"
                  class="text-neutral-600 hover:text-red-400 transition-colors shrink-0"
                >
                  <X class="w-3 h-3" />
                </button>
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
                    <select v-model.number="node.outChannel" class="bg-neutral-950 border border-neutral-700 rounded text-[9px] font-mono focus:outline-none cursor-pointer px-1 py-0.5 w-full" @mousedown.stop>
                      <option :value="-1" class="bg-neutral-950">OMNI</option>
                      <option v-for="ch in CHANNELS" :key="ch" :value="ch - 1" class="bg-neutral-950">{{ ch }}</option>
                    </select>
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
        <span class="text-[9px] font-mono text-neutral-600">
          {{ cables.length }} connection{{ cables.length !== 1 ? 's' : '' }}
        </span>
        <button
          :disabled="!cables.length"
          @click="finish"
          class="flex items-center gap-2 px-4 py-1.5 text-xs font-black uppercase tracking-widest rounded-lg transition-colors"
          :class="cables.length
            ? 'bg-synth-neon text-black hover:bg-synth-neon/80'
            : 'bg-neutral-800 text-neutral-600 cursor-not-allowed'"
        >
          <Check class="w-3.5 h-3.5" /> Apply Routing
        </button>
      </div>
    </div>
  </div>
</template>
