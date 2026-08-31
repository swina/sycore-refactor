# SY.CORE — Connecting Your MIDI Devices

> **Audience:** First-time setup · Live performers · Studio producers
> **Prerequisite:** A browser that supports the Web MIDI API (Chrome, Edge, or Opera recommended)

---
## Quick Reference

<!-- <img src="../../help/guides/sycore-MIDI-Setup-Guide.png"/> -->

## Before You Start

SY.CORE uses the **Web MIDI API** — a browser-native interface that talks directly to your USB and MIDI hardware without any driver installation. No companion app required.

**What the Web MIDI API supports:**
- USB-MIDI devices (class-compliant, plug-and-play)
- Hardware connected via USB-MIDI interface / converter
- Bluetooth MIDI (if paired at the OS level before opening the browser)

**What it does not support:**
- DIN-5 MIDI (unless you use a USB-MIDI interface)
- Virtual MIDI ports created by a DAW (the DAW must expose them as system MIDI ports)

> **Roland S-1 users:** The Roland S-1 is directly supported. SY.CORE auto-detects it on startup and pre-configures CC mappings automatically — skip straight to [Step 3](#step-3--register-your-devices).

### The 4 tools you actually need

SY.CORE's MIDI configuration lives in four tools, each with a distinct job:

| Tool | Job |
|---|---|
| **MIDI Devices** | Discover and register hardware/virtual MIDI ports |
| **MIDI Flow** | The visual canvas — routing, per-device channels, note-range filters, saved configurations |
| **MIDI Controller Designer** | Bind a controller's knobs/pads/keys to synth parameters or app actions |
| **MIDI Learn** | Not a panel — right-click any fader/button anywhere in the app to bind it to a physical CC/note on the spot |

You'll also see a **MIDI Manager** entry (and its Routing/Performance/Matrix sub-views) in Module Manager — these are legacy, disabled by default, and duplicate state the 4 tools above already own (same underlying device registrations, same routing data, different UI). They're not deleted, just off by default; re-enable them from Module Manager only if you specifically need their config-preset export/import or a grid-style view instead of the canvas. This guide only covers the 4 canonical tools.

---

## Step 1 — Connect Your Hardware

1. Plug your device into a USB port on your computer (or hub).
2. If the device requires external power, switch it on.
3. Wait for the OS to enumerate it (usually 2–5 seconds). On Windows you may see a brief "Setting up device" notification.
4. **Open SY.CORE in Chrome, Edge, or Opera.**
   Firefox does not implement the Web MIDI API and will not detect any device.

---

## Step 2 — Grant MIDI Access

The first time SY.CORE runs (or any time you open it in a new browser profile) the browser will ask for permission to use MIDI:

```
"[site] wants to use your MIDI devices"
[ Block ]   [ Allow ]
```

Click **Allow**. If you accidentally click Block, go to the browser's site settings and reset the MIDI permission for the SY.CORE URL, then reload the page.

> On Chrome you can review this at `chrome://settings/content/midi`.

---

[<button class="border px-8 py-2 border-neutral-700 rounded m-auto hover:bg-synth-neon bg-synth-neon/50">Next MIDI DEVICES</button>](./SYCORE_MIDI_DEVICES.md)

## Step 3 — Register Your Devices

Open **MIDI Devices**. Full reference: [MIDI Devices guide](./SYCORE_MIDI_DEVICES.md).

The panel lists every MIDI port detected by the Web MIDI API — inputs and outputs — grouped by physical device.

### If your device is not listed

- Click **Refresh** — re-scans the Web MIDI API without reloading the page.
- Unplug and re-plug the USB cable, wait 3 seconds, then refresh again.
- Make sure no other application (DAW, standalone synth editor) has taken exclusive ownership of the port.

### Register the device

Click **Add to routing** on the device you want to use. Registered devices persist across sessions — you only need to do this once per device. If the auto-detected type is wrong, click the type dropdown to override it.

**Setting up a software synth?** Use the **Virtual Instruments** section at the bottom of the same panel instead — name it, then bind its real output port (either there or from its node in MIDI Flow).

---

## Step 4 — Wire It Up in MIDI Flow

<img src="../../help/guides/sycore-midi-routing-flow.png"/>

Open **MIDI Flow**. Full reference: [MIDI Flow guide](./SYCORE_MIDI_FLOW.md).

Drag your registered devices and any app you want to route (Step Sequencer, Chord Sequencer, etc.) onto the canvas, then draw a cable from one node's **OUT** port to another's **IN** port. Routing applies live — no separate "apply" step.

A typical controller + one synth setup: drag the Keystep and the Roland S-1 onto the canvas, cable Keystep's OUT to Roland S-1's IN.

### Per-device channel & message-type controls

Click a device node to reveal its inline controls, right on the canvas:

| Control | What to do |
|---|---|
| **SYNC** | Forward MIDI Clock (0xF8) to this device |
| **TRSP** | Forward Start / Stop / Continue messages |
| **NOTE** | Forward note data |
| **CC** | Forward Control Change messages |
| **PC** | Enable Program Change dispatch |
| **IN ch** | `OMNI` or a fixed 1–16 |
| **OUT ch** | `OMNI`/pass-through or a fixed 1–16 |

These are the same underlying settings MIDI Devices' registration list shows — MIDI Flow is just the live, visual place to edit them while you're already wiring things up.

### Keyboard splits and multi-channel virtual instruments

Click any device→app cable to set a note-range filter (e.g. low keys to a bass synth, high keys to a lead synth — see the guide for the full keyboard-split walkthrough). A virtual instrument configured as multi-timbral gets a **Multi-CH out** grid on its node instead of a single OUT channel, so one source can drive several of its parts at once.

### Save your wiring

Use the header's folder icon to save the current canvas as a named configuration, and reload it later in one click — see [MIDI Flow → Saved Configurations](./SYCORE_MIDI_FLOW.md#saved-configurations).

---

## Step 5 — Map Controls & Actions

If you want a physical knob, pad, or key on your controller to control something in SY.CORE, you have two options:

### Quick: MIDI Learn (right-click anywhere)

Right-click almost any fader, button, or knob in SY.CORE — mixer channels, sequencer controls, the transport bar, and more — and choose **MIDI Learn**. Move the physical control on your hardware; SY.CORE detects the device/CC/note automatically and binds it on the spot. No dedicated panel needed — this works the same way everywhere in the app.

### Full control: MIDI Controller Designer

Open **MIDI Controller Designer** for a dedicated visual layout — drag-place pads, sliders, and encoders to mirror your physical controller, then assign each one to either:
- an **app parameter** (S-1 hardware parameters, app parameters) — the same kind of binding as MIDI Learn, with a persistent visual layout, or
- an **app action** (start/stop the sequencer, toggle the looper, next/previous preset, switch panels, etc.)

Controller Designer also has a sweep-to-discover mode that auto-detects a control's CC/note by moving it, so you don't have to know your hardware's CC map in advance.

> **Novation Launchpad Mini MK1:** SY.CORE includes a built-in profile — the top row (CC 104–111) is pre-mapped to app actions with LED feedback automatically, no manual binding required. The 8×8 grid is free for custom bindings via Controller Designer.

---

## Step 6 — Verify with MIDI Monitor

Before leaving setup, open **MIDI Monitor** and click **Start**. Play a note or move a knob on your controller — entries appear in real time:

```
→  IN   Keystep       Ch 1   Note On   C4   vel 87
←  OUT  Roland S-1    Ch 1   Note On   C4   vel 87
```

- **IN** entries (blue arrow) = messages received from your controller
- **OUT** entries (green arrow) = messages sent to your synth

If IN entries appear but OUT entries do not, check MIDI Flow and confirm the cable to that device has **NOTE** and/or **CC** enabled. MIDI Monitor is also reachable directly from MIDI Flow's footer while you're wiring things up.

Use the **Direction**, **Type**, and **Device** filters to narrow the view when debugging a specific issue.

---

## Resetting MIDI Configuration

If something's behaving strangely and you want to rule out a stale mapping, a full reset (device registrations, routing, keyboard split, smart latch, **and both mapping systems** — MIDI Learn and MIDI Actions) is available from the legacy MIDI Manager's Settings tab. Since MIDI Manager is off by default (see above), enable it first from **Module Manager**, open it, go to **Settings**, and use **Reset all MIDI settings to defaults**. This is also where config-preset export/import lives if you want a full backup before making changes.

---

## Common Scenarios

### Single controller → single synth

```
Goal: Keystep plays notes on Roland S-1 via SY.CORE

MIDI Devices:  Register both devices
MIDI Flow:     Drag both onto the canvas, cable Keystep OUT -> Roland S-1 IN
```

### Two synths, one controller, keyboard split

```
Goal: Low keys -> Bass synth  |  High keys -> Lead synth

MIDI Devices:  Register all three devices
MIDI Flow:     Cable the controller to both synths, click each cable to set
               its note-range filter (e.g. 0-59 -> Bass, 60-127 -> Lead)
```

### External clock master (DAW or hardware)

```
Goal: Receive clock from external master, drive internal sequencer

MIDI Devices:  Enable "Receive Sync In" on the clock source device
MIDI Flow:     Cable the clock source's IN as needed for your setup
```

### Record MIDI output

```
Goal: Capture the sequencer's MIDI output to a file

Use the MIDI Capture tool (header toolbar -> Capture button)
MIDI Monitor's Export button downloads a JSON log of all messages
```

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| No devices appear in MIDI Devices | Browser permission denied — reset MIDI permission in browser site settings and reload |
| Device appears offline | Unplug, replug, click Refresh in MIDI Devices |
| Notes heard on wrong channel | Set OUT channel on the device's node in MIDI Flow to match hardware receive channel |
| Controller knobs have no effect | MIDI Flow → CC toggle must be ON for the target device; also check for a conflicting MIDI Learn *and* Controller Designer Actions binding on the same control |
| A control seems to trigger two things at once | It's likely bound in both MIDI Learn and Controller Designer's Actions system for the same device/CC/note — both can fire for one message; remove one of the two bindings |
| Clock drifts | Disable "Receive Sync In" on non-clock devices; only one source should drive the clock |
| Echo / double notes | Echo suppression is automatic (300ms window); if still occurring, check for a stray MIDI Thru route in MIDI Flow |
| Roland S-1 not auto-configured | It may not have been connected when the app loaded — reload with the S-1 powered on and connected |
| Something's still off after checking the above | Try a full reset — see [Resetting MIDI Configuration](#resetting-midi-configuration) |

---

## Browser Compatibility

| Browser | Web MIDI | Notes |
|---------|----------|-------|
| Chrome 43+ | ✔ Full | Recommended |
| Edge 79+ | ✔ Full | Chromium-based versions only |
| Opera 30+ | ✔ Full | |
| Firefox | ✗ None | Web MIDI not implemented |
| Safari | ✗ None | Web MIDI not supported |

---

*Last updated: 2026-07-21*
