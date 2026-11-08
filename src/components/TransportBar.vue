<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Play, Square, Settings, AlertTriangle, RefreshCcwDot } from 'lucide-vue-next'
import { useGlobalTransportControls } from '@/composables/useGlobalTransportControls'
import { useSyncStore } from '@/stores/useSyncStore'
import { useArpStore } from '@/stores/useArpStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'
import { useExternalClockSync } from '@/composables/useExternalClockSync'
import { useExternalClockStore } from '@/stores/useExternalClockStore'
import { useLinkStore } from '@/stores/useLinkStore'
import { controlMapRows as getControlMapRows } from '@/lib/control-map'

const { transportManager, playAll, stopAll } = useGlobalTransportControls()
const syncStore = useSyncStore()   // still needed here for the sync-checkbox template bindings below
const arpStore = useArpStore()
const midiStore = useMidiStore()
const { openMenu } = useMidiContextMenu()
const clockStore = useExternalClockStore()
const linkStore = useLinkStore()
const linkStatus = computed(() => {
  if (!linkStore.active) return 'off'
  if (linkStore.ready) return `connected${linkStore.track ? ` · track "${linkStore.track}"` : ''}${linkStore.sim ? ' · simulated Live' : ''}`
  if (linkStore.state === 'connected') return 'connected, waiting for Live…'
  return linkStore.state === 'retrying' ? 'looking for the device…' : 'connecting…'
})
// Follow an external MIDI clock (e.g. Ableton Live on "SYC CTRL") when the
// clock source is a MIDI input: Start/Stop/SPP drive Play All / Stop All.
useExternalClockSync({ playAll: () => playAll(), stopAll: () => stopAll() })
const inputNames = computed(() => midiStore.inputs.map(i => i.name).filter(Boolean))
const controlMapRows = getControlMapRows()
const diagCopied = ref(false)
async function copyClockDiag() {
  const text = [`Clock source: ${clockStore.source} · on loss: ${clockStore.lossBehavior} · forward: ${clockStore.forwardClock}`
    + ` · control map: ${clockStore.controlMapEnabled ? `ch ${clockStore.controlMapChannel + 1}` : 'off'}`,
    ...clockStore.diagHistory].join('\n')
  try { await navigator.clipboard.writeText(text) } catch { console.log(text) }
  diagCopied.value = true
  setTimeout(() => { diagCopied.value = false }, 1500)
}

const showSyncPanel = ref(false)
const position = ref('001:1:1')

let rafId = null

function updatePosition() {
  // Always reschedule, even while stopped — this loop is what notices
  // isRunning flipping true later. Gating the reschedule on isRunning meant
  // the very first call (at mount, before playback starts) saw isRunning
  // false and let the loop die forever, so the position never updated once
  // playback actually began.
  if (transportManager.isRunning.value) {
    const p = transportManager.getBarPosition()
    position.value = `${String(p.bar).padStart(3, '0')}:${p.beat}:${p.sixteenth}`
  } else {
    position.value = '001:1:1'
  }
  rafId = requestAnimationFrame(updatePosition)
}

onMounted(() => {
  rafId = requestAnimationFrame(updatePosition)
  window.addEventListener('transport-play-all', _onTransportPlayAll)
  window.addEventListener('transport-stop-all', _onTransportStopAll)
})

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId)
  window.removeEventListener('transport-play-all', _onTransportPlayAll)
  window.removeEventListener('transport-stop-all', _onTransportStopAll)
})

function handleBpmChange(e) {
  const v = parseInt(e.target.value)
  if (!isNaN(v) && v >= 20 && v <= 300) {
    midiStore.setGlobalBpm(v)
  }
}

const _onTransportPlayAll = () => { playAll() }
const _onTransportStopAll = () => { stopAll() }
</script>

