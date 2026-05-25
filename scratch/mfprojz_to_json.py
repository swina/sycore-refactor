"""
mfprojz_to_json.py — Convert an Arturia MicroFreak .mfprojz export to a
sy.core-compatible program-change preset list JSON.

No dependencies beyond Python 3 stdlib (zipfile, json, re, argparse).

Usage:
    python scratch/mfprojz_to_json.py <input.mfprojz> [options]

Examples:
    python scratch/mfprojz_to_json.py my-device.mfprojz
    python scratch/mfprojz_to_json.py factory-6.mfprojz -o src/data/program_change/microfreak/factory6_sounds.json
    python scratch/mfprojz_to_json.py my-device.mfprojz --stats
"""

import argparse
import json
import os
import re
import sys
import zipfile

# ---------------------------------------------------------------------------
# Category ID → name (confirmed against factory bank via name cross-reference)
# ---------------------------------------------------------------------------
CATEGORY_MAP = {
    0:  "Bass",
    1:  "Brass",
    2:  "Keys",
    3:  "Lead",
    4:  "Organ",
    5:  "Pad",
    6:  "Percussion",
    7:  "Sequence",
    8:  "SFX",
    9:  "Strings",
    10: "Template",
    11: "Vocoder",
}


def extract_slot(filename):
    """
    Parse the bank slot number from a .mbp filename.

    Normal format:  "001-SourceDate-A1.mbp"   → 1
    Fused format:   "40900122021 17h55-A13.mbp" → 409
      (dash between slot and date is missing in some exports)
    """
    m = re.match(r'^(\d+)-', filename)
    if m:
        return int(m.group(1))
    # Fused: slot digits immediately followed by 8-digit date starting 00xx or 09xx
    m = re.match(r'^(\d+)(00\d{6}|09\d{6})', filename)
    if m:
        return int(m.group(1))
    m = re.match(r'^(\d{1,3})', filename)
    return int(m.group(1)) if m else None


def parse_mbp(data_bytes):
    """
    Extract (name, category_id) from a Boost C++ text-archive .mbp file.

    The header line looks like:
      22 serialization::archive 10 0 4 <x> <y> <name_len> <name> <cat_id> 0 0 18 ...
    """
    try:
        text = data_bytes.decode("latin-1")
    except Exception:
        return None, None

    m = re.search(
        r'archive \d+ \d+ \d+ \d+ \d+ (\d+) (.+?) (\d+) \d+ \d+ 18',
        text[:300]
    )
    if not m:
        return None, None

    name_len = int(m.group(1))
    name     = m.group(2)[:name_len]
    cat_id   = int(m.group(3))
    return name, cat_id


def convert(mfprojz_path, output_path=None, verbose=False):
    if not os.path.isfile(mfprojz_path):
        sys.exit(f"File not found: {mfprojz_path}")

    if not zipfile.is_zipfile(mfprojz_path):
        sys.exit(f"Not a valid .mfprojz file (not a ZIP archive): {mfprojz_path}")

    presets = []
    skipped = 0

    with zipfile.ZipFile(mfprojz_path, "r") as zf:
        mbp_files = [
            f for f in zf.namelist()
            if f.endswith(".mbp") and "test_empty" not in f
        ]

        if not mbp_files:
            sys.exit("No preset (.mbp) files found inside the archive.")

        for fname in sorted(mbp_files):
            filename = fname.split("/")[-1]
            slot = extract_slot(filename)
            if slot is None:
                skipped += 1
                if verbose:
                    print(f"  [skip] cannot parse slot from: {filename}")
                continue

            raw = zf.read(fname)
            name, cat_id = parse_mbp(raw)

            if name is None:
                skipped += 1
                if verbose:
                    print(f"  [skip] cannot parse preset data from: {filename}")
                continue

            category = CATEGORY_MAP.get(cat_id, f"Unknown-{cat_id}")
            presets.append({"slot": slot, "name": name, "category": category})

    if not presets:
        sys.exit("No presets could be parsed from the file.")

    presets.sort(key=lambda p: p["slot"])

    # Build output — sequential `no`, slot number as `program`
    result = []
    for i, p in enumerate(presets, 1):
        result.append({
            "category": p["category"],
            "no":       i,
            "name":     p["name"],
            "msb":      0,
            "lsb":      0,
            "bank":     0,
            "program":  p["slot"],
        })

    # Default output path: same folder as input, same stem + _sounds.json
    if output_path is None:
        stem = os.path.splitext(os.path.basename(mfprojz_path))[0]
        output_path = os.path.join(os.path.dirname(mfprojz_path), f"{stem}_sounds.json")

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=4, ensure_ascii=False)

    return result, output_path, skipped


def print_stats(result):
    from collections import Counter
    cats = Counter(p["category"] for p in result)
    print(f"\n  Total presets : {len(result)}")
    print(f"  Slot range    : {result[0]['program']} - {result[-1]['program']}")
    print(f"  Categories    :")
    for cat, count in sorted(cats.items()):
        print(f"    {cat:<12} {count}")


# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Convert a MicroFreak .mfprojz bank export to a sy.core preset JSON.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("input",         help="Path to the .mfprojz file")
    parser.add_argument("-o", "--output", help="Output JSON path (default: <input>_sounds.json)")
    parser.add_argument("--stats",        action="store_true", help="Print category breakdown after conversion")
    parser.add_argument("--verbose",      action="store_true", help="Print skipped files")
    args = parser.parse_args()

    result, out_path, skipped = convert(
        args.input,
        output_path=args.output,
        verbose=args.verbose,
    )

    print(f"Converted {len(result)} presets -> {out_path}")
    if skipped:
        print(f"  ({skipped} slots skipped - use --verbose for details)")

    if args.stats:
        print_stats(result)


if __name__ == "__main__":
    main()
