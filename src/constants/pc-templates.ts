/**
 * Program Change bank/patch templates — the set of device-specific bank
 * formats MidiDeviceProgramChangePanel.vue knows how to show. Assigned
 * per-device from MIDI Devices (DeviceRegistration.pcTemplate); unassigned
 * devices fall back to the panel's legacy auto-detect behavior.
 *
 * Single source of truth shared by the MIDI Devices picker and the Program
 * Change panel's per-template branching, so they can't drift out of sync.
 */
import type { PcTemplateId } from '@/types/midi'

export interface PcTemplateMeta {
  id: PcTemplateId
  label: string
  description: string
}

export const PC_TEMPLATES: PcTemplateMeta[] = [
  { id: 'mfprojz',    label: 'Arturia MicroFreak',        description: 'Built-in factory banks, plus import a .mfprojz bank from Arturia MIDI Control Center.' },
  { id: 'roland-s1',  label: 'Roland S-1 Sound Engine',   description: "SY.CORE's own internal Sound Library / preset browser." },
  { id: 'emulatorx3', label: 'E-MU Emulator X3',          description: 'Import an Emulator X3 preset/sample listing (.txt export).' },
  { id: 'seqtrak',    label: 'Yamaha SEQTRAK',            description: 'Built-in AWM2/DX/Drums/Sampler banks.' },
  { id: 'json',       label: 'Standard JSON',             description: 'Import a generic bank from a { pc, name } JSON array.' },
  { id: 'kawai-k1',   label: "Kawai K1 (NILS' KAWAY)",    description: 'Import a Kawai K1 SysEx bank dump (.syx).' },
  { id: 'arturia',    label: 'Arturia Analog Lab',        description: 'Import Analog Lab playlists from an Arturia db.db3 database — every playlist becomes its own bank.' },
]
