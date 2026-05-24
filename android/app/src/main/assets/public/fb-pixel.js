// Facebook Pixel installer + funnel-event helpers — Task #184
//
// Loads the Facebook Pixel base code on every public page that includes this
// file and exposes safe wrappers for tracking standard conversion events tied
// to MCC funnel milestones:
//
//   * PageView          — auto-fired on load
//   * Lead              — survey submit, signup form started
//   * CompleteRegistration — member finished signup
//   * Subscribe         — paid plan subscription confirmed
//   * Purchase          — care plan / bid pack purchase confirmed
//
// Pixel ID is read at runtime from one of:
//
//   1. globalThis.MCC_FB_PIXEL_ID  (inline <script> before this file loads)
//   2. <meta name="mcc-fb-pixel" content="...">   in the page head
//
// If no pixel ID is configured, the helpers degrade to no-ops so call sites
// don't have to null-check; a single console warning is emitted so the
// missing-config issue is visible in dev/staging without spamming.
//
// Optional server-side mirror: events that should still land if the user has
// left the browser (e.g. webhook-driven Purchase from Stripe) can POST to
// /api/fb/conversions which forwards to the Facebook Conversions API. See
// netlify/functions/facebook-conversions-api.js (uses FACEBOOK_CAPI_TOKEN).

