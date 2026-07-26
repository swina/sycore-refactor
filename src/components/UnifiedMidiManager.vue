<script setup>
import { computed, watch } from 'vue'
import {
  X, Minus, Cpu, GitFork, Zap, Radio, Activity, Sliders, Settings, Link2, Download
} from 'lucide-vue-next'
import { useUiStore }      from '@/stores/useUiStore'
import { useMidiStore }    from '@/stores/useMidiStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { useSyncStore }    from '@/stores/useSyncStore'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import MacOsButtons from '@/components/ui/MacOsButtons.vue'

import DeviceListPanel      from './DeviceListPanel.vue'
import MidiMatrix           from './MidiMatrix.vue'
import MidiPerformancePanel from './MidiPerformancePanel.vue'
import MidiMappingPanel     from './MidiMappingPanel.vue'
import MidiMonitorPanel     from './MidiMonitorPanel.vue'
import AppMidiMapper        from './AppMidiMapper.vue'
import MidiSettingsPanel    from './MidiSettingsPanel.vue'
import MidiSyncMatrix       from './MidiSyncMatrix.vue'

const uiStore      = useUiStore()
const midiStore    = useMidiStore()
const mappingStore = useMappingStore()
const syncStore    = useSyncStore()

const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront, maximize } = useDraggableResizable({
  storageKey: 'SYCORE_POS_UNIFIED_MIDI',
  minimizeLabel: 'MIDI Manager',
  openRef: () => uiStore.showUnifiedMidiManager,
  initialWidth: 920,
  initialHeight: 720,
  zIndex: 100,
  panelId: 'midi-manager',
})

const TABS = [
  { id: 'devices',     label: 'Devices',     icon: Cpu     },
  // { id: 'routing',     label: 'Routing',     icon: GitFork },
  // { id: 'performance', label: 'Performance', icon: Zap     },
  // { id: 'mapping',     label: 'Mapping',     icon: Radio   },
  // { id: 'actions',     label: 'Actions',     icon: Sliders },
  // { id: 'sync',        label: 'Sync',        icon: Link2   },
  { id: 'monitor',     label: 'Monitor',     icon: Activity },
  { id: 'settings',    label: 'Settings',    icon: Settings },
]

const activeTab = computed({
  get: () => uiStore.unifiedMidiManagerTab,
  set: (v) => { uiStore.unifiedMidiManagerTab = v },
})

function close() {
  uiStore.showUnifiedMidiManager = false
}

