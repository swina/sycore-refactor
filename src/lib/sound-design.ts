/**
 * sound-design.ts — the Sound Design workspace's devices (four contexts, phase 4): the sound devices cabled in
 * MIDI Flow (its canvas: hardware instruments, virtual instruments — not the controllers, not the apps), and the
 * editor each one opens in the middle pane: the Roland S-1 → the Sound Engine, the Arturia MicroFreak → the
 * MicroFreak Editor, any other → the Virtual Device. The device picked is remembered (per user).
 */
import { ref, watch } from 'vue'
import { userKey } from './userKey'

export type SoundEditor = 'sound-engine' | 'microfreak-editor' | 'virtual-device'
export const SOUND_EDITORS: SoundEditor[] = ['sound-engine', 'microfreak-editor', 'virtual-device']

export interface SoundDevice {
  name: string
  /** 'instrument-single' | 'instrument-multi' | 'virtual' */
  type: string
  /** A virtual instrument's MIDI output port ('' for hardware). */
  port: string
  editor: SoundEditor
}

interface CanvasNode { name?: string; type?: string; sourceId?: string }
interface Registration { pcTemplate?: string }
interface VirtualInstrument { name: string; midiOutputPort?: string }

const isS1 = (name: string, reg?: Registration) => reg?.pcTemplate === 'roland-s1' || /(^|[^a-z0-9])s-?1([^a-z0-9]|$)/i.test(name)
const isMicroFreak = (name: string, reg?: Registration) => reg?.pcTemplate === 'mfprojz' || /micro\s*freak/i.test(name)

/** The editor of a device: by its own name / template, or the port a virtual instrument plays through. */
export function editorFor(name: string, regs: Record<string, Registration | undefined>, port = ''): SoundEditor {
  const hit = (test: typeof isS1) => test(name, regs[name]) || (!!port && test(port, regs[port]))
  if (hit(isS1)) return 'sound-engine'
  if (hit(isMicroFreak)) return 'microfreak-editor'
  return 'virtual-device'
}

/** The sound devices on MIDI Flow's canvas, in canvas order (each once). */
export function soundDevicesOf(nodes: CanvasNode[], regs: Record<string, Registration | undefined>, virtuals: VirtualInstrument[]): SoundDevice[] {
  const out: SoundDevice[] = []
  const seen = new Set<string>()
  for (const n of nodes) {
    const name = n.name ?? ''
    if (!name || n.sourceId || n.type === 'controller' || seen.has(name)) continue
    seen.add(name)
    const vi = virtuals.find(v => v.name === name)
    const type = vi ? 'virtual' : (n.type ?? 'instrument-single')
    const port = vi?.midiOutputPort ?? ''
    out.push({ name, type, port, editor: editorFor(name, regs, port) })
  }
  return out
}

const LS_DEVICE = 'SYCORE_SOUND_DESIGN_DEVICE'
const read = () => { try { return localStorage.getItem(userKey(LS_DEVICE)) ?? '' } catch { return '' } }
/** The device picked in Sound Design ('' none). */
export const soundDesignDevice = ref<string>(read())
/** The MIDI port the picked device plays through (hardware: its own name; a virtual instrument: its port). */
export const soundDesignPort = ref<string>('')
watch(soundDesignDevice, v => { try { localStorage.setItem(userKey(LS_DEVICE), v) } catch {} })
