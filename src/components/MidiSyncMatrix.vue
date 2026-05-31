<script setup>
import { computed } from 'vue'
import { Link2, Clock, Play, Mic, Music2, Zap, ArrowRight, Layers } from 'lucide-vue-next'
import { useMidiStore } from '@/stores/useMidiStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useSyncStore } from '@/stores/useSyncStore'
import LiveTimeline from '@/components/LiveTimeline.vue'

const midiStore   = useMidiStore()
const configStore = useConfigStore()
const syncStore   = useSyncStore()

// ── Toggle helper ─────────────────────────────────────────────────────────────
function toggle(getter, setter) {
  setter(!getter())
}

// ── Matrix cell definitions ───────────────────────────────────────────────────
// Each row = a trigger source; each column = a target/action.
// cell: { get, set } | null (N/A)

const COLS = [
  { id: 'midi-transport', label: 'MIDI START/STOP', icon: Zap,    desc: 'Sends 0xFA / 0xFC'       },
  { id: 'sequencer',      label: 'Step Sequencer',  icon: Play,   desc: 'Starts/stops sequencer'   },
  { id: 'backing-track',  label: 'Backing Tracks',   icon: Music2, desc: 'Starts/stops backing track'},

  { id: 'audio-looper',   label: 'Audio Looper',    icon: Layers, desc: 'Starts/stops looper'      },
  { id: 'audio-capture',  label: 'Audio Capture',   icon: Mic,    desc: 'Starts/stops recording'   },
]

const ROWS = computed(() => [
  {
    id: 'live-timeline',
    label: 'Live Timeline',
    icon: Clock,
    cells: {
      'midi-transport': {
        get: () => syncStore.syncTimelineToMidi,
        set: (v) => { syncStore.syncTimelineToMidi = v },
      },
      'sequencer': {
        get: () => syncStore.syncTimelineToSequencer,
        set: (v) => { syncStore.syncTimelineToSequencer = v },
      },
      'backing-track': {
        get: () => syncStore.syncTimelineToBackingTrack,
        set: (v) => { syncStore.syncTimelineToBackingTrack = v },
      },
      'audio-looper': null,
      'audio-capture': {
        get: () => syncStore.syncTimelineToAudioCapture,
        set: (v) => { syncStore.syncTimelineToAudioCapture = v },
      },
    },
  },
  {
    id: 'backing-track',
    label: 'Backing Track',
    icon: Music2,
    cells: {
      'midi-transport': {
        get: () => midiStore.syncMidiTransport,
        set: (v) => midiStore.setSyncMidiTransport(v),
      },
      'sequencer': {
        get: () => syncStore.syncTrack,
        set: (v) => { syncStore.syncTrack = v },
      },
      'backing-track': null,
      'audio-looper': {
        get: () => syncStore.syncBackingTrackToLooper,
        set: (v) => { syncStore.syncBackingTrackToLooper = v },
      },
      'audio-capture': {
        get: () => syncStore.syncRecordAudioCapture,
        set: (v) => { syncStore.syncRecordAudioCapture = v },
      },
    },
  },
  {
    id: 'sequencer',
    label: 'Step Sequencer',
    icon: Play,
    cells: {
      'midi-transport': {
        get: () => midiStore.syncSequencerTransport,
        set: (v) => midiStore.setSyncSequencerTransport(v),
      },
      'sequencer': null,
      'backing-track': {
        get: () => syncStore.syncTrack,
        set: (v) => { syncStore.syncTrack = v },
      },
      'audio-looper': {
        get: () => syncStore.syncSequencerToLooper,
        set: (v) => { syncStore.syncSequencerToLooper = v },
      },
      'audio-capture': null,
    },
  },
  {
    id: 'live-pad',
    label: 'Live Performance Pad',
    icon: Zap,
    cells: {
      'midi-transport': {
        get: () => configStore.syncMidiTransportFromLivePad,
        set: (v) => { configStore.syncMidiTransportFromLivePad = v },
      },
      'sequencer': null,
      'backing-track': null,
      'audio-looper': null,
      'audio-capture': null,
    },
  },
  {
    id: 'audio-looper',
    label: 'Audio Looper',
    icon: Layers,
    cells: {
      'midi-transport': {
        get: () => syncStore.syncLooperToMidi,
        set: (v) => { syncStore.syncLooperToMidi = v },
      },
      'sequencer': {
        get: () => syncStore.syncLooperToSequencer,
        set: (v) => { syncStore.syncLooperToSequencer = v },
      },
      'backing-track': {
        get: () => syncStore.syncLooperToBackingTrack,
        set: (v) => { syncStore.syncLooperToBackingTrack = v },
      },
      'audio-looper': null,
      'audio-capture': {
        get: () => syncStore.syncLooperToAudioCapture,
        set: (v) => { syncStore.syncLooperToAudioCapture = v },
      },
    },
  },
  {
    id: 'chord-prog',
    label: 'Chord Prog Seq',
    icon: Music2,
    cells: {
      'midi-transport': {
        get: () => midiStore.syncChordProgTransport,
        set: (v) => midiStore.setSyncChordProgTransport(v),
      },
      'sequencer': {
        get: () => syncStore.syncChordProgToSequencer,
        set: (v) => { syncStore.syncChordProgToSequencer = v },
      },
      'backing-track': {
        get: () => syncStore.syncChordProgToBackingTrack,
        set: (v) => { syncStore.syncChordProgToBackingTrack = v },
      },
      'audio-looper': {
        get: () => syncStore.syncChordProgToLooper,
        set: (v) => { syncStore.syncChordProgToLooper = v },
      },
      'audio-capture': {
        get: () => syncStore.syncChordProgToAudioCapture,
        set: (v) => { syncStore.syncChordProgToAudioCapture = v },
      },
    },
  },
  {
    id: 'audio-capture',
    label: 'Audio Capture',
    icon: Mic,
    cells: {
      'midi-transport': {
        get: () => syncStore.syncAudioCaptureToMidi,
        set: (v) => { syncStore.syncAudioCaptureToMidi = v },
      },
      'sequencer': {
        get: () => syncStore.syncAudioCaptureToSequencer,
        set: (v) => { syncStore.syncAudioCaptureToSequencer = v },
      },
      'backing-track': {
        get: () => syncStore.syncAudioCaptureToBackingTrack,
        set: (v) => { syncStore.syncAudioCaptureToBackingTrack = v },
      },
      'audio-looper': {
        get: () => syncStore.syncAudioCaptureToLooper,
        set: (v) => { syncStore.syncAudioCaptureToLooper = v },
      },
      'audio-capture': null,
    },
  },
])
</script>

