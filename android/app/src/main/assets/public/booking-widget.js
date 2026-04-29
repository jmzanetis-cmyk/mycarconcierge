(function() {
  'use strict';

  var MCC_API_BASE = 'https://mycarconcierge.com';

  function getConfig() {
    var scripts = document.querySelectorAll('script[data-mcc-shop]');
    for (var i = 0; i < scripts.length; i++) {
      var slug = scripts[i].getAttribute('data-mcc-shop');
      if (slug) return { slug: slug };
    }
    return null;
  }

  function injectStyles() {
    if (document.getElementById('mcc-widget-styles')) return;
    var style = document.createElement('style');
    style.id = 'mcc-widget-styles';
    style.textContent = [
      '#mcc-booking-widget *{box-sizing:border-box;margin:0;padding:0;}',
      '#mcc-booking-widget{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:420px;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);}',
      '.mcc-widget-header{background:linear-gradient(135deg,#c9a227,#e8bc5a);padding:20px 24px;color:#12161c;}',
      '.mcc-widget-header h3{font-size:1.1rem;font-weight:700;margin-bottom:4px;}',
      '.mcc-widget-header p{font-size:0.85rem;opacity:0.8;}',
      '.mcc-widget-body{padding:20px 24px;background:#fff;}',
      '.mcc-field{margin-bottom:14px;}',
      '.mcc-label{display:block;font-size:0.8rem;font-weight:600;color:#374151;margin-bottom:5px;}',
      '.mcc-input,.mcc-select,.mcc-textarea{width:100%;padding:9px 13px;border:1px solid #d1d5db;border-radius:8px;font-family:inherit;font-size:0.88rem;color:#1f2937;background:#fff;transition:border-color 0.2s;}',
      '.mcc-input:focus,.mcc-select:focus,.mcc-textarea:focus{outline:none;border-color:#c9a227;box-shadow:0 0 0 3px rgba(201,162,39,0.15);}',
      '.mcc-textarea{min-height:70px;resize:vertical;}',
      '.mcc-btn{width:100%;padding:12px;background:linear-gradient(135deg,#c9a227,#e8bc5a);color:#12161c;font-weight:700;font-size:0.95rem;border:none;border-radius:10px;cursor:pointer;transition:all 0.2s;}',
      '.mcc-btn:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(201,162,39,0.4);}',
      '.mcc-btn:disabled{opacity:0.6;cursor:not-allowed;transform:none;}',
      '.mcc-success{padding:32px 24px;text-align:center;background:#f0fdf4;}',
      '.mcc-success-icon{font-size:2.5rem;margin-bottom:12px;}',
      '.mcc-success h4{color:#166534;font-size:1rem;font-weight:700;margin-bottom:6px;}',
      '.mcc-success p{color:#15803d;font-size:0.88rem;}',
      '.mcc-footer{text-align:center;padding:10px;border-top:1px solid #f3f4f6;background:#fafafa;}',
      '.mcc-footer a{font-size:0.75rem;color:#9ca3af;text-decoration:none;}',
      '.mcc-footer a:hover{color:#c9a227;}',
      '.mcc-error{color:#dc2626;font-size:0.82rem;margin-top:8px;}'
    ].join('');
    document.head.appendChild(style);
  }

  function buildWidget(config, shopName) {
    var w = document.createElement('div');
    w.id = 'mcc-booking-widget';
    w.innerHTML = [
      '<div class="mcc-widget-header">',
        '<h3>Book a Service</h3>',
        '<p>' + (shopName || 'Schedule your appointment') + '</p>',
      '</div>',
      '<div class="mcc-widget-body" id="mcc-form-body">',
        '<div class="mcc-field"><label class="mcc-label">Your Name *</label><input type="text" class="mcc-input" id="mcc-name" placeholder="Jane Smith" required /></div>',
        '<div class="mcc-field"><label class="mcc-label">Phone *</label><input type="tel" class="mcc-input" id="mcc-phone" placeholder="(555) 000-0000" required /></div>',
        '<div class="mcc-field"><label class="mcc-label">Vehicle (Year Make Model) *</label><input type="text" class="mcc-input" id="mcc-vehicle" placeholder="2019 Toyota Camry" required /></div>',
        '<div class="mcc-field"><label class="mcc-label">Service Needed *</label>',
          '<select class="mcc-select" id="mcc-service" required>',
            '<option value="">Select…</option>',
            '<option value="oil_change">Oil Change</option>',
            '<option value="tire_rotation">Tire Rotation</option>',
            '<option value="brake_inspection">Brake Inspection</option>',
            '<option value="diagnostic">Diagnostic</option>',
            '<option value="general_repair">General Repair</option>',
            '<option value="ac_service">A/C Service</option>',
            '<option value="detailing">Detailing</option>',
            '<option value="other">Other</option>',
          '</select>',
        '</div>',
        '<div class="mcc-field"><label class="mcc-label">Details (optional)</label><textarea class="mcc-textarea" id="mcc-details" placeholder="Describe the issue…"></textarea></div>',
        '<div id="mcc-error" class="mcc-error" style="display:none;"></div>',
        '<button class="mcc-btn" id="mcc-submit-btn" onclick="window._mccSubmit(\'' + config.slug + '\')">Request Appointment</button>',
      '</div>',
      '<div class="mcc-footer"><a href="https://mycarconcierge.com/shop/' + config.slug + '" target="_blank">Powered by My Car Concierge</a></div>'
    ].join('');
    return w;
  }

  window._mccSubmit = function(slug) {
    var btn = document.getElementById('mcc-submit-btn');
    var errorEl = document.getElementById('mcc-error');
    var name = (document.getElementById('mcc-name').value || '').trim();
    var phone = (document.getElementById('mcc-phone').value || '').trim();
    var vehicle = (document.getElementById('mcc-vehicle').value || '').trim();
    var service = document.getElementById('mcc-service').value;
    var details = (document.getElementById('mcc-details').value || '').trim();

    errorEl.style.display = 'none';
    if (!name || !phone || !vehicle || !service) {
      errorEl.textContent = 'Please fill in all required fields.';
      errorEl.style.display = 'block';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Sending…';

    fetch(MCC_API_BASE + '/api/shop/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: slug, name: name, phone: phone, vehicle: vehicle, service: service, details: details, source: 'widget' })
    })
    .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
    .then(function(result) {
      if (!result.ok) throw new Error(result.data.error || 'Request failed');
      var body = document.getElementById('mcc-form-body');
      body.innerHTML = '<div class="mcc-success"><div class="mcc-success-icon">✅</div><h4>Request Sent!</h4><p>We\'ll contact you to confirm your appointment.</p></div>';
    })
    .catch(function(err) {
      btn.disabled = false;
      btn.textContent = 'Request Appointment';
      errorEl.textContent = err.message || 'Failed to submit. Please try again.';
      errorEl.style.display = 'block';
    });
  };

  function init() {
    var config = getConfig();
    if (!config) {
      console.warn('[MCC Widget] No data-mcc-shop attribute found on script tag.');
      return;
    }

    injectStyles();

    var container = document.getElementById('mcc-booking-widget-container') || document.body;

    fetch(MCC_API_BASE + '/api/shop/profile/' + encodeURIComponent(config.slug))
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var shopName = data.shop ? (data.shop.business_name || data.shop.full_name || '') : '';
        var widget = buildWidget(config, shopName);
        container.appendChild(widget);
      })
      .catch(function() {
        var widget = buildWidget(config, '');
        container.appendChild(widget);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
