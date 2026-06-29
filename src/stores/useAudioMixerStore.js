import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { looperEngine } from '@/lib/looper-engine'
import { midiService } from '@/core/midi/MidiService'
import { useAuthStore } from './useAuthStore'
import { userKey } from '@/lib/userKey'

const ALL_CHANNEL_IDS = ['backing', 'tracks', 'looper', 'lm', 'drums', 'drumsLevel', 'sampler', 'liveperf']

function loadFloat(key, def) {
  const v = localStorage.getItem(userKey(key))
  return v !== null ? parseFloat(v) : def
}

function loadEnabledChannels() {
  try {
    const raw = localStorage.getItem(userKey('S1_MIX_CHANNELS'))
    if (!raw) return [...ALL_CHANNEL_IDS]
    const parsed = JSON.parse(raw)
    return ALL_CHANNEL_IDS.filter(id => parsed.includes(id))
  } catch {
    return [...ALL_CHANNEL_IDS]
  }
}

export const useAudioMixerStore = defineStore('audioMixer', () => {
  const authStore = useAuthStore()
  const uid = computed(() => authStore.user?.uid)

  const enabledChannels = ref(loadEnabledChannels())

  watch(enabledChannels, v => localStorage.setItem(userKey('S1_MIX_CHANNELS'), JSON.stringify(v)), { deep: true })

  function isChannelEnabled(id) { return enabledChannels.value.includes(id) }
  function toggleChannel(id) {
    if (enabledChannels.value.includes(id)) {
      enabledChannels.value = enabledChannels.value.filter(x => x !== id)
    } else {
      enabledChannels.value = ALL_CHANNEL_IDS.filter(x => enabledChannels.value.includes(x) || x === id)
    }
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

  watch(backingVol,    v => localStorage.setItem(userKey('S1_MIX_BACKING'),     String(v)))
  watch(tracksVol,     v => localStorage.setItem(userKey('S1_MIX_TRACKS'),      String(v)))
  watch(looperVol,     v => localStorage.setItem(userKey('S1_MIX_LOOPER'),      String(v)))
  watch(lmVol,         v => localStorage.setItem(userKey('S1_MIX_LM'),          String(v)))
  watch(drumsVol,      v => localStorage.setItem(userKey('S1_MIX_DRUMS'),       String(v)))
  watch(drumsLevelVol, v => localStorage.setItem(userKey('S1_MIX_DRUMS_LEVEL'), String(v)))
  watch(samplerVol,    v => localStorage.setItem(userKey('S1_MIX_SAMPLER'),     String(v)))
  watch(liveperfVol,   v => localStorage.setItem(userKey('S1_MIX_LIVEPERF'),    String(v)))
  watch(masterVol,     v => localStorage.setItem(userKey('S1_MIX_MASTER'),      String(v)))

  function effective(ch, muted) {
    return muted ? 0 : Math.min(1, ch * masterVol.value)
  }

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
  function _dispatchSampler() {
    window.dispatchEvent(new CustomEvent('sampler-master-volume', { detail: effective(samplerVol.value, samplerMuted.value) }))
  }
  function _dispatchLiveperf() {
    window.dispatchEvent(new CustomEvent('liveperf-master-volume', { detail: effective(liveperfVol.value, liveperfMuted.value) }))
  }

  function setBackingVol(v)    { backingVol.value = v; _dispatchBacking() }
  function setTracksVol(v)     { tracksVol.value  = v; _dispatchTracks() }
  function setLooperVol(v)     { looperVol.value  = v; _dispatchLooper() }
  function setLMVol(v)         { lmVol.value      = v; _dispatchLM() }
  function setDrumsVol(v)      { drumsVol.value   = v; _dispatchDrums() }
  function setDrumsLevelVol(v) { drumsLevelVol.value = v }
  function setSamplerVol(v)    { samplerVol.value    = v; _dispatchSampler() }
  function setLiveperfVol(v)   { liveperfVol.value   = v; _dispatchLiveperf() }
  function setMasterVol(v)     {
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

  function _loadInstVols() {
    try { return JSON.parse(localStorage.getItem(userKey('S1_MIX_INST_VOLS')) || '{}') } catch { return {} }
  }

  const instrumentVols  = ref(_loadInstVols())
  const instrumentMuted = ref({})

  function _sendInstCC(name) {
    const vol   = instrumentMuted.value[name] ? 0 : (instrumentVols.value[name] ?? 0.8)
    const cc7   = Math.round(vol * 127)
    let outCh = 0
    try {
      const raw = localStorage.getItem(userKey('SYCORE_ADVANCED_MIDI_ROUTING'))
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
    localStorage.setItem(userKey('S1_MIX_INST_VOLS'), JSON.stringify(instrumentVols.value))
    _sendInstCC(name)
  }

  function toggleInstrumentMute(name) {
    instrumentMuted.value = { ...instrumentMuted.value, [name]: !instrumentMuted.value[name] }
    _sendInstCC(name)
  }

  watch(uid, (newUid) => {
    if (!newUid) {
      enabledChannels.value = [...ALL_CHANNEL_IDS]
      backingVol.value = 0.8; tracksVol.value = 0.8; looperVol.value = 0.9
      lmVol.value = 0.85; drumsVol.value = 0.85; drumsLevelVol.value = 0.85; masterVol.value = 1.0
      samplerVol.value = 0.85; liveperfVol.value = 0.85
      instrumentVols.value = {}
    } else {
      enabledChannels.value = loadEnabledChannels()
      backingVol.value    = loadFloat('S1_MIX_BACKING',     0.8)
      tracksVol.value     = loadFloat('S1_MIX_TRACKS',      0.8)
      looperVol.value     = loadFloat('S1_MIX_LOOPER',      0.9)
      lmVol.value         = loadFloat('S1_MIX_LM',          0.85)
      drumsVol.value      = loadFloat('S1_MIX_DRUMS',       0.85)
      drumsLevelVol.value = loadFloat('S1_MIX_DRUMS_LEVEL', 0.85)
      samplerVol.value    = loadFloat('S1_MIX_SAMPLER',     0.85)
      liveperfVol.value   = loadFloat('S1_MIX_LIVEPERF',    0.85)
      masterVol.value     = loadFloat('S1_MIX_MASTER',      1.0)
      instrumentVols.value = _loadInstVols()
    }
  })

  return {
    ALL_CHANNEL_IDS,
    enabledChannels,
    isChannelEnabled,
    toggleChannel,
    backingVol, tracksVol, looperVol, lmVol, drumsVol, drumsLevelVol, samplerVol, liveperfVol, masterVol,
    backingMuted, tracksMuted, looperMuted, lmMuted, drumsMuted, drumsLevelMuted, samplerMuted, liveperfMuted,
    effectiveDrumsLevel,
    setBackingVol, setTracksVol, setLooperVol, setLMVol, setDrumsVol, setDrumsLevelVol, setSamplerVol, setLiveperfVol, setMasterVol,
    toggleBackingMute, toggleTracksMute, toggleLooperMute, toggleLMMute, toggleDrumsMute, toggleDrumsLevelMute, toggleSamplerMute, toggleLiveperfMute,
    instrumentVols, instrumentMuted,
    getInstrumentVol, isInstrumentMuted, setInstrumentVol, toggleInstrumentMute,
  }
})
