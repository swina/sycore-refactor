"""
MicroFreak per-preset sysex capture tool.

Workflow:
  1. Loads factory6_sounds_temp.json (presets list with slot numbers).
  2. Connects to MicroFreak via rtmidi (prompts for port selection).
  3. For each preset:
       a. Sends MIDI Program Change on channel 1 to the preset's slot.
       b. Sends an Arturia sysex dump request for that slot.
       c. Waits for the sysex response and stores it.
  4. Writes factory6_sounds_sysex.json — same format as the input JSON
     plus a "sysex" field containing the hex-encoded dump per entry.

Usage:
    python scratch/microfreak_sysex_capture.py [--port <port_name>] [--dry-run]

Requirements:
    pip install python-rtmidi
"""

import argparse
import json
import os
import sys
import time

try:
    import rtmidi
except ImportError:
    sys.exit("python-rtmidi not found. Install with: pip install python-rtmidi")

# ---------------------------------------------------------------------------
# Arturia MicroFreak sysex constants
# Manufacturer ID: 00 20 6B  |  Product family: 05 01  (MicroFreak)
# ---------------------------------------------------------------------------
ARTURIA_MFR   = [0x00, 0x20, 0x6B]
PRODUCT_ID    = [0x05, 0x01]

# Universal Identity Request — confirms the device is a MicroFreak
IDENTITY_REQUEST = [0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7]

# Preset dump request for a specific slot (bank 0, program N):
#   F0 00 20 6B 05 01  40  <bank>  <program>  F7
# The device responds with the full preset sysex.
CMD_PRESET_DUMP_REQ = 0x40

MIDI_CHANNEL   = 0          # channel 1 (0-indexed)
PC_DELAY_MS    = 120        # wait after Program Change before sysex request
SYSEX_TIMEOUT  = 2.0        # seconds to wait for sysex response per preset
INTER_PRESET_MS = 50        # wait between presets

DATA_DIR  = os.path.join(os.path.dirname(__file__), "..", "src", "data", "program_change", "microfreak")
INPUT_JSON  = os.path.join(DATA_DIR, "factory6_sounds_temp.json")
OUTPUT_JSON = os.path.join(DATA_DIR, "factory6_sounds_sysex.json")


# ---------------------------------------------------------------------------
# MIDI helpers
# ---------------------------------------------------------------------------

def list_ports(midi_in):
    ports = midi_in.get_ports()
    if not ports:
        sys.exit("No MIDI input ports found. Is the MicroFreak connected?")
    return ports


def select_port(ports, preference=None):
    if preference:
        for i, p in enumerate(ports):
            if preference.lower() in p.lower():
                return i, p
        print(f"[warn] Port '{preference}' not found. Available ports:")
    else:
        print("Available MIDI ports:")
    for i, p in enumerate(ports):
        print(f"  [{i}] {p}")
    idx = int(input("Select input port number: ").strip())
    return idx, ports[idx]


def open_ports(port_pref=None):
    midi_out = rtmidi.MidiOut()
    midi_in  = rtmidi.MidiIn()

    out_ports = midi_out.get_ports()
    in_ports  = midi_in.get_ports()

    if not out_ports or not in_ports:
        sys.exit("No MIDI ports found. Is the MicroFreak connected and powered on?")

    out_idx, out_name = select_port(out_ports, port_pref)
    # Try to match the same device name for input
    in_idx = 0
    for i, p in enumerate(in_ports):
        if out_name.split()[0].lower() in p.lower():
            in_idx = i
            break
    print(f"Using OUT: {out_ports[out_idx]}")
    print(f"Using IN:  {in_ports[in_idx]}")

    midi_out.open_port(out_idx)
    midi_in.open_port(in_idx)
    midi_in.ignore_types(sysex=False, timing=True, active_sense=True)

    return midi_out, midi_in


def send_identity_request(midi_out, midi_in):
    """Send universal identity request, return True if MicroFreak responds."""
    collected = []

    def _cb(msg, _):
        data, _ = msg
        collected.append(data)

    midi_in.set_callback(_cb)
    midi_out.send_message(IDENTITY_REQUEST)
    time.sleep(0.5)
    midi_in.cancel_callback()

    for resp in collected:
        # Arturia identity response contains manufacturer bytes 00 20 6B
        if len(resp) > 8 and resp[5] == 0x00 and resp[6] == 0x20 and resp[7] == 0x6B:
            print(f"[ok] MicroFreak identified: {bytes(resp).hex(' ')}")
            return True

    print("[warn] No identity response. Proceeding anyway — check the device is in sysex mode.")
    return False


