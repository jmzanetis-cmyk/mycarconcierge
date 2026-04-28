// MCC Verified educational modal. Read-only — employee adds + check
// initiation live in bgc-compliance.js. <!-- TODO ES -->
(function (root) {
  'use strict';

  const COPY = {
    // <!-- TODO ES -->
    s1: {
      title: 'Get MCC Verified',
      body:
        'The MCC Verified badge appears on your listing and Car Club profile when ' +
        'at least 90% of your customer-facing employees have a current background ' +
        'check on file. Checks are valid for 12 months.',
      whatScreenedLabel: 'What\u2019s screened:',
      whatScreened: 'National criminal records \u00B7 County-level records \u00B7 Sex offender registry \u00B7 Identity verification',
      whatItCostsLabel: 'What it costs:',
      whatItCosts: '$[XX] per employee \u00B7 Results in 1\u20133 business days',
      whatYouNeedLabel: 'What you need:',
      whatYouNeed:
        'Each employee\u2019s full name, date of birth, email, and current address. You\u2019ll ' +
        'also need their consent (we provide the form).',
      cta: 'Continue \u2192'
    },
    // <!-- TODO ES -->
    s2: {
      title: 'Add your team',
      body:
        'Add each customer-facing employee who will be working directly with MCC ' +
        'customers. Back-office staff who don\u2019t interact with customers can be excluded.',
      helper:
        'You\u2019ll add employees from your provider dashboard. We\u2019ll collect each person\u2019s ' +
        'full name, date of birth, email, and current address.',
      cta: 'Continue \u2192'
    },
    // <!-- TODO ES -->
    s3: {
      title: 'Employee consent',
      body:
        'Background checks require each employee\u2019s written consent under the Fair ' +
        'Credit Reporting Act (FCRA). We\u2019ll send each employee a secure consent form via email.',
      authorize:
        'By proceeding, you confirm that you have authorization to submit background ' +
        'checks on behalf of the listed employees.',
      cta: 'Continue \u2192'
    },
    // <!-- TODO ES -->
    s4: {
      title: 'You\u2019re on your way to Verified',
      body:
        'Add your team from the provider dashboard to start their background checks. ' +
        'Most results come back within 1\u20133 business days.',
      whatNextLabel: 'What happens next:',
      bullets: [
        'Each employee will receive a consent form via email',
        'Once consent is confirmed and the check completes, results update automatically',
        'When 90% of your team is cleared, your Verified badge goes live',
        'You\u2019ll get an email when your badge is active'
      ],
      cta: 'Go to Dashboard \u2192'
    }
  };

  let state = { open: false, step: 1 };

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function _injectStyles() {
    if (document.getElementById('mcc-bgc-onboarding-styles')) return;
    const css = document.createElement('style');
    css.id = 'mcc-bgc-onboarding-styles';
    css.textContent =
      '.mcc-bgc-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.66);z-index:9998;display:flex;align-items:center;justify-content:center;padding:18px;}' +
      '.mcc-bgc-modal{background:#1a1f29;color:#e8eaed;border:1px solid rgba(255,255,255,0.08);border-radius:16px;width:100%;max-width:640px;max-height:92vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,0.5);}' +
      '.mcc-bgc-modal h2{font-family:"Playfair Display",Georgia,serif;font-size:1.55rem;margin:0 0 12px;font-weight:600;color:#fff;}' +
      '.mcc-bgc-modal p{line-height:1.55;color:#c8ccd6;margin:0 0 14px;}' +
      '.mcc-bgc-modal .mcc-bgc-label{font-size:0.78rem;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#d4a855;margin-top:14px;display:block;}' +
      '.mcc-bgc-modal .mcc-bgc-detail{margin:6px 0 0;color:#e8eaed;font-size:0.95rem;line-height:1.5;}' +
      '.mcc-bgc-steps{display:flex;align-items:center;gap:8px;padding:18px 24px 0;}' +
      '.mcc-bgc-stepdot{flex:1;height:4px;border-radius:999px;background:rgba(255,255,255,0.08);}' +
      '.mcc-bgc-stepdot.is-active{background:#d4a855;}' +
      '.mcc-bgc-stepdot.is-done{background:#2eb88a;}' +
      '.mcc-bgc-body{padding:18px 24px 24px;}' +
      '.mcc-bgc-actions{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:18px 24px;border-top:1px solid rgba(255,255,255,0.06);background:rgba(0,0,0,0.18);border-radius:0 0 16px 16px;}' +
      '.mcc-bgc-btn{padding:10px 18px;border-radius:10px;font-weight:600;border:none;cursor:pointer;font-size:0.95rem;}' +
      '.mcc-bgc-btn-primary{background:linear-gradient(135deg,#d4a855,#b88c2c);color:#1a1f29;}' +
      '.mcc-bgc-btn-secondary{background:transparent;color:#c8ccd6;border:1px solid rgba(255,255,255,0.12);}' +
      '.mcc-bgc-checkbox{display:flex;align-items:flex-start;gap:8px;margin-top:14px;font-size:0.9rem;color:#c8ccd6;}' +
      '.mcc-bgc-checkbox input{margin-top:3px;accent-color:#d4a855;}';
    document.head.appendChild(css);
  }

  function _stepDots() {
    let html = '';
    for (let i = 1; i <= 4; i++) {
      let cls = 'mcc-bgc-stepdot';
      if (i < state.step) cls += ' is-done';
      else if (i === state.step) cls += ' is-active';
      html += '<div class="' + cls + '"></div>';
    }
    return '<div class="mcc-bgc-steps">' + html + '</div>';
  }

  function _step1Body() {
    const c = COPY.s1;
    return (
      '<div class="mcc-bgc-body">' +
        '<h2>' + escapeHtml(c.title) + '</h2>' +
        '<p>' + escapeHtml(c.body) + '</p>' +
        '<span class="mcc-bgc-label">' + escapeHtml(c.whatScreenedLabel) + '</span>' +
        '<p class="mcc-bgc-detail">' + escapeHtml(c.whatScreened) + '</p>' +
        '<span class="mcc-bgc-label">' + escapeHtml(c.whatItCostsLabel) + '</span>' +
        '<p class="mcc-bgc-detail">' + escapeHtml(c.whatItCosts) + '</p>' +
        '<span class="mcc-bgc-label">' + escapeHtml(c.whatYouNeedLabel) + '</span>' +
        '<p class="mcc-bgc-detail">' + escapeHtml(c.whatYouNeed) + '</p>' +
      '</div>'
    );
  }

  function _step2Body() {
    const c = COPY.s2;
    return (
      '<div class="mcc-bgc-body">' +
        '<h2>' + escapeHtml(c.title) + '</h2>' +
        '<p>' + escapeHtml(c.body) + '</p>' +
        '<p style="font-size:0.9rem;color:#a0a8b8;">' + escapeHtml(c.helper) + '</p>' +
      '</div>'
    );
  }

  function _step3Body() {
    const c = COPY.s3;
    return (
      '<div class="mcc-bgc-body">' +
        '<h2>' + escapeHtml(c.title) + '</h2>' +
        '<p>' + escapeHtml(c.body) + '</p>' +
        '<p style="font-size:0.9rem;color:#a0a8b8;">' + escapeHtml(c.authorize) + '</p>' +
      '</div>'
    );
  }

  function _step4Body() {
    const c = COPY.s4;
    let bullets = '';
    c.bullets.forEach(b => { bullets += '<li>' + escapeHtml(b) + '</li>'; });
    return (
      '<div class="mcc-bgc-body">' +
        '<h2>' + escapeHtml(c.title) + '</h2>' +
        '<p>' + escapeHtml(c.body) + '</p>' +
        '<span class="mcc-bgc-label">' + escapeHtml(c.whatNextLabel) + '</span>' +
        '<ul style="margin:8px 0 0;padding-left:20px;color:#e8eaed;line-height:1.7;">' + bullets + '</ul>' +
      '</div>'
    );
  }

  function _actions() {
    const back = state.step > 1
      ? '<button type="button" class="mcc-bgc-btn mcc-bgc-btn-secondary" id="mcc-bgc-back">\u2190 Back</button>'
      : '<span></span>';
    let nextLabel;
    if (state.step === 1) nextLabel = COPY.s1.cta;
    else if (state.step === 2) nextLabel = COPY.s2.cta;
    else if (state.step === 3) nextLabel = COPY.s3.cta;
    else nextLabel = COPY.s4.cta;
    return (
      '<div class="mcc-bgc-actions">' +
        back +
        '<button type="button" class="mcc-bgc-btn mcc-bgc-btn-primary" id="mcc-bgc-next">' + escapeHtml(nextLabel) + '</button>' +
      '</div>'
    );
  }

  function _render() {
    let host = document.getElementById('mcc-bgc-onboarding-overlay');
    if (!host) {
      host = document.createElement('div');
      host.id = 'mcc-bgc-onboarding-overlay';
      document.body.appendChild(host);
    }
    let body;
    if      (state.step === 1) body = _step1Body();
    else if (state.step === 2) body = _step2Body();
    else if (state.step === 3) body = _step3Body();
    else                       body = _step4Body();

    host.className = 'mcc-bgc-overlay';
    host.innerHTML =
      '<div class="mcc-bgc-modal" role="dialog" aria-modal="true">' +
        _stepDots() + body + _actions() +
      '</div>';

    const overlay = host;
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    const backBtn = document.getElementById('mcc-bgc-back');
    if (backBtn) backBtn.addEventListener('click', _back);
    const nextBtn = document.getElementById('mcc-bgc-next');
    if (nextBtn) nextBtn.addEventListener('click', _next);
  }

  function _back() {
    if (state.step > 1) { state.step -= 1; _render(); }
  }

  function _next() {
    if (state.step < 4) {
      state.step += 1;
      _render();
      return;
    }
    // Step 4 — close. Defer all employee creation + background-check
    // initiation to the existing vetted flow in bgc-compliance.js.
    close();
    if (window.bgcCompliance && typeof window.bgcCompliance.openAddEmployee === 'function') {
      window.bgcCompliance.openAddEmployee();
    } else if (window.bgcCompliance && typeof window.bgcCompliance.refresh === 'function') {
      window.bgcCompliance.refresh();
    }
  }

  function open() {
    _injectStyles();
    state = { open: true, step: 1 };
    _render();
  }

  function close() {
    const overlay = document.getElementById('mcc-bgc-onboarding-overlay');
    if (overlay) overlay.remove();
    state.open = false;
  }

  root.MCC_BGC_Onboarding = { open: open, close: close, COPY: COPY };
})(typeof window !== 'undefined' ? window : this);
