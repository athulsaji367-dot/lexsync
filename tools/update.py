#!/usr/bin/env python3
"""
LexSync FULL — data updater (Workstream B).

Re-runs tools/verify.py, then bumps data/version.json (date-based version)
and appends a changelog entry describing what changed.

Usage:
    python3 tools/update.py [--verify-args "..."]

Version scheme: YYYY.MM.DD, with a -rN suffix if run more than once on the
same day (e.g. 2026.09.30-r2).
"""

import argparse
import datetime
import glob
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERSION_PATH = os.path.join(ROOT, "data", "version.json")
ACTS_DIR = os.path.join(ROOT, "data", "acts")
VERIFY = os.path.join(ROOT, "tools", "verify.py")


def snapshot():
    """Capture per-act (source_url, status, chapters, verification_status).

    Large acts are stored as a shell + ``<slug>.p<N>.json`` part files;
    part files are skipped here and their provisions counted under the
    shell's slug.
    """
    snap = {}
    for path in sorted(glob.glob(os.path.join(ACTS_DIR, "*.json"))):
        base = os.path.basename(path)
        if re.search(r"\.p\d+\.json$", base):
            continue
        slug = os.path.splitext(base)[0]
        try:
            with open(path, encoding="utf-8") as fh:
                act = json.load(fh)
            prov_count = len(act.get("provisions") or [])
            for pf in act.get("parts") or []:
                ppath = os.path.join(ACTS_DIR, pf)
                if os.path.exists(ppath):
                    with open(ppath, encoding="utf-8") as pfh:
                        prov_count += len(json.load(pfh).get("provisions") or [])
            snap[slug] = {
                "source_url": act.get("source_url"),
                "status": act.get("status"),
                "verification_status": act.get("verification_status"),
                "chapters": len(act.get("chapters") or []),
                "provisions": prov_count,
            }
        except Exception as e:  # noqa: BLE001
            snap[slug] = {"read_error": str(e)}
    return snap


def bump_version(current):
    today = datetime.datetime.now(datetime.timezone.utc).strftime("%Y.%m.%d")
    if not current or not current.startswith(today):
        return today
    # same-day re-run: add/increment -rN suffix
    if "-r" in current:
        base, n = current.rsplit("-r", 1)
        try:
            return f"{base}-r{int(n) + 1}"
        except ValueError:
            return f"{current}-r2"
    return f"{current}-r2"


def main():
    ap = argparse.ArgumentParser(description="LexSync data updater")
    ap.add_argument("--verify-args", default="",
                    help="extra args passed to tools/verify.py, e.g. '--limit 2'")
    args = ap.parse_args()

    before = snapshot()
    print(f"Snapshot: {len(before)} act files.")

    # 1. re-run verification pipeline
    cmd = [sys.executable, VERIFY] + (args.verify_args.split() if args.verify_args else [])
    print("Running:", " ".join(cmd))
    rc = subprocess.run(cmd, cwd=ROOT).returncode
    if rc != 0:
        print(f"WARNING: tools/verify.py exited with code {rc}; "
              "continuing with version bump anyway.")

    after = snapshot()

    # 2. diff what changed
    changes = []
    for slug in sorted(set(before) | set(after)):
        b, a = before.get(slug, {}), after.get(slug, {})
        if b != a:
            bits = []
            for key in ("source_url", "status", "verification_status",
                        "chapters", "provisions"):
                if b.get(key) != a.get(key):
                    bits.append(f"{key}: {b.get(key)!r} -> {a.get(key)!r}")
            changes.append(f"{slug}: " + "; ".join(bits))

    # 3. bump version.json
    with open(VERSION_PATH, encoding="utf-8") as fh:
        version = json.load(fh)
    old_version = version.get("data_version")
    new_version = bump_version(old_version)
    now_iso = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    if changes:
        entry = (f"{new_version} — re-ran verification pipeline; "
                 f"{len(changes)} act(s) changed: " + " | ".join(changes))
    else:
        entry = (f"{new_version} — re-ran verification pipeline; "
                 "no act metadata changes since last run.")
    version["data_version"] = new_version
    version["released_at"] = now_iso
    version.setdefault("changelog", []).append(entry)
    with open(VERSION_PATH, "w", encoding="utf-8") as fh:
        json.dump(version, fh, indent=2, ensure_ascii=False)
        fh.write("\n")

    # 4. report
    print("\n" + "=" * 78)
    print(f"Version: {old_version} -> {new_version} ({now_iso})")
    print(f"Changed acts: {len(changes)}")
    for c in changes:
        print("  -", c)
    if not changes:
        print("  (none)")
    print("Changelog entry appended to data/version.json.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
