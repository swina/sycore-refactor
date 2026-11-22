/**
 * led-feedback-service.ts — the controllers' LEDs, always on (installed by SynthApp).
 *
 * One place for the LEDs of mapped buttons: MIDI Learn mappings (127 / 0) and app
 * mappings with LED Feedback (their values), from the state of what they control
 * (lib/led-feedback.ts). Only changes are sent. A controller that belongs to Live
 * (controller-profiles.ts) gets nothing; when it comes back to Performance its
 * LEDs are sent again in full (and turned off when it goes to Live).
 */
import { computed, watch } from 'vue'
import { midiService } from '@/core/midi/midi-service'
import { ledTargets, ledChanges, ledKey, findOutputFor, type LedEntry } from '@/lib/led-feedback'
import { isLiveOwned, controllerMode, liveOwnedNames } from '@/core/midi/controller-profiles'
import { useMappingStore } from '@/stores/useMappingStore'
import { useUiStore } from '@/stores/useUiStore'
import { useArpStore } from '@/stores/useArpStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { useDrumMachineStore } from '@/stores/useDrumMachineStore'
import { useChordProgStore } from '@/stores/useChordProgStore'
import { useAudioMixerStore } from '@/stores/useAudioMixerStore'
import { MIXER_CATALOG, mixerChannelMuted } from '@/composables/useAudioMixerChannels'
import { parseViChannelAction } from '@/lib/app-midi-actions'

let installed = false

