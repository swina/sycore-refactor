import { computed } from 'vue'
import { Music, Radio, Mic2, Layers, Disc, Zap, Piano } from 'lucide-vue-next'
import { useAudioMixerStore } from '@/stores/useAudioMixerStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { useDeviceRegistry } from '@/composables/useDeviceRegistry'
import { typeMeta } from '@/lib/device-type-meta'

// Catalog of all controllable "app" audio sources — single source of truth,
// shared by AudioMixerPanel.vue's UI and useAppActions.js's mixer_chN_*
// MIDI actions so "Channel N" means the same thing in both places.
export const MIXER_CATALOG = [
  {
    id:       'backing',
    label:    'Backing',
    sub:      'Track Player',
    desc:     'Backing Track Player playlist volume',
    icon:     Music,
    color:    'cyan',
    volParam: 'mix_backing_vol',
    muteParam:'mix_backing_mute',
    vol:    () => useAudioMixerStore().backingVol,
    muted:  () => useAudioMixerStore().backingMuted,
    setVol: v => useAudioMixerStore().setBackingVol(v),
    mute:   () => useAudioMixerStore().toggleBackingMute(),
  },
  {
    id:       'tracks',
    label:    'Tracks',
    sub:      'Tracks Player',
    desc:     'Tracks Player playlist volume',
    icon:     Radio,
    color:    'violet',
    volParam: 'mix_tracks_vol',
    muteParam:'mix_tracks_mute',
    vol:    () => useAudioMixerStore().tracksVol,
    muted:  () => useAudioMixerStore().tracksMuted,
    setVol: v => useAudioMixerStore().setTracksVol(v),
    mute:   () => useAudioMixerStore().toggleTracksMute(),
  },
  {
    id:       'looper',
    label:    'Looper',
    sub:      '8-Track Looper',
    desc:     'Master gain for all looper tracks combined',
    icon:     Mic2,
    color:    'synth-neon',
    volParam: 'mix_looper_vol',
    muteParam:'mix_looper_mute',
    vol:    () => useAudioMixerStore().looperVol,
    muted:  () => useAudioMixerStore().looperMuted,
    setVol: v => useAudioMixerStore().setLooperVol(v),
    mute:   () => useAudioMixerStore().toggleLooperMute(),
  },
  {
    id:       'lm',
    label:    'Loop Mch',
    sub:      'Samples Machine',
    desc:     'Master gain for all 24 Samples Machine pads',
    icon:     Layers,
    color:    'fuchsia',
    volParam: 'mix_lm_vol',
    muteParam:'mix_lm_mute',
    vol:    () => useAudioMixerStore().lmVol,
    muted:  () => useAudioMixerStore().lmMuted,
    setVol: v => useAudioMixerStore().setLMVol(v),
    mute:   () => useAudioMixerStore().toggleLMMute(),
  },
  {
    id:       'drums',
    label:    'Drums',
    sub:      'Drum Machine',
    desc:     'Master gain for Drum Machine audio engine',
    icon:     Layers,
    color:    'orange',
    volParam: 'mix_drums_vol',
    muteParam:'mix_drums_mute',
    vol:    () => useAudioMixerStore().drumsVol,
    muted:  () => useAudioMixerStore().drumsMuted,
    setVol: v => useAudioMixerStore().setDrumsVol(v),
    mute:   () => useAudioMixerStore().toggleDrumsMute(),
  },
  {
    id:       'drumsLevel',
    label:    'DM Level',
    sub:      'All 8 Slots',
    desc:     'Master level multiplier for all 8 Drum Machine slot volumes (same control as the Drum Machine footer Vol)',
    icon:     Layers,
    color:    'rose',
    volParam: 'mix_drums_level_vol',
    muteParam:'mix_drums_level_mute',
    vol:    () => useAudioMixerStore().drumsLevelVol,
    muted:  () => useAudioMixerStore().drumsLevelMuted,
    setVol: v => useAudioMixerStore().setDrumsLevelVol(v),
    mute:   () => useAudioMixerStore().toggleDrumsLevelMute(),
  },
  {
    id:       'sampler',
    label:    'Sampler',
    sub:      'Sampler Engine',
    desc:     'Master gain for all Sampler pads (multiplied with per-pad volume)',
    icon:     Disc,
    color:    'emerald',
    volParam: 'mix_sampler_vol',
    muteParam:'mix_sampler_mute',
    vol:    () => useAudioMixerStore().samplerVol,
    muted:  () => useAudioMixerStore().samplerMuted,
    setVol: v => useAudioMixerStore().setSamplerVol(v),
    mute:   () => useAudioMixerStore().toggleSamplerMute(),
  },
  {
    id:       'liveperf',
    label:    'Live Perf',
    sub:      'Performance Pad',
    desc:     'Master volume multiplier for Live Performance Pad',
    icon:     Zap,
    color:    'sky',
    volParam: 'mix_liveperf_vol',
    muteParam:'mix_liveperf_mute',
    vol:    () => useAudioMixerStore().liveperfVol,
    muted:  () => useAudioMixerStore().liveperfMuted,
    setVol: v => useAudioMixerStore().setLiveperfVol(v),
    mute:   () => useAudioMixerStore().toggleLiveperfMute(),
  },
]

