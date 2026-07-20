# MIDI FLOW CONTROL

Other then the registered devices that represents physical/virtual devices (controllers,sound engines, synthesized, etc.), there are some SY.CORE apps that can receive MIDI messages from registered devices (typically from MIDI controllers like keyboards)

It would be a good idea to add this APPS in the MIDI FLOW with also a MIDI IN - MIDI OUT? In this way the user can control also which pysical device can send MIDI to the SY.CORE apps.

Considering this new implementation in case of MIDI NOTE messages could be possible also to set filters (like keyboard split)?

---

## Phase 0 — Documentation Discovery (findings)

Two Explore passes read the actual ingress pipeline (`midi-service.ts`), the routing store (`useMidiStore.ts`), all five apps named as candidates, and every existing "split"/zone/range concept, before any design was proposed.

### Current state — no real "device → app" input routing exists

`midiService.addNoteListener(cb)` ([src/core/midi/midi-service.ts:291](/src/core/midi/midi-service.ts#L291)) is a flat, unfiltered broadcast: every subscriber gets every note-on/off from every connected input, fired from `handleIngress` ([src/core/midi/midi-service.ts:817-821](/src/core/midi/midi-service.ts#L817-L821)) with `inputId` (the WebMIDI `MIDIInput.id`) passed through but not filtered centrally. `MidiSource` ([src/types/midi.ts:64-72](/src/types/midi.ts#L64-L72)) is only ever used as an **outbound** send label, never as an input-routing key.

Six consumers of this broadcast, each currently gating differently — **not one of them is correct/consistent, and this plan replaces all six with the same real check**:

| Consumer | File:lines | Current gate | Verdict |
|---|---|---|---|
| Sound Engine (S-1 / UI-Preview) | [useMidiCCListener.js:352-370](/src/composables/useMidiCCListener.js#L352-L370) | channel only (`midiStore.midiChannel`/`midiInputChannel`); `inputId` param present but unused | No device gating at all — this is the case the user already flagged needs "configuring in the MIDI FLOW" |
| Virtual Keyboard | `VirtualKeyboard.vue:196-205` | `props.inputChannel` only | No device gating at all |
| Arpeggiator | `ArpeggiatorPanel.vue:45-69,314-320` | reuses **output** `routingMatrix[inputName]`, checks for overlap with `routingMatrix[MidiSource.ARP]`; **fails open** (returns `true`) if the device has no matrix entry | Coincidental heuristic, not real routing, insecure default |
| Step Sequencer | `StepSequencer.vue:982-1056` | same output-matrix-overlap heuristic, hardcoded to `'SEQUENCER'`; **fails closed** | Inconsistent with Arp's fail-open, still not real routing |
| Chord Sequencer | `ChordProgSequencer.vue` | **no `addNoteListener` at all** | Pure output-only today |
| Drum Machine | `DrumMachine.vue` | **no `addNoteListener` at all** | Pure output-only today |

`routingMatrix` itself ([src/stores/useMidiStore.ts:150](/src/stores/useMidiStore.ts#L150), `Record<string, string[]>`) is exclusively an **output** fan-out map (source key → output device names), driven by `setRouting`/`toggleRouting` ([useMidiStore.ts:391-399](/src/stores/useMidiStore.ts#L391-L399)) and by `MidiWizardFlow.vue`'s `finish()`. There is no inverse "device → app" structure anywhere.

`midiInputChannel` ([useMidiStore.ts:91](/src/stores/useMidiStore.ts#L91), persisted at `LS_IN_CHANNEL`) is a single global MIDI channel filter (-1 = OMNI), with no device identity — confirmed unrelated to per-device/per-app routing.

### Existing "split" concept — real, but wrong direction, not reusable as-is

`SplitConfig` ([src/types/midi.ts:37-44](/src/types/midi.ts#L37-L44)):
```ts
export interface SplitConfig {
  enabled: boolean; splitNote: number;
  lowDevice: string; highDevice: string;
  lowTranspose: number; highTranspose: number;
}
```
Wired into `midiService.sendNoteOn`/`sendNoteOff` ([midi-service.ts:345-359](/src/core/midi/midi-service.ts#L345-L359)) via `sendNoteSplit` ([midi-service.ts:869-876](/src/core/midi/midi-service.ts#L869-L876)) — but it only fires for `source === MidiSource.KEYBOARD`, and it splits the **Virtual Keyboard's own outgoing** notes across two output devices by pitch. It is not an input filter and is not app-agnostic. It also has **no reachable UI** today (only read-only diagnostics in `UnifiedMidiManager.vue:128-132` and raw JSON backup/restore in `MidiSettingsPanel.vue`) — effectively dead code. `VelocityMappingDialog.vue`, `MidiMappingPanel.vue`, `AppMidiMapper.vue` confirmed to have zero note-range/zone/split concepts (velocity range fields there gate loudness 0-127, not pitch).

**Conclusion**: `SplitConfig`'s *shape* (a note boundary + two named targets) is a reasonable reference for a new per-connection filter, but nothing here is reusable as-is. A device→app input routing table and a per-connection note-range filter are both genuinely new.

### Canvas model (MidiWizardFlow.vue) — confirms the premise exactly

- `MIDI_APPS` array ([MidiWizardFlow.vue:56-64](/src/components/MidiWizardFlow.vue#L56-L64)) — each entry has a `sourceId` (a `MidiSource` value) and an icon.
- On drag from sidebar, app nodes are hardcoded `hasIn: false, hasOut: true` ([MidiWizardFlow.vue:518](/src/components/MidiWizardFlow.vue#L518), inside `onSidebarDragStart` call site).
- The IN port SVG only renders `v-if="!node.sourceId"` — app nodes (which always have `sourceId` set) never get an IN port dot, so a cable can never be dropped onto one today.
- `cables` are generic `{ id, fromId, toId }` — the model already supports any node→node connection; only the port-rendering gate and `finish()`'s per-node-type handling need extending.
- `finish()` ([MidiWizardFlow.vue — rewritten this session](/src/components/MidiWizardFlow.vue)) currently treats every cable destination as a hardware output device (`midiStore.addRegistration(canonicalName)` + `updateRegistration(...)`) — an app node landing in `dstIds` today would incorrectly create a bogus registration under the app's display name. `initFromStore()` already has a defensive `if (appNames.has(reg.name)) { midiStore.removeRegistration(reg.name); continue }` guard ([MidiWizardFlow.vue](/src/components/MidiWizardFlow.vue)) precisely because of this — confirming apps must never flow through the registration/output path.

### Allowed APIs / patterns to copy

| Concern | Source of truth | Citation |
|---|---|---|
| Routing-matrix persistence pattern (watch → localStorage + service sync) | `routingConfig` watcher | [useMidiStore.ts:222-226](/src/stores/useMidiStore.ts#L222-L226) — `watch(routingConfig, (v) => { localStorage.setItem(...); midiService.setRoutingConfig(...) }, { deep: true, immediate: true })` |
| Store action shape for a matrix-style map | `setRouting`/`toggleRouting` | [useMidiStore.ts:391-399](/src/stores/useMidiStore.ts#L391-L399) |
| App consuming a filtered note listener | `useMidiCCListener.js`'s `onNote` | [useMidiCCListener.js:364-374](/src/composables/useMidiCCListener.js#L364-L374) — exact shape to extend with a device check, not replace |
| Canvas node "capability" flags | `hasIn`/`hasOut` already on every node | [MidiWizardFlow.vue:80-92](/src/components/MidiWizardFlow.vue#L80-L92) (`onCanvasDrop`) |
| Canvas per-node settings UI (channel selects, flag toggle buttons) | hardware node card body | [MidiWizardFlow.vue](/src/components/MidiWizardFlow.vue) `FLAGS`/`CHANNELS` rendering — pattern to copy for a new per-cable filter popover, not the same fields |
| Note-range boundary shape (reference only, not reusable code) | `SplitConfig` | [src/types/midi.ts:37-44](/src/types/midi.ts#L37-L44) |

### Anti-patterns to avoid (confirmed by grep, not assumption)

- **Do not reuse the output `routingMatrix` for input routing.** This is exactly the bug already present in `ArpeggiatorPanel.vue`/`StepSequencer.vue` — an "overlap in the output matrix" is not the same fact as "this device's input should reach this app," and it's why Arp fails open and Sequencer fails closed inconsistently today. Build a real, separate input-routing map.
- **Do not extend `SplitConfig` or `sendNoteSplit`.** They're hardcoded to `MidiSource.KEYBOARD` and to the *outbound* path — wrong direction for this feature entirely.
- **Do not let app nodes flow through `finish()`'s registration/`setRouting` path when they're a cable's *destination*.** They aren't WebMIDI ports; `initFromStore()`'s existing app-name cleanup guard is direct evidence of what goes wrong if they leak into `registrations`.
- **Do not add a new device-filtering parameter to `midiService.addNoteListener`'s central dispatch** unless a phase explicitly justifies it — the six consumers already call `addNoteListener` themselves and layer their own gate inline (`onNote`, `isMidiDeviceAllowed`, etc.); the minimal-diff fix is to correct what each gate checks, mirroring the existing per-consumer-gate architecture rather than centralizing it.

---

## Phase 1 — Data model: real device→app input routing

**What to implement**: a new store map in [`src/stores/useMidiStore.ts`](/src/stores/useMidiStore.ts), structurally modeled on `routingMatrix` ([useMidiStore.ts:150](/src/stores/useMidiStore.ts#L150)) but inverted (keyed by **input device name**, values are the apps it feeds) and carrying an optional per-connection note-range filter (the "keyboard split" ask):

```ts
export interface InputRouteFilter {
  lowNote?: number   // 0-127; omitted/undefined = 0 (no lower bound)
  highNote?: number  // 0-127; omitted/undefined = 127 (no upper bound)
}
export interface InputRouteEntry {
  app: string             // a MidiSource value, e.g. MidiSource.SEQUENCER
  filter?: InputRouteFilter
}

const inputRouting = ref<Record<string, InputRouteEntry[]>>(loadInputRouting())
```

Persistence — copy the `routingConfig` watcher pattern exactly ([useMidiStore.ts:222-226](/src/stores/useMidiStore.ts#L222-L226)), new localStorage key `SYCORE_INPUT_ROUTING`:
```ts
watch(inputRouting, (v) => {
  localStorage.setItem(userKey('SYCORE_INPUT_ROUTING'), JSON.stringify(v))
}, { deep: true, immediate: true })
```

Store actions (mirror `setRouting`'s signature style, [useMidiStore.ts:391](/src/stores/useMidiStore.ts#L391)):
```ts
function setInputRouting(deviceName: string, entries: InputRouteEntry[]) {
  inputRouting.value[deviceName] = entries
}

function isDeviceRoutedToApp(deviceName: string, appSourceId: string, note?: number): boolean {
  const entries = inputRouting.value[deviceName]
  // No explicit routing configured for this device yet = legacy "open to
  // everything" default. Preserves today's zero-config behavior (every app
  // that already worked without MIDI FLOW keeps working) until the user
  // wires at least one explicit cable for that specific device, at which
  // point it becomes exclusive to what's wired.
  if (!entries || entries.length === 0) return true
  const entry = entries.find(e => e.app === appSourceId)
  if (!entry) return false
  if (note == null || !entry.filter) return true
  const lo = entry.filter.lowNote  ?? 0
  const hi = entry.filter.highNote ?? 127
  return note >= lo && note <= hi
}
```

**Design decision baked into this phase** (flagging explicitly, per the skill's "verify > assume" principle — confirm before Phase 2 if this default should instead be opt-out or fully explicit): the fail-open default on *no entries* was chosen to avoid breaking existing users who've never opened MIDI Flow, matching the (buggy but existing) fail-open precedent in `ArpeggiatorPanel.vue`. Once ANY cable is wired from a given device, that device's routing becomes exclusive/explicit for every app — including apps it wasn't previously reaching.

**Verification checklist**:
- [ ] `npm run test` — new Vitest unit tests for `isDeviceRoutedToApp` covering: no entries (open), entries but no match (closed), entries with match no filter (open), entries with filter in/out of range.
- [ ] Confirm `inputRouting` round-trips through `localStorage` on reload (mirrors existing `routingConfig` persistence test pattern if one exists, else a new one matching its shape).

**Anti-pattern guards**: do not merge this into `routingMatrix` (different direction, different consumers — see Phase 0's anti-pattern note); do not touch `SplitConfig`/`sendNoteSplit`.

---

## Phase 2 — Canvas: app nodes get a real IN port

**What to implement**: extend [`MidiWizardFlow.vue`](/src/components/MidiWizardFlow.vue) so every `MIDI_APPS` entry can be a cable *destination*, not just a source.

1. Sidebar drag payload ([MidiWizardFlow.vue:518](/src/components/MidiWizardFlow.vue#L518)): change `hasIn: false` → `hasIn: true` for app entries. (Keep `hasOut: true` — apps stay dual-capable, matching hardware nodes' existing IN+OUT duality.)
2. IN port SVG: currently gated `v-if="!node.sourceId"` (hardware only). Change the gate to render for both hardware nodes and app nodes — i.e., drop the `sourceId` exclusion, since app nodes now legitimately have an IN port too. Copy the exact SVG markup/positioning already used for hardware ([MidiWizardFlow.vue](/src/components/MidiWizardFlow.vue) — the `<svg v-if="!node.sourceId">...circle stroke="#3b82f6"...` block), don't invent new port visuals.
3. `onInPortMouseup`/cable creation logic is already generic (`fromId`/`toId` by node id) — no change needed there.
4. `initFromStore()`'s app-node reconstruction ([MidiWizardFlow.vue](/src/components/MidiWizardFlow.vue), the `MIDI App nodes` loop) currently only ever places apps in `sourceNodes`. Extend it to also read `inputRouting` (Phase 1) and add incoming cables from any device routed to that app, mirroring exactly how the existing loop rebuilds cables from `routingMatrix` (`for (const [sourceKey, outputNames] of Object.entries(matrix))`) — same pattern, new source map.

**Verification checklist**:
- [ ] Drag a MIDI App onto the canvas — confirm both an OUT port (right) and a new IN port (left) render.
- [ ] Drag a cable from a hardware device's OUT port to an app's new IN port — confirm the cable draws and persists (`cables.value` gets a `{fromId: <device node>, toId: <app node>}` entry).
- [ ] Reload the panel (`reloadConfig`) — confirm the device→app cable is reconstructed from the persisted `inputRouting` map, same as existing output cables reconstruct from `routingMatrix`.

**Anti-pattern guards**: don't add a second/different port visual for apps — reuse the hardware IN port SVG verbatim so the canvas stays visually consistent (per Phase 0's citation).

---

## Phase 3 — `finish()`: route device→app cables into `inputRouting`, not `registrations`

**What to implement**: extend `finish()` in [`MidiWizardFlow.vue`](/src/components/MidiWizardFlow.vue) (already reworked this session to walk every `canvasNodes` entry, per the "clear stale routing on disconnect" fix) to branch cable handling by destination type:

- Existing behavior (cable → hardware destination): unchanged — `addRegistration`/`updateRegistration`/`setRouting` exactly as today.
- **New**: cable → app destination (`dst.sourceId` is set): do **not** call `addRegistration`/`updateRegistration`/`setRouting` for it (per Phase 0's anti-pattern — apps must never leak into `registrations`). Instead, group these by *source device* and call `midiStore.setInputRouting(deviceName, entries)` once per device, where `entries` carries each connected app's `sourceId` plus its filter (Phase 4's UI writes the filter onto the cable object; Phase 3 just needs to read `cable.filter` if present and forward it).

Since `finish()`'s existing loop is keyed by *source* node and walks its `dstIds`, the natural split is: for each source node, partition `dstIds` into hardware destinations (existing path, unchanged) vs. app destinations (new path) before building `outputNames`/`inputRouting` respectively — same loop, two accumulator branches instead of one.

**Verification checklist**:
- [ ] Wire device→app cable, confirm `midiStore.routingConfig.registrations` gains **no** entry for the app's display name (regression guard for the exact bug `initFromStore()`'s existing cleanup line was defending against).
- [ ] Confirm `midiStore.inputRouting[deviceName]` contains the app's `sourceId` after auto-apply fires (this session's auto-apply watcher already covers "any canvas change" — no new watcher needed, just confirm the new branch is included in what it triggers).
- [ ] Disconnect the cable, confirm `inputRouting[deviceName]` clears that app entry (mirrors the disconnect-clears-stale-routing fix already made to the hardware path this session).

**Anti-pattern guards**: do not call `midiStore.addRegistration` for any node with `sourceId` set, at any point in this phase.

---

## Phase 4 — Note-range filter UI ("keyboard split")

**What to implement**: a minimal per-cable filter editor, only reachable on device→app cables (hardware→hardware cables keep today's click-to-delete behavior unchanged).

1. Extend the cable object shape from `{ id, fromId, toId }` to `{ id, fromId, toId, filter?: { lowNote, highNote } }`.
2. Cable click handler (currently unconditional `removeCable(cable.id)` on click): branch — if the cable's destination node has `sourceId` set (an app), open a small inline popover instead of deleting; keep delete-on-click for hardware-to-hardware cables as today. Provide an explicit small "✕ remove" affordance inside the popover for deleting a filtered cable, since click-to-delete is repurposed for editing on these.
3. Popover content: two number inputs, "Low Note" / "High Note" (0-127), positioned at the cable's midpoint (reuse the existing `bezier()`/cable-path midpoint math already computed for drawing, don't add a second coordinate system).
4. On change, write into the cable's `filter` field — this flows into Phase 3's `finish()` → `inputRouting` automatically via the existing auto-apply watcher (no new watcher needed).

**Verification checklist**:
- [ ] Click a device→app cable — popover opens with Low/High Note inputs (default 0/127, i.e., unfiltered).
- [ ] Set a split (e.g., Low=0/High=59 to one app, Low=60/High=127 to a second app from the same device) — confirm `inputRouting[deviceName]` carries both entries with their respective filters.
- [ ] Click a hardware→hardware cable — confirm it still deletes on click (unchanged, regression guard).

**Anti-pattern guards**: do not touch `SplitConfig`/`sendNoteSplit` — this is a parallel, unrelated concept scoped to canvas cables, not the Virtual Keyboard's outbound split.

---

## Phase 5 — Wire the six consumers to the real gate

**What to implement**: replace each of the six ad-hoc/missing gates found in Phase 0 with a call to `midiStore.isDeviceRoutedToApp(deviceName, appSourceId, note)` (Phase 1). This is a **mechanical replacement**, not a rewrite — every consumer already has (or, for the two missing ones, needs) an `addNoteListener` callback; only the boolean condition inside changes.

- **Sound Engine** — [useMidiCCListener.js:364-370](/src/composables/useMidiCCListener.js#L364-L370): add `isDeviceRoutedToApp(deviceNameFromInputId(inputId), MidiSource.UI, note)` to the existing `isControl`/`isInput` condition. (Resolving `inputId` → device name: copy whatever lookup `ArpeggiatorPanel.vue`'s existing `isInputDeviceRoutedToArpeggiator` already does via `midiService.midiAccess` — cited in Phase 0 — rather than inventing a new lookup.) This is the case that ties directly back to the earlier "S-1 routing has to be configured in the MIDI FLOW" conversation.
- **Virtual Keyboard** — add the same check to its existing channel gate.
- **Arpeggiator** — *replace* `isInputDeviceRoutedToArpeggiator`'s body with a call to the new store function (delete the old output-matrix-overlap heuristic entirely — it's superseded, not supplemented).
- **Step Sequencer** — same replacement for `isMidiDeviceAllowed`.
- **Chord Sequencer** — *new* `addNoteListener` subscription, copying `StepSequencer.vue`'s existing subscribe/unsubscribe lifecycle shape (`onMounted`/`onUnmounted`), gated by the new function from the start (no legacy heuristic to remove, since none exists).
- **Drum Machine** — same as Chord Sequencer.

**Verification checklist**:
- [ ] For each of the six, confirm: with no `inputRouting` entry for a device, behavior is unchanged from today (legacy open default).
- [ ] Wire one explicit device→app cable via the canvas, confirm only that device now reaches that app (and, per the fail-open-until-first-wire design, other *unwired* devices still reach it too, since the app itself has no entries keyed by them).
- [ ] Set a note-range filter (Phase 4) on one cable, confirm notes outside the range are silently dropped for that app while still reaching any other app it's also wired to (or none, if unfiltered).

**Anti-pattern guards**: do not centralize this into `midi-service.ts`'s `addNoteListener` dispatch itself — per Phase 0's anti-pattern note, keep the gate inline at each existing call site, matching the current (if previously buggy) per-consumer-gate architecture.

---

## Phase 6 — Final Verification

1. `npm run test` — Phase 1's unit tests plus no regressions elsewhere.
2. `grep -rn "isInputDeviceRoutedToArpeggiator\|isMidiDeviceAllowed" src/` — confirm both old heuristics are gone (replaced, not left dangling) or, if kept as thin wrappers, that they delegate to `isDeviceRoutedToApp` rather than duplicating logic.
3. `grep -n "addRegistration" src/components/MidiWizardFlow.vue` — confirm it's never called with an app's `sourceId`/display name (Phase 3's core guard).
4. Manual end-to-end in a Chromium dev build:
   - Wire a hardware controller → Step Sequencer in MIDI Flow, confirm notes reach the sequencer and *only* the sequencer (not, e.g., Drum Machine, if unwired).
   - Set a keyboard split (low notes → Bass-ish app, high notes → Lead-ish app) from one controller, confirm both destinations receive only their half of the range.
   - Confirm a controller with zero explicit MIDI Flow wiring still drives the Sound Engine exactly as it does today (legacy default preserved).