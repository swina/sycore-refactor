// Live external audio input (USB instrument, line-in, mic) -- see
// docs/plans/Sycore-DSP-Integration-Feasibility.md's "Extension: live
// external-input source" section. A single, continuously-open channel,
// unlike drum-engine.js/sampler-engine.js's per-pad arrays -- reuses the
// same DSP modules (filter, FX chain, Modulation Matrix) those engines
// already use.
//
// Chain: UserMedia → Filter → fxChain → Panner → Gain(level) → Limiter → destination
//
// Everything here is a Tone.js node (UserMedia has no native buffer-source
// stage the way sample playback does), so there's no native/Tone connect
// boundary to work around -- every `.connect()` below is Tone→Tone.
//
// Only the Modulation Matrix's LIVE sources (lfo1/lfo2) apply to this
// engine -- `velocity` is a one-time, resolved-at-note-on source with no
// equivalent here (a continuously-open input has no note-on), so
// setModMatrix()'s slots are filtered before reaching applyModMatrix() and
// applyVelocityModulation() is never called from this file.
import { getContext, UserMedia, Filter, Panner, Gain, Limiter, Meter } from 'tone'
import { EffectChain, blankFxChain } from '../core/audio/effects'
import { resonanceToQ, resonanceToGainDb, safeCutoffHz } from '../core/audio/filterMath'
import { applyModMatrix } from '../core/audio/modMatrix'
import { useLfoStore } from '@/stores/useLfoStore'

let _mic = null
let _filter = null
let _fxChain = null
let _panner = null
let _levelGain = null
let _limiter = null
let _meter = null

let _lfo1Signal = null
let _lfo2Signal = null

// True dialed-in baselines -- see core/audio/modMatrix.ts's ModMatrixTargets
// doc comment for why these can't just be read back off the live nodes
// once a modulation cable has connected to them.
let _filterFreq = 20000
let _filterType = 'lowpass'
let _filterResonance = 0
let _levelValue = 0.85
let _panValue = 0
let _fxWetDry = 100

let _modMatrixSlots = []
let _modMatrixCables = []

function _ensureGraph() {
  if (_mic) return

  const lfoStore = useLfoStore()
  _lfo1Signal = lfoStore.lfo1Signal
  _lfo2Signal = lfoStore.lfo2Signal

  _mic = new UserMedia()

  _filter = new Filter({ frequency: _filterFreq, type: _filterType, Q: resonanceToQ(_filterResonance) })

  _fxChain = new EffectChain()
  _fxChain.rebuild(blankFxChain())

  _panner = new Panner(_panValue)
  _levelGain = new Gain(_levelValue)
  // Safety limiter -- an external instrument/interface is far more likely
  // to clip than a controlled sample, unlike drum/sampler's own signal.
  _limiter = new Limiter(-3)
  _meter = new Meter({ normalRange: true })

  _mic.connect(_meter)
  _mic.connect(_filter)
  _filter.connect(_fxChain.input)
  _fxChain.output.connect(_panner)
  _panner.connect(_levelGain)
  _levelGain.connect(_limiter)
  _limiter.toDestination()
}

export function initLiveInputEngine() {
  _ensureGraph()
}

// Labels only populate once permission has been granted at least once
// (i.e. after the first successful open()) -- browsers withhold device
// labels from enumerateDevices() until then, this is a Web platform
// constraint, not something this engine can work around.
export async function listInputDevices() {
  return UserMedia.enumerateDevices()
}

// deviceIdOrLabel: omit for the default input device. Throws if the user
// denies permission or no matching device exists -- caller should catch.
export async function openInput(deviceIdOrLabel) {
  _ensureGraph()
  await _mic.open(deviceIdOrLabel)
}

export function closeInput() {
  _mic?.close()
}

export function isInputOpen() {
  return _mic?.state === 'started'
}

export function getInputDeviceLabel() {
  return _mic?.label
}

// 0-1 RMS of the raw (pre-filter/FX) input signal, for a UI level meter.
export function getInputLevel() {
  return _meter?.getValue() ?? 0
}

export function setLevel(level) {
  const v = Math.max(0, Math.min(1.5, level))
  _levelValue = v
  if (_levelGain) _levelGain.gain.value = v
}

export function setPan(pan) {
  const v = Math.max(-1, Math.min(1, pan))
  _panValue = v
  if (_panner) _panner.pan.value = v
}

export function setFilter(freq) {
  const v = safeCutoffHz(freq)
  _filterFreq = v
  if (_filter) _filter.frequency.value = v
}

export function setFilterType(type) {
  _filterType = type
  if (!_filter) return
  _filter.type = type
  _filter.gain.value = resonanceToGainDb(type, _filterResonance)
}

export function setFilterResonance(resonance) {
  _filterResonance = resonance
  if (!_filter) return
  _filter.Q.value = resonanceToQ(resonance)
  _filter.gain.value = resonanceToGainDb(_filterType, resonance)
}

export function setFx(fxChain) {
  _fxWetDry = fxChain?.wetDry ?? 100
  _fxChain?.rebuild(fxChain)
}

function _makeModMatrixTargets() {
  return {
    filter: _filter,
    padGain: _levelGain,
    panner: _panner,
    fxChain: _fxChain,
    lfo1Signal: _lfo1Signal ?? undefined,
    lfo2Signal: _lfo2Signal ?? undefined,
    baseValues: {
      filterFreq: _filterFreq,
      filterQ: resonanceToQ(_filterResonance),
      ampVolume: _levelValue,
      ampPan: _panValue,
      wetDryMix: _fxWetDry,
    },
  }
}

// Rebuilds this channel's LIVE modulation cables (lfo1/lfo2 sources only --
// `velocity` slots are dropped here since there's no note-on for a
// continuously-open input to resolve one against). Editing-time operation,
// like setFx() -- not a hot path.
export function setModMatrix(slots) {
  _modMatrixSlots = (slots ?? []).filter(s => s.source !== 'velocity')
  for (const d of _modMatrixCables) d.dispose()
  _modMatrixCables = applyModMatrix(_modMatrixSlots, _makeModMatrixTargets())
}

export function dispose() {
  closeInput()
  for (const d of _modMatrixCables) d.dispose()
  _modMatrixCables = []
  _mic?.dispose()
  _filter?.dispose()
  _fxChain?.dispose()
  _panner?.dispose()
  _levelGain?.dispose()
  _limiter?.dispose()
  _meter?.dispose()
  _mic = _filter = _fxChain = _panner = _levelGain = _limiter = _meter = null
}