/**
 * Shared mixer channel-list logic — used by AudioMixerPanel.vue for its UI
 * strips and by useAppActions.js's mixer_chN_volume_cc/_mute/_solo actions.
 * `flatChannels` is the single ordered list "Channel N" (1-based, N=1..16)
 * indexes into, so the Designer's mapped channel always matches whatever
 * the mixer is actually showing in that position.
 */
export function useAudioMixerChannels() {
  const mixer = useAudioMixerStore()
  const midiStore = useMidiStore()
  const { instruments } = useDeviceRegistry()

  // MIDI instruments with output registration → get their own fader
  const instrumentChannels = computed(() =>
    instruments.value.filter(d => {
      const reg = midiStore.routingConfig?.registrations?.[d.name]
      return reg && reg.outEnabled
    })
  )

  // One fader per MIDI channel of a device — CC#7 on just that channel.
  function channelStrip(name, ch) {
    return {
      key:    `${name}:${ch}`,
      name,
      label:  `CH ${ch + 1}`,
      vol:    () => mixer.getVirtualChannelVol(name, ch),
      muted:  () => mixer.isVirtualChannelMuted(name, ch),
      soloed: () => mixer.isVirtualChannelSoloed(name, ch),
      setVol: val => mixer.setVirtualChannelVol(name, ch, val),
      mute:   () => mixer.toggleVirtualChannelMute(name, ch),
      solo:   () => mixer.toggleVirtualChannelSolo(name, ch),
    }
  }

  // Any MIDI channel 1–16 of a device can be put on a mixer channel: how the channels
  // are used is the user's choice (a multi-timbral X3 on ch 1–8, a layer sent to Live…).
  // The channels the device is driven on in MIDI Flow (midiStore.partChannels) are marked.
  const ALL_CHANNELS = Array.from({ length: 16 }, (_, ch) => ch)
  function deviceChannelSources(name, type, group) {
    const used = new Set(midiStore.partChannels(name))
    return ALL_CHANNELS.map(ch => ({
      type, id: `${name}:${ch}`, group,
      label: `${name} (CH ${ch + 1})${used.has(ch) ? ' · MIDI Flow' : ''}`,
    }))
  }
  /** 'name:ch' → the channel strip, when the device still exists (else null). */
  function channelStripOf(id, devices) {
    const sep = id.lastIndexOf(':')
    const ch = sep > 0 ? Number(id.slice(sep + 1)) : NaN
    const name = sep > 0 ? id.slice(0, sep) : id
    if (!Number.isInteger(ch) || ch < 0 || ch > 15 || !devices.some(d => d.name === name)) return null
    return channelStrip(name, ch)
  }

  // MIDI instruments: per-channel strips for the channels driven in MIDI Flow
  // (multi-timbral sampler on ch 2–6), as a quick view; any channel is assignable.
  const instrumentPartStrips = computed(() => {
    const strips = []
    for (const inst of instrumentChannels.value) {
      for (const ch of midiStore.partChannels(inst.name)) strips.push(channelStrip(inst.name, ch))
    }
    return strips
  })

  // Virtual instruments → one fader for the whole device (CC#7 on its OUT channel).
  const virtualInstrumentStrips = computed(() => midiStore.virtualInstruments.map(v => {
    const reg = midiStore.routingConfig?.registrations?.[v.name]
    return {
      key:    v.name,
      name:   v.name,
      label:  'CH ' + ((reg?.outChannel ?? 0) + 1),
      vol:    () => mixer.getInstrumentVol(v.name),
      muted:  () => mixer.isInstrumentMuted(v.name),
      soloed: () => mixer.isSoloed('inst:' + v.name),
      setVol: val => mixer.setInstrumentVol(v.name, val),
      mute:   () => mixer.toggleInstrumentMute(v.name),
      solo:   () => mixer.toggleInstrumentSolo(v.name),
    }
  }))

  // Every source a channel slot can be assigned to — grouped for the
  // assignment dropdown UI.
  const availableSources = computed(() => [
    ...MIXER_CATALOG.map(c => ({ type: 'catalog', id: c.id, label: c.label, group: 'App Sources' })),
    ...instrumentChannels.value.map(inst => ({ type: 'instrument', id: inst.name, label: inst.name, group: 'MIDI Instruments' })),
    ...instrumentChannels.value.flatMap(inst => deviceChannelSources(inst.name, 'instrumentCh', 'MIDI Instruments')),
    ...virtualInstrumentStrips.value.flatMap(s => [
      { type: 'virtual', id: s.key, label: `${s.name} (OUT ${s.label})`, group: 'Virtual Instruments' },
      ...deviceChannelSources(s.name, 'virtual', 'Virtual Instruments'),
    ]),
  ])

  // Resolves one channelSlots[i] assignment ({type,id}|null) to a live
  // {vol,muted,setVol,...} channel object, or null if unassigned or if the
  // assigned source (an instrument/virtual instrument) no longer exists.
  function resolveAssignment(assignment) {
    if (!assignment) return null
    if (assignment.type === 'catalog') {
      const c = MIXER_CATALOG.find(x => x.id === assignment.id)
      if (!c) return null
      return {
        kind: 'catalog', id: c.id, label: c.label, sub: c.sub, icon: c.icon, color: c.color,
        volParam: c.volParam, muteParam: c.muteParam,
        vol: c.vol, muted: c.muted, soloed: () => mixer.isSoloed(c.id),
        setVol: c.setVol, toggleMute: c.mute, toggleSolo: () => mixer.toggleSolo(c.id),
      }
    }
    if (assignment.type === 'instrument') {
      const inst = instrumentChannels.value.find(i => i.name === assignment.id)
      if (!inst) return null
      const name = inst.name
      return {
        kind: 'instrument', id: 'inst:' + name, label: name, sub: typeMeta(inst.type).label,
        icon: Piano, deviceType: inst.type,
        vol: () => mixer.getInstrumentVol(name),
        muted: () => mixer.isInstrumentMuted(name),
        soloed: () => mixer.isSoloed('inst:' + name),
        noCC7: () => mixer.isInstrumentNoCC7(name),
        setVol: v => mixer.setInstrumentVol(name, v),
        toggleMute: () => mixer.toggleInstrumentMute(name),
        toggleSolo: () => mixer.toggleInstrumentSolo(name),
        toggleNoCC7: () => mixer.toggleInstrumentNoCC7(name),
      }
    }
    if (assignment.type === 'instrumentCh') {
      const strip = channelStripOf(assignment.id, instrumentChannels.value)
      if (!strip) return null
      return {
        kind: 'virtual', id: 'virt:' + strip.key, label: strip.name, sub: strip.label,
        icon: Piano,
        vol: strip.vol, muted: strip.muted, soloed: strip.soloed,
        setVol: strip.setVol, toggleMute: strip.mute, toggleSolo: strip.solo,
      }
    }
    if (assignment.type === 'virtual') {
      const strip = virtualInstrumentStrips.value.find(s => s.key === assignment.id)
        ?? channelStripOf(assignment.id, midiStore.virtualInstruments)
      if (!strip) return null
      return {
        kind: 'virtual', id: 'virt:' + strip.key, label: strip.name, sub: strip.label,
        icon: typeMeta('virtual').icon,
        vol: strip.vol, muted: strip.muted, soloed: strip.soloed,
        setVol: strip.setVol, toggleMute: strip.mute, toggleSolo: strip.solo,
      }
    }
    return null
  }

  // Fixed 16-length list — index N is "Channel N+1", user-assigned via
  // mixer.assignChannelSlot(). null = unassigned (or since-removed source).
  // Instruments and channels get the positional MIDI Learn params of their mixer channel
  // (mix_ch<N>_vol / _mute); app sources keep their own (mix_drums_vol, …).
  const flatChannels = computed(() => mixer.channelSlots.map((a, i) => {
    const c = resolveAssignment(a)
    if (c && !c.volParam) { c.volParam = `mix_ch${i + 1}_vol`; c.muteParam = `mix_ch${i + 1}_mute` }
    return c
  }))

  return { CATALOG: MIXER_CATALOG, instrumentChannels, instrumentPartStrips, virtualInstrumentStrips, availableSources, flatChannels }
}

