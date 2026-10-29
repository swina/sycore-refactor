// State shared by the FM-1 Emulator panel, which owns the emulator's iframe, and the DECK's FM-1
// view: the firmware picked, the figures and the LCD the page posts, and a way to post to it.
// The iframe can't move into the DECK (moving it reloads it: a reboot), so the DECK mirrors its
// screen and drives its controls through the panel's bridge (public/fm1/main.js, "SY.CORE bridge").
import { ref, shallowRef, watch } from 'vue'
import { FM1_FIRMWARES, FM1_DEFAULT_FIRMWARE } from '@/lib/fm1-firmwares'
import { cableOutChannels } from '@/types/midi'

export const FM1_OUTPUT = 'FM-1 Emulator'
export const FM1_PANEL_ID = 'fm1-emulator'
export const FM1_LCD_SIZE = 240

const STORAGE_FW = 'SYCORE_FM1_FIRMWARE'

function readFirmware(): string {
  try {
    const id = localStorage.getItem(STORAGE_FW)
    if (id && FM1_FIRMWARES.some(f => f.id === id)) return id
  } catch {}
  return FM1_DEFAULT_FIRMWARE
}

export const fm1Firmware = ref(readFirmware())
watch(fm1Firmware, (id) => {
  try { localStorage.setItem(STORAGE_FW, id) } catch {}
})

/** The page's once-a-second figures (`fm1-stats`), null until it runs. */
export const fm1Stats = ref<Record<string, any> | null>(null)
/** The latest LCD (240×240 RGB565), only while something watches it. */
export const fm1Lcd = shallowRef<Uint16Array | null>(null)

let poster: ((m: unknown) => void) | null = null

/** The panel hands its iframe's postMessage over while mounted (null on unmount). */
export function setFm1Poster(fn: ((m: unknown) => void) | null) {
  poster = fn
}

export function fm1Post(m: unknown) {
  poster?.(m)
}

// The page sends its LCD only while asked to ({type:"sycore-lcd", on}).
let lcdWatchers = 0

export function fm1LcdWanted(): boolean {
  return lcdWatchers > 0
}

/** Start mirroring the LCD; call the returned function to stop. */
export function watchFm1Lcd(): () => void {
  if (lcdWatchers++ === 0) fm1Post({ type: 'sycore-lcd', on: true })
  let done = false
  return () => {
    if (done) return
    done = true
    if (--lcdWatchers === 0) {
      fm1Post({ type: 'sycore-lcd', on: false })
      fm1Lcd.value = null
    }
  }
}

/**
 * FM-1's input channels as set in MIDI Flow, per cable into it: its own OUT channels, else its
 * channel filter (0-based, sorted union; empty when no cable sets either). Keys are `${source}→${output}`.
 */
export function fm1InChannels(filters: Record<string, { channels?: number[]; outChannels?: number[] }>): number[] {
  const set = new Set<number>()
  for (const [key, f] of Object.entries(filters ?? {})) {
    if (!key.endsWith(`→${FM1_OUTPUT}`)) continue
    const out = cableOutChannels(f)
    for (const ch of out.length ? out : f?.channels ?? []) set.add(ch)
  }
  return [...set].sort((a, b) => a - b)
}

/**
 * A single-part firmware listens on one fixed channel: every channel message is moved onto it,
 * so the cable's channel filter in MIDI Flow acts as FM-1's MIDI Ch In (no filter: any channel).
 * Multi-part firmwares get the bytes as sent: the channel picks the part.
 */
export function fm1RemapChannel(bytes: number[], parts: number[]): number[] {
  if (parts.length !== 1 || bytes[0] < 0x80 || bytes[0] >= 0xf0) return bytes
  const status = (bytes[0] & 0xf0) | parts[0]
  return status === bytes[0] ? bytes : [status, ...bytes.slice(1)]
}

/** RGB565 pixels into an RGBA buffer of the same pixel count. */
export function rgb565ToRgba(src: Uint16Array, dst: Uint8ClampedArray) {
  for (let i = 0, j = 0; i < src.length; i++, j += 4) {
    const v = src[i]
    const r = (v >> 11) & 0x1f, g = (v >> 5) & 0x3f, b = v & 0x1f
    dst[j] = (r << 3) | (r >> 2)
    dst[j + 1] = (g << 2) | (g >> 4)
    dst[j + 2] = (b << 3) | (b >> 2)
    dst[j + 3] = 255
  }
}
