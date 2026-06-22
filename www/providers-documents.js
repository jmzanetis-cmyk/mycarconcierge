// providers-documents.js — My Documents section for the provider portal
//
// Lazy-loaded when the user navigates to the "my-documents" section.
// Renders a grouped list of all provider documents (agreements, BGC records,
// tax/legal docs, identity verifications). PDFs open via server-issued
// 120-second signed URLs — raw storage paths are never exposed to the client.

(function() {
  'use strict';

  async function fetchDocuments() {
    const session = await window.supabase.auth.getSession();
    const token = session?.data?.session?.access_token;
    if (!token) throw new Error('Not authenticated');

    const res = await fetch('/api/provider/documents', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to load documents');
    }
    return res.json();
  }

  async function openDocument(table, docId) {
    const btn = document.querySelector('[data-doc-id="' + docId + '"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Loading...';
    }
    try {
      const session = await window.supabase.auth.getSession();
      const token = session?.data?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const res = await fetch('/api/provider/document-url', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ table, doc_id: docId }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not retrieve document');

      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      alert('Could not open document: ' + e.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'View PDF';
      }
    }
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch (e) {
      return iso.slice(0, 10);
    }
  }

  function statusBadge(status) {
    if (!status) return '';
    const colors = {
      clear:     'var(--accent-teal)',
      pending:   'var(--accent-gold)',
      consider:  'var(--accent-orange)',
      failed:    'var(--accent-red)',
      verified:  'var(--accent-teal)',
      active:    'var(--accent-teal)',
    };
    const color = colors[status.toLowerCase()] || 'var(--text-muted)';
    return '<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:var(--text-xs);font-weight:600;background:' + color + '20;color:' + color + ';border:1px solid ' + color + '40;text-transform:uppercase;">' + status + '</span>';
  }

  function renderGroup(title, docs, hasFile) {
    if (docs.length === 0) return '';
    var rows = docs.map(function(doc) {
      var viewBtn = hasFile(doc)
        ? '<button class="btn btn-sm btn-outline" data-doc-id="' + doc.doc_id + '" onclick="(function(){window._openDoc(\'' + doc.table + '\',\'' + doc.doc_id + '\')})()">View PDF</button>'
        : '<span style="color:var(--text-muted);font-size:var(--text-sm);">No file yet</span>';
      return '<tr>'
        + '<td style="padding:12px 16px;">' + escHtml(doc.label) + '</td>'
        + '<td style="padding:12px 16px;color:var(--text-muted);">' + formatDate(doc.date) + '</td>'
        + '<td style="padding:12px 16px;">' + (doc.status ? statusBadge(doc.status) : '') + '</td>'
        + '<td style="padding:12px 16px;text-align:right;">' + viewBtn + '</td>'
        + '</tr>';
    }).join('');

    return '<div class="card" style="margin-bottom:20px;overflow:hidden;">'
      + '<div style="padding:16px 20px;border-bottom:1px solid var(--border);font-weight:600;">' + title + '</div>'
      + '<div style="overflow-x:auto;">'
      + '<table style="width:100%;border-collapse:collapse;">'
      + '<thead><tr style="background:var(--bg-elevated);">'
      + '<th style="padding:10px 16px;text-align:left;font-size:var(--text-xs);text-transform:uppercase;color:var(--text-muted);">Document</th>'
      + '<th style="padding:10px 16px;text-align:left;font-size:var(--text-xs);text-transform:uppercase;color:var(--text-muted);">Date</th>'
      + '<th style="padding:10px 16px;text-align:left;font-size:var(--text-xs);text-transform:uppercase;color:var(--text-muted);">Status</th>'
      + '<th style="padding:10px 16px;"></th>'
      + '</tr></thead>'
      + '<tbody>' + rows + '</tbody>'
      + '</table>'
      + '</div>'
      + '</div>';
  }

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  window._openDoc = openDocument;

  window.loadMyDocuments = async function() {
    var container = document.getElementById('my-documents-content');
    if (!container) return;

    container.innerHTML = '<div style="display:flex;align-items:center;gap:10px;color:var(--text-muted);padding:40px 0;">'
      + '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>'
      + ' Loading documents...</div>';

    try {
      var data = await fetchDocuments();
      var docs = data.documents || [];

      var agreements   = docs.filter(function(d) { return d.type === 'agreement'; });
      var bgcs         = docs.filter(function(d) { return d.type === 'background_check'; });
      var provDocs     = docs.filter(function(d) { return d.type === 'provider_document'; });
      var idvs         = docs.filter(function(d) { return d.type === 'identity_verification'; });

      if (docs.length === 0) {
        container.innerHTML = '<div class="card" style="padding:40px;text-align:center;color:var(--text-muted);">'
          + '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:12px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
          + '<p style="margin:0;">No documents on file yet.</p>'
          + '</div>';
        return;
      }

      container.innerHTML =
        renderGroup('Agreements', agreements, function(d) { return true; })
        + renderGroup('Background Check Records', bgcs, function(d) { return d.has_report; })
        + renderGroup('Provider Documents', provDocs, function(d) { return true; })
        + renderGroup('Identity Verification (KYC)', idvs, function(d) { return false; });

    } catch (e) {
      container.innerHTML = '<div class="card" style="padding:20px;color:var(--accent-red);">Error loading documents: ' + escHtml(e.message) + '</div>';
    }
  };
})();
