<script setup>
// MicroFreak Editor — the synth's CC controls by section, loaded from a preset
// read over SysEx, a sound generator (random by character, mutate) and
// snapshots kept in SY.CORE. The synth itself stores a sound only with its own
// Save (no SysEx write yet).
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Download, Loader2, Shuffle, Dices, Undo2, Save, Trash2, Send, Lock } from 'lucide-vue-next'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import MacOsButtons from '@/components/ui/MacOsButtons.vue'
import KnobDial from '@/components/ui/KnobDial.vue'
import { useUiStore } from '@/stores/useUiStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { midiService } from '@/core/midi/midi-service'
import { userKey } from '@/lib/userKey'
import { decodeRows, CHUNKS_PARAMS, PRESET_SLOTS } from '@/lib/microfreak/sysex'
import { createMicroFreakReader, microFreakOutput } from '@/lib/microfreak/reader'
import {
  ED_PARAMS, ED_SECTIONS, CHARACTERS, defaultValues, valuesFromPreset, synthOnlyInfo, categoryOf,
  randomSound, mutate, ccMessages, typeToCc, ccToType, oscOptions, presetFromPcState,
} from '@/lib/microfreak/editor'

const uiStore = useUiStore()
const midiStore = useMidiStore()

const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront, maximize } = useDraggableResizable({
  storageKey: 'SYCORE_POS_MICROFREAK_EDITOR',
  minimizeLabel: 'MicroFreak Editor',
  openRef: () => uiStore.isMicroFreakEditorOpen,
  initialWidth: 980,
  initialHeight: 640,
  minWidth: 640,
  minHeight: 360,
  zIndex: 100,
  panelId: 'microfreak-editor',
})
watch(() => uiStore.isMicroFreakEditorOpen, v => { if (v) bringToFront() })

// ── Device ─────────────────────────────────────────────────────────────────
const LS_DEVICE = 'SYCORE_MF_EDITOR_DEVICE'
// The device is the MicroFreak's real MIDI output port (SysEx and CCs go there). A virtual
// instrument (the Virtual Device's) that plays through that port is followed too: its Program
// Changes are recorded under its own name.
const isMf = (name) => {
  const r = midiStore.routingConfig?.registrations?.[name]
  return r?.pcTemplate === 'mfprojz' || /microfreak/i.test(name ?? '')
}
const devices = computed(() => {
  const ports = midiStore.outputs.map(o => o.name)
  const fromPorts = ports.filter(isMf)
  const viaVirtual = midiStore.virtualInstruments.filter(v => isMf(v.name) && ports.includes(v.midiOutputPort)).map(v => v.midiOutputPort)
  return [...new Set([...fromPorts, ...viaVirtual])]
})
const device = ref((() => { try { return localStorage.getItem(userKey(LS_DEVICE)) ?? '' } catch { return '' } })())
watch(devices, list => { if (!list.includes(device.value)) device.value = list[0] ?? '' }, { immediate: true })
watch(device, d => { try { localStorage.setItem(userKey(LS_DEVICE), d) } catch {} })

const regCh = (name, fallback = 0) => Math.max(0, midiStore.routingConfig?.registrations?.[name]?.pcChannel ?? fallback)
/** Where this MicroFreak's Program Changes are recorded: the port, and the virtual instruments on it. */
const pcSources = computed(() => [
  { name: device.value, ch: regCh(device.value) },
  ...midiStore.virtualInstruments.filter(v => v.midiOutputPort === device.value).map(v => ({ name: v.name, ch: regCh(v.name, v.channel ?? 0) })),
])
const lastSource = ref(null)        // the source that sent the last Program Change { name, ch }
const channel = computed(() => (lastSource.value && pcSources.value.some(s => s.name === lastSource.value.name) ? lastSource.value.ch : pcSources.value[0].ch))

// ── Values + sending ───────────────────────────────────────────────────────
const values = ref(defaultValues())
const history = ref([])            // previous values (undo)
const locked = ref(new Set())
const fromDump = ref(new Set())    // ids the last read set
const status = ref('')

function send(msgs) {
  if (!device.value) { status.value = 'No MicroFreak device: register it in MIDI Devices.'; return }
  for (const m of msgs) midiService.sendRawToDeviceByName(device.value, m)
}

