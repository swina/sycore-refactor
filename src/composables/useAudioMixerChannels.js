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

  // Virtual instruments → one fader each, UNLESS configured as multi-timbral
  // in MIDI Flow (registration.outChannels), in which case each channel gets
  // its own independent fader.
  const virtualInstrumentStrips = computed(() => {
    const strips = []
    for (const v of midiStore.virtualInstruments) {
      const reg = midiStore.routingConfig?.registrations?.[v.name]
      const outChannels = reg?.outChannels
      if (outChannels && outChannels.length > 0) {
        for (const ch of outChannels) {
          strips.push({
            key:    `${v.name}:${ch}`,
            name:   v.name,
            label:  `CH ${ch + 1}`,
            vol:    () => mixer.getVirtualChannelVol(v.name, ch),
            muted:  () => mixer.isVirtualChannelMuted(v.name, ch),
            soloed: () => mixer.isVirtualChannelSoloed(v.name, ch),
            setVol: val => mixer.setVirtualChannelVol(v.name, ch, val),
            mute:   () => mixer.toggleVirtualChannelMute(v.name, ch),
            solo:   () => mixer.toggleVirtualChannelSolo(v.name, ch),
          })
        }
      } else {
        strips.push({
          key:    v.name,
          name:   v.name,
          label:  'CH ' + ((reg?.outChannel ?? 0) + 1),
          vol:    () => mixer.getInstrumentVol(v.name),
          muted:  () => mixer.isInstrumentMuted(v.name),
          soloed: () => mixer.isSoloed('inst:' + v.name),
          setVol: val => mixer.setInstrumentVol(v.name, val),
          mute:   () => mixer.toggleInstrumentMute(v.name),
          solo:   () => mixer.toggleInstrumentSolo(v.name),
        })
      }
    }
    return strips
  })

  // Every source a channel slot can be assigned to — grouped for the
  // assignment dropdown UI.
  const availableSources = computed(() => [
    ...MIXER_CATALOG.map(c => ({ type: 'catalog', id: c.id, label: c.label, group: 'App Sources' })),
    ...instrumentChannels.value.map(inst => ({ type: 'instrument', id: inst.name, label: inst.name, group: 'MIDI Instruments' })),
    ...virtualInstrumentStrips.value.map(s => ({ type: 'virtual', id: s.key, label: `${s.name} (${s.label})`, group: 'Virtual Instruments' })),
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
        setVol: v => mixer.setInstrumentVol(name, v),
        toggleMute: () => mixer.toggleInstrumentMute(name),
        toggleSolo: () => mixer.toggleInstrumentSolo(name),
      }
    }
    if (assignment.type === 'virtual') {
      const strip = virtualInstrumentStrips.value.find(s => s.key === assignment.id)
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
  const flatChannels = computed(() => mixer.channelSlots.map(resolveAssignment))

  return { CATALOG: MIXER_CATALOG, instrumentChannels, virtualInstrumentStrips, availableSources, flatChannels }
}
