// ========== MY CAR CONCIERGE - PACKAGES MODULE ==========
// Package management, bids, upsells, destination services, reviews

    async function loadUpsellRequests() {
      const { data } = await supabaseClient.from('upsell_requests')
        .select('*, maintenance_packages(title, vehicles(year, make, model, fuel_injection_type))')
        .eq('member_id', currentUser.id)
        .order('created_at', { ascending: false });
      upsellRequests = data || [];
      renderUpsells();
      
      // Show alert banner if pending upsells
      const pending = upsellRequests.filter(u => u.status === 'pending');
      const banner = document.getElementById('upsell-alert-banner');
      const badge = document.getElementById('upsell-count');
      if (pending.length > 0) {
        banner.style.display = 'block';
        badge.style.display = 'inline';
        badge.textContent = pending.length;
      } else {
        banner.style.display = 'none';
        badge.style.display = 'none';
      }
    }

    function renderUpsells() {
      const filtered = upsellRequests.filter(u => 
        currentUpsellFilter === 'all' || u.status === currentUpsellFilter
      );
      
      const container = document.getElementById('upsells-list');
      if (!filtered.length) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">✅</div><p>No ${currentUpsellFilter === 'all' ? '' : currentUpsellFilter} updates.</p></div>`;
        return;
      }

      const updateTypeIcons = {
        cost_increase: '💰',
        car_ready: '✅',
        work_paused: '⏸️',
        question: '❓',
        request_call: '📞'
      };
      const updateTypeLabels = {
        cost_increase: 'Cost Increase',
        car_ready: 'Car Ready',
        work_paused: 'Work Paused',
        question: 'Question',
        request_call: 'Call Requested'
      };
      const updateTypeBadgeColors = {
        cost_increase: 'var(--accent-orange)',
        car_ready: 'var(--accent-green)',
        work_paused: 'var(--accent-red)',
        question: 'var(--accent-blue)',
        request_call: '#9370DB'
      };

      container.innerHTML = filtered.map(u => {
        const pkg = u.maintenance_packages;
        const vehicle = pkg?.vehicles;
        const vehicleName = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'Vehicle';
        const timeLeft = u.expires_at ? getTimeRemaining(u.expires_at) : null;
        const urgencyColors = { critical: 'var(--accent-red)', recommended: 'var(--accent-orange)', optional: 'var(--text-muted)' };
        const updateType = u.update_type || 'cost_increase';
        const typeIcon = updateTypeIcons[updateType] || '📋';
        const typeLabel = updateTypeLabels[updateType] || 'Update';
        const typeBadgeColor = updateTypeBadgeColors[updateType] || 'var(--accent-gold)';
        const isUrgent = u.is_urgent;
        const showCost = updateType === 'cost_increase' || (updateType === 'work_paused' && u.estimated_cost > 0);
        
        let actionButtons = '';
        if (u.status === 'pending') {
          if (updateType === 'cost_increase') {
            actionButtons = `
              <button class="btn btn-success" onclick="approveUpsell('${u.id}')">✓ Approve ($${(u.estimated_cost || 0).toFixed(2)})</button>
              <button class="btn btn-secondary" onclick="declineUpsell('${u.id}')">✗ Decline</button>
              <button class="btn btn-ghost" onclick="rebidUpsell('${u.id}', '${u.title.replace(/'/g, "\\'")}', ${u.estimated_cost || 0})">🔄 Get Competing Bids</button>
              <button class="btn btn-ghost" onclick="requestCallBack('${u.id}')">📞 Call Me</button>
            `;
          } else if (updateType === 'car_ready') {
            actionButtons = `
              <button class="btn btn-success" onclick="acknowledgeUpdate('${u.id}')">👍 Got It - I'll Pick Up</button>
              <button class="btn btn-ghost" onclick="requestCallBack('${u.id}')">📞 Call Me</button>
            `;
          } else if (updateType === 'work_paused') {
            actionButtons = `
              ${u.estimated_cost > 0 ? `<button class="btn btn-success" onclick="approveUpsell('${u.id}')">✓ Approve & Continue ($${(u.estimated_cost || 0).toFixed(2)})</button>` : ''}
              <button class="btn btn-primary" onclick="acknowledgeUpdate('${u.id}')">✓ Proceed</button>
              <button class="btn btn-secondary" onclick="declineUpsell('${u.id}')">✗ Stop Work</button>
              <button class="btn btn-ghost" onclick="requestCallBack('${u.id}')">📞 Call Me Now</button>
            `;
          } else if (updateType === 'question') {
            actionButtons = `
              <button class="btn btn-primary" onclick="openReplyModal('${u.id}', '${u.title.replace(/'/g, "\\'")}')">💬 Reply</button>
              <button class="btn btn-ghost" onclick="requestCallBack('${u.id}')">📞 Call Me</button>
            `;
          } else if (updateType === 'request_call') {
            actionButtons = `
              <button class="btn btn-primary" onclick="requestCallBack('${u.id}')">📞 I'll Call Now</button>
              <button class="btn btn-ghost" onclick="acknowledgeUpdate('${u.id}')">👍 Got It</button>
            `;
          } else {
            actionButtons = `
              <button class="btn btn-success" onclick="acknowledgeUpdate('${u.id}')">👍 Acknowledge</button>
            `;
          }
        }
        
        return `
          <div class="card" style="margin-bottom:16px;${isUrgent && u.status === 'pending' ? 'border:2px solid var(--accent-red);animation:pulse 2s infinite;' : ''}">
            ${isUrgent && u.status === 'pending' ? '<div style="background:var(--accent-red);color:white;padding:8px 16px;margin:-20px -20px 16px -20px;border-radius:var(--radius-lg) var(--radius-lg) 0 0;font-weight:600;text-align:center;">🚨 URGENT - Response Needed</div>' : ''}
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
              <div>
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                  <span style="font-size:1.2rem;">${typeIcon}</span>
                  <span style="background:${typeBadgeColor};color:white;padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:600;">${typeLabel}</span>
                </div>
                <h3 style="margin-bottom:4px;">${u.title}</h3>
                <div style="color:var(--text-muted);font-size:0.88rem;">
                  ${pkg?.title || 'Package'} • ${vehicleName}
                </div>
              </div>
              ${showCost ? `
                <div style="text-align:right;">
                  <div style="font-size:1.2rem;font-weight:600;">$${(u.estimated_cost || 0).toFixed(2)}</div>
                  <div style="display:inline-flex;align-items:center;gap:4px;background:linear-gradient(135deg,rgba(16,185,129,0.15),rgba(16,185,129,0.05));border:1px solid rgba(16,185,129,0.3);color:#10b981;padding:2px 6px;border-radius:100px;font-size:0.65rem;font-weight:600;margin-top:4px;cursor:help;" title="This price includes all parts, labor, taxes, shop fees, disposal fees, and platform fees. No hidden costs.">✓ All-Inclusive</div>
                  <div style="font-size:0.75rem;color:${urgencyColors[u.urgency] || 'var(--text-muted)'};font-weight:500;margin-top:4px;">${(u.urgency || 'recommended').toUpperCase()}</div>
                </div>
              ` : ''}
            </div>

            ${u.description ? `<p style="color:var(--text-secondary);margin-bottom:16px;">${u.description}</p>` : ''}

            ${u.photo_urls?.length ? `
              <div style="display:flex;gap:8px;margin-bottom:16px;overflow-x:auto;">
                ${u.photo_urls.map(url => `
                  <img src="${url}" style="width:100px;height:75px;object-fit:cover;border-radius:var(--radius-sm);cursor:pointer;" onclick="window.open('${url}','_blank')">
                `).join('')}
              </div>
            ` : ''}

            ${u.status === 'pending' ? `
              ${timeLeft ? `<div style="background:${updateType === 'cost_increase' ? 'var(--accent-orange-soft)' : 'var(--bg-input)'};border:1px solid ${updateType === 'cost_increase' ? 'rgba(245,158,11,0.3)' : 'var(--border-subtle)'};padding:10px 14px;border-radius:var(--radius-md);margin-bottom:16px;"><span style="color:var(--accent-orange);font-weight:600;">⏰ ${timeLeft} to respond</span>${updateType === 'cost_increase' ? '<span style="color:var(--text-secondary);font-size:0.85rem;"> — Provider may suspend work if no response</span>' : ''}</div>` : ''}
              <div style="display:flex;gap:12px;flex-wrap:wrap;">
                ${actionButtons}
              </div>
            ` : `
              <div style="padding:12px;background:${u.status === 'approved' || u.member_action === 'acknowledged' ? 'var(--accent-green-soft)' : 'var(--bg-input)'};border-radius:var(--radius-md);color:${u.status === 'approved' || u.member_action === 'acknowledged' ? 'var(--accent-green)' : 'var(--text-muted)'};">
                ${u.status === 'approved' ? '✓ Approved' : u.status === 'declined' ? '✗ Declined' : u.member_action === 'acknowledged' ? '👍 Acknowledged' : u.member_action === 'call_me' ? '📞 Call Requested' : u.status === 'rebid' ? '🔄 Sent for competing bids' : u.status === 'expired' ? '⏰ Expired' : u.status}
                ${u.responded_at ? ` on ${new Date(u.responded_at).toLocaleDateString()}` : ''}
              </div>
            `}
          </div>
        `;
      }).join('');
    }
    
    async function acknowledgeUpdate(updateId) {
      await supabaseClient.from('upsell_requests').update({
        status: 'approved',
        member_action: 'acknowledged',
        responded_at: new Date().toISOString()
      }).eq('id', updateId);
      showToast('Update acknowledged. Provider has been notified.', 'success');
      await loadUpsellRequests();
    }
    
    async function requestCallBack(updateId) {
      await supabaseClient.from('upsell_requests').update({
        call_requested: true,
        member_action: 'call_me'
      }).eq('id', updateId);
      showToast('Call requested! Provider will call you shortly.', 'success');
      await loadUpsellRequests();
    }
    
    function openReplyModal(updateId, title) {
      const reply = prompt(`Reply to: "${title}"\n\nEnter your response:`);
      if (reply && reply.trim()) {
        submitReply(updateId, reply.trim());
      }
    }
    
    async function submitReply(updateId, reply) {
      await supabaseClient.from('upsell_requests').update({
        status: 'approved',
        member_response: reply,
        member_action: 'replied',
        responded_at: new Date().toISOString()
      }).eq('id', updateId);
      showToast('Reply sent to provider!', 'success');
      await loadUpsellRequests();
    }

    function getTimeRemaining(expiresAt) {
      const now = new Date();
      const expiry = new Date(expiresAt);
      const diff = expiry - now;
      if (diff <= 0) return null;
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      if (hours > 0) return `${hours}h ${minutes}m left`;
      return `${minutes}m left`;
    }

    async function approveUpsell(upsellId) {
      const upsell = upsellRequests.find(u => u.id === upsellId);
      if (!confirm(`Approve this additional work for $${(upsell?.estimated_cost || 0).toFixed(2)}?\n\nThis amount will be added to your escrow payment.`)) return;

      await supabaseClient.from('upsell_requests').update({
        status: 'approved',
        responded_at: new Date().toISOString()
      }).eq('id', upsellId);

      // Update payment to add upsell amount
      if (upsell?.package_id) {
        const { data: payment } = await supabaseClient.from('payments')
          .select('*')
          .eq('package_id', upsell.package_id)
          .single();
        
        if (payment) {
          const newTotal = (payment.amount_total || 0) + (upsell.estimated_cost || 0);
          const mccFee = newTotal * 0.075;
          const providerAmount = newTotal - mccFee;
          
          await supabaseClient.from('payments').update({
            amount_total: newTotal,
            amount_provider: providerAmount,
            amount_mcc_fee: mccFee
          }).eq('id', payment.id);
        }
      }

      showToast('Additional work approved. Payment updated.', 'success');
      await loadUpsellRequests();
    }

    async function declineUpsell(upsellId) {
      const upsell = upsellRequests.find(u => u.id === upsellId);
      const pkg = packages.find(p => p.id === upsell?.package_id);
      const originalBid = pkg?._acceptedBid?.amount || pkg?.accepted_bid_amount;
      
      let confirmMsg = 'Decline this additional work?\n\n';
      if (originalBid) {
        confirmMsg += `You will only pay the original bid amount of $${originalBid.toFixed(2)}.\n\n`;
      }
      confirmMsg += 'The provider will complete only the originally agreed scope of work.';
      
      if (!confirm(confirmMsg)) return;

      await supabaseClient.from('upsell_requests').update({
        status: 'declined',
        member_action: 'declined',
        responded_at: new Date().toISOString()
      }).eq('id', upsellId);

      showToast('Additional work declined. You will only pay the original bid amount.', 'success');
      await loadUpsellRequests();
    }

    async function rebidUpsell(upsellId, title, estimatedCost) {
      if (!confirm(`Create a new package to get competing bids on "${title}"?\n\nOther providers can bid on this work.`)) return;

      const upsell = upsellRequests.find(u => u.id === upsellId);
      const pkg = packages.find(p => p.id === upsell?.package_id);

      // Create new package for the upsell work
      const packageData = {
        member_id: currentUser.id,
        vehicle_id: pkg?.vehicle_id,
        title: `Rebid: ${title}`,
        description: `Getting competitive bids for: ${upsell?.description || title}\n\nOriginal estimate from previous provider: $${estimatedCost.toFixed(2)}`,
        category: 'other',
        service_type: 'Custom request',
        frequency: 'one_time',
        parts_preference: 'standard',
        pickup_preference: 'either',
        status: 'open'
      };
      
      // Check if member has a preferred provider for exclusive first look
      if (userProfile?.preferred_provider_id) {
        packageData.exclusive_provider_id = userProfile.preferred_provider_id;
        packageData.exclusive_until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      }
      
      const { data: newPkg } = await supabaseClient.from('maintenance_packages').insert(packageData).select().single();

      // Update upsell request
      await supabaseClient.from('upsell_requests').update({
        status: 'rebid',
        responded_at: new Date().toISOString(),
        rebid_package_id: newPkg?.id
      }).eq('id', upsellId);

      showToast('New package created for competitive bidding!', 'success');
      await loadUpsellRequests();
      await loadPackages();
    }


    let packagePaymentStatuses = {};

    async function loadPackagePaymentStatuses() {
      if (!packages.length) return;
      
      const packageIds = packages.filter(p => ['accepted', 'in_progress', 'completed'].includes(p.status)).map(p => p.id);
      if (!packageIds.length) return;
      
      try {
        const { data: payments } = await supabaseClient.from('payments')
          .select('package_id, status, escrow_payment_intent_id, escrow_captured, amount_total')
          .in('package_id', packageIds);
        
        packagePaymentStatuses = {};
        if (payments) {
          payments.forEach(p => {
            packagePaymentStatuses[p.package_id] = p;
          });
        }
      } catch (e) {
        console.log('Could not load payment statuses:', e);
      }
    }

    function getPaymentStatusBadge(pkg) {
      const payment = packagePaymentStatuses[pkg.id];
      
      if (!payment) {
        if (pkg.status === 'accepted' || pkg.status === 'in_progress') {
          return `<span class="payment-status-badge awaiting" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:100px;font-size:0.72rem;font-weight:600;background:var(--accent-orange-soft);color:var(--accent-orange);border:1px solid rgba(251,146,60,0.3);">💳 Awaiting Payment</span>`;
        }
        return '';
      }
      
      if (payment.escrow_captured === true || payment.status === 'released' || payment.status === 'completed') {
        return `<span class="payment-status-badge complete" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:100px;font-size:0.72rem;font-weight:600;background:var(--accent-green-soft);color:var(--accent-green);border:1px solid rgba(52,211,153,0.3);">✓ Payment Complete</span>`;
      }
      
      if (payment.escrow_payment_intent_id && payment.escrow_captured === false) {
        return `<span class="payment-status-badge held" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:100px;font-size:0.72rem;font-weight:600;background:var(--accent-blue-soft);color:var(--accent-blue);border:1px solid rgba(56,189,248,0.3);">🔒 Payment Held</span>`;
      }
      
      if (payment.status === 'held' || payment.status === 'authorized') {
        return `<span class="payment-status-badge authorized" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:100px;font-size:0.72rem;font-weight:600;background:var(--accent-teal-soft);color:var(--accent-teal);border:1px solid rgba(34,211,238,0.3);">🔐 Payment Authorized</span>`;
      }
      
      return `<span class="payment-status-badge awaiting" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:100px;font-size:0.72rem;font-weight:600;background:var(--accent-orange-soft);color:var(--accent-orange);border:1px solid rgba(251,146,60,0.3);">💳 Awaiting Payment</span>`;
    }

    function renderPackages() {
      const list = document.getElementById('packages-list');
      let filtered = packages;
      
      if (currentPackageFilter === 'open') filtered = packages.filter(p => p.status === 'open');
      else if (currentPackageFilter === 'active') filtered = packages.filter(p => ['pending', 'accepted', 'in_progress'].includes(p.status));
      else if (currentPackageFilter === 'completed') filtered = packages.filter(p => p.status === 'completed');

      if (!filtered.length) {
        list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📦</div><p>No packages in this category.</p></div>';
        return;
      }

      list.innerHTML = filtered.map(p => {
        const vehicle = p.vehicles;
        const vehicleName = vehicle ? (vehicle.nickname || `${vehicle.year || ''} ${vehicle.make} ${vehicle.model}`.trim()) : 'Unknown Vehicle';
        
        // Check if bidding has expired (but package still shows as 'open')
        const isExpired = p.status === 'open' && p.bidding_deadline && new Date(p.bidding_deadline) < new Date();
        const displayStatus = isExpired ? 'expired' : p.status;
        const statusClass = displayStatus === 'open' ? 'open' : displayStatus === 'completed' ? 'completed' : displayStatus === 'expired' ? 'expired' : ['pending', 'accepted'].includes(displayStatus) ? 'pending' : 'accepted';
        
        // Payment status badge for active/completed packages
        const paymentBadge = getPaymentStatusBadge(p);
        
        // Countdown timer for open packages
        let countdownHtml = '';
        if (p.status === 'open' && p.bidding_deadline) {
          const countdown = formatCountdown(p.bidding_deadline);
          const urgentClass = countdown.expired ? 'expired' : countdown.urgent ? 'urgent' : '';
          countdownHtml = `<span class="countdown-timer ${urgentClass}">⏱️ ${countdown.text}</span>`;
        }
        
        // Exclusive first look indicator
        let exclusiveHtml = '';
        if (p.status === 'open' && p.exclusive_until && new Date(p.exclusive_until) > new Date()) {
          const hoursRemaining = Math.ceil((new Date(p.exclusive_until) - new Date()) / (1000 * 60 * 60));
          exclusiveHtml = `<div class="exclusive-first-look-badge" style="margin-top:6px;padding:6px 10px;background:var(--accent-gold-soft);border:1px solid var(--accent-gold);border-radius:var(--radius-sm);font-size:0.8rem;color:var(--accent-gold);">⭐ Your preferred provider has ${hoursRemaining}h first look</div>`;
        }
        
        // Repost button for expired packages
        const repostButton = isExpired ? `<button class="btn btn-primary btn-sm" onclick="repostPackage('${p.id}')">🔄 Repost</button>` : '';
        
        // Extend deadline button for open (non-expired) packages
        const extendButton = (p.status === 'open' && !isExpired) ? `<button class="btn btn-ghost btn-sm" onclick="extendDeadline('${p.id}')" title="Add more time">⏱️+</button>` : '';
        
        // Confirm job complete button for completed work with unreleased payment
        let confirmCompleteButton = '';
        const payment = packagePaymentStatuses[p.id];
        if ((p.status === 'in_progress' || p.status === 'completed') && payment && 
            (payment.status === 'held' || payment.status === 'authorized') && 
            !payment.escrow_captured) {
          confirmCompleteButton = `<button class="btn btn-success btn-sm" onclick="openReleasePaymentModal('${p.id}')">✓ Confirm Complete</button>`;
        }
        
        return `
          <div class="package-card">
            <div class="package-header">
              <div>
                <div class="package-title">${p.title}</div>
                <div class="package-vehicle">${vehicleName}</div>
              </div>
              <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
                <span class="package-status ${statusClass}">${displayStatus}</span>
                ${paymentBadge}
                ${countdownHtml}
                ${exclusiveHtml}
              </div>
            </div>
            <div class="package-meta">
              <span>📅 ${new Date(p.created_at).toLocaleDateString()}</span>
              <span>🔄 ${formatFrequency(p.frequency)}</span>
              <span>🔧 ${p.parts_preference || 'Standard'} parts</span>
              <span>🚗 ${formatPickup(p.pickup_preference)}</span>
            </div>
            ${p.description ? `<div class="package-description">${p.description}</div>` : ''}
            <div class="package-footer">
              <span class="bid-count">${isExpired ? 'Bidding ended' : (p.bid_count > 0 ? `💬 ${p.bid_count} bid${p.bid_count === 1 ? '' : 's'} received` : 'No bids yet')}</span>
              <div style="display:flex;gap:8px;">
                ${extendButton}
                ${confirmCompleteButton}
                ${repostButton}
                <button class="btn btn-secondary btn-sm" onclick="viewPackage('${p.id}')">Open →</button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    function renderRecentActivity() {
      const container = document.getElementById('recent-activity');
      const recent = packages.slice(0, 3);
      if (!recent.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📦</div><p>No recent activity.</p></div>';
        return;
      }
      container.innerHTML = recent.map(p => {
        const vehicle = p.vehicles;
        const vehicleName = vehicle ? (vehicle.nickname || `${vehicle.make} ${vehicle.model}`) : 'Vehicle';
        const bidInfo = p.status === 'open' && p.bid_count > 0 
          ? `<div style="color:var(--accent-gold);font-size:0.85rem;margin-top:4px;">💬 ${p.bid_count} bid${p.bid_count === 1 ? '' : 's'}</div>` 
          : '';
        return `
          <div class="package-card" style="margin-bottom:12px;padding:16px 20px;cursor:pointer;" onclick="viewPackage('${p.id}')">
            <div class="package-header" style="margin-bottom:8px;">
              <div>
                <div class="package-title" style="font-size:1rem;">${p.title}</div>
                <div class="package-vehicle">${vehicleName}</div>
                ${bidInfo}
              </div>
              <span class="package-status ${p.status}">${p.status}</span>
            </div>
          </div>
        `;
      }).join('');
    }

    function getReminderIcon(type) {
      const icons = {
        'registration': '📋',
        'oil_change': '🛢️',
        'warranty': '🛡️',
        'maintenance': '🔧',
        'inspection': '🔍',
        'tire_rotation': '🔄',
        'brake_check': '🛑',
        'other': '📌'
      };
      return icons[type] || '🔧';
    }
    
    function formatReminderType(type) {
      const labels = {
        'registration': 'Registration',
        'oil_change': 'Oil Change',
        'warranty': 'Warranty',
        'maintenance': 'Maintenance',
        'inspection': 'Inspection',
        'tire_rotation': 'Tire Rotation',
        'brake_check': 'Brake Check',
        'other': 'Other'
      };
      return labels[type] || type;
    }

    function getWhyItsDueExplanation(reminder) {
      const type = reminder.type;
      const milesDriven = reminder.milesDriven || null;
      const daysOverdue = reminder.daysUntil !== null && reminder.daysUntil < 0 ? Math.abs(reminder.daysUntil) : 0;
      
      const explanations = {
        'oil_change': milesDriven 
          ? `Your oil has traveled approximately ${milesDriven.toLocaleString()} miles. Oil breaks down over time and with use, reducing its ability to protect your engine from friction and heat.`
          : 'Oil degrades over time and loses its protective properties. Regular changes prevent costly engine wear.',
        'tire_rotation': 'Front tires wear faster due to steering and braking. Rotating them ensures even wear, extends tire life by 20-30%, and maintains safe handling.',
        'brake_check': 'Brake pads are wear items - the friction material gets thinner with each stop. Regular inspection ensures your stopping power stays safe.',
        'inspection': 'Regular inspections catch small issues before they become expensive repairs. Think of it as a health checkup for your car.',
        'registration': 'Vehicle registration renewal is required by law. Driving with expired registration can result in fines and your vehicle being towed.',
        'warranty': 'Warranty deadlines matter. Delaying service could void coverage on expensive repairs that would otherwise be free.',
        'maintenance': 'Regular maintenance extends vehicle life and prevents breakdowns. Components wear over time and need attention.'
      };
      
      let explanation = explanations[type] || 'Regular maintenance keeps your vehicle running safely and efficiently.';
      
      if (daysOverdue > 0) {
        explanation += ` This is ${daysOverdue} days overdue - schedule soon to avoid potential issues.`;
      }
      
      return explanation;
    }

    function renderReminders() {
      const list = document.getElementById('reminders-list');
      if (!reminders.length) {
        list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔔</div><p>No reminders. Your vehicles are up to date!</p></div>';
        return;
      }
      list.innerHTML = reminders.map(r => {
        const whyExplanation = getWhyItsDueExplanation(r);
        return `
        <div class="reminder-item type-${r.type}">
          <div class="reminder-icon ${r.status}">
            ${getReminderIcon(r.type)}
          </div>
          <div class="reminder-content">
            <div class="reminder-title">
              ${r.title} - ${r.vehicleName}
              <span class="reminder-type-badge">${formatReminderType(r.type)}</span>
            </div>
            <div class="reminder-due">
              ${r.dueDate ? `Due: ${new Date(r.dueDate).toLocaleDateString()}${r.daysUntil !== null ? ` (${r.daysUntil > 0 ? r.daysUntil + ' days left' : r.daysUntil === 0 ? 'Today' : Math.abs(r.daysUntil) + ' days overdue'})` : ''}` : ''}
              ${r.dueMileage ? `Due at ${r.dueMileage.toLocaleString()} miles${r.milesUntil !== null ? ` (${r.milesUntil > 0 ? r.milesUntil.toLocaleString() + ' miles away' : 'Overdue'})` : ''}` : ''}
              ${r.description ? `<br><span style="color:var(--text-muted);font-size:0.8rem;">${r.description}</span>` : ''}
            </div>
            <div class="reminder-why-due" style="margin-top:8px;padding:10px 12px;background:var(--accent-blue-soft);border-radius:var(--radius-sm);border-left:3px solid var(--accent-blue);">
              <span style="font-size:0.82rem;color:var(--text-secondary);line-height:1.5;">💡 <strong>Why it's due:</strong> ${whyExplanation}</span>
            </div>
          </div>
          <div class="reminder-actions">
            <button class="btn btn-sm btn-primary" onclick="createPackageFromReminder('${r.vehicleId}', '${r.title.replace(/'/g, "\\'")}')">Schedule</button>
            <button class="btn btn-sm btn-secondary" onclick="snoozeReminder('${r.id}', ${r.dbId ? `'${r.dbId}'` : 'null'})" title="Snooze for 7 days">💤</button>
            <button class="btn btn-sm btn-ghost" onclick="dismissReminder('${r.id}')" title="Dismiss reminder">✕</button>
          </div>
        </div>
      `}).join('');
    }

    function renderUpcomingReminders() {
      const container = document.getElementById('upcoming-reminders');
      const upcoming = reminders.filter(r => r.status === 'due' || r.status === 'overdue').slice(0, 3);
      if (!upcoming.length) {
        container.innerHTML = '<div class="empty-state" style="padding:24px"><div class="empty-state-icon">✅</div><p>All caught up!</p></div>';
        return;
      }
      container.innerHTML = upcoming.map(r => `
        <div class="reminder-item type-${r.type}">
          <div class="reminder-icon ${r.status}">
            ${getReminderIcon(r.type)}
          </div>
          <div class="reminder-content">
            <div class="reminder-title">${r.title} <span class="reminder-type-badge">${formatReminderType(r.type)}</span></div>
            <div class="reminder-due">${r.vehicleName}</div>
          </div>
          <div class="reminder-actions" style="margin-left:auto;">
            <button class="btn btn-sm btn-secondary" onclick="snoozeReminder('${r.id}', ${r.dbId ? `'${r.dbId}'` : 'null'})" title="Snooze for 7 days">💤</button>
            <button class="btn btn-sm btn-ghost" onclick="dismissReminder('${r.id}')" title="Dismiss reminder">✕</button>
          </div>
        </div>
      `).join('');
    }

    // ========== DESTINATION SERVICE HANDLING ==========
    function handlePickupChange() {
      const pickup = document.getElementById('p-pickup').value;
      const destFields = document.getElementById('destination-service-fields');
      
      if (pickup === 'destination_service') {
        destFields.style.display = 'block';
      } else {
        destFields.style.display = 'none';
        // Clear destination type when switching away
        document.getElementById('p-destination-type').value = '';
        document.querySelectorAll('.destination-type-option').forEach(o => o.classList.remove('selected'));
      }
    }

    function selectDestinationType(type) {
      document.getElementById('p-destination-type').value = type;
      
      // Update visual selection
      document.querySelectorAll('.destination-type-option').forEach(o => {
        if (o.dataset.type === type) {
          o.classList.add('selected');
          o.style.borderColor = 'var(--gold)';
          o.style.background = 'rgba(212,175,55,0.1)';
        } else {
          o.classList.remove('selected');
          o.style.borderColor = 'var(--border-subtle)';
          o.style.background = 'transparent';
        }
      });
      
      // Show/hide type-specific fields
      document.getElementById('airport-fields').style.display = type === 'airport' ? 'block' : 'none';
      document.getElementById('dealership-fields').style.display = type === 'dealership' ? 'block' : 'none';
      document.getElementById('detail-fields').style.display = type === 'detail' ? 'block' : 'none';
      document.getElementById('other-destination-fields').style.display = type === 'other' ? 'block' : 'none';
    }

    function openModal(id) {
      document.getElementById(id).classList.add('active');
    }

    function closeModal(id) { 
      document.getElementById(id).classList.remove('active');
      if (id === 'view-package-modal' && driverLocationRefreshInterval) {
        clearInterval(driverLocationRefreshInterval);
        driverLocationRefreshInterval = null;
      }
    }

    function createPackageForVehicle(vehicleId) {
      openPackageModal();
      document.getElementById('p-vehicle').value = vehicleId;
    }

    function createPackageFromReminder(vehicleId, title) {
      openPackageModal();
      document.getElementById('p-vehicle').value = vehicleId;
      document.getElementById('p-title').value = title;
    }

    // ========== PACKAGE PHOTO HANDLING ==========
    function handlePackagePhotoSelect(event) {
      const files = Array.from(event.target.files);
      const maxPhotos = 5;
      
      if (pendingPackagePhotos.length + files.length > maxPhotos) {
        showToast(`Maximum ${maxPhotos} photos allowed`, 'error');
        return;
      }

      files.forEach(file => {
        if (file.size > 5 * 1024 * 1024) {
          showToast(`${file.name} is too large (max 5MB)`, 'error');
          return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
          pendingPackagePhotos.push({
            file: file,
            preview: e.target.result
          });
          renderPackagePhotoPreviews();
        };
        reader.readAsDataURL(file);
      });

      // Clear input so same file can be selected again
      event.target.value = '';
    }

    function renderPackagePhotoPreviews() {
      const container = document.getElementById('package-photo-preview');
      if (!container) return;
      
      if (!pendingPackagePhotos.length) {
        container.innerHTML = '';
        return;
      }

      container.innerHTML = pendingPackagePhotos.map((photo, index) => `
        <div style="position:relative;aspect-ratio:1;border-radius:var(--radius-sm);overflow:hidden;border:1px solid var(--border-subtle);">
          <img src="${photo.preview}" alt="Preview" style="width:100%;height:100%;object-fit:cover;">
          <button onclick="removePackagePhoto(${index})" style="position:absolute;top:4px;right:4px;width:24px;height:24px;background:rgba(0,0,0,0.7);color:white;border:none;border-radius:50%;cursor:pointer;font-size:14px;">×</button>
        </div>
      `).join('');
    }

    function removePackagePhoto(index) {
      pendingPackagePhotos.splice(index, 1);
      renderPackagePhotoPreviews();
    }

    async function uploadPackagePhotos(packageId) {
      if (!pendingPackagePhotos.length) return;

      for (const photo of pendingPackagePhotos) {
        try {
          const fileName = `${packageId}/${Date.now()}-${photo.file.name}`;
          
          // Upload to Supabase Storage
          const { data, error } = await supabaseClient.storage
            .from('package-photos')
            .upload(fileName, photo.file);
          
          if (error) {
            console.error('Upload error:', error);
            continue;
          }

          // Get public URL
          const { data: urlData } = supabaseClient.storage
            .from('package-photos')
            .getPublicUrl(fileName);

          // Save to package_photos table
          await supabaseClient.from('package_photos').insert({
            package_id: packageId,
            url: urlData.publicUrl,
            file_name: photo.file.name,
            file_size: photo.file.size,
            photo_type: 'issue'
          });
        } catch (err) {
          console.error('Error uploading photo:', err);
        }
      }
    }


    // ========== SAVE FUNCTIONS ==========
    async function saveVehicle() {
      const make = document.getElementById('v-make').value.trim();
      const model = document.getElementById('v-model').value.trim();
      if (!make || !model) return showToast('Make and model are required', 'error');

      // Upload photo first if one is selected
      let photoUrl = null;
      if (pendingVehiclePhoto) {
        showToast('Uploading photo...', 'success');
        // Create a temporary ID for the upload path
        const tempId = `temp-${Date.now()}`;
        const fileName = `${currentUser.id}/${tempId}-${pendingVehiclePhoto.file.name}`;
        
        try {
          const { data: uploadData, error: uploadError } = await supabaseClient.storage
            .from('vehicle-photos')
            .upload(fileName, pendingVehiclePhoto.file);
          
          if (!uploadError) {
            const { data: urlData } = supabaseClient.storage
              .from('vehicle-photos')
              .getPublicUrl(fileName);
            photoUrl = urlData.publicUrl;
          } else {
            console.error('Photo upload error:', uploadError);
          }
        } catch (err) {
          console.error('Error uploading vehicle photo:', err);
        }
      }

      const year = document.getElementById('v-year').value ? Number(document.getElementById('v-year').value) : null;
      const trim = document.getElementById('v-trim').value || null;
      const fuelInjectionValue = document.getElementById('v-fuel-injection').value || null;
      const fuelInjectionType = fuelInjectionValue || null;

      const vehicleData = {
        owner_id: currentUser.id,
        make, 
        model,
        year,
        trim,
        color: document.getElementById('v-color').value || null,
        nickname: document.getElementById('v-nickname').value.trim() || null,
        mileage: document.getElementById('v-mileage').value ? Number(document.getElementById('v-mileage').value) : null,
        vin: document.getElementById('v-vin').value.trim().toUpperCase() || null,
        health_score: 100,
        photo_url: photoUrl,
        fuel_injection_type: fuelInjectionType
      };

      const { data, error } = await supabaseClient.from('vehicles').insert(vehicleData).select();
      
      if (error) {
        console.error('Vehicle insert error:', error);
        // Show more specific error message
        if (error.code === '42P01') {
          return showToast('Database table not found. Please run the schema setup.', 'error');
        } else if (error.code === '42501') {
          return showToast('Permission denied. Check RLS policies.', 'error');
        } else if (error.message?.includes('violates')) {
          return showToast('Invalid data: ' + error.message, 'error');
        }
        return showToast('Failed to add vehicle: ' + (error.message || 'Unknown error'), 'error');
      }
      
      closeModal('vehicle-modal');
      showToast('Vehicle added to your garage!', 'success');
      await loadVehicles();
      await loadReminders();
      updateStats();
    }

    async function savePackage() {
      const vehicleId = document.getElementById('p-vehicle').value;
      const title = document.getElementById('p-title').value.trim();
      if (!vehicleId || !title) return showToast('Vehicle and title are required', 'error');

      // Check if member has set their location
      if (!userProfile?.zip_code) {
        showToast('Please set your ZIP code in Settings first so providers can find your request.', 'error');
        showSection('settings');
        return;
      }

      // Validate destination service fields if selected
      const pickupPref = document.getElementById('p-pickup').value;
      if (pickupPref === 'destination_service') {
        const destType = document.getElementById('p-destination-type').value;
        if (!destType) {
          return showToast('Please select where your vehicle should be taken', 'error');
        }
        
        // Validate type-specific required fields
        if (destType === 'airport') {
          const airport = document.getElementById('p-airport').value.trim();
          const departureTime = document.getElementById('p-departure-datetime').value;
          if (!airport) return showToast('Please enter the airport', 'error');
          if (!departureTime) return showToast('Please enter departure date and time', 'error');
        } else if (destType === 'dealership') {
          const dealerName = document.getElementById('p-dealership-name').value.trim();
          const dealerAddress = document.getElementById('p-dealership-address').value.trim();
          if (!dealerName) return showToast('Please enter the dealership name', 'error');
          if (!dealerAddress) return showToast('Please enter the dealership address', 'error');
        } else if (destType === 'detail') {
          const shopAddress = document.getElementById('p-detail-shop-address').value.trim();
          if (!shopAddress) return showToast('Please enter the detail shop address', 'error');
        } else if (destType === 'other') {
          const destAddress = document.getElementById('p-other-destination-address').value.trim();
          if (!destAddress) return showToast('Please enter the destination address', 'error');
        }
      }

      // Calculate bidding deadline
      const biddingDeadline = new Date(Date.now() + selectedBiddingWindowHours * 60 * 60 * 1000).toISOString();

      // Build oil preference data if applicable
      const category = document.getElementById('p-category').value;
      let oilPreference = null;
      if (category === 'maintenance' || category === 'manufacturer_service') {
        if (selectedOilPreference === 'specify') {
          oilPreference = {
            choice: 'specify',
            oil_type: document.getElementById('p-oil-type').value,
            brand_preference: document.getElementById('p-oil-brand').value.trim() || null
          };
        } else {
          oilPreference = { choice: 'provider' };
        }
      }

      // Build fitment specs if applicable
      let fitmentSpecs = null;
      if (['performance', 'offroad', 'cosmetic'].includes(category)) {
        const boltPattern = document.getElementById('p-bolt-pattern')?.value.trim();
        const hubBore = document.getElementById('p-hub-bore')?.value.trim();
        const splineType = document.getElementById('p-spline-type')?.value;
        const threadSize = document.getElementById('p-thread-size')?.value.trim();
        const wheelOffset = document.getElementById('p-wheel-offset')?.value.trim();
        const wheelWidth = document.getElementById('p-wheel-width')?.value.trim();
        const fitmentNotes = document.getElementById('p-fitment-notes')?.value.trim();
        
        // Only add if at least one field has data
        if (boltPattern || hubBore || splineType || threadSize || wheelOffset || wheelWidth || fitmentNotes) {
          fitmentSpecs = {
            bolt_pattern: boltPattern || null,
            hub_bore: hubBore || null,
            spline_type: splineType || null,
            thread_size: threadSize || null,
            wheel_offset: wheelOffset || null,
            wheel_width: wheelWidth || null,
            notes: fitmentNotes || null
          };
        }
      }

      // Check if this is a destination service (pickupPref already defined in validation above)
      const isDestinationService = pickupPref === 'destination_service';
      const destinationType = document.getElementById('p-destination-type')?.value || null;

      // Build destination address based on type
      let destinationAddress = null;
      if (isDestinationService && destinationType) {
        if (destinationType === 'airport') {
          destinationAddress = document.getElementById('p-airport')?.value.trim() || null;
        } else if (destinationType === 'dealership') {
          destinationAddress = document.getElementById('p-dealership-address')?.value.trim() || null;
        } else if (destinationType === 'detail') {
          destinationAddress = document.getElementById('p-detail-shop-address')?.value.trim() || null;
        } else if (destinationType === 'other') {
          destinationAddress = document.getElementById('p-other-destination-address')?.value.trim() || null;
        }
      }

      const packageData = {
        member_id: currentUser.id,
        vehicle_id: vehicleId,
        title,
        description: document.getElementById('p-description').value.trim() || null,
        category: category,
        service_type: document.getElementById('p-service-type').value || null,
        frequency: document.getElementById('p-frequency').value,
        parts_preference: selectedPartsTier,
        oil_preference: oilPreference,
        fitment_specs: fitmentSpecs,
        pickup_preference: pickupPref,
        bidding_deadline: biddingDeadline,
        insurance_claim: category === 'accident_repair',
        insurance_company: document.getElementById('p-insurance-carrier')?.value.trim() || null,
        claim_number: document.getElementById('p-claim-number')?.value.trim() || null,
        member_zip: userProfile.zip_code,
        member_city: userProfile.city || null,
        member_state: userProfile.state || null,
        is_destination_service: isDestinationService,
        destination_address: destinationAddress,
        status: 'open'
      };

      // Check if this is a private job request
      const isPrivateJob = document.getElementById('p-private-job')?.checked && userProfile.preferred_provider_id;
      
      if (isPrivateJob) {
        // Private job - send directly to preferred provider, skip bidding
        packageData.is_private_job = true;
        packageData.exclusive_provider_id = userProfile.preferred_provider_id;
        // No exclusive_until for private jobs - they stay private forever
      } else if (userProfile.preferred_provider_id) {
        // Regular job with preferred provider - give exclusive first look
        packageData.exclusive_provider_id = userProfile.preferred_provider_id;
        packageData.exclusive_until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours from now
      }

      const { data, error } = await supabaseClient.from('maintenance_packages').insert(packageData).select();
      if (error) {
        console.error('Package creation error:', error);
        return showToast('Failed to create package: ' + (error.message || 'Unknown error'), 'error');
      }
      
      // Create destination service record if applicable
      if (data && data[0] && isDestinationService && destinationType) {
        const destData = buildDestinationServiceData(data[0].id, destinationType);
        if (destData) {
          const { error: destError } = await supabaseClient.from('destination_services').insert(destData);
          if (destError) {
            console.error('Destination service creation error:', destError);
            // Don't fail the whole operation, just log it
          }
        }
      }
      
      // Upload any photos
      if (data && data[0] && pendingPackagePhotos.length > 0) {
        showToast('Uploading photos...', 'success');
        await uploadPackagePhotos(data[0].id);
      }
      
      // Clear photos
      pendingPackagePhotos = [];
      
      closeModal('package-modal');
      let successMsg;
      if (isPrivateJob) {
        successMsg = 'Private request sent directly to your preferred provider!';
      } else if (isDestinationService) {
        successMsg = 'Transport request created! Only drivers with verified credentials can bid.';
      } else {
        successMsg = 'Package created! Providers have ' + formatBiddingWindow(selectedBiddingWindowHours) + ' to submit bids.';
      }
      showToast(successMsg, 'success');
      await loadPackages();
      updateStats();
    }

    function buildDestinationServiceData(packageId, type) {
      const baseData = {
        package_id: packageId,
        service_type: type === 'other' ? 'valet' : type, // Map 'other' to 'valet' as closest match
        special_instructions: document.getElementById('p-destination-instructions')?.value.trim() || null,
        status: 'pending'
      };

      if (type === 'airport') {
        return {
          ...baseData,
          dropoff_location: document.getElementById('p-airport')?.value.trim() || null,
          trip_type: document.getElementById('p-trip-type')?.value || 'departure',
          flight_number: document.getElementById('p-flight-number')?.value.trim() || null,
          airline: document.getElementById('p-airline')?.value.trim() || null,
          flight_datetime: document.getElementById('p-departure-datetime')?.value 
            ? new Date(document.getElementById('p-departure-datetime').value).toISOString() 
            : null,
          parking_location: document.getElementById('p-parking-preference')?.value || null
        };
      } else if (type === 'dealership') {
        return {
          ...baseData,
          dealership_name: document.getElementById('p-dealership-name')?.value.trim() || null,
          dropoff_location: document.getElementById('p-dealership-address')?.value.trim() || null,
          dealership_service_type: document.getElementById('p-dealership-service-type')?.value || null,
          estimated_pickup_time: document.getElementById('p-dealership-appointment')?.value
            ? new Date(document.getElementById('p-dealership-appointment').value).toISOString()
            : null
        };
      } else if (type === 'detail') {
        return {
          ...baseData,
          dropoff_location: document.getElementById('p-detail-shop-address')?.value.trim() || null,
          detail_service_level: document.getElementById('p-detail-service-level')?.value || null,
          valet_venue: document.getElementById('p-detail-shop-name')?.value.trim() || null // Store shop name in valet_venue
        };
      } else if (type === 'other') {
        return {
          ...baseData,
          dropoff_location: document.getElementById('p-other-destination-address')?.value.trim() || null,
          valet_venue: document.getElementById('p-other-destination-name')?.value.trim() || null
        };
      }

      return baseData;
    }

    function formatBiddingWindow(hours) {
      if (hours < 24) return hours + ' hours';
      const days = hours / 24;
      return days + (days === 1 ? ' day' : ' days');
    }

    function formatCountdown(deadline) {
      const now = new Date();
      const end = new Date(deadline);
      const diff = end - now;
      
      if (diff <= 0) return { text: 'Bidding closed', expired: true, urgent: false };
      
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      
      let text = '';
      if (days > 0) {
        text = `${days}d ${hours}h left`;
      } else if (hours > 0) {
        text = `${hours}h ${minutes}m left`;
      } else {
        text = `${minutes}m left`;
      }
      
      return { 
        text, 
        expired: false, 
        urgent: diff < 4 * 60 * 60 * 1000 // Less than 4 hours
      };
    }

    // ========== REPOST EXPIRED PACKAGE ==========
    async function repostPackage(packageId) {
      const pkg = packages.find(p => p.id === packageId);
      if (!pkg) return;

      // Show repost modal with duration options
      document.getElementById('repost-package-title').textContent = pkg.title;
      document.getElementById('repost-package-id').value = packageId;
      
      // Reset to default 3 days
      selectedRepostHours = 72;
      document.querySelectorAll('.repost-window-option').forEach(o => {
        o.classList.toggle('selected', o.dataset.hours === '72');
      });
      
      document.getElementById('repost-modal').classList.add('active');
    }

    let selectedRepostHours = 72;

    function selectRepostWindow(el) {
      document.querySelectorAll('.repost-window-option').forEach(o => o.classList.remove('selected'));
      el.classList.add('selected');
      selectedRepostHours = parseInt(el.dataset.hours);
    }

    async function confirmRepost() {
      const packageId = document.getElementById('repost-package-id').value;
      if (!packageId) return;

      const newDeadline = new Date(Date.now() + selectedRepostHours * 60 * 60 * 1000).toISOString();

      const { error } = await supabaseClient
        .from('maintenance_packages')
        .update({ 
          bidding_deadline: newDeadline,
          status: 'open',
          updated_at: new Date().toISOString()
        })
        .eq('id', packageId);

      if (error) {
        console.error('Error reposting:', error);
        showToast('Failed to repost package', 'error');
        return;
      }

      closeModal('repost-modal');
      showToast('Package reposted! Providers have ' + formatBiddingWindow(selectedRepostHours) + ' to submit bids.', 'success');
      await loadPackages();
    }

    // ========== EXTEND DEADLINE ==========
    let selectedExtendHours = 24;
    let currentExtendPackage = null;

    function extendDeadline(packageId) {
      const pkg = packages.find(p => p.id === packageId);
      if (!pkg) return;

      currentExtendPackage = pkg;
      selectedExtendHours = 24;

      document.getElementById('extend-package-id').value = packageId;
      document.getElementById('extend-package-title').textContent = pkg.title;
      
      const currentDeadline = new Date(pkg.bidding_deadline);
      document.getElementById('extend-current-deadline').textContent = 
        `Current deadline: ${currentDeadline.toLocaleDateString()} at ${currentDeadline.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

      // Reset selection
      document.querySelectorAll('.extend-option').forEach(opt => opt.classList.remove('selected'));
      document.querySelector('.extend-option[data-hours="24"]').classList.add('selected');

      updateExtendPreview();
      document.getElementById('extend-modal').classList.add('active');
    }

    function selectExtendTime(el) {
      document.querySelectorAll('.extend-option').forEach(opt => opt.classList.remove('selected'));
      el.classList.add('selected');
      selectedExtendHours = parseInt(el.dataset.hours);
      updateExtendPreview();
    }

    function updateExtendPreview() {
      if (!currentExtendPackage) return;
      
      const currentDeadline = new Date(currentExtendPackage.bidding_deadline);
      const newDeadline = new Date(currentDeadline.getTime() + selectedExtendHours * 60 * 60 * 1000);
      
      document.getElementById('extend-new-time').textContent = 
        `${newDeadline.toLocaleDateString()} at ${newDeadline.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }

    async function confirmExtend() {
      const packageId = document.getElementById('extend-package-id').value;
      if (!packageId || !currentExtendPackage) return;

      const currentDeadline = new Date(currentExtendPackage.bidding_deadline);
      const newDeadline = new Date(currentDeadline.getTime() + selectedExtendHours * 60 * 60 * 1000).toISOString();

      const { error } = await supabaseClient
        .from('maintenance_packages')
        .update({ 
          bidding_deadline: newDeadline,
          updated_at: new Date().toISOString()
        })
        .eq('id', packageId);

      if (error) {
        console.error('Error extending deadline:', error);
        showToast('Failed to extend deadline', 'error');
        return;
      }

      closeModal('extend-modal');
      currentExtendPackage = null;
      
      const timeText = selectedExtendHours < 24 ? `${selectedExtendHours} hours` : `${selectedExtendHours / 24} day${selectedExtendHours > 24 ? 's' : ''}`;
      showToast(`Deadline extended by ${timeText}!`, 'success');
      await loadPackages();
    }

    // ========== VIEW PACKAGE WITH BIDS ==========
    async function viewPackage(packageId) {
      currentViewPackage = packageId;
      const pkg = packages.find(p => p.id === packageId);
      if (!pkg) {
        showToast('Package not found', 'error');
        return;
      }

      // Load bids for this package (without join)
      const { data: bids, error: bidsError } = await supabaseClient
        .from('bids')
        .select('*')
        .eq('package_id', packageId)
        .order('created_at', { ascending: false });

      if (bidsError) {
        console.error('Error loading bids:', bidsError);
        showToast('Error loading bids: ' + bidsError.message, 'error');
      }

      // Load provider profiles separately
      if (bids?.length) {
        const providerIds = bids.map(b => b.provider_id);
        const { data: profiles } = await supabaseClient
          .from('profiles')
          .select('id, provider_alias, business_name')
          .in('id', providerIds);
        
        // Attach profile info to bids
        bids.forEach(bid => {
          const profile = profiles?.find(p => p.id === bid.provider_id);
          bid.profiles = profile || null;
        });
      }

      // Store bids for acceptBid function
      currentPackageBids = bids || [];

      // Load provider stats for each bid
      const providerStats = {};
      const providerPerformance = {};
      if (bids?.length) {
        const providerIds = bids.map(b => b.provider_id);
        const { data: stats } = await supabaseClient.from('provider_stats').select('*').in('provider_id', providerIds);
        stats?.forEach(s => providerStats[s.provider_id] = s);
        
        // Load provider performance data
        const { data: perfData } = await getProviderPerformanceByIds(providerIds);
        perfData?.forEach(p => providerPerformance[p.provider_id] = p);
      }

      // Load provider application data for enhanced transparency
      const providerApplications = {};
      if (bids?.length) {
        const providerIds = bids.map(b => b.provider_id);
        const { data: applications } = await supabaseClient
          .from('provider_applications')
          .select('user_id, business_name, years_in_business, services_offered, brand_specializations, license_verified, insurance_verified, certifications_verified')
          .in('user_id', providerIds)
          .eq('status', 'approved');
        applications?.forEach(app => providerApplications[app.user_id] = app);
      }

      const vehicle = pkg.vehicles;
      const vehicleName = vehicle ? (vehicle.nickname || `${vehicle.year || ''} ${vehicle.make} ${vehicle.model}`.trim()) : 'Unknown Vehicle';

      document.getElementById('view-package-title').textContent = pkg.title;
      document.getElementById('view-package-body').innerHTML = `
        <div class="form-section">
          <div class="form-section-title">Package Details</div>
          <div class="package-meta" style="margin-bottom:0;">
            <span>🚗 ${vehicleName}</span>
            <span>📅 Created ${new Date(pkg.created_at).toLocaleDateString()}</span>
            <span>🔄 ${formatFrequency(pkg.frequency)}</span>
            <span>🔧 ${pkg.parts_preference || 'Standard'} parts</span>
          </div>
          ${pkg.description ? `<p style="color:var(--text-secondary);margin-top:16px;line-height:1.6;">${pkg.description}</p>` : ''}
        </div>

        <div class="form-section">
          <div class="form-section-title">Bids (${bids?.length || 0})</div>
          ${!bids?.length ? '<p style="color:var(--text-muted);">No bids yet. Providers are reviewing your package.</p>' : `
            <div class="bids-list">
              ${bids.map(bid => {
                const stats = providerStats[bid.provider_id] || {};
                const perf = providerPerformance[bid.provider_id];
                const appData = providerApplications[bid.provider_id] || {};
                const rating = perf?.rating_avg ? perf.rating_avg.toFixed(1) : (stats.average_rating ? stats.average_rating.toFixed(1) : 'New');
                const jobs = perf?.jobs_completed || stats.jobs_completed || 0;
                const providerName = bid.profiles?.provider_alias || `Provider #${bid.provider_id.slice(0,4).toUpperCase()}`;
                const businessName = appData.business_name || bid.profiles?.business_name;
                const yearsInBusiness = appData.years_in_business;
                const isVerified = appData.license_verified && appData.insurance_verified && appData.certifications_verified;
                const services = appData.services_offered || [];
                const brands = appData.brand_specializations || [];
                const specialties = [...services.slice(0, 2), ...brands.slice(0, 1)].slice(0, 3);
                const bidPrice = bid.price || 0;
                
                // Performance data
                const tier = perf?.tier || 'bronze';
                const tierIcon = {'platinum': '💎', 'gold': '🥇', 'silver': '🥈', 'bronze': '🥉'}[tier] || '🥉';
                const tierColors = {'platinum': '#e5e4e2', 'gold': 'var(--accent-gold)', 'silver': '#c0c0c0', 'bronze': '#cd7f32'};
                const overallScore = perf?.overall_score ? Math.round(perf.overall_score) : null;
                const onTimeRate = perf?.on_time_rate && jobs > 0 ? Math.round(perf.on_time_rate) : null;
                const badges = perf?.badges || [];
                const badgeIcons = {'top_rated': '🏆', 'quick_responder': '⚡', 'veteran': '🎖️', 'perfect_score': '⭐', 'dispute_free': '🛡️'};
                
                return `
                  <div class="bid-card" style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:20px;margin-bottom:12px;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
                      <div style="display:flex;gap:12px;align-items:flex-start;">
                        <div style="width:48px;height:48px;background:var(--accent-gold-soft);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">🔧</div>
                        <div>
                          <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">
                            <h4 style="margin:0;font-size:1rem;">${providerName}</h4>
                            ${perf ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:100px;font-size:0.7rem;font-weight:600;background:${tierColors[tier]}20;color:${tierColors[tier]};border:1px solid ${tierColors[tier]}40;">${tierIcon} ${tier.charAt(0).toUpperCase() + tier.slice(1)}</span>` : ''}
                          </div>
                          <div style="font-size:0.82rem;color:var(--text-secondary);margin-top:2px;">
                            ${businessName && businessName !== providerName ? `${businessName}` : ''}
                            ${businessName && businessName !== providerName && yearsInBusiness ? ' • ' : ''}
                            ${yearsInBusiness ? `${yearsInBusiness} years in business` : ''}
                          </div>
                          <div style="font-size:0.85rem;color:var(--text-muted);margin-top:4px;">
                            ⭐ ${rating} 
                            ${jobs > 0 ? `• ${jobs} jobs` : '• New provider'}
                            ${onTimeRate !== null ? ` • ${onTimeRate}% on-time` : ''}
                            ${overallScore !== null ? ` • Score: ${overallScore}` : ''}
                          </div>
                          ${badges.length > 0 ? `<div style="display:flex;gap:4px;margin-top:6px;">${badges.map(b => `<span title="${b.replace('_', ' ')}" style="font-size:1rem;">${badgeIcons[b] || ''}</span>`).join('')}</div>` : ''}
                        </div>
                      </div>
                      <div style="text-align:right;">
                        <div style="font-size:1.4rem;font-weight:600;color:var(--accent-gold);">$${bidPrice.toFixed(2)}</div>
                        <div style="display:inline-flex;align-items:center;gap:4px;background:linear-gradient(135deg,rgba(16,185,129,0.15),rgba(16,185,129,0.05));border:1px solid rgba(16,185,129,0.3);color:#10b981;padding:3px 8px;border-radius:100px;font-size:0.7rem;font-weight:600;margin-top:4px;cursor:help;" title="This price includes all parts, labor, taxes, shop fees, disposal fees, and platform fees. No hidden costs or surprises.">✓ All-Inclusive</div>
                        ${bid.status === 'accepted' ? '<span style="color:var(--accent-green);font-size:0.8rem;display:block;margin-top:4px;">✓ Accepted</span>' : ''}
                        ${bid.status === 'rejected' ? '<span style="color:var(--accent-red);font-size:0.8rem;display:block;margin-top:4px;">✗ Not selected</span>' : ''}
                      </div>
                    </div>
                    
                    ${isVerified || specialties.length > 0 ? `
                      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
                        ${isVerified ? `<span style="display:inline-flex;align-items:center;gap:4px;background:linear-gradient(135deg, var(--accent-gold), #c49a45);color:#0a0a0f;padding:4px 10px;border-radius:100px;font-size:0.75rem;font-weight:600;">✓ Concierge Verified</span>` : ''}
                        ${specialties.map(s => `<span style="display:inline-block;background:var(--bg-input);border:1px solid var(--border-subtle);color:var(--text-secondary);padding:3px 10px;border-radius:100px;font-size:0.75rem;">${s}</span>`).join('')}
                      </div>
                    ` : ''}
                    
                    ${bid.parts_cost || bid.labor_cost ? `
                      <div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:8px;">
                        ${bid.parts_cost ? `Parts: $${bid.parts_cost.toFixed(2)}` : ''}
                        ${bid.parts_cost && bid.labor_cost ? ' • ' : ''}
                        ${bid.labor_cost ? `Labor: $${bid.labor_cost.toFixed(2)}` : ''}
                      </div>
                    ` : ''}
                    ${bid.estimated_duration ? `<div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:8px;">⏱️ Estimated time: ${bid.estimated_duration}</div>` : ''}
                    ${bid.available_dates ? `<div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:8px;">📅 Availability: ${bid.available_dates}</div>` : ''}
                    ${bid.notes ? `<div style="color:var(--text-secondary);margin-bottom:12px;padding:12px;background:var(--bg-input);border-radius:var(--radius-sm);font-size:0.9rem;">"${bid.notes}"</div>` : ''}
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                      <button class="btn btn-secondary btn-sm" onclick="openMessageWithProvider('${packageId}', '${bid.provider_id}')">💬 Message</button>
                      ${pkg.status === 'open' && bid.status === 'pending' ? `<button class="btn btn-primary btn-sm" onclick="acceptBid('${bid.id}', '${packageId}')">✓ Accept Bid</button>` : ''}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>

        ${await renderEscrowPaymentSection(pkg, bids)}

        ${(pkg.status === 'accepted' || pkg.status === 'in_progress') ? `
          <div class="form-section" id="logistics-dashboard-${packageId}">
            <div class="form-section-title">🎉 Service Coordination Dashboard</div>
            <p style="color:var(--text-secondary);margin-bottom:20px;">Coordinate scheduling, vehicle transfer, and location with your service provider.</p>
            
            <!-- Scheduling Section -->
            <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:20px;margin-bottom:16px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h4 style="margin:0;font-size:1rem;display:flex;align-items:center;gap:8px;">📅 Appointment Scheduling</h4>
              </div>
              <div id="appointment-status-${packageId}" style="margin-bottom:16px;">
                <div style="color:var(--text-muted);font-size:0.9rem;">Loading appointment status...</div>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button class="btn btn-primary btn-sm" onclick="openScheduleModal('${packageId}', '${pkg.member_id}', '${acceptedBid?.provider_id || ''}')">📅 Propose Appointment</button>
              </div>
            </div>

            <!-- Vehicle Transfer Section -->
            <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:20px;margin-bottom:16px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h4 style="margin:0;font-size:1rem;display:flex;align-items:center;gap:8px;">🚗 Vehicle Transfer</h4>
              </div>
              <div id="transfer-status-${packageId}" style="margin-bottom:16px;">
                <div style="color:var(--text-muted);font-size:0.9rem;">Loading transfer status...</div>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button class="btn btn-secondary btn-sm" onclick="openTransferModal('${packageId}', '${pkg.member_id}', '${acceptedBid?.provider_id || ''}')">⚙️ Setup Transfer</button>
              </div>
            </div>

            <!-- Location Sharing Section -->
            <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:20px;margin-bottom:16px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h4 style="margin:0;font-size:1rem;display:flex;align-items:center;gap:8px;">📍 Location Sharing</h4>
              </div>
              <div id="location-status-${packageId}" style="margin-bottom:16px;">
                <div style="color:var(--text-muted);font-size:0.9rem;">Share your location for pickup coordination.</div>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button class="btn btn-primary btn-sm" onclick="shareMyLocation('${packageId}', '${acceptedBid?.provider_id || ''}')">📍 Share My Location</button>
                <button class="btn btn-secondary btn-sm" onclick="viewSharedLocation('${packageId}')">🗺️ View Provider Location</button>
              </div>
            </div>

            <!-- Vehicle Condition Evidence Section -->
            <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:20px;margin-bottom:16px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h4 style="margin:0;font-size:1rem;display:flex;align-items:center;gap:8px;">📸 Vehicle Condition Evidence</h4>
              </div>
              <div id="evidence-timeline-${packageId}" style="margin-bottom:16px;">
                <div style="color:var(--text-muted);font-size:0.9rem;">Loading evidence timeline...</div>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button class="btn btn-primary btn-sm" onclick="openMemberEvidenceModal('${packageId}', 'pre_pickup')">📸 Document Pre-Pickup Condition</button>
              </div>
            </div>

            <!-- Key Exchange Verification Section -->
            <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:20px;margin-bottom:16px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h4 style="margin:0;font-size:1rem;display:flex;align-items:center;gap:8px;">🔑 Key Exchange Verification</h4>
              </div>
              <p style="color:var(--text-muted);font-size:0.9rem;margin-bottom:16px;">Track key handoffs between you and the provider for security and liability protection.</p>
              <div id="key-exchange-timeline-${packageId}">
                <div style="color:var(--text-muted);font-size:0.9rem;">Loading key exchange status...</div>
              </div>
            </div>

            <!-- Inspection Report Section -->
            <div id="inspection-report-container-${packageId}" style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:20px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h4 style="margin:0;font-size:1rem;display:flex;align-items:center;gap:8px;">🔍 Multi-Point Inspection</h4>
              </div>
              <div id="inspection-report-content-${packageId}">
                <div style="color:var(--text-muted);font-size:0.9rem;">Loading inspection report...</div>
              </div>
            </div>
          </div>
        ` : ''}
        ${(pkg.status === 'accepted' || pkg.status === 'in_progress') ? `<div id="logistics-loader-${packageId}" data-load-logistics="true"></div>` : ''}

        ${pkg.status === 'in_progress' || pkg.status === 'accepted' ? `
          <div class="form-section" style="margin-top:24px;padding-top:20px;border-top:1px solid var(--border-subtle);">
            <div class="form-section-title">Job Status</div>
            <div class="alert info" style="margin-bottom:16px;padding:16px;background:var(--accent-blue-soft);border:1px solid rgba(74,124,255,0.3);color:var(--accent-blue);border-radius:var(--radius-md);">
              ${pkg.status === 'accepted' ? '⏳ Waiting for provider to start work...' : '🔧 Work is in progress...'}
            </div>
            ${pkg.work_completed_at && pkg.status === 'in_progress' ? `
              <div class="alert" style="margin-bottom:16px;padding:16px;background:var(--accent-green-soft);border:1px solid rgba(74,200,140,0.3);color:var(--accent-green);border-radius:var(--radius-md);">
                ✓ Provider has marked work as complete on ${new Date(pkg.work_completed_at).toLocaleDateString()}
              </div>
              <p style="color:var(--text-secondary);margin-bottom:16px;">Once you receive your vehicle and verify the work is complete, confirm below to release payment to the provider.</p>
              <div style="display:flex;gap:12px;">
                <button class="btn btn-primary" onclick="openReleasePaymentModal('${packageId}')">✓ Confirm Complete & Release Payment</button>
                <button class="btn btn-danger btn-sm" onclick="openDispute('${packageId}')">⚠️ Open Dispute</button>
              </div>
            ` : ''}
          </div>
        ` : ''}

        ${pkg.status === 'completed' ? `
          <div class="form-section" style="margin-top:24px;padding-top:20px;border-top:1px solid var(--border-subtle);">
            <div class="form-section-title">✓ Completed</div>
            <div class="alert" style="background:var(--accent-green-soft);border:1px solid rgba(74,200,140,0.3);color:var(--accent-green);padding:16px;border-radius:var(--radius-md);margin-bottom:16px;">
              ✓ This job was completed on ${new Date(pkg.member_confirmed_at || pkg.work_completed_at).toLocaleDateString()}
            </div>
            <button class="btn btn-secondary" onclick="openReviewModal('${packageId}')">⭐ Leave a Review</button>
          </div>
        ` : ''}
      `;

      document.getElementById('view-package-modal').classList.add('active');
      
      // Load logistics data if applicable
      if (pkg.status === 'accepted' || pkg.status === 'in_progress') {
        setTimeout(() => loadLogisticsData(packageId), 100);
      }
    }

    // Store bids for the current package
    let currentPackageBids = [];

    async function acceptBid(bidId, packageId) {
      const bid = currentPackageBids.find(b => b.id === bidId);
      if (!bid) {
        showToast('Bid not found', 'error');
        return;
      }
      
      const amount = bid.price || 0;
      const mccFee = amount * 0.075;
      const providerAmount = amount - mccFee;

      if (!confirm(`Accept this bid for $${amount.toFixed(2)}?\n\nThis will:\n• Hold payment in escrow\n• Close the package to other providers\n• Notify the provider to begin work\n\nMCC Fee (7.5%): $${mccFee.toFixed(2)}\nProvider receives: $${providerAmount.toFixed(2)}`)) return;

      try {
        // Update this bid to accepted
        await supabaseClient.from('bids').update({ status: 'accepted' }).eq('id', bidId);
        
        // Reject all other bids for this package
        await supabaseClient.from('bids').update({ status: 'rejected' }).eq('package_id', packageId).neq('id', bidId);
        
        // Update package status
        await supabaseClient.from('maintenance_packages').update({ 
          status: 'accepted', 
          accepted_bid_id: bidId, 
          accepted_at: new Date().toISOString() 
        }).eq('id', packageId);

        // Create payment record (escrow)
        await supabaseClient.from('payments').insert({
          package_id: packageId,
          member_id: currentUser.id,
          provider_id: bid.provider_id,
          amount_total: amount,
          amount_provider: providerAmount,
          mcc_fee: mccFee,
          status: 'held',
          held_at: new Date().toISOString()
        });

        // Notify provider that their bid was accepted (in-app + email)
        const pkg = packages.find(p => p.id === packageId);
        try {
          // In-app notification
          await supabaseClient.from('notifications').insert({
            user_id: bid.provider_id,
            type: 'bid_accepted',
            title: '🎉 Your bid was accepted!',
            message: `Your bid of $${amount.toFixed(2)} for "${pkg?.title || 'Maintenance Package'}" has been accepted. Contact the member to schedule the work.`,
            link_type: 'package',
            link_id: packageId
          });

          // Email notification to provider
          const { data: providerProfile } = await supabaseClient.from('profiles').select('email, full_name, business_name').eq('id', bid.provider_id).single();
          if (providerProfile?.email && typeof EmailService !== 'undefined') {
            await EmailService.sendBidAcceptedEmail(
              providerProfile.email,
              providerProfile.business_name || providerProfile.full_name || 'Provider',
              pkg?.title || 'Maintenance Package',
              amount
            );
          }
        } catch (e) {
          console.log('Notification error (non-critical):', e);
        }

        closeModal('view-package-modal');
        showToast('Bid accepted! Please authorize payment to hold funds in escrow.', 'success');
        await loadPackages();
        
        // Re-open the package view to show payment section
        setTimeout(() => viewPackage(packageId), 500);
      } catch (err) {
        console.error('Error accepting bid:', err);
        showToast('Failed to accept bid. Please try again.', 'error');
      }
    }

    // ========== ESCROW PAYMENT UI ==========
    let currentEscrowCardElement = null;
    let currentEscrowElements = null;
    let currentEscrowClientSecret = null;
    let currentEscrowPackageId = null;
    let currentEscrowBidId = null;

    async function renderEscrowPaymentSection(pkg, bids) {
      if (!pkg) return '';
      
      const acceptedBid = bids?.find(b => b.status === 'accepted');
      
      // Only show payment section for accepted packages
      if (pkg.status !== 'accepted' && pkg.status !== 'in_progress' && pkg.status !== 'completed') {
        return '';
      }
      
      // Get payment status
      let paymentData = null;
      try {
        const { data } = await supabaseClient.from('payments')
          .select('*')
          .eq('package_id', pkg.id)
          .single();
        paymentData = data;
      } catch (e) {
        // No payment record yet
      }
      
      const providerName = acceptedBid?.profiles?.provider_alias || acceptedBid?.profiles?.business_name || `Provider #${acceptedBid?.provider_id?.slice(0,4).toUpperCase()}`;
      const amount = acceptedBid?.price || 0;
      const mccFee = amount * 0.075;
      const providerAmount = amount - mccFee;
      
      // Determine payment status
      const paymentStatus = paymentData?.status || 'awaiting_payment';
      
      let statusBadge = '';
      let statusColor = '';
      let statusIcon = '';
      
      switch(paymentStatus) {
        case 'held':
        case 'authorized':
          statusBadge = 'Payment Authorized';
          statusColor = 'var(--accent-blue)';
          statusIcon = '🔒';
          break;
        case 'released':
        case 'completed':
          statusBadge = 'Payment Released';
          statusColor = 'var(--accent-green)';
          statusIcon = '✓';
          break;
        case 'refunded':
          statusBadge = 'Payment Refunded';
          statusColor = 'var(--accent-orange)';
          statusIcon = '↩️';
          break;
        case 'disputed':
          statusBadge = 'Payment Disputed';
          statusColor = 'var(--accent-red)';
          statusIcon = '⚠️';
          break;
        default:
          statusBadge = 'Awaiting Payment';
          statusColor = 'var(--accent-orange)';
          statusIcon = '💳';
      }
      
      // Payment already released or completed
      if (paymentStatus === 'released' || paymentStatus === 'completed') {
        return `
          <div class="form-section" id="escrow-payment-section-${pkg.id}">
            <div class="form-section-title">💳 Payment</div>
            <div style="background:var(--accent-green-soft);border:1px solid rgba(52,211,153,0.3);border-radius:var(--radius-lg);padding:20px;">
              <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                <span style="font-size:1.5rem;">✓</span>
                <div>
                  <div style="font-weight:600;color:var(--accent-green);font-size:1.1rem;">Payment Released</div>
                  <div style="color:var(--text-secondary);font-size:0.9rem;">$${amount.toFixed(2)} sent to ${providerName}</div>
                </div>
              </div>
              ${paymentData?.released_at ? `<div style="color:var(--text-muted);font-size:0.85rem;">Released on ${new Date(paymentData.released_at).toLocaleDateString()}</div>` : ''}
            </div>
          </div>
        `;
      }
      
      // Payment held - show status and release option
      if (paymentStatus === 'held' || paymentStatus === 'authorized') {
        const showReleaseButton = pkg.status === 'in_progress' && pkg.work_completed_at;
        
        return `
          <div class="form-section" id="escrow-payment-section-${pkg.id}">
            <div class="form-section-title">💳 Payment</div>
            <div style="background:var(--accent-blue-soft);border:1px solid rgba(56,189,248,0.3);border-radius:var(--radius-lg);padding:20px;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
                <div style="display:flex;align-items:center;gap:12px;">
                  <span style="font-size:1.5rem;">🔒</span>
                  <div>
                    <div style="font-weight:600;color:var(--accent-blue);font-size:1.1rem;">Payment Authorized</div>
                    <div style="color:var(--text-secondary);font-size:0.9rem;">Funds held securely in escrow</div>
                  </div>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:1.4rem;font-weight:700;color:var(--text-primary);">$${amount.toFixed(2)}</div>
                  <div style="color:var(--text-muted);font-size:0.85rem;">for ${providerName}</div>
                </div>
              </div>
              
              <div style="background:var(--bg-card);border-radius:var(--radius-md);padding:12px;margin-bottom:16px;">
                <div style="display:flex;justify-content:space-between;font-size:0.9rem;margin-bottom:6px;">
                  <span style="color:var(--text-secondary);">Total Amount</span>
                  <span style="color:var(--text-primary);">$${amount.toFixed(2)}</span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:0.85rem;margin-bottom:6px;">
                  <span style="color:var(--text-muted);">Provider receives</span>
                  <span style="color:var(--text-secondary);">$${providerAmount.toFixed(2)}</span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:0.85rem;">
                  <span style="color:var(--text-muted);">Platform fee (7.5%)</span>
                  <span style="color:var(--text-muted);">$${mccFee.toFixed(2)}</span>
                </div>
              </div>
              
              <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:16px;">
                💡 Payment will be released to the provider when you confirm the work is complete.
              </p>
              
              ${showReleaseButton ? `
                <button class="btn btn-success" onclick="openReleasePaymentModal('${pkg.id}')" style="width:100%;">
                  ✓ Confirm Complete & Release Payment
                </button>
              ` : ''}
            </div>
          </div>
        `;
      }
      
      // Awaiting payment - show card form
      return `
        <div class="form-section" id="escrow-payment-section-${pkg.id}">
          <div class="form-section-title">💳 Authorize Payment</div>
          <div style="background:var(--accent-orange-soft);border:1px solid rgba(251,146,60,0.3);border-radius:var(--radius-lg);padding:20px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
              <div style="display:flex;align-items:center;gap:12px;">
                <span style="font-size:1.5rem;">💳</span>
                <div>
                  <div style="font-weight:600;color:var(--accent-orange);font-size:1.1rem;">Awaiting Payment</div>
                  <div style="color:var(--text-secondary);font-size:0.9rem;">Authorize payment to hold funds in escrow</div>
                </div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:1.4rem;font-weight:700;color:var(--text-primary);">$${amount.toFixed(2)}</div>
                <div style="color:var(--text-muted);font-size:0.85rem;">for ${providerName}</div>
              </div>
            </div>
            
            <div style="background:var(--bg-card);border-radius:var(--radius-md);padding:12px;margin-bottom:20px;">
              <div style="display:flex;justify-content:space-between;font-size:0.9rem;margin-bottom:6px;">
                <span style="color:var(--text-secondary);">Total Amount</span>
                <span style="color:var(--text-primary);">$${amount.toFixed(2)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:0.85rem;margin-bottom:6px;">
                <span style="color:var(--text-muted);">Provider receives</span>
                <span style="color:var(--text-secondary);">$${providerAmount.toFixed(2)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:0.85rem;">
                <span style="color:var(--text-muted);">Platform fee (7.5%)</span>
                <span style="color:var(--text-muted);">$${mccFee.toFixed(2)}</span>
              </div>
            </div>
            
            <div style="margin-bottom:20px;">
              <label style="display:block;margin-bottom:8px;font-size:0.9rem;color:var(--text-secondary);">Card Details</label>
              <div id="escrow-card-element-${pkg.id}" style="background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:14px;min-height:44px;"></div>
              <div id="escrow-card-errors-${pkg.id}" style="color:var(--accent-red);font-size:0.85rem;margin-top:8px;"></div>
            </div>
            
            <div style="background:var(--bg-input);border-radius:var(--radius-md);padding:12px;margin-bottom:20px;">
              <div style="display:flex;align-items:center;gap:8px;color:var(--text-secondary);font-size:0.85rem;">
                <span>🔒</span>
                <span>Your payment is secured. Funds are held in escrow and only released when you confirm the work is complete.</span>
              </div>
            </div>
            
            <button id="authorize-payment-btn-${pkg.id}" class="btn btn-primary" onclick="authorizeEscrowPayment('${pkg.id}', '${acceptedBid?.id}')" style="width:100%;">
              🔒 Authorize Payment ($${amount.toFixed(2)})
            </button>
          </div>
        </div>
        
        <script>
          (function() {
            setTimeout(() => mountEscrowCardElement('${pkg.id}'), 100);
          })();
        </script>
      `;
    }

    async function mountEscrowCardElement(packageId) {
      try {
        const stripe = await initStripe();
        if (!stripe) {
          console.error('Stripe not initialized');
          const errorEl = document.getElementById(`escrow-card-errors-${packageId}`);
          if (errorEl) errorEl.textContent = 'Payment system unavailable. Please try again later.';
          return;
        }
        
        const elements = stripe.elements({
          appearance: {
            theme: 'night',
            variables: {
              colorPrimary: '#c9a227',
              colorBackground: 'rgba(30, 38, 48, 0.9)',
              colorText: '#f5f5f7',
              colorDanger: '#f87171',
              fontFamily: 'Outfit, -apple-system, sans-serif',
              borderRadius: '8px'
            }
          }
        });
        
        const cardElement = elements.create('card', {
          style: {
            base: {
              color: '#f5f5f7',
              fontFamily: 'Outfit, -apple-system, sans-serif',
              fontSmoothing: 'antialiased',
              fontSize: '16px',
              '::placeholder': {
                color: '#6b7280'
              }
            },
            invalid: {
              color: '#f87171',
              iconColor: '#f87171'
            }
          }
        });
        
        const containerEl = document.getElementById(`escrow-card-element-${packageId}`);
        if (containerEl) {
          cardElement.mount(`#escrow-card-element-${packageId}`);
          
          cardElement.on('change', (event) => {
            const errorEl = document.getElementById(`escrow-card-errors-${packageId}`);
            if (errorEl) {
              errorEl.textContent = event.error ? event.error.message : '';
            }
          });
          
          currentEscrowCardElement = cardElement;
          currentEscrowElements = elements;
          currentEscrowPackageId = packageId;
        }
      } catch (err) {
        console.error('Error mounting card element:', err);
        const errorEl = document.getElementById(`escrow-card-errors-${packageId}`);
        if (errorEl) errorEl.textContent = 'Failed to load payment form. Please refresh the page.';
      }
    }

    async function authorizeEscrowPayment(packageId, bidId) {
      const btn = document.getElementById(`authorize-payment-btn-${packageId}`);
      const errorEl = document.getElementById(`escrow-card-errors-${packageId}`);
      
      if (!currentEscrowCardElement) {
        if (errorEl) errorEl.textContent = 'Payment form not loaded. Please refresh the page.';
        return;
      }
      
      try {
        // Disable button and show loading
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:8px;"><span class="spinner"></span> Processing...</span>';
        }
        if (errorEl) errorEl.textContent = '';
        
        // Step 1: Create escrow PaymentIntent
        const escrowData = await createEscrowPayment(packageId, bidId);
        
        if (!escrowData.client_secret) {
          throw new Error('Failed to create payment. Please try again.');
        }
        
        currentEscrowClientSecret = escrowData.client_secret;
        currentEscrowBidId = bidId;
        
        // Step 2: Confirm the payment with the card
        const paymentIntent = await confirmEscrowPayment(currentEscrowClientSecret, currentEscrowCardElement);
        
        if (paymentIntent.status === 'requires_capture' || paymentIntent.status === 'succeeded') {
          // Step 3: Mark payment as held in database
          await confirmEscrowHeld(packageId);
          
          showToast('Payment authorized! Funds are now held in escrow.', 'success');
          
          // Refresh the view to show updated status
          await loadPackages();
          setTimeout(() => viewPackage(packageId), 300);
        } else {
          throw new Error('Payment authorization failed. Please try again.');
        }
        
      } catch (err) {
        console.error('Escrow payment error:', err);
        if (errorEl) errorEl.textContent = err.message || 'Payment failed. Please try again.';
        showToast(err.message || 'Payment failed. Please try again.', 'error');
        
        // Re-enable button
        if (btn) {
          btn.disabled = false;
          const pkg = packages.find(p => p.id === packageId);
          const amount = currentPackageBids?.find(b => b.id === bidId)?.price || 0;
          btn.innerHTML = `🔒 Authorize Payment ($${amount.toFixed(2)})`;
        }
      }
    }

    async function confirmJobAndReleasePayment(packageId) {
      if (!confirm('Confirm that the work is complete and you have received your vehicle?\n\nThis will release the escrowed payment to the provider.')) return;
      
      try {
        showToast('Releasing payment...', 'info');
        
        // Release the escrow payment via API
        await releaseEscrowPayment(packageId);
        
        // The API handles updating the payment record, package status, etc.
        showToast('Payment released! Thank you for using My Car Concierge.', 'success');
        
        closeModal('view-package-modal');
        await loadPackages();
        await loadServiceHistory();
        
        // Get provider info for review modal
        const pkg = packages.find(p => p.id === packageId);
        const { data: bid } = await supabaseClient.from('bids')
          .select('*, profiles:provider_id(provider_alias, business_name, full_name)')
          .eq('package_id', packageId)
          .eq('status', 'accepted')
          .single();
        
        // Open review modal
        if (bid) {
          setTimeout(() => {
            openReviewModal(packageId, bid.provider_id, bid.profiles?.business_name || bid.profiles?.full_name, pkg?.title, bid.price);
          }, 500);
        }
      } catch (err) {
        console.error('Error releasing payment:', err);
        showToast('Failed to release payment: ' + (err.message || 'Please try again.'), 'error');
      }
    }

    async function confirmCompletion(packageId) {
      if (!confirm('Confirm that the work is complete and you have received your vehicle?\n\nThis will release payment to the provider.')) return;

      try {
        // Get the package and accepted bid for provider info
        const pkg = packages.find(p => p.id === packageId);
        const { data: bid } = await supabaseClient.from('bids').select('*, profiles:provider_id(provider_alias)').eq('package_id', packageId).eq('status', 'accepted').single();

        // Update package
        await supabaseClient.from('maintenance_packages').update({
          status: 'completed',
          member_confirmed_at: new Date().toISOString()
        }).eq('id', packageId);

        // Release payment
        await supabaseClient.from('payments').update({
          status: 'released',
          released_at: new Date().toISOString()
        }).eq('package_id', packageId);

        // Record commission for member founder (if member was referred)
        // The RPC function fetches the actual platform fee from the database for security
        if (currentUser?.id) {
          try {
            await supabaseClient.rpc('record_platform_fee_commission', {
              p_member_id: currentUser.id,
              p_platform_fee: 0,
              p_package_id: packageId
            });
          } catch (commErr) {
            console.log('Commission tracking (non-critical):', commErr);
          }
        }

        // Create service history record
        const vehicle = vehicles.find(v => v.id === pkg?.vehicle_id);
        await supabaseClient.from('service_history').insert({
          vehicle_id: pkg?.vehicle_id,
          package_id: packageId,
          provider_id: bid?.provider_id,
          service_date: new Date().toISOString().split('T')[0],
          service_type: pkg?.service_type,
          service_category: pkg?.category,
          description: pkg?.title,
          mileage_at_service: vehicle?.mileage,
          total_cost: bid?.price,
          provider_name: bid?.profiles?.provider_alias || `Provider #${bid?.provider_id?.slice(0,4).toUpperCase()}`
        });

        closeModal('view-package-modal');
        showToast('Payment released! Thank you for using My Car Concierge.', 'success');
        await loadPackages();
        await loadServiceHistory();

        // Open review modal
        setTimeout(() => {
          openReviewModal(packageId, bid?.provider_id, bid?.profiles?.business_name || bid?.profiles?.full_name, pkg?.title, bid?.price);
        }, 500);
      } catch (err) {
        console.error('Error confirming completion:', err);
        showToast('Error completing job. Please try again.', 'error');
      }
    }

    // ========== RELEASE PAYMENT MODAL ==========
    let currentReleasePackageId = null;
    let currentReleasePackageData = null;
    let currentReleaseBidData = null;

    async function openReleasePaymentModal(packageId) {
      currentReleasePackageId = packageId;
      
      const pkg = packages.find(p => p.id === packageId);
      if (!pkg) {
        showToast('Package not found', 'error');
        return;
      }
      currentReleasePackageData = pkg;

      // Get the accepted bid info
      const { data: bid } = await supabaseClient.from('bids')
        .select('*, profiles:provider_id(provider_alias, business_name, full_name)')
        .eq('package_id', packageId)
        .eq('status', 'accepted')
        .single();
      
      currentReleaseBidData = bid;

      // Get payment info
      const payment = packagePaymentStatuses[packageId];
      const amount = payment?.amount_total || bid?.price || 0;

      // Populate modal
      document.getElementById('release-payment-service').textContent = pkg.title || 'Service Package';
      document.getElementById('release-payment-provider').textContent = 
        bid?.profiles?.provider_alias || bid?.profiles?.business_name || `Provider #${bid?.provider_id?.slice(0,4).toUpperCase()}` || 'Provider';
      document.getElementById('release-payment-amount').textContent = `$${amount.toFixed(2)}`;

      // Reset checkbox
      const checkbox = document.getElementById('release-payment-confirm-checkbox');
      checkbox.checked = false;
      document.getElementById('release-payment-btn').disabled = true;

      // Add checkbox change handler
      checkbox.onchange = function() {
        document.getElementById('release-payment-btn').disabled = !this.checked;
      };

      // Open modal
      openModal('release-payment-modal');
    }

    async function confirmReleasePayment() {
      const checkbox = document.getElementById('release-payment-confirm-checkbox');
      if (!checkbox.checked) {
        showToast('Please confirm by checking the box', 'error');
        return;
      }

      if (!currentReleasePackageId) {
        showToast('Package not found', 'error');
        return;
      }

      const btn = document.getElementById('release-payment-btn');
      const originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span style="opacity:0.7;">Releasing payment...</span>';

      try {
        // Server handles ALL updates atomically (security fix: no client-side DB updates)
        // releaseEscrowPayment calls /api/escrow/release/:packageId which:
        // - Captures Stripe payment
        // - Updates maintenance_packages status to 'completed'
        // - Updates payments status to 'released'
        // - Creates service_history record
        let releaseResult = null;
        if (typeof releaseEscrowPayment === 'function') {
          releaseResult = await releaseEscrowPayment(currentReleasePackageId);
        }

        // Record commission if applicable (non-critical, can remain client-side)
        if (currentUser?.id) {
          try {
            await supabaseClient.rpc('record_platform_fee_commission', {
              p_member_id: currentUser.id,
              p_platform_fee: 0,
              p_package_id: currentReleasePackageId
            });
          } catch (commErr) {
            console.log('Commission tracking (non-critical):', commErr);
          }
        }

        closeModal('release-payment-modal');
        closeModal('view-package-modal');
        showToast('Payment released! Thank you for using My Car Concierge.', 'success');
        
        await loadPackages();
        if (typeof loadServiceHistory === 'function') {
          await loadServiceHistory();
        }

        // Open review modal using data from release result or cached data
        const pkg = currentReleasePackageData;
        const bid = currentReleaseBidData;
        const reviewProviderId = releaseResult?.provider_id || bid?.provider_id;
        
        setTimeout(() => {
          openReviewModal(
            currentReleasePackageId,
            reviewProviderId,
            bid?.profiles?.business_name || bid?.profiles?.full_name,
            pkg?.title,
            bid?.price
          );
        }, 500);

        // Reset state
        currentReleasePackageId = null;
        currentReleasePackageData = null;
        currentReleaseBidData = null;

      } catch (err) {
        console.error('Error releasing payment:', err);
        btn.disabled = false;
        btn.innerHTML = originalText;
        showToast('Failed to release payment: ' + (err.message || 'Please try again.'), 'error');
      }
    }

    // ========== REVIEWS ==========
    let currentReviewPackageId = null;
    let currentReviewProviderId = null;

    function openReviewModal(packageId, providerId, providerName, serviceTitle, amount) {
      currentReviewPackageId = packageId;
      currentReviewProviderId = providerId;
      
      document.getElementById('review-provider-name').textContent = providerName || 'Provider';
      document.getElementById('review-service-title').textContent = serviceTitle || 'Service';
      document.getElementById('review-amount').textContent = `$${(amount || 0).toFixed(2)}`;
      
      // Reset form
      document.querySelectorAll('.star-rating').forEach(container => {
        container.querySelectorAll('.star').forEach((star, i) => {
          star.classList.toggle('active', i < 5); // Default to 5 stars
        });
        container.dataset.value = '5';
      });
      document.getElementById('review-title').value = '';
      document.getElementById('review-text').value = '';
      document.getElementById('complaint-reason').value = '';
      document.getElementById('complaint-reason-other').value = '';
      document.getElementById('complaint-reason-group').style.display = 'none';
      document.getElementById('complaint-reason-other').style.display = 'none';
      
      document.getElementById('review-modal').classList.add('active');
    }

    function setRating(ratingType, value) {
      const container = document.querySelector(`.star-rating[data-type="${ratingType}"]`);
      container.dataset.value = value;
      container.querySelectorAll('.star').forEach((star, i) => {
        star.classList.toggle('active', i < value);
      });
      
      if (ratingType === 'overall') {
        const complaintGroup = document.getElementById('complaint-reason-group');
        if (value <= 3) {
          complaintGroup.style.display = 'block';
        } else {
          complaintGroup.style.display = 'none';
          document.getElementById('complaint-reason').value = '';
          document.getElementById('complaint-reason-other').value = '';
        }
      }
    }

    function handleComplaintReasonChange() {
      const select = document.getElementById('complaint-reason');
      const otherInput = document.getElementById('complaint-reason-other');
      otherInput.style.display = select.value === 'other' ? 'block' : 'none';
      if (select.value !== 'other') otherInput.value = '';
    }

    async function submitReview() {
      const overallRating = parseInt(document.querySelector('.star-rating[data-type="overall"]').dataset.value) || 5;
      const qualityRating = parseInt(document.querySelector('.star-rating[data-type="quality"]').dataset.value) || 5;
      const communicationRating = parseInt(document.querySelector('.star-rating[data-type="communication"]').dataset.value) || 5;
      const timelinessRating = parseInt(document.querySelector('.star-rating[data-type="timeliness"]').dataset.value) || 5;
      const valueRating = parseInt(document.querySelector('.star-rating[data-type="value"]').dataset.value) || 5;
      const reviewTitle = document.getElementById('review-title').value.trim();
      const reviewText = document.getElementById('review-text').value.trim();
      
      let complaintReason = null;
      let complaintReasonOther = null;
      if (overallRating <= 3) {
        complaintReason = document.getElementById('complaint-reason').value;
        if (!complaintReason) {
          showToast('Please select a reason for your low rating.', 'error');
          return;
        }
        if (complaintReason === 'other') {
          complaintReasonOther = document.getElementById('complaint-reason-other').value.trim();
          if (!complaintReasonOther) {
            showToast('Please specify the reason for your low rating.', 'error');
            return;
          }
        }
      }

      const pkg = packages.find(p => p.id === currentReviewPackageId);
      const vehicle = vehicles.find(v => v.id === pkg?.vehicle_id);
      const { data: bid } = await supabaseClient.from('bids').select('price_estimate').eq('package_id', currentReviewPackageId).eq('status', 'accepted').single();

      const reviewData = {
        provider_id: currentReviewProviderId,
        member_id: currentUser.id,
        package_id: currentReviewPackageId,
        overall_rating: overallRating,
        quality_rating: qualityRating,
        communication_rating: communicationRating,
        timeliness_rating: timelinessRating,
        value_rating: valueRating,
        review_title: reviewTitle || null,
        review_text: reviewText || null,
        complaint_reason: complaintReason,
        complaint_reason_other: complaintReasonOther,
        service_type: pkg?.service_type,
        vehicle_info: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : null,
        amount_paid: bid?.price_estimate,
        status: 'published',
        verified_purchase: true
      };

      const result = await submitProviderReview(reviewData);
      
      if (result.error) {
        showToast('Failed to submit review. Please try again.', 'error');
        return;
      }

      closeModal('review-modal');
      showToast('Thank you for your review! It helps other members make informed decisions.', 'success');
    }

    function skipReview() {
      closeModal('review-modal');
      showToast('You can leave a review later from your service history.', 'info');
    }

    async function openDispute(packageId) {
      currentViewPackage = packageId;
      document.getElementById('dispute-package-id').value = packageId;
      document.getElementById('dispute-reason').value = '';
      document.getElementById('dispute-description').value = '';
      document.getElementById('dispute-modal').classList.add('active');
    }

    async function submitDispute() {
      const packageId = document.getElementById('dispute-package-id').value;
      const reason = document.getElementById('dispute-reason').value;
      const description = document.getElementById('dispute-description').value;

      if (!reason) return showToast('Please select a reason for the dispute.', 'error');

      // Get payment for this package
      const { data: payment } = await supabaseClient.from('payments').select('*').eq('package_id', packageId).single();

      // Create dispute
      await supabaseClient.from('disputes').insert({
        package_id: packageId,
        payment_id: payment?.id,
        filed_by: currentUser.id,
        filed_by_role: 'member',
        reason: reason,
        description: description,
        status: 'open',
        requires_inspection: (payment?.amount_total || 0) > 1000
      });

      // Update payment status
      if (payment) {
        await supabaseClient.from('payments').update({ status: 'disputed' }).eq('id', payment.id);
      }

      closeModal('dispute-modal');
      showToast('Dispute submitted. Our team will review and contact you within 24-48 hours.', 'success');
      await loadPackages();
    }

    async function requestRefund(packageId) {
      if (!confirm('Request a refund because the provider cannot start work?\\n\\nYour payment will be refunded immediately.')) return;

      // Get payment
      const { data: payment } = await supabaseClient.from('payments').select('*').eq('package_id', packageId).single();
      
      if (payment) {
        await supabaseClient.from('payments').update({
          status: 'refunded',
          refund_amount: payment.amount_total,
          refund_reason: 'Provider unable to start work',
          refunded_at: new Date().toISOString()
        }).eq('id', payment.id);
      }

      // Update package
      await supabaseClient.from('maintenance_packages').update({
        status: 'cancelled'
      }).eq('id', packageId);

      closeModal('view-package-modal');
      showToast('Refund processed! The funds will be returned to your payment method.', 'success');
      await loadPackages();
    }


    // ========== DESTINATION SERVICES ==========
    let destinationServices = [];
    let currentDestServiceType = null;
    let currentDestFilter = 'active';

    async function loadDestinationServices() {
      if (!currentUser) return;
      
      const { data, error } = await getMyDestinationServices(currentUser.id);
      if (error) {
        console.log('Error loading destination services:', error);
        destinationServices = [];
      } else {
        destinationServices = data || [];
      }
      
      renderDestinationServices();
      updateDestinationCount();
    }

    function updateDestinationCount() {
      const activeCount = destinationServices.filter(s => ['pending', 'assigned', 'in_progress', 'en_route'].includes(s.status)).length;
      const badge = document.getElementById('destination-count');
      if (badge) {
        badge.textContent = activeCount;
        badge.style.display = activeCount > 0 ? 'inline-flex' : 'none';
      }
    }

    function renderDestinationServices() {
      const container = document.getElementById('destination-services-list');
      if (!container) return;
      
      let filtered = destinationServices;
      if (currentDestFilter === 'active') {
        filtered = destinationServices.filter(s => ['pending', 'assigned', 'in_progress', 'en_route'].includes(s.status));
      } else if (currentDestFilter === 'pending') {
        filtered = destinationServices.filter(s => s.status === 'pending');
      } else if (currentDestFilter === 'completed') {
        filtered = destinationServices.filter(s => s.status === 'completed');
      }
      
      if (!filtered.length) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">🚗</div>
            <p>No ${currentDestFilter === 'all' ? '' : currentDestFilter + ' '}destination services.</p>
            <button class="btn btn-primary" onclick="openDestinationBookingModal()" style="margin-top:16px;">+ Book Service</button>
          </div>`;
        return;
      }
      
      container.innerHTML = filtered.map(service => {
        const pkg = service.maintenance_packages;
        const vehicle = pkg?.vehicles;
        const vehicleName = vehicle ? `${vehicle.year || ''} ${vehicle.make} ${vehicle.model}`.trim() : 'Vehicle';
        
        const serviceIcons = {
          airport: '✈️',
          dealership: '🏢',
          detailing: '✨',
          valet: '🔑'
        };
        const serviceLabels = {
          airport: 'Airport',
          dealership: 'Dealership',
          detailing: 'Detailing',
          valet: 'Valet'
        };
        const serviceColors = {
          airport: '#1E90FF',
          dealership: '#9B59B6',
          detailing: '#2ECC71',
          valet: '#D4AF37'
        };
        
        const statusColors = {
          pending: 'var(--text-muted)',
          assigned: 'var(--accent-blue)',
          in_progress: 'var(--accent-blue)',
          en_route: 'var(--accent-orange)',
          completed: 'var(--accent-green)',
          cancelled: 'var(--accent-red)'
        };
        const statusLabels = {
          pending: 'Pending',
          assigned: 'Driver Assigned',
          in_progress: 'In Progress',
          en_route: 'Driver En Route',
          completed: 'Completed',
          cancelled: 'Cancelled'
        };
        
        const icon = serviceIcons[service.service_type] || '🚗';
        const label = serviceLabels[service.service_type] || service.service_type;
        const color = serviceColors[service.service_type] || 'var(--accent-blue)';
        
        let datetime = '';
        if (service.service_type === 'airport' && service.flight_datetime) {
          datetime = new Date(service.flight_datetime).toLocaleString();
        } else if (service.service_type === 'dealership' && service.appointment_datetime) {
          datetime = new Date(service.appointment_datetime).toLocaleString();
        } else if ((service.service_type === 'detailing' || service.service_type === 'valet') && service.event_datetime) {
          datetime = new Date(service.event_datetime).toLocaleString();
        } else if (service.created_at) {
          datetime = 'Booked: ' + new Date(service.created_at).toLocaleDateString();
        }
        
        const driverInfo = service.driver_name ? `
          <div style="display:flex;align-items:center;gap:8px;margin-top:12px;padding:10px 12px;background:var(--accent-blue-soft);border-radius:var(--radius-md);">
            <span style="font-size:20px;">👤</span>
            <div>
              <div style="font-size:0.85rem;font-weight:500;color:var(--accent-blue);">Driver: ${service.driver_name}</div>
              ${service.driver_phone ? `<div style="font-size:0.78rem;color:var(--text-muted);">📞 ${service.driver_phone}</div>` : ''}
            </div>
          </div>
        ` : '';
        
        const statusSteps = ['pending', 'assigned', 'en_route', 'picked_up', 'at_destination', 'returning', 'completed'];
        const statusStepLabels = {
          pending: 'Pending',
          assigned: 'Driver Assigned',
          en_route: 'En Route',
          picked_up: 'Picked Up',
          at_destination: 'At Destination',
          returning: 'Returning',
          completed: 'Completed'
        };
        const currentStepIndex = statusSteps.indexOf(service.status);
        
        const timelineHtml = service.status !== 'cancelled' && service.status !== 'pending' ? `
          <div style="display:flex;align-items:center;gap:4px;margin:12px 0;overflow-x:auto;padding:4px 0;">
            ${statusSteps.slice(0, 5).map((step, idx) => {
              const isCompleted = idx < currentStepIndex;
              const isCurrent = idx === currentStepIndex;
              const stepColor = isCompleted ? 'var(--accent-green)' : (isCurrent ? 'var(--accent-blue)' : 'var(--text-muted)');
              return `
                <div style="display:flex;align-items:center;flex-shrink:0;">
                  <div style="width:20px;height:20px;border-radius:50%;background:${stepColor}${isCompleted || isCurrent ? '' : '33'};display:flex;align-items:center;justify-content:center;font-size:10px;color:white;">
                    ${isCompleted ? '✓' : (idx + 1)}
                  </div>
                  ${idx < 4 ? `<div style="width:24px;height:2px;background:${isCompleted ? 'var(--accent-green)' : 'var(--border-subtle)'};"></div>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        ` : '';
        
        return `
          <div class="package-card" style="margin-bottom:16px;">
            <div class="package-card-header" style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
              <div style="display:flex;align-items:center;gap:12px;">
                <span style="font-size:28px;">${icon}</span>
                <div>
                  <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                    <span style="font-weight:600;font-size:1.1rem;">${label} Service</span>
                    <span style="padding:4px 10px;background:${color}22;color:${color};border-radius:100px;font-size:0.75rem;font-weight:600;">${label.toUpperCase()}</span>
                  </div>
                  <div style="color:var(--text-muted);font-size:0.9rem;margin-top:4px;">
                    ${vehicleName} • ${datetime}
                  </div>
                </div>
              </div>
              <span class="package-status" style="background:${statusColors[service.status] || 'gray'}22;color:${statusColors[service.status] || 'gray'};">
                ${statusLabels[service.status] || service.status}
              </span>
            </div>
            ${timelineHtml}
            <div class="package-card-body" style="margin-bottom:16px;">
              ${service.pickup_location ? `<div style="margin-bottom:8px;"><strong>From:</strong> ${service.pickup_location}</div>` : ''}
              ${service.dropoff_location ? `<div style="margin-bottom:8px;"><strong>To:</strong> ${service.dropoff_location}</div>` : ''}
              ${service.special_instructions ? `<div style="margin-bottom:8px;color:var(--text-muted);font-style:italic;">"${service.special_instructions.substring(0, 100)}${service.special_instructions.length > 100 ? '...' : ''}"</div>` : ''}
              ${driverInfo}
            </div>
            <div class="package-card-footer" style="display:flex;gap:10px;flex-wrap:wrap;padding-top:16px;border-top:1px solid var(--border-subtle);">
              <button class="btn btn-secondary" onclick="viewDestinationService('${service.id}')">View Details</button>
              ${['en_route', 'in_progress'].includes(service.status) && service.tracking_url ? `<a href="${service.tracking_url}" target="_blank" class="btn btn-primary">📍 Track Driver</a>` : ''}
              ${service.status === 'pending' ? `<button class="btn btn-danger btn-sm" onclick="cancelDestinationService('${service.id}')" style="margin-left:auto;">Cancel Service</button>` : ''}
            </div>
          </div>
        `;
      }).join('');
    }

    function openDestinationBookingModal() {
      currentDestServiceType = null;
      document.getElementById('dest-step-1').style.display = 'block';
      document.getElementById('dest-step-airport').style.display = 'none';
      document.getElementById('dest-step-dealership').style.display = 'none';
      document.getElementById('dest-step-detailing').style.display = 'none';
      document.getElementById('dest-step-valet').style.display = 'none';
      document.getElementById('dest-submit-btn').style.display = 'none';
      document.getElementById('dest-modal-title').textContent = 'Book Destination Service';
      
      document.querySelectorAll('.dest-service-option').forEach(opt => {
        opt.style.borderColor = 'var(--border-subtle)';
        opt.style.background = 'var(--bg-input)';
      });
      
      populateDestVehicleSelects();
      openModal('destination-booking-modal');
    }

    function populateDestVehicleSelects() {
      const selects = ['dest-airport-vehicle', 'dest-dealer-vehicle', 'dest-detail-vehicle', 'dest-valet-vehicle'];
      selects.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
          select.innerHTML = '<option value="">Select a vehicle...</option>' + 
            vehicles.map(v => `<option value="${v.id}">${v.nickname || `${v.year || ''} ${v.make} ${v.model}`.trim()}</option>`).join('');
        }
      });
    }

    function selectDestServiceType(type) {
      currentDestServiceType = type;
      
      document.querySelectorAll('.dest-service-option').forEach(opt => {
        const isSelected = opt.dataset.service === type;
        opt.style.borderColor = isSelected ? 'var(--accent-gold)' : 'var(--border-subtle)';
        opt.style.background = isSelected ? 'rgba(212,168,85,0.15)' : 'var(--bg-input)';
      });
      
      document.getElementById('dest-step-1').style.display = 'none';
      document.getElementById('dest-step-airport').style.display = type === 'airport' ? 'block' : 'none';
      document.getElementById('dest-step-dealership').style.display = type === 'dealership' ? 'block' : 'none';
      document.getElementById('dest-step-detailing').style.display = type === 'detailing' ? 'block' : 'none';
      document.getElementById('dest-step-valet').style.display = type === 'valet' ? 'block' : 'none';
      
      const submitBtn = document.getElementById('dest-submit-btn');
      submitBtn.style.display = 'inline-flex';
      
      const titles = {
        airport: '✈️ Airport Pickup/Drop-off',
        dealership: '🏢 Dealership Service Run',
        detailing: '✨ Mobile Detailing',
        valet: '🔑 Valet Service'
      };
      
      const buttonLabels = {
        airport: '✈️ Book Airport Service',
        dealership: '🏢 Schedule Dealership Run',
        detailing: '✨ Book Detail Service',
        valet: '🔑 Book Valet Service'
      };
      
      document.getElementById('dest-modal-title').textContent = titles[type] || 'Book Destination Service';
      submitBtn.textContent = buttonLabels[type] || 'Book Service';
      
      setupTripTypeListeners();
      setupDetailLevelListeners();
      setupParkingPrefListeners();
    }

    function goBackToServiceSelection() {
      currentDestServiceType = null;
      document.getElementById('dest-step-1').style.display = 'block';
      document.getElementById('dest-step-airport').style.display = 'none';
      document.getElementById('dest-step-dealership').style.display = 'none';
      document.getElementById('dest-step-detailing').style.display = 'none';
      document.getElementById('dest-step-valet').style.display = 'none';
      document.getElementById('dest-submit-btn').style.display = 'none';
      document.getElementById('dest-modal-title').textContent = 'Book Destination Service';
    }

    function setupTripTypeListeners() {
      document.querySelectorAll('.dest-trip-option').forEach(option => {
        option.onclick = function() {
          document.querySelectorAll('.dest-trip-option').forEach(o => {
            o.style.borderColor = 'var(--border-subtle)';
            o.style.background = 'var(--bg-input)';
          });
          this.style.borderColor = 'var(--accent-blue)';
          this.style.background = 'rgba(74,124,255,0.1)';
          this.querySelector('input').checked = true;
          
          const tripType = this.querySelector('input').value;
          const returnGroup = document.getElementById('dest-airport-return-group');
          if (returnGroup) {
            returnGroup.style.display = (tripType === 'round_trip' || tripType === 'arrival') ? 'block' : 'none';
          }
        };
      });
    }

    function setupDetailLevelListeners() {
      document.querySelectorAll('.dest-detail-level').forEach(option => {
        option.onclick = function() {
          document.querySelectorAll('.dest-detail-level').forEach(o => {
            o.style.borderColor = 'var(--border-subtle)';
            o.style.background = 'var(--bg-input)';
          });
          this.style.borderColor = 'var(--accent-gold)';
          this.style.background = 'rgba(212,168,85,0.15)';
          this.querySelector('input').checked = true;
        };
      });
    }

    function setupParkingPrefListeners() {
      document.querySelectorAll('.dest-parking-option').forEach(option => {
        option.onclick = function() {
          document.querySelectorAll('.dest-parking-option').forEach(o => {
            o.style.borderColor = 'var(--border-subtle)';
            o.style.background = 'var(--bg-input)';
          });
          this.style.borderColor = 'var(--accent-blue)';
          this.style.background = 'rgba(74,124,255,0.1)';
          this.querySelector('input').checked = true;
        };
      });
    }

    async function submitDestinationService() {
      if (!currentDestServiceType) {
        showToast('Please select a service type', 'error');
        return;
      }
      
      let vehicleId, serviceData = {};
      
      if (currentDestServiceType === 'airport') {
        vehicleId = document.getElementById('dest-airport-vehicle').value;
        const tripType = document.querySelector('input[name="dest-trip-type"]:checked')?.value;
        const pickupLocation = document.getElementById('dest-airport-pickup').value;
        const airportLocation = document.getElementById('dest-airport-location').value;
        const flightDatetime = document.getElementById('dest-airport-datetime').value;
        
        if (!vehicleId || !tripType || !pickupLocation || !airportLocation || !flightDatetime) {
          showToast('Please fill in all required fields', 'error');
          return;
        }
        
        const parkingPref = document.querySelector('input[name="dest-parking-pref"]:checked')?.value;
        
        serviceData = {
          service_type: 'airport',
          trip_type: tripType,
          pickup_location: pickupLocation,
          dropoff_location: airportLocation,
          parking_location: airportLocation,
          parking_preference: parkingPref || null,
          flight_number: document.getElementById('dest-airport-flight').value,
          airline: document.getElementById('dest-airport-airline').value,
          flight_datetime: flightDatetime,
          return_datetime: document.getElementById('dest-airport-return').value || null,
          special_instructions: document.getElementById('dest-airport-instructions').value
        };
      } else if (currentDestServiceType === 'dealership') {
        vehicleId = document.getElementById('dest-dealer-vehicle').value;
        const pickupLocation = document.getElementById('dest-dealer-pickup').value;
        const dealerName = document.getElementById('dest-dealer-name').value;
        const dealerAddress = document.getElementById('dest-dealer-address').value;
        const serviceType = document.getElementById('dest-dealer-service-type').value;
        const appointmentDatetime = document.getElementById('dest-dealer-datetime').value;
        
        if (!vehicleId || !pickupLocation || !dealerName || !dealerAddress || !serviceType || !appointmentDatetime) {
          showToast('Please fill in all required fields', 'error');
          return;
        }
        
        serviceData = {
          service_type: 'dealership',
          pickup_location: pickupLocation,
          dropoff_location: dealerAddress,
          dealership_name: dealerName,
          dealership_address: dealerAddress,
          dealership_service_type: serviceType,
          appointment_datetime: appointmentDatetime,
          special_instructions: document.getElementById('dest-dealer-instructions').value
        };
      } else if (currentDestServiceType === 'detailing') {
        vehicleId = document.getElementById('dest-detail-vehicle').value;
        const serviceLocation = document.getElementById('dest-detail-location').value;
        const detailLevel = document.querySelector('input[name="dest-detail-level"]:checked')?.value;
        const detailDatetime = document.getElementById('dest-detail-datetime').value;
        
        if (!vehicleId || !serviceLocation || !detailLevel || !detailDatetime) {
          showToast('Please fill in all required fields', 'error');
          return;
        }
        
        serviceData = {
          service_type: 'detailing',
          pickup_location: serviceLocation,
          dropoff_location: serviceLocation,
          detail_level: detailLevel,
          event_datetime: detailDatetime,
          special_instructions: document.getElementById('dest-detail-instructions').value
        };
      } else if (currentDestServiceType === 'valet') {
        vehicleId = document.getElementById('dest-valet-vehicle').value;
        const pickupLocation = document.getElementById('dest-valet-pickup').value;
        const eventName = document.getElementById('dest-valet-event').value;
        const eventVenue = document.getElementById('dest-valet-venue').value;
        const eventDatetime = document.getElementById('dest-valet-datetime').value;
        
        if (!vehicleId || !pickupLocation || !eventName || !eventVenue || !eventDatetime) {
          showToast('Please fill in all required fields', 'error');
          return;
        }
        
        serviceData = {
          service_type: 'valet',
          pickup_location: pickupLocation,
          dropoff_location: eventVenue,
          event_name: eventName,
          event_venue: eventVenue,
          event_datetime: eventDatetime,
          expected_duration: document.getElementById('dest-valet-duration').value,
          special_instructions: document.getElementById('dest-valet-instructions').value
        };
      }
      
      const serviceLabels = {
        airport: 'Airport Parking Service',
        dealership: 'Dealership Service Run',
        detailing: 'Mobile Detailing',
        valet: 'Valet Service'
      };
      
      try {
        const { data: pkg, error: pkgError } = await supabaseClient
          .from('maintenance_packages')
          .insert({
            member_id: currentUser.id,
            vehicle_id: vehicleId,
            title: serviceLabels[currentDestServiceType] || 'Destination Service',
            category: 'destination_service',
            status: 'pending',
            description: serviceData.special_instructions || `${serviceLabels[currentDestServiceType]} booking`,
            bidding_ends_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
          })
          .select()
          .single();
        
        if (pkgError) {
          showToast('Error creating service package: ' + pkgError.message, 'error');
          return;
        }
        
        serviceData.package_id = pkg.id;
        
        const { data: destService, error: destError } = await createDestinationService(serviceData);
        
        if (destError) {
          showToast('Error creating destination service: ' + destError, 'error');
          return;
        }
        
        closeModal('destination-booking-modal');
        showToast(`${serviceLabels[currentDestServiceType]} booked successfully!`, 'success');
        await loadDestinationServices();
        showSection('destination-services');
        
      } catch (err) {
        console.error('Error booking destination service:', err);
        showToast('An error occurred while booking the service', 'error');
      }
    }

    async function viewDestinationService(serviceId) {
      const service = destinationServices.find(s => s.id === serviceId);
      if (!service) {
        showToast('Service not found', 'error');
        return;
      }
      
      const pkg = service.maintenance_packages;
      const vehicle = pkg?.vehicles;
      const vehicleName = vehicle ? `${vehicle.year || ''} ${vehicle.make} ${vehicle.model}`.trim() : 'Vehicle';
      
      const serviceIcons = { airport: '✈️', dealership: '🏢', detailing: '✨', valet: '🔑' };
      const serviceLabels = { airport: 'Airport Parking', dealership: 'Dealership Run', detailing: 'Mobile Detailing', valet: 'Valet Service' };
      const statusLabels = { pending: 'Pending', assigned: 'Driver Assigned', in_progress: 'In Progress', en_route: 'Driver En Route', completed: 'Completed', cancelled: 'Cancelled' };
      const statusColors = { pending: 'gray', assigned: 'var(--accent-blue)', in_progress: 'var(--accent-blue)', en_route: 'var(--accent-orange)', completed: 'var(--accent-green)', cancelled: 'var(--accent-red)' };
      
      let detailsHtml = '';
      
      if (service.service_type === 'airport') {
        detailsHtml = `
          <div style="display:grid;gap:12px;">
            <div><strong>Trip Type:</strong> ${service.trip_type?.replace('_', ' ').charAt(0).toUpperCase() + service.trip_type?.slice(1).replace('_', ' ') || 'N/A'}</div>
            <div><strong>Pickup:</strong> ${service.pickup_location || 'N/A'}</div>
            <div><strong>Airport/Parking:</strong> ${service.parking_location || service.dropoff_location || 'N/A'}</div>
            ${service.parking_preference ? `<div><strong>Parking Type:</strong> ${service.parking_preference.replace('_', '-').charAt(0).toUpperCase() + service.parking_preference.slice(1).replace('_', '-')}</div>` : ''}
            ${service.airline ? `<div><strong>Airline:</strong> ${service.airline}</div>` : ''}
            ${service.flight_number ? `<div><strong>Flight:</strong> ${service.flight_number}</div>` : ''}
            <div><strong>Flight Date/Time:</strong> ${service.flight_datetime ? new Date(service.flight_datetime).toLocaleString() : 'N/A'}</div>
            ${service.return_datetime ? `<div><strong>Return:</strong> ${new Date(service.return_datetime).toLocaleString()}</div>` : ''}
          </div>
        `;
      } else if (service.service_type === 'dealership') {
        detailsHtml = `
          <div style="display:grid;gap:12px;">
            <div><strong>Pickup:</strong> ${service.pickup_location || 'N/A'}</div>
            <div><strong>Dealership:</strong> ${service.dealership_name || 'N/A'}</div>
            <div><strong>Address:</strong> ${service.dealership_address || service.dropoff_location || 'N/A'}</div>
            <div><strong>Service Type:</strong> ${service.dealership_service_type?.charAt(0).toUpperCase() + service.dealership_service_type?.slice(1) || 'N/A'}</div>
            <div><strong>Appointment:</strong> ${service.appointment_datetime ? new Date(service.appointment_datetime).toLocaleString() : 'N/A'}</div>
          </div>
        `;
      } else if (service.service_type === 'detailing') {
        const levelLabels = { basic: 'Basic ($)', standard: 'Standard ($$)', premium: 'Premium ($$$)', full: 'Full Detail ($$$$)' };
        detailsHtml = `
          <div style="display:grid;gap:12px;">
            <div><strong>Location:</strong> ${service.pickup_location || 'N/A'}</div>
            <div><strong>Service Level:</strong> ${levelLabels[service.detail_level] || service.detail_level || 'N/A'}</div>
            <div><strong>Scheduled:</strong> ${service.event_datetime ? new Date(service.event_datetime).toLocaleString() : 'N/A'}</div>
          </div>
        `;
      } else if (service.service_type === 'valet') {
        detailsHtml = `
          <div style="display:grid;gap:12px;">
            <div><strong>Pickup:</strong> ${service.pickup_location || 'N/A'}</div>
            <div><strong>Event:</strong> ${service.event_name || 'N/A'}</div>
            <div><strong>Venue:</strong> ${service.event_venue || service.dropoff_location || 'N/A'}</div>
            <div><strong>Date/Time:</strong> ${service.event_datetime ? new Date(service.event_datetime).toLocaleString() : 'N/A'}</div>
            ${service.expected_duration ? `<div><strong>Duration:</strong> ${service.expected_duration} hours</div>` : ''}
          </div>
        `;
      }
      
      const timelineSteps = [
        { status: 'pending', label: 'Pending', icon: '📝' },
        { status: 'assigned', label: 'Assigned', icon: '👤' },
        { status: 'en_route', label: 'En Route', icon: '🚗' },
        { status: 'in_progress', label: 'In Progress', icon: '⚙️' },
        { status: 'completed', label: 'Completed', icon: '✅' }
      ];
      
      const currentStatusIndex = timelineSteps.findIndex(s => s.status === service.status);
      
      const timelineHtml = `
        <div style="display:flex;justify-content:space-between;margin:24px 0;position:relative;">
          <div style="position:absolute;top:16px;left:0;right:0;height:2px;background:var(--border-subtle);z-index:0;"></div>
          ${timelineSteps.map((step, i) => {
            const isCompleted = i < currentStatusIndex;
            const isCurrent = i === currentStatusIndex;
            const color = isCompleted || isCurrent ? 'var(--accent-green)' : 'var(--text-muted)';
            return `
              <div style="display:flex;flex-direction:column;align-items:center;z-index:1;">
                <div style="width:32px;height:32px;border-radius:50%;background:${isCompleted || isCurrent ? color : 'var(--bg-elevated)'};border:2px solid ${color};display:flex;align-items:center;justify-content:center;font-size:14px;">
                  ${isCompleted ? '✓' : step.icon}
                </div>
                <div style="font-size:0.75rem;margin-top:6px;color:${isCurrent ? 'var(--text-primary)' : 'var(--text-muted)'};">${step.label}</div>
              </div>
            `;
          }).join('')}
        </div>
      `;
      
      document.getElementById('dest-detail-title').textContent = `${serviceIcons[service.service_type]} ${serviceLabels[service.service_type]}`;
      document.getElementById('dest-detail-body').innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <div style="display:flex;align-items:center;gap:12px;">
            <span style="font-size:36px;">${serviceIcons[service.service_type]}</span>
            <div>
              <div style="font-weight:600;font-size:1.2rem;">${serviceLabels[service.service_type]}</div>
              <div style="color:var(--text-muted);">${vehicleName}</div>
            </div>
          </div>
          <span style="padding:6px 14px;border-radius:100px;font-size:0.85rem;font-weight:600;background:${statusColors[service.status]}22;color:${statusColors[service.status]};">
            ${statusLabels[service.status]}
          </span>
        </div>
        
        ${timelineHtml}
        
        <div class="card" style="margin-bottom:20px;">
          <div class="card-header"><h4 class="card-title">Service Details</h4></div>
          <div style="padding:16px;">
            ${detailsHtml}
            ${service.special_instructions ? `
              <div style="margin-top:16px;padding:12px;background:var(--bg-input);border-radius:var(--radius-md);">
                <strong>Special Instructions:</strong><br>
                <span style="color:var(--text-secondary);">${service.special_instructions}</span>
              </div>
            ` : ''}
          </div>
        </div>
        
        ${service.driver_id ? `
          <div class="card" style="margin-bottom:20px;">
            <div class="card-header"><h4 class="card-title">Driver Information</h4></div>
            <div style="padding:16px;display:flex;align-items:center;gap:16px;">
              <div style="width:60px;height:60px;border-radius:50%;background:var(--accent-blue);display:flex;align-items:center;justify-content:center;font-size:24px;">👤</div>
              <div>
                <div style="font-weight:600;">${service.driver_name || 'Driver Assigned'}</div>
                ${service.driver_phone ? `<div style="color:var(--text-muted);">📞 ${service.driver_phone}</div>` : ''}
              </div>
              ${service.driver_phone ? `<button class="btn btn-secondary" onclick="window.open('tel:${service.driver_phone}')" style="margin-left:auto;">📞 Contact</button>` : ''}
            </div>
          </div>
        ` : ''}
        
        ${['en_route', 'in_progress'].includes(service.status) && service.tracking_url ? `
          <a href="${service.tracking_url}" target="_blank" class="btn btn-primary" style="width:100%;padding:16px;font-size:1.1rem;">
            📍 Track Driver in Real-Time
          </a>
        ` : ''}
        
        <div style="margin-top:20px;padding:12px;background:var(--bg-input);border-radius:var(--radius-md);font-size:0.85rem;color:var(--text-muted);">
          <strong>Booked:</strong> ${new Date(service.created_at).toLocaleString()}
        </div>
      `;
      
      openModal('destination-detail-modal');
    }

    document.querySelectorAll('#destination-tabs .tab').forEach(tab => {
      tab.addEventListener('click', function() {
        document.querySelectorAll('#destination-tabs .tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        currentDestFilter = this.dataset.destFilter;
        renderDestinationServices();
      });
    });

    async function cancelDestinationService(serviceId) {
      if (!confirm('Are you sure you want to cancel this service? This action cannot be undone.')) {
        return;
      }
      
      const { data, error } = await updateDestinationServiceStatus(serviceId, 'cancelled');
      if (error) {
        showToast('Failed to cancel service: ' + error, 'error');
        return;
      }
      
      showToast('Service cancelled successfully', 'success');
      await loadDestinationServices();
    }

    // ========== MAINTENANCE SCHEDULE ==========
    let maintenanceScheduleData = [];
    let maintenanceServiceTypes = [];
    let maintenanceServiceHistory = [];
    let maintenanceDrivingConditions = {};
    let selectedMaintenanceVehicle = null;
    let maintenanceStatusFilter = 'all';

    const vehicleClassMap = {
      'chevrolet': 'domestic', 'ford': 'domestic', 'gmc': 'domestic', 'dodge': 'domestic', 'chrysler': 'domestic', 
      'jeep': 'domestic', 'ram': 'domestic', 'buick': 'domestic', 'cadillac': 'domestic', 'lincoln': 'domestic',
      'toyota': 'asian', 'honda': 'asian', 'nissan': 'asian', 'mazda': 'asian', 'subaru': 'asian', 
      'mitsubishi': 'asian', 'hyundai': 'asian', 'kia': 'asian', 'lexus': 'asian', 'acura': 'asian', 
      'infiniti': 'asian', 'suzuki': 'asian', 'genesis': 'asian',
      'bmw': 'european', 'mercedes-benz': 'european', 'mercedes': 'european', 'audi': 'european', 'volkswagen': 'european',
      'porsche': 'european', 'volvo': 'european', 'jaguar': 'european', 'land rover': 'european', 'mini': 'european',
      'fiat': 'european', 'alfa romeo': 'european', 'maserati': 'european', 'bentley': 'european', 'rolls-royce': 'european',
      'ferrari': 'exotic', 'lamborghini': 'exotic', 'mclaren': 'exotic', 'bugatti': 'exotic', 'aston martin': 'exotic',
      'tesla': 'electric', 'rivian': 'electric', 'lucid': 'electric', 'polestar': 'electric'
    };

    function getVehicleClass(make) {
      return vehicleClassMap[(make || '').toLowerCase()] || 'domestic';
    }

    function detectFuelInjectionType(make, model, year, trim) {
      const makeLower = (make || '').toLowerCase();
      const modelLower = (model || '').toLowerCase();
      const trimLower = (trim || '').toLowerCase();
      const yearNum = parseInt(year) || 0;
      
      const europeanMakes = ['bmw', 'mercedes-benz', 'mercedes', 'audi', 'volkswagen', 'vw', 'porsche', 'mini', 'volvo', 'land rover', 'jaguar'];
      const electricMakes = ['tesla', 'rivian', 'lucid', 'polestar'];
      
      if (electricMakes.includes(makeLower)) {
        return null;
      }
      
      if (modelLower.includes('electric') || modelLower.includes(' ev') || modelLower.includes(' e-') || trimLower.includes('electric') || trimLower.includes(' ev')) {
        return null;
      }
      
      const diTrimPatterns = ['tsi', 'tfsi', 'gdi', 't-gdi', 'ecoboost', 'skyactiv-g', 'mpi-gdi', 'd-4s', 'd4s'];
      for (const pattern of diTrimPatterns) {
        if (trimLower.includes(pattern) || modelLower.includes(pattern)) {
          if (pattern === 'd-4s' || pattern === 'd4s') {
            return 'dual_injection';
          }
          return 'direct_injection';
        }
      }
      
      if (trimLower.includes('turbo') && yearNum >= 2010) {
        return 'direct_injection';
      }
      
      if (europeanMakes.includes(makeLower) && yearNum >= 2006) {
        return 'direct_injection';
      }
      
      if (makeLower === 'ford' && yearNum >= 2010) {
        if (trimLower.includes('ecoboost') || modelLower.includes('ecoboost')) {
          return 'direct_injection';
        }
      }
      
      if ((makeLower === 'hyundai' || makeLower === 'kia' || makeLower === 'genesis') && yearNum >= 2010) {
        if (trimLower.includes('gdi') || modelLower.includes('gdi') || trimLower.includes('turbo')) {
          return 'direct_injection';
        }
      }
      
      if (makeLower === 'mazda' && yearNum >= 2012) {
        if (trimLower.includes('skyactiv') || modelLower.includes('skyactiv')) {
          return 'direct_injection';
        }
        if (['3', '6', 'cx-5', 'cx-30', 'cx-50', 'mazda3', 'mazda6'].some(m => modelLower.includes(m))) {
          return 'direct_injection';
        }
      }
      
      const gmMakes = ['chevrolet', 'chevy', 'gmc', 'cadillac', 'buick'];
      if (gmMakes.includes(makeLower) && yearNum >= 2013) {
        const diEngines = ['ltg', 'lt1', 'lt4', 'lt5', 'lf3', 'lf4', 'lsy', '2.0t', '3.0t', '3.6l'];
        for (const eng of diEngines) {
          if (trimLower.includes(eng) || modelLower.includes(eng)) {
            return 'direct_injection';
          }
        }
        if (['ats', 'cts', 'ct4', 'ct5', 'camaro', 'corvette'].some(m => modelLower.includes(m))) {
          return 'direct_injection';
        }
      }
      
      if ((makeLower === 'toyota' || makeLower === 'lexus') && yearNum >= 2015) {
        if (trimLower.includes('d-4s') || trimLower.includes('d4s')) {
          return 'dual_injection';
        }
        if (['camry', 'avalon', 'rav4', 'highlander', 'sienna', 'tacoma', 'tundra', '4runner'].some(m => modelLower.includes(m)) && yearNum >= 2018) {
          return 'dual_injection';
        }
        if (['is', 'es', 'gs', 'rx', 'nx', 'gx', 'lx', 'rc', 'lc'].some(m => modelLower.startsWith(m) || modelLower === m)) {
          return 'dual_injection';
        }
      }
      
      if (makeLower === 'subaru' && yearNum >= 2012) {
        if (trimLower.includes('fa') || trimLower.includes('fb') || trimLower.includes('turbo')) {
          return 'direct_injection';
        }
        if (['brz', 'wrx', 'sti'].some(m => modelLower.includes(m))) {
          return 'direct_injection';
        }
        if (yearNum >= 2020) {
          return 'direct_injection';
        }
      }
      
      if ((makeLower === 'honda' || makeLower === 'acura') && yearNum >= 2016) {
        if (trimLower.includes('1.5t') || trimLower.includes('2.0t') || trimLower.includes('turbo')) {
          return 'direct_injection';
        }
        if (['civic', 'accord', 'cr-v'].some(m => modelLower.includes(m)) && trimLower.includes('turbo')) {
          return 'direct_injection';
        }
        if (['rdx', 'tlx', 'mdx'].some(m => modelLower.includes(m)) && yearNum >= 2019) {
          return 'direct_injection';
        }
      }
      
      if (yearNum < 2005) {
        return 'port_injection';
      }
      
      return 'port_injection';
    }

    function isHighMileage(mileage, year) {
      const age = new Date().getFullYear() - (year || 2020);
      const expectedMileage = age * 12000;
      return mileage > 100000 || mileage > expectedMileage * 1.3;
    }

    function getSeverityMultiplier(conditions) {
      let multiplier = 1.0;
      if (!conditions) return multiplier;
      if (conditions.primary_use === 'severe') multiplier *= 0.7;
      else if (conditions.primary_use === 'city') multiplier *= 0.85;
      if (conditions.climate === 'extreme') multiplier *= 0.85;
      else if (conditions.climate === 'hot' || conditions.climate === 'cold') multiplier *= 0.9;
      if (conditions.towing_hauling) multiplier *= 0.8;
      if (conditions.short_trips) multiplier *= 0.85;
      if (conditions.dusty_conditions) multiplier *= 0.9;
      return Math.max(multiplier, 0.5);
    }

    function calculateMaintenanceStatus(item, vehicle, lastService, conditions) {
      const currentMileage = vehicle.mileage || 0;
      const vehicleYear = vehicle.year || 2020;
      const vehicleAge = new Date().getFullYear() - vehicleYear;
      const highMileage = isHighMileage(currentMileage, vehicleYear);
      
      let mileageInterval = item.base_mileage_interval || 30000;
      let monthsInterval = item.base_months_interval || 24;
      
      if (highMileage && item.high_mileage_multiplier) {
        mileageInterval = Math.round(mileageInterval * item.high_mileage_multiplier);
        monthsInterval = Math.round(monthsInterval * item.high_mileage_multiplier);
      }
      
      const severityMult = getSeverityMultiplier(conditions);
      if (severityMult < 1) {
        mileageInterval = Math.round(mileageInterval * severityMult);
        monthsInterval = Math.round(monthsInterval * severityMult);
      }
      
      let status = 'up-to-date';
      let nextDueMileage = mileageInterval;
      let nextDueDate = null;
      let milesSinceLast = currentMileage;
      let monthsSinceLast = vehicleAge * 12;
      
      if (lastService) {
        const lastDate = new Date(lastService.service_date);
        const now = new Date();
        monthsSinceLast = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24 * 30));
        milesSinceLast = currentMileage - (lastService.mileage_at_service || 0);
        nextDueMileage = (lastService.mileage_at_service || 0) + mileageInterval;
        const nextDateMs = lastDate.getTime() + (monthsInterval * 30 * 24 * 60 * 60 * 1000);
        nextDueDate = new Date(nextDateMs);
      } else {
        nextDueDate = new Date();
        nextDueDate.setMonth(nextDueDate.getMonth() + monthsInterval);
      }
      
      const mileagePercent = mileageInterval > 0 ? (milesSinceLast / mileageInterval) * 100 : 0;
      const timePercent = monthsInterval > 0 ? (monthsSinceLast / monthsInterval) * 100 : 0;
      const progress = Math.max(mileagePercent, timePercent);
      
      if (progress >= 100) {
        status = 'overdue';
      } else if (progress >= 80) {
        status = 'due-soon';
      }
      
      return {
        status,
        progress: Math.min(progress, 150),
        nextDueMileage,
        nextDueDate,
        milesSinceLast,
        monthsSinceLast,
        adjustedMileageInterval: mileageInterval,
        adjustedMonthsInterval: monthsInterval,
        isHighMileage: highMileage
      };
    }

    async function loadMaintenanceSchedule() {
      if (!vehicles.length) {
        document.getElementById('maintenance-no-vehicles').style.display = 'block';
        document.getElementById('maintenance-items-container').innerHTML = '';
        return;
      }
      document.getElementById('maintenance-no-vehicles').style.display = 'none';
      
      renderMaintenanceVehicleTabs();
      
      if (!selectedMaintenanceVehicle && vehicles.length > 0) {
        selectedMaintenanceVehicle = vehicles[0].id;
      }
      
      await loadMaintenanceDataForVehicle(selectedMaintenanceVehicle);
    }

    function renderMaintenanceVehicleTabs() {
      const container = document.getElementById('maintenance-vehicle-tabs');
      container.innerHTML = vehicles.map(v => {
        const name = v.nickname || `${v.year} ${v.make} ${v.model}`;
        const isActive = v.id === selectedMaintenanceVehicle;
        return `<div class="tab ${isActive ? 'active' : ''}" onclick="selectMaintenanceVehicle('${v.id}')">${name}</div>`;
      }).join('');
    }

    async function selectMaintenanceVehicle(vehicleId) {
      selectedMaintenanceVehicle = vehicleId;
      renderMaintenanceVehicleTabs();
      await loadMaintenanceDataForVehicle(vehicleId);
    }

    async function loadMaintenanceDataForVehicle(vehicleId) {
      const vehicle = vehicles.find(v => v.id === vehicleId);
      if (!vehicle) return;
      
      document.getElementById('current-mileage-input').value = vehicle.mileage || '';
      
      const vehicleClass = getVehicleClass(vehicle.make);
      
      maintenanceScheduleData = getDefaultMaintenanceSchedule(vehicleClass, vehicle);
      maintenanceServiceHistory = [];
      maintenanceDrivingConditions = {};
      
      try {
        const { data: historyData, error } = await supabaseClient
          .from('vehicle_service_history')
          .select('*')
          .eq('vehicle_id', vehicleId)
          .order('service_date', { ascending: false });
        
        if (!error && historyData && historyData.length > 0) {
          maintenanceServiceHistory = historyData.map(h => ({
            service_code: h.service_type_code,
            service_date: h.service_date,
            mileage_at_service: h.mileage_at_service,
            performed_by: h.performed_by,
            cost_cents: h.cost_cents,
            notes: h.notes,
            id: h.id
          }));
        }
      } catch (e) {
        console.log('Service history table may not exist yet:', e.message);
      }
      
      try {
        const { data: conditionsData } = await supabaseClient
          .from('vehicle_driving_conditions')
          .select('*')
          .eq('vehicle_id', vehicleId)
          .single();
        
        if (conditionsData) {
          maintenanceDrivingConditions = conditionsData;
        }
      } catch (e) {
        console.log('Driving conditions table may not exist yet:', e.message);
      }
      
      renderMaintenanceItems();
    }

    const maintenanceEducation = {
      oil_synthetic: {
        whatIsIt: 'Oil lubricates all the moving parts inside your engine, reducing friction and removing heat. Over time, oil breaks down and gets contaminated with dirt and metal particles.',
        whyMatters: 'Fresh oil protects your engine from wear. Skipping oil changes is the #1 cause of preventable engine damage and can lead to engine failure costing $5,000+.',
        warningSignsIfSkipped: 'Engine runs louder, oil pressure warning light, dark/gritty oil on dipstick, burning smell.',
        diyDifficulty: 'moderate',
        highMileageNote: 'High-mileage drivers (30,000+ miles/year) should change oil every 3,000-5,000 miles regardless of the standard interval. City driving with frequent stops accelerates oil breakdown.'
      },
      tire_rotation: {
        whatIsIt: 'Moving tires to different positions on your vehicle so they wear evenly. Front tires typically wear faster due to steering and braking forces.',
        whyMatters: 'Even wear extends tire life by 20-30%. Uneven tires hurt handling and can be dangerous in wet conditions.',
        warningSignsIfSkipped: 'Uneven tread wear patterns, vibration at highway speeds, vehicle pulling to one side.',
        diyDifficulty: 'easy',
        highMileageNote: 'High-mileage drivers should rotate tires every 5,000 miles. City driving with constant turning and stopping causes uneven front tire wear faster than highway driving.'
      },
      engine_air_filter: {
        whatIsIt: 'A pleated paper or fabric filter that prevents dust, dirt, and debris from entering your engine. Located in the air intake system.',
        whyMatters: 'A clogged filter restricts airflow, reducing power and fuel economy by up to 10%. Dirty air can damage engine internals.',
        warningSignsIfSkipped: 'Reduced acceleration, worse fuel economy, engine misfires, visible dirt on filter.',
        diyDifficulty: 'easy'
      },
      cabin_air_filter: {
        whatIsIt: 'Filters the air that comes through your heating and AC vents. Traps pollen, dust, and pollutants before they enter the cabin.',
        whyMatters: 'Essential for allergies and respiratory health. A clogged cabin filter can also reduce AC effectiveness and cause musty odors.',
        warningSignsIfSkipped: 'Musty smell from vents, weak airflow, foggy windows, increased allergies while driving.',
        diyDifficulty: 'easy',
        highMileageNote: 'Professional drivers with passengers should replace cabin filters every 10,000-15,000 miles to maintain air quality and passenger comfort.'
      },
      brake_fluid: {
        whatIsIt: 'Hydraulic fluid that transfers force from your brake pedal to the brake calipers. It operates under extreme heat and pressure.',
        whyMatters: 'Brake fluid absorbs moisture over time, lowering its boiling point. Old fluid can boil during hard braking, causing brake fade - terrifying and dangerous.',
        warningSignsIfSkipped: 'Soft or spongy brake pedal, reduced braking power, brake warning light, dark-colored fluid.',
        diyDifficulty: 'professional',
        highMileageNote: 'Frequent city braking generates more heat, which accelerates moisture absorption. High-mileage drivers should flush brake fluid every 18 months instead of 24 months.'
      },
      transmission_fluid: {
        whatIsIt: 'Lubricates gears and clutches inside your transmission, and acts as hydraulic fluid for automatic transmissions.',
        whyMatters: 'The transmission is one of the most expensive components to replace ($3,000-$8,000). Fresh fluid prevents wear and ensures smooth shifting.',
        warningSignsIfSkipped: 'Delayed or rough gear shifts, transmission slipping, grinding noises, burnt smell.',
        diyDifficulty: 'professional',
        highMileageNote: 'Stop-and-go city driving is brutal on transmissions. High-mileage drivers should change fluid every 30,000-40,000 miles instead of the typical 60,000 mile interval.'
      },
      coolant_flush: {
        whatIsIt: 'Draining old coolant (antifreeze) and replacing it with fresh fluid. Coolant circulates through your engine and radiator to regulate temperature.',
        whyMatters: 'Old coolant becomes acidic and can corrode your radiator, water pump, and engine. Overheating from coolant failure destroys engines.',
        warningSignsIfSkipped: 'Overheating, visible rust in coolant, sweet smell (coolant leak), temperature gauge running high.',
        diyDifficulty: 'moderate',
        highMileageNote: 'Vehicles idling in traffic or carrying passengers constantly work the cooling system harder. High-mileage drivers should flush coolant every 40,000 miles or 3 years.'
      },
      spark_plugs: {
        whatIsIt: 'Small devices that create electrical sparks to ignite the fuel-air mixture in your engine cylinders.',
        whyMatters: 'Worn spark plugs cause misfires, reduced fuel economy, rough idle, and can damage your catalytic converter ($1,000+ part).',
        warningSignsIfSkipped: 'Rough idle, engine misfires, hard starting, poor acceleration, check engine light.',
        diyDifficulty: 'moderate'
      },
      carbon_cleaning: {
        whatIsIt: "Removing carbon deposits from intake valves using walnut shell blasting or chemical cleaning. Only needed for direct injection engines where fuel doesn't clean the valves naturally.",
        whyMatters: 'Carbon buildup restricts airflow and causes misfires, rough idle, and reduced power. European vehicles with direct injection are especially prone.',
        warningSignsIfSkipped: 'Rough idle, misfires, reduced power, check engine light for lean conditions.',
        diyDifficulty: 'professional'
      },
      fuel_system_cleaning: {
        whatIsIt: 'Cleaning fuel injectors and fuel lines to remove deposits that accumulate from gasoline additives and impurities.',
        whyMatters: 'Clogged injectors cause uneven fuel delivery, leading to poor performance, rough idle, and reduced fuel economy.',
        warningSignsIfSkipped: 'Rough idle, hesitation on acceleration, reduced fuel economy, engine misfires.',
        diyDifficulty: 'professional'
      },
      throttle_body_service: {
        whatIsIt: 'Cleaning the throttle body - the valve that controls how much air enters your engine. Carbon and oil vapor create deposits that affect idle.',
        whyMatters: 'A dirty throttle body causes erratic idle, stalling, and poor throttle response. Cleaning restores smooth operation.',
        warningSignsIfSkipped: 'Rough or high idle, stalling, check engine light, uneven acceleration.',
        diyDifficulty: 'moderate'
      },
      brake_pads_front: {
        whatIsIt: 'Friction material that presses against brake rotors to slow your wheels. Front brakes do 60-70% of the stopping work.',
        whyMatters: 'Worn pads lead to longer stopping distances and can damage rotors (much more expensive to replace). Safety critical.',
        warningSignsIfSkipped: 'Squealing or grinding noise when braking, longer stopping distances, brake pedal vibration.',
        diyDifficulty: 'moderate',
        highMileageNote: 'City driving wears brake pads 2-3x faster. High-mileage drivers may need new front pads every 20,000-25,000 miles. Inspect pads monthly if you drive professionally.'
      },
      brake_pads_rear: {
        whatIsIt: 'Same as front brake pads but for the rear wheels. They typically last longer because they do less work.',
        whyMatters: 'Rear brakes help stabilize the vehicle during braking. Worn rear pads affect handling and increase front brake wear.',
        warningSignsIfSkipped: 'Squealing from rear, vehicle nose-diving when braking, uneven brake feel.',
        diyDifficulty: 'moderate',
        highMileageNote: 'Rear pads last longer than fronts, but city drivers still wear them faster. Expect replacement every 30,000-35,000 miles for high-mileage driving.'
      },
      battery_check: {
        whatIsIt: 'Testing battery voltage, cold cranking amps, and inspecting terminals for corrosion. Batteries typically last 3-5 years.',
        whyMatters: 'A failing battery leaves you stranded. Modern cars with lots of electronics are especially sensitive to battery issues.',
        warningSignsIfSkipped: 'Slow engine crank, dim lights, electrical glitches, battery warning light.',
        diyDifficulty: 'easy'
      },
      wiper_blades: {
        whatIsIt: 'Rubber blades that clear rain, snow, and debris from your windshield. UV exposure and temperature changes degrade the rubber.',
        whyMatters: "Poor wipers severely reduce visibility in rain - a major safety issue. They're inexpensive and easy to replace.",
        warningSignsIfSkipped: 'Streaking, smearing, skipping, squeaking, visible cracks in rubber.',
        diyDifficulty: 'easy'
      },
      wheel_alignment: {
        whatIsIt: "Adjusting the angles of your wheels so they're parallel to each other and perpendicular to the ground.",
        whyMatters: 'Misalignment causes uneven tire wear (expensive!), poor handling, and the car pulling to one side.',
        warningSignsIfSkipped: 'Vehicle pulls left or right, uneven tire wear, steering wheel off-center when driving straight.',
        diyDifficulty: 'professional'
      },
      serpentine_belt: {
        whatIsIt: 'A single rubber belt that drives multiple components: alternator, power steering pump, AC compressor, and sometimes the water pump.',
        whyMatters: 'If this belt breaks, you lose power steering, AC, and charging. If it drives the water pump, the engine overheats immediately.',
        warningSignsIfSkipped: 'Squealing noise, visible cracks, fraying, AC not working, power steering loss.',
        diyDifficulty: 'moderate'
      },
      timing_belt: {
        whatIsIt: "A toothed belt that synchronizes the engine's camshaft and crankshaft so valves open at the right time.",
        whyMatters: 'CRITICAL: In "interference" engines, a broken timing belt causes pistons to hit valves, destroying the engine. $5,000-$10,000+ repair.',
        warningSignsIfSkipped: 'None - timing belts fail without warning. Replace at manufacturer intervals!',
        diyDifficulty: 'professional'
      },
      multi_point_inspection: {
        whatIsIt: 'A comprehensive visual and functional check of major vehicle systems: brakes, fluids, tires, lights, belts, hoses, suspension.',
        whyMatters: 'Catches small problems before they become expensive repairs. Good shops do this with every oil change.',
        warningSignsIfSkipped: 'Small issues go unnoticed until they become major failures.',
        diyDifficulty: 'moderate'
      }
    };

    function toggleMaintenanceEducation(code) {
      const content = document.getElementById('edu-content-' + code);
      const btn = document.getElementById('edu-btn-' + code);
      if (content) {
        content.classList.toggle('expanded');
        btn.textContent = content.classList.contains('expanded') ? '✕ Close' : 'ℹ️ What is this?';
      }
    }

    function getEducationHtml(code) {
      const edu = maintenanceEducation[code];
      if (!edu) return '';
      
      const difficultyLabels = { easy: '🟢 DIY-Friendly', moderate: '🟡 Moderate DIY', professional: '🔴 Professional Recommended' };
      
      const highMileageSection = edu.highMileageNote ? `
            <div class="edu-section" style="background:var(--accent-gold-soft);border-radius:var(--radius-sm);padding:12px;margin-top:8px;">
              <div class="edu-section-title" style="color:var(--accent-gold);">🚗 High-Mileage & Professional Drivers</div>
              <div class="edu-section-text">${edu.highMileageNote}</div>
            </div>` : '';
      
      return `
        <button class="edu-toggle-btn" id="edu-btn-${code}" onclick="event.stopPropagation(); toggleMaintenanceEducation('${code}')">ℹ️ What is this?</button>
        <div class="edu-content" id="edu-content-${code}">
          <div class="edu-card">
            <div class="edu-section">
              <div class="edu-section-title">📖 What is it?</div>
              <div class="edu-section-text">${edu.whatIsIt}</div>
            </div>
            <div class="edu-section">
              <div class="edu-section-title">⚠️ Why it matters</div>
              <div class="edu-section-text">${edu.whyMatters}</div>
            </div>
            <div class="edu-section">
              <div class="edu-section-title">🚨 Warning signs if skipped</div>
              <div class="edu-section-text">${edu.warningSignsIfSkipped}</div>
            </div>
            <div class="edu-section">
              <div class="edu-section-title">🔧 DIY Difficulty</div>
              <span class="edu-difficulty ${edu.diyDifficulty}">${difficultyLabels[edu.diyDifficulty] || edu.diyDifficulty}</span>
            </div>${highMileageSection}
          </div>
        </div>
      `;
    }

    function getDefaultMaintenanceSchedule(vehicleClass, vehicle) {
      const isEV = vehicleClass === 'electric';
      const isHybrid = (vehicle.fuel_type || '').toLowerCase().includes('hybrid');
      
      const fuelInjectionType = vehicle.fuel_injection_type || detectFuelInjectionType(vehicle.make, vehicle.model, vehicle.year, vehicle.trim);
      const needsCarbonCleaning = fuelInjectionType === 'direct_injection' || fuelInjectionType === 'dual_injection';
      
      const baseSchedule = [
        { code: 'oil_synthetic', name: 'Oil & Filter Change', icon: '🛢️', category: 'fluids', base_mileage_interval: vehicleClass === 'european' ? 10000 : 7500, base_months_interval: 12, priority: 'critical', high_mileage_multiplier: 0.75, notes: 'Full synthetic oil recommended' },
        { code: 'tire_rotation', name: 'Tire Rotation', icon: '🔄', category: 'tires', base_mileage_interval: 6000, base_months_interval: 6, priority: 'recommended', high_mileage_multiplier: 1.0, notes: 'Promotes even tire wear' },
        { code: 'engine_air_filter', name: 'Engine Air Filter', icon: '💨', category: 'filters', base_mileage_interval: 25000, base_months_interval: 24, priority: 'recommended', high_mileage_multiplier: 0.8, notes: 'Replace sooner in dusty conditions' },
        { code: 'cabin_air_filter', name: 'Cabin Air Filter', icon: '🌬️', category: 'filters', base_mileage_interval: 20000, base_months_interval: 18, priority: 'recommended', high_mileage_multiplier: 0.85, notes: 'Keeps interior air clean' },
        { code: 'brake_fluid', name: 'Brake Fluid Flush', icon: '🛑', category: 'fluids', base_mileage_interval: 0, base_months_interval: 24, priority: 'critical', high_mileage_multiplier: 0.85, notes: 'Replace every 2-3 years regardless of mileage' },
        { code: 'transmission_fluid', name: 'Transmission Fluid', icon: '⚙️', category: 'fluids', base_mileage_interval: 60000, base_months_interval: 48, priority: 'recommended', high_mileage_multiplier: 0.75, notes: 'Critical for transmission longevity' },
        { code: 'coolant_flush', name: 'Coolant Flush', icon: '❄️', category: 'fluids', base_mileage_interval: 50000, base_months_interval: 48, priority: 'recommended', high_mileage_multiplier: 0.8, notes: 'Prevents overheating and corrosion' },
        { code: 'spark_plugs', name: 'Spark Plugs', icon: '⚡', category: 'engine', base_mileage_interval: vehicleClass === 'asian' ? 100000 : 60000, base_months_interval: vehicleClass === 'asian' ? 84 : 60, priority: 'recommended', high_mileage_multiplier: 0.9, notes: vehicleClass === 'asian' ? 'Iridium plugs - extended interval' : 'Check manufacturer specs' },
        { code: 'carbon_cleaning', name: 'Carbon Cleaning (Walnut Blasting)', icon: '🥜', category: 'engine', base_mileage_interval: vehicleClass === 'european' ? 50000 : 70000, base_months_interval: 60, priority: 'recommended', high_mileage_multiplier: 0.8, notes: 'Critical for direct injection engines - removes carbon buildup from intake valves' },
        { code: 'fuel_system_cleaning', name: 'Fuel System Cleaning', icon: '⛽', category: 'engine', base_mileage_interval: 30000, base_months_interval: 30, priority: 'recommended', high_mileage_multiplier: 0.85, notes: 'Cleans fuel injectors and intake for optimal performance' },
        { code: 'throttle_body_service', name: 'Throttle Body Service', icon: '🔧', category: 'engine', base_mileage_interval: 60000, base_months_interval: 48, priority: 'recommended', high_mileage_multiplier: 0.85, notes: 'Clean throttle body for smooth idle and response' },
        { code: 'brake_pads_front', name: 'Front Brake Pads', icon: '🛑', category: 'brakes', base_mileage_interval: 40000, base_months_interval: 36, priority: 'critical', high_mileage_multiplier: 0.85, notes: 'Inspect regularly for wear' },
        { code: 'brake_pads_rear', name: 'Rear Brake Pads', icon: '🛑', category: 'brakes', base_mileage_interval: 50000, base_months_interval: 48, priority: 'critical', high_mileage_multiplier: 0.85, notes: 'Usually last longer than front' },
        { code: 'battery_check', name: 'Battery Inspection', icon: '🔋', category: 'electrical', base_mileage_interval: 12000, base_months_interval: 12, priority: 'recommended', high_mileage_multiplier: 1.0, notes: 'Test and clean terminals' },
        { code: 'wiper_blades', name: 'Wiper Blades', icon: '🌧️', category: 'electrical', base_mileage_interval: 15000, base_months_interval: 12, priority: 'recommended', high_mileage_multiplier: 1.0, notes: 'Replace when streaking' },
        { code: 'wheel_alignment', name: 'Wheel Alignment', icon: '🎯', category: 'tires', base_mileage_interval: 25000, base_months_interval: 24, priority: 'recommended', high_mileage_multiplier: 0.9, notes: 'Check if pulling or uneven tire wear' },
        { code: 'serpentine_belt', name: 'Serpentine Belt', icon: '🔗', category: 'engine', base_mileage_interval: 60000, base_months_interval: 60, priority: 'recommended', high_mileage_multiplier: 0.85, notes: 'Inspect for cracks and wear' },
        { code: 'timing_belt', name: 'Timing Belt/Chain', icon: '🔗', category: 'engine', base_mileage_interval: 90000, base_months_interval: 84, priority: 'critical', high_mileage_multiplier: 0.9, notes: 'Critical! Failure causes major engine damage' },
        { code: 'multi_point_inspection', name: 'Multi-Point Inspection', icon: '📋', category: 'other', base_mileage_interval: 15000, base_months_interval: 12, priority: 'recommended', high_mileage_multiplier: 1.0, notes: 'Comprehensive vehicle check' }
      ];
      
      if (isEV) {
        return baseSchedule.filter(s => ['tire_rotation', 'cabin_air_filter', 'brake_fluid', 'wiper_blades', 'multi_point_inspection', 'wheel_alignment', 'battery_check'].includes(s.code));
      }
      
      if (!needsCarbonCleaning) {
        return baseSchedule.filter(s => s.code !== 'carbon_cleaning');
      }
      
      return baseSchedule;
    }

    function renderMaintenanceItems() {
      const vehicle = vehicles.find(v => v.id === selectedMaintenanceVehicle);
      if (!vehicle) return;
      
      const container = document.getElementById('maintenance-items-container');
      
      const items = maintenanceScheduleData.map(item => {
        const lastService = maintenanceServiceHistory.find(h => h.service_code === item.code);
        const calc = calculateMaintenanceStatus(item, vehicle, lastService, maintenanceDrivingConditions);
        return { ...item, ...calc, lastService };
      });
      
      let filteredItems = items;
      if (maintenanceStatusFilter !== 'all') {
        filteredItems = items.filter(i => i.status === maintenanceStatusFilter);
      }
      
      const overdue = items.filter(i => i.status === 'overdue').length;
      const dueSoon = items.filter(i => i.status === 'due-soon').length;
      const upToDate = items.filter(i => i.status === 'up-to-date').length;
      
      document.getElementById('maint-overdue-count').textContent = overdue;
      document.getElementById('maint-due-soon-count').textContent = dueSoon;
      document.getElementById('maint-up-to-date-count').textContent = upToDate;
      document.getElementById('maint-total-count').textContent = items.length;
      
      const badge = document.getElementById('maintenance-due-count');
      if (overdue > 0) {
        badge.style.display = 'inline';
        badge.textContent = overdue;
        badge.style.background = 'var(--accent-red)';
      } else if (dueSoon > 0) {
        badge.style.display = 'inline';
        badge.textContent = dueSoon;
        badge.style.background = 'var(--accent-orange)';
      } else {
        badge.style.display = 'none';
      }
      
      if (!filteredItems.length) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">✅</div><p>No items match this filter.</p></div>`;
        return;
      }
      
      const categories = [...new Set(filteredItems.map(i => i.category))];
      
      container.innerHTML = categories.map(cat => {
        const catItems = filteredItems.filter(i => i.category === cat);
        const catLabel = cat.charAt(0).toUpperCase() + cat.slice(1);
        
        return `
          <div style="margin-bottom:24px;">
            <h3 style="font-size:1rem;color:var(--text-secondary);margin-bottom:12px;text-transform:uppercase;letter-spacing:0.05em;">${catLabel}</h3>
            <div style="display:grid;gap:12px;">
              ${catItems.map(item => renderMaintenanceItem(item, vehicle)).join('')}
            </div>
          </div>
        `;
      }).join('');
    }

    function renderMaintenanceItem(item, vehicle) {
      const statusColors = {
        'overdue': 'var(--accent-red)',
        'due-soon': 'var(--accent-orange)',
        'up-to-date': 'var(--accent-green)'
      };
      const statusLabels = {
        'overdue': 'Overdue',
        'due-soon': 'Due Soon',
        'up-to-date': 'Up to Date'
      };
      
      const progressColor = statusColors[item.status];
      const progressWidth = Math.min(item.progress, 100);
      
      let dueInfo = '';
      if (item.adjustedMileageInterval > 0) {
        const milesLeft = item.nextDueMileage - (vehicle.mileage || 0);
        dueInfo = milesLeft > 0 ? `${milesLeft.toLocaleString()} miles left` : `${Math.abs(milesLeft).toLocaleString()} miles overdue`;
      }
      if (item.nextDueDate) {
        const daysLeft = Math.ceil((item.nextDueDate - new Date()) / (1000 * 60 * 60 * 24));
        if (dueInfo) dueInfo += ' or ';
        dueInfo += daysLeft > 0 ? `${daysLeft} days` : `${Math.abs(daysLeft)} days overdue`;
      }
      
      return `
        <div class="card" style="padding:16px;border-left:4px solid ${progressColor};">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;">
            <div style="flex:1;min-width:200px;">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                <span style="font-size:1.3rem;">${item.icon}</span>
                <div>
                  <div style="font-weight:600;">${item.name}</div>
                  <div style="font-size:0.8rem;color:var(--text-muted);">Every ${item.adjustedMileageInterval > 0 ? item.adjustedMileageInterval.toLocaleString() + ' mi' : ''}${item.adjustedMileageInterval > 0 && item.adjustedMonthsInterval > 0 ? ' or ' : ''}${item.adjustedMonthsInterval > 0 ? item.adjustedMonthsInterval + ' months' : ''}</div>
                </div>
              </div>
              ${item.isHighMileage ? '<span style="background:rgba(255,159,67,0.15);color:var(--accent-orange);padding:2px 8px;border-radius:100px;font-size:0.7rem;font-weight:500;">HIGH MILEAGE ADJUSTED</span>' : ''}
            </div>
            <div style="text-align:right;min-width:140px;">
              <div style="font-weight:600;color:${progressColor};margin-bottom:4px;">${statusLabels[item.status]}</div>
              <div style="font-size:0.8rem;color:var(--text-muted);">${dueInfo}</div>
            </div>
          </div>
          <div style="margin-top:12px;">
            <div style="background:var(--bg-elevated);border-radius:100px;height:6px;overflow:hidden;">
              <div style="background:${progressColor};height:100%;width:${progressWidth}%;transition:width 0.3s;"></div>
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;flex-wrap:wrap;gap:8px;">
            <div style="font-size:0.8rem;color:var(--text-muted);">
              ${item.lastService ? `Last: ${new Date(item.lastService.service_date).toLocaleDateString()} at ${(item.lastService.mileage_at_service || 0).toLocaleString()} mi` : 'No service logged'}
            </div>
            <div style="display:flex;gap:8px;">
              <button class="btn btn-sm btn-secondary" onclick="openLogServiceModal('${item.code}')">Log Service</button>
              ${item.status !== 'up-to-date' ? `<button class="btn btn-sm btn-primary" onclick="postMaintenanceRequest('${item.code}', '${item.name.replace(/'/g, "\\'")}')">Post Request</button>` : ''}
            </div>
          </div>
          ${item.notes ? `<div style="font-size:0.8rem;color:var(--text-muted);margin-top:8px;padding-top:8px;border-top:1px solid var(--border-subtle);">💡 ${item.notes}</div>` : ''}
          <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-subtle);">
            ${getEducationHtml(item.code)}
          </div>
        </div>
      `;
    }

    function filterMaintenanceStatus(status) {
      maintenanceStatusFilter = status;
      renderMaintenanceItems();
    }

    async function updateVehicleMileage() {
      const input = document.getElementById('current-mileage-input');
      const mileage = parseInt(input.value);
      if (!mileage || mileage < 0) {
        showToast('Please enter a valid mileage', 'error');
        return;
      }
      
      const vehicle = vehicles.find(v => v.id === selectedMaintenanceVehicle);
      if (!vehicle) return;
      
      try {
        const { error } = await supabaseClient
          .from('vehicles')
          .update({ mileage })
          .eq('id', selectedMaintenanceVehicle);
        
        if (error) throw error;
        
        vehicle.mileage = mileage;
        renderMaintenanceItems();
        showToast('Mileage updated!', 'success');
      } catch (err) {
        console.error('Error updating mileage:', err);
        showToast('Failed to update mileage', 'error');
      }
    }

    function openLogServiceModal(serviceCode = '') {
      const modal = document.getElementById('log-service-modal');
      const select = document.getElementById('log-service-type');
      
      select.innerHTML = '<option value="">Select a service...</option>' + 
        maintenanceScheduleData.map(s => `<option value="${s.code}" ${s.code === serviceCode ? 'selected' : ''}>${s.icon} ${s.name}</option>`).join('');
      
      document.getElementById('log-service-date').value = new Date().toISOString().split('T')[0];
      const vehicle = vehicles.find(v => v.id === selectedMaintenanceVehicle);
      document.getElementById('log-service-mileage').value = vehicle?.mileage || '';
      document.getElementById('log-service-by').value = '';
      document.getElementById('log-service-cost').value = '';
      document.getElementById('log-service-notes').value = '';
      
      modal.style.display = 'flex';
    }

    function closeLogServiceModal() {
      document.getElementById('log-service-modal').style.display = 'none';
    }

    async function saveServiceLog() {
      const serviceCode = document.getElementById('log-service-type').value;
      const serviceDate = document.getElementById('log-service-date').value;
      const mileage = parseInt(document.getElementById('log-service-mileage').value);
      const performedBy = document.getElementById('log-service-by').value.trim();
      const cost = parseFloat(document.getElementById('log-service-cost').value) || null;
      const notes = document.getElementById('log-service-notes').value.trim();
      
      if (!serviceCode) {
        showToast('Please select a service type', 'error');
        return;
      }
      if (!serviceDate) {
        showToast('Please enter a service date', 'error');
        return;
      }
      if (!mileage || mileage < 0) {
        showToast('Please enter a valid mileage', 'error');
        return;
      }
      
      const serviceItem = maintenanceScheduleData.find(s => s.code === serviceCode);
      const vehicle = vehicles.find(v => v.id === selectedMaintenanceVehicle);
      
      const newRecord = {
        service_code: serviceCode,
        service_date: serviceDate,
        mileage_at_service: mileage,
        performed_by: performedBy,
        cost_cents: cost ? Math.round(cost * 100) : null,
        notes: notes
      };
      
      try {
        const { error } = await supabaseClient
          .from('vehicle_service_history')
          .insert({
            vehicle_id: selectedMaintenanceVehicle,
            member_id: currentUser.id,
            service_type_code: serviceCode,
            service_date: serviceDate,
            mileage_at_service: mileage,
            performed_by: performedBy || null,
            cost_cents: cost ? Math.round(cost * 100) : null,
            notes: notes || null,
            source: 'manual'
          });
        
        if (error) {
          console.log('DB insert failed:', error.message);
        }
      } catch (e) {
        console.log('DB insert failed, saving locally:', e.message);
      }
      
      maintenanceServiceHistory.unshift(newRecord);
      
      if (vehicle && mileage > (vehicle.mileage || 0)) {
        vehicle.mileage = mileage;
        document.getElementById('current-mileage-input').value = mileage;
        try {
          await supabaseClient.from('vehicles').update({ mileage }).eq('id', selectedMaintenanceVehicle);
        } catch (e) { console.error(e); }
      }
      
      closeLogServiceModal();
      renderMaintenanceItems();
      showToast(`${serviceItem?.name || 'Service'} logged successfully!`, 'success');
    }

    function openDrivingConditionsModal() {
      const modal = document.getElementById('driving-conditions-modal');
      const conditions = maintenanceDrivingConditions;
      
      document.getElementById('driving-primary-use').value = conditions.primary_use || 'mixed';
      document.getElementById('driving-climate').value = conditions.climate || 'moderate';
      document.getElementById('driving-towing').checked = conditions.towing_hauling || false;
      document.getElementById('driving-short-trips').checked = conditions.short_trips || false;
      document.getElementById('driving-dusty').checked = conditions.dusty_conditions || false;
      
      modal.style.display = 'flex';
    }

    function closeDrivingConditionsModal() {
      document.getElementById('driving-conditions-modal').style.display = 'none';
    }

    async function saveDrivingConditions() {
      const newConditions = {
        primary_use: document.getElementById('driving-primary-use').value,
        climate: document.getElementById('driving-climate').value,
        towing_hauling: document.getElementById('driving-towing').checked,
        short_trips: document.getElementById('driving-short-trips').checked,
        dusty_conditions: document.getElementById('driving-dusty').checked
      };
      
      try {
        const { error } = await supabaseClient
          .from('vehicle_driving_conditions')
          .upsert({
            vehicle_id: selectedMaintenanceVehicle,
            member_id: currentUser.id,
            ...newConditions
          }, { onConflict: 'vehicle_id' });
        
        if (error) throw error;
      } catch (e) {
        console.log('DB save failed, applying locally:', e.message);
      }
      
      maintenanceDrivingConditions = newConditions;
      closeDrivingConditionsModal();
      renderMaintenanceItems();
      showToast('Driving conditions saved! Intervals adjusted.', 'success');
    }

    function postMaintenanceRequest(serviceCode, serviceName) {
      const vehicle = vehicles.find(v => v.id === selectedMaintenanceVehicle);
      if (!vehicle) return;
      
      showSection('packages');
      setTimeout(() => {
        document.getElementById('pkg-vehicle-select').value = vehicle.id;
        const titleInput = document.getElementById('pkg-title');
        if (titleInput) titleInput.value = serviceName;
        const descInput = document.getElementById('pkg-description');
        if (descInput) descInput.value = `Scheduled maintenance: ${serviceName} for ${vehicle.year} ${vehicle.make} ${vehicle.model}. Current mileage: ${(vehicle.mileage || 0).toLocaleString()} miles.`;
      }, 100);
    }


    // ========== COST ESTIMATOR ==========
    const estimatorServiceData = {
      maintenance: {
        name: 'Maintenance', icon: '🔧',
        services: [
          { name: 'Oil Change', hasTiers: true, tiers: {
            basic: { domestic: { low: 35, avg: 45, high: 55 }, asian: { low: 40, avg: 50, high: 60 }, european: { low: 75, avg: 95, high: 120 } },
            standard: { domestic: { low: 55, avg: 70, high: 85 }, asian: { low: 60, avg: 75, high: 90 }, european: { low: 100, avg: 125, high: 150 } },
            premium: { domestic: { low: 75, avg: 95, high: 125 }, asian: { low: 80, avg: 100, high: 130 }, european: { low: 125, avg: 165, high: 225 } }
          }},
          { name: 'Brake Pads - Front', hasTiers: false, prices: { domestic: { low: 120, avg: 175, high: 250 }, asian: { low: 130, avg: 185, high: 260 }, european: { low: 200, avg: 300, high: 450 } }},
          { name: 'Brake Pads - Rear', hasTiers: false, prices: { domestic: { low: 110, avg: 160, high: 230 }, asian: { low: 120, avg: 170, high: 240 }, european: { low: 180, avg: 280, high: 420 } }},
          { name: 'Brake Rotors + Pads - Front', hasTiers: false, prices: { domestic: { low: 250, avg: 350, high: 500 }, asian: { low: 280, avg: 380, high: 550 }, european: { low: 450, avg: 650, high: 950 } }},
          { name: 'Brake Fluid Flush', hasTiers: false, prices: { domestic: { low: 80, avg: 120, high: 180 }, asian: { low: 90, avg: 130, high: 190 }, european: { low: 120, avg: 180, high: 280 } }},
          { name: 'Tire Rotation', hasTiers: false, prices: { domestic: { low: 25, avg: 40, high: 60 }, asian: { low: 25, avg: 40, high: 60 }, european: { low: 35, avg: 55, high: 80 } }},
          { name: 'Tire Balance', hasTiers: false, prices: { domestic: { low: 40, avg: 60, high: 100 }, asian: { low: 40, avg: 60, high: 100 }, european: { low: 60, avg: 90, high: 140 } }},
          { name: 'Wheel Alignment', hasTiers: false, prices: { domestic: { low: 75, avg: 120, high: 180 }, asian: { low: 85, avg: 130, high: 190 }, european: { low: 120, avg: 180, high: 280 } }},
          { name: 'Transmission Fluid Change', hasTiers: false, prices: { domestic: { low: 150, avg: 200, high: 300 }, asian: { low: 160, avg: 220, high: 320 }, european: { low: 250, avg: 350, high: 500 } }},
          { name: 'Coolant Flush', hasTiers: false, prices: { domestic: { low: 100, avg: 150, high: 200 }, asian: { low: 110, avg: 160, high: 220 }, european: { low: 150, avg: 220, high: 320 } }},
          { name: 'Power Steering Flush', hasTiers: false, prices: { domestic: { low: 80, avg: 120, high: 180 }, asian: { low: 90, avg: 130, high: 190 }, european: { low: 120, avg: 170, high: 250 } }},
          { name: 'Battery Replacement', hasTiers: true, tiers: {
            standard: { domestic: { low: 150, avg: 220, high: 350 }, asian: { low: 160, avg: 240, high: 380 }, european: { low: 250, avg: 380, high: 550 } },
            premium: { domestic: { low: 200, avg: 300, high: 450 }, asian: { low: 220, avg: 320, high: 480 }, european: { low: 320, avg: 450, high: 650 } }
          }},
          { name: 'Engine Air Filter', hasTiers: false, prices: { domestic: { low: 30, avg: 50, high: 80 }, asian: { low: 35, avg: 55, high: 85 }, european: { low: 50, avg: 80, high: 130 } }},
          { name: 'Cabin Air Filter', hasTiers: false, prices: { domestic: { low: 40, avg: 60, high: 100 }, asian: { low: 45, avg: 65, high: 105 }, european: { low: 60, avg: 95, high: 150 } }},
          { name: 'Spark Plugs', hasTiers: false, prices: { domestic: { low: 150, avg: 250, high: 400 }, asian: { low: 160, avg: 280, high: 450 }, european: { low: 250, avg: 400, high: 650 } }},
          { name: 'Timing Belt', hasTiers: false, prices: { domestic: { low: 400, avg: 600, high: 900 }, asian: { low: 450, avg: 650, high: 950 }, european: { low: 600, avg: 900, high: 1400 } }},
          { name: 'Timing Belt + Water Pump', hasTiers: false, prices: { domestic: { low: 600, avg: 850, high: 1200 }, asian: { low: 650, avg: 900, high: 1300 }, european: { low: 900, avg: 1300, high: 1900 } }}
        ]
      },
      repair: {
        name: 'Repairs', icon: '🛠️',
        services: [
          { name: 'Alternator Replacement', hasTiers: false, prices: { domestic: { low: 350, avg: 500, high: 750 }, asian: { low: 380, avg: 550, high: 800 }, european: { low: 550, avg: 800, high: 1200 } }},
          { name: 'Starter Replacement', hasTiers: false, prices: { domestic: { low: 350, avg: 500, high: 700 }, asian: { low: 380, avg: 550, high: 750 }, european: { low: 500, avg: 750, high: 1100 } }},
          { name: 'Water Pump Replacement', hasTiers: false, prices: { domestic: { low: 300, avg: 450, high: 700 }, asian: { low: 330, avg: 500, high: 750 }, european: { low: 450, avg: 700, high: 1100 } }},
          { name: 'Thermostat Replacement', hasTiers: false, prices: { domestic: { low: 150, avg: 250, high: 400 }, asian: { low: 170, avg: 280, high: 450 }, european: { low: 250, avg: 400, high: 600 } }},
          { name: 'Oxygen Sensor Replacement', hasTiers: false, prices: { domestic: { low: 200, avg: 300, high: 450 }, asian: { low: 220, avg: 330, high: 490 }, european: { low: 300, avg: 450, high: 700 } }},
          { name: 'Catalytic Converter', hasTiers: true, tiers: {
            standard: { domestic: { low: 1200, avg: 1800, high: 2800 }, asian: { low: 1400, avg: 2000, high: 3200 }, european: { low: 2000, avg: 3000, high: 4500 } },
            premium: { domestic: { low: 1800, avg: 2500, high: 4000 }, asian: { low: 2000, avg: 2800, high: 4500 }, european: { low: 2800, avg: 4000, high: 6000 } }
          }},
          { name: 'AC Recharge', hasTiers: false, prices: { domestic: { low: 120, avg: 180, high: 280 }, asian: { low: 130, avg: 195, high: 300 }, european: { low: 180, avg: 280, high: 420 } }},
          { name: 'AC Compressor Replacement', hasTiers: false, prices: { domestic: { low: 600, avg: 900, high: 1400 }, asian: { low: 660, avg: 990, high: 1540 }, european: { low: 900, avg: 1350, high: 2100 } }},
          { name: 'Radiator Replacement', hasTiers: false, prices: { domestic: { low: 400, avg: 600, high: 950 }, asian: { low: 440, avg: 660, high: 1045 }, european: { low: 600, avg: 900, high: 1425 } }},
          { name: 'Head Gasket', hasTiers: false, prices: { domestic: { low: 1500, avg: 2200, high: 3500 }, asian: { low: 1650, avg: 2420, high: 3850 }, european: { low: 2250, avg: 3300, high: 5250 } }},
          { name: 'Clutch Replacement', hasTiers: false, prices: { domestic: { low: 1000, avg: 1500, high: 2200 }, asian: { low: 1100, avg: 1650, high: 2420 }, european: { low: 1500, avg: 2250, high: 3300 } }},
          { name: 'Transmission Rebuild', hasTiers: false, prices: { domestic: { low: 2500, avg: 3500, high: 5000 }, asian: { low: 2750, avg: 3850, high: 5500 }, european: { low: 3750, avg: 5250, high: 7500 } }},
          { name: 'Engine Replacement', hasTiers: false, prices: { domestic: { low: 4000, avg: 6000, high: 10000 }, asian: { low: 4400, avg: 6600, high: 11000 }, european: { low: 6000, avg: 9000, high: 15000 } }}
        ]
      },
      detailing: {
        name: 'Detailing', icon: '✨',
        services: [
          { name: 'Basic Wash & Vacuum', hasTiers: false, prices: { domestic: { low: 40, avg: 60, high: 90 }, asian: { low: 40, avg: 60, high: 90 }, european: { low: 50, avg: 75, high: 110 } }},
          { name: 'Interior Detail', hasTiers: false, prices: { domestic: { low: 100, avg: 175, high: 280 }, asian: { low: 100, avg: 175, high: 280 }, european: { low: 130, avg: 225, high: 360 } }},
          { name: 'Exterior Detail', hasTiers: false, prices: { domestic: { low: 120, avg: 200, high: 320 }, asian: { low: 120, avg: 200, high: 320 }, european: { low: 155, avg: 260, high: 415 } }},
          { name: 'Full Detail', hasTiers: true, tiers: {
            standard: { domestic: { low: 200, avg: 350, high: 550 }, asian: { low: 200, avg: 350, high: 550 }, european: { low: 260, avg: 455, high: 715 } },
            premium: { domestic: { low: 350, avg: 500, high: 800 }, asian: { low: 350, avg: 500, high: 800 }, european: { low: 455, avg: 650, high: 1040 } }
          }},
          { name: 'Ceramic Coating', hasTiers: false, prices: { domestic: { low: 500, avg: 1000, high: 2000 }, asian: { low: 500, avg: 1000, high: 2000 }, european: { low: 650, avg: 1300, high: 2600 } }},
          { name: 'Paint Correction', hasTiers: false, prices: { domestic: { low: 300, avg: 500, high: 900 }, asian: { low: 300, avg: 500, high: 900 }, european: { low: 390, avg: 650, high: 1170 } }},
          { name: 'Headlight Restoration', hasTiers: false, prices: { domestic: { low: 60, avg: 100, high: 150 }, asian: { low: 60, avg: 100, high: 150 }, european: { low: 80, avg: 130, high: 195 } }},
          { name: 'Engine Bay Cleaning', hasTiers: false, prices: { domestic: { low: 60, avg: 100, high: 160 }, asian: { low: 60, avg: 100, high: 160 }, european: { low: 80, avg: 130, high: 210 } }},
          { name: 'Odor Removal', hasTiers: false, prices: { domestic: { low: 80, avg: 130, high: 200 }, asian: { low: 80, avg: 130, high: 200 }, european: { low: 105, avg: 170, high: 260 } }}
        ]
      },
      body: {
        name: 'Body Work', icon: '🚗',
        services: [
          { name: 'Dent Removal (PDR)', hasTiers: false, prices: { domestic: { low: 75, avg: 150, high: 300 }, asian: { low: 75, avg: 150, high: 300 }, european: { low: 100, avg: 200, high: 400 } }},
          { name: 'Scratch Repair', hasTiers: false, prices: { domestic: { low: 100, avg: 250, high: 500 }, asian: { low: 100, avg: 250, high: 500 }, european: { low: 140, avg: 350, high: 700 } }},
          { name: 'Bumper Repair', hasTiers: false, prices: { domestic: { low: 300, avg: 600, high: 1000 }, asian: { low: 330, avg: 660, high: 1100 }, european: { low: 450, avg: 900, high: 1500 } }},
          { name: 'Bumper Replacement', hasTiers: false, prices: { domestic: { low: 500, avg: 900, high: 1500 }, asian: { low: 550, avg: 990, high: 1650 }, european: { low: 750, avg: 1350, high: 2250 } }},
          { name: 'Fender Repair', hasTiers: false, prices: { domestic: { low: 400, avg: 700, high: 1200 }, asian: { low: 440, avg: 770, high: 1320 }, european: { low: 600, avg: 1050, high: 1800 } }},
          { name: 'Door Ding Repair', hasTiers: false, prices: { domestic: { low: 50, avg: 100, high: 200 }, asian: { low: 50, avg: 100, high: 200 }, european: { low: 70, avg: 140, high: 280 } }},
          { name: 'Full Panel Paint', hasTiers: false, prices: { domestic: { low: 500, avg: 800, high: 1400 }, asian: { low: 550, avg: 880, high: 1540 }, european: { low: 750, avg: 1200, high: 2100 } }},
          { name: 'Full Paint Job', hasTiers: false, prices: { domestic: { low: 2500, avg: 4500, high: 8000 }, asian: { low: 2750, avg: 4950, high: 8800 }, european: { low: 3750, avg: 6750, high: 12000 } }},
          { name: 'Windshield Replacement', hasTiers: false, prices: { domestic: { low: 250, avg: 400, high: 700 }, asian: { low: 280, avg: 450, high: 780 }, european: { low: 400, avg: 700, high: 1200 } }}
        ]
      },
      inspection: {
        name: 'Inspection', icon: '🔍',
        services: [
          { name: 'Pre-Purchase Inspection', hasTiers: false, prices: { domestic: { low: 100, avg: 150, high: 250 }, asian: { low: 100, avg: 150, high: 250 }, european: { low: 150, avg: 225, high: 375 } }},
          { name: 'State Inspection', hasTiers: false, prices: { domestic: { low: 20, avg: 35, high: 75 }, asian: { low: 20, avg: 35, high: 75 }, european: { low: 30, avg: 50, high: 100 } }},
          { name: 'Multi-Point Inspection', hasTiers: false, prices: { domestic: { low: 50, avg: 80, high: 150 }, asian: { low: 50, avg: 80, high: 150 }, european: { low: 75, avg: 120, high: 225 } }}
        ]
      },
      diagnostic: {
        name: 'Diagnostics', icon: '📊',
        services: [
          { name: 'Check Engine Light Diagnosis', hasTiers: false, prices: { domestic: { low: 80, avg: 120, high: 180 }, asian: { low: 90, avg: 135, high: 200 }, european: { low: 120, avg: 180, high: 270 } }},
          { name: 'Electrical Diagnosis', hasTiers: false, prices: { domestic: { low: 100, avg: 175, high: 300 }, asian: { low: 110, avg: 190, high: 330 }, european: { low: 150, avg: 260, high: 450 } }},
          { name: 'Transmission Diagnosis', hasTiers: false, prices: { domestic: { low: 120, avg: 200, high: 350 }, asian: { low: 130, avg: 220, high: 385 }, european: { low: 180, avg: 300, high: 525 } }},
          { name: 'Engine Performance Diagnosis', hasTiers: false, prices: { domestic: { low: 100, avg: 175, high: 300 }, asian: { low: 110, avg: 190, high: 330 }, european: { low: 150, avg: 260, high: 450 } }}
        ]
      },
      ev_hybrid: {
        name: 'EV & Hybrid', icon: '⚡',
        services: [
          { name: 'Battery Health Check', hasTiers: false, prices: { domestic: { low: 100, avg: 175, high: 300 }, asian: { low: 110, avg: 190, high: 330 }, electric: { low: 130, avg: 225, high: 390 } }},
          { name: 'EV Brake Service', hasTiers: false, prices: { domestic: { low: 150, avg: 250, high: 400 }, asian: { low: 165, avg: 275, high: 440 }, electric: { low: 195, avg: 325, high: 520 } }},
          { name: 'Charging System Diagnosis', hasTiers: false, prices: { domestic: { low: 120, avg: 200, high: 350 }, asian: { low: 130, avg: 220, high: 385 }, electric: { low: 155, avg: 260, high: 455 } }},
          { name: 'Hybrid Battery Service', hasTiers: false, prices: { domestic: { low: 200, avg: 350, high: 600 }, asian: { low: 220, avg: 385, high: 660 }, electric: { low: 260, avg: 455, high: 780 } }},
          { name: 'EV Coolant Flush', hasTiers: false, prices: { domestic: { low: 150, avg: 250, high: 400 }, asian: { low: 165, avg: 275, high: 440 }, electric: { low: 195, avg: 325, high: 520 } }},
          { name: 'Regenerative Brake Inspection', hasTiers: false, prices: { domestic: { low: 80, avg: 140, high: 220 }, asian: { low: 88, avg: 154, high: 242 }, electric: { low: 105, avg: 182, high: 286 } }}
        ]
      },
      protection: {
        name: 'Protection', icon: '🛡️',
        services: [
          { name: 'Undercoating / Rustproofing', hasTiers: false, prices: { domestic: { low: 150, avg: 300, high: 500 }, asian: { low: 165, avg: 330, high: 550 }, european: { low: 225, avg: 450, high: 750 } }},
          { name: 'Ceramic Coating (Premium)', hasTiers: true, tiers: {
            standard: { domestic: { low: 400, avg: 800, high: 1500 }, asian: { low: 400, avg: 800, high: 1500 }, european: { low: 520, avg: 1040, high: 1950 } },
            premium: { domestic: { low: 1000, avg: 1800, high: 3500 }, asian: { low: 1000, avg: 1800, high: 3500 }, european: { low: 1300, avg: 2340, high: 4550 } }
          }},
          { name: 'Paint Protection Film (PPF) - Full Front', hasTiers: false, prices: { domestic: { low: 1500, avg: 2500, high: 4500 }, asian: { low: 1500, avg: 2500, high: 4500 }, european: { low: 1950, avg: 3250, high: 5850 } }},
          { name: 'Paint Protection Film (PPF) - Full Vehicle', hasTiers: false, prices: { domestic: { low: 5000, avg: 7500, high: 12000 }, asian: { low: 5000, avg: 7500, high: 12000 }, european: { low: 6500, avg: 9750, high: 15600 } }},
          { name: 'Fabric Protection', hasTiers: false, prices: { domestic: { low: 100, avg: 175, high: 300 }, asian: { low: 100, avg: 175, high: 300 }, european: { low: 130, avg: 228, high: 390 } }},
          { name: 'Leather Protection & Conditioning', hasTiers: false, prices: { domestic: { low: 150, avg: 250, high: 400 }, asian: { low: 150, avg: 250, high: 400 }, european: { low: 195, avg: 325, high: 520 } }},
          { name: 'Window Tinting - Standard', hasTiers: false, prices: { domestic: { low: 150, avg: 250, high: 400 }, asian: { low: 150, avg: 250, high: 400 }, european: { low: 150, avg: 250, high: 400 } }},
          { name: 'Window Tinting - Ceramic', hasTiers: false, prices: { domestic: { low: 300, avg: 500, high: 800 }, asian: { low: 300, avg: 500, high: 800 }, european: { low: 300, avg: 500, high: 800 } }}
        ]
      },
      engine_performance: {
        name: 'Engine & Performance', icon: '⚙️',
        services: [
          { name: 'Walnut Shell Blasting / Carbon Cleaning', hasTiers: false, prices: { domestic: { low: 400, avg: 600, high: 900 }, asian: { low: 450, avg: 700, high: 1000 }, european: { low: 600, avg: 900, high: 1400 } }},
          { name: 'Intake Manifold Cleaning', hasTiers: false, prices: { domestic: { low: 200, avg: 350, high: 550 }, asian: { low: 220, avg: 385, high: 605 }, european: { low: 300, avg: 525, high: 825 } }},
          { name: 'Fuel System Cleaning', hasTiers: false, prices: { domestic: { low: 100, avg: 175, high: 280 }, asian: { low: 110, avg: 190, high: 310 }, european: { low: 150, avg: 260, high: 420 } }},
          { name: 'Throttle Body Service', hasTiers: false, prices: { domestic: { low: 80, avg: 150, high: 250 }, asian: { low: 90, avg: 165, high: 275 }, european: { low: 120, avg: 225, high: 375 } }},
          { name: 'Performance ECU Tune', hasTiers: true, tiers: {
            stage1: { domestic: { low: 300, avg: 500, high: 800 }, asian: { low: 330, avg: 550, high: 880 }, european: { low: 450, avg: 750, high: 1200 } },
            stage2: { domestic: { low: 600, avg: 1000, high: 1800 }, asian: { low: 660, avg: 1100, high: 1980 }, european: { low: 900, avg: 1500, high: 2700 } }
          }},
          { name: 'Cold Air Intake Installation', hasTiers: false, prices: { domestic: { low: 150, avg: 300, high: 550 }, asian: { low: 165, avg: 330, high: 605 }, european: { low: 225, avg: 450, high: 825 } }},
          { name: 'Exhaust System Upgrade', hasTiers: true, tiers: {
            catback: { domestic: { low: 500, avg: 900, high: 1500 }, asian: { low: 550, avg: 990, high: 1650 }, european: { low: 750, avg: 1350, high: 2250 } },
            headers: { domestic: { low: 800, avg: 1400, high: 2500 }, asian: { low: 880, avg: 1540, high: 2750 }, european: { low: 1200, avg: 2100, high: 3750 } }
          }}
        ]
      }
    };

    const serviceEducation = {
      'Oil Change': {
        whyMatters: 'Fresh oil protects your engine from wear and prevents costly damage. Skipping oil changes is the #1 cause of preventable engine failures.',
        tip: 'Synthetic oil lasts longer and provides better protection, especially for European vehicles.'
      },
      'Brake Pads - Front': {
        whyMatters: 'Front brakes handle 60-70% of stopping power. Worn pads increase stopping distance and can damage expensive rotors.',
        tip: 'Listen for squealing - that\'s the built-in wear indicator telling you it\'s time.'
      },
      'Brake Pads - Rear': {
        whyMatters: 'Rear brakes stabilize your vehicle during stops. Ignoring them causes uneven braking and can lead to dangerous handling.',
        tip: 'Rear pads typically last longer than fronts but should be inspected together.'
      },
      'Brake Rotors + Pads - Front': {
        whyMatters: 'Warped or worn rotors cause vibration and reduce braking effectiveness. Replacing them with pads ensures optimal stopping power.',
        tip: 'If you feel pulsing when braking, your rotors may be warped from heat.'
      },
      'Brake Fluid Flush': {
        whyMatters: 'Brake fluid absorbs moisture over time, lowering its boiling point. Old fluid can cause brake fade during hard braking.',
        tip: 'Dark or cloudy brake fluid is a sign it needs changing - check your reservoir.'
      },
      'Tire Rotation': {
        whyMatters: 'Even tire wear extends tire life by 20-30% and maintains consistent handling and traction.',
        tip: 'Most vehicles should have tires rotated every 5,000-7,500 miles.'
      },
      'Tire Balance': {
        whyMatters: 'Unbalanced tires cause vibration, uneven wear, and stress on suspension components.',
        tip: 'If you feel vibration at highway speeds, your tires likely need balancing.'
      },
      'Wheel Alignment': {
        whyMatters: 'Proper alignment prevents uneven tire wear, improves fuel economy, and ensures your car drives straight.',
        tip: 'Hit a pothole hard? Check your alignment - misalignment can cost you in tire wear.'
      },
      'Transmission Fluid Change': {
        whyMatters: 'Fresh transmission fluid prevents costly transmission failure ($3,000-$8,000 to replace). It keeps gears shifting smoothly.',
        tip: 'Burnt smell or dark fluid means it\'s overdue for a change.'
      },
      'Coolant Flush': {
        whyMatters: 'Old coolant becomes acidic and corrodes your radiator, water pump, and engine. Overheating from coolant failure destroys engines.',
        tip: 'Check coolant color - it should be bright, not rusty or murky.'
      },
      'Power Steering Flush': {
        whyMatters: 'Contaminated power steering fluid causes pump wear and can lead to expensive repairs or complete system failure.',
        tip: 'Whining when turning? It could be low or dirty power steering fluid.'
      },
      'Battery Replacement': {
        whyMatters: 'A failing battery leaves you stranded. Modern vehicles with many electronics need reliable battery power.',
        tip: 'Most batteries last 3-5 years. Get tested annually after year 3.'
      },
      'Engine Air Filter': {
        whyMatters: 'A clogged filter restricts airflow, reducing power and fuel economy by up to 10%.',
        tip: 'Easy DIY check - if you can\'t see light through it, it\'s time to replace.'
      },
      'Cabin Air Filter': {
        whyMatters: 'Keeps pollen, dust, and pollutants out of your cabin. Essential for allergies and respiratory health.',
        tip: 'A musty smell from vents usually means the cabin filter needs replacing.'
      },
      'Spark Plugs': {
        whyMatters: 'Worn spark plugs cause misfires, poor fuel economy, and can damage your catalytic converter ($1,000+ part).',
        tip: 'Modern iridium plugs last 60,000-100,000 miles but should still be inspected.'
      },
      'Timing Belt': {
        whyMatters: 'CRITICAL: In "interference" engines, a broken timing belt causes pistons to hit valves, destroying your engine. $5,000-$10,000+ repair.',
        tip: 'No warning signs - replace at manufacturer intervals. Don\'t gamble with this one.'
      },
      'Timing Belt + Water Pump': {
        whyMatters: 'The water pump is often driven by the timing belt. Replacing both together saves labor costs since you\'re already in there.',
        tip: 'Most mechanics recommend bundling these - the labor savings are significant.'
      },
      'Alternator Replacement': {
        whyMatters: 'The alternator charges your battery and powers electronics. Failure leaves you stranded with a dead battery.',
        tip: 'Dim lights or battery warning light often signal alternator problems.'
      },
      'Starter Replacement': {
        whyMatters: 'A failing starter means your car won\'t start. It\'s the motor that cranks your engine.',
        tip: 'Clicking sounds when turning the key often indicate starter failure.'
      },
      'AC Recharge': {
        whyMatters: 'Restores cooling performance. AC systems slowly lose refrigerant over time.',
        tip: 'If AC blows warm, you likely need a recharge - but check for leaks first.'
      },
      'AC Compressor Replacement': {
        whyMatters: 'The compressor is the heart of your AC system. Failure means no cold air.',
        tip: 'Unusual noises when AC is on could signal compressor problems.'
      },
      'Check Engine Light Diagnosis': {
        whyMatters: 'Identifies the exact problem causing your check engine light. Essential before any repair.',
        tip: 'Don\'t ignore the light - small problems can become expensive if left unchecked.'
      },
      'Electrical Diagnosis': {
        whyMatters: 'Tracks down electrical gremlins that cause mysterious symptoms. Modern cars are complex electrical systems.',
        tip: 'Intermittent issues are frustrating but diagnosis saves guesswork and money.'
      },
      'Pre-Purchase Inspection': {
        whyMatters: 'Reveals hidden problems before you buy a used car. Can save you thousands in unexpected repairs.',
        tip: 'Always worth the investment - it\'s insurance against buying someone else\'s problems.'
      },
      'Full Detail': {
        whyMatters: 'Restores your car\'s appearance inside and out. Protects surfaces and maintains resale value.',
        tip: 'Professional details clean areas you can\'t reach at home.'
      },
      'Ceramic Coating': {
        whyMatters: 'Creates a durable protective layer that lasts years. Easier cleaning and better paint protection than wax.',
        tip: 'Requires proper paint preparation - quality of prep determines longevity.'
      },
      'Walnut Shell Blasting / Carbon Cleaning': {
        whyMatters: 'Removes carbon deposits from intake valves in direct injection engines. Restores performance and fuel economy.',
        tip: 'European vehicles with direct injection are especially prone to carbon buildup.'
      },
      'Dent Removal (PDR)': {
        whyMatters: 'Paintless dent repair preserves your original paint. Better for resale than traditional body work.',
        tip: 'Works best on small dents without paint damage.'
      }
    };

    function toggleServiceEducation(serviceKey) {
      const content = document.getElementById('service-edu-content');
      const btn = document.getElementById('service-edu-btn');
      if (content) {
        content.classList.toggle('expanded');
        btn.innerHTML = content.classList.contains('expanded') ? '✕ Hide' : 'ℹ️ Why this matters';
      }
    }

    function getServiceEducationHtml(serviceName) {
      const edu = serviceEducation[serviceName];
      if (!edu) return '';
      
      return `
        <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border-subtle);">
          <button class="edu-toggle-btn" id="service-edu-btn" onclick="toggleServiceEducation()">ℹ️ Why this matters</button>
          <div class="edu-content" id="service-edu-content">
            <div class="edu-card">
              <div class="edu-section">
                <div class="edu-section-title">⚠️ Why this matters</div>
                <div class="edu-section-text">${edu.whyMatters}</div>
              </div>
              ${edu.tip ? `
              <div class="edu-section">
                <div class="edu-section-title">💡 Pro tip</div>
                <div class="edu-section-text">${edu.tip}</div>
              </div>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }

    const vehicleClassMappings = {
      'Chevrolet': 'domestic', 'Ford': 'domestic', 'GMC': 'domestic', 'Dodge': 'domestic', 'Ram': 'domestic',
      'Jeep': 'domestic', 'Chrysler': 'domestic', 'Buick': 'domestic', 'Cadillac': 'domestic', 'Lincoln': 'domestic',
      'Toyota': 'asian', 'Honda': 'asian', 'Nissan': 'asian', 'Mazda': 'asian', 'Subaru': 'asian',
      'Mitsubishi': 'asian', 'Hyundai': 'asian', 'Kia': 'asian', 'Genesis': 'asian', 'Lexus': 'asian',
      'Infiniti': 'asian', 'Acura': 'asian',
      'BMW': 'european', 'Mercedes-Benz': 'european', 'Audi': 'european', 'Volkswagen': 'european',
      'Porsche': 'european', 'Volvo': 'european', 'Mini': 'european', 'Jaguar': 'european',
      'Land Rover': 'european', 'Range Rover': 'european', 'Alfa Romeo': 'european', 'Fiat': 'european',
      'Ferrari': 'european', 'Lamborghini': 'european', 'Maserati': 'european', 'Bentley': 'european',
      'Rolls-Royce': 'european', 'Aston Martin': 'european', 'McLaren': 'european',
      'Tesla': 'electric', 'Rivian': 'electric', 'Lucid': 'electric', 'Polestar': 'electric'
    };

    const regionalMultipliers = { west: 1.15, northeast: 1.08, midwest: 0.95, south: 0.90, national: 1.00 };
    const regionLabels = {
      west: 'West Coast (+15%)', northeast: 'Northeast (+8%)', midwest: 'Midwest (-5%)', 
      south: 'South (-10%)', national: 'National Average'
    };
    const vehicleClassLabels = {
      domestic: 'Domestic', asian: 'Asian', european: 'European', electric: 'Electric/EV'
    };

    let estimatorState = {
      step: 1,
      category: null,
      vehicle: null,
      vehicleClass: 'domestic',
      service: null,
      tier: 'standard',
      region: 'national',
      make: null
    };

    function showEstimatorStep(step) {
      estimatorState.step = step;
      for (let i = 1; i <= 4; i++) {
        const panel = document.getElementById(`estimator-panel-${i}`);
        const stepEl = document.getElementById(`estimator-step-${i}`);
        if (panel) panel.style.display = i === step ? 'block' : 'none';
        if (stepEl) {
          if (i === step) {
            stepEl.style.background = 'var(--accent-gold-soft)';
            stepEl.style.border = '2px solid var(--accent-gold)';
            stepEl.style.opacity = '1';
            stepEl.querySelector('div:last-child').style.color = 'var(--accent-gold)';
          } else if (i < step) {
            stepEl.style.background = 'var(--accent-green-soft)';
            stepEl.style.border = '2px solid var(--accent-green)';
            stepEl.style.opacity = '1';
            stepEl.style.cursor = 'pointer';
            stepEl.querySelector('div:last-child').style.color = 'var(--accent-green)';
            stepEl.onclick = () => showEstimatorStep(i);
          } else {
            stepEl.style.background = 'var(--bg-card)';
            stepEl.style.border = '1px solid var(--border-subtle)';
            stepEl.style.opacity = '0.5';
            stepEl.style.cursor = 'default';
            stepEl.querySelector('div:last-child').style.color = 'inherit';
            stepEl.onclick = null;
          }
        }
      }
    }

    function selectEstimatorCategory(category) {
      estimatorState.category = category;
      showEstimatorStep(2);
      populateEstimatorVehicles();
      populateEstimatorMakes();
    }

    function populateEstimatorVehicles() {
      const container = document.getElementById('estimator-saved-vehicles');
      if (!vehicles || vehicles.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem;">No saved vehicles found. Enter details manually below.</p>';
        return;
      }
      container.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:12px;">
          ${vehicles.map(v => `
            <div class="saved-vehicle-option" onclick="selectEstimatorVehicle('${v.id}')" 
                 style="background:var(--bg-card);border:2px solid var(--border-subtle);border-radius:var(--radius-md);padding:16px;cursor:pointer;transition:all 0.2s ease;">
              <div style="font-size:1.5rem;margin-bottom:8px;">🚗</div>
              <div style="font-weight:600;">${v.year || ''} ${v.make} ${v.model}</div>
              <div style="font-size:0.8rem;color:var(--text-muted);">${v.nickname || ''}</div>
            </div>
          `).join('')}
        </div>
      `;
    }

    function populateEstimatorMakes() {
      const select = document.getElementById('estimator-make');
      const makes = Object.keys(vehicleClassMappings).sort();
      select.innerHTML = '<option value="">Select Make</option>' + makes.map(m => `<option value="${m}">${m}</option>`).join('');
    }

    function selectEstimatorVehicle(vehicleId) {
      const vehicle = vehicles.find(v => v.id === vehicleId);
      if (!vehicle) return;
      estimatorState.vehicle = vehicle;
      estimatorState.make = vehicle.make;
      estimatorState.vehicleClass = detectVehicleClass(vehicle.make);
      showEstimatorStep(3);
      populateEstimatorServices();
      updateEstimatorDisplay();
    }

    function useManualVehicle() {
      const make = document.getElementById('estimator-make').value;
      if (!make) {
        showToast('Please select a make', 'error');
        return;
      }
      estimatorState.vehicle = null;
      estimatorState.make = make;
      estimatorState.vehicleClass = detectVehicleClass(make);
      showEstimatorStep(3);
      populateEstimatorServices();
      updateEstimatorDisplay();
    }

    function detectVehicleClass(make) {
      return vehicleClassMappings[make] || 'domestic';
    }

    function populateEstimatorServices() {
      const select = document.getElementById('estimator-service');
      const categoryData = estimatorServiceData[estimatorState.category];
      if (!categoryData) return;
      select.innerHTML = '<option value="">Select a service...</option>' + 
        categoryData.services.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
    }

    function updateEstimatorDisplay() {
      const categoryData = estimatorServiceData[estimatorState.category];
      document.getElementById('estimator-category-display').textContent = categoryData ? categoryData.name : '';
      const vehicleDisplay = estimatorState.vehicle 
        ? `${estimatorState.vehicle.year || ''} ${estimatorState.vehicle.make} ${estimatorState.vehicle.model}`.trim()
        : estimatorState.make || 'Unknown Vehicle';
      document.getElementById('estimator-vehicle-display').textContent = vehicleDisplay;
    }

    function updateEstimatorTiers() {
      const serviceName = document.getElementById('estimator-service').value;
      const categoryData = estimatorServiceData[estimatorState.category];
      if (!categoryData) return;
      
      const service = categoryData.services.find(s => s.name === serviceName);
      const tierSection = document.getElementById('estimator-tier-section');
      const calcBtn = document.getElementById('calculate-estimate-btn');
      
      if (service && service.hasTiers) {
        tierSection.style.display = 'block';
        const availableTiers = Object.keys(service.tiers);
        document.querySelectorAll('.tier-option').forEach(opt => {
          const tier = opt.dataset.tier;
          if (availableTiers.includes(tier)) {
            opt.style.display = 'block';
          } else {
            opt.style.display = 'none';
          }
        });
        if (!availableTiers.includes(estimatorState.tier)) {
          selectEstimatorTier(availableTiers[0] || 'standard');
        }
      } else {
        tierSection.style.display = 'none';
      }
      
      estimatorState.service = serviceName;
      calcBtn.disabled = !serviceName;
    }

    function selectEstimatorTier(tier) {
      estimatorState.tier = tier;
      document.querySelectorAll('.tier-option').forEach(opt => {
        if (opt.dataset.tier === tier) {
          opt.style.background = 'var(--accent-gold-soft)';
          opt.style.borderColor = 'var(--accent-gold)';
          opt.classList.add('selected');
          opt.querySelector('div:first-child').style.color = 'var(--accent-gold)';
        } else {
          opt.style.background = 'var(--bg-card)';
          opt.style.borderColor = 'var(--border-subtle)';
          opt.classList.remove('selected');
          opt.querySelector('div:first-child').style.color = 'inherit';
        }
      });
    }

    function updateEstimatorModels() {
      const make = document.getElementById('estimator-make').value;
      if (make) {
        const vehicleClass = detectVehicleClass(make);
        const classLabel = vehicleClassLabels[vehicleClass] || vehicleClass;
        showToast(`${make} is classified as ${classLabel}`, 'info');
      }
    }

    function calculateEstimate() {
      const categoryData = estimatorServiceData[estimatorState.category];
      if (!categoryData) return;
      
      const service = categoryData.services.find(s => s.name === estimatorState.service);
      if (!service) return;
      
      estimatorState.region = document.getElementById('estimator-region').value;
      const regionMult = regionalMultipliers[estimatorState.region] || 1.0;
      
      let vClass = estimatorState.vehicleClass;
      if (estimatorState.category === 'ev_hybrid' && vClass !== 'electric') {
        vClass = 'electric';
      }
      if (vClass === 'electric' && estimatorState.category !== 'ev_hybrid') {
        vClass = 'asian';
      }
      
      let prices;
      if (service.hasTiers) {
        const tierData = service.tiers[estimatorState.tier];
        prices = tierData[vClass] || tierData['domestic'] || { low: 100, avg: 150, high: 200 };
      } else {
        prices = service.prices[vClass] || service.prices['domestic'] || { low: 100, avg: 150, high: 200 };
      }
      
      const priceLow = Math.round(prices.low * regionMult);
      const priceAvg = Math.round(prices.avg * regionMult);
      const priceHigh = Math.round(prices.high * regionMult);
      
      renderEstimateResults({
        service: estimatorState.service,
        vehicleClass: estimatorState.vehicleClass,
        region: estimatorState.region,
        tier: service.hasTiers ? estimatorState.tier : null,
        priceLow, priceAvg, priceHigh,
        regionMultiplier: regionMult
      });
      
      showEstimatorStep(4);
    }

    function renderEstimateResults(estimate) {
      document.getElementById('estimate-service-title').textContent = estimate.service;
      
      const classLabel = vehicleClassLabels[estimate.vehicleClass] || estimate.vehicleClass;
      document.getElementById('estimate-vehicle-badge').textContent = classLabel;
      document.getElementById('estimate-region-badge').textContent = regionLabels[estimate.region] || 'National Average';
      
      const tierBadge = document.getElementById('estimate-tier-badge');
      if (estimate.tier) {
        tierBadge.textContent = estimate.tier.charAt(0).toUpperCase() + estimate.tier.slice(1);
        tierBadge.style.display = 'inline';
      } else {
        tierBadge.style.display = 'none';
      }
      
      document.getElementById('estimate-price-low').textContent = `$${estimate.priceLow.toLocaleString()}`;
      document.getElementById('estimate-price-avg').textContent = `$${estimate.priceAvg.toLocaleString()}`;
      document.getElementById('estimate-price-high').textContent = `$${estimate.priceHigh.toLocaleString()}`;
      document.getElementById('estimate-range-display').textContent = `$${estimate.priceLow.toLocaleString()} - $${estimate.priceHigh.toLocaleString()}`;
      
      const range = estimate.priceHigh - estimate.priceLow;
      const avgPosition = range > 0 ? ((estimate.priceAvg - estimate.priceLow) / range) * 100 : 50;
      document.getElementById('estimate-avg-marker').style.left = `calc(${avgPosition}% - 2px)`;
      
      const factors = [];
      if (estimate.vehicleClass === 'european') {
        factors.push('<li>🚗 <strong>European vehicles</strong> typically cost 40-50% more due to specialized parts and labor</li>');
      } else if (estimate.vehicleClass === 'asian') {
        factors.push('<li>🚗 <strong>Asian vehicles</strong> have competitive pricing with widely available parts</li>');
      } else if (estimate.vehicleClass === 'electric') {
        factors.push('<li>⚡ <strong>Electric vehicles</strong> require specialized technicians and equipment</li>');
      } else {
        factors.push('<li>🚗 <strong>Domestic vehicles</strong> have the most competitive pricing with readily available parts</li>');
      }
      
      if (estimate.region === 'west') {
        factors.push('<li>📍 <strong>West Coast</strong> labor rates are 15% above national average</li>');
      } else if (estimate.region === 'northeast') {
        factors.push('<li>📍 <strong>Northeast</strong> labor rates are 8% above national average</li>');
      } else if (estimate.region === 'midwest') {
        factors.push('<li>📍 <strong>Midwest</strong> labor rates are 5% below national average</li>');
      } else if (estimate.region === 'south') {
        factors.push('<li>📍 <strong>South</strong> labor rates are 10% below national average</li>');
      }
      
      if (estimate.tier) {
        if (estimate.tier === 'basic') {
          factors.push('<li>🔧 <strong>Basic tier</strong> uses standard/aftermarket parts</li>');
        } else if (estimate.tier === 'premium') {
          factors.push('<li>🔧 <strong>Premium tier</strong> uses OEM/synthetic parts for longer life</li>');
        }
      }
      
      factors.push('<li>💡 Prices reflect industry benchmarks and may vary by provider</li>');
      
      document.getElementById('estimate-factors').innerHTML = factors.join('');
      
      const eduContainer = document.getElementById('estimate-education-container');
      if (eduContainer) {
        eduContainer.innerHTML = getServiceEducationHtml(estimate.service);
      }
    }

    function postServiceFromEstimate() {
      closeModal('cost-estimator');
      showSection('packages');
      
      setTimeout(() => {
        openPackageModal();
        
        setTimeout(() => {
          const categorySelect = document.getElementById('p-category');
          if (categorySelect && estimatorState.category) {
            const categoryMap = {
              'maintenance': 'maintenance',
              'repair': 'mechanical',
              'detailing': 'cosmetic',
              'body': 'accident_repair',
              'inspection': 'maintenance',
              'diagnostic': 'maintenance',
              'ev_hybrid': 'ev_hybrid',
              'protection': 'premium_protection',
              'engine_performance': 'performance'
            };
            categorySelect.value = categoryMap[estimatorState.category] || 'maintenance';
            categorySelect.dispatchEvent(new Event('change'));
          }
          
          if (estimatorState.vehicle) {
            const vehicleSelect = document.getElementById('p-vehicle');
            if (vehicleSelect) {
              vehicleSelect.value = estimatorState.vehicle.id;
            }
          }
          
          const titleInput = document.getElementById('p-title');
          if (titleInput && estimatorState.service) {
            titleInput.value = estimatorState.service;
          }
          
          const descInput = document.getElementById('p-description');
          if (descInput) {
            const estimate = document.getElementById('estimate-range-display').textContent;
            descInput.value = `Looking for ${estimatorState.service}.\n\nCost Estimator suggests: ${estimate}`;
          }
          
          showToast('Estimate loaded into service request form', 'success');
        }, 200);
      }, 100);
    }

    function initCostEstimator() {
      estimatorState = { step: 1, category: null, vehicle: null, vehicleClass: 'domestic', service: null, tier: 'standard', region: 'national', make: null };
      showEstimatorStep(1);
      populateEstimatorMakes();
    }

