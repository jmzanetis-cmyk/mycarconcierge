    // ========== APPLICATION REVIEW ==========
    async function viewApplication(appId) {
      currentApplication = applications.find(a => a.id === appId);
      if (!currentApplication) return;

      // Load documents
      const { data: docs } = await supabaseClient.from('provider_documents').select('*').eq('application_id', appId);
      const { data: refs } = await supabaseClient.from('provider_references').select('*').eq('application_id', appId);
      const { data: reviews } = await supabaseClient.from('provider_external_reviews').select('*').eq('application_id', appId);

      const app = currentApplication;
      
      // Format loaner delivery options
      const loanerDeliveryLabels = {
        'deliver_loaner': 'Delivers loaner to member',
        'pickup_at_shop': 'Member picks up at shop',
        'swap_at_member': 'Swaps vehicles at member location'
      };
      const loanerOptions = app.loaner_delivery_options?.map(o => loanerDeliveryLabels[o] || o).join(', ') || 'N/A';
      
      // Format pickup/delivery options
      const pickupLabels = {
        'pickup_vehicle': 'Picks up member vehicle',
        'deliver_vehicle': 'Delivers after service',
        'flatbed': 'Flatbed/tow capability',
        'rideshare_coord': 'Coordinates rideshare'
      };
      const pickupOptions = app.pickup_delivery_options?.map(o => pickupLabels[o] || o).join(', ') || 'N/A';

      document.getElementById('application-modal-body').innerHTML = `
        <div class="form-section">
          <div class="form-section-title">Business Information</div>
          <div class="detail-grid">
            <span class="detail-label">Business Name:</span><span class="detail-value">${app.business_name}</span>
            <span class="detail-label">Business Type:</span><span class="detail-value">${app.business_type || 'N/A'}</span>
            <span class="detail-label">Contact:</span><span class="detail-value">${app.contact_name}</span>
            <span class="detail-label">Phone:</span><span class="detail-value">${app.phone || 'N/A'}</span>
            <span class="detail-label">Email:</span><span class="detail-value">${app.email || 'N/A'}</span>
            <span class="detail-label">Website:</span><span class="detail-value">${app.website ? `<a href="${app.website}" target="_blank" style="color:var(--accent-blue)">${app.website}</a>` : 'N/A'}</span>
            <span class="detail-label">Address:</span><span class="detail-value">${app.address_line1 || ''}, ${app.city || ''}, ${app.state || ''} ${app.zip || ''}</span>
            <span class="detail-label">Service Area:</span><span class="detail-value">${app.service_area || 'N/A'}</span>
            <span class="detail-label">Years in Business:</span><span class="detail-value">${app.years_in_business || 'N/A'}</span>
            <span class="detail-label">Services:</span><span class="detail-value">${app.services_offered?.join(', ') || 'N/A'}</span>
            <span class="detail-label">Specializations:</span><span class="detail-value">${app.brand_specializations?.join(', ') || 'None'}</span>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">${mccIcon('car', 24)} Loaner Vehicle Program</div>
          ${app.has_loaner_vehicles ? `
            <div class="detail-grid">
              <span class="detail-label">Loaner Vehicles:</span><span class="detail-value" style="color:var(--accent-green);">${mccIcon('check', 16)} Yes (${app.loaner_vehicle_count || '?'} vehicles)</span>
              <span class="detail-label">Vehicle Types:</span><span class="detail-value">${app.loaner_vehicle_types || 'N/A'}</span>
              <span class="detail-label">Delivery Options:</span><span class="detail-value">${loanerOptions}</span>
              <span class="detail-label">Requirements:</span><span class="detail-value">${app.loaner_requirements || 'N/A'}</span>
              <span class="detail-label">Fee:</span><span class="detail-value">${app.loaner_fee_type === 'free' ? 'Free with service' : app.loaner_fee_type === 'deposit' ? 'Deposit only' : app.loaner_fee_amount ? '$' + app.loaner_fee_amount + '/day' : 'N/A'}</span>
            </div>
          ` : `
            <p style="color:var(--text-muted);">${mccIcon('x', 16)} No loaner vehicles available</p>
          `}
        </div>

        <div class="form-section">
          <div class="form-section-title">${mccIcon('truck', 24)} Pickup & Delivery</div>
          <div class="detail-grid">
            <span class="detail-label">Capabilities:</span><span class="detail-value">${pickupOptions}</span>
            <span class="detail-label">Radius:</span><span class="detail-value">${app.pickup_radius_miles ? app.pickup_radius_miles + ' miles' : 'N/A'}</span>
            <span class="detail-label">Fee:</span><span class="detail-value">${app.pickup_fee_type === 'free' ? 'Free' : app.pickup_fee_type === 'included' ? 'Included in service' : app.pickup_fee_type === 'flat' ? '$' + (app.pickup_fee_amount || 0) + ' flat' : app.pickup_fee_type === 'per_mile' ? '$' + (app.pickup_fee_amount || 0) + '/mile' : app.pickup_fee_type || 'N/A'}</span>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">Uploaded Documents</div>
          <div class="doc-list">
            ${docs?.length ? docs.map(d => `
              <div class="doc-item">
                <div class="doc-item-info">
                  <span class="doc-icon">${mccIcon('file-text', 16)}</span>
                  <span>${d.document_type}: ${d.document_name || 'Document'}</span>
                </div>
                <a href="${d.file_url}" target="_blank" class="btn btn-sm btn-secondary">View</a>
              </div>
            `).join('') : '<p style="color:var(--text-muted)">No documents uploaded</p>'}
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">External Reviews</div>
          ${reviews?.length ? reviews.map(r => `
            <div class="doc-item">
              <div class="doc-item-info">
                <span class="doc-icon">${mccIcon('star', 16)}</span>
                <span>${r.platform}: ${r.rating || '?'}/5 (${r.review_count || '?'} reviews)</span>
              </div>
              <a href="${r.profile_url}" target="_blank" class="btn btn-sm btn-secondary">View</a>
            </div>
          `).join('') : '<p style="color:var(--text-muted)">No external reviews provided</p>'}
        </div>

        <div class="form-section">
          <div class="form-section-title">References</div>
          ${refs?.length ? refs.map(r => `
            <div class="doc-item">
              <div class="doc-item-info">
                <span class="doc-icon">${mccIcon('user', 16)}</span>
                <div>
                  <strong>${r.reference_name}</strong> - ${r.relationship}<br>
                  <span style="font-size:0.82rem;color:var(--text-muted)">${r.reference_phone || ''} ${r.reference_email || ''}</span>
                </div>
              </div>
            </div>
          `).join('') : '<p style="color:var(--text-muted)">No references provided</p>'}
        </div>

        <div class="form-section">
          <div class="form-section-title">Vetting Checklist</div>
          <div class="checklist">
            <div class="checklist-item ${app.license_verified ? 'checked' : ''}">
              <input type="checkbox" id="chk-license" ${app.license_verified ? 'checked' : ''}>
              <label for="chk-license">Business license verified</label>
            </div>
            <div class="checklist-item ${app.insurance_verified ? 'checked' : ''}">
              <input type="checkbox" id="chk-insurance" ${app.insurance_verified ? 'checked' : ''}>
              <label for="chk-insurance">Insurance acknowledgment confirmed (provider agreed to maintain coverage)</label>
            </div>
            <div class="checklist-item ${app.certifications_verified ? 'checked' : ''}">
              <input type="checkbox" id="chk-certs" ${app.certifications_verified ? 'checked' : ''}>
              <label for="chk-certs">Certifications verified</label>
            </div>
            <div class="checklist-item ${app.reviews_checked ? 'checked' : ''}">
              <input type="checkbox" id="chk-reviews" ${app.reviews_checked ? 'checked' : ''}>
              <label for="chk-reviews">External reviews checked</label>
            </div>
            <div class="checklist-item ${app.references_contacted ? 'checked' : ''}">
              <input type="checkbox" id="chk-refs" ${app.references_contacted ? 'checked' : ''}>
              <label for="chk-refs">References contacted</label>
            </div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Admin Notes</label>
          <textarea class="form-textarea" id="admin-notes" placeholder="Internal notes about this application...">${app.admin_notes || ''}</textarea>
        </div>

        <div class="form-section">
          <div class="form-section-title">${mccIcon('user-check', 24)} Originating Lead</div>
          <div style="font-size:0.9rem;line-height:1.6;">
            ${renderApplicationLeadBadge(app)}
            ${app._outreach_lead ? `
              <div style="margin-top:10px;color:var(--text-secondary);">
                <div><strong style="color:var(--text-primary);">${escapeHtml(app._outreach_lead.name || 'Unknown')}</strong>${app._outreach_lead.type ? ` <span style="color:var(--text-muted);font-size:0.85em;">(${escapeHtml(app._outreach_lead.type)})</span>` : ''}</div>
                ${app._outreach_lead.email ? `<div style="font-size:0.85em;color:var(--text-muted);">${escapeHtml(app._outreach_lead.email)}</div>` : ''}
                ${app._outreach_lead.location ? `<div style="font-size:0.85em;color:var(--text-muted);">${escapeHtml(app._outreach_lead.location)}</div>` : ''}
                ${app._outreach_lead.status ? `<div style="font-size:0.85em;color:var(--text-muted);margin-top:4px;">Lead status: <span style="font-weight:600;color:var(--text-primary);">${escapeHtml(app._outreach_lead.status)}</span></div>` : ''}
              </div>
            ` : (!app.outreach_lead_id ? `
              <div style="margin-top:8px;color:var(--text-muted);font-size:0.85em;">
                This applicant signed up directly — no record of cold-outreach contact in the engine.
              </div>
            ` : '')}
          </div>
        </div>

        <div class="form-section" style="border-bottom:none;">
          <div class="form-section-title">${mccIcon('mail', 24)} Outreach History</div>
          <div id="application-outreach-history-body" style="font-size:0.9rem;color:var(--text-muted);">Loading…</div>
        </div>
      `;

      // Task #139: Gatekeeper agent-activity panel.
      // Append a container after the form sections; the helper renders into it.
      const modalBody = document.getElementById('application-modal-body');
      if (modalBody) {
        const agentDiv = document.createElement('div');
        agentDiv.className = 'form-section';
        agentDiv.style.borderBottom = 'none';
        agentDiv.innerHTML = `<div class="form-section-title">${mccIcon('zap', 24)} Gatekeeper Review</div>
          <div id="app-agent-${app.id}"></div>`;
        modalBody.appendChild(agentDiv);
      }

      openModal('application-modal');
      if (app.user_id && typeof globalThis.renderOutreachHistoryPanel === 'function') {
        globalThis.renderOutreachHistoryPanel('application-outreach-history-body', app.user_id);
      }
      if (typeof globalThis.renderAgentActivityPanel === 'function') {
        // Gatekeeper writes payload.provider_id = applicant user_id; fall back to application id.
        const targetId = app.user_id || app.id;
        try { globalThis.renderAgentActivityPanel(`app-agent-${app.id}`, {
          targetId, targetKind: 'application', agentSlug: 'gatekeeper',
          title: 'Gatekeeper Review', limit: 8, showEmpty: true,
          linkContext: { modal: { type: 'application', id: app.id } }
        }); } catch (e) { console.warn('[admin] gatekeeper panel failed:', e); }
      }
    }

    // Provider application approve / reject / request-more-info now flow
    // through the privileged /api/admin/provider-application endpoint
    // (netlify/functions/provider-application-review.js). The browser no
    // longer mutates provider_applications or profiles.role directly — see
    // Task #179.
    async function approveApplication() {
      if (!currentApplication) return;
      if (!confirm('Approve this provider? They will gain access to the provider portal.')) return;

      const adminNotes = document.getElementById('admin-notes').value;
      try {
        const res = await fetch('/api/admin/provider-application/approve', {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            application_id: currentApplication.id,
            admin_notes: adminNotes,
            reviewed_by: currentUser?.id || null,
            license_verified:        document.getElementById('chk-license').checked,
            insurance_verified:      document.getElementById('chk-insurance').checked,
            certifications_verified: document.getElementById('chk-certs').checked,
            reviews_checked:         document.getElementById('chk-reviews').checked,
            references_contacted:    document.getElementById('chk-refs').checked
          })
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast(json.error || `Approve failed (${res.status})`, 'error');
          return;
        }
        if (json.provider_stats_error) {
          showToast(`Approved (provider_stats note: ${json.provider_stats_error})`, 'warning');
        } else {
          showToast('Provider approved!');
        }
      } catch (e) {
        showToast(`Approve failed: ${e.message}`, 'error');
        return;
      }

      closeModal('application-modal');
      await loadApplications();
      await loadProviders();
      updateDashboard();
    }

    async function rejectApplication() {
      if (!currentApplication) return;
      const reason = prompt('Reason for rejection:');
      if (!reason) return;

      try {
        const res = await fetch('/api/admin/provider-application/reject', {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            application_id: currentApplication.id,
            reason,
            admin_notes: document.getElementById('admin-notes').value,
            reviewed_by: currentUser?.id || null
          })
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast(json.error || `Reject failed (${res.status})`, 'error');
          return;
        }
      } catch (e) {
        showToast(`Reject failed: ${e.message}`, 'error');
        return;
      }

      closeModal('application-modal');
      showToast('Application rejected');
      await loadApplications();
      updateDashboard();
    }

    async function requestMoreInfo() {
      if (!currentApplication) return;
      const request = prompt('What additional information is needed?');
      if (!request) return;

      try {
        const res = await fetch('/api/admin/provider-application/request-info', {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            application_id: currentApplication.id,
            info_requested: request,
            admin_notes: document.getElementById('admin-notes').value || '',
            reviewed_by: currentUser?.id || null
          })
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast(json.error || `Request failed (${res.status})`, 'error');
          return;
        }
      } catch (e) {
        showToast(`Request failed: ${e.message}`, 'error');
        return;
      }

      closeModal('application-modal');
      showToast('Request sent to applicant');
      await loadApplications();
    }

    // ========== DISPUTE HANDLING ==========
    async function viewDispute(disputeId) {
      currentDispute = disputes.find(d => d.id === disputeId);
      if (!currentDispute) return;

      const { data: evidence } = await supabaseClient.from('dispute_evidence').select('*').eq('dispute_id', disputeId);
      const d = currentDispute;
      const isHighValue = (d.maintenance_packages?.payments?.[0]?.amount_total || 0) > 1000;

      document.getElementById('dispute-modal-body').innerHTML = `
        <div class="form-section">
          <div class="form-section-title">Dispute Details</div>
          <div class="detail-grid">
            <span class="detail-label">Package:</span><span class="detail-value">${d.maintenance_packages?.title || 'N/A'}</span>
            <span class="detail-label">Amount:</span><span class="detail-value">$${(d.maintenance_packages?.payments?.[0]?.amount_total || 0).toFixed(2)}</span>
            <span class="detail-label">Filed By:</span><span class="detail-value">${d.filed_by_profile?.full_name || 'User'} (${d.filed_by_role})</span>
            <span class="detail-label">Reason:</span><span class="detail-value">${d.reason}</span>
            <span class="detail-label">Filed:</span><span class="detail-value">${new Date(d.created_at).toLocaleString()}</span>
          </div>
          ${d.description ? `<p style="margin-top:16px;color:var(--text-secondary);">${d.description}</p>` : ''}
        </div>

        ${isHighValue ? `
          <div class="alert warning">
            ${mccIcon('alert-triangle', 16)} This dispute is over $1,000. Third-party inspection may be required.
          </div>
        ` : ''}

        <div class="form-section">
          <div class="form-section-title">Evidence Submitted</div>
          ${evidence?.length ? `
            <div class="evidence-grid">
              ${evidence.map(e => `
                <div class="evidence-item" onclick="window.open('${e.file_url}','_blank')">
                  <img src="${e.file_url}" onerror="this.parentElement.innerHTML=mccIcon('file-text', 16)">
                </div>
              `).join('')}
            </div>
          ` : '<p style="color:var(--text-muted)">No evidence submitted</p>'}
        </div>

        <div class="form-group">
          <label class="form-label">Resolution Amount ($)</label>
          <input type="number" class="form-input" id="resolution-amount" placeholder="Amount to refund to member" value="${d.maintenance_packages?.payments?.[0]?.amount_total || 0}">
        </div>

        <div class="form-group">
          <label class="form-label">Resolution Notes</label>
          <textarea class="form-textarea" id="resolution-notes" placeholder="Explain the resolution decision...">${d.resolution_notes || ''}</textarea>
        </div>

        ${(d.user_id || d.filed_by) ? `
        <div class="form-section" style="border-bottom:none;">
          <div class="form-section-title">${mccIcon('mail', 24)} Outreach History</div>
          <div id="dispute-outreach-history-body-${d.id}" style="font-size:0.9rem;color:var(--text-muted);">Loading…</div>
        </div>
        ` : ''}
      `;

      document.getElementById('dispute-modal-footer').innerHTML = `
        ${isHighValue && !d.requires_inspection ? `<button class="btn btn-secondary" onclick="scheduleInspection()">Schedule Inspection</button>` : ''}
        <button class="btn btn-danger" onclick="resolveDispute('provider')">Resolve for Provider</button>
        <button class="btn btn-success" onclick="resolveDispute('member')">Resolve for Member</button>
      `;

      const disputeUserId = d.user_id || d.filed_by;
      if (disputeUserId && typeof globalThis.renderOutreachHistoryPanel === 'function') {
        try { globalThis.renderOutreachHistoryPanel(`dispute-outreach-history-body-${d.id}`, disputeUserId); }
        catch (e) { console.warn('[admin] dispute outreach history panel failed:', e); }
      }

      // Task #139: AI dispute analysis panel (legacy ai_ops dispute_resolver + Advocate fleet agent).
      const dBody = document.getElementById('dispute-modal-body');
      if (dBody) {
        const ad = document.createElement('div');
        ad.className = 'form-section';
        ad.style.borderBottom = 'none';
        ad.innerHTML = `<div class="form-section-title">${mccIcon('cpu', 24)} AI Dispute Analysis</div>
          <div id="dispute-agent-${d.id}"></div>`;
        dBody.appendChild(ad);
      }

      openModal('dispute-modal');
      if (typeof globalThis.renderAgentActivityPanel === 'function') {
        try { globalThis.renderAgentActivityPanel(`dispute-agent-${d.id}`, {
          targetId: d.id, targetKind: 'dispute',
          agentSlug: 'advocate', includeAiOpsModule: 'dispute_resolver',
          title: 'AI Dispute Analysis', limit: 8, showEmpty: true,
          linkContext: { modal: { type: 'dispute', id: d.id } }
        }); } catch (e) { console.warn('[admin] dispute agent panel failed:', e); }
      }
    }

    async function resolveDispute(winner) {
      if (!currentDispute) return;
      const resolutionAmount = Number.parseFloat(document.getElementById('resolution-amount').value) || 0;
      const notes = document.getElementById('resolution-notes').value;

      if (!notes) return showToast('Please provide resolution notes', 'error');

      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/admin/disputes/${currentDispute.id}/resolve`, {
          method: 'POST',
          headers: getAdminHeaders(),
          body: JSON.stringify({ winner, resolution_amount: resolutionAmount, notes })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to resolve dispute');

        closeModal('dispute-modal');
        showToast(data.stripe_refunded ? 'Dispute resolved and refund processed in Stripe' : 'Dispute resolved');
        await loadDisputes();
        await loadPayments();
        updateDashboard();
      } catch (err) {
        showToast('Resolve failed: ' + err.message, 'error');
      }
    }

    async function scheduleInspection() {
      // For now, just mark that inspection is needed
      await supabaseClient.from('disputes').update({ requires_inspection: true, status: 'inspection_scheduled' }).eq('id', currentDispute.id);
      closeModal('dispute-modal');
      showToast('Inspection scheduled');
      await loadDisputes();
    }

    // ========== TICKETS ==========
    async function viewTicket(ticketId) {
      currentTicket = tickets.find(t => t.id === ticketId);
      if (!currentTicket) return;

      const { data: messages } = await supabaseClient.from('ticket_messages').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: true });
      const t = currentTicket;

      document.getElementById('ticket-modal-body').innerHTML = `
        <div class="form-section">
          <div class="form-section-title">${t.subject}</div>
          <div class="detail-grid">
            <span class="detail-label">From:</span><span class="detail-value">${t.user?.full_name || t.user?.email || 'User'}</span>
            <span class="detail-label">Category:</span><span class="detail-value">${t.category || 'General'}</span>
            <span class="detail-label">Priority:</span><span class="detail-value">${t.priority || 'Normal'}</span>
            <span class="detail-label">Submitted:</span><span class="detail-value">${new Date(t.created_at).toLocaleString()}</span>
          </div>
          <p style="margin-top:16px;color:var(--text-secondary);background:var(--bg-input);padding:16px;border-radius:var(--radius-md);">${t.description}</p>
        </div>

        <div class="form-section">
          <div class="form-section-title">Conversation</div>
          <div style="max-height:200px;overflow-y:auto;">
            ${messages?.length ? messages.map(m => `
              <div style="margin-bottom:12px;padding:12px;background:${m.sender_role === 'admin' ? 'var(--accent-blue-soft)' : 'var(--bg-input)'};border-radius:var(--radius-md);">
                <div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:4px;">${m.sender_role === 'admin' ? 'Admin' : 'User'} - ${new Date(m.created_at).toLocaleString()}</div>
                <p>${m.content}</p>
              </div>
            `).join('') : ''}
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Your Reply</label>
          <textarea class="form-textarea" id="ticket-reply" placeholder="Type your response..."></textarea>
        </div>

        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-select" id="ticket-status">
            <option value="open" ${t.status === 'open' ? 'selected' : ''}>Open</option>
            <option value="in_progress" ${t.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
            <option value="resolved" ${t.status === 'resolved' ? 'selected' : ''}>Resolved</option>
            <option value="closed" ${t.status === 'closed' ? 'selected' : ''}>Closed</option>
          </select>
        </div>

        ${t.user_id ? `
        <div class="form-section" style="border-bottom:none;">
          <div class="form-section-title">${mccIcon('mail', 24)} Outreach History</div>
          <div id="ticket-outreach-history-body-${t.id}" style="font-size:0.9rem;color:var(--text-muted);">Loading…</div>
        </div>
        ` : ''}

        <div class="form-section" style="border-bottom:none;">
          <div class="form-section-title">${mccIcon('cpu', 24)} AI Helpdesk Activity</div>
          <div id="ticket-agent-${t.id}"></div>
        </div>
      `;

      if (t.user_id && typeof globalThis.renderOutreachHistoryPanel === 'function') {
        try { globalThis.renderOutreachHistoryPanel(`ticket-outreach-history-body-${t.id}`, t.user_id); }
        catch (e) { console.warn('[admin] outreach history panel failed:', e); }
      }

      // Task #139: AI Helpdesk module rows for this ticket (legacy ai_action_log).
      if (typeof globalThis.renderAgentActivityPanel === 'function') {
        try { globalThis.renderAgentActivityPanel(`ticket-agent-${t.id}`, {
          targetId: t.id, targetKind: 'ticket',
          includeAiOpsModule: 'ai_helpdesk',
          title: 'AI Helpdesk', limit: 8, showEmpty: true,
          linkContext: { modal: { type: 'ticket', id: t.id } }
        }); } catch (e) { console.warn('[admin] ticket agent panel failed:', e); }
      }

      openModal('ticket-modal');
    }

    async function sendTicketReply() {
      if (!currentTicket) return;
      const reply = document.getElementById('ticket-reply').value.trim();
      const status = document.getElementById('ticket-status').value;

      if (reply) {
        await supabaseClient.from('ticket_messages').insert({
          ticket_id: currentTicket.id,
          sender_id: currentUser.id,
          sender_role: 'admin',
          content: reply
        });
      }

      await supabaseClient.from('support_tickets').update({
        status: status,
        assigned_to: currentUser.id,
        updated_at: new Date().toISOString()
      }).eq('id', currentTicket.id);

      closeModal('ticket-modal');
      showToast('Reply sent');
      await loadTickets();
      updateDashboard();
    }

    // ========== PAYMENTS ==========
    async function releasePayment(paymentId) {
      if (!confirm('Release this payment to the provider?')) return;

      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/admin/payments/${paymentId}/release`, {
          method: 'POST',
          headers: getAdminHeaders()
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to release payment');

        showToast(data.stripe_captured ? 'Payment released and captured in Stripe' : 'Payment released');
        await loadPayments();
        updateDashboard();
      } catch (err) {
        showToast('Release failed: ' + err.message, 'error');
      }
    }

    function editPayment(paymentId) {
      const p = payments.find(x => x.id === paymentId);
      if (!p) {
        showToast('Payment not found', 'error');
        return;
      }
      document.getElementById('edit-payment-id').value = p.id;
      document.getElementById('edit-payment-status').value = p.status || 'held';
      document.getElementById('edit-payment-amount-total').value = p.amount_total ?? '';
      document.getElementById('edit-payment-mcc-fee').value = p.amount_mcc_fee ?? '';
      document.getElementById('edit-payment-refund-amount').value = p.refund_amount ?? '';
      document.getElementById('edit-payment-admin-note').value = p.admin_note || '';

      // Task #247 — render the Outreach History panel for the paying member
      // so admins triaging a payment issue can see whether the user
      // originally came from cold outreach without leaving the modal.
      // Mirrors the dispute / refund / ticket / application modal pattern
      // from Task #188. Section is hidden when the payment has no
      // member_id (or the renderer isn't loaded yet) to match the existing
      // "omit when no user id" behavior elsewhere.
      const paymentSection = document.getElementById('edit-payment-outreach-history-section');
      const paymentBody = document.getElementById('edit-payment-outreach-history-body');
      if (paymentSection && paymentBody) {
        if (p.member_id && typeof globalThis.renderOutreachHistoryPanel === 'function') {
          paymentSection.style.display = '';
          paymentBody.textContent = 'Loading…';
          try {
            globalThis.renderOutreachHistoryPanel('edit-payment-outreach-history-body', p.member_id);
          } catch (e) {
            console.warn('[admin] payment outreach history panel failed:', e);
            paymentSection.style.display = 'none';
          }
        } else {
          paymentSection.style.display = 'none';
        }
      }

      const modal = document.getElementById('edit-payment-modal');
      modal.style.display = 'flex';
      modal.classList.add('active');
    }

    async function saveEditPayment() {
      const id = document.getElementById('edit-payment-id').value;
      if (!id) return;

      const status = document.getElementById('edit-payment-status').value;
      const amountTotalRaw = document.getElementById('edit-payment-amount-total').value;
      const mccFeeRaw = document.getElementById('edit-payment-mcc-fee').value;
      const refundRaw = document.getElementById('edit-payment-refund-amount').value;
      const note = document.getElementById('edit-payment-admin-note').value.trim();

      const updates = {
        status,
        amount_total: amountTotalRaw === '' ? null : Number.parseFloat(amountTotalRaw),
        amount_mcc_fee: mccFeeRaw === '' ? null : Number.parseFloat(mccFeeRaw),
        refund_amount: refundRaw === '' ? null : Number.parseFloat(refundRaw),
        admin_note: note || null
      };

      for (const k of ['amount_total', 'amount_mcc_fee', 'refund_amount']) {
        if (updates[k] !== null && (isNaN(updates[k]) || updates[k] < 0)) {
          showToast(`Invalid value for ${k.replaceAll('_', ' ')}`, 'error');
          return;
        }
      }

      const { error } = await supabaseClient.rpc('admin_edit_payment', {
        p_id: id,
        p_status: updates.status,
        p_amount_total: updates.amount_total,
        p_amount_mcc_fee: updates.amount_mcc_fee,
        p_refund_amount: updates.refund_amount,
        p_admin_note: updates.admin_note
      });
      if (error) {
        showToast('Failed to save: ' + error.message, 'error');
        return;
      }

      closeModal('edit-payment-modal');
      showToast('Payment updated');
      await loadPayments();
      updateDashboard();
    }

    async function deletePayment(paymentId) {
      const p = payments.find(x => x.id === paymentId);
      if (!p) {
        showToast('Payment not found', 'error');
        return;
      }
      if (!confirm(`Permanently delete this payment?\n\nPackage: ${p.maintenance_packages?.title || 'Package'}\nAmount: $${(p.amount_total || 0).toFixed(2)}\n\nThis cannot be undone.`)) return;

      const { data: openDisputes, error: disputeErr } = await supabaseClient
        .from('disputes')
        .select('id')
        .eq('package_id', p.package_id)
        .eq('status', 'open')
        .limit(1);
      if (disputeErr) {
        showToast('Could not check disputes: ' + disputeErr.message, 'error');
        return;
      }
      if (openDisputes && openDisputes.length > 0) {
        showToast('Cannot delete: an open dispute references this payment. Resolve the dispute first.', 'error');
        return;
      }

      const { error } = await supabaseClient.rpc('admin_delete_payment', { p_id: paymentId });
      if (error) {
        showToast('Failed to delete: ' + error.message, 'error');
        return;
      }

      // Audit log written atomically by admin_delete_payment RPC.

      showToast('Payment deleted');
      await loadPayments();
      updateDashboard();
    }

    function csvEscapePayments(v) {
      if (v === null || v === undefined) return '';
      const s = String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return `"${s.replaceAll('"', '""')}"`;
      }
      return s;
    }

    function exportPayments() {
      const rows = filteredPayments;
      if (!rows || !rows.length) {
        showToast('No payments to export for the current filter', 'error');
        return;
      }
      const header = ['Date', 'Package', 'Member', 'Provider', 'Amount', 'MCC Fee', 'Refund Amount', 'Status', 'Payment ID'];
      const lines = [header.join(',')];
      for (const p of rows) {
        lines.push([
          csvEscapePayments(p.created_at || ''),
          csvEscapePayments(p.maintenance_packages?.title || ''),
          csvEscapePayments(p.member?.full_name || ''),
          csvEscapePayments(p.provider?.full_name || ''),
          csvEscapePayments((p.amount_total ?? 0).toFixed(2)),
          csvEscapePayments((p.amount_mcc_fee ?? 0).toFixed(2)),
          csvEscapePayments((p.refund_amount ?? 0).toFixed(2)),
          csvEscapePayments(p.status || ''),
          csvEscapePayments(p.id || '')
        ].join(','));
      }
      const csv = lines.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const today = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `payments-export-${today}.csv`;
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast(`Exported ${rows.length} payment${rows.length === 1 ? '' : 's'}`);
    }

    // ========== NAVIGATION ==========
    function setupEventListeners() {
      document.querySelectorAll('.nav-item[data-section]').forEach(item => {
        item.addEventListener('click', () => showSection(item.dataset.section));
      });

      document.querySelectorAll('.quick-stat-btn[data-nav]').forEach(btn => {
        btn.addEventListener('click', () => {
          showSection(btn.dataset.nav);
          globalThis.scrollTo({ top: 0, behavior: 'smooth' });
        });
      });

      document.querySelectorAll('.tabs').forEach(tabContainer => {
        tabContainer.querySelectorAll('.tab').forEach(tab => {
          tab.addEventListener('click', () => {
            tabContainer.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const section = tabContainer.closest('.section').id;
            currentFilters[section] = tab.dataset.filter;
            // Task #248 — keep ?app_status=... in the URL so links survive a refresh.
            if (section === 'applications') { paginationState.applications.page = 1; syncApplicationsUrl(); renderApplications(); }
            if (section === 'payments') { selectedPaymentIds.clear(); paginationState.payments.page = 1; renderPayments(); }
            if (section === 'disputes') renderDisputes();
            if (section === 'tickets') renderTickets();
            if (section === 'refunds') { paginationState.refunds.filter = tab.dataset.filter; paginationState.refunds.page = 1; loadRefunds(1); }
          });
        });
      });

      document.querySelectorAll('.modal-backdrop').forEach(b => {
        b.addEventListener('click', e => { if (e.target === b) b.classList.remove('active'); });
      });
    }

    async function showSection(id) {
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.getElementById(id).classList.add('active');
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelector(`.nav-item[data-section="${id}"]`)?.classList.add('active');
      
      await loadSectionIfNeeded(id);

      // Task #139 — refresh the dashboard agent tile every time the user
      // navigates back to the dashboard so 24h counts and the recent-activity
      // list stay current (loadAllData only runs once at admin verification).
      if (id === 'dashboard' && typeof loadDashboardAgentTile === 'function') {
        try { await loadDashboardAgentTile(); }
        catch (e) { console.warn('[admin] dashboard agent tile refresh failed:', e); }
      }
    }

    function navigateToSection(id) {
      showSection(id);
      globalThis.scrollTo({ top: 0, behavior: 'smooth' });
    }
    globalThis.navigateToSection = navigateToSection;

    function openModal(id) { const m = document.getElementById(id); m.classList.add('active'); m.style.display = 'flex'; }
    function closeModal(id) { const m = document.getElementById(id); m.classList.remove('active'); m.style.display = 'none'; }

    function showToast(msg, type = 'success') {
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.innerHTML = `<span>${type === 'success' ? mccIcon('check', 16) : mccIcon('alert-triangle', 16)}</span><span>${msg}</span>`;
      document.getElementById('toast-container').appendChild(toast);
      setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
    }

    // Generic modal helper for admin.js — used by driver-detail (:6447) and
    // ride-detail (:6592) views. Renders into #admin-generic-modal in
    // admin.html. Any HTML is trusted (admin-only surface, admin composes
    // the body themselves from vetted data). If a caller ever passes
    // user-supplied text, escape it at the call site — same rule as the
    // agreement-modal-body render pattern above.
    function showModal(title, html) {
      const titleEl = document.getElementById('admin-generic-modal-title');
      const bodyEl = document.getElementById('admin-generic-modal-body');
      const backdrop = document.getElementById('admin-generic-modal');
      if (!titleEl || !bodyEl || !backdrop) {
        console.warn('[admin.showModal] #admin-generic-modal not in DOM — did admin.html get updated?');
        return;
      }
      titleEl.textContent = title || 'Details';
      bodyEl.innerHTML = html || '';
      backdrop.style.display = 'flex';
      backdrop.classList.add('active');
    }

