/**
 * useLiveMapStore — SY.CORE Map (P12 of the Ableton Live plan): the SY.CORE Map device in Live drives
 * the instrument of a track by table; here, what it reports (track, instrument, the 16 slots and their
 * values, the track list) and the encoders: a MIDI-learned `map_slot_<n>` (useMidiCCListener →
 * 'live-map-slot' event) moves slot n through SY.CORE Link, with pickup for absolute knobs.
 * Works whenever the bridge is connected (not only with the Rig Controller open).
 */
import { defineStore } from 'pinia'
import { ref, reactive, watch, computed } from 'vue'
import { userKey } from '@/lib/userKey'
import { linkClient } from '@/stores/useLinkStore'
import type { LinkMapInfo } from '@/lib/link-client'
import { MAP_SLOTS, pickupSlot, pickupMove, pickupFeedback, stepTrack, knobTrack, type PickupSlot, type MapButton } from '@/lib/live-map'

const LS_PICKUP = 'S1_LIVE_MAP_PICKUP'
const LS_VIEW = 'SYCORE_LIVE_MAP_VIEW'
const LS_SEQ = 'SYCORE_LIVE_MAP_SEQ_PARAMS'
const LS_SLIDERS = 'SYCORE_LIVE_MAP_SLIDERS'
const LS_SLOT_NAMES = 'SYCORE_LIVE_MAP_SLOT_NAMES'
export const MAP_VIEWS = ['tiles', 'sliders', 'knobs'] as const
export type MapView = typeof MAP_VIEWS[number]

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
  /** How the panel draws the slots: tiles, vertical sliders (touch) or Live-style encoders; per user
   *  (the old sliders key, '1', still reads as sliders). */
  const view = ref<MapView>((() => {
    try {
      const v = localStorage.getItem(userKey(LS_VIEW)) as MapView
      if (MAP_VIEWS.includes(v)) return v
      return localStorage.getItem(userKey(LS_SLIDERS)) === '1' ? 'sliders' : 'tiles'
    } catch { return 'tiles' }
  })())
  watch(view, v => { try { localStorage.setItem(userKey(LS_VIEW), v) } catch {} })
  /** The Sequencer's P1 / P2 → Map slots, a route per track in Live: `{ track, p1, p2 }` (slot 0–15, null =
   *  off) — Live can't MIDI-map the CCs of a track's own MIDI, and each instrument has its own slots. With
   *  bridge 1.8 (`mapTrack`) every route is sent, wherever the Map is; with an older bridge only the route
   *  of the track the Map drives. Per user (the earlier `{ p1, p2, tracks }` / `{ p1, p2, track }` read as
   *  one route per track). */
  type SeqRoute = { track: number; p1: number | null; p2: number | null }
  const slotOf = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < MAP_SLOTS ? v as number : null)
  const seqRoutes = reactive<SeqRoute[]>((() => {
    try {
      const o = JSON.parse(localStorage.getItem(userKey(LS_SEQ)) || '{}')
      if (Array.isArray(o.routes)) return o.routes.filter((r: any) => Number.isInteger(r?.track)).map((r: any) => ({ track: r.track, p1: slotOf(r.p1), p2: slotOf(r.p2) }))
      const tracks: number[] = Array.isArray(o.tracks) ? o.tracks.filter(Number.isInteger) : Number.isInteger(o.track) ? [o.track] : []
      return tracks.map(track => ({ track, p1: slotOf(o.p1), p2: slotOf(o.p2) }))
    } catch { return [] }
  })())
  watch(seqRoutes, v => { try { localStorage.setItem(userKey(LS_SEQ), JSON.stringify({ routes: v })) } catch {} }, { deep: true })
  /** A new route: the track the Map drives, else the first instrument track without one (false: none left). */
  function addSeqRoute() {
    const used = new Set(seqRoutes.map(r => r.track))
    const focus = info.value?.track?.index
    const t = focus !== undefined && !used.has(focus) ? focus : instrumentTracks.value.find(x => !used.has(x.index))?.index
    if (t === undefined) return false
    seqRoutes.push({ track: t, p1: null, p2: null })
    requestSlotNames([t])
    return true
  }
  function removeSeqRoute(i: number) { seqRoutes.splice(i, 1) }
  /** The slot names of each track's instrument (the modal's selects): from the Map's target, or asked
   *  for a track with requestSlotNames (bridge 1.8); kept per user, so they show before Live answers. */
  const slotNames = reactive<Record<number, (string | null)[]>>((() => {
    try { const o = JSON.parse(localStorage.getItem(userKey(LS_SLOT_NAMES)) || '{}'); return o && typeof o === 'object' ? o : {} } catch { return {} }
  })())
  watch(slotNames, v => { try { localStorage.setItem(userKey(LS_SLOT_NAMES), JSON.stringify(v)) } catch {} }, { deep: true })
  /** Ask Live for the slot names of these tracks' instruments (bridge 1.8; older: nothing comes back). */
  function requestSlotNames(trackIndexes: number[]) {
    if (!mapTrack.value) return
    for (const t of new Set(trackIndexes)) linkClient.requestMapTrackSlots(t)
  }
  /** The bridge moves a slot on any track (1.8); read from its hello. */
  const mapTrack = ref(!!linkClient.device?.mapTrack)
  const liveRoutes = () => seqRoutes.filter(r => r.p1 !== null || r.p2 !== null)
  /** Why P1 / P2 don't reach the Map now ('' = they do; 'off' = no route with a slot). */
  const seqParamsBlock = computed<'' | 'off' | 'link' | 'elsewhere' | 'slot'>(() => {
    const rs = liveRoutes()
    if (!rs.length) return 'off'
    if (!info.value) return 'link'
    const here = rs.find(r => r.track === info.value!.track?.index)
    if (!mapTrack.value && !here) return 'elsewhere'
    if (here && [here.p1, here.p2].some(s => s !== null && !info.value!.slots[s])) return 'slot'
    return ''
  })
  /** The same, in words for the Sequencer (its EDIT row and its Play View); '' when sent or off. */
  const seqParamsHint = computed(() => ({
    off: '',
    link: 'P1 / P2 → Map: SY.CORE Link or the SY.CORE Map device not there — nothing sent',
    elsewhere: `P1 / P2 → Map: the Map drives ${info.value?.track?.name ?? 'another track'} now, no route for it — nothing sent (FOLLOW off on a routed track, or SY.CORE Link 1.8 for any track)`,
    slot: 'P1 / P2 → Map: an empty slot on the instrument in focus — nothing sent there',
    '': '',
  })[seqParamsBlock.value])
  const lastSeq = new Map<string, number>()
  /** A Sequencer step's P1 / P2 (CC value 0–127) to each route's slot; the same value again isn't resent.
   *  On the track in focus, the slot's value and pickup follow (an encoder picks it up). */
  function seqParam(which: 1 | 2, cc: number) {
    if (!info.value) return
    if (!mapTrack.value && linkClient.device?.mapTrack) mapTrack.value = true   // a hello this store missed
    const v = Math.max(0, Math.min(127, cc)) / 127
    const focus = info.value.track?.index
    for (const r of seqRoutes) {
      const slot = which === 1 ? r.p1 : r.p2
      if (slot === null) continue
      const k = `${r.track}:${slot}`
      if (r.track === focus) {
        if (!info.value.slots[slot]) continue
        if (values[slot] !== null && Math.abs((values[slot] as number) - v) < 0.5 / 127) continue
        values[slot] = v
        Object.assign(pick[slot], pickupSlot())
        lastSeq.set(k, v)
        linkClient.sendMap(slot, v)
      } else if (mapTrack.value) {
        if (lastSeq.get(k) === v) continue
        lastSeq.set(k, v)
        linkClient.sendMapTrack(r.track, slot, v)
      }
    }
  }
  function nextView() { view.value = MAP_VIEWS[(MAP_VIEWS.indexOf(view.value) + 1) % MAP_VIEWS.length] }

  function resetPickup() { for (let i = 0; i < MAP_SLOTS; i++) Object.assign(pick[i], pickupSlot()) }

  linkClient.on(e => {
    if (e.type === 'map-info') {
      info.value = e.info
      if (e.info.track) slotNames[e.info.track.index] = e.info.slots.map(sl => sl?.name ?? null)
      e.info.slots.forEach((s, i) => { values[i] = s ? s.value : null })
      resetPickup()                       // another instrument: every knob picks its parameter up again
    } else if (e.type === 'map-value') {
      if (e.slot < 0 || e.slot >= MAP_SLOTS) return
      values[e.slot] = e.value
      pickupFeedback(pick[e.slot], e.value, performance.now())
    } else if (e.type === 'hello') {
      mapTrack.value = !!linkClient.device?.mapTrack
      lastSeq.clear()
      // (re)connected: the device takes SY.CORE's target (after a reload SY.CORE starts on Follow, while the
      // bridge may still hold a track picked before)
      linkClient.sendMapTarget(target.value)
    } else if (e.type === 'map-track-slots') {
      slotNames[e.track] = e.slots
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

  /** A slot moved on the screen (slider / drag, 0–1): straight to the value, no pickup (the
   *  finger is where the value goes); an absolute knob picks the new value up again. */
  function touch(slot: number, value: number) {
    if (slot < 0 || slot >= MAP_SLOTS || !info.value?.slots[slot]) return
    const v = Math.max(0, Math.min(1, value))
    values[slot] = v
    Object.assign(pick[slot], pickupSlot())
    linkClient.sendMap(slot, v)
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
  /** The tracks with an instrument (the only ones worth pointing the encoders at). */
  const instrumentTracks = computed(() => tracks.value.filter(t => t.instrument))
  const instrumentIndexes = () => instrumentTracks.value.map(t => t.index)
  /** The previous / next track with an instrument: the target leaves Follow. */
  function trackStep(step: 1 | -1) {
    const i = stepTrack(instrumentIndexes(), currentTrack(), step)
    if (i >= 0 && i !== currentTrack()) setTarget(i)
  }
  /** The track with an instrument at a knob's position (sent only when it lands on another one). */
  function trackKnob(v: number) {
    const i = knobTrack(instrumentIndexes(), v)
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

  return { info, values, tracks, instrumentTracks, target, pickup, pick, view, nextView, seqRoutes, addSeqRoute, removeSeqRoute, slotNames, requestSlotNames, mapTrack, seqParamsBlock, seqParamsHint, seqParam, move, touch, setTarget, variation, randomize, trackStep, toggleFollow }
})
