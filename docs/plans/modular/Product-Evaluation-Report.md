# SY.CORE — Competitive Product Evaluation

*Prepared per the brief in [Product-Evaluation.md](./Product-Evaluation.md). Role: Senior B2B/Prosumer Music-Tech Product Manager.*

**Context:** SY.CORE is a browser-based, local-first performance tools & sound design ecosystem for electronic musicians — MIDI orchestration (routing, mapping, hardware actions), sound design (Roland S-1 patch/preset management), audio tools (looper, sampler, samples machine), and live performance (step sequencer, drum machine, chord sequencer, live pads), all running as a PWA with no install, no drivers, and offline-first persistence.

Because SY.CORE straddles three categories at once (MIDI routing utility, hardware preset librarian, live-performance sequencer suite), no single product matches it feature-for-feature. The two competitors below were chosen because each dominates one side of that overlap and together they bracket the realistic buying decision a target user faces:

- **Competitor A — Ableton Live** (Standard/Suite): the default choice for live-performance sequencing, looping, and hardware synth integration.
- **Competitor B — Bome MIDI Translator Pro**: the established specialist tool for MIDI routing, mapping, and hardware-to-action control — the closest analogue to SY.CORE's Flow/Mapping/Actions modules.

---

## 1. Strategic Positioning

| Dimension | SY.CORE | Ableton Live | Bome MIDI Translator Pro |
|---|---|---|---|
| **Value proposition** | Unified hub: routing + hardware preset management + live performance, purpose-built around hardware synths (esp. Roland AIRA) | Full production + performance DAW; hardware is one input among many | Deep, scriptable MIDI routing/translation utility; not a music-making tool itself |
| **Ease of use** | Visual, drag-and-drop canvas (Flow) for routing; no signal-flow/DAW learning curve | Powerful but has a real learning curve (session view, routing, device racks) | Powerful for power users; rule/script-based config is not visual and has a steep curve for non-technical users |
| **Pricing** | Free/low-cost web app (per SY.CORE model) | Intro €79 / Standard €349 / Suite €599 (one-time, per major version) | ~US$90–95 one-time license |
| **Install friction** | Zero — runs in-browser, PWA, auto-updates | Full desktop install, license activation, updates to manage | Desktop install (Win/macOS), license activation |

