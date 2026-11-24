/**
 * rig-actions.ts — every Rig Controller function as a MIDI Learn parameter, so any
 * controller can drive the rig (not only the Launchpad / MIDImix Rig modes).
 *
 *   rig_slot_<app>_<a–h>   slot pad (Latch, Trigger sync, armed with Live stopped)   button
 *   rig_gen_<app>          GEN                                                         button
 *   rig_mute_<app>         Mute                                                        button
 *   rig_solo_<app>         Solo                                                        button
 *   rig_sync_<app>         cycle the track's Trigger sync                              button
 *   rig_fill               Fill (Drum Machine)                                         button
 *   rig_seq_free           Seq Free: the Sequencer decoupled from the Chord Prog on / off button
 *   rig_chain_<drum|chord|seq>  the app's Chain mode on / off (taken at the end of its bar / slot / pattern) button
 *   rig_section_<1–8>      section: every app to that slot                             button
 *   rig_key_down / rig_key_up / rig_key_mode   Key ◀ ▶, Maj/Min                       button
 *   rig_play               Play / Stop (Rig Controls' big button: Live's, over SY.CORE Link) button
 *   rig_pause              Pause the song (Play goes on from its section; a Stop rewinds)  button
 *   rig_mixer              the Audio Mixer open / closed (Rig Controls' Mixer, floating)  button
 *   rig_tap / rig_tempo_down / rig_tempo_up    TAP (whole BPM), tempo − / + (1 BPM; Shift 0.1) button
 *   rig_tempo_round        the tempo to a whole BPM                                    button
 *   rig_tempo              tempo knob: each step it moves = 0.5 BPM (relative: no jump) knob
 *   rig_intensity_<app>    Intensity (0–127)                                           knob / fader
 *   rig_global             Global intensity (0–127)                                    knob / fader
 *   rig_density_<drum|seq> Density (0–127; rig-density.ts)                             knob / fader
 *   rig_density_bass       Bass lane Density (the Bass row on its lane)                 knob / fader
 *   rig_density_arp        Arp lane Density; on the Arpeggiator: its octave range (−3…+3); rig_intensity_arp = its rate  knob / fader
 *
 * The MIDI Learn handler (useMidiCCListener) turns a mapped message into a
 * 'rig-action' window event; the Rig Controller panel acts on it while open
 * (as with its Launchpad Rig mode). <app> = chord | drum | seq | bass | arp (Arp slots: arp modes).
 */
export type RigActionApp = 'chord' | 'drum' | 'seq' | 'bass' | 'arp'
export const RIG_ACTION_APPS: readonly RigActionApp[] = ['chord', 'drum', 'seq', 'bass', 'arp']
const APP_LABEL: Record<RigActionApp, string> = { chord: 'Chord', drum: 'Drum', seq: 'Seq', bass: 'Bass', arp: 'Arp' }
const SLOTS = 'abcdefgh'

export type RigAction =
  | { kind: 'slot'; app: RigActionApp; slot: number }
  | { kind: 'gen' | 'mute' | 'solo' | 'sync' | 'intensity'; app: RigActionApp }
  | { kind: 'fill' | 'seq_free' | 'play' | 'pause' | 'mixer' | 'key_down' | 'key_up' | 'key_mode' | 'global' | 'tap' | 'tempo_down' | 'tempo_up' | 'tempo_round' | 'tempo' }
  | { kind: 'section'; index: number }
  | { kind: 'density'; app: 'drum' | 'seq' | 'bass' | 'arp' }
  | { kind: 'chain'; app: 'drum' | 'chord' | 'seq' }

const isApp = (s: string): s is RigActionApp => (RIG_ACTION_APPS as readonly string[]).includes(s)

/** The rig action of a MIDI Learn parameter name, or null. */
export function parseRigAction(name: string): RigAction | null {
  if (!name.startsWith('rig_')) return null
  const rest = name.slice(4)
  if (rest === 'fill' || rest === 'seq_free' || rest === 'play' || rest === 'pause' || rest === 'mixer' || rest === 'key_down' || rest === 'key_up' || rest === 'key_mode' || rest === 'global' || rest === 'tap' || rest === 'tempo_down' || rest === 'tempo_up' || rest === 'tempo_round' || rest === 'tempo') return { kind: rest }
  let m = /^slot_([a-z]+)_([a-h])$/.exec(rest)
  if (m && isApp(m[1])) return { kind: 'slot', app: m[1], slot: SLOTS.indexOf(m[2]) }
  m = /^(gen|mute|solo|sync|intensity)_([a-z]+)$/.exec(rest)
  if (m && isApp(m[2])) return { kind: m[1] as 'gen', app: m[2] }
  m = /^section_([1-8])$/.exec(rest)
  if (m) return { kind: 'section', index: Number(m[1]) - 1 }
  m = /^chain_(drum|chord|seq)$/.exec(rest)
  if (m) return { kind: 'chain', app: m[1] as 'drum' | 'chord' | 'seq' }
  m = /^density_(drum|seq|bass|arp)$/.exec(rest)
  if (m) return { kind: 'density', app: m[1] as 'drum' | 'seq' | 'bass' | 'arp' }
  return null
}

/** Knobs and faders (the value matters) vs buttons (a press fires). */
export const isContinuousRigAction = (a: RigAction): boolean =>
  a.kind === 'intensity' || a.kind === 'global' || a.kind === 'density' || a.kind === 'tempo'

/** The parameter name of a slot pad. */
export const rigSlotParam = (app: RigActionApp, slot: number) => `rig_slot_${app}_${SLOTS[slot]}`