export function installLedFeedback(): void {
  if (installed) return
  installed = true
  const mapping = useMappingStore()
  const ui = useUiStore()
  const arp = useArpStore()
  const midi = useMidiStore()
  const drum = useDrumMachineStore()
  const cp = useChordProgStore()
  const mixer = useAudioMixerStore()

  // MIDI Learn params with an on/off state
  const paramState = (p: string): boolean | undefined => {
    if (p === 'dm_play_stop') return drum.isPlaying
    if (p === 'cp_play') return cp.isPlaying
    if (p === 'arp_active') return arp.arpEnabled
    if (p === 'seq_play' || p === 'seq_play_stop') return ui.isSequencerPlaying
    let m = /^dm_seq_(\w+)$/.exec(p)
    if (m) return String(drum.activeSequence).toLowerCase() === m[1]
    m = /^cp_slot_(\d+)$/.exec(p)
    if (m) return cp.activeSlotIndex === Number(m[1])
    m = /^mix_ch(\d+)_mute$/.exec(p)
    if (m) return mixerChannelMuted(Number(m[1]) - 1, mixer)
    const c = MIXER_CATALOG.find(x => x.muteParam === p)
    if (c) return !!c.muted()
    return undefined
  }

  // App actions with an on/off state
  const panel = (cat: string | null) => ui.activeVisualizerCategory === cat && !ui.isPanelCollapsed
  const actionMap: Record<string, () => boolean> = {
    toggle_arp: () => arp.arpEnabled,
    toggle_sequencer: () => ui.isSequencerOpen,
    toggle_visualizer: () => ui.isVisualizerOpen,
    toggle_midi_capture: () => ui.isCaptureOpen,
    toggle_liveset: () => ui.isLiveSetOpen,
    toggle_panel: () => !ui.isPanelCollapsed,
    open_midi_matrix: () => ui.isMidiMatrixOpen,
    toggle_looper: () => ui.isLooperOpen,
    panel_tab_grid: () => panel(null),
    panel_tab_flow: () => panel('FLOW'),
    panel_tab_lfo: () => panel('LFO'),
    panel_tab_osc: () => panel('OSCILLATOR'),
    panel_tab_env: () => panel('ENV'),
    panel_tab_filter: () => panel('FILTER'),
    panel_tab_efx: () => panel('EFX'),
    panel_tab_poly: () => panel('POLY'),
    panel_tab_advanced: () => panel('ADVANCED'),
    panel_tab_dynamic: () => panel('DYNAMIC'),
    seq_play: () => ui.isSequencerPlaying,
  }
  const actionState = (a: string): boolean | undefined => {
    const f = actionMap[a]
    if (f) return f()
    const m = /^mixer_ch(\d+)_mute$/.exec(a)
    if (m) return mixerChannelMuted(Number(m[1]) - 1, mixer)
    // Instrument: Channel N Enable/Disable — lit while the channel is in its Multi-CH out
    const vi = parseViChannelAction(a)
    if (vi) return (midi.routingConfig?.registrations?.[vi.instrumentName]?.outChannels ?? []).includes(vi.channel)
    return undefined
  }

  const wanted = computed<LedEntry[]>(() =>
    ledTargets(mapping.midiMappings as Record<string, unknown>, mapping.appMidiMappings ?? [], paramState, actionState)
      .filter(e => !isLiveOwned(e.device)))

  const sent = new Map<string, number>()
  const send = (e: LedEntry) => {
    const out = findOutputFor(e.device, midiService.getOutputs())
    if (!out) return false
    try { out.send([e.status, e.data1, e.value]) } catch { return false }
    return true
  }
  // No MIDI access yet: no outputs, nothing sent and nothing remembered (send fails → forgotten).
  const flush = () => {
    for (const e of ledChanges(sent, wanted.value)) if (!send(e)) sent.delete(ledKey(e))
  }

  watch(wanted, flush, { immediate: true })

  // Diagnosis from the browser console: `sycoreLeds()` — why a button is (not) lit.
  ;(globalThis as any).sycoreLeds = () => {
    const outputs = midiService.getOutputs().map(o => o.name)
    const learn = Object.entries(mapping.midiMappings as Record<string, any>)
      .filter(([, v]) => v && typeof v === 'object')
      .map(([key, v]) => ({ kind: 'learn', key, param: v.paramName, device: v.device ?? '(none: no LED)', state: v.paramName ? paramState(v.paramName) : undefined }))
    const app = (mapping.appMidiMappings ?? []).map((m: any) => ({
      kind: 'app', key: m.id, param: m.action, device: m.device || '(none: no LED)',
      state: m.action ? actionState(m.action) : undefined,
      feedback: m.feedbackOn === undefined ? '(LED Feedback off)' : `${m.feedbackOn}/${m.feedbackOff}`,
    }))
    const rows = [...learn, ...app].map(r => ({
      ...r,
      output: r.device.startsWith('(') ? '-' : (findOutputFor(r.device, midiService.getOutputs())?.name ?? '(no output found)'),
      liveOwned: !r.device.startsWith('(') && isLiveOwned(r.device),
    }))
    console.log('mode:', controllerMode.value, '· outputs:', outputs)
    console.table(rows)
    console.log('wanted (sent when changed):', wanted.value)
    console.log('last sent:', Object.fromEntries(sent))
    return rows.length
  }
  // A controller (re)connected: its LEDs again.
  watch(() => midi.outputs.length, () => { sent.clear(); flush() })

  // A controller that goes to Live (the active set changed): its LEDs off (Live lights them on
  // its next change). One that comes back from Live: forgotten, so `wanted` sends them all.
  const norm = (n: string) => n.trim().toLowerCase()
  watch(() => liveOwnedNames.value.map(norm).sort().join('|'), (now, before) => {
    const nowSet = new Set(now ? now.split('|') : [])
    const changed = new Set([...nowSet, ...(before ? before.split('|') : [])])
    const all = ledTargets(mapping.midiMappings as Record<string, unknown>, mapping.appMidiMappings ?? [], paramState, actionState)
    for (const e of all) {
      const d = norm(e.device)
      if (!changed.has(d)) continue
      if (nowSet.has(d)) send({ ...e, value: offValue(e, mapping.appMidiMappings ?? []) })
      sent.delete(ledKey(e))
    }
    flush()
  })
}

/** The off value of a button: an app mapping's feedbackOff, 0 for MIDI Learn. */
function offValue(e: LedEntry, app: readonly any[]): number {
  for (const m of app) {
    if (m?.device !== e.device || m.feedbackOff === undefined) continue
    const ch = (m.channel == null || m.channel < 0 ? 0 : m.channel) & 0x0F
    const st = typeof m.note === 'number' ? 0x90 | ch : typeof m.cc === 'number' ? 0xB0 | ch : -1
    if (st === e.status && (m.note ?? m.cc) === e.data1) return m.feedbackOff
  }
  return 0
}
