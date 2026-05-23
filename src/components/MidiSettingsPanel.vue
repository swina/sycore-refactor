<script setup>
import { ref, computed } from 'vue'
import { Settings, Download, Upload, AlertTriangle, Save, FolderOpen, Trash2 } from 'lucide-vue-next'
import { useMidiStore } from '@/stores/useMidiStore'
import { useMappingStore } from '@/stores/useMappingStore'

const midiStore    = useMidiStore()
const mappingStore = useMappingStore()

// ─── Config Presets ───────────────────────────────────────────────────────────

const newPresetName   = ref('')
const presetSaveError = ref('')

const namedPresets = computed(() =>
  midiStore.configPresets.filter(p => p.id !== '__autosave__')
)

async function saveNewPreset() {
  const name = newPresetName.value.trim()
  if (!name) { presetSaveError.value = 'Enter a preset name.'; return }
  presetSaveError.value = ''
  await midiStore.saveConfigPreset(name)
  newPresetName.value = ''
}

async function loadSelectedPreset(id) {
  if (!id) return
  await midiStore.loadConfigPreset(id)
}

async function deleteActivePreset() {
  const id = midiStore.activeConfigPresetId
  if (!id || id === '__autosave__') return
  if (!confirm('Delete this MIDI config preset?')) return
  await midiStore.deleteConfigPreset(id)
}

// ─── Export / Import ──────────────────────────────────────────────────────────

