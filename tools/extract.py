#!/usr/bin/env python3
"""
LexSync FULL — data extraction (migration step).

Extracts the embedded corpus from the lite single-file app
(workspace/user/files/lexsync-lite__1.html) into structured JSON:

  data/acts/{slug}.json        — one file per act/code
  data/hr_activities.json      — HR activity browser config
  data/categories.json         — law category groupings
  data/game_modes.json         — quiz game mode config
  data/short_names.json        — display short names

Act schema:
  { slug, title, year, type: "code"|"act",
    status, source_url, retrieved_at, verification_status,
    lite_reviewed_flag,
    chapters: [{num, name}],
    provisions: [{number, title, chapter_num, chapter,
                  fields: {...}, activities: [...], definitions: [...],
                  verification_status}] }

Lossless: every chapter, provision, field, activity and definition is kept.
Verification metadata is seeded honestly: the lite corpus was AI-generated
study material, so everything starts as "ai_drafted" until tools/verify.py
checks it against official sources.

Usage:
    python3 tools/extract.py [--src PATH] [--out DIR]
"""

import argparse
import datetime
import json
import os
import re
import sys

CODE_IDS = {"wages_code", "osh_code", "ir_code", "ss_code"}
NOW = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def extract_balanced(s, start, open_c, close_c):
    depth = 0
    in_str = None
    esc = False
    i = start
    while i < len(s):
        c = s[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == in_str:
                in_str = None
        else:
            if c in "\"'`":
                in_str = c
            elif c == open_c:
                depth += 1
            elif c == close_c:
                depth -= 1
                if depth == 0:
                    return s[start : i + 1]
        i += 1
    raise ValueError(f"unbalanced {open_c}{close_c} from offset {start}")


def const_json(src, name, open_c="[", close_c="]"):
    marker = f"const {name} = "
    start = src.index(marker) + len(marker)
    return extract_balanced(src, start, open_c, close_c)


def parse_year(act_name):
    m = re.search(r"(19|20)\d{2}", act_name)
    return int(m.group(0)) if m else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=os.path.expanduser(
        "~/workspace/user/files/lexsync-lite__1.html"))
    ap.add_argument("--out", default=os.path.expanduser("~/workspace/lexsync/data"))
    args = ap.parse_args()

    with open(args.src, encoding="utf-8") as f:
        src = f.read()

    all_data = json.loads(const_json(src, "ALL_DATA", "{", "}"))
    laws = all_data["laws"]
    print(f"Found {len(laws)} laws in lite corpus")

    acts_dir = os.path.join(args.out, "acts")
    os.makedirs(acts_dir, exist_ok=True)

    manifest = []
    total_provisions = 0
    for law in laws:
        slug = law["id"]
        provisions = []
        for s in law.get("sections", []):
            provisions.append({
                "number": s.get("number"),
                "title": s.get("title"),
                "chapter_num": s.get("chapter_num"),
                "chapter": s.get("chapter"),
                "fields": s.get("fields", {}),
                "activities": s.get("activities", []),
                "definitions": s.get("definitions", []),
                # Honest seed: lite content is AI-generated study notes.
                "verification_status": "ai_drafted",
                "source_url": None,
                "retrieved_at": None,
            })
        total_provisions += len(provisions)
        act_doc = {
            "slug": slug,
            "title": law.get("act"),
            "year": parse_year(law.get("act", "")),
            "type": "code" if slug in CODE_IDS else "act",
            # Do NOT assert enforcement status; verify.py resolves this.
            "status": "pending_verification",
            "source_url": None,
            "retrieved_at": NOW,
            "verification_status": "ai_drafted",
            "lite_reviewed_flag": law.get("reviewed"),
            "chapters": law.get("chapters", []),
            "provisions": provisions,
        }
        path = os.path.join(acts_dir, f"{slug}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(act_doc, f, ensure_ascii=False, indent=1)
        manifest.append({
            "slug": slug, "title": act_doc["title"],
            "provisions": len(provisions),
            "chapters": len(act_doc["chapters"]),
            "file": f"acts/{slug}.json",
        })
        print(f"  {slug}: {len(provisions)} provisions -> {path}")

    # Supporting config extracted from JS (kept as data, not code)
    # These use single-quoted JS; convert via a tolerant transform.
    def js_to_json(js_text):
        # 1) quote unquoted object keys: { id: -> { "id":
        js_text = re.sub(r'([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:',
                         r'\1"\2":', js_text)
        # 2) drop trailing commas before ] or } (legal JS, illegal JSON)
        js_text = re.sub(r',\s*([\]}])', r'\1', js_text)
        # 3) convert single-quoted strings to double-quoted
        out = []
        i = 0
        in_s = False
        while i < len(js_text):
            c = js_text[i]
            if c == "'" and not in_s:
                in_s = True
                out.append('"')
            elif c == "'" and in_s:
                in_s = False
                out.append('"')
            elif c == '"' and in_s:
                out.append('\\"')
            elif c == "\\" and in_s and i + 1 < len(js_text) and js_text[i + 1] == "'":
                out.append("'")
                i += 1
            else:
                out.append(c)
            i += 1
        return "".join(out)

    for const_name, fname in [
        ("HR_ACTIVITIES", "hr_activities.json"),
        ("CATEGORIES", "categories.json"),
        ("GAME_MODES", "game_modes.json"),
    ]:
        try:
            raw = const_json(src, const_name)
            parsed = json.loads(js_to_json(raw))
            with open(os.path.join(args.out, fname), "w", encoding="utf-8") as f:
                json.dump(parsed, f, ensure_ascii=False, indent=1)
            print(f"  {fname}: {len(parsed)} entries")
        except Exception as e:
            print(f"  WARNING: could not extract {const_name}: {e}", file=sys.stderr)

    # SHORT_NAMES / ASST_SHORT_NAMES / GAME_SHORT_NAMES may exist
    short_names = {}
    for const_name in ["SHORT_NAMES", "ASST_SHORT_NAMES", "GAME_SHORT_NAMES"]:
        try:
            raw = const_json(src, const_name, "{", "}")
            short_names[const_name] = json.loads(js_to_json(raw))
            print(f"  {const_name}: {len(short_names[const_name])} entries")
        except Exception as e:
            print(f"  (skip {const_name}: {e})", file=sys.stderr)
    if short_names:
        with open(os.path.join(args.out, "short_names.json"), "w", encoding="utf-8") as f:
            json.dump(short_names, f, ensure_ascii=False, indent=1)

    with open(os.path.join(args.out, "_manifest.json"), "w", encoding="utf-8") as f:
        json.dump({
            "extracted_at": NOW,
            "source_file": os.path.basename(args.src),
            "laws": manifest,
            "total_provisions": total_provisions,
        }, f, ensure_ascii=False, indent=1)

    print(f"\nDone: {len(laws)} acts, {total_provisions} provisions -> {args.out}")


if __name__ == "__main__":
    main()
