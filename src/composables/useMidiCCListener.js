import { onMounted, onUnmounted } from 'vue'
import { midiService, MidiSource } from '@/core/midi/midi-service'
import { useMidiStore } from '@/stores/useMidiStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { useUiStore } from '@/stores/useUiStore'
import { usePresetStore } from '@/stores/usePresetStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useLfoStore } from '@/stores/useLfoStore'
import { useArpStore, ARP_SUBDIVISIONS } from '@/stores/useArpStore'
import { ARP_MODES } from '@/lib/arp-patterns'
import { useNoteLatchStore } from '@/stores/useNoteLatchStore'
import { useDrumMachineStore } from '@/stores/useDrumMachineStore'
import { useChordProgStore } from '@/stores/useChordProgStore'
import { useAudioMixerStore } from '@/stores/useAudioMixerStore'
import { FIELD_TO_CC, S1_CC_MAP } from '@/constants/s1-config'
import { dispatch } from '@/types/events'
import { useVirtualDeviceStore } from '@/stores/useVirtualDeviceStore'
import { deviceRegistry } from '@/core/midi/DeviceRegistry'
import { parseVdpParam, ButtonEdge } from '@/lib/virtual-device'

// CC buttons that step / switch something: momentary vs toggle detection (lib/virtual-device.ts)
const buttonEdges = new ButtonEdge()


function isS1Device(name) {
  if (!name) return false
  const upper = name.toUpperCase()
  return upper.includes('S-1') || upper.includes('ROLAND S-1')
}

// Module-level transport running flag — mirrors transportManager.isRunning so
// the MIDI learn path can toggle Play All without needing the composable.
let _transportRunning = false