// knob drags: one CC per control per frame
const pendingCc = new Map()
let raf = 0
function flush() {
  raf = 0
  const ch = channel.value
  send([...pendingCc].map(([cc, v]) => [0xb0 | ch, cc, v]))
  pendingCc.clear()
}
function setParam(p, v) {
  values.value = { ...values.value, [p.id]: Math.round(v) }
  fromDump.value.delete(p.id)
  pendingCc.set(p.cc, Math.round(v))
  if (!raf) raf = requestAnimationFrame(flush)
}

/** A whole sound: kept for undo, then the CCs that change. */
function apply(next, label) {
  history.value = [...history.value.slice(-49), values.value]
  const msgs = ccMessages(next, channel.value, values.value)
  values.value = next
  send(msgs)
  status.value = `${label} — ${msgs.length} CC sent.`
}
function sendAll() {
  send(ccMessages(values.value, channel.value))
  status.value = `All ${ED_PARAMS.length} CC sent.`
}
function undo() {
  const prev = history.value.at(-1)
  if (!prev) return
  history.value = history.value.slice(0, -1)
  const msgs = ccMessages(prev, channel.value, values.value)
  values.value = prev
  send(msgs)
  status.value = `Undo — ${msgs.length} CC sent.`
}
function toggleLock(id) {
  const s = new Set(locked.value)
  s.has(id) ? s.delete(id) : s.add(id)
  locked.value = s
}

// ── Load from the synth (SysEx) ────────────────────────────────────────────
const presetNo = ref(1)
const loaded = ref(null)            // { preset, name, category, info }
const reading = ref(false)
let activeReader = null
let queued = null                   // a preset asked for while reading: read next
let readGen = 0                     // the read in flight; a reset makes the old one's end a no-op
let readStartedAt = 0
const READ_STUCK_MS = 8000          // a read can't take this long (48 chunks ≈ 1 s): reset

const trace = (s) => { status.value = s; if (window.SY_LOG) window.SY_LOG(`[MF Editor] ${s}`); else console.log(`[MF Editor] ${s}`) }

/** Reads preset `no` (1..512) and sets the controls; a newer call stops the one in flight. */
async function loadFromSynth(no = presetNo.value) {
  if (!device.value) { trace('No MicroFreak device.'); return }
  const n = Math.max(1, Math.min(PRESET_SLOTS, no | 0))
  presetNo.value = n
  if (reading.value) {
    if (Date.now() - readStartedAt < READ_STUCK_MS) { queued = n; activeReader?.stop(); return }
    trace(`The read in flight hung (${Math.round((Date.now() - readStartedAt) / 1000)} s): reset.`)
    activeReader?.dispose()
    activeReader = null
    reading.value = false
  }
  const gen = ++readGen
  reading.value = true
  readStartedAt = Date.now()
  let reader = null
  try {
    const out = await microFreakOutput(device.value)
    if (!out) { status.value = `Output "${device.value}" not found.`; return }
    const inputs = midiService.getInputs().map(p => p.name)
    const inputName = inputs.find(x => x === device.value) ?? inputs.find(x => /microfreak/i.test(x))
    let last = ''
    reader = activeReader = createMicroFreakReader(out, { inputName, log: l => { last = l } })
    trace(`Reading preset ${n} (out "${out.name}", in "${inputName ?? 'any'}")…`)
    const p = await reader.readPreset(n - 1, CHUNKS_PARAMS)
    if (gen !== readGen) return
    if (reader.stopped) { trace(`Read of ${n} stopped for a newer one.`); return }
    if (!p || !p.rows.length) { trace(last || 'No reply from the MicroFreak.'); return }
    const dump = decodeRows(p.rows)
    const r = valuesFromPreset(dump, values.value)
    history.value = [...history.value.slice(-49), values.value]
    values.value = r.values
    fromDump.value = new Set(r.fromDump)
    loaded.value = { preset: p.preset, name: p.name, category: p.category, info: synthOnlyInfo(dump) }
    trace(`Loaded ${p.preset} "${p.name}" (${p.rows.length} chunks) — the controls show the stored preset (nothing sent).`)
  } catch (e) {
    if (gen === readGen) trace(`Read failed: ${e?.message ?? e}`)
  } finally {
    reader?.dispose()
    if (gen === readGen) {
      activeReader = null
      reading.value = false
      if (queued !== null) { const q = queued; queued = null; loadFromSynth(q) }
    }
  }
}

