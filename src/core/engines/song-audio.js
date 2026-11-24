/**
 * song-audio.js — the song's audio lanes (lib/songs.ts AUDIO_SONG_LANES): Tracks (a backing track of the Tracks
 * library) and Samples (a sound file kept in IndexedDB, One-shot or Loop). Headless, one per app: the song player
 * (core/engines/rig.js) starts a lane's slot on a bar line and stops it on another. Web Audio, on the audio clock:
 * a start at a bar line already gone (the Play's first bar, a file still loading) starts late, at the point it
 * would be at — in time with the MIDI lanes. A stop: a short fade (50 ms) to the bar line.
 *
 * Levels: the Audio Mixer's Tracks channel (Tracks) and Sampler channel (Samples), with its Master — the events the
 * mixer sends ('tracks-player-volume', 'sampler-master-volume'). Mute per lane (the Session Browser's M).
 */
import { reactive } from 'vue'
import { getContext } from 'tone'
import { perfMsToAudioTime } from '@/lib/audio-clock'
import { collection, doc, getDoc, db } from '@/lib/idb'
import { useAuthStore } from '@/stores/useAuthStore'
import { useAudioMixerStore } from '@/stores/useAudioMixerStore'
import { loadSongSample } from '@/lib/song-samples'
import { onStopAll } from '@/lib/stop-hooks'

const FADE_S = 0.05
let engine = null

export function useSongAudio() {
  if (engine) return engine
  /** per lane: the slot sounding (or about to) and its ref id, muted */
  const state = reactive({ track: { slot: null, id: null, muted: false }, sample: { slot: null, id: null, muted: false } })
  const buffers = new Map() // `${lane}:${id}` → Promise<AudioBuffer | null>
  const voices = { track: null, sample: null } // { src, gain }
  let lanes = null
  const level = { track: 1, sample: 1 }

  const ctx = () => getContext().rawContext
  function laneGain(lane) {
    if (!lanes) {
      const c = ctx()
      lanes = { track: c.createGain(), sample: c.createGain() }
      lanes.track.connect(c.destination); lanes.sample.connect(c.destination)
      try {
        const m = useAudioMixerStore()
        level.track = Math.min(1, (m.tracksVol ?? 1) * (m.masterVol ?? 1))
        level.sample = Math.min(1, (m.samplerVol ?? 1) * (m.masterVol ?? 1))
      } catch {}
      applyLevel('track'); applyLevel('sample')
    }
    return lanes[lane]
  }
  function applyLevel(lane) {
    if (!lanes) return
    lanes[lane].gain.setTargetAtTime(state[lane].muted ? 0 : level[lane], ctx().currentTime, 0.015)
  }
  const onTracksVol = e => { level.track = Number(e.detail) || 0; applyLevel('track') }
  const onSamplerVol = e => { level.sample = Number(e.detail) || 0; applyLevel('sample') }
  window.addEventListener('tracks-player-volume', onTracksVol)
  window.addEventListener('sampler-master-volume', onSamplerVol)

  async function decode(bytes) {
    try { return await ctx().decodeAudioData(bytes.slice(0)) } catch (e) { console.warn('[song-audio] decode failed', e); return null }
  }
  async function fetchTrack(id) {
    const uid = useAuthStore().user?.uid
    if (!uid) return null
    const snap = await getDoc(doc(collection(db, 'users', uid, 'backing_tracks'), id))
    const url = snap.exists?.() ? snap.data()?.url : null
    if (!url) return null
    const res = await fetch(url)
    return decode(await res.arrayBuffer())
  }
  async function fetchSample(id) {
    const bytes = await loadSongSample(id)
    return bytes ? decode(bytes) : null
  }
  /** The decoded file of a slot (cached). */
  function bufferOf(lane, ref) {
    const k = `${lane}:${ref.id}`
    if (!buffers.has(k)) buffers.set(k, (lane === 'track' ? fetchTrack(ref.id) : fetchSample(ref.id)).catch(e => { console.warn('[song-audio] load failed', e); return null }))
    return buffers.get(k)
  }
  /** Loads a slot ahead (a song opened, a section about to play). */
  function preload(lane, ref) { if (ref) bufferOf(lane, ref) }

  function endVoice(lane, when) {
    const v = voices[lane]
    if (!v) return
    voices[lane] = null
    const t = Math.max(ctx().currentTime, when)
    try {
      v.gain.gain.cancelScheduledValues(0)
      v.gain.gain.setValueAtTime(1, Math.max(ctx().currentTime, t - FADE_S))
      v.gain.gain.linearRampToValueAtTime(0, t)
      v.src.stop(t + 0.01)
    } catch {}
  }

  /** `ref` on `lane` from the bar line at `atPerf` (performance.now() ms; past: late, at its point) — `null`: stop there.
   *  rate: its speed (a Track's varispeed: the song's tempo ÷ its BPM). */
  async function play(lane, slot, ref, atPerf, rate = 1) {
    const when = perfMsToAudioTime(atPerf)
    endVoice(lane, when)
    if (!ref) { state[lane].slot = null; state[lane].id = null; return }
    state[lane].slot = slot; state[lane].id = ref.id
    const buf = await bufferOf(lane, ref)
    if (!buf || state[lane].id !== ref.id || state[lane].slot !== slot) return // gone meanwhile
    const c = ctx()
    const src = c.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = rate
    const loop = lane === 'sample' && ref.mode === 'loop'
    src.loop = loop
    const g = c.createGain()
    src.connect(g); g.connect(laneGain(lane))
    let start = perfMsToAudioTime(atPerf), offset = 0
    if (start < c.currentTime) { offset = (c.currentTime - start) * rate; start = c.currentTime }
    if (loop) offset %= buf.duration
    else if (offset >= buf.duration) return // already over
    src.start(start, offset)
    voices[lane] = { src, gain: g }
    src.onended = () => { if (voices[lane]?.src === src) { voices[lane] = null; state[lane].slot = null; state[lane].id = null } }
  }
  /** The lane's speed from `atPerf` (a tempo change on a bar line, its Track going on). */
  function setRate(lane, rate, atPerf = performance.now()) {
    const v = voices[lane]
    if (!v) return
    try { v.src.playbackRate.setValueAtTime(rate, Math.max(ctx().currentTime, perfMsToAudioTime(atPerf))) } catch {}
  }
  /** Stop `lane` at `atPerf` (the bar line), or now. */
  function stop(lane, atPerf = performance.now()) {
    endVoice(lane, perfMsToAudioTime(atPerf))
    state[lane].slot = null; state[lane].id = null
  }
  function stopAll() { stop('track'); stop('sample') }
  function setMuted(lane, on) { state[lane].muted = !!on; laneGain(lane); applyLevel(lane) }
  function toggleMute(lane) { setMuted(lane, !state[lane].muted) }

  const offStop = onStopAll(() => stopAll())
  engine = {
    state, play, setRate, stop, stopAll, preload, setMuted, toggleMute,
    _dispose() { offStop(); window.removeEventListener('tracks-player-volume', onTracksVol); window.removeEventListener('sampler-master-volume', onSamplerVol) },
  }
  return engine
}

export function _resetSongAudio() { engine?._dispose(); engine = null }
