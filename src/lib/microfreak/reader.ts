// MicroFreak SysEx reader over midiService: one request, one reply, in turn.
// Used by the MicroFreak probe (MIDI Manager) and the Device Program Change
// panel's "Scan synth" (the bank list read from the unit).
import { midiService } from '@/core/midi/midi-service'
import {
  nameRequest, idRequest, dataRequest, parseReply, isArturiaSysEx, decodeRows, findParam, hex,
  CHUNKS_HEAD, PRESET_SLOTS, type Reply, type Rows, type ScanRow,
} from './sysex'

export interface ReadPreset { preset: number; name: string | null; category: number | null; rows: Rows }

export interface ReaderOptions {
  /** Only replies from this MIDI input (by name); any input when omitted. */
  inputName?: string
  /** Progress / diagnostics lines. */
  log?: (line: string) => void
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Asks the browser for SysEx when needed; the output by name, or null. */
export async function microFreakOutput(name: string): Promise<MIDIOutput | null> {
  if (!midiService.isSysExEnabled() && !(await midiService.enableSysEx())) throw new Error('SysEx access denied by the browser')
  return midiService.getOutputs().find(p => p.name === name) ?? null
}

export function createMicroFreakReader(out: MIDIOutput, opts: ReaderOptions = {}) {
  const log = opts.log ?? (() => {})
  let pending: { accept: (r: Reply) => boolean; resolve: (r: Reply | null) => void; timer: ReturnType<typeof setTimeout> } | null = null
  let stopped = false
  /** Every Arturia reply since the last clearReplies(), hex. */
  const replies: string[] = []

  const unsub = midiService.addRawListener((ev: MIDIMessageEvent) => {
    const d = ev.data
    if (!d || !isArturiaSysEx(d)) return
    const src = (ev.target as MIDIInput | null)?.name
    if (opts.inputName && src && src !== opts.inputName) return
    if (!pending) return
    replies.push(hex(d))
    const r = parseReply(d)
    if (r && pending.accept(r)) {
      clearTimeout(pending.timer)
      const p = pending
      pending = null
      p.resolve(r)
    }
  })

  function request(bytes: number[], accept: (r: Reply) => boolean, timeoutMs = 1000): Promise<Reply | null> {
    return new Promise(resolve => {
      pending = { accept, resolve, timer: setTimeout(() => { pending = null; resolve(null) }, timeoutMs) }
      out.send(bytes)
    })
  }

  /** Name + ID + `chunks` data requests for one preset (0-based). Null when the synth does not answer. */
  async function readPreset(index: number, chunks: number, verbose = false): Promise<ReadPreset | null> {
    const nameR = await request(nameRequest(index), r => r.kind === 'name' || r.kind === 'other')
    if (!nameR) { log(`Preset ${index + 1}: no reply to the name request — check the MIDI In port and that the MicroFreak is on USB.`); return null }
    if (verbose) log(nameR.kind === 'name' ? `Name: "${nameR.name}", category byte ${nameR.category}.` : `Name request answered with an unknown reply (type 0x${nameR.type.toString(16)}).`)
    await wait(15)
    const idR = await request(idRequest(index), () => true, 400)
    if (verbose) log(idR ? `ID request answered (${idR.kind}, ${idR.raw.length} bytes).` : 'ID request: no reply.')
    await wait(15)
    const rows: Rows = []
    for (let i = 0; i < chunks && !stopped; i++) {
      const r = await request(dataRequest(i), x => x.kind === 'data' || x.kind === 'other')
      if (!r) { log(`Preset ${index + 1}, chunk ${i}: no reply — stopping (${rows.length} chunks read).`); break }
      if (r.kind !== 'data') { log(`Preset ${index + 1}, chunk ${i}: unexpected reply type 0x${r.type.toString(16)}, ${r.raw.length} bytes — stopping.`); break }
      rows.push(r.row)
      await wait(15)
    }
    return {
      preset: index + 1,
      name: nameR.kind === 'name' ? nameR.name : null,
      category: nameR.kind === 'name' ? nameR.category : null,
      rows,
    }
  }

  /** Name, category and oscillator of every slot (the first chunks only). Stops early on stop() or no reply. */
  async function scan(onProgress?: (done: number, total: number, rows: ScanRow[]) => void): Promise<ScanRow[]> {
    const out: ScanRow[] = []
    for (let i = 0; i < PRESET_SLOTS && !stopped; i++) {
      replies.length = 0
      const p = await readPreset(i, CHUNKS_HEAD)
      if (!p) break
      out.push({ preset: p.preset, name: p.name, category: p.category, osc: findParam(decodeRows(p.rows), 'VCO', 'Type')?.index ?? null })
      onProgress?.(out.length, PRESET_SLOTS, out)
    }
    replies.length = 0
    return out
  }

  return {
    readPreset,
    scan,
    replies,
    clearReplies: () => { replies.length = 0 },
    stop: () => { stopped = true },
    get stopped() { return stopped },
    dispose: () => { stopped = true; if (pending) { clearTimeout(pending.timer); pending.resolve(null); pending = null } unsub() },
  }
}

export type MicroFreakReader = ReturnType<typeof createMicroFreakReader>
