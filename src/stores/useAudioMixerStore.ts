import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { looperEngine } from '@/lib/looper-engine'
import { midiService } from '@/core/midi/midi-service'
import { useAuthStore } from './useAuthStore'
import { userKey } from '@/lib/userKey'

export type MixerChannelId =
  | 'backing' | 'tracks' | 'looper' | 'lm'
  | 'drums' | 'drumsLevel' | 'sampler' | 'liveperf' | 'bassline'

// A numbered channel slot (1-16, consolidated view) is user-assigned to one
// of: a catalog app-source (id = MixerChannelId), a registered MIDI
// instrument (id = device name), or a virtual-instrument channel (id =
// "name:ch", matching _virtKey below). null = unassigned slot.
export type ChannelSlotAssignment = { type: 'catalog' | 'instrument' | 'virtual'; id: string } | null

const NUM_CHANNEL_SLOTS = 16

function loadFloat(key: string, def: number): number {
  const v = localStorage.getItem(userKey(key))
  return v !== null ? parseFloat(v) : def
}

function loadChannelSlots(): ChannelSlotAssignment[] {
  const slots: ChannelSlotAssignment[] = Array(NUM_CHANNEL_SLOTS).fill(null)
  try {
    const raw = localStorage.getItem(userKey('S1_MIX_CHANNEL_SLOTS'))
    if (raw) {
      const parsed: ChannelSlotAssignment[] = JSON.parse(raw)
      for (let i = 0; i < NUM_CHANNEL_SLOTS && i < parsed.length; i++) slots[i] = parsed[i] ?? null
    }
  } catch {}
  return slots
}

