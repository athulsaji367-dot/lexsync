/* ============================================================
   LexSync FULL — js/app.js
   Shell: state, router (view toggle), shared helpers, deep links,
   footer with legal disclaimer, and boot.

   View modes: law | activity | calculators | assistant | games
                | applicability | checklists
   ============================================================ */
var LS = window.LS || {};
window.LS = LS;

/* ---------- shared helpers ---------- */
LS.esc = function (s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};

LS.highlight = function (text, query) {
  if (!query) return text;
  var words = String(query).split(/\s+/).filter(function (w) { return w.length > 1; });
  var out = text;
  words.forEach(function (w) {
    var re = new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    out = out.replace(re, '<mark>$1</mark>');
  });
  return out;
};

/* ---------- state ---------- */
LS.state = {
  viewMode: 'law',
  category: 'labour_codes',
  lawId: 'wages_code',
  query: '',
  chapterFilter: null,
  openSection: null,
  defQuery: '',
  expandedDefs: new Set(),
  activityBucket: null,
  checklistId: null,
  assistantMessages: [],
  apiKey: '',
  game: {
    screen: 'hub', lawId: null, mode: null, questions: [],
    index: 0, score: 0, streak: 0, bestStreak: 0,
    correctCount: 0, answered: false, selectedIdx: null,
    timeLeft: 60, timerHandle: null
  }
};

/* ---------- toast ---------- */
LS.showSoonToast = function () {
  var toast = document.getElementById('soonToast');
  toast.classList.add('show');
  clearTimeout(window._soonToastTimer);
  window._soonToastTimer = setTimeout(function () { toast.classList.remove('show'); }, 2200);
};

/* ---------- nav / router ---------- */
var VIEW_MODES = [
  { id: 'law', label: 'Browse by Law' },
  { id: 'activity', label: 'Browse by Activity' },
  { id: 'calculators', label: 'Calculators' },
  { id: 'assistant', label: 'Ask LexSync' },
  { id: 'games', label: '🎮 Learn & Play' },
  { id: 'applicability', label: 'Which Laws Apply?' },
  { id: 'checklists', label: 'Checklists' }
];

function renderViewToggle() {
  var row = document.getElementById('viewToggle');
  row.innerHTML = VIEW_MODES.map(function (m) {
    return '<div class="view-toggle-btn ' + (LS.state.viewMode === m.id ? 'active' : '') +
      '" data-mode="' + m.id + '">' + LS.esc(m.label) + '</div>';
  }).join('');
  row.querySelectorAll('.view-toggle-btn').forEach(function (el) {
    el.addEventListener('click', function () {
      var mode = el.getAttribute('data-mode');
      if (mode !== LS.state.viewMode) {
        LS.state.viewMode = mode;
        LS.state.activityBucket = null;
        LS.state.checklistId = null;
        LS.render();
        window.scrollTo(0, 0);
      }
    });
  });
}

var WRAPS = {
  law: 'lawViewWrap', activity: 'activityViewWrap', calculators: 'calcViewWrap',
  assistant: 'assistantViewWrap', games: 'gamesViewWrap',
  applicability: 'apprViewWrap', checklists: 'checkViewWrap'
};

LS.render = function () {
  renderViewToggle();
  Object.keys(WRAPS).forEach(function (mode) {
    var el = document.getElementById(WRAPS[mode]);
    if (el) el.style.display = (LS.state.viewMode === mode) ? '' : 'none';
  });
  var inLaw = LS.state.viewMode === 'law';
  document.getElementById('categoryRow').style.display = inLaw ? '' : 'none';
  document.getElementById('lawTabs').style.display = inLaw ? '' : 'none';

  if (LS.state.viewMode === 'law') LS.LawBrowser.renderLawView();
  else if (LS.state.viewMode === 'activity') LS.ActivityBrowser.renderActivityView();
  else if (LS.state.viewMode === 'calculators') LS.Calculators.renderCalculatorView();
  else if (LS.state.viewMode === 'assistant') LS.Assistant.renderAssistantView();
  else if (LS.state.viewMode === 'games') LS.Games.renderGamesView();
  else if (LS.state.viewMode === 'applicability') LS.Applicability.renderApplicabilityView();
  else if (LS.state.viewMode === 'checklists') LS.Checklists.renderChecklistsView();
};

/* Deep link: open a specific act + section in the law browser.
   Used by checklists, xrefs, assistant citations, games. */
LS.openProvision = function (actSlug, sectionNumber) {
  if (!LS.ds || !LS.ds.actBySlug[actSlug]) { LS.showSoonToast(); return; }
  LS.state.viewMode = 'law';
  LS.state.category = LS.LawBrowser.categoryForLaw(actSlug);
  LS.state.lawId = actSlug;
  LS.state.query = '';
  LS.state.chapterFilter = null;
  LS.state.openSection = String(sectionNumber);
  LS.state.defQuery = '';
  var inp = document.getElementById('searchInput');
  if (inp) inp.value = '';
  LS.render();
  window.scrollTo(0, 0);
};

/* Hash deep-links: #/law/<slug>/<section> */
LS.syncHash = function () {
  try {
    var h = '#/law/' + LS.state.lawId;
    if (LS.state.openSection) h += '/' + LS.state.openSection;
    history.replaceState(null, '', h);
  } catch (e) { /* file:// may block history */ }
};

function applyHash() {
  var m = (location.hash || '').match(/^#\/law\/([^\/]+)(?:\/([^\/]+))?/);
  if (m && LS.ds && LS.ds.actBySlug[m[1]]) {
    LS.state.viewMode = 'law';
    LS.state.category = LS.LawBrowser.categoryForLaw(m[1]);
    LS.state.lawId = m[1];
    if (m[2]) LS.state.openSection = decodeURIComponent(m[2]);
  }
}

/* ---------- boot ---------- */
function bootError(msg) {
  document.getElementById('root').innerHTML =
    '<div class="boot-error"><h2>LexSync couldn\'t load its data</h2><p>' + LS.esc(msg) + '</p>' +
    '<p>Open <b>dist/lexsync.html</b> for the offline build, or serve this folder with ' +
    '<code>python3 -m http.server</code> and reload.</p></div>';
}

LS.boot = function () {
  LS.Data.load().then(function (ds) {
    LS.ds = ds;
    if (!ds.actBySlug[LS.state.lawId]) LS.state.lawId = ds.acts[0].slug;
    ['LawBrowser', 'ActivityBrowser', 'Calculators', 'Applicability',
     'Checklists', 'Assistant', 'Games', 'UpdateCheck'].forEach(function (mod) {
      if (LS[mod] && LS[mod].init) LS[mod].init(ds);
    });
    LS.state.category = LS.LawBrowser.categoryForLaw(LS.state.lawId) || 'labour_codes';
    applyHash();
    LS.Assistant.wireAssistantInput();
    LS.UpdateCheck.wire();
    document.getElementById('dataVersionLine').textContent =
      'Data: ' + ds.acts.length + ' laws · ' +
      ds.acts.reduce(function (n, a) { return n + a.provisions.length; }, 0) +
      ' provisions · version ' + ((ds.version && ds.version.data_version) || 'dev') +
      (ds.source === 'embedded' ? ' · offline build' : '');
    LS.render();
  }).catch(function (err) {
    bootError(err && err.message ? err.message : String(err));
  });
};

document.addEventListener('DOMContentLoaded', LS.boot);
