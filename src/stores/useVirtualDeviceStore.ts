// Virtual Device Panel state: per virtual instrument, the selected channel (the registration's
// pcChannel, shared with the Program Change panel and the DECK), the last value of each CC table
// control per channel, and the saved sounds — up to VD_SOUNDS_PER_CHANNEL per channel, each the
// name + preset + control values of that channel. Controls send their CC to the selected channel.
// Preset browsing goes through the Program Change panel ('device-pc-preset-step'), which owns the
// catalogs and each device's bank select format.
import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useMidiStore } from './useMidiStore'
import { midiService } from '@/core/midi/midi-service'
import { userKey } from '@/lib/userKey'
import { debounce } from '@/lib/debounce'
import { dispatch } from '@/types/events'
import { presetMessages, stepIn } from '@/lib/virtual-device'
import type { PcChannelState } from '@/types/midi'

export interface VdSound {
  id: string
  name: string
  channel: number                 // the channel it belongs to (0-based)
  slot: number                    // its pad on that channel (0 .. VD_SOUNDS_PER_CHANNEL - 1)
  preset: PcChannelState | null
  cc: Record<number, number>      // CC number → value
  savedAt: number
}

/** Saved sounds per channel (slots shown in the panel). */
export const VD_SOUNDS_PER_CHANNEL = 8
/** A control's value until it's first moved (the device's own value is unknown). */
export const VD_CC_DEFAULT = 64
/** Time for the device to load a recalled preset before its control values are sent. */
const RECALL_CC_DELAY_MS = 150

const LS_SELECTED = 'SYCORE_VD_SELECTED'
const LS_CC       = 'SYCORE_VD_CC_VALUES'
const LS_SOUNDS   = 'SYCORE_VD_SOUNDS'
const LS_SCOPE    = 'SYCORE_VD_BROWSE_SCOPE'
const LS_THEME    = 'SYCORE_VD_LCD_THEME'

function load<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(userKey(key)) ?? 'null') ?? fallback } catch { return fallback }
}
function save(key: string, value: unknown) {
  try { localStorage.setItem(userKey(key), JSON.stringify(value)) } catch {}
}

