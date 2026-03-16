let splitStripeInstance = null;
let splitCardElement = null;
let splitElements = null;
let participantData = null;
let isGuestMode = false;
let guestToken = null;
let splitCountdownTimer = null;

function startSplitCountdown(expiresAt, containerId) {
  if (!expiresAt) return;
  if (splitCountdownTimer) clearInterval(splitCountdownTimer);
  const expiresTime = new Date(expiresAt).getTime();
  if (isNaN(expiresTime)) return;

  const countdownDiv = document.createElement('div');
  countdownDiv.id = containerId;
  countdownDiv.style.cssText = 'background:rgba(26,32,42,0.9);border:1px solid rgba(160,168,184,0.15);border-radius:12px;padding:16px;margin-bottom:16px;text-align:center;';
  countdownDiv.innerHTML = `
    <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:8px;">Time Remaining</div>
    <div style="display:flex;justify-content:center;gap:12px;">
      <div style="text-align:center;">
        <div id="split-cd-hours" style="font-size:1.8rem;font-weight:700;color:#38bdf8;font-variant-numeric:tabular-nums;min-width:48px;">--</div>
        <div style="font-size:0.7rem;color:#6b7280;text-transform:uppercase;">Hours</div>
      </div>
      <div style="font-size:1.8rem;font-weight:700;color:#6b7280;">:</div>
      <div style="text-align:center;">
        <div id="split-cd-mins" style="font-size:1.8rem;font-weight:700;color:#38bdf8;font-variant-numeric:tabular-nums;min-width:48px;">--</div>
        <div style="font-size:0.7rem;color:#6b7280;text-transform:uppercase;">Minutes</div>
      </div>
      <div style="font-size:1.8rem;font-weight:700;color:#6b7280;">:</div>
      <div style="text-align:center;">
        <div id="split-cd-secs" style="font-size:1.8rem;font-weight:700;color:#38bdf8;font-variant-numeric:tabular-nums;min-width:48px;">--</div>
        <div style="font-size:0.7rem;color:#6b7280;text-transform:uppercase;">Seconds</div>
      </div>
    </div>
  `;

  const infoEl = document.getElementById('split-info');
  if (infoEl && infoEl.nextSibling) {
    infoEl.parentNode.insertBefore(countdownDiv, infoEl.nextSibling);
  } else if (infoEl) {
    infoEl.parentNode.appendChild(countdownDiv);
  }

  function updateCountdown() {
    const now = Date.now();
    const remaining = expiresTime - now;
    const container = document.getElementById(containerId);
    if (!container) { clearInterval(splitCountdownTimer); return; }
    const hoursEl = document.getElementById('split-cd-hours');
    const minsEl = document.getElementById('split-cd-mins');
    const secsEl = document.getElementById('split-cd-secs');

    if (remaining <= 0) {
      if (hoursEl) hoursEl.textContent = '00';
      if (minsEl) minsEl.textContent = '00';
      if (secsEl) secsEl.textContent = '00';
      [hoursEl, minsEl, secsEl].forEach(function(el) { if (el) el.style.color = '#f87171'; });
      container.style.borderColor = '#f87171';
      var label = container.querySelector('div');
      if (label) label.textContent = 'EXPIRED';
      var payBtn = document.getElementById('pay-btn');
      if (payBtn) { payBtn.disabled = true; payBtn.textContent = 'Payment Expired'; }
      clearInterval(splitCountdownTimer);
      return;
    }

    var h = Math.floor(remaining / 3600000);
    var m = Math.floor((remaining % 3600000) / 60000);
    var s = Math.floor((remaining % 60000) / 1000);
    if (hoursEl) hoursEl.textContent = h.toString().padStart(2, '0');
    if (minsEl) minsEl.textContent = m.toString().padStart(2, '0');
    if (secsEl) secsEl.textContent = s.toString().padStart(2, '0');

    var color = '#38bdf8';
    if (remaining < 900000) {
      color = '#f87171';
      container.style.borderColor = '#f87171';
    } else if (remaining < 3600000) {
      color = '#f59e0b';
      container.style.borderColor = '#f59e0b';
    }
    [hoursEl, minsEl, secsEl].forEach(function(el) { if (el) el.style.color = color; });
  }

  updateCountdown();
  splitCountdownTimer = setInterval(updateCountdown, 1000);
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  const participantId = params.get('participant');
  const guest = params.get('guest');
  const token = params.get('token');

  if (!participantId) {
    showError('No payment link provided. Please check your invitation email.');
    return;
  }

  isGuestMode = guest === 'true' && !!token;
  guestToken = token;

  if (isGuestMode) {
    await initGuestFlow(participantId);
  } else {
    await initMemberFlow(participantId);
  }
}

