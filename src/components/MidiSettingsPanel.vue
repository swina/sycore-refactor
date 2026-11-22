<script setup>
import { ref, computed } from 'vue'
import { Settings, Download, Upload, AlertTriangle } from 'lucide-vue-next'
import { useMidiStore } from '@/stores/useMidiStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { userKey } from '@/lib/userKey'

const midiStore    = useMidiStore()
const mappingStore = useMappingStore()

// ─── Export / Import ──────────────────────────────────────────────────────────

function exportConfig() {
  const snapshot = {
    version: 1,
    exportedAt: new Date().toISOString(),
    routing: JSON.parse(localStorage.getItem(userKey('SYCORE_ADVANCED_MIDI_ROUTING')) || '{}'),
    matrix:  JSON.parse(localStorage.getItem(userKey('S1_MIDI_ROUTING')) || '{}'),
    split:   JSON.parse(localStorage.getItem(userKey('SYCORE_KEYBOARD_SPLIT')) || '{}'),
    smartLatch: {
      active:  localStorage.getItem(userKey('SYCORE_SMARTLATCH_ACTIVE')),
      max:     localStorage.getItem(userKey('SYCORE_SMARTLATCH_MAX')),
      replace: localStorage.getItem(userKey('SYCORE_SMARTLATCH_REPLACE')),
      fade:    localStorage.getItem(userKey('SYCORE_SMARTLATCH_FADE')),
    },
    mappings:  JSON.parse(localStorage.getItem(userKey('midiMappings')) || '{}'),
    channel:   localStorage.getItem(userKey('midiChannel')),
    inChannel: localStorage.getItem(userKey('midiInputChannel')),
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
      if (data.routing) localStorage.setItem(userKey('SYCORE_ADVANCED_MIDI_ROUTING'), JSON.stringify(data.routing))
      if (data.matrix)  localStorage.setItem(userKey('S1_MIDI_ROUTING'), JSON.stringify(data.matrix))
      if (data.split)   localStorage.setItem(userKey('SYCORE_KEYBOARD_SPLIT'), JSON.stringify(data.split))
      if (data.mappings)localStorage.setItem(userKey('midiMappings'), JSON.stringify(data.mappings))
      if (data.channel) localStorage.setItem(userKey('midiChannel'), data.channel)
      if (data.inChannel) localStorage.setItem(userKey('midiInputChannel'), data.inChannel)
      window.location.reload()
    } catch {
      importError.value = 'Invalid config file.'
    }
  }
  reader.readAsText(file)
}

async function resetDefaults() {
  if (!confirm('Reset all MIDI settings to defaults? This clears MIDI Learn and MIDI Actions mappings too, and will reload the page.')) return
  const keys = [
    'SYCORE_ADVANCED_MIDI_ROUTING', 'S1_MIDI_ROUTING', 'SYCORE_KEYBOARD_SPLIT',
    'SYCORE_SMARTLATCH_ACTIVE', 'SYCORE_SMARTLATCH_MAX', 'SYCORE_SMARTLATCH_REPLACE',
    'SYCORE_SMARTLATCH_FADE', 'midiChannel', 'midiInputChannel',
    'midiSendClock', 'midiSyncTransport', 'midiSyncSequencerTransport',
    'SYCORE_DEVICE_REGISTRY',
  ]
  keys.forEach(k => localStorage.removeItem(userKey(k)))
  // Go through the store (not a raw localStorage key) so both mapping
  // systems are actually cleared — appMidiMappings is Firestore/idb-backed,
  // not localStorage, so it was previously left untouched by this reset.
  mappingStore.clearMidiMappings()
  await mappingStore.clearAppMidiMappings()
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
              <p class="text-sm text-neutral-200 font-medium">Block Incoming Clock Thru</p>
              <p class="text-[10px] text-neutral-500">Clock/Start/Stop from an input device is used for the incoming-BPM display only, never re-sent to other outputs — keeps the app's own clock as the sole source</p>
            </div>
            <button
              @click="midiStore.setBlockIncomingClockThru(midiStore.routingConfig.blockIncomingClockThru === false)"
              :class="['w-10 h-5 rounded-full transition-colors relative shrink-0',
                midiStore.routingConfig.blockIncomingClockThru !== false ? 'bg-synth-neon' : 'bg-neutral-700']"
            >
              <span :class="['absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform shadow',
                midiStore.routingConfig.blockIncomingClockThru !== false ? 'translate-x-5 bg-black' : 'translate-x-0.5 bg-white']" />
            </button>
          </label>

          <div class="bg-amber-950/20 border border-amber-800/30 rounded-xl px-4 py-3 flex items-start gap-2">
            <AlertTriangle class="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p class="text-[11px] text-amber-200/90 leading-relaxed">
              <span class="font-bold">MIDI echo on a device?</span> If notes or CC values repeat and fade out on their own — often only on one channel — make sure
              <span class="font-mono">Block Incoming Clock Thru</span> above is <span class="font-bold">ON</span>. An input device broadcasting its own MIDI Clock
              can otherwise fight the app's clock on other outputs and produce exactly this symptom.
            </p>
          </div>

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

      <!-- Config Presets: retired — a project holds the setup (MIDI Flow) and the controllers -->
      <section>
        <h3 class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-2">Setups</h3>
        <p class="text-[10px] text-neutral-500 leading-snug">
          A setup is saved in a <span class="text-violet-300 font-bold">project</span>: its MIDI Flow and its controllers.
          Save and switch projects from the project button in the footer; the MIDI Flow's own setups from its Saved configurations.
        </p>
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
