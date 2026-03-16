const CARE_GUIDE_SERVICES = {
  mechanical: [
    {
      key: 'oil_change',
      name: 'Oil Change',
      frequency: 'Every 5,000–10,000 miles or 6 months',
      intervalMiles: 7500,
      intervalMonths: 6,
      filterGroup: 'mileage',
      category: 'maintenance',
      serviceType: 'Oil change / fluids',
      description: 'An oil change replaces the old, dirty oil in your engine with fresh oil and a new filter. Oil lubricates all the moving parts inside your engine, keeping everything running smoothly and cool.',
      whyItMatters: 'Skipping oil changes lets sludge build up inside your engine. Over time this causes excessive wear, overheating, and can lead to a full engine failure costing $3,000–$7,000 to replace.',
      icon: 'fuel'
    },
    {
      key: 'tire_rotation',
      name: 'Tire Rotation',
      frequency: 'Every 5,000–7,500 miles',
      intervalMiles: 6000,
      intervalMonths: null,
      filterGroup: 'mileage',
      category: 'maintenance',
      serviceType: 'Tire rotation / alignment',
      description: 'Tire rotation moves each tire to a different position on your vehicle so they wear evenly. Front tires typically wear faster because they handle steering.',
      whyItMatters: 'Uneven tire wear means you\'ll need to replace tires sooner — potentially cutting tire life in half. It also affects handling and safety, especially in wet conditions.',
      icon: 'settings'
    },
    {
      key: 'brake_inspection',
      name: 'Brake Inspection',
      frequency: 'Every 12,000–15,000 miles or annually',
      intervalMiles: 12000,
      intervalMonths: 12,
      filterGroup: 'annually',
      category: 'maintenance',
      serviceType: 'Brake service',
      description: 'A brake inspection checks your brake pads, rotors, calipers, and fluid to make sure everything is working safely. Your mechanic measures pad thickness and looks for wear or damage.',
      whyItMatters: 'Worn brake pads can damage rotors, turning a $150–$300 pad replacement into a $400–$800 rotor and pad job. More critically, failing brakes are a serious safety hazard.',
      icon: 'circle-alert'
    },
    {
      key: 'cabin_air_filter',
      name: 'Cabin Air Filter',
      frequency: 'Every 15,000–25,000 miles or annually',
      intervalMiles: 20000,
      intervalMonths: 12,
      filterGroup: 'annually',
      category: 'maintenance',
      serviceType: 'Belt / hose replacement',
      description: 'The cabin air filter cleans the air that comes through your vents and AC system. It catches dust, pollen, and pollutants before they enter the passenger compartment.',
      whyItMatters: 'A clogged cabin filter reduces airflow, makes your AC work harder (hurting fuel economy), and lets allergens and pollutants into the cabin — bad news for anyone with allergies or asthma.',
      icon: 'wind'
    },
    {
      key: 'engine_air_filter',
      name: 'Engine Air Filter',
      frequency: 'Every 15,000–30,000 miles',
      intervalMiles: 20000,
      intervalMonths: null,
      filterGroup: 'mileage',
      category: 'maintenance',
      serviceType: 'Engine tune-up',
      description: 'The engine air filter prevents dirt and debris from entering your engine. Clean air is essential for proper combustion — your engine needs about 10,000 gallons of air for every gallon of fuel.',
      whyItMatters: 'A dirty air filter reduces engine performance and fuel economy by up to 10%. In severe cases, contaminants can get past a clogged filter and damage engine internals.',
      icon: 'settings'
    },
    {
      key: 'battery_test',
      name: 'Battery Test',
      frequency: 'Every 6 months or at each oil change',
      intervalMiles: null,
      intervalMonths: 6,
      filterGroup: 'quarterly',
      category: 'maintenance',
      serviceType: 'Battery / electrical',
      description: 'A battery test checks voltage, cold cranking amps, and overall health. Most auto batteries last 3–5 years, but extreme temperatures and short trips shorten their life.',
      whyItMatters: 'A dead battery leaves you stranded. Battery failures are the #1 reason for roadside assistance calls. Testing lets you replace it on your schedule instead of in an emergency.',
      icon: 'zap'
    },
    {
      key: 'wiper_blades',
      name: 'Wiper Blades',
      frequency: 'Every 6–12 months',
      intervalMiles: null,
      intervalMonths: 9,
      filterGroup: 'annually',
      category: 'maintenance',
      serviceType: 'Belt / hose replacement',
      description: 'Windshield wipers are rubber blades that clear rain, snow, and debris from your windshield. Sun exposure, temperature changes, and regular use cause them to crack and lose effectiveness.',
      whyItMatters: 'Worn wipers leave streaks and blind spots during rain, reducing visibility and making driving dangerous. They can also scratch your windshield if the rubber wears through.',
      icon: 'droplets'
    },
    {
      key: 'tire_pressure',
      name: 'Tire Pressure Check',
      frequency: 'Monthly',
      intervalMiles: null,
      intervalMonths: 1,
      filterGroup: 'monthly',
      category: 'maintenance',
      serviceType: 'Tire rotation / alignment',
      description: 'Checking tire pressure ensures each tire is inflated to the manufacturer\'s recommended PSI (found on your door jamb sticker, not on the tire itself). Tires naturally lose 1–2 PSI per month.',
      whyItMatters: 'Under-inflated tires increase fuel consumption by up to 3%, wear out faster, and are more prone to blowouts. Over-inflated tires reduce traction and lead to uneven wear.',
      icon: 'gauge'
    },
    {
      key: 'coolant_flush',
      name: 'Coolant Flush',
      frequency: 'Every 30,000 miles or 5 years',
      intervalMiles: 30000,
      intervalMonths: 60,
      filterGroup: 'mileage',
      category: 'maintenance',
      serviceType: 'Oil change / fluids',
      description: 'A coolant flush drains the old antifreeze/coolant from your system and replaces it with fresh fluid. Coolant keeps your engine from overheating in summer and freezing in winter.',
      whyItMatters: 'Old coolant loses its corrosion protection, leading to rust inside your radiator and engine. An overheating engine from coolant failure can cause a blown head gasket ($1,500+).',
      icon: 'thermometer'
    },
    {
      key: 'transmission_service',
      name: 'Transmission Service',
      frequency: 'Every 30,000–60,000 miles',
      intervalMiles: 45000,
      intervalMonths: null,
      filterGroup: 'mileage',
      category: 'maintenance',
      serviceType: 'Transmission service',
      description: 'Transmission service replaces the fluid (and sometimes the filter) in your transmission. This fluid keeps gears shifting smoothly in both automatic and manual transmissions.',
      whyItMatters: 'Neglected transmission fluid breaks down and can\'t properly lubricate or cool the gears. Transmission replacement costs $2,500–$5,000+ — one of the most expensive repairs.',
      icon: 'settings'
    },
    {
      key: 'spark_plugs',
      name: 'Spark Plugs',
      frequency: 'Every 30,000–100,000 miles',
      intervalMiles: 60000,
      intervalMonths: null,
      filterGroup: 'mileage',
      category: 'maintenance',
      serviceType: 'Spark plugs',
      description: 'Spark plugs create the electrical spark that ignites the fuel-air mixture in your engine. Modern iridium or platinum plugs last much longer than older copper ones.',
      whyItMatters: 'Worn spark plugs cause misfires, rough idling, poor acceleration, and reduced fuel economy. Ignoring them can damage your catalytic converter ($1,000–$2,500 to replace).',
      icon: 'zap'
    },
    {
      key: 'serpentine_belt',
      name: 'Serpentine Belt',
      frequency: 'Every 60,000–100,000 miles',
      intervalMiles: 75000,
      intervalMonths: null,
      filterGroup: 'mileage',
      category: 'maintenance',
      serviceType: 'Belt / hose replacement',
      description: 'The serpentine belt is a single long belt that drives multiple components: your alternator, power steering pump, AC compressor, and water pump. It\'s under constant tension and wears over time.',
      whyItMatters: 'A snapped serpentine belt disables your alternator, power steering, and AC all at once. If the water pump stops too, your engine can overheat within minutes.',
      icon: 'settings'
    }
  ],
  cosmetic: [
    {
      key: 'quick_wash',
      name: 'Quick Wash',
      frequency: 'Every 1–2 weeks',
      intervalMiles: null,
      intervalMonths: null,
      filterGroup: 'weekly',
      category: 'detailing',
      serviceType: 'Exterior wash',
      description: 'A quick exterior wash removes road grime, bird droppings, bug splatter, and surface contaminants before they can damage your paint. Hand wash is gentler than automatic car washes.',
      whyItMatters: 'Contaminants like bird droppings and tree sap are acidic and will etch into your clear coat within days, causing permanent paint damage that requires professional correction.',
      icon: 'droplets'
    },
    {
      key: 'interior_clean',
      name: 'Interior Vacuum & Wipe-Down',
      frequency: 'Every 2–4 weeks',
      intervalMiles: null,
      intervalMonths: 1,
      filterGroup: 'monthly',
      category: 'detailing',
      serviceType: 'Interior cleaning',
      description: 'A basic interior cleaning includes vacuuming seats and carpets, wiping down the dashboard and controls, and cleaning glass surfaces. It keeps your cabin fresh and comfortable.',
      whyItMatters: 'Dirt and debris grind into upholstery and carpet fibers, causing premature wear. Neglected interiors also harbor bacteria, allergens, and odors that are harder to remove over time.',
      icon: 'sparkles'
    },
    {
      key: 'wax_sealant',
      name: 'Wax or Paint Sealant',
      frequency: 'Every 3–6 months',
      intervalMiles: null,
      intervalMonths: 4,
      filterGroup: 'quarterly',
      category: 'detailing',
      serviceType: 'Wax / polish',
      description: 'Wax or synthetic sealant creates a protective layer over your paint that repels water, blocks UV rays, and makes the surface easier to clean. Think of it as sunscreen for your car.',
      whyItMatters: 'Without protection, UV rays fade and oxidize your paint over 2–3 years. A protected finish maintains resale value — detailing experts estimate well-maintained paint adds $500–$1,500 to resale.',
      icon: 'shield'
    },
    {
      key: 'full_detail',
      name: 'Full Detail',
      frequency: 'Every 4–6 months',
      intervalMiles: null,
      intervalMonths: 5,
      filterGroup: 'quarterly',
      category: 'detailing',
      serviceType: 'Full detail package',
      description: 'A full detail is a comprehensive cleaning inside and out: clay bar treatment, paint correction, polish, wax/sealant, interior deep clean, leather conditioning, and more.',
      whyItMatters: 'Regular detailing is the single best thing you can do for your vehicle\'s appearance and resale value. A well-maintained car can be worth thousands more at trade-in time.',
      icon: 'star'
    },
    {
      key: 'headlight_restoration',
      name: 'Headlight Restoration',
      frequency: 'Every 2–3 years as needed',
      intervalMiles: null,
      intervalMonths: 30,
      filterGroup: 'annually',
      category: 'cosmetic',
      serviceType: 'Headlight restoration',
      description: 'Over time, plastic headlight lenses turn yellow and hazy from UV exposure. Restoration involves wet sanding, polishing, and sealing to bring back clarity.',
      whyItMatters: 'Cloudy headlights reduce light output by up to 80%, seriously compromising night visibility. It\'s also a common reason for failed vehicle inspections in many states.',
      icon: 'lightbulb'
    },
    {
      key: 'engine_bay_cleaning',
      name: 'Engine Bay Cleaning',
      frequency: 'Every 6–12 months',
      intervalMiles: null,
      intervalMonths: 9,
      filterGroup: 'annually',
      category: 'detailing',
      serviceType: 'Engine bay cleaning',
      description: 'Engine bay cleaning removes accumulated grease, dirt, and road debris from under the hood. A clean engine bay makes it easier to spot leaks and maintain components.',
      whyItMatters: 'Built-up grease and debris can hide fluid leaks, corrode wiring, and in rare cases become a fire risk. A clean engine bay also impresses buyers at resale time.',
      icon: 'settings'
    },
    {
      key: 'tire_dressing',
      name: 'Tire Dressing',
      frequency: 'Every 1–2 months',
      intervalMiles: null,
      intervalMonths: 2,
      filterGroup: 'monthly',
      category: 'detailing',
      serviceType: 'Full detail package',
      description: 'Tire dressing is a protectant applied to tire sidewalls that restores the deep black look and shields rubber from UV damage and dry rot (sometimes called "browning").',
      whyItMatters: 'UV exposure causes tire rubber to dry out, crack, and "brown" over time. Regular protection extends tire life and keeps your vehicle looking sharp with minimal effort.',
      icon: 'circle'
    }
  ]
};