(function() {
  'use strict';

  function noop() { /* pixel disabled — no-op */ }

  // Always expose the helpers so callers don't have to null-check.
  globalThis.mccTrackFb = noop;
  globalThis.mccTrackFbOnce = noop;
  globalThis.mccTrackFbPurchase = noop;

  // Facebook Pixel must not run in native iOS/Android builds — App Store Guideline 5.1.2.
  // Helpers are already set to no-ops above; bail out before the SDK loads.
  if (typeof window !== 'undefined' && window.Capacitor &&
      window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
    return;
  }

  function readPixelId() {
    try {
      if (typeof globalThis.MCC_FB_PIXEL_ID === 'string' && globalThis.MCC_FB_PIXEL_ID.trim()) {
        return globalThis.MCC_FB_PIXEL_ID.trim();
      }
    } catch (_e) { /* ignore */ }
    var meta = document.querySelector('meta[name="mcc-fb-pixel"]');
    if (meta && meta.getAttribute('content')) {
      var v = meta.getAttribute('content').trim();
      if (v) return v;
    }
    return null;
  }

  var pixelId = readPixelId();

  if (!pixelId) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(
        '[fb-pixel] No pixel ID configured (set globalThis.MCC_FB_PIXEL_ID or '
        + '<meta name="mcc-fb-pixel" content="...">). Funnel events are no-ops.'
      );
    }
    return;
  }

  // Facebook Pixel base code (transcribed to readable vanilla JS).
  if (!globalThis.fbq) {
    var fbq = function() {
      if (fbq.callMethod) {
        fbq.callMethod.apply(fbq, arguments);
      } else {
        fbq.queue.push(arguments);
      }
    };
    fbq.queue = [];
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.push = fbq;
    globalThis.fbq = fbq;
    if (!globalThis._fbq) globalThis._fbq = fbq;

    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    var first = document.getElementsByTagName('script')[0];
    if (first && first.parentNode) {
      first.parentNode.insertBefore(script, first);
    } else {
      (document.head || document.body || document.documentElement).appendChild(script);
    }
  }

  globalThis.fbq('init', pixelId);
  globalThis.fbq('track', 'PageView');

  // Add the <noscript> fallback pixel so visitors with JS disabled still
  // register a PageView in Events Manager.
  try {
    if (!document.getElementById('mcc-fb-pixel-noscript')) {
      var ns = document.createElement('noscript');
      ns.id = 'mcc-fb-pixel-noscript';
      var img = document.createElement('img');
      img.height = 1;
      img.width = 1;
      img.style.display = 'none';
      img.src = 'https://www.facebook.com/tr?id=' + encodeURIComponent(pixelId) + '&ev=PageView&noscript=1';
      img.alt = '';
      ns.appendChild(img);
      (document.body || document.documentElement).appendChild(ns);
    }
  } catch (_e) { /* ignore — noscript fallback is best-effort */ }

  // Fire a standard Facebook Pixel event with optional params + options.
  function trackFb(eventName, params, options) {
    if (!eventName) return;
    try {
      var args = ['track', eventName];
      if (params) args.push(params);
      if (options) args.push(options);
      globalThis.fbq.apply(null, args);
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[fb-pixel] track error:', err);
      }
    }
  }
  globalThis.mccTrackFb = trackFb;

  // Fire an event at most once per session, keyed by `key`. Useful for funnel
  // milestones (Lead, CompleteRegistration) so a back-button reload doesn't
  // double-count. If sessionStorage is unavailable, falls through to a normal
  // track call rather than dropping the event.
  function trackFbOnce(eventName, key, params) {
    var storageKey = 'mcc_fb_event_' + (key || eventName);
    try {
      if (sessionStorage.getItem(storageKey)) return;
      sessionStorage.setItem(storageKey, '1');
    } catch (_e) { /* sessionStorage unavailable — still fire the event */ }
    trackFb(eventName, params);
  }
  globalThis.mccTrackFbOnce = trackFbOnce;

  // Convenience wrapper for purchase / subscription events. Dedupes per
  // checkout session id when one is provided.
  //   amountCents: number in USD cents (0 if unknown — the pixel still fires)
  //   opts: { session_id, currency, contentName, contentCategory, subscription }
  function trackFbPurchase(amountCents, opts) {
    opts = opts || {};
    var amount = (typeof amountCents === 'number' && isFinite(amountCents))
      ? Math.max(0, amountCents) / 100
      : 0;
    var key = opts.session_id ? ('purchase_' + opts.session_id) : 'purchase';
    var params = { value: amount, currency: opts.currency || 'USD' };
    if (opts.contentName) params.content_name = opts.contentName;
    if (opts.contentCategory) params.content_category = opts.contentCategory;
    if (opts.contentIds) params.content_ids = opts.contentIds;
    var eventName = opts.subscription ? 'Subscribe' : 'Purchase';
    trackFbOnce(eventName, key, params);
  }
  globalThis.mccTrackFbPurchase = trackFbPurchase;

  // Auto-fire purchase / registration events from common landing-page URL
  // patterns so call sites that just redirect to a success page don't have to
  // change. Recognised query params:
  //   ?checkout=success&session_id=...   → Subscribe (Stripe subscription)
  //   ?purchase=success&pack=...         → Purchase  (one-time bid pack)
  //   ?signup=complete                   → CompleteRegistration
  try {
    var qs = new URLSearchParams(globalThis.location.search);
    var checkout = qs.get('checkout');
    var purchase = qs.get('purchase');
    var pack = qs.get('pack');
    var sessionId = qs.get('session_id');
    if (checkout === 'success') {
      trackFbPurchase(0, {
        session_id: sessionId || null,
        contentName: 'subscription',
        contentCategory: 'subscription',
        subscription: true
      });
    }
    if (purchase === 'success') {
      trackFbPurchase(0, {
        session_id: sessionId || pack || null,
        contentName: pack || 'purchase',
        contentCategory: pack ? 'bid_pack' : 'purchase',
        subscription: false
      });
    }
    if (qs.get('signup') === 'complete') {
      trackFbOnce('CompleteRegistration', 'signup_complete', {
        content_name: qs.get('role') || 'member'
      });
    }
  } catch (_e) { /* ignore — query parsing is best-effort */ }

  // Declarative per-page events via <meta name="mcc-fb-event"> tags. One tag
  // per event; format is "EventName" or "EventName|dedup_key" or
  // "EventName|dedup_key|content_name". Useful for marking each signup /
  // marketing page as a Lead view without duplicating inline scripts. A page
  // can declare multiple by repeating the meta tag.
  try {
    var metas = document.querySelectorAll('meta[name="mcc-fb-event"]');
    for (var i = 0; i < metas.length; i++) {
      var raw = (metas[i].getAttribute('content') || '').trim();
      if (!raw) continue;
      var parts = raw.split('|');
      var ev = parts[0] && parts[0].trim();
      if (!ev) continue;
      var dedup = (parts[1] && parts[1].trim()) || (ev.toLowerCase() + '_view');
      var contentName = (parts[2] && parts[2].trim()) || null;
      var p = contentName ? { content_name: contentName } : undefined;
      trackFbOnce(ev, dedup, p);
    }
  } catch (_e) { /* ignore — meta-driven events are best-effort */ }
})();
