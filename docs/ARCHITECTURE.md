# LexSync FULL — Architecture

## What it is

A zero-budget, no-framework, no-backend web app: a structured study/reference tool for
Indian labour law. Two artefacts ship from one source tree:

- **Dev source** — `index.html` + `css/` + `js/` + `data/*.json`, served over http
  (browsers block `fetch()` on `file://`, so dev mode needs `python3 -m http.server`).
- **Built app** — `dist/lexsync.html`, a single self-contained file produced by
  `tools/build.py`. It works offline opened directly via `file://`.

## Data flow

```
data/acts/*.json ─┐
data/*.json ──────┴─→ tools/build.py ─→ dist/lexsync.html
                        (glob at build time, inline CSS/JS/JSON as window.LEXSYNC_DATA)
                        └─→ data/index.json (dev-mode act list)

browser: index.html ─fetch→ data/*.json            (dev, needs http server)
         dist/lexsync.html ─reads→ window.LEXSYNC_DATA (offline, no fetch at load)
```

`js/data.js` is the single loading point. It prefers `window.LEXSYNC_DATA` when present
(dist) and falls back to fetching `data/index.json` + each JSON file (dev). It normalises
every act to `{slug, title, year, type, status, source_url, retrieved_at,
verification_status, chapters[], provisions[]}` and builds a `provisionIndex` keyed by
`actSlug|number` for deep links. Acts missing from `categories.json` (e.g. newly added
stubs) are folded into "Other Laws" so nothing silently disappears.

### Corpus schema (per act file)

```json
{
  "slug": "gratuity_act_1972", "title": "The Payment of Gratuity Act, 1972",
  "year": 1972, "type": "act", "status": "pending_verification",
  "source_url": "…", "retrieved_at": "…", "verification_status": "ai_drafted",
  "chapters": [{"num": "I", "name": "PRELIMINARY"}],
  "provisions": [{
    "number": "4", "title": "Payment of Gratuity",
    "chapter_num": "…", "chapter": "…",
    "fields": {"Legal Provision": ["…"], "Objective": ["…"], "HR Significance": ["…"]},
    "activities": ["Calculating and paying gratuity"],
    "definitions": [{"term": "…", "definition": "…"}],
    "verification_status": "ai_drafted", "source_url": null, "retrieved_at": "…"
  }]
}
```

Supporting files: `hr_activities.json` (keyword buckets), `categories.json` (nav groups),
`game_modes.json` (6 quiz modes), `short_names.json`, `checklists.json` (task → act+section),
`xrefs.json` (curated cross-act topics), `version.json` (update manifest),
`provenance/` (official-source metadata from the verification pipeline).

## Module map

| File | Owns |
|---|---|
| `js/app.js` | Global `LS` namespace, state, view router (`law/activity/calculators/assistant/games/applicability/checklists`), `openProvision()` deep links, `#/law/<slug>/<section>` hash sync, footer wiring, boot |
| `js/data.js` | Corpus loading (embedded vs fetch), normalisation, `badgeFor()` |
| `js/lawBrowser.js` | Category pills, law tabs, act header + badges, chapter sidebar, search, activity chips, section cards, definitions block, "Combined Into This Code" card |
| `js/activityBrowser.js` | HR-activity buckets → provisions across acts |
| `js/calculators.js` | PF, ESI (from Lite), gratuity, bonus estimators — standard rates, disclaimer |
| `js/assistant.js` | Local-first grounded search Q&A with act+section citations; optional BYO Claude API key behind a security warning |
| `js/games.js` | 6 quiz modes; questions generated from the live corpus (definitions, objectives, numbers, chapters, xrefs) |
| `js/applicability.js` | Establishment questionnaire → applicable acts with threshold logic, provision deep links + badges, legal-counsel disclaimer |
| `js/checklists.js` | Per-activity compliance checklists; items deep-link to provisions; progress tracking |
| `js/xrefs.js` | Curated cross-references; "Related provisions" block in section detail |
| `js/updateCheck.js` | Footer "Check for updates": compares bundled `data_version` with the repo manifest; graceful offline |

Plain `<script>` tags in dependency order (no modules/bundler — ES modules break on `file://`).

## Verification model

Two badge levels, driven entirely by data so the parallel verification workstream can flip
statuses without touching UI code:

- **Provision level** — `verification_status`: `"verified"` → 🟢 *Verified against official
  source*; `"ai_drafted"` → 🟡 *AI study notes — unverified*; anything else → 🟡 *status unknown*.
- **Act level** — header badge aggregates: all verified → green; partial → "N of M verified";
  none → amber; zero provisions (stub) → "Provisions being added".

Rules: never fabricate legal text; unverified content keeps its badge everywhere it appears
(cards, activity results, assistant citations, checklist items, applicability basis links).
Thresholds in the applicability engine that aren't stated verbatim in the corpus are labelled
as such (`basisNote`), never presented as quoted law.

## Build pipeline

`tools/build.py`:
1. Globs `data/acts/*.json` (live — picks up workstream B's new stubs automatically).
2. Validates that every `checklists.json` / `xrefs.json` reference resolves to a real
   `actSlug|section`; warns on dangling references instead of failing silently.
3. Inlines `css/*.css` → `<style>`, `js/*.js` → `<script>` (dependency order), and the full
   corpus → `window.LEXSYNC_DATA` (JSON with `</script` neutralised).
4. Asserts no local `<link>/<script>` asset references remain.
5. Writes `dist/lexsync.html` and refreshes `data/index.json`.

`tools/update.py` (workstream B): re-runs verification, bumps `data_version` (date-based).
`tools/verify.py` (workstream B): resolves official legislative.gov.in source URLs/metadata.

**Convention: `tools/build.py` is always the final step after any data change**, so `dist/`
never goes stale.

## External requests

- Google Fonts stylesheet (with system-font fallbacks) — the only load-time external request.
- `api.anthropic.com` — only if the user explicitly pastes an API key (opt-in, warned).
- `manifest_url` (raw GitHub) — only when the user clicks "Check for updates".

Local assistant mode makes zero network requests.