const CARE_KEY_TO_REMINDER_TYPE = {
  oil_change: 'oil_change',
  tire_rotation: 'tire_rotation',
  brake_inspection: 'brake_check',
  battery_test: 'maintenance',
  wiper_blades: 'maintenance',
  cabin_air_filter: 'maintenance',
  engine_air_filter: 'maintenance',
  coolant_flush: 'maintenance',
  transmission_service: 'maintenance',
  spark_plugs: 'maintenance',
  serpentine_belt: 'maintenance'
};

let careGuideActiveTab = 'mechanical';
let careGuideFilter = 'all';
let careGuideSelectedVehicle = null;
let careGuideHighlightKey = null;

function renderCareGuide() {
  const container = document.getElementById('care-guide-panel');
  if (!container) return;

  const vehicleSelector = buildCareVehicleSelector();
  const healthSummary = buildCareHealthSummary();
  const filterBar = buildCareFilterBar();
  const tabBar = buildCareTabBar();
  const cards = buildCareCards();

  container.innerHTML = vehicleSelector + healthSummary + tabBar + filterBar + cards;
}

function buildCareVehicleSelector() {
  if (typeof vehicles === 'undefined' || !vehicles || vehicles.length === 0) {
    return `<div class="care-vehicle-selector" style="margin-bottom:20px;padding:16px 20px;background:var(--bg-input);border-radius:var(--radius-lg);display:flex;align-items:center;gap:12px;">
      <span style="color:var(--text-muted);font-size:0.9rem;">Add a vehicle in <a href="#" onclick="showSection('vehicles');return false;" style="color:var(--accent-gold);">My Vehicles</a> to see personalized care info.</span>
    </div>`;
  }

  if (!careGuideSelectedVehicle && vehicles.length > 0) {
    careGuideSelectedVehicle = vehicles[0].id;
  }

  const options = vehicles.map(v => {
    const name = v.nickname || `${v.year || ''} ${v.make} ${v.model}`.trim();
    const selected = v.id === careGuideSelectedVehicle ? 'selected' : '';
    return `<option value="${v.id}" ${selected}>${name}</option>`;
  }).join('');

  return `<div class="care-vehicle-selector" style="margin-bottom:20px;padding:16px 20px;background:linear-gradient(135deg,rgba(212,168,85,0.08),rgba(212,168,85,0.02));border:1px solid rgba(212,168,85,0.2);border-radius:var(--radius-lg);display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
    <span style="font-weight:600;color:var(--text-primary);font-size:0.95rem;">Personalize for:</span>
    <select id="care-guide-vehicle-select" onchange="onCareVehicleChange(this.value)" style="padding:8px 14px;border-radius:var(--radius-md);border:1px solid var(--border-subtle);background:var(--bg-card);color:var(--text-primary);font-size:0.9rem;min-width:200px;">
      ${options}
    </select>
  </div>`;
}

