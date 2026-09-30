/* ============================================================
   LexSync FULL — js/updateCheck.js
   "Check for updates" button (in the footer). Reads the bundled
   data/version.json, then fetches the manifest_url from the
   project repo (a raw GitHub URL). If the remote data_version is
   newer than the bundled one, it prompts the user to refresh /
   re-download the app. No fake claims: it plainly says it checks
   the project repo for newer data. All network errors are handled
   gracefully (offline-friendly).
   ============================================================ */
var LS = window.LS || {};
window.LS = LS;

LS.UpdateCheck = (function () {
  var ds = null;

  function init(dataset) { ds = dataset; }

  // Compare date-based versions like "2026.09.30" (with optional -rN).
  function cmpVersions(a, b) {
    function parts(v) {
      var m = String(v || '').match(/^(\d+)\.(\d+)\.(\d+)(?:-r(\d+))?/);
      return m ? [ +m[1], +m[2], +m[3], +(m[4] || 0) ] : [0, 0, 0, 0];
    }
    var pa = parts(a), pb = parts(b);
    for (var i = 0; i < 4; i++) {
      if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
    }
    return 0;
  }

  function checkForUpdates() {
    var status = document.getElementById('updateStatus');
    var local = (ds.version && ds.version.data_version) || 'unknown';
    var url = ds.version && ds.version.manifest_url;
    if (!url) {
      status.innerHTML = '<span class="upd-note">No update manifest configured in this build.</span>';
      return;
    }
    status.innerHTML = '<span class="upd-note">Checking the project repo for newer data…</span>';
    fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (remote) {
      var rv = remote.data_version || 'unknown';
      if (cmpVersions(local, rv) < 0) {
        var notes = (remote.changelog || []).slice(0, 3).map(function (c) {
          return '<li>' + LS.esc(c) + '</li>';
        }).join('');
        status.innerHTML =
          '<div class="upd-newer">⬆️ <b>Newer data available: ' + LS.esc(rv) + '</b> ' +
          '(this copy: ' + LS.esc(local) + '). ' +
          'Re-download <b>dist/lexsync.html</b> from the repo, or ask whoever maintains the data to rebuild it.' +
          (notes ? '<ul class="upd-changelog">' + notes + '</ul>' : '') + '</div>';
      } else {
        status.innerHTML = '<span class="upd-ok">✅ You\'re up to date (data version ' +
          LS.esc(local) + '). This check reads the project repo\'s manifest — no data was changed.</span>';
      }
    }).catch(function (err) {
      status.innerHTML = '<span class="upd-note">Couldn\'t reach the project repo (' +
        LS.esc(err.message) + '). You may be offline, or the repo may not be published yet. ' +
        'This copy\'s data version: ' + LS.esc(local) + '.</span>';
    });
  }

  function wire() {
    var btn = document.getElementById('updateBtn');
    if (btn) btn.addEventListener('click', checkForUpdates);
  }

  return { init: init, wire: wire, checkForUpdates: checkForUpdates, cmpVersions: cmpVersions };
})();
