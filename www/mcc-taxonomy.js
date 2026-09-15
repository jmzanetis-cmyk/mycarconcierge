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

  // Phase 2.7.3: "Type of work" options per category — populates
  // p-service-type based on the chosen category. MIRRORED EXACTLY in
  // netlify/functions/_taxonomy.js SERVICE_TYPES_BY_CATEGORY; the taxonomy
  // test fails if they drift.
  var SERVICE_TYPES_BY_CATEGORY = {
    maintenance: [
      'Oil change / fluids',
      'Brake service',
      'Tire service',
      'Battery / electrical',
      'Engine service / repair',
      'Transmission',
      'Diagnostics / check engine light',
      'A/C or heating',
      'Alignment / suspension',
      'Inspection / multi-point'
    ],
    manufacturer_service: [
      'Factory-scheduled maintenance',
      'Recall service',
      'Warranty repair',
      'Extended service package'
    ],
    detailing: [
      'Interior detail',
      'Exterior detail',
      'Full detail',
      'Ceramic coating',
      'Paint correction',
      'Engine bay detail',
      'Headlight restoration',
      'Odor / smoke removal'
    ],
    cosmetic: [
      'Dent removal / PDR',
      'Scratch / touch-up',
      'Bumper repair',
      'Trim / molding',
      'Small paint repair',
      'Chip repair'
    ],
    accident_repair: [
      'Collision repair',
      'Insurance claim',
      'Frame / structural work',
      'Bodywork & paint',
      'Windshield / glass'
    ],
    performance: [
      'Exhaust',
      'Suspension / lowering',
      'Engine tuning / ECU',
      'Cold air intake',
      'Turbo / supercharger',
      'Performance brakes'
    ],
    audio_electronics: [
      'Stereo / speakers',
      'Subwoofer / amp',
      'Infotainment / CarPlay',
      'Dash cam',
      'Remote start / alarm',
      'Backup camera',
      'Electronics wiring'
    ],
    lighting: [
      'Headlight upgrade',
      'Taillight upgrade',
      'LED interior lighting',
      'Underglow / accent',
      'Bulb replacement',
      'Fog / driving lights'
    ],
    interior: [
      'Upholstery repair',
      'Seat repair / re-cover',
      'Carpet / floor',
      'Headliner',
      'Dashboard repair',
      'Steering wheel wrap'
    ],
    offroad: [
      'Lift kit',
      'Off-road tires',
      'Skid plates / armor',
      'Winch / recovery',
      'Suspension upgrade',
      'Trail prep'
    ],
    ev_hybrid: [
      'Battery service',
      'Charging system',
      'High-voltage electrical',
      'EV/hybrid diagnostics',
      'Drivetrain service'
    ],
    classic_vintage: [
      'Restoration',
      'Mechanical rebuild',
      'Bodywork / paint',
      'Interior restoration',
      'Sourcing / parts'
    ],
    fleet_graphics: [
      'Full vehicle wrap',
      'Partial wrap / decals',
      'Fleet lettering',
      'Livery / branding',
      'Removal'
    ],
    premium_protection: [
      'PPF / clear bra',
      'Ceramic coating',
      'Window tint',
      'Paint protection',
      'Interior protection'
    ],
    convertible_specialty: [
      'Convertible top repair',
      'Top mechanism / motor',
      'Weather sealing',
      'Top replacement'
    ],
    motorcycle: [
      'Maintenance / tune-up',
      'Tire service',
      'Chain / drivetrain',
      'Repair / diagnostics',
      'Detail / cleaning'
    ],
    rv_camper: [
      'Maintenance',
      'Appliance service',
      'Plumbing / electrical',
      'Roof / seal',
      'Detail / cleaning'
    ],
    boat_marine: [
      'Engine service',
      'Detail / bottom paint',
      'Trailer service',
      'Electronics install',
      'Winterization'
    ],
    snow_removal: [
      'Driveway plowing',
      'Sidewalk clearing',
      'Salt / de-icing',
      'Seasonal contract'
    ],
    other: [
      'Consultation',
      'Second opinion',
      'Other service'
    ]
  };

  // Populate a "Type of work" <select> from the chosen category. Preserves
  // the current value if it still fits; otherwise falls back to a
  // "Choose a type…" placeholder. Safe to call before any category is set.
  function renderServiceTypes(selectEl, category) {
    if (!selectEl) return;
    var current = selectEl.value;
    var list = (category && SERVICE_TYPES_BY_CATEGORY[category]) || [];
    var html = '<option value="" disabled selected>Choose a type…</option>';
    for (var i = 0; i < list.length; i++) {
      html += '<option value="' + esc(list[i]) + '">' + esc(list[i]) + '</option>';
    }
    selectEl.innerHTML = html;
    if (current && list.indexOf(current) !== -1) selectEl.value = current;
  }

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
        html += '<label class="service-checkbox" title="' + esc(EXAMPLES[c] || '') + '">' +
          '<input type="checkbox" value="' + c + '" class="' + esc(inputClass) + '"' + (checked.has(c) ? ' checked' : '') + '> ' +
          '<span>' + esc(label(c)) + '</span>' +
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
    SERVICE_TYPES_BY_CATEGORY: SERVICE_TYPES_BY_CATEGORY,
    label: label,
    chip: chip,
    renderSelectOptions: renderSelectOptions,
    renderCheckboxGroups: renderCheckboxGroups,
    renderServiceTypes: renderServiceTypes
  };

  // Auto-wire known surfaces when present. Runs after DOM parse; safe on
  // pages that don't have these elements.
  function autoWire() {
    var sel = document.getElementById('p-category');
    if (sel && sel.getAttribute('data-taxonomy') !== 'off') {
      // Phase 2.7.3: force a disabled placeholder so an unchosen category
      // is invalid at submit — required attribute already lives on the
      // element. Do NOT overwrite the category if one was pre-set (edit
      // flow / query-param arrival).
      renderSelectOptions(sel, { placeholder: 'Choose a category…' });

      // Auto-wire p-service-type to the chosen category so a detailing job
      // no longer offers "brake service" as a type. Fires on change; also
      // fires once immediately if p-category already has a value.
      var stSel = document.getElementById('p-service-type');
      if (stSel && stSel.getAttribute('data-taxonomy') !== 'off') {
        var refresh = function () { renderServiceTypes(stSel, sel.value); };
        sel.addEventListener('change', refresh);
        if (sel.value) refresh();
      }
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