function getSelectedCareVehicle() {
  if (!careGuideSelectedVehicle || typeof vehicles === 'undefined') return null;
  return vehicles.find(v => v.id === careGuideSelectedVehicle) || null;
}

function buildCareHealthSummary() {
  const vehicle = getSelectedCareVehicle();
  if (!vehicle) return '';

  let overdueCount = 0;
  let dueCount = 0;
  let okCount = 0;

  if (typeof reminders !== 'undefined' && Array.isArray(reminders)) {
    const vehicleReminders = reminders.filter(r => r.vehicleId === vehicle.id);
    vehicleReminders.forEach(r => {
      if (r.status === 'overdue') overdueCount++;
      else if (r.status === 'due') dueCount++;
      else okCount++;
    });
  }

  const total = overdueCount + dueCount + okCount;
  if (total === 0) return '';

  const vehicleName = vehicle.nickname || `${vehicle.year || ''} ${vehicle.make} ${vehicle.model}`.trim();

  return `<div class="care-health-summary" style="margin-bottom:20px;display:grid;grid-template-columns:repeat(auto-fit, minmax(120px, 1fr));gap:12px;">
    <div style="padding:14px 16px;background:${overdueCount > 0 ? 'rgba(239,95,95,0.1)' : 'var(--bg-input)'};border:1px solid ${overdueCount > 0 ? 'rgba(239,95,95,0.3)' : 'var(--border-subtle)'};border-radius:var(--radius-md);text-align:center;cursor:pointer;" onclick="showSection('maintenance-schedule')">
      <div style="font-size:1.5rem;font-weight:700;color:var(--accent-red);">${overdueCount}</div>
      <div style="font-size:0.78rem;color:var(--text-muted);">Overdue</div>
    </div>
    <div style="padding:14px 16px;background:${dueCount > 0 ? 'rgba(255,159,67,0.1)' : 'var(--bg-input)'};border:1px solid ${dueCount > 0 ? 'rgba(255,159,67,0.3)' : 'var(--border-subtle)'};border-radius:var(--radius-md);text-align:center;cursor:pointer;" onclick="showSection('maintenance-schedule')">
      <div style="font-size:1.5rem;font-weight:700;color:var(--accent-orange);">${dueCount}</div>
      <div style="font-size:0.78rem;color:var(--text-muted);">Due Soon</div>
    </div>
    <div style="padding:14px 16px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:var(--radius-md);text-align:center;">
      <div style="font-size:1.5rem;font-weight:700;color:var(--accent-green);">${okCount}</div>
      <div style="font-size:0.78rem;color:var(--text-muted);">Up to Date</div>
    </div>
  </div>`;
}

