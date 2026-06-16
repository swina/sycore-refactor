import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { looperEngine } from '@/lib/looper-engine'
import { midiService } from '@/core/midi/MidiService'

const ALL_CHANNEL_IDS = ['backing', 'tracks', 'looper', 'lm', 'drums', 'drumsLevel']

function loadFloat(key, def) {
  const v = localStorage.getItem(key)
  return v !== null ? parseFloat(v) : def
}

function loadEnabledChannels() {
  try {
    const raw = localStorage.getItem('S1_MIX_CHANNELS')
    if (!raw) return [...ALL_CHANNEL_IDS]
    const parsed = JSON.parse(raw)
    // keep only valid ids, preserve order
    return ALL_CHANNEL_IDS.filter(id => parsed.includes(id))
  } catch {
    return [...ALL_CHANNEL_IDS]
  }
}

export const useAudioMixerStore = defineStore('audioMixer', () => {
  // Which channel strips are visible in the mixer (ordered subset of ALL_CHANNEL_IDS)
  const enabledChannels = ref(loadEnabledChannels())

  watch(enabledChannels, v => localStorage.setItem('S1_MIX_CHANNELS', JSON.stringify(v)), { deep: true })

  function isChannelEnabled(id) { return enabledChannels.value.includes(id) }
  function toggleChannel(id) {
    if (enabledChannels.value.includes(id)) {
      enabledChannels.value = enabledChannels.value.filter(x => x !== id)
    } else {
      // re-insert in canonical order
      enabledChannels.value = ALL_CHANNEL_IDS.filter(x => enabledChannels.value.includes(x) || x === id)
    }
  }

  // Per-channel fader values (0–1)
  const backingVol = ref(loadFloat('S1_MIX_BACKING', 0.8))
  const tracksVol  = ref(loadFloat('S1_MIX_TRACKS',  0.8))
  const looperVol  = ref(loadFloat('S1_MIX_LOOPER',  0.9))
  const lmVol      = ref(loadFloat('S1_MIX_LM',      0.85))
  const drumsVol      = ref(loadFloat('S1_MIX_DRUMS',       0.85))
  const drumsLevelVol = ref(loadFloat('S1_MIX_DRUMS_LEVEL', 0.85))
  const masterVol     = ref(loadFloat('S1_MIX_MASTER',      1.0))

  const backingMuted    = ref(false)
  const tracksMuted     = ref(false)
  const looperMuted     = ref(false)
  const lmMuted         = ref(false)
  const drumsMuted      = ref(false)
  const drumsLevelMuted = ref(false)

  watch(backingVol,    v => localStorage.setItem('S1_MIX_BACKING',     String(v)))
  watch(tracksVol,     v => localStorage.setItem('S1_MIX_TRACKS',      String(v)))
  watch(looperVol,     v => localStorage.setItem('S1_MIX_LOOPER',      String(v)))
  watch(lmVol,         v => localStorage.setItem('S1_MIX_LM',          String(v)))
  watch(drumsVol,      v => localStorage.setItem('S1_MIX_DRUMS',       String(v)))
  watch(drumsLevelVol, v => localStorage.setItem('S1_MIX_DRUMS_LEVEL', String(v)))
  watch(masterVol,     v => localStorage.setItem('S1_MIX_MASTER',      String(v)))

  function effective(ch, muted) {
    return muted ? 0 : Math.min(1, ch * masterVol.value)
  }

  // Drum Machine trigger-level master (the per-pad fader multiplier) — read
  // directly by DrumMachine.vue, no window event needed since it's in-process.
  const effectiveDrumsLevel = computed(() => effective(drumsLevelVol.value, drumsLevelMuted.value))

  function _dispatchBacking() {
    window.dispatchEvent(new CustomEvent('playlist-volume', { detail: effective(backingVol.value, backingMuted.value) }))
  }
  function _dispatchTracks() {
    window.dispatchEvent(new CustomEvent('tracks-player-volume', { detail: effective(tracksVol.value, tracksMuted.value) }))
  }
  function _dispatchLooper() {
    looperEngine.masterVolume = effective(looperVol.value, looperMuted.value)
  }
  function _dispatchLM() {
    window.dispatchEvent(new CustomEvent('lm-master-volume', { detail: effective(lmVol.value, lmMuted.value) }))
  }
  function _dispatchDrums() {
    window.dispatchEvent(new CustomEvent('dm-master-volume', { detail: effective(drumsVol.value, drumsMuted.value) }))
  }

  function setBackingVol(v)    { backingVol.value = v; _dispatchBacking() }
  function setTracksVol(v)     { tracksVol.value  = v; _dispatchTracks() }
  function setLooperVol(v)     { looperVol.value  = v; _dispatchLooper() }
  function setLMVol(v)         { lmVol.value      = v; _dispatchLM() }
  function setDrumsVol(v)      { drumsVol.value   = v; _dispatchDrums() }
  function setDrumsLevelVol(v) { drumsLevelVol.value = v }
  function setMasterVol(v)     {
    masterVol.value = v
    _dispatchBacking(); _dispatchTracks(); _dispatchLooper(); _dispatchLM(); _dispatchDrums()
  }

  function toggleBackingMute()    { backingMuted.value    = !backingMuted.value;    _dispatchBacking() }
  function toggleTracksMute()     { tracksMuted.value     = !tracksMuted.value;     _dispatchTracks() }
  function toggleLooperMute()     { looperMuted.value     = !looperMuted.value;     _dispatchLooper() }
  function toggleLMMute()         { lmMuted.value         = !lmMuted.value;         _dispatchLM() }
  function toggleDrumsMute()      { drumsMuted.value      = !drumsMuted.value;      _dispatchDrums() }
  function toggleDrumsLevelMute() { drumsLevelMuted.value = !drumsLevelMuted.value }

  // ── MIDI Instrument faders (CC7 per device) ───────────────────────────────
  function _loadInstVols() {
    try { return JSON.parse(localStorage.getItem('S1_MIX_INST_VOLS') || '{}') } catch { return {} }
  }

  const instrumentVols  = ref(_loadInstVols())
  const instrumentMuted = ref({})

  function _sendInstCC(name) {
    const vol   = instrumentMuted.value[name] ? 0 : (instrumentVols.value[name] ?? 0.8)
    const cc7   = Math.round(vol * 127)
    // Resolve per-device output channel from routingConfig stored in localStorage
    let outCh = 0
    try {
      const raw = localStorage.getItem('SYCORE_ADVANCED_MIDI_ROUTING')
      if (raw) {
        const cfg = JSON.parse(raw)
        const ch  = cfg.registrations?.[name]?.outChannel
        if (typeof ch === 'number' && ch >= 0) outCh = ch
      }
    } catch {}
    midiService.sendRawCC(name, 7, cc7, outCh)
  }

  function getInstrumentVol(name)  { return instrumentVols.value[name] ?? 0.8 }
  function isInstrumentMuted(name) { return !!instrumentMuted.value[name] }

  function setInstrumentVol(name, v) {
    instrumentVols.value = { ...instrumentVols.value, [name]: v }
    localStorage.setItem('S1_MIX_INST_VOLS', JSON.stringify(instrumentVols.value))
    _sendInstCC(name)
  }

  function toggleInstrumentMute(name) {
    instrumentMuted.value = { ...instrumentMuted.value, [name]: !instrumentMuted.value[name] }
    _sendInstCC(name)
  }

  return {
    ALL_CHANNEL_IDS,
    enabledChannels,
    isChannelEnabled,
    toggleChannel,
    backingVol, tracksVol, looperVol, lmVol, drumsVol, drumsLevelVol, masterVol,
    backingMuted, tracksMuted, looperMuted, lmMuted, drumsMuted, drumsLevelMuted,
    effectiveDrumsLevel,
    setBackingVol, setTracksVol, setLooperVol, setLMVol, setDrumsVol, setDrumsLevelVol, setMasterVol,
    toggleBackingMute, toggleTracksMute, toggleLooperMute, toggleLMMute, toggleDrumsMute, toggleDrumsLevelMute,
    instrumentVols, instrumentMuted,
    getInstrumentVol, isInstrumentMuted, setInstrumentVol, toggleInstrumentMute,
  }
})