async function initGuestFlow(participantId) {
  document.getElementById('loading-state').style.display = 'none';
  document.getElementById('guest-loading-state').style.display = 'block';

  try {
    const response = await fetch(`/api/split/guest-details/${participantId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: guestToken })
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to load payment details');
    }

    const data = await response.json();

    if (data.already_paid) {
      document.getElementById('guest-loading-state').style.display = 'none';
      document.getElementById('already-paid-state').style.display = 'block';
      return;
    }

    participantData = {
      participantId: participantId,
      amountCents: data.amountCents,
      totalAmountCents: data.totalAmountCents,
      packageTitle: data.packageTitle,
      displayName: data.displayName,
      email: data.email,
      expiresAt: data.expiresAt
    };

    renderGuestPaymentUI();
  } catch (err) {
    console.error('Guest flow error:', err);
    showError(err.message || 'Failed to load payment details. The link may be invalid or expired.');
  }
}

function renderGuestPaymentUI() {
  document.getElementById('guest-loading-state').style.display = 'none';

  document.getElementById('share-amount').textContent = `$${(participantData.amountCents / 100).toFixed(2)}`;

  const descEl = document.getElementById('split-description');
  if (descEl) {
    descEl.textContent = `Pay your share for: ${participantData.packageTitle}`;
  }

  const infoEl = document.getElementById('split-info');
  if (infoEl) {
    infoEl.innerHTML = `
      <div class="info-row">
        <span class="label">Service</span>
        <span class="value">${participantData.packageTitle}</span>
      </div>
      <div class="info-row">
        <span class="label">Your Share</span>
        <span class="value">$${(participantData.amountCents / 100).toFixed(2)}</span>
      </div>
      <div class="info-row">
        <span class="label">Total Cost</span>
        <span class="value">$${(participantData.totalAmountCents / 100).toFixed(2)}</span>
      </div>
      ${participantData.displayName ? `<div class="info-row"><span class="label">Paying as</span><span class="value">${participantData.displayName}</span></div>` : ''}
    `;
  }

  document.getElementById('payment-state').style.display = 'block';

  if (participantData.expiresAt) {
    startSplitCountdown(participantData.expiresAt, 'split-countdown');
  }

  mountGuestCard();
}

async function mountGuestCard() {
  try {
    const stripeKey = await fetchStripeKey();
    if (!stripeKey) {
      showError('Payment system not available. Please try again later.');
      return;
    }

    splitStripeInstance = Stripe(stripeKey);
    splitElements = splitStripeInstance.elements();
    splitCardElement = splitElements.create('card', {
      style: {
        base: {
          color: '#f5f5f7',
          fontFamily: 'Outfit, -apple-system, sans-serif',
          fontSize: '16px',
          '::placeholder': { color: '#6b7280' }
        },
        invalid: { color: '#f87171' }
      }
    });

    splitCardElement.mount('#card-element');

    splitCardElement.on('change', (event) => {
      const errorEl = document.getElementById('card-errors');
      if (errorEl) {
        errorEl.textContent = event.error ? event.error.message : '';
      }
    });
  } catch (err) {
    console.error('Card mount error:', err);
    showError('Failed to initialize payment form.');
  }
}

async function initMemberFlow(participantId) {
  let retries = 0;
  while (!window.supabaseClient && retries < 30) {
    await new Promise(r => setTimeout(r, 100));
    retries++;
  }

  if (!window.supabaseClient) {
    showError('Failed to initialize. Please refresh the page.');
    return;
  }

  const { data: { session } } = await window.supabaseClient.auth.getSession();
  if (!session) {
    document.getElementById('loading-state').style.display = 'none';
    document.getElementById('login-state').style.display = 'block';

    const loginLink = document.querySelector('#login-state a');
    if (loginLink) {
      loginLink.href = `/members.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    }
    return;
  }

  await loadParticipantDetails(participantId);
}