function buildCareTabBar() {
  return `<div class="care-tabs" style="display:flex;gap:0;margin-bottom:16px;border-bottom:2px solid var(--border-subtle);">
    <button class="care-tab ${careGuideActiveTab === 'mechanical' ? 'active' : ''}" onclick="switchCareTab('mechanical')" style="flex:1;padding:12px 16px;border:none;background:none;color:${careGuideActiveTab === 'mechanical' ? 'var(--accent-gold)' : 'var(--text-muted)'};font-weight:${careGuideActiveTab === 'mechanical' ? '600' : '400'};font-size:0.95rem;cursor:pointer;border-bottom:2px solid ${careGuideActiveTab === 'mechanical' ? 'var(--accent-gold)' : 'transparent'};margin-bottom:-2px;transition:all 0.2s;">
      ${typeof mccIcon === 'function' ? mccIcon('wrench', 16) : ''} Mechanical & Safety
    </button>
    <button class="care-tab ${careGuideActiveTab === 'cosmetic' ? 'active' : ''}" onclick="switchCareTab('cosmetic')" style="flex:1;padding:12px 16px;border:none;background:none;color:${careGuideActiveTab === 'cosmetic' ? 'var(--accent-gold)' : 'var(--text-muted)'};font-weight:${careGuideActiveTab === 'cosmetic' ? '600' : '400'};font-size:0.95rem;cursor:pointer;border-bottom:2px solid ${careGuideActiveTab === 'cosmetic' ? 'var(--accent-gold)' : 'transparent'};margin-bottom:-2px;transition:all 0.2s;">
      ${typeof mccIcon === 'function' ? mccIcon('sparkles', 16) : ''} Appearance & Cosmetic
    </button>
  </div>`;
}