<template>
  <div class="flex flex-col h-full overflow-y-auto custom-scrollbar">
    <div class="p-6 flex flex-col gap-6 max-w-4xl">

      <!-- Header -->
      <div>
        <h3 class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-1 flex items-center gap-2">
          <Link2 class="w-3.5 h-3.5" />
          Sync Automation Matrix
        </h3>
        <p class="text-[10px] text-neutral-600">
          Each cell controls what happens automatically when the row's source starts or stops.
        </p>
      </div>

      <!-- MIDI Clock global toggle (outside matrix — it's not a source/target pair) -->
      <section>
        <h4 class="text-[9px] font-black uppercase tracking-widest text-neutral-600 mb-2 flex items-center gap-1.5">
          <Clock class="w-3 h-3" /> MIDI Clock Output
        </h4>
        <label class="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 cursor-pointer hover:border-neutral-700 transition-colors max-w-sm">
          <div>
            <p class="text-sm text-neutral-200 font-medium">Send MIDI Clock</p>
            <p class="text-[10px] text-neutral-500">Broadcast 24 PPQ clock to all registered outputs</p>
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

        <!-- Incoming BPM display -->
        <div v-if="midiStore.incomingBpm > 0"
          class="mt-2 flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 max-w-sm"
        >
          <div>
            <p class="text-sm text-neutral-200 font-medium">Incoming Clock BPM</p>
            <p class="text-[10px] text-neutral-500">Smoothed from 24 PPQ ring buffer</p>
          </div>
          <span class="text-xl font-mono font-black text-cyan-400">
            {{ midiStore.incomingBpm.toFixed(1) }}
          </span>
        </div>
      </section>

      <!-- Automation Matrix -->
      <section>
        <h4 class="text-[9px] font-black uppercase tracking-widest text-neutral-600 mb-3 flex items-center gap-1.5">
          <ArrowRight class="w-3 h-3" /> When source plays / stops → trigger target
        </h4>

        <div class="overflow-x-auto">
          <table class="w-full border-collapse">
            <!-- Column headers -->
            <thead>
              <tr>
                <!-- Empty top-left cell -->
                <th class="w-36 pb-2 pr-3" />
                <th
                  v-for="col in COLS"
                  :key="col.id"
                  class="pb-2 px-2 text-center"
                >
                  <div class="flex flex-col items-center gap-1">
                    <div class="w-7 h-7 rounded-lg bg-neutral-800 border border-neutral-700 flex items-center justify-center">
                      <component :is="col.icon" class="w-3.5 h-3.5 text-neutral-400" />
                    </div>
                    <span class="text-[9px] font-black uppercase tracking-wider text-neutral-500 whitespace-nowrap">
                      {{ col.label }}
                    </span>
                    <span class="text-[8px] text-neutral-700 whitespace-nowrap hidden lg:block">
                      {{ col.desc }}
                    </span>
                  </div>
                </th>
              </tr>
            </thead>

            <!-- Rows -->
            <tbody>
              <tr
                v-for="row in ROWS"
                :key="row.id"
                class="border-t border-neutral-800/60"
              >
                <!-- Row label -->
                <td class="py-3 pr-4">
                  <div class="flex items-center gap-2">
                    <div class="w-6 h-6 rounded-md bg-neutral-800 border border-neutral-700 flex items-center justify-center shrink-0">
                      <component :is="row.icon" class="w-3 h-3 text-emerald-400" />
                    </div>
                    <span class="text-[10px] font-bold uppercase tracking-wider text-neutral-300 whitespace-nowrap">
                      {{ row.label }}
                    </span>
                  </div>
                </td>

                <!-- Cells -->
                <td
                  v-for="col in COLS"
                  :key="col.id"
                  class="py-3 px-2 text-center"
                >
                  <!-- Active cell: toggle switch -->
                  <template v-if="row.cells[col.id] !== null">
                    <button
                      @click="row.cells[col.id].set(!row.cells[col.id].get())"
                      :class="[
                        'w-10 h-5 rounded-full transition-colors relative mx-auto block',
                        row.cells[col.id].get() ? 'bg-synth-neon shadow-[0_0_8px_rgba(0,163,112,0.35)]' : 'bg-neutral-700 hover:bg-neutral-600',
                      ]"
                      :title="row.cells[col.id].get() ? 'Enabled — click to disable' : 'Disabled — click to enable'"
                    >
                      <span :class="[
                        'absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform shadow',
                        row.cells[col.id].get() ? 'translate-x-5 bg-black' : 'translate-x-0.5 bg-white',
                      ]" />
                    </button>
                  </template>

                  <!-- N/A cell -->
                  <template v-else>
                    <span class="text-neutral-800 text-base select-none">—</span>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Legend -->
        <div class="mt-4 flex flex-wrap gap-4 text-[9px] text-neutral-600">
          <div class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-full bg-synth-neon inline-block" />
            Enabled
          </div>
          <div class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-full bg-neutral-700 inline-block" />
            Disabled
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-neutral-800 font-bold">—</span>
            <span>Not applicable</span>
          </div>
        </div>
      </section>

      <!-- Notes -->
      <section class="border-t border-neutral-800 pt-4">
        <h4 class="text-[9px] font-black uppercase tracking-widest text-neutral-600 mb-2">Notes</h4>
        <ul class="flex flex-col gap-1 text-[10px] text-neutral-600">
          <li>
            <span class="text-neutral-500 font-semibold">Backing Track → Step Sequencer</span>
            and
            <span class="text-neutral-500 font-semibold">Step Sequencer → Backing Track</span>
            share the same toggle — enabling either enables both directions.
          </li>
          <li>
            <span class="text-neutral-500 font-semibold">MIDI START/STOP</span>
            sends 0xFA (Start) and 0xFC (Stop) to all output devices with transport enabled in the Routing tab.
          </li>
          <li>
            <span class="text-neutral-500 font-semibold">Live Performance Pad → MIDI START/STOP</span>
            is a global guard — disable it to prevent double-firing when both Live Performance Pad and Backing Track are active.
          </li>
          <li>
            <span class="text-neutral-500 font-semibold">Audio Looper</span>
            and
            <span class="text-neutral-500 font-semibold">Audio Capture</span>
            sync flags are stored in the matrix but require the consuming components to read them from the sync store and act accordingly.
          </li>
        </ul>
      </section>

    </div>
  </div>
</template>
