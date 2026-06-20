import { userKey } from '@/lib/userKey'

export type DeviceType =
  | 'controller'
  | 'instrument-single'
  | 'instrument-multi'
  | 'audio-interface'

export interface MidiDeviceDescriptor {
  id: string
  name: string
  hasInput: boolean
  hasOutput: boolean
  type: DeviceType
  audioInterface: boolean
  online: boolean
  addedAt: number
  userOverride: boolean
}

// ─── Heuristic keyword lists ────────────────────────────────────────────────

const AUDIO_INTERFACE_KEYWORDS = [
  'focusrite', 'scarlett', 'clarett', 'saffire',
  'ssl 2', 'ssl 12', 'ssl native',
  'motu', '828', 'ultralite',
  'presonus', 'audiobox', 'studio 24', 'studio 26', 'studio 68',
  'rme', 'babyface', 'fireface', 'ucx', 'ufx',
  'universal audio', 'apollo',
  'steinberg', 'ur22', 'ur44', 'ur816',
  'behringer umc', 'uphoria',
  'audient id', 'id14', 'id22', 'id44',
  'tascam us-', 'tascam series',
  'lexicon alpha', 'lexicon lambda',
  'komplete audio',
  'm-audio air',
  'iconnectmidi', 'iconnectaudio',
  'zoom u-', 'zoom r',
  'arturia audiofuse',
  'antelope', 'zen tour', 'orion',
]

const CONTROLLER_KEYWORDS = [
  // Arturia controllers (not synths)
  'minilab', 'keylab', 'beatstep', 'drumbrute',
  // Akai controllers (not MPC)
  'mpk mini', 'mpk249', 'mpk261', 'mpd218', 'mpd232', 'mpd226', 'apc40', 'apc mini',
  // Novation controllers (not Circuit)
  'launchpad', 'launchkey', 'launch control', 'sl mkiii', 'sl mk3',
  // Native Instruments
  'komplete kontrol', 'maschine', 's25', 's49', 's61', 's88',
  // Korg nano
  'nanokey', 'nanokontrol', 'nanopad',
  // Roland controllers
  'a-49', 'a-88', 'a-500', 'a-800',
  // Behringer controllers
  'x-touch', 'bcf2000', 'bcr2000', 'umx', 'uca',
  // M-Audio controllers
  'oxygen', 'keystation', 'axiom',
  // Other controllers
  'livid', 'keith mcmillen', 'softstep', 'quneo',
  'artiphon', 'roli', 'seaboard',
  'icon platform',
  'midi fighter',
  'ableton push',
  'surface pro',
]

const MULTI_TIMBRAL_KEYWORDS = [
  // Korg
  'korg m1', 'korg t1', 'korg t2', 'korg t3',
  'triton', 'kronos', 'oasys', 'nautilus',
  'korg x5', 'korg x50', 'korg i3', 'm50', 'wavestation',
  // Yamaha
  'motif', 'moxf', 'sy77', 'sy99', 'tg33', 'tg55', 'dx7 ii', 'fs1r',
  'montage', 'modx',
  // Roland
  'jv-1080', 'jv-2080', 'xv-3080', 'xv-5080', 'jd-800', 'jd-990',
  'fantom', 'integra', 'sound canvas', 'sc-55', 'sc-88',
  'fa-06', 'fa-07', 'fa-08',
  // Kurzweil
  'kurzweil', 'k2600', 'k2500', 'pc3', 'pc4', 'forte',
  // Ensoniq / E-mu
  'ensoniq', 'e-mu', 'emu proteus', 'vintage keys',
  // Sequential
  'prophet-08', 'prophet 08', 'rev2', 'pro 3',
]

// ─── Classification ──────────────────────────────────────────────────────────

function classifyDevice(name: string): DeviceType {
  const lower = name.toLowerCase()

  for (const kw of AUDIO_INTERFACE_KEYWORDS) {
    if (lower.includes(kw)) return 'audio-interface'
  }
  for (const kw of MULTI_TIMBRAL_KEYWORDS) {
    if (lower.includes(kw)) return 'instrument-multi'
  }
  for (const kw of CONTROLLER_KEYWORDS) {
    if (lower.includes(kw)) return 'controller'
  }

  // Default: treat unknown hardware as a single-timbral instrument
  return 'instrument-single'
}

// ─── Registry ────────────────────────────────────────────────────────────────

const LS_KEY = 'SYCORE_DEVICE_REGISTRY'

export class DeviceRegistry {
  private descriptors: Map<string, MidiDeviceDescriptor> = new Map()
  private changeListeners: (() => void)[] = []

  constructor() {
    this.load()
  }

  // ── Persistence ────────────────────────────────────────────────────────────

  private load(): void {
    try {
      const raw = localStorage.getItem(userKey(LS_KEY))
      if (raw) {
        const arr: MidiDeviceDescriptor[] = JSON.parse(raw)
        arr.forEach(d => this.descriptors.set(d.id, d))
      }
    } catch {
      // corrupt data — start fresh
    }
  }

  private save(): void {
    try {
      localStorage.setItem(userKey(LS_KEY), JSON.stringify([...this.descriptors.values()]))
    } catch {
      // storage quota — ignore
    }
  }

  // ── Change notification ────────────────────────────────────────────────────

  onChange(cb: () => void): () => void {
    this.changeListeners.push(cb)
    return () => {
      this.changeListeners = this.changeListeners.filter(l => l !== cb)
    }
  }

  private notify(): void {
    this.changeListeners.forEach(cb => cb())
  }

  // ── Sync with live MIDI ports ──────────────────────────────────────────────

  sync(inputs: MIDIInput[], outputs: MIDIOutput[]): void {
    // Mark every known descriptor offline before re-evaluating
    this.descriptors.forEach(d => { d.online = false })

    const upsert = (port: MIDIInput | MIDIOutput, isInput: boolean) => {
      const id = port.name ?? port.id
      const existing = this.descriptors.get(id)

      if (existing) {
        existing.online = true
        if (isInput) existing.hasInput = true
        else existing.hasOutput = true
      } else {
        const type = classifyDevice(id)
        this.descriptors.set(id, {
          id,
          name: id,
          hasInput: isInput,
          hasOutput: !isInput,
          type,
          audioInterface: type === 'audio-interface',
          online: true,
          addedAt: Date.now(),
          userOverride: false,
        })
      }
    }

    inputs.forEach(p => upsert(p, true))
    outputs.forEach(p => upsert(p, false))

    this.save()
    this.notify()
  }

  // ── Accessors ──────────────────────────────────────────────────────────────

  getAll(): MidiDeviceDescriptor[] {
    return [...this.descriptors.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  get(id: string): MidiDeviceDescriptor | undefined {
    return this.descriptors.get(id)
  }

  getOnline(): MidiDeviceDescriptor[] {
    return this.getAll().filter(d => d.online)
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  setType(id: string, type: DeviceType): void {
    const d = this.descriptors.get(id)
    if (!d) return
    d.type = type
    d.audioInterface = type === 'audio-interface'
    d.userOverride = true
    this.save()
    this.notify()
  }

  remove(id: string): void {
    this.descriptors.delete(id)
    this.save()
    this.notify()
  }

  clear(): void {
    this.descriptors.clear()
    this.save()
    this.notify()
  }
}

export const deviceRegistry = new DeviceRegistry()
