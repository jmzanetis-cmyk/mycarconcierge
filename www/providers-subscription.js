// ============================================================================
// providers-subscription.js
//
// Phase 2 §2.4 — renders the Monthly Plans card in the Credits & Plans
// section of providers.html and hits POST /api/provider/plan-checkout /
// /api/provider/plan-portal.
//
// Native platforms see nothing (Apple 3.1.1 — the card carries the
// .web-purchase-only class handled by the existing native-hide CSS/JS
// used by the bid-packs grid).
//
// Read paths:
//   • GET subscription_plans (public via RLS)
//   • GET provider_subscriptions where provider_id=auth.uid()
//     (RLS provider-self policy)
// ============================================================================
(function () {
  'use strict';

  async function _authHeaders() {
    var client = window.supabaseClient;
    if (!client) return null;
    var res = await client.auth.getSession();
    var token = res && res.data && res.data.session && res.data.session.access_token;
    if (!token) return null;
    return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
  }

  // FEATURE_PROVIDER_PLANS gate. Read from /api/config once per page load
  // and cache on window so a Manage-plan click later doesn't re-fetch.
  // The server-side endpoints also 403 when the flag is off (defense in
  // depth against a curl bypass); this client check is purely so the UI
  // doesn't advertise a feature the backend refuses.
  async function _fetchConfigOnce() {
    if (window.__mccConfig) return window.__mccConfig;
    try {
      var res = await fetch('/api/config', { credentials: 'omit' });
      if (!res.ok) { window.__mccConfig = {}; return window.__mccConfig; }
      window.__mccConfig = await res.json();
      return window.__mccConfig;
    } catch (_) {
      window.__mccConfig = {};
      return window.__mccConfig;
    }
  }

  async function _isProviderPlansEnabled() {
    if (typeof window.__featureProviderPlans === 'boolean') {
      return window.__featureProviderPlans;
    }
    var cfg = await _fetchConfigOnce();
    var on = !!(cfg && cfg.features && cfg.features.providerPlans === true);
    window.__featureProviderPlans = on;
    return on;
  }


  async function loadProviderPlans() {
    var card = document.getElementById('provider-plans-card');
    var grid = document.getElementById('provider-plans-grid');
    var status = document.getElementById('provider-plans-status');
    var err = document.getElementById('provider-plans-error');
    var trialHint = document.getElementById('provider-plans-trial-hint');
    if (!grid) return;

    // Native platforms don't see the plans card at all; the shared
    // .web-purchase-only hide handled elsewhere in providers-bids.js /
    // providers-core.js suppresses it. This function still runs so the
    // portal button on the dashboard can react to sub state; the render
    // path guards against a null grid via the check above.
    if (window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()) {
      grid.innerHTML = '';
      return;
    }

    // Feature flag: hide the whole card when off. The existing Credits +
    // Bid Packs section on the page is unaffected — that renders from
    // providers-bids.js and predates Phase 2.
    var enabled = await _isProviderPlansEnabled();
    if (!enabled) {
      if (card) card.style.display = 'none';
      return;
    }
    if (card) card.style.display = '';

    var client = window.supabaseClient;
    if (!client) return;

    // Guard against re-entry — onAuthStateChange fires again after
    // hydration and we don't want two concurrent renders.
    if (window.__providerPlansRendering) return;
    window.__providerPlansRendering = true;

    // supabase-js hydrates persisted sessions asynchronously on client
    // init. The first loadProviderPlans() at DOMContentLoaded can win
    // the race and query subscription_plans while the client is still
    // anon — RLS ({authenticated} SELECT policy) then returns zero rows
    // and we paint the empty state instead of the real plans. Waiting
    // for getSession() to resolve forces the hydrate to complete first.
    try { await client.auth.getSession(); } catch (_) { /* non-fatal */ }

    try {
      // Deliberately does NOT select stripe_price_monthly / _test. Price
      // ids are a server-side concern — plan-checkout picks the correct
      // column by the STRIPE_SECRET_KEY prefix and returns 503
      // plan_not_provisioned if the mode's column is null, which
      // startProviderPlanCheckout surfaces via alert. Keeping the client
      // out of the price-id business means we can't accidentally show a
      // test id to a live-mode user (or vice versa) even if the mode
      // detection flips.
      var { data: plans } = await client
        .from('subscription_plans')
        .select('plan_key, name, credits_per_month, monthly_price_cents, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (!plans || plans.length === 0) {
        grid.innerHTML = '<p style="color:var(--text-muted);">No plans available yet.</p>';
        return;
      }

      // #provider-plans-trial-hint was the dynamic Starter-count in the
      // old plan-neutral copy; the current subtitle no longer names a
      // number, so this update is a no-op today. Left in place so the
      // element can be re-wired if we ever put a per-plan count back.
      if (trialHint && plans[0]) trialHint.textContent = String(plans[0].credits_per_month);

      var { data: sub } = await client
        .from('provider_subscriptions')
        .select('id, plan_key, status, current_period_end, cancel_at_period_end, trial_started_at, converted_at')
        .in('status', ['trialing', 'active', 'past_due'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (status) {
        if (!sub) {
          status.textContent = '';
        } else if (sub.status === 'trialing') {
          status.textContent = 'Trial active on ' + _humanPlan(sub.plan_key, plans) + '.';
        } else if (sub.status === 'active') {
          status.textContent = 'On ' + _humanPlan(sub.plan_key, plans) +
            (sub.cancel_at_period_end ? ' — cancels at period end.' : '.');
        } else if (sub.status === 'past_due') {
          status.textContent = 'Payment past due on ' + _humanPlan(sub.plan_key, plans) +
            ' — update your card via Manage.';
        }
      }

      grid.innerHTML = plans.map(function (p) {
        var isCurrent = sub && sub.plan_key === p.plan_key && sub.status !== 'canceled';
        // "Popular" is derived client-side rather than persisted on
        // subscription_plans — a cosmetic badge doesn't earn a column.
        var isPopular = p.plan_key === 'standard';
        var priceStr = '$' + (p.monthly_price_cents / 100).toFixed(0) + '/mo';
        var perBid = (p.monthly_price_cents / 100) / p.credits_per_month;
        var perBidStr = '$' + perBid.toFixed(2) + '/bid';
        var buttonLabel, buttonAction, buttonDisabled = false;
        if (isCurrent) {
          buttonLabel = sub.status === 'trialing' ? 'Manage (in trial)' : 'Manage plan';
          buttonAction = "openProviderPlanPortal()";
        } else if (sub) {
          // On another plan — allow switching via portal (upgrade at
          // proration, downgrade at period end per portal config).
          buttonLabel = 'Switch to ' + p.name;
          buttonAction = "openProviderPlanPortal()";
        } else {
          buttonLabel = 'Start trial';
          buttonAction = "startProviderPlanCheckout('" + p.plan_key + "')";
        }
        // No client-side "Coming soon" gate. If the plan is is_active
        // but the current-mode price column is still null, plan-checkout
        // will 503 plan_not_provisioned on click and startProviderPlanCheckout
        // alerts the user. That's a narrow window (bootstrap runs once
        // per mode) and keeps price ids server-side.

        var badge = isCurrent ? '<div style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:var(--accent-teal,#22d3ee);color:#0a0a0f;font-size:0.7rem;font-weight:600;padding:3px 10px;border-radius:100px;">CURRENT</div>' :
                    isPopular ? '<div style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:var(--accent-gold);color:#0a0a0f;font-size:0.7rem;font-weight:600;padding:3px 10px;border-radius:100px;">MOST POPULAR</div>' : '';

        return '<div style="background:var(--bg-elevated);border:2px solid ' +
          (isCurrent ? 'var(--accent-teal,#22d3ee)' : (isPopular ? 'var(--accent-gold)' : 'var(--border-subtle)')) +
          ';border-radius:var(--radius-lg);padding:20px;position:relative;text-align:center;">' +
          badge +
          '<h3 style="font-size:1.2rem;font-weight:600;margin-bottom:4px;">' + _esc(p.name) + '</h3>' +
          '<div style="margin:14px 0 4px;font-size:1.8rem;font-weight:700;color:var(--accent-gold);">' + priceStr + '</div>' +
          '<div style="color:var(--text-muted);font-size:var(--text-sm);margin-bottom:12px;">' + p.credits_per_month + ' credits · ' + perBidStr + '</div>' +
          '<button class="btn ' + (isCurrent || isPopular ? 'btn-primary' : 'btn-secondary') + '" style="width:100%;"' +
          (buttonAction ? ' onclick="' + buttonAction + '"' : '') +
          (buttonDisabled ? ' disabled' : '') +
          '>' + _esc(buttonLabel) + '</button>' +
          '</div>';
      }).join('');
    } catch (e) {
      console.error('[providers-subscription] load failed:', e);
      if (err) { err.style.display = 'block'; err.textContent = 'Could not load plans: ' + e.message; }
    } finally {
      window.__providerPlansRendering = false;
    }
  }

  function _humanPlan(planKey, plans) {
    var p = (plans || []).find(function (x) { return x.plan_key === planKey; });
    return p ? p.name : planKey;
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function _isNativeApp() {
    return !!(window.Capacitor
      && window.Capacitor.isNativePlatform
      && window.Capacitor.isNativePlatform());
  }

  async function startProviderPlanCheckout(planKey) {
    var headers = await _authHeaders();
    if (!headers) { alert('Please sign in again.'); return; }

    var isNative = _isNativeApp();
    // §native purchase flow (2026-09-20). Tag platform so the server
    // returns success/cancel URLs that don't require auth (the
    // SFSafariViewController has no session with providers.html).
    try {
      var resp = await fetch('/api/provider/plan-checkout', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ plan_key: planKey, platform: isNative ? 'native' : 'web' }),
      });
      var body = await resp.json().catch(function () { return {}; });
      if (!resp.ok) {
        if (resp.status === 409 && body.error === 'trial_used') {
          alert('You have already started a trial. Use "Manage plan" to change or resume.');
          return;
        }
        if (resp.status === 503 && body.error === 'plan_not_provisioned') {
          alert('This plan isn\'t available yet. Please check back shortly.');
          return;
        }
        console.error('[plan-checkout] failed:', body);
        alert(body.error ? 'Checkout failed: ' + body.error : 'Checkout failed.');
        return;
      }
      if (!body.checkout_url) return;

      if (isNative) {
        var Browser = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
        if (Browser) { await Browser.open({ url: body.checkout_url }); return; }
      }
      window.location.href = body.checkout_url;
    } catch (e) {
      console.error('[plan-checkout] fetch error:', e);
      alert('Network error starting checkout.');
    }
  }

  async function openProviderPlanPortal() {
    var headers = await _authHeaders();
    if (!headers) { alert('Please sign in again.'); return; }

    try {
      var resp = await fetch('/api/provider/plan-portal', {
        method: 'POST',
        headers: headers,
      });
      var body = await resp.json().catch(function () { return {}; });
      if (!resp.ok) {
        alert(body.error ? 'Manage failed: ' + body.error : 'Manage failed.');
        return;
      }
      if (body.portal_url) window.location.href = body.portal_url;
    } catch (e) {
      console.error('[plan-portal] fetch error:', e);
      alert('Network error opening manage portal.');
    }
  }

  window.loadProviderPlans = loadProviderPlans;
  window.startProviderPlanCheckout = startProviderPlanCheckout;
  window.openProviderPlanPortal = openProviderPlanPortal;

  // Re-fire on hydrate. supabase-js emits INITIAL_SESSION as soon as
  // it finishes restoring a persisted session, and SIGNED_IN when a
  // fresh sign-in completes. Either event means the RLS-gated
  // subscription_plans query will now succeed. The re-entry guard in
  // loadProviderPlans prevents this racing with the DOMContentLoaded
  // firing.
  function _wireAuthRefire() {
    var c = window.supabaseClient;
    if (!c || !c.auth || typeof c.auth.onAuthStateChange !== 'function') return false;
    if (window.__providerPlansAuthWired) return true;
    window.__providerPlansAuthWired = true;
    c.auth.onAuthStateChange(function (event) {
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        loadProviderPlans();
      }
    });
    return true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      _wireAuthRefire();
      loadProviderPlans();
    });
  } else {
    _wireAuthRefire();
    loadProviderPlans();
  }
  // supabaseClient may load after this IIFE runs; retry the wire.
  if (!window.__providerPlansAuthWired) {
    var _tries = 0;
    var _iv = setInterval(function () {
      if (_wireAuthRefire() || ++_tries > 20) clearInterval(_iv);
    }, 100);
  }
})();
