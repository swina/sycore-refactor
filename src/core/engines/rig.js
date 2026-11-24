/**
 * Rig engine — the Rig Controller's logic outside its Vue component (Four contexts C2, Scenario
 * Workspaces Phase 1): the rig state, the pads and their waits on the sync points, the clock / Play /
 * count-in, the fades (Master, Drum, per MIDI channel), the CC 7 / velocity / mutes it sends, the DJ
 * filter, the LEDs and the physical Launchpad / MIDImix in Rig mode, the SY.CORE Rig device in Live,
 * the rig actions, and the Session > Songs player (songCommand from the Session Browser).
 *
 * One instance for the whole app (useRigEngine), created at app start in a detached effectScope:
 * songs, mutes and the controllers keep working with the Rig panel closed. The panel
 * (RigControllerPanel.vue) renders the engine's state and calls its actions.
 *
 * The code is moved from RigControllerPanel.vue as it was (2026-11-24); its onUnmounted cleanups
 * are the scope's (onScopeDispose: tests only).
 */
import { reactive, ref, computed, watch, effectScope, onScopeDispose } from 'vue'
import { RIG_SETTINGS_EVENT, materialPending, syncSongMaterial } from '@/core/sessions'
import { slotName, labelOf as slotLabelOf } from '@/lib/slot-names'
import { SONG_LANES, emptyLanes, songLibrary, saveSongs, songRun as sharedSongRun, songCommand, rigLaneMutes, setSongChannels, lanesAt, laneClips, barsToEnd, songFadeBars, fadeStopLine, startRun, songBarLine, jumpTo, setHold, sectionVolTargets, sectionVolRamps, sectionDrumDensity } from '@/lib/songs'
import { needsSwitch, switchMaterial, captureInto, dropMaterial } from '@/lib/song-material'
import { keyLabel, keyRoot, keyFile, progressionKeyDetail, NOTE_NAMES as KEY_NOTE_NAMES } from '@/lib/chord-key'
import { externalGrid } from '@/core/midi/external-grid'
import { intGrid } from '@/core/midi/int-grid'
import { stopGate, endOfNextBar } from '@/core/midi/stop-gate'
import { FADE_KEYS, defaultFades, parseFades, planFadeIn, planFadeOut, rampAt, faded, parseChFades, planChIn, planChOut, chRampAt, chKey } from '@/lib/rig-fades'
import { useAudioMixerStore } from '@/stores/useAudioMixerStore'
import { audioTimeToPerfMs } from '@/lib/audio-clock'
import { rigDensity, DENSITY_APPS } from '@/lib/rig-density'
import { RIG_ACTION_APPS, rigLedState, parseRigAction } from '@/lib/rig-actions'
import { exportRigTemplate, parseRigTemplate, applyRigTemplate, clearRigMappings, rigMappedDevices, templateMatches, sysexBytes, templateFileName } from '@/lib/rig-template'
import { useMappingStore } from '@/stores/useMappingStore'
import { linkClient, useLinkStore } from '@/stores/useLinkStore'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'
import { SLOT_LABELS, KEY_NAMES, LP_TOP_LABELS, PRESS_OPTIONS, MOTION_OPTIONS, TRIGGER_SYNC_OPTIONS, POSITION_SYNC_OPTIONS, createRigState, slotState, slotColor, pressSlot, releaseSlot, setTrackOption, generate, selectSection, toggleMute, toggleSolo, toggleLaneMute, shiftKey, panic, toggleClockSource, tick, startClock, stopClock, lpTopCc } from '@/lib/rig-controller'
import { isLiveRow, SLOT_ROWS, rigTransport, rowPadEvents, rigParts, bassSnapshot, arpSnapshot, arpPress, arpOctaveOf, arpOctaveValue, arpRateOf, arpRateValue, rigMutes, rigVelocityScales, rigCc7, intensityMode, loadIntensityModes, saveIntensityModes, loadMuteScopes, saveMuteScopes, rigReports, drumSnapshot, chordSnapshot, seqSnapshot, applySnapshot, applyClock, dispatchRig, liveSyncSteps, padWhen, rigArmed, armPress, armPlaying, armedDrumLoads, fillLook, rigFollowPlay, stopEvents, rigLaneRows, rowLane, activeSlotRows, isSlotRow, liveAppSource, arpeggiatorRow, stopRows } from '@/lib/rig-live'
import { getTransport } from 'tone'
import { midiService, cableMuteKey } from '@/core/midi/midi-service'
import { isMidimixName, parseMidimixInput, mixLedDiff, mixLedsOff, Pickup, roleId, learnMixMsg, assignMix, mixMsgLabel, loadMixMap, saveMixMap } from '@/lib/rig-midimix'
import { currentSet, setControllerRole } from '@/core/projects'
import { roleOf } from '@/lib/projects'
import { learnToggle, matchToggle, toggleLabel, sameToggle, loadToggle, saveToggle, RIG_TOGGLE_SLOTS } from '@/lib/rig-toggle'
import { rigLinkLaunchpad, parseRigLinkPress } from '@/lib/rig-link-launchpad'
import { rigLaunchpad, isLaunchpadName, parseLaunchpadInput, ledDiff, colorVelocity, RIG_INIT_MESSAGES, muteOtherSenders, unmuteOtherSenders, rigSend } from '@/lib/rig-launchpad'
import { useDrumMachineStore } from '@/stores/useDrumMachineStore'
import { useDrumMachineEngine } from '@/core/engines/drum-machine'
import { useChordProgStore, DURATION_LABELS } from '@/stores/useChordProgStore'
import { isChord } from '@/lib/chord-next'
import { rigChord } from '@/lib/chord-next'
import { frameLoop, uiTimeout } from '@/lib/ui-clock'
import { MODAL_KEY_INDEX } from '@/lib/chord-gen-style'
import { djCutoff, djFilter, djFilterCc, DJ_FILTER_OPEN } from '@/lib/dj-filter'
import { createWorkerTicker } from '@/core/midi/step-scheduler'
import { useStepSequencerStore, useSeqLaneStore } from '@/stores/useStepSequencerStore'
import { seqLanePlaying, seqLaneQueued, SEQ_LANE_CFG, SEQ_LANES, laneEvent, seqActiveLane } from '@/lib/seq-lanes'
import { useArpStore } from '@/stores/useArpStore'
import { useExternalClockStore } from '@/stores/useExternalClockStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { useUiStore } from '@/stores/useUiStore'
import { useGlobalTransportControls } from '@/composables/useGlobalTransportControls'
import { useRigCaptures } from '@/core/engines/rig-captures'
import { clipSummary } from '@/lib/rig-captures'
import { useSyncStore } from '@/stores/useSyncStore'
import { countIn, startCountIn, cancelCountIn } from '@/lib/count-in'

/** The SY.CORE Rig device's rows (bridge protocol: rows 0–4). */
const RIG_LINK_ORDER = ['chord', 'drum', 'seq', 'bass', 'arp']

let engine = null
let engineScope = null

/** The Rig engine (created on first call; needs Pinia installed). */
export function useRigEngine() {
  if (!engine) {
    engineScope = effectScope(true)
    engine = engineScope.run(createRigEngine)
  }
  return engine
}

/** Tests: drop the engine (its watchers, timers and listeners), so the next call makes a new one. */
export function _resetRigEngine() {
  engineScope?.stop()
  engineScope = null
  engine = null
}