function buildCareFilterBar() {
  const filters = [
    { key: 'all', label: 'All' },
    { key: 'weekly', label: 'Weekly' },
    { key: 'monthly', label: 'Monthly' },
    { key: 'quarterly', label: 'Quarterly' },
    { key: 'annually', label: 'Annually' },
    { key: 'mileage', label: 'Mileage-Based' }
  ];

  return `<div class="care-filter-bar" style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;">
    ${filters.map(f => `<button class="btn ${careGuideFilter === f.key ? 'btn-primary' : 'btn-ghost'}" onclick="filterCareGuide('${f.key}')" style="padding:6px 14px;font-size:0.82rem;border-radius:20px;">${f.label}</button>`).join('')}
  </div>`;
}

function buildCareCards() {
  const services = CARE_GUIDE_SERVICES[careGuideActiveTab] || [];
  const filtered = careGuideFilter === 'all' ? services : services.filter(s => s.filterGroup === careGuideFilter);

  if (filtered.length === 0) {
    return `<div style="text-align:center;padding:40px;color:var(--text-muted);">No services match this filter.</div>`;
  }

  const vehicle = getSelectedCareVehicle();
  const mileage = vehicle?.current_mileage || vehicle?.mileage || null;
  const vehicleName = vehicle ? (vehicle.nickname || `${vehicle.year || ''} ${vehicle.make} ${vehicle.model}`.trim()) : null;

  return `<div class="care-cards-grid" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(300px, 1fr));gap:16px;margin-bottom:32px;">
    ${filtered.map(s => buildSingleCareCard(s, vehicle, mileage, vehicleName)).join('')}
  </div>`;
}