async function loadParticipantDetails(participantId) {
  try {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    const response = await fetch(`/api/split/pay/${participantId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token
      }
    });

    if (response.status === 400) {
      const data = await response.json();
      if (data.error && data.error.includes('already paid')) {
        document.getElementById('loading-state').style.display = 'none';
        document.getElementById('already-paid-state').style.display = 'block';
        return;
      }
      throw new Error(data.error || 'Failed to load payment details');
    }

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to load payment details');
    }

    participantData = await response.json();

    document.getElementById('share-amount').textContent = `$${(participantData.amountCents / 100).toFixed(2)}`;

    const descEl = document.getElementById('split-description');
    if (descEl) {
      descEl.textContent = 'Complete your share of the split payment';
    }

    const infoEl = document.getElementById('split-info');
    if (infoEl) {
      infoEl.innerHTML = `
        <div class="info-row">
          <span class="label">Your Share</span>
          <span class="value">$${(participantData.amountCents / 100).toFixed(2)}</span>
        </div>
      `;
    }

    document.getElementById('loading-state').style.display = 'none';
    document.getElementById('payment-state').style.display = 'block';

    if (participantData.expiresAt) {
      startSplitCountdown(participantData.expiresAt, 'split-countdown');
    }

    await mountCard();
  } catch (err) {
    console.error('Load participant error:', err);
    showError(err.message || 'Failed to load payment details.');
  }
}

async function mountCard() {
  try {
    splitStripeInstance = await initStripe();
    if (!splitStripeInstance) {
      showError('Payment system not available.');
      return;
    }

    splitElements = splitStripeInstance.elements();
    splitCardElement = splitElements.create('card', {
      style: {
        base: {
          color: '#f5f5f7',
          fontFamily: 'Outfit, -apple-system, sans-serif',
          fontSize: '16px',
          '::placeholder': { color: '#6b7280' }
        },
        invalid: { color: '#f87171' }
      }
    });

    splitCardElement.mount('#card-element');

    splitCardElement.on('change', (event) => {
      const errorEl = document.getElementById('card-errors');
      if (errorEl) {
        errorEl.textContent = event.error ? event.error.message : '';
      }
    });
  } catch (err) {
    console.error('Card mount error:', err);
    showError('Failed to initialize payment form.');
  }
}

async function handlePay() {
  if (!splitStripeInstance || !splitCardElement || !participantData) {
    return;
  }

  const btn = document.getElementById('pay-btn');
  const errorEl = document.getElementById('card-errors');

  try {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Processing...';
    if (errorEl) errorEl.textContent = '';

    let clientSecret;

    if (isGuestMode) {
      const response = await fetch(`/api/split/guest-pay/${participantData.participantId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: guestToken })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to initiate payment');
      }
      clientSecret = data.clientSecret;
    } else {
      clientSecret = participantData.clientSecret;
    }

    const { error, paymentIntent } = await splitStripeInstance.confirmCardPayment(clientSecret, {
      payment_method: { card: splitCardElement }
    });

    if (error) {
      throw new Error(error.message);
    }

    if (paymentIntent.status === 'succeeded') {
      if (isGuestMode) {
        await fetch(`/api/split/guest-confirm/${participantData.participantId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: guestToken, payment_intent_id: paymentIntent.id })
        });
      }

      document.getElementById('payment-state').style.display = 'none';
      document.getElementById('success-state').style.display = 'block';
      
      const successMsg = document.getElementById('success-message');
      if (successMsg) {
        successMsg.textContent = isGuestMode 
          ? 'Your payment has been received! Thank you for contributing.'
          : 'Your share has been paid successfully.';
      }

      const successLink = document.getElementById('success-link');
      if (successLink && isGuestMode) {
        successLink.textContent = 'Visit My Car Concierge';
        successLink.href = '/';
      }
    }
  } catch (err) {
    console.error('Payment error:', err);
    if (errorEl) errorEl.textContent = err.message || 'Payment failed. Please try again.';
    btn.disabled = false;
    btn.innerHTML = mccIcon('dollar-sign', 16) + ' Pay Now';
  }
}

async function fetchStripeKey() {
  try {
    const response = await fetch('/api/stripe-key');
    const data = await response.json();
    return data.publishableKey || data.key;
  } catch {
    return null;
  }
}

function showError(message) {
  document.getElementById('loading-state').style.display = 'none';
  document.getElementById('guest-loading-state')?.style && (document.getElementById('guest-loading-state').style.display = 'none');
  document.getElementById('error-state').style.display = 'block';
  document.getElementById('error-message').textContent = message;
}

document.addEventListener('DOMContentLoaded', init);
