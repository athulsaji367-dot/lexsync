/* ============================================================
   LexSync FULL — js/data.js
   Loads the JSON corpus (acts, activities, categories, modes,
   checklists, xrefs, version) and normalises it for the views.

   Two modes:
   1. EMBEDDED (dist/lexsync.html): build.py inlines every JSON
      file as window.LEXSYNC_DATA — no fetch, works on file://.
   2. FETCH (dev index.html): loads data/index.json (written by
      build.py from a glob of data/acts/*.json), then fetches each
      file. Requires http:// (e.g. python3 -m http.server).

   Exposes: LS.Data.load() -> Promise<dataset>
   ============================================================ */
var LS = window.LS || {};
window.LS = LS;

LS.Data = (function () {
  var cache = null;

  function shortNameFallback(title) {
    // "The Payment of Gratuity Act, 1972" -> "Payment of Gratuity Act"
    return String(title || '')
      .replace(/^The\s+/, '')
      .replace(/,\s*\d{4}\s*$/, '')
      .trim();
  }

  function normaliseAct(raw, file) {
    var slug = raw.slug || file.replace(/\.json$/, '');
    return {
      slug: slug,
      file: file,
      title: raw.title || slug,
      year: raw.year || null,
      type: raw.type || 'act',                 // "code" | "act"
      status: raw.status || null,
      source_url: raw.source_url || null,
      retrieved_at: raw.retrieved_at || null,
      verification_status: raw.verification_status || 'unknown',
      lite_reviewed_flag: !!raw.lite_reviewed_flag,
      chapters: raw.chapters || [],
      provisions: (raw.provisions || []).map(function (p) {
        return {
          number: String(p.number),
          title: p.title || '',
          chapter_num: p.chapter_num || '',
          chapter: p.chapter || '',
          fields: p.fields || {},
          activities: p.activities || [],
          definitions: p.definitions || [],
          verification_status: p.verification_status || raw.verification_status || 'unknown',
          source_url: p.source_url || raw.source_url || null,
          retrieved_at: p.retrieved_at || raw.retrieved_at || null,
          actSlug: slug
        };
      })
    };
  }

  function buildIndex(ds) {
    // Map "actSlug|number" -> provision for deep links.
    ds.provisionIndex = {};
    ds.acts.forEach(function (a) {
      a.provisions.forEach(function (p) {
        ds.provisionIndex[a.slug + '|' + p.number] = p;
      });
    });
  }

  function shortName(ds, slug) {
    if (ds.shortNames && ds.shortNames[slug]) return ds.shortNames[slug];
    var a = ds.actBySlug[slug];
    return a ? shortNameFallback(a.title) : slug;
  }

  function loadEmbedded() {
    var raw = window.LEXSYNC_DATA;
    // Part files (acts split into ~85KB chunks for transport) are embedded
    // under raw.parts; merge them back into their shell act here.
    var partMap = {};
    (raw.parts || []).forEach(function (entry) { partMap[entry.file] = entry.data; });
    var ds = {
      acts: raw.acts.map(function (entry) {
        var data = entry.data;
        if (data.parts && data.parts.length) {
          var merged = [];
          data.parts.forEach(function (pf) {
            var pd = partMap['acts/' + pf];
            if (pd && pd.provisions) merged = merged.concat(pd.provisions);
          });
          var copy = {};
          for (var k in data) copy[k] = data[k];
          copy.provisions = merged;
          data = copy;
        }
        return normaliseAct(data, entry.file);
      }),
      hrActivities: raw.hr_activities || [],
      categories: raw.categories || [],
      gameModes: raw.game_modes || [],
      shortNames: (raw.short_names && raw.short_names.SHORT_NAMES) || {},
      checklists: raw.checklists || [],
      xrefs: raw.xrefs || [],
      version: raw.version || null,
      source: 'embedded'
    };
    finish(ds);
    return Promise.resolve(ds);
  }

  function getJSON(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
      return r.json();
    });
  }

  function loadFetched() {
    // data/index.json is written by tools/build.py from a live glob of
    // data/acts/*.json, so dev mode always sees new/removed acts after a build.
    return getJSON('data/index.json').then(function (index) {
      var files = ['hr_activities.json', 'categories.json', 'game_modes.json',
                   'short_names.json', 'checklists.json', 'xrefs.json', 'version.json'];
      var actFiles = (index.acts || []).map(function (f) { return 'acts/' + f; });
      var jobs = actFiles.map(function (f) {
        return getJSON('data/' + f).then(function (data) {
          // Large acts are split into ~85KB part files (see tools/split note in
          // README); the shell lists them in data.parts. Reassemble here.
          var parts = (data && data.parts) || [];
          if (!parts.length) return { file: f, data: data };
          var pj = parts.map(function (pf) { return getJSON('data/acts/' + pf); });
          return Promise.all(pj).then(function (pres) {
            data.provisions = [];
            pres.forEach(function (pr) {
              data.provisions = data.provisions.concat((pr && pr.provisions) || []);
            });
            return { file: f, data: data };
          });
        });
      });
      files.forEach(function (f) {
        jobs.push(getJSON('data/' + f).then(
          function (data) { return { file: f, data: data }; },
          function () { return { file: f, data: null }; } // tolerate missing optional files
        ));
      });
      return Promise.all(jobs).then(function (entries) {
        var byFile = {};
        entries.forEach(function (e) { byFile[e.file] = e.data; });
        var ds = {
          acts: actFiles.map(function (f) { return normaliseAct(byFile[f] || { provisions: [] }, f); }),
          hrActivities: byFile['hr_activities.json'] || [],
          categories: byFile['categories.json'] || [],
          gameModes: byFile['game_modes.json'] || [],
          shortNames: ((byFile['short_names.json'] || {}).SHORT_NAMES) || {},
          checklists: byFile['checklists.json'] || [],
          xrefs: byFile['xrefs.json'] || [],
          version: byFile['version.json'] || null,
          source: 'fetch'
        };
        finish(ds);
        return ds;
      });
    });
  }

  function finish(ds) {
    ds.actBySlug = {};
    ds.acts.forEach(function (a) { ds.actBySlug[a.slug] = a; });
    buildIndex(ds);

    // Acts not listed in any category (e.g. newly added stubs) are shown
    // under "Other Laws" so nothing silently disappears from the browser.
    var known = {};
    ds.categories.forEach(function (c) { (c.ids || []).forEach(function (id) { known[id] = true; }); });
    var other = ds.categories.find(function (c) { return c.id === 'other_laws'; });
    if (other) {
      ds.acts.forEach(function (a) {
        if (!known[a.slug] && other.ids.indexOf(a.slug) === -1) other.ids.push(a.slug);
      });
    }

    ds.shortName = function (slug) { return shortName(ds, slug); };
    ds.findProvision = function (slug, number) {
      return ds.provisionIndex[slug + '|' + String(number)] || null;
    };
  }

  /* Verification badge model.
     - "verified"        -> green  "Verified against official source"
     - "ai_drafted"      -> amber  "AI study notes — unverified"
     - anything else     -> amber  "Verification status unknown"
     The parallel verification workstream flips statuses to "verified";
     the UI reacts automatically. */
  function badgeFor(status) {
    if (status === 'verified') {
      return { cls: 'reviewed-badge', text: 'Verified against official source' };
    }
    if (status === 'ai_drafted') {
      return { cls: 'unreviewed-badge', text: 'AI study notes — unverified' };
    }
    return { cls: 'unreviewed-badge', text: 'Verification status unknown' };
  }

  function load() {
    if (cache) return Promise.resolve(cache);
    var p = window.LEXSYNC_DATA ? loadEmbedded() : loadFetched();
    return p.then(function (ds) {
      ds.badgeFor = badgeFor;
      cache = ds;
      return ds;
    });
  }

  return { load: load, badgeFor: badgeFor };
})();
