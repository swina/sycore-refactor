/**
 * controller-profiles.ts — the Live / Performance mode at runtime (lib/controller-profile.ts).
 *
 * Installed once by the app (installControllerProfiles, from SynthApp), so the key
 * works with every panel closed. Live: the Live controllers' input is dropped in
 * midi-service and the LED service (led-feedback-service.ts) sends them nothing.
 * The Rig Controller turns its Rig off on a Live controller when Live mode starts.
 */
import { ref, watch, type Ref } from 'vue'
import { midiService } from '@/core/midi/midi-service'
import {
  profileIngress, learnProfileKey, isLiveDevice, setLiveDevice,
  loadProfile, saveProfile, loadMode, saveMode,
  type ControllerMode, type ProfileSettings,
} from '@/lib/controller-profile'

export const controllerMode: Ref<ControllerMode> = ref(loadMode())
export const profileSettings: Ref<ProfileSettings> = ref(loadProfile())
/** True while the next button press becomes the key. */
export const learningProfileKey = ref(false)

export function setControllerMode(m: ControllerMode): void {
  controllerMode.value = m
}
export function toggleControllerMode(): void {
  setControllerMode(controllerMode.value === 'live' ? 'performance' : 'live')
}
export function updateProfile(patch: Partial<ProfileSettings>): void {
  profileSettings.value = { ...profileSettings.value, ...patch }
}
export function toggleLiveDevice(name: string, on: boolean, connected: readonly string[]): void {
  profileSettings.value = setLiveDevice(profileSettings.value, name, on, connected)
}
/** A port that belongs to Live right now (no input taken, no LEDs sent). */
export function isLiveOwned(name: string | undefined | null): boolean {
  return controllerMode.value === 'live' && isLiveDevice(profileSettings.value, name)
}

watch(controllerMode, saveMode)
watch(profileSettings, saveProfile, { deep: true })

let installed = false

/**
 * Installs the gate in midi-service. `clockExternal`: true while SY.CORE follows
 * an external clock — with autoLive on, Live mode follows it.
 */
export function installControllerProfiles(clockExternal?: () => boolean): void {
  if (installed) return
  installed = true
  midiService.setProfileGate(event => {
    const d = event.data
    if (!d || d.length < 2 || d[0] >= 0xF0) return 'pass'
    const name = (event.target as MIDIInput | null)?.name
    if (learningProfileKey.value) {
      const b = learnProfileKey(name, d)
      if (b) {
        updateProfile({ key: b })
        learningProfileKey.value = false
        return 'consumed'
      }
    }
    switch (profileIngress(profileSettings.value, controllerMode.value, name, d)) {
      case 'toggle': toggleControllerMode(); return 'consumed'
      case 'swallow': return 'consumed'
      case 'drop': return 'drop'
      default: return 'pass'
    }
  })
  if (clockExternal) {
    watch(clockExternal, ext => {
      if (profileSettings.value.autoLive) setControllerMode(ext ? 'live' : 'performance')
    })
  }
}
