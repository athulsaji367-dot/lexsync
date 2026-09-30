/* ============================================================
   LexSync FULL — js/games.js
   "Learn & Play" view: 6 quiz modes from data/game_modes.json.
   Questions are generated from the live corpus (definitions,
   objectives, chapters, numbers, and the curated xrefs for
   Then-vs-Now), so they stay in sync with data updates.
   ============================================================ */
var LS = window.LS || {};
window.LS = LS;

LS.Games = (function () {
  var ds = null;

  function init(dataset) { ds = dataset; }

  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function pickN(a, n) { return shuffle(a).slice(0, n); }

  function poolFor(lawId) {
    var laws = lawId === 'all' ? ds.acts : [ds.actBySlug[lawId]];
    var pool = [];
    laws.forEach(function (l) {
      if (l) (l.provisions || []).forEach(function (p) { pool.push({ law: l, sec: p }); });
    });
    return pool;
  }

  /* ---------- question generators ---------- */
  function genDefine(pool, n) {
    var cands = pool.filter(function (x) { return x.sec.definitions && x.sec.definitions.length; });
    var qs = [];
    pickN(cands, Math.min(n, cands.length)).forEach(function (x) {
      var d = pickN(x.sec.definitions, 1)[0];
      var decoys = [];
      pool.forEach(function (y) {
        (y.sec.definitions || []).forEach(function (dd) {
          if (dd.term !== d.term && decoys.indexOf(dd.term) === -1) decoys.push(dd.term);
        });
      });
      if (decoys.length < 3) return;
      var opts = shuffle([d.term].concat(pickN(decoys, 3)));
      qs.push({
        prompt: '📖 Define it', sub: d.definition,
        options: opts, answerIdx: opts.indexOf(d.term),
        explain: 'From ' + ds.shortName(x.law.slug) + ' · Sec ' + x.sec.number,
        cite: { act: x.law.slug, sec: x.sec.number }
      });
    });
    return qs;
  }

  function genDetective(pool, n) {
    var cands = pool.filter(function (x) {
      return (x.sec.fields['Objective'] && x.sec.fields['Objective'][0]) ||
             (x.sec.fields['HR Significance'] && x.sec.fields['HR Significance'][0]);
    });
    var qs = [];
    pickN(cands, Math.min(n, cands.length)).forEach(function (x) {
      var clue = (x.sec.fields['Objective'] && x.sec.fields['Objective'][0]) ||
                 x.sec.fields['HR Significance'][0];
      var sameLaw = pool.filter(function (y) { return y.law.slug === x.law.slug && y.sec.number !== x.sec.number; });
      if (sameLaw.length < 3) return;
      var decoys = pickN(sameLaw, 3).map(function (y) { return 'Sec ' + y.sec.number + ' — ' + y.sec.title; });
      var correct = 'Sec ' + x.sec.number + ' — ' + x.sec.title;
      var opts = shuffle([correct].concat(decoys));
      qs.push({
        prompt: '🔍 Section Detective', sub: '“' + clue + '”',
        options: opts, answerIdx: opts.indexOf(correct),
        explain: 'Clue from ' + ds.shortName(x.law.slug),
        cite: { act: x.law.slug, sec: x.sec.number }
      });
    });
    return qs;
  }

  var NUM_RE = /(₹\s?[\d,]+|[\d,]+\s?%|\b\d+(?:\.\d+)?\b)/;

  function genBlank(pool, n) {
    var qs = [];
    var cands = shuffle(pool.filter(function (x) {
      var t = ((x.sec.fields['Objective'] || []).join(' ') + ' ' + (x.sec.fields['HR Significance'] || []).join(' '));
      return NUM_RE.test(t);
    }));
    cands.forEach(function (x) {
      if (qs.length >= n) return;
      var texts = ((x.sec.fields['Objective'] || []).concat(x.sec.fields['HR Significance'] || []));
      var src = texts.find(function (t) { return NUM_RE.test(t); });
      if (!src) return;
      var m = src.match(NUM_RE);
      var numStr = m[1];
      var numVal = parseFloat(numStr.replace(/[₹,%\s]/g, '').replace(/,/g, ''));
      if (isNaN(numVal)) return;
      var decoys = new Set();
      var tries = [numVal * 2, numVal / 2, numVal + 5, numVal - 5, numVal + 10, numVal * 1.5, Math.round(numVal * 0.75)];
      tries.forEach(function (t) {
        var r = Math.round(t * 100) / 100;
        if (r > 0 && r !== numVal) {
          var s = numStr.indexOf('₹') !== -1 ? '₹' + r.toLocaleString('en-IN') : (numStr.indexOf('%') !== -1 ? r + '%' : String(r));
          decoys.add(s);
        }
      });
      var decoyArr = Array.from(decoys).slice(0, 3);
      if (decoyArr.length < 3) return;
      var opts = shuffle([numStr].concat(decoyArr));
      var blanked = src.replace(numStr, '____');
      qs.push({
        prompt: '✏️ Fill the Blank', sub: blanked,
        options: opts, answerIdx: opts.indexOf(numStr),
        explain: ds.shortName(x.law.slug) + ' · Sec ' + x.sec.number + ' — ' + x.sec.title,
        cite: { act: x.law.slug, sec: x.sec.number }
      });
    });
    return qs;
  }

  function genChapter(pool, n) {
    var byLaw = {};
    pool.forEach(function (x) {
      (byLaw[x.law.slug] = byLaw[x.law.slug] || { law: x.law, secs: [] }).secs.push(x.sec);
    });
    var qs = [];
    Object.keys(byLaw).forEach(function (slug) {
      var entry = byLaw[slug];
      var chapters = [];
      entry.law.chapters.forEach(function (c) { if (chapters.indexOf(c.name) === -1) chapters.push(c.name); });
      if (chapters.length < 2) return;
      pickN(entry.secs, Math.min(n, entry.secs.length)).forEach(function (s) {
        if (qs.length >= n) return;
        var others = chapters.filter(function (c) { return c !== s.chapter; });
        if (others.length < 3) return;
        var opts = shuffle([s.chapter].concat(pickN(others, 3)));
        qs.push({
          prompt: '🗂️ Chapter Sort',
          sub: 'Sec ' + s.number + ' — ' + s.title + ' belongs to which chapter?',
          options: opts, answerIdx: opts.indexOf(s.chapter),
          explain: ds.shortName(slug),
          cite: { act: slug, sec: s.number }
        });
      });
    });
    return shuffle(qs).slice(0, n);
  }

  /* Then vs Now: built from the curated xrefs where an old Act maps
     to a consolidating Code. */
  function genThenNow(pool, n) {
    var qs = [];
    var codeNames = { wages_code: 'Code on Wages, 2019', osh_code: 'OSH Code, 2020', ir_code: 'Industrial Relations Code, 2020', ss_code: 'Code on Social Security, 2020' };
    (ds.xrefs || []).forEach(function (x) {
      if (qs.length >= n) return;
      var oldLinks = (x.links || []).filter(function (l) {
        var a = ds.actBySlug[l.act];
        return a && a.type !== 'code' && a.year < 2019;
      });
      var newLinks = (x.links || []).filter(function (l) {
        var a = ds.actBySlug[l.act];
        return a && a.type === 'code';
      });
      if (!oldLinks.length || !newLinks.length) return;
      var oldL = oldLinks[0], newL = newLinks[0];
      var oldName = ds.actBySlug[oldL.act].title;
      var correct = codeNames[newL.act] || ds.shortName(newL.act);
      var decoys = Object.keys(codeNames).filter(function (k) { return k !== newL.act; })
        .map(function (k) { return codeNames[k]; });
      var opts = shuffle([correct].concat(pickN(decoys, 3)));
      qs.push({
        prompt: '🔄 Then vs Now',
        sub: '“' + x.topic + '”: the ' + oldName + ' was consolidated into which Code?',
        options: opts, answerIdx: opts.indexOf(correct),
        explain: x.note || '',
        cite: { act: newL.act, sec: newL.section }
      });
    });
    return qs;
  }

  function genMixed(pool, n) {
    var gens = [genDefine, genDetective, genBlank, genChapter, genThenNow];
    var qs = [];
    gens.forEach(function (g) {
      try { qs = qs.concat(g(pool, Math.ceil(n / gens.length))); } catch (e) { /* skip */ }
    });
    return shuffle(qs).slice(0, n);
  }

  var GENERATORS = {
    define: genDefine, detective: genDetective, blank: genBlank,
    chapter: genChapter, thennow: genThenNow, speed: genMixed
  };

  /* ---------- flow ---------- */
  function startGame(lawId, modeId) {
    var g = LS.state.game;
    var mode = ds.gameModes.find(function (m) { return m.id === modeId; }) || ds.gameModes[0];
    var pool = poolFor(lawId);
    var count = mode.id === 'speed' ? 20 : (mode.questionCount || 10);
    var gen = GENERATORS[mode.id] || genMixed;
    var questions = gen(pool, count);
    if (questions.length < 4 && lawId !== 'all') {
      // Fall back to the all-laws pool for thin laws/stubs.
      questions = gen(poolFor('all'), count);
    }
    g.screen = 'playing'; g.mode = mode; g.lawId = lawId;
    g.questions = questions; g.index = 0; g.score = 0;
    g.streak = 0; g.bestStreak = 0; g.correctCount = 0;
    g.answered = false; g.selectedIdx = null;
    if (mode.id === 'speed') {
      g.timeLeft = 60;
      g.timerHandle = setInterval(function () {
        g.timeLeft--;
        var t = document.getElementById('gameTimerDisplay');
        if (t) t.textContent = g.timeLeft + 's';
        if (g.timeLeft <= 0) endGame();
      }, 1000);
    }
    LS.render();
  }

  function answerGame(idx) {
    var g = LS.state.game;
    if (g.answered) return;
    g.answered = true; g.selectedIdx = idx;
    var q = g.questions[g.index];
    if (idx === q.answerIdx) {
      g.score += 10 + Math.min(g.streak * 2, 20);
      g.streak++; g.correctCount++;
      g.bestStreak = Math.max(g.bestStreak, g.streak);
    } else {
      g.streak = 0;
    }
    LS.render();
  }

  function nextQuestion() {
    var g = LS.state.game;
    g.index++;
    g.answered = false; g.selectedIdx = null;
    if (g.index >= g.questions.length) endGame();
    else LS.render();
  }

  function endGame() {
    var g = LS.state.game;
    if (g.timerHandle) { clearInterval(g.timerHandle); g.timerHandle = null; }
    g.screen = 'results';
    LS.render();
  }

  /* ---------- rendering ---------- */
  function lawOptions() {
    var opts = [{ id: 'all', name: '🌐 All laws (mixed)' }];
    ds.acts.filter(function (a) { return a.provisions.length; }).forEach(function (a) {
      opts.push({ id: a.slug, name: ds.shortName(a.slug) });
    });
    return opts;
  }

  function renderGamesView() {
    var g = LS.state.game;
    var body = document.getElementById('gameBody');
    if (g.screen === 'hub') return renderHub(body);
    if (g.screen === 'pickLaw') return renderPickLaw(body);
    if (g.screen === 'pickMode') return renderPickMode(body);
    if (g.screen === 'playing') return renderPlaying(body);
    if (g.screen === 'results') return renderResults(body);
  }

  function renderHub(body) {
    body.innerHTML =
      '<div class="game-hub"><div class="game-question-title">🎮 Learn Through Play</div>' +
      '<div class="game-sub">Quiz yourself on real sections, definitions, and chapters. ' +
      'Questions are generated from the app\'s own corpus.</div>' +
      '<button class="game-start-btn" id="gameStart">Start a game →</button></div>';
    document.getElementById('gameStart').addEventListener('click', function () {
      LS.state.game.screen = 'pickLaw';
      LS.render();
    });
  }

  function renderPickLaw(body) {
    body.innerHTML = '<div class="game-back" id="gameBackHub">← Games hub</div>' +
      '<div class="game-step-label">Step 1 — Pick a law</div>' +
      '<div class="game-law-grid">' + lawOptions().map(function (o) {
        return '<div class="game-law-tile" data-law="' + LS.esc(o.id) + '">' +
          '<div class="game-law-tile-name">' + LS.esc(o.name) + '</div></div>';
      }).join('') + '</div>';
    document.getElementById('gameBackHub').addEventListener('click', function () {
      LS.state.game.screen = 'hub'; LS.render();
    });
    body.querySelectorAll('.game-law-tile').forEach(function (el) {
      el.addEventListener('click', function () {
        LS.state.game.lawId = el.getAttribute('data-law');
        LS.state.game.screen = 'pickMode';
        LS.render();
      });
    });
  }

  function renderPickMode(body) {
    body.innerHTML = '<div class="game-back" id="gameBackLaw">← Pick law</div>' +
      '<div class="game-step-label">Step 2 — Pick a mode</div>' +
      '<div class="game-mode-grid">' + ds.gameModes.map(function (m) {
        return '<div class="game-mode-tile" data-mode="' + LS.esc(m.id) + '">' +
          '<div class="game-mode-icon">' + LS.esc(m.icon || '🎯') + '</div>' +
          '<div class="game-mode-name">' + LS.esc(m.name) + '</div>' +
          '<div class="game-mode-desc">' + LS.esc(m.desc || '') + '</div></div>';
      }).join('') + '</div>';
    document.getElementById('gameBackLaw').addEventListener('click', function () {
      LS.state.game.screen = 'pickLaw'; LS.render();
    });
    body.querySelectorAll('.game-mode-tile').forEach(function (el) {
      el.addEventListener('click', function () {
        startGame(LS.state.game.lawId, el.getAttribute('data-mode'));
      });
    });
  }

  function renderPlaying(body) {
    var g = LS.state.game;
    var q = g.questions[g.index];
    if (!q) { endGame(); return; }
    var isSpeed = g.mode.id === 'speed';
    var progressPct = g.questions.length ? Math.round((g.index / g.questions.length) * 100) : 0;
    body.innerHTML =
      '<div class="game-hud">' +
      '<div class="game-progress-wrap">' +
      (isSpeed ? '' :
        '<div class="game-progress-bar"><div class="game-progress-fill" style="width:' + progressPct + '%"></div></div>' +
        '<div class="game-progress-label">Question ' + (g.index + 1) + ' of ' + g.questions.length + '</div>') +
      '</div>' +
      '<div class="game-stat">🔥 ' + g.streak + '</div>' +
      '<div class="game-stat">⭐ ' + g.score + '</div>' +
      (isSpeed ? '<div class="game-stat game-timer" id="gameTimerDisplay">' + g.timeLeft + 's</div>' : '') +
      '</div>' +
      '<div class="game-card">' +
      '<div class="game-question-title">' + LS.esc(q.prompt) + '</div>' +
      '<div class="game-clue">' + q.sub + '</div>' +
      '<div class="game-options">' + q.options.map(function (o, i) {
        var cls = 'game-option';
        if (g.answered) {
          cls += ' locked';
          if (i === q.answerIdx) cls += ' correct';
          else if (i === g.selectedIdx) cls += ' incorrect';
        }
        return '<div class="' + cls + '" data-idx="' + i + '">' + LS.esc(o) + '</div>';
      }).join('') + '</div>' +
      '<div id="gameFeedbackWrap">' + (g.answered
        ? '<div class="game-feedback ' + (g.selectedIdx === q.answerIdx ? 'correct' : 'incorrect') + '">' +
          '<span>' + (g.selectedIdx === q.answerIdx ? '✅ Correct!' : '❌ Not quite.') + ' ' + LS.esc(q.explain) + '</span>' +
          (q.cite ? '<button class="game-secondary-btn" id="gameCite">Open in law browser ↗</button>' : '') +
          '</div><button class="game-next-btn" id="gameNext">' +
          (g.index + 1 >= g.questions.length ? 'See results →' : 'Next →') + '</button>'
        : '') + '</div>' +
      '</div>';

    if (!g.answered) {
      body.querySelectorAll('.game-option').forEach(function (el) {
        el.addEventListener('click', function () { answerGame(parseInt(el.getAttribute('data-idx'), 10)); });
      });
    } else {
      document.getElementById('gameNext').addEventListener('click', nextQuestion);
      var cite = document.getElementById('gameCite');
      if (cite) cite.addEventListener('click', function () {
        LS.openProvision(q.cite.act, q.cite.sec);
      });
    }
  }

  function renderResults(body) {
    var g = LS.state.game;
    var total = g.questions.length;
    body.innerHTML = '<div class="game-results">' +
      '<div class="game-question-title">🏁 ' + LS.esc(g.mode.name) + ' — done!</div>' +
      '<div class="game-results-stats">' +
      '<div class="game-stat-block"><div class="game-stat">' + g.correctCount + ' / ' + total + '</div><div>correct</div></div>' +
      '<div class="game-stat-block"><div class="game-stat">' + g.score + '</div><div>score</div></div>' +
      '<div class="game-stat-block"><div class="game-stat">' + g.bestStreak + '</div><div>best streak</div></div>' +
      '</div>' +
      '<div class="game-results-actions">' +
      '<button class="game-start-btn" id="gameAgain">Play again</button>' +
      '<button class="game-secondary-btn" id="gameHubBtn">Games hub</button></div></div>';
    document.getElementById('gameAgain').addEventListener('click', function () {
      startGame(g.lawId, g.mode.id);
    });
    document.getElementById('gameHubBtn').addEventListener('click', function () {
      g.screen = 'hub'; LS.render();
    });
  }

  return {
    init: init, renderGamesView: renderGamesView,
    startGame: startGame, answerGame: answerGame,
    nextQuestion: nextQuestion, endGame: endGame
  };
})();