**Sources:** [Ableton pricing](https://www.audeobox.com/learn/compare/ableton-pricing-guide/), [Bome MIDI Translator Pro](https://www.bome.com/products/miditranslator), [Bome pricing](https://www.muziker.com/bome-midi-translator-pro)

SY.CORE's positioning is "the layer between your gear and the performance" rather than "the place where you produce" (Ableton) or "the plumbing between MIDI devices" (Bome) — it's priced and delivered like a utility but scoped like a performance rig.

---

## 2. Feature Comparison Matrix

| Feature | Our Product (SY.CORE) | Competitor A (Ableton Live) | Competitor B (Bome MIDI Translator Pro) | Winner / Verdict |
|---|---|---|---|---|
| **Visual MIDI routing/patching** | Flow canvas: drag-and-drop device↔app / app↔app routing, note-range splits, multi-channel fanout, saved configs | No dedicated visual patch canvas; routing is done via I/O dropdowns and device racks per track | Rule-based routing engine (very powerful) but no visual canvas — configured via forms/rules list | **SY.CORE** — only one with a true visual patch-cable UX |
| **Hardware preset/patch management** | Unlimited preset library, generative patch creation, per-device Program Change banks, external preset import (e.g. E-MU exports) | None — Live has no concept of managing a hardware synth's onboard patch memory | None — Bome doesn't manage synth patches at all | **SY.CORE** — unmatched; closest alternatives are single-purpose 3rd-party editors (e.g. Momo's S-1 Editor VST) with no library/routing integration |
| **Integrated live-performance toolkit** (sequencer, drum machine, looper, sampler, live pads) | Step Sequencer, Chord Progression Sequencer, Drum Machine, 8-track Looper, 7-pad Sampler, Live Pad, Live Timeline — all in one workspace | Session View, Ableton's own looper, Simpler/Sampler, extensive clip/scene launching — mature and battle-tested on stage worldwide | None — Bome has no sequencing, sampling, or performance surface at all | **Ableton Live** — most mature/proven under real stage conditions; SY.CORE is competitive in breadth but earlier-stage (several modules marked Beta) |
| **Zero-install / cross-platform delivery** | Runs in any Chromium browser, PWA installable, no drivers, auto-updates, offline-first | Full installer, license dongle/activation history, per-OS builds to maintain | Full installer per OS, license activation | **SY.CORE** — but this moat depends entirely on Chromium; Safari/Firefox lack Web MIDI support outright |
| **Pricing / cost to entry** | Free or low one-time/subscription cost (per current SY.CORE model) | €79–€599 per major version | ~US$90–95 one-time | **SY.CORE** on pure cost; Bome close second given narrower scope |

**Sources:** [Ableton Live MIDI fact sheet](https://www.ableton.com/en/live-manual/12/midi-fact-sheet/), [Bome MIDI Translator Pro](https://www.bome.com/products/miditranslator), [Roland S-1 Editor (Momo)](https://www.kvraudio.com/product/roland-aira-compact-s-1-tweak-synth-editor-and-soundbank-as-vst-and-standalone-version-by-momo)

---

## 3. Gaps — Where We Fall Behind

- **Audio production depth.** No audio effects processing chain (EQ, compression, reverb, time-stretch/warp), no multitrack arrangement/mixdown, no plugin (VST/AU) hosting. Ableton users who want to also record and mix a track will still need a DAW alongside — or instead of — SY.CORE.
- **Stage-proven maturity.** Several of SY.CORE's performance modules (Audio Looper, Sampler) are explicitly Beta; Ableton's Session View and looping have over a decade of live-performance hardening. "Must-have" for touring musicians: predictable behavior under stress (no dropped clock, no crashed tab mid-set).
- **System-level control.** Bome MIDI Translator Pro can emulate keystrokes/mouse events and control *any* software on the machine via MIDI — SY.CORE's Actions module is scoped to its own app features only. Users who want a hardware controller to drive their whole rig (DAW transport, other apps, OS-level shortcuts) still need Bome or similar alongside SY.CORE.
- **Browser/platform lock-in.** Web MIDI is Chromium-only (Chrome/Edge/Opera) — Safari has no Web MIDI support and Firefox's support is inconsistent. This is a structural gap the whole product category shares, but it's a real adoption blocker for Mac/Safari-default users that installed desktop competitors don't have.
- **Cross-device/session portability.** Session state persists in IndexedDB per browser/device; there's no described cloud sync/backup, so a preset library built on one machine doesn't travel with the user the way a licensed desktop install (with cloud-saved projects) can.

---

## 4. Defensible Moats — Where We Outperform

1. **Single-pane hardware hub.** SY.CORE is the only product in this comparison that unifies visual MIDI routing, CC/action mapping, transport sync, and hardware preset management in one workspace. Competitors force a multi-tool stack (Bome for routing + a DAW for performance + a VST editor for patches); SY.CORE replaces all three for hardware-centric performers.
2. **Unlimited preset library beyond onboard hardware memory.** The Roland S-1 (and similar gear) ships with a fixed 64-pattern limit; no competitor addresses this at all. SY.CORE's unlimited library + generative patch creation + per-device Program Change banks is a USP with no direct answer from Ableton or Bome.
3. **Zero-friction distribution.** No install, no license dongle, no driver conflicts, instant updates, PWA offline mode. For a target user evaluating "another piece of software to maintain" against "a URL that always works," this materially lowers the switching cost versus €349–599 desktop software.

---

## 5. Strategic Recommendations — Top 3 Priorities for Next Quarter

1. **Harden the Beta modules (Audio Looper, Sampler) for live reliability.** This directly closes the biggest credibility gap versus Ableton — "will it survive a 45-minute set" is the single most disqualifying question touring musicians will ask. Prioritize over new-feature breadth.
2. **Extend Actions beyond the app boundary (system/DAW-level control).** Adding OS-level keystroke or companion-app control to the existing Actions/Mapping engine directly targets Bome's core use case and turns SY.CORE into a full hardware-controller replacement, not just an in-app one — widening the hub moat identified above.
3. **Accelerate multi-hardware expansion (Arturia MicroFreak and beyond), paired with cloud preset backup/sync.** The preset-management moat is currently Roland-specific and single-device; broadening hardware support (already planned via SY.CORE LAB) while adding cross-device sync directly addresses the "session portability" gap and multiplies the addressable market beyond the AIRA ecosystem.

---

### Sources
- [Ableton Pricing Guide: Intro vs Standard vs Suite](https://www.audeobox.com/learn/compare/ableton-pricing-guide/)
- [MIDI Fact Sheet — Ableton Reference Manual v12](https://www.ableton.com/en/live-manual/12/midi-fact-sheet/)
- [Using hardware synthesizers with Live – Ableton](https://help.ableton.com/hc/en-us/articles/209774265-Using-hardware-synthesizers-with-Live)
- [Bome MIDI Translator Pro – Bome Software](https://www.bome.com/products/miditranslator)
- [Bome MIDI Translator Pro pricing – Muziker](https://www.muziker.com/bome-midi-translator-pro)
- [Roland AIRA Compact S-1 Editor and Soundbank (Momo) – KVR](https://www.kvraudio.com/product/roland-aira-compact-s-1-tweak-synth-editor-and-soundbank-as-vst-and-standalone-version-by-momo)
- [Web MIDI in 2026: Which Browsers Actually Work](https://www.supersimplepiano.com/blog/web-midi-browser-compatibility-2026)
- Internal: [README.md](../../../README.md), [SYCORE_ADVANTEGES.md](../../guides/SYCORE_ADVANTEGES.md)