// Standalone export so components like MidiControllerDesigner can call applyParam
// without registering duplicate MIDI listeners.
export function applyParamValue(fieldName, val, fromNote = false, stores = {}) {
  const {
    lfoStore     = useLfoStore(),
    mappingStore = useMappingStore(),
    uiStore      = useUiStore(),
    presetStore  = usePresetStore(),
    midiStore    = useMidiStore(),
    arpStore     = useArpStore(),
    noteLatchStore = useNoteLatchStore(),
    drumStore    = useDrumMachineStore(),
    cpStore      = useChordProgStore(),
    mixerStore   = useAudioMixerStore(),
    configStore  = useConfigStore(),
  } = stores

  const on = fromNote ? null : val >= 64

  if (fieldName === 'lfo1_active') {
    const target = fromNote ? !lfoStore.lfo1.active : on
    if (target !== lfoStore.lfo1.active) lfoStore.toggleLfo(1)
    return
  }
  if (fieldName === 'lfo2_active') {
    const target = fromNote ? !lfoStore.lfo2.active : on
    if (target !== lfoStore.lfo2.active) lfoStore.toggleLfo(2)
    return
  }
  if (fieldName === 'lfo1_rate') {
    lfoStore.lfo1.rate = parseFloat((0.01 + (val / 127) * (20 - 0.01)).toFixed(2))
    return
  }
  if (fieldName === 'lfo2_rate') {
    lfoStore.lfo2.rate = parseFloat((0.01 + (val / 127) * (20 - 0.01)).toFixed(2))
    return
  }
  if (fieldName === 'lfo1_depth') {
    lfoStore.lfo1.depth = Math.round((val / 127) * 100)
    return
  }
  if (fieldName === 'lfo2_depth') {
    lfoStore.lfo2.depth = Math.round((val / 127) * 100)
    return
  }
  if (fieldName === 'vel_amount') {
    mappingStore.velocityConfig.amount = Math.round((val / 127) * 200 - 100)
    return
  }
  if (fieldName === 'vel_active') {
    const target = fromNote ? !mappingStore.velocityConfig.active : on
    mappingStore.velocityConfig.active = target
    if (!target) mappingStore.restoreOriginalValues()
    return
  }
  if (fieldName === 'arp_active') {
    arpStore.arpEnabled = fromNote ? !arpStore.arpEnabled : on
    return
  }
  if (fieldName === 'arp_hold') {
    arpStore.arpHold = fromNote ? !arpStore.arpHold : on
    return
  }
  if (fieldName === 'arp_ignore_off') {
    arpStore.arpIgnoreWhenOff = fromNote ? !arpStore.arpIgnoreWhenOff : on
    return
  }
  // Continuous arp controls — map 0–127 onto the panel's own ranges so the
  // learned knob drives arpStore (and the panel's sliders follow).
  if (fieldName === 'arp_rate') {
    arpStore.arpSubdivision = ARP_SUBDIVISIONS[Math.round((val / 127) * (ARP_SUBDIVISIONS.length - 1))]
    return
  }
  if (fieldName === 'arp_mode') {
    arpStore.arpMode = ARP_MODES[Math.round((val / 127) * (ARP_MODES.length - 1))]
    return
  }
  if (fieldName === 'arp_bpm') {
    arpStore.arpBpm = Math.round(40 + (val / 127) * (250 - 40))
    return
  }
  if (fieldName === 'arp_octave') {
    arpStore.arpOctave = Math.round((val / 127) * 6) - 3
    return
  }
  if (fieldName === 'engine_ab') {
    const useB = fromNote ? !presetStore.useAlternativeEngine : on
    presetStore.selectEngine(useB ? 'B' : 'A')
    return
  }
  if (fieldName === 'seq_play_stop') {
    const shouldPlay = fromNote ? !uiStore.isSequencerPlaying : on
    window.dispatchEvent(new CustomEvent('toggle-sequencer', { detail: { play: shouldPlay } }))
    return
  }
  if (fieldName === 'save_preset') {
    if (fromNote || val > 0) presetStore.savePreset()
    return
  }
  if (fieldName === 'regenerate') {
    if (fromNote || val > 0) presetStore.generate(true)
    return
  }
  if (fieldName === 'toggle_sequencer') {
    if (fromNote || val > 0) uiStore.isSequencerOpen = !uiStore.isSequencerOpen
    return
  }
  // ── Drum Machine ─────────────────────────────────────────────────────────────
  if (fieldName === 'dm_play_stop') {
    drumStore.isPlaying = fromNote ? !drumStore.isPlaying : on
    return
  }
  if (fieldName === 'dm_midi_out_only') {
    // a switch: each press flips it (momentary and toggle buttons alike)
    if (buttonEdges.fires(fieldName, val, fromNote, performance.now())) drumStore.midiOutOnly = !drumStore.midiOutOnly
    return
  }
  if (fieldName === 'dm_repeat') {
    drumStore.repeaterActive = fromNote ? !drumStore.repeaterActive : on
    return
  }
  if (fieldName === 'dm_fill') {
    if (fromNote || val > 0) window.dispatchEvent(new CustomEvent('dm-trigger-fill'))
    return
  }
  if (fieldName === 'dm_generate') {
    if (fromNote || val > 0) window.dispatchEvent(new CustomEvent('dm-generate'))
    return
  }
  if (fieldName.startsWith('dm_seq_')) {
    const seq = fieldName.slice(7).toUpperCase()
    if (fromNote || val > 0) window.dispatchEvent(new CustomEvent('dm-seq-switch', { detail: { seq } }))
    return
  }
  if (fieldName.startsWith('dm_pad_')) {
    const idx = parseInt(fieldName.slice(7))
    if (!isNaN(idx)) window.dispatchEvent(new CustomEvent('dm-pad-trigger', { detail: { trackIdx: idx, velocity: val } }))
    return
  }
  if (fieldName.startsWith('dm_vol_')) {
    const idx = parseInt(fieldName.slice(7))
    if (!isNaN(idx)) drumStore.setTrackVolume(idx, val / 127)
    return
  }
  // ── Chord Prog ───────────────────────────────────────────────────────────────
  if (fieldName === 'cp_play') {
    if (fromNote) {
      if (cpStore.isPlaying) window.dispatchEvent(new CustomEvent('cp-stop'))
      else window.dispatchEvent(new CustomEvent('cp-start'))
    } else {
      if (on) window.dispatchEvent(new CustomEvent('cp-start'))
      else window.dispatchEvent(new CustomEvent('cp-stop'))
    }
    return
  }
  if (fieldName === 'cp_capture') {
    if (fromNote || val > 0) cpStore.captureChord()
    return
  }
  if (fieldName.startsWith('cp_slot_')) {
    const idx = parseInt(fieldName.slice(8))
    if (!isNaN(idx) && (fromNote || val > 0)) window.dispatchEvent(new CustomEvent('cp-slot-select', { detail: { idx } }))
    return
  }
  // ── Sequencer (Step Sequencer) ──────────────────────────────────────────────────
  if (fieldName === 'seq_play') {
    const shouldPlay = fromNote ? !uiStore.isSequencerPlaying : on
    window.dispatchEvent(new CustomEvent('toggle-sequencer2', { detail: { play: shouldPlay } }))
    return
  }
  // ── Virtual Device Panel controls (lib/virtual-device.ts: vdp_cc:<device>:<cc>, vdp_<action>:<device>)
  if (fieldName.startsWith('vdp_')) {
    const p = parseVdpParam(fieldName)
    if (!p) return
    const vd = stores.vdStore ?? useVirtualDeviceStore()
    if (p.kind === 'cc') { vd.setCc(p.device, p.cc, val); return }
    // a CC button: momentary fires on its press only, toggle on every press (auto-detected)
    if (!buttonEdges.fires(fieldName, val, fromNote, performance.now())) return
    if (p.kind === 'slot') vd.recallSlot(p.device, p.slot)
    else if (p.kind === 'preset_next' || p.kind === 'preset_prev') vd.stepPreset(p.device, p.kind === 'preset_next' ? 1 : -1)
    else vd.stepChannel(p.device, p.kind === 'ch_next' ? 1 : -1)
    return
  }
  if (fieldName === 'seq_time' || fieldName === 'seq_direction') {
    const event = fieldName === 'seq_time' ? 'seq-time-set' : 'seq-direction-set'
    window.dispatchEvent(new CustomEvent(event, { detail: { value: val, fromNote } }))
    return
  }
  if (fieldName.startsWith('seq_bank_')) {
    const idx = parseInt(fieldName.slice(9))
    if (!isNaN(idx) && (fromNote || val > 0)) window.dispatchEvent(new CustomEvent('seq-bank-select', { detail: { idx } }))
    return
  }
  if (fieldName === 'dm_master_vol') {
    window.dispatchEvent(new CustomEvent('dm-master-volume', { detail: val / 127 }))
    return
  }
  if (fieldName === 'dm_level_master') {
    mixerStore.setDrumsLevelVol(val / 127)
    return
  }
  // ── Audio Mixer channel volumes ───────────────────────────────────────────────
  if (fieldName === 'mix_master_vol')       { mixerStore.setMasterVol(val / 127); return }
  if (fieldName === 'mix_backing_vol')      { mixerStore.setBackingVol(val / 127); return }
  if (fieldName === 'mix_tracks_vol')       { mixerStore.setTracksVol(val / 127); return }
  if (fieldName === 'mix_looper_vol')       { mixerStore.setLooperVol(val / 127); return }
  if (fieldName === 'mix_lm_vol')           { mixerStore.setLMVol(val / 127); return }
  if (fieldName === 'mix_drums_vol')        { mixerStore.setDrumsVol(val / 127); return }
  if (fieldName === 'mix_drums_level_vol')  { mixerStore.setDrumsLevelVol(val / 127); return }
  if (fieldName === 'mix_sampler_vol')      { mixerStore.setSamplerVol(val / 127); return }
  if (fieldName === 'mix_liveperf_vol')     { mixerStore.setLiveperfVol(val / 127); return }
  if (fieldName === 'mix_backing_mute')     { if (fromNote || val > 63) mixerStore.toggleBackingMute(); return }
  if (fieldName === 'mix_tracks_mute')      { if (fromNote || val > 63) mixerStore.toggleTracksMute(); return }
  if (fieldName === 'mix_looper_mute')      { if (fromNote || val > 63) mixerStore.toggleLooperMute(); return }
  if (fieldName === 'mix_lm_mute')          { if (fromNote || val > 63) mixerStore.toggleLMMute(); return }
  if (fieldName === 'mix_drums_mute')       { if (fromNote || val > 63) mixerStore.toggleDrumsMute(); return }
  if (fieldName === 'mix_drums_level_mute') { if (fromNote || val > 63) mixerStore.toggleDrumsLevelMute(); return }
  if (fieldName === 'mix_sampler_mute')     { if (fromNote || val > 63) mixerStore.toggleSamplerMute(); return }
  if (fieldName === 'mix_liveperf_mute')    { if (fromNote || val > 63) mixerStore.toggleLiveperfMute(); return }
  // ─────────────────────────────────────────────────────────────────────────────
  // ── Per-device latch controls ─────────────────────────────────────────────
  if (fieldName.startsWith('latch_enable_')) {
    const dev = fieldName.slice('latch_enable_'.length)
    midiStore.updateRegistration(dev, 'latchEnabled', val > 63)
    return
  }
  if (fieldName.startsWith('latch_maxnotes_')) {
    const dev = fieldName.slice('latch_maxnotes_'.length)
    midiStore.updateRegistration(dev, 'latchMaxNotes', Math.max(1, Math.min(16, Math.round(val / 127 * 15) + 1)))
    return
  }
  if (fieldName.startsWith('latch_replace_')) {
    const dev = fieldName.slice('latch_replace_'.length)
    midiStore.updateRegistration(dev, 'latchReplace', val > 63)
    return
  }
  // ── Note Latch app (NoteLatchPanel.vue) — supports suffixed param names
  // for multi-instance latches (e.g. note_latch_enabled:1, note_latch_maxnotes:1).
  {
    const latchMatch = fieldName.match(/^note_latch_(enabled|maxnotes|replace)(?::(\d+))?$/)
    if (latchMatch) {
      const control = latchMatch[1]
      const suffix = latchMatch[2] ? `:${latchMatch[2]}` : ''
      const sourceKey = suffix ? `NOTE_LATCH${suffix}` : 'NOTE_LATCH'
      const inst = noteLatchStore.ensureInstance(sourceKey)
      if (control === 'enabled') {
        inst.enabled = fromNote ? !inst.enabled : on
      } else if (control === 'maxnotes') {
        inst.maxNotes = Math.max(1, Math.min(16, Math.round(val / 127 * 15) + 1))
      } else if (control === 'replace') {
        inst.replace = val > 63
      }
      return
    }
  }
  // ── Virtual instrument Multi-CH out toggle (MIDI FLOW card) ──────────────
  if (fieldName.startsWith('vi_multich_')) {
    const m = fieldName.match(/^vi_multich_(\d+)_(.+)$/)
    if (m) {
      const ch = parseInt(m[1], 10)
      const name = m[2]
      const current = midiStore.routingConfig?.registrations?.[name]?.outChannels ?? []
      const isOn = current.includes(ch)
      const shouldBeOn = fromNote ? !isOn : on
      if (shouldBeOn !== isOn) {
        midiStore.updateRegistration(name, 'outChannels', shouldBeOn ? [...current, ch] : current.filter(c => c !== ch))
      }
    }
    return
  }
  // ─────────────────────────────────────────────────────────────────────────
  if (fieldName === 'ui_panel_collapse') {
    uiStore.isPanelCollapsed = fromNote ? !uiStore.isPanelCollapsed : on
    return
  }
  if (fieldName === 'ui_cat_grid') {
    if (fromNote || on) uiStore.activeVisualizerCategory = null
    return
  }
  if (fieldName.startsWith('ui_cat_')) {
    if (fromNote || on) uiStore.activeVisualizerCategory = fieldName.slice(7)
    return
  }

  // ── Global transport actions (Play All / Stop All — value-driven) ────────
  if (fieldName === 'transport_play_all' || fieldName === 'transport_stop_all') {
    // CC 127 → play all, CC 0 → stop all. Value-driven so momentary buttons
    // (which send 127 on press and 0 on release) trigger a single play/stop
    // instead of double-toggling. Works for any learned CC number.
    const shouldPlay = fieldName !== 'transport_stop_all' && val >= 64
    _transportRunning = shouldPlay
    window.dispatchEvent(new CustomEvent(shouldPlay ? 'transport-play-all' : 'transport-stop-all'))
    return
  }

  // ── Playlist navigation (momentary-safe) ────────────────────────────────
  if (fieldName === 'prev_track' && (fromNote || val > 0)) {
    window.dispatchEvent(new CustomEvent('playlist-prev'))
    return
  }
  if (fieldName === 'next_track' && (fromNote || val > 0)) {
    window.dispatchEvent(new CustomEvent('playlist-next'))
    return
  }
  // play / pause: each press flips it (momentary and toggle buttons alike)
  if (fieldName === 'playlist_play_stop') {
    if (buttonEdges.fires(fieldName, val, fromNote, performance.now())) window.dispatchEvent(new CustomEvent('playlist-play-stop'))
    return
  }

  if (!presetStore.lastPreset) return
  presetStore.updateFieldValue(fieldName, val)

  const cc = FIELD_TO_CC[fieldName] ?? configStore.midiConfig.find(m => m.name === fieldName)?.cc
  if (cc !== undefined) {
    midiStore.sendCC(cc, val, null, MidiSource.UI)
  }
}