function buildSingleCareCard(service, vehicle, mileage, vehicleName) {
  const isHighlighted = careGuideHighlightKey === service.key;
  const iconHtml = typeof mccIcon === 'function' ? mccIcon(service.icon, 20) : '';

  let mileageHint = '';
  if (mileage && service.intervalMiles) {
    const lastServiceMileage = getLastServiceMileage(service.key, vehicle?.id);
    if (lastServiceMileage !== null) {
      const milesSince = mileage - lastServiceMileage;
      const milesUntil = service.intervalMiles - milesSince;
      if (milesUntil <= 0) {
        mileageHint = `<div style="color:var(--accent-red);font-size:0.8rem;font-weight:600;margin-top:6px;">Overdue by ~${Math.abs(milesUntil).toLocaleString()} miles</div>`;
      } else if (milesUntil < service.intervalMiles * 0.2) {
        mileageHint = `<div style="color:var(--accent-orange);font-size:0.8rem;margin-top:6px;">Due in ~${milesUntil.toLocaleString()} miles</div>`;
      } else {
        mileageHint = `<div style="color:var(--accent-green);font-size:0.8rem;margin-top:6px;">~${milesUntil.toLocaleString()} miles until next service</div>`;
      }
    } else if (vehicleName) {
      const approxDue = service.intervalMiles - (mileage % service.intervalMiles);
      if (approxDue <= service.intervalMiles * 0.15) {
        mileageHint = `<div style="color:var(--accent-orange);font-size:0.8rem;margin-top:6px;">Your ${vehicleName}: likely due in ~${approxDue.toLocaleString()} miles (no service record)</div>`;
      } else {
        mileageHint = `<div style="color:var(--text-muted);font-size:0.78rem;margin-top:6px;">Your ${vehicleName}: every ${service.intervalMiles.toLocaleString()} mi &mdash; due in ~${approxDue.toLocaleString()} mi</div>`;
      }
    }
  }

  return `<div id="care-card-${service.key}" class="care-card" style="background:var(--bg-card);border:${isHighlighted ? '2px solid var(--accent-gold)' : '1px solid var(--border-subtle)'};border-radius:var(--radius-lg);padding:20px;transition:all 0.3s;${isHighlighted ? 'box-shadow:0 0 16px rgba(212,168,85,0.3);' : ''}">
    <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:12px;">
      <span style="flex-shrink:0;color:var(--accent-gold);margin-top:2px;">${iconHtml}</span>
      <div style="flex:1;">
        <div style="font-weight:600;font-size:1rem;color:var(--text-primary);margin-bottom:4px;">${service.name}</div>
        <div style="font-size:0.82rem;color:var(--accent-teal);font-weight:500;">${service.frequency}</div>
        ${mileageHint}
      </div>
    </div>
    <p style="font-size:0.88rem;color:var(--text-secondary);line-height:1.6;margin:0 0 12px;">${service.description}</p>
    <details class="care-why-details" style="margin-bottom:14px;">
      <summary style="cursor:pointer;font-size:0.85rem;font-weight:600;color:var(--accent-gold);user-select:none;padding:8px 0;">Why it matters</summary>
      <p style="font-size:0.85rem;color:var(--text-secondary);line-height:1.6;margin:8px 0 0;padding-left:4px;">${service.whyItMatters}</p>
    </details>
    <button class="btn btn-primary btn-sm" onclick="getQuotesFromCareGuide('${service.name}', '${service.category}', '${service.serviceType}')" style="width:100%;padding:10px;font-size:0.88rem;">
      ${typeof mccIcon === 'function' ? mccIcon('message-square', 14) : ''} Get Quotes
    </button>
  </div>`;
}

