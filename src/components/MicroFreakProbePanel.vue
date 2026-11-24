<script setup>
// MicroFreak preset read probe — checks, on a real unit, what the
// reverse-engineered SysEx read gives back. Read-only: it never writes.
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Download, Loader2, Square, Search, ListOrdered } from 'lucide-vue-next'
import { midiService } from '@/core/midi/midi-service'
import {
  decodeRows, percent, modMatrix, oscTypeName, categoryName, CHUNKS_FULL, PRESET_SLOTS, hex,
} from '@/lib/microfreak/sysex'
import { createMicroFreakReader, microFreakOutput } from '@/lib/microfreak/reader'

const outputs = ref([])
const inputs = ref([])
const outName = ref('')
const inName = ref('')
const preset = ref(1)              // 1..512 as on the synth
const busy = ref(false)
const status = ref('')
const log = ref([])
const dump = ref(null)
const scan = ref([])               // [{ preset, name, category, osc }]

let reader = null

function refreshPorts() {
  outputs.value = midiService.getOutputs().map(p => p.name)
  inputs.value = midiService.getInputs().map(p => p.name)
  const guess = (list) => list.find(n => /microfreak/i.test(n)) ?? list[0] ?? ''
  if (!outputs.value.includes(outName.value)) outName.value = guess(outputs.value)
  if (!inputs.value.includes(inName.value)) inName.value = guess(inputs.value)
}

function requestStop() { reader?.stop() }

const note = (s) => { log.value.push(s); status.value = s }

async function begin() {
  let out = null
  try { out = await microFreakOutput(outName.value) } catch (e) { note(e.message); return null }
  refreshPorts()
  if (!out) { note(`Output "${outName.value}" not found.`); return null }
  reader = createMicroFreakReader(out, { inputName: inName.value || undefined, log: note })
  busy.value = true
  return reader
}

function end() {
  reader?.dispose()
  reader = null
  busy.value = false
}

async function read() {
  log.value = []; dump.value = null
  const r = await begin()
  if (!r) return
  const index = Math.max(1, Math.min(PRESET_SLOTS, preset.value | 0)) - 1
  try {
    note(`Reading preset ${index + 1}…`)
    const p = await r.readPreset(index, CHUNKS_FULL, true)
    if (!p) return
    if (r.stopped) note(`Stopped after ${p.rows.length} chunks.`)
    dump.value = { ...p, replies: [...r.replies], readAt: new Date().toISOString() }
    note(`Done: ${p.rows.length} data chunks, ${r.replies.length} replies in all.`)
  } catch (e) {
    note(`Error: ${e?.message ?? e}`)
  } finally {
    end()
  }
}

/** Names + oscillator of every slot (the first chunks only). */
async function scanBank() {
  log.value = []; scan.value = []
  const r = await begin()
  if (!r) return
  try {
    const rows = await r.scan((done, total, sofar) => {
      status.value = `Scanning preset ${done}/${total}…`
      scan.value = [...sofar]
    })
    note(`Scan ${r.stopped ? 'stopped' : 'done'}: ${rows.length} presets.`)
  } catch (e) {
    note(`Error: ${e?.message ?? e}`)
  } finally {
    end()
  }
}

/** Oscillator index → how many presets use it, and a few of their names (to look up on the synth). */
const oscSummary = computed(() => {
  const by = new Map()
  for (const r of scan.value) {
    if (r.osc === null) continue
    const e = by.get(r.osc) ?? { osc: r.osc, count: 0, examples: [] }
    e.count++
    if (e.examples.length < 3) e.examples.push(`${r.preset} ${r.name ?? '?'}`)
    by.set(r.osc, e)
  }
  return [...by.values()].sort((a, b) => a.osc - b.osc)
})

function exportScan() {
  download(JSON.stringify(scan.value, null, 2), 'microfreak-bank-scan.json')
}

