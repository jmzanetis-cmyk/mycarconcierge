    // ========== COMMISSION PAYOUTS ==========
    let founderProfiles = [];
    let founderPayouts = [];
    let currentPayoutTab = 'founders';

    async function loadFounderPayouts() {
      try {
        const { data: profiles, error: profilesError } = await supabaseClient
          .from('member_founder_profiles')
          .select('*')
          .order('created_at', { ascending: false });

        if (profilesError) {
          console.error('Error loading founder profiles:', profilesError);
          founderProfiles = [];
        } else {
          founderProfiles = profiles || [];
        }

        const { data: payouts, error: payoutsError } = await supabaseClient
          .from('founder_payouts')
          .select('*, founder:founder_id(full_name, email, referral_code)')
          .order('created_at', { ascending: false });

        if (payoutsError) {
          console.error('Error loading founder payouts:', payoutsError);
          founderPayouts = [];
        } else {
          founderPayouts = payouts || [];
        }

        updatePayoutStats();
        renderPayoutContent();
      } catch (err) {
        console.error('loadFounderPayouts error:', err);
      }
    }

    const PAYOUT_THRESHOLD = 10;

    function updatePayoutStats() {
      const activeFounders = founderProfiles.filter(f => f.status === 'active').length;
      const totalReferrals = founderProfiles.reduce((sum, f) => sum + (f.total_provider_referrals || 0), 0);
      const pendingBalance = founderProfiles.reduce((sum, f) => sum + Number.parseFloat(f.pending_balance || 0), 0);
      const totalPaid = founderProfiles.reduce((sum, f) => sum + Number.parseFloat(f.total_commissions_paid || 0), 0);
      
      const eligibleFounders = founderProfiles.filter(f => 
        f.status === 'active' && 
        Number.parseFloat(f.pending_balance || 0) >= PAYOUT_THRESHOLD &&
        f.stripe_connect_account_id
      );
      const eligibleCount = eligibleFounders.length;
      const eligibleTotal = eligibleFounders.reduce((sum, f) => sum + Number.parseFloat(f.pending_balance || 0), 0);
      const pendingPayoutsCount = eligibleCount;

      document.getElementById('total-founders').textContent = activeFounders;
      document.getElementById('total-referrals').textContent = totalReferrals;
      document.getElementById('pending-commissions').textContent = '$' + pendingBalance.toFixed(2);
      document.getElementById('total-paid').textContent = '$' + totalPaid.toFixed(2);
      document.getElementById('payout-count').textContent = pendingPayoutsCount;
      document.getElementById('payout-count').style.display = pendingPayoutsCount > 0 ? 'inline' : 'none';
      
      const bulkBar = document.getElementById('bulk-payout-bar');
      if (bulkBar) {
        if (eligibleCount > 0) {
          bulkBar.style.display = 'block';
          document.getElementById('eligible-founders-count').textContent = eligibleCount;
          document.getElementById('eligible-total-amount').textContent = '$' + eligibleTotal.toFixed(2);
        } else {
          bulkBar.style.display = 'none';
        }
      }
    }

    function renderPayoutContent() {
      const tbody = document.getElementById('payout-table-body');
      const header = document.getElementById('payout-table-header');

      if (currentPayoutTab === 'founders') {
        header.innerHTML = `
          <th>Founder</th>
          <th>Referral Code</th>
          <th>Commission Rate</th>
          <th>Provider Referrals</th>
          <th>Pending Balance</th>
          <th>Total Earned</th>
          <th>Stripe Connect</th>
          <th>Status</th>
          <th>Action</th>
        `;

        if (!founderProfiles.length) {
          tbody.innerHTML = `<tr><td colspan="9" class="empty-state">No member founders yet</td></tr>`;
          return;
        }

        tbody.innerHTML = founderProfiles.map(f => {
          const hasStripeConnect = f.stripe_connect_account_id && f.payout_details?.transfers_enabled;
          const stripePending = f.stripe_connect_account_id && !f.payout_details?.transfers_enabled;
          const stripeStatus = hasStripeConnect ? 
            '<span class="status-badge approved" title="Ready for payouts">' + mccIcon('credit-card', 16) + ' Connected</span>' : 
            stripePending ? 
            '<span class="status-badge orange" title="Onboarding incomplete">' + mccIcon('clock', 16) + ' Pending</span>' : 
            '<span class="status-badge" style="background:var(--bg-input);color:var(--text-muted);">Not Setup</span>';
          const commissionRate = Number.parseFloat(f.commission_rate || 0.50) * 100;
          const pendingBal = Number.parseFloat(f.pending_balance || 0);
          const isEligible = f.status === 'active' && pendingBal >= PAYOUT_THRESHOLD && f.stripe_connect_account_id;
          const eligibilityBadge = isEligible ? 
            '<span class="status-badge approved" style="margin-left:6px;font-size:0.7rem;" title="Ready for bulk payout">' + mccIcon('check', 16) + ' Eligible</span>' : 
            (pendingBal >= PAYOUT_THRESHOLD && !f.stripe_connect_account_id) ?
            '<span class="status-badge orange" style="margin-left:6px;font-size:0.7rem;" title="Needs Stripe Connect setup">' + mccIcon('alert-triangle', 16) + ' No Stripe</span>' : '';
          return `
          <tr${isEligible ? ' style="background:var(--accent-green-soft);"' : ''}>
            <td>
              <div><strong>${f.full_name}</strong>${eligibilityBadge}</div>
              <div style="font-size:0.8rem;color:var(--text-muted);">${f.email}</div>
            </td>
            <td><code style="background:var(--accent-gold-soft);color:var(--accent-gold);padding:4px 8px;border-radius:4px;font-weight:600;">${f.referral_code}</code></td>
            <td>
              <span style="font-weight:600;color:var(--accent-gold);">${commissionRate.toFixed(0)}%</span>
              <button class="btn btn-sm" style="margin-left:6px;padding:2px 8px;font-size:0.75rem;" onclick="editFounderCommission('${f.id}', '${f.full_name}', ${commissionRate})">Edit</button>
            </td>
            <td>${f.total_provider_referrals || 0}</td>
            <td style="font-weight:600;color:${pendingBal >= PAYOUT_THRESHOLD ? 'var(--accent-green)' : 'var(--text-primary)'};">$${pendingBal.toFixed(2)}${pendingBal >= PAYOUT_THRESHOLD ? ' ' + mccIcon('check', 16) : ''}</td>
            <td>$${Number.parseFloat(f.total_commissions_earned || 0).toFixed(2)}</td>
            <td>${stripeStatus}</td>
            <td><span class="status-badge ${f.status === 'active' ? 'approved' : f.status}">${f.status}</span></td>
            <td>
              <div style="display:flex;gap:4px;flex-wrap:wrap;">
                <button class="btn btn-secondary btn-sm" onclick="viewFounderDetails('${f.id}')">View</button>
                ${pendingBal >= PAYOUT_THRESHOLD ? `<button class="btn btn-success btn-sm" onclick="createPayout('${f.id}')">Pay</button>` : ''}
              </div>
            </td>
          </tr>
        `}).join('');
      } else if (currentPayoutTab === 'pending-payouts') {
        header.innerHTML = `
          <th>Founder</th>
          <th>Period</th>
          <th>Amount</th>
          <th>Method</th>
          <th>Type</th>
          <th>Created</th>
          <th>Status</th>
          <th>Action</th>
        `;

        const pendingPayouts = founderPayouts.filter(p => p.status === 'pending' || p.status === 'processing');
        
        if (!pendingPayouts.length) {
          tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No pending payouts</td></tr>`;
          return;
        }

        tbody.innerHTML = pendingPayouts.map(p => `
          <tr>
            <td>
              <div><strong>${p.founder?.full_name || 'Unknown'}</strong></div>
              <div style="font-size:0.8rem;color:var(--text-muted);">${p.founder?.email || ''}</div>
            </td>
            <td>${p.payout_period}</td>
            <td style="font-weight:600;color:var(--accent-green);">$${Number.parseFloat(p.amount).toFixed(2)}</td>
            <td>${p.payout_method}</td>
            <td>
              <select id="payout-type-${p.id}" style="padding:4px 8px;border-radius:4px;border:1px solid var(--border-subtle);background:var(--bg-input);color:var(--text-primary);font-size:0.85rem;">
                <option value="weekly" selected>${mccIcon('calendar', 16)} Weekly (FREE)</option>
                <option value="instant">${mccIcon('zap', 16)} Instant (1% fee)</option>
              </select>
            </td>
            <td>${new Date(p.created_at).toLocaleDateString()}</td>
            <td><span class="status-badge ${p.status === 'processing' ? 'blue' : 'orange'}">${p.status}</span></td>
            <td>
              <div style="display:flex;gap:4px;flex-wrap:wrap;">
                ${p.payout_method === 'stripe_connect' ? `<button class="btn btn-primary btn-sm" onclick="processStripePayout('${p.id}')">${mccIcon('credit-card', 16)} Process</button>` : `<button class="btn btn-success btn-sm" onclick="completePayout('${p.id}')">Mark Complete</button>`}
                <button class="btn btn-danger btn-sm" onclick="cancelPayout('${p.id}')">Cancel</button>
              </div>
            </td>
          </tr>
        `).join('');
      } else if (currentPayoutTab === 'completed-payouts') {
        header.innerHTML = `
          <th>Founder</th>
          <th>Period</th>
          <th>Gross</th>
          <th>Fee</th>
          <th>Net</th>
          <th>Type</th>
          <th>Paid On</th>
          <th>Status</th>
        `;

        const completedPayouts = founderPayouts.filter(p => p.status === 'completed');
        
        if (!completedPayouts.length) {
          tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No completed payouts yet</td></tr>`;
          return;
        }

        tbody.innerHTML = completedPayouts.map(p => {
          const grossAmount = Number.parseFloat(p.amount || 0);
          const feeAmount = Number.parseFloat(p.fee_amount || 0);
          const netAmount = Number.parseFloat(p.net_amount || grossAmount);
          const payoutType = p.payout_type || 'instant';
          
          return `
            <tr>
              <td>
                <div><strong>${p.founder?.full_name || 'Unknown'}</strong></div>
                <div style="font-size:0.8rem;color:var(--text-muted);">${p.founder?.email || ''}</div>
              </td>
              <td>${p.payout_period}</td>
              <td>$${grossAmount.toFixed(2)}</td>
              <td style="color:${feeAmount > 0 ? 'var(--accent-orange)' : 'var(--accent-green)'};">${feeAmount > 0 ? '-$' + feeAmount.toFixed(2) : 'FREE'}</td>
              <td style="font-weight:600;color:var(--accent-green);">$${netAmount.toFixed(2)}</td>
              <td><span class="status-badge ${payoutType === 'weekly' ? 'blue' : 'orange'}">${payoutType === 'weekly' ? mccIcon('calendar', 16) + ' Weekly' : mccIcon('zap', 16) + ' Instant'}</span></td>
              <td>${p.processed_at ? new Date(p.processed_at).toLocaleDateString() : 'N/A'}</td>
              <td><span class="status-badge approved">completed</span></td>
            </tr>
          `;
        }).join('');
      }
    }

    // Founder Commission Rate Management
    async function editFounderCommission(founderId, founderName, currentRate) {
      document.getElementById('commission-founder-id').value = founderId;
      document.getElementById('commission-founder-name').textContent = founderName;
      document.getElementById('commission-rate-input').value = Math.round(currentRate);
      document.getElementById('founder-commission-modal').style.display = 'flex';
      
      const historyContainer = document.getElementById('commission-history-container');
      historyContainer.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">Loading history...</p>';
      
      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/founders/${founderId}/commission-history`, {
          headers: {
            'Authorization': `Bearer ${(await supabaseClient.auth.getSession()).data.session?.access_token}`
          }
        });
        
        if (!response.ok) throw new Error('Failed to fetch history');
        
        const { history } = await response.json();
        
        if (!history || history.length === 0) {
          historyContainer.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No rate changes recorded yet.</p>';
        } else {
          historyContainer.innerHTML = `
            <p style="font-weight:600;margin-bottom:8px;font-size:0.85rem;color:var(--text-secondary);">Recent Changes</p>
            ${history.map(h => {
              const date = new Date(h.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              return `<p style="color:var(--text-muted);font-size:0.8rem;margin-bottom:4px;">Changed from ${Math.round(h.old_rate * 100)}% to ${Math.round(h.new_rate * 100)}% by ${escapeHtml(h.admin_email)} on ${date}</p>`;
            }).join('')}
          `;
        }
      } catch (err) {
        console.error('Error loading commission history:', err);
        historyContainer.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">Could not load history.</p>';
      }
    }

    function closeCommissionModal() {
      document.getElementById('founder-commission-modal').style.display = 'none';
    }

    async function saveFounderCommission() {
      const founderId = document.getElementById('commission-founder-id').value;
      const ratePercent = Number.parseInt(document.getElementById('commission-rate-input').value);
      
      if (isNaN(ratePercent) || ratePercent < 0 || ratePercent > 100) {
        showToast('Please enter a valid rate between 0 and 100', 'error');
        return;
      }

      const commissionRate = ratePercent / 100; // Convert to decimal (e.g., 50% -> 0.50)
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      
      try {
        const response = await fetch(`${apiBase}/api/admin/founders/${founderId}/commission`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabaseClient.auth.getSession()).data.session?.access_token}`
          },
          body: JSON.stringify({ commission_rate: commissionRate })
        });

        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(result.error || 'Failed to update commission rate');
        }

        showToast(`Commission rate updated to ${ratePercent}%`, 'success');
        closeCommissionModal();
        await loadFounderPayouts();
      } catch (err) {
        console.error('Error updating commission rate:', err);
        showToast(err.message || 'Failed to update commission rate', 'error');
      }
    }

    async function viewFounderDetails(founderId) {
      const founder = founderProfiles.find(f => f.id === founderId);
      if (!founder) return;

      const { data: referrals } = await supabaseClient
        .from('founder_referrals')
        .select('*, provider:provider_profile_id(full_name, business_name, email)')
        .eq('founder_id', founderId)
        .order('created_at', { ascending: false });

      const { data: commissions } = await supabaseClient
        .from('founder_commissions')
        .select('*')
        .eq('founder_id', founderId)
        .order('created_at', { ascending: false })
        .limit(20);

      const modalContent = `
        <div class="form-section">
          <div class="form-section-title">${mccIcon('user', 24)} Founder Information</div>
          <div class="detail-grid">
            <span class="detail-label">Name:</span><span class="detail-value">${founder.full_name}</span>
            <span class="detail-label">Email:</span><span class="detail-value">${founder.email}</span>
            <span class="detail-label">Referral Code:</span><span class="detail-value"><code style="background:var(--accent-gold-soft);color:var(--accent-gold);padding:4px 8px;border-radius:4px;font-weight:600;">${founder.referral_code}</code></span>
            <span class="detail-label">Status:</span><span class="detail-value"><span class="status-badge ${founder.status === 'active' ? 'approved' : founder.status}">${founder.status}</span></span>
            <span class="detail-label">Joined:</span><span class="detail-value">${new Date(founder.created_at).toLocaleDateString()}</span>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">${mccIcon('dollar-sign', 24)} Commission Summary</div>
          <div class="stats-grid" style="margin-bottom:0;">
            <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);text-align:center;">
              <div style="font-size:1.4rem;font-weight:600;color:var(--accent-gold);">${founder.total_provider_referrals || 0}</div>
              <div style="font-size:0.8rem;color:var(--text-muted);">Provider Referrals</div>
            </div>
            <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);text-align:center;">
              <div style="font-size:1.4rem;font-weight:600;color:var(--accent-green);">$${Number.parseFloat(founder.pending_balance || 0).toFixed(2)}</div>
              <div style="font-size:0.8rem;color:var(--text-muted);">Pending Balance</div>
            </div>
            <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);text-align:center;">
              <div style="font-size:1.4rem;font-weight:600;">$${Number.parseFloat(founder.total_commissions_earned || 0).toFixed(2)}</div>
              <div style="font-size:0.8rem;color:var(--text-muted);">Total Earned</div>
            </div>
            <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);text-align:center;">
              <div style="font-size:1.4rem;font-weight:600;">$${Number.parseFloat(founder.total_commissions_paid || 0).toFixed(2)}</div>
              <div style="font-size:0.8rem;color:var(--text-muted);">Total Paid</div>
            </div>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">${mccIcon('link', 24)} Provider Referrals (${referrals?.length || 0})</div>
          ${referrals?.length ? `
            <div style="display:flex;flex-direction:column;gap:8px;max-height:200px;overflow-y:auto;">
              ${referrals.map(r => `
                <div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg-input);padding:12px;border-radius:var(--radius-md);">
                  <div>
                    <strong>${r.provider?.business_name || r.provider?.full_name || 'Unknown'}</strong>
                    <div style="font-size:0.8rem;color:var(--text-muted);">${r.provider?.email || ''}</div>
                  </div>
                  <span class="status-badge ${r.status}">${r.status}</span>
                </div>
              `).join('')}
            </div>
          ` : '<p style="color:var(--text-muted);">No provider referrals yet</p>'}
        </div>

        <div class="form-section" style="border-bottom:none;">
          <div class="form-section-title">${mccIcon('clipboard-list', 24)} Recent Commissions (${commissions?.length || 0})</div>
          ${commissions?.length ? `
            <div style="display:flex;flex-direction:column;gap:8px;max-height:200px;overflow-y:auto;">
              ${commissions.map(c => `
                <div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg-input);padding:12px;border-radius:var(--radius-md);">
                  <div>
                    <strong>$${Number.parseFloat(c.commission_amount).toFixed(2)}</strong>
                    <span style="font-size:0.8rem;color:var(--text-muted);">(${c.commission_type === 'bid_pack' ? mccIcon('package', 16) + ' Bid Pack' : mccIcon('credit-card', 16) + ' Platform Fee'})</span>
                    <div style="font-size:0.8rem;color:var(--text-muted);">${new Date(c.created_at).toLocaleDateString()}</div>
                  </div>
                  <span class="status-badge ${c.status}">${c.status}</span>
                </div>
              `).join('')}
            </div>
          ` : '<p style="color:var(--text-muted);">No commissions recorded yet</p>'}
        </div>

        <div class="form-section" style="border-bottom:none;">
          <div class="form-section-title">${mccIcon('credit-card', 24)} Payout Settings</div>
          <div class="detail-grid">
            <span class="detail-label">Method:</span><span class="detail-value">${founder.payout_method || 'Not set'}</span>
            <span class="detail-label">Email:</span><span class="detail-value">${founder.payout_email || 'Not set'}</span>
          </div>
        </div>
      `;

      document.getElementById('application-modal-body').innerHTML = modalContent;
      document.querySelector('#application-modal .modal-footer').innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal('application-modal')">Close</button>
        ${Number.parseFloat(founder.pending_balance || 0) >= 25 ? `<button class="btn btn-success" onclick="createPayout('${founder.id}'); closeModal('application-modal');">Create Payout</button>` : ''}
      `;
      openModal('application-modal');
    }

    async function createPayout(founderId) {
      const founder = founderProfiles.find(f => f.id === founderId);
      if (!founder) return;

      const amount = Number.parseFloat(founder.pending_balance || 0);
      if (amount < 25) {
        showToast('Minimum payout amount is $25', 'error');
        return;
      }

      const currentMonth = new Date().toISOString().slice(0, 7);
      
      const hasStripeConnect = founder.stripe_connect_account_id && founder.payout_details?.transfers_enabled;
      const payoutMethod = hasStripeConnect ? 'stripe_connect' : (founder.payout_method || 'paypal');
      const methodDisplay = hasStripeConnect ? 'Stripe Connect (automatic transfer)' : (founder.payout_method || 'Not set');
      
      if (!confirm(`Create payout of $${amount.toFixed(2)} for ${founder.full_name}?\n\nPayout method: ${methodDisplay}`)) return;

      try {
        const { error: payoutError } = await supabaseClient
          .from('founder_payouts')
          .insert({
            founder_id: founderId,
            payout_period: currentMonth,
            amount: amount,
            payout_method: payoutMethod,
            payout_details: hasStripeConnect ? { stripe_account_id: founder.stripe_connect_account_id } : { email: founder.payout_email },
            status: 'pending'
          });

        if (payoutError) {
          showToast('Failed to create payout: ' + payoutError.message, 'error');
          return;
        }

        const { error: updateError } = await supabaseClient
          .from('member_founder_profiles')
          .update({ pending_balance: 0, updated_at: new Date().toISOString() })
          .eq('id', founderId);

        if (updateError) {
          console.error('Failed to reset pending balance:', updateError);
        }

        showToast(`Payout of $${amount.toFixed(2)} created for ${founder.full_name}`, 'success');
        await loadFounderPayouts();
      } catch (err) {
        console.error('createPayout error:', err);
        showToast('Error creating payout', 'error');
      }
    }

    async function completePayout(payoutId) {
      const notes = prompt('Add payment notes (transaction ID, etc):');
      if (notes === null) return;

      try {
        const { error } = await supabaseClient
          .from('founder_payouts')
          .update({
            status: 'completed',
            processed_at: new Date().toISOString(),
            processed_by: currentUser.id,
            notes: notes
          })
          .eq('id', payoutId);

        if (error) {
          showToast('Failed to complete payout', 'error');
          return;
        }

        const payout = founderPayouts.find(p => p.id === payoutId);
        if (payout) {
          const { error: incrementError } = await supabaseClient.rpc('increment_founder_commissions_paid', {
            p_founder_id: payout.founder_id,
            p_amount: payout.amount
          });
          if (incrementError) {
            console.error('increment_founder_commissions_paid failed:', incrementError);
            showToast('Payout marked completed, but the founder total failed to update — check manually', 'error');
          }
        }

        showToast('Payout marked as completed', 'success');
        await loadFounderPayouts();
      } catch (err) {
        console.error('completePayout error:', err);
        showToast('Error completing payout', 'error');
      }
    }

    async function cancelPayout(payoutId) {
      if (!confirm('Cancel this payout? The pending balance will be restored to the founder.')) return;

      try {
        const payout = founderPayouts.find(p => p.id === payoutId);
        
        const { error } = await supabaseClient
          .from('founder_payouts')
          .update({ status: 'failed', notes: 'Cancelled by admin' })
          .eq('id', payoutId);

        if (error) {
          showToast('Failed to cancel payout', 'error');
          return;
        }

        if (payout) {
          const founder = founderProfiles.find(f => f.id === payout.founder_id);
          if (founder) {
            await supabaseClient
              .from('member_founder_profiles')
              .update({
                pending_balance: Number.parseFloat(founder.pending_balance || 0) + Number.parseFloat(payout.amount),
                updated_at: new Date().toISOString()
              })
              .eq('id', payout.founder_id);
          }
        }

        showToast('Payout cancelled', 'success');
        await loadFounderPayouts();
      } catch (err) {
        console.error('cancelPayout error:', err);
        showToast('Error cancelling payout', 'error');
      }
    }

    async function processStripePayout(payoutId) {
      const payout = founderPayouts.find(p => p.id === payoutId);
      if (!payout) {
        showToast('Payout not found', 'error');
        return;
      }

      const payoutTypeSelect = document.getElementById(`payout-type-${payoutId}`);
      const payoutType = payoutTypeSelect?.value || 'weekly';
      const feeText = payoutType === 'instant' ? ' (1% fee will be deducted)' : ' (no fee)';

      if (!confirm(`Process Stripe transfer of $${Number.parseFloat(payout.amount).toFixed(2)} to ${payout.founder?.full_name || 'founder'}?${feeText}\n\nThis will initiate a real payment.`)) {
        return;
      }

      const adminPassword = prompt('Enter admin password to authorize payout:');
      if (!adminPassword) return;

      try {
        showToast('Processing Stripe transfer...', 'info');
        
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/process-founder-payout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payout_id: payoutId,
            admin_password: adminPassword,
            payout_type: payoutType
          })
        });

        const result = await response.json();
        
        if (!response.ok) {
          showToast(result.error || 'Failed to process payout', 'error');
          return;
        }

        showToast(`Stripe transfer successful! Transfer ID: ${result.transfer_id}`, 'success');
        await loadFounderPayouts();
      } catch (err) {
        console.error('processStripePayout error:', err);
        showToast('Error processing Stripe payout', 'error');
      }
    }

    async function processBulkPayouts() {
      const eligibleFounders = founderProfiles.filter(f => 
        f.status === 'active' && 
        Number.parseFloat(f.pending_balance || 0) >= PAYOUT_THRESHOLD &&
        f.stripe_connect_account_id
      );
      
      if (eligibleFounders.length === 0) {
        showToast('No eligible founders for payout', 'info');
        return;
      }

      const totalAmount = eligibleFounders.reduce((sum, f) => sum + Number.parseFloat(f.pending_balance || 0), 0);
      
      const payoutType = await new Promise(resolve => {
        const choice = confirm(
          `Process bulk payouts for ${eligibleFounders.length} founder${eligibleFounders.length > 1 ? 's' : ''}?\n\n` +
          `Total amount: $${totalAmount.toFixed(2)}\n\n` +
          `Click OK for WEEKLY payout (FREE, no fees)\n` +
          `Click Cancel to abort, then use individual payouts for instant transfers.`
        );
        resolve(choice ? 'weekly' : null);
      });
      
      if (!payoutType) return;

      const adminPassword = prompt('Enter admin password to authorize bulk payout:');
      if (!adminPassword) return;

      const btn = document.getElementById('bulk-payout-btn');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = mccIcon('clock', 16) + ' Processing...';
      }

      try {
        showToast(`Processing ${eligibleFounders.length} payouts...`, 'info');
        
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/process-bulk-payouts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            admin_password: adminPassword,
            threshold: PAYOUT_THRESHOLD,
            payout_type: payoutType
          })
        });

        const result = await response.json();
        
        if (!response.ok) {
          showToast(result.error || 'Failed to process bulk payouts', 'error');
          return;
        }

        const { summary } = result;
        
        if (summary.succeeded > 0 && summary.failed === 0) {
          showToast(`${mccIcon('check-circle', 16)} All ${summary.succeeded} payouts processed successfully! Total: $${summary.total_amount.toFixed(2)}`, 'success');
        } else if (summary.succeeded > 0 && summary.failed > 0) {
          showToast(`${mccIcon('alert-triangle', 16)} ${summary.succeeded} succeeded, ${summary.failed} failed. Check details below.`, 'warning');
        } else if (summary.failed > 0) {
          showToast(`${mccIcon('x', 16)} All ${summary.failed} payouts failed. Check details below.`, 'error');
        } else {
          showToast('No payouts were processed.', 'info');
        }

        if (result.results && result.results.length > 0) {
          showBulkPayoutResults(result.results);
        }

        await loadFounderPayouts();
      } catch (err) {
        console.error('processBulkPayouts error:', err);
        showToast('Error processing bulk payouts', 'error');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = mccIcon('credit-card', 16) + ' Process All Pending Payouts';
        }
      }
    }

    function showBulkPayoutResults(results) {
      const succeeded = results.filter(r => r.status === 'success');
      const failed = results.filter(r => r.status === 'failed');
      
      let message = `<div style="max-height:400px;overflow-y:auto;">`;
      
      if (succeeded.length > 0) {
        message += `<h4 style="color:var(--accent-green);margin-bottom:8px;">${mccIcon('check-circle', 16)} Succeeded (${succeeded.length})</h4>`;
        message += `<table style="width:100%;font-size:0.85rem;margin-bottom:16px;">`;
        message += `<tr style="background:var(--bg-elevated);"><th style="padding:6px;text-align:left;">Founder</th><th style="padding:6px;text-align:right;">Amount</th><th style="padding:6px;text-align:left;">Transfer ID</th></tr>`;
        succeeded.forEach(r => {
          message += `<tr><td style="padding:6px;">${escapeHtml(r.founder_name)}</td><td style="padding:6px;text-align:right;">$${r.amount.toFixed(2)}</td><td style="padding:6px;font-family:monospace;font-size:0.75rem;">${r.stripe_transfer_id || '-'}</td></tr>`;
        });
        message += `</table>`;
      }
      
      if (failed.length > 0) {
        message += `<h4 style="color:var(--accent-red);margin-bottom:8px;">${mccIcon('x', 16)} Failed (${failed.length})</h4>`;
        message += `<table style="width:100%;font-size:0.85rem;">`;
        message += `<tr style="background:var(--bg-elevated);"><th style="padding:6px;text-align:left;">Founder</th><th style="padding:6px;text-align:right;">Amount</th><th style="padding:6px;text-align:left;">Error</th></tr>`;
        failed.forEach(r => {
          message += `<tr><td style="padding:6px;">${escapeHtml(r.founder_name)}</td><td style="padding:6px;text-align:right;">$${r.amount.toFixed(2)}</td><td style="padding:6px;color:var(--accent-red);">${escapeHtml(r.error || 'Unknown error')}</td></tr>`;
        });
        message += `</table>`;
      }
      
      message += `</div>`;
      
      showModal('Bulk Payout Results', message, [
        { text: 'Close', className: 'btn btn-secondary', onclick: 'closeModal()' }
      ]);
    }

    document.getElementById('payout-tabs')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab')) {
        document.querySelectorAll('#payout-tabs .tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        currentPayoutTab = e.target.dataset.filter;
        
        const payoutContent = document.getElementById('payout-content');
        const settingsContent = document.getElementById('payout-settings-content');
        const milestonesContent = document.getElementById('milestones-content');
        const bonusReserveContent = document.getElementById('bonus-reserve-content');
        
        payoutContent.style.display = 'none';
        settingsContent.style.display = 'none';
        if (milestonesContent) milestonesContent.style.display = 'none';
        if (bonusReserveContent) bonusReserveContent.style.display = 'none';
        
        if (currentPayoutTab === 'payout-settings') {
          settingsContent.style.display = 'block';
          loadPayoutSettings();
        } else if (currentPayoutTab === 'milestones') {
          if (milestonesContent) milestonesContent.style.display = 'block';
          loadMilestonesData();
        } else if (currentPayoutTab === 'bonus-reserve') {
          if (bonusReserveContent) bonusReserveContent.style.display = 'block';
          loadBonusReserveData();
        } else {
          payoutContent.style.display = 'block';
          renderPayoutContent();
        }
      }
    });

    let payoutSettings = null;

    async function loadPayoutSettings() {
      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/payout-settings`, {
          headers: {
            'Authorization': `Bearer ${(await supabaseClient.auth.getSession()).data.session?.access_token}`
          }
        });
        
        if (!response.ok) throw new Error('Failed to fetch settings');
        
        const data = await response.json();
        payoutSettings = data.settings;
        
        document.getElementById('setting-min-payout-threshold').value = payoutSettings.min_payout_threshold || 10.00;
        document.getElementById('setting-instant-fee-percent').value = payoutSettings.instant_payout_fee_percent || 1.00;
        document.getElementById('setting-instant-fee-min').value = payoutSettings.instant_payout_fee_min || 0.50;
        document.getElementById('setting-instant-fee-max').value = payoutSettings.instant_payout_fee_max || 10.00;
        document.getElementById('setting-weekly-fee').value = payoutSettings.weekly_payout_fee || 0.00;
      } catch (err) {
        console.error('Error loading payout settings:', err);
        showToast('Failed to load payout settings', 'error');
      }
    }

    async function savePayoutSettings() {
      const settings = {
        min_payout_threshold: Number.parseFloat(document.getElementById('setting-min-payout-threshold').value) || 10.00,
        instant_payout_fee_percent: Number.parseFloat(document.getElementById('setting-instant-fee-percent').value) || 1.00,
        instant_payout_fee_min: Number.parseFloat(document.getElementById('setting-instant-fee-min').value) || 0.50,
        instant_payout_fee_max: Number.parseFloat(document.getElementById('setting-instant-fee-max').value) || 10.00,
        weekly_payout_fee: Number.parseFloat(document.getElementById('setting-weekly-fee').value) || 0.00
      };

      if (settings.min_payout_threshold < 1) {
        showToast('Minimum payout threshold must be at least $1', 'error');
        return;
      }

      if (settings.instant_payout_fee_percent < 0 || settings.instant_payout_fee_percent > 10) {
        showToast('Instant fee percentage must be between 0% and 10%', 'error');
        return;
      }

      if (settings.instant_payout_fee_min < 0 || settings.instant_payout_fee_max < 0) {
        showToast('Fee amounts cannot be negative', 'error');
        return;
      }

      if (settings.instant_payout_fee_min > settings.instant_payout_fee_max) {
        showToast('Minimum fee cannot be greater than maximum fee', 'error');
        return;
      }

      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/payout-settings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabaseClient.auth.getSession()).data.session?.access_token}`
          },
          body: JSON.stringify({
            settings
            // NB: previously sent `admin_password: currentAdminPassword` here,
            // but (a) `currentAdminPassword` was never declared anywhere,
            // ReferenceError-crashing every payout-settings save, and (b) the
            // server-side POST /api/admin/payout-settings handler at
            // netlify/functions/admin-founders.js:337-361 doesn't read the
            // field either — it authenticates on the Bearer JWT +
            // profiles.role='admin' check only. Field removed as dead weight;
            // a real password re-auth would need both a client capture UI and
            // matching server validation, which don't exist today.
          })
        });

        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(result.error || 'Failed to save settings');
        }

        payoutSettings = settings;
        showToast('Payout settings saved successfully', 'success');
      } catch (err) {
        console.error('Error saving payout settings:', err);
        showToast(err.message || 'Failed to save payout settings', 'error');
      }
    }

    // ========== MILESTONES AND BONUS RESERVE ==========
    let milestonesData = null;
    let bonusReserveData = null;

    async function loadMilestonesData() {
      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/milestones`, {
          headers: {
            'Authorization': `Bearer ${(await supabaseClient.auth.getSession()).data.session?.access_token}`
          }
        });
        
        if (!response.ok) throw new Error('Failed to fetch milestones');
        
        milestonesData = await response.json();
        renderMilestonesContent();
      } catch (err) {
        console.error('Error loading milestones:', err);
        showToast('Failed to load milestones data', 'error');
      }
    }

    function renderMilestonesContent() {
      if (!milestonesData) return;
      
      const revenue = milestonesData.cumulative_mcc_revenue || 0;
      const milestones = milestonesData.milestones || [];
      const achievedCount = milestones.filter(m => m.is_achieved).length;
      const pendingCount = milestones.filter(m => !m.is_achieved).length;
      
      document.getElementById('total-platform-revenue').textContent = '$' + revenue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
      document.getElementById('achieved-milestones-count').textContent = achievedCount;
      document.getElementById('pending-milestones-count').textContent = pendingCount;
      document.getElementById('anniversary-countdown').textContent = milestonesData.days_until_anniversary || '-';
      
      const nextMilestone = milestonesData.next_milestone;
      const progressPercent = milestonesData.progress_percent || 0;
      
      if (nextMilestone) {
        const remaining = nextMilestone.threshold_amount - revenue;
        document.getElementById('next-milestone-info').innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <strong style="color:var(--accent-gold);">$${nextMilestone.threshold_amount.toLocaleString()}</strong>
              <span style="color:var(--text-secondary);"> - ${nextMilestone.description}</span>
            </div>
            <div style="font-weight:600;">
              <span style="color:var(--accent-green);">$${remaining.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
              <span style="color:var(--text-muted);"> remaining</span>
            </div>
          </div>
        `;
      } else {
        document.getElementById('next-milestone-info').innerHTML = `
          <span style="color:var(--accent-green);font-weight:600;">${mccIcon('party-popper', 16)} All milestones achieved!</span>
        `;
      }
      
      document.getElementById('milestone-progress-bar').style.width = progressPercent + '%';
      document.getElementById('milestone-progress-text').textContent = progressPercent.toFixed(1) + '%';
      
      const partners = milestonesData.founding_partners || [];
      const chrisPartner = partners.find(p => p.partner_name?.toLowerCase().includes('chris agrapidis'));
      
      if (chrisPartner) {
        const achievedBonuses = milestones.filter(m => m.is_achieved && m.is_paid);
        const pendingBonuses = milestones.filter(m => m.is_achieved && !m.is_paid);
        const achievedTotal = achievedBonuses.reduce((sum, m) => sum + Number.parseFloat(m.bonus_amount || 0), 0);
        const pendingTotal = pendingBonuses.reduce((sum, m) => sum + Number.parseFloat(m.bonus_amount || 0), 0);
        
        document.getElementById('founding-partner-info').innerHTML = `
          <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:16px;">
            <div style="padding:16px;background:var(--bg-input);border-radius:8px;">
              <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:4px;">Partner Name</div>
              <div style="font-weight:600;color:var(--text-primary);">${chrisPartner.partner_name}</div>
            </div>
            <div style="padding:16px;background:var(--bg-input);border-radius:8px;">
              <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:4px;">Commission Rate</div>
              <div style="font-weight:600;color:var(--accent-gold);">${(chrisPartner.commission_rate * 100).toFixed(0)}%</div>
            </div>
            <div style="padding:16px;background:var(--accent-green-soft);border-radius:8px;">
              <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:4px;">Bonuses Paid</div>
              <div style="font-weight:600;color:var(--accent-green);">$${achievedTotal.toLocaleString()}</div>
            </div>
            <div style="padding:16px;background:var(--accent-orange-soft);border-radius:8px;">
              <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:4px;">Bonuses Pending</div>
              <div style="font-weight:600;color:var(--accent-orange);">$${pendingTotal.toLocaleString()}</div>
            </div>
          </div>
          <div style="margin-top:12px;font-size:0.85rem;color:var(--text-secondary);">
            <span style="display:inline-block;margin-right:16px;">${mccIcon('calendar', 16)} Partnership Start: ${new Date(chrisPartner.partnership_start_date).toLocaleDateString()}</span>
            <span style="display:inline-block;margin-right:16px;">${mccIcon('calendar', 16)} Next Anniversary: January 23, ${new Date().getFullYear() + (new Date() > new Date(new Date().getFullYear(), 0, 23) ? 1 : 0)}</span>
            <span style="display:inline-block;">${mccIcon('sparkles', 16)} Status: <span class="status-badge approved">${chrisPartner.status}</span></span>
          </div>
        `;
      } else {
        document.getElementById('founding-partner-info').innerHTML = `<span style="color:var(--text-muted);">No founding partner record found</span>`;
      }
      
      const tbody = document.getElementById('milestones-table-body');
      if (!milestones.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No milestones configured</td></tr>`;
        return;
      }
      
      tbody.innerHTML = milestones.map(m => {
        const statusBadge = m.is_paid 
          ? '<span class="status-badge approved">' + mccIcon('check', 16) + ' Paid</span>'
          : m.is_achieved 
            ? '<span class="status-badge orange">' + mccIcon('clock', 16) + ' Achieved - Unpaid</span>'
            : '<span class="status-badge" style="background:var(--bg-input);color:var(--text-muted);">Pending</span>';
        
        const paidDate = m.achievement?.paid_at ? new Date(m.achievement.paid_at).toLocaleDateString() : '-';
        
        const canPay = m.is_achieved && !m.is_paid;
        const actionBtn = canPay 
          ? `<button class="btn btn-success btn-sm" onclick="payMilestone('${m.id}', '${m.description}', ${m.bonus_amount})">${mccIcon('credit-card', 16)} Pay $${m.bonus_amount.toLocaleString()}</button>`
          : m.is_paid
            ? `<span style="color:var(--text-muted);font-size:0.85rem;">Paid</span>`
            : `<span style="color:var(--text-muted);font-size:0.85rem;">-</span>`;
        
        return `
          <tr style="${m.is_achieved ? 'background:var(--accent-green-soft);' : ''}">
            <td style="font-weight:600;">$${Number.parseFloat(m.threshold_amount).toLocaleString()}</td>
            <td style="font-weight:600;color:var(--accent-gold);">$${Number.parseFloat(m.bonus_amount).toLocaleString()}</td>
            <td>${m.description}</td>
            <td>${statusBadge}</td>
            <td>${paidDate}</td>
            <td>${actionBtn}</td>
          </tr>
        `;
      }).join('');
    }

    async function payMilestone(milestoneId, description, amount) {
      // Native confirm — admin.js uses this pattern throughout (see :2200,
      // :2228, etc.). `showConfirmDialog` never existed. Losing the HTML
      // formatting here is a small UX cost but the pattern matches.
      const confirmed = confirm(
        'Pay Milestone Bonus\n\n' +
        'Are you sure you want to mark this milestone as paid?\n\n' +
        description + '\n' +
        'Amount: $' + amount.toLocaleString() + '\n\n' +
        'This will deduct from the bonus reserve balance.'
      );

      if (!confirmed) return;
      
      const stripeTransferId = prompt('Enter Stripe Transfer ID (optional):');
      const notes = prompt('Add notes (optional):');
      
      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/milestones/${milestoneId}/pay`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabaseClient.auth.getSession()).data.session?.access_token}`
          },
          body: JSON.stringify({
            stripe_transfer_id: stripeTransferId || null,
            notes: notes || null
          })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(result.error || 'Failed to process payment');
        }
        
        showToast(result.message || 'Milestone marked as paid!', 'success');
        loadMilestonesData();
      } catch (err) {
        console.error('Error paying milestone:', err);
        showToast(err.message || 'Failed to process milestone payment', 'error');
      }
    }

    async function loadBonusReserveData() {
      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/bonus-reserve`, {
          headers: {
            'Authorization': `Bearer ${(await supabaseClient.auth.getSession()).data.session?.access_token}`
          }
        });
        
        if (!response.ok) throw new Error('Failed to fetch bonus reserve');
        
        bonusReserveData = await response.json();
        renderBonusReserveContent();
      } catch (err) {
        console.error('Error loading bonus reserve:', err);
        showToast('Failed to load bonus reserve data', 'error');
      }
    }

    function renderBonusReserveContent() {
      if (!bonusReserveData) return;
      
      const currentBalance = bonusReserveData.current_balance || 0;
      const totalAccruals = bonusReserveData.total_accruals || 0;
      const totalPayouts = bonusReserveData.total_payouts || 0;
      const reserveRate = (bonusReserveData.reserve_rate || 0.15) * 100;
      const treasury = bonusReserveData.treasury || {};
      
      document.getElementById('reserve-balance').textContent = '$' + currentBalance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
      document.getElementById('total-accruals').textContent = '$' + totalAccruals.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
      document.getElementById('total-payouts-reserve').textContent = '$' + totalPayouts.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
      document.getElementById('reserve-rate').textContent = reserveRate.toFixed(0) + '%';
      
      // Render Treasury status
      const treasuryContainer = document.getElementById('treasury-status-container');
      if (treasuryContainer) {
        const statusBadge = treasury.status === 'active' 
          ? '<span class="status-badge approved">Active</span>'
          : treasury.status === 'pending_setup'
            ? '<span class="status-badge orange">Pending Setup</span>'
            : '<span class="status-badge rejected">Error</span>';
        
        const treasuryBalance = treasury.active ? '$' + (treasury.balance || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-';
        const pendingBalance = treasury.active && treasury.pendingBalance ? '$' + treasury.pendingBalance.toLocaleString(undefined, {minimumFractionDigits: 2}) : '-';
        
        treasuryContainer.innerHTML = `
          <div class="stat-card" style="border-left:4px solid var(--accent-primary);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
              <h4 style="margin:0;color:var(--text-primary);">Stripe Treasury</h4>
              ${statusBadge}
            </div>
            ${treasury.active ? `
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                <div>
                  <div style="color:var(--text-muted);font-size:12px;margin-bottom:4px;">Available Balance</div>
                  <div style="font-size:24px;font-weight:700;color:var(--accent-green);">${treasuryBalance}</div>
                </div>
                <div>
                  <div style="color:var(--text-muted);font-size:12px;margin-bottom:4px;">Pending</div>
                  <div style="font-size:24px;font-weight:700;color:var(--text-secondary);">${pendingBalance}</div>
                </div>
              </div>
              <div style="margin-top:12px;font-size:11px;color:var(--text-muted);">Interest accrues automatically. FDIC insured up to $250K.</div>
            ` : `
              <div style="color:var(--text-secondary);font-size:14px;">
                ${treasury.message || 'Treasury approval pending. Reserve funds tracked in database until setup complete.'}
              </div>
              <div style="margin-top:12px;padding:10px;background:rgba(212,168,85,0.1);border-radius:8px;font-size:12px;">
                <strong style="color:var(--accent-primary);">Note:</strong> Once Treasury is active, 15% of bid pack revenue will be automatically transferred to earn interest.
              </div>
            `}
          </div>
        `;
      }
      
      const monthlyData = bonusReserveData.monthly_breakdown || [];
      const monthlyTbody = document.getElementById('monthly-reserve-body');
      
      if (!monthlyData.length) {
        monthlyTbody.innerHTML = `<tr><td colspan="4" class="empty-state">No monthly data available</td></tr>`;
      } else {
        monthlyTbody.innerHTML = monthlyData.map(m => `
          <tr>
            <td style="font-weight:600;">${m.month_year}</td>
            <td>$${Number.parseFloat(m.bid_pack_revenue || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
            <td style="color:var(--accent-green);">$${Number.parseFloat(m.reserve_accrual || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
            <td><span class="status-badge ${m.status === 'finalized' ? 'approved' : 'orange'}">${m.status || 'pending'}</span></td>
          </tr>
        `).join('');
      }
      
      const transactions = bonusReserveData.transactions || [];
      const txTbody = document.getElementById('reserve-transactions-body');
      
      if (!transactions.length) {
        txTbody.innerHTML = `<tr><td colspan="5" class="empty-state">No transactions yet</td></tr>`;
      } else {
        txTbody.innerHTML = transactions.map(t => {
          const typeColor = t.transaction_type === 'accrual' ? 'var(--accent-green)' 
            : t.transaction_type === 'payout' ? 'var(--accent-orange)' 
            : 'var(--accent-blue)';
          const amountPrefix = t.amount >= 0 ? '+' : '';
          
          return `
            <tr>
              <td>${new Date(t.created_at).toLocaleString()}</td>
              <td><span style="color:${typeColor};font-weight:600;text-transform:capitalize;">${t.transaction_type}</span></td>
              <td style="font-weight:600;color:${t.amount >= 0 ? 'var(--accent-green)' : 'var(--accent-orange)'};">${amountPrefix}$${Number.parseFloat(t.amount).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
              <td>$${Number.parseFloat(t.balance_after || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
              <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${t.notes || ''}">${t.notes || '-'}</td>
            </tr>
          `;
        }).join('');
      }
    }

    async function adjustBonusReserve() {
      const amountInput = document.getElementById('reserve-adjust-amount');
      const notesInput = document.getElementById('reserve-adjust-notes');
      
      const amount = Number.parseFloat(amountInput.value);
      const notes = notesInput.value.trim();
      
      if (isNaN(amount) || amount === 0) {
        showToast('Please enter a valid non-zero amount', 'error');
        return;
      }
      
      if (!notes) {
        showToast('Notes are required for reserve adjustments', 'error');
        return;
      }
      
      const confirmed = confirm(
        'Adjust Bonus Reserve\n\n' +
        'Are you sure you want to adjust the reserve balance?\n\n' +
        'Amount: ' + (amount >= 0 ? '+$' : '-$') + Math.abs(amount).toFixed(2) + '\n' +
        'Notes: ' + notes
      );

      if (!confirmed) return;
      
      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/bonus-reserve/adjust`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabaseClient.auth.getSession()).data.session?.access_token}`
          },
          body: JSON.stringify({ amount, notes })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(result.error || 'Failed to adjust reserve');
        }
        
        showToast(result.message || 'Reserve adjusted successfully!', 'success');
        amountInput.value = '';
        notesInput.value = '';
        loadBonusReserveData();
      } catch (err) {
        console.error('Error adjusting reserve:', err);
        showToast(err.message || 'Failed to adjust reserve balance', 'error');
      }
    }

    // ========== VIOLATION REPORTS ==========
    let violationReports = [];
    let currentViolationFilter = 'pending';

    async function loadViolationReports() {
      try {
        const { data, error } = await supabaseClient
          .from('circumvention_reports')
          .select(`
            *,
            reporter:reporter_id(id, full_name, email),
            provider:provider_id(id, full_name, business_name, provider_alias, email),
            package:package_id(id, title)
          `)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error loading violation reports:', error);
          return;
        }

        violationReports = data || [];
        updateViolationStats();
        renderViolationReports();
      } catch (err) {
        console.error('loadViolationReports error:', err);
      }
    }

    function updateViolationStats() {
      const pending = violationReports.filter(r => r.status === 'pending').length;
      const investigating = violationReports.filter(r => r.status === 'investigating').length;
      const confirmed = violationReports.filter(r => r.status === 'confirmed').length;
      const dismissed = violationReports.filter(r => r.status === 'dismissed').length;

      document.getElementById('violations-pending').textContent = pending;
      document.getElementById('violations-investigating').textContent = investigating;
      document.getElementById('violations-confirmed').textContent = confirmed;
      document.getElementById('violations-dismissed').textContent = dismissed;
      document.getElementById('violation-count').textContent = pending;
      document.getElementById('violation-count').style.display = pending > 0 ? 'inline' : 'none';
    }

    function renderViolationReports() {
      const container = document.getElementById('violations-list');
      let filtered = violationReports;

      if (currentViolationFilter !== 'all') {
        filtered = violationReports.filter(r => r.status === currentViolationFilter);
      }

      if (!filtered.length) {
        container.innerHTML = `<div class="empty-state" style="padding:40px;"><div class="empty-state-icon">${mccIcon('flag', 40)}</div><p>No ${currentViolationFilter} reports</p></div>`;
        return;
      }

      container.innerHTML = filtered.map(report => {
        const reporterName = report.reporter?.full_name || report.reporter?.email || 'Unknown';
        const providerAlias = report.provider?.provider_alias || `Provider #${report.provider_id?.slice(0,4).toUpperCase()}`;
        const providerRealName = report.provider?.business_name || report.provider?.full_name || 'Unknown';
        const packageTitle = report.package?.title || 'N/A';
        
        const reportTypeLabels = {
          'contact_info': 'Shared Contact Info',
          'solicitation': 'Direct Solicitation',
          'payment_outside': 'Outside Payment Request',
          'discount_offer': 'Discount to Bypass MCC',
          'business_card': 'Business Card/Flyer',
          'other': 'Other Violation'
        };

        const statusColors = {
          'pending': 'orange',
          'investigating': 'blue',
          'confirmed': 'red',
          'dismissed': 'muted'
        };

        return `
          <div class="card" style="margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
              <div>
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
                  <span class="status-badge ${statusColors[report.status]}">${report.status.toUpperCase()}</span>
                  <span style="font-weight:600;">${reportTypeLabels[report.report_type] || report.report_type}</span>
                </div>
                <div style="font-size:0.85rem;color:var(--text-muted);">
                  Reported ${new Date(report.created_at).toLocaleDateString()} at ${new Date(report.created_at).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                </div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:0.85rem;color:var(--text-muted);">Report #${report.id.slice(0,8).toUpperCase()}</div>
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:16px;">
              <div>
                <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">Reporter (Member)</div>
                <div style="font-weight:500;">${reporterName}</div>
                <div style="font-size:0.85rem;color:var(--text-secondary);">${report.reporter?.email || ''}</div>
              </div>
              <div>
                <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">Accused Provider</div>
                <div style="font-weight:500;">${providerAlias}</div>
                <div style="font-size:0.85rem;color:var(--accent-gold);">Real: ${providerRealName}</div>
                <div style="font-size:0.85rem;color:var(--text-secondary);">${report.provider?.email || ''}</div>
              </div>
            </div>

            <div style="margin-bottom:16px;">
              <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">Related Package</div>
              <div>${packageTitle}</div>
            </div>

            <div style="margin-bottom:16px;">
              <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">Description</div>
              <div style="background:var(--bg-input);padding:12px;border-radius:var(--radius-md);line-height:1.6;">${report.description}</div>
            </div>

            ${report.evidence_urls?.length ? `
              <div style="margin-bottom:16px;">
                <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:8px;">Evidence (${report.evidence_urls.length} file${report.evidence_urls.length > 1 ? 's' : ''})</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                  ${report.evidence_urls.map((url, i) => `<a href="${url}" target="_blank" class="btn btn-secondary btn-sm">${mccIcon('paperclip', 16)} Evidence ${i + 1}</a>`).join('')}
                </div>
              </div>
            ` : ''}

            ${report.admin_notes ? `
              <div style="margin-bottom:16px;">
                <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">Admin Notes</div>
                <div style="background:var(--accent-blue-soft);padding:12px;border-radius:var(--radius-md);border:1px solid rgba(74,124,255,0.3);">${report.admin_notes}</div>
              </div>
            ` : ''}

            ${report.status === 'confirmed' && report.reward_amount ? `
              <div style="background:var(--accent-gold-soft);padding:12px;border-radius:var(--radius-md);border:1px solid rgba(212,168,85,0.3);margin-bottom:16px;">
                <strong>${mccIcon('dollar-sign', 16)} Reward:</strong> $${report.reward_amount.toFixed(2)} ${report.reward_paid_at ? '(Paid)' : '(Pending)'}
              </div>
            ` : ''}

            <div style="display:flex;gap:8px;flex-wrap:wrap;padding-top:16px;border-top:1px solid var(--border-subtle);">
              ${report.status === 'pending' ? `
                <button class="btn btn-primary btn-sm" onclick="updateViolationStatus('${report.id}', 'investigating')">${mccIcon('search', 16)} Start Investigation</button>
                <button class="btn btn-secondary btn-sm" onclick="updateViolationStatus('${report.id}', 'dismissed')">${mccIcon('x', 16)} Dismiss</button>
              ` : ''}
              ${report.status === 'investigating' ? `
                <button class="btn btn-primary btn-sm" onclick="confirmViolation('${report.id}')">${mccIcon('check', 16)} Confirm Violation</button>
                <button class="btn btn-secondary btn-sm" onclick="updateViolationStatus('${report.id}', 'dismissed')">${mccIcon('x', 16)} Dismiss</button>
              ` : ''}
              ${report.status === 'confirmed' && !report.reward_paid_at ? `
                <button class="btn btn-primary btn-sm" onclick="markRewardPaid('${report.id}')">${mccIcon('dollar-sign', 16)} Mark Reward Paid</button>
              ` : ''}
              <button class="btn btn-ghost btn-sm" onclick="addViolationNotes('${report.id}')">${mccIcon('file-text', 16)} Add Notes</button>
              <button class="btn btn-ghost btn-sm" onclick="viewProviderHistory('${report.provider_id}')">${mccIcon('user', 16)} Provider History</button>
            </div>
          </div>
        `;
      }).join('');
    }

    async function updateViolationStatus(reportId, status) {
      const updates = { status, updated_at: new Date().toISOString() };
      
      if (status === 'investigating') {
        updates.investigated_at = new Date().toISOString();
      }
      if (status === 'dismissed' || status === 'confirmed') {
        updates.resolved_at = new Date().toISOString();
      }

      const { error } = await supabaseClient
        .from('circumvention_reports')
        .update(updates)
        .eq('id', reportId);

      if (error) {
        showToast('Failed to update status', 'error');
        return;
      }

      showToast(`Report marked as ${status}`, 'success');
      await loadViolationReports();
    }

    async function confirmViolation(reportId) {
      const report = violationReports.find(r => r.id === reportId);
      if (!report) return;

      // Show confirm dialog with reward amount input
      const rewardAmount = prompt('Enter reward amount for reporter (up to 25% of damages recovered).\nEnter 0 if no reward, or leave blank to skip reward for now:', '50');
      
      if (rewardAmount === null) return; // Cancelled

      const updates = {
        status: 'confirmed',
        resolved_at: new Date().toISOString(),
        reward_amount: rewardAmount ? Number.parseFloat(rewardAmount) : null
      };

      const { error } = await supabaseClient
        .from('circumvention_reports')
        .update(updates)
        .eq('id', reportId);

      if (error) {
        showToast('Failed to confirm violation', 'error');
        return;
      }

      // Suspend the provider — Task #127: routed through the server
      // /api/admin/provider/suspend endpoint so the action is admin-password
      // gated, audited, and triggers the Gatekeeper Postgres trigger by
      // flipping role=suspended.
      const suspendProvider = confirm('Violation confirmed. Suspend this provider account?');
      if (suspendProvider && report.provider_id) {
        try {
          const sres = await fetch('/api/admin/provider/suspend', {
            method: 'POST',
            headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider_id: report.provider_id,
              reason: 'Policy violation - circumvention attempt',
              set_role_suspended: true
            })
          });
          const sjson = await sres.json().catch(() => ({}));
          if (!sres.ok) {
            showToast(sjson.error || `Suspend failed (${sres.status})`, 'error');
          } else {
            showToast('Provider account suspended', 'success');
          }
        } catch (e) {
          showToast(`Suspend failed: ${e.message}`, 'error');
        }
      }

      showToast('Violation confirmed', 'success');
      await loadViolationReports();
    }

    async function markRewardPaid(reportId) {
      const { error } = await supabaseClient
        .from('circumvention_reports')
        .update({ reward_paid_at: new Date().toISOString() })
        .eq('id', reportId);

      if (error) {
        showToast('Failed to update reward status', 'error');
        return;
      }

      showToast('Reward marked as paid', 'success');
      await loadViolationReports();
    }

    async function addViolationNotes(reportId) {
      const report = violationReports.find(r => r.id === reportId);
      const currentNotes = report?.admin_notes || '';
      const newNotes = prompt('Enter admin notes:', currentNotes);
      
      if (newNotes === null) return;

      const { error } = await supabaseClient
        .from('circumvention_reports')
        .update({ admin_notes: newNotes })
        .eq('id', reportId);

      if (error) {
        showToast('Failed to save notes', 'error');
        return;
      }

      showToast('Notes saved', 'success');
      await loadViolationReports();
    }

    function viewProviderHistory(providerId) {
      // Filter violations by this provider
      const providerViolations = violationReports.filter(r => r.provider_id === providerId);
      alert(`This provider has ${providerViolations.length} total report(s):\n\n` + 
        providerViolations.map(r => `• ${r.status.toUpperCase()}: ${r.report_type} (${new Date(r.created_at).toLocaleDateString()})`).join('\n'));
    }

    // Setup violation tabs
    document.getElementById('violations-tabs')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab')) {
        document.querySelectorAll('#violations-tabs .tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        currentViolationFilter = e.target.dataset.filter;
        renderViolationReports();
      }
    });

