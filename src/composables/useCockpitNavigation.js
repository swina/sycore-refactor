import { ref, computed } from 'vue'

/**
 * Focus-cursor state machine for the Instrument Cockpit — knows nothing
 * about MIDI or controllers/apps/instruments specifically, just an ordered
 * list of zones each exposing an ordered list of { id, activate() } items.
 * Consumed identically by the cockpit's local MIDI listener and its
 * on-screen nav cluster, so there's exactly one source of truth for the
 * cursor regardless of trigger source.
 */
export function useCockpitNavigation(zones) {
  const currentZoneIdx = ref(0)
  const currentItemIdx = ref(0)
  const hasNavigated = ref(false) // don't paint a focus ring until this system has actually been used once

  const currentZone = computed(() => zones[currentZoneIdx.value])

  function moveZone(dir) {
    hasNavigated.value = true
    currentZoneIdx.value = (currentZoneIdx.value + dir + zones.length) % zones.length
    currentItemIdx.value = 0
  }

  function moveItem(dir) {
    hasNavigated.value = true
    const items = currentZone.value?.items.value ?? []
    if (items.length === 0) return
    currentItemIdx.value = (currentItemIdx.value + dir + items.length) % items.length
  }

  function selectCurrent() {
    currentZone.value?.items.value[currentItemIdx.value]?.activate()
  }

  function isFocused(zoneId, idx) {
    return hasNavigated.value && currentZone.value?.id === zoneId && currentItemIdx.value === idx
  }

  return { moveZone, moveItem, selectCurrent, isFocused }
}