<template>
  <div class="flex items-center gap-3">
    <!-- Play All / Stop All -->
    <button
      @click="transportManager.isRunning.value ? stopAll() : playAll()"
      @contextmenu.prevent="openMenu($event, { name: 'transport_play_all', label: transportManager.isRunning.value ? 'Stop All' : 'Play All' })"
      class="flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all active:scale-95"
      :class="transportManager.isRunning.value
        ? 'text-red-400 border-red-500/40 bg-red-500/10 hover:bg-red-500/20'
        : 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20'"
    >
      <component :is="transportManager.isRunning.value ? Square : Play" class="w-3 h-3 fill-current" />
      <span>{{ transportManager.isRunning.value ? 'Stop All' : 'Play All' }}</span>
    </button>

    <!-- Sync config gear -->
    <div class="relative">
      <button
        @click="showSyncPanel = !showSyncPanel"
        :class="['p-1.5 rounded transition-colors', showSyncPanel ? 'text-synth-neon bg-synth-neon/10' : 'text-synth-neon']"
        class="hover:bg-synth-neon/30 rounded-full"
        title="Sync apps to transport"
      >
        <RefreshCcwDot class="w-5 h-5" />
      </button>

      <!-- Dropdown panel -->
      <Transition name="sy-modal">
        <div
          v-if="showSyncPanel"
          class="absolute bottom-full right-0 mb-2 w-72 bg-neutral-950 border border-neutral-800 rounded-xl shadow-2xl p-4 z-[961]"
        >
          <p class="text-[8px] font-bold uppercase tracking-widest text-neutral-500 mb-3">Sync Apps to Transport</p>

          <div class="space-y-2">
            <label class="flex items-center justify-between cursor-pointer group">
              <span class="text-[11px] font-mono text-neutral-300 group-hover:text-white transition-colors">Step Sequencer</span>
              <div class="flex items-center gap-2">
                <input type="number" min="0" max="64" v-model.number="syncStore.appDelays['Step Sequencer']"
                  class="w-10 bg-black border border-neutral-800 rounded text-[11px] font-mono text-center text-neutral-400 outline-none"
                  title="Start delay in beats" />
                <input type="checkbox" v-model="syncStore.syncSequencerToTransport" class="accent-synth-neon" />
              </div>
            </label>
            <label class="flex items-center justify-between cursor-pointer group">
              <span class="text-[11px] font-mono text-neutral-300 group-hover:text-white transition-colors">Sequencer</span>
              <div class="flex items-center gap-2">
                <input type="number" min="0" max="64" v-model.number="syncStore.appDelays['Sequencer']"
                  class="w-10 bg-black border border-neutral-800 rounded text-[11px] font-mono text-center text-neutral-400 outline-none"
                  title="Start delay in beats" />
                <input type="checkbox" v-model="syncStore.syncSequencer2ToTransport" class="accent-synth-neon" />
              </div>
            </label>
            <label class="flex items-center justify-between cursor-pointer group">
              <span class="text-[11px] font-mono text-neutral-300 group-hover:text-white transition-colors">Chord Prog</span>
              <div class="flex items-center gap-2">
                <input type="number" min="0" max="64" v-model.number="syncStore.appDelays['Chord Prog']"
                  class="w-10 bg-black border border-neutral-800 rounded text-[11px] font-mono text-center text-neutral-400 outline-none"
                  title="Start delay in beats" />
                <input type="checkbox" v-model="syncStore.syncChordProgToTransport" class="accent-synth-neon" />
              </div>
            </label>
            <label class="flex items-center justify-between cursor-pointer group">
              <span class="text-[11px] font-mono text-neutral-300 group-hover:text-white transition-colors">Samples Machine</span>
              <div class="flex items-center gap-2">
                <input type="number" min="0" max="64" v-model.number="syncStore.appDelays['Samples Machine']"
                  class="w-10 bg-black border border-neutral-800 rounded text-[11px] font-mono text-center text-neutral-400 outline-none"
                  title="Start delay in beats" />
                <input type="checkbox" v-model="syncStore.syncLoopMachineToTransport" class="accent-synth-neon" />
              </div>
            </label>
            <label class="flex items-center justify-between cursor-pointer group">
              <span class="text-[11px] font-mono text-neutral-300 group-hover:text-white transition-colors">Drum Machine</span>
              <div class="flex items-center gap-2">
                <input type="number" min="0" max="64" v-model.number="syncStore.appDelays['Drum Machine']"
                  class="w-10 bg-black border border-neutral-800 rounded text-[11px] font-mono text-center text-neutral-400 outline-none"
                  title="Start delay in beats" />
                <input type="checkbox" v-model="syncStore.syncDrumMachineToTransport" class="accent-synth-neon" />
              </div>
            </label>
            <label class="flex items-center justify-between cursor-pointer group">
              <span class="text-[11px] font-mono text-neutral-300 group-hover:text-white transition-colors">Backing Track</span>
              <div class="flex items-center gap-2">
                <input type="number" min="0" max="64" v-model.number="syncStore.appDelays['Backing Track']"
                  class="w-10 bg-black border border-neutral-800 rounded text-[11px] font-mono text-center text-neutral-400 outline-none"
                  title="Start delay in beats" />
                <input type="checkbox" v-model="syncStore.syncBackingTrackToTransport" class="accent-synth-neon" />
              </div>
            </label>
            <label class="flex items-center justify-between cursor-pointer group">
              <span class="text-[11px] font-mono text-neutral-300 group-hover:text-white transition-colors">Arm Record</span>
              <div class="flex items-center gap-2">
                <input type="number" min="0" max="64" v-model.number="syncStore.appDelays['Arm Record']"
                  class="w-10 bg-black border border-neutral-800 rounded text-[11px] font-mono text-center text-neutral-400 outline-none"
                  title="Start delay in beats" />
                <input type="checkbox" v-model="syncStore.syncRecordToTransport" class="accent-synth-neon" />
              </div>
            </label>
          </div>

          <p class="text-[7px] text-neutral-600 mt-3 leading-relaxed">
            Synced apps start at the next bar boundary when the transport is already running.
          </p>

          <!-- Clock source (P1: follow an external master such as Ableton Live) -->
          <div class="mt-4 pt-3 border-t border-neutral-800 space-y-2">
            <p class="text-[8px] font-bold uppercase tracking-widest text-neutral-500">Clock</p>
            <label class="flex items-center justify-between gap-2">
              <span class="text-[11px] font-mono text-neutral-300">Source</span>
              <select
                :value="clockStore.source"
                @change="clockStore.setSource($event.target.value)"
                class="max-w-[10rem] bg-black border border-neutral-800 rounded px-1 py-0.5 text-[11px] font-mono text-neutral-300 outline-none"
                title="INT: SY.CORE is the master. A MIDI input: follow its clock, Start/Stop and Song Position"
              >
                <option value="internal">Internal (INT)</option>
                <option value="link">EXT · Live (M4L) — SY.CORE Link</option>
                <option v-for="name in inputNames" :key="name" :value="`midi:${name}`">EXT · {{ name }}</option>
                <option v-if="clockStore.port && !inputNames.includes(clockStore.port)" :value="clockStore.source">
                  EXT · {{ clockStore.port }} (offline)
                </option>
              </select>
            </label>
            <label v-if="clockStore.isExternal" class="flex items-center justify-between gap-2">
              <span class="text-[11px] font-mono text-neutral-300">On clock loss</span>
              <select
                v-model="clockStore.lossBehavior"
                class="bg-black border border-neutral-800 rounded px-1 py-0.5 text-[11px] font-mono text-neutral-300 outline-none"
              >
                <option value="stop">Stop the apps</option>
                <option value="continue">Continue on INT</option>
              </select>
            </label>
            <label v-if="clockStore.isExternal && !clockStore.isLink" class="flex items-center justify-between gap-2 cursor-pointer"
              title="Send the source's clock, Start/Stop and Song Position to the outputs with Clock / Transport on. Leave off if an output loops back into the source.">
              <span class="text-[11px] font-mono text-neutral-300">Forward clock to devices</span>
              <input type="checkbox" v-model="clockStore.forwardClock" class="accent-synth-neon" />
            </label>
            <!-- Control Map (P3): Live's clips drive the apps through notes on one channel of the source port -->
            <div v-if="clockStore.isExternal && !clockStore.isLink" class="pt-2 border-t border-neutral-800/60 space-y-1">
              <label class="flex items-center justify-between gap-2 cursor-pointer"
                title="Notes on this channel of the clock source port select slots in the apps (Live's clips as the control sheet). The port is never forwarded to devices.">
                <span class="text-[11px] font-mono text-neutral-300">Control Map</span>
                <span class="flex items-center gap-2">
                  <select v-model.number="clockStore.controlMapChannel" :disabled="!clockStore.controlMapEnabled"
                    class="bg-black border border-neutral-800 rounded px-1 py-0.5 text-[11px] font-mono text-neutral-300 outline-none disabled:opacity-40">
                    <option v-for="c in 16" :key="c" :value="c - 1">ch {{ c }}</option>
                  </select>
                  <input type="checkbox" v-model="clockStore.controlMapEnabled" class="accent-synth-neon" />
                </span>
              </label>
              <table v-if="clockStore.controlMapEnabled" class="w-full text-[8px] font-mono text-neutral-500">
                <tr v-for="row in controlMapRows" :key="row.notes"><td class="pr-2 text-neutral-400 whitespace-nowrap">{{ row.notes }}</td><td>{{ row.action }}</td></tr>
              </table>
              <p v-if="clockStore.controlMapEnabled && clockStore.controlMapFlood" class="text-[9px] text-red-400 leading-snug">
                ⚠ Too many control notes: notes are looping back into {{ clockStore.port }}. In Live, set the control track's MIDI From to "No Input" and Monitor to Off.
              </p>
              <p v-if="clockStore.controlMapEnabled && clockStore.lastControlAction" class="text-[9px] font-mono text-amber-300">
                Last: {{ clockStore.lastControlAction }}
              </p>
            </div>
            <p v-if="clockStore.isExternal && clockStore.samePortInputs > 1" class="text-[8px] text-amber-400 leading-relaxed">
              {{ clockStore.samePortInputs }} inputs are named "{{ clockStore.port }}": the clock is taken from the first one only.
            </p>
            <p v-if="clockStore.isLink" class="text-[7px] text-neutral-600 leading-relaxed">
              Play, Stop, tempo and position read from Live by the SY.CORE Link device; the apps start on the next bar line.
              Last phase error: {{ clockStore.lastPhaseErrorMs }} ms.
            </p>
            <p v-if="clockStore.isExternal && !clockStore.isLink" class="text-[7px] text-neutral-600 leading-relaxed">
              Start, Stop and Song Position from the source drive the apps above; they start on the bar line.
              In Live set MIDI Clock Type to "Song". Last phase error: {{ clockStore.lastPhaseErrorMs }} ms.
            </p>
            <p v-if="clockStore.isExternal && clockStore.diag" class="text-[8px] font-mono text-neutral-400">
              {{ clockStore.diag }} · state {{ clockStore.state }}
            </p>
            <button v-if="clockStore.isExternal && clockStore.diagHistory.length"
              @click="copyClockDiag"
              class="text-[9px] font-mono uppercase tracking-wider px-2 py-1 rounded border border-neutral-700 text-neutral-300 hover:text-white hover:border-neutral-500">
              {{ diagCopied ? 'Copied ✓' : `Copy diagnostics (${clockStore.diagHistory.length} s)` }}
            </button>
          </div>

          <!-- SY.CORE Link (P11): Max for Live bridge — clock source and "Live (M4L)" MIDI Flow destination -->
          <div class="mt-4 pt-3 border-t border-neutral-800 space-y-1">
            <label class="flex items-center justify-between gap-2 cursor-pointer"
              title="Connect to the SY.CORE Link device in Ableton Live (ws://127.0.0.1:9400): Live's transport as clock source, and a &quot;Live (M4L)&quot; destination in MIDI Flow — no virtual MIDI ports">
              <span class="text-[8px] font-bold uppercase tracking-widest text-neutral-500">SY.CORE Link</span>
              <input type="checkbox" v-model="linkStore.enabled" :disabled="clockStore.isLink" class="accent-synth-neon" />
            </label>
            <p class="text-[9px] font-mono" :class="linkStore.ready ? 'text-cyan-300' : 'text-neutral-500'">
              {{ linkStatus }}<span v-if="linkStore.ready && linkStore.rttMs != null"> · RTT {{ linkStore.rttMs.toFixed(1) }} ms</span>
            </p>
            <p v-if="linkStore.ready && linkStore.stats" class="text-[8px] font-mono text-neutral-500">
              last s: {{ linkStore.stats.msgs }} msgs · {{ linkStore.stats.late }} late · {{ linkStore.stats.dropped }} dropped
              <span v-if="linkStore.stats.leadMinMs != null"> · lead min {{ linkStore.stats.leadMinMs }} ms</span>
              <span v-if="linkStore.stats.reportJitterMs != null" title="How late Live's position reports reached the device (filtered out of the note times)"> · Live report jitter {{ linkStore.stats.reportJitterMs }} ms</span>
            </p>
            <p v-if="linkStore.ready" class="text-[7px] text-neutral-600 leading-relaxed">
              Cable apps to "Live (M4L)" in MIDI Flow: their notes play on the device's track, on Live's beat.
            </p>
            <p v-if="linkStore.hint" class="text-[8px] text-amber-400 leading-relaxed">{{ linkStore.hint }}</p>
            <p v-if="linkStore.lastError" class="text-[8px] text-red-400">{{ linkStore.lastError }}</p>
          </div>
        </div>
      </Transition>
    </div>

    <!-- Clock: EXT (following a MIDI master) / INT -->
    <button
      v-if="clockStore.isExternal"
      @click="showSyncPanel = !showSyncPanel"
      class="flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black tracking-widest border"
      :class="clockStore.fallbackToInternal
        ? 'text-amber-400 border-amber-500/50 bg-amber-500/10 animate-pulse'
        : clockStore.state === 'playing' || clockStore.state === 'waiting-bar'
          ? 'text-cyan-300 border-cyan-500/50 bg-cyan-500/10'
          : 'text-neutral-400 border-neutral-700'"
      :title="clockStore.fallbackToInternal
        ? `Clock lost on ${clockStore.sourceLabel}: continuing on the internal clock`
        : `Following the clock on ${clockStore.sourceLabel}`"
    >
      <AlertTriangle v-if="clockStore.fallbackToInternal" class="w-3 h-3" />
      <span>{{ clockStore.mode }}</span>
      <span v-if="clockStore.bpm > 0" class="font-mono tabular-nums">{{ clockStore.bpm.toFixed(1) }}</span>
      <span class="font-mono tabular-nums text-neutral-400">{{ clockStore.position }}</span>
      <span v-if="clockStore.audioOverloaded && (clockStore.state === 'playing' || clockStore.fallbackToInternal)"
        class="ml-1 px-1 rounded bg-amber-500/20 text-amber-400"
        :title="`Audio overloaded: the audio clock runs at ${clockStore.audioClockPct}% of real time, so the apps can't keep Live's time. Close heavy panels (e.g. FM-1 Emulator).`">
        AUDIO
      </span>
    </button>

    <!-- Position -->
    <span class="text-[10px] font-mono text-neutral-400 tabular-nums w-16 text-center">
      {{ position }}
    </span>

    <!-- BPM -->
    <div class="flex items-center gap-1">
      <span class="text-[8px] text-neutral-600">BPM</span>
      <input
        type="number" min="20" max="300"
        :value="arpStore.arpBpm"
        @change="handleBpmChange"
        class="w-14 bg-black border border-neutral-800 rounded px-1 py-0.5 text-center text-synth-neon text-[12px] focus:outline-none focus:border-synth-neon transition-colors"
      />
    </div>

    
  </div>
</template>