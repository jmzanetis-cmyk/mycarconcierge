// ============================================================================
// providers-verification.js
//
// Phase 3 of signup consolidation — wires the Verification section on
// providers.html. Loads current state via GET /api/provider/verification
// and handles the three post-signup writeable surfaces:
//
//   • Documents:       existing widget in #verification-docs-card.
//                      Upload flow lives in providers-settings.js
//                      (uploadVerificationDoc), unchanged; this module
//                      just triggers a state refresh after each upload.
//   • External Reviews: POST /api/provider/external-review — appends
//                       and re-renders the list on success.
//   • References:      POST /api/provider/reference — same shape.
//
// Then the submit button hits POST /api/provider/request-verification and
// the section re-renders in "Under review — submitted <date>" state.
//
// Everything is idempotent and re-runs cheap on section re-open. The
// module intentionally does NOT own the docs uploader — Jordan called
// out that a second uploader would be a mistake; we reuse the one
// already in providers-settings.js.
// ============================================================================
(function () {
  'use strict';

  var state = {
    status: null,
    requested_at: null,
    documents: [],
    external_reviews: [],
    references: [],
    is_ready: false,
    readiness_message: null,
    // Kept so the reference-add POST can attach to the right application row.
    // provider_references.application_id is required (per signup schema).
    application_id: null
  };

  async function _authHeaders() {
    var client = window.supabaseClient;
    if (!client) return null;
    var res = await client.auth.getSession();
    var token = res && res.data && res.data.session && res.data.session.access_token;
    if (!token) return null;
    return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
  }

  async function _fetchApplicationId() {
    // Reviews and references POSTs need an application_id. Use the most
    // recent one for this provider. If none exists, adding refs is blocked
    // (server will 400) — surface a helpful error inline.
    var client = window.supabaseClient;
    if (!client) return null;
    var { data: { user } } = await client.auth.getUser();
    if (!user) return null;
    var { data } = await client
      .from('provider_applications')
      .select('id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ? data.id : null;
  }

  async function loadProviderVerification() {
    var headers = await _authHeaders();
    if (!headers) return;

    try {
      var r = await fetch('/api/provider/verification', { headers: headers });
      if (!r.ok) throw new Error('GET /api/provider/verification failed: ' + r.status);
      var body = await r.json();
      state.status = body.status;
      state.requested_at = body.requested_at;
      state.documents = body.documents || [];
      state.external_reviews = body.external_reviews || [];
      state.references = body.references || [];
      state.is_ready = !!body.is_ready;
      state.readiness_message = body.readiness_message || null;
    } catch (e) {
      console.error('[providers-verification] load failed:', e);
      return;
    }

    if (!state.application_id) {
      state.application_id = await _fetchApplicationId();
    }

    _renderReviews();
    _renderReferences();
    _renderSubmit();
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function _renderReviews() {
    var list = document.getElementById('verification-reviews-list');
    if (!list) return;
    if (state.external_reviews.length === 0) {
      list.innerHTML = '<div style="color:var(--text-muted);font-size:var(--text-sm);">No external reviews added yet.</div>';
      return;
    }
    list.innerHTML = state.external_reviews.map(function (r) {
      return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 12px;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:8px;font-size:var(--text-sm);">' +
        '<span style="text-transform:capitalize;font-weight:600;">' + _esc(r.platform) + '</span>' +
        '<a href="' + _esc(r.profile_url) + '" target="_blank" rel="noopener" style="color:var(--accent-gold);word-break:break-all;">' + _esc(r.profile_url) + '</a>' +
      '</div>';
    }).join('');
  }

  function _renderReferences() {
    var list = document.getElementById('verification-references-list');
    if (!list) return;
    if (state.references.length === 0) {
      list.innerHTML = '<div style="color:var(--text-muted);font-size:var(--text-sm);">No references added yet.</div>';
      return;
    }
    list.innerHTML = state.references.map(function (ref) {
      var meta = [ref.reference_company, _relationshipLabel(ref.relationship)].filter(Boolean).join(' · ');
      return '<div style="padding:10px 12px;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:8px;font-size:var(--text-sm);">' +
        '<div style="font-weight:600;">' + _esc(ref.reference_name) + '</div>' +
        (meta ? '<div style="color:var(--text-muted);font-size:var(--text-xs);margin-top:2px;">' + _esc(meta) + '</div>' : '') +
        (ref.reference_phone ? '<div style="color:var(--text-muted);font-size:var(--text-xs);">' + _esc(ref.reference_phone) + '</div>' : '') +
      '</div>';
    }).join('');
  }

  function _relationshipLabel(k) {
    return ({ customer: 'Customer', supplier: 'Supplier', partner: 'Business partner',
              colleague: 'Colleague', other: 'Other' })[k] || k;
  }

  function _renderSubmit() {
    var btn = document.getElementById('verification-submit-btn');
    var hint = document.getElementById('verification-submit-hint');
    var status = document.getElementById('verification-submit-status');
    if (!btn || !hint || !status) return;

    if (state.status === 'verified') {
      btn.disabled = true;
      btn.textContent = 'Verified';
      hint.style.display = 'none';
      status.style.color = 'var(--accent-teal, #22d3ee)';
      status.textContent = '✓ Your account is verified.';
      return;
    }

    if (state.status === 'pending') {
      btn.disabled = true;
      var when = state.requested_at ? new Date(state.requested_at).toLocaleDateString(undefined,
        { year: 'numeric', month: 'short', day: 'numeric' }) : '';
      btn.textContent = when ? 'Under review — submitted ' + when : 'Under review';
      hint.style.display = 'none';
      status.style.color = 'var(--text-muted)';
      status.textContent = 'Admin review usually takes 1–3 business days.';
      return;
    }

    if (state.status === 'rejected') {
      hint.style.display = 'block';
      hint.textContent = 'Your previous submission was declined. Update your documents / reviews / references and resubmit.';
    } else {
      hint.style.display = 'block';
      hint.textContent = state.readiness_message ||
        'Upload at least one document, plus a review or reference, then submit. Admin review usually takes 1–3 business days.';
    }
    btn.disabled = !state.is_ready;
    btn.textContent = 'Submit for verification';
    status.textContent = '';
  }

  async function addVerificationReview() {
    var errEl = document.getElementById('verification-review-error');
    if (errEl) errEl.style.display = 'none';

    var platform = (document.getElementById('review-platform-input') || {}).value;
    var profileUrl = ((document.getElementById('review-url-input') || {}).value || '').trim();
    if (!platform || !profileUrl) {
      _showErr(errEl, 'Platform and URL are both required.');
      return;
    }
    if (!state.application_id) {
      _showErr(errEl, 'No provider application on file — reviews can only be added after signup.');
      return;
    }

    var headers = await _authHeaders();
    if (!headers) { _showErr(errEl, 'Session expired. Reload the page.'); return; }

    var r = await fetch('/api/provider/external-review', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        application_id: state.application_id,
        platform: platform,
        profile_url: profileUrl
      })
    });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) {
      _showErr(errEl, (j && j.error ? j.error : 'Failed to add review') +
        (Array.isArray(j && j.details) ? '\n' + j.details.join('\n') : ''));
      return;
    }
    document.getElementById('review-url-input').value = '';
    await loadProviderVerification();
  }

  async function addVerificationReference() {
    var errEl = document.getElementById('verification-reference-error');
    if (errEl) errEl.style.display = 'none';

    var name = ((document.getElementById('ref-name-input') || {}).value || '').trim();
    var company = ((document.getElementById('ref-company-input') || {}).value || '').trim();
    var phone = ((document.getElementById('ref-phone-input') || {}).value || '').trim();
    var relationship = (document.getElementById('ref-relationship-input') || {}).value;
    if (!name) { _showErr(errEl, 'Reference name is required.'); return; }
    if (!relationship) { _showErr(errEl, 'Relationship is required.'); return; }
    if (!state.application_id) {
      _showErr(errEl, 'No provider application on file — references can only be added after signup.');
      return;
    }

    var headers = await _authHeaders();
    if (!headers) { _showErr(errEl, 'Session expired. Reload the page.'); return; }

    var r = await fetch('/api/provider/reference', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        application_id: state.application_id,
        reference_name: name,
        reference_company: company || null,
        reference_phone: phone || null,
        relationship: relationship
      })
    });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) {
      _showErr(errEl, (j && j.error ? j.error : 'Failed to add reference') +
        (Array.isArray(j && j.details) ? '\n' + j.details.join('\n') : ''));
      return;
    }
    ['ref-name-input', 'ref-company-input', 'ref-phone-input'].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.value = '';
    });
    await loadProviderVerification();
  }

  async function submitProviderVerification() {
    var status = document.getElementById('verification-submit-status');
    var btn = document.getElementById('verification-submit-btn');
    if (btn) btn.disabled = true;
    if (status) { status.style.color = 'var(--text-muted)'; status.textContent = 'Submitting…'; }

    var headers = await _authHeaders();
    if (!headers) {
      if (status) { status.style.color = '#f87171'; status.textContent = 'Session expired. Reload the page.'; }
      if (btn) btn.disabled = false;
      return;
    }

    var r = await fetch('/api/provider/request-verification', { method: 'POST', headers: headers });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) {
      if (status) {
        status.style.color = '#f87171';
        status.textContent = (j && j.error ? j.error : 'Submission failed') +
          (j && j.details ? ' — ' + j.details : '');
      }
      if (btn) btn.disabled = false;
      return;
    }
    await loadProviderVerification();
    // Refresh the Shop Setup Checklist so provider_verified ticks over.
    if (typeof window.reloadProviderOnboardingChecklist === 'function') {
      window.reloadProviderOnboardingChecklist();
    }
  }

  function _showErr(el, msg) {
    if (!el) { alert(msg); return; }
    el.style.display = 'block';
    el.textContent = msg;
  }

  // ─── Documents uploader ───────────────────────────────────────────────
  //
  // Wired to the file inputs in #verification-docs-card
  // (onchange="uploadVerificationDoc('license'|'insurance'|'certifications')").
  // The old function of the same name in www/providers.js has been dead
  // code — that file isn't script-loaded by providers.html — so this is
  // the only live upload path.
  //
  // Uses the same pattern as signup-provider.js: client uploads to the
  // 'provider-documents' Supabase Storage bucket under the user's UID
  // prefix, then POSTs the resulting URL to /api/provider/document which
  // validates ownership + host + prefix before inserting the row.
  var DOC_TYPE_MAP = {
    license:        'business_license',
    insurance:      'insurance',
    certifications: 'certification'
  };

  async function uploadVerificationDoc(docTypeKey) {
    var fileInput = document.getElementById(docTypeKey + '-file-input');
    var statusEl = document.getElementById(docTypeKey + '-upload-status');
    var viewBtn = document.getElementById(docTypeKey + '-view-btn');
    var file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) return;

    var allowedMimes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (allowedMimes.indexOf(file.type) === -1) {
      _setStatus(statusEl, 'Please upload a PDF, JPG, or PNG.', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      _setStatus(statusEl, 'File must be under 10MB.', 'error');
      return;
    }

    var client = window.supabaseClient;
    if (!client) { _setStatus(statusEl, 'Session unavailable.', 'error'); return; }
    var authRes = await client.auth.getUser();
    var user = authRes && authRes.data && authRes.data.user;
    if (!user) { _setStatus(statusEl, 'Sign in required.', 'error'); return; }

    if (!state.application_id) {
      state.application_id = await _fetchApplicationId();
    }
    if (!state.application_id) {
      _setStatus(statusEl, 'No provider application on file — documents can only be added after signup.', 'error');
      return;
    }

    _setStatus(statusEl, '⏳ Uploading…', 'info');

    var ext = (file.name.split('.').pop() || 'bin').toLowerCase();
    var path = user.id + '/' + docTypeKey + '_' + Date.now() + '.' + ext;
    var { error: upErr } = await client.storage
      .from('provider-documents')
      .upload(path, file, { upsert: false, contentType: file.type });
    if (upErr) {
      _setStatus(statusEl, 'Upload failed: ' + upErr.message, 'error');
      return;
    }
    var { data: urlData } = client.storage.from('provider-documents').getPublicUrl(path);
    var publicUrl = urlData && urlData.publicUrl;
    if (!publicUrl) {
      _setStatus(statusEl, 'Storage returned no URL.', 'error');
      return;
    }

    var headers = await _authHeaders();
    if (!headers) { _setStatus(statusEl, 'Session expired. Reload the page.', 'error'); return; }
    var body = {
      application_id: state.application_id,
      document_type: DOC_TYPE_MAP[docTypeKey] || docTypeKey,
      document_name: file.name,
      file_url: publicUrl
    };
    var r = await fetch('/api/provider/document', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) {
      _setStatus(statusEl, (j && j.error ? j.error : 'Failed to save document'), 'error');
      return;
    }

    _setStatus(statusEl, '✓ Uploaded', 'ok');
    if (viewBtn) { viewBtn.href = publicUrl; viewBtn.style.display = 'inline-flex'; }
    if (fileInput) fileInput.value = '';
    await loadProviderVerification();
  }

  function _setStatus(el, msg, kind) {
    if (!el) return;
    var color = kind === 'error' ? '#f87171' : kind === 'ok' ? 'var(--accent-teal, #22d3ee)' : 'var(--accent-gold)';
    el.innerHTML = '<span style="color:' + color + ';">' + _esc(msg) + '</span>';
  }

  // Expose to onclick handlers in providers.html + providers-core.js's
  // showSection dispatch.
  window.loadProviderVerification = loadProviderVerification;
  window.addVerificationReview = addVerificationReview;
  window.addVerificationReference = addVerificationReference;
  window.submitProviderVerification = submitProviderVerification;
  window.uploadVerificationDoc = uploadVerificationDoc;
})();