export const useVirtualDeviceStore = defineStore('virtualDevice', () => {
  const midiStore = useMidiStore()

  const selectedDevice = ref<string>(load(LS_SELECTED, ''))
  // device → channel → cc → value
  const ccValues = ref<Record<string, Record<number, Record<number, number>>>>(load(LS_CC, {}))
  // sounds saved before they belonged to a channel go to channel 1, and before they had a pad
  // to the first free ones of their channel (in saved order); a 9th+ is dropped
  function migrate(list: VdSound[]): VdSound[] {
    const used = new Map<number, Set<number>>()
    const taken = (ch: number) => used.get(ch) ?? used.set(ch, new Set()).get(ch)!
    const withCh = list.map(s => ({ ...s, channel: s.channel ?? 0 }))
    for (const s of withCh) if (s.slot != null) taken(s.channel).add(s.slot)
    const out: VdSound[] = []
    for (const s of withCh) {
      if (s.slot == null) {
        const free = Array.from({ length: VD_SOUNDS_PER_CHANNEL }, (_, i) => i).find(i => !taken(s.channel).has(i))
        if (free == null) continue
        taken(s.channel).add(free)
        s.slot = free
      }
      out.push(s)
    }
    return out
  }
  const sounds = ref<Record<string, VdSound[]>>(Object.fromEntries(
    Object.entries(load<Record<string, VdSound[]>>(LS_SOUNDS, {})).map(([dev, list]) => [dev, migrate(list)])))
  /** The sound recalled last (highlighted in the panel), whoever recalled it (click or MIDI). */
  const lastRecalledId = ref<string | null>(null)
  /** PRESET ▼▲ steps through the whole bank, or only the current preset's category (TYPE). */
  const browseScope = ref<'all' | 'category'>(load(LS_SCOPE, 'all'))

  watch(selectedDevice, v => save(LS_SELECTED, v))
  watch(browseScope, v => save(LS_SCOPE, v))
  /** The LCD's color theme (lib/virtual-device.ts LCD_THEMES id). */
  const lcdThemeId = ref<string>(load(LS_THEME, 'teal'))
  watch(lcdThemeId, v => save(LS_THEME, v))
  // a knob drag (or a learned CC) writes many values: persist the latest once it settles
  const persistCc = debounce(() => save(LS_CC, ccValues.value), 300)

  const devices = computed(() => midiStore.virtualInstruments.map(v => v.name))

  function ccTable(device: string) {
    return midiStore.virtualInstruments.find(v => v.name === device)?.ccTable ?? []
  }

  /** The channels to choose from: the ones mapped in MIDI Flow (parts), else all 16. */
  function channels(device: string): number[] {
    const parts = midiStore.partChannels(device)
    return parts.length ? parts : Array.from({ length: 16 }, (_, i) => i)
  }

  function channel(device: string): number {
    const reg = midiStore.routingConfig.registrations[device]
    const list = channels(device)
    const ch = Math.max(0, reg?.pcChannel ?? 0)
    return list.includes(ch) ? ch : list[0]
  }

  function setChannel(device: string, ch: number) {
    if (!midiStore.routingConfig.registrations[device]) midiStore.addRegistration(device)
    midiStore.updateRegistration(device, 'pcChannel', ch)
    dispatch('device-pc-select', { deviceName: device, channel: ch + 1 })
  }

  function stepChannel(device: string, dir: number) {
    const next = stepIn(channels(device), channel(device), dir)
    if (next != null) setChannel(device, next)
  }

  function presetState(device: string, ch = channel(device)): PcChannelState | null {
    return midiStore.routingConfig.registrations[device]?.pcChannels?.[ch] ?? null
  }

  function stepPreset(device: string, dir: number) {
    dispatch('device-pc-preset-step', { deviceName: device, channel: channel(device), delta: dir, scope: browseScope.value })
  }

  function getCc(device: string, cc: number, ch = channel(device)): number {
    return ccValues.value[device]?.[ch]?.[cc] ?? VD_CC_DEFAULT
  }

  function sendCc(device: string, ch: number, cc: number, value: number) {
    midiService.sendRawToDeviceByName(device, [0xb0 | (ch & 0x0f), cc & 0x7f, value & 0x7f])
  }

  /** A control moved: store its value for the selected channel and send the CC there. */
  function setCc(device: string, cc: number, value: number) {
    const v = Math.max(0, Math.min(127, Math.round(value)))
    const ch = channel(device)
    const dev = (ccValues.value[device] ??= {})
    const chVals = (dev[ch] ??= {})
    chVals[cc] = v
    sendCc(device, ch, cc, v)
    persistCc()
  }

  /** The device's sounds of channel `ch`, by pad (all of them without `ch`). */
  function soundsOf(device: string, ch?: number): VdSound[] {
    const all = sounds.value[device] ?? []
    return ch == null ? all : all.filter(s => s.channel === ch).sort((x, y) => x.slot - y.slot)
  }

  /** The sound on pad `slot` (0-based) of channel `ch`, or null. */
  function soundAt(device: string, ch: number, slot: number): VdSound | null {
    return soundsOf(device, ch).find(s => s.slot === slot) ?? null
  }

  /**
   * Saves the selected channel's preset and control values under `name`: on pad `slot` when given
   * (whatever was there is overwritten), else on the pad of the sound with that name on this
   * channel, else on the first free pad. null when the name is empty or every pad is taken.
   */
  function saveSound(device: string, name: string, slot?: number): VdSound | null {
    const n = name.trim()
    if (!n || !device) return null
    const ch = channel(device)
    const mine = soundsOf(device, ch)
    let target = slot
    if (target == null) target = mine.find(s => s.name === n)?.slot
    if (target == null) target = Array.from({ length: VD_SOUNDS_PER_CHANNEL }, (_, i) => i).find(i => !mine.some(s => s.slot === i))
    if (target == null || target < 0 || target >= VD_SOUNDS_PER_CHANNEL) return null
    const cc: Record<number, number> = {}
    for (const row of ccTable(device)) cc[row.cc] = getCc(device, row.cc, ch)
    const sound: VdSound = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: n, channel: ch, slot: target, preset: presetState(device, ch), cc, savedAt: Date.now() }
    sounds.value = { ...sounds.value, [device]: [...soundsOf(device).filter(s => !(s.channel === ch && s.slot === target)), sound] }
    save(LS_SOUNDS, sounds.value)
    return sound
  }

  function deleteSound(device: string, id: string) {
    sounds.value = { ...sounds.value, [device]: soundsOf(device).filter(s => s.id !== id) }
    save(LS_SOUNDS, sounds.value)
  }

  /**
   * Recalls a sound onto the selected channel: its preset first (as the Program Change panel
   * would send it, recorded on that channel), then — once the device has loaded it — every
   * control's CC value.
   */
  function recallSound(device: string, id: string): Promise<void> {
    const sound = soundsOf(device).find(s => s.id === id)
    if (!sound) return Promise.resolve()
    lastRecalledId.value = id
    const ch = channel(device)
    const msgs = presetMessages(sound.preset, ch)
    for (const m of msgs) midiService.sendRawToDeviceByName(device, m)
    if (sound.preset && msgs.length) {
      const reg = midiStore.routingConfig.registrations[device]
      midiStore.updateRegistration(device, 'pcChannels', { ...(reg?.pcChannels ?? {}), [ch]: { ...sound.preset, msgs } })
      dispatch('device-pc-toast', { deviceName: device, channel: ch })
    }
    return new Promise(resolve => setTimeout(() => {
      const dev = (ccValues.value[device] ??= {})
      const chVals = (dev[ch] ??= {})
      // in the CC table's order, then any CC no longer in it
      const tableOrder = ccTable(device).map(r => r.cc).filter(cc => cc in sound.cc)
      const ccs = [...tableOrder, ...Object.keys(sound.cc).map(Number).filter(cc => !tableOrder.includes(cc))]
      for (const cc of ccs) {
        chVals[cc] = sound.cc[cc]
        sendCc(device, ch, cc, sound.cc[cc])
      }
      persistCc()
      resolve()
    }, msgs.length ? RECALL_CC_DELAY_MS : 0))
  }

  // The selected pad (where Save writes): per device + channel, null = none.
  const selectedSlot = ref<{ device: string; channel: number; slot: number } | null>(null)

  /** The selected pad of the device's selected channel, or null. */
  function selectedSlotOf(device: string): number | null {
    const s = selectedSlot.value
    return s && s.device === device && s.channel === channel(device) ? s.slot : null
  }

  /** Selects pad `slot` (0-based) of the selected channel and recalls its sound, if it has one. */
  function selectSlot(device: string, slot: number): Promise<void> {
    const ch = channel(device)
    selectedSlot.value = { device, channel: ch, slot }
    const sound = soundAt(device, ch, slot)
    return sound ? recallSound(device, sound.id) : Promise.resolve()
  }

  /** A pad pressed on a controller (MIDI Learn): same as clicking it. */
  function recallSlot(device: string, slot: number): Promise<void> {
    return selectSlot(device, slot)
  }

  return {
    selectedDevice, ccValues, sounds, browseScope, devices, lastRecalledId, recallSlot, soundAt,
    selectedSlot, selectedSlotOf, selectSlot, lcdThemeId,
    ccTable, channels, channel, setChannel, stepChannel, presetState, stepPreset,
    getCc, setCc, soundsOf, saveSound, deleteSound, recallSound,
  }
})
