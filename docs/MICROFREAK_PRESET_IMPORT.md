# MicroFreak Preset List Import

## Overview

sy.core drives the Arturia MicroFreak via MIDI Program Change. To display the correct preset name for each slot, the app needs a JSON preset list that maps slot numbers to preset names and categories.

Because users can freely customize device slots (mixing presets from different factory banks or their own patches), **the only reliable source of truth is the device itself** — exported through Arturia MIDI Control Center.

This document explains how to generate the preset JSON from a MIDI Control Center export.

---

## Can this be done inside the app?

**Not currently.** The `.mfprojz` format is a ZIP archive containing binary Boost C++ serialized files. Parsing it requires either:

- A Python script (this tool), **or**
- A future in-app importer built in JavaScript (feasible — the format is a ZIP of text data — but not yet implemented)

The CLI tool is the current recommended path.

---

## Requirements

- **Python 3** (any 3.x version) — no pip packages needed, uses stdlib only
- **Arturia MIDI Control Center** installed and connected to the MicroFreak
- The script: `scratch/mfprojz_to_json.py` (in this repository)

---

## Step 1 — Export from MIDI Control Center

1. Open **Arturia MIDI Control Center**
2. Connect the MicroFreak via USB
3. In the device panel, choose **Receive from Device** (sometimes labelled "Import from Device")  
   → This reads the current preset arrangement from the hardware, including any customizations
4. Save the result as a `.mfprojz` project file (e.g. `my-microfreak.mfprojz`)

> If your device has not been customized, you can also use any Arturia factory bank export directly (e.g. `factory-6.mfprojz`). The tool handles both.

---

## Step 2 — Run the conversion tool

From the project root:

```bash
python scratch/mfprojz_to_json.py path/to/my-microfreak.mfprojz
```

This writes a JSON file next to the input file with `_sounds` appended to the name.

**To write to a specific location:**

```bash
python scratch/mfprojz_to_json.py my-microfreak.mfprojz \
  -o src/data/program_change/microfreak/my_microfreak_sounds.json
```

**To see a category breakdown:**

```bash
python scratch/mfprojz_to_json.py my-microfreak.mfprojz --stats
```

Example output:
```
Converted 383 presets → my-microfreak_sounds.json

  Total presets : 383
  Slot range    : 1 – 439
  Categories    :
    Bass         42
    Keys         18
    Lead         55
    Pad          61
    Percussion   24
    Sequence     71
    SFX          12
    Strings      38
    ...
```

---

## Output format

The JSON uses the same schema as all other sy.core program-change lists:

```json
[
  {
    "category": "Strings",
    "no": 1,
    "name": "Revert to Iron",
    "msb": 0,
    "lsb": 0,
    "bank": 0,
    "program": 1
  },
  ...
]
```

| Field | Description |
|---|---|
| `no` | Sequential index (1-based) |
| `name` | Preset name as stored on the device |
| `category` | Sound category (Bass, Lead, Pad, etc.) |
| `program` | Bank slot number → used as MIDI Program Change value |
| `msb` / `lsb` / `bank` | Always 0 for MicroFreak Bank A |

---

## Updating the preset list

Repeat Steps 1–2 whenever you reorganize presets on the device. The tool is safe to re-run — it always overwrites the output file.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Not a valid .mfprojz file` | Wrong file selected | Make sure you saved from MCC as a project, not just a bank backup |
| `No preset files found` | File is empty or only contains empty slots | Check MCC shows presets loaded on the device |
| `Unknown-N` category | Unknown category ID | Open an issue with the preset name and slot number |
| Slot numbers have gaps (e.g. 1–44, 100–439) | Normal — empty slots are skipped | The `program` field holds the real slot number for correct PC messages |
