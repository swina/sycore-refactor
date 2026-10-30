// What the Program Change panel is browsing, for the Virtual Device Panel's display: the device
// and channel selected there and the position of that channel's preset in the open bank
// (index 0-based, -1 when it isn't in it). Written by MidiDeviceProgramChangePanel.vue only.
import { shallowRef } from 'vue'

export interface PcBrowseState { device: string; channel: number; index: number; total: number }

export const pcBrowse = shallowRef<PcBrowseState>({ device: '', channel: 0, index: -1, total: 0 })
