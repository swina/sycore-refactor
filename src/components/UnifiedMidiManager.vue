<script setup>
import { computed } from 'vue'
import {
  X, Cpu, GitFork, Zap, Radio, Activity, Sliders, Settings, Link2
} from 'lucide-vue-next'
import { useUiStore } from '@/stores/useUiStore'

import DeviceListPanel      from './DeviceListPanel.vue'
import MidiMatrix           from './MidiMatrix.vue'
import MidiPerformancePanel from './MidiPerformancePanel.vue'
import MidiMappingPanel     from './MidiMappingPanel.vue'
import MidiMonitorPanel     from './MidiMonitorPanel.vue'
import AppMidiMapper        from './AppMidiMapper.vue'
import MidiSettingsPanel    from './MidiSettingsPanel.vue'
import MidiSyncMatrix       from './MidiSyncMatrix.vue'

const uiStore = useUiStore()

const TABS = [
  { id: 'devices',     label: 'Devices',     icon: Cpu     },
  { id: 'routing',     label: 'Routing',     icon: GitFork },
  { id: 'performance', label: 'Performance', icon: Zap     },
  { id: 'mapping',     label: 'Mapping',     icon: Radio   },
  { id: 'actions',     label: 'Actions',     icon: Sliders },
  { id: 'monitor',     label: 'Monitor',     icon: Activity },
  { id: 'sync',        label: 'Sync',        icon: Link2   },
  { id: 'settings',    label: 'Settings',    icon: Settings },
]

const activeTab = computed({
  get: () => uiStore.unifiedMidiManagerTab,
  set: (v) => { uiStore.unifiedMidiManagerTab = v },
})

function close() {
  uiStore.showUnifiedMidiManager = false
}
</script>

<template>
  <Transition name="umm">
    <div
      v-if="uiStore.showUnifiedMidiManager"
      class="fixed inset-x-0 top-0 bottom-30 z-[900] max-w-[920px] m-auto flex items-center justify-center p-1"
      @click.self="close"
    >
      <div class="bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style="width: min(90vw, 1200px); height: min(85vh, 860px);"
      >

        <!-- ── Header ──────────────────────────────────────────────────────── -->
        <div class="flex items-center justify-between px-5 py-3 border-b border-neutral-800 bg-gradient-to-r from-cyan-950/40 to-transparent shrink-0">
          <h2 class="text-sm font-black uppercase tracking-widest text-neutral-200 flex items-center gap-2">
            <Cpu class="w-4 h-4 text-emerald-400" />
            MIDI
          </h2>

          <!-- Tab bar -->
          <div class="flex items-center gap-0.5 flex-1 justify-center">
            <button
              v-for="tab in TABS"
              :key="tab.id"
              @click="activeTab = tab.id"
              :class="[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors',
                activeTab === tab.id
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/60'
              ]"
            >
              <component :is="tab.icon" class="w-3 h-3 shrink-0" />
              <span class="hidden sm:inline">{{ tab.label }}</span>
            </button>
          </div>

          <button @click="close"
            class="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors shrink-0"
            title="Close"
          >
            <X class="w-4 h-4" />
          </button>
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
      </div>
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
