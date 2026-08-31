import type { FxChain, ModMatrixSlot } from '@/core/audio/types'
import type { FilterType } from '@/core/audio/filterMath'

export interface InputMediaDeviceInfo {
  deviceId: string
  groupId: string
  kind: string
  label: string
}

export function initLiveInputEngine(): void
export function listInputDevices(): Promise<InputMediaDeviceInfo[]>
export function openInput(deviceIdOrLabel?: string): Promise<void>
export function closeInput(): void
export function isInputOpen(): boolean
export function getInputDeviceLabel(): string | undefined
export function getInputLevel(): number
export function setLevel(level: number): void
export function setPan(pan: number): void
export function setFilter(freq: number): void
export function setFilterType(type: FilterType): void
export function setFilterResonance(resonance: number): void
export function setFx(fxChain: FxChain): void
export function setModMatrix(slots: ModMatrixSlot[]): void
export function dispose(): void
