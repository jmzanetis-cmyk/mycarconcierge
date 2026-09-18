    // ========== HUBSPOT CRM ==========
    let crmContactsData = [];
    let crmDealsData = [];
    let crmCompaniesData = [];
    let currentCrmFormType = 'contact';

    async function loadCrmData() {
      try {
        const [contactsRes, dealsRes, companiesRes] = await Promise.all([
          fetch('/api/admin/hubspot/contacts', { headers: getAdminHeaders() }),
          fetch('/api/admin/hubspot/deals', { headers: getAdminHeaders() }),
          fetch('/api/admin/hubspot/companies', { headers: getAdminHeaders() })
        ]);

        if (contactsRes.ok) {
          const cData = await contactsRes.json();
          crmContactsData = cData.contacts || [];
          document.getElementById('crm-stat-contacts').textContent = crmContactsData.length;
          renderCrmContacts(crmContactsData);
        }
        if (dealsRes.ok) {
          const dData = await dealsRes.json();
          crmDealsData = dData.deals || [];
          document.getElementById('crm-stat-deals').textContent = crmDealsData.length;
          renderCrmDeals(crmDealsData);
        }
        if (companiesRes.ok) {
          const coData = await companiesRes.json();
          crmCompaniesData = coData.companies || [];
          document.getElementById('crm-stat-companies').textContent = crmCompaniesData.length;
          renderCrmCompanies(crmCompaniesData);
        }
      } catch (err) {
        console.error('Error loading CRM data:', err);
        showToast('Failed to load CRM data', 'error');
      }
    }

    function renderCrmContacts(contacts) {
      const tbody = document.getElementById('crm-contacts-body');
      if (!contacts.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:32px;">No contacts found</td></tr>';
        return;
      }
      tbody.innerHTML = contacts.map(c => {
        const p = c.properties || {};
        const name = [p.firstname, p.lastname].filter(Boolean).join(' ') || '—';
        const stage = p.lifecyclestage ? `<span class="status-badge" style="background:var(--accent-blue-soft);color:var(--accent-blue);">${p.lifecyclestage}</span>` : '—';
        const created = p.createdate ? new Date(p.createdate).toLocaleDateString() : '—';
        return `<tr>
          <td style="font-weight:600;">${name}</td>
          <td>${p.email || '—'}</td>
          <td>${p.phone || '—'}</td>
          <td>${p.company || '—'}</td>
          <td>${stage}</td>
          <td>${created}</td>
        </tr>`;
      }).join('');
    }

    function renderCrmDeals(deals) {
      const tbody = document.getElementById('crm-deals-body');
      if (!deals.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:32px;">No deals found</td></tr>';
        return;
      }
      tbody.innerHTML = deals.map(d => {
        const p = d.properties || {};
        const amount = p.amount ? `$${Number.parseFloat(p.amount).toLocaleString('en-US', {minimumFractionDigits:2})}` : '—';
        const stageColors = {
          closedwon: 'background:var(--accent-green-soft);color:var(--accent-green);',
          closedlost: 'background:var(--accent-red-soft);color:var(--accent-red);',
        };
        const stageStyle = stageColors[p.dealstage] || 'background:var(--accent-blue-soft);color:var(--accent-blue);';
        const stage = p.dealstage ? `<span class="status-badge" style="${stageStyle}">${p.dealstage}</span>` : '—';
        const closeDate = p.closedate ? new Date(p.closedate).toLocaleDateString() : '—';
        const created = p.createdate ? new Date(p.createdate).toLocaleDateString() : '—';
        return `<tr>
          <td style="font-weight:600;">${p.dealname || '—'}</td>
          <td>${amount}</td>
          <td>${stage}</td>
          <td>${p.pipeline || '—'}</td>
          <td>${closeDate}</td>
          <td>${created}</td>
        </tr>`;
      }).join('');
    }

    function renderCrmCompanies(companies) {
      const tbody = document.getElementById('crm-companies-body');
      if (!companies.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:32px;">No companies found</td></tr>';
        return;
      }
      tbody.innerHTML = companies.map(co => {
        const p = co.properties || {};
        const location = [p.city, p.state].filter(Boolean).join(', ') || '—';
        const created = p.createdate ? new Date(p.createdate).toLocaleDateString() : '—';
        return `<tr>
          <td style="font-weight:600;">${p.name || '—'}</td>
          <td>${p.domain ? `<a href="https://${p.domain}" target="_blank" style="color:var(--accent-blue);">${p.domain}</a>` : '—'}</td>
          <td>${p.industry || '—'}</td>
          <td>${p.phone || '—'}</td>
          <td>${location}</td>
          <td>${created}</td>
        </tr>`;
      }).join('');
    }

    function switchCrmTab(tab) {
      document.querySelectorAll('.crm-tab-panel').forEach(p => p.style.display = 'none');
      document.querySelectorAll('.crm-tab-btn').forEach(b => {
        b.classList.remove('active');
        b.classList.remove('btn-primary');
        b.classList.add('btn-secondary');
      });
      document.getElementById('crm-tab-' + tab).style.display = 'block';
      const activeBtn = document.querySelector(`.crm-tab-btn[data-crm-tab="${tab}"]`);
      if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.classList.remove('btn-secondary');
        activeBtn.classList.add('btn-primary');
      }
    }
    globalThis.switchCrmTab = switchCrmTab;

    function filterCrmContacts() {
      const q = document.getElementById('crm-contact-search').value.toLowerCase();
      const filtered = crmContactsData.filter(c => {
        const p = c.properties || {};
        return [p.firstname, p.lastname, p.email, p.phone, p.company].some(v => v?.toLowerCase().includes(q));
      });
      renderCrmContacts(filtered);
    }
    globalThis.filterCrmContacts = filterCrmContacts;

    function filterCrmDeals() {
      const q = document.getElementById('crm-deal-search').value.toLowerCase();
      const filtered = crmDealsData.filter(d => {
        const p = d.properties || {};
        return [p.dealname, p.dealstage, p.pipeline].some(v => v?.toLowerCase().includes(q));
      });
      renderCrmDeals(filtered);
    }
    globalThis.filterCrmDeals = filterCrmDeals;

    function filterCrmCompanies() {
      const q = document.getElementById('crm-company-search').value.toLowerCase();
      const filtered = crmCompaniesData.filter(co => {
        const p = co.properties || {};
        return [p.name, p.domain, p.industry, p.city, p.state].some(v => v?.toLowerCase().includes(q));
      });
      renderCrmCompanies(filtered);
    }
    globalThis.filterCrmCompanies = filterCrmCompanies;

    function showCrmModal(type) {
      currentCrmFormType = type;
      document.getElementById('crm-form-contact').style.display = type === 'contact' ? 'block' : 'none';
      document.getElementById('crm-form-deal').style.display = type === 'deal' ? 'block' : 'none';
      document.getElementById('crm-form-company').style.display = type === 'company' ? 'block' : 'none';
      const titles = { contact: 'Add Contact', deal: 'Add Deal', company: 'Add Company' };
      document.getElementById('crm-modal-title').textContent = titles[type] || 'Add Record';
      const modal = document.getElementById('crm-add-modal');
      modal.style.display = 'flex';
      modal.classList.add('active');
    }
    globalThis.showCrmModal = showCrmModal;

    function closeCrmModal() {
      const modal = document.getElementById('crm-add-modal');
      modal.classList.remove('active');
      modal.style.display = 'none';
    }
    globalThis.closeCrmModal = closeCrmModal;

    async function saveCrmRecord() {
      const btn = document.getElementById('crm-modal-save-btn');
      btn.disabled = true;
      btn.textContent = 'Saving...';

      try {
        let url, body;
        if (currentCrmFormType === 'contact') {
          const email = document.getElementById('crm-contact-email').value.trim();
          if (!email) { showToast('Email is required', 'error'); return; }
          url = '/api/admin/hubspot/contacts';
          body = {
            firstname: document.getElementById('crm-contact-firstname').value.trim(),
            lastname: document.getElementById('crm-contact-lastname').value.trim(),
            email,
            phone: document.getElementById('crm-contact-phone').value.trim(),
            company: document.getElementById('crm-contact-company').value.trim(),
            lifecyclestage: document.getElementById('crm-contact-stage').value
          };
        } else if (currentCrmFormType === 'deal') {
          const dealname = document.getElementById('crm-deal-name').value.trim();
          if (!dealname) { showToast('Deal name is required', 'error'); return; }
          url = '/api/admin/hubspot/deals';
          body = {
            dealname,
            amount: document.getElementById('crm-deal-amount').value || '',
            dealstage: document.getElementById('crm-deal-stage').value,
            closedate: document.getElementById('crm-deal-closedate').value || ''
          };
        } else if (currentCrmFormType === 'company') {
          const name = document.getElementById('crm-company-name').value.trim();
          if (!name) { showToast('Company name is required', 'error'); return; }
          url = '/api/admin/hubspot/companies';
          body = {
            name,
            domain: document.getElementById('crm-company-domain').value.trim(),
            industry: document.getElementById('crm-company-industry').value.trim(),
            phone: document.getElementById('crm-company-phone').value.trim(),
            city: document.getElementById('crm-company-city').value.trim(),
            state: document.getElementById('crm-company-state').value.trim()
          };
        }

        const res = await fetch(url, {
          method: 'POST',
          headers: getAdminHeaders(),
          body: JSON.stringify(body)
        });

        if (res.ok) {
          showToast(`${currentCrmFormType.charAt(0).toUpperCase() + currentCrmFormType.slice(1)} created successfully`);
          closeCrmModal();
          loadedSections['crm'] = false;
          await loadCrmData();
        } else {
          const err = await res.json();
          showToast(err.error || 'Failed to create record', 'error');
        }
      } catch (err) {
        console.error('CRM save error:', err);
        showToast('Failed to save record', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Save';
      }
    }
    globalThis.saveCrmRecord = saveCrmRecord;

    // Accept the click event explicitly instead of leaning on legacy window.event.
    // window.event still populates during synchronous onclick dispatch in
    // WebKit, but any programmatic caller (retry logic, keyboard shortcut,
    // etc.) would find it null. Passing evt through the onclick attribute
    // makes the dependency explicit. Called from admin.html:4383.
    async function syncMembersToHubSpot(evt) {
      const btn = evt?.target || evt?.currentTarget;
      if (!btn) return; // no button to disable = probably not a real click; bail.
      btn.disabled = true;
      btn.textContent = 'Syncing...';
      try {
        const res = await fetch('/api/admin/hubspot/sync-members', {
          method: 'POST',
          headers: getAdminHeaders()
        });
        if (res.ok) {
          const data = await res.json();
          showToast(`Synced ${data.synced || 0} members to HubSpot`);
          loadedSections['crm'] = false;
          await loadCrmData();
        } else {
          const err = await res.json();
          showToast(err.error || 'Sync failed', 'error');
        }
      } catch (err) {
        showToast('Failed to sync members', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Sync Members';
      }
    }
    globalThis.syncMembersToHubSpot = syncMembersToHubSpot;

    // ========== GLOBAL 2FA TOGGLE ==========
    async function load2faGlobalStatus() {
      try {
        const session = await supabaseClient.auth.getSession();
        if (!session?.data?.session?.access_token) return;
        
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/2fa-global-status`, {
          headers: { 'Authorization': `Bearer ${session.data.session.access_token}` }
        });
        
        if (response.ok) {
          const data = await response.json();
          const toggle = document.getElementById('global-2fa-toggle');
          const statusMsg = document.getElementById('2fa-status-message');
          if (toggle) {
            toggle.checked = data.enabled;
          }
          if (statusMsg) {
            statusMsg.style.display = 'block';
            statusMsg.style.background = data.enabled ? 'var(--accent-green-soft)' : 'var(--accent-orange-soft)';
            statusMsg.style.color = data.enabled ? 'var(--accent-green)' : 'var(--accent-orange)';
            statusMsg.textContent = data.enabled 
              ? '2FA enforcement is ON. Users with 2FA enabled must verify to access protected features.'
              : '2FA enforcement is OFF. Users can access features without 2FA verification (for App Store review).';
          }
        }
      } catch (err) {
        console.error('Failed to load 2FA global status:', err);
      }
    }

    async function toggle2faGlobal(enabled) {
      const toggle = document.getElementById('global-2fa-toggle');
      const statusMsg = document.getElementById('2fa-status-message');
      
      try {
        const session = await supabaseClient.auth.getSession();
        if (!session?.data?.session?.access_token) {
          showToast('Authentication required', 'error');
          toggle.checked = !enabled;
          return;
        }
        
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/2fa-global-toggle`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.data.session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ enabled })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
          showToast(data.message, 'success');
          statusMsg.style.display = 'block';
          statusMsg.style.background = enabled ? 'var(--accent-green-soft)' : 'var(--accent-orange-soft)';
          statusMsg.style.color = enabled ? 'var(--accent-green)' : 'var(--accent-orange)';
          statusMsg.textContent = enabled 
            ? '2FA enforcement is ON. Users with 2FA enabled must verify to access protected features.'
            : '2FA enforcement is OFF. Users can access features without 2FA verification (for App Store review).';
        } else {
          showToast(data.error || 'Failed to update 2FA setting', 'error');
          toggle.checked = !enabled;
        }
      } catch (err) {
        console.error('Failed to toggle 2FA:', err);
        showToast('Failed to update 2FA setting', 'error');
        toggle.checked = !enabled;
      }
    }

    // ── Feature Flags ────────────────────────────────────────────────────────

    const FLAG_LABELS = {
      custody_chain_enabled:      { title: 'Custody Chain',      desc: 'Photo verification + return fees for vehicle handoffs.' },
      car_club_programs_enabled:  { title: 'Car Club Programs',  desc: 'Points, coupons, and comp services for car club providers.' },
      split_payments_enabled:     { title: 'Split Payments',     desc: 'Let a member invite guests to split a care plan’s charge before payment is authorized.' }
    };

    async function loadFeatureFlags() {
      const list = document.getElementById('feature-flags-list');
      const errBox = document.getElementById('feature-flags-error');
      list.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div>Loading flags…</div>';
      errBox.style.display = 'none';
      try {
        const session = await supabaseClient.auth.getSession();
        if (!session?.data?.session?.access_token) throw new Error('No admin session');
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/admin/feature-flags`, {
          headers: { Authorization: `Bearer ${session.data.session.access_token}` }
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        list.innerHTML = '';
        (data.flags || []).forEach(flag => renderFlagCard(flag));
        if (!data.flags || data.flags.length === 0) {
          list.innerHTML = '<div style="padding:20px;color:var(--text-muted);font-size:0.9rem;">No feature flags found. Paste the SQL block to prod first.</div>';
        }
      } catch (err) {
        list.innerHTML = '';
        errBox.style.display = 'block';
        errBox.textContent = 'Failed to load feature flags: ' + err.message;
      }
    }

    function renderFlagCard(flag) {
      const list = document.getElementById('feature-flags-list');
      const val = flag.setting_value || {};
      const enabled = !!val.enabled;
      const testUsers = Array.isArray(val.test_users) ? val.test_users : [];
      const meta = FLAG_LABELS[flag.setting_key] || { title: flag.setting_key, desc: flag.description || '' };
      const card = document.createElement('div');
      card.className = 'card';
      card.id = `flag-card-${flag.setting_key}`;
      card.innerHTML = `
        <div class="card-header" style="padding-bottom:12px;">
          <div>
            <h2 class="card-title" style="margin-bottom:4px;">${escapeHtml(meta.title)}</h2>
            <div style="font-size:0.85rem;color:var(--text-secondary);">${escapeHtml(meta.desc)}</div>
            <div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;">key: <code>${escapeHtml(flag.setting_key)}</code></div>
          </div>
          <label class="toggle-switch" style="position:relative;display:inline-block;width:52px;height:28px;flex-shrink:0;margin-left:20px;">
            <input type="checkbox" id="toggle-${flag.setting_key}" ${enabled ? 'checked' : ''}
              onchange="toggleFeatureFlag('${flag.setting_key}', this.checked)"
              style="opacity:0;width:0;height:0;">
            <span class="toggle-slider" style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${enabled ? 'var(--accent-green-soft)' : 'var(--accent-red-soft)'};border:2px solid ${enabled ? 'var(--accent-green)' : 'var(--accent-red)'};border-radius:28px;transition:0.3s;"></span>
          </label>
        </div>
        <div style="padding:0 4px;">
          <div style="font-weight:600;font-size:0.88rem;margin-bottom:10px;">
            Status: <span style="color:${enabled ? 'var(--accent-green)' : 'var(--accent-orange)'};">${enabled ? 'Enabled globally' : 'Disabled globally'}</span>
          </div>
          <div style="font-size:0.88rem;font-weight:600;margin-bottom:8px;">Test users (flag on for these users even when globally off):</div>
          <div id="test-users-${flag.setting_key}" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;min-height:32px;">
            ${testUsers.length === 0
              ? '<span style="font-size:0.85rem;color:var(--text-muted);">None</span>'
              : testUsers.map(uid => `
                <span style="display:inline-flex;align-items:center;gap:6px;background:var(--bg-input);border-radius:var(--radius-sm);padding:4px 10px;font-size:0.82rem;font-family:monospace;">
                  ${escapeHtml(uid)}
                  <button onclick="removeFeatureFlagTestUser('${flag.setting_key}','${uid}')"
                    style="background:none;border:none;cursor:pointer;color:var(--accent-red);font-size:1rem;line-height:1;padding:0;" title="Remove">×</button>
                </span>`).join('')}
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <input id="test-user-input-${flag.setting_key}" type="text" placeholder="User UUID to add…"
              style="flex:1;padding:8px 12px;border-radius:var(--radius-sm);border:1px solid var(--border-color);background:var(--bg-input);color:var(--text-primary);font-size:0.85rem;font-family:monospace;"
              onkeydown="if(event.key==='Enter')addFeatureFlagTestUser('${flag.setting_key}')">
            <button class="btn btn-primary" onclick="addFeatureFlagTestUser('${flag.setting_key}')" style="white-space:nowrap;font-size:0.85rem;">Add test user</button>
          </div>
        </div>`;
      list.appendChild(card);
    }

    async function toggleFeatureFlag(key, enabled) {
      try {
        const session = await supabaseClient.auth.getSession();
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/admin/feature-flags/toggle`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.data.session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, enabled })
        });
        if (!res.ok) throw new Error(await res.text());
        showToast((FLAG_LABELS[key]?.title || key) + ' ' + (enabled ? 'enabled' : 'disabled'), 'success');
        // Update the status label without full reload
        const card = document.getElementById(`flag-card-${key}`);
        if (card) {
          const statusSpan = card.querySelector('[style*="Status:"] span');
          if (statusSpan) { statusSpan.textContent = enabled ? 'Enabled globally' : 'Disabled globally'; statusSpan.style.color = enabled ? 'var(--accent-green)' : 'var(--accent-orange)'; }
          const slider = card.querySelector('.toggle-slider');
          if (slider) { slider.style.background = enabled ? 'var(--accent-green-soft)' : 'var(--accent-red-soft)'; slider.style.border = `2px solid ${enabled ? 'var(--accent-green)' : 'var(--accent-red)'}`; }
        }
      } catch (err) {
        showToast('Failed to toggle flag: ' + err.message, 'error');
        const toggle = document.getElementById(`toggle-${key}`);
        if (toggle) toggle.checked = !enabled;
      }
    }

    async function addFeatureFlagTestUser(key) {
      const input = document.getElementById(`test-user-input-${key}`);
      const userId = (input?.value || '').trim();
      if (!userId) return;
      try {
        const session = await supabaseClient.auth.getSession();
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/admin/feature-flags/test-users`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.data.session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, user_id: userId, action: 'add' })
        });
        if (!res.ok) throw new Error(await res.text());
        if (input) input.value = '';
        showToast('Test user added', 'success');
        await loadFeatureFlags();
      } catch (err) {
        showToast('Failed to add test user: ' + err.message, 'error');
      }
    }

    async function removeFeatureFlagTestUser(key, userId) {
      try {
        const session = await supabaseClient.auth.getSession();
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/admin/feature-flags/test-users`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.data.session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, user_id: userId, action: 'remove' })
        });
        if (!res.ok) throw new Error(await res.text());
        showToast('Test user removed', 'success');
        await loadFeatureFlags();
      } catch (err) {
        showToast('Failed to remove test user: ' + err.message, 'error');
      }
    }

    // ── End Feature Flags ─────────────────────────────────────────────────────

    async function sendBulkWelcomeEmails() {
      const btn = document.getElementById('send-welcome-emails-btn');
      const statusMsg = document.getElementById('welcome-email-status');
      
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Sending...';
      
      try {
        const session = await supabaseClient.auth.getSession();
        if (!session?.data?.session?.access_token) {
          showToast('Authentication required', 'error');
          btn.disabled = false;
          btn.textContent = originalText;
          return;
        }
        
        statusMsg.style.display = 'block';
        statusMsg.style.background = 'var(--bg-input)';
        statusMsg.style.color = 'var(--text-secondary)';
        statusMsg.textContent = 'Sending welcome emails... This may take a few minutes.';
        
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/send-bulk-welcome-emails`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.data.session.access_token}`,
            'Content-Type': 'application/json'
          }
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
          showToast(`Welcome emails sent! ${data.sent} sent, ${data.skipped} skipped, ${data.errors} errors`, 'success');
          statusMsg.style.background = 'var(--accent-green-soft)';
          statusMsg.style.color = 'var(--accent-green)';
          statusMsg.textContent = `Complete! ${data.sent} emails sent, ${data.skipped} already sent/skipped, ${data.errors} errors. Total accounts: ${data.total}`;
        } else {
          showToast(data.error || 'Failed to send welcome emails', 'error');
          statusMsg.style.background = 'var(--accent-red-soft)';
          statusMsg.style.color = 'var(--accent-red)';
          statusMsg.textContent = data.error || 'Failed to send welcome emails';
        }
      } catch (err) {
        console.error('Failed to send bulk welcome emails:', err);
        showToast('Failed to send welcome emails', 'error');
        statusMsg.style.display = 'block';
        statusMsg.style.background = 'var(--accent-red-soft)';
        statusMsg.style.color = 'var(--accent-red)';
        statusMsg.textContent = 'Error: ' + err.message;
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }

