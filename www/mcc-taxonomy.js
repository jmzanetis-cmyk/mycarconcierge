// ============================================================================
// www/mcc-taxonomy.js — browser mirror of netlify/functions/_taxonomy.js
// (Phase 2.6.1). Exposes window.MCC_TAXONOMY and two small render helpers so
// the member category <select>, the provider match-preference checkboxes,
// and any category chips are generated from ONE list instead of hand-kept
// HTML.
//
// KEEP IN SYNC with _taxonomy.js — netlify/functions/__tests__/taxonomy.test.js
// loads this file and fails if CATEGORIES/LABELS/GROUPS differ.
// ============================================================================
(function () {
  'use strict';

  var CATEGORIES = [
    'maintenance', 'manufacturer_service', 'detailing', 'cosmetic',
    'accident_repair', 'performance', 'audio_electronics', 'lighting',
    'interior', 'offroad', 'ev_hybrid', 'classic_vintage', 'fleet_graphics',
    'premium_protection', 'convertible_specialty', 'motorcycle', 'rv_camper',
    'boat_marine', 'snow_removal', 'other'
  ];

  var LABELS = {
    maintenance:            'Maintenance & Mechanical',
    manufacturer_service:   'Manufacturer Service Packages',
    detailing:              'Detailing & Cleaning',
    cosmetic:               'Cosmetic & Body',
    accident_repair:        'Accident / Insurance Repair',
    performance:            'Performance & Modifications',
    audio_electronics:      'Audio & Electronics',
    lighting:               'Lighting & Accessories',
    interior:               'Interior & Upholstery',
    offroad:                'Off-Road & Specialty',
    ev_hybrid:              'EV & Hybrid Services',
    classic_vintage:        'Classic & Vintage Cars',
    fleet_graphics:         'Fleet & Commercial Graphics',
    premium_protection:     'Premium Protection (PPF/Coating)',
    convertible_specialty:  'Convertible & Specialty',
    motorcycle:             'Motorcycle Services',
    rv_camper:              'RV & Camper Services',
    boat_marine:            'Boat & Marine Services',
    snow_removal:           'Snow Removal Services',
    other:                  'Other'
  };

  // Short examples shown under provider checkboxes / member picker cards.
  var EXAMPLES = {
    maintenance:            'Oil, brakes, tires, check-engine, A/C',
    manufacturer_service:   'Factory-scheduled service, recalls',
    detailing:              'Full detail, paint correction, pre-sale prep',
    cosmetic:               'Door dings, scratches, bumper scuffs',
    accident_repair:        'Collision, insurance claims, glass',
    performance:            'Exhaust, suspension, tuning',
    audio_electronics:      'Stereo, CarPlay, dash cams, remote start',
    lighting:               'Headlights, LED/HID, underglow',
    interior:               'Upholstery, seats, headliner',
    offroad:                'Lift kits, trail prep',
    ev_hybrid:              'EV/hybrid battery & charging service',
    classic_vintage:        'Restoration, vintage service',
    fleet_graphics:         'Wraps, decals, commercial graphics',
    premium_protection:     'PPF, ceramic coating, tint',
    convertible_specialty:  'Convertible tops, specialty mechanisms',
    motorcycle:             'Motorcycle service & repair',
    rv_camper:              'RV & camper service',
    boat_marine:            'Boat & marine service',
    snow_removal:           'Plowing & snow removal',
    other:                  "Anything that doesn't fit above"
  };

  var GROUPS = [
    { key: 'mechanical', label: 'Mechanical & Service',
      categories: ['maintenance', 'manufacturer_service', 'performance', 'ev_hybrid', 'offroad', 'classic_vintage'] },
    { key: 'appearance', label: 'Appearance & Protection',
      categories: ['detailing', 'cosmetic', 'accident_repair', 'premium_protection', 'fleet_graphics'] },
    { key: 'specialty', label: 'Electronics, Interior & Specialty',
      categories: ['audio_electronics', 'lighting', 'interior', 'convertible_specialty', 'motorcycle', 'rv_camper', 'boat_marine', 'snow_removal', 'other'] }
  ];

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function label(slug) { return LABELS[slug] || slug; }

  // Rebuild a <select> from the taxonomy, preserving its current value.
  // opts.placeholder: text for a disabled first option (omit for none).
  function renderSelectOptions(selectEl, opts) {
    if (!selectEl) return;
    opts = opts || {};
    var current = selectEl.value;
    var html = '';
    if (opts.placeholder) {
      html += '<option value="" disabled' + (current ? '' : ' selected') + '>' + esc(opts.placeholder) + '</option>';
    }
    for (var i = 0; i < CATEGORIES.length; i++) {
      var c = CATEGORIES[i];
      html += '<option value="' + c + '">' + esc(label(c)) + '</option>';
    }
    selectEl.innerHTML = html;
    if (current && CATEGORIES.indexOf(current) !== -1) selectEl.value = current;
  }

  // Render grouped checkboxes into a container. Each input gets
  // class="<opts.inputClass>" and value=<slug> so existing readers such as
  // providers-settings.js (querySelectorAll('.match-category-check')) keep
  // working unchanged.
  function renderCheckboxGroups(container, opts) {
    if (!container) return;
    opts = opts || {};
    var inputClass = opts.inputClass || 'match-category-check';
    var checked = new Set(opts.checked || []);
    var html = '';
    for (var g = 0; g < GROUPS.length; g++) {
      var grp = GROUPS[g];
      html += '<div class="taxonomy-group" data-group="' + grp.key + '" style="grid-column:1/-1;margin-top:' + (g ? '14px' : '0') + ';font-size:0.8rem;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--text-muted);">' + esc(grp.label) + '</div>';
      for (var i = 0; i < grp.categories.length; i++) {
        var c = grp.categories[i];
        // Hint text (EXAMPLES) is rendered as a visible sub-line under the
        // label, not just as the hover title — provider settings screens
        // are primarily used from the iOS/Android app where there's no
        // hover state. The `--with-hint` modifier class scopes the
        // two-line-alignment CSS to just these labels; the base
        // .service-checkbox is also used by the static "Services Offered"
        // list on the Business Profile page (single-line items), which
        // must stay centered.
        html += '<label class="service-checkbox service-checkbox--with-hint" title="' + esc(EXAMPLES[c] || '') + '">' +
          '<input type="checkbox" value="' + c + '" class="' + esc(inputClass) + '"' + (checked.has(c) ? ' checked' : '') + '> ' +
          '<span class="service-checkbox-label">' +
            '<span class="service-checkbox-title">' + esc(label(c)) + '</span>' +
            (EXAMPLES[c] ? '<span class="service-checkbox-hint">' + esc(EXAMPLES[c]) + '</span>' : '') +
          '</span>' +
          '</label>';
      }
    }
    container.innerHTML = html;
  }

  function chip(slug) {
    return '<span class="category-chip" data-category="' + esc(slug) + '">' + esc(label(slug)) + '</span>';
  }

  window.MCC_TAXONOMY = {
    CATEGORIES: CATEGORIES,
    LABELS: LABELS,
    EXAMPLES: EXAMPLES,
    GROUPS: GROUPS,
    label: label,
    chip: chip,
    renderSelectOptions: renderSelectOptions,
    renderCheckboxGroups: renderCheckboxGroups
  };

  // Auto-wire known surfaces when present. Runs after DOM parse; safe on
  // pages that don't have these elements.
  function autoWire() {
    var sel = document.getElementById('p-category');
    if (sel && sel.getAttribute('data-taxonomy') !== 'off') {
      renderSelectOptions(sel);
    }
    var grid = document.getElementById('match-categories-grid');
    if (grid) {
      var pre = [];
      grid.querySelectorAll('input[type=checkbox]:checked').forEach(function (cb) { pre.push(cb.value); });
      renderCheckboxGroups(grid, { inputClass: 'match-category-check', checked: pre });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoWire);
  else autoWire();
})();
