#!/usr/bin/env python3
"""
LexSync FULL — build script (Workstream C).

Bundles the multi-file app into a single self-contained
dist/lexsync.html:
  - inlines css/*.css into <style> blocks
  - inlines js/*.js (in dependency order) into <script> blocks
  - inlines the whole data/*.json corpus as window.LEXSYNC_DATA

The act list is discovered with a LIVE GLOB of data/acts/*.json —
never hardcoded — so acts added by the parallel verification
workstream are picked up automatically. Run this as the last step
after any data change.

The bundle works offline when opened via file:// : it makes no
network requests at load time. The only external URL kept is the
Google Fonts stylesheet (with system-font fallbacks in the CSS).
("Check for updates" fetches the repo manifest, but only when the
user clicks the button, and it fails gracefully offline.)

Also writes data/index.json — the act file list used by dev-mode
index.html when served over http.

Usage:
    python3 tools/build.py [--out dist/lexsync.html]
"""
import argparse
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
ACTS = os.path.join(DATA, "acts")

JS_ORDER = [
    "js/data.js",
    "js/xrefs.js",
    "js/lawBrowser.js",
    "js/activityBrowser.js",
    "js/calculators.js",
    "js/applicability.js",
    "js/checklists.js",
    "js/assistant.js",
    "js/games.js",
    "js/updateCheck.js",
    "js/app.js",
]

CSS_ORDER = ["css/styles.css", "css/views.css"]

SINGLETON_JSON = [
    "hr_activities.json",
    "categories.json",
    "game_modes.json",
    "short_names.json",
    "checklists.json",
    "xrefs.json",
    "version.json",
]


def load_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def js_escape(text):
    """Make a JS string safe to embed inside <script>: neutralise </script>."""
    return text.replace("</script", "<\\/script").replace("</SCRIPT", "<\\/SCRIPT")


