/**
 * lane-sound.ts — a Sequencer lane's slot (bank) remembers a sound: the preset each device its lane
 * is cabled to has on the lane's MIDI channel (MIDI Flow's Program Change state, reg.pcChannels).
 * When that bank starts playing, the presets are sent again (bank select + Program Change).
 * A Roland S-1 bank sound (no Program Change) is left out.
 */
import type { PcChannelState } from '@/types/midi'
import { presetMessages } from '@/lib/virtual-device'

export interface LaneSoundTarget { device: string; ch: number; preset: PcChannelState }
export interface LaneSound { targets: LaneSoundTarget[] }

/** The cabled devices with the channels the lane reaches on each, and their recorded presets. */
export interface LaneReach { device: string; chs: number[]; pcChannels?: Record<string | number, PcChannelState | null | undefined> }

/** The sound now on the lane's channel(s): every device + channel with a preset recorded; null when none. */
export function captureLaneSound(reach: LaneReach[]): LaneSound | null {
  const targets: LaneSoundTarget[] = []
  for (const r of reach) {
    for (const ch of r.chs) {
      const p = r.pcChannels?.[ch]
      if (p && p.program != null && !p.engine) targets.push({ device: r.device, ch, preset: JSON.parse(JSON.stringify(p)) })
    }
  }
  return targets.length ? { targets } : null
}

/** The messages that recall the sound, by device. */
export function laneSoundMessages(sound: LaneSound | null | undefined): { device: string; msgs: number[][] }[] {
  return (sound?.targets ?? [])
    .map(t => ({ device: t.device, msgs: presetMessages(t.preset, t.ch) }))
    .filter(m => m.msgs.length)
}

/** A short label: the first preset's name (+N more), or bank:program. */
export function laneSoundLabel(sound: LaneSound | null | undefined): string {
  const t = sound?.targets ?? []
  if (!t.length) return ''
  const p = t[0].preset
  const name = p.soundName || (p.program != null ? `PC ${p.program + 1}` : '?')
  return t.length > 1 ? `${name} +${t.length - 1}` : name
}
