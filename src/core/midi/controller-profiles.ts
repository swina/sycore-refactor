/**
 * controller-profiles.ts — who a controller belongs to right now, at runtime.
 *
 * Since control sets (phase 3a of docs/plans/projects-and-control.md) a controller's
 * role (Perform / Live) is in the current project's active set (core/projects.ts).
 * A Live controller's input is dropped in midi-service and the LED service sends it
 * nothing; the Rig Controller turns its Rig off on it. The learned key switches
 * between the project's two key sets; Follow the clock goes to the second while an
 * external clock is followed, back to the first when it stops.
 *
 * Installed once by the app (installControllerProfiles, from SynthApp), so the key
 * works with every panel closed.
 */
import { ref, computed, watch, type Ref } from 'vue'
import { midiService } from '@/core/midi/midi-service'
import { profileIngress, learnProfileKey, loadProfile, saveProfile, type ControllerMode, type ProfileSettings } from '@/lib/controller-profile'
import { roleOf, liveDevicesOf } from '@/lib/projects'
import { currentSet, currentProject, switchSet, toggleKeySet } from '@/core/projects'

export const profileSettings: Ref<ProfileSettings> = ref(loadProfile())
/** True while the next button press becomes the key. */
export const learningProfileKey = ref(false)

/** The port names that are Live's in the active set. */
export const liveOwnedNames = computed(() => liveDevicesOf(currentSet.value))
/** 'live' while the active set gives some controller to Live (the footer chip's colour). */
export const controllerMode = computed<ControllerMode>(() => (liveOwnedNames.value.length ? 'live' : 'performance'))

export function updateProfile(patch: Partial<ProfileSettings>): void {
  profileSettings.value = { ...profileSettings.value, ...patch }
}

/** A port that belongs to Live right now (no input taken, no LEDs sent). */
export function isLiveOwned(name: string | undefined | null): boolean {
  return roleOf(currentSet.value, name) === 'live'
}

watch(profileSettings, saveProfile, { deep: true })

let installed = false

/**
 * Installs the gate in midi-service. `clockExternal`: true while SY.CORE follows
 * an external clock — with Follow the clock on, the key's second set follows it.
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
    switch (profileIngress(profileSettings.value, isLiveOwned, name, d)) {
      case 'toggle': toggleKeySet(); return 'consumed'
      case 'swallow': return 'consumed'
      case 'drop': return 'drop'
      default: return 'pass'
    }
  })
  if (clockExternal) {
    watch(clockExternal, ext => {
      const ks = currentProject.value?.control.keySets
      if (profileSettings.value.autoLive && ks) switchSet(ext ? ks[1] : ks[0])
    })
  }
}