function createRigEngine() {
  const uiStore = useUiStore()
  const s = reactive(createRigState())
  const view = ref('rig') // the panel's view (the Launchpad's top pad 6 goes back to the Rig layout)
  const focusApp = ref('drum')
  const flowConfig = ref('Live — Techno Set')
  const FLOW_CONFIGS = ['Live — Techno Set', 'Live — Ambient Set', 'Studio jam']

  // ── Mode: LIVE (the real apps) or SIM (simulated) ─────────────────────────
  const LS_MODE = 'SYCORE_RIG_MODE'
  const mode = ref(localStorage.getItem(LS_MODE) === 'sim' ? 'sim' : 'live')
  const live = computed(() => mode.value === 'live')
  const drumStore = useDrumMachineStore()
  // Row S1–S8: Sections (standard) or Captures (clips recorded live with Capt — core/engines/rig-captures.js)
  const captures = useRigCaptures()
  const LS_SMODE = 'S1_RIG_S_MODE'
  const sMode = ref((() => { try { return localStorage.getItem(LS_SMODE) === 'captures' ? 'captures' : 'sections' } catch { return 'sections' } })())
  watch(sMode, v => { try { localStorage.setItem(LS_SMODE, v) } catch {} })
  function toggleSMode() {
    sMode.value = sMode.value === 'captures' ? 'sections' : 'captures'
    s.display = sMode.value === 'captures'
      ? 'Row S: Captures — Capt records, a pad plays its capture (an empty pad: picks it for the next one; Shift + pad: clears)'
      : 'Row S: Sections'
  }
  function onCapt() {
    s.display = captures.toggleRecording()
  }
  /** A capture pad clicked in the panel: Shift held = the Rig's Shift (clear). */
  function onCapturePadClick(e, i) {
    const was = s.shift
    if (e.shiftKey) s.shift = true
    onCapturePad(i)
    if (e.shiftKey) s.shift = was
  }
  // Capture sets (named, IndexedDB): the 8 pads saved / loaded under a name
  const captSetName = ref('')
  const captSetPick = ref('')
  async function onSaveSet() {
    const name = captSetName.value || captures.state.setName || ''
    s.display = await captures.saveSet(name)
    if (captures.state.setName === name.trim()) { captSetPick.value = name.trim(); captSetName.value = '' }
  }
  function onLoadSet() {
    if (!captSetPick.value) return
    s.display = captures.loadSet(captSetPick.value)
  }
  async function onDeleteSet() {
    const name = captSetPick.value
    if (!name || !window.confirm(`Delete the capture set "${name}"?`)) return
    s.display = await captures.deleteSet(name)
    captSetPick.value = ''
  }
  function onCapturePad(i) {
    const c = captures.state
    if (s.shift) { if (c.clips[i]) { captures.clear(i); s.display = `S${i + 1} cleared (back from Session takes › Capt)` } return }
    // while recording, a pad picks where the capture goes — a full one is recorded over
    if (c.recording) {
      captures.select(i)
      s.display = c.selected !== i ? 'Capture goes to: the first empty pad'
        : c.clips[i] ? `Capture goes to S${i + 1}: records over it (the old one kept in Session takes)` : `Capture goes to S${i + 1}`
      return
    }
    if (!c.clips[i]) {
      captures.select(i)
      s.display = c.selected === i ? `S${i + 1} picked for the next capture` : 'Next capture: the first empty pad'
      return
    }
    const was = c.play[i]
    captures.toggleSlot(i)
    const p = c.play[i]
    const started = was === 'idle' && p !== 'idle'
    s.display = `S${i + 1} (${clipSummary(c.clips[i])}): ${p === 'queued' ? (captures.clockRunning() ? 'plays from the next bar' : 'waits for Play (starts on its 1)') : p === 'stopping' ? 'stops at the end of the bar' : p === 'playing' ? 'plays on' : 'called off'}`
      + (!started ? '' : captures.hasOutCable() ? ` → ${captures.outTargets().join(', ')}`
        : captures.staleNode() ? ' — MIDI Flow: the Live Perf node was saved as a device (no app id): reload the page, delete it and drag Live Perf in again, then cable it'
        : ' — MIDI Flow: cable Live Perf → your device (no cable: broadcast outputs only)')
  }
  const chordStore = useChordProgStore()
  const seqStore = useStepSequencerStore()
  // the Bass / Arp lanes' banks (the rows on their lanes: rigLaneRows)
  const laneStores = { bass: useSeqLaneStore('bass'), arp: useSeqLaneStore('arp') }
  const arpStore = useArpStore()
  const clockStore = useExternalClockStore()
  const linkStore = useLinkStore()
  // The big Play of Rig Controls: following Live over SY.CORE Link it plays / stops Live, so it shows
  // Live's own transport (as reported, one change per Play / Stop); else the rig clock.
  const playOn = computed(() => live.value && s.clock.source === 'EXT' && clockStore.isLink && linkStore.ready ? linkStore.livePlaying : s.clock.running)
  // Diagnostics: the rig clock's running flag flipping back and forth (seen: the Play button
  // alternating Play / Stop while Live played). Prints what the clock sources said, at most every 5 s.
  let flips = []
  let flipLogAt = 0
  watch(() => s.clock.running, (now) => {
    const t = performance.now()
    flips = [...flips.filter(x => t - x < 2000), t]
    if (flips.length >= 4 && t - flipLogAt > 5000) {
      flipLogAt = t
      console.warn(`[Rig] clock running flapping: ${flips.length} changes in 2 s (now ${now}) · source ${s.clock.source} · clock ${clockStore.source}${clockStore.isLink ? ' (Link)' : ''} state ${clockStore.state} fallbackINT ${clockStore.fallbackToInternal} · Live playing ${linkClient.transport.playing} · Tone running ${transportManager.isRunning.value} · mode ${mode.value}`)
    }
  })
  const midiStore = useMidiStore()
  const { transportManager, playAll, stopAll } = useGlobalTransportControls()
  const syncStore = useSyncStore()

  /** Mirror the real apps and clock into the rig state (LIVE). */
  function syncLive() {
    const t = transportManager.isRunning.value ? transportManager.getBarPosition() : { bar: 1, beat: 1, sixteenth: 1 }
    let intBpm = 0
    try { intBpm = getTransport().bpm.value } catch {}
    applyClock(s,
      { following: clockStore.source !== 'internal' && !clockStore.fallbackToInternal, playing: clockStore.state === 'playing', bpm: clockStore.bpm || midiStore.currentBpm, position: clockStore.position }, // no tempo from the source yet: SY.CORE's (not the rig's default)
      { running: transportManager.isRunning.value, bpm: intBpm, ...t })
    for (const a of s.apps) {
      // Drum and Bass: the Drum Machine's two parts, each on its own (drums only / bass only / both).
      if (a.id === 'drum') applySnapshot(a, drumSnapshot(drumStore.sequences, undefined, drumStore.activeSequence, drumStore.isPlaying && drumStore.drumsOn, rigReports.queued.drum ?? rigArmed.drum))
      else if (a.id === 'chord') applySnapshot(a, chordSnapshot(chordStore.slots, chordStore.activeSlotIndex, chordStore.playingSlotIndex, chordStore.isPlaying, rigReports.queued.chord ?? rigArmed.chord))
      else if (a.id === 'seq') applySnapshot(a, seqSnapshot(seqStore.banks, seqStore.activeBankIndex, rigReports.seqPlaying, rigReports.queued.seq ?? rigArmed.seq))
      else if ((a.id === 'bass' || a.id === 'arp') && rowLane(a.id)) {
        const ls = laneStores[a.id]
        applySnapshot(a, seqSnapshot(ls.banks, ls.activeBankIndex, seqLanePlaying[a.id], seqLaneQueued[a.id] ?? rigArmed[a.id]))
      }
      else if (a.id === 'bass') applySnapshot(a, bassSnapshot(drumStore.basslineSequences, drumStore.basslineEnabled, drumStore.basslineSequence ?? drumStore.activeSequence, drumStore.isPlaying && drumStore.bassOn, rigReports.queued.bass ?? rigArmed.bass))
      else if (a.id === 'arp') { applySnapshot(a, arpSnapshot(arpStore.arpEnabled, arpStore.arpMode)); mirrorArp(a) }
      // Density: the panel's value and a MIDI-learned encoder both drive rigDensity (the one that moved wins).
      if (densityRow(a.id)) {
        if (a.density !== lastDensity[a.id]) rigDensity[a.id] = a.density
        else a.density = rigDensity[a.id]
        lastDensity[a.id] = a.density
      }
    }
    syncSection()
    songFrame()
  }
  const lastDensity = {}
  /** Bass / Arp row → its lane or back to the Drum Machine's bassline / the Arpeggiator: what played stops
   *  (the other side doesn't inherit a running part), the armed slot is dropped. */
  function setLaneRow(id, on) {
    if (rigLaneRows[id] === on) return
    if (live.value) for (const ev of stopEvents(id)) dispatchRig(ev)
    if (live.value && id === 'arp' && on) arpStore.arpEnabled = false
    if (live.value && id === 'bass' && on) dispatchRig({ name: 'dm-part', detail: { part: 'bass', on: false, sync: 0 } })
    rigArmed[id] = null
    rigLaneRows[id] = on
    // Arp: its knobs change meaning (lane: Density / Intensity; Arpeggiator: octave / rate) — the lane starts
    // as written and at full, the Arpeggiator's are read back from it
    const a = s.apps.find(x => x.id === id)
    if (id === 'arp' && a) {
      if (on) { a.density = 127; a.intensity = 127 }
      lastArp.density = null; lastArp.intensity = null
    }
    s.display = `${id === 'bass' ? 'Bass' : 'Arp'} row → ${on ? `Seq ${id === 'bass' ? 'Bass' : 'Arp'} lane` : id === 'bass' ? 'Drum Machine bassline' : 'Arpeggiator'}`
  }
  /** The rows whose Density thins the real app's steps: Drum, Seq, and Bass / Arp on their lanes. */
  const densityRow = id => DENSITY_APPS.includes(id) && (id === 'drum' || id === 'seq' || !!rowLane(id))
  /** The focused row's knobs: on the Arp row in LIVE (on the Arpeggiator), Density is its Octave and Intensity its Rate. */
  const arpKnobs = () => live.value && arpeggiatorRow(focused.value?.id)
  const knobLabel = k => (arpKnobs() && k[1] === 'density' ? 'Octave' : arpKnobs() && k[1] === 'intensity' ? 'Rate' : k[0])
  function knobValue(key) {
    const v = focused.value[key]
    if (arpKnobs() && key === 'density') { const o = arpOctaveOf(v); return o > 0 ? `+${o}` : `${o}` }
    if (arpKnobs() && key === 'intensity') return arpRateOf(v)
    return v
  }
  function knobTitle(key) {
    if (key !== 'density' && key !== 'intensity') return ''
    if (arpKnobs()) return `${key === 'density' ? "The Arpeggiator's octave range (−3…+3)" : "The Arpeggiator's rate"}. Right-click: MIDI Learn`
    if (key === 'density' && live.value && densityRow(focused.value.id)) return 'Density on the real app: 127 = as written, lower thins the weakest steps out. Right-click: MIDI Learn'
    return ''
  }
  /** Arp row (LIVE): Density = the Arpeggiator's octave range, Intensity = its rate. The control that
   *  moved writes the Arpeggiator; otherwise the row follows it (changed in its panel). */
  const lastArp = { density: null, intensity: null }
  function mirrorArp(a) {
    if (lastArp.density !== null && a.density !== lastArp.density) arpStore.arpOctave = arpOctaveOf(a.density)
    else if (arpOctaveOf(a.density) !== arpStore.arpOctave) a.density = arpOctaveValue(arpStore.arpOctave)
    if (lastArp.intensity !== null && a.intensity !== lastArp.intensity) arpStore.arpSubdivision = arpRateOf(a.intensity)
    else if (arpRateOf(a.intensity) !== arpStore.arpSubdivision) a.intensity = arpRateValue(arpStore.arpSubdivision)
    lastArp.density = a.density
    lastArp.intensity = a.intensity
  }
  let liveSection = null // LIVE: the section last launched (onSection / syncSection)
  // Session > Songs: the songs (saved per user) and the one playing (see songFrame)
  const songLib = songLibrary()
  watch(songLib, v => saveSongs(v), { deep: true })
  const songRun = sharedSongRun
  // the song the transport's Stop ended (its section): the next Play (Rig Controls, the Launchpad) goes on from there
  let songResume = null
  let songArmed = false // the first section starts with the grid (armed for Play, or nothing running): its first bar counts at once
  const { openMenu } = useMidiContextMenu()
  /** Right-click on a Density control (LIVE, Drum / Seq): MIDI Learn it, e.g. on a Worlde encoder. */
  function densityMenu(ev, a) {
    if (!live.value || !(DENSITY_APPS.includes(a.id))) return
    openMenu(ev, { name: `rig_density_${a.id}`, label: arpeggiatorRow(a.id) ? 'Rig: Arp Octave' : `Rig: ${a.label} Density` })
  }
  // Mute / Solo on the real apps (LIVE): their note-ons are dropped at the MIDI service —
  // the whole app, or only the cables picked in its scope (e.g. Chord → Live ch 2 only).
  // SIM, or the panel closed: nothing is muted.
  const muteScopes = reactive(loadMuteScopes())
  /** The devices a real app is cabled to (MIDI Flow), plus the ones in its scope no longer cabled. */
  function appCables(id) {
    const cabled = midiService.getCableTargets(liveAppSource(id))
    return [...new Set([...cabled, ...(muteScopes[id] ?? [])])]
  }
  function toggleScope(id, dev) {
    const cur = muteScopes[id] ?? []
    muteScopes[id] = cur.includes(dev) ? cur.filter(d => d !== dev) : [...cur, dev]
    saveMuteScopes({ ...muteScopes })
  }
  function clearScope(id) {
    muteScopes[id] = []
    saveMuteScopes({ ...muteScopes })
  }
  /**
   * The scopes in force: only the devices still cabled from the app. A scope left on a device no
   * longer cabled (an old "Live Drums") muted nothing at all; empty after that: the whole app.
   */
  function effectiveScopes() {
    const out = {}
    for (const [id, devs] of Object.entries(muteScopes)) {
      const cabled = midiService.getCableTargets(liveAppSource(id)).map(d => d.toLowerCase())
      out[id] = (devs ?? []).filter(d => cabled.includes(d.toLowerCase()))
    }
    return out
  }
  /** What a lane's Mute silences, for the display. */
  function muteWhat(id) {
    const sc = effectiveScopes()[id] ?? []
    return sc.length ? `only → ${sc.join(', ')} (its Mute scope)` : 'the whole lane'
  }
  watch(() => {
    if (!live.value) return '{"sources":[],"cables":[],"parts":{}}'
    void JSON.stringify(midiStore.routingMatrix) // the cables (the scopes in force follow them)
    return JSON.stringify(rigMutes(s.apps, effectiveScopes()))
  }, json => {
    const m = JSON.parse(json)
    rigParts.drumMuted = !!m.parts.drum
    rigParts.bassMuted = !!m.parts.bass
    midiService.setMutedSources(m.sources)
    midiService.setMutedCables(m.cables.map(([src, dev]) => cableMuteKey(src, dev)))
  }, { immediate: true })
  // Intensity × Global → each real app's CC 7 (volume) and/or note-on velocity, on the same scopes.
  const intensityModes = reactive(loadIntensityModes())
  function setIntensityMode(id, mode) {
    intensityModes[id] = mode
    saveIntensityModes({ ...intensityModes })
  }
  const intensityOpts = () => ({ bassChannel: drumStore.basslineMidiChannel })

  // ── Fade In (global Start) / Fade Out (global Stop), in bars (lib/rig-fades.ts) ──
  // A factor on each lane's Intensity (CC 7 or velocity, as its mode) and on the Global one (master),
  // plus the audio mixer's master. The Stop comes at the end of the next bar: the fade ends on it.
  const mixer = useAudioMixerStore()
  const LS_FADES = 'SYCORE_RIG_FADES'
  const fadeSettings = reactive((() => { try { return parseFades(JSON.parse(localStorage.getItem(LS_FADES) ?? 'null')) } catch { return defaultFades() } })())
  watch(fadeSettings, v => { try { localStorage.setItem(LS_FADES, JSON.stringify(v)) } catch {} }, { deep: true })
  const fade = reactive(Object.fromEntries(FADE_KEYS.map(k => [k, 1])))
  let fadeRamps = []
  let fadeTimer = null
  function setFade(k, v) {
    fade[k] = v
    if (k === 'master') mixer.setMasterFade(v)
  }
  function runFades() {
    const now = performance.now()
    for (const r of fadeRamps) setFade(r.key, rampAt(r, now))
    fadeRamps = fadeRamps.filter(r => now < r.t1)
    if (!fadeRamps.length) { clearInterval(fadeTimer); fadeTimer = null }
  }
  function startRamps(ramps) {
    const keys = new Set(ramps.map(r => r.key))
    fadeRamps = [...fadeRamps.filter(r => !keys.has(r.key)), ...ramps]
    runFades()
    if (fadeRamps.length && !fadeTimer) fadeTimer = setInterval(runFades, 40)
  }
  const barMsNow = () => 240000 / (s.clock.bpm > 0 ? s.clock.bpm : 120)
  /** The lane-level fades in use: Master (the audio mixer) and Drum (its own sounds); the MIDI lanes fade per channel. */
  const laneFadeSettings = () => Object.fromEntries(FADE_KEYS.map(k => [k, k === 'master' || k === 'drum' ? fadeSettings[k] : { in: 0, out: 0, max: 127 }]))
  function fadeIn() {
    chFadeIn()
    const { ramps, full } = planFadeIn(laneFadeSettings(), performance.now(), barMsNow())
    if (ramps.length) s.display = `Fade In: ${ramps.map(r => `${r.key === 'master' ? 'Master' : s.apps.find(a => a.id === r.key)?.label ?? r.key} → ${Math.round(r.to * 127)}`).join(', ')}`
    for (const { key, level } of full) { fadeRamps = fadeRamps.filter(r => r.key !== key); setFade(key, level) }
    startRamps(ramps)
  }
  function fadeOut(stopAt) {
    const b = nextBarLine(performance.now())
    startRamps(planFadeOut(laneFadeSettings(), performance.now(), stopAt, b?.barMs ?? barMsNow(), { ...fade }))
    chFadeOut(stopAt, b?.barMs ?? barMsNow())
  }

  // ── Per MIDI channel: each device + channel a lane reaches (cables, Multi-CH out), CC 7 straight to it ──
  const fadesOpen = ref(false)
  const LS_CH_FADES = 'SYCORE_RIG_CH_FADES'
  const chFadeSettings = reactive((() => { try { return parseChFades(JSON.parse(localStorage.getItem(LS_CH_FADES) ?? 'null')) } catch { return {} } })())
  watch(chFadeSettings, v => { try { localStorage.setItem(LS_CH_FADES, JSON.stringify(v)) } catch {} }, { deep: true })
  const chValue = reactive({}) // key → the CC 7 sent last
  let chRamps = []
  let chTimer = null
  const FADE_LANES = ['drum', 'chord', 'seq', 'bass', 'arp']
  /** The lanes' MIDI channels: { id, label, rows: [{ key, device, ch }] } (the Arp on the Arpeggiator: none). */
  const fadeLanes = computed(() => {
    void JSON.stringify(midiStore.routingMatrix); void JSON.stringify(midiStore.routingConfig?.registrations ?? {})
    return FADE_LANES.filter(id => isLiveRow(id) && !(id === 'arp' && !rowLane('arp'))).map(id => {
      const src = liveAppSource(id)
      const exact = rowLane(id) ? laneCh(id) >= 1 : id === 'bass'
      const ch0 = Math.max(0, appChannel(id) ?? 0)
      const rows = []
      for (const device of midiService.getCableTargets(src)) {
        for (const ch of midiService.appChannelsOn(src, device, ch0, exact)) {
          const key = chKey(device, ch)
          if (!rows.some(r => r.key === key)) rows.push({ key, device, ch })
        }
      }
      return { id, label: s.apps.find(a => a.id === id)?.label ?? id, rows }
    })
  })
  const allChKeys = () => fadeLanes.value.flatMap(l => l.rows.map(r => r.key))
  const NO_CH_FADE = Object.freeze({ in: 0, out: 0, max: 127 })
  /** A channel's fade (made when the modal shows it: not during the render). */
  const chFadeOf = key => chFadeSettings[key] ?? NO_CH_FADE
  // (the lanes are read only while the modal is open: appChannel & co. are set up further below)
  watch(() => fadesOpen.value && fadeLanes.value, lanes => {
    if (!lanes) return
    for (const l of lanes) for (const r of l.rows) if (!chFadeSettings[r.key]) chFadeSettings[r.key] = { in: 0, out: 0, max: 127 }
  })
  function sendCh(key, v) {
    if (chValue[key] === v) return
    chValue[key] = v
    const i = key.lastIndexOf('|')
    midiService.sendRawToDeviceByName(key.slice(0, i), [0xB0 | (Number(key.slice(i + 1)) & 0x0f), 7, v])
  }
  function runChRamps() {
    const now = performance.now()
    for (const r of chRamps) sendCh(r.key, chRampAt(r, now))
    chRamps = chRamps.filter(r => now < r.t1)
    if (!chRamps.length) { clearInterval(chTimer); chTimer = null }
  }
  function startChRamps(ramps) {
    const keys = new Set(ramps.map(r => r.key))
    chRamps = [...chRamps.filter(r => !keys.has(r.key)), ...ramps]
    runChRamps()
    if (chRamps.length && !chTimer) chTimer = setInterval(runChRamps, 40)
  }
  function chFadeIn() {
    // a song playing: its section's volume is where each of its channels goes (not the channel's Max)
    const song = songTargets()
    const eff = { ...chFadeSettings }
    for (const [k, v] of Object.entries(song)) eff[k] = { ...chFadeOf(k), max: v }
    const { ramps, set } = planChIn(eff, allChKeys(), performance.now(), barMsNow())
    for (const x of set) { chRamps = chRamps.filter(r => r.key !== x.key); sendCh(x.key, x.value) }
    // a channel left at 0 (Reset all volumes) without a Fade In: back to its Max, not silent
    const ramped = new Set([...ramps.map(r => r.key), ...set.map(x => x.key)])
    for (const k of allChKeys()) if (!ramped.has(k) && chValue[k] === 0 && !(k in song)) sendCh(k, chFadeSettings[k]?.max ?? 127)
    startChRamps(ramps)
  }
  /**
   * At the Play press (before a count-in): what will fade in is put at 0 now, so the start comes from
   * silence — the fade began only when the clock was seen running, after the first notes / audio.
   */
  function primeFades() {
    for (const k of allChKeys()) { const f = chFadeSettings[k]; if (f?.in > 0) { chRamps = chRamps.filter(r => r.key !== k); sendCh(k, 0) } }
    for (const k of ['master', 'drum']) if (fadeSettings[k].in > 0) { fadeRamps = fadeRamps.filter(r => r.key !== k); setFade(k, 0) }
  }
  /** RESET ALL VOLUMES: every lane channel's CC 7 to 0, the master / Drum to 0 — the state a Fade
   *  Out leaves, so the first Play fades in from silence (not from the levels the devices had). */
  function resetAllVolumes() {
    chRamps = []; clearInterval(chTimer); chTimer = null
    for (const k of allChKeys()) { delete chValue[k]; sendCh(k, 0) }
    fadeRamps = []; clearInterval(fadeTimer); fadeTimer = null
    setFade('master', 0); setFade('drum', 0)
    s.display = 'All volumes at 0: the Play fades them in (a channel without a Fade In comes back to its Max)'
  }
  function chFadeOut(stopAt, barMs) {
    startChRamps(planChOut(chFadeSettings, allChKeys(), performance.now(), stopAt, barMs, { ...chValue }))
  }
  onScopeDispose(() => { clearInterval(chTimer); chTimer = null })
  function resetFades() {
    fadeRamps = []
    clearInterval(fadeTimer); fadeTimer = null
    for (const k of FADE_KEYS) setFade(k, 1)
  }
  // The global Start: Fade In (from where the Fade Out left it: 0). The Stop leaves the levels where
  // the Fade Out took them — back to full, a pad's long release jumped (a glitch on some presets).
  watch(() => s.clock.running, (run, was) => { if (run && !was) fadeIn() })
  onScopeDispose(() => mixer.setMasterFade(1))
  /** The apps / Global intensity with their fades (what CC 7 and velocity send). */
  // (The MIDI lanes fade per channel — their Intensity and the Global one are not faded here.)
  const fadedApps = () => s.apps
  /** The row of a MidiSource (the first one sending with it). */
  const appOfSource = src => s.apps.find(a => isLiveRow(a.id) && liveAppSource(a.id) === src)?.id ?? ''
  const fadedGlobal = () => s.globalIntensity
  watch(() => {
    if (!live.value) return '{"sources":{},"cables":[],"parts":{}}'
    const sc = effectiveScopes()
    const v = rigVelocityScales(fadedApps(), fadedGlobal(), sc, intensityModes, intensityOpts())
    // A fade also scales the velocity of the lanes whose Intensity is CC 7: the Drum Machine's own
    // sounds (and any device that ignores CC 7) fade too.
    // the Drum row's fade: the Drum Machine's own sounds (their level)
    if (fade.drum < 1) v.parts.drum = (v.parts.drum ?? 1) * fade.drum
    return JSON.stringify(v)
  }, json => {
    const v = JSON.parse(json)
    rigParts.drumVelocity = v.parts.drum ?? 1
    rigParts.bassVelocity = v.parts.bass ?? 1
    midiService.setVelocityScales(v.sources, Object.fromEntries(v.cables.map(([src, dev, f]) => [cableMuteKey(src, dev), f])))
  }, { immediate: true })
  onScopeDispose(() => {
    midiService.setMutedSources([]); midiService.setMutedCables([]); midiService.setVelocityScales({})
    Object.assign(rigParts, { drumMuted: false, bassMuted: false, drumVelocity: 1, bassVelocity: 1 })
  })

  // CC 7: sent through the app's own routing (its cables' OUT channels, like its notes),
  // only when the value changes — opening the panel sends nothing. A CC 7 sent below 127
  // is put back to 127 when it stops applying (mode or scope changed, SIM, panel closed),
  // so a track is never left silent.
  const cc7Sent = new Map() // `${source}|${targets}` → { value, source, targets }
  let cc7Timer = null
  let cc7Pending = []
  // a Sequencer lane's own channel (1–16), or 0: the global one
  const laneCh = id => { const l = rowLane(id); return l === 'bass' || l === 'arp' ? laneStores[l].midiChannel : l === 'main' ? seqStore.midiChannel : 0 }
  const appChannel = id => (id === 'chord' ? chordStore.midiChannel : rowLane(id) ? (laneCh(id) >= 1 ? laneCh(id) : midiStore.midiChannel) : id === 'bass' ? drumStore.basslineMidiChannel : midiStore.midiChannel) - 1
  function sendCc7(source, targets, value, id) {
    // Bass on the Drum Machine: on the bassline's own channel, as its notes (rigCc7 sends Bass only when it has
    // one); a lane on a channel of its own: that channel as is, as its notes
    const exact = rowLane(id) ? laneCh(id) >= 1 : id === 'bass'
    const opts = { ...(targets.length ? { onlyTargets: targets } : {}), ...(exact ? { exactChannel: true } : {}) }
    midiService.sendCC(7, value, Math.max(0, appChannel(id) ?? 0), source, null, Object.keys(opts).length ? opts : undefined)
  }
  function flushCc7() {
    cc7Timer = null
    const now = new Set()
    for (const c of cc7Pending) {
      const key = `${c.id}|${c.source}|${c.targets.join(',')}`
      now.add(key)
      const prev = cc7Sent.get(key)
      if (prev?.value === c.value) continue
      if (!prev && c.value === 127) continue // never sent and at full: nothing to do
      cc7Sent.set(key, { value: c.value, source: c.source, targets: c.targets, id: c.id })
      sendCc7(c.source, c.targets, c.value, c.id)
    }
    for (const [key, prev] of cc7Sent) {
      if (now.has(key)) continue
      if (prev.value < 127) sendCc7(prev.source, prev.targets, 127, prev.id)
      cc7Sent.delete(key)
    }
  }
  watch(() => (live.value ? JSON.stringify(rigCc7(fadedApps(), fadedGlobal(), intensityModes, effectiveScopes(), intensityOpts())) : '[]'), json => {
    cc7Pending = JSON.parse(json)
    if (!cc7Timer) cc7Timer = uiTimeout(flushCc7, 20) // a knob turned with Live in front: not 1 s late
  })
  onScopeDispose(() => { cc7Timer?.(); cc7Pending = []; flushCc7() })

  // ── DJ Filter (Launchpad side, row 6): its CC (djFilter.cc, default 21) closes while held, opens on release (dj-filter.ts) ──
  // Sent on every real row's channel, through its own routing (as CC 7), once per source + channel.
  const djHeld = ref(false)
  let djStop = null
  let djTargets = []
  let djLast = DJ_FILTER_OPEN
  function djSend(value) {
    const cc = djFilterCc(djFilter.cc)
    for (const t of djTargets) midiService.sendCC(cc, value, t.ch, t.source, null, t.opts)
  }
  function djStart() {
    if (!live.value) { s.display = `DJ Filter: LIVE only (it sends CC ${djFilterCc(djFilter.cc)} to the real apps)`; return }
    if (djHeld.value) return
    const seen = new Set()
    djTargets = []
    for (const a of s.apps) {
      if (!isLiveRow(a.id)) continue
      const exact = rowLane(a.id) ? laneCh(a.id) >= 1 : a.id === 'bass' && drumStore.basslineMidiChannel >= 1
      const t = { source: liveAppSource(a.id), ch: Math.max(0, appChannel(a.id) ?? 0), opts: exact ? { exactChannel: true } : undefined }
      const key = `${t.source}|${t.ch}|${exact}`
      if (seen.has(key)) continue
      seen.add(key)
      djTargets.push(t)
    }
    djHeld.value = true
    djLast = DJ_FILTER_OPEN
    const t0 = performance.now()
    djStop = frameLoop(() => {
      const v = djCutoff(performance.now() - t0)
      if (v === djLast) return
      djLast = v
      djSend(v)
      s.display = `DJ Filter: CC ${djFilterCc(djFilter.cc)} = ${v}`
    })
  }
  function djEnd() {
    if (!djHeld.value) return
    djStop?.(); djStop = null
    djHeld.value = false
    if (djLast !== DJ_FILTER_OPEN) djSend(DJ_FILTER_OPEN)
    djLast = DJ_FILTER_OPEN
    s.display = 'DJ Filter: open'
  }
  onScopeDispose(djEnd)
  /** Readout for the Track options: the velocity scale now applied to a real app, and where. */
  function velocityReadout(a) {
    const f = (a.intensity / 127) * (s.globalIntensity / 127)
    const scope = muteScopes[a.id] ?? []
    const where = scope.length ? scope.map(d => `→ ${d}`).join(', ') : 'whole app'
    const mode = intensityMode(intensityModes, a.id)
    const parts = []
    const noCc7 = a.id === 'bass' && !rowLane('bass') && !(drumStore.basslineMidiChannel >= 1) // Bass on the Drum Machine: CC 7 needs the bassline's own channel
    if (mode !== 'velocity' && !noCc7) parts.push(`CC 7 = ${Math.round(a.intensity * s.globalIntensity / 127)}`)
    if (mode !== 'cc7' || noCc7) parts.push(`Velocity ×${f.toFixed(2)}`)
    return `${parts.join(' · ')} (Intensity ${a.intensity} · Global ${s.globalIntensity}) · ${where}`
  }
  // Every frame — and every 40 ms with SY.CORE's window hidden (Live in front): rAF alone stopped
  // there, and the rig acted on an old state (ui-clock.ts).
  let stopLiveLoop = null
  function liveLoop() { stopLiveLoop?.(); stopLiveLoop = frameLoop(syncLive) }
  const endLiveLoop = () => { stopLiveLoop?.(); stopLiveLoop = null }

  /** Following Live (or another external master) as the clock. */
  const followingLive = () => clockStore.source !== 'internal' && !clockStore.fallbackToInternal
  /** The transport is stopped: a pad arms its slot, Play starts it — Live's Play following Live, SY.CORE's
   *  Play on its own clock (with Live Play off there, the pads start their slots at once, as before). */
  const arming = () => followingLive() ? !externalGrid.active : rigFollowPlay.value && !transportManager.isRunning.value
  const playName = () => followingLive() ? "Live's Play" : 'Play'
  // Play (Live's or SY.CORE's): only the armed slots start (playAll skips the rig's apps — no
  // last progression starting on its own). Live's Stop: the real apps stop at once (Live's grid is
  // gone: no bar left to finish on), armed slots are kept and the slots that were playing are armed
  // (the next Play starts them again; a press on an armed pad disarms it).
  function startArmed() {
    if (!rigFollowPlay.value && !songRun.value?.waitPlay) { s.display = 'Live Play: nothing started (Live Play off)'; return }
    for (const id of activeSlotRows()) {
      const slot = rigArmed[id]
      if (slot === null) continue
      rigArmed[id] = null
      for (const ev of rowPadEvents(id, slot, null, 0)) dispatchRig(ev)
    }
  }
  rigTransport.onPlayAll = startArmed
  watch(live, v => { rigTransport.live = v }, { immediate: true })
  /** The slots playing now, by row (what a Stop keeps armed). */
  const playingSlots = () => Object.fromEntries(activeSlotRows().map(id => [id, s.apps.find(x => x.id === id)?.playing]))
  // A Stop from Rig Controls: the slots playing when it was pressed — by the time Live stops, the Drum
  // Machine may have ended (Stop@end) and the others stopped, so Live's Stop would find none playing.
  let stopArm = null
  const offLiveGrid = externalGrid.on(e => {
    if (!live.value || e.type !== 'stop') return
    armPlaying(stopArm ?? playingSlots()); stopArm = null
    for (const id of stopRows()) for (const ev of stopEvents(id)) dispatchRig(ev)
  })
  onScopeDispose(() => {
    offLiveGrid(); rigDensity.active = false; for (const id of SLOT_ROWS) rigArmed[id] = null
    rigTransport.live = false; if (rigTransport.onPlayAll === startArmed) rigTransport.onPlayAll = null
  })

  // ── Simulated clock (SIM: stands in for Live's MIDI clock) ────────────────
  let timer = null
  function restartTimer() {
    clearInterval(timer)
    timer = null
    if (!live.value && s.clock.running) timer = setInterval(() => tick(s), 60000 / s.clock.bpm / 4) // 16ths
  }
  // Stop at the end of the next bar (stop-gate.ts): at 3.2.4 the sequences play bar 4 to its end and
  // stop on 5.1.1 — every step from that bar line on stays silent (no accented last note), then `stop`
  // (Live's Stop, or SY.CORE's) comes on it. The Drum Machine's +Fill: its fill is the last bar.
  // Pressed again while waiting: stop now. No bar grid (nothing playing on one): now.
  const BAR_STOP_CLEAR_MS = 3000 // the gate outlives the stop a moment: Live's Stop comes back over the network
  let barStop = null
  /** The first bar line at or after `t` and the bar's length: Live's grid, the internal one, or Tone's transport. */
  function nextBarLine(t) {
    if (externalGrid.active && externalGrid.bpm > 0) {
      const sx = externalGrid.barAtOrAfter(t)
      const at = sx != null ? externalGrid.timeOf(sx) : null
      return at != null ? { t: at, barMs: 240000 / externalGrid.bpm } : null
    }
    const g = intGrid.barLineAtOrAfter(t)
    if (g) return g
    if (transportManager.isRunning.value) {
      const tr = getTransport()
      return { t: audioTimeToPerfMs(tr.nextSubdivision('1m')), barMs: tr.toSeconds('1m') * 1000 }
    }
    return null
  }
  function clearBarStop() {
    if (!barStop) return
    clearTimeout(barStop.timer); clearTimeout(barStop.clear)
    barStop = null
    stopGate.clear()
  }
  function stopAtBarEnd(stop) {
    if (barStop?.timer) { clearBarStop(); stop(); s.display = 'Stopped now'; return } // pressed again: now
    clearBarStop()
    stopArm = playingSlots()
    const now = performance.now()
    const at = endOfNextBar(now, nextBarLine)
    if (at == null) { stop(); return }
    stopGate.set(at)
    fadeOut(at) // Fade Out: ends on that bar line
    window.dispatchEvent(new CustomEvent('dm-end-fill')) // +Fill: the Drum Machine's fill on the last bar
    s.display = 'Stop at the end of the next bar — press again: now'
    barStop = {
      timer: setTimeout(() => {
        const b = barStop
        b.timer = null
        stop()
        if (barStop === b) b.clear = setTimeout(clearBarStop, BAR_STOP_CLEAR_MS) // (SY.CORE's stop clears it itself)
      }, Math.max(0, at - now)),
      clear: null,
    }
  }
  // a start (Live's Play, a new start on the grid) never waits behind an old Stop
  const offStopGateGrid = externalGrid.on(e => { if (e.type === 'start') clearBarStop() })
  onScopeDispose(() => { offStopGateGrid(); clearBarStop() })
  // Play with the sync panel's Count-in (lib/count-in.ts): the bars counted on screen first, then
  // `go` (Live's Play over SY.CORE Link, or the simulated clock). Pressed again while counting: off.
  function countedPlay(go) {
    if (cancelCountIn()) { s.display = 'Count-in cancelled'; return }
    primeFades()
    if (!startCountIn(syncStore.countInBars, s.clock.bpm, go)) go()
  }
  /** Play with no song running: the song open in Session (songLib.currentId) starts with it — from the
   *  section a Stop left it in, else from its first one when no slot is armed by hand. */
  function songForPlay() {
    if (!live.value || playOn.value || countIn.active || songRun.value) return null
    const song = currentSong()
    if (!song?.sections.length) return null
    const r = songResume
    songResume = null
    if (r && r.songId === song.id) return Math.min(r.index, song.sections.length - 1)
    return activeSlotRows().some(id => rigArmed[id] != null) ? null : 0
  }
  function togglePlay() {
    const from = songForPlay()
    if (from !== null) { playSong(from, { viaPlay: true }); return } // it arms the section's slots, then this Play
    transportToggle()
  }
  function transportToggle() {
    if (live.value) {
      if (s.clock.source === 'EXT') {
        // Live is the clock: Play / Stop Live itself (SY.CORE Link 1.5+); its transport report follows
        const on = !linkClient.transport.playing
        const send = () => {
          const sent = linkClient.sendPlay(on)
          if (!sent) stopArm = null
          s.display = sent ? `Live: ${on ? 'Play' : 'Stop'}` : 'Live is the clock master: Play / Stop from Live (SY.CORE Link 1.5+ plays it from here)'
        }
        if (countIn.active) { cancelCountIn(); s.display = 'Count-in cancelled'; return }
        if (on) { stopArm = null; clearBarStop(); countedPlay(send) } else stopAtBarEnd(send)
        return
      }
      if (s.clock.running) stopAtBarEnd(() => { const arm = stopArm; stopAll(); if (arm) armPlaying(arm); stopArm = null; clearBarStop() }); else { clearBarStop(); primeFades(); playAll() }
      return
    }
    if (s.clock.running) { stopClock(s); restartTimer() } else countedPlay(() => { startClock(s); restartTimer() })
  }
  watch(() => s.clock.bpm, () => { if (!live.value) restartTimer() })
  watch(mode, m => {
    localStorage.setItem(LS_MODE, m)
    endLiveLoop()
    Object.assign(s, createRigState())
    for (const id of SLOT_ROWS) rigArmed[id] = null
    liveSection = null
    songRun.value = null
    lastArp.density = lastArp.intensity = null
    // Density acts on the real apps in LIVE only; it starts from their current value (127 = as written).
    rigDensity.active = m === 'live'
    for (const a of s.apps) if (DENSITY_APPS.includes(a.id)) { if (m === 'live') a.density = rigDensity[a.id]; lastDensity[a.id] = a.density }
    restartTimer()
    if (m === 'live') { s.display = 'LIVE · Chord, Drum, Seq, Bass, Arp connected'; liveLoop() }
  }, { immediate: true })
  onScopeDispose(() => { clearInterval(timer); endLiveLoop() })

  /** LIVE: an action not connected to the apps yet. */
  const notConnected = what => { s.display = `${what}: not connected yet (SIM only)` }

  let taps = []
  // ── Tempo: TAP, − / + and the tempo knob ─────────────────────────────────
  // LIVE following Live over SY.CORE Link: Live's tempo (bridge 1.6+; SY.CORE follows its report);
  // LIVE on the internal clock: SY.CORE's tempo (whole BPM); a MIDI clock master: its own; SIM: the rig's.
  function setTempo(bpm) {
    const b = Math.round(Math.min(240, Math.max(40, bpm)) * 10) / 10
    if (!live.value) { s.clock.bpm = b; return `${b.toFixed(1)} BPM` }
    if (s.clock.source === 'EXT') {
      if (!clockStore.isLink) { s.display = 'Tempo: from the MIDI clock master'; return null }
      if (!linkClient.sendTempo(b)) { s.display = 'Tempo: Live\'s (SY.CORE Link 1.6+ sets it from here)'; return null }
      return `Live ${b.toFixed(1)} BPM`
    }
    midiStore.setGlobalBpm(b)
    return `${Math.round(b)} BPM`
  }
  function tap() {
    const now = performance.now()
    taps = taps.filter(t => now - t < 2500).concat(now)
    if (taps.length >= 2) {
      const avg = (taps.at(-1) - taps[0]) / (taps.length - 1)
      // whole BPM: a tapped tempo is never exact (124.3, 123.8…)
      const said = setTempo(Math.round(60000 / avg))
      if (said) s.display = `Tap · ${said}`
    }
  }
  /** Round: the tempo to the nearest whole BPM (after the knob, or a tempo set in Live). */
  function tempoRound() {
    const said = setTempo(Math.round(s.clock.bpm))
    if (said) s.display = `Tempo ${said}`
  }
  /** Tempo − / +: 1 BPM, with Shift 0.1. */
  function tempoStep(dir) {
    const said = setTempo(s.clock.bpm + dir * (s.shift ? 0.1 : 1))
    if (said) s.display = `Tempo ${said}`
  }
  // The tempo knob (MIDI Learn rig_tempo): relative — each step it moves is 0.5 BPM, so a knob
  // picked up anywhere never jumps the tempo.
  let tempoKnobLast = null
  function tempoKnob(value) {
    const prev = tempoKnobLast
    tempoKnobLast = value
    if (prev === null || value === prev) return
    const said = setTempo(s.clock.bpm + (value - prev) * 0.5)
    if (said) s.display = `Tempo ${said}`
  }
  // On the screen: drag the BPM up / down (mouse, touch), 0.1 BPM per 2 px.
  function tempoDrag(e) {
    if (e.button !== 0) return
    const el = e.currentTarget
    el.setPointerCapture?.(e.pointerId)
    const y0 = e.clientY
    const b0 = s.clock.bpm
    let raf = 0, pending = null
    const move = ev => {
      pending = b0 + Math.round((y0 - ev.clientY) / 2) / 10
      if (raf) return
      raf = requestAnimationFrame(() => { raf = 0; if (pending !== null) { const said = setTempo(pending); if (said) s.display = `Tempo ${said}` } })
    }
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up) }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  // ── Hold-to-confirm (Panic, INT) ──────────────────────────────────────────
  const HOLD_MS = 700
  const holding = reactive({})
  const holdTimers = {}
  function holdStart(key, fn) {
    holding[key] = true
    holdTimers[key] = setTimeout(() => { holding[key] = false; fn() }, HOLD_MS)
  }
  function holdEnd(key) {
    clearTimeout(holdTimers[key])
    if (holding[key]) s.display = 'Hold to confirm'
    holding[key] = false
  }
  // Panic: the song and every lane stop at once (no bar end, no fade), nothing armed or waiting, all notes off
  const doPanic = () => {
    songRun.value = null
    songResume = null
    panic(s)
    chordStore.latchStep = null
    uiStore.seqDecoupled = false
    if (!live.value) return
    cancelCountIn()
    clearBarStop()
    stopArm = null
    for (const id of Object.keys(rigWait)) cancelWait(id)
    for (const id of SLOT_ROWS) rigArmed[id] = null
    stopAll()
    midiStore.panic()
    s.display = 'PANIC · every lane stopped, All Notes Off'
  }
  const doInt = () => { if (live.value) return notConnected('EXT/INT (use Clock › Source in the transport)'); toggleClockSource(s) }

  // ── Actions shared by the three views ─────────────────────────────────────
  function onSlotDown(appId, slot) {
    focusApp.value = appId
    if (!live.value) return pressSlot(s, appId, slot)
    const a = s.apps.find(x => x.id === appId)
    if (!isLiveRow(appId)) return notConnected(a.label)
    // Arp on the Arpeggiator: the pad picks a mode and switches it on; the mode playing switches it off.
    if (arpeggiatorRow(appId)) {
      const p = arpPress(a.playing, slot)
      if (p.mode) arpStore.arpMode = p.mode
      arpStore.arpEnabled = p.enabled
      s.display = p.enabled ? `Arp ${SLOT_LABELS[slot]}: ${p.mode} on` : 'Arp off'
      return
    }
    // a lane's pad shows that lane in the Sequencer panel
    const lane = rowLane(appId)
    if (lane) seqActiveLane.value = lane
    // an empty slot plays too (silent): the user fills it — GEN (a lane queued on it: GEN writes there)
    const empty = !a.filled[slot]
    // Drum and Bass are the Drum Machine's two parts: each row turns its own on / off / to a sequence.
    const playing = a.playing
    const what = `${a.label} ${slotLabelOf(rigSlotName(a.id, slot), slot)}`
    // The transport stopped (Live's, or SY.CORE's own clock): the pad arms the slot (selected now); the
    // app starts from it on Play. The armed pad again: disarmed.
    if (arming() && playing === null) {
      rigArmed[appId] = armPress(rigArmed[appId], slot)
      if (rigArmed[appId] === null) { s.display = `${what}: not armed`; return }
      selectSlot(appId, slot)
      s.display = `${what} armed: starts on ${playName()}`
      return
    }
    // Latch with the track's Trigger sync: the playing slot stops, another switches, a stopped app starts.
    // On Live's grid the apps wait for the sync point themselves; on SY.CORE's own clock the Rig does
    // (rigWait): every app, either timing, on the song's lines from Play.
    if (endOfSlot(appId, slot, playing, what)) return
    const sync = liveSyncSteps(trigOf(a), gridRunning())
    if (sync > 0 && !externalGrid.active) { waitPad(appId, slot, sync, what); return }
    for (const ev of rowPadEvents(appId, slot, playing, sync)) dispatchRig(ev)
    s.display = `${what}${empty ? ' (empty — GEN fills it)' : ''} ${padWhen(appId, playing, slot, sync)}`
  }

  // ── Trigger sync on SY.CORE's own clock (no Live grid): the Rig waits for the sync point ──
  // The song position is SY.CORE's transport (bar 1 = its Play): a pad on "4 bars" pressed at bar 2
  // goes on bar 5, at bar 13 on bar 17 — for every app, whatever its timing (MIDI / AUDIO), as Live's
  // launch quantization. Waiting, the pad blinks; pressed again: called off; another pad: replaces.
  const rigWait = reactive({}) // appId → { slot, timer, at }

  // The Trigger sync in force: each lane's own, or one for all (Global); "Start only": the sync is
  // for a lane's start — a switch or a stop of a lane playing comes at the end of its slot.
  const LS_SYNC = 'SYCORE_RIG_SYNC'
  const syncSettings = reactive((() => {
    // (Start only is gone: a lane's start belongs to the session / song, later)
    const d = { scope: 'lane', global: '4', startOnly: false }
    try { return { ...d, ...JSON.parse(localStorage.getItem(LS_SYNC) ?? '{}'), startOnly: false } } catch { return d }
  })())
  watch(syncSettings, v => { try { localStorage.setItem(LS_SYNC, JSON.stringify(v)) } catch {} }, { deep: true })
  const trigOf = a => (syncSettings.scope === 'global' ? syncSettings.global : a.opts.triggerSync)
  // A session loaded (core/sessions.ts): its Trigger sync and Fades, read back from storage
  function reloadRigSettings() {
    const read = k => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') } catch { return null } }
    Object.assign(syncSettings, { scope: 'lane', global: '4', ...(read(LS_SYNC) ?? {}), startOnly: false })
    Object.assign(fadeSettings, parseFades(read(LS_FADES)))
    for (const k of Object.keys(chFadeSettings)) delete chFadeSettings[k]
    Object.assign(chFadeSettings, parseChFades(read(LS_CH_FADES)))
  }
  window.addEventListener(RIG_SETTINGS_EVENT, reloadRigSettings)
  onScopeDispose(() => window.removeEventListener(RIG_SETTINGS_EVENT, reloadRigSettings))
  /** Drum / Bass on the Drum Machine: a slot is one bar (its sequence), its end the next bar line. */
  const dmPartRow = id => (id === 'drum' || id === 'bass') && !rowLane(id)
  /** "Start only": a lane playing switches / stops at the end of its slot. True: done. */
  function endOfSlot(appId, slot, playing, what) {
    if (!syncSettings.startOnly || playing === null || !gridRunning()) return false
    if (dmPartRow(appId)) {
      if (externalGrid.active) for (const ev of rowPadEvents(appId, slot, playing, 16)) dispatchRig(ev)
      else waitPad(appId, slot, 16, what)
    } else {
      // Chord Prog: at the end of its progression · Sequencer lanes: at the end of the pattern (sync -1)
      for (const ev of rowPadEvents(appId, slot, playing, -1)) dispatchRig(ev)
      s.display = `${what}: at the end of the slot playing`
    }
    return true
  }
  /** The time (performance.now() ms) of the song's next line of `steps` sixteenths; now when just on one. */
  function songSyncTime(steps, now = performance.now()) {
    const tr = getTransport()
    if (transportManager.isRunning.value && tr.bpm.value > 0) {
      const ms16 = 60000 / (tr.bpm.value * 4)
      const cur = tr.ticks / (tr.PPQ / 4)
      const into = cur - Math.floor(cur / steps) * steps
      if (into * ms16 <= Math.min(80, ms16 * 0.5)) return now // a press a hair after the line: on it
      return now + (Math.ceil(cur / steps) * steps - cur) * ms16
    }
    // no transport: the bar grid of what plays (bars only)
    const b = intGrid.barLineAtOrAfter(now)
    return b ? b.t : now
  }
  const songBarOf = t => {
    const tr = getTransport()
    if (!transportManager.isRunning.value || !(tr.bpm.value > 0)) return null
    const cur16 = tr.ticks / (tr.PPQ / 4) + (t - performance.now()) / (60000 / (tr.bpm.value * 4))
    return Math.round(cur16 / 16) + 1
  }
  function cancelWait(appId) {
    const w = rigWait[appId]
    if (!w) return
    clearTimeout(w.timer)
    delete rigWait[appId]
  }
  /** restart (a song's clip starting): the lane playing (any slot) stops and starts `slot` from its start, on the line. */
  function waitPad(appId, slot, sync, what, restart = false) {
    if (rigWait[appId]?.slot === slot) { cancelWait(appId); s.display = `${what}: called off`; return }
    cancelWait(appId)
    const now = performance.now()
    const at = songSyncTime(sync, now)
    const fire = () => {
      delete rigWait[appId]
      const a = s.apps.find(x => x.id === appId)
      const playing = a?.playing ?? null
      if (restart && playing !== null) {
        for (const ev of rowPadEvents(appId, playing, playing, 0)) dispatchRig(ev)
        for (const ev of rowPadEvents(appId, slot, null, 0)) dispatchRig(ev)
        return
      }
      for (const ev of rowPadEvents(appId, slot, playing, 0)) dispatchRig(ev)
    }
    if (at - now < 1) { fire(); s.display = `${what} now`; return }
    // just after the line (+2 ms): an app joining SY.CORE's bar grid takes that line as its bar 1
    rigWait[appId] = { slot, at, timer: setTimeout(fire, at - now + 2) }
    const bar = songBarOf(at)
    const app = s.apps.find(x => x.id === appId)
    s.display = `${what} waits for ${bar ? `bar ${bar}` : 'the next bar'} (${app ? SYNC_SHORT[sync === 16 && syncSettings.startOnly && app.playing !== null ? '4' : trigOf(app)] ?? '' : ''})`
  }
  // a Stop / the transport stopping: nothing waits any more
  watch(() => transportManager.isRunning.value, run => { if (!run) for (const id of Object.keys(rigWait)) cancelWait(id) })
  onScopeDispose(() => { for (const id of Object.keys(rigWait)) cancelWait(id) })
  /** A pad's look with the Rig's own wait (SY.CORE's clock): blinking while it waits. */
  const padState = (a, i) => rigWait[a.id]?.slot === i ? 'queued' : slotState(a, i)
  /** Arming: Chord and the Sequencer's lanes select the slot now; Drum and Bass (on the Drum Machine) load theirs from the watcher below. */
  function selectSlot(id, slot) {
    if (id === 'chord' || rowLane(id)) dispatchRig(rowPadEvents(id, slot, null, 0)[0])
  }
  // Drum and Bass armed with the Drum Machine stopped (a pad with Live stopped, or the slots kept
  // armed at Live's Stop): the slot is loaded at once, as Chord and Seq — the drums' sequence and the
  // bassline's own (pinned to its armed slot: the drums' switch doesn't move it). Not armed: the
  // bassline follows the drums' sequence, as when stopped before. The start on Live's Play is
  // unchanged (each part from its armed slot). After the engine's reset at a stop (flush 'post').
  watch(() => [rigArmed.drum, rigArmed.bass, drumStore.isPlaying, live.value], ([drum, bass, playing, isLive]) => {
    if (!isLive || playing) return
    // Bass on its lane: its armed slot is the lane's bank (selected by selectSlot), not a bassline
    const onLane = !!rowLane('bass')
    const load = armedDrumLoads({ drum: drum ?? null, bass: onLane ? null : bass ?? null }, drumStore.activeSequence)
    if (!onLane && drumStore.basslineSequence !== load.bassline) drumStore.basslineSequence = load.bassline
    if (load.drums) dispatchRig({ name: 'dm-seq-switch', detail: { seq: load.drums, sync: 0 } })
  }, { flush: 'post' })
  /** The rows whose GEN is connected in LIVE (Arp: on its lane); Mutate (Shift): the Sequencer's lanes. */
  const GEN_ROWS = ['drum', 'chord', 'seq', 'bass', 'arp']
  const genOn = (id, mut) => GEN_ROWS.includes(id) && (id !== 'arp' || !!rowLane('arp')) && (!mut || !!rowLane(id))
  function onSlotUp(appId, slot) { if (!live.value) releaseSlot(s, appId, slot) }
  // Generates done per row (any source: panel, controller, Rig device): the devices flash GEN on each.
  const genCount = reactive({})
  /** The key the Sequencer's GEN writes in: the Chord Prog's exact one (Major / Minor), else — Modal
   *  Chords, a genre file, Both — the mode its chords sit in (detectScale; Modal Chords' Root as tonic). */
  function cpGenKey() {
    const k = chordStore.detectedKey
    return k ? { detail: progressionKeyDetail(k), label: k.label } : null
  }
  function onGenerate(appId, mutate = false) {
    focusApp.value = appId
    if (!live.value) { genCount[appId] = (genCount[appId] ?? 0) + 1; return generate(s, appId, mutate || s.shift) }
    // LIVE: Mutate (Shift + GEN) is connected for the Sequencer (a part of its pattern: Lock / Vary)
    const mut = mutate || s.shift
    if (!genOn(appId, mut)) return notConnected(`${s.apps.find(x => x.id === appId).label} ${mut ? 'Mutate' : 'Generate'}`)
    genCount[appId] = (genCount[appId] ?? 0) + 1
    if (rowLane(appId) && appId !== 'seq') {
      // Bass / Arp lanes: as the Seq row, in the Chord Prog's key (or its mode, detected)
      const k = cpGenKey()
      dispatchRig({ name: laneEvent(rowLane(appId), 'generate'), detail: { ...(k ? k.detail : {}), ...(mut ? { mutate: true } : {}) } })
      s.display = `${SEQ_LANE_CFG[rowLane(appId)].label}: ${mut ? 'Mutate' : 'Generate'} ${k ? `in ${k.label}` : '(its own key)'}`
      return
    }
    if (appId === 'bass') {
      // A new bassline in the Drum Machine's active sequence, on the Chord Prog's tonic (exact key or detected mode).
      const root = cpGenKey()?.detail.root ?? null
      dispatchRig({ name: 'dm-generate-bass', detail: root !== null ? { root } : {} })
      s.display = `Bass: Generate ${root !== null ? `on ${KEY_NAMES[root]}` : '(its root note)'}`
      return
    }
    if (appId === 'seq') {
      // A new sequence, in the Chord Prog's key (or its mode, detected), else in its own.
      const k = cpGenKey()
      dispatchRig({ name: 'seq-generate', detail: { ...(k ? k.detail : {}), ...(mut ? { mutate: true } : {}) } })
      s.display = `Seq: ${mut ? 'Mutate' : 'Generate'} ${k ? `in ${k.label}` : '(its own key)'}`
      return
    }
    if (appId === 'chord') {
      // A new progression in the active slot (AI or built-in, per the rig's Generate mode).
      dispatchRig({ name: 'cp-generate', detail: { mode: s.generateMode } })
      s.display = `Chord: Generate (${s.generateMode === 'ai' ? 'AI — built-in if not configured' : 'built-in'})`
      return
    }
    dispatchRig({ name: 'dm-generate' })
    s.display = 'Drum: Generate (current style)'
  }
  /** A row's Fill button (rig layout; Mutate stays on Shift + Generate): the Drum Machine's Fill in LIVE. */
  function onRowFill(appId) {
    focusApp.value = appId
    if (live.value && appId !== 'drum') return notConnected(`${s.apps.find(x => x.id === appId).label} Fill (Drum Machine only)`)
    onFill()
  }
  function onFill() {
    if (live.value) { dispatchRig({ name: 'dm-trigger-fill' }); s.display = drumStore.fillWhen === 'bar' && drumStore.isPlaying ? 'Drum: Fill on the next bar' : 'Drum: Fill'; return }
    s.fill = true; s.display = `Fill ${s.clock.running ? 'on the next bar' : 'armed'}`
  }
  /**
   * A section (LIVE), like a scene in Session View: every connected app with that slot filled goes to
   * it as with its pad — on its track's Trigger sync, a stopped app starts; following Live while it
   * is stopped, the slots are armed and start on Live's Play. An app already on that slot is left as
   * it is (a section never stops anything). Drum and Bass each go to it as their own part; Arp is left out.
   */
  function onSection(i) {
    if (!live.value) return selectSection(s, i)
    const apps = s.apps.filter(a => isSlotRow(a.id) && a.filled[i])
    if (!apps.length) { s.display = `Section ${i + 1}: no app has slot ${SLOT_LABELS[i]}`; return }
    const armed = arming()
    for (const a of apps) {
      if (armed) {
        if (a.playing !== null) continue
        rigArmed[a.id] = i
        selectSlot(a.id, i)
      } else if (a.playing !== i) {
        if (endOfSlot(a.id, i, a.playing, `${a.label} ${SLOT_LABELS[i]}`)) continue
        const sync = liveSyncSteps(trigOf(a), gridRunning())
        if (sync > 0 && !externalGrid.active) waitPad(a.id, i, sync, `${a.label} ${SLOT_LABELS[i]}`)
        else for (const ev of rowPadEvents(a.id, i, a.playing, sync)) dispatchRig(ev)
      }
    }
    liveSection = i
    s.display = `Section ${i + 1} → ${apps.map(a => a.label).join(', ')} ${SLOT_LABELS[i]}${armed ? `: armed, starts on ${playName()}` : gridRunning() ? ' on their Trigger sync' : ' now'}`
  }
  /** LIVE: the section shown — lit while its apps play it, blinking while one is still queued or armed;
   *  dropped when none of them is on it any more (or one moved to another slot). */
  function syncSection() {
    const i = liveSection
    const apps = i === null ? [] : s.apps.filter(a => isSlotRow(a.id) && a.filled[i])
    const waiting = apps.some(a => a.queued === i)
    const on = apps.some(a => a.playing === i) || waiting
    const left = apps.some(a => a.playing !== null && a.playing !== i && a.queued !== i)
    if (!on || left) liveSection = null
    s.section = liveSection !== null && !waiting ? liveSection : null
    s.queuedSection = liveSection !== null && waiting ? liveSection : null
  }
  // Repeat (hold): LIVE = the Drum Machine's Repeat (each step of the drums rolled ÷2 / ÷3 / ÷4, its
  // panel's division) while held; back as it was on release (on if it was on in the panel).
  let repeatWasOn = false
  function repeaterOn() {
    if (s.repeater) return
    s.repeater = true
    if (live.value) {
      repeatWasOn = drumStore.repeaterActive
      drumStore.repeaterActive = true
      s.display = `Drum: Repeat ÷${drumStore.repeaterDivision} (hold)`
      return
    }
    s.display = 'Repeater (hold)'
  }
  function repeaterOff() {
    if (!s.repeater) return
    s.repeater = false
    if (live.value) drumStore.repeaterActive = repeatWasOn
    s.display = 'Repeater off'
  }
  // Seq Free (the Latch pad before): the Sequencer decoupled from the Chord Prog for now — its chords no
  // longer move, start, stop or switch the bank of the Sequencer; off = it follows the held chord again.
  function toggleSeqFree() {
    uiStore.seqDecoupled = !uiStore.seqDecoupled
    s.display = uiStore.seqDecoupled ? 'Seq Free: the Sequencer plays on its own' : 'Seq Free off: the Sequencer follows the Chord Prog'
  }
  function toggleShift() { s.shift = !s.shift }
  /** A bar grid to sync a pad to: Live's, SY.CORE's transport running, or a sequence playing on SY.CORE's own grid. */
  const gridRunning = () => externalGrid.active || transportManager.isRunning.value || intGrid.barLineAtOrAfter(performance.now()) != null
  /** Mute / unmute a lane (Shift + its side button). Muting also ends its notes sounding (a chord held
   *  for bars would go on to its note-off: the Mute drops new notes only). */
  function muteLane(id) {
    toggleMute(s, id)
    const a = s.apps.find(x => x.id === id)
    // (the notes it holds end at the Mute and sound again at the unmute: midiService.setMutedSources —
    // the Chord's voices are not cut, or the unmute would find its latched chord gone)
    if (live.value && a?.muted) {
      s.display = `${a.label} muted: ${muteWhat(id)}`
    }
  }
  function toggleGenMode() { s.generateMode = s.generateMode === 'ai' ? 'builtin' : 'ai'; s.display = `Generate: ${s.generateMode === 'ai' ? 'AI' : 'built-in'}` }
  const focused = computed(() => s.apps.find(a => a.id === focusApp.value))
  /** The app the knobs act on (Rig Controls' app buttons). */
  function setFocus(id) { focusApp.value = id; s.display = `Knobs → ${focused.value?.label ?? id}` }
  const anySolo = computed(() => s.apps.some(a => a.solo))

  /** Cycle the focused track's Trigger sync (Launchpad top button "Sync"). */
  function cycleSync() {
    const global = syncSettings.scope === 'global'
    const cur = global ? syncSettings.global : focused.value.opts.triggerSync
    const next = TRIGGER_SYNC_OPTIONS[(TRIGGER_SYNC_OPTIONS.findIndex(o => o.value === cur) + 1) % TRIGGER_SYNC_OPTIONS.length].value
    if (global) syncSettings.global = next
    else setTrackOption(s, focused.value.id, 'triggerSync', next)
    const o = TRIGGER_SYNC_OPTIONS.find(x => x.value === next)
    s.display = `${global ? 'All lanes' : focused.value.label} Trigger sync: ${o?.label ?? next}${next === 'off' ? ' (starts at once)' : ''}`
  }

  // ── Rig actions from any MIDI-learned controller (rig-actions.ts) ─────────
  // useMidiCCListener sends a mapped control as 'rig-action'; the panel acts on it while open.
  function onRigAction(e) {
    const { action: a, value } = e.detail ?? {}
    if (!a) return
    const app = a.app ? s.apps.find(x => x.id === a.app) : null
    switch (a.kind) {
      case 'slot': onSlotDown(a.app, a.slot); onSlotUp(a.app, a.slot); return
      case 'gen': return onGenerate(a.app)
      case 'mute': return muteLane(a.app)
      case 'solo': return toggleSolo(s, a.app)
      case 'sync':
        focusApp.value = a.app
        cycleSync() // (it says the new value; with Global: every lane's)
        return
      case 'fill': return onFill()
      case 'seq_free': return toggleSeqFree()
      case 'chain': return toggleChain(a.app)
      case 'play': return togglePlay()
      case 'section': return onSection(a.index)
      case 'key_down': return onKeyShift(-1)
      case 'key_up': return onKeyShift(1)
      case 'key_mode': return onKeyMode()
      case 'intensity': if (app) app.intensity = value; return
      case 'density': if (app) app.density = value; return // Arp: octave (Drum / Seq go to rigDensity directly)
      case 'global': s.globalIntensity = value; return
      case 'tap': return tap()
      case 'tempo_down': return tempoStep(-1)
      case 'tempo_up': return tempoStep(1)
      case 'tempo_round': return tempoRound()
      case 'tempo': return tempoKnob(value)
    }
  }
  window.addEventListener('rig-action', onRigAction)
  onScopeDispose(() => window.removeEventListener('rig-action', onRigAction))

  // ── SY.CORE Rig device in Live (through SY.CORE Link): the grid's state out, its clicks in ──
  const rigLinkState = () => ({
    // the device's rows in its order (Chord, Drum, Seq, Bass, Arp), whatever the Rig's row order
    rows: RIG_LINK_ORDER.map(id => s.apps.find(a => a.id === id)).map(a => ({
      filled: a.filled.reduce((m, f, i) => (f ? m | (1 << i) : m), 0),
      playing: a.playing ?? -1, queued: a.queued ?? -1, muted: !!a.muted, solo: !!a.solo, gen: genCount[a.id] ?? 0,
    })),
    section: s.section ?? -1,
    queuedSection: s.queuedSection ?? -1,
    fill: live.value ? rigReports.fill : s.fill,
    chord: chordStore.isPlaying ? rigChord(
      { name: chordStore.playingChordName, duration: chordStore.playingChordDuration, ms: chordStore.playingChordMs, bars: chordStore.playingChordBars, seq: chordStore.playingChordSeq },
      chordStore.nextChord,
      chordQueuedSlot(),
      DURATION_LABELS,
    ) : null,
    // the Launchpad layout as on screen (top 8, pads 8×8 by rows, side 8): the device draws it as is
    lp: rigLinkLaunchpad({
      top: lpTop.value.map(t => ({ label: t.label, color: t.color })),
      pads: Array.from({ length: 64 }, (_, i) => { const p = lpPad(Math.floor(i / 8), i % 8); return { label: p.short, color: p.color } }),
      side: Array.from({ length: 8 }, (_, i) => { const p = lpSide(i); return { label: p.short, color: p.color } }),
    }),
  })
  // The Chord slot that takes over at the end of the one playing (Trigger sync / armed), if another.
  function chordQueuedSlot() {
    const q = rigReports.queued.chord ?? rigArmed.chord
    return q !== null && q !== undefined && q !== chordStore.playingSlotIndex ? chordStore.slots[q] ?? null : null
  }

  /** Right-click on a rig control: MIDI Learn it (any controller). The learned ones get an amber ring. */
  const mappingStore = useMappingStore()
  function learnMenu(ev, name, label) {
    ev.preventDefault()
    openMenu(ev, { name, label: `Rig: ${label}` })
  }
  const learnedRing = name => (mappingStore.mappedParams.has(name) ? 'ring-1 ring-amber-500/70' : '')

  // LED feedback to MIDI-learned rig controls: the same note / CC sent back to the controller, with
  // the controller's palette (rig-actions.ts: Launchpad MK1 colours, else lit 127 / dark 0) — slots
  // filled / playing / blinking while queued or armed; Mute / Solo while on. Only changes are sent;
  // all dark when the panel closes.
  // Applied templates' LED palette and init SysEx are kept per MIDI port.
  const LS_RIG_TPL = 'S1_RIG_TEMPLATE_LEDS'
  const tplLeds = reactive((() => { try { return JSON.parse(localStorage.getItem(LS_RIG_TPL) || '{}') } catch { return {} } })())
  const ledBlink = ref(false)
  const stopBlink = createWorkerTicker(() => { ledBlink.value = !ledBlink.value }, 300) // not throttled while hidden
  const ledSent = new Map()
  function sendRigLed(m, val) {
    const out = m.device ? midiService.getOutputs().find(o => o.name === m.device) : null
    if (!out) return
    const ch = (m.channel ?? 0) & 0x0f
    try {
      if ('cc' in m) out.send([0xB0 | ch, m.cc, val])
      else if ('note' in m) out.send([0x90 | ch, m.note, val])
    } catch {}
  }
  function rigLeds(off = false) {
    const apps = s.apps.map(a => ({ id: a.id, playing: a.playing, queued: a.queued, muted: a.muted, solo: a.solo, filled: a.filled }))
    for (const [key, m] of Object.entries(mappingStore.midiMappings)) {
      if (typeof m !== 'object' || !m.paramName?.startsWith('rig_')) continue
      const st = off ? 'off' : rigLedState(m.paramName, apps, ledBlink.value)
      if (st === null) continue
      const val = { ...ledPaletteFor(m.device), ...(tplLeds[m.device]?.palette ?? {}) }[st]
      if (ledSent.get(key) === val) continue
      ledSent.set(key, val)
      sendRigLed(m, val)
    }
  }
  watch(() => [ledBlink.value, mappingStore.midiMappings, ...s.apps.map(a => `${a.playing}/${a.queued}/${a.muted}/${a.solo}/${a.filled.join('')}`)], () => rigLeds(), { deep: true })
  onScopeDispose(() => { stopBlink(); ledSent.clear(); rigLeds(true) })

  // ── Controller templates (rig-template.ts): a controller's rig mappings as a JSON file ──
  const saveTplLeds = () => { try { localStorage.setItem(LS_RIG_TPL, JSON.stringify(tplLeds)) } catch {} }
  const tplDevice = ref('')
  const tplMsg = ref('')
  const tplFile = ref(null)
  const inputNames = ref([])
  const refreshInputs = () => { inputNames.value = midiService.getInputs().map(i => i.name).filter(Boolean) }
  const mappedDevices = computed(() => rigMappedDevices(mappingStore.midiMappings))
  /** The ports to pick from: connected inputs, plus the ones with rig controls learned. */
  const tplDevices = computed(() => [...new Set([...inputNames.value, ...mappedDevices.value.map(d => d.device)])])
  const tplCount = computed(() => mappedDevices.value.find(d => d.device === tplDevice.value)?.count ?? 0)
  function sendInit(device, init) {
    const out = midiService.getOutputs().find(o => o.name === device)
    if (!out) return
    for (const hex of init ?? []) { const b = sysexBytes(hex); if (b) try { out.send(b) } catch {} }
  }
  // Controllers that need their init (e.g. a programmer mode) get it again when the panel opens.
  for (const [dev, t] of Object.entries(tplLeds)) sendInit(dev, t.init)
  refreshInputs()
  tplDevice.value = mappedDevices.value[0]?.device ?? inputNames.value[0] ?? ''

  function exportTemplate() {
    const dev = tplDevice.value
    if (!dev || !tplCount.value) { tplMsg.value = 'No rig controls learned on this controller yet'; return }
    const kept = tplLeds[dev]
    const t = exportRigTemplate(mappingStore.midiMappings, dev, dev, {
      ...(kept?.init?.length ? { init: kept.init } : {}),
      ...(kept?.palette ? { leds: { palette: kept.palette } } : {}),
    })
    const url = URL.createObjectURL(new Blob([JSON.stringify(t, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = templateFileName(t)
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    tplMsg.value = `Exported ${Object.keys(t.controls).length} controls`
  }
  async function importTemplate(ev) {
    const file = ev.target.files?.[0]
    ev.target.value = ''
    if (!file) return
    const res = parseRigTemplate(await file.text())
    if ('error' in res) { tplMsg.value = res.error; return }
    const { template: t, warnings } = res
    refreshInputs()
    // The port named by the template (connected), else the one picked here.
    const dev = inputNames.value.find(n => templateMatches(t, n)) ?? tplDevice.value
    if (!dev) { tplMsg.value = `Connect the controller${t.match ? ` (${t.match})` : ''} or pick a port`; return }
    const existing = mappedDevices.value.find(d => d.device === dev)?.count ?? 0
    if (existing && !window.confirm(`Replace the ${existing} rig controls learned on ${dev} with "${t.name}"?`)) return
    mappingStore.midiMappings = applyRigTemplate(mappingStore.midiMappings, t, dev)
    mappingStore.saveMidiMappings()
    tplLeds[dev] = { name: t.name, palette: t.leds?.palette ?? null, init: t.init ?? [] }
    saveTplLeds()
    sendInit(dev, t.init)
    tplDevice.value = dev
    ledSent.clear()
    rigLeds()
    tplMsg.value = `"${t.name}" → ${dev}: ${Object.keys(t.controls).length} controls${warnings.length ? ` · ${warnings.length} skipped: ${warnings.join('; ')}` : ''}`
  }
  function clearTemplate() {
    const dev = tplDevice.value
    if (!dev || !tplCount.value) return
    if (!window.confirm(`Forget the ${tplCount.value} rig controls learned on ${dev}?`)) return
    rigLeds(true)
    mappingStore.midiMappings = clearRigMappings(mappingStore.midiMappings, dev)
    mappingStore.saveMidiMappings()
    delete tplLeds[dev]
    saveTplLeds()
    ledSent.clear()
    tplMsg.value = `Rig controls of ${dev} forgotten`
  }
  const isRigApp = id => RIG_ACTION_APPS.includes(id)

  // Track options: labels and short badges for each row
  const OPTION_GROUPS = [
    { key: 'press', title: 'Press', options: PRESS_OPTIONS },
    { key: 'motion', title: 'Motion', options: MOTION_OPTIONS },
    { key: 'triggerSync', title: 'Trigger sync', options: TRIGGER_SYNC_OPTIONS },
    { key: 'positionSync', title: 'Position sync', options: POSITION_SYNC_OPTIONS },
  ]
  const optLabel = (group, value) => OPTION_GROUPS.find(g => g.key === group).options.find(o => o.value === value)?.label ?? value
  const optHint = (group, value) => OPTION_GROUPS.find(g => g.key === group).options.find(o => o.value === value)?.hint ?? ''
  const PRESS_SHORT = { retrigger: 'RTRG', holdStop: 'HOLD', holdMotion: 'H+MO', latch: 'LTCH' }
  const MOTION_SHORT = { stay: 'STAY', oneShot: '1SHOT', marchWrap: 'MRCH↺', marchStay: 'MRCH→', marchStop: 'MRCH■', random: 'RND', exclusiveRandom: 'XRND' }
  const SYNC_SHORT = { off: 'OFF', '1/4': '¼', '1/2': '½', '1': '1b', '2': '2b', '4': 'BAR', '8': '2BAR', '16': '4BAR', auto: 'AUTO', queue: 'QUEUE', tolerant: 'TOL' }
  const rowBadge = a => `${PRESS_SHORT[a.opts.press]} · ${MOTION_SHORT[a.opts.motion]} · ${SYNC_SHORT[trigOf(a)]}${syncSettings.scope === 'global' ? '*' : ''}`
  const queueOrder = (a, i) => { const k = a.queue.indexOf(i); return k === -1 ? null : k + 1 }
  const sectionHasContent = i => s.apps.some(a => a.filled[i])
  const lanePageOffset = computed(() => (s.shift ? 8 : 0))
  /** The Launchpad's row 6 (Performance pads). */
  const LP_PERF_LABELS = ['Fill', 'Auto', 'Now/Bar', 'Repeat', 'Seq Free', 'Drum Chain', 'Chord Chain', 'Seq Chain']
  // Row 6, pads 6–8: the apps' Chain mode (dark red off · red blinking on), taken at the end of the bar /
  // slot / pattern playing (on: the chain from its start; off: what was playing, looped).
  const CHAIN_PADS = { 5: 'drum', 6: 'chord', 7: 'seq' }
  const CHAIN_SHORT = { drum: 'D·CHN', chord: 'C·CHN', seq: 'S·CHN' }
  const CHAIN_NAME = { drum: 'Drum', chord: 'Chord', seq: 'Seq' }
  // Seq Chain: every lane of the Sequencer with a chain set (Main · Bass · Arp, each its own chain) —
  // it was Main's only, so with Bass / Arp shown the panel never showed it on. None set: Main.
  const seqLaneStores = () => SEQ_LANES.map(l => useSeqLaneStore(l))
  const laneHasChain = (st) => st.chain.some(i => i !== null && i >= 0)
  function chainOn(id) {
    return id === 'drum' ? drumStore.chainEnabled : id === 'chord' ? chordStore.chainEnabled : seqLaneStores().some(st => st.chainEnabled)
  }
  function chainEmpty(id) {
    return id === 'drum' ? !useDrumMachineEngine().chain.value.some(Boolean)
      : id === 'chord' ? !chordStore.chain.some(i => i >= 0)
      : !seqLaneStores().some(laneHasChain)
  }
  function toggleChain(id) {
    const on = !chainOn(id)
    if (id === 'drum') drumStore.chainEnabled = on
    else if (id === 'chord') chordStore.chainEnabled = on
    else {
      const all = seqLaneStores()
      const withChain = all.filter(laneHasChain)
      if (!on) all.forEach(st => st.setChainEnabled(false))
      else (withChain.length ? withChain : [seqStore]).forEach(st => st.setChainEnabled(true))
    }
    const when = id === 'drum' ? 'next bar' : id === 'chord' ? 'end of the slot' : 'end of the pattern'
    s.display = `${CHAIN_NAME[id]} Chain ${on ? 'on' : 'off'}${chainEmpty(id) ? ' (no chain set: set it in its panel)' : ` — from the ${when}`}`
  }

  // ── Session > Songs (lib/songs.ts): the song's sections, every lane on the bar line ──
  // The next section is launched during the last bar of the one playing (each lane to its slot, or
  // stopped), on the bar: Live's grid waits itself, SY.CORE's clock through the Rig's wait (waitPad).
  // The bar lines are counted from the grid every frame; the grid stopping ends the song.
  const songOf = r => (r ? songLib.songs.find(x => x.id === r.songId) : null)
  let songLine = null // the next bar line seen (performance.now() ms)
  const songFilled = computed(() => Object.fromEntries(SONG_LANES.map(l => [l, s.apps.find(a => a.id === l)?.filled ?? []])))
  const songLanesOn = computed(() => Object.fromEntries(SONG_LANES.map(l => [l, isSlotRow(l)])))
  const songChains = computed(() => ['drum', 'chord', 'seq'].filter(chainOn).map(id => CHAIN_NAME[id]))
  /** Every lane to its slot in `lanes` (null: stopped) on the next bar line; stopped transport: armed. */
  /** restart: the lanes whose clip starts (from the pattern's start, even on the slot playing);
   *  partial: only the lanes listed in `lanes` (a clip starting / ending inside a section). */
  function launchLanes(lanes, restart = [], partial = false, forceArm = false) {
    const armed = forceArm || arming()
    const running = gridRunning()
    for (const id of activeSlotRows()) {
      const a = s.apps.find(x => x.id === id)
      if (!a || (partial && !(id in lanes))) continue
      const target = lanes[id] ?? null
      cancelWait(id)
      if (armed) {
        rigArmed[id] = target
        if (target !== null) selectSlot(id, target)
        continue
      }
      const from = target === null ? a.playing : target // stop: a press on the slot playing
      const again = target !== null && a.playing !== null && restart.includes(id) && running && !externalGrid.active
      // already on its slot: nothing (a press on it would stop it) — unless its clip starts again
      if (from === null || (target !== null && a.playing === target && !again)) continue
      if (running && !externalGrid.active) waitPad(id, from, 16, `${a.label} ${SLOT_LABELS[from]}`, again)
      else for (const ev of rowPadEvents(id, from, a.playing, running ? 16 : 0)) dispatchRig(ev)
    }
  }
  /** The CC 7 per channel of the song's section playing (or launched next): {} with no song / volumes. */
  function songTargets() {
    const r = songRun.value
    const song = songOf(r)
    const sec = song?.sections[r.queued ?? r.index]
    return sec ? sectionVolTargets(song, sec, k => chFadeOf(k).max) : {}
  }
  /** The section's volumes: from its first bar line (the next one; none running: now), over its volBars. */
  function songVolumes(sec, now = false) {
    const targets = songTargets()
    if (!sec || !Object.keys(targets).length) return
    const b = !now && gridRunning() ? nextBarLine(performance.now()) : null
    startChRamps(sectionVolRamps(targets, { ...chValue }, b ? b.t : performance.now(), b?.barMs ?? barMsNow(), b ? sec.volBars : 0))
  }
  /** The Chord lane's step count of a section: on its bar line (or now, nothing running). Silent: unchanged. */
  function songChordSteps(sec, now = false) {
    if (!sec || sec.lanes.chord === null) return
    // 1 chord: the Latch on chord 1 (it holds), not a loop of one
    const latch = sec.chordSteps === 1
    const next = { v: latch ? null : sec.chordSteps ?? null, latch }
    if (!chordStore.isPlaying || !now) { chordStore.stepLimitNext = next; return } // stopped: taken at its start
    chordStore.stepLimitNext = null
    chordStore.stepLimit = next.v
    if (latch) { chordStore.latchStep = 0; chordStore.songLatch = true }
    else if (chordStore.songLatch) { if (chordStore.latchStep === 0) chordStore.latchStep = null; chordStore.songLatch = false }
  }
  /** The Drum Density of a section, just before its bar line (the Drum Machine reads it per step; the
   *  downbeat plays at any density, so a few ms early is safe); nothing running: now. */
  let songDensityTimer = null
  function songDrumDensity(song, sec, now = false) {
    const v = sec ? sectionDrumDensity(song, sec) : null
    clearTimeout(songDensityTimer); songDensityTimer = null
    if (v === null) return
    const b = !now && gridRunning() ? nextBarLine(performance.now()) : null
    const set = () => { songDensityTimer = null; rigDensity.drum = v }
    if (b) songDensityTimer = setTimeout(set, Math.max(0, b.t - 20 - performance.now()))
    else set()
  }
  onScopeDispose(() => clearTimeout(songDensityTimer))
  // The song's launch / stop for the next bar line, sent in the middle of the bar playing: just after a
  // bar line (the section's last bar starting), a start / switch counts as on that line (a press a hair
  // late on the downbeat) — the lanes came in one bar early.
  let songDeferTimer = null
  onScopeDispose(() => clearTimeout(songDeferTimer))
  function songStep(st) {
    const r = songRun.value
    const song = songOf(r)
    if (!st || !song) return
    if ((st.kind === 'launch' || st.kind === 'stop' || st.kind === 'stay') && r.bar > 0 && gridRunning()) {
      clearTimeout(songDeferTimer); songDeferTimer = null
      const now = performance.now()
      const b = nextBarLine(now)
      const at = b && b.barMs > 0 ? b.t - b.barMs / 2 : 0
      if (at - now > 5) {
        songDeferTimer = setTimeout(() => { songDeferTimer = null; if (songRun.value === r) songStepNow(st) }, at - now)
        return
      }
    }
    songStepNow(st)
  }
  function songStepNow(st) {
    const r = songRun.value
    const song = songOf(r)
    if (!st || !song) return
    if (st.kind === 'launch') {
      const armNow = r.bar === 0 && (r.forceArm || arming())
      r.forceArm = false
      // armed: the bars count from the Play (after its count-in), not from bar lines going by before it
      if (armNow) r.waitPlay = true
      if (r.bar === 0) songArmed = armNow || !gridRunning() // no bar line to wait for: its bar 1 is now
      const at1 = lanesAt(song.sections[st.index], 1)
      launchLanes(at1.lanes, at1.starts, false, armNow)
      songVolumes(song.sections[st.index])
      songChordSteps(song.sections[st.index], r.bar === 0 && !gridRunning())
      songDrumDensity(song, song.sections[st.index])
      s.display = `Song ${song.name}: ${song.sections[st.index].name} ${armNow ? `armed, starts on ${playName()}` : 'on the next bar'}`
    } else if (st.kind === 'stay') {
      // End Stay: every lane of the last section stays on (nothing launched); the Chord holds the
      // chord sounding now (the song's Latch: struck once more where it ends, then held)
      const sec = song.sections[r.index]
      if (sec?.lanes.chord != null && chordStore.isPlaying && chordStore.currentStep >= 0) {
        chordStore.stepLimitNext = null
        chordStore.latchStep = chordStore.currentStep
        chordStore.songLatch = true
      }
      s.display = `Song ${song.name}: Stay — the lanes stay on, the Chord holds its last chord (Stop song: off)`
    } else if (st.kind === 'stop') {
      launchLanes(emptyLanes())
      s.display = `Song ${song.name}: ends on the next bar line`
    } else {
      songRun.value = null
      s.display = `Song ${song.name}: ended`
      // faded out: the levels back up a bar later, the lanes stopped (else the next pad played here is silent)
      if (songFaded) { clearTimeout(songRestoreTimer); songRestoreTimer = setTimeout(songRestoreLevels, barMsNow()) }
    }
  }
  // ── The song's Fade Out (its own, or the Rig's: Performance) before its lanes stop ──
  let songFaded = false // the levels were taken down by a song's fade: back up when it goes on / the next one starts
  let songRestoreTimer = null
  /** The longest Out of the Rig's fades in use (Master, Drum, the MIDI channels). */
  const rigOutBars = () => Math.max(0, fadeSettings.master?.out ?? 0, fadeSettings.drum?.out ?? 0, ...allChKeys().map(k => chFadeSettings[k]?.out ?? 0))
  function songFadeOutTo(song, stopAt, barMs) {
    if (song.fadeOut === 'rig') { fadeOut(stopAt); songFaded = true; return }
    const bars = song.fadeOut
    if (!(bars > 0)) return
    const lane = Object.fromEntries(FADE_KEYS.map(k => [k, k === 'master' || k === 'drum' ? { ...fadeSettings[k], out: bars } : { in: 0, out: 0, max: 127 }]))
    startRamps(planFadeOut(lane, performance.now(), stopAt, barMs, { ...fade }))
    const ch = Object.fromEntries(allChKeys().map(k => [k, { ...chFadeOf(k), out: bars }]))
    startChRamps(planChOut(ch, allChKeys(), performance.now(), stopAt, barMs, { ...chValue }))
    songFaded = true
  }
  /** The levels back where they were (a fade called off, the next song): Master / Drum full, each channel at the song's volume / its Max. */
  function songRestoreLevels() {
    clearTimeout(songRestoreTimer); songRestoreTimer = null
    if (!songFaded) return
    songFaded = false
    fadeRamps = []; clearInterval(fadeTimer); fadeTimer = null
    chRamps = []; clearInterval(chTimer); chTimer = null
    for (const k of FADE_KEYS) setFade(k, 1)
    const t = songTargets()
    for (const k of allChKeys()) sendCh(k, t[k] ?? chFadeOf(k).max)
  }
  // ── Clips inside a section: a lane's clip starting / ending on the next bar line (launched mid-bar, as a section) ──
  let songClipTimer = null
  onScopeDispose(() => clearTimeout(songClipTimer))
  function songClipLine(r, song, b) {
    clearTimeout(songClipTimer); songClipTimer = null
    if (songRun.value !== r || r.stopping || r.queued !== null || r.bar < 1) return
    const sec = song.sections[r.index]
    if (!sec) return
    const bar = r.bar
    const next = bar < sec.bars ? bar + 1 : 1 // past the last bar, nothing launched: the section again (Hold, Stay on section, a fade)
    const cur = lanesAt(sec, bar), nxt = lanesAt(sec, next)
    const lanes = {}
    for (const l of SONG_LANES) {
      if (nxt.lanes[l] === null) { if (cur.lanes[l] !== null) lanes[l] = null }
      else if (nxt.starts.includes(l) || nxt.lanes[l] !== cur.lanes[l]) lanes[l] = nxt.lanes[l]
    }
    if (!Object.keys(lanes).length) return
    const fire = () => {
      songClipTimer = null
      if (songRun.value !== r || r.index !== song.sections.indexOf(sec) || r.bar !== bar || r.stopping || r.queued !== null) return
      launchLanes(lanes, nxt.starts, true)
      if ('chord' in lanes && lanes.chord !== null) songChordSteps(sec)
    }
    const at = b.t - b.barMs / 2, now = performance.now()
    if (at - now > 5) songClipTimer = setTimeout(fire, at - now)
    else fire()
  }
  /** On a bar line: End Stop's fade, so it ends on the song's last bar line; Stop song's: the lanes stop on its line. */
  function songFadeLine(r, song, b) {
    if (songRun.value !== r) return
    if (r.outAt) {
      if (b.t >= r.outAt - b.barMs / 2) { r.outAt = null; r.stopping = true; r.stay = false; r.queued = null; songStep({ kind: 'stop' }) }
      return
    }
    if (r.fading) return
    const left = barsToEnd(r, song)
    if (left == null) return
    const bars = songFadeBars(song, rigOutBars())
    if (!(bars > 0) || left > Math.ceil(bars)) return
    r.fading = true
    songFadeOutTo(song, b.t + (left - 1) * b.barMs, b.barMs)
    s.display = `Song ${song.name}: fading out to its end`
  }
  function songFrame() {
    const idle = appsIdle()
    if (songIdle.value !== idle) songIdle.value = idle
    if (idle && materialPending.value) syncMaterial()
    const r = songRun.value
    if (!r) return
    const song = songOf(r)
    if (!song) { songRun.value = null; return }
    if (r.waitPlay) {
      if (!playOn.value) { songLine = null; return } // armed: waiting for the Play (its count-in)
      r.waitPlay = false
    }
    const now = performance.now()
    const b = gridRunning() ? nextBarLine(now) : null
    if (!b || !(b.barMs > 0)) {
      // the transport stopped under the song (Live's Stop, Stop): the song is over
      if (songLine !== null && r.bar > 0) { songRun.value = null; songResume = { songId: r.songId, index: r.index }; s.display = `Song ${song.name}: stopped — Play: on from ${song.sections[r.index]?.name ?? 'its section'}` }
      songLine = null
      return
    }
    if (songLine === null) {
      songLine = b.t
      // the grid just started (Play) and its first bar is already running: that is the section's bar 1
      if (r.bar === 0 && songArmed && b.t - now > b.barMs * 0.5) { songStep(songBarLine(r, song)); songFadeLine(r, song, b); songClipLine(r, song, b) }
      return
    }
    if (b.t > songLine + b.barMs * 0.5) { songLine = b.t; songStep(songBarLine(r, song)); songFadeLine(r, song, b); songClipLine(r, song, b) }
  }
  // A slot changed in the section playing (or the one launched next): that lane follows on the next bar line
  const songLanesKey = () => {
    const r = songRun.value
    const song = songOf(r)
    if (!r || !song || r.stopping) return null
    const sec = song.sections[r.queued ?? r.index]
    return sec ? `${sec.id}|${JSON.stringify(SONG_LANES.map(l => laneClips(sec, l)))}` : null
  }
  watch(songLanesKey, (k, old) => {
    if (!k || !old || k.split('|')[0] !== old.split('|')[0]) return // another section / the song started or ended
    const r = songRun.value
    const sec = songOf(r)?.sections[r.queued ?? r.index]
    if (!sec) return
    // the lanes as on the next bar (the section launched next: its bar 1)
    const bar = r.queued !== null ? 1 : r.bar < sec.bars ? r.bar + 1 : 1
    launchLanes(lanesAt(sec, bar).lanes)
    s.display = `Song: ${sec.name} changed — on the next bar`
  })
  // A volume changed in the section playing: at once (by ear); in the one launched next: on its bar line
  watch(() => {
    const r = songRun.value
    const sec = songOf(r)?.sections[r.queued ?? r.index]
    return sec ? `${sec.id}|${JSON.stringify(songTargets())}` : null
  }, (k, old) => {
    if (!k || !old || k.split('|')[0] !== old.split('|')[0]) return
    const r = songRun.value
    const sec = songOf(r)?.sections[r.queued ?? r.index]
    songVolumes(sec, r.queued === null && r.bar > 0)
  })
  // The Chord steps changed in the section playing / launched next: on the next bar line
  watch(() => {
    const r = songRun.value
    const sec = songOf(r)?.sections[r.queued ?? r.index]
    return sec ? `${sec.id}|${sec.chordSteps}` : null
  }, (k, old) => {
    if (!k || !old || k.split('|')[0] !== old.split('|')[0]) return
    const r = songRun.value
    songChordSteps(songOf(r)?.sections[r.queued ?? r.index])
  })
  // The Drum Density changed in the section playing: at once (by ear); in the one launched next: on its bar line
  watch(() => {
    const r = songRun.value
    const song = songOf(r)
    const sec = song?.sections[r.queued ?? r.index]
    return sec ? `${sec.id}|${sectionDrumDensity(song, sec)}` : null
  }, (k, old) => {
    if (!k || !old || k.split('|')[0] !== old.split('|')[0]) return
    const r = songRun.value
    songDrumDensity(songOf(r), songOf(r)?.sections[r.queued ?? r.index], r.queued === null && r.bar > 0)
  })
  // No song: the Chord Prog plays its whole slots again
  watch(() => !!songRun.value, on => {
    if (on) return
    clearTimeout(songDeferTimer); songDeferTimer = null
    chordStore.stepLimit = null; chordStore.stepLimitNext = null
    if (chordStore.songLatch) { if (chordStore.latchStep === 0) chordStore.latchStep = null; chordStore.songLatch = false }
  })
  const songChordCounts = computed(() => chordStore.slots.map(x => x?.numSteps ?? 0))
  // the slots' names (lib/slot-names.ts) per song lane: Bass is the Sequencer's Bass lane, or the Drum Machine's basslines
  const songNameKeys = computed(() => ({ drum: 'drum', chord: 'chord', seq: 'seq', bass: rowLane('bass') ? 'bass' : 'dmBass', arp: 'arp' }))
  // the lanes' channels for the Session Browser's volumes
  watch(fadeLanes, v => setSongChannels(v), { immediate: true })
  /** A Rig row's slot name ('' none). */
  function rigSlotName(id, slot) { const k = songNameKeys.value[id]; return k ? slotName(k, slot) : '' }
  // ── Songs with their own material (SG4, lib/song-material.ts): switched only with the apps stopped ──
  const songIdle = ref(true)
  const currentSong = () => songLib.songs.find(x => x.id === songLib.currentId)
  /** Nothing plays: no grid (Live / SY.CORE's transport / a sequence on the internal grid), no app running. */
  const appsIdle = () => !gridRunning() && !drumStore.isPlaying && !chordStore.isPlaying && !rigReports.seqPlaying
  // (the song open's material: core/sessions.ts syncSongMaterial, now or at the stop)
  const syncMaterial = syncSongMaterial
  async function songOwn(on) {
    const song = currentSong()
    if (!song) return
    if (on) { await captureInto(songLib, song); s.display = `Song ${song.name}: the apps' slots are its own material now`; return }
    if (songLib.loadedId === song.id && !appsIdle()) { s.display = `Song ${song.name}: stop the apps first (its material is playing)`; return }
    await dropMaterial(songLib, song)
    s.display = `Song ${song.name}: back to the session's slots`
  }
  async function songCapture() {
    const song = currentSong()
    if (!song) return
    await captureInto(songLib, song)
    s.display = `Song ${song.name}: material captured from the apps`
  }
  /** viaPlay: started by a Play press (Rig Controls, the Launchpad): the section's slots armed for it, then that Play. */
  async function playSong(i, { viaPlay = false } = {}) {
    const song = songLib.songs.find(x => x.id === songLib.currentId)
    if (!song || !live.value) return
    if (needsSwitch(songLib, song)) {
      if (!appsIdle()) { s.display = `Song ${song.name}: its material loads at a stop — stop first, then Play`; materialPending.value = true; return }
      await switchMaterial(songLib, song)
      materialPending.value = false
    }
    // the song replaces the apps' own chains
    for (const id of ['drum', 'chord', 'seq']) if (chainOn(id)) toggleChain(id)
    if (playOn.value) songRestoreLevels() // a song faded out before, the transport still running
    else { clearTimeout(songRestoreTimer); songRestoreTimer = null; songFaded = false } // the Play's Fade In takes them up
    songResume = null
    const r = startRun(song, i)
    if (viaPlay) r.forceArm = true
    songRun.value = r
    songLine = null
    songStep({ kind: 'launch', index: r.index })
    // Stopped: Play from is the real Play too (the Performance's: count-in, fades, Live's Play over Link)
    if (viaPlay) transportToggle()
    else if (arming() && !playOn.value && !countIn.active) transportToggle()
  }
  function stopSong() {
    songResume = null
    const r = songRun.value
    if (!r) return
    if (r.bar === 0) { // not started: nothing plays from it yet
      for (const id of activeSlotRows()) { cancelWait(id); rigArmed[id] = null }
      songRun.value = null
      s.display = 'Song: called off'
      return
    }
    const song = songOf(r)
    const b = gridRunning() ? nextBarLine(performance.now()) : null
    const bars = song ? songFadeBars(song, rigOutBars()) : 0
    // with a fade-out: the section goes on (looping) until the bar line the fade ends on; pressed again: now
    if (song && b && b.barMs > 0 && bars > 0 && !r.outAt && !r.fading) {
      const at = fadeStopLine(performance.now(), b.t, b.barMs, bars)
      if (at > b.t + 1) {
        r.outAt = at
        r.queued = null
        songFadeOutTo(song, at, b.barMs)
        s.display = `Song ${song.name}: fading out over ${bars === 0.5 ? '½' : bars} bar${bars > 1 ? 's' : ''} — Stop song again: now`
        return
      }
      songFadeOutTo(song, b.t, b.barMs)
    }
    r.outAt = null
    r.stopping = true
    r.stay = false
    r.queued = null
    songStep({ kind: 'stop' })
  }
  function holdSong(on) {
    const r = songRun.value
    if (!r) return
    if (on && (r.fading || r.outAt)) { r.fading = false; r.outAt = null; songRestoreLevels() } // Hold calls the fade off
    songStep(setHold(r, songOf(r), on))
    if (on) s.display = `Song: Hold on ${songOf(r)?.sections[r.index]?.name ?? ''}`
  }
  function jumpSong(i) {
    const r = songRun.value
    if (r && (r.fading || r.outAt)) songRestoreLevels() // a section picked: the fade is called off (jumpTo clears it)
    if (r) songStep(jumpTo(r, songOf(r), i))
  }
  // the Session Browser's buttons (lib/songs.ts songCommand): taken here, the player is this engine
  watch(songCommand, c => {
    if (!c) return
    songCommand.value = null
    if (c.cmd === 'play') { if (!live.value) { s.display = 'Songs play in LIVE mode: switch the Rig to LIVE'; return } playSong(c.index) }
    else if (c.cmd === 'stop') stopSong()
    else if (c.cmd === 'hold') holdSong(c.on)
    else if (c.cmd === 'jump') jumpSong(c.index)
    else if (c.cmd === 'mute') muteLane(c.lane)
    else if (c.cmd === 'solo') toggleSolo(s, c.lane)
  }, { immediate: true })
  // the lanes' Mute / Solo for the Session Browser (the Rig's own state, kept with the Rig panel closed)
  watch(() => s.apps.map(a => `${a.id}:${a.muted ? 1 : 0}${a.solo ? 1 : 0}`).join(','), () => {
    rigLaneMutes.value = Object.fromEntries(s.apps.filter(a => SONG_LANES.includes(a.id)).map(a => [a.id, { muted: !!a.muted, solo: !!a.solo }]))
  }, { immediate: true })
  onScopeDispose(() => { rigLaneMutes.value = {} })

  // ── Tailwind classes ──────────────────────────────────────────────────────
  const SLOT_CLASS = {
    empty: 'bg-white/[0.03] border-white/10 text-neutral-600',
    filled: 'bg-amber-500/20 border-amber-400/40 text-amber-200',
    queued: 'bg-amber-400/50 border-amber-300 text-amber-50 animate-pulse',
    playing: 'bg-emerald-500 border-emerald-300 text-black',
  }
  const LED_CLASS = {
    off: 'bg-neutral-800 border-neutral-700 text-neutral-500',
    amber: 'bg-amber-500/80 border-amber-300/60 text-black shadow-[0_0_8px_rgba(245,158,11,0.45)]',
    amberFlash: 'bg-amber-400 border-amber-200 text-black animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.7)]',
    green: 'bg-green-500 border-green-300 text-black shadow-[0_0_10px_rgba(34,197,94,0.7)]',
    red: 'bg-red-600 border-red-400 text-white shadow-[0_0_10px_rgba(220,38,38,0.7)]',
    redDim: 'bg-red-950/70 border-red-900/80 text-red-300/80',
    redFlash: 'bg-red-600 border-red-400 text-white animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.7)]',
  }
  const btn = 'px-2 py-1.5 rounded-md border text-[10px] font-bold uppercase tracking-wider transition-colors select-none'
  const btnIdle = 'bg-white/[0.04] border-white/10 text-neutral-300 hover:bg-white/10'
  const btnOn = 'bg-emerald-500/80 border-emerald-300 text-black'
  // The Fill buttons (Rig layout, Rig Controls): dark amber idle · light amber blinking waiting · red playing
  const FILL_CLASS = {
    idle: 'bg-amber-950/60 border-amber-900/70 text-amber-200/80 hover:bg-amber-900/60',
    waiting: 'bg-amber-400/80 border-amber-200 text-black animate-pulse',
    playing: 'bg-red-600 border-red-400 text-white',
  }
  const fillClass = computed(() => FILL_CLASS[live.value ? fillLook(rigReports) : s.fill ? 'playing' : 'idle'])

  // ── Launchpad Mini MK1 view model ─────────────────────────────────────────
  const lpTop = computed(() => LP_TOP_LABELS.map((label, i) => {
    let color = 'off'
    if (i === 0) color = s.clock.running ? (s.clock.beat === 1 ? 'green' : 'amber') : 'off'
    if (i === 1) color = s.clock.source === 'EXT' ? 'green' : 'red'
    if (i === 2) color = s.shift ? 'green' : 'amber'
    if (i === 3) color = s.generateMode === 'ai' ? 'green' : 'amber'
    const tg = syncSettings.scope === 'global' ? syncSettings.global : focused.value.opts.triggerSync
    const tgWho = syncSettings.scope === 'global' ? 'All' : focused.value.label
    if (i === 4) color = tg === '4' ? 'amber' : tg === 'off' ? 'red' : 'green'
    if (i === 5) color = 'amber'
    if (i === 6) color = countIn.active ? 'amberFlash' : playOn.value ? 'green' : 'amber'
    if (i === 7) color = holding.panic ? 'amberFlash' : 'red'
    // Sync shows the focused track and its value (it cycles that track's Trigger sync)
    if (i === 4) return { label: `${tgWho} ${SYNC_SHORT[tg] ?? tg}`, color, id: `CC ${lpTopCc(i)}`, title: `Trigger sync of ${tgWho === 'All' ? 'every lane (Global)' : tgWho}: ${TRIGGER_SYNC_OPTIONS.find(o => o.value === tg)?.label ?? tg}${syncSettings.startOnly ? ' · start only' : ''} (press: next)` }
    return { label, color, id: `CC ${lpTopCc(i)}` }
  }))

  function lpPad(row, col) {
    if (row < 5) {
      const a = s.apps[row]
      // The row's first pad names its app (Chord A, Drum A…); a slot with a name shows it (Verse-A)
      const nm = rigSlotName(a.id, col)
      const short = col === 0 ? `${a.label} ${SLOT_LABELS[col]}` : nm ? `${nm.slice(0, 6)}-${SLOT_LABELS[col]}` : SLOT_LABELS[col]
      const full = `${a.label} ${slotLabelOf(nm, col)}`
      if (live.value && !isLiveRow(a.id)) return { label: `${full} (not connected)`, short, color: 'off' }
      const st = padState(a, col)
      const color = a.muted && st === 'playing' ? 'red' : slotColor(st)
      return { label: full, short, color }
    }
    // Row 6: Fill (the Drum Machine's), Auto Fill (its Autofill on / off), the Fill's Now / Bar, Repeat
    // (hold: the Drum Machine's Repeat), Seq Free (the Sequencer decoupled from the Chord Prog), Drum / Chord / Seq Chain.
    if (row === 5) {
      const label = LP_PERF_LABELS[col]
      if (!label) return { label: '—', short: '', color: 'off' }
      // Fill: dark amber idle · light amber blinking waiting (armed for the next bar) · red playing
      if (col === 0) {
        const look = live.value ? fillLook(rigReports) : s.fill ? 'playing' : 'idle'
        return { label, short: label, color: look === 'playing' ? 'red' : look === 'waiting' ? 'amberFlash' : 'amber' }
      }
      // the Drum Machine's Autofill (a fill every N bars): on green · off amber
      if (col === 1) return { label: `Auto Fill ${drumStore.autofillEnabled ? 'on' : 'off'}`, short: 'AUTO', color: drumStore.autofillEnabled ? 'green' : 'amber' }
      // the Fill's when: Now (amber) · Bar (green — armed, the whole next bar)
      if (col === 2) return drumStore.fillWhen === 'bar'
        ? { label: 'Fill: next bar', short: 'BAR', color: 'green' }
        : { label: 'Fill: now', short: 'NOW', color: 'amber' }
      if (col === 3) return { label: 'Repeat (hold)', short: label, color: s.repeater || (live.value && drumStore.repeaterActive) ? 'green' : 'amber' }
      if (CHAIN_PADS[col]) {
        const id = CHAIN_PADS[col], on = chainOn(id)
        return { label: `${label} ${on ? 'on' : 'off'}`, short: CHAIN_SHORT[id], color: on ? 'redFlash' : 'redDim' }
      }
      return uiStore.seqDecoupled
        ? { label: 'Seq Free on: the Sequencer ignores the Chord Prog', short: 'FREE', color: 'green' }
        : { label: 'Seq Free off: the Sequencer follows the Chord Prog', short: 'FREE', color: 'amber' }
    }
    // Row 7: the sections (scenes A–H on every app).
    if (row === 6 && sMode.value === 'captures') {
      const c = captures.state, p = c.play[col]
      if (!c.clips[col]) {
        const picked = c.selected === col
        return { label: `Capture ${col + 1}: empty${picked ? ' (next capture)' : ''}`, short: `C${col + 1}`, color: picked ? (c.recording ? 'redFlash' : 'redDim') : 'off' }
      }
      if (c.recording && c.selected === col) return { label: `Capture ${col + 1}: ${clipSummary(c.clips[col])} · recorded over by the capture`, short: `C${col + 1}`, color: 'redFlash' }
      const color = p === 'playing' ? 'green' : p === 'queued' || p === 'stopping' ? 'amberFlash' : 'amber'
      return { label: `Capture ${col + 1}: ${clipSummary(c.clips[col])} · ${p === 'queued' && !captures.clockRunning() ? 'waits for Play' : p}`, short: `C${col + 1}`, color }
    }
    if (row === 6) {
      const color = s.section === col ? 'green' : s.queuedSection === col ? 'amberFlash' : sectionHasContent(col) ? 'amber' : 'off'
      return { label: `Section ${col + 1}`, short: `S${col + 1}`, color }
    }
    // Row 8: Latch 1–8 = the Chord Prog stays on chord 1–8 of the slot playing (no advance); off: the
    // progression goes on. (Muting an app: its slot pads stop it, the MIDImix's Mute, the panel's M.)
    return latchPad(col)
  }

  // Latch 1–8: green while that chord holds, blinking while it waits for the chord sounding to end;
  // amber = a chord there; off = past the slot's length or a rest.
  function latchPad(col) {
    const st = chordStore.steps[col]
    const has = col < chordStore.numSteps && isChord(st)
    const name = has ? st.chordName || `chord ${col + 1}` : ''
    if (chordStore.latchStep === col) {
      const holding = !chordStore.isPlaying || chordStore.currentStep === col
      return { label: `Latch ${col + 1} · ${name || 'no chord'} · on (press: back to the progression)`, short: `L${col + 1}`, color: holding ? 'green' : 'amberFlash' }
    }
    return { label: has ? `Latch ${col + 1} · stay on ${name}` : `Latch ${col + 1} (no chord ${col + 1})`, short: `L${col + 1}`, color: has ? 'amber' : 'off' }
  }
  function toggleLatch(col) {
    if (chordStore.latchStep === col) {
      chordStore.latchStep = null
      s.display = 'Chord Latch off: the progression goes on'
      return
    }
    if (!(col < chordStore.numSteps && isChord(chordStore.steps[col]))) { s.display = `Latch ${col + 1}: no chord ${col + 1} in this slot`; return }
    chordStore.latchStep = col
    s.display = `Chord Latch ${col + 1}: stays on ${chordStore.steps[col].chordName || `chord ${col + 1}`}`
  }

  function lpSide(row) {
    // Side: GEN Drum / Chord / Seq / Bass / Arp · DJ Filter (hold) · Capt · Row S mode
    if (row === 5) return { label: djHeld.value ? 'DJ Filter: closing (release: open)' : 'DJ Filter (hold: cutoff down)', short: 'DJ', color: djHeld.value ? 'green' : live.value ? 'amber' : 'off' }
    if (row === 6) return { label: captures.state.recording ? 'Capture: recording (press: stop)' : 'Capture (press: record)', short: 'Capt', color: captures.state.recording ? 'redFlash' : 'redDim' }
    if (row === 7) return sMode.value === 'captures'
      ? { label: 'Row S: Captures (press: Sections)', short: 'S·CAP', color: 'red' }
      : { label: 'Row S: Sections (press: Captures)', short: 'S·SEC', color: 'amber' }
    if (row < 5) {
      const a = s.apps[row]
      // Shift: Mute (red while muted); else GEN — connected in LIVE for Drum, Chord, Seq, Bass, Arp (on its lane).
      if (s.shift) return { label: `${a.label} ${a.muted ? 'muted (press: unmute)' : 'Mute'}`, short: 'MUTE', color: a.muted ? 'red' : 'redDim' }
      const off = live.value && !genOn(a.id, false)
      return { label: `${a.label} Generate`, short: 'GEN', color: off ? 'off' : 'amber' }
    }
  }

  function lpTopDown(i) {
    if (i === 0) tap()
    if (i === 1) holdStart('int', doInt)
    if (i === 2) toggleShift()
    if (i === 3) toggleGenMode()
    if (i === 4) cycleSync()
    if (i === 5) view.value = 'rig'
    if (i === 6) togglePlay() // Play / Stop, as Rig Controls' Play
    if (i === 7) holdStart('panic', doPanic)
  }
  function lpTopUp(i) {
    if (i === 1) holdEnd('int')
    if (i === 7) holdEnd('panic')
  }
  function toggleFollowPlay() {
    rigFollowPlay.value = !rigFollowPlay.value
    s.display = rigFollowPlay.value ? 'Live Play: starts the armed slots' : 'Live Play off: Live\'s Play starts nothing (listen back) — pads still start their slots'
  }
  function toggleAutoFill() {
    drumStore.autofillEnabled = !drumStore.autofillEnabled
    s.display = `Drum: Auto Fill ${drumStore.autofillEnabled ? 'on' : 'off'}`
  }
  /** Auto Fill's bar: a fill on every 4th / 8th / 12th / 16th bar (the Drum Machine's Autofill every N). */
  const AUTOFILL_BARS = [4, 8, 12, 16]
  const autoFillEvery = computed(() => useDrumMachineEngine().autofillEvery.value)
  function cycleAutoFillEvery() {
    const e = useDrumMachineEngine().autofillEvery
    const i = AUTOFILL_BARS.indexOf(e.value)
    e.value = AUTOFILL_BARS[(i + 1) % AUTOFILL_BARS.length]
    s.display = `Drum: Auto Fill on bar ${e.value} (every ${e.value} bars)${drumStore.autofillEnabled ? '' : ' — Auto is off'}`
  }
  function toggleFillWhen() {
    drumStore.fillWhen = drumStore.fillWhen === 'bar' ? 'now' : 'bar'
    s.display = `Fill: ${drumStore.fillWhen === 'bar' ? 'the whole next bar' : 'now, to the end of this bar'}`
  }
  function lpPadDown(row, col) {
    if (row < 5) return onSlotDown(s.apps[row].id, col)
    if (row === 5) {
      if (col === 0) return onFill()
      if (col === 1) return toggleAutoFill()
      if (col === 2) return toggleFillWhen()
      if (col === 3) return repeaterOn()
      if (CHAIN_PADS[col]) return toggleChain(CHAIN_PADS[col])
      if (col === 4) return toggleSeqFree()
      return
    }
    if (row === 6) return sMode.value === 'captures' ? onCapturePad(col) : onSection(col)
    toggleLatch(col)
  }
  function lpPadUp(row, col) {
    if (row < 5) return onSlotUp(s.apps[row].id, col)
    if (row === 5 && col === 3) repeaterOff()
  }
  function lpSideDown(row) {
    // Shift + a row's side button: Mute that lane (every row, as the panel's M); else its GEN.
    // (Mutate stays on the panel: Shift + its GEN.)
    if (row < 5) return s.shift ? muteLane(s.apps[row].id) : onGenerate(s.apps[row].id)
    if (row === 5) return djStart()
    if (row === 6) return onCapt()
    if (row === 7) return toggleSMode()
  }
  function lpSideUp(row) {
    if (row === 5) djEnd()
  }

  // The device's state out / presses in — set up here, after the Launchpad view it sends (lpTop…).
  let rigLinkJson = ''
  watch(() => JSON.stringify(rigLinkState()), json => { rigLinkJson = json; linkClient.sendRig(JSON.parse(json)) }, { immediate: true })
  const offRigLink = linkClient.on(e => {
    // (re)connected: the devices get the state again; a click on a device: as a learned rig button
    if (e.type === 'hello' && rigLinkJson) linkClient.sendRig(JSON.parse(rigLinkJson))
    else if (e.type === 'rig-press') {
      // the device's Launchpad layout: a pad / side / top button pressed or released, as on the Launchpad
      const lp = parseRigLinkPress(e.name)
      if (lp) {
        if (lp.kind === 'pad') { if (lp.down) lpPadDown(lp.row, lp.col); else lpPadUp(lp.row, lp.col) }
        else if (lp.kind === 'side') { if (lp.down) lpSideDown(lp.index); else lpSideUp(lp.index) }
        else if (lp.down) lpTopDown(lp.index)
        else lpTopUp(lp.index)
        return
      }
      const action = parseRigAction(e.name)
      if (action) window.dispatchEvent(new CustomEvent('rig-action', { detail: { action } }))
    }
  })
  onScopeDispose(() => { offRigLink(); linkClient.sendRig(null) })

  // ── Key (LIVE: the Chord Prog's key, root + mode — chord-key.ts) ──────────
  /** The key shown: LIVE = the Chord Prog's ("Cm", "Bb", "Eb/Cm"); SIM = the rig's own. */
  const keyText = computed(() => {
    if (!live.value) return KEY_NAMES[s.key]
    // Modal Chords: its root (Any = every root)
    if (chordStore.selectedKey === MODAL_KEY_INDEX) return chordStore.modalRoot === null ? 'Modal' : `${KEY_NOTE_NAMES[chordStore.modalRoot]} modal`
    return keyLabel(chordStore.selectedKey, chordStore.keyMode) || '—'
  })
  /** Key ◀ ▶: LIVE moves the Chord Prog's tonic a semitone, in the same mode (a genre / modal library
   *  goes back to the keys, from C). */
  function onKeyShift(delta) {
    if (!live.value) return shiftKey(s, delta)
    if (chordStore.selectedKey === MODAL_KEY_INDEX) {
      // Modal Chords: the root its Generate stays on, a semitone (from Any: C)
      const r = chordStore.modalRoot
      chordStore.modalRoot = r === null ? 0 : (r + delta + 12) % 12
      s.display = `Key ${keyText.value} (Chord Prog · Modal Chords)`
      return
    }
    const mode = chordStore.keyMode
    const root = keyRoot(chordStore.selectedKey, mode) ?? (mode === 'minor' ? 9 : 0)
    chordStore.selectedKey = keyFile(root + delta + 12, mode)
    s.display = `Key ${keyText.value} (Chord Prog)`
  }
  /** Maj/Min (Launchpad: Shift + Key): LIVE switches the Chord Prog between the major and the minor
   *  key on the same tonic (C ↔ Cm); from Both, it picks the major. */
  function onKeyMode() {
    if (!live.value) return notConnected('Major / minor')
    if (chordStore.selectedKey === MODAL_KEY_INDEX) { s.display = 'Maj/Min: Modal Chords has no major / minor (pick a key file in the Chord Prog)'; return }
    const mode = chordStore.keyMode
    const root = keyRoot(chordStore.selectedKey, mode ?? 'major') ?? 0
    const next = mode === 'major' ? 'minor' : 'major'
    chordStore.keyMode = next
    chordStore.selectedKey = keyFile(root, next)
    s.display = `Key ${keyText.value} (Chord Prog)`
  }

  // ── Physical Launchpad Mini MK1 in Rig mode (rig-launchpad.ts) ────────────
  // On: the Launchpad's buttons are the rig's (no usual mappings) and its LEDs
  // show the state above. Off, or the panel closed: its usual mappings come back.
  // On / off: the Launchpad's role in the project's active control set (Rig ↔ Perform), so it
  // follows the set (the control-set key, Control in MIDI Flow).
  const lpOutput = computed(() => midiStore.outputs.find(o => isLaunchpadName(o.name)) ?? null)
  const LS_LP_PORT = 'SYCORE_RIG_LAUNCHPAD_PORT' // the port name last seen: its role while unplugged
  const lpName = computed(() => lpOutput.value?.name ?? localStorage.getItem(LS_LP_PORT) ?? 'Launchpad Mini')
  watch(() => lpOutput.value?.name, n => { if (n) localStorage.setItem(LS_LP_PORT, n) }, { immediate: true })
  const lpRig = computed({
    get: () => roleOf(currentSet.value, lpName.value) === 'rig',
    set: v => setControllerRole(lpName.value, v ? 'rig' : 'perform'),
  })
  let lpSent = null

  const lpLeds = computed(() => {
    const out = []
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) out.push(colorVelocity(lpPad(r, c).color))
    for (let r = 0; r < 8; r++) out.push(colorVelocity(lpSide(r).color))
    for (const t of lpTop.value) out.push(colorVelocity(t.color))
    return out
  })

  // The raw port (midiStore.outputs holds reactive copies).
  const lpPort = () => midiService.getOutputs().find(o => isLaunchpadName(o.name)) ?? null
  function lpSend(msgs) {
    const o = lpPort()
    if (!o) return false
    // Other feedback (MIDI Learn LEDs, e.g. the Chord Prog's slot mappings) is muted
    // meanwhile: a 0 from it (no flags) made pads blink with flashing on.
    muteOtherSenders(o)
    for (const m of msgs) rigSend(o, m)
    return true
  }
  function pushLeds() {
    if (rigLaunchpad.handler !== onLaunchpadMidi) return
    const next = lpLeds.value
    const msgs = ledDiff(lpSent, next)
    if (msgs.length && lpSend(msgs)) lpSent = next.slice()
  }
  function onLaunchpadMidi(data) {
    const ev = parseLaunchpadInput(data)
    if (!ev) return
    if (ev.kind === 'pad') { if (ev.down) lpPadDown(ev.row, ev.col); else lpPadUp(ev.row, ev.col) }
    else if (ev.kind === 'side') { if (ev.down) lpSideDown(ev.row); else lpSideUp(ev.row) }
    else if (ev.down) lpTopDown(ev.index)
    else lpTopUp(ev.index)
  }
  // Rig mode takes the Launchpad's input over before anything else (rigIngress below: MIDI
  // Learn, MIDI Actions, the Loop Machine's and Chord Prog's own listeners, Thru): its mappings
  // stay as they are and work again when Rig mode is off.
  const lpActive = () => rigLaunchpad.handler === onLaunchpadMidi
  function lpRigOn() {
    rigLaunchpad.handler = onLaunchpadMidi
    lpSent = null
    if (lpSend(RIG_INIT_MESSAGES)) pushLeds()
  }
  function lpRigOff() {
    if (!lpActive()) return
    rigLaunchpad.handler = null
    lpSent = null
    unmuteOtherSenders(p => isLaunchpadName(p.name))
    rigLaunchpad.restore?.()
  }
  watch(lpLeds, pushLeds)
  watch(lpRig, on => {
    if (on) lpRigOn(); else lpRigOff()
  }, { immediate: true })
  // Plugged in (again) while Rig mode is on: its LEDs were reset — after the
  // controller manager's own init of the new port, set it up again.
  let lpReinit = null
  watch(() => lpOutput.value?.id, id => {
    clearTimeout(lpReinit)
    if (id && lpRig.value) lpReinit = setTimeout(lpRigOn, 400)
  })
  onScopeDispose(() => { clearTimeout(lpReinit); lpRigOff() })

  // ── AKAI MIDImix view model ───────────────────────────────────────────────
  const mixPage = ref('app') // 'app' | 'lane'
  const laneParams = reactive(Array.from({ length: 16 }, () => ({ k1: 64, k2: 64, k3: 64, cc7: 100 })))
  const macros = reactive({ transpose: 64, arpRate: 64, spare: 0 })

  const mixStrips = computed(() => Array.from({ length: 8 }, (_, i) => {
    if (mixPage.value === 'lane') {
      const lane = i + lanePageOffset.value
      const p = laneParams[lane]
      return {
    view,
        title: `Lane ${lane + 1}`,
        knobs: [
          { label: 'CC A', get: () => p.k1, set: v => { p.k1 = v } },
          { label: 'CC B', get: () => p.k2, set: v => { p.k2 = v } },
          { label: 'CC C', get: () => p.k3, set: v => { p.k3 = v } },
        ],
        fader: { label: 'CC 7', get: () => p.cc7, set: v => { p.cc7 = v } },
        mute: { label: 'Mute', on: s.laneMutes[lane], press: () => toggleLaneMute(s, lane) },
        rec: { label: 'Latch', on: s.laneLatch[lane], press: () => { s.laneLatch[lane] = !s.laneLatch[lane]; s.display = `Lane ${lane + 1} latch ${s.laneLatch[lane] ? 'on' : 'off'}` } },
      }
    }
    if (i < 5) {
      const a = s.apps[i]
      return {
        title: a.label,
        knobs: [
          { label: 'Density', get: () => a.density, set: v => { a.density = v } },
          { label: 'Swing', get: () => a.swing, set: v => { a.swing = v } },
          { label: 'Gate', get: () => a.gate, set: v => { a.gate = v } },
        ],
        fader: { label: 'Intensity', get: () => a.intensity, set: v => { a.intensity = v } },
        mute: { label: 'Mute', on: a.muted, press: () => muteLane(a.id) },
        rec: { label: 'Solo', on: a.solo, press: () => toggleSolo(s, a.id) },
      }
    }
    const macroDefs = [['Transpose', 'transpose'], ['Arp rate', 'arpRate'], ['Spare', 'spare']]
    const [label, key] = macroDefs[i - 5]
    return {
      title: label,
      knobs: [{ label, get: () => macros[key], set: v => { macros[key] = v } }],
      fader: null,
      mute: null,
      rec: null,
    }
  }))

  // ── Physical AKAI MIDImix in Rig mode (rig-midimix.ts) ─────────────────────
  // On: its pots, faders and buttons are the strips above (no usual mappings),
  // absolute pots with pickup; Mute/Rec Arm/Bank LEDs show the state.
  // On / off: the MIDImix's role in the active control set (Rig ↔ Perform), as the Launchpad's.
  const mixOutput = computed(() => midiStore.outputs.find(o => isMidimixName(o.name)) ?? null)
  const LS_MIX_PORT = 'SYCORE_RIG_MIDIMIX_PORT'
  const mixName = computed(() => mixOutput.value?.name ?? localStorage.getItem(LS_MIX_PORT) ?? 'MIDI Mix')
  watch(() => mixOutput.value?.name, n => { if (n) localStorage.setItem(LS_MIX_PORT, n) }, { immediate: true })
  const mixRig = computed({
    get: () => roleOf(currentSet.value, mixName.value) === 'rig',
    set: v => setControllerRole(mixName.value, v ? 'rig' : 'perform'),
  })
  const mixPickup = new Pickup()
  const mixMap = ref(loadMixMap()) // learned controls (a MIDImix reprogrammed with the Akai editor)
  let mixActive = false
  let mixSent = null

  const mixLeds = computed(() => {
    const st = mixStrips.value
    return [
      ...st.map(x => !!x.mute?.on),
      ...st.map(x => !!x.rec?.on),
      mixPage.value === 'app', mixPage.value === 'lane',
    ]
  })
  const mixPort = () => midiService.getOutputs().find(o => isMidimixName(o.name)) ?? null
  const mixLastOut = ref('')
  function mixSend(msgs) {
    const o = mixPort()
    if (!o) { mixLastOut.value = 'no MIDImix output port'; return false }
    mixLastOut.value = `${o.name}: ${msgs.slice(-2).map(m => hex(m)).join(' · ')}`
    muteOtherSenders(o) // MIDI Learn feedback would overwrite the rig's LEDs
    for (const m of msgs) rigSend(o, m)
    return true
  }
  function pushMixLeds() {
    if (!mixActive) return
    const next = mixLeds.value
    const msgs = mixLedDiff(mixSent, next, mixMap.value)
    if (msgs.length && mixSend(msgs)) mixSent = next.slice()
  }
  /** Apply an absolute pot/fader through pickup; while it hasn't reached the value, show where to move it. */
  function mixTake(key, label, hw, get, set) {
    const cur = get()
    const v = mixPickup.take(`${mixPage.value}:${lanePageOffset.value}:${key}`, hw, cur)
    if (v !== null) { set(v); s.display = `${label} ${v}`; return }
    s.display = `${label} ${cur} · pickup: move ${hw < cur ? 'up ▲' : 'down ▼'} (${hw})`
  }
  // Diagnostics: the last message from a MIDImix-named input (Rig mode on or off) and how it was read.
  const mixLastIn = ref('')
  const hex = d => Array.from(d, b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
  function onMidimixMidi(data) {
    const ev = parseMidimixInput(data, mixMap.value)
    mixLastIn.value = `${hex(data)} → ${ev ? ev.kind + ('strip' in ev ? ` ${ev.strip + 1}` : '') + ('down' in ev ? (ev.down ? ' down' : ' up') : ` ${ev.value}`) : 'not a MIDImix control'}`
    if (!ev) return
    const st = mixStrips.value
    switch (ev.kind) {
      case 'knob': {
        const k = st[ev.strip]?.knobs[ev.row]
        if (k) mixTake(`${ev.strip}k${ev.row}`, `${st[ev.strip].title} ${k.label}`, ev.value, k.get, k.set)
        return
      }
      case 'fader': {
        const f = st[ev.strip]?.fader
        if (f) mixTake(`${ev.strip}f`, `${st[ev.strip].title} ${f.label}`, ev.value, f.get, f.set)
        return
      }
      case 'master':
        mixTake('master', 'Global', ev.value, () => s.globalIntensity, v => { s.globalIntensity = v })
        return
      case 'mute': if (ev.down) st[ev.strip]?.mute?.press(); return
      case 'rec': if (ev.down) st[ev.strip]?.rec?.press(); return
      case 'solo': // a Mute button with SOLO held: Solo on the App page, lanes 9–16 on the Lane page
        if (!ev.down) return
        if (mixPage.value === 'app') st[ev.strip]?.rec?.press()
        else { const was = s.shift; s.shift = true; mixStrips.value[ev.strip]?.mute?.press(); s.shift = was }
        return
      case 'soloButton': s.shift = ev.down; return
      case 'bankLeft': if (ev.down) mixPage.value = 'app'; return
      case 'bankRight': if (ev.down) mixPage.value = 'lane'; return
    }
  }
  function mixRigOn() {
    mixActive = true
    mixSent = null
    mixPickup.reset()
    pushMixLeds()
  }
  function mixRigOff() {
    if (!mixActive) return
    mixActive = false
    const o = mixPort()
    if (o) for (const m of mixLedsOff(mixMap.value)) rigSend(o, m)
    mixSent = null
    unmuteOtherSenders(p => isMidimixName(p.name))
  }
  watch(mixLeds, pushMixLeds)

  // ── MIDImix map Learn: pick a control on screen, then move/press it on the MIDImix ──
  // Roles in learning order (strip by strip, then the master section); after each
  // one the next is picked. Roles not learned keep the factory message.
  const MIX_LEARN_ROWS = [
    ['knob', 0, 'K1'], ['knob', 1, 'K2'], ['knob', 2, 'K3'],
    ['mute', null, 'Mute'], ['solo', null, 'Solo+Mute'], ['rec', null, 'Rec Arm'], ['fader', null, 'Fader'],
  ]
  const MIX_MASTER_ROLES = [['bankLeft', 'Bank ◀'], ['bankRight', 'Bank ▶'], ['soloButton', 'SOLO'], ['master', 'Master']]
  const MIX_ROLE_ORDER = [
    ...Array.from({ length: 8 }, (_, strip) => MIX_LEARN_ROWS.map(([kind, row]) => roleId({ kind, strip, row: row ?? undefined }))).flat(),
    ...MIX_MASTER_ROLES.map(([r]) => r),
  ]
  const mixLearn = ref(false)
  const mixLearnRole = ref(null)
  let mixLearnLastKey = null // the message just learned: its release / further values don't learn the next role
  watch(mixLearn, on => { mixLearnRole.value = on ? MIX_ROLE_ORDER[0] : null; mixLearnLastKey = null })
  const mixRoleLabel = role => mixMsgLabel(mixMap.value, role)
  const mixRoleLearned = role => !!mixMap.value[role]
  function mixLearnMessage(d) {
    const key = `${d[0] & 0xEF}:${d[1]}`
    if (key === mixLearnLastKey) return
    const m = learnMixMsg(d)
    if (!m || !mixLearnRole.value) return
    const role = mixLearnRole.value
    mixMap.value = assignMix(mixMap.value, role, m)
    saveMixMap(mixMap.value)
    mixLearnLastKey = key
    s.display = `MIDImix ${role} = ${mixRoleLabel(role)}`
    const next = MIX_ROLE_ORDER[MIX_ROLE_ORDER.indexOf(role) + 1]
    mixLearnRole.value = next ?? null
    if (!next) mixLearn.value = false
  }
  function mixMapReset() {
    mixMap.value = {}
    saveMixMap({})
    s.display = 'MIDImix map: factory'
  }
  watch(mixMap, () => { mixSent = null; pushMixLeds() })
  watch(mixRig, on => {
    if (on) mixRigOn(); else mixRigOff()
  }, { immediate: true })
  // (A controller is Rig, Perform or Live in a set: one role at a time, so a Live one is never the Rig's.)
  let mixReinit = null
  watch(() => mixOutput.value?.id, id => {
    clearTimeout(mixReinit)
    if (id && mixRig.value) mixReinit = setTimeout(mixRigOn, 400)
  })
  onScopeDispose(() => { clearTimeout(mixReinit); mixRigOff() })

  // ── Rig keys: hardware buttons ("Ableton Live mode"), learned ─────────────
  // All: both controllers — off remembers which were on, on puts them back (both by default).
  // LP / Mix: that controller only.
  const toggleBindings = reactive(Object.fromEntries(RIG_TOGGLE_SLOTS.map(k => [k, loadToggle(k)])))
  const learningToggle = ref(null) // the slot being learned, or null
  const TOGGLE_SLOT_LABEL = { all: 'All', lp: 'LP', mix: 'Mix' }
  const LS_TOGGLE_SET = 'SYCORE_RIG_TOGGLE_SET'
  function toggleRigMode() {
    if (lpRig.value || mixRig.value) {
      localStorage.setItem(LS_TOGGLE_SET, JSON.stringify({ lp: lpRig.value, mix: mixRig.value }))
      lpRig.value = false
      mixRig.value = false
      s.display = 'Rig mode off · usual mappings back'
      return
    }
    let set = { lp: true, mix: true }
    try { set = { ...set, ...JSON.parse(localStorage.getItem(LS_TOGGLE_SET) ?? '{}') } } catch {}
    if (!set.lp && !set.mix) set = { lp: true, mix: true }
    lpRig.value = set.lp
    mixRig.value = set.mix
    s.display = 'Rig mode on'
  }
  function toggleSlot(slot) {
    if (slot === 'all') return toggleRigMode()
    if (slot === 'lp') { lpRig.value = !lpRig.value; s.display = `Launchpad Rig ${lpRig.value ? 'on' : 'off'}` }
    else { mixRig.value = !mixRig.value; s.display = `MIDImix Rig ${mixRig.value ? 'on' : 'off'}` }
  }
  function setToggle(slot, b) {
    // One button, one slot: learning it here takes it away from another slot.
    if (b) for (const k of RIG_TOGGLE_SLOTS) if (k !== slot && sameToggle(toggleBindings[k], b)) setToggle(k, null)
    toggleBindings[slot] = b
    saveToggle(b, slot)
  }
  function clearToggle(slot) {
    setToggle(slot, null)
    learningToggle.value = null
  }

  // One exclusive input for the rig: the toggle button, then the controllers in Rig mode.
  function rigIngress(e) {
    const d = e.data
    if (!d || d.length < 2 || d[0] >= 0xF0) return false
    const name = e.target?.name
    if (learningToggle.value) {
      const b = learnToggle(name, d)
      if (b) {
        const slot = learningToggle.value
        setToggle(slot, b)
        learningToggle.value = null
        s.display = `Rig key ${TOGGLE_SLOT_LABEL[slot]}: ${toggleLabel(b)}`
        return true
      }
    }
    if (mixLearn.value && isMidimixName(name)) {
      mixLearnMessage(d)
      mixLastIn.value = `${hex(d)} → learn`
      return true
    }
    for (const slot of RIG_TOGGLE_SLOTS) {
      const t = matchToggle(toggleBindings[slot], name, d)
      if (t) { if (t === 'press') toggleSlot(slot); return true }
    }
    if (lpActive() && isLaunchpadName(name)) { onLaunchpadMidi(d); return true }
    if (mixActive && isMidimixName(name)) { onMidimixMidi(d); return true }
    if (isMidimixName(name)) mixLastIn.value = `${hex(d)} → Rig off (${name})`
    return false
  }
  midiService.setExclusiveInput(rigIngress)
  onScopeDispose(() => midiService.setExclusiveInput(null))

  /** The Sync button: whose Trigger sync it cycles (the focused lane, or all with Global) and its value. */
  const syncButton = computed(() => {
    const global = syncSettings.scope === 'global'
    const v = global ? syncSettings.global : focused.value.opts.triggerSync
    return {
      text: `${global ? 'All' : focused.value.label} ${SYNC_SHORT[v] ?? v}${syncSettings.startOnly ? ' ⇥' : ''}`,
      title: `Trigger sync of ${global ? 'every lane (Global)' : focused.value.label}: ${TRIGGER_SYNC_OPTIONS.find(o => o.value === v)?.label ?? v}${syncSettings.startOnly ? ' · start only (a switch / stop at the end of the slot)' : ''} — click to cycle`,
    }
  })

  return {
    uiStore,
    s,
    focusApp,
    flowConfig,
    FLOW_CONFIGS,
    LS_MODE,
    mode,
    live,
    drumStore,
    captures,
    LS_SMODE,
    sMode,
    toggleSMode,
    onCapt,
    onCapturePadClick,
    captSetName,
    captSetPick,
    onSaveSet,
    onLoadSet,
    onDeleteSet,
    onCapturePad,
    chordStore,
    seqStore,
    laneStores,
    arpStore,
    clockStore,
    linkStore,
    playOn,
    midiStore,
    transportManager,
    playAll,
    stopAll,
    syncStore,
    syncLive,
    lastDensity,
    setLaneRow,
    densityRow,
    arpKnobs,
    knobLabel,
    knobValue,
    knobTitle,
    lastArp,
    mirrorArp,
    songLib,
    songRun,
    openMenu,
    densityMenu,
    muteScopes,
    appCables,
    toggleScope,
    clearScope,
    effectiveScopes,
    muteWhat,
    intensityModes,
    setIntensityMode,
    intensityOpts,
    mixer,
    LS_FADES,
    fadeSettings,
    fade,
    setFade,
    runFades,
    startRamps,
    barMsNow,
    laneFadeSettings,
    fadeIn,
    fadeOut,
    fadesOpen,
    LS_CH_FADES,
    chFadeSettings,
    chValue,
    FADE_LANES,
    fadeLanes,
    allChKeys,
    NO_CH_FADE,
    chFadeOf,
    sendCh,
    runChRamps,
    startChRamps,
    chFadeIn,
    primeFades,
    resetAllVolumes,
    chFadeOut,
    resetFades,
    fadedApps,
    appOfSource,
    fadedGlobal,
    cc7Sent,
    laneCh,
    appChannel,
    sendCc7,
    flushCc7,
    djHeld,
    djSend,
    djStart,
    djEnd,
    velocityReadout,
    liveLoop,
    endLiveLoop,
    followingLive,
    arming,
    playName,
    startArmed,
    playingSlots,
    offLiveGrid,
    restartTimer,
    BAR_STOP_CLEAR_MS,
    nextBarLine,
    clearBarStop,
    stopAtBarEnd,
    offStopGateGrid,
    countedPlay,
    togglePlay,
    notConnected,
    setTempo,
    tap,
    tempoRound,
    tempoStep,
    tempoKnob,
    tempoDrag,
    HOLD_MS,
    holding,
    holdTimers,
    holdStart,
    holdEnd,
    doPanic,
    doInt,
    onSlotDown,
    rigWait,
    LS_SYNC,
    syncSettings,
    trigOf,
    reloadRigSettings,
    dmPartRow,
    endOfSlot,
    songSyncTime,
    songBarOf,
    cancelWait,
    waitPad,
    padState,
    selectSlot,
    GEN_ROWS,
    genOn,
    onSlotUp,
    genCount,
    cpGenKey,
    onGenerate,
    onRowFill,
    onFill,
    onSection,
    syncSection,
    repeaterOn,
    repeaterOff,
    toggleSeqFree,
    toggleShift,
    gridRunning,
    muteLane,
    toggleGenMode,
    focused,
    setFocus,
    anySolo,
    cycleSync,
    onRigAction,
    rigLinkState,
    chordQueuedSlot,
    mappingStore,
    learnMenu,
    learnedRing,
    LS_RIG_TPL,
    tplLeds,
    ledBlink,
    stopBlink,
    ledSent,
    sendRigLed,
    rigLeds,
    saveTplLeds,
    tplDevice,
    tplMsg,
    tplFile,
    inputNames,
    refreshInputs,
    mappedDevices,
    tplDevices,
    tplCount,
    sendInit,
    exportTemplate,
    importTemplate,
    clearTemplate,
    isRigApp,
    OPTION_GROUPS,
    optLabel,
    optHint,
    PRESS_SHORT,
    MOTION_SHORT,
    SYNC_SHORT,
    rowBadge,
    queueOrder,
    sectionHasContent,
    lanePageOffset,
    LP_PERF_LABELS,
    CHAIN_PADS,
    CHAIN_SHORT,
    CHAIN_NAME,
    seqLaneStores,
    laneHasChain,
    chainOn,
    chainEmpty,
    toggleChain,
    songOf,
    songFilled,
    songLanesOn,
    songChains,
    launchLanes,
    songTargets,
    songVolumes,
    songChordSteps,
    songDrumDensity,
    songStep,
    songStepNow,
    rigOutBars,
    songFadeOutTo,
    songRestoreLevels,
    songClipLine,
    songFadeLine,
    songFrame,
    songLanesKey,
    songChordCounts,
    songNameKeys,
    rigSlotName,
    songIdle,
    currentSong,
    appsIdle,
    syncMaterial,
    songOwn,
    songCapture,
    playSong,
    stopSong,
    holdSong,
    jumpSong,
    SLOT_CLASS,
    LED_CLASS,
    btn,
    btnIdle,
    btnOn,
    FILL_CLASS,
    fillClass,
    lpTop,
    lpPad,
    latchPad,
    toggleLatch,
    lpSide,
    lpTopDown,
    lpTopUp,
    toggleFollowPlay,
    toggleAutoFill,
    AUTOFILL_BARS,
    autoFillEvery,
    cycleAutoFillEvery,
    toggleFillWhen,
    lpPadDown,
    lpPadUp,
    lpSideDown,
    lpSideUp,
    offRigLink,
    keyText,
    onKeyShift,
    onKeyMode,
    lpOutput,
    LS_LP_PORT,
    lpName,
    lpRig,
    lpLeds,
    lpPort,
    lpSend,
    pushLeds,
    onLaunchpadMidi,
    lpActive,
    lpRigOn,
    lpRigOff,
    mixPage,
    laneParams,
    macros,
    mixStrips,
    mixOutput,
    LS_MIX_PORT,
    mixName,
    mixRig,
    mixPickup,
    mixMap,
    mixLeds,
    mixPort,
    mixLastOut,
    mixSend,
    pushMixLeds,
    mixTake,
    mixLastIn,
    hex,
    onMidimixMidi,
    mixRigOn,
    mixRigOff,
    MIX_LEARN_ROWS,
    MIX_MASTER_ROLES,
    MIX_ROLE_ORDER,
    mixLearn,
    mixLearnRole,
    mixRoleLabel,
    mixRoleLearned,
    mixLearnMessage,
    mixMapReset,
    toggleBindings,
    learningToggle,
    TOGGLE_SLOT_LABEL,
    LS_TOGGLE_SET,
    toggleRigMode,
    toggleSlot,
    setToggle,
    clearToggle,
    rigIngress,
    syncButton,
  }
}
