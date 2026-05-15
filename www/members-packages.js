// Package management, bids, upsells, destination services, reviews

    let aiSuggestionDebounceTimer = null;
    let aiAssistantExpanded = true;
    let lastAiRequestHash = '';
    let aiSuggestionAbortController = null;

    function initAiPackageAssistant() {
      const descField = document.getElementById('p-description');
      const titleField = document.getElementById('p-title');
      if (descField) {
        descField.addEventListener('input', () => debounceAiSuggestions());
      }
      if (titleField) {
        titleField.addEventListener('input', () => debounceAiSuggestions());
      }
    }

    function debounceAiSuggestions() {
      clearTimeout(aiSuggestionDebounceTimer);
      aiSuggestionDebounceTimer = setTimeout(() => {
        fetchAiSuggestions();
      }, 1200);
    }

    function getAiRequestHash() {
      const desc = (document.getElementById('p-description')?.value || '').trim();
      const title = (document.getElementById('p-title')?.value || '').trim();
      const category = document.getElementById('p-category')?.value || '';
      return `${desc}|${title}|${category}`;
    }

    async function fetchAiSuggestions() {
      const desc = (document.getElementById('p-description')?.value || '').trim();
      const title = (document.getElementById('p-title')?.value || '').trim();

      if (desc.length < 5 && title.length < 3) {
        document.getElementById('ai-assistant-panel').style.display = 'none';
        if (aiSuggestionAbortController) {
          aiSuggestionAbortController.abort();
          aiSuggestionAbortController = null;
        }
        lastAiRequestHash = '';
        return;
      }

      const hash = getAiRequestHash();
      if (hash === lastAiRequestHash) return;
      lastAiRequestHash = hash;

      if (aiSuggestionAbortController) {
        aiSuggestionAbortController.abort();
      }
      aiSuggestionAbortController = new AbortController();

      const panel = document.getElementById('ai-assistant-panel');
      const loading = document.getElementById('ai-assistant-loading');
      const content = document.getElementById('ai-suggestions-content');

      panel.style.display = 'block';
      if (aiAssistantExpanded) {
        panel.classList.remove('collapsed');
      }
      loading.style.display = 'block';
      content.innerHTML = '';

      const vehicleId = document.getElementById('p-vehicle')?.value;
      let vehicleInfo = null;
      if (vehicleId && typeof vehicles !== 'undefined') {
        const v = vehicles.find(vh => vh.id === vehicleId);
        if (v) {
          vehicleInfo = { year: v.year, make: v.make, model: v.model, trim: v.trim, mileage: v.mileage };
        }
      }

      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          loading.style.display = 'none';
          panel.style.display = 'none';
          return;
        }

        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/package/ai-suggestions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            description: desc,
            title: title,
            category: document.getElementById('p-category')?.value || '',
            serviceType: document.getElementById('p-service-type')?.value || '',
            vehicleInfo: vehicleInfo
          }),
          signal: aiSuggestionAbortController.signal
        });

        if (!response.ok) {
          throw new Error('Failed to get suggestions');
        }

        const data = await response.json();
        loading.style.display = 'none';
        renderAiSuggestions(data.suggestions);
      } catch (err) {
        if (err.name === 'AbortError') return;
        loading.style.display = 'none';
        content.innerHTML = '<div style="padding:8px 0;font-size:0.82rem;color:var(--text-muted);display:flex;align-items:center;gap:6px;"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg> Could not load suggestions. You can continue without them.</div>';
        console.log('AI suggestions error:', err);
      }
    }

    const checkSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
    const xSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

    function createAiSuggestionItem(id, label, text, chips) {
      const item = document.createElement('div');
      item.className = 'ai-suggestion-item';
      item.id = id;

      const labelEl = document.createElement('div');
      labelEl.className = 'ai-suggestion-label';
      labelEl.textContent = label;
      item.appendChild(labelEl);

      const textEl = document.createElement('div');
      textEl.className = 'ai-suggestion-text';
      textEl.textContent = text;
      item.appendChild(textEl);

      const chipRow = document.createElement('div');
      chipRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
      chips.forEach(chip => {
        const span = document.createElement('span');
        span.className = `ai-chip ${chip.className}`;
        span.innerHTML = chip.icon;
        span.appendChild(document.createTextNode(' ' + chip.label));
        span.addEventListener('click', chip.handler);
        chipRow.appendChild(span);
      });
      item.appendChild(chipRow);

      return item;
    }

    function showAcceptedFeedback(el, message) {
      el.innerHTML = '';
      const div = document.createElement('div');
      div.style.cssText = 'padding:4px 0;font-size:0.82rem;color:var(--accent-green);display:flex;align-items:center;gap:6px;';
      div.innerHTML = checkSvg;
      div.appendChild(document.createTextNode(' ' + message));
      el.appendChild(div);
      setTimeout(() => el.remove(), 2000);
    }

    function renderAiSuggestions(suggestions) {
      const content = document.getElementById('ai-suggestions-content');
      const badge = document.getElementById('ai-suggestion-count');
      if (!suggestions) {
        content.innerHTML = '';
        badge.style.display = 'none';
        return;
      }

      content.innerHTML = '';
      let count = 0;

      if (suggestions.suggestedCategory && suggestions.suggestedCategory !== document.getElementById('p-category')?.value) {
        count++;
        const catKey = String(suggestions.suggestedCategory);
        const catLabel = String(suggestions.suggestedCategoryLabel || catKey);
        content.appendChild(createAiSuggestionItem('ai-cat-suggestion', 'Category Suggestion',
          suggestions.categoryReason || ('This looks like it belongs in ' + catLabel),
          [
            { className: 'ai-chip-accept', icon: checkSvg, label: 'Use ' + catLabel, handler: () => {
              const sel = document.getElementById('p-category');
              if (sel) { sel.value = catKey; sel.dispatchEvent(new Event('change')); }
              const el = document.getElementById('ai-cat-suggestion');
              if (el) showAcceptedFeedback(el, 'Category updated!');
              updateAiBadgeCount();
            }},
            { className: 'ai-chip-dismiss', icon: xSvg, label: 'Ignore', handler: () => dismissAiSuggestion('ai-cat-suggestion') }
          ]
        ));
      }

      if (suggestions.improvedTitle) {
        count++;
        const titleVal = String(suggestions.improvedTitle);
        content.appendChild(createAiSuggestionItem('ai-title-suggestion', 'Better Title',
          '"' + titleVal + '"',
          [
            { className: 'ai-chip-accept', icon: checkSvg, label: 'Use this title', handler: () => {
              const f = document.getElementById('p-title');
              if (f) f.value = titleVal;
              const el = document.getElementById('ai-title-suggestion');
              if (el) showAcceptedFeedback(el, 'Title updated!');
              updateAiBadgeCount();
            }},
            { className: 'ai-chip-dismiss', icon: xSvg, label: 'Ignore', handler: () => dismissAiSuggestion('ai-title-suggestion') }
          ]
        ));
      }

      if (suggestions.missingFields && suggestions.missingFields.length > 0) {
        suggestions.missingFields.forEach((mf, idx) => {
          count++;
          const elId = 'ai-missing-' + idx;
          const promptText = String(mf.prompt || '');
          const suggVal = mf.suggestedValue ? String(mf.suggestedValue) : null;
          const displayText = suggVal ? promptText + ' Suggested: "' + suggVal + '"' : promptText;
          const chips = [];
          if (suggVal) {
            chips.push({ className: 'ai-chip-accept', icon: checkSvg, label: 'Add this detail', handler: () => {
              const descField = document.getElementById('p-description');
              if (descField) {
                const current = descField.value.trim();
                descField.value = current ? current + '\n' + suggVal : suggVal;
              }
              const el = document.getElementById(elId);
              if (el) showAcceptedFeedback(el, 'Detail added!');
              updateAiBadgeCount();
            }});
          }
          chips.push({ className: 'ai-chip-dismiss', icon: xSvg, label: suggVal ? 'Ignore' : 'Got it', handler: () => dismissAiSuggestion(elId) });
          content.appendChild(createAiSuggestionItem(elId, 'Missing Detail', displayText, chips));
        });
      }

      if (suggestions.clarifyingQuestion) {
        count++;
        content.appendChild(createAiSuggestionItem('ai-clarify', 'Clarifying Question',
          String(suggestions.clarifyingQuestion),
          [{ className: 'ai-chip-dismiss', icon: xSvg, label: 'Dismiss', handler: () => dismissAiSuggestion('ai-clarify') }]
        ));
      }

      if (count === 0) {
        const okDiv = document.createElement('div');
        okDiv.style.cssText = 'padding:8px 0;font-size:0.82rem;color:var(--accent-green);display:flex;align-items:center;gap:6px;';
        okDiv.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
        okDiv.appendChild(document.createTextNode(' Your request looks great! No suggestions needed.'));
        content.appendChild(okDiv);
        badge.style.display = 'none';
      } else {
        badge.textContent = count;
        badge.style.display = 'inline';
      }
    }

    function toggleAiAssistantPanel() {
      const panel = document.getElementById('ai-assistant-panel');
      aiAssistantExpanded = !aiAssistantExpanded;
      if (aiAssistantExpanded) {
        panel.classList.remove('collapsed');
      } else {
        panel.classList.add('collapsed');
      }
    }

    function dismissAiSuggestion(elementId) {
      const el = document.getElementById(elementId);
      if (el) {
        el.style.opacity = '0';
        el.style.transform = 'translateX(10px)';
        el.style.transition = 'all 0.2s ease';
        setTimeout(() => el.remove(), 200);
      }
      setTimeout(() => updateAiBadgeCount(), 250);
    }

    function updateAiBadgeCount() {
      const content = document.getElementById('ai-suggestions-content');
      const badge = document.getElementById('ai-suggestion-count');
      if (!content || !badge) return;
      const remaining = content.querySelectorAll('.ai-suggestion-item').length;
      if (remaining > 0) {
        badge.textContent = remaining;
        badge.style.display = 'inline';
      } else {
        badge.style.display = 'none';
      }
    }

    function resetAiAssistant() {
      clearTimeout(aiSuggestionDebounceTimer);
      if (aiSuggestionAbortController) {
        aiSuggestionAbortController.abort();
        aiSuggestionAbortController = null;
      }
      lastAiRequestHash = '';
      aiAssistantExpanded = true;
      const panel = document.getElementById('ai-assistant-panel');
      if (panel) {
        panel.style.display = 'none';
        panel.classList.remove('collapsed');
      }
      const content = document.getElementById('ai-suggestions-content');
      if (content) content.innerHTML = '';
      const loading = document.getElementById('ai-assistant-loading');
      if (loading) loading.style.display = 'none';
      const badge = document.getElementById('ai-suggestion-count');
      if (badge) badge.style.display = 'none';
    }

    window.toggleAiAssistantPanel = toggleAiAssistantPanel;
    window.dismissAiSuggestion = dismissAiSuggestion;

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
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${mccIcon('check-circle', 40)}</div><p>No ${currentUpsellFilter === 'all' ? '' : currentUpsellFilter} updates.</p></div>`;
        return;
      }

      const updateTypeIcons = {
        cost_increase: mccIcon('dollar-sign', 16),
        car_ready: mccIcon('check-circle', 16),
        work_paused: mccIcon('clock', 16),
        question: mccIcon('circle-help', 16),
        request_call: mccIcon('phone', 16)
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
        const typeIcon = updateTypeIcons[updateType] || mccIcon('clipboard-list', 16);
        const typeLabel = updateTypeLabels[updateType] || 'Update';
        const typeBadgeColor = updateTypeBadgeColors[updateType] || 'var(--accent-gold)';
        const isUrgent = u.is_urgent;
        const showCost = updateType === 'cost_increase' || (updateType === 'work_paused' && u.estimated_cost > 0);
        
        let actionButtons = '';
        if (u.status === 'pending') {
          if (updateType === 'cost_increase') {
            actionButtons = `
              <button class="btn btn-success" onclick="approveUpsell('${u.id}')">${mccIcon('check', 16)} Approve ($${(u.estimated_cost || 0).toFixed(2)})</button>
              <button class="btn btn-secondary" onclick="declineUpsell('${u.id}')">${mccIcon('x', 16)} Decline</button>
              <button class="btn btn-ghost" onclick="rebidUpsell('${u.id}', '${u.title.replaceAll('\'', "\\'")}', ${u.estimated_cost || 0})">${mccIcon('refresh-cw', 16)} Get Competing Bids</button>
              <button class="btn btn-ghost" onclick="requestCallBack('${u.id}')">${mccIcon('phone', 16)} Call Me</button>
            `;
          } else if (updateType === 'car_ready') {
            actionButtons = `
              <button class="btn btn-success" onclick="acknowledgeUpdate('${u.id}')">${mccIcon('check', 16)} Got It - I'll Pick Up</button>
              <button class="btn btn-ghost" onclick="requestCallBack('${u.id}')">${mccIcon('phone', 16)} Call Me</button>
            `;
          } else if (updateType === 'work_paused') {
            actionButtons = `
              ${u.estimated_cost > 0 ? `<button class="btn btn-success" onclick="approveUpsell('${u.id}')">${mccIcon('check', 16)} Approve & Continue ($${(u.estimated_cost || 0).toFixed(2)})</button>` : ''}
              <button class="btn btn-primary" onclick="acknowledgeUpdate('${u.id}')">${mccIcon('check', 16)} Proceed</button>
              <button class="btn btn-secondary" onclick="declineUpsell('${u.id}')">${mccIcon('x', 16)} Stop Work</button>
              <button class="btn btn-ghost" onclick="requestCallBack('${u.id}')">${mccIcon('phone', 16)} Call Me Now</button>
            `;
          } else if (updateType === 'question') {
            actionButtons = `
              <button class="btn btn-primary" onclick="openReplyModal('${u.id}', '${u.title.replaceAll('\'', "\\'")}')">${mccIcon('message-square', 16)} Reply</button>
              <button class="btn btn-ghost" onclick="requestCallBack('${u.id}')">${mccIcon('phone', 16)} Call Me</button>
            `;
          } else if (updateType === 'request_call') {
            actionButtons = `
              <button class="btn btn-primary" onclick="requestCallBack('${u.id}')">${mccIcon('phone', 16)} I'll Call Now</button>
              <button class="btn btn-ghost" onclick="acknowledgeUpdate('${u.id}')">${mccIcon('check', 16)} Got It</button>
            `;
          } else {
            actionButtons = `
              <button class="btn btn-success" onclick="acknowledgeUpdate('${u.id}')">${mccIcon('check', 16)} Acknowledge</button>
            `;
          }
        }
        
        return `
          <div class="card" style="margin-bottom:16px;${isUrgent && u.status === 'pending' ? 'border:2px solid var(--accent-red);animation:pulse 2s infinite;' : ''}">
            ${isUrgent && u.status === 'pending' ? `<div style="background:var(--accent-red);color:white;padding:8px 16px;margin:-20px -20px 16px -20px;border-radius:var(--radius-lg) var(--radius-lg) 0 0;font-weight:600;text-align:center;">${mccIcon('circle-alert', 16)} URGENT - Response Needed</div>` : ''}
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
                  <div style="display:inline-flex;align-items:center;gap:4px;background:linear-gradient(135deg,rgba(16,185,129,0.15),rgba(16,185,129,0.05));border:1px solid rgba(16,185,129,0.3);color:#10b981;padding:2px 6px;border-radius:100px;font-size:0.65rem;font-weight:600;margin-top:4px;cursor:help;" title="This price includes all parts, labor, taxes, shop fees, and disposal fees. No hidden costs.">${mccIcon('check', 16)} All-Inclusive</div>
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
              ${timeLeft ? `<div style="background:${updateType === 'cost_increase' ? 'var(--accent-orange-soft)' : 'var(--bg-input)'};border:1px solid ${updateType === 'cost_increase' ? 'rgba(245,158,11,0.3)' : 'var(--border-subtle)'};padding:10px 14px;border-radius:var(--radius-md);margin-bottom:16px;"><span style="color:var(--accent-orange);font-weight:600;">${mccIcon('clock', 16)} ${timeLeft} to respond</span>${updateType === 'cost_increase' ? '<span style="color:var(--text-secondary);font-size:0.85rem;"> — Provider may suspend work if no response</span>' : ''}</div>` : ''}
              <div style="display:flex;gap:12px;flex-wrap:wrap;">
                ${actionButtons}
              </div>
            ` : `
              <div style="padding:12px;background:${u.status === 'approved' || u.member_action === 'acknowledged' ? 'var(--accent-green-soft)' : 'var(--bg-input)'};border-radius:var(--radius-md);color:${u.status === 'approved' || u.member_action === 'acknowledged' ? 'var(--accent-green)' : 'var(--text-muted)'};">
                ${u.status === 'approved' ? mccIcon('check', 16) + ' Approved' : u.status === 'declined' ? mccIcon('x', 16) + ' Declined' : u.member_action === 'acknowledged' ? mccIcon('check', 16) + ' Acknowledged' : u.member_action === 'call_me' ? mccIcon('phone', 16) + ' Call Requested' : u.status === 'rebid' ? mccIcon('refresh-cw', 16) + ' Sent for competing bids' : u.status === 'expired' ? mccIcon('clock', 16) + ' Expired' : u.status}
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
          
          await supabaseClient.rpc('member_approve_additional_work', {
            p_payment_id: payment.id,
            p_new_total: newTotal,
            p_new_provider: newTotal,
            p_new_mcc_fee: 0
          });
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
    const _providerNotifyCounts = {};

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
          return `<span class="payment-status-badge awaiting" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:100px;font-size:0.72rem;font-weight:600;background:var(--accent-orange-soft);color:var(--accent-orange);border:1px solid rgba(251,146,60,0.3);">${mccIcon('credit-card', 16)} Awaiting Payment</span>`;
        }
        return '';
      }
      
      if (payment.escrow_captured === true || payment.status === 'released' || payment.status === 'completed') {
        return `<span class="payment-status-badge complete" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:100px;font-size:0.72rem;font-weight:600;background:var(--accent-green-soft);color:var(--accent-green);border:1px solid rgba(52,211,153,0.3);">${mccIcon('check', 16)} Payment Complete</span>`;
      }
      
      if (payment.escrow_payment_intent_id && payment.escrow_captured === false) {
        return `<span class="payment-status-badge held" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:100px;font-size:0.72rem;font-weight:600;background:var(--accent-blue-soft);color:var(--accent-blue);border:1px solid rgba(56,189,248,0.3);">${mccIcon('lock', 16)} Payment Held</span>`;
      }
      
      if (payment.status === 'held' || payment.status === 'authorized') {
        return `<span class="payment-status-badge authorized" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:100px;font-size:0.72rem;font-weight:600;background:var(--accent-teal-soft);color:var(--accent-teal);border:1px solid rgba(34,211,238,0.3);">${mccIcon('lock', 16)} Payment Authorized</span>`;
      }
      
      return `<span class="payment-status-badge awaiting" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:100px;font-size:0.72rem;font-weight:600;background:var(--accent-orange-soft);color:var(--accent-orange);border:1px solid rgba(251,146,60,0.3);">${mccIcon('credit-card', 16)} Awaiting Payment</span>`;
    }

    function renderPackages() {
      const list = document.getElementById('packages-list');
      let filtered = packages;
      
      if (currentPackageFilter === 'open') filtered = packages.filter(p => p.status === 'open');
      else if (currentPackageFilter === 'active') filtered = packages.filter(p => ['pending', 'accepted', 'in_progress'].includes(p.status));
      else if (currentPackageFilter === 'completed') filtered = packages.filter(p => p.status === 'completed');

      if (!filtered.length) {
        list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">' + mccIcon('package', 40) + '</div><p>No packages in this category.</p></div>';
        return;
      }

      list.innerHTML = filtered.map(p => {
        const vehicle = p.vehicles;
        const vehicleName = vehicle ? (vehicle.nickname || `${vehicle.year || ''} ${vehicle.make} ${vehicle.model}`.trim()) : 'Unknown Vehicle';
        
        // Check if bidding has expired (but package still shows as 'open')
        const isExpired = (p.status === 'open' && p.bidding_deadline && new Date(p.bidding_deadline) < new Date()) || p.status === 'bidding_closed';
        const displayStatus = isExpired ? 'expired' : p.status;
        const statusClass = displayStatus === 'open' ? 'open' : displayStatus === 'completed' ? 'completed' : displayStatus === 'expired' ? 'expired' : ['pending', 'accepted'].includes(displayStatus) ? 'pending' : 'accepted';
        
        // Payment status badge for active/completed packages
        const paymentBadge = getPaymentStatusBadge(p);
        
        // Countdown timer for open packages
        let countdownHtml = '';
        if (p.status === 'open' && p.bidding_deadline) {
          const countdown = formatCountdown(p.bidding_deadline);
          const urgentClass = countdown.expired ? 'expired' : countdown.urgent ? 'urgent' : '';
          countdownHtml = `<span class="countdown-timer ${urgentClass}">${mccIcon('clock', 16)} ${countdown.text}</span>`;
        }
        
        // Exclusive first look indicator
        let exclusiveHtml = '';
        if (p.status === 'open' && p.exclusive_until && new Date(p.exclusive_until) > new Date()) {
          const hoursRemaining = Math.ceil((new Date(p.exclusive_until) - new Date()) / (1000 * 60 * 60));
          exclusiveHtml = `<div class="exclusive-first-look-badge" style="margin-top:6px;padding:6px 10px;background:var(--accent-gold-soft);border:1px solid var(--accent-gold);border-radius:var(--radius-sm);font-size:0.8rem;color:var(--accent-gold);">${mccIcon('star', 16)} Your preferred provider has ${hoursRemaining}h first look</div>`;
        }
        
        // Repost button for expired packages
        const repostButton = isExpired ? `<button class="btn btn-primary btn-sm" onclick="repostPackage('${p.id}')">${mccIcon('refresh-cw', 16)} Repost</button>` : '';
        
        // Extend deadline button for open (non-expired) packages
        const extendButton = (p.status === 'open' && !isExpired) ? `<button class="btn btn-ghost btn-sm" onclick="extendDeadline('${p.id}')" title="Add more time">${mccIcon('clock', 16)}+</button>` : '';
        
        // Confirm job complete button for completed work with unreleased payment
        let confirmCompleteButton = '';
        const payment = packagePaymentStatuses[p.id];
        if ((p.status === 'in_progress' || p.status === 'completed') && payment && 
            (payment.status === 'held' || payment.status === 'authorized') && 
            !payment.escrow_captured) {
          confirmCompleteButton = `<button class="btn btn-success btn-sm" onclick="openReleasePaymentModal('${p.id}')">${mccIcon('check', 16)} Confirm Complete</button>`;
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
              <span>${mccIcon('calendar', 16)} ${new Date(p.created_at).toLocaleDateString()}</span>
              <span>${mccIcon('refresh-cw', 16)} ${formatFrequency(p.frequency)}</span>
              <span>${mccIcon('wrench', 16)} ${p.parts_preference || 'Standard'} parts</span>
              <span>${mccIcon('car', 16)} ${formatPickup(p.pickup_preference)}</span>
            </div>
            ${p._isSplitParticipant ? `<div style="margin-top:8px;padding:6px 10px;background:var(--accent-blue-soft);border:1px solid rgba(74,124,255,0.3);border-radius:var(--radius-sm);font-size:0.8rem;color:var(--accent-blue);display:inline-block;">${mccIcon('users', 16)} Split Payment — Your Share: $${(p._splitAmountCents / 100).toFixed(2)}</div>` : ''}
            ${p.description ? `<div class="package-description">${p.description}</div>` : ''}
            <div class="package-footer">
              <span class="bid-count">${isExpired ? 'Bidding ended' : (p.bid_count > 0 ? `${mccIcon('message-square', 16)} ${p.bid_count} bid${p.bid_count === 1 ? '' : 's'} received` : 'No bids yet')}</span>
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
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">' + mccIcon('package', 40) + '</div><p>No recent activity.</p></div>';
        return;
      }
      container.innerHTML = recent.map(p => {
        const vehicle = p.vehicles;
        const vehicleName = vehicle ? (vehicle.nickname || `${vehicle.make} ${vehicle.model}`) : 'Vehicle';
        const bidInfo = p.status === 'open' && p.bid_count > 0 
          ? `<div style="color:var(--accent-gold);font-size:0.85rem;margin-top:4px;">${mccIcon('message-square', 16)} ${p.bid_count} bid${p.bid_count === 1 ? '' : 's'}</div>` 
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
        'registration': mccIcon('clipboard-list', 16),
        'oil_change': mccIcon('fuel', 16),
        'warranty': mccIcon('shield', 16),
        'maintenance': mccIcon('wrench', 16),
        'inspection': mccIcon('search', 16),
        'tire_rotation': mccIcon('refresh-cw', 16),
        'brake_check': mccIcon('circle-alert', 16),
        'other': mccIcon('map-pin', 16)
      };
      return icons[type] || mccIcon('wrench', 16);
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
        list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${mccIcon('bell', 40)}</div><p>No reminders. Your vehicles are up to date!</p></div>`;
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
              <span style="font-size:0.82rem;color:var(--text-secondary);line-height:1.5;">${mccIcon('lightbulb', 16)} <strong>Why it's due:</strong> ${whyExplanation}</span>
            </div>
          </div>
          <div class="reminder-actions">
            <button class="btn btn-sm btn-primary" onclick="createPackageFromReminder('${r.vehicleId}', '${r.title.replaceAll('\'', "\\'")}')">Schedule</button>
            <button class="btn btn-sm btn-secondary" onclick="snoozeReminder('${r.id}', ${r.dbId ? `'${r.dbId}'` : 'null'})" title="Snooze for 7 days">${mccIcon('clock', 16)}</button>
            <button class="btn btn-sm btn-ghost" onclick="dismissReminder('${r.id}')" title="Dismiss reminder">${mccIcon('x', 16)}</button>
          </div>
        </div>
      `}).join('');
    }

    function renderUpcomingReminders() {
      const container = document.getElementById('upcoming-reminders');
      const upcoming = reminders.filter(r => r.status === 'due' || r.status === 'overdue').slice(0, 3);
      if (!upcoming.length) {
        container.innerHTML = `<div class="empty-state" style="padding:24px"><div class="empty-state-icon">${mccIcon('check-circle', 40)}</div><p>All caught up!</p></div>`;
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
            <button class="btn btn-sm btn-secondary" onclick="snoozeReminder('${r.id}', ${r.dbId ? `'${r.dbId}'` : 'null'})" title="Snooze for 7 days">${mccIcon('clock', 16)}</button>
            <button class="btn btn-sm btn-ghost" onclick="dismissReminder('${r.id}')" title="Dismiss reminder">${mccIcon('x', 16)}</button>
          </div>
        </div>
      `).join('');
    }

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

    function createPackageForVehicle(vehicleId, opts) {
      openPackageModal();
      document.getElementById('p-vehicle').value = vehicleId;
      if (opts && opts.title) document.getElementById('p-title').value = opts.title;
      if (opts && opts.description) document.getElementById('p-description').value = opts.description;
      if (opts && opts.category) {
        const catEl = document.getElementById('p-category');
        if (catEl) catEl.value = opts.category;
      }
    }

    function createPackageFromReminder(vehicleId, title) {
      openPackageModal();
      document.getElementById('p-vehicle').value = vehicleId;
      document.getElementById('p-title').value = title;
    }

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

    function toggleAiDescribePanel() {
      const body = document.getElementById('ai-describe-body');
      const chevron = document.getElementById('ai-describe-chevron');
      const open = body.style.display === 'none';
      body.style.display = open ? 'block' : 'none';
      if (chevron) chevron.style.transform = open ? 'rotate(180deg)' : '';
      if (open) document.getElementById('ai-describe-input')?.focus();
    }

    async function aiDescribeToPackage() {
      const input = document.getElementById('ai-describe-input');
      const text = (input?.value || '').trim();
      if (!text) { showToast('Please describe your issue first.', 'error'); return; }

      const btn = document.getElementById('ai-describe-btn');
      const status = document.getElementById('ai-describe-status');
      btn.disabled = true;
      btn.textContent = 'Thinking...';
      status.style.display = 'inline';
      status.textContent = 'AI is analyzing your description...';
      status.style.color = 'var(--accent-teal)';

      try {
        const vehicleId = document.getElementById('p-vehicle')?.value;
        let vehicleInfo = null;
        if (vehicleId && typeof vehicles !== 'undefined') {
          const v = vehicles.find(x => x.id === vehicleId);
          if (v) vehicleInfo = { make: v.make, model: v.model, year: v.year, trim: v.trim || null };
        }

        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const { data: { session } } = await supabaseClient.auth.getSession();
        const resp = await fetch(`${apiBase}/api/ai/describe-to-package`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
          body: JSON.stringify({ text, vehicle: vehicleInfo })
        });
        if (!resp.ok) {
          let errMsg = 'Server error';
          try { const errData = await resp.json(); errMsg = errData.error || errMsg; } catch (_) {}
          const e = new Error(errMsg);
          e.serverMessage = errMsg;
          throw e;
        }
        const result = await resp.json();

        function flashField(el) {
          if (!el) return;
          el.style.transition = 'box-shadow 0.4s ease, border-color 0.4s ease';
          el.style.boxShadow = '0 0 0 2px rgba(34,211,238,0.5)';
          el.style.borderColor = 'var(--accent-teal)';
          setTimeout(() => { el.style.boxShadow = ''; el.style.borderColor = ''; }, 1200);
        }

        if (result.category) {
          const sel = document.getElementById('p-category');
          if (sel) {
            const match = Array.from(sel.options).find(o => o.value === result.category);
            if (match) { sel.value = result.category; sel.dispatchEvent(new Event('change')); flashField(sel); }
          }
        }
        if (result.title) {
          const titleEl = document.getElementById('p-title');
          titleEl.value = result.title;
          flashField(titleEl);
        }
        if (result.description) {
          const descEl = document.getElementById('p-description');
          descEl.value = result.description;
          flashField(descEl);
        }

        status.textContent = 'Fields filled — review and adjust if needed.';
        status.style.color = 'var(--accent-green)';

        setTimeout(() => {
          const body = document.getElementById('ai-describe-body');
          const chevron = document.getElementById('ai-describe-chevron');
          if (body) body.style.display = 'none';
          if (chevron) chevron.style.transform = '';
        }, 1500);
      } catch (err) {
        console.error('AI describe error:', err);
        const msg = err.serverMessage || 'Could not process — please fill in manually.';
        status.textContent = msg;
        status.style.color = 'var(--accent-red)';
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg> Let AI fill this in';
      }
    }

    async function aiPhotoDiagnose(fileInput) {
      const file = fileInput?.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) { showToast('Please select an image file.', 'error'); fileInput.value = ''; return; }
      if (file.size > 10 * 1024 * 1024) { showToast('Image too large (max 10 MB).', 'error'); fileInput.value = ''; return; }

      const status = document.getElementById('ai-describe-status');
      const photoLabel = document.getElementById('ai-photo-label');
      const previewDiv = document.getElementById('ai-photo-preview');
      const thumbImg = document.getElementById('ai-photo-thumb');
      const explDiv = document.getElementById('ai-photo-explanation');

      status.style.display = 'inline';
      status.textContent = 'Analyzing your photo...';
      status.style.color = 'var(--accent-teal)';
      photoLabel.style.pointerEvents = 'none';
      photoLabel.style.opacity = '0.6';

      try {
        const reader = new FileReader();
        const dataUrl = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Could not read file'));
          reader.readAsDataURL(file);
        });

        thumbImg.src = dataUrl;
        previewDiv.style.display = 'block';
        explDiv.style.display = 'none';

        const base64 = dataUrl.split(',')[1];

        const vehicleId = document.getElementById('p-vehicle')?.value;
        let vehicleInfo = null;
        if (vehicleId && typeof vehicles !== 'undefined') {
          const v = vehicles.find(x => x.id === vehicleId);
          if (v) vehicleInfo = { make: v.make, model: v.model, year: v.year, trim: v.trim || null };
        }

        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const { data: { session } } = await supabaseClient.auth.getSession();
        const resp = await fetch(`${apiBase}/api/ai/photo-diagnose`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
          body: JSON.stringify({ image: base64, vehicle: vehicleInfo })
        });
        if (!resp.ok) {
          let errMsg = 'Server error';
          try { const errData = await resp.json(); errMsg = errData.error || errMsg; } catch (_) {}
          const e = new Error(errMsg); e.serverMessage = errMsg; throw e;
        }
        const result = await resp.json();

        if (result.lowConfidence) {
          status.textContent = result.explanation || 'Could not clearly identify the issue — please describe it in the text box above.';
          status.style.color = 'var(--accent-orange)';
          explDiv.style.display = 'none';
          return;
        }

        function flashField(el) {
          if (!el) return;
          el.style.transition = 'box-shadow 0.4s ease, border-color 0.4s ease';
          el.style.boxShadow = '0 0 0 2px rgba(34,211,238,0.5)';
          el.style.borderColor = 'var(--accent-teal)';
          setTimeout(() => { el.style.boxShadow = ''; el.style.borderColor = ''; }, 1200);
        }

        if (result.category) {
          const sel = document.getElementById('p-category');
          if (sel) {
            const match = Array.from(sel.options).find(o => o.value === result.category);
            if (match) { sel.value = result.category; sel.dispatchEvent(new Event('change')); flashField(sel); }
          }
        }
        if (result.title) { const el = document.getElementById('p-title'); el.value = result.title; flashField(el); }
        if (result.description) { const el = document.getElementById('p-description'); el.value = result.description; flashField(el); }

        if (result.explanation) {
          explDiv.textContent = result.explanation;
          explDiv.style.display = 'block';
        }

        status.textContent = 'Fields filled from photo — review and adjust if needed.';
        status.style.color = 'var(--accent-green)';
      } catch (err) {
        console.error('AI photo diagnose error:', err);
        status.textContent = err.serverMessage || 'Could not analyze photo — try describing the issue in the text box.';
        status.style.color = 'var(--accent-red)';
      } finally {
        photoLabel.style.pointerEvents = '';
        photoLabel.style.opacity = '';
        fileInput.value = '';
      }
    }

    function clearPhotoDiagnose() {
      const previewDiv = document.getElementById('ai-photo-preview');
      const thumbImg = document.getElementById('ai-photo-thumb');
      const explDiv = document.getElementById('ai-photo-explanation');
      const status = document.getElementById('ai-describe-status');
      if (previewDiv) previewDiv.style.display = 'none';
      if (thumbImg) thumbImg.src = '';
      if (explDiv) { explDiv.style.display = 'none'; explDiv.textContent = ''; }
      if (status) status.style.display = 'none';
    }

    async function savePackage() {
      const vehicleId = document.getElementById('p-vehicle').value;
      const title = document.getElementById('p-title').value.trim();
      const category = document.getElementById('p-category').value;
      const isSnowRemoval = category === 'snow_removal';
      if (!isSnowRemoval && !vehicleId) return showToast('Vehicle is required', 'error');
      if (!title) return showToast('Title is required', 'error');
      if (isSnowRemoval && !document.getElementById('p-property-address').value.trim()) return showToast('Property address is required for snow removal', 'error');

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

      let snowRemovalDetails = null;
      if (isSnowRemoval) {
        snowRemovalDetails = {
          property_address: document.getElementById('p-property-address').value.trim(),
          property_type: document.getElementById('p-property-type').value,
          property_size: document.getElementById('p-property-size').value
        };
      }

      const mergedFitment = isSnowRemoval
        ? { ...(fitmentSpecs || {}), snow_removal_details: snowRemovalDetails }
        : fitmentSpecs;

      const descriptionText = document.getElementById('p-description').value.trim() || null;
      const fullDescription = isSnowRemoval && snowRemovalDetails
        ? `${descriptionText || ''}\n\n[Property: ${snowRemovalDetails.property_address} | Type: ${snowRemovalDetails.property_type.replaceAll('_', ' ')} | Size: ${snowRemovalDetails.property_size.replaceAll('_', ' ')}]`.trim()
        : descriptionText;

      const packageData = {
        member_id: currentUser.id,
        vehicle_id: vehicleId || null,
        title,
        description: fullDescription,
        category: category,
        service_type: document.getElementById('p-service-type').value || null,
        frequency: document.getElementById('p-frequency').value,
        parts_preference: selectedPartsTier,
        oil_preference: oilPreference,
        fitment_specs: mergedFitment,
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
        status: 'open',
        crowd_funded: document.getElementById('p-crowd-funded')?.checked || false,
        funding_goal_cents: (document.getElementById('p-crowd-funded')?.checked && document.getElementById('p-funding-goal')?.value)
          ? Math.round(Number.parseFloat(document.getElementById('p-funding-goal').value) * 100) : null
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

      setTimeout(() => {
        try {
          const vehicleCount = Number.parseInt(document.getElementById('stat-vehicles')?.textContent || '0');
          const tipContainer = document.getElementById('post-create-tip');
          if (tipContainer) {
            if (vehicleCount < 1) {
              tipContainer.innerHTML = `<div style="display:flex;align-items:center;gap:12px;padding:14px 18px;background:linear-gradient(135deg,rgba(212,168,85,0.12),rgba(212,168,85,0.06));border:1px solid rgba(212,168,85,0.25);border-radius:12px;margin-bottom:16px;">
                <span style="font-size:1.4rem;">🚗</span>
                <div style="flex:1;">
                  <strong style="color:var(--text-primary);font-size:0.92rem;">Add your vehicle for faster quoting</strong>
                  <p style="color:var(--text-muted);font-size:0.82rem;margin:2px 0 0;">Providers give better bids when they can see your vehicle details.</p>
                </div>
                <button class="btn btn-secondary btn-sm" onclick="showSection('vehicles');document.getElementById('post-create-tip').innerHTML='';" style="white-space:nowrap;">Add Vehicle</button>
              </div>`;
            } else if (packageData.crowd_funded) {
              tipContainer.innerHTML = `<div style="display:flex;align-items:center;gap:12px;padding:14px 18px;background:linear-gradient(135deg,rgba(212,168,85,0.12),rgba(212,168,85,0.06));border:1px solid rgba(212,168,85,0.25);border-radius:12px;margin-bottom:16px;">
                <span style="font-size:1.4rem;">🤝</span>
                <div style="flex:1;">
                  <strong style="color:var(--text-primary);font-size:0.92rem;">Your request is on the Community Board</strong>
                  <p style="color:var(--text-muted);font-size:0.82rem;margin:2px 0 0;">Other members can now see and contribute to your request.</p>
                </div>
                <button class="btn btn-secondary btn-sm" onclick="showCommunityBoard();document.getElementById('post-create-tip').innerHTML='';" style="white-space:nowrap;">View Board</button>
              </div>`;
            } else {
              tipContainer.innerHTML = `<div style="display:flex;align-items:center;gap:12px;padding:14px 18px;background:linear-gradient(135deg,rgba(212,168,85,0.12),rgba(212,168,85,0.06));border:1px solid rgba(212,168,85,0.25);border-radius:12px;margin-bottom:16px;">
                <span style="font-size:1.4rem;">💡</span>
                <div style="flex:1;">
                  <strong style="color:var(--text-primary);font-size:0.92rem;">Check the Community Board</strong>
                  <p style="color:var(--text-muted);font-size:0.82rem;margin:2px 0 0;">See requests from other members and chip in on services you care about.</p>
                </div>
                <button class="btn btn-secondary btn-sm" onclick="showCommunityBoard();document.getElementById('post-create-tip').innerHTML='';" style="white-space:nowrap;">Explore</button>
              </div>`;
            }
            setTimeout(() => { if (tipContainer) tipContainer.innerHTML = ''; }, 20000);
          }
        } catch (e) {}
      }, 800);

      if (data && data[0]) {
        const newPkgId = data[0].id;
        fetchPriceEstimate(category, userProfile.zip_code, newPkgId).then(estimate => {
          if (estimate) {
            const widgetHtml = renderPriceEstimateWidget(estimate);
            if (widgetHtml) {
              const container = document.getElementById('price-estimate-banner');
              if (container) {
                container.innerHTML = widgetHtml;
                container.style.display = 'block';
                setTimeout(() => { container.style.display = 'none'; }, 15000);
              }
            }
          }
        });

        (async () => {
          try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session) {
              const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
              const matchResp = await fetch(`${apiBase}/api/ai/match-providers`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ package_id: newPkgId })
              }).catch(() => null);
              if (matchResp && matchResp.ok) {
                try {
                  const matchData = await matchResp.json();
                  if (matchData.matched > 0) {
                    _providerNotifyCounts[newPkgId] = matchData.matched;
                    await loadPackages();
                    setTimeout(() => showToast(`${matchData.matched} nearby provider${matchData.matched === 1 ? '' : 's'} notified about your request.`, 'success'), 1200);
                  }
                } catch (e) {}
              }
            }
          } catch (e) {}
        })();
      }
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
      if (days > 3) {
        text = `Closes ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      } else if (days > 0) {
        text = `${days}d ${hours}h left`;
      } else if (hours > 0) {
        text = `${hours}h ${minutes}m left`;
      } else {
        text = `${minutes}m left`;
      }
      
      return { 
        text, 
        expired: false, 
        urgent: diff < 4 * 60 * 60 * 1000
      };
    }

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
      selectedRepostHours = Number.parseInt(el.dataset.hours);
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
      selectedExtendHours = Number.parseInt(el.dataset.hours);
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

      // Resolve the accepted bid for this package (used in appointment/transfer/location templates below)
      const acceptedBid = bids?.find(b => b.id === pkg.accepted_bid_id) || bids?.find(b => b.status === 'accepted') || null;

      const priceEstimate = await fetchPriceEstimate(pkg.category, pkg.member_zip, packageId);

      // Load provider application data for enhanced transparency
      const providerApplications = {};
      if (bids?.length) {
        const providerIds = bids.map(b => b.provider_id);
        const { data: applications } = await supabaseClient
          .from('provider_applications')
          .select('user_id, business_name, years_in_business, services_offered, brand_specializations, license_verified, insurance_verified, certifications_verified, background_verified')
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
            <span>${mccIcon('car', 16)} ${vehicleName}</span>
            <span>${mccIcon('calendar', 16)} Created ${new Date(pkg.created_at).toLocaleDateString()}</span>
            <span>${mccIcon('refresh-cw', 16)} ${formatFrequency(pkg.frequency)}</span>
            <span>${mccIcon('wrench', 16)} ${pkg.parts_preference || 'Standard'} parts</span>
          </div>
          ${pkg.description ? `<p style="color:var(--text-secondary);margin-top:16px;line-height:1.6;">${pkg.description}</p>` : ''}
        </div>

        ${pkg.status === 'open' ? `
        <div class="form-section">
          <div class="form-section-title" style="display:flex;align-items:center;justify-content:space-between;">
            <span>${mccIcon('bell', 16)} Bid Alerts</span>
          </div>
          <p style="color:var(--text-secondary);font-size:0.88rem;margin-bottom:14px;">Get notified whenever a provider submits a bid on this job.</p>
          <div style="display:flex;gap:24px;flex-wrap:wrap;">
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:0.9rem;">
              <div class="toggle-switch">
                <input type="checkbox" id="pkg-alert-sms-${pkg.id}" ${pkg.member_bid_alerts_sms !== false ? 'checked' : ''} onchange="updatePackageBidAlert('${pkg.id}', 'sms', this.checked)">
                <span class="toggle-slider"></span>
              </div>
              Text (SMS)
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:0.9rem;">
              <div class="toggle-switch">
                <input type="checkbox" id="pkg-alert-email-${pkg.id}" ${pkg.member_bid_alerts_email ? 'checked' : ''} onchange="updatePackageBidAlert('${pkg.id}', 'email', this.checked)">
                <span class="toggle-slider"></span>
              </div>
              Email
            </label>
          </div>
        </div>
        ` : ''}

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
                const isBackgroundVerified = appData.background_verified === true;
                
                // Performance data
                const tier = perf?.tier || 'bronze';
                const tierIcon = {'platinum': mccIcon('sparkles', 16), 'gold': mccIcon('award', 16), 'silver': mccIcon('award', 16), 'bronze': mccIcon('award', 16)}[tier] || mccIcon('award', 16);
                const tierColors = {'platinum': '#e5e4e2', 'gold': 'var(--accent-gold)', 'silver': '#c0c0c0', 'bronze': '#cd7f32'};
                const overallScore = perf?.overall_score ? Math.round(perf.overall_score) : null;
                const onTimeRate = perf?.on_time_rate && jobs > 0 ? Math.round(perf.on_time_rate) : null;
                const badges = perf?.badges || [];
                const badgeIcons = {'top_rated': mccIcon('trophy', 16), 'quick_responder': mccIcon('zap', 16), 'veteran': mccIcon('award', 16), 'perfect_score': mccIcon('star', 16), 'dispute_free': mccIcon('shield', 16)};
                
                return `
                  <div class="bid-card" style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:20px;margin-bottom:12px;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
                      <div style="display:flex;gap:12px;align-items:flex-start;">
                        <div style="width:48px;height:48px;background:var(--accent-gold-soft);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">${mccIcon('wrench', 20)}</div>
                        <div>
                          <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;flex-wrap:wrap;">
                            <h4 style="margin:0;font-size:1rem;">${providerName}</h4>
                            ${perf ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:100px;font-size:0.7rem;font-weight:600;background:${tierColors[tier]}20;color:${tierColors[tier]};border:1px solid ${tierColors[tier]}40;">${tierIcon} ${tier.charAt(0).toUpperCase() + tier.slice(1)}</span>` : ''}
                            ${isBackgroundVerified ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:100px;font-size:0.7rem;font-weight:600;background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3);" title="This provider has voluntarily completed background verification for added trust">${mccIcon('shield', 16)} Background Verified</span>` : ''}
                            ${typeof carClubProviderIds !== 'undefined' && carClubProviderIds.has(bid.provider_id) ? `<span class="car-club-badge" style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:100px;font-size:0.7rem;font-weight:600;background:linear-gradient(135deg,rgba(212,168,85,0.15),rgba(212,168,85,0.08));color:var(--accent-gold);border:1px solid rgba(212,168,85,0.25);"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg> Car Club</span>` : ''}
                          </div>
                          <div style="font-size:0.82rem;color:var(--text-secondary);margin-top:2px;">
                            ${businessName && businessName !== providerName ? `${businessName}` : ''}
                            ${businessName && businessName !== providerName && yearsInBusiness ? ' • ' : ''}
                            ${yearsInBusiness ? `${yearsInBusiness} years in business` : ''}
                          </div>
                          <div style="font-size:0.85rem;color:var(--text-muted);margin-top:4px;">
                            ${mccIcon('star', 16)} ${rating} 
                            ${jobs > 0 ? `• ${jobs} jobs` : '• New provider'}
                            ${onTimeRate !== null ? ` • ${onTimeRate}% on-time` : ''}
                            ${overallScore !== null ? ` • Score: ${overallScore}` : ''}
                          </div>
                          ${badges.length > 0 ? `<div style="display:flex;gap:4px;margin-top:6px;">${badges.map(b => `<span title="${b.replace('_', ' ')}" style="font-size:1rem;">${badgeIcons[b] || ''}</span>`).join('')}</div>` : ''}
                        </div>
                      </div>
                      <div style="text-align:right;">
                        <div style="font-size:1.4rem;font-weight:600;color:var(--accent-gold);">$${bidPrice.toFixed(2)}</div>
                        <div style="display:inline-flex;align-items:center;gap:4px;background:linear-gradient(135deg,rgba(16,185,129,0.15),rgba(16,185,129,0.05));border:1px solid rgba(16,185,129,0.3);color:#10b981;padding:3px 8px;border-radius:100px;font-size:0.7rem;font-weight:600;margin-top:4px;cursor:help;" title="This price includes all parts, labor, taxes, shop fees, and disposal fees. No hidden costs or surprises.">${mccIcon('check', 16)} All-Inclusive</div>
                        ${bid.status === 'accepted' ? `<span style="color:var(--accent-green);font-size:0.8rem;display:block;margin-top:4px;">${mccIcon('check', 16)} Accepted</span>` : ''}
                        ${bid.status === 'rejected' ? `<span style="color:var(--accent-red);font-size:0.8rem;display:block;margin-top:4px;">${mccIcon('x', 16)} Not selected</span>` : ''}
                      </div>
                    </div>
                    
                    ${isVerified || specialties.length > 0 ? `
                      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
                        ${isVerified ? `<span style="display:inline-flex;align-items:center;gap:4px;background:linear-gradient(135deg, var(--accent-gold), #c49a45);color:#0a0a0f;padding:4px 10px;border-radius:100px;font-size:0.75rem;font-weight:600;">${mccIcon('check', 16)} Concierge Verified</span>` : ''}
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
                    ${bid.estimated_duration ? `<div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:8px;">${mccIcon('clock', 16)} Estimated time: ${bid.estimated_duration}</div>` : ''}
                    ${bid.available_dates ? `<div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:8px;">${mccIcon('calendar', 16)} Availability: ${bid.available_dates}</div>` : ''}
                    ${bid.notes ? `<div style="color:var(--text-secondary);margin-bottom:12px;padding:12px;background:var(--bg-input);border-radius:var(--radius-sm);font-size:0.9rem;">"${bid.notes}"</div>` : ''}
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                      <button class="btn btn-secondary btn-sm" onclick="openMessageWithProvider('${packageId}', '${bid.provider_id}')">${mccIcon('message-square', 16)} Message</button>
                      ${pkg.status === 'open' && bid.status === 'pending' ? `<button class="btn btn-primary btn-sm" onclick="acceptBid('${bid.id}', '${packageId}')">${mccIcon('check', 16)} Accept Bid</button>` : ''}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>

        ${await renderEscrowPaymentSection(pkg, bids)}

        ${await renderCheckinQRSection(pkg)}

        ${(pkg.status === 'accepted' || pkg.status === 'in_progress') ? `
          <div class="form-section" id="logistics-dashboard-${packageId}">
            <div class="form-section-title">${mccIcon('party-popper', 24)} Service Coordination Dashboard</div>
            <p style="color:var(--text-secondary);margin-bottom:20px;">Coordinate scheduling, vehicle transfer, and location with your service provider.</p>
            
            <!-- Scheduling Section -->
            <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:20px;margin-bottom:16px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h4 style="margin:0;font-size:1rem;display:flex;align-items:center;gap:8px;">${mccIcon('calendar', 16)} Appointment Scheduling</h4>
              </div>
              <div id="appointment-status-${packageId}" style="margin-bottom:16px;">
                <div style="color:var(--text-muted);font-size:0.9rem;">Loading appointment status...</div>
              </div>
              <div id="slot-booking-status-${packageId}" style="margin-bottom:16px;display:none;"></div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button class="btn btn-primary btn-sm" onclick="openScheduleModal('${packageId}', '${pkg.member_id}', '${acceptedBid?.provider_id || ''}')">${mccIcon('calendar', 16)} Schedule Appointment</button>
              </div>
            </div>

            <!-- Vehicle Transfer Section -->
            <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:20px;margin-bottom:16px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h4 style="margin:0;font-size:1rem;display:flex;align-items:center;gap:8px;">${mccIcon('car', 16)} Vehicle Transfer</h4>
              </div>
              <div id="transfer-status-${packageId}" style="margin-bottom:16px;">
                <div style="color:var(--text-muted);font-size:0.9rem;">Loading transfer status...</div>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button class="btn btn-secondary btn-sm" onclick="openTransferModal('${packageId}', '${pkg.member_id}', '${acceptedBid?.provider_id || ''}')">${mccIcon('settings', 16)} Setup Transfer</button>
              </div>
            </div>

            <!-- Location Sharing Section -->
            <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:20px;margin-bottom:16px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h4 style="margin:0;font-size:1rem;display:flex;align-items:center;gap:8px;">${mccIcon('map-pin', 16)} Location Sharing</h4>
              </div>
              <div id="location-status-${packageId}" style="margin-bottom:16px;">
                <div style="color:var(--text-muted);font-size:0.9rem;">Share your location for pickup coordination.</div>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button class="btn btn-primary btn-sm" onclick="shareMyLocation('${packageId}', '${acceptedBid?.provider_id || ''}')">${mccIcon('map-pin', 16)} Share My Location</button>
                <button class="btn btn-secondary btn-sm" onclick="viewSharedLocation('${packageId}')">${mccIcon('map-pin', 16)} View Provider Location</button>
              </div>
            </div>

            <!-- Vehicle Condition Evidence Section -->
            <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:20px;margin-bottom:16px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h4 style="margin:0;font-size:1rem;display:flex;align-items:center;gap:8px;">${mccIcon('camera', 16)} Vehicle Condition Evidence</h4>
              </div>
              <div id="evidence-timeline-${packageId}" style="margin-bottom:16px;">
                <div style="color:var(--text-muted);font-size:0.9rem;">Loading evidence timeline...</div>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button class="btn btn-primary btn-sm" onclick="openMemberEvidenceModal('${packageId}', 'pre_pickup')">${mccIcon('camera', 16)} Document Pre-Pickup Condition</button>
              </div>
            </div>

            <!-- Key Exchange Verification Section -->
            <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:20px;margin-bottom:16px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h4 style="margin:0;font-size:1rem;display:flex;align-items:center;gap:8px;">${mccIcon('key', 16)} Key Exchange Verification</h4>
              </div>
              <p style="color:var(--text-muted);font-size:0.9rem;margin-bottom:16px;">Track key handoffs between you and the provider for security and liability protection.</p>
              <div id="key-exchange-timeline-${packageId}">
                <div style="color:var(--text-muted);font-size:0.9rem;">Loading key exchange status...</div>
              </div>
            </div>

            <!-- Inspection Report Section -->
            <div id="inspection-report-container-${packageId}" style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:20px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h4 style="margin:0;font-size:1rem;display:flex;align-items:center;gap:8px;">${mccIcon('search', 16)} Multi-Point Inspection</h4>
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
              ${pkg.status === 'accepted' ? mccIcon('clock', 16) + ' Waiting for provider to start work...' : mccIcon('wrench', 16) + ' Work is in progress...'}
            </div>
            ${pkg.work_completed_at && pkg.status === 'in_progress' ? `
              <div class="alert" style="margin-bottom:16px;padding:16px;background:var(--accent-green-soft);border:1px solid rgba(74,200,140,0.3);color:var(--accent-green);border-radius:var(--radius-md);">
                ${mccIcon('check', 16)} Provider has marked work as complete on ${new Date(pkg.work_completed_at).toLocaleDateString()}
              </div>
              <p style="color:var(--text-secondary);margin-bottom:16px;">Once you receive your vehicle and verify the work is complete, confirm below to release payment to the provider.</p>
              <div style="display:flex;gap:12px;">
                <button class="btn btn-primary" onclick="openReleasePaymentModal('${packageId}')">${mccIcon('check', 16)} Confirm Complete & Release Payment</button>
                <button class="btn btn-danger btn-sm" onclick="openDispute('${packageId}')">${mccIcon('alert-triangle', 16)} Open Dispute</button>
              </div>
            ` : ''}
          </div>
        ` : ''}

        ${pkg.status === 'completed' ? `
          <div class="form-section" style="margin-top:24px;padding-top:20px;border-top:1px solid var(--border-subtle);">
            <div class="form-section-title">${mccIcon('check', 24)} Completed</div>
            <div class="alert" style="background:var(--accent-green-soft);border:1px solid rgba(74,200,140,0.3);color:var(--accent-green);padding:16px;border-radius:var(--radius-md);margin-bottom:16px;">
              ${mccIcon('check', 16)} This job was completed on ${new Date(pkg.member_confirmed_at || pkg.work_completed_at).toLocaleDateString()}
            </div>
            ${hasReviewed ? `
              <div style="color:var(--text-secondary);font-size:0.9rem;">${mccIcon('check', 16)} You've already reviewed this service</div>
            ` : `
              <button class="btn btn-secondary" onclick="openReviewModal('${packageId}')">${mccIcon('star', 16)} Leave a Review</button>
            `}
          </div>
        ` : ''}

        ${['payment_held', 'accepted', 'in_progress', 'completed'].includes(pkg.status) && (pkg.escrow_payment_intent_id || pkg.split_payment_id) ? `
          <div class="form-section" style="margin-top:24px;padding-top:20px;border-top:1px solid var(--border-subtle);">
            <div class="form-section-title">${mccIcon('dollar-sign', 24)} Refund Options</div>
            <p style="color:var(--text-secondary);margin-bottom:16px;font-size:0.9rem;">If there's an issue with this service, you can request a refund.</p>
            <button class="btn btn-secondary" onclick="openRefundModal('${packageId}', ${pkg.escrow_amount || 0})">${mccIcon('dollar-sign', 16)} Request Refund</button>
          </div>
        ` : ''}
      `;

      document.getElementById('view-package-modal').classList.add('active');
      
      // AI Smart Bid Analyzer - async, non-blocking
      if (bids?.length >= 2 && pkg.status === 'open') {
        fetchAiBidRanking(packageId, bids, providerStats, providerPerformance, providerApplications);
      }
      
      // Load logistics data if applicable
      if (pkg.status === 'accepted' || pkg.status === 'in_progress') {
        setTimeout(() => loadLogisticsData(packageId), 100);
      }

      if (pkg.work_completed_at && pkg.status === 'in_progress') {
        setTimeout(() => loadCachedMediation(packageId), 200);
      }
    }

    function sanitizeText(str) {
      if (!str) return '';
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    async function fetchAiBidRanking(packageId, bids, providerStats, providerPerformance, providerApplications) {
      const container = document.getElementById('ai-recommendation-container');
      if (!container) return;

      container.innerHTML = `
        <div style="padding:16px;background:linear-gradient(135deg,rgba(56,189,248,0.08),rgba(34,211,238,0.08));border:1px solid rgba(56,189,248,0.2);border-radius:var(--radius-md);display:flex;align-items:center;gap:12px;">
          <div style="width:24px;height:24px;border:2px solid var(--accent-blue);border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite;flex-shrink:0;"></div>
          <span style="color:var(--text-secondary);font-size:0.9rem;">Analyzing bids...</span>
        </div>
      `;

      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) { container.innerHTML = ''; return; }

        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const bidPayload = bids.map(bid => {
          const stats = providerStats[bid.provider_id] || {};
          const perf = providerPerformance[bid.provider_id];
          const appData = providerApplications[bid.provider_id] || {};
          const rating = perf?.rating_avg ? perf.rating_avg.toFixed(1) : (stats.average_rating ? stats.average_rating.toFixed(1) : 'New');
          const jobs = perf?.jobs_completed || stats.jobs_completed || 0;
          const isVerified = appData.license_verified && appData.insurance_verified && appData.certifications_verified;
          return {
            price: bid.price || 0,
            rating: rating,
            jobs_completed: jobs,
            on_time_rate: perf?.on_time_rate && jobs > 0 ? Math.round(perf.on_time_rate) : null,
            overall_score: perf?.overall_score ? Math.round(perf.overall_score) : null,
            tier: perf?.tier || null,
            is_verified: isVerified,
            is_background_verified: appData.background_verified === true,
            years_in_business: appData.years_in_business || null,
            estimated_duration: bid.estimated_duration || null,
            badges: perf?.badges || [],
            response_time: bid.created_at ? formatTimeAgo(bid.created_at) : null
          };
        });

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(`${apiBase}/api/ai/rank-bids`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ bids: bidPayload }),
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) { container.innerHTML = ''; return; }
        if (currentViewPackage !== packageId) return;

        const result = await response.json();
        if (!Array.isArray(result.ranked_indices) || !result.ranked_indices.length || !result.top_pick_rationale) { container.innerHTML = ''; return; }
        result.ranked_indices = result.ranked_indices.filter(i => typeof i === 'number' && i >= 0 && i < bids.length);
        if (!result.ranked_indices.length) { container.innerHTML = ''; return; }

        const topIndex = result.ranked_indices[0];
        const topBid = bids[topIndex];
        const topProviderName = topBid?.profiles?.provider_alias || `Provider #${topBid?.provider_id?.slice(0,4).toUpperCase()}`;

        container.innerHTML = `
          <div style="background:linear-gradient(135deg,rgba(52,211,153,0.1),rgba(56,189,248,0.08));border:1px solid rgba(52,211,153,0.3);border-radius:var(--radius-lg);padding:20px;position:relative;overflow:hidden;">
            <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--accent-green),var(--accent-blue));"></div>
            <div style="display:flex;align-items:flex-start;gap:14px;">
              <div style="width:44px;height:44px;background:linear-gradient(135deg,var(--accent-green),#4ade80);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 4px 12px rgba(52,211,153,0.3);">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#022c22" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2 7h7l-5.5 4 2 7L12 16l-5.5 4 2-7L3 9h7z"/></svg>
              </div>
              <div style="flex:1;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
                  <span style="font-weight:700;font-size:1rem;color:var(--text-primary);">AI Recommendation</span>
                  <span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:100px;font-size:0.72rem;font-weight:600;background:linear-gradient(135deg,var(--accent-green),#4ade80);color:#022c22;">Top Pick</span>
                </div>
                <div style="font-size:0.92rem;color:var(--text-secondary);line-height:1.6;margin-bottom:10px;">
                  <strong style="color:var(--accent-gold);">${sanitizeText(topProviderName)}</strong> at <strong>$${(topBid?.price || 0).toFixed(2)}</strong> &mdash; ${sanitizeText(result.top_pick_rationale)}
                </div>
                ${result.rankings && result.rankings.length > 1 ? `
                  <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    ${result.rankings.slice(1, 3).map((r, i) => {
                      const b = bids[r.index];
                      const name = sanitizeText(b?.profiles?.provider_alias || 'Provider #' + (b?.provider_id?.slice(0,4).toUpperCase() || ''));
                      return '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:100px;font-size:0.72rem;background:var(--bg-input);border:1px solid var(--border-subtle);color:var(--text-muted);">#' + (i + 2) + ' ' + name + '</span>';
                    }).join('')}
                  </div>
                ` : ''}
              </div>
            </div>
          </div>
        `;

        const topCard = document.querySelector(`.bid-card[data-bid-index="${topIndex}"]`);
        if (topCard) {
          topCard.style.border = '2px solid rgba(52,211,153,0.5)';
          topCard.style.boxShadow = '0 0 20px rgba(52,211,153,0.1)';
          const headerDiv = topCard.querySelector('.bid-card-badges');
          if (headerDiv) {
            const badge = document.createElement('span');
            badge.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:100px;font-size:0.7rem;font-weight:600;background:linear-gradient(135deg,rgba(52,211,153,0.2),rgba(52,211,153,0.1));color:var(--accent-green);border:1px solid rgba(52,211,153,0.3);margin-left:4px;';
            badge.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2 7h7l-5.5 4 2 7L12 16l-5.5 4 2-7L3 9h7z"/></svg> AI Pick';
            headerDiv.appendChild(badge);
          }
        }

        const bidsContainer = document.getElementById('bids-list-container');
        if (bidsContainer && result.ranked_indices) {
          const allCards = Array.from(bidsContainer.querySelectorAll('.bid-card'));
          const ordered = result.ranked_indices.map(idx => allCards.find(c => c.dataset.bidIndex === String(idx))).filter(Boolean);
          const remaining = allCards.filter(c => !ordered.includes(c));
          [...ordered, ...remaining].forEach(card => bidsContainer.appendChild(card));
        }

      } catch (err) {
        if (err.name === 'AbortError') {
          console.log('AI bid ranking timed out');
        } else {
          console.log('AI bid ranking unavailable:', err.message);
        }
        if (container) container.innerHTML = '';
      }
    }

    // Store bids for the current package
    let currentPackageBids = [];

    async function updatePackageBidAlert(packageId, channel, value) {
      try {
        const col = channel === 'sms' ? 'member_bid_alerts_sms' : 'member_bid_alerts_email';
        const { error } = await supabaseClient.from('maintenance_packages').update({ [col]: value }).eq('id', packageId);
        if (error) throw error;
        const pkg = packages.find(p => p.id === packageId);
        if (pkg) pkg[col] = value;
      } catch (err) {
        console.error('Failed to update bid alert preference:', err);
        showToast('Could not save alert preference', 'error');
        const el = document.getElementById(`pkg-alert-${channel}-${packageId}`);
        if (el) el.checked = !value;
      }
    }

    async function shareWithCarClub(packageId) {
      const btn = document.getElementById(`cf-share-btn-${packageId}`);
      const statusEl = document.getElementById(`cf-share-status-${packageId}`);
      if (btn) { btn.disabled = true; btn.textContent = 'Sharing…'; }
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const res = await fetch(`${window.MCC_CONFIG?.apiBaseUrl || ''}/api/packages/${packageId}/share-with-car-club`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session?.access_token}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to share');
        if (btn) { btn.style.display = 'none'; }
        if (statusEl) {
          if (data.no_clubs) {
            statusEl.textContent = 'Join a Car Club to share with members';
          } else if (data.already_shared) {
            statusEl.textContent = `Already shared with ${data.notified} member${data.notified === 1 ? '' : 's'}`;
          } else if (data.notified === 0) {
            statusEl.textContent = 'No Car Club members to notify yet';
          } else {
            statusEl.textContent = `${data.notified} Car Club member${data.notified === 1 ? '' : 's'} notified`;
          }
          statusEl.style.display = 'inline';
        }
        if (data.notified > 0 && !data.already_shared) {
          showToast(`${data.notified} Car Club member${data.notified === 1 ? '' : 's'} notified!`, 'success');
        }
      } catch (err) {
        if (btn) { btn.disabled = false; btn.innerHTML = `${mccIcon('users', 13)} Share with Car Club`; }
        showToast(err.message || 'Could not share with Car Club', 'error');
      }
    }
    window.shareWithCarClub = shareWithCarClub;

    async function acceptBid(bidId, packageId) {
      const bid = currentPackageBids.find(b => b.id === bidId);
      if (!bid) {
        showToast('Bid not found', 'error');
        return;
      }
      
      const amount = bid.price || 0;

      if (!confirm(`Accept this bid for $${amount.toFixed(2)}?\n\nThis will:\n• Hold payment in escrow\n• Close the package to other providers\n• Notify the provider to begin work`)) return;

      try {
        // Update this bid to accepted
        await supabaseClient.from('bids').update({ status: 'accepted' }).eq('id', bidId);
        
        // Reject all other bids for this package
        await supabaseClient.from('bids').update({ status: 'rejected' }).eq('package_id', packageId).neq('id', bidId);
        
        // Update package status
        await supabaseClient.from('maintenance_packages').update({ 
          status: 'accepted', 
          accepted_bid_id: bidId
        }).eq('id', packageId);

        // Create payment record (escrow)
        await supabaseClient.from('payments').insert({
          package_id: packageId,
          member_id: currentUser.id,
          provider_id: bid.provider_id,
          amount_total: amount,
          amount_provider: amount,
          mcc_fee: 0,
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
            title: mccIcon('party-popper', 16) + ' Your bid was accepted!',
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

          const { data: { session: _bidAcceptSession } } = await supabaseClient.auth.getSession();
          if (_bidAcceptSession?.access_token) {
            fetch('/api/notifications/bid-accepted-push', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${_bidAcceptSession.access_token}` },
              // Task #351: server now reads package_title + bid_amount from
              // the DB using bid_id, so we no longer send them from the browser.
              body: JSON.stringify({ bid_id: bidId, provider_id: bid.provider_id })
            }).catch(() => {});
          }
        } catch (e) {
          console.log('Notification error (non-critical):', e);
        }

        closeModal('view-package-modal');
        showToast('Bid accepted! Please authorize payment to hold funds in escrow.', 'success');
        await loadPackages();

        const _pkg = packages.find(p => p.id === packageId);
        const _service = _pkg?.title || 'auto service';
        setTimeout(() => {
          const tipEl = document.getElementById('post-create-tip');
          if (tipEl) {
            tipEl.innerHTML = `<div style="display:flex;align-items:center;gap:12px;padding:14px 18px;background:linear-gradient(135deg,rgba(212,168,85,0.12),rgba(212,168,85,0.06));border:1px solid rgba(212,168,85,0.25);border-radius:12px;margin-bottom:16px;">
              <span style="font-size:1.6rem;">🎉</span>
              <div style="flex:1;">
                <strong style="color:var(--text-primary);font-size:0.92rem;">You got competitive pricing on ${_service}!</strong>
                <p style="color:var(--text-muted);font-size:0.82rem;margin:2px 0 0;">Share My Car Concierge and earn $5 referral credit when a friend signs up.</p>
              </div>
              <button class="btn btn-secondary btn-sm" onclick="shareSavings('${_service.replaceAll('\'', "\\'")}',${amount})" style="white-space:nowrap;">${mccIcon('share', 16)} Share</button>
              <button class="btn btn-ghost btn-sm" onclick="document.getElementById('post-create-tip').innerHTML=''" style="padding:4px 8px;">×</button>
            </div>`;
          }
        }, 800);

        setTimeout(() => viewPackage(packageId), 500);
      } catch (err) {
        console.error('Error accepting bid:', err);
        showToast('Failed to accept bid. Please try again.', 'error');
      }
    }

    async function openMemberCalendarOptions(packageId) {
      try {
        const { data: appts } = await supabaseClient
          .from('service_appointments')
          .select('id, confirmed_date, confirmed_time_start, notes')
          .eq('package_id', packageId)
          .eq('status', 'confirmed')
          .order('created_at', { ascending: false })
          .limit(1);

        if (!appts || appts.length === 0) {
          showToast('No confirmed appointment found. Schedule one first.', 'info');
          return;
        }

        const appt = appts[0];
        const { data: { session } } = await supabaseClient.auth.getSession();
        const token = session?.access_token;

        const existing = document.getElementById('member-cal-modal');
        if (existing) existing.remove();

        const dateStr = appt.confirmed_date
          ? new Date(appt.confirmed_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
          : 'Scheduled';
        const timeStr = appt.confirmed_time_start || '';

        const pkg = packages.find(p => p.id === packageId);
        const title = encodeURIComponent(pkg?.title || 'Service Appointment');
        const startDate = appt.confirmed_date ? appt.confirmed_date.replaceAll('-', '') : '';
        const startTime = appt.confirmed_time_start ? appt.confirmed_time_start.replace(':', '') + '00' : '090000';
        const gcal = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startDate}T${startTime}/${startDate}T${startTime}`;

        const modal = document.createElement('div');
        modal.id = 'member-cal-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;';
        modal.innerHTML = `<div style="background:var(--bg-card);border-radius:var(--radius-lg);padding:28px;max-width:380px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.4);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
            <h3 style="margin:0;font-size:1.1rem;">Add to Calendar</h3>
            <button onclick="document.getElementById('member-cal-modal').remove()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:1.2rem;">×</button>
          </div>
          <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:20px;">${dateStr}${timeStr ? ' at ' + timeStr : ''}</p>
          <div style="display:flex;flex-direction:column;gap:10px;">
            <a href="${gcal}" target="_blank" class="btn btn-primary" style="text-align:center;text-decoration:none;">Open Google Calendar</a>
            <button class="btn btn-secondary" onclick="downloadMemberIcal('${appt.id}','${token}');document.getElementById('member-cal-modal').remove();">Download .ics File</button>
          </div>
        </div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
      } catch (err) {
        console.error('Calendar options error:', err);
        showToast('Could not load appointment details.', 'error');
      }
    }

    async function downloadMemberIcal(apptId, token) {
      try {
        const resp = await fetch(`/api/appointments/${apptId}/ical`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!resp.ok) { showToast('Could not generate calendar file.', 'error'); return; }
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mcc-appointment.ics';
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        showToast('Download failed.', 'error');
      }
    }

    function shareSavings(service, amount) {
      const msg = `Just got competitive bids for ${service} through My Car Concierge — providers compete for your business so you never overpay. Sign up free: https://mycarconcierge.com`;
      if (navigator.share) {
        navigator.share({ title: 'My Car Concierge', text: msg }).catch(() => {});
      } else {
        navigator.clipboard.writeText(msg).then(() => showToast('Copied to clipboard!', 'success')).catch(() => showToast('Could not copy. Share: mycarconcierge.com', 'info'));
      }
    }

    let currentEscrowCardElement = null;
    let currentEscrowElements = null;
    let currentEscrowClientSecret = null;
    let currentEscrowPackageId = null;
    let currentEscrowBidId = null;

    let packageAdditionalWork = {};
    let packageDiscounts = {};
    let currentAdditionalWorkId = null;
    let currentAdditionalWorkAmount = null;
    let additionalWorkCardElement = null;
    let additionalWorkElements = null;

    async function loadPackageAdditionalWork(packageId) {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const response = await fetch(`/api/additional-work/${packageId}`, {
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {})
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          packageAdditionalWork[packageId] = data || [];
          return data || [];
        }
        return [];
      } catch (err) {
        console.log('Could not load additional work requests:', err);
        return [];
      }
    }

    async function loadPackageDiscounts(packageId) {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const response = await fetch(`/api/discounts/${packageId}`, {
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {})
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          packageDiscounts[packageId] = data || [];
          return data || [];
        }
        return [];
      } catch (err) {
        console.log('Could not load discount offers:', err);
        return [];
      }
    }

    function renderAdditionalWorkSection(packageId, additionalWork, paymentStatus, isCrowdFunded) {
      if (!additionalWork || additionalWork.length === 0) return '';
      
      const pendingWork = additionalWork.filter(w => w.status === 'pending');
      const approvedWork = additionalWork.filter(w => w.status === 'approved');
      const declinedWork = additionalWork.filter(w => w.status === 'declined');
      
      if (pendingWork.length === 0 && approvedWork.length === 0) return '';
      
      let html = `
        <div class="form-section" id="additional-work-section-${packageId}">
          <div class="form-section-title">
            ${mccIcon('wrench', 16)} Additional Work Requests
            ${pendingWork.length > 0 ? `<span style="background:var(--accent-orange);color:white;padding:2px 8px;border-radius:10px;font-size:0.75rem;margin-left:8px;">${pendingWork.length} Pending</span>` : ''}
          </div>
      `;
      
      if (pendingWork.length > 0) {
        html += `
          <div style="background:var(--accent-orange-soft);border:1px solid rgba(251,146,60,0.3);border-radius:var(--radius-lg);padding:16px;margin-bottom:16px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
              <span style="font-size:1.2rem;">${mccIcon('alert-triangle', 20)}</span>
              <span style="font-weight:600;color:var(--accent-orange);">Provider has requested additional work</span>
            </div>
            <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:16px;">
              Review and approve or decline these requests. Approved work requires an additional payment authorization.
            </p>
          </div>
        `;
        
        pendingWork.forEach(work => {
          html += `
            <div class="card" style="margin-bottom:12px;border:2px solid var(--accent-orange);">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
                <div>
                  <h4 style="margin:0 0 4px 0;">${work.title || 'Additional Work'}</h4>
                  <span style="background:var(--accent-orange);color:white;padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:600;">PENDING APPROVAL</span>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:1.3rem;font-weight:700;color:var(--accent-gold);">$${(work.amount || 0).toFixed(2)}</div>
                  <div style="display:inline-flex;align-items:center;gap:4px;background:linear-gradient(135deg,rgba(16,185,129,0.15),rgba(16,185,129,0.05));border:1px solid rgba(16,185,129,0.3);color:#10b981;padding:2px 6px;border-radius:100px;font-size:0.65rem;font-weight:600;margin-top:4px;">${mccIcon('check', 16)} All-Inclusive</div>
                </div>
              </div>
              
              ${work.description ? `<p style="color:var(--text-secondary);margin-bottom:12px;font-size:0.9rem;">${work.description}</p>` : ''}
              
              ${work.photo_urls?.length ? `
                <div style="display:flex;gap:8px;margin-bottom:12px;overflow-x:auto;">
                  ${work.photo_urls.map(url => `
                    <img src="${url}" style="width:80px;height:60px;object-fit:cover;border-radius:var(--radius-sm);cursor:pointer;" onclick="window.open('${url}','_blank')">
                  `).join('')}
                </div>
              ` : ''}
              
              <div style="display:flex;gap:10px;flex-wrap:wrap;">
                <button class="btn btn-success" onclick="openApproveAdditionalWorkModal('${work.id}', '${(work.title || 'Additional Work').replaceAll('\'', "\\'")}', ${work.amount || 0}, '${packageId}', ${!!isCrowdFunded})">
                  ${mccIcon('check', 16)} Approve ($${(work.amount || 0).toFixed(2)})
                </button>
                <button class="btn btn-secondary" onclick="declineAdditionalWork('${work.id}', '${packageId}')">
                  ${mccIcon('x', 16)} Decline
                </button>
              </div>
            </div>
          `;
        });
      }
      
      if (approvedWork.length > 0) {
        html += `<div style="margin-top:16px;"><h5 style="color:var(--text-muted);margin-bottom:12px;">Approved Additional Work</h5>`;
        approvedWork.forEach(work => {
          html += `
            <div style="background:var(--accent-green-soft);border:1px solid rgba(52,211,153,0.3);border-radius:var(--radius-md);padding:12px;margin-bottom:8px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                  <span style="font-weight:500;">${work.title || 'Additional Work'}</span>
                  <span style="color:var(--accent-green);font-size:0.85rem;margin-left:8px;">${mccIcon('check', 16)} Approved</span>
                </div>
                <span style="font-weight:600;">$${(work.amount || 0).toFixed(2)}</span>
              </div>
            </div>
          `;
        });
        html += `</div>`;
      }
      
      html += `</div>`;
      return html;
    }

    function renderDiscountsSection(packageId, discounts) {
      if (!discounts || discounts.length === 0) return '';
      
      const pendingDiscounts = discounts.filter(d => d.status === 'pending');
      const acceptedDiscounts = discounts.filter(d => d.status === 'accepted');
      
      if (pendingDiscounts.length === 0 && acceptedDiscounts.length === 0) return '';
      
      let html = `
        <div class="form-section" id="discounts-section-${packageId}">
          <div class="form-section-title">
            ${mccIcon('ticket', 16)} Discount Offers
            ${pendingDiscounts.length > 0 ? `<span style="background:var(--accent-green);color:white;padding:2px 8px;border-radius:10px;font-size:0.75rem;margin-left:8px;">${pendingDiscounts.length} Available</span>` : ''}
          </div>
      `;
      
      if (pendingDiscounts.length > 0) {
        pendingDiscounts.forEach(discount => {
          const discountPercent = discount.discount_percent ? `${discount.discount_percent}%` : null;
          const discountAmount = discount.discount_amount ? `$${discount.discount_amount.toFixed(2)}` : null;
          const displayDiscount = discountPercent || discountAmount || 'Discount';
          
          html += `
            <div class="card" style="margin-bottom:12px;border:2px solid var(--accent-green);background:linear-gradient(135deg,rgba(16,185,129,0.08),rgba(16,185,129,0.02));">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
                <div>
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                    <span style="font-size:1.5rem;">${mccIcon('party-popper', 24)}</span>
                    <h4 style="margin:0;">Discount Offer from Provider</h4>
                  </div>
                  <span style="background:var(--accent-green);color:white;padding:2px 10px;border-radius:10px;font-size:0.8rem;font-weight:600;">SAVE ${displayDiscount}</span>
                </div>
              </div>
              
              ${discount.reason ? `<p style="color:var(--text-secondary);margin-bottom:12px;font-size:0.9rem;">"${discount.reason}"</p>` : ''}
              
              <div style="background:var(--bg-card);border-radius:var(--radius-md);padding:12px;margin-bottom:16px;">
                ${discount.original_amount ? `
                  <div style="display:flex;justify-content:space-between;font-size:0.9rem;margin-bottom:6px;">
                    <span style="color:var(--text-muted);">Original Amount</span>
                    <span style="text-decoration:line-through;color:var(--text-muted);">$${discount.original_amount.toFixed(2)}</span>
                  </div>
                ` : ''}
                ${discount.discount_amount ? `
                  <div style="display:flex;justify-content:space-between;font-size:0.9rem;margin-bottom:6px;">
                    <span style="color:var(--accent-green);">Discount</span>
                    <span style="color:var(--accent-green);font-weight:600;">-$${discount.discount_amount.toFixed(2)}</span>
                  </div>
                ` : ''}
                ${discount.new_amount ? `
                  <div style="display:flex;justify-content:space-between;font-size:1rem;padding-top:8px;border-top:1px solid var(--border-subtle);">
                    <span style="font-weight:600;">New Total</span>
                    <span style="font-weight:700;color:var(--accent-green);font-size:1.1rem;">$${discount.new_amount.toFixed(2)}</span>
                  </div>
                ` : ''}
              </div>
              
              <button class="btn btn-success" onclick="acceptDiscount('${discount.id}', '${packageId}')" style="width:100%;">
                ${mccIcon('party-popper', 16)} Accept Discount
              </button>
            </div>
          `;
        });
      }
      
      if (acceptedDiscounts.length > 0) {
        html += `<div style="margin-top:16px;">`;
        acceptedDiscounts.forEach(discount => {
          html += `
            <div style="background:var(--accent-green-soft);border:1px solid rgba(52,211,153,0.3);border-radius:var(--radius-md);padding:12px;margin-bottom:8px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <span>${mccIcon('check', 16)}</span>
                  <span style="font-weight:500;">Discount Applied</span>
                </div>
                <span style="color:var(--accent-green);font-weight:600;">
                  ${discount.discount_amount ? `-$${discount.discount_amount.toFixed(2)}` : `${discount.discount_percent}% off`}
                </span>
              </div>
            </div>
          `;
        });
        html += `</div>`;
      }
      
      html += `</div>`;
      return html;
    }

    async function openApproveAdditionalWorkModal(workId, title, amount, packageId, isCrowdFunded) {
      currentAdditionalWorkId = workId;
      currentAdditionalWorkAmount = amount;
      currentEscrowPackageId = packageId;

      if (isCrowdFunded) {
        const existingChoice = document.getElementById('additional-work-choice-modal');
        if (existingChoice) existingChoice.remove();

        const choiceHtml = `
          <div id="additional-work-choice-modal" class="modal active" style="z-index:10001;">
            <div class="modal-overlay" onclick="document.getElementById('additional-work-choice-modal').remove()"></div>
            <div class="modal-content" style="max-width:480px;">
              <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
                <h3 style="margin:0;font-size:1.3rem;">${mccIcon('check', 16)} Approve Additional Work</h3>
                <button onclick="document.getElementById('additional-work-choice-modal').remove()" style="background:none;border:none;color:var(--text-muted);font-size:1.5rem;cursor:pointer;">&times;</button>
              </div>

              <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:16px;margin-bottom:20px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                  <span style="color:var(--text-secondary);">Additional Work</span>
                  <span style="font-weight:600;">${title}</span>
                </div>
                <div style="display:flex;justify-content:space-between;padding-top:8px;border-top:1px solid var(--border-subtle);">
                  <span style="color:var(--text-secondary);font-weight:600;">Amount</span>
                  <span style="font-size:1.2rem;font-weight:700;color:var(--accent-gold);">$${amount.toFixed(2)}</span>
                </div>
              </div>

              <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:20px;text-align:center;">
                Choose how you'd like to pay for this additional work:
              </p>

              <div style="display:flex;flex-direction:column;gap:12px;">
                <button class="btn btn-primary" onclick="document.getElementById('additional-work-choice-modal').remove(); openApproveAdditionalWorkCardModal('${workId}', '${title.replaceAll('\'', "\\'")}', ${amount}, '${packageId}')" style="width:100%;padding:16px;">
                  <span style="display:flex;align-items:center;justify-content:center;gap:8px;">
                    <span style="font-size:1.2rem;">${mccIcon('credit-card', 20)}</span>
                    <span>Pay In Full ($${amount.toFixed(2)})</span>
                  </span>
                </button>
                <button class="btn btn-secondary" onclick="document.getElementById('additional-work-choice-modal').remove(); openCrowdFundAdditionalWorkModal('${workId}', '${title.replaceAll('\'', "\\'")}', ${amount}, '${packageId}')" style="width:100%;padding:16px;border:2px solid var(--accent-blue);">
                  <span style="display:flex;align-items:center;justify-content:center;gap:8px;">
                    <span style="font-size:1.2rem;">${mccIcon('users', 20)}</span>
                    <span>Crowd Fund ($${amount.toFixed(2)})</span>
                  </span>
                  <div style="font-size:0.8rem;color:var(--accent-orange);margin-top:4px;">${mccIcon('clock', 16)} 2-hour payment window</div>
                </button>
              </div>
            </div>
          </div>
        `;
        document.body.insertAdjacentHTML('beforeend', choiceHtml);
        return;
      }

      openApproveAdditionalWorkCardModal(workId, title, amount, packageId);
    }

    function openApproveAdditionalWorkCardModal(workId, title, amount, packageId) {
      currentAdditionalWorkId = workId;
      currentAdditionalWorkAmount = amount;
      currentEscrowPackageId = packageId;
      
      document.getElementById('additional-work-title').textContent = title;
      document.getElementById('additional-work-amount').textContent = `$${amount.toFixed(2)}`;
      document.getElementById('additional-work-id').value = workId;
      document.getElementById('additional-work-package-id').value = packageId;
      
      document.getElementById('additional-work-card-errors').textContent = '';
      
      openModal('approve-additional-work-modal');
      
      setTimeout(() => {
        mountAdditionalWorkCardElement();
      }, 100);
    }

    function openCrowdFundAdditionalWorkModal(workId, title, amount, packageId) {
      const totalAmountCents = Math.round(amount * 100);
      const userEmail = currentUser?.email || '';
      const halfAmount = Math.floor(totalAmountCents / 2);
      const otherHalf = totalAmountCents - halfAmount;

      splitParticipantRows = [
        { email: userEmail, amount_cents: halfAmount, display_name: userProfile?.full_name || '', is_guest: false },
        { email: '', amount_cents: otherHalf, display_name: '', is_guest: false }
      ];

      const existingModal = document.getElementById('split-payment-modal');
      if (existingModal) existingModal.remove();

      const modalHtml = `
        <div id="split-payment-modal" class="modal active" style="z-index:10001;">
          <div class="modal-overlay" onclick="closeSplitModal()"></div>
          <div class="modal-content" style="max-width:560px;max-height:90vh;overflow-y:auto;">
            <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
              <h3 style="margin:0;font-size:1.3rem;">${mccIcon('users', 16)} Crowd Fund Additional Work</h3>
              <button onclick="closeSplitModal()" style="background:none;border:none;color:var(--text-muted);font-size:1.5rem;cursor:pointer;">&times;</button>
            </div>

            <div style="background:var(--accent-orange-soft);border:1px solid rgba(251,146,60,0.3);border-radius:var(--radius-md);padding:12px 16px;margin-bottom:16px;">
              <div style="display:flex;align-items:center;gap:8px;color:var(--accent-orange);font-weight:600;">
                <span>${mccIcon('clock', 16)}</span>
                <span>Participants will have 2 hours to complete payment</span>
              </div>
            </div>

            <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:16px;margin-bottom:20px;">
              <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                <span style="color:var(--text-secondary);">Additional Work</span>
                <span style="font-weight:600;">${title}</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid var(--border-subtle);">
                <span style="color:var(--text-secondary);">Total Amount</span>
                <span style="font-size:1.3rem;font-weight:700;color:var(--accent-gold);">$${(totalAmountCents / 100).toFixed(2)}</span>
              </div>
            </div>

            <div id="split-participants-list"></div>

            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
              <button class="btn btn-ghost" onclick="addSplitParticipantRow(${totalAmountCents})">+ Add Participant</button>
              <div id="split-amount-status" style="font-size:0.9rem;"></div>
            </div>

            <div id="split-error" style="color:var(--accent-red);font-size:0.9rem;margin-bottom:16px;display:none;"></div>

            <button id="submit-split-btn" class="btn btn-primary" onclick="submitAdditionalWorkSplitPayment('${workId}', '${packageId}', ${totalAmountCents})" style="width:100%;">
              ${mccIcon('users', 16)} Create Crowd Fund (2hr Window)
            </button>
          </div>
        </div>
      `;

      document.body.insertAdjacentHTML('beforeend', modalHtml);
      renderSplitParticipantsList(totalAmountCents);
    }

    async function submitAdditionalWorkSplitPayment(workId, packageId, totalAmountCents) {
      const errorEl = document.getElementById('split-error');
      const btn = document.getElementById('submit-split-btn');

      for (const p of splitParticipantRows) {
        if (!p.email || !p.email.includes('@')) {
          errorEl.textContent = 'All participants must have a valid email address.';
          errorEl.style.display = 'block';
          return;
        }
        if (!p.amount_cents || p.amount_cents < 50) {
          errorEl.textContent = 'Each participant must pay at least $0.50.';
          errorEl.style.display = 'block';
          return;
        }
      }

      const currentTotal = splitParticipantRows.reduce((sum, p) => sum + p.amount_cents, 0);
      if (currentTotal !== totalAmountCents) {
        errorEl.textContent = `Amounts must total $${(totalAmountCents / 100).toFixed(2)}. Currently: $${(currentTotal / 100).toFixed(2)}`;
        errorEl.style.display = 'block';
        return;
      }

      const emails = splitParticipantRows.map(p => p.email.toLowerCase());
      const uniqueEmails = new Set(emails);
      if (uniqueEmails.size !== emails.length) {
        errorEl.textContent = 'Each participant must have a unique email address.';
        errorEl.style.display = 'block';
        return;
      }

      errorEl.style.display = 'none';
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:8px;"><span class="spinner"></span> Creating...</span>';
      }

      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const { data: { session } } = await supabaseClient.auth.getSession();
        const headers = { 'Content-Type': 'application/json' };
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }
        const response = await fetch(`${apiBase}/api/split/create-additional`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            additional_work_id: workId,
            participants: splitParticipantRows.map(p => ({
              email: p.email,
              amount_cents: p.amount_cents,
              display_name: p.display_name || undefined,
              is_guest: p.is_guest || false
            }))
          })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to create crowd fund payment');
        }

        closeSplitModal();
        showToast('Crowd fund payment created! Participants have 2 hours to pay.', 'success');

        await loadPackages();
        setTimeout(() => viewPackage(packageId), 300);

      } catch (err) {
        console.error('Crowd fund additional work creation error:', err);
        errorEl.textContent = err.message || 'Failed to create crowd fund payment. Please try again.';
        errorEl.style.display = 'block';
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = mccIcon('users', 16) + ' Create Crowd Fund (2hr Window)';
        }
      }
    }

    async function mountAdditionalWorkCardElement() {
      try {
        const stripe = await initStripe();
        if (!stripe) {
          console.error('Stripe not initialized');
          document.getElementById('additional-work-card-errors').textContent = 'Payment system unavailable. Please try again later.';
          return;
        }
        
        if (additionalWorkCardElement) {
          additionalWorkCardElement.destroy();
        }
        
        additionalWorkElements = stripe.elements({
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
        
        additionalWorkCardElement = additionalWorkElements.create('card', {
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
        
        additionalWorkCardElement.mount('#additional-work-card-element');
        
        additionalWorkCardElement.on('change', (event) => {
          const errorEl = document.getElementById('additional-work-card-errors');
          if (errorEl) {
            errorEl.textContent = event.error ? event.error.message : '';
          }
        });
      } catch (err) {
        console.error('Error mounting card element:', err);
        document.getElementById('additional-work-card-errors').textContent = 'Failed to load payment form. Please refresh the page.';
      }
    }

    async function confirmApproveAdditionalWork() {
      const workId = document.getElementById('additional-work-id').value;
      const packageId = document.getElementById('additional-work-package-id').value;
      const btn = document.getElementById('approve-additional-work-btn');
      const errorEl = document.getElementById('additional-work-card-errors');
      
      if (!additionalWorkCardElement) {
        errorEl.textContent = 'Payment form not loaded. Please refresh the page.';
        return;
      }
      
      const originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:8px;"><span class="spinner"></span> Processing...</span>';
      errorEl.textContent = '';
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        
        const response = await fetch(`/api/additional-work/${workId}/approve`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {})
          }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'Failed to approve additional work');
        }
        
        if (!data.client_secret) {
          throw new Error('Failed to create payment. Please try again.');
        }
        
        const stripe = await initStripe();
        const { error, paymentIntent } = await stripe.confirmCardPayment(data.client_secret, {
          payment_method: {
            card: additionalWorkCardElement,
          }
        });
        
        if (error) {
          throw new Error(error.message);
        }
        
        if (paymentIntent.status === 'requires_capture' || paymentIntent.status === 'succeeded') {
          const confirmResponse = await fetch(`/api/additional-work/${workId}/confirm-authorization`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {})
            }
          });
          
          const confirmData = await confirmResponse.json();
          
          if (!confirmResponse.ok) {
            throw new Error(confirmData.error || 'Failed to confirm authorization');
          }
          
          closeModal('approve-additional-work-modal');
          showToast('Additional work approved! Payment authorized.', 'success');
          
          if (additionalWorkCardElement) {
            additionalWorkCardElement.destroy();
            additionalWorkCardElement = null;
          }
          
          await loadPackages();
          setTimeout(() => viewPackage(packageId), 300);
        } else {
          throw new Error('Payment authorization failed. Please try again.');
        }
        
      } catch (err) {
        console.error('Additional work approval error:', err);
        errorEl.textContent = err.message || 'Failed to approve. Please try again.';
        showToast(err.message || 'Failed to approve additional work.', 'error');
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    }

    async function declineAdditionalWork(workId, packageId) {
      const note = prompt('Optional: Add a note explaining why you\'re declining this additional work:');
      
      if (!confirm('Are you sure you want to decline this additional work request?\n\nThe provider will be notified of your decision.')) {
        return;
      }
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        
        const response = await fetch(`/api/additional-work/${workId}/decline`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {})
          },
          body: JSON.stringify({ note: note || null })
        });
        
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to decline additional work');
        }
        
        showToast('Additional work declined. Provider has been notified.', 'success');
        
        await loadPackages();
        setTimeout(() => viewPackage(packageId), 300);
        
      } catch (err) {
        console.error('Error declining additional work:', err);
        showToast(err.message || 'Failed to decline. Please try again.', 'error');
      }
    }

    async function acceptDiscount(discountId, packageId) {
      if (!confirm('Accept this discount offer?\n\nThis will reduce your final payment amount.')) {
        return;
      }
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        
        const response = await fetch(`/api/discount/${discountId}/accept`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {})
          }
        });
        
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to accept discount');
        }
        
        showToast('Discount accepted! Your payment has been updated.', 'success');
        
        await loadPackages();
        setTimeout(() => viewPackage(packageId), 300);
        
      } catch (err) {
        console.error('Error accepting discount:', err);
        showToast(err.message || 'Failed to accept discount. Please try again.', 'error');
      }
    }

    async function renderEscrowPaymentSection(pkg, bids) {
      if (!pkg) return '';
      
      const acceptedBid = bids?.find(b => b.status === 'accepted');
      
      if (pkg.status === 'pending_split_payment') {
        return await renderSplitPaymentStatus(pkg, acceptedBid);
      }
      
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
      
      // Determine payment status
      const paymentStatus = paymentData?.status || 'awaiting_payment';
      
      // Load additional work requests and discounts for packages with held payments
      let additionalWorkHtml = '';
      let discountsHtml = '';
      if (paymentStatus === 'held' || paymentStatus === 'authorized' || pkg.status === 'in_progress') {
        try {
          const [additionalWork, discounts] = await Promise.all([
            loadPackageAdditionalWork(pkg.id),
            loadPackageDiscounts(pkg.id)
          ]);
          additionalWorkHtml = renderAdditionalWorkSection(pkg.id, additionalWork, paymentStatus, pkg.crowd_funded);
          discountsHtml = renderDiscountsSection(pkg.id, discounts);
        } catch (e) {
          console.log('Could not load additional work/discounts:', e);
        }
      }
      
      let statusBadge = '';
      let statusColor = '';
      let statusIcon = '';
      
      switch(paymentStatus) {
        case 'held':
        case 'authorized':
          statusBadge = 'Payment Authorized';
          statusColor = 'var(--accent-blue)';
          statusIcon = mccIcon('lock', 16);
          break;
        case 'released':
        case 'completed':
          statusBadge = 'Payment Released';
          statusColor = 'var(--accent-green)';
          statusIcon = mccIcon('check', 16);
          break;
        case 'refunded':
          statusBadge = 'Payment Refunded';
          statusColor = 'var(--accent-orange)';
          statusIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>';
          break;
        case 'disputed':
          statusBadge = 'Payment Disputed';
          statusColor = 'var(--accent-red)';
          statusIcon = mccIcon('alert-triangle', 16);
          break;
        default:
          statusBadge = 'Awaiting Payment';
          statusColor = 'var(--accent-orange)';
          statusIcon = mccIcon('credit-card', 16);
      }
      
      // Payment already released or completed
      if (paymentStatus === 'released' || paymentStatus === 'completed') {
        return `
          <div class="form-section" id="escrow-payment-section-${pkg.id}">
            <div class="form-section-title">${mccIcon('credit-card', 24)} Payment</div>
            <div style="background:var(--accent-green-soft);border:1px solid rgba(52,211,153,0.3);border-radius:var(--radius-lg);padding:20px;">
              <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                <span style="font-size:1.5rem;">${mccIcon('check', 24)}</span>
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
            <div class="form-section-title">${mccIcon('credit-card', 24)} Payment</div>
            <div style="background:var(--accent-blue-soft);border:1px solid rgba(56,189,248,0.3);border-radius:var(--radius-lg);padding:20px;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
                <div style="display:flex;align-items:center;gap:12px;">
                  <span style="font-size:1.5rem;">${mccIcon('lock', 24)}</span>
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
              </div>
              
              <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:16px;">
                ${mccIcon('lightbulb', 16)} Payment will be released to the provider when you confirm the work is complete.
              </p>
              
              ${showReleaseButton ? `
                <button class="btn btn-success" onclick="openReleasePaymentModal('${pkg.id}')" style="width:100%;">
                  ${mccIcon('check', 16)} Confirm Complete & Release Payment
                </button>
              ` : ''}
            </div>
          </div>
          ${additionalWorkHtml}
          ${discountsHtml}
        `;
      }
      
      // Awaiting payment - show card form with mobile pay options
      return `
        <div class="form-section" id="escrow-payment-section-${pkg.id}">
          <div class="form-section-title">${mccIcon('credit-card', 24)} Authorize Payment</div>
          <div style="background:var(--accent-orange-soft);border:1px solid rgba(251,146,60,0.3);border-radius:var(--radius-lg);padding:20px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
              <div style="display:flex;align-items:center;gap:12px;">
                <span style="font-size:1.5rem;">${mccIcon('credit-card', 24)}</span>
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
            </div>
            
            <!-- Mobile Pay Buttons (Apple Pay / Google Pay) -->
            <div id="mobile-pay-buttons-${pkg.id}" style="display:none;margin-bottom:16px;">
              <button id="apple-pay-btn-${pkg.id}" class="apple-pay-button" onclick="authorizeWithApplePay('${pkg.id}', '${acceptedBid?.id}', ${amount})" style="display:none;width:100%;height:48px;background:#000;border:none;border-radius:8px;cursor:pointer;margin-bottom:12px;">
                <span style="display:flex;align-items:center;justify-content:center;gap:8px;color:#fff;font-size:16px;font-weight:500;">
                  <svg width="20" height="24" viewBox="0 0 20 24" fill="white" style="margin-top:-2px;">
                    <path d="M14.94 5.19A4.38 4.38 0 0 0 16 2.06a4.44 4.44 0 0 0-2.91 1.49A4.17 4.17 0 0 0 12 6.54a3.71 3.71 0 0 0 2.94-1.35zm1.68 2.81c-1.68.09-3.12.94-3.95.94s-2.05-.89-3.38-.87a5 5 0 0 0-4.27 2.57c-1.82 3.14-.47 7.79 1.31 10.34.87 1.26 1.9 2.67 3.26 2.62 1.31-.05 1.8-.84 3.38-.84s2 .84 3.38.81 2.3-1.26 3.17-2.53a11.08 11.08 0 0 0 1.43-2.94 4.52 4.52 0 0 1-2.72-4.13 4.65 4.65 0 0 1 2.22-3.9 4.77 4.77 0 0 0-3.83-1.07z"/>
                  </svg>
                  Pay
                </span>
              </button>
              <button id="google-pay-btn-${pkg.id}" class="google-pay-button" onclick="authorizeWithGooglePay('${pkg.id}', '${acceptedBid?.id}', ${amount})" style="display:none;width:100%;height:48px;background:#000;border:none;border-radius:8px;cursor:pointer;margin-bottom:12px;">
                <span style="display:flex;align-items:center;justify-content:center;gap:8px;color:#fff;font-size:16px;font-weight:500;">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Pay
                </span>
              </button>
              <div id="mobile-pay-divider-${pkg.id}" style="display:none;text-align:center;color:var(--text-muted);font-size:0.85rem;margin:16px 0;">or pay with card</div>
            </div>
            
            <div id="card-payment-section-${pkg.id}">
              <div style="margin-bottom:20px;">
                <label style="display:block;margin-bottom:8px;font-size:0.9rem;color:var(--text-secondary);">Card Details</label>
                <div id="escrow-card-element-${pkg.id}" style="background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:14px;min-height:44px;"></div>
                <div id="escrow-card-errors-${pkg.id}" style="color:var(--accent-red);font-size:0.85rem;margin-top:8px;"></div>
              </div>
            </div>
            
            <div style="background:var(--bg-input);border-radius:var(--radius-md);padding:12px;margin-bottom:20px;">
              <div style="display:flex;align-items:center;gap:8px;color:var(--text-secondary);font-size:0.85rem;">
                <span>${mccIcon('lock', 16)}</span>
                <span>Your payment is secured. Funds are held in escrow and only released when you confirm the work is complete.</span>
              </div>
            </div>
            
            <button id="authorize-payment-btn-${pkg.id}" class="btn btn-primary" onclick="authorizeEscrowPayment('${pkg.id}', '${acceptedBid?.id}')" style="width:100%;margin-bottom:12px;">
              ${mccIcon('lock', 16)} Authorize Payment ($${amount.toFixed(2)})
            </button>
            <button class="btn btn-secondary" onclick="openSplitPaymentModal('${pkg.id}', ${Math.round(amount * 100)})" style="width:100%;">
              ${mccIcon('users', 16)} Split Payment ($${amount.toFixed(2)})
            </button>
          </div>
        </div>
        
        <script>
          (function() {
            setTimeout(() => {
              mountEscrowCardElement('${pkg.id}');
              initMobilePayButtons('${pkg.id}');
            }, 100);
          })();
        </script>
      `;
    }

    async function renderCheckinQRSection(pkg) {
      if (!pkg) return '';
      
      // Only show for packages with payment held and not yet checked in
      const payment = packagePaymentStatuses[pkg.id];
      const paymentHeld = payment && (payment.status === 'held' || payment.status === 'authorized') && !payment.escrow_captured;
      const isInProgress = pkg.status === 'in_progress';
      const isAccepted = pkg.status === 'accepted';
      const isCheckedIn = !!pkg.checked_in_at;
      
      // Show QR section when payment is held OR package is in progress, and not yet checked in
      if ((!paymentHeld && !isInProgress && !isAccepted) || isCheckedIn) {
        return '';
      }
      
      // If already checked in, show completed status
      if (isCheckedIn) {
        return `
          <div class="form-section" id="checkin-qr-section-${pkg.id}">
            <div class="form-section-title">${mccIcon('map-pin', 24)} Provider Check-in</div>
            <div style="background:var(--accent-green-soft);border:1px solid rgba(52,211,153,0.3);border-radius:var(--radius-lg);padding:20px;text-align:center;">
              <span style="font-size:2rem;display:block;margin-bottom:12px;">${mccIcon('check-circle', 16)}</span>
              <div style="font-weight:600;color:var(--accent-green);font-size:1.1rem;margin-bottom:8px;">Checked In</div>
              <div style="color:var(--text-secondary);font-size:0.9rem;">
                You checked in at ${new Date(pkg.checked_in_at).toLocaleString()}
              </div>
            </div>
          </div>
        `;
      }
      
      return `
        <div class="form-section" id="checkin-qr-section-${pkg.id}">
          <div class="form-section-title">${mccIcon('smartphone', 24)} Check-in at Provider Location</div>
          <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:20px;">
            <div id="checkin-qr-content-${pkg.id}">
              <div style="text-align:center;padding:20px;">
                <div class="spinner" style="margin:0 auto 12px;"></div>
                <div style="color:var(--text-muted);font-size:0.9rem;">Loading check-in QR code...</div>
              </div>
            </div>
          </div>
        </div>
        <script>
          (function() {
            setTimeout(() => {
              loadCheckinQRCode('${pkg.id}');
            }, 100);
          })();
        </script>
      `;
    }

    async function loadCheckinQRCode(packageId) {
      const container = document.getElementById(`checkin-qr-content-${packageId}`);
      if (!container) return;
      
      try {
        // Check for existing token
        const response = await fetch(`/api/package/${packageId}/checkin-token`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${(await supabaseClient.auth.getSession()).data.session?.access_token}`
          }
        });
        
        const data = await response.json();
        
        if (data.token && data.expires_at && new Date(data.expires_at) > new Date()) {
          // Valid token exists, show QR code
          renderCheckinQRDisplay(packageId, data.token, data.expires_at);
        } else {
          // No valid token, show generate button
          renderGenerateQRButton(packageId);
        }
      } catch (error) {
        console.error('Error loading check-in token:', error);
        renderGenerateQRButton(packageId);
      }
    }

    function renderGenerateQRButton(packageId) {
      const container = document.getElementById(`checkin-qr-content-${packageId}`);
      if (!container) return;
      
      container.innerHTML = `
        <div style="text-align:center;padding:20px;">
          <div style="font-size:3rem;margin-bottom:16px;">${mccIcon('smartphone', 40)}</div>
          <h4 style="margin-bottom:12px;font-size:1.1rem;">Ready to Check In?</h4>
          <p style="color:var(--text-secondary);margin-bottom:20px;font-size:0.9rem;max-width:300px;margin-left:auto;margin-right:auto;">
            Generate a QR code to show when you arrive at the service provider. This confirms your arrival and starts the service.
          </p>
          <button class="btn btn-primary" onclick="generateCheckinQRCode('${packageId}')" id="generate-qr-btn-${packageId}">
            ${mccIcon('smartphone', 16)} Generate Check-in QR Code
          </button>
        </div>
      `;
    }

    async function generateCheckinQRCode(packageId) {
      const btn = document.getElementById(`generate-qr-btn-${packageId}`);
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:8px;"><span class="spinner"></span> Generating...</span>';
      }
      
      try {
        const response = await fetch(`/api/package/${packageId}/generate-checkin-token`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${(await supabaseClient.auth.getSession()).data.session?.access_token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error('Failed to generate check-in token');
        }
        
        const data = await response.json();
        renderCheckinQRDisplay(packageId, data.token, data.expires_at);
        showToast('QR code generated! Show this when you arrive.', 'success');
      } catch (error) {
        console.error('Error generating check-in token:', error);
        showToast('Failed to generate QR code. Please try again.', 'error');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = mccIcon('smartphone', 16) + ' Generate Check-in QR Code';
        }
      }
    }

    function renderCheckinQRDisplay(packageId, token, expiresAt) {
      const container = document.getElementById(`checkin-qr-content-${packageId}`);
      if (!container) return;
      
      const baseUrl = window.location.origin;
      const checkinUrl = `${baseUrl}/check-in.html?package=${packageId}&token=${token}`;
      const expiryDate = new Date(expiresAt);
      const timeRemaining = getCheckinTimeRemaining(expiresAt);
      
      container.innerHTML = `
        <div style="text-align:center;">
          <div style="background:white;padding:16px;border-radius:var(--radius-md);display:inline-block;margin-bottom:16px;">
            <canvas id="checkin-qr-canvas-${packageId}" style="display:block;"></canvas>
          </div>
          <h4 style="margin-bottom:8px;font-size:1.1rem;">Show this QR Code on Arrival</h4>
          <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:16px;max-width:280px;margin-left:auto;margin-right:auto;">
            The provider will scan this code to confirm your vehicle drop-off and start the service.
          </p>
          <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:16px;">
            <span style="color:var(--accent-orange);font-size:0.85rem;font-weight:500;">${mccIcon('clock', 16)} Valid for ${timeRemaining}</span>
          </div>
          <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:16px;">
            Expires: ${expiryDate.toLocaleString()}
          </div>
          <button class="btn btn-ghost btn-sm" onclick="refreshCheckinQRCode('${packageId}')">
            ${mccIcon('refresh-cw', 16)} Generate New QR Code
          </button>
        </div>
      `;
      
      // Generate QR code using the qrcode library
      const canvas = document.getElementById(`checkin-qr-canvas-${packageId}`);
      if (canvas && typeof QRCode !== 'undefined') {
        QRCode.toCanvas(canvas, checkinUrl, {
          width: 200,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#ffffff'
          }
        }, function(error) {
          if (error) {
            console.error('Error generating QR code:', error);
            // Fallback to quickchart.io
            container.querySelector('div').innerHTML = `
              <img src="https://quickchart.io/qr?text=${encodeURIComponent(checkinUrl)}&size=200&margin=2" 
                   alt="Check-in QR Code" 
                   style="width:200px;height:200px;">
            `;
          }
        });
      } else {
        // Fallback to quickchart.io if QRCode library not available
        container.querySelector('div').innerHTML = `
          <img src="https://quickchart.io/qr?text=${encodeURIComponent(checkinUrl)}&size=200&margin=2" 
               alt="Check-in QR Code" 
               style="width:200px;height:200px;border-radius:var(--radius-sm);">
        `;
      }
    }

    function getCheckinTimeRemaining(expiresAt) {
      const now = new Date();
      const expiry = new Date(expiresAt);
      const diff = expiry - now;
      
      if (diff <= 0) return 'Expired';
      
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      
      if (hours > 24) {
        const days = Math.floor(hours / 24);
        return `${days} day${days > 1 ? 's' : ''}`;
      }
      if (hours > 0) return `${hours}h ${minutes}m`;
      return `${minutes} minutes`;
    }

    async function refreshCheckinQRCode(packageId) {
      const container = document.getElementById(`checkin-qr-content-${packageId}`);
      if (container) {
        container.innerHTML = `
          <div style="text-align:center;padding:20px;">
            <div class="spinner" style="margin:0 auto 12px;"></div>
            <div style="color:var(--text-muted);font-size:0.9rem;">Generating new QR code...</div>
          </div>
        `;
      }
      await generateCheckinQRCode(packageId);
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
          btn.innerHTML = `${mccIcon('lock', 16)} Authorize Payment ($${amount.toFixed(2)})`;
        }
      }
    }

    async function initMobilePayButtons(packageId) {
      const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
      
      if (!isNative) {
        return;
      }

      const isIOS = Capacitor.getPlatform() === 'ios';
      const isAndroid = Capacitor.getPlatform() === 'android';
      const container = document.getElementById(`mobile-pay-buttons-${packageId}`);
      const divider = document.getElementById(`mobile-pay-divider-${packageId}`);
      
      if (!container) return;

      let showContainer = false;

      if (isIOS && typeof MobilePay !== 'undefined') {
        const available = await MobilePay.isApplePayAvailable();
        const btn = document.getElementById(`apple-pay-btn-${packageId}`);
        if (btn && available) {
          btn.style.display = 'block';
          showContainer = true;
        }
      }

      if (isAndroid && typeof MobilePay !== 'undefined') {
        const available = await MobilePay.isGooglePayAvailable();
        const btn = document.getElementById(`google-pay-btn-${packageId}`);
        if (btn && available) {
          btn.style.display = 'block';
          showContainer = true;
        }
      }

      if (showContainer) {
        container.style.display = 'block';
        if (divider) divider.style.display = 'block';
      }
    }

    async function authorizeWithApplePay(packageId, bidId, amount) {
      const btn = document.getElementById(`apple-pay-btn-${packageId}`);
      const errorEl = document.getElementById(`escrow-card-errors-${packageId}`);
      
      try {
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = '<span style="color:#fff;">Processing...</span>';
        }

        if (typeof MobilePay === 'undefined') {
          throw new Error('Mobile payment not available');
        }

        const result = await MobilePay.requestApplePay(amount, 'My Car Concierge - Escrow Payment');
        
        if (result.success && result.paymentMethodId) {
          const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
          const response = await fetch(`${apiBase}/api/escrow/create-with-payment-method`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              package_id: packageId,
              bid_id: bidId,
              payment_method_id: result.paymentMethodId,
              wallet_type: 'apple_pay'
            })
          });
          
          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || 'Failed to create payment');
          }

          await confirmEscrowHeld(packageId);
          showToast('Payment authorized with Apple Pay! Funds are now held in escrow.', 'success');
          
          await loadPackages();
          setTimeout(() => viewPackage(packageId), 300);
        } else if (result.error && result.error !== 'Payment cancelled') {
          throw new Error(result.error);
        }
      } catch (err) {
        console.error('Apple Pay error:', err);
        if (errorEl) errorEl.textContent = err.message || 'Apple Pay failed. Please try card payment.';
        showToast(err.message || 'Apple Pay failed. Please try card payment.', 'error');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = `<span style="display:flex;align-items:center;justify-content:center;gap:8px;color:#fff;font-size:16px;font-weight:500;">
            <svg width="20" height="24" viewBox="0 0 20 24" fill="white" style="margin-top:-2px;">
              <path d="M14.94 5.19A4.38 4.38 0 0 0 16 2.06a4.44 4.44 0 0 0-2.91 1.49A4.17 4.17 0 0 0 12 6.54a3.71 3.71 0 0 0 2.94-1.35zm1.68 2.81c-1.68.09-3.12.94-3.95.94s-2.05-.89-3.38-.87a5 5 0 0 0-4.27 2.57c-1.82 3.14-.47 7.79 1.31 10.34.87 1.26 1.9 2.67 3.26 2.62 1.31-.05 1.8-.84 3.38-.84s2 .84 3.38.81 2.3-1.26 3.17-2.53a11.08 11.08 0 0 0 1.43-2.94 4.52 4.52 0 0 1-2.72-4.13 4.65 4.65 0 0 1 2.22-3.9 4.77 4.77 0 0 0-3.83-1.07z"/>
            </svg>
            Pay
          </span>`;
        }
      }
    }

    async function authorizeWithGooglePay(packageId, bidId, amount) {
      const btn = document.getElementById(`google-pay-btn-${packageId}`);
      const errorEl = document.getElementById(`escrow-card-errors-${packageId}`);
      
      try {
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = '<span style="color:#fff;">Processing...</span>';
        }

        if (typeof MobilePay === 'undefined') {
          throw new Error('Mobile payment not available');
        }

        const result = await MobilePay.requestGooglePay(amount, 'My Car Concierge - Escrow Payment');
        
        if (result.success && result.paymentMethodId) {
          const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
          const response = await fetch(`${apiBase}/api/escrow/create-with-payment-method`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              package_id: packageId,
              bid_id: bidId,
              payment_method_id: result.paymentMethodId,
              wallet_type: 'google_pay'
            })
          });
          
          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || 'Failed to create payment');
          }

          await confirmEscrowHeld(packageId);
          showToast('Payment authorized with Google Pay! Funds are now held in escrow.', 'success');
          
          await loadPackages();
          setTimeout(() => viewPackage(packageId), 300);
        } else if (result.error && result.error !== 'Payment cancelled') {
          throw new Error(result.error);
        }
      } catch (err) {
        console.error('Google Pay error:', err);
        if (errorEl) errorEl.textContent = err.message || 'Google Pay failed. Please try card payment.';
        showToast(err.message || 'Google Pay failed. Please try card payment.', 'error');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = `<span style="display:flex;align-items:center;justify-content:center;gap:8px;color:#fff;font-size:16px;font-weight:500;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Pay
          </span>`;
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
        await supabaseClient.rpc('member_release_payment', { p_package_id: packageId });

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

        if (pkg?.vehicle_id && typeof invalidatePredictionsForVehicle === 'function') {
          invalidatePredictionsForVehicle(pkg.vehicle_id);
        }

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

    let currentReviewPackageId = null;
    let currentReviewProviderId = null;

    async function openReviewModal(packageId, providerId, providerName, serviceTitle, amount) {
      if (!providerId && packageId) {
        const pkg = packages.find(p => p.id === packageId);
        if (pkg?.accepted_bid_id) {
          try {
            const { data: bid } = await supabaseClient.from('bids')
              .select('provider_id, price, profiles(business_name, full_name)')
              .eq('id', pkg.accepted_bid_id)
              .single();
            if (bid) {
              providerId = bid.provider_id;
              providerName = bid.profiles?.business_name || bid.profiles?.full_name;
              serviceTitle = pkg.title;
              amount = bid.price;
            }
          } catch (e) {
            console.error('Error looking up bid info:', e);
          }
        }
      }

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
      const overallRating = Number.parseInt(document.querySelector('.star-rating[data-type="overall"]').dataset.value) || 5;
      const qualityRating = Number.parseInt(document.querySelector('.star-rating[data-type="quality"]').dataset.value) || 5;
      const communicationRating = Number.parseInt(document.querySelector('.star-rating[data-type="communication"]').dataset.value) || 5;
      const timelinessRating = Number.parseInt(document.querySelector('.star-rating[data-type="timeliness"]').dataset.value) || 5;
      const valueRating = Number.parseInt(document.querySelector('.star-rating[data-type="value"]').dataset.value) || 5;
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

    const aiMediationCache = {};

    async function requestAiMediation(packageId) {
      const btn = document.getElementById(`ai-mediation-btn-${packageId}`);
      const resultDiv = document.getElementById(`ai-mediation-result-${packageId}`);
      if (!btn || !resultDiv) return;

      if (aiMediationCache[packageId]) {
        renderMediationResult(packageId, aiMediationCache[packageId]);
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Analyzing evidence...';

      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const resp = await fetch(`${apiBase}/api/packages/${packageId}/ai-mediation`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }
        });

        if (!resp.ok) throw new Error('Failed to generate mediation');

        const data = await resp.json();
        if (data.mediation) {
          aiMediationCache[packageId] = data.mediation;
          renderMediationResult(packageId, data.mediation);
        }
      } catch (e) {
        showToast('Could not generate AI mediation. Please try again or contact support.', 'error');
        btn.disabled = false;
        btn.innerHTML = `${mccIcon('search', 14)} Review with AI`;
      }
    }

    function renderMediationResult(packageId, mediation) {
      const resultDiv = document.getElementById(`ai-mediation-result-${packageId}`);
      const actionsDiv = document.getElementById(`ai-mediation-actions-${packageId}`);
      if (!resultDiv) return;

      const confidenceColors = {
        high: { bg: 'rgba(46,204,113,0.12)', color: 'var(--accent-green)' },
        medium: { bg: 'rgba(241,196,15,0.12)', color: 'var(--accent-amber, #f59e0b)' },
        low: { bg: 'rgba(231,76,60,0.12)', color: 'var(--accent-red)' }
      };
      const cc = confidenceColors[mediation.confidence] || confidenceColors.low;

      const discrepancyList = (mediation.discrepancies && mediation.discrepancies.length > 0)
        ? mediation.discrepancies.map(d => `<li style="margin-bottom:4px;">${sanitizeText(d)}</li>`).join('')
        : '<li style="color:var(--text-muted);">No discrepancies found</li>';

      resultDiv.style.display = 'block';
      resultDiv.innerHTML = `
        <div style="border-radius:var(--radius-md);padding:16px;background:var(--bg-input);margin-bottom:12px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
            <span style="font-weight:600;font-size:0.92rem;">AI Assessment</span>
            <span style="font-size:0.72rem;padding:2px 8px;border-radius:100px;background:${cc.bg};color:${cc.color};font-weight:600;">${(mediation.confidence || 'low').toUpperCase()} confidence</span>
            ${mediation.created_at ? `<span style="font-size:0.75rem;color:var(--text-muted);margin-left:auto;">${new Date(mediation.created_at).toLocaleDateString()}</span>` : ''}
          </div>
          <div style="margin-bottom:12px;">
            <div style="font-weight:500;font-size:0.85rem;margin-bottom:4px;color:var(--text-secondary);">Summary</div>
            <p style="font-size:0.9rem;line-height:1.5;margin:0;">${sanitizeText(mediation.summary)}</p>
          </div>
          <div style="margin-bottom:12px;">
            <div style="font-weight:500;font-size:0.85rem;margin-bottom:4px;color:var(--text-secondary);">Discrepancies Noted</div>
            <ul style="font-size:0.88rem;margin:0;padding-left:18px;line-height:1.5;">${discrepancyList}</ul>
          </div>
          <div style="padding:12px;background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.2);border-radius:var(--radius-md);">
            <div style="font-weight:500;font-size:0.85rem;margin-bottom:4px;color:var(--accent-blue);">Recommendation</div>
            <p style="font-size:0.9rem;line-height:1.5;margin:0;">${sanitizeText(mediation.recommendation)}</p>
          </div>
          <p style="font-size:0.78rem;color:var(--text-muted);margin-top:10px;margin-bottom:0;">This is an advisory AI assessment only. It does not automatically affect payment or dispute outcomes. <a href="mailto:support@mycarconcierge.com?subject=Package ${packageId} - Support Request" style="color:var(--accent-blue);text-decoration:underline;">Contact Support</a> for human review.</p>
        </div>
      `;

      if (actionsDiv) {
        actionsDiv.innerHTML = `<a href="mailto:support@mycarconcierge.com?subject=Package ${packageId} - Support Request" style="font-size:0.85rem;color:var(--accent-blue);text-decoration:underline;">Contact Support for further assistance</a>`;
      }
    }

    async function loadCachedMediation(packageId) {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const resp = await fetch(`${apiBase}/api/packages/${packageId}/ai-mediation`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });

        if (!resp.ok) return;

        const data = await resp.json();
        if (data.mediation) {
          aiMediationCache[packageId] = data.mediation;
          renderMediationResult(packageId, data.mediation);
        }
      } catch (e) {}
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
        await supabaseClient.rpc('member_mark_payment_disputed', { p_payment_id: payment.id });
      }

      closeModal('dispute-modal');
      showToast('Dispute submitted. Our team will review and contact you within 24-48 hours.', 'success');
      await loadPackages();
    }

    function openRefundModal(packageId, escrowAmount) {
      const amountDollars = (escrowAmount || 0).toFixed(2);
      const modalHtml = `
        <div class="modal-backdrop active" id="refund-request-modal" onclick="if(event.target===this)closeModal('refund-request-modal')">
          <div class="modal" style="max-width:500px;">
            <div class="modal-header">
              <h2>${mccIcon('dollar-sign', 16)} Request Refund</h2>
              <button class="modal-close" onclick="closeModal('refund-request-modal')">${mccIcon('x', 16)}</button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label>Refund Type</label>
                <select id="refund-type-select" class="form-select" onchange="toggleRefundAmountField()">
                  <option value="full">Full Refund ($${amountDollars})</option>
                  <option value="partial">Partial Refund</option>
                </select>
              </div>
              <div class="form-group" id="refund-amount-group" style="display:none;">
                <label>Refund Amount ($)</label>
                <input type="number" id="refund-amount-input" class="form-input" min="0.01" max="${amountDollars}" step="0.01" placeholder="Enter amount">
              </div>
              <div class="form-group">
                <label>Reason for Refund</label>
                <textarea id="refund-reason-input" class="form-input" rows="3" placeholder="Please explain why you're requesting a refund..."></textarea>
              </div>
              <div style="display:flex;gap:12px;margin-top:20px;">
                <button class="btn btn-primary" onclick="submitRefundRequest('${packageId}', ${escrowAmount})">Submit Refund Request</button>
                <button class="btn btn-secondary" onclick="closeModal('refund-request-modal')">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      `;
      const existing = document.getElementById('refund-request-modal');
      if (existing) existing.remove();
      document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    function toggleRefundAmountField() {
      const refundType = document.getElementById('refund-type-select').value;
      document.getElementById('refund-amount-group').style.display = refundType === 'partial' ? 'block' : 'none';
    }

    async function submitRefundRequest(packageId, escrowAmount) {
      const refundType = document.getElementById('refund-type-select').value;
      const reason = document.getElementById('refund-reason-input').value.trim();
      
      if (!reason) {
        showToast('Please provide a reason for the refund', 'error');
        return;
      }
      
      let amountCents = null;
      if (refundType === 'partial') {
        const amountDollars = Number.parseFloat(document.getElementById('refund-amount-input').value);
        if (!amountDollars || amountDollars <= 0) {
          showToast('Please enter a valid refund amount', 'error');
          return;
        }
        if (amountDollars > escrowAmount) {
          showToast('Refund amount cannot exceed the payment amount', 'error');
          return;
        }
        amountCents = Math.round(amountDollars * 100);
      }
      
      if (!confirm(`Are you sure you want to request a ${refundType} refund?${refundType === 'partial' ? ` ($${(amountCents / 100).toFixed(2)})` : ''}`)) return;
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          showToast('Please log in again', 'error');
          return;
        }
        
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const body = { reason, refund_type: refundType };
        if (amountCents) body.amount_cents = amountCents;
        
        const response = await fetch(`${apiBase}/api/escrow/refund/${packageId}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });
        
        const result = await response.json();
        
        if (result.success) {
          closeModal('refund-request-modal');
          closeModal('view-package-modal');
          showToast(result.message || 'Refund request submitted successfully!', 'success');
          await loadPackages();
        } else {
          showToast(result.error || 'Failed to process refund', 'error');
        }
      } catch (err) {
        console.error('Refund request error:', err);
        showToast('Error submitting refund request', 'error');
      }
    }

    async function requestRefund(packageId) {
      const pkg = packages.find(p => p.id === packageId);
      if (pkg) {
        openRefundModal(packageId, pkg.escrow_amount || 0);
      } else {
        showToast('Package not found', 'error');
      }
    }


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
            <div class="empty-state-icon">${mccIcon('car', 40)}</div>
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
          airport: mccIcon('send', 16),
          dealership: mccIcon('store', 16),
          detailing: mccIcon('sparkles', 16),
          valet: mccIcon('key', 16)
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
        
        const icon = serviceIcons[service.service_type] || mccIcon('car', 16);
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
            <span style="font-size:20px;">${mccIcon('user', 20)}</span>
            <div>
              <div style="font-size:0.85rem;font-weight:500;color:var(--accent-blue);">Driver: ${service.driver_name}</div>
              ${service.driver_phone ? `<div style="font-size:0.78rem;color:var(--text-muted);">${mccIcon('phone', 16)} ${service.driver_phone}</div>` : ''}
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
                    ${isCompleted ? mccIcon('check', 16) : (idx + 1)}
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
              ${['en_route', 'in_progress'].includes(service.status) && service.tracking_url ? `<a href="${service.tracking_url}" target="_blank" class="btn btn-primary">${mccIcon('map-pin', 16)} Track Driver</a>` : ''}
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
        airport: mccIcon('send', 16) + ' Airport Pickup/Drop-off',
        dealership: mccIcon('store', 16) + ' Dealership Service Run',
        detailing: mccIcon('sparkles', 16) + ' Mobile Detailing',
        valet: mccIcon('key', 16) + ' Valet Service'
      };
      
      const buttonLabels = {
        airport: mccIcon('send', 16) + ' Book Airport Service',
        dealership: mccIcon('store', 16) + ' Schedule Dealership Run',
        detailing: mccIcon('sparkles', 16) + ' Book Detail Service',
        valet: mccIcon('key', 16) + ' Book Valet Service'
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
      
      const serviceIcons = { airport: mccIcon('send', 16), dealership: mccIcon('store', 16), detailing: mccIcon('sparkles', 16), valet: mccIcon('key', 16) };
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
        { status: 'pending', label: 'Pending', icon: mccIcon('file-text', 16) },
        { status: 'assigned', label: 'Assigned', icon: mccIcon('user', 16) },
        { status: 'en_route', label: 'En Route', icon: mccIcon('car', 16) },
        { status: 'in_progress', label: 'In Progress', icon: mccIcon('settings', 16) },
        { status: 'completed', label: 'Completed', icon: mccIcon('check-circle', 16) }
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
                  ${isCompleted ? mccIcon('check', 16) : step.icon}
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
              <div style="width:60px;height:60px;border-radius:50%;background:var(--accent-blue);display:flex;align-items:center;justify-content:center;font-size:24px;">${mccIcon('user', 24)}</div>
              <div>
                <div style="font-weight:600;">${service.driver_name || 'Driver Assigned'}</div>
                ${service.driver_phone ? `<div style="color:var(--text-muted);">${mccIcon('phone', 16)} ${service.driver_phone}</div>` : ''}
              </div>
              ${service.driver_phone ? `<button class="btn btn-secondary" onclick="window.open('tel:${service.driver_phone}')" style="margin-left:auto;">${mccIcon('phone', 16)} Contact</button>` : ''}
            </div>
          </div>
        ` : ''}
        
        ${['en_route', 'in_progress'].includes(service.status) && service.tracking_url ? `
          <a href="${service.tracking_url}" target="_blank" class="btn btn-primary" style="width:100%;padding:16px;font-size:1.1rem;">
            ${mccIcon('map-pin', 16)} Track Driver in Real-Time
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
      const yearNum = Number.parseInt(year) || 0;
      
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
        btn.innerHTML = content.classList.contains('expanded') ? mccIcon('x', 16) + ' Close' : '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg> What is this?';
      }
    }

    function getEducationHtml(code) {
      const edu = maintenanceEducation[code];
      if (!edu) return '';
      
      const difficultyLabels = { easy: mccIcon('check-circle', 16) + ' DIY-Friendly', moderate: mccIcon('clock', 16) + ' Moderate DIY', professional: mccIcon('circle-alert', 16) + ' Professional Recommended' };
      
      const highMileageSection = edu.highMileageNote ? `
            <div class="edu-section" style="background:var(--accent-gold-soft);border-radius:var(--radius-sm);padding:12px;margin-top:8px;">
              <div class="edu-section-title" style="color:var(--accent-gold);">${mccIcon('car', 16)} High-Mileage & Professional Drivers</div>
              <div class="edu-section-text">${edu.highMileageNote}</div>
            </div>` : '';
      
      return `
        <button class="edu-toggle-btn" id="edu-btn-${code}" onclick="event.stopPropagation(); toggleMaintenanceEducation('${code}')"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg> What is this?</button>
        <div class="edu-content" id="edu-content-${code}">
          <div class="edu-card">
            <div class="edu-section">
              <div class="edu-section-title">${mccIcon('file-text', 16)} What is it?</div>
              <div class="edu-section-text">${edu.whatIsIt}</div>
            </div>
            <div class="edu-section">
              <div class="edu-section-title">${mccIcon('alert-triangle', 16)} Why it matters</div>
              <div class="edu-section-text">${edu.whyMatters}</div>
            </div>
            <div class="edu-section">
              <div class="edu-section-title">${mccIcon('circle-alert', 16)} Warning signs if skipped</div>
              <div class="edu-section-text">${edu.warningSignsIfSkipped}</div>
            </div>
            <div class="edu-section">
              <div class="edu-section-title">${mccIcon('wrench', 16)} DIY Difficulty</div>
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
        { code: 'oil_synthetic', name: 'Oil & Filter Change', icon: mccIcon('fuel', 16), category: 'fluids', base_mileage_interval: vehicleClass === 'european' ? 10000 : 7500, base_months_interval: 12, priority: 'critical', high_mileage_multiplier: 0.75, notes: 'Full synthetic oil recommended' },
        { code: 'tire_rotation', name: 'Tire Rotation', icon: mccIcon('refresh-cw', 16), category: 'tires', base_mileage_interval: 6000, base_months_interval: 6, priority: 'recommended', high_mileage_multiplier: 1.0, notes: 'Promotes even tire wear' },
        { code: 'engine_air_filter', name: 'Engine Air Filter', icon: mccIcon('fuel', 16), category: 'filters', base_mileage_interval: 25000, base_months_interval: 24, priority: 'recommended', high_mileage_multiplier: 0.8, notes: 'Replace sooner in dusty conditions' },
        { code: 'cabin_air_filter', name: 'Cabin Air Filter', icon: mccIcon('fuel', 16), category: 'filters', base_mileage_interval: 20000, base_months_interval: 18, priority: 'recommended', high_mileage_multiplier: 0.85, notes: 'Keeps interior air clean' },
        { code: 'brake_fluid', name: 'Brake Fluid Flush', icon: mccIcon('circle-alert', 16), category: 'fluids', base_mileage_interval: 0, base_months_interval: 24, priority: 'critical', high_mileage_multiplier: 0.85, notes: 'Replace every 2-3 years regardless of mileage' },
        { code: 'transmission_fluid', name: 'Transmission Fluid', icon: mccIcon('settings', 16), category: 'fluids', base_mileage_interval: 60000, base_months_interval: 48, priority: 'recommended', high_mileage_multiplier: 0.75, notes: 'Critical for transmission longevity' },
        { code: 'coolant_flush', name: 'Coolant Flush', icon: mccIcon('sparkles', 16), category: 'fluids', base_mileage_interval: 50000, base_months_interval: 48, priority: 'recommended', high_mileage_multiplier: 0.8, notes: 'Prevents overheating and corrosion' },
        { code: 'spark_plugs', name: 'Spark Plugs', icon: mccIcon('zap', 16), category: 'engine', base_mileage_interval: vehicleClass === 'asian' ? 100000 : 60000, base_months_interval: vehicleClass === 'asian' ? 84 : 60, priority: 'recommended', high_mileage_multiplier: 0.9, notes: vehicleClass === 'asian' ? 'Iridium plugs - extended interval' : 'Check manufacturer specs' },
        { code: 'carbon_cleaning', name: 'Carbon Cleaning (Walnut Blasting)', icon: mccIcon('settings', 16), category: 'engine', base_mileage_interval: vehicleClass === 'european' ? 50000 : 70000, base_months_interval: 60, priority: 'recommended', high_mileage_multiplier: 0.8, notes: 'Critical for direct injection engines - removes carbon buildup from intake valves' },
        { code: 'fuel_system_cleaning', name: 'Fuel System Cleaning', icon: mccIcon('fuel', 16), category: 'engine', base_mileage_interval: 30000, base_months_interval: 30, priority: 'recommended', high_mileage_multiplier: 0.85, notes: 'Cleans fuel injectors and intake for optimal performance' },
        { code: 'throttle_body_service', name: 'Throttle Body Service', icon: mccIcon('wrench', 16), category: 'engine', base_mileage_interval: 60000, base_months_interval: 48, priority: 'recommended', high_mileage_multiplier: 0.85, notes: 'Clean throttle body for smooth idle and response' },
        { code: 'brake_pads_front', name: 'Front Brake Pads', icon: mccIcon('circle-alert', 16), category: 'brakes', base_mileage_interval: 40000, base_months_interval: 36, priority: 'critical', high_mileage_multiplier: 0.85, notes: 'Inspect regularly for wear' },
        { code: 'brake_pads_rear', name: 'Rear Brake Pads', icon: mccIcon('circle-alert', 16), category: 'brakes', base_mileage_interval: 50000, base_months_interval: 48, priority: 'critical', high_mileage_multiplier: 0.85, notes: 'Usually last longer than front' },
        { code: 'battery_check', name: 'Battery Inspection', icon: mccIcon('zap', 16), category: 'electrical', base_mileage_interval: 12000, base_months_interval: 12, priority: 'recommended', high_mileage_multiplier: 1.0, notes: 'Test and clean terminals' },
        { code: 'wiper_blades', name: 'Wiper Blades', icon: mccIcon('sparkles', 16), category: 'electrical', base_mileage_interval: 15000, base_months_interval: 12, priority: 'recommended', high_mileage_multiplier: 1.0, notes: 'Replace when streaking' },
        { code: 'wheel_alignment', name: 'Wheel Alignment', icon: mccIcon('target', 16), category: 'tires', base_mileage_interval: 25000, base_months_interval: 24, priority: 'recommended', high_mileage_multiplier: 0.9, notes: 'Check if pulling or uneven tire wear' },
        { code: 'serpentine_belt', name: 'Serpentine Belt', icon: mccIcon('link', 16), category: 'engine', base_mileage_interval: 60000, base_months_interval: 60, priority: 'recommended', high_mileage_multiplier: 0.85, notes: 'Inspect for cracks and wear' },
        { code: 'timing_belt', name: 'Timing Belt/Chain', icon: mccIcon('link', 16), category: 'engine', base_mileage_interval: 90000, base_months_interval: 84, priority: 'critical', high_mileage_multiplier: 0.9, notes: 'Critical! Failure causes major engine damage' },
        { code: 'multi_point_inspection', name: 'Multi-Point Inspection', icon: mccIcon('clipboard-list', 16), category: 'other', base_mileage_interval: 15000, base_months_interval: 12, priority: 'recommended', high_mileage_multiplier: 1.0, notes: 'Comprehensive vehicle check' }
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
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${mccIcon('check-circle', 40)}</div><p>No items match this filter.</p></div>`;
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
              ${item.status !== 'up-to-date' ? `<button class="btn btn-sm btn-primary" onclick="postMaintenanceRequest('${item.code}', '${item.name.replaceAll('\'', "\\'")}')">Post Request</button>` : ''}
            </div>
          </div>
          ${item.notes ? `<div style="font-size:0.8rem;color:var(--text-muted);margin-top:8px;padding-top:8px;border-top:1px solid var(--border-subtle);">${mccIcon('lightbulb', 16)} ${item.notes}</div>` : ''}
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
      const mileage = Number.parseInt(input.value);
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
      const mileage = Number.parseInt(document.getElementById('log-service-mileage').value);
      const performedBy = document.getElementById('log-service-by').value.trim();
      const cost = Number.parseFloat(document.getElementById('log-service-cost').value) || null;
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


    const estimatorServiceData = {
      maintenance: {
        name: 'Maintenance', icon: mccIcon('wrench', 16),
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
        name: 'Repairs', icon: mccIcon('wrench', 16),
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
        name: 'Detailing', icon: mccIcon('sparkles', 16),
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
        name: 'Body Work', icon: mccIcon('car', 16),
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
        name: 'Inspection', icon: mccIcon('search', 16),
        services: [
          { name: 'Pre-Purchase Inspection', hasTiers: false, prices: { domestic: { low: 100, avg: 150, high: 250 }, asian: { low: 100, avg: 150, high: 250 }, european: { low: 150, avg: 225, high: 375 } }},
          { name: 'State Inspection', hasTiers: false, prices: { domestic: { low: 20, avg: 35, high: 75 }, asian: { low: 20, avg: 35, high: 75 }, european: { low: 30, avg: 50, high: 100 } }},
          { name: 'Multi-Point Inspection', hasTiers: false, prices: { domestic: { low: 50, avg: 80, high: 150 }, asian: { low: 50, avg: 80, high: 150 }, european: { low: 75, avg: 120, high: 225 } }}
        ]
      },
      diagnostic: {
        name: 'Diagnostics', icon: mccIcon('bar-chart', 16),
        services: [
          { name: 'Check Engine Light Diagnosis', hasTiers: false, prices: { domestic: { low: 80, avg: 120, high: 180 }, asian: { low: 90, avg: 135, high: 200 }, european: { low: 120, avg: 180, high: 270 } }},
          { name: 'Electrical Diagnosis', hasTiers: false, prices: { domestic: { low: 100, avg: 175, high: 300 }, asian: { low: 110, avg: 190, high: 330 }, european: { low: 150, avg: 260, high: 450 } }},
          { name: 'Transmission Diagnosis', hasTiers: false, prices: { domestic: { low: 120, avg: 200, high: 350 }, asian: { low: 130, avg: 220, high: 385 }, european: { low: 180, avg: 300, high: 525 } }},
          { name: 'Engine Performance Diagnosis', hasTiers: false, prices: { domestic: { low: 100, avg: 175, high: 300 }, asian: { low: 110, avg: 190, high: 330 }, european: { low: 150, avg: 260, high: 450 } }}
        ]
      },
      ev_hybrid: {
        name: 'EV & Hybrid', icon: mccIcon('zap', 16),
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
        name: 'Protection', icon: mccIcon('shield', 16),
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
        name: 'Engine & Performance', icon: mccIcon('settings', 16),
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
        btn.innerHTML = content.classList.contains('expanded') ? mccIcon('x', 16) + ' Hide' : '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg> Why this matters';
      }
    }

    function getServiceEducationHtml(serviceName) {
      const edu = serviceEducation[serviceName];
      if (!edu) return '';
      
      return `
        <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border-subtle);">
          <button class="edu-toggle-btn" id="service-edu-btn" onclick="toggleServiceEducation()"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg> Why this matters</button>
          <div class="edu-content" id="service-edu-content">
            <div class="edu-card">
              <div class="edu-section">
                <div class="edu-section-title">${mccIcon('alert-triangle', 16)} Why this matters</div>
                <div class="edu-section-text">${edu.whyMatters}</div>
              </div>
              ${edu.tip ? `
              <div class="edu-section">
                <div class="edu-section-title">${mccIcon('lightbulb', 16)} Pro tip</div>
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
              <div style="font-size:1.5rem;margin-bottom:8px;">${mccIcon('car', 24)}</div>
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
        factors.push(`<li>${mccIcon('car', 16)} <strong>European vehicles</strong> typically cost 40-50% more due to specialized parts and labor</li>`);
      } else if (estimate.vehicleClass === 'asian') {
        factors.push(`<li>${mccIcon('car', 16)} <strong>Asian vehicles</strong> have competitive pricing with widely available parts</li>`);
      } else if (estimate.vehicleClass === 'electric') {
        factors.push(`<li>${mccIcon('zap', 16)} <strong>Electric vehicles</strong> require specialized technicians and equipment</li>`);
      } else {
        factors.push(`<li>${mccIcon('car', 16)} <strong>Domestic vehicles</strong> have the most competitive pricing with readily available parts</li>`);
      }
      
      if (estimate.region === 'west') {
        factors.push(`<li>${mccIcon('map-pin', 16)} <strong>West Coast</strong> labor rates are 15% above national average</li>`);
      } else if (estimate.region === 'northeast') {
        factors.push(`<li>${mccIcon('map-pin', 16)} <strong>Northeast</strong> labor rates are 8% above national average</li>`);
      } else if (estimate.region === 'midwest') {
        factors.push(`<li>${mccIcon('map-pin', 16)} <strong>Midwest</strong> labor rates are 5% below national average</li>`);
      } else if (estimate.region === 'south') {
        factors.push(`<li>${mccIcon('map-pin', 16)} <strong>South</strong> labor rates are 10% below national average</li>`);
      }
      
      if (estimate.tier) {
        if (estimate.tier === 'basic') {
          factors.push(`<li>${mccIcon('wrench', 16)} <strong>Basic tier</strong> uses standard/aftermarket parts</li>`);
        } else if (estimate.tier === 'premium') {
          factors.push(`<li>${mccIcon('wrench', 16)} <strong>Premium tier</strong> uses OEM/synthetic parts for longer life</li>`);
        }
      }
      
      factors.push(`<li>${mccIcon('lightbulb', 16)} Prices reflect industry benchmarks and may vary by provider</li>`);
      
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


    let splitParticipantRows = [];
    let currentSplitCardElement = null;
    let currentSplitElements = null;

    async function renderSplitPaymentStatus(pkg, acceptedBid) {
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      try {
        const response = await fetch(`${apiBase}/api/split/status/${pkg.id}`);
        if (!response.ok) {
          return '';
        }
        const data = await response.json();
        const { splitPayment, participants, creatorName, isCreator } = data;

        const paidCount = participants.filter(p => p.status === 'paid').length;
        const totalCount = participants.length;
        const progressPct = totalCount > 0 ? Math.round((paidCount / totalCount) * 100) : 0;

        const myParticipant = participants.find(p => p.member_id === currentUser?.id);

        let participantRows = participants.map(p => {
          const isMe = p.member_id === currentUser?.id;
          const statusColors = {
            'invited': 'var(--accent-orange)',
            'pending': 'var(--accent-blue)',
            'paid': 'var(--accent-green)',
            'partially_refunded': 'var(--accent-orange)',
            'refunded': 'var(--text-muted)',
            'failed': 'var(--accent-red)',
            'cancelled': 'var(--text-muted)'
          };
          const statusIcons = {
            'invited': mccIcon('mail', 16),
            'pending': mccIcon('clock', 16),
            'paid': mccIcon('check-circle', 16),
            'partially_refunded': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
            'refunded': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
            'failed': mccIcon('x', 16),
            'cancelled': mccIcon('x', 16)
          };
          return `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg-input);border-radius:var(--radius-md);margin-bottom:8px;${isMe ? 'border:1px solid var(--accent-gold);' : ''}">
              <div>
                <div style="font-weight:${isMe ? '600' : '400'};color:var(--text-primary);">${p.display_name || p.email}${isMe ? ' (You)' : ''}${!p.member_id && !isMe ? ' <span style="font-size:0.75rem;background:rgba(251,146,60,0.15);color:var(--accent-orange);padding:2px 6px;border-radius:4px;margin-left:6px;">Guest</span>' : ''}</div>
                <div style="font-size:0.85rem;color:var(--text-muted);">${p.email}</div>
              </div>
              <div style="text-align:right;">
                <div style="font-weight:600;color:var(--text-primary);">$${(p.amount_cents / 100).toFixed(2)}</div>
                <div style="font-size:0.85rem;color:${statusColors[p.status] || 'var(--text-muted)'};">${statusIcons[p.status] || ''} ${p.status.charAt(0).toUpperCase() + p.status.slice(1)}</div>
              </div>
            </div>
          `;
        }).join('');

        let actionButtons = '';
        if (myParticipant && myParticipant.status !== 'paid' && myParticipant.status !== 'cancelled' && splitPayment.status === 'pending') {
          actionButtons += `<button class="btn btn-primary" onclick="paySplitShare('${myParticipant.id}', '${pkg.id}')" style="width:100%;margin-bottom:12px;">${mccIcon('credit-card', 16)} Pay My Share ($${(myParticipant.amount_cents / 100).toFixed(2)})</button>`;
        }
        if (isCreator && splitPayment.status === 'pending') {
          actionButtons += `<button class="btn btn-danger" onclick="cancelSplitPayment('${splitPayment.id}')" style="width:100%;">${mccIcon('x', 16)} Cancel Split Payment</button>`;
        }
        if (isCreator && (splitPayment.status === 'expired' || splitPayment.status === 'cancelled')) {
          actionButtons += `<button class="btn btn-primary" onclick="reactivateSplitPayment('${splitPayment.id}', ${splitPayment.total_amount_cents})" style="width:100%;margin-bottom:12px;">${mccIcon('refresh-cw', 16)} Reactivate & Update Participants</button>`;
        }

        return `
          <div class="form-section" id="split-payment-section-${pkg.id}">
            <div class="form-section-title">${mccIcon('users', 24)} Split Payment</div>
            <div style="background:var(--accent-blue-soft);border:1px solid rgba(56,189,248,0.3);border-radius:var(--radius-lg);padding:20px;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
                <div>
                  <div style="font-weight:600;color:var(--accent-blue);font-size:1.1rem;">Split Payment ${splitPayment.status === 'complete' ? 'Complete' : splitPayment.status === 'expired' ? 'Expired' : splitPayment.status === 'cancelled' ? 'Cancelled' : 'In Progress'}</div>
                  <div style="color:var(--text-secondary);font-size:0.9rem;">Created by ${creatorName}</div>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:1.4rem;font-weight:700;color:var(--text-primary);">$${(splitPayment.total_amount_cents / 100).toFixed(2)}</div>
                  <div style="color:var(--text-muted);font-size:0.85rem;">${paidCount}/${totalCount} paid</div>
                </div>
              </div>

              <div style="background:var(--bg-card);border-radius:var(--radius-md);height:8px;margin-bottom:16px;overflow:hidden;">
                <div style="height:100%;width:${progressPct}%;background:var(--accent-green);border-radius:var(--radius-md);transition:width 0.3s;"></div>
              </div>

              <div style="margin-bottom:16px;">
                ${participantRows}
              </div>

              ${splitPayment.expires_at ? `<div id="split-countdown-${pkg.id}" data-expires="${splitPayment.expires_at}" style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:16px;margin-bottom:16px;text-align:center;">
                <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:8px;">Time Remaining</div>
                <div style="display:flex;justify-content:center;gap:12px;">
                  <div style="text-align:center;">
                    <div id="split-cd-hours-${pkg.id}" style="font-size:1.8rem;font-weight:700;color:var(--accent-blue);font-variant-numeric:tabular-nums;min-width:48px;">--</div>
                    <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;">Hours</div>
                  </div>
                  <div style="font-size:1.8rem;font-weight:700;color:var(--text-muted);">:</div>
                  <div style="text-align:center;">
                    <div id="split-cd-mins-${pkg.id}" style="font-size:1.8rem;font-weight:700;color:var(--accent-blue);font-variant-numeric:tabular-nums;min-width:48px;">--</div>
                    <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;">Minutes</div>
                  </div>
                  <div style="font-size:1.8rem;font-weight:700;color:var(--text-muted);">:</div>
                  <div style="text-align:center;">
                    <div id="split-cd-secs-${pkg.id}" style="font-size:1.8rem;font-weight:700;color:var(--accent-blue);font-variant-numeric:tabular-nums;min-width:48px;">--</div>
                    <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;">Seconds</div>
                  </div>
                </div>
                <div id="split-cd-bar-${pkg.id}" style="margin-top:12px;background:var(--bg-elevated);border-radius:4px;height:4px;overflow:hidden;">
                  <div id="split-cd-fill-${pkg.id}" style="height:100%;background:var(--accent-blue);border-radius:4px;transition:width 1s linear;"></div>
                </div>
              </div>
              <script>
              (function() {
                const pkgId = '${pkg.id}';
                const expiresAt = new Date('${splitPayment.expires_at}').getTime();
                const totalDuration = new Date('${splitPayment.expires_at}').getTime() - new Date('${splitPayment.created_at || splitPayment.expires_at}').getTime() || 72 * 60 * 60 * 1000;
                function updateCountdown() {
                  const now = Date.now();
                  const remaining = expiresAt - now;
                  const container = document.getElementById('split-countdown-' + pkgId);
                  if (!container) return clearInterval(timer);
                  const hoursEl = document.getElementById('split-cd-hours-' + pkgId);
                  const minsEl = document.getElementById('split-cd-mins-' + pkgId);
                  const secsEl = document.getElementById('split-cd-secs-' + pkgId);
                  const fillEl = document.getElementById('split-cd-fill-' + pkgId);
                  if (remaining <= 0) {
                    if (hoursEl) hoursEl.textContent = '00';
                    if (minsEl) minsEl.textContent = '00';
                    if (secsEl) secsEl.textContent = '00';
                    if (fillEl) fillEl.style.width = '0%';
                    container.style.borderColor = 'var(--accent-red, #ef4444)';
                    var label = container.querySelector('div');
                    if (label) label.textContent = 'EXPIRED';
                    [hoursEl, minsEl, secsEl].forEach(function(el) { if (el) el.style.color = 'var(--accent-red, #ef4444)'; });
                    clearInterval(timer);
                    return;
                  }
                  var h = Math.floor(remaining / 3600000);
                  var m = Math.floor((remaining % 3600000) / 60000);
                  var s = Math.floor((remaining % 60000) / 1000);
                  if (hoursEl) hoursEl.textContent = h.toString().padStart(2, '0');
                  if (minsEl) minsEl.textContent = m.toString().padStart(2, '0');
                  if (secsEl) secsEl.textContent = s.toString().padStart(2, '0');
                  if (fillEl) fillEl.style.width = Math.max(0, (remaining / totalDuration) * 100) + '%';
                  if (remaining < 3600000) {
                    [hoursEl, minsEl, secsEl].forEach(function(el) { if (el) el.style.color = 'var(--accent-amber, #f59e0b)'; });
                    container.style.borderColor = 'var(--accent-amber, #f59e0b)';
                  }
                  if (remaining < 900000) {
                    [hoursEl, minsEl, secsEl].forEach(function(el) { if (el) el.style.color = 'var(--accent-red, #ef4444)'; });
                    container.style.borderColor = 'var(--accent-red, #ef4444)';
                  }
                }
                updateCountdown();
                var timer = setInterval(updateCountdown, 1000);
              })();
              </script>` : ''}

              <div id="split-pay-form-${pkg.id}"></div>

              ${actionButtons}
            </div>
          </div>
        `;
      } catch (err) {
        console.error('Error loading split payment status:', err);
        return '';
      }
    }

    function openSplitPaymentModal(packageId, totalAmountCents) {
      const userEmail = currentUser?.email || '';
      const halfAmount = Math.floor(totalAmountCents / 2);
      const otherHalf = totalAmountCents - halfAmount;

      splitParticipantRows = [
        { email: userEmail, amount_cents: halfAmount, display_name: userProfile?.full_name || '', is_guest: false },
        { email: '', amount_cents: otherHalf, display_name: '', is_guest: false }
      ];
      const modalHtml = `
        <div id="split-payment-modal" class="modal active" style="z-index:10001;">
          <div class="modal-overlay" onclick="closeSplitModal()"></div>
          <div class="modal-content" style="max-width:560px;max-height:90vh;overflow-y:auto;">
            <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
              <h3 style="margin:0;font-size:1.3rem;">${mccIcon('users', 16)} Split Payment</h3>
              <button onclick="closeSplitModal()" style="background:none;border:none;color:var(--text-muted);font-size:1.5rem;cursor:pointer;">&times;</button>
            </div>

            <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:16px;margin-bottom:20px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:var(--text-secondary);">Total Amount</span>
                <span style="font-size:1.3rem;font-weight:700;color:var(--accent-gold);">$${(totalAmountCents / 100).toFixed(2)}</span>
              </div>
            </div>

            <div id="split-participants-list"></div>

            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
              <button class="btn btn-ghost" onclick="addSplitParticipantRow(${totalAmountCents})">+ Add Participant</button>
              <div id="split-amount-status" style="font-size:0.9rem;"></div>
            </div>

            <div id="split-error" style="color:var(--accent-red);font-size:0.9rem;margin-bottom:16px;display:none;"></div>

            <button id="submit-split-btn" class="btn btn-primary" onclick="submitSplitPayment('${packageId}', ${totalAmountCents})" style="width:100%;">
              ${mccIcon('users', 16)} Create Split Payment
            </button>
          </div>
        </div>
      `;

      const existingModal = document.getElementById('split-payment-modal');
      if (existingModal) existingModal.remove();

      document.body.insertAdjacentHTML('beforeend', modalHtml);
      renderSplitParticipantsList(totalAmountCents);
    };

    window.submitSplitReactivation = async function(splitId, totalAmountCents) {
      const errorEl = document.getElementById('split-error');
      const btn = document.getElementById('submit-split-btn');

      for (const p of splitParticipantRows) {
        if (!p.email || !p.email.includes('@')) {
          errorEl.textContent = 'All participants must have a valid email address.';
          errorEl.style.display = 'block';
          return;
        }
        if (!p.amount_cents || p.amount_cents < 50) {
          errorEl.textContent = 'Each participant must pay at least $0.50.';
          errorEl.style.display = 'block';
          return;
        }
      }

      const currentTotal = splitParticipantRows.reduce((sum, p) => sum + p.amount_cents, 0);
      if (currentTotal !== totalAmountCents) {
        errorEl.textContent = `Amounts must total $${(totalAmountCents / 100).toFixed(2)}. Currently: $${(currentTotal / 100).toFixed(2)}`;
        errorEl.style.display = 'block';
        return;
      }

      const emails = splitParticipantRows.map(p => p.email.toLowerCase());
      const uniqueEmails = new Set(emails);
      if (uniqueEmails.size !== emails.length) {
        errorEl.textContent = 'Each participant must have a unique email address.';
        errorEl.style.display = 'block';
        return;
      }

      errorEl.style.display = 'none';
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:8px;"><span class="spinner"></span> Reactivating...</span>';
      }

      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/split/reactivate/${splitId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            participants: splitParticipantRows.map(p => ({
              email: p.email,
              amount_cents: p.amount_cents,
              display_name: p.display_name || undefined,
              is_guest: p.is_guest || false
            }))
          })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to reactivate split payment');
        }

        closeSplitModal();
        showToast('Split payment reactivated! Participants have been notified.', 'success');

        await loadPackages();
        if (currentViewPackage) {
          setTimeout(() => viewPackage(currentViewPackage), 300);
        }

      } catch (err) {
        console.error('Split payment reactivation error:', err);
        errorEl.textContent = err.message || 'Failed to reactivate split payment. Please try again.';
        errorEl.style.display = 'block';
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = mccIcon('refresh-cw', 16) + ' Reactivate Split Payment';
        }
      }
    };

    function closeSplitModal() {
      const modal = document.getElementById('split-payment-modal');
      if (modal) modal.remove();
    }

    window.reactivateSplitPayment = function(splitId, totalAmountCents) {
      const userEmail = currentUser?.email || '';
      const halfAmount = Math.floor(totalAmountCents / 2);
      const otherHalf = totalAmountCents - halfAmount;

      splitParticipantRows = [
        { email: userEmail, amount_cents: halfAmount, display_name: userProfile?.full_name || '', is_guest: false },
        { email: '', amount_cents: otherHalf, display_name: '', is_guest: false }
      ];

      const modalHtml = `
        <div id="split-payment-modal" class="modal active" style="z-index:10001;">
          <div class="modal-overlay" onclick="closeSplitModal()"></div>
          <div class="modal-content" style="max-width:560px;max-height:90vh;overflow-y:auto;">
            <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
              <h3 style="margin:0;font-size:1.3rem;">${mccIcon('refresh-cw', 16)} Reactivate Split Payment</h3>
              <button onclick="closeSplitModal()" style="background:none;border:none;color:var(--text-muted);font-size:1.5rem;cursor:pointer;">&times;</button>
            </div>

            <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:16px;margin-bottom:20px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:var(--text-secondary);">Total Amount</span>
                <span style="font-size:1.3rem;font-weight:700;color:var(--accent-gold);">$${(totalAmountCents / 100).toFixed(2)}</span>
              </div>
            </div>

            <div id="split-participants-list"></div>

            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
              <button class="btn btn-ghost" onclick="addSplitParticipantRow(${totalAmountCents})">+ Add Participant</button>
              <div id="split-amount-status" style="font-size:0.9rem;"></div>
            </div>

            <div id="split-error" style="color:var(--accent-red);font-size:0.9rem;margin-bottom:16px;display:none;"></div>

            <button id="submit-split-btn" class="btn btn-primary" onclick="submitSplitReactivation('${splitId}', ${totalAmountCents})" style="width:100%;">
              ${mccIcon('refresh-cw', 16)} Reactivate Split Payment
            </button>
          </div>
        </div>
      `;

      const existingModal = document.getElementById('split-payment-modal');
      if (existingModal) existingModal.remove();

      document.body.insertAdjacentHTML('beforeend', modalHtml);
      renderSplitParticipantsList(totalAmountCents);
    };

    window.submitSplitReactivation = async function(splitId, totalAmountCents) {
      const errorEl = document.getElementById('split-error');
      const btn = document.getElementById('submit-split-btn');

      for (const p of splitParticipantRows) {
        if (!p.email || !p.email.includes('@')) {
          errorEl.textContent = 'All participants must have a valid email address.';
          errorEl.style.display = 'block';
          return;
        }
        if (!p.amount_cents || p.amount_cents < 50) {
          errorEl.textContent = 'Each participant must pay at least $0.50.';
          errorEl.style.display = 'block';
          return;
        }
      }

      const currentTotal = splitParticipantRows.reduce((sum, p) => sum + p.amount_cents, 0);
      if (currentTotal !== totalAmountCents) {
        errorEl.textContent = `Amounts must total $${(totalAmountCents / 100).toFixed(2)}. Currently: $${(currentTotal / 100).toFixed(2)}`;
        errorEl.style.display = 'block';
        return;
      }

      const emails = splitParticipantRows.map(p => p.email.toLowerCase());
      const uniqueEmails = new Set(emails);
      if (uniqueEmails.size !== emails.length) {
        errorEl.textContent = 'Each participant must have a unique email address.';
        errorEl.style.display = 'block';
        return;
      }

      errorEl.style.display = 'none';
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:8px;"><span class="spinner"></span> Reactivating...</span>';
      }

      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/split/reactivate/${splitId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            participants: splitParticipantRows.map(p => ({
              email: p.email,
              amount_cents: p.amount_cents,
              display_name: p.display_name || undefined,
              is_guest: p.is_guest || false
            }))
          })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to reactivate split payment');
        }

        closeSplitModal();
        showToast('Split payment reactivated! Participants have been notified.', 'success');

        await loadPackages();
        if (currentViewPackage) {
          setTimeout(() => viewPackage(currentViewPackage), 300);
        }

      } catch (err) {
        console.error('Split payment reactivation error:', err);
        errorEl.textContent = err.message || 'Failed to reactivate split payment. Please try again.';
        errorEl.style.display = 'block';
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = mccIcon('refresh-cw', 16) + ' Reactivate Split Payment';
        }
      }
    };

    function renderSplitParticipantsList(totalAmountCents) {
      const container = document.getElementById('split-participants-list');
      if (!container) return;

      const userEmail = currentUser?.email || '';

      container.innerHTML = splitParticipantRows.map((row, i) => {
        const isCurrentUser = row.email.toLowerCase() === userEmail.toLowerCase();
        const isGuest = row.is_guest || false;
        return `
          <div style="background:var(--bg-elevated);border:1px solid ${isGuest ? 'rgba(251, 146, 60, 0.3)' : 'var(--border-subtle)'};border-radius:var(--radius-md);padding:16px;margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
              <span style="font-weight:500;color:var(--text-primary);">${isCurrentUser ? mccIcon('user', 16) + ' You' : isGuest ? mccIcon('link', 16) + ' Guest Payer' : `${mccIcon('user', 16)} Participant ${i + 1}`}</span>
              <div style="display:flex;align-items:center;gap:8px;">
                ${!isCurrentUser ? `
                  <button onclick="toggleSplitParticipantGuest(${i}, ${totalAmountCents})" style="background:${isGuest ? "rgba(251, 146, 60, 0.15)" : "var(--bg-input)"};border:1px solid ${isGuest ? "rgba(251, 146, 60, 0.3)" : "var(--border-subtle)"};border-radius:6px;padding:4px 10px;cursor:pointer;font-size:0.8rem;color:${isGuest ? "var(--accent-orange)" : "var(--text-muted)"};">${isGuest ? mccIcon("link", 16) + " Guest" : mccIcon("user", 16) + " Member"}</button>
                ` : ''}
              <input type="email" value="${row.email}" ${isCurrentUser ? 'readonly style="opacity:0.7;"' : ''} onchange="updateSplitParticipant(${i}, 'email', this.value)" style="width:100%;padding:10px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);color:var(--text-primary);font-size:0.95rem;box-sizing:border-box;" placeholder="email@example.com" />
            </div>
            <div style="margin-bottom:8px;">
              <label style="display:block;font-size:0.85rem;color:var(--text-muted);margin-bottom:4px;">Name${isGuest ? '' : ' (optional)'}</label>
              <input type="text" value="${row.display_name}" ${isCurrentUser ? 'readonly style="opacity:0.7;"' : ''} onchange="updateSplitParticipant(${i}, 'display_name', this.value)" style="width:100%;padding:10px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);color:var(--text-primary);font-size:0.95rem;box-sizing:border-box;" placeholder="${isGuest ? 'Guest name' : 'Display name'}" />
            </div>
            <div>
              <label style="display:block;font-size:0.85rem;color:var(--text-muted);margin-bottom:4px;">Amount ($)</label>
              <input type="number" step="0.01" min="0.50" value="${(row.amount_cents / 100).toFixed(2)}" onchange="updateSplitParticipantAmount(${i}, this.value, ${totalAmountCents})" style="width:100%;padding:10px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);color:var(--text-primary);font-size:0.95rem;box-sizing:border-box;" />
            </div>
          </div>
        `;
      }).join('');

      updateSplitAmountStatus(totalAmountCents);
    }

    function updateSplitParticipant(index, field, value) {
      if (splitParticipantRows[index]) {
        splitParticipantRows[index][field] = value;
      }
    }

    function toggleSplitParticipantGuest(index, totalAmountCents) {
      if (splitParticipantRows[index]) {
        splitParticipantRows[index].is_guest = !splitParticipantRows[index].is_guest;
        renderSplitParticipantsList(totalAmountCents);
      }
    }

    function updateSplitParticipantAmount(index, dollarValue, totalAmountCents) {
      if (splitParticipantRows[index]) {
        splitParticipantRows[index].amount_cents = Math.round(Number.parseFloat(dollarValue) * 100) || 0;
        renderSplitParticipantsList(totalAmountCents);
      }
    }

    function addSplitParticipantRow(totalAmountCents) {
      splitParticipantRows.push({ email: '', amount_cents: 0, display_name: '', is_guest: false });
      renderSplitParticipantsList(totalAmountCents);
    }

    function removeSplitParticipant(index, totalAmountCents) {
      splitParticipantRows.splice(index, 1);
      const statusEl = document.getElementById('split-amount-status');
      if (!statusEl) return;

      const currentTotal = splitParticipantRows.reduce((sum, p) => sum + (p.amount_cents || 0), 0);
      const remaining = totalAmountCents - currentTotal;

      if (remaining === 0) {
        statusEl.innerHTML = `<span style="color:var(--accent-green);">${mccIcon('check', 16)} Amounts match</span>`;
      } else if (remaining > 0) {
        statusEl.innerHTML = `<span style="color:var(--accent-orange);">$${(remaining / 100).toFixed(2)} remaining</span>`;
      } else {
        statusEl.innerHTML = `<span style="color:var(--accent-red);">$${(Math.abs(remaining) / 100).toFixed(2)} over</span>`;
      }
    }

    function splitEvenlyAmong(totalAmountCents) {
      const count = splitParticipantRows.length;
      if (count === 0) return;
      const each = Math.floor(totalAmountCents / count);
      const remainder = totalAmountCents - (each * count);
      splitParticipantRows.forEach((row, i) => {
        row.amount_cents = each + (i === 0 ? remainder : 0);
      });
      renderSplitParticipantsList(totalAmountCents);
    }

    async function submitSplitPayment(packageId, totalAmountCents) {
      const errorEl = document.getElementById('split-error');
      const btn = document.getElementById('submit-split-btn');

      for (const p of splitParticipantRows) {
        if (!p.email || !p.email.includes('@')) {
          errorEl.textContent = 'All participants must have a valid email address.';
          errorEl.style.display = 'block';
          return;
        }
        if (!p.amount_cents || p.amount_cents < 50) {
          errorEl.textContent = 'Each participant must pay at least $0.50.';
          errorEl.style.display = 'block';
          return;
        }
      }

      const currentTotal = splitParticipantRows.reduce((sum, p) => sum + p.amount_cents, 0);
      if (currentTotal !== totalAmountCents) {
        errorEl.textContent = `Amounts must total $${(totalAmountCents / 100).toFixed(2)}. Currently: $${(currentTotal / 100).toFixed(2)}`;
        errorEl.style.display = 'block';
        return;
      }

      const emails = splitParticipantRows.map(p => p.email.toLowerCase());
      const uniqueEmails = new Set(emails);
      if (uniqueEmails.size !== emails.length) {
        errorEl.textContent = 'Each participant must have a unique email address.';
        errorEl.style.display = 'block';
        return;
      }

      errorEl.style.display = 'none';
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:8px;"><span class="spinner"></span> Creating...</span>';
      }

      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/split/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            package_id: packageId,
            participants: splitParticipantRows.map(p => ({
              email: p.email,
              amount_cents: p.amount_cents,
              display_name: p.display_name || undefined,
              is_guest: p.is_guest || false
            }))
          })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to create split payment');
        }

        closeSplitModal();
        showToast('Split payment created! Participants have been notified.', 'success');

        await loadPackages();
        setTimeout(() => viewPackage(packageId), 300);

      } catch (err) {
        console.error('Split payment creation error:', err);
        errorEl.textContent = err.message || 'Failed to create split payment. Please try again.';
        errorEl.style.display = 'block';
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = mccIcon('users', 16) + ' Create Split Payment';
        }
      }
    }

    async function paySplitShare(participantId, packageId) {
      try {
        showToast('Preparing payment...', 'info');

        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/split/pay/${participantId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to initiate payment');
        }

        const stripeInstance = await initStripe();
        if (!stripeInstance) {
          throw new Error('Stripe not initialized. Please refresh the page.');
        }

        const pkg = packageId ? packages.find(p => p.id === packageId) : packages.find(p => p.status === 'pending_split_payment');
        const containerId = pkg ? `split-pay-form-${pkg.id}` : null;
        let container = containerId ? document.getElementById(containerId) : null;

        if (!container) {
          const modalHtml = `
            <div id="split-pay-modal" class="modal active" style="z-index:10001;">
              <div class="modal-overlay" onclick="closeSplitPayModal()"></div>
              <div class="modal-content" style="max-width:480px;">
                <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
                  <h3 style="margin:0;">${mccIcon('credit-card', 16)} Pay Your Share</h3>
                  <button onclick="closeSplitPayModal()" style="background:none;border:none;color:var(--text-muted);font-size:1.5rem;cursor:pointer;">&times;</button>
                </div>
                <div style="text-align:center;margin-bottom:20px;">
                  <div style="font-size:1.5rem;font-weight:700;color:var(--accent-gold);">$${(data.amountCents / 100).toFixed(2)}</div>
                </div>
                <div id="split-card-element" style="background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:14px;min-height:44px;margin-bottom:12px;"></div>
                <div id="split-card-errors" style="color:var(--accent-red);font-size:0.85rem;margin-bottom:16px;"></div>
                <button id="split-pay-btn" class="btn btn-primary" style="width:100%;" onclick="confirmSplitPayment('${participantId}')">
                  ${mccIcon('credit-card', 16)} Pay $${(data.amountCents / 100).toFixed(2)}
                </button>
              </div>
            </div>
          `;
          document.body.insertAdjacentHTML('beforeend', modalHtml);
        } else {
          container.innerHTML = `
            <div style="margin-top:16px;">
              <div id="split-card-element" style="background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:14px;min-height:44px;margin-bottom:12px;"></div>
              <div id="split-card-errors" style="color:var(--accent-red);font-size:0.85rem;margin-bottom:16px;"></div>
              <button id="split-pay-btn" class="btn btn-primary" style="width:100%;" onclick="confirmSplitPayment('${participantId}')">
                ${mccIcon('credit-card', 16)} Pay $${(data.amountCents / 100).toFixed(2)}
              </button>
            </div>
          `;
        }

        window._currentSplitClientSecret = data.clientSecret;
        window._currentSplitParticipantId = participantId;

        currentSplitElements = stripeInstance.elements({ clientSecret: data.clientSecret });
        currentSplitCardElement = currentSplitElements.create('card', {
          style: {
            base: {
              color: '#f5f5f7',
              fontFamily: 'Outfit, sans-serif',
              fontSize: '16px',
              '::placeholder': { color: '#6b7280' }
            },
            invalid: { color: '#f87171' }
          }
        });

        setTimeout(() => {
          const cardEl = document.getElementById('split-card-element');
          if (cardEl) {
            currentSplitCardElement.mount('#split-card-element');
          }
        }, 100);

      } catch (err) {
        console.error('Split pay error:', err);
        showToast(err.message || 'Failed to initiate payment', 'error');
      }
    }

    function closeSplitPayModal() {
      const modal = document.getElementById('split-pay-modal');
      if (modal) modal.remove();
      currentSplitCardElement = null;
      currentSplitElements = null;
    }

    async function confirmSplitPayment(participantId) {
      const btn = document.getElementById('split-pay-btn');
      const errorEl = document.getElementById('split-card-errors');

      if (!currentSplitCardElement || !window._currentSplitClientSecret) {
        if (errorEl) errorEl.textContent = 'Payment form not loaded. Please try again.';
        return;
      }

      try {
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:8px;"><span class="spinner"></span> Processing...</span>';
        }
        if (errorEl) errorEl.textContent = '';

        const stripeInstance = await initStripe();
        const { error, paymentIntent } = await stripeInstance.confirmCardPayment(window._currentSplitClientSecret, {
          payment_method: { card: currentSplitCardElement }
        });

        if (error) {
          throw new Error(error.message);
        }

        if (paymentIntent.status === 'succeeded') {
          const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
          const confirmResponse = await fetch(`${apiBase}/api/split/confirm/${participantId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });

          const confirmData = await confirmResponse.json();
          if (!confirmResponse.ok) {
            throw new Error(confirmData.error || 'Failed to confirm payment');
          }

          closeSplitPayModal();

          if (confirmData.splitComplete) {
            showToast('All shares paid! The service can now proceed.', 'success');
          } else {
            showToast('Your share has been paid successfully!', 'success');
          }

          await loadPackages();
          const pkg = packages.find(p => p.id === currentViewPackage);
          if (pkg) {
            setTimeout(() => viewPackage(pkg.id), 300);
          }
        } else {
          throw new Error('Payment did not succeed. Please try again.');
        }

      } catch (err) {
        console.error('Split payment confirmation error:', err);
        if (errorEl) errorEl.textContent = err.message || 'Payment failed. Please try again.';
        showToast(err.message || 'Payment failed', 'error');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = mccIcon('credit-card', 16) + ' Pay';
        }
      }
    }

    async function cancelSplitPayment(splitId) {
      if (!confirm('Cancel this split payment? Any paid participants will be refunded.')) return;

      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/split/cancel/${splitId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to cancel split payment');
        }

        showToast('Split payment cancelled. Refunds have been processed.', 'success');

        await loadPackages();
        if (currentViewPackage) {
          setTimeout(() => viewPackage(currentViewPackage), 300);
        }

      } catch (err) {
        console.error('Cancel split error:', err);
        showToast(err.message || 'Failed to cancel split payment', 'error');
      }
    }

    async function fetchPriceEstimate(category, zip, packageId) {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return null;

        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const params = new URLSearchParams({ category });
        if (zip) params.append('zip', zip);
        if (packageId) params.append('package_id', packageId);

        const response = await fetch(`${apiBase}/api/price-estimate?${params}`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });

        if (!response.ok) return null;
        return await response.json();
      } catch (err) {
        console.error('Price estimate fetch error:', err);
        return null;
      }
    }

    function renderPriceEstimateWidget(estimate) {
      if (!estimate) return '';

      if (!estimate.has_estimate) {
        return `
          <div class="price-estimate-widget" style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:20px;margin-bottom:16px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
              ${mccIcon('bar-chart', 20)}
              <h4 style="margin:0;font-size:1rem;">Market Price Estimate</h4>
            </div>
            <p style="color:var(--text-muted);font-size:0.9rem;margin:0;">${estimate.message}</p>
          </div>
        `;
      }

      return `
        <div class="price-estimate-widget" style="background:linear-gradient(135deg, rgba(56,189,248,0.08), rgba(52,211,153,0.08));border:1px solid rgba(56,189,248,0.25);border-radius:var(--radius-lg);padding:20px;margin-bottom:16px;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            ${mccIcon('bar-chart', 20)}
            <h4 style="margin:0;font-size:1rem;color:var(--text-primary);">Market Price Estimate</h4>
            <span style="margin-left:auto;font-size:0.72rem;color:var(--text-muted);background:var(--bg-input);padding:3px 8px;border-radius:100px;">Based on ${estimate.sample_size} bids</span>
          </div>
          <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px;">
            <span style="font-size:1.6rem;font-weight:700;color:var(--accent-blue);">$${estimate.low}–$${estimate.high}</span>
            <span style="font-size:0.88rem;color:var(--text-secondary);">is typical ${estimate.location_note}</span>
          </div>
          <div style="background:var(--bg-input);border-radius:var(--radius-sm);height:6px;margin-bottom:10px;position:relative;overflow:hidden;">
            <div style="position:absolute;left:25%;right:25%;height:100%;background:linear-gradient(90deg, var(--accent-blue), var(--accent-green));border-radius:3px;"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:0.78rem;color:var(--text-muted);margin-bottom:${estimate.context_note ? '10px' : '0'};">
            <span>Low: $${estimate.min}</span>
            <span>Median: $${estimate.median}</span>
            <span>High: $${estimate.max}</span>
          </div>
          ${estimate.context_note ? `<p style="font-size:0.82rem;color:var(--text-secondary);margin:0;font-style:italic;">${estimate.context_note}</p>` : ''}
        </div>
      `;
    }

    function getBidComparisonTag(bidPrice, estimate) {
      if (!estimate || !estimate.has_estimate) return '';

      let label, bgColor, textColor, icon;
      if (bidPrice < estimate.low) {
        label = 'Below estimate';
        bgColor = 'rgba(52,211,153,0.15)';
        textColor = 'var(--accent-green)';
        icon = mccIcon('chevron-down', 14);
      } else if (bidPrice > estimate.high) {
        label = 'Above estimate';
        bgColor = 'rgba(251,146,60,0.15)';
        textColor = 'var(--accent-orange)';
        icon = mccIcon('trending-up', 14);
      } else {
        label = 'In range';
        bgColor = 'rgba(56,189,248,0.15)';
        textColor = 'var(--accent-blue)';
        icon = mccIcon('check', 14);
      }

      return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:100px;font-size:0.7rem;font-weight:600;background:${bgColor};color:${textColor};border:1px solid ${textColor}30;margin-top:4px;">${icon} ${label}</span>`;
    }

    window.fetchPriceEstimate = fetchPriceEstimate;
    window.renderPriceEstimateWidget = renderPriceEstimateWidget;
    window.getBidComparisonTag = getBidComparisonTag;

    async function generateAppointmentDebrief(packageId) {
      const panel = document.getElementById(`debrief-panel-${packageId}`);
      const btn = document.getElementById(`debrief-btn-${packageId}`);
      if (!panel) return;

      if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
      panel.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:0.88rem;">AI is writing your service summary…</div>';

      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) { if (typeof showToast === 'function') showToast('Please log in again', 'error'); return; }

        const resp = await fetch('/api/ai/appointment-debrief', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({ package_id: packageId })
        });
        const data = await resp.json();

        if (data.summary) {
          panel.innerHTML = `
            <div style="padding:16px;background:linear-gradient(135deg,rgba(56,189,248,0.06),rgba(34,211,238,0.04));border:1px solid rgba(56,189,248,0.2);border-radius:var(--radius-md);">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
                <span style="font-size:0.78rem;font-weight:600;color:var(--accent-blue);">AI Service Summary</span>
                <span style="font-size:0.68rem;color:var(--text-muted);margin-left:auto;padding:2px 6px;background:var(--bg-input);border-radius:100px;">AI-generated</span>
              </div>
              <p style="font-size:0.9rem;color:var(--text-secondary);line-height:1.6;margin:0;">${data.summary.replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</p>
            </div>
          `;
        } else {
          panel.innerHTML = '<p style="font-size:0.85rem;color:var(--text-muted);">Could not generate summary. Please try again.</p>';
        }
      } catch (err) {
        panel.innerHTML = '<p style="font-size:0.85rem;color:var(--text-muted);">Error generating summary. Please try again.</p>';
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Regenerate Summary'; }
      }
    }

    async function showCounterSuggestion(bidId, triggerEl) {
      const panel = document.getElementById(`counter-panel-${bidId}`);
      if (!panel) return;

      triggerEl.disabled = true;
      triggerEl.textContent = 'Loading…';

      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        const resp = await fetch('/api/ai/counter-suggestion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({ bid_id: bidId })
        });
        const data = await resp.json();

        if (data.has_suggestion) {
          panel.innerHTML = `
            <div style="padding:14px 16px;background:rgba(251,146,60,0.06);border:1px solid rgba(251,146,60,0.25);border-radius:var(--radius-md);">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-orange)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                <span style="font-size:0.78rem;font-weight:600;color:var(--accent-orange);">Counter-Offer Suggestion</span>
              </div>
              <div style="font-size:1.1rem;font-weight:700;color:var(--accent-gold);margin-bottom:6px;">$${data.suggested_counter.toFixed(2)}</div>
              <p style="font-size:0.84rem;color:var(--text-secondary);line-height:1.5;margin:0;">${data.rationale?.replaceAll('<', '&lt;').replaceAll('>', '&gt;') || ''}</p>
              <div style="margin-top:8px;font-size:0.75rem;color:var(--text-muted);">Market range: $${data.market_low}–$${data.market_high}</div>
            </div>
          `;
        } else {
          panel.innerHTML = '';
        }
      } catch (err) {
        triggerEl.disabled = false;
        if (typeof showToast === 'function') showToast('Could not load suggestion. Try again.', 'error');
      }
    }

    window.generateAppointmentDebrief = generateAppointmentDebrief;
    window.showCounterSuggestion = showCounterSuggestion;
    window.askServiceHistoryChat = typeof askServiceHistoryChat !== 'undefined' ? askServiceHistoryChat : null;
    window.toggleBudgetForecast = typeof toggleBudgetForecast !== 'undefined' ? toggleBudgetForecast : null;
    window.loadBudgetForecast = typeof loadBudgetForecast !== 'undefined' ? loadBudgetForecast : null;

    function getBookingGuidance() {
      const stored = localStorage.getItem('mcc_booking_guidance');
      if (stored) return stored;
      if (typeof userProfile !== 'undefined' && userProfile?.booking_guidance) return userProfile.booking_guidance;
      return 'full';
    }

    function setBookingGuidance(level) {
      localStorage.setItem('mcc_booking_guidance', level);
      document.querySelectorAll('.guidance-tile').forEach(t => {
        t.setAttribute('data-active', t.getAttribute('data-value') === level ? 'true' : 'false');
      });
      applyGuidanceToOpenModal(level);
      if (typeof showToast === 'function') showToast('Booking assistance updated', 'success');
    }
    window.setBookingGuidance = setBookingGuidance;

    function applyGuidanceToOpenModal(level) {
      const panel = document.getElementById('service-suggestions-panel');
      const guidanceLink = document.getElementById('pkg-modal-guidance-link');
      const aiPanel = document.getElementById('ai-assistant-panel');
      const vehicleId = document.getElementById('p-vehicle')?.value;
      if (level === 'off') {
        if (panel) panel.style.display = 'none';
        if (aiPanel) aiPanel.style.display = 'none';
        if (guidanceLink) guidanceLink.style.display = 'block';
      } else if (level === 'suggestions_only') {
        if (aiPanel) aiPanel.style.display = 'none';
        if (guidanceLink) guidanceLink.style.display = 'none';
        if (vehicleId && panel) {
          document.getElementById('p-vehicle')?.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else {
        if (guidanceLink) guidanceLink.style.display = 'none';
        if (vehicleId && panel) {
          document.getElementById('p-vehicle')?.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }

    document.addEventListener('DOMContentLoaded', () => {
      if (!localStorage.getItem('mcc_booking_guidance') && typeof userProfile !== 'undefined' && userProfile?.booking_guidance) {
        localStorage.setItem('mcc_booking_guidance', userProfile.booking_guidance);
      }
      const level = getBookingGuidance();
      document.querySelectorAll('.guidance-tile').forEach(t => {
        t.setAttribute('data-active', t.getAttribute('data-value') === level ? 'true' : 'false');
      });
    });

    document.addEventListener('input', function(e) {
      if (e.target.id !== 'p-description') return;
      const guidance = getBookingGuidance();
      if (guidance !== 'full') {
        const panel = document.getElementById('ai-assistant-panel');
        if (panel) panel.style.display = 'none';
        return;
      }
    });

    function computeLocalRecommendations(vehicle) {
      const now = new Date();
      const recs = [];
      const mileage = vehicle.mileage || vehicle.current_mileage || 0;
      const services = [
        { field: 'last_oil_change_date', title: 'Oil Change', months: 6, urgentMonths: 9, category: 'maintenance', code: 'oil_synthetic' },
        { field: 'last_tire_rotation_date', title: 'Tire Rotation', months: 6, urgentMonths: 12, category: 'maintenance', code: 'tire_rotation' },
        { field: 'last_brake_service_date', title: 'Brake Inspection', months: 24, urgentMonths: 36, category: 'maintenance', code: 'brake_pads_front' },
        { field: 'last_transmission_service_date', title: 'Transmission Fluid Service', months: 48, urgentMonths: 60, category: 'maintenance', code: 'transmission_fluid', minMileage: 30000 },
        { field: 'last_coolant_flush_date', title: 'Coolant Flush', months: 48, urgentMonths: 60, category: 'maintenance', code: 'coolant_flush', minMileage: 50000 }
      ];

      for (const svc of services) {
        if (svc.minMileage && mileage > 0 && mileage < svc.minMileage) continue;
        const lastDate = vehicle[svc.field];
        if (!lastDate) {
          recs.push({
            title: svc.title,
            reason: 'No service history on file',
            category: svc.category,
            never_done: true,
            code: svc.code,
            priority: 1
          });
        } else {
          const last = new Date(lastDate);
          const monthsSince = (now - last) / (1000 * 60 * 60 * 24 * 30);
          if (monthsSince > svc.months) {
            recs.push({
              title: svc.title,
              reason: `Last done ${Math.floor(monthsSince)} months ago`,
              category: svc.category,
              never_done: false,
              code: svc.code,
              priority: monthsSince > svc.urgentMonths ? 2 : 3
            });
          }
        }
      }

      recs.sort((a, b) => a.priority - b.priority);
      return recs;
    }

    function renderSuggestionChips(recs, vehicleId) {
      const container = document.getElementById('suggestions-chips-container');
      if (!container) return;
      if (recs.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;text-align:center;padding:6px;">Your vehicle looks well-maintained! No urgent services detected.</div>';
        return;
      }
      container.innerHTML = recs.map((rec, i) => {
        const badgeColor = rec.never_done ? 'rgba(239,68,68,0.15)' : 'rgba(34,211,238,0.15)';
        const badgeTextColor = rec.never_done ? '#ef4444' : 'var(--accent-teal)';
        const badgeLabel = rec.never_done ? 'No record \u2014 assumed not yet done' : 'Overdue';
        const codeAttr = rec.code ? `data-code="${rec.code}"` : '';
        return `<div class="suggestion-chip" data-idx="${i}" ${codeAttr} style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;margin-bottom:6px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:8px;transition:all 0.15s;">
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <span style="font-weight:600;font-size:0.88rem;">${rec.title}</span>
              <span style="font-size:0.72rem;padding:2px 7px;border-radius:10px;background:${badgeColor};color:${badgeTextColor};white-space:nowrap;">${badgeLabel}</span>
            </div>
            <div style="font-size:0.8rem;color:var(--text-muted);margin-top:3px;">${rec.reason}</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;">
            <button onclick="applySuggestion(${i})" style="padding:4px 12px;font-size:0.78rem;font-weight:600;background:var(--accent-teal);color:#fff;border:none;border-radius:6px;cursor:pointer;white-space:nowrap;">Book it</button>
            <button onclick="logSuggestion(${i},'${vehicleId}')" style="padding:4px 10px;font-size:0.76rem;font-weight:500;background:transparent;color:var(--text-secondary);border:1px solid var(--border-subtle);border-radius:6px;cursor:pointer;white-space:nowrap;">Already done? Log it</button>
            ${typeof getCareKeyForCategory === 'function' && getCareKeyForCategory(rec.title || rec.category) ? `<button onclick="openAcademyCareCard('${getCareKeyForCategory(rec.title || rec.category)}')" style="padding:4px 8px;font-size:0.76rem;font-weight:500;background:transparent;color:var(--accent-teal);border:1px solid var(--accent-teal);border-radius:6px;cursor:pointer;white-space:nowrap;" title="Learn about this service">${typeof mccIcon === 'function' ? mccIcon('book-open', 14) : '📖'}</button>` : ''}
          </div>
        </div>`;
      }).join('');
    }

    let _currentSuggestions = [];

    function applySuggestion(idx) {
      const rec = _currentSuggestions[idx];
      if (!rec) return;
      const titleInput = document.getElementById('p-title');
      const catSelect = document.getElementById('p-category');
      if (titleInput) titleInput.value = rec.title;
      if (catSelect) {
        catSelect.value = rec.category;
        catSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
      document.getElementById('service-suggestions-panel').style.display = 'none';
    }
    window.applySuggestion = applySuggestion;

    function logSuggestion(idx, vehicleId) {
      const rec = _currentSuggestions[idx];
      if (!rec) return;
      const modal = document.getElementById('log-service-modal');
      const select = document.getElementById('log-service-type');
      if (!modal || !select) return;

      const scheduleData = typeof maintenanceScheduleData !== 'undefined' ? maintenanceScheduleData : [];
      let matchCode = rec.code || '';
      if (!matchCode && rec.title && scheduleData.length > 0) {
        const titleLower = rec.title.toLowerCase();
        const match = scheduleData.find(s => s.name && s.name.toLowerCase() === titleLower) ||
          scheduleData.find(s => s.name && (titleLower.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(titleLower)));
        if (match) matchCode = match.code;
      }
      if (scheduleData.length > 0) {
        select.innerHTML = '<option value="">Select a service...</option>' +
          scheduleData.map(s => `<option value="${s.code}" ${s.code === matchCode ? 'selected' : ''}>${s.icon || ''} ${s.name}</option>`).join('');
      } else {
        const fallbackServices = [
          { code: 'oil_synthetic', name: 'Oil & Filter Change' },
          { code: 'tire_rotation', name: 'Tire Rotation' },
          { code: 'brake_pads_front', name: 'Front Brake Pads' },
          { code: 'transmission_fluid', name: 'Transmission Fluid' },
          { code: 'coolant_flush', name: 'Coolant Flush' },
          { code: 'multi_point_inspection', name: 'Multi-Point Inspection' }
        ];
        select.innerHTML = '<option value="">Select a service...</option>' +
          fallbackServices.map(s => `<option value="${s.code}" ${s.code === matchCode ? 'selected' : ''}>${s.name}</option>`).join('');
      }

      document.getElementById('log-service-date').value = new Date().toISOString().split('T')[0];
      const allVehicles = typeof vehicles !== 'undefined' ? vehicles : [];
      const veh = allVehicles.find(v => v.id === vehicleId);
      document.getElementById('log-service-mileage').value = veh?.mileage || '';
      document.getElementById('log-service-by').value = '';
      document.getElementById('log-service-cost').value = '';
      document.getElementById('log-service-notes').value = '';

      selectedMaintenanceVehicle = vehicleId;

      window._pendingSuggestionLog = { idx, vehicleId };

      modal.style.display = 'flex';
    }
    window.logSuggestion = logSuggestion;

    let _origSaveServiceLogCaptured = false;
    let _origSaveServiceLog = null;

    function ensureSaveServiceLogWrapped() {
      if (_origSaveServiceLogCaptured) return;
      _origSaveServiceLogCaptured = true;
      _origSaveServiceLog = window.saveServiceLog;
      window.saveServiceLog = async function() {
        const serviceCode = document.getElementById('log-service-type')?.value;
        const serviceDate = document.getElementById('log-service-date')?.value;
        const mileageVal = document.getElementById('log-service-mileage')?.value;
        if (!serviceCode || !serviceDate || !mileageVal || Number.parseInt(mileageVal) < 0) {
          if (_origSaveServiceLog) await _origSaveServiceLog();
          return;
        }
        const logModalBefore = document.getElementById('log-service-modal')?.style.display;
        if (_origSaveServiceLog) await _origSaveServiceLog();
        const logModalAfter = document.getElementById('log-service-modal')?.style.display;
        const saveSucceeded = logModalBefore === 'flex' && logModalAfter === 'none';
        if (saveSucceeded && window._pendingSuggestionLog) {
          const { idx, vehicleId } = window._pendingSuggestionLog;
          window._pendingSuggestionLog = null;
          _currentSuggestions = _currentSuggestions.filter((_, i) => i !== idx);
          if (_currentSuggestions.length === 0) {
            const panel = document.getElementById('service-suggestions-panel');
            if (panel) panel.style.display = 'none';
          } else {
            renderSuggestionChips(_currentSuggestions, vehicleId);
          }
          const vehSelect = document.getElementById('p-vehicle');
          if (vehSelect && vehSelect.value) {
            setTimeout(() => vehSelect.dispatchEvent(new Event('change', { bubbles: true })), 600);
          }
        } else if (!saveSucceeded) {
          window._pendingSuggestionLog = null;
        }
      };
    }
    setTimeout(ensureSaveServiceLogWrapped, 500);

    document.addEventListener('change', async function(e) {
      if (e.target.id !== 'p-vehicle') return;
      const vehicleId = e.target.value;
      const panel = document.getElementById('service-suggestions-panel');
      const guidanceLink = document.getElementById('pkg-modal-guidance-link');
      const aiPanel = document.getElementById('ai-assistant-panel');
      const guidance = getBookingGuidance();

      if (!panel) return;
      panel.style.display = 'none';
      if (guidanceLink) guidanceLink.style.display = 'none';

      if (guidance === 'off') {
        if (guidanceLink) guidanceLink.style.display = 'block';
        if (aiPanel) aiPanel.style.display = 'none';
        return;
      }

      if (!vehicleId) return;

      if (guidance === 'suggestions_only' && aiPanel) {
        aiPanel.style.display = 'none';
      }

      const allVehicles = typeof vehicles !== 'undefined' ? vehicles : [];
      const vehicle = allVehicles.find(v => v.id === vehicleId);
      if (!vehicle) return;

      const vehicleLabel = `${vehicle.year || ''} ${vehicle.make} ${vehicle.model}`.trim();
      const titleEl = document.getElementById('suggestions-panel-title');
      if (titleEl) titleEl.textContent = `Suggested for your ${vehicleLabel}`;

      const localRecs = computeLocalRecommendations(vehicle);
      _currentSuggestions = [...localRecs];
      renderSuggestionChips(_currentSuggestions, vehicleId);
      panel.style.display = 'block';

      const loadingEl = document.getElementById('suggestions-loading');
      if (loadingEl) loadingEl.style.display = 'block';

      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) { if (loadingEl) loadingEl.style.display = 'none'; return; }
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const resp = await fetch(`${apiBase}/api/ai/service-recommendations`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            year: vehicle.year,
            make: vehicle.make,
            model: vehicle.model,
            mileage: vehicle.mileage || vehicle.current_mileage || null,
            fuel_type: vehicle.fuel_injection_type || vehicle.fuel_type || null,
            last_service_dates: {
              oil_change: vehicle.last_oil_change_date || null,
              tire_rotation: vehicle.last_tire_rotation_date || null,
              brake_service: vehicle.last_brake_service_date || null,
              transmission_service: vehicle.last_transmission_service_date || null,
              coolant_flush: vehicle.last_coolant_flush_date || null
            }
          })
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.recommendations && data.recommendations.length > 0) {
            const existingTitles = new Set(_currentSuggestions.map(r => r.title.toLowerCase()));
            const aiRecs = data.recommendations
              .filter(r => !existingTitles.has(r.title.toLowerCase()))
              .map(r => ({ ...r, code: '', priority: 4 }));
            _currentSuggestions = [..._currentSuggestions, ...aiRecs].slice(0, 7);
            renderSuggestionChips(_currentSuggestions, vehicleId);
          }
        }
      } catch (err) {}
      if (loadingEl) loadingEl.style.display = 'none';
    });

    let groupServicesLoaded = false;

    window.switchGroupServicesTab = function(tab) {
      const isOrg = tab === 'organized';
      const orgPanel = document.getElementById('gs-organized-panel');
      const invPanel = document.getElementById('gs-invited-panel');
      const orgBtn = document.getElementById('gs-tab-organized');
      const invBtn = document.getElementById('gs-tab-invited');
      if (orgPanel) orgPanel.style.display = isOrg ? 'block' : 'none';
      if (invPanel) invPanel.style.display = isOrg ? 'none' : 'block';
      if (orgBtn) { orgBtn.style.background = isOrg ? 'var(--accent-blue)' : ''; orgBtn.style.color = isOrg ? '#fff' : ''; orgBtn.className = isOrg ? 'btn btn-sm' : 'btn btn-sm btn-secondary'; }
      if (invBtn) { invBtn.style.background = !isOrg ? 'var(--accent-blue)' : ''; invBtn.style.color = !isOrg ? '#fff' : ''; invBtn.className = !isOrg ? 'btn btn-sm' : 'btn btn-sm btn-secondary'; }
    };

    window.loadGroupServices = async function(force = false) {
      if (groupServicesLoaded && !force) return;
      const loading = document.getElementById('gs-loading');
      const orgPanel = document.getElementById('gs-organized-panel');
      const invPanel = document.getElementById('gs-invited-panel');
      if (loading) loading.style.display = 'block';
      if (orgPanel) orgPanel.style.display = 'none';
      if (invPanel) invPanel.style.display = 'none';
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) { if (loading) loading.style.display = 'none'; return; }
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/split/my-splits`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const { organized = [], invited = [] } = await res.json();
        if (loading) loading.style.display = 'none';

        const pendingInvites = invited.filter(i => i.status === 'invited' || i.status === 'pending').length;
        const badge = document.getElementById('group-services-count');
        const invBadge = document.getElementById('gs-invite-badge');
        if (badge) { badge.textContent = pendingInvites; badge.style.display = pendingInvites > 0 ? 'inline-flex' : 'none'; }
        if (invBadge) { invBadge.textContent = pendingInvites; invBadge.style.display = pendingInvites > 0 ? 'inline-flex' : 'none'; }

        const statusColor = { pending: 'var(--accent-orange)', complete: 'var(--accent-green)', expired: 'var(--text-muted)', cancelled: 'var(--accent-red)' };
        const statusLabel = { pending: 'Active', complete: 'Complete', expired: 'Expired', cancelled: 'Cancelled' };
        const participantStatus = { invited: { label: 'Pending', color: 'var(--accent-orange)' }, paid: { label: 'Paid', color: 'var(--accent-green)' }, cancelled: { label: 'Cancelled', color: 'var(--accent-red)' } };

        const orgList = document.getElementById('gs-organized-list');
        const orgEmpty = document.getElementById('gs-organized-empty');
        if (orgList) {
          if (!organized.length) {
            orgList.innerHTML = '';
            if (orgEmpty) orgEmpty.style.display = 'block';
          } else {
            if (orgEmpty) orgEmpty.style.display = 'none';
            orgList.innerHTML = organized.map(s => {
              const paidCount = (s.participants || []).filter(p => p.status === 'paid').length;
              const totalCount = s.participants?.length || 0;
              const pctPaid = totalCount > 0 ? Math.round((paidCount / totalCount) * 100) : 0;
              const sc = statusColor[s.status] || 'var(--text-muted)';
              const sl = statusLabel[s.status] || s.status;
              return `<div class="card" style="margin-bottom:16px;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;gap:12px;flex-wrap:wrap;">
                  <div>
                    <div style="font-weight:600;font-size:1rem;margin-bottom:4px;">${s.pkg?.title || 'Service Package'}</div>
                    <div style="font-size:0.82rem;color:var(--text-muted);">${s.pkg?.service_type ? s.pkg.service_type.replaceAll('_', ' ') : ''} ${s.pkg?.member_zip ? '· ' + s.pkg.member_zip : ''}</div>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-size:1.1rem;font-weight:700;color:var(--accent-gold);">$${(s.total_amount_cents / 100).toFixed(2)}</div>
                    <span style="font-size:0.75rem;font-weight:600;color:${sc};">${sl}</span>
                  </div>
                </div>
                <div style="margin-bottom:12px;">
                  <div style="display:flex;justify-content:space-between;font-size:0.78rem;color:var(--text-muted);margin-bottom:4px;">
                    <span>${paidCount} of ${totalCount} paid</span><span>${pctPaid}%</span>
                  </div>
                  <div style="height:6px;background:var(--bg-input);border-radius:100px;overflow:hidden;">
                    <div style="height:100%;width:${pctPaid}%;background:var(--accent-green);border-radius:100px;transition:width 0.5s;"></div>
                  </div>
                </div>
                <div style="display:grid;gap:6px;margin-bottom:16px;">
                  ${(s.participants || []).map(p => {
                    const ps = participantStatus[p.status] || { label: p.status, color: 'var(--text-muted)' };
                    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg-input);border-radius:var(--radius-sm);font-size:0.85rem;">
                      <span style="color:var(--text-secondary);">${p.display_name || p.email}</span>
                      <div style="display:flex;align-items:center;gap:10px;">
                        <span style="font-weight:600;">$${(p.amount_cents / 100).toFixed(2)}</span>
                        <span style="font-size:0.75rem;font-weight:600;color:${ps.color};">${ps.label}</span>
                      </div>
                    </div>`;
                  }).join('')}
                </div>
                ${s.status === 'pending' ? `<button class="btn btn-sm btn-secondary" onclick="window.viewPackage('${s.package_id}')">View Package & Manage Split</button>` : ''}
                ${s.expires_at ? `<div style="font-size:0.78rem;color:var(--text-muted);margin-top:8px;">Expires: ${new Date(s.expires_at).toLocaleDateString()}</div>` : ''}
              </div>`;
            }).join('');
          }
        }

        const invList = document.getElementById('gs-invited-list');
        const invEmpty = document.getElementById('gs-invited-empty');
        if (invList) {
          if (!invited.length) {
            invList.innerHTML = '';
            if (invEmpty) invEmpty.style.display = 'block';
          } else {
            if (invEmpty) invEmpty.style.display = 'none';
            invList.innerHTML = invited.map(p => {
              const split = p.split || {};
              const pkg = p.pkg || {};
              const isPaid = p.status === 'paid';
              const isCancelled = p.status === 'cancelled' || split.status === 'cancelled' || split.status === 'expired';
              return `<div class="card" style="margin-bottom:16px;${!isPaid && !isCancelled ? 'border-color:rgba(201,162,39,0.3);' : ''}">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;gap:12px;flex-wrap:wrap;">
                  <div>
                    <div style="font-weight:600;font-size:1rem;margin-bottom:4px;">${pkg.title || 'Service Package'}</div>
                    <div style="font-size:0.82rem;color:var(--text-muted);">Invited: ${new Date(p.invited_at).toLocaleDateString()}</div>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-size:1.2rem;font-weight:700;color:var(--accent-gold);">$${(p.amount_cents / 100).toFixed(2)}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted);">your share</div>
                  </div>
                </div>
                ${isPaid ? `<div style="display:flex;align-items:center;gap:8px;color:var(--accent-green);font-size:0.88rem;font-weight:600;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>
                  Paid on ${new Date(p.paid_at).toLocaleDateString()}
                </div>` : isCancelled ? `<div style="color:var(--text-muted);font-size:0.85rem;">This split payment has been ${split.status || 'cancelled'}.</div>` : `<div style="display:flex;gap:10px;flex-wrap:wrap;">
                  <a href="/split-pay.html?participant=${p.id}" class="btn btn-primary btn-sm" style="flex:1;justify-content:center;min-width:140px;">
                    Pay My Share
                  </a>
                </div>`}
              </div>`;
            }).join('');
          }
        }

        switchGroupServicesTab('organized');
        if (orgPanel) orgPanel.style.display = 'block';
        groupServicesLoaded = true;
      } catch (err) {
        console.error('[GroupServices]', err);
        if (loading) loading.style.display = 'none';
        const orgPanel = document.getElementById('gs-organized-panel');
        if (orgPanel) { orgPanel.style.display = 'block'; orgPanel.innerHTML = '<p style="color:var(--text-muted);padding:24px;text-align:center;">Unable to load splits. Please try again.</p>'; }
      }
    };

    (function() {
      const origShowSection = typeof showSection !== 'undefined' ? showSection : null;
      if (!origShowSection) return;
      const patched = function(sectionId) {
        const result = origShowSection.apply(this, arguments);
        if (sectionId === 'group-services') {
          window.loadGroupServices();
        }
        return result;
      };
      if (typeof window !== 'undefined') window.showSection = patched;
    })();