/** Every rig action, for the Controller Designer and the docs: { paramName, label }. */
export function rigActionCatalog(): { paramName: string; label: string }[] {
  const out: { paramName: string; label: string }[] = []
  for (const app of RIG_ACTION_APPS) {
    const L = APP_LABEL[app]
    for (let i = 0; i < 8; i++) out.push({ paramName: rigSlotParam(app, i), label: `${L} slot ${SLOTS[i].toUpperCase()}` })
    out.push({ paramName: `rig_gen_${app}`, label: `${L} GEN` })
    out.push({ paramName: `rig_mute_${app}`, label: `${L} Mute` })
    out.push({ paramName: `rig_solo_${app}`, label: `${L} Solo` })
    out.push({ paramName: `rig_sync_${app}`, label: `${L} Trigger sync (cycle)` })
    out.push({ paramName: `rig_intensity_${app}`, label: app === 'arp' ? 'Arp Rate' : `${L} Intensity` })
  }
  out.push({ paramName: 'rig_density_drum', label: 'Drum Density' })
  out.push({ paramName: 'rig_density_seq', label: 'Seq Density' })
  out.push({ paramName: 'rig_density_bass', label: 'Bass Density' })
  out.push({ paramName: 'rig_density_arp', label: 'Arp Density / Octave' })
  out.push({ paramName: 'rig_global', label: 'Global intensity' })
  out.push({ paramName: 'rig_fill', label: 'Fill' })
  out.push({ paramName: 'rig_seq_free', label: 'Seq Free (decoupled from Chord Prog)' })
  out.push({ paramName: 'rig_chain_drum', label: 'Drum Chain' })
  out.push({ paramName: 'rig_chain_chord', label: 'Chord Chain' })
  out.push({ paramName: 'rig_chain_seq', label: 'Seq Chain' })
  for (let i = 1; i <= 8; i++) out.push({ paramName: `rig_section_${i}`, label: `Section ${i}` })
  out.push({ paramName: 'rig_key_down', label: 'Key −' })
  out.push({ paramName: 'rig_key_up', label: 'Key +' })
  out.push({ paramName: 'rig_key_mode', label: 'Key Maj/Min' })
  out.push({ paramName: 'rig_play', label: 'Play / Stop' })
  out.push({ paramName: 'rig_pause', label: 'Pause song' })
  out.push({ paramName: 'rig_mixer', label: 'Audio Mixer (open / close)' })
  out.push({ paramName: 'rig_tap', label: 'Tap tempo' })
  out.push({ paramName: 'rig_tempo_down', label: 'Tempo −' })
  out.push({ paramName: 'rig_tempo_up', label: 'Tempo +' })
  out.push({ paramName: 'rig_tempo_round', label: 'Tempo round' })
  out.push({ paramName: 'rig_tempo', label: 'Tempo (knob)' })
  return out
}

/** What a rig app shows on a controller's LEDs. */
export interface RigFeedbackApp { id: string; playing: number | null; queued: number | null; muted: boolean; solo: boolean; filled?: readonly boolean[] }

/** The state an LED of a MIDI-learned rig control shows. */
export type RigLedState = 'off' | 'filled' | 'playing' | 'queued' | 'muted' | 'solo'

/**
 * LED state of a MIDI-learned rig control: a slot pad is 'filled' when it holds something,
 * 'playing' while it plays, and blinks 'queued' while queued or armed (`blink` = the blink's on
 * phase, otherwise its own state); Mute / Solo are 'muted' / 'solo' while on. Other controls (GEN,
 * Fill, sections, key…) are momentary: 'off'. Null: not a rig control, or a knob / fader.
 */
export function rigLedState(paramName: string, apps: readonly RigFeedbackApp[], blink: boolean): RigLedState | null {
  const a = parseRigAction(paramName)
  if (!a || isContinuousRigAction(a)) return null
  const app = 'app' in a ? apps.find(x => x.id === a.app) : undefined
  if (a.kind === 'slot') {
    if (!app) return 'off'
    if (app.playing === a.slot) return 'playing'
    if (app.queued === a.slot && blink) return 'queued'
    return app.filled?.[a.slot] ? 'filled' : 'off'
  }
  if (a.kind === 'mute') return app?.muted ? 'muted' : 'off'
  if (a.kind === 'solo') return app?.solo ? 'solo' : 'off'
  return 'off'
}

/** The value sent back (note velocity / CC value) for each LED state. */
export type LedPalette = Record<RigLedState, number>

/** Any controller: lit (127) or dark (0) — a filled slot stays dark, so a one-colour pad tells
 *  playing and queued apart from nothing. */
export const GENERIC_PALETTE: LedPalette = { off: 0, filled: 0, playing: 127, queued: 127, muted: 127, solo: 127 }

/** Launchpad Mini MK1 (velocity = colour, as in its Rig mode): filled amber, playing green, queued
 *  blinking green / amber, muted red, solo green. */
export const LAUNCHPAD_MK1_PALETTE: LedPalette = { off: 12, filled: 63, playing: 60, queued: 60, muted: 15, solo: 60 }

/** The palette for a controller, from its port name (the Launchpads from MK3 on use another
 *  protocol: generic until they have a template). */
export function ledPaletteFor(deviceName: string | null | undefined): LedPalette {
  const n = deviceName ?? ''
  if (/Launchpad/i.test(n) && !/MK3|Launchpad X|Pro/i.test(n)) return LAUNCHPAD_MK1_PALETTE
  return GENERIC_PALETTE
}
