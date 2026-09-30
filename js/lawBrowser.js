/* ============================================================
   LexSync FULL — js/lawBrowser.js
   "Browse by Law" view: category pills, law tabs, act header with
   verification badges, chapter sidebar, keyword/activity search,
   expandable section cards, definitions block, "Combined Into This
   Code" card, and the section detail (with xrefs + badges).

   Expects: LS.state, LS.esc, LS.highlight, LS.render,
   LS.openProvision (defined in app.js).
   ============================================================ */
var LS = window.LS || {};
window.LS = LS;

LS.LawBrowser = (function () {
  var ds = null;

  function init(dataset) { ds = dataset; }

  function currentLaw() {
    return ds.actBySlug[LS.state.lawId] || ds.acts[0];
  }

  function categoryForLaw(lawId) {
    var c = ds.categories.find(function (cat) { return (cat.ids || []).indexOf(lawId) !== -1; });
    return c ? c.id : ((ds.categories[0] || {}).id || null);
  }

  function titleCase(s) {
    return String(s || '').toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  /* ---------- top strip: categories + law tabs ---------- */
  function renderCategories() {
    var row = document.getElementById('categoryRow');
    row.innerHTML = ds.categories.map(function (c) {
      return '<div class="category-pill ' + (LS.state.category === c.id ? 'active' : '') +
        '" data-cat="' + LS.esc(c.id) + '"><div class="category-label">' + LS.esc(c.label) +
        '</div><div class="category-sub">' + LS.esc(c.sub || '') + '</div></div>';
    }).join('');
    row.querySelectorAll('.category-pill').forEach(function (el) {
      el.addEventListener('click', function () {
        LS.state.category = el.getAttribute('data-cat');
        var cat = ds.categories.find(function (c) { return c.id === LS.state.category; });
        var first = cat && (cat.ids || []).find(function (id) { return ds.actBySlug[id]; });
        if (first) LS.state.lawId = first;
        LS.state.query = ''; LS.state.chapterFilter = null; LS.state.openSection = null;
        document.getElementById('searchInput').value = '';
        LS.render();
      });
    });
  }

  function renderLawTabs() {
    var cat = ds.categories.find(function (c) { return c.id === LS.state.category; }) || { ids: [] };
    var row = document.getElementById('lawTabs');
    row.innerHTML = (cat.ids || []).filter(function (id) { return ds.actBySlug[id]; }).map(function (id) {
      return '<div class="law-tab ' + (LS.state.lawId === id ? 'active' : '') + '" data-law="' + LS.esc(id) + '">' +
        LS.esc(ds.shortName(id)) + '</div>';
    }).join('');
    row.querySelectorAll('.law-tab').forEach(function (el) {
      el.addEventListener('click', function () {
        LS.state.lawId = el.getAttribute('data-law');
        LS.state.query = ''; LS.state.chapterFilter = null; LS.state.openSection = null;
        document.getElementById('searchInput').value = '';
        LS.render();
      });
    });
  }

  /* ---------- act header + verification badge ---------- */
  function actBadge(law) {
    if (!law.provisions.length) {
      return '<span class="unreviewed-badge">Provisions being added</span>';
    }
    var verified = law.provisions.filter(function (p) { return p.verification_status === 'verified'; }).length;
    if (verified === law.provisions.length) {
      return '<span class="reviewed-badge">All ' + verified + ' sections verified</span>';
    }
    if (verified > 0) {
      return '<span class="unreviewed-badge">' + verified + ' of ' + law.provisions.length + ' verified · rest AI-drafted</span>';
    }
    return '<span class="unreviewed-badge">AI study notes — unverified</span>';
  }

  function renderActHeader() {
    var law = currentLaw();
    document.getElementById('actTitle').textContent = law.title;
    var seen = {}, chCount = 0;
    law.chapters.forEach(function (c) { if (!seen[c.name]) { seen[c.name] = 1; chCount++; } });
    var eraTag = (law.type === 'code')
      ? '<span class="era-badge era-code">Labour Code</span>'
      : ((law.year && law.year < 2019)
          ? '<span class="era-badge era-precode">Pre-code era — kept for reference</span>' : '');
    var srcLink = law.source_url
      ? ' · <a class="src-link" href="' + LS.esc(law.source_url) + '" target="_blank" rel="noopener">official source ↗</a>'
      : '';
    document.getElementById('actSub').innerHTML =
      law.provisions.length + ' sections · ' + chCount + ' chapters ' + eraTag + ' ' + actBadge(law) + srcLink;
    document.getElementById('searchInput').placeholder =
      'Search ' + law.title.replace(/^The /, '').replace(/,.*/, '') + ' by activity or keyword...';
  }

  /* ---------- activity chips ---------- */
  function renderChips() {
    var law = currentLaw();
    var buckets = {};
    law.provisions.forEach(function (s) {
      (s.activities || []).forEach(function (a) { buckets[a] = (buckets[a] || 0) + 1; });
    });
    var top = Object.keys(buckets).sort(function (a, b) { return buckets[b] - buckets[a]; }).slice(0, 10);
    var row = document.getElementById('chipRow');
    row.innerHTML = top.map(function (a) {
      return '<div class="chip" data-chip="' + LS.esc(a) + '">' + LS.esc(a) +
        ' <span class="chip-n">' + buckets[a] + '</span></div>';
    }).join('');
    row.querySelectorAll('.chip').forEach(function (el) {
      el.addEventListener('click', function () {
        document.getElementById('searchInput').value = el.getAttribute('data-chip');
        LS.state.query = el.getAttribute('data-chip');
        LS.state.openSection = null;
        LS.render();
      });
    });
  }

  /* ---------- chapter sidebar ---------- */
  function renderChapters() {
    var law = currentLaw();
    var counts = {};
    law.provisions.forEach(function (s) { counts[s.chapter] = (counts[s.chapter] || 0) + 1; });
    var seen = {}, unique = [];
    law.chapters.forEach(function (c) {
      if (!seen[c.name]) { seen[c.name] = 1; unique.push(c); }
    });
    var list = document.getElementById('chapterList');
    list.innerHTML = unique.map(function (c) {
      return '<div class="chapter-item ' + (LS.state.chapterFilter === c.name ? 'active' : '') +
        '" data-ch="' + LS.esc(c.name) + '"><span><span class="num">' + LS.esc(c.num || '') +
        '</span>' + LS.esc(titleCase(c.name)) + '</span><span class="count">' + (counts[c.name] || 0) + '</span></div>';
    }).join('');
    list.querySelectorAll('.chapter-item').forEach(function (el) {
      el.addEventListener('click', function () {
        var ch = el.getAttribute('data-ch');
        LS.state.chapterFilter = (LS.state.chapterFilter === ch) ? null : ch;
        LS.state.openSection = null;
        LS.render();
      });
    });
    document.getElementById('clearFilter').style.display = LS.state.chapterFilter ? 'block' : 'none';
  }

  /* ---------- "Combined Into This Code" card ---------- */
  var COMPONENT_LAWS = {
    wages_code: [
      { name: 'Payment of Wages Act, 1936', lawId: 'payment_wages_1936' },
      { name: 'Minimum Wages Act, 1948', lawId: 'minimum_wages_1948' },
      { name: 'Payment of Bonus Act, 1965', lawId: 'bonus_act_1965' },
      { name: 'Equal Remuneration Act, 1976', lawId: null }
    ],
    osh_code: [
      { name: 'Factories Act, 1948', lawId: 'factories' },
      { name: 'Mines Act, 1952', lawId: null },
      { name: 'Contract Labour (Regulation and Abolition) Act, 1970', lawId: 'contract_labour_1970' },
      { name: 'Inter-State Migrant Workmen Act, 1979', lawId: null },
      { name: 'Building and Other Construction Workers Act, 1996', lawId: null },
      { name: 'Plantations Labour Act, 1951', lawId: null },
      { name: 'Working Journalists Act, 1955', lawId: null },
      { name: 'Dock Workers (Safety, Health and Welfare) Act, 1986', lawId: null },
      { name: 'Motor Transport Workers Act, 1961', lawId: null },
      { name: 'Beedi and Cigar Workers Act, 1966', lawId: null },
      { name: 'Cine Workers and Cinema Theatre Workers Act, 1981', lawId: null }
    ],
    ir_code: [
      { name: 'Trade Unions Act, 1926', lawId: 'tu_act_1926' },
      { name: 'Industrial Employment (Standing Orders) Act, 1946', lawId: 'so_act_1946' },
      { name: 'Industrial Disputes Act, 1947', lawId: 'id_act_1947' }
    ],
    ss_code: [
      { name: "Employees' Compensation Act, 1923", lawId: 'employees_compensation_1923' },
      { name: "Employees' State Insurance Act, 1948", lawId: 'esi_act_1948' },
      { name: "Employees' Provident Funds & Misc. Provisions Act, 1952", lawId: 'epf_act_1952' },
      { name: 'Maternity Benefit Act, 1961', lawId: 'maternity_1961' },
      { name: 'Payment of Gratuity Act, 1972', lawId: 'gratuity_act_1972' },
      { name: 'Building & Other Construction Workers Welfare Cess Act, 1996', lawId: null },
      { name: "Unorganised Workers' Social Security Act, 2008", lawId: null }
    ]
  };

  function renderComponentLawsCard() {
    var container = document.getElementById('componentLawsCard');
    var laws = COMPONENT_LAWS[LS.state.lawId];
    if (!laws) { container.innerHTML = ''; return; }
    container.innerHTML =
      '<div class="comp-card"><h4>Combined Into This Code</h4>' +
      '<div class="comp-card-sub">Earlier laws this Code consolidates. Tap one to open it, where added.</div>' +
      laws.map(function (cl) {
        var available = cl.lawId && ds.actBySlug[cl.lawId];
        return '<div class="comp-law-item ' + (available ? 'available' : '') + '" data-target="' + (available ? cl.lawId : '') + '">' +
          '<span class="comp-law-dot ' + (available ? 'available' : 'missing') + '"></span>' +
          '<span class="comp-law-name">' + LS.esc(cl.name) + '</span>' +
          '<span class="comp-law-status">' + (available ? '' : 'soon') + '</span></div>';
      }).join('') + '</div>';
    container.querySelectorAll('.comp-law-item').forEach(function (el) {
      el.addEventListener('click', function () {
        var target = el.getAttribute('data-target');
        if (target) {
          LS.state.category = categoryForLaw(target);
          LS.state.lawId = target;
          LS.state.query = ''; LS.state.chapterFilter = null; LS.state.openSection = null;
          document.getElementById('searchInput').value = '';
          LS.render();
        } else {
          LS.showSoonToast();
        }
      });
    });
  }

  /* ---------- section cards ---------- */
  function sectionMatches(sec, q) {
    if (!q) return true;
    var ql = q.toLowerCase();
    var hay = [sec.number, sec.title, sec.chapter, (sec.activities || []).join(' ')]
      .concat(Object.keys(sec.fields || {}).map(function (k) { return (sec.fields[k] || []).join(' '); }))
      .join(' ').toLowerCase();
    return ql.split(/\s+/).every(function (w) { return hay.indexOf(w) !== -1; });
  }

  function fieldOrder(fields) {
    var preferred = ['Legal Provision', 'Objective', 'HR Significance'];
    var keys = Object.keys(fields || {});
    var ordered = preferred.filter(function (k) { return keys.indexOf(k) !== -1; });
    keys.forEach(function (k) { if (ordered.indexOf(k) === -1) ordered.push(k); });
    return ordered;
  }

  function styleLegalText(text, query) {
    // Keep the lite's legal-text styling: emphasise numbered clauses.
    var out = LS.highlight(LS.esc(text), query);
    out = out.replace(/(^|\s)(\(\d+\)|\([a-z]\))/g, '$1<b>$2</b>');
    return out;
  }

  function renderDetail(sec) {
    var badge = ds.badgeFor(sec.verification_status);
    var badgeHtml = '<div class="detail-badge-row"><span class="' + badge.cls + ' prov-badge">' +
      LS.esc(badge.text) + '</span></div>';
    var body;
    if (sec.definitions && sec.definitions.length) {
      body = renderDefinitionsBlock(sec);
    } else {
      var keys = fieldOrder(sec.fields);
      body = keys.map(function (k) {
        var labelClass = 'detail-label';
        if (/hr|industrial/i.test(k)) labelClass += ' hr';
        var items = sec.fields[k] || [];
        var isLegal = k === 'Legal Provision';
        var content = items.length === 1
          ? '<p>' + (isLegal ? styleLegalText(items[0], LS.state.query) : LS.highlight(LS.esc(items[0]), LS.state.query)) + '</p>'
          : '<ul>' + items.map(function (i) {
              return '<li>' + (isLegal ? styleLegalText(i, LS.state.query) : LS.highlight(LS.esc(i), LS.state.query)) + '</li>';
            }).join('') + '</ul>';
        return '<div class="detail-field"><div class="' + labelClass + '">' + LS.esc(k) +
          '</div><div class="detail-content">' + content + '</div></div>';
      }).join('');
    }
    return badgeHtml + body + LS.Xrefs.renderRelated(LS.state.lawId, sec.number, ds);
  }

  function renderDefinitionsBlock(sec) {
    var defs = sec.definitions || [];
    var dq = LS.state.defQuery || '';
    var filtered = dq
      ? defs.filter(function (d) {
          return d.term.toLowerCase().indexOf(dq.toLowerCase()) !== -1 ||
                 d.definition.toLowerCase().indexOf(dq.toLowerCase()) !== -1;
        })
      : defs;
    var TRUNC = 180;
    var listHtml = filtered.length ? filtered.map(function (d) {
      var isLong = d.definition.length > TRUNC;
      var isExpanded = LS.state.expandedDefs && LS.state.expandedDefs.has(d.term);
      var shown = (isLong && !isExpanded)
        ? d.definition.slice(0, TRUNC).replace(/\s+\S*$/, '') + '…'
        : d.definition;
      var toggle = isLong
        ? '<span class="def-toggle" data-term="' + LS.esc(d.term) + '">' + (isExpanded ? 'Show less' : 'Show more') + '</span>'
        : '';
      return '<div class="def-item"><div class="def-term">' + LS.highlight(LS.esc(d.term), dq) +
        '</div><div class="def-text">' + LS.highlight(LS.esc(shown), dq) + toggle + '</div></div>';
    }).join('')
      : '<div style="padding:16px 4px;color:var(--ink-faint);font-size:13px;">No matching terms.</div>';
    return '<div class="detail-field"><div class="detail-label">Definitions ' +
      '<span class="def-count-badge">' + defs.length + ' terms</span></div>' +
      '<div class="def-intro">Every defined term in this section, listed individually. Search or scroll to find one.</div>' +
      '<div class="def-search-wrap"><input class="def-search" id="defSearchInput" type="text" placeholder="Filter terms..." value="' +
      LS.esc(dq) + '" autocomplete="off" /></div>' +
      '<div class="def-list" id="defList">' + listHtml + '</div></div>';
  }

  function getSnippet(sec) {
    if (sec.definitions && sec.definitions.length) {
      var preview = sec.definitions.slice(0, 3).map(function (d) { return d.term; }).join(', ');
      return sec.definitions.length + ' defined terms — including ' + preview + '...';
    }
    var lp = sec.fields['Legal Provision'] || sec.fields['Summary'] || sec.fields['Explanation'] || [];
    var raw = lp.slice(0, 2).join(' ').replace(/\s+/g, ' ').trim();
    var CAP = 200;
    if (raw.length <= CAP) return raw;
    var cut = raw.slice(0, CAP);
    var lastSpace = cut.lastIndexOf(' ');
    return cut.slice(0, lastSpace > 100 ? lastSpace : CAP) + '…';
  }

  function renderCards() {
    var law = currentLaw();
    var q = (LS.state.query || '').trim();
    var secs = law.provisions.filter(function (s) {
      if (LS.state.chapterFilter && s.chapter !== LS.state.chapterFilter) return false;
      return sectionMatches(s, q);
    });
    document.getElementById('resultsCount').innerHTML =
      '<b>' + secs.length + '</b> section' + (secs.length === 1 ? '' : 's') +
      (LS.state.chapterFilter ? ' in <b>' + LS.esc(titleCase(LS.state.chapterFilter)) + '</b>' : '');

    var cardList = document.getElementById('cardList');
    if (!law.provisions.length) {
      cardList.innerHTML = '<div class="stub-notice"><div class="stub-notice-title">📦 ' +
        LS.esc(law.title) + ' — provisions being added</div>' +
        '<div class="stub-notice-body">This act was added as a stub (title + official-source metadata). ' +
        'Its section notes are still going through the verification pipeline. ' +
        'Use <b>Check for updates</b> in the footer to fetch newer data when it lands in the project repo.</div></div>';
      return;
    }
    if (!secs.length) {
      cardList.innerHTML = '<div class="empty-state">' +
        '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
        '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
        '<h3>No sections found</h3><p>Try a different activity or keyword.</p></div>';
      return;
    }

    cardList.innerHTML = secs.map(function (sec) {
      var isOpen = LS.state.openSection === sec.number;
      var badge = ds.badgeFor(sec.verification_status);
      return '<div class="card ' + (isOpen ? 'open' : '') + '" data-num="' + LS.esc(sec.number) + '">' +
        '<div class="card-head">' +
        '<div class="sec-badge">§' + LS.esc(sec.number) + '</div>' +
        '<div class="card-body-top">' +
        '<div class="card-title">' + LS.highlight(LS.esc(sec.title), q) +
        ' <span class="' + badge.cls + ' prov-badge" title="' + LS.esc(badge.text) + '">' +
        (sec.verification_status === 'verified' ? '✓ verified' : 'AI') + '</span></div>' +
        '<div class="card-chapter">Chapter ' + LS.esc(sec.chapter_num || '') + ' · ' + LS.esc(titleCase(sec.chapter)) + '</div>' +
        '<div class="card-snippet">' + LS.highlight(LS.esc(getSnippet(sec)), q) + '</div>' +
        '<div class="card-activities">' + (sec.activities || []).map(function (a) {
          return '<span class="tag">' + LS.esc(a) + '</span>';
        }).join('') + '</div>' +
        '</div>' +
        '<svg class="chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<polyline points="6 9 12 15 18 9"/></svg>' +
        '</div>' +
        '<div class="card-detail">' + (isOpen ? renderDetail(sec) : '') + '</div>' +
        '</div>';
    }).join('');

    cardList.querySelectorAll('.card-head').forEach(function (el) {
      el.addEventListener('click', function () {
        var num = el.parentElement.getAttribute('data-num');
        if (LS.state.openSection === num) {
          LS.state.openSection = null;
        } else {
          LS.state.openSection = num;
          LS.state.defQuery = '';
        }
        LS.render();
        if (LS.state.openSection) LS.syncHash();
      });
    });

    var defInput = document.getElementById('defSearchInput');
    if (defInput) {
      defInput.addEventListener('click', function (e) { e.stopPropagation(); });
      defInput.addEventListener('input', function (e) {
        LS.state.defQuery = e.target.value;
        LS.render();
        var el = document.getElementById('defSearchInput');
        if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
      });
    }

    document.querySelectorAll('.def-toggle').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        var term = el.getAttribute('data-term');
        if (LS.state.expandedDefs.has(term)) LS.state.expandedDefs.delete(term);
        else LS.state.expandedDefs.add(term);
        LS.render();
      });
    });

    LS.Xrefs.wireXrefLinks(cardList);

    if (LS.state.openSection) {
      var openEl = cardList.querySelector('.card.open');
      if (openEl) openEl.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }

  /* ---------- main view ---------- */
  function renderLawView() {
    renderCategories();
    renderLawTabs();
    renderActHeader();
    renderChips();
    renderChapters();
    renderComponentLawsCard();
    renderCards();
    var clear = document.getElementById('clearFilter');
    clear.onclick = function () { LS.state.chapterFilter = null; LS.render(); };
    var inp = document.getElementById('searchInput');
    inp.oninput = function () {
      LS.state.query = inp.value;
      LS.state.openSection = null;
      renderCards();
    };
  }

  return {
    init: init,
    renderLawView: renderLawView,
    renderCards: renderCards,
    currentLaw: currentLaw,
    categoryForLaw: categoryForLaw
  };
})();
