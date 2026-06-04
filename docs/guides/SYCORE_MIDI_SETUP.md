# SY.CORE — Connecting Your MIDI Devices

> **Audience:** First-time setup · Live performers · Studio producers  
> **Prerequisite:** A browser that supports the Web MIDI API (Chrome, Edge, or Opera recommended)

---
## Quick Reference

<img src="/help/guides/sycore-MIDI-Setup-Guide.png"/>

## Before You Start

SY.CORE uses the **Web MIDI API** — a browser-native interface that talks directly to your USB and MIDI hardware without any driver installation. No companion app required.

**What the Web MIDI API supports:**
- USB-MIDI devices (class-compliant, plug-and-play)
- Hardware connected via USB-MIDI interface / converter
- Bluetooth MIDI (if paired at the OS level before opening the browser)

**What it does not support:**
- DIN-5 MIDI (unless you use a USB-MIDI interface)
- Virtual MIDI ports created by a DAW (the DAW must expose them as system MIDI ports)

> **Roland S-1 users:** The Roland S-1 is directly supported. SY.CORE auto-detects it on startup and pre-configures CC mappings automatically — skip straight to [Step 3](#step-3--open-the-midi-manager).

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

## Step 3 — Open the MIDI Manager

In the SY.CORE header, click the **MIDI** button (or use the keyboard shortcut assigned to it). The **Unified MIDI Manager** modal opens.


All eight tabs are described below in the order you will use them during initial setup.

---

## Step 4 — Discover Your Devices (Devices Tab)

<img src="/help/guides/sycore-midi-manager.png"/>

Open the **Devices** tab (the first tab, selected by default).

The panel lists every MIDI port detected by the Web MIDI API — inputs and outputs — grouped by physical device. Each entry shows:

| Column | Meaning |
|--------|---------|
| **Name** | Port name as reported by the OS / driver |
| **Type** | Auto-classified: Controller · Instrument · Audio Interface |
| **Status** | Online (green) or Offline (gray) |

### If your device is not listed

- Click the **Refresh** button (circular arrow) in the top-right of the Devices tab. This re-scans the Web MIDI API without reloading the page.
- Unplug and re-plug the USB cable, wait 3 seconds, then refresh again.
- Make sure no other application (DAW, standalone synth editor) has taken exclusive ownership of the port.

### Register the device

Click **Add to Routing** next to the device you want to use. This moves it into the routing system so it appears in all other tabs. Registered devices persist across sessions — you only need to do this once per device.

If the auto-detected type is wrong (e.g. a controller is classified as an instrument), click the type badge to cycle through the options. Your choice is saved immediately.

---

## Step 5 — Configure Routing (Routing Tab)

<img src="/help/guides/sycore-midi-routing.png"/>

Switch to the **Routing** tab. You will see one row per registered device in **Grid view**.

### Enable inputs and outputs

| Column | What to do |
|--------|-----------|
| **MIDI IN** | Toggle ON for every device you want SY.CORE to *receive* from (controllers, sequencers, clock sources) |
| **MIDI OUT** | Toggle ON for every device SY.CORE should *send* to (synths, drum machines, audio interfaces with MIDI) |
| **SYNC** | Toggle ON to forward MIDI Clock (0xF8) to this device |
| **TRSP** | Toggle ON to forward Start / Stop / Continue messages |
| **NOTE** | Toggle ON to forward note data (Note On / Note Off) |
| **CC** | Toggle ON to forward Control Change messages |
| **PC** | Toggle ON to enable Program Change dispatch (only when OUT is enabled) |

A typical controller + one synth setup looks like this:

```
Device              IN   OUT  SYNC  TRSP  NOTE  CC   PC
─────────────────── ──── ──── ───── ───── ───── ──── ────
Keystep (ctrl)       ✔    —    —     —     —     —    —
Roland S-1           —    ✔    ✔     ✔     ✔     ✔    ✔
```

### Set MIDI channels

Each device row has channel selectors next to the IN and OUT toggles:

- **IN channel** — `OMNI` (receive all channels) or `1–16` (receive one specific channel only). Use OMNI unless you need to filter a specific channel.
- **OUT channel** — `Pass-through` (send on the channel the message arrived on) or `1–16` (force all outgoing messages to a fixed channel). Set this to match the receive channel on your hardware.

### Global Thru Bridge

At the bottom of the Routing tab, enabling **Global Thru Bridge** forwards all incoming messages directly to all active outputs without any processing. Useful for connecting a controller to a hardware synth in pass-through mode. You can limit the bridge to Notes only or CC only using the Thru Filters toggles.

---

## Step 6 — Set Up Performance Routing (Performance Tab)

<img src="/help/guides/sycore-midi-performance-grid.png"/>

The **Performance** tab controls which *internal SY.CORE sources* route to which hardware outputs.

| Source | Sends from |
|--------|-----------|
| **Keyboard** | On-screen keyboard / touch input |
| **Sequencer** | Step sequencer MIDI output |
| **Arpeggiator** | Arpeggiated note stream |
| **UI / Preview** | Sound library preview triggers |
| **Transport / Clock** | Internal MIDI clock generator |
| *(your physical inputs)* | Hardware controllers (MIDI Thru) |

Enable the checkbox at each source → output intersection to create a route. For example, to route the on-screen keyboard to your Roland S-1:

```
                   Roland S-1
                   ──────────
Keyboard           ✔
Sequencer          ✔
Arpeggiator        ✔
UI / Preview       ✔  (this enables the Sound Engine to generate sounds for the device)
Transport          ✔
```

### Broadcast Mode

Toggle **Broadcast Mode** (top of the Performance tab) to send all sources to all active outputs simultaneously. Useful during sound checks when you want everything to reach all devices without configuring individual routes.

---

## Step 7 — Mapping (Map CC Controls)

<img src="/help/guides/sycore-midi-mapping.png"/>

If you want a physical knob or fader on your controller to control a parameter in SY.CORE or on your synth hardware, use the **Mapping** tab.

### MIDI Learn workflow

1. Click **MIDI LEARN** — the button glows and the app enters learn mode.
2. Move the knob or fader on your controller. SY.CORE detects the CC number, device name, and channel automatically.
3. Open the **Target parameter** dropdown and select what that knob should control (S-1 hardware parameters, app parameters, etc.).
4. Click **Confirm Mapping**. The binding is saved immediately.

Repeat for each control. Mappings can be saved as named presets (see [Step 9](#step-9--save-your-configuration)).

---

## Step 8 — Map App Actions (Actions Tab)

The **Actions** tab lets you bind MIDI notes or CC values to high-level SY.CORE functions — things like:

- Next / Previous preset
- Start / Stop the sequencer
- Toggle the Looper
- Switch UI panels

The workflow is the same as MIDI Learn in the Mapping tab:

1. Choose a target **App Action** from the category list.
2. Click **MIDI LEARN**.
3. Press the button, pad, or key on your controller.
4. The binding is confirmed automatically.

### Launchpad Mini MK1

SY.CORE includes a built-in profile for the **Novation Launchpad Mini MK1**. When detected, the top row of 8 buttons (CC 104–111) is pre-mapped to app actions and LED feedback is active — no manual binding required. The grid (8×8 note pads) is available for custom bindings via the Actions tab.

---

## Step 9 — Verify with the Monitor (Monitor Tab)

Before leaving setup, open the **Monitor** tab and click **Start**. Play a note or move a knob on your controller. You should see entries appear in real time:

```
→  IN   Keystep       Ch 1   Note On   C4   vel 87
←  OUT  Roland S-1    Ch 1   Note On   C4   vel 87
```

- **IN** entries (blue arrow) = messages received from your controller
- **OUT** entries (green arrow) = messages sent to your synth

If IN entries appear but OUT entries do not, check the Routing tab and confirm the output device has **NOTE** and/or **CC** enabled.

Use the **Direction**, **Type**, and **Device** filters to narrow the view when debugging a specific issue.

---

## Step 10 — Save Your Configuration (Settings Tab)

Once everything works, switch to the **Settings** tab and save a named preset:

1. Type a name (e.g. `Studio Rig`, `Live Set A`).
2. Click **Save Preset**.

This snapshot captures: device registrations, routing matrix, channel assignments, performance routes, keyboard split, smart latch settings, and CC mappings. Load it in one click at the start of your next session.

You can also click **Export** to download a `.json` file as a backup or to transfer the configuration to another machine.

---

## Common Scenarios

### Single controller → single synth

```
Goal: Keystep plays notes on Roland S-1 via SY.CORE

Devices tab:  Register both devices
Routing tab:  Keystep IN ✔  |  Roland S-1 OUT ✔ (Notes ✔, CC ✔)
Performance:  Keyboard → Roland S-1 ✔
```

### Two synths, one controller, keyboard split

```
Goal: Low keys → Bass synth  |  High keys → Lead synth

Routing tab:  Register all three devices
              Bass Synth OUT ✔  |  Lead Synth OUT ✔
Performance:  Enable Keyboard Split (bottom of Performance tab)
              Split Note: C3
              Low Device: Bass Synth  |  High Device: Lead Synth
```

### External clock master (DAW or hardware)

```
Goal: Receive clock from external master, drive internal sequencer

Routing tab:  Clock Source IN ✔  |  Enable "Receive Sync In" on that device
Sync tab:     Enable "MIDI START → Step Sequencer"
```

### Record MIDI output

```
Goal: Capture the sequencer's MIDI output to a file

Use the MIDI Capture tool (header toolbar → Capture button)
The Monitor tab's Export button downloads a JSON log of all messages
```

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| No devices appear in Devices tab | Browser permission denied — reset MIDI permission in browser site settings and reload |
| Device appears offline | Unplug, replug, click Refresh in Devices tab |
| Notes heard on wrong channel | Set OUT channel on the synth's row in Routing tab to match hardware receive channel |
| Controller knobs have no effect | Routing tab → CC toggle must be ON for the synth output; also check Mapping tab for CC conflicts |
| Clock drifts | Disable "Receive Sync In" on non-clock devices; only one source should drive the clock |
| Echo / double notes | Echo suppression is automatic (300ms window); if still occurring, disable Global Thru Bridge |
| Roland S-1 not auto-configured | It may not have been connected when the app loaded — reload with the S-1 powered on and connected |

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

*Last updated: 2026-05-31*