// ── CSV report ────────────────────────────────────────────────────────────────
function esc(v) {
  const s = String(v ?? '')
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

function row(...cells) { return cells.map(esc).join(',') }

function section(title, headers, rows) {
  const lines = [`\r\n${title}`, headers.join(',')]
  for (const r of rows) lines.push(row(...r))
  return lines.join('\r\n')
}

function downloadCsv() {
  const parts = []
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19)

  // ── 1. General settings ──────────────────────────────────────────────────
  parts.push(section(
    'GENERAL SETTINGS',
    ['Key', 'Value'],
    [
      ['Report Generated', ts],
      ['BPM', midiStore.currentBpm],
      ['MIDI Channel (out)', midiStore.midiChannel],
      ['MIDI Input Channel', midiStore.midiInputChannel === -1 ? 'All' : midiStore.midiInputChannel],
      ['Send MIDI Clock', midiStore.sendClock],
      ['SysEx Enabled', midiStore.sysexEnabled],
      ['Broadcast Mode', midiStore.broadcastMode],
      ['Global MIDI Thru', midiStore.routingConfig?.globalThruEnabled ?? false],
      ['Smart Latch Active', midiStore.isSmartLatchActive],
      ['Smart Latch Max Notes', midiStore.smartLatchMaxNotes],
      ['Smart Latch Replace Mode', midiStore.smartLatchReplaceMode],
      ['Smart Latch Fade Time (ms)', midiStore.smartLatchFadeTime],
    ],
  ))

  // ── 2. Device registrations ──────────────────────────────────────────────
  const regs = Object.values(midiStore.routingConfig?.registrations ?? {})
  parts.push(section(
    'DEVICE REGISTRATIONS',
    ['Device', 'In Enabled', 'In Channel', 'Out Enabled', 'Out Channel',
     'Clock', 'Transport', 'Notes', 'CC', 'PC', 'MIDI Thru', 'Smart Latch',
     'Receive Sync In', 'Velocity Min', 'Velocity Max'],
    regs.map(d => [
      d.name,
      d.inEnabled,  d.inChannel  === -1 ? 'All' : d.inChannel,
      d.outEnabled, d.outChannel === -1 ? 'All' : d.outChannel,
      d.clock, d.transport, d.notes, d.cc, d.pc,
      d.midiThru, d.smartLatch, d.receiveSyncIn,
      d.velocityMin, d.velocityMax,
    ]),
  ))

  // ── 3. Routing matrix ────────────────────────────────────────────────────
  const matrix = midiStore.routingMatrix ?? {}
  parts.push(section(
    'ROUTING MATRIX',
    ['Source', 'Output Devices'],
    Object.entries(matrix).map(([src, outs]) => [src, (outs ?? []).join(' | ')]),
  ))

  // ── 4. Split config ──────────────────────────────────────────────────────
  const sp = midiStore.splitConfig ?? {}
  parts.push(section(
    'KEYBOARD SPLIT',
    ['Key', 'Value'],
    [
      ['Enabled', sp.enabled],
      ['Split Note', sp.splitNote],
      ['Low Device', sp.lowDevice],
      ['High Device', sp.highDevice],
      ['Low Transpose', sp.lowTranspose],
      ['High Transpose', sp.highTranspose],
    ],
  ))

  // ── 5. CC parameter mappings ─────────────────────────────────────────────
  const ccMaps = Object.entries(mappingStore.midiMappings ?? {})
  parts.push(section(
    'CC PARAMETER MAPPINGS',
    ['Parameter', 'Device', 'Channel', 'CC', 'NRPN MSB', 'NRPN LSB', 'Note'],
    ccMaps.map(([key, m]) => [
      m.paramName ?? key, m.device, m.channel, m.cc ?? '', m.nrpn?.msb ?? '', m.nrpn?.lsb ?? '', m.note ?? '',
    ]),
  ))

  // ── 6. App action mappings ───────────────────────────────────────────────
  const appMaps = mappingStore.appMidiMappings ?? []
  parts.push(section(
    'APP ACTION MAPPINGS',
    ['Action', 'Device', 'Channel', 'CC', 'Note', 'Value Min', 'Value Max'],
    appMaps.map(m => [
      m.action ?? m.actionId ?? '', m.device ?? '', m.channel ?? '', m.cc ?? '', m.note ?? '',
      m.valueMin ?? '', m.valueMax ?? '',
    ]),
  ))

  // ── 7. Velocity modulation ───────────────────────────────────────────────
  const vc = mappingStore.velocityConfig ?? {}
  parts.push(section(
    'VELOCITY MODULATION',
    ['Key', 'Value'],
    [
      ['Active', vc.active],
      ['Target Parameter', vc.targetParameter],
      ['Amount', vc.amount],
      ['Curve', vc.curve],
    ],
  ))

  // ── 8. Sync matrix ───────────────────────────────────────────────────────
  parts.push(section(
    'SYNC MATRIX',
    ['Source', 'Target', 'Enabled'],
    [
      ['Live Timeline',  'MIDI Transport',  syncStore.syncTimelineToMidi],
      ['Live Timeline',  'Step Sequencer',  syncStore.syncTimelineToSequencer],
      ['Live Timeline',  'Backing Track',   syncStore.syncTimelineToBackingTrack],
      ['Live Timeline',  'Audio Capture',   syncStore.syncTimelineToAudioCapture],
      ['Backing Track',  'MIDI Transport',  midiStore.syncMidiTransport],
      ['Backing Track',  'Step Sequencer',  syncStore.syncTrack],
      ['Backing Track',  'Audio Looper',    syncStore.syncBackingTrackToLooper],
      ['Backing Track',  'Audio Capture',   syncStore.syncRecordAudioCapture],
      ['Step Sequencer', 'MIDI Transport',  midiStore.syncSequencerTransport],
      ['Step Sequencer', 'Backing Track',   syncStore.syncTrack],
      ['Step Sequencer', 'Audio Looper',    syncStore.syncSequencerToLooper],
      ['Audio Looper',   'MIDI Transport',  syncStore.syncLooperToMidi],
      ['Audio Looper',   'Step Sequencer',  syncStore.syncLooperToSequencer],
      ['Audio Looper',   'Backing Track',   syncStore.syncLooperToBackingTrack],
      ['Audio Looper',   'Audio Capture',   syncStore.syncLooperToAudioCapture],
      ['Audio Capture',  'MIDI Transport',  syncStore.syncAudioCaptureToMidi],
      ['Audio Capture',  'Step Sequencer',  syncStore.syncAudioCaptureToSequencer],
      ['Audio Capture',  'Backing Track',   syncStore.syncAudioCaptureToBackingTrack],
      ['Audio Capture',  'Audio Looper',    syncStore.syncAudioCaptureToLooper],
    ],
  ))

  const blob = new Blob([parts.join('')], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), {
    href: url,
    download: `midi-config-${ts.replace(/[: ]/g, '-')}.csv`,
  })
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
</script>