function exportConfig() {
  const snapshot = {
    version: 1,
    exportedAt: new Date().toISOString(),
    routing: JSON.parse(localStorage.getItem('SYCORE_ADVANCED_MIDI_ROUTING') || '{}'),
    matrix:  JSON.parse(localStorage.getItem('S1_MIDI_ROUTING') || '{}'),
    split:   JSON.parse(localStorage.getItem('SYCORE_KEYBOARD_SPLIT') || '{}'),
    smartLatch: {
      active:  localStorage.getItem('SYCORE_SMARTLATCH_ACTIVE'),
      max:     localStorage.getItem('SYCORE_SMARTLATCH_MAX'),
      replace: localStorage.getItem('SYCORE_SMARTLATCH_REPLACE'),
      fade:    localStorage.getItem('SYCORE_SMARTLATCH_FADE'),
    },
    mappings:  JSON.parse(localStorage.getItem('midiMappings') || '{}'),
    channel:   localStorage.getItem('midiChannel'),
    inChannel: localStorage.getItem('midiInputChannel'),
  }
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `sy-midi-config-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

const importError = ref('')

function importConfig(e) {
  importError.value = ''
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result)
      if (data.routing) localStorage.setItem('SYCORE_ADVANCED_MIDI_ROUTING', JSON.stringify(data.routing))
      if (data.matrix)  localStorage.setItem('S1_MIDI_ROUTING', JSON.stringify(data.matrix))
      if (data.split)   localStorage.setItem('SYCORE_KEYBOARD_SPLIT', JSON.stringify(data.split))
      if (data.mappings)localStorage.setItem('midiMappings', JSON.stringify(data.mappings))
      if (data.channel) localStorage.setItem('midiChannel', data.channel)
      if (data.inChannel) localStorage.setItem('midiInputChannel', data.inChannel)
      window.location.reload()
    } catch {
      importError.value = 'Invalid config file.'
    }
  }
  reader.readAsText(file)
}

function resetDefaults() {
  if (!confirm('Reset all MIDI settings to defaults? This will reload the page.')) return
  const keys = [
    'SYCORE_ADVANCED_MIDI_ROUTING', 'S1_MIDI_ROUTING', 'SYCORE_KEYBOARD_SPLIT',
    'SYCORE_SMARTLATCH_ACTIVE', 'SYCORE_SMARTLATCH_MAX', 'SYCORE_SMARTLATCH_REPLACE',
    'SYCORE_SMARTLATCH_FADE', 'midiMappings', 'midiChannel', 'midiInputChannel',
    'midiSendClock', 'midiSyncTransport', 'midiSyncSequencerTransport',
    'SYCORE_DEVICE_REGISTRY',
  ]
  keys.forEach(k => localStorage.removeItem(k))
  window.location.reload()
}
</script>

<template>
  <div class="flex flex-col h-full overflow-y-auto custom-scrollbar">
    <div class="p-6 flex flex-col gap-6 max-w-lg">

      <!-- Global MIDI I/O -->
      <section>
        <h3 class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-3">Global MIDI I/O</h3>
        <div class="grid grid-cols-2 gap-3">

          <div class="flex flex-col gap-1 bg-neutral-900 border border-neutral-800 rounded-xl p-3">
            <label class="text-[9px] text-neutral-500 uppercase tracking-wider">Output Channel</label>
            <input type="number" min="1" max="16"
              :value="midiStore.midiChannel"
              @change="midiStore.setMidiChannel(Math.max(1, Math.min(16, parseInt($event.target.value) || 1)))"
              class="bg-transparent text-xl font-mono font-black text-emerald-400 focus:outline-none w-full"
            />
          </div>

          <div class="flex flex-col gap-1 bg-neutral-900 border border-neutral-800 rounded-xl p-3">
            <label class="text-[9px] text-neutral-500 uppercase tracking-wider">Input Channel</label>
            <select
              :value="midiStore.midiInputChannel"
              @change="midiStore.setMidiInputChannel(parseInt($event.target.value))"
              class="bg-transparent text-xl font-mono font-black text-emerald-400 focus:outline-none"
            >
              <option :value="-1" class="bg-black">OMNI</option>
              <option v-for="i in 16" :key="i" :value="i - 1" class="bg-black">{{ i }}</option>
            </select>
          </div>
        </div>
      </section>

      <!-- Clock & Transport -->
      <section>
        <h3 class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-3">Clock & Transport</h3>
        <div class="flex flex-col gap-2">

          <label class="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 cursor-pointer hover:border-neutral-700 transition-colors">
            <div>
              <p class="text-sm text-neutral-200 font-medium">Send MIDI Clock</p>
              <p class="text-[10px] text-neutral-500">Broadcast clock pulses to all registered outputs</p>
            </div>
            <button
              @click="midiStore.setSendClock(!midiStore.sendClock)"
              :class="['w-10 h-5 rounded-full transition-colors relative shrink-0',
                midiStore.sendClock ? 'bg-synth-neon' : 'bg-neutral-700']"
            >
              <span :class="['absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform shadow',
                midiStore.sendClock ? 'translate-x-5 bg-black' : 'translate-x-0.5 bg-white']" />
            </button>
          </label>

          <label class="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 cursor-pointer hover:border-neutral-700 transition-colors">
            <div>
              <p class="text-sm text-neutral-200 font-medium">Sync MIDI Transport</p>
              <p class="text-[10px] text-neutral-500">Start/Stop follows incoming MIDI transport</p>
            </div>
            <button
              @click="midiStore.setSyncMidiTransport(!midiStore.syncMidiTransport)"
              :class="['w-10 h-5 rounded-full transition-colors relative shrink-0',
                midiStore.syncMidiTransport ? 'bg-synth-neon' : 'bg-neutral-700']"
            >
              <span :class="['absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform shadow',
                midiStore.syncMidiTransport ? 'translate-x-5 bg-black' : 'translate-x-0.5 bg-white']" />
            </button>
          </label>

          <label class="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 cursor-pointer hover:border-neutral-700 transition-colors">
            <div>
              <p class="text-sm text-neutral-200 font-medium">Sync Sequencer Transport</p>
              <p class="text-[10px] text-neutral-500">Sequencer play/stop follows MIDI transport</p>
            </div>
            <button
              @click="midiStore.setSyncSequencerTransport(!midiStore.syncSequencerTransport)"
              :class="['w-10 h-5 rounded-full transition-colors relative shrink-0',
                midiStore.syncSequencerTransport ? 'bg-synth-neon' : 'bg-neutral-700']"
            >
              <span :class="['absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform shadow',
                midiStore.syncSequencerTransport ? 'translate-x-5 bg-black' : 'translate-x-0.5 bg-white']" />
            </button>
          </label>

          <!-- Incoming BPM — visible when clock is received from external device -->
          <div v-if="midiStore.incomingBpm > 0"
            class="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3"
          >
            <div>
              <p class="text-sm text-neutral-200 font-medium">Incoming Clock BPM</p>
              <p class="text-[10px] text-neutral-500">Smoothed (α=0.1) from 24 PPQ ring buffer</p>
            </div>
            <span class="text-xl font-mono font-black text-cyan-400 shrink-0">
              {{ midiStore.incomingBpm.toFixed(1) }}
            </span>
          </div>

        </div>
      </section>

      <!-- Advanced -->
      <section>
        <h3 class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-3">Advanced</h3>
        <div class="flex flex-col gap-2">

          <label class="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 cursor-pointer hover:border-neutral-700 transition-colors">
            <div>
              <p class="text-sm text-neutral-200 font-medium">SysEx Support</p>
              <p class="text-[10px] text-neutral-500">
                Re-requests WebMIDI access with sysex:true — browser will prompt for permission
              </p>
            </div>
            <button
              @click="midiStore.toggleSysEx()"
              :class="['w-10 h-5 rounded-full transition-colors relative shrink-0',
                midiStore.sysexEnabled ? 'bg-emerald-500' : 'bg-neutral-700']"
            >
              <span :class="['absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow',
                midiStore.sysexEnabled ? 'translate-x-5' : 'translate-x-0.5']" />
            </button>
          </label>

        </div>
      </section>

      <!-- Smart Latch -->
      <section>
        <h3 class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-3">Smart Latch</h3>
        <div class="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col gap-3">
          <label class="flex items-center justify-between cursor-pointer">
            <span class="text-sm text-neutral-200 font-medium">Enable Smart Latch</span>
            <button
              @click="midiStore.toggleSmartLatch()"
              :class="['w-10 h-5 rounded-full transition-colors relative shrink-0',
                midiStore.isSmartLatchActive ? 'bg-synth-neon' : 'bg-neutral-700']"
            >
              <span :class="['absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform shadow',
                midiStore.isSmartLatchActive ? 'translate-x-5 bg-black' : 'translate-x-0.5 bg-white']" />
            </button>
          </label>
          <div class="grid grid-cols-2 gap-3">
            <div class="flex flex-col gap-1">
              <label class="text-[9px] text-neutral-500 uppercase tracking-wider">Max Notes</label>
              <input type="number" min="1" max="32"
                :value="midiStore.smartLatchMaxNotes"
                @change="midiStore.smartLatchMaxNotes = parseInt($event.target.value)"
                class="bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm font-mono text-neutral-200 focus:outline-none focus:border-neutral-500"
              />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-[9px] text-neutral-500 uppercase tracking-wider">Fade Time (ms)</label>
              <input type="number" min="0" max="5000" step="100"
                :value="midiStore.smartLatchFadeTime"
                @change="midiStore.smartLatchFadeTime = parseInt($event.target.value)"
                class="bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm font-mono text-neutral-200 focus:outline-none focus:border-neutral-500"
              />
            </div>
          </div>
        </div>
      </section>

      <!-- Config Presets -->
      <section>
        <h3 class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-3">Config Presets</h3>
        <div class="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col gap-3">

          <!-- Active preset display + load -->
          <div class="flex items-center gap-2">
            <select
              :value="midiStore.activeConfigPresetId || ''"
              @change="loadSelectedPreset($event.target.value)"
              class="flex-1 bg-black border border-neutral-700 text-[11px] font-mono text-neutral-300 px-2 py-1.5 rounded focus:outline-none focus:border-emerald-500/50"
            >
              <option value="" class="bg-black">— No preset loaded —</option>
              <option v-for="p in namedPresets" :key="p.id" :value="p.id" class="bg-black">{{ p.name }}</option>
            </select>
            <button
              v-if="midiStore.activeConfigPresetId && midiStore.activeConfigPresetId !== '__autosave__'"
              @click="deleteActivePreset"
              class="p-1.5 rounded border border-rose-900/40 text-rose-500 hover:bg-rose-950/20 transition-colors"
              title="Delete preset"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>

          <p v-if="midiStore.activeConfigPresetId && midiStore.activeConfigPresetId !== '__autosave__'"
            class="text-[9px] text-emerald-500 font-mono px-0.5"
          >
            Active: {{ namedPresets.find(p => p.id === midiStore.activeConfigPresetId)?.name }}
            · auto-saving
          </p>

          <!-- Save new -->
          <div class="flex items-center gap-2 pt-1 border-t border-neutral-800">
            <input
              v-model="newPresetName"
              placeholder="New preset name…"
              @keydown.enter="saveNewPreset"
              class="flex-1 bg-black border border-neutral-700 rounded-lg px-3 py-1.5 text-[11px] font-mono text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-emerald-500/50"
            />
            <button @click="saveNewPreset"
              class="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-emerald-700/40 text-emerald-500 hover:bg-emerald-900/20 transition-colors text-[10px] whitespace-nowrap"
            >
              <Save class="w-3 h-3" /> Save
            </button>
          </div>
          <p v-if="presetSaveError" class="text-rose-400 text-[9px] font-mono px-0.5">{{ presetSaveError }}</p>

          <p class="text-[9px] text-neutral-600 font-mono px-0.5">
            Snapshots routing, split, smart latch, channel, and active mapping preset.
            Slots 1–8 can be recalled via MIDI CC in App Actions.
          </p>
        </div>
      </section>

      <!-- Export / Import / Reset -->
      <section>
        <h3 class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-3">Configuration</h3>
        <div class="flex flex-col gap-2">

          <button @click="exportConfig"
            class="flex items-center gap-2 w-full px-4 py-3 rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-200
                   hover:border-neutral-600 hover:bg-neutral-800 transition-colors text-sm"
          >
            <Download class="w-4 h-4 text-neutral-400" />
            Export MIDI config as JSON
          </button>

          <label
            class="flex items-center gap-2 w-full px-4 py-3 rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-200
                   hover:border-neutral-600 hover:bg-neutral-800 transition-colors text-sm cursor-pointer"
          >
            <Upload class="w-4 h-4 text-neutral-400" />
            Import MIDI config from JSON
            <input type="file" accept=".json" @change="importConfig" class="sr-only" />
          </label>

          <p v-if="importError" class="text-rose-400 text-[10px] font-mono px-1">{{ importError }}</p>

          <button @click="resetDefaults"
            class="flex items-center gap-2 w-full px-4 py-3 rounded-xl border border-rose-900/40 bg-neutral-900 text-rose-500
                   hover:border-rose-700/50 hover:bg-rose-950/20 transition-colors text-sm"
          >
            <AlertTriangle class="w-4 h-4" />
            Reset all MIDI settings to defaults
          </button>

        </div>
      </section>

      <!-- Panic -->
      <section>
        <h3 class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-3">Emergency</h3>
        <button @click="midiStore.panic()"
          class="w-full px-4 py-3 rounded-xl border border-rose-600/50 bg-rose-950/20 text-rose-400 font-black uppercase tracking-widest text-sm
                 hover:bg-rose-950/40 hover:border-rose-500 transition-colors"
        >
          PANIC — All Notes Off (all channels)
        </button>
      </section>

    </div>
  </div>
</template>