/**
 * The MIDI Learn mapping (mappingStore.midiMappings) a CC or note from `deviceName` on `chan`
 * (0-based) triggers, most specific key first: Device:CH#:CC# / CH#:CC#, Device:CC#, CC#
 * (notes: …:NOTE#). Returns the param name, or null.
 */
export function mappedParamFor(mappings, deviceName, chan, kind, number, { withPlain = true } = {}) {
  for (const key of mappingKeysFor(deviceName, chan, kind, number, { withPlain })) {
    const m = mappings?.[key]
    if (m) return typeof m === 'object' ? m.paramName ?? null : m
  }
  return null
}

/** The mapping keys a CC/note can be stored under, most specific first (withPlain: the legacy device-less CC#/NOTE# key too). */
export function mappingKeysFor(deviceName, chan, kind, number, { withPlain = true } = {}) {
  const frag = kind === 'note' ? `NOTE${number}` : `CC${number}`
  const keys = [deviceName ? `${deviceName}:CH${chan + 1}:${frag}` : `CH${chan + 1}:${frag}`]
  if (deviceName) keys.push(`${deviceName}:${kind === 'note' ? frag : number}`)
  if (withPlain) keys.push(kind === 'note' ? frag : `${number}`)
  return keys
}

/**
 * Whether notes from input `name` are played notes for Chord Capture: an input wired as one in
 * MIDI Flow (registration inEnabled) or registered as a controller; never a port flagged as a
 * loopback of our output, nor the input side of a port a virtual instrument sends to (its echo
 * of Drum Machine / Arp / Chord Progression notes replaced the chord just played). With nothing
 * wired as an input, any other input counts.
 */