<template>
  <Transition name="umm">
    <div
      v-if="uiStore.showUnifiedMidiManager"
      v-show="!isMinimized"
      class="bg-neutral-950 border border-neutral-800 rounded-xl max-h-[93vh] shadow-2xl flex flex-col overflow-hidden"
      :style="panelStyle"
    >

        <!-- ── Header ──────────────────────────────────────────────────────── -->
        <div class="flex items-center justify-between px-5 py-3 border-b border-neutral-800 bg-gradient-to-r from-cyan-950/40 to-transparent shrink-0 cursor-grab active:cursor-grabbing select-none" @mousedown="onDragStart">
          <h2 class="text-sm font-black uppercase tracking-widest text-neutral-200 flex items-center gap-2">
            <Cpu class="w-4 h-4 text-emerald-400" />
            MIDI
          </h2>

          <!-- Tab bar -->
          <div class="flex items-center gap-0.5 flex-1 justify-start ml-4">
            <button
              v-for="tab in TABS"
              :key="tab.id"
              @click="activeTab = tab.id"
              :class="[
                'flex items-center gap-1.5 px-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors',
                activeTab === tab.id
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/60'
              ]"
            >
              <component :is="tab.icon" class="w-3 h-3 shrink-0" />
              <span class="hidden sm:inline">{{ tab.label }}</span>
            </button>
          </div>

          <div class="flex items-center gap-1 shrink-0">
            <button @click="downloadCsv"
              class="p-1.5 rounded-lg text-neutral-500 hover:text-cyan-400 hover:bg-neutral-800 transition-colors"
              title="Download MIDI config report (CSV)"
            >
              <Download class="w-4 h-4" />
            </button>
            <MacOsButtons @close="close" @minimize="toggleMinimize" @maximize="maximize" />
          </div>
        </div>

        <!-- ── Tab content ─────────────────────────────────────────────────── -->
        <div class="flex-1 overflow-hidden">

          <DeviceListPanel
            v-if="activeTab === 'devices'"
            class="h-full"
          />

          <MidiMatrix
            v-else-if="activeTab === 'routing'"
            :embedded="true"
            class="h-full"
          />

          <MidiPerformancePanel
            v-else-if="activeTab === 'performance'"
            :embedded="true"
            class="h-full"
          />

          <MidiMappingPanel
            v-else-if="activeTab === 'mapping'"
            :embedded="true"
            class="h-full"
          />

          <MidiMonitorPanel
            v-else-if="activeTab === 'monitor'"
            :embedded="true"
            class="h-full"
          />

          <AppMidiMapper
            v-else-if="activeTab === 'actions'"
            :embedded="true"
            class="h-full"
          />

          <MidiSyncMatrix
            v-else-if="activeTab === 'sync'"
            class="h-full"
          />

          <MidiSettingsPanel
            v-else-if="activeTab === 'settings'"
            class="h-full"
          />

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
</template>

<style scoped>
.umm-enter-active,
.umm-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.umm-enter-from,
.umm-leave-to {
  opacity: 0;
  transform: scale(0.97);
}
</style>