def build_data_blob():
    """Assemble window.LEXSYNC_DATA from a live glob — never hardcoded.

    Large acts are stored as a small shell (metadata + chapters +
    ``parts`` list) plus ``<slug>.p<N>.json`` chunk files, because some
    transports cap single-file payloads. Shells and parts are kept
    distinct everywhere: the blob carries ``acts`` (shells) and
    ``parts`` (chunks) separately, and data/index.json lists shells only.
    """
    PART_RE = re.compile(r"\.p\d+\.json$")
    all_json = sorted(glob.glob(os.path.join(ACTS, "*.json")))
    act_paths = [p for p in all_json if not PART_RE.search(os.path.basename(p))]
    part_paths = [p for p in all_json if PART_RE.search(os.path.basename(p))]
    if not act_paths:
        raise SystemExit("No act files found in " + ACTS)

    acts = []
    for path in act_paths:
        data = load_json(path)
        acts.append({"file": "acts/" + os.path.basename(path), "data": data})
    parts = []
    part_lookup = {}
    for path in part_paths:
        data = load_json(path)
        key = "acts/" + os.path.basename(path)
        parts.append({"file": key, "data": data})
        part_lookup[key] = data

    blob = {"acts": acts, "parts": parts}
    for name in SINGLETON_JSON:
        path = os.path.join(DATA, name)
        blob[name.replace(".json", "")] = load_json(path) if os.path.exists(path) else None

    # Validation: every checklist / xref reference must resolve to a real provision.
    # Shells may keep their provisions in part files — resolve them first.
    def shell_provisions(entry):
        data = entry["data"]
        provs = list(data.get("provisions", []))
        for pf in data.get("parts", []):
            provs.extend(part_lookup.get("acts/" + pf, {}).get("provisions", []))
        return provs

    index = {}
    for entry in acts:
        slug = entry["data"].get("slug") or entry["file"].replace("acts/", "").replace(".json", "")
        for p in shell_provisions(entry):
            index[(slug, str(p.get("number")))] = True

    problems = []
    for cl in blob["checklists"] or []:
        for it in cl.get("items", []):
            if (it.get("act"), str(it.get("section"))) not in index:
                problems.append("checklist %s: %s Sec %s not in corpus"
                                % (cl.get("id"), it.get("act"), it.get("section")))
    for x in blob["xrefs"] or []:
        for l in x.get("links", []):
            if (l.get("act"), str(l.get("section"))) not in index:
                problems.append("xref '%s': %s Sec %s not in corpus"
                                % (x.get("topic"), l.get("act"), l.get("section")))
    if problems:
        print("WARNING: %d dangling references:" % len(problems))
        for pr in problems[:20]:
            print("  -", pr)
    else:
        print("All checklist/xref references resolve to real provisions.")

    total_provisions = sum(len(shell_provisions(e)) for e in acts)
    print("Acts: %d | part files: %d | provisions: %d" % (len(acts), len(parts), total_provisions))
    return blob, [os.path.basename(p) for p in act_paths]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "dist", "lexsync.html"))
    args = ap.parse_args()

    html_path = os.path.join(ROOT, "index.html")
    with open(html_path, encoding="utf-8") as fh:
        html = fh.read()

    # 1. Inline CSS (keep the Google Fonts <link> — it's the one allowed external request).
    for css_file in CSS_ORDER:
        with open(os.path.join(ROOT, css_file), encoding="utf-8") as fh:
            css = fh.read()
        tag = '<link rel="stylesheet" href="%s" />' % css_file
        if tag not in html:
            # tolerate minor variants
            tag = '<link rel="stylesheet" href="%s"/>' % css_file
        assert tag in html, "CSS link tag not found for " + css_file
        html = html.replace(tag, "<style>\n/* inlined from %s */\n%s\n</style>" % (css_file, css), 1)
    print("Inlined CSS:", ", ".join(CSS_ORDER))

    # 2. Inline the data corpus as window.LEXSYNC_DATA (before the app scripts).
    blob, act_files = build_data_blob()
    data_js = "window.LEXSYNC_DATA = %s;" % js_escape(
        json.dumps(blob, ensure_ascii=False, separators=(",", ":")))
    marker = '<script src="js/data.js"></script>'
    assert marker in html, "data.js script tag not found"
    html = html.replace(marker, "<script>\n/* inlined corpus: %d acts */\n%s\n</script>\n%s"
                          % (len(act_files), data_js, marker), 1)

    # 3. Inline JS modules in dependency order.
    for js_file in JS_ORDER:
        with open(os.path.join(ROOT, js_file), encoding="utf-8") as fh:
            js = fh.read()
        if re.search(r"</script", js, re.I):
            raise SystemExit("Unsafe </script> sequence inside " + js_file)
        tag = '<script src="%s"></script>' % js_file
        assert tag in html, "script tag not found for " + js_file
        html = html.replace(tag, "<script>\n/* inlined from %s */\n%s\n</script>" % (js_file, js), 1)
    print("Inlined JS:", ", ".join(JS_ORDER))

    # 4. Sanity: no remaining local asset references.
    leftovers = re.findall(r'(?:src|href)="(?:css|js|data)/[^"]+"', html)
    # data/ references are fine inside JS strings (fetch fallback for dev mode);
    # only actual tags matter.
    tag_leftovers = re.findall(r'<(?:link|script|img)[^>]*(?:src|href)="(?:css|js)/[^"]+"', html)
    if tag_leftovers:
        raise SystemExit("Uninlined local assets remain: %s" % tag_leftovers)

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write(html)
    size_mb = os.path.getsize(args.out) / 1e6
    print("Wrote %s (%.1f MB)" % (args.out, size_mb))

    # 5. Refresh data/index.json for dev-mode fetch loading.
    index_path = os.path.join(DATA, "index.json")
    with open(index_path, "w", encoding="utf-8") as fh:
        json.dump({"acts": act_files,
                   "note": "Regenerated by tools/build.py from a glob of data/acts/*.json. "
                           "Dev-mode index.html fetches this over http."}, fh, indent=1)
    print("Wrote data/index.json with %d acts" % len(act_files))

    if leftovers:
        print("Note: %d data/ URL references remain inside JS strings (dev fetch fallback only)." % len(leftovers))


if __name__ == "__main__":
    sys.exit(main())
