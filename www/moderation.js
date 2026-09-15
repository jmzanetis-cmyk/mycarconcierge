// ============================================================================
// moderation.js — UGC report + block controls (Apple App Store Guideline 1.2)
//
// Provides the "report objectionable content" and "block abusive user"
// mechanisms App Review requires for the app's cross-user UGC (provider
// reviews and member<->provider messages). Self-contained: injects a reason
// modal and writes to content_reports / user_blocks via the existing global
// supabaseClient (RLS scopes rows to the current user). No build step.
//
// Public API (window.mccModeration):
//   openReport({ contentType, contentId, reportedUserId, subjectLabel })
//   confirmBlock(userId, { subjectLabel, onDone })
//   unblock(userId)
//   loadBlockedIds()   -> Promise<Set<string>>
//   isBlocked(userId)  -> boolean (uses the last loadBlockedIds() snapshot)
// ============================================================================
(function () {
  'use strict';

  var REASONS = [
    ['harassment', 'Harassment or abuse'],
    ['inappropriate', 'Inappropriate or offensive content'],
    ['spam', 'Spam or advertising'],
    ['fraud', 'Fraud or scam'],
    ['other', 'Other']
  ];
  var _blocked = new Set();
  var _pending = null;
  var _reportBusy = false;

  function sb() { return window.supabaseClient; }
  // 2s de-dupe so a rapid double-tap on Report / Block doesn't fire two toasts
  // with identical text. Tracks the last (msg, type) pair per module.
  var _lastToast = { key: null, at: 0 };
  function toast(msg, type) {
    var t = type || 'success';
    var key = t + '|' + String(msg);
    var now = Date.now();
    if (key === _lastToast.key && (now - _lastToast.at) < 2000) return;
    _lastToast.key = key;
    _lastToast.at = now;
    if (typeof window.showToast === 'function') window.showToast(msg, t);
    else console.log('[moderation]', msg);
  }
  function esc(s) { var d = document.createElement('div'); d.textContent = (s == null ? '' : String(s)); return d.innerHTML; }
  async function uid() {
    try { var r = await sb().auth.getUser(); return (r && r.data && r.data.user) ? r.data.user.id : null; }
    catch (e) { return null; }
  }

  function ensureModal() {
    if (document.getElementById('mcc-report-modal')) return;
    var wrap = document.createElement('div');
    wrap.id = 'mcc-report-modal';
    wrap.setAttribute('style', 'position:fixed;inset:0;z-index:10000;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);padding:20px;');
    wrap.innerHTML =
      '<div role="dialog" aria-modal="true" aria-labelledby="mcc-report-h" style="background:#16161f;color:#eee;border:1px solid rgba(255,255,255,0.12);border-radius:14px;max-width:420px;width:100%;padding:20px 20px 16px;font-family:inherit;">' +
        '<div id="mcc-report-h" style="font-size:1.05rem;font-weight:600;margin-bottom:4px;">Report content</div>' +
        '<div id="mcc-report-sub" style="font-size:0.85rem;color:#9aa4b2;margin-bottom:14px;">Tell us what’s wrong. Our team reviews reports and acts on violations.</div>' +
        '<div id="mcc-report-reasons" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;"></div>' +
        '<textarea id="mcc-report-details" rows="3" placeholder="Add details (optional)" style="width:100%;box-sizing:border-box;background:#0f0f16;color:#eee;border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:8px 10px;font-family:inherit;font-size:0.9rem;resize:vertical;"></textarea>' +
        '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px;">' +
          '<button type="button" id="mcc-report-cancel" style="padding:9px 16px;border-radius:8px;border:1px solid rgba(255,255,255,0.18);background:transparent;color:#ccc;cursor:pointer;">Cancel</button>' +
          '<button type="button" id="mcc-report-submit" style="padding:9px 16px;border-radius:8px;border:none;background:#c9a227;color:#12161c;font-weight:600;cursor:pointer;">Submit report</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    document.getElementById('mcc-report-reasons').innerHTML = REASONS.map(function (r, i) {
      return '<label style="display:flex;align-items:center;gap:8px;font-size:0.92rem;cursor:pointer;">' +
        '<input type="radio" name="mcc-report-reason" value="' + r[0] + '"' + (i === 0 ? ' checked' : '') + '> ' + esc(r[1]) + '</label>';
    }).join('');
    wrap.querySelector('#mcc-report-cancel').onclick = closeModal;
    wrap.addEventListener('click', function (e) { if (e.target === wrap) closeModal(); });
    wrap.querySelector('#mcc-report-submit').onclick = submitReport;
  }
  function closeModal() { var w = document.getElementById('mcc-report-modal'); if (w) w.style.display = 'none'; _pending = null; }

  async function submitReport() {
    if (_reportBusy) return;               // ignore double-tap while in flight
    if (!_pending) return closeModal();
    var submitBtn = document.getElementById('mcc-report-submit');
    var cancelBtn = document.getElementById('mcc-report-cancel');
    _reportBusy = true;
    if (submitBtn) { submitBtn.disabled = true; submitBtn.style.opacity = '0.6'; submitBtn.textContent = 'Submitting…'; }
    if (cancelBtn) cancelBtn.disabled = true;
    var reasonEl = document.querySelector('input[name="mcc-report-reason"]:checked');
    var reason = reasonEl ? reasonEl.value : 'other';
    var details = (document.getElementById('mcc-report-details') || {}).value || '';
    var reporter = await uid();
    if (!reporter) {
      _reportBusy = false;
      if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = ''; submitBtn.textContent = 'Submit report'; }
      if (cancelBtn) cancelBtn.disabled = false;
      toast('Please sign in to report', 'error');
      return;
    }
    try {
      var row = {
        reporter_id: reporter,
        reported_user_id: _pending.reportedUserId || null,
        content_type: _pending.contentType,
        content_id: (_pending.contentId != null) ? String(_pending.contentId) : null,
        reason: reason,
        details: details ? details.slice(0, 2000) : null
      };
      var res = await sb().from('content_reports').insert(row);
      if (res && res.error) throw res.error;
      closeModal();
      toast('Thanks — your report was submitted for review.', 'success');
    } catch (e) {
      console.error('[moderation] report failed', e);
      toast('Could not submit report. Please try again.', 'error');
    } finally {
      _reportBusy = false;
      if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = ''; submitBtn.textContent = 'Submit report'; }
      if (cancelBtn) cancelBtn.disabled = false;
    }
  }

  function openReport(opts) {
    opts = opts || {};
    ensureModal();
    _pending = {
      contentType: opts.contentType || 'message',
      contentId: opts.contentId,
      reportedUserId: opts.reportedUserId || null
    };
    var sub = document.getElementById('mcc-report-sub');
    if (sub) sub.textContent = opts.subjectLabel
      ? ('Reporting ' + opts.subjectLabel + '. Our team reviews reports and acts on violations.')
      : 'Tell us what’s wrong. Our team reviews reports and acts on violations.';
    var dt = document.getElementById('mcc-report-details'); if (dt) dt.value = '';
    var first = document.querySelector('input[name="mcc-report-reason"]'); if (first) first.checked = true;
    document.getElementById('mcc-report-modal').style.display = 'flex';
  }

  async function confirmBlock(userId, opts) {
    opts = opts || {};
    if (!userId) return;
    var who = opts.subjectLabel || 'this user';
    if (!window.confirm('Block ' + who + '? You will no longer exchange messages, and their content will be hidden from you.')) return;
    var me = await uid();
    if (!me) { toast('Please sign in', 'error'); return; }
    try {
      var res = await sb().from('user_blocks').insert({ blocker_id: me, blocked_id: userId });
      if (res && res.error && res.error.code !== '23505') throw res.error; // 23505 = already blocked
      _blocked.add(userId);
      // Refresh from DB so any concurrent changes (other session, admin action)
      // also land in the cache. Non-fatal if it fails — local add above stands.
      try { await loadBlockedIds(); } catch (e) { /* keep local update */ }
      toast('Blocked. You will no longer hear from ' + who + '.', 'success');
      if (typeof opts.onDone === 'function') opts.onDone();
    } catch (e) {
      console.error('[moderation] block failed', e);
      toast('Could not block. Please try again.', 'error');
    }
  }

  async function unblock(userId) {
    var me = await uid();
    if (!me || !userId) return;
    try {
      await sb().from('user_blocks').delete().eq('blocker_id', me).eq('blocked_id', userId);
      _blocked.delete(userId);
      // Same rationale as confirmBlock: re-pull from DB after a mutation so
      // cross-session state stays coherent without a full app reload.
      try { await loadBlockedIds(); } catch (e) { /* keep local delete */ }
      toast('Unblocked.', 'success');
    } catch (e) { console.error('[moderation] unblock failed', e); }
  }

  async function loadBlockedIds() {
    try {
      var res = await sb().from('user_blocks').select('blocked_id');
      _blocked = new Set(((res && res.data) || []).map(function (r) { return r.blocked_id; }));
    } catch (e) { /* keep prior snapshot */ }
    return _blocked;
  }
  function isBlocked(id) { return _blocked.has(id); }

  window.mccModeration = {
    openReport: openReport,
    confirmBlock: confirmBlock,
    unblock: unblock,
    loadBlockedIds: loadBlockedIds,
    // Semantic alias — call before any is-blocked filtering to ensure fresh state.
    // Callers should prefer `refresh()` over `loadBlockedIds()` at read sites.
    refresh: loadBlockedIds,
    isBlocked: isBlocked
  };
})();