// ── Follow Program Change ──────────────────────────────────────────────────
// Every sender of a Program Change (Device Program Change, Virtual Device, Live
// Timeline, Sequencer, Performance Sets) records the device's channel state:
// when it changes, the editor reads that preset (bank select × 128 + PC + 1).
const LS_FOLLOW = 'SYCORE_MF_EDITOR_FOLLOW_PC'
const followPc = ref((() => { try { return localStorage.getItem(userKey(LS_FOLLOW)) !== '0' } catch { return true } })())
watch(followPc, v => { try { localStorage.setItem(userKey(LS_FOLLOW), v ? '1' : '0') } catch {} })

const pcStates = computed(() => pcSources.value.map(s => ({
  ...s, preset: presetFromPcState(midiStore.routingConfig?.registrations?.[s.name]?.pcChannels?.[s.ch]),
})))
/** The preset playing: the last source's, else the first source that has one. */
const pcPreset = computed(() => {
  const last = lastSource.value && pcStates.value.find(s => s.name === lastSource.value.name)
  return last?.preset ?? pcStates.value.find(s => s.preset !== null)?.preset ?? null
})
let followTimer = 0
watch(pcStates, (now, old) => {
  const changed = now.find(s => s.preset !== null && s.preset !== old?.find(o => o.name === s.name && o.ch === s.ch)?.preset)
  if (!changed) return
  lastSource.value = { name: changed.name, ch: changed.ch }
  if (!followPc.value || changed.preset === loaded.value?.preset && !reading.value) return
  trace(`Program Change → preset ${changed.preset} (${changed.name}, CH ${changed.ch + 1})`)
  clearTimeout(followTimer)
  // a burst of PCs (browsing): read the last one
  followTimer = setTimeout(() => loadFromSynth(changed.preset), 250)
})
watch(followPc, on => { if (on && pcPreset.value !== null && pcPreset.value !== loaded.value?.preset) loadFromSynth(pcPreset.value) })

// ── Generator ──────────────────────────────────────────────────────────────
const character = ref('Pad')
const amount = ref(0.2)
function generate() { apply(randomSound(character.value, values.value), `New ${character.value}`) }
function doMutate() { apply(mutate(values.value, amount.value, Math.random, locked.value), `Mutate ${Math.round(amount.value * 100)}%`) }

// ── Snapshots (SY.CORE) ────────────────────────────────────────────────────
const LS_SNAPS = 'SYCORE_MF_EDITOR_SNAPSHOTS'
const snapshots = ref((() => { try { return JSON.parse(localStorage.getItem(userKey(LS_SNAPS))) ?? [] } catch { return [] } })())
watch(snapshots, s => { try { localStorage.setItem(userKey(LS_SNAPS), JSON.stringify(s)) } catch {} }, { deep: true })
function saveSnapshot() {
  const n = snapshots.value.length + 1
  const name = loaded.value && history.value.length === 0 ? loaded.value.name : `${character.value} ${n}`
  snapshots.value = [{ id: `${Date.now()}`, name, values: { ...values.value }, at: new Date().toISOString() }, ...snapshots.value]
  status.value = `Saved "${name}" in SY.CORE — on the synth, store it with Save.`
}
function recall(s) { apply({ ...defaultValues(), ...s.values }, `Recall "${s.name}"`) }
function removeSnapshot(id) { snapshots.value = snapshots.value.filter(s => s.id !== id) }
function renameSnapshot(s, name) { s.name = name.trim() || s.name }

// ── View ───────────────────────────────────────────────────────────────────
const sections = computed(() => ED_SECTIONS.map(name => ({ name, params: ED_PARAMS.filter(p => p.section === name) })))
const oscList = oscOptions()
const oscIndex = computed(() => ccToType(values.value.type))

onUnmounted(() => { if (raf) cancelAnimationFrame(raf); clearTimeout(followTimer); queued = null; activeReader?.stop() })
onMounted(() => {
  if (uiStore.isMicroFreakEditorOpen) bringToFront()
  // opened on a MicroFreak already playing a preset: load it
  if (followPc.value && pcPreset.value !== null) loadFromSynth(pcPreset.value)
})
</script>

