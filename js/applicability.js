/* ============================================================
   LexSync FULL — js/applicability.js
   "Which Laws Apply?" — answer a few questions about the
   establishment and get a list of applicable acts with the
   threshold logic shown. Every threshold links to the provision
   it came from (deep link into the law browser) and carries that
   provision's verification badge. Thresholds not stated verbatim
   in the corpus are labelled as such — never presented as quoted law.

   A prominent "verify with legal counsel" disclaimer is rendered
   with every result set.
   ============================================================ */
var LS = window.LS || {};
window.LS = LS;

LS.Applicability = (function () {
  var ds = null;

  function init(dataset) { ds = dataset; }

  var STATES = ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Delhi','Goa',
    'Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
    'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan',
    'Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
    'Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli and Daman and Diu',
    'Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry'];

  var INDUSTRIES = [
    { id: 'manufacturing', label: 'Factory / Manufacturing' },
    { id: 'shop', label: 'Shop / Commercial establishment' },
    { id: 'it', label: 'IT / Services / Office' },
    { id: 'mine', label: 'Mine / Plantation' },
    { id: 'other', label: 'Other' }
  ];

  /* Rule shape: { id, name, test(ans)->'yes'|'no'|'check', why(ans)->string,
     basis: {act, section} | null, basisNote: string|null } */
  var RULES = [
    {
      id: 'factories', name: 'Factories Act, 1948',
      test: function (a) {
        if (a.industry !== 'manufacturing') return 'no';
        var n = a.headcount;
        if (a.power && n >= 10) return 'yes';
        if (!a.power && n >= 20) return 'yes';
        return 'no';
      },
      why: function (a) {
        return a.power
          ? 'Manufacturing with power and ' + a.headcount + ' workers meets the 10+ threshold.'
          : 'Manufacturing without power needs 20+ workers; you entered ' + a.headcount + '.';
      },
      basis: { act: 'factories', section: '2' },
      basisNote: 'Threshold quoted from the corpus text of the definitions section.'
    },
    {
      id: 'esi', name: "Employees' State Insurance Act, 1948",
      test: function (a) { return a.headcount >= 10 ? 'yes' : 'no'; },
      why: function (a) {
        return a.headcount >= 10
          ? 'Applies to factories and, by notification, establishments with 10+ persons.'
          : 'Below the 10-person coverage threshold you are likely outside ESI — confirm your state notification.';
      },
      basis: { act: 'esi_act_1948', section: '1' },
      basisNote: 'The Act applies to factories; the 10-person threshold for other establishments comes via government notification — confirm the current notification for your state.'
    },
    {
      id: 'pf', name: 'Provident Fund (Code on Social Security)',
      test: function (a) { return a.headcount >= 20 ? 'yes' : 'check'; },
      why: function (a) {
        return a.headcount >= 20
          ? 'Establishments with 20+ employees are covered for PF.'
          : 'Below 20 employees PF is generally voluntary — but coverage once attained continues even if headcount later falls.';
      },
      basis: null,
      basisNote: 'Standard statutory threshold (20 employees). Not stated verbatim in the current corpus — verify against the SS Code First Schedule on indiacode.nic.in.'
    },
    {
      id: 'gratuity', name: 'Payment of Gratuity Act, 1972',
      test: function (a) { return a.headcount >= 10 ? 'yes' : 'no'; },
      why: function (a) {
        return a.headcount >= 10
          ? 'Applies to shops/establishments with 10+ persons employed.'
          : 'Below the 10-person threshold in the application clause.';
      },
      basis: { act: 'gratuity_act_1972', section: '1' },
      basisNote: 'Threshold quoted from the corpus text of the application clause.'
    },
    {
      id: 'bonus', name: 'Bonus (Code on Wages, 2019)',
      test: function (a) { return a.headcount >= 20 ? 'yes' : 'no'; },
      why: function (a) {
        return a.headcount >= 20
          ? 'The bonus chapter applies to establishments with 20+ persons.'
          : 'The bonus chapter needs 20+ persons; you entered ' + a.headcount + '.';
      },
      basis: { act: 'wages_code', section: '41' },
      basisNote: 'Threshold quoted from the corpus text of the bonus applicability section.'
    },
    {
      id: 'standing_orders', name: 'Industrial Employment (Standing Orders) Act, 1946',
      test: function (a) { return a.headcount >= 100 ? 'yes' : 'no'; },
      why: function (a) {
        return a.headcount >= 100
          ? 'Industrial establishments with 100+ workmen must get standing orders certified.'
          : 'Needs 100+ workmen; you entered ' + a.headcount + '.';
      },
      basis: { act: 'so_act_1946', section: '1' },
      basisNote: 'Threshold quoted from the corpus text of the application clause. States may notify a lower number.'
    },
    {
      id: 'contract_labour', name: 'Contract Labour (OSH Code, 2020)',
      test: function (a) {
        if (!a.contractLabour) return 'no';
        return a.contractCount >= 50 ? 'yes' : 'check';
      },
      why: function (a) {
        if (!a.contractLabour) return 'You said no contract labour is used.';
        return a.contractCount >= 50
          ? 'With ' + a.contractCount + ' contract workers, the contract-labour Part (licensing, welfare duties) applies.'
          : 'Below 50 contract workers the licensing Part may not apply, but principal-employer welfare duties can still bite — check.';
      },
      basis: { act: 'osh_code', section: '45' },
      basisNote: 'Threshold quoted from the corpus text of the applicability section.'
    },
    {
      id: 'migrant', name: 'Inter-State Migrant Workers (OSH Code, 2020)',
      test: function (a) { return a.migrants ? 'yes' : 'no'; },
      why: function (a) {
        return a.migrants
          ? 'Engaging inter-state migrant workers triggers registration, displacement allowance and facility duties.'
          : 'You said no inter-state migrant workers are engaged.';
      },
      basis: { act: 'osh_code', section: '60' },
      basisNote: null
    },
    {
      id: 'wages', name: 'Code on Wages, 2019 (minimum wages, payment of wages)',
      test: function () { return 'yes'; },
      why: function () {
        return 'Minimum-wage and timely-payment-of-wages duties apply to every employer regardless of headcount.';
      },
      basis: { act: 'wages_code', section: '6' },
      basisNote: null
    },
    {
      id: 'maternity', name: 'Maternity Benefit (Code on Social Security)',
      test: function (a) { return a.headcount >= 10 ? 'yes' : 'check'; },
      why: function (a) {
        return a.headcount >= 10
          ? 'Maternity benefit duties apply to establishments with 10+ persons.'
          : 'Coverage below 10 persons is uncertain — check the current SS Code position for your state.';
      },
      basis: { act: 'ss_code', section: '60' },
      basisNote: 'Threshold from the statutory scheme; confirm against official text.'
    },
    {
      id: 'shops', name: 'State Shops & Establishments Act',
      test: function () { return 'check'; },
      why: function (a) {
        return 'Not in this corpus — every state has its own Shops & Establishments Act (' +
          (a.state || 'your state') + ') covering registration, hours, leave and holidays. Look it up on your state labour department site.';
      },
      basis: null,
      basisNote: 'State-specific legislation; outside the scope of this corpus.'
    }
  ];

  function readAnswers() {
    var val = function (id) { return document.getElementById(id).value; };
    var yn = function (id) { return val(id) === 'yes'; };
    return {
      state: val('appState'),
      headcount: Math.max(0, parseInt(val('appHeadcount'), 10) || 0),
      industry: val('appIndustry'),
      power: yn('appPower'),
      contractLabour: yn('appContract'),
      contractCount: Math.max(0, parseInt(val('appContractCount'), 10) || 0),
      migrants: yn('appMigrants')
    };
  }

  function basisHtml(rule) {
    var out = '';
    if (rule.basis) {
      var p = ds.findProvision(rule.basis.act, rule.basis.section);
      var badge = ds.badgeFor(p ? p.verification_status : 'unknown');
      out += '<button class="basis-link" data-act="' + LS.esc(rule.basis.act) + '" data-sec="' +
        LS.esc(rule.basis.section) + '">📖 ' + LS.esc(ds.shortName(rule.basis.act)) +
        ' · Sec ' + LS.esc(rule.basis.section) + '</button> ' +
        '<span class="' + badge.cls + ' prov-badge">' + LS.esc(badge.text) + '</span>';
    }
    if (rule.basisNote) {
      out += '<div class="basis-note">⚠️ ' + LS.esc(rule.basisNote) + '</div>';
    }
    return out ? '<div class="basis-row">' + out + '</div>' : '';
  }

  function renderResults(ans) {
    var yes = [], maybe = [], no = [];
    RULES.forEach(function (r) {
      var t = r.test(ans);
      var entry = { rule: r, why: r.why(ans) };
      if (t === 'yes') yes.push(entry);
      else if (t === 'check') maybe.push(entry);
      else no.push(entry);
    });

    function rowHtml(e, cls, icon) {
      return '<div class="appr-row ' + cls + '"><div class="appr-row-head"><span class="appr-icon">' + icon +
        '</span><span class="appr-name">' + LS.esc(e.rule.name) + '</span></div>' +
        '<div class="appr-why">' + LS.esc(e.why) + '</div>' + basisHtml(e.rule) + '</div>';
    }

    var html =
      '<div class="appr-section"><div class="appr-section-title applies">✅ Likely applies (' + yes.length + ')</div>' +
      yes.map(function (e) { return rowHtml(e, 'applies', '✅'); }).join('') + '</div>' +
      '<div class="appr-section"><div class="appr-section-title maybe">🔍 Check further (' + maybe.length + ')</div>' +
      maybe.map(function (e) { return rowHtml(e, 'maybe', '🔍'); }).join('') + '</div>' +
      '<div class="appr-section"><div class="appr-section-title no">➖ Likely not applicable (' + no.length + ')</div>' +
      no.map(function (e) { return rowHtml(e, 'no', '➖'); }).join('') + '</div>' +
      '<div class="legal-counsel-box">⚖️ <b>This is a study aid, not legal advice.</b> Thresholds change by ' +
      'state notification and the Labour Codes are being brought into force in stages. ' +
      '<b>Verify the result with legal counsel</b> and against the official text on ' +
      '<a href="https://www.indiacode.nic.in" target="_blank" rel="noopener">indiacode.nic.in</a> before acting on it.</div>';

    document.getElementById('apprResults').innerHTML = html;
    document.querySelectorAll('#apprResults .basis-link').forEach(function (el) {
      el.addEventListener('click', function () {
        LS.openProvision(el.getAttribute('data-act'), el.getAttribute('data-sec'));
      });
    });
  }

  function renderApplicabilityView() {
    var body = document.getElementById('apprBody');
    document.getElementById('apprTitle').textContent = 'Which Laws Apply to My Establishment?';
    document.getElementById('apprSub').textContent =
      'Answer five questions — get the applicable acts with the threshold logic shown and linked.';

    body.innerHTML =
      '<div class="appr-form">' +
      '<div class="appr-field"><label>State / UT</label><select id="appState" class="calc-input">' +
      STATES.map(function (s) { return '<option' + (s === 'Karnataka' ? ' selected' : '') + '>' + s + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="appr-field"><label>Total persons employed (all categories)</label>' +
      '<input id="appHeadcount" type="number" class="calc-input" placeholder="e.g. 45" min="0" /></div>' +
      '<div class="appr-field"><label>Industry type</label><select id="appIndustry" class="calc-input">' +
      INDUSTRIES.map(function (i) { return '<option value="' + i.id + '">' + i.label + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="appr-field" id="powerWrap"><label>Does the manufacturing process use power?</label>' +
      '<select id="appPower" class="calc-input"><option value="yes">Yes</option><option value="no">No</option></select></div>' +
      '<div class="appr-field"><label>Do you engage contract labour through contractors?</label>' +
      '<select id="appContract" class="calc-input"><option value="no">No</option><option value="yes">Yes</option></select></div>' +
      '<div class="appr-field" id="contractCountWrap" style="display:none;"><label>Number of contract workers</label>' +
      '<input id="appContractCount" type="number" class="calc-input" placeholder="e.g. 60" min="0" /></div>' +
      '<div class="appr-field"><label>Do you engage inter-state migrant workers?</label>' +
      '<select id="appMigrants" class="calc-input"><option value="no">No</option><option value="yes">Yes</option></select></div>' +
      '<button id="apprGo" class="appr-go">Check applicability →</button></div>' +
      '<div id="apprResults"></div>';

    var industrySel = document.getElementById('appIndustry');
    var powerWrap = document.getElementById('powerWrap');
    function togglePower() { powerWrap.style.display = industrySel.value === 'manufacturing' ? '' : 'none'; }
    industrySel.addEventListener('change', togglePower);
    togglePower();

    var contractSel = document.getElementById('appContract');
    contractSel.addEventListener('change', function () {
      document.getElementById('contractCountWrap').style.display = contractSel.value === 'yes' ? '' : 'none';
    });

    document.getElementById('apprGo').addEventListener('click', function () {
      renderResults(readAnswers());
      document.getElementById('apprResults').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  return { init: init, renderApplicabilityView: renderApplicabilityView };
})();