function getLastServiceMileage(careKey, vehicleId) {
  if (!vehicleId || typeof reminders === 'undefined' || !Array.isArray(reminders)) return null;
  const reminderType = CARE_KEY_TO_REMINDER_TYPE[careKey];
  if (!reminderType) return null;
  const matching = reminders.filter(r => r.vehicleId === vehicleId && r.type === reminderType);
  if (matching.length === 0) return null;
  const withMileage = matching.filter(r => r.dueMileage);
  if (withMileage.length === 0) return null;
  return Math.max(...withMileage.map(r => r.dueMileage - (CARE_GUIDE_SERVICES.mechanical.find(s => s.key === careKey)?.intervalMiles || 0)));
}

function switchCareTab(tab) {
  careGuideActiveTab = tab;
  careGuideFilter = 'all';
  renderCareGuide();
}

function filterCareGuide(filter) {
  careGuideFilter = filter;
  renderCareGuide();
}

function onCareVehicleChange(vehicleId) {
  careGuideSelectedVehicle = vehicleId;
  renderCareGuide();
  updateArticleRelevanceBadges();
}

function getQuotesFromCareGuide(title, category, serviceType) {
  if (typeof openPackageModal !== 'function') {
    if (typeof showToast === 'function') showToast('Package creation not available', 'error');
    return;
  }
  openPackageModal();
  setTimeout(() => {
    const titleInput = document.getElementById('p-title');
    const categorySelect = document.getElementById('p-category');
    if (titleInput) titleInput.value = title;
    if (categorySelect) {
      categorySelect.value = category;
      categorySelect.dispatchEvent(new Event('change'));
    }
    const serviceTypeSelect = document.getElementById('p-service-type');
    if (serviceTypeSelect) {
      const options = Array.from(serviceTypeSelect.options);
      const match = options.find(o => o.textContent.trim() === serviceType);
      if (match) serviceTypeSelect.value = match.value;
    }
  }, 200);
}

function _openAcademyCareCardFull(key) {
  const allServices = [...CARE_GUIDE_SERVICES.mechanical, ...CARE_GUIDE_SERVICES.cosmetic];
  const service = allServices.find(s => s.key === key);
  if (!service) return;

  const tab = CARE_GUIDE_SERVICES.mechanical.includes(service) ? 'mechanical' : 'cosmetic';
  careGuideActiveTab = tab;
  careGuideFilter = 'all';
  careGuideHighlightKey = key;

  renderCareGuide();
  setTimeout(() => {
    const card = document.getElementById(`care-card-${key}`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const details = card.querySelector('details');
      if (details) details.open = true;
    }
    setTimeout(() => {
      careGuideHighlightKey = null;
    }, 4000);
  }, 100);
}

