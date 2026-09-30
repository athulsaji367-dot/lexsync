/* ============================================================
   LexSync FULL — js/checklists.js
   "Compliance Checklists" view. Checklist definitions live in
   data/checklists.json; every item links a task to an act + section
   (deep link into the law browser). Items whose target provision
   doesn't exist in the corpus are flagged, not silently dropped.
   ============================================================ */
var LS = window.LS || {};
window.LS = LS;

LS.Checklists = (function () {
  var ds = null;

  function init(dataset) { ds = dataset; }

  function renderChecklistsView() {
    var body = document.getElementById('checkBody');
    document.getElementById('checkTitle').textContent = 'Compliance Checklists';
    document.getElementById('checkSub').textContent =
      'Step-by-step statutory touchpoints per HR activity — every item links to the exact provision.';

    var sel = LS.state.checklistId;
    if (!sel) {
      body.innerHTML = '<div class="activity-grid">' + ds.checklists.map(function (c) {
        return '<div class="activity-tile" data-cl="' + LS.esc(c.id) + '">' +
          '<div class="activity-tile-icon">' + LS.esc(c.icon || '✅') + '</div>' +
          '<div class="activity-tile-name">' + LS.esc(c.name) + '</div>' +
          '<div class="activity-tile-count">' + c.items.length + ' items</div></div>';
      }).join('') + '</div>';
      body.querySelectorAll('.activity-tile').forEach(function (el) {
        el.addEventListener('click', function () {
          LS.state.checklistId = el.getAttribute('data-cl');
          LS.render();
        });
      });
      return;
    }

    var cl = ds.checklists.find(function (c) { return c.id === sel; });
    if (!cl) { LS.state.checklistId = null; LS.render(); return; }

    body.innerHTML =
      '<button class="activity-back" id="clBack">← All checklists</button>' +
      '<div class="activity-results-header"><span class="activity-tile-icon">' + LS.esc(cl.icon || '✅') + '</span> ' +
      LS.esc(cl.name) + '</div>' +
      '<div class="activity-results-sub" style="margin-bottom:14px;">' + LS.esc(cl.desc || '') + '</div>' +
      '<div class="checklist">' + cl.items.map(function (it, i) {
        var p = ds.findProvision(it.act, it.section);
        var badge = p ? ds.badgeFor(p.verification_status) : null;
        var link = p
          ? '<button class="xref-link check-link" data-act="' + LS.esc(it.act) + '" data-sec="' + LS.esc(it.section) + '">' +
            LS.esc(ds.shortName(it.act)) + ' · Sec ' + LS.esc(it.section) + ' ↗</button>'
          : '<span class="check-missing">⚠️ provision not in corpus (' + LS.esc(it.act) + ' Sec ' + LS.esc(it.section) + ')</span>';
        return '<label class="check-item"><input type="checkbox" class="check-box" />' +
          '<span class="check-num">' + (i + 1) + '</span>' +
          '<span class="check-body"><span class="check-task">' + LS.esc(it.task) + '</span>' +
          '<span class="check-meta">' + link +
          (badge ? ' <span class="' + badge.cls + ' prov-badge">' + LS.esc(badge.text) + '</span>' : '') +
          '</span></span></label>';
      }).join('') + '</div>' +
      '<div class="check-progress" id="checkProgress"></div>';

    document.getElementById('clBack').addEventListener('click', function () {
      LS.state.checklistId = null;
      LS.render();
    });

    var boxes = body.querySelectorAll('.check-box');
    function updateProgress() {
      var done = body.querySelectorAll('.check-box:checked').length;
      document.getElementById('checkProgress').textContent =
        done + ' of ' + boxes.length + ' done';
    }
    boxes.forEach(function (b) {
      b.addEventListener('change', function () {
        b.closest('.check-item').classList.toggle('done', b.checked);
        updateProgress();
      });
    });
    updateProgress();

    body.querySelectorAll('.check-link').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        LS.openProvision(el.getAttribute('data-act'), el.getAttribute('data-sec'));
      });
    });
  }

  return { init: init, renderChecklistsView: renderChecklistsView };
})();
