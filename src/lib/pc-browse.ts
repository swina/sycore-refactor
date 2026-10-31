// What the Program Change panel is browsing, for the Virtual Device Panel's display: the device
// and channel selected there, the bank open for it and the position of that channel's preset in
// it (index 0-based, -1 when it isn't in it), the bank's categories in list order, and the preset's
// position among the presets of its own category (catIndex 0-based, -1 if none / catTotal). Written by
// MidiDeviceProgramChangePanel.vue only.
import { shallowRef } from 'vue'

export interface PcBrowseState { device: string; channel: number; bank: string; index: number; total: number; categories?: string[]; catIndex?: number; catTotal?: number }

export const pcBrowse = shallowRef<PcBrowseState>({ device: '', channel: 0, bank: '', index: -1, total: 0 })