/**
 * MIDI Learn on mixer channel N (mix_ch<N>_vol / _mute): applied from the channel's
 * assignment alone (store calls, no component), so it works with the mixer panel closed.
 * `kind` 'vol' takes 0–127; 'mute' toggles on a press. False: nothing assigned there.
 */
export function applyMixerChannelParam(slot, kind, val, fromNote = false, mixer = useAudioMixerStore()) {
  const a = mixer.channelSlots[slot]
  if (!a) return false
  const v = val / 127
  const press = fromNote || val > 63
  if (a.type === 'catalog') {
    const c = MIXER_CATALOG.find(x => x.id === a.id)
    if (!c) return false
    if (kind === 'vol') c.setVol(v); else if (press) c.mute()
    return true
  }
  if (a.type === 'instrument') {
    if (kind === 'vol') mixer.setInstrumentVol(a.id, v); else if (press) mixer.toggleInstrumentMute(a.id)
    return true
  }
  // 'virtual' (name, or name:ch on several parts) and 'instrumentCh' (name:ch)
  const sep = a.id.lastIndexOf(':')
  const ch = sep > 0 ? Number(a.id.slice(sep + 1)) : NaN
  if (Number.isInteger(ch)) {
    const name = a.id.slice(0, sep)
    if (kind === 'vol') mixer.setVirtualChannelVol(name, ch, v); else if (press) mixer.toggleVirtualChannelMute(name, ch)
  } else {
    if (kind === 'vol') mixer.setInstrumentVol(a.id, v); else if (press) mixer.toggleInstrumentMute(a.id)
  }
  return true
}