export const useAudioMixerStore = defineStore('audioMixer', () => {
  const authStore = useAuthStore()
  const uid = computed(() => authStore.user?.uid)

  const channelSlots = ref<ChannelSlotAssignment[]>(loadChannelSlots())

  watch(channelSlots, v => localStorage.setItem(userKey('S1_MIX_CHANNEL_SLOTS'), JSON.stringify(v)), { deep: true })

  function assignChannelSlot(slotIdx: number, assignment: ChannelSlotAssignment) {
    const next = [...channelSlots.value]
    next[slotIdx] = assignment
    channelSlots.value = next
  }

  function clearChannelSlot(slotIdx: number) { assignChannelSlot(slotIdx, null) }

  // ── Solo ─────────────────────────────────────────────────────────────────
  // A generic, string-keyed solo set shared by every kind of mixer strip
  // (CATALOG channel ids, `inst:<name>` for MIDI instruments, and
  // `virt:<name>:<channel>` for virtual-instrument per-channel strips) so one
  // mechanism covers all of them. Not persisted — solo is a live-mixing
  // gesture, not a setting you'd want silently restored on reload.
  const soloedChannels = ref<Set<string>>(new Set())

  function isSoloed(id: string) { return soloedChannels.value.has(id) }

  function isEffectivelyMuted(id: string, ownMuted: boolean): boolean {
    if (soloedChannels.value.size === 0) return ownMuted
    return !soloedChannels.value.has(id)
  }

  function toggleSolo(id: string) {
    const next = new Set(soloedChannels.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    soloedChannels.value = next
    _redispatchAll()
  }

  const backingVol    = ref(loadFloat('S1_MIX_BACKING',     0.8))
  const tracksVol     = ref(loadFloat('S1_MIX_TRACKS',      0.8))
  const looperVol     = ref(loadFloat('S1_MIX_LOOPER',      0.9))
  const lmVol         = ref(loadFloat('S1_MIX_LM',          0.85))
  const drumsVol      = ref(loadFloat('S1_MIX_DRUMS',       0.85))
  const drumsLevelVol = ref(loadFloat('S1_MIX_DRUMS_LEVEL', 0.85))
  const masterVol     = ref(loadFloat('S1_MIX_MASTER',      1.0))

  const backingMuted    = ref(false)
  const tracksMuted     = ref(false)
  const looperMuted     = ref(false)
  const lmMuted         = ref(false)
  const drumsMuted      = ref(false)
  const drumsLevelMuted = ref(false)
  const samplerVol      = ref(loadFloat('S1_MIX_SAMPLER',   0.85))
  const samplerMuted    = ref(false)
  const liveperfVol     = ref(loadFloat('S1_MIX_LIVEPERF',  0.85))
  const liveperfMuted   = ref(false)
  const basslineVol     = ref(loadFloat('S1_MIX_BASSLINE',   0.85))
  const basslineMuted   = ref(false)

  watch(backingVol,    v => localStorage.setItem(userKey('S1_MIX_BACKING'),     String(v)))
  watch(tracksVol,     v => localStorage.setItem(userKey('S1_MIX_TRACKS'),      String(v)))
  watch(looperVol,     v => localStorage.setItem(userKey('S1_MIX_LOOPER'),      String(v)))
  watch(lmVol,         v => localStorage.setItem(userKey('S1_MIX_LM'),          String(v)))
  watch(drumsVol,      v => localStorage.setItem(userKey('S1_MIX_DRUMS'),       String(v)))
  watch(drumsLevelVol, v => localStorage.setItem(userKey('S1_MIX_DRUMS_LEVEL'), String(v)))
  watch(samplerVol,    v => localStorage.setItem(userKey('S1_MIX_SAMPLER'),     String(v)))
  watch(liveperfVol,   v => localStorage.setItem(userKey('S1_MIX_LIVEPERF'),   String(v)))
  watch(basslineVol,   v => localStorage.setItem(userKey('S1_MIX_BASSLINE'),   String(v)))
  watch(masterVol,     v => localStorage.setItem(userKey('S1_MIX_MASTER'),      String(v)))

  function effective(ch: number, id: MixerChannelId, ownMuted: boolean): number {
    const muted = isEffectivelyMuted(id, ownMuted)
    return muted ? 0 : Math.min(1, ch * masterVol.value)
  }

  const effectiveDrumsLevel = computed(() => effective(drumsLevelVol.value, 'drumsLevel', drumsLevelMuted.value))

  function _dispatchBacking() {
    window.dispatchEvent(new CustomEvent('playlist-volume', { detail: effective(backingVol.value, 'backing', backingMuted.value) }))
  }
  function _dispatchTracks() {
    window.dispatchEvent(new CustomEvent('tracks-player-volume', { detail: effective(tracksVol.value, 'tracks', tracksMuted.value) }))
  }
  function _dispatchLooper() {
    looperEngine.masterVolume = effective(looperVol.value, 'looper', looperMuted.value)
  }
  function _dispatchLM() {
    window.dispatchEvent(new CustomEvent('lm-master-volume', { detail: effective(lmVol.value, 'lm', lmMuted.value) }))
  }
  function _dispatchDrums() {
    window.dispatchEvent(new CustomEvent('dm-master-volume', { detail: effective(drumsVol.value, 'drums', drumsMuted.value) }))
  }
  function _dispatchSampler() {
    window.dispatchEvent(new CustomEvent('sampler-master-volume', { detail: effective(samplerVol.value, 'sampler', samplerMuted.value) }))
  }
  function _dispatchBassline() {
    window.dispatchEvent(new CustomEvent('bassline-master-volume', { detail: effective(basslineVol.value, 'bassline', basslineMuted.value) }))
  }
  function _dispatchLiveperf() {
    window.dispatchEvent(new CustomEvent('liveperf-master-volume', { detail: effective(liveperfVol.value, 'liveperf', liveperfMuted.value) }))
  }

  function setBackingVol(v: number)    { backingVol.value = v; _dispatchBacking() }
  function setTracksVol(v: number)     { tracksVol.value  = v; _dispatchTracks() }
  function setLooperVol(v: number)     { looperVol.value  = v; _dispatchLooper() }
  function setLMVol(v: number)         { lmVol.value      = v; _dispatchLM() }
  function setDrumsVol(v: number)      { drumsVol.value   = v; _dispatchDrums() }
  function setDrumsLevelVol(v: number) { drumsLevelVol.value = v }
  function setSamplerVol(v: number)    { samplerVol.value    = v; _dispatchSampler() }
  function setLiveperfVol(v: number)   { liveperfVol.value   = v; _dispatchLiveperf() }
  function setBasslineVol(v: number)   { basslineVol.value   = v; _dispatchBassline() }
  function setMasterVol(v: number) {
    masterVol.value = v
    _dispatchBacking(); _dispatchTracks(); _dispatchLooper(); _dispatchLM(); _dispatchDrums()
    _dispatchSampler(); _dispatchLiveperf()
  }

  function toggleBackingMute()    { backingMuted.value    = !backingMuted.value;    _dispatchBacking() }
  function toggleTracksMute()     { tracksMuted.value     = !tracksMuted.value;     _dispatchTracks() }
  function toggleLooperMute()     { looperMuted.value     = !looperMuted.value;     _dispatchLooper() }
  function toggleLMMute()         { lmMuted.value         = !lmMuted.value;         _dispatchLM() }
  function toggleDrumsMute()      { drumsMuted.value      = !drumsMuted.value;      _dispatchDrums() }
  function toggleDrumsLevelMute() { drumsLevelMuted.value = !drumsLevelMuted.value }
  function toggleSamplerMute()   { samplerMuted.value    = !samplerMuted.value;  _dispatchSampler() }
  function toggleLiveperfMute()  { liveperfMuted.value   = !liveperfMuted.value; _dispatchLiveperf() }
  function toggleBasslineMute()  { basslineMuted.value   = !basslineMuted.value; _dispatchBassline() }

  function _loadInstVols(): Record<string, number> {
    try { return JSON.parse(localStorage.getItem(userKey('S1_MIX_INST_VOLS')) || '{}') } catch { return {} }
  }

  const instrumentVols  = ref<Record<string, number>>(_loadInstVols())
  const instrumentMuted = ref<Record<string, boolean>>({})

  function _regOutChannel(name: string): number {
    let outCh = 0
    try {
      const raw = localStorage.getItem(userKey('SYCORE_ADVANCED_MIDI_ROUTING'))
      if (raw) {
        const cfg = JSON.parse(raw)
        const ch  = cfg.registrations?.[name]?.outChannel
        if (typeof ch === 'number' && ch >= 0) outCh = ch
      }
    } catch {}
    return outCh
  }

  function _sendInstCC(name: string) {
    const ownMuted = !!instrumentMuted.value[name]
    const muted = isEffectivelyMuted('inst:' + name, ownMuted)
    const vol   = muted ? 0 : (instrumentVols.value[name] ?? 0.8)
    const cc7   = Math.round(vol * 127)
    midiService.sendRawCC(name, 7, cc7, _regOutChannel(name))
  }

  function getInstrumentVol(name: string): number  { return instrumentVols.value[name] ?? 0.8 }
  function isInstrumentMuted(name: string): boolean { return !!instrumentMuted.value[name] }

  function setInstrumentVol(name: string, v: number) {
    instrumentVols.value = { ...instrumentVols.value, [name]: v }
    localStorage.setItem(userKey('S1_MIX_INST_VOLS'), JSON.stringify(instrumentVols.value))
    _sendInstCC(name)
  }

  function toggleInstrumentMute(name: string) {
    const wasAudible = !isEffectivelyMuted('inst:' + name, !!instrumentMuted.value[name])
    instrumentMuted.value = { ...instrumentMuted.value, [name]: !instrumentMuted.value[name] }
    // Muting is just a volume fader (CC#7) — it doesn't release a note that's
    // still sustaining, or an aux-bus delay/reverb send still ringing on that
    // channel. Silence the channel outright the moment it goes audible→muted.
    if (wasAudible && isEffectivelyMuted('inst:' + name, !!instrumentMuted.value[name])) {
      midiService.resetChannel(name, _regOutChannel(name))
    }
    _sendInstCC(name)
  }

  function toggleInstrumentSolo(name: string) { toggleSolo('inst:' + name) }

  // ── Virtual instruments — per-MIDI-channel volume/mute (CC#7) ──────────────
  // A virtual instrument configured as multi-timbral in MIDI Flow
  // (registration.outChannels, see MidiWizardFlow.vue's "Multi-CH out" grid)
  // gets one independent fader per channel instead of a single fader — each
  // sends Volume (CC#7) on just that channel. A virtual instrument with no
  // outChannels set keeps the single-fader behavior, sending on its
  // registration's plain outChannel, exactly like a MIDI instrument channel.
  function _virtKey(name: string, ch: number) { return `${name}:${ch}` }

  function _loadVirtChanVols(): Record<string, number> {
    try { return JSON.parse(localStorage.getItem(userKey('S1_MIX_VIRT_CHAN_VOLS')) || '{}') } catch { return {} }
  }

  const virtualChannelVols  = ref<Record<string, number>>(_loadVirtChanVols())
  const virtualChannelMuted = ref<Record<string, boolean>>({})

  function getVirtualChannelVol(name: string, ch: number): number {
    return virtualChannelVols.value[_virtKey(name, ch)] ?? 0.8
  }
  function isVirtualChannelMuted(name: string, ch: number): boolean {
    return !!virtualChannelMuted.value[_virtKey(name, ch)]
  }
  function isVirtualChannelSoloed(name: string, ch: number): boolean {
    return isSoloed('virt:' + _virtKey(name, ch))
  }

  function _sendVirtChanCC(name: string, ch: number) {
    const key = _virtKey(name, ch)
    const ownMuted = !!virtualChannelMuted.value[key]
    const muted = isEffectivelyMuted('virt:' + key, ownMuted)
    const vol   = muted ? 0 : (virtualChannelVols.value[key] ?? 0.8)
    const cc7   = Math.round(vol * 127)
    midiService.sendRawCC(name, 7, cc7, ch)
  }

  function setVirtualChannelVol(name: string, ch: number, v: number) {
    const key = _virtKey(name, ch)
    virtualChannelVols.value = { ...virtualChannelVols.value, [key]: v }
    localStorage.setItem(userKey('S1_MIX_VIRT_CHAN_VOLS'), JSON.stringify(virtualChannelVols.value))
    _sendVirtChanCC(name, ch)
  }

  function toggleVirtualChannelMute(name: string, ch: number) {
    const key = _virtKey(name, ch)
    const wasAudible = !isEffectivelyMuted('virt:' + key, !!virtualChannelMuted.value[key])
    virtualChannelMuted.value = { ...virtualChannelMuted.value, [key]: !virtualChannelMuted.value[key] }
    // Same reasoning as toggleInstrumentMute: CC#7 volume alone won't release
    // a held note or stop a delay/reverb tail already ringing on that channel.
    if (wasAudible && isEffectivelyMuted('virt:' + key, !!virtualChannelMuted.value[key])) {
      midiService.resetChannel(name, ch)
    }
    _sendVirtChanCC(name, ch)
  }

  function toggleVirtualChannelSolo(name: string, ch: number) { toggleSolo('virt:' + _virtKey(name, ch)) }

  // Single-fader virtual instruments (no outChannels configured) reuse the
  // plain instrument vol/mute maps above, keyed by name — same as a MIDI
  // instrument channel, just targeting a virtual output instead of a real one.

  // Re-push every channel's current volume/mute state — needed whenever solo
  // membership changes, since soloing one channel silences every other one
  // and each channel's "effective" level is only recomputed when its own
  // dispatch function runs.
  function _redispatchAll() {
    _dispatchBacking(); _dispatchTracks(); _dispatchLooper(); _dispatchLM(); _dispatchDrums()
    _dispatchSampler(); _dispatchLiveperf(); _dispatchBassline()
    Object.keys(instrumentVols.value).forEach(_sendInstCC)
    Object.keys(instrumentMuted.value).forEach(_sendInstCC)
    Object.keys(virtualChannelVols.value).forEach(key => {
      const i = key.lastIndexOf(':')
      _sendVirtChanCC(key.slice(0, i), Number(key.slice(i + 1)))
    })
    Object.keys(virtualChannelMuted.value).forEach(key => {
      const i = key.lastIndexOf(':')
      _sendVirtChanCC(key.slice(0, i), Number(key.slice(i + 1)))
    })
  }

  watch(uid, (newUid) => {
    soloedChannels.value = new Set()
    if (!newUid) {
      channelSlots.value = Array(NUM_CHANNEL_SLOTS).fill(null)
      backingVol.value = 0.8; tracksVol.value = 0.8; looperVol.value = 0.9
      lmVol.value = 0.85; drumsVol.value = 0.85; drumsLevelVol.value = 0.85; masterVol.value = 1.0
      samplerVol.value = 0.85; liveperfVol.value = 0.85; basslineVol.value = 0.85
      instrumentVols.value = {}
      virtualChannelVols.value = {}
    } else {
      channelSlots.value = loadChannelSlots()
      backingVol.value    = loadFloat('S1_MIX_BACKING',     0.8)
      tracksVol.value     = loadFloat('S1_MIX_TRACKS',      0.8)
      looperVol.value     = loadFloat('S1_MIX_LOOPER',      0.9)
      lmVol.value         = loadFloat('S1_MIX_LM',          0.85)
      drumsVol.value      = loadFloat('S1_MIX_DRUMS',       0.85)
      drumsLevelVol.value = loadFloat('S1_MIX_DRUMS_LEVEL', 0.85)
      samplerVol.value    = loadFloat('S1_MIX_SAMPLER',     0.85)
      liveperfVol.value   = loadFloat('S1_MIX_LIVEPERF',    0.85)
      basslineVol.value   = loadFloat('S1_MIX_BASSLINE',    0.85)
      masterVol.value     = loadFloat('S1_MIX_MASTER',      1.0)
      instrumentVols.value = _loadInstVols()
      virtualChannelVols.value = _loadVirtChanVols()
    }
  })

  return {
    channelSlots,
    assignChannelSlot,
    clearChannelSlot,
    backingVol, tracksVol, looperVol, lmVol, drumsVol, drumsLevelVol, samplerVol, liveperfVol, basslineVol, masterVol,
    backingMuted, tracksMuted, looperMuted, lmMuted, drumsMuted, drumsLevelMuted, samplerMuted, liveperfMuted, basslineMuted,
    effectiveDrumsLevel,
    setBackingVol, setTracksVol, setLooperVol, setLMVol, setDrumsVol, setDrumsLevelVol, setSamplerVol, setLiveperfVol, setBasslineVol, setMasterVol,
    toggleBackingMute, toggleTracksMute, toggleLooperMute, toggleLMMute, toggleDrumsMute, toggleDrumsLevelMute, toggleSamplerMute, toggleLiveperfMute, toggleBasslineMute,
    instrumentVols, instrumentMuted,
    getInstrumentVol, isInstrumentMuted, setInstrumentVol, toggleInstrumentMute,
    // Solo
    soloedChannels, isSoloed, toggleSolo, toggleInstrumentSolo,
    // Virtual instrument per-channel (multi-timbral) faders
    getVirtualChannelVol, isVirtualChannelMuted, isVirtualChannelSoloed,
    setVirtualChannelVol, toggleVirtualChannelMute, toggleVirtualChannelSolo,
  }
})