export function isCaptureInput(name, { loopbacks = [], outputPorts = [], registrations = {}, controllers = [] } = {}) {
  if (!name) return false
  const norm = (n) => n.toLowerCase().replace(/^(\d+-|midi\s+|usb\s+)/i, '').replace(/\s*\((a|b)\)\s*$/i, '').trim()
  if (loopbacks.includes(name)) return false
  if (outputPorts.some(p => p === name || norm(p) === norm(name))) return false
  if (registrations[name]?.inEnabled || controllers.includes(name)) return true
  return !Object.values(registrations).some(r => r?.inEnabled)
}

export function useMidiCCListener() {
  const midiStore = useMidiStore()
  const mappingStore = useMappingStore()
  const uiStore = useUiStore()
  const presetStore = usePresetStore()
  const configStore = useConfigStore()
  const lfoStore = useLfoStore()
  const arpStore = useArpStore()
  const noteLatchStore = useNoteLatchStore()
  const drumStore = useDrumMachineStore()
  const cpStore = useChordProgStore()
  const mixerStore = useAudioMixerStore()

  const originalModValueMap = {}

  // NRPN assembly state keyed by "deviceName:channel"
  const nrpnState = {}

  function onCC(cc, val, chan, inputId) {
    const midiCh = midiStore.midiChannel - 1
    const inputCh = midiStore.midiInputChannel
    // Find device name for mapping lookup - using service directly for latest list
    const inputs = midiService.getInputs()
    const inputDevice = inputs.find(i => i.id === inputId)
    const deviceName = inputDevice?.name || null

    // ── NRPN assembly (CC 99 / 98 / 6) ──────────────────────────────────────
    const nrpnKey = `${deviceName ?? ''}:${chan}`
    if (cc === 99) { // NRPN Parameter Number MSB
      nrpnState[nrpnKey] = { msb: val, lsb: null }
      return
    }
    if (cc === 98) { // NRPN Parameter Number LSB
      if (nrpnState[nrpnKey]) nrpnState[nrpnKey].lsb = val
      return
    }
    if (cc === 6) { // Data Entry MSB — completes an assembled NRPN
      const nrpn = nrpnState[nrpnKey]
      if (nrpn && nrpn.msb !== null && nrpn.lsb !== null) {
        const nrpnFragment = `NRPN:${nrpn.msb}:${nrpn.lsb}`
        delete nrpnState[nrpnKey]

        if (mappingStore.isMidiLearning) {
          mappingStore.incomingNRPN(nrpn.msb, nrpn.lsb, deviceName, chan)
          return
        }

        // Lookup: Device:CH:NRPN:MSB:LSB → Device:NRPN:MSB:LSB → NRPN:MSB:LSB
        const preciseNrpnKey = deviceName
          ? `${deviceName}:CH${chan + 1}:${nrpnFragment}`
          : `CH${chan + 1}:${nrpnFragment}`
        const deviceNrpnKey = deviceName ? `${deviceName}:${nrpnFragment}` : null
        const nrpnMapping =
          mappingStore.midiMappings[preciseNrpnKey] ||
          (deviceNrpnKey ? mappingStore.midiMappings[deviceNrpnKey] : null) ||
          mappingStore.midiMappings[nrpnFragment]

        if (nrpnMapping) {
          const paramName = typeof nrpnMapping === 'object' ? nrpnMapping.paramName : nrpnMapping
          console.log(`[MIDI Listener] NRPN mapped: ${nrpnFragment} -> ${paramName} (${val})`)
          applyParam(paramName, val)
          return
        }
        // No NRPN mapping found — fall through to let CC 6 be handled as a regular CC
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    if (mappingStore.isMidiLearning) {
      mappingStore.incomingCC(cc, deviceName, chan)
      return
    }

    // 1. Check for User Mapping with high specificity (Device + Channel + CC)
    // New format: "Device:CH#:CC#"
    const preciseKey = deviceName
      ? `${deviceName}:CH${chan + 1}:CC${cc}`
      : `CH${chan + 1}:CC${cc}`

    // Fallback formats for backward compatibility
    const deviceCCKey = deviceName ? `${deviceName}:${cc}` : null
    const plainCCKey  = `${cc}`

    const mapping = mappingStore.midiMappings[preciseKey] ||
                    (deviceCCKey ? mappingStore.midiMappings[deviceCCKey] : null) ||
                    mappingStore.midiMappings[plainCCKey]

    if (mapping) {
      const paramName = typeof mapping === 'object' ? mapping.paramName : mapping
      applyParam(paramName, val)
      return
    }

    // Filter out messages that do not come from S-1 or a device mapped to S-1
    const isS1 = isS1Device(deviceName)
    const targets = deviceName ? (midiService.getRouting(deviceName) || []) : []
    const isMappedToS1 = targets.some(target => isS1Device(target))

    if (!isS1 && !isMappedToS1) {
      return
    }

    // 2. Standard Channel Filtering for non-mapped messages
    const isControl = chan === midiCh
    const isInput = inputCh === -1 || chan === inputCh
    
    // Check if this device has a fixed input channel in the matrix that matches the incoming channel
    const registration = midiStore.routingConfig.registrations[deviceName]
    const isDeviceMatch = registration && (registration.inChannel === -1 || registration.inChannel === chan)

    if (!isControl && !isInput && !isDeviceMatch) {
       // Only log if it's not a noise/clock message
       if (cc !== undefined) {
         console.log(`[MIDI Listener] Filtered CC ${cc} from ${deviceName || 'Unknown'} (CH ${chan+1}). Active PART: CH ${midiCh+1}, Input: ${inputCh === -1 ? 'OMNI' : inputCh+1}`)
       }
       return
     }

    let effectiveCC = cc
    
    // Legacy mapping (CC only) - Check both string and number keys for safety
    const legacyMapping = mappingStore.midiMappings[cc] || mappingStore.midiMappings[String(cc)]
    if (isInput && !isControl && legacyMapping) {
      const mappedName = typeof legacyMapping === 'object' ? legacyMapping.paramName : legacyMapping
      const cfg = configStore.midiConfig.find(m => m.name === mappedName)
      if (cfg) effectiveCC = cfg.cc
    }

    // Modulation Wheel remapping
    if (effectiveCC === 1 && uiStore.globalModCC !== 1) {
      const targetCfg = configStore.midiConfig.find(m => m.cc === uiStore.globalModCC)
      if (targetCfg) {
        if (val > 3) {
          if (!(uiStore.globalModCC in originalModValueMap)) {
            originalModValueMap[uiStore.globalModCC] =
              presetStore.lastPreset?.data?.[targetCfg.name] ?? 0
          }
          applyParam(targetCfg.name, val)
        } else {
          const base = originalModValueMap[uiStore.globalModCC] ?? 0
          delete originalModValueMap[uiStore.globalModCC]
          applyParam(targetCfg.name, base)
        }
      }
      return
    }

    // Standard Config lookup
    const paramCfg = configStore.midiConfig.find(m => m.cc === effectiveCC)
    if (paramCfg) {
      applyParam(paramCfg.name, val)
      return
    }

    // S-1 Hardware lookup
    const s1Field = S1_CC_MAP[effectiveCC]
    if (s1Field) {
      applyParam(s1Field, val)
      return
    }
  }

  function applyParam(fieldName, val, fromNote = false) {
    return applyParamValue(fieldName, val, fromNote, { lfoStore, mappingStore, uiStore, presetStore, midiStore, arpStore, noteLatchStore, drumStore, cpStore, mixerStore, configStore })
  }

  let unsubCC, unsubNote, unsubPitch

  onMounted(() => {
    unsubCC = midiService.addCCListener(onCC)
    unsubNote = midiService.addNoteListener(onNote)
    unsubPitch = midiService.addPitchBendListener(onPitchBend)
    // Virtual Device controls are consumed: kept out of Thru (see midiService.setThruExclude)
    midiService.setThruExclude((deviceName, chan, kind, number) =>
      !!mappedParamFor(mappingStore.midiMappings, deviceName || null, chan, kind, number)?.startsWith('vdp_'))
  })

  onUnmounted(() => {
    midiService.setThruExclude(null)
    unsubCC?.()
    unsubNote?.()
    unsubPitch?.()
  })

  function onNote(type, note, velocity, chan, inputId) {
    const midiCh = midiStore.midiChannel - 1
    const inputCh = midiStore.midiInputChannel
    const isControl = chan === midiCh
    const isInput = inputCh === -1 || chan === inputCh

    if (mappingStore.isMidiLearning) return // raw listener in MidiMapContextMenu handles this

    const isOn = type === 'on' && velocity > 0
    const inputs = midiService.getInputs()
    const inputDevice = inputs.find(i => i.id === inputId)
    const deviceName = inputDevice?.name || null

    const noteFragment = `NOTE${note}`
    const preciseKey = deviceName
      ? `${deviceName}:CH${chan + 1}:${noteFragment}`
      : `CH${chan + 1}:${noteFragment}`
    const deviceKey = deviceName ? `${deviceName}:${noteFragment}` : null

    // A mapping learned on this device (+ channel) is explicit: it applies whatever the global
    // control / input channel — pads usually send on their own channel (often 10), which the
    // filter below dropped before the mapping was even looked up (CCs already worked this way).
    // The legacy device-less NOTE# key stays behind the channel filter.
    const explicit = mappingStore.midiMappings[preciseKey] ||
      (deviceKey ? mappingStore.midiMappings[deviceKey] : null)

    if (!explicit && !isControl && !isInput) return

    const mapping = explicit || mappingStore.midiMappings[noteFragment]

    if (!mapping) {
      // Unmapped notes are played notes — feed the Chord Capture held-note set, from a real
      // controller only (not SY.CORE's own MIDI coming back through a loopback port).
      if (isCaptureInput(deviceName, {
        loopbacks: midiService.getLoopbackInputNames(),
        outputPorts: midiStore.virtualInstruments.map(v => v.midiOutputPort).filter(Boolean),
        registrations: midiStore.routingConfig?.registrations ?? {},
        controllers: deviceRegistry.getAll().filter(d => d.type === 'controller').map(d => d.name),
      })) cpStore.trackCaptureNote(isOn, note)
      return
    }
    if (isOn) {
      const paramName = typeof mapping === 'object' ? mapping.paramName : mapping
      applyParam(paramName, velocity, true)
    }
  }

  function applyParam(fieldName, val, fromNote = false) {
    return applyParamValue(fieldName, val, fromNote, { lfoStore, mappingStore, uiStore, presetStore, midiStore, arpStore, noteLatchStore, drumStore, cpStore, mixerStore, configStore })
  }

  function onPitchBend(val, chan, inputId) {
    const midiCh = midiStore.midiChannel - 1
    const inputCh = midiStore.midiInputChannel
    const isControl = chan === midiCh
    const isInput = inputCh === -1 || chan === inputCh
    if (!isControl && !isInput) return

    // Pitch bend logic (already handled by thru in MidiService if enabled)
  }

  return {}
}
