/**
 * useLiveMapStore — SY.CORE Map (P12 of the Ableton Live plan): the SY.CORE Map device in Live drives
 * the instrument of a track by table; here, what it reports (track, instrument, the 16 slots and their
 * values, the track list) and the encoders: a MIDI-learned `map_slot_<n>` (useMidiCCListener →
 * 'live-map-slot' event) moves slot n through SY.CORE Link, with pickup for absolute knobs.
 * Works whenever the bridge is connected (not only with the Rig Controller open).
 */
import { defineStore } from 'pinia'
import { ref, reactive, watch } from 'vue'
import { userKey } from '@/lib/userKey'
import { linkClient } from '@/stores/useLinkStore'
import type { LinkMapInfo } from '@/lib/link-client'
import { MAP_SLOTS, pickupSlot, pickupMove, pickupFeedback, stepTrack, knobTrack, type PickupSlot, type MapButton } from '@/lib/live-map'

const LS_PICKUP = 'S1_LIVE_MAP_PICKUP'

export const useLiveMapStore = defineStore('liveMap', () => {
  /** What the Map device drives now (null: no device heard from yet) */
  const info = ref<LinkMapInfo | null>(null)
  /** Each slot's parameter value, 0–1 (from Live; null = unknown) */
  const values = reactive<(number | null)[]>(Array(MAP_SLOTS).fill(null))
  const tracks = ref<{ index: number; name: string; instrument?: string }[]>([])
  /** Follow Live's selected track, or a track index picked here */
  const target = ref<'follow' | number>('follow')
  /** Pickup (soft takeover) for absolute knobs; off = the parameter jumps to the knob */
  const pickup = ref(localStorage.getItem(userKey(LS_PICKUP)) !== 'false')
  watch(pickup, v => localStorage.setItem(userKey(LS_PICKUP), String(v)))
  const pick = reactive<PickupSlot[]>(Array.from({ length: MAP_SLOTS }, pickupSlot))

  function resetPickup() { for (let i = 0; i < MAP_SLOTS; i++) Object.assign(pick[i], pickupSlot()) }

  linkClient.on(e => {
    if (e.type === 'map-info') {
      info.value = e.info
      e.info.slots.forEach((s, i) => { values[i] = s ? s.value : null })
      resetPickup()                       // another instrument: every knob picks its parameter up again
    } else if (e.type === 'map-value') {
      if (e.slot < 0 || e.slot >= MAP_SLOTS) return
      values[e.slot] = e.value
      pickupFeedback(pick[e.slot], e.value, performance.now())
    } else if (e.type === 'map-tracks') {
      tracks.value = e.tracks
    } else if (e.type === 'state' && e.state !== 'connected') {
      info.value = null
    }
  })

  /** An encoder (0–1) on slot 0–15: to the device, after pickup. */
  function move(slot: number, knob: number) {
    if (slot < 0 || slot >= MAP_SLOTS || !info.value?.slots[slot]) return
    const now = performance.now()
    if (pickup.value && !pickupMove(pick[slot], knob, values[slot], now)) return
    if (!pickup.value) Object.assign(pick[slot], { caught: true, knob, sentAt: now })
    values[slot] = knob
    linkClient.sendMap(slot, knob)
  }

  function setTarget(t: 'follow' | number) {
    target.value = t
    linkClient.sendMapTarget(t)
  }

  /** Recall a Macro Variation (index, next, prev) / randomize the Macros of the Rack in focus. */
  function variation(v: number | 'next' | 'prev' | 'store' | 'delete') { linkClient.sendMapVariation(v) }
  function randomize() { linkClient.sendMapRandomize() }
  /** The track in focus now (picked here, or the one the device follows). */
  const currentTrack = () => (typeof target.value === 'number' ? target.value : info.value?.track?.index ?? -1)
  /** The previous / next track: the target leaves Follow. */
  function trackStep(step: 1 | -1) {
    const i = stepTrack(currentTrack(), step, tracks.value.length)
    if (i >= 0) setTarget(i)
  }
  /** The track by a knob's position (sent only when it lands on another one). */
  function trackKnob(v: number) {
    const i = knobTrack(v, tracks.value.length)
    if (i >= 0 && i !== currentTrack()) setTarget(i)
  }
  /** Follow Live's selected track on / off (off: stay on the track in focus). */
  function toggleFollow() {
    if (target.value === 'follow') { const i = currentTrack(); if (i >= 0) setTarget(i) }
    else setTarget('follow')
  }
  window.addEventListener('live-map-button', (e: Event) => {
    const b = (e as CustomEvent<MapButton>).detail
    if (b?.kind === 'variation') variation(b.v)
    else if (b?.kind === 'randomize') randomize()
    else if (b?.kind === 'track') trackStep(b.step)
    else if (b?.kind === 'follow') toggleFollow()
  })
  window.addEventListener('live-map-track', (e: Event) => {
    const d = (e as CustomEvent<{ value: number }>).detail
    if (d) trackKnob(d.value)
  })

  window.addEventListener('live-map-slot', (e: Event) => {
    const d = (e as CustomEvent<{ slot: number; value: number }>).detail
    if (d) move(d.slot, d.value)
  })

  return { info, values, tracks, target, pickup, pick, move, setTarget, variation, randomize, trackStep, toggleFollow }
})
