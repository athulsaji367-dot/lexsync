/* ============================================================
   LexSync FULL — js/assistant.js
   "Ask LexSync". DEFAULT = FREE LOCAL MODE: a grounded keyword
   search over the local corpus. Answers are built ONLY from
   provision text and always cite act + section. When nothing
   matches, it says so plainly ("not found in the corpus").

   Local mode makes ZERO network requests — nothing you ask ever
   leaves this page.

   A bring-your-own Claude API key option is kept (like the lite),
   but sits behind an explicit security warning: pasting an API key
   into a browser page is insecure, and local mode is recommended.
   ============================================================ */
var LS = window.LS || {};
window.LS = LS;

LS.Assistant = (function () {
  var ds = null;
  var AI_KEY_STORAGE = 'lexsync_anthropic_key';

  function init(dataset) {
    ds = dataset;
    LS.state.apiKey = localStorage.getItem(AI_KEY_STORAGE) || '';
  }

  var STOPWORDS = new Set(('the,a,an,is,are,was,were,be,been,being,to,of,in,on,for,and,or,if,can,could,' +
    'should,would,my,i,me,it,this,that,what,when,how,do,does,did,you,your,we,our,with,without,from,as,at,by,' +
    'will,shall,not,no,yes,please,tell,about,under,which,who,whom,whose,there,their,them,they,he,she,his,her,' +
    'its,anymore,more,most,other,such,only,also,than,then,so,some,any,all,both,every,each,per,between,into,' +
    'during,before,after,above,below,up,down,out,off,over,again,once,law,act,section,laws,legal,india,indian').split(','));

  function extractWords(query) {
    return query.toLowerCase().replace(/[^a-z0-9₹%\s]/g, ' ').split(/\s+/)
      .filter(function (w) { return w.length > 2 && !STOPWORDS.has(w); });
  }

  /* Grounded local search — adapted from the lite's searchAssistant. */
  function searchLocal(query) {
    var words = extractWords(query);
    if (!words.length) return [];
    var qLower = query.toLowerCase();
    var results = [];
    ds.acts.forEach(function (law) {
      law.provisions.forEach(function (sec) {
        if (!sec) return;
        var titleLower = sec.title.toLowerCase();
        var activitiesLower = (sec.activities || []).join(' ').toLowerCase();
        var legalText = Object.keys(sec.fields || {}).map(function (k) { return (sec.fields[k] || []).join(' '); }).join(' ');
        var legalLower = legalText.toLowerCase();
        var score = 0;
        if (titleLower.indexOf(qLower) !== -1) score += 12;
        if (activitiesLower.indexOf(qLower) !== -1) score += 8;
        words.forEach(function (w) {
          if (titleLower.indexOf(w) !== -1) score += 5;
          if (activitiesLower.indexOf(w) !== -1) score += 3;
          var occ = legalLower.split(w).length - 1;
          if (occ > 0) score += Math.min(occ, 3);
        });
        (sec.definitions || []).forEach(function (d) {
          if (d.term.toLowerCase().indexOf(qLower) !== -1 ||
              words.some(function (w) { return d.term.toLowerCase().indexOf(w) !== -1; })) score += 6;
        });
        if (score > 0) {
          var desc = ((sec.fields['Objective'] || [])[0]) ||
                     ((sec.fields['HR Significance'] || [])[0]) ||
                     legalText.slice(0, 200) + '…';
          results.push({
            actSlug: law.slug, lawName: ds.shortName(law.slug),
            number: sec.number, title: sec.title, desc: desc, score: score,
            verification_status: sec.verification_status
          });
        }
      });
    });
    results.sort(function (a, b) { return b.score - a.score; });
    return results.slice(0, 5);
  }

  function composeAnswer(query, results) {
    if (!results.length) {
      return { kind: 'empty' };
    }
    var topLawSet = {};
    results.slice(0, 3).forEach(function (r) { topLawSet[r.lawName] = 1; });
    var lede = results.length === 1
      ? 'Found one relevant provision:'
      : "Here's what's most relevant, mainly from " + Object.keys(topLawSet).join(' and ') + ':';
    return { kind: 'results', lede: lede, results: results };
  }

  /* ---------- Claude API (opt-in, warned) ---------- */
  function callClaudeAPI(systemPrompt, messages) {
    // Direct browser call using Anthropic's documented
    // "anthropic-dangerous-direct-browser-access" header for BYO-key apps.
    return fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': LS.state.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 800,
        system: systemPrompt,
        messages: messages
      })
    }).then(function (r) {
      if (!r.ok) throw new Error('API error ' + r.status);
      return r.json();
    }).then(function (j) {
      return (j.content || []).map(function (b) { return b.text || ''; }).join('');
    });
  }

  function buildSystemPrompt() {
    var names = ds.acts.map(function (a) { return '- ' + a.title; }).join('\n');
    return 'You are LexSync, a study assistant for Indian labour law. ' +
      'You answer ONLY from this corpus of laws:\n' + names + '\n' +
      'Rules: cite act + section for every claim. If the answer is not in the corpus, say so. ' +
      'Never invent section numbers or legal text. Keep answers short and practical for an HR student.';
  }

  /* ---------- view ---------- */
  function modeBadge() {
    return LS.state.apiKey
      ? '<span class="mode-badge api">Claude API mode</span>'
      : '<span class="mode-badge local">🔒 Local mode — free, offline, private</span>';
  }

  function renderAssistantView() {
    var container = document.getElementById('assistantMessages');
    if (!LS.state.assistantMessages.length) {
      container.innerHTML = '<div class="asst-empty-state">' +
        '<div class="asst-intro-text"><b>Ask about any provision, definition, or HR situation.</b><br>' +
        modeBadge() + '</div>' +
        '<div class="asst-intro-text">Answers come from the app\'s own law corpus and cite the exact ' +
        'act + section.</div>' +
        '<div class="asst-suggestions">' +
        ['what is the gratuity formula', 'can I retrench without notice?', 'ESI wage ceiling',
         'standing orders threshold'].map(function (s) {
          return '<div class="asst-suggestion-chip" data-q="' + LS.esc(s) + '">' + LS.esc(s) + '</div>';
        }).join('') + '</div></div>';
      container.querySelectorAll('.asst-suggestion-chip').forEach(function (el) {
        el.addEventListener('click', function () {
          document.getElementById('assistantInput').value = el.getAttribute('data-q');
          handleSend();
        });
      });
    } else {
      container.innerHTML = LS.state.assistantMessages.map(renderMessage).join('');
    }
    container.querySelectorAll('.asst-cite').forEach(function (el) {
      el.addEventListener('click', function () {
        LS.openProvision(el.getAttribute('data-act'), el.getAttribute('data-sec'));
      });
    });
    renderAiKeyBtn();
  }

  function renderMessage(m) {
    var esc = LS.esc;
    if (m.role === 'user') {
      return '<div class="asst-msg-row" style="justify-content:flex-end;"><div class="asst-bubble-user">' +
        esc(m.text) + '</div></div>';
    }
    var body = '';
    if (m.answer.kind === 'empty') {
      body = '<p>I couldn\'t find a strong match for “' + esc(m.query) + '” in the corpus. ' +
        'The corpus covers ' + ds.acts.length + ' laws — try mentioning a specific term like “notice period”, ' +
        '“gratuity”, “overtime” or “maternity leave”, or use Browse by Activity instead.</p>';
    } else if (m.answer.kind === 'results') {
      body = '<p>' + esc(m.answer.lede) + '</p>' + m.answer.results.map(function (r) {
        var badge = ds.badgeFor(r.verification_status);
        return '<div class="asst-result"><div class="asst-result-law">' + esc(r.lawName) + '</div>' +
          '<div class="asst-result-title asst-cite" data-act="' + esc(r.actSlug) +
          '" data-sec="' + esc(r.number) + '">§' + esc(r.number) + ' — ' + esc(r.title) + ' ↗</div>' +
          '<div class="asst-result-snippet">' + esc(r.desc) + '</div>' +
          '<div class="asst-sources-row"><span class="' + badge.cls + ' prov-badge">' + esc(badge.text) + '</span></div></div>';
      }).join('');
    } else if (m.answer.kind === 'api') {
      body = '<p>' + m.answer.html + '</p><div class="asst-intro-text">Answered by Claude (API mode) — ' +
        'verify citations against the corpus before relying on them.</div>';
    } else if (m.answer.kind === 'error') {
      body = '<p style="color:#C0392B;">' + esc(m.answer.text) + '</p>';
    }
    return '<div class="asst-msg-row"><div class="asst-bubble-assistant">' + body + '</div></div>';
  }

  function simpleMarkdown(t) {
    var esc = LS.esc(t);
    return esc.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  }

  function handleSend() {
    var input = document.getElementById('assistantInput');
    var query = input.value.trim();
    if (!query) return;
    input.value = '';
    LS.state.assistantMessages.push({ role: 'user', text: query });

    if (LS.state.apiKey) {
      // API mode: grounded with the corpus law list; still warn to verify.
      LS.state.assistantMessages.push({ role: 'bot', query: query, answer: { kind: 'results', lede: 'Thinking…', results: [] } });
      renderAssistantView();
      var history = LS.state.assistantMessages
        .filter(function (m) { return m.role === 'user'; })
        .slice(-6).map(function (m) { return { role: 'user', content: m.text }; });
      callClaudeAPI(buildSystemPrompt(), history).then(function (text) {
        LS.state.assistantMessages[LS.state.assistantMessages.length - 1] =
          { role: 'bot', query: query, answer: { kind: 'api', html: simpleMarkdown(text) } };
        LS.render();
      }).catch(function (err) {
        LS.state.assistantMessages[LS.state.assistantMessages.length - 1] =
          { role: 'bot', query: query, answer: { kind: 'error', text: 'Claude API call failed (' + err.message + '). Falling back to local search:' } };
        var results = searchLocal(query);
        LS.state.assistantMessages.push({ role: 'bot', query: query, answer: composeAnswer(query, results) });
        LS.render();
      });
    } else {
      var results = searchLocal(query);
      LS.state.assistantMessages.push({ role: 'bot', query: query, answer: composeAnswer(query, results) });
    }
    LS.render();
    var c = document.getElementById('assistantMessages');
    c.scrollTop = c.scrollHeight;
  }

  /* ---------- API key modal (with security warning) ---------- */
  function renderAiKeyBtn() {
    var btn = document.getElementById('aiKeyBtn');
    if (!btn) return;
    if (LS.state.apiKey) {
      btn.textContent = '✅ AI Connected';
      btn.classList.add('connected');
    } else {
      btn.textContent = '⚡ Connect AI';
      btn.classList.remove('connected');
    }
  }

  function openAiKeyModal() {
    var bd = document.getElementById('aiModalBackdrop');
    var body = document.getElementById('aiModalBody');
    body.innerHTML =
      '<div class="key-warning">⚠️ <b>Security warning.</b> Pasting an API key into a browser page is ' +
      'inherently insecure — any script on the page could read it. <b>Local mode (the default) is free, ' +
      'private, and recommended.</b> Only use a key you can revoke, with strict spending limits, ' +
      'and never on a shared computer.</div>' +
      (LS.state.apiKey
        ? '<p>A key is saved in this browser\'s localStorage. <button id="keyRemove" class="key-btn danger">Remove key</button></p>'
        : '<p>Get a key from the Anthropic console, then paste it below. It stays in your browser only.</p>' +
          '<input id="aiKeyInput" type="password" class="ai-key-input" placeholder="sk-ant-…" autocomplete="off" />' +
          '<div style="margin-top:12px;display:flex;gap:8px;">' +
          '<button id="keySave" class="key-btn">Save key</button>' +
          '<button id="keyCancel" class="key-btn ghost">Use local mode</button></div>');
    bd.style.display = 'flex';
    var close = function () { bd.style.display = 'none'; };
    bd.onclick = function (e) { if (e.target === bd) close(); };
    var cancel = document.getElementById('keyCancel');
    if (cancel) cancel.onclick = close;
    var remove = document.getElementById('keyRemove');
    if (remove) remove.onclick = function () {
      localStorage.removeItem(AI_KEY_STORAGE);
      LS.state.apiKey = '';
      renderAiKeyBtn(); close(); LS.render();
    };
    var save = document.getElementById('keySave');
    if (save) save.onclick = function () {
      var v = document.getElementById('aiKeyInput').value.trim();
      if (!v) return;
      localStorage.setItem(AI_KEY_STORAGE, v);
      LS.state.apiKey = v;
      renderAiKeyBtn(); close(); LS.render();
    };
  }

  function wireAssistantInput() {
    document.getElementById('assistantSendBtn').addEventListener('click', handleSend);
    document.getElementById('assistantInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') handleSend();
    });
    document.getElementById('aiKeyBtn').addEventListener('click', openAiKeyModal);
  }

  return {
    init: init,
    renderAssistantView: renderAssistantView,
    wireAssistantInput: wireAssistantInput,
    renderAiKeyBtn: renderAiKeyBtn,
    searchLocal: searchLocal
  };
})();