const decoded = computed(() => (dump.value ? decodeRows(dump.value.rows) : null))
const matrix = computed(() => (decoded.value ? modMatrix(decoded.value) : []))
const matrixCols = computed(() => matrix.value[0]?.cells.map(c => c.col) ?? [])

function shown(sec, p) {
  if (sec === 'VCO' && p.name === 'Type') return `${oscTypeName(p.index)} (${p.index} / ${p.steps})`
  if (p.index !== null) return `${p.index} / ${p.steps}`
  if (p.steps === 0) return `${percent(p.value)}%`
  return `${p.value}`
}

function exportJson() {
  if (!dump.value) return
  download(JSON.stringify(dump.value, null, 2), `microfreak-preset-${String(dump.value.preset).padStart(3, '0')}.json`)
}

function download(text, filename) {
  const blob = new Blob([text], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

let unsubState = null
onMounted(() => {
  refreshPorts()
  unsubState = midiService.addStateChangeListener(() => refreshPorts())
})
onUnmounted(() => { unsubState?.(); end() })
</script>

<template>
  <div class="flex flex-col h-full overflow-y-auto custom-scrollbar">
    <div class="p-6 flex flex-col gap-5">
      <section>
        <h3 class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-1">MicroFreak · Preset read probe</h3>
        <p class="text-[10px] text-neutral-500 max-w-xl">
          Reads one preset over SysEx using the community's reverse-engineered protocol (Arturia does not document it).
          Read only — nothing is written to the synth. Export the JSON to compare it with what the MicroFreak shows.
        </p>
      </section>

      <section class="grid grid-cols-2 md:grid-cols-3 gap-3">
        <label class="flex flex-col gap-1 bg-neutral-900 border border-neutral-800 rounded-xl p-3">
          <span class="text-[9px] text-neutral-500 uppercase tracking-wider">MIDI Out</span>
          <select v-model="outName" class="bg-transparent text-xs font-mono text-emerald-400 focus:outline-none">
            <option v-for="n in outputs" :key="n" :value="n" class="bg-black">{{ n }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-1 bg-neutral-900 border border-neutral-800 rounded-xl p-3">
          <span class="text-[9px] text-neutral-500 uppercase tracking-wider">MIDI In</span>
          <select v-model="inName" class="bg-transparent text-xs font-mono text-emerald-400 focus:outline-none">
            <option v-for="n in inputs" :key="n" :value="n" class="bg-black">{{ n }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-1 bg-neutral-900 border border-neutral-800 rounded-xl p-3">
          <span class="text-[9px] text-neutral-500 uppercase tracking-wider">Preset (1–{{ PRESET_SLOTS }})</span>
          <input v-model.number="preset" type="number" min="1" :max="PRESET_SLOTS"
            class="bg-transparent text-xl font-mono font-black text-emerald-400 focus:outline-none w-full" />
        </label>
      </section>

      <section class="flex items-center gap-2">
        <button v-if="!busy" @click="read" :disabled="!outName"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-black text-xs font-bold disabled:opacity-40">
          <Search class="w-3.5 h-3.5" /> Read preset
        </button>
        <button v-if="!busy" @click="scanBank" :disabled="!outName"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs disabled:opacity-40"
          title="Names and oscillator of every preset slot">
          <ListOrdered class="w-3.5 h-3.5" /> Scan bank
        </button>
        <button v-else @click="requestStop"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-xs font-bold">
          <Loader2 class="w-3.5 h-3.5 animate-spin" /> <Square class="w-3 h-3" /> Stop
        </button>
        <button v-if="dump" @click="exportJson"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs">
          <Download class="w-3.5 h-3.5" /> Export JSON
        </button>
        <button v-if="scan.length && !busy" @click="exportScan"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs">
          <Download class="w-3.5 h-3.5" /> Export scan
        </button>
        <span class="text-[10px] text-neutral-400 font-mono">{{ status }}</span>
      </section>

      <section v-if="log.length" class="bg-neutral-950 border border-neutral-800 rounded-xl p-3 font-mono text-[10px] text-neutral-400">
        <div v-for="(l, i) in log" :key="i">{{ l }}</div>
      </section>

      <section v-if="dump" class="grid md:grid-cols-2 gap-4">
        <div class="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
          <h4 class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-2">
            {{ dump.name ?? '—' }} <span class="text-neutral-600">· {{ categoryName(dump.category) }}</span>
          </h4>
          <p v-if="decoded?.error" class="text-[10px] text-amber-400 font-mono mb-2">Stream: {{ decoded.error }}</p>
          <div v-if="matrix.length" class="mb-3">
            <div class="text-[10px] font-black text-emerald-500 font-mono mb-1">Mod matrix (%)</div>
            <table class="text-[10px] font-mono">
              <tr><td></td><td v-for="c in matrixCols" :key="c" class="text-neutral-500 px-1.5 text-right">{{ c }}</td></tr>
              <tr v-for="r in matrix" :key="r.row">
                <td class="text-neutral-500 pr-2">{{ r.row }}</td>
                <td v-for="c in r.cells" :key="c.col" class="px-1.5 text-right"
                  :class="c.amount > 0 ? 'text-emerald-400' : c.amount < 0 ? 'text-rose-400' : 'text-neutral-700'">{{ c.amount || '·' }}</td>
              </tr>
            </table>
          </div>
          <div v-for="sec in decoded?.sections ?? []" :key="sec.name" class="mb-2">
            <div class="text-[10px] font-black text-emerald-500 font-mono">{{ sec.name }}</div>
            <table class="w-full text-[11px] font-mono">
              <tr v-for="p in sec.params" :key="p.name">
                <td class="text-neutral-500 pr-3 w-24">{{ p.name }}</td>
                <td>{{ shown(sec.name, p) }}</td>
                <td class="text-neutral-600 text-right">{{ p.value }}<span v-if="p.steps"> · s{{ p.steps.toString(16) }}</span></td>
              </tr>
            </table>
          </div>
          <p v-if="decoded" class="text-[10px] text-neutral-600 font-mono">Sections end at byte {{ decoded.end }}; {{ decoded.rest.length }} bytes of sequence data follow (not decoded).</p>
        </div>
        <div class="bg-neutral-900 border border-neutral-800 rounded-xl p-3 overflow-x-auto">
          <h4 class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-2">Data rows ({{ dump.rows.length }} × 32 bytes)</h4>
          <div class="font-mono text-[9px] text-neutral-400 whitespace-pre leading-4">
            <div v-for="(r, i) in dump.rows" :key="i"><span class="text-neutral-600">{{ String(i).padStart(3, ' ') }}</span>  {{ hex(r) }}</div>
          </div>
        </div>
      </section>

      <section v-if="scan.length" class="grid md:grid-cols-2 gap-4">
        <div class="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
          <h4 class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-2">Oscillators in the bank</h4>
          <table class="w-full text-[11px] font-mono">
            <tr v-for="o in oscSummary" :key="o.osc">
              <td class="text-emerald-400 pr-3 w-24">{{ oscTypeName(o.osc) }}</td>
              <td class="text-neutral-500 pr-3">{{ o.count }}×</td>
              <td class="text-neutral-400">{{ o.examples.join(' · ') }}</td>
            </tr>
          </table>
        </div>
        <div class="bg-neutral-900 border border-neutral-800 rounded-xl p-3 max-h-96 overflow-y-auto custom-scrollbar">
          <h4 class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-2">Presets ({{ scan.length }})</h4>
          <table class="w-full text-[11px] font-mono">
            <tr v-for="r in scan" :key="r.preset">
              <td class="text-neutral-600 pr-2 w-10 text-right">{{ r.preset }}</td>
              <td class="pr-3">{{ r.name ?? '—' }}</td>
              <td class="text-neutral-500 pr-3">{{ categoryName(r.category) }}</td>
              <td class="text-emerald-400">{{ oscTypeName(r.osc) }}</td>
            </tr>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>
