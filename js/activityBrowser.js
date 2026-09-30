/* ============================================================
   LexSync FULL — js/activityBrowser.js
   "Browse by Activity" view: pick an HR activity (from
   data/hr_activities.json) and see every relevant provision across
   all acts, grouped by act. Keyword buckets mirror the lite app.
   Tiles and result cards reuse the lite's CSS classes.
   ============================================================ */
var LS = window.LS || {};
window.LS = LS;

LS.ActivityBrowser = (function () {
  var ds = null;

  function init(dataset) { ds = dataset; }

  // A provision matches an activity bucket if any keyword appears in
  // its title, chapter, activities list, or field text.
  function bucketMatches(sec, keywords) {
    var hay = [sec.title, sec.chapter, (sec.activities || []).join(' ')]
      .concat(Object.keys(sec.fields || {}).map(function (k) { return (sec.fields[k] || []).join(' '); }))
      .join(' ').toLowerCase();
    return keywords.some(function (kw) { return hay.indexOf(kw.toLowerCase()) !== -1; });
  }

  function renderActivityView() {
    var body = document.getElementById('activityBody');
    var titleEl = document.getElementById('activityTitle');
    var subEl = document.getElementById('activitySub');

    if (!LS.state.activityBucket) {
      titleEl.textContent = 'Browse by HR Activity';
      subEl.textContent = "Pick what you're working on — see every relevant law provision in one place.";
      body.innerHTML = '<div class="activity-grid" id="activityGrid"></div>';
      var grid = document.getElementById('activityGrid');
      grid.innerHTML = ds.hrActivities.map(function (b) {
        var count = 0;
        ds.acts.forEach(function (law) {
          law.provisions.forEach(function (s) { if (bucketMatches(s, b.keywords)) count++; });
        });
        return '<div class="activity-tile" data-bucket="' + LS.esc(b.id) + '">' +
          '<div class="activity-tile-icon">' + LS.esc(b.icon || '📌') + '</div>' +
          '<div class="activity-tile-name">' + LS.esc(b.name) + '</div>' +
          '<div class="activity-tile-count">' + count + ' provisions across all laws</div></div>';
      }).join('');
      grid.querySelectorAll('.activity-tile').forEach(function (el) {
        el.addEventListener('click', function () {
          LS.state.activityBucket = el.getAttribute('data-bucket');
          LS.render();
        });
      });
      return;
    }

    var bucket = ds.hrActivities.find(function (b) { return b.id === LS.state.activityBucket; });
    if (!bucket) { LS.state.activityBucket = null; LS.render(); return; }

    titleEl.textContent = bucket.name;
    subEl.textContent = 'Every matching provision, pulled from across all laws in the corpus.';

    var results = [];
    ds.acts.forEach(function (law) {
      law.provisions.forEach(function (sec) {
        if (bucketMatches(sec, bucket.keywords)) {
          var desc = ((sec.fields['Objective'] || [])[0]) ||
                     ((sec.fields['Legal Provision'] || [])[0] || '').slice(0, 220) + '…';
          results.push({ law: law, sec: sec, desc: desc });
        }
      });
    });

    var html = '<div class="activity-back" id="activityBackBtn">← All activities</div>';
    html += '<div class="activity-results-header">' + LS.esc(bucket.icon || '') + ' ' + LS.esc(bucket.name) + '</div>';
    html += '<div class="activity-results-sub">' + results.length + ' provision' +
      (results.length === 1 ? '' : 's') + ' found</div>';
    if (!results.length) {
      html += '<div class="activity-empty">No matching provisions found.</div>';
    } else {
      html += results.map(function (r) {
        var badge = ds.badgeFor(r.sec.verification_status);
        return '<div class="activity-result-card activity-result-link" data-act="' + LS.esc(r.law.slug) +
          '" data-sec="' + LS.esc(r.sec.number) + '">' +
          '<span class="activity-result-law">' + LS.esc(ds.shortName(r.law.slug)) + '</span> ' +
          '<span class="' + badge.cls + ' prov-badge" title="' + LS.esc(badge.text) + '">' +
          (r.sec.verification_status === 'verified' ? '✓ verified' : 'AI notes') + '</span>' +
          '<div class="activity-result-title">§' + LS.esc(r.sec.number) + ' — ' + LS.esc(r.sec.title) + '</div>' +
          '<div class="activity-result-desc">' + LS.esc(r.desc || '') + '</div></div>';
      }).join('');
    }
    body.innerHTML = html;
    document.getElementById('activityBackBtn').addEventListener('click', function () {
      LS.state.activityBucket = null;
      LS.render();
    });
    body.querySelectorAll('.activity-result-link').forEach(function (el) {
      el.addEventListener('click', function () {
        LS.openProvision(el.getAttribute('data-act'), el.getAttribute('data-sec'));
      });
    });
  }

  return { init: init, renderActivityView: renderActivityView, bucketMatches: bucketMatches };
})();