<template>
  <div
    v-show="!isMinimized"
    :style="panelStyle"
    class="fixed flex flex-col bg-neutral-950 border border-teal-500/30 rounded-xl shadow-2xl overflow-hidden"
    @mousedown.capture="bringToFront"
  >
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-neutral-800 px-3 py-2 bg-teal-900/10 gap-2 flex-wrap cursor-move select-none shrink-0" @mousedown="onDragStart">
      <div class="flex items-center gap-2">
        <MacOsButtons @close="uiStore.isMicroFreakEditorOpen = false" @minimize="toggleMinimize" @maximize="maximize" />
        <span class="text-sm font-black text-white tracking-widest uppercase pointer-events-none">MicroFreak Editor</span>
      </div>
      <div class="flex items-center gap-2" @mousedown.stop>
        <select v-model="device" class="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-[10px] font-mono text-teal-300 focus:outline-none">
          <option v-if="!devices.length" value="">No MicroFreak</option>
          <option v-for="d in devices" :key="d" :value="d">{{ d }}</option>
        </select>
        <span class="text-[10px] font-mono text-neutral-500">CH {{ channel + 1 }}</span>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="flex items-center gap-2 flex-wrap px-3 py-2 border-b border-neutral-800 shrink-0">
      <div class="flex items-center gap-1 bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1">
        <span class="text-[9px] uppercase tracking-wider text-neutral-500">Preset</span>
        <input v-model.number="presetNo" type="number" min="1" :max="PRESET_SLOTS" class="w-12 bg-transparent text-xs font-mono text-teal-300 focus:outline-none" />
        <button @click="loadFromSynth()" :disabled="reading || !device" class="flex items-center gap-1 text-[10px] font-bold text-teal-300 hover:text-teal-200 disabled:opacity-40" title="Read the stored preset over SysEx and set the controls (nothing is sent)">
          <Loader2 v-if="reading" class="w-3 h-3 animate-spin" /><Download v-else class="w-3 h-3" /> Load from synth
        </button>
        <label class="flex items-center gap-1 ml-1 pl-2 border-l border-neutral-700 text-[10px] text-neutral-400 cursor-pointer"
          title="When a Program Change goes to this MicroFreak (Program Change, Virtual Device, Live Timeline…), load that preset">
          <input v-model="followPc" type="checkbox" class="accent-teal-500" /> Follow PC
        </label>
      </div>
      <button @click="sendAll" :disabled="!device" class="flex items-center gap-1 px-2 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-[10px] disabled:opacity-40" title="Send every control to the synth">
        <Send class="w-3 h-3" /> Send all
      </button>
      <div class="flex items-center gap-1 bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1">
        <select v-model="character" class="bg-transparent text-[10px] text-neutral-200 focus:outline-none">
          <option v-for="c in CHARACTERS" :key="c" :value="c" class="bg-black">{{ c }}</option>
        </select>
        <button @click="generate" class="flex items-center gap-1 text-[10px] font-bold text-amber-300 hover:text-amber-200" title="A new sound of this character">
          <Dices class="w-3 h-3" /> Generate
        </button>
      </div>
      <div class="flex items-center gap-1 bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1">
        <input v-model.number="amount" type="range" min="0.02" max="1" step="0.01" class="w-20 accent-amber-400" />
        <span class="text-[10px] font-mono text-neutral-400 w-8">{{ Math.round(amount * 100) }}%</span>
        <button @click="doMutate" class="flex items-center gap-1 text-[10px] font-bold text-amber-300 hover:text-amber-200" title="Move the current sound by up to this amount (locked controls stay)">
          <Shuffle class="w-3 h-3" /> Mutate
        </button>
      </div>
      <button @click="undo" :disabled="!history.length" class="flex items-center gap-1 px-2 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-[10px] disabled:opacity-40">
        <Undo2 class="w-3 h-3" /> Undo
      </button>
      <button @click="saveSnapshot" class="flex items-center gap-1 px-2 py-1 rounded-lg bg-teal-600/80 hover:bg-teal-500 text-black text-[10px] font-bold">
        <Save class="w-3 h-3" /> Snapshot
      </button>
    </div>

    <!-- Body -->
    <div class="flex-1 min-h-0 flex overflow-hidden">
      <div class="flex-1 min-w-0 overflow-y-auto custom-scrollbar p-3 grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); align-content: start;">
        <section v-for="sec in sections" :key="sec.name" class="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
          <h4 class="text-[10px] font-black uppercase tracking-widest text-teal-400 mb-2">{{ sec.name }}</h4>
          <div v-if="sec.name === 'Oscillator'" class="mb-2">
            <select :value="oscIndex" @change="setParam(ED_PARAMS[0], typeToCc(+$event.target.value))"
              class="w-full bg-black border border-neutral-700 rounded px-2 py-1 text-[11px] text-teal-200 focus:outline-none">
              <option v-for="o in oscList" :key="o.index" :value="o.index">{{ o.name }}</option>
            </select>
          </div>
          <div class="flex flex-wrap gap-3">
            <div v-for="p in sec.params.filter(q => q.kind === 'cont')" :key="p.id" class="flex flex-col items-center w-14">
              <KnobDial :model-value="values[p.id]" :min="0" :max="127" :step="1" :default-val="64" :size="38"
                :color="fromDump.has(p.id) ? '#2dd4bf' : '#f59e0b'" @update:model-value="v => setParam(p, v)" />
              <button @click="toggleLock(p.id)" class="mt-0.5 flex items-center gap-0.5 text-[9px] leading-tight text-center"
                :class="locked.has(p.id) ? 'text-rose-300' : 'text-neutral-400 hover:text-neutral-200'"
                :title="`CC ${p.cc}${p.gen ? ' — click: lock for Mutate' : ''}`">
                <Lock v-if="locked.has(p.id)" class="w-2 h-2" />{{ p.label }}
              </button>
            </div>
          </div>
        </section>
      </div>

      <!-- Side: the loaded preset, snapshots -->
      <aside class="w-64 shrink-0 border-l border-neutral-800 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-3">
        <div class="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
          <h4 class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-1">On the synth</h4>
          <template v-if="loaded">
            <p class="text-[11px] text-teal-300 font-mono mb-1">{{ loaded.preset }} · {{ loaded.name }} <span class="text-neutral-500">· {{ categoryOf(loaded.category) }}</span></p>
            <table class="w-full text-[10px] font-mono">
              <tr v-for="i in loaded.info" :key="i.label"><td class="text-neutral-500 pr-2">{{ i.label }}</td><td class="text-neutral-300 text-right">{{ i.value }}</td></tr>
            </table>
            <p class="text-[9px] text-neutral-600 mt-1">No CC for these: set them on the unit.</p>
          </template>
          <p v-else class="text-[10px] text-neutral-500">Load a preset to see what has no CC (Preset volume, Paraphonic, Arp…).</p>
        </div>
        <div class="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
          <h4 class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-2">Snapshots ({{ snapshots.length }})</h4>
          <p v-if="!snapshots.length" class="text-[10px] text-neutral-500">Sounds you keep. On the synth, store them with Save.</p>
          <div v-for="s in snapshots" :key="s.id" class="flex items-center gap-1 mb-1 group">
            <button @click="recall(s)" class="shrink-0 text-teal-400 hover:text-teal-200" title="Send to the synth"><Send class="w-3 h-3" /></button>
            <input :value="s.name" @change="renameSnapshot(s, $event.target.value)" class="flex-1 min-w-0 bg-transparent text-[11px] text-neutral-300 focus:outline-none focus:text-white" />
            <button @click="removeSnapshot(s.id)" class="shrink-0 text-neutral-600 hover:text-rose-400 opacity-0 group-hover:opacity-100"><Trash2 class="w-3 h-3" /></button>
          </div>
        </div>
        <p class="text-[9px] text-neutral-600 leading-snug">
          Teal: as read from the synth. Amber: changed here. Load from synth reads the stored preset, not edits made on the unit.
        </p>
      </aside>
    </div>

    <!-- Status -->
    <div class="px-3 py-1.5 border-t border-neutral-800 text-[10px] font-mono text-neutral-400 shrink-0 truncate">{{ status || 'Ready.' }}</div>

    <!-- resize handles -->
    <div @mousedown.stop="e => onResizeStart(e, 's')" class="absolute bottom-0 left-3 right-3 h-1 cursor-s-resize z-50" />
    <div @mousedown.stop="e => onResizeStart(e, 'e')" class="absolute top-3 bottom-3 right-0 w-1 cursor-e-resize z-50" />
    <div @mousedown.stop="e => onResizeStart(e, 'w')" class="absolute top-3 bottom-3 left-0 w-1 cursor-w-resize z-50" />
    <div @mousedown.stop="e => onResizeStart(e, 'se')" class="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize z-50" />
  </div>
</template>