function getCareKeyForCategory(categoryOrType) {
  if (!categoryOrType) return null;
  const normalized = categoryOrType.toLowerCase().replace(/[^a-z]/g, ' ').trim();
  const allServices = [...CARE_GUIDE_SERVICES.mechanical, ...CARE_GUIDE_SERVICES.cosmetic];

  for (const s of allServices) {
    if (s.key === normalized.replace(/ /g, '_')) return s.key;
    if (s.name.toLowerCase() === normalized) return s.key;
    if (s.serviceType && s.serviceType.toLowerCase().includes(normalized)) return s.key;
  }

  const keywords = {
    oil: 'oil_change',
    'oil change': 'oil_change',
    tire: 'tire_rotation',
    'tire rotation': 'tire_rotation',
    brake: 'brake_inspection',
    battery: 'battery_test',
    wiper: 'wiper_blades',
    coolant: 'coolant_flush',
    transmission: 'transmission_service',
    'spark plug': 'spark_plugs',
    belt: 'serpentine_belt',
    'air filter': 'engine_air_filter',
    'cabin filter': 'cabin_air_filter',
    wash: 'quick_wash',
    detail: 'full_detail',
    wax: 'wax_sealant',
    headlight: 'headlight_restoration',
    engine: 'engine_bay_cleaning'
  };

  for (const [kw, key] of Object.entries(keywords)) {
    if (normalized.includes(kw)) return key;
  }
  return null;
}

function updateArticleRelevanceBadges() {
  const vehicle = getSelectedCareVehicle();
  if (!vehicle) return;

  const mileage = vehicle.current_mileage || vehicle.mileage || 0;

  const rideshareCard = document.querySelector('[onclick*="showLearnCategory(\'rideshare\')"]');
  if (rideshareCard) {
    const existingBadge = rideshareCard.querySelector('.relevance-badge');
    if (existingBadge) existingBadge.remove();
    if (mileage >= 80000) {
      const badge = document.createElement('span');
      badge.className = 'relevance-badge';
      badge.style.cssText = 'display:inline-block;background:var(--accent-teal-soft);color:var(--accent-teal);border:1px solid rgba(34,211,238,0.3);padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:600;margin-top:6px;';
      badge.textContent = 'Relevant for your vehicle';
      rideshareCard.appendChild(badge);
    }
  }

  const commercialCard = document.querySelector('[onclick*="showLearnCategory(\'commercial\')"]');
  if (commercialCard) {
    const existingBadge = commercialCard.querySelector('.relevance-badge');
    if (existingBadge) existingBadge.remove();
    const vType = (vehicle.vehicle_type || vehicle.type || '').toLowerCase();
    if (vType.includes('commercial') || vType.includes('fleet') || vType.includes('van') || vType.includes('truck')) {
      const badge = document.createElement('span');
      badge.className = 'relevance-badge';
      badge.style.cssText = 'display:inline-block;background:var(--accent-teal-soft);color:var(--accent-teal);border:1px solid rgba(34,211,238,0.3);padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:600;margin-top:6px;';
      badge.textContent = 'Relevant for your vehicle';
      commercialCard.appendChild(badge);
    }
  }
}

window.renderCareGuide = renderCareGuide;
window.switchCareTab = switchCareTab;
window.filterCareGuide = filterCareGuide;
window.onCareVehicleChange = onCareVehicleChange;
window.getQuotesFromCareGuide = getQuotesFromCareGuide;
window._openAcademyCareCardFull = _openAcademyCareCardFull;
window.updateArticleRelevanceBadges = updateArticleRelevanceBadges;
window.CARE_GUIDE_SERVICES = CARE_GUIDE_SERVICES;
