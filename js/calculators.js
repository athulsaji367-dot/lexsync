/* ============================================================
   LexSync FULL — js/calculators.js
   "Calculators" view. PF and ESI estimators are reimplemented from
   LexSync Lite unchanged; Gratuity and Bonus estimators added.
   All use standard statutory rates/formulas and carry the same
   "simplified estimate — verify before relying on it" disclaimer.
   ============================================================ */
var LS = window.LS || {};
window.LS = LS;

LS.Calculators = (function () {
  function fmt(n) {
    return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }

  function row(label, val) {
    return '<div style="display:flex;justify-content:space-between;"><span>' + label + '</span><b>' + val + '</b></div>';
  }

  function card(title, sub, inputLabel, inputId, resultId, note) {
    return '<div class="activity-result-card calc-card">' +
      '<div class="activity-results-header">' + title + '</div>' +
      '<div class="activity-results-sub">' + sub + '</div>' +
      '<label class="calc-label">' + inputLabel + '</label>' +
      '<input id="' + inputId + '" type="number" class="calc-input" placeholder="e.g. 20000" />' +
      '<div id="' + resultId + '" class="calc-result"></div>' +
      '<div class="calc-note">' + note + '</div></div>';
  }

  function renderCalculatorView() {
    var body = document.getElementById('calcBody');
    body.innerHTML =
      '<div class="calc-grid">' +
      card('PF Contribution Estimator',
        'Standard 12% employer / 12% employee on basic + DA.',
        'Basic Wage + DA (₹ / month)', 'pfBasic', 'pfResult',
        "Employee share 12% goes fully to EPF. Employer's 12% splits: 8.33% to EPS " +
        '(capped at ₹15,000 wage base = ₹1,250/mo max) and the rest to EPF.') +
      card('ESI Contribution Estimator',
        'Applies if gross wages ≤ ₹21,000/month (₹25,000 for persons with disability).',
        'Gross Monthly Wages (₹)', 'esiGross', 'esiResult',
        'Employee share: 0.75%. Employer share: 3.25%. Not applicable above the wage ceiling.') +
      card('Gratuity Estimator',
        'Statutory formula: (last drawn wages × 15 ÷ 26) × years of service.',
        'Last Drawn Monthly Wages (₹)', 'gratWage', 'gratResult',
        'Payable after 5 years of continuous service (exceptions: death/disablement). ' +
        'Wages here = basic + DA. Tax-free up to the statutory ceiling — check current limits.') +
      card('Bonus Estimator',
        'Annual bonus: minimum 8.33%, maximum 20% of wages (ceiling ₹21,000/mo).',
        'Annual Wages (₹)', 'bonusWage', 'bonusResult',
        'Establishments with 20+ persons. Employees earning above the wage ceiling are ' +
        'not eligible; bonus is proportionate for service under a year.') +
      '</div>' +
      '<div class="calc-extra-input" id="gratYearsWrap">' +
      '<label class="calc-label">Years of Continuous Service</label>' +
      '<input id="gratYears" type="number" class="calc-input" placeholder="e.g. 7" /></div>' +
      '<div class="calc-disclaimer">These are simplified estimates using standard statutory rates. ' +
      'Actual figures depend on wage definitions, exemptions, and current notifications — ' +
      'verify with your payroll provider before relying on these figures.</div>';

    // Move the years input into the gratuity card for a tidy layout.
    var gratCard = document.getElementById('gratResult').closest('.calc-card');
    gratCard.insertBefore(document.getElementById('gratYearsWrap'), document.getElementById('gratResult'));

    function computePF() {
      var basic = parseFloat(document.getElementById('pfBasic').value);
      var out = document.getElementById('pfResult');
      if (!basic || basic <= 0) { out.innerHTML = ''; return; }
      var employeeEPF = basic * 0.12;
      var eps = Math.min(basic, 15000) * 0.0833;
      var employerEPF = (basic * 0.12) - eps;
      out.innerHTML = row('Employee contribution (12%)', fmt(employeeEPF)) +
        row('Employer → EPS (8.33%, capped)', fmt(eps)) +
        row('Employer → EPF (balance)', fmt(employerEPF)) +
        '<div class="calc-total">' + row('<b>Total monthly PF deposit</b>', '<b>' + fmt(employeeEPF + employerEPF + eps) + '</b>') + '</div>';
    }

    function computeESI() {
      var gross = parseFloat(document.getElementById('esiGross').value);
      var out = document.getElementById('esiResult');
      if (!gross || gross <= 0) { out.innerHTML = ''; return; }
      if (gross > 21000) {
        out.innerHTML = '<div class="calc-na">Wages exceed the ₹21,000 ESI threshold — ESI contribution does not apply ' +
          '(unless the employee has a disability, where the ceiling is ₹25,000).</div>';
        return;
      }
      var employee = gross * 0.0075, employer = gross * 0.0325;
      out.innerHTML = row('Employee contribution (0.75%)', fmt(employee)) +
        row('Employer contribution (3.25%)', fmt(employer)) +
        '<div class="calc-total">' + row('<b>Total monthly ESI contribution</b>', '<b>' + fmt(employee + employer) + '</b>') + '</div>';
    }

    function computeGratuity() {
      var wage = parseFloat(document.getElementById('gratWage').value);
      var years = parseFloat(document.getElementById('gratYears').value);
      var out = document.getElementById('gratResult');
      if (!wage || wage <= 0 || !years || years <= 0) { out.innerHTML = ''; return; }
      var amount = (wage * 15 / 26) * years;
      out.innerHTML = row('Per-year gratuity (wage × 15 ÷ 26)', fmt(wage * 15 / 26)) +
        row('Years of service', years) +
        '<div class="calc-total">' + row('<b>Estimated gratuity payable</b>', '<b>' + fmt(amount) + '</b>') + '</div>';
    }

    function computeBonus() {
      var annual = parseFloat(document.getElementById('bonusWage').value);
      var out = document.getElementById('bonusResult');
      if (!annual || annual <= 0) { out.innerHTML = ''; return; }
      var monthly = annual / 12;
      if (monthly > 21000) {
        out.innerHTML = '<div class="calc-na">Monthly wages exceed the ₹21,000 ceiling — statutory bonus does not apply.</div>';
        return;
      }
      out.innerHTML = row('Minimum bonus (8.33%)', fmt(annual * 0.0833)) +
        row('Maximum bonus (20%)', fmt(annual * 0.20)) +
        '<div class="calc-total">' + row('<b>Statutory bonus range</b>',
          '<b>' + fmt(annual * 0.0833) + ' – ' + fmt(annual * 0.20) + '</b>') + '</div>';
    }

    [['pfBasic', computePF], ['esiGross', computeESI],
     ['gratWage', computeGratuity], ['gratYears', computeGratuity],
     ['bonusWage', computeBonus]].forEach(function (pair) {
      document.getElementById(pair[0]).addEventListener('input', pair[1]);
    });
  }

  return { renderCalculatorView: renderCalculatorView };
})();
