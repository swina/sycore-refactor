"""
MicroFreak MIDI diagnostics.

Modes:
  listen   - Passively monitor ALL messages from the device (including sysex).
             Use this while operating MIDI Control Center to capture real traffic.
  probe    - Send Program Change + try every known Arturia dump-request command
             byte and report which one (if any) gets a sysex response.
  sniff-pc - Send a Program Change and just listen — some devices auto-emit
             a sysex dump on preset change.

Usage:
    python scratch/microfreak_midi_diag.py listen   [--port MicroFreak]
    python scratch/microfreak_midi_diag.py probe    [--port MicroFreak] [--slot 0]
    python scratch/microfreak_midi_diag.py sniff-pc [--port MicroFreak] [--slot 0]
"""

import argparse
import sys
import time

try:
    import rtmidi
except ImportError:
    sys.exit("pip install python-rtmidi")

ARTURIA_MFR = [0x00, 0x20, 0x6B]
PRODUCT_ID  = [0x05, 0x01]


def pick_port(ports, pref=None, label="port"):
    if not ports:
        sys.exit(f"No MIDI {label} ports found.")
    if pref:
        for i, p in enumerate(ports):
            if pref.lower() in p.lower():
                print(f"Auto-selected {label}: [{i}] {p}")
                return i
    print(f"Available MIDI {label} ports:")
    for i, p in enumerate(ports):
        print(f"  [{i}] {p}")
    return int(input(f"Select {label} port number: ").strip())


def open_io(pref=None):
    mout = rtmidi.MidiOut()
    min_ = rtmidi.MidiIn()
    oi   = pick_port(mout.get_ports(), pref, "output")
    ii   = pick_port(min_.get_ports(),  pref, "input")
    mout.open_port(oi)
    min_.open_port(ii)
    min_.ignore_types(sysex=False, timing=True, active_sense=True)
    return mout, min_


# ---------------------------------------------------------------------------
# Mode: listen
# ---------------------------------------------------------------------------

def mode_listen(mout, min_):
    print("\n[LISTEN] Monitoring all MIDI from device. Press Ctrl+C to stop.\n")

    def _cb(msg, _):
        data, delta = msg
        hex_str = bytes(data).hex(" ").upper()
        tag = "SYSEX" if data[0] == 0xF0 else "MSG  "
        print(f"  {tag}  {hex_str}")

    min_.set_callback(_cb)
    try:
        while True:
            time.sleep(0.1)
    except KeyboardInterrupt:
        pass
    min_.cancel_callback()


# ---------------------------------------------------------------------------
# Mode: sniff-pc  (send PC, listen for spontaneous sysex)
# ---------------------------------------------------------------------------

def mode_sniff_pc(mout, min_, slot):
    print(f"\n[SNIFF-PC] Sending PC {slot} then listening 3 s for sysex...\n")
    received = []

    def _cb(msg, _):
        data, _ = msg
        if data[0] == 0xF0:
            received.append(data)

    min_.set_callback(_cb)
    mout.send_message([0xC0, slot & 0x7F])
    time.sleep(3.0)
    min_.cancel_callback()

    if received:
        for r in received:
            print("  Got sysex:", bytes(r).hex(" ").upper())
    else:
        print("  No sysex received after PC.")


# ---------------------------------------------------------------------------
# Mode: probe  (try every plausible Arturia command byte)
# ---------------------------------------------------------------------------

# Candidate formats to try
PROBE_MESSAGES = []

# Format A: F0 00 20 6B 05 01 <cmd> F7
for cmd in [0x01, 0x02, 0x03, 0x06, 0x0E, 0x0F, 0x10,
            0x26, 0x27, 0x40, 0x41, 0x60, 0x61, 0x7F]:
    PROBE_MESSAGES.append({
        "label": f"Arturia cmd=0x{cmd:02X} (no args)",
        "msg":   [0xF0] + ARTURIA_MFR + PRODUCT_ID + [cmd, 0xF7],
    })

# Format B: F0 00 20 6B 05 01 <cmd> <bank> <prog> F7
for cmd in [0x01, 0x06, 0x0E, 0x26, 0x40]:
    PROBE_MESSAGES.append({
        "label": f"Arturia cmd=0x{cmd:02X} bank=0 prog=0",
        "msg":   [0xF0] + ARTURIA_MFR + PRODUCT_ID + [cmd, 0x00, 0x00, 0xF7],
    })

# Format C: F0 7E 7F 06 07 F7  (Universal Dump Request, all channels)
PROBE_MESSAGES.append({
    "label": "Universal Dump Request (F0 7E 7F 06 07 F7)",
    "msg":   [0xF0, 0x7E, 0x7F, 0x06, 0x07, 0xF7],
})

# Format D: F0 7E 00 06 07 F7  (same, device-channel 0)
PROBE_MESSAGES.append({
    "label": "Universal Dump Request ch0 (F0 7E 00 06 07 F7)",
    "msg":   [0xF0, 0x7E, 0x00, 0x06, 0x07, 0xF7],
})


def mode_probe(mout, min_, slot):
    print(f"\n[PROBE] PC to slot {slot}, then trying {len(PROBE_MESSAGES)} message variants.\n")

    mout.send_message([0xC0, slot & 0x7F])
    time.sleep(0.2)

    for probe in PROBE_MESSAGES:
        received = []

        def _cb(msg, _):
            data, _ = msg
            received.append(data)

        min_.set_callback(_cb)
        mout.send_message(probe["msg"])
        time.sleep(0.5)
        min_.cancel_callback()

        if received:
            for r in received:
                tag = "SYSEX" if r[0] == 0xF0 else "MSG  "
                print(f"  HIT  [{probe['label']}]")
                print(f"       {tag}: {bytes(r).hex(' ').upper()[:120]}")
        else:
            print(f"  ....  {probe['label']}")

    print("\nProbe complete.")


# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["listen", "probe", "sniff-pc"])
    parser.add_argument("--port", default=None)
    parser.add_argument("--slot", type=int, default=0, help="Bank slot (0-indexed) for probe/sniff-pc")
    args = parser.parse_args()

    mout, min_ = open_io(args.port)

    try:
        if args.mode == "listen":
            mode_listen(mout, min_)
        elif args.mode == "sniff-pc":
            mode_sniff_pc(mout, min_, args.slot)
        elif args.mode == "probe":
            mode_probe(mout, min_, args.slot)
    finally:
        mout.close_port()
        min_.close_port()


if __name__ == "__main__":
    main()