def send_program_change(midi_out, channel, program):
    """Send MIDI Program Change (0-indexed program)."""
    midi_out.send_message([0xC0 | channel, program & 0x7F])


def request_preset_sysex(midi_out, bank, program):
    """Send Arturia preset dump request for bank/program."""
    msg = [0xF0] + ARTURIA_MFR + PRODUCT_ID + [CMD_PRESET_DUMP_REQ, bank & 0x7F, program & 0x7F, 0xF7]
    midi_out.send_message(msg)


def capture_sysex(midi_in, timeout=SYSEX_TIMEOUT):
    """Block until a sysex message arrives or timeout expires. Returns hex string or None."""
    received = []
    deadline = time.time() + timeout

    def _cb(msg, _):
        data, _ = msg
        if data[0] == 0xF0:
            received.append(data)

    midi_in.set_callback(_cb)
    while not received and time.time() < deadline:
        time.sleep(0.02)
    midi_in.cancel_callback()

    if received:
        return bytes(received[0]).hex(" ")
    return None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Capture MicroFreak per-preset sysex dumps")
    parser.add_argument("--port",     help="Partial MIDI port name (auto-selects on match)")
    parser.add_argument("--dry-run",  action="store_true", help="List presets without sending MIDI")
    parser.add_argument("--start-at", type=int, default=1, help="Start from preset no. (resume after interruption)")
    parser.add_argument("--timeout",  type=float, default=SYSEX_TIMEOUT, help="Sysex response timeout in seconds")
    args = parser.parse_args()

    with open(INPUT_JSON, encoding="utf-8") as f:
        presets = json.load(f)

    print(f"Loaded {len(presets)} presets from {INPUT_JSON}")

    # Load any partial output to resume
    output = []
    if os.path.exists(OUTPUT_JSON):
        with open(OUTPUT_JSON, encoding="utf-8") as f:
            output = json.load(f)
        done_nos = {p["no"] for p in output if p.get("sysex")}
        print(f"Resuming: {len(done_nos)} presets already captured.")
    else:
        done_nos = set()

    if args.dry_run:
        for p in presets:
            print(f"  no={p['no']:3d}  slot={p['program']:3d}  {p['name']}")
        return

    midi_out, midi_in = open_ports(args.port)

    try:
        send_identity_request(midi_out, midi_in)

        for preset in presets:
            no   = preset["no"]
            slot = preset["program"]   # actual bank position = MIDI program number
            name = preset["name"]

            if no < args.start_at or no in done_nos:
                output_entry = next((p for p in output if p["no"] == no), dict(preset))
                if output_entry not in output:
                    output.append(output_entry)
                continue

            print(f"[{no:3d}/{len(presets)}] slot={slot:3d}  {name}  ...", end=" ", flush=True)

            # 1. Program Change to load the preset on the device
            send_program_change(midi_out, MIDI_CHANNEL, slot - 1)  # PC is 0-indexed
            time.sleep(PC_DELAY_MS / 1000)

            # 2. Request sysex dump (bank 0, program = slot-1)
            request_preset_sysex(midi_out, bank=0, program=slot - 1)

            # 3. Capture response
            sysex_hex = capture_sysex(midi_in, timeout=args.timeout)

            if sysex_hex:
                print(f"ok ({len(sysex_hex)//3 + 1} bytes)")
            else:
                print("NO RESPONSE")

            entry = dict(preset)
            entry["sysex"] = sysex_hex  # None if no response
            output.append(entry)

            # Save incrementally so progress isn't lost on interruption
            with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
                json.dump(output, f, indent=4, ensure_ascii=False)

            time.sleep(INTER_PRESET_MS / 1000)

    except KeyboardInterrupt:
        print("\nInterrupted — partial results saved to", OUTPUT_JSON)
    finally:
        midi_out.close_port()
        midi_in.close_port()

    captured  = sum(1 for p in output if p.get("sysex"))
    failed    = sum(1 for p in output if p.get("sysex") is None)
    print(f"\nDone. {captured} captured, {failed} no-response.")
    print(f"Output: {OUTPUT_JSON}")


if __name__ == "__main__":
    main()
