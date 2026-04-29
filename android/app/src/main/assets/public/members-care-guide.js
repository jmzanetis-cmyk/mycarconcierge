(function() {
  const CARE_GUIDE_SERVICES = {
    mechanical: [
      {
        key: 'oil_change',
        name: 'Oil Change',
        frequency: 'Every 5,000–10,000 miles or 6 months',
        intervalMiles: 7500,
        intervalMonths: 6,
        filterGroup: 'mileage',
        serviceType: 'Oil change / fluids',
        costRange: '$35–$120',
        icon: 'fuel',
        description: 'An oil change replaces dirty engine oil and the filter with fresh oil. Engine oil lubricates, cools, and cleans all the moving metal parts inside your engine.',
        whyItMatters: 'Skipping oil changes lets sludge build up inside your engine. Over time this causes excessive wear, overheating, and can lead to full engine failure costing $3,000–$7,000 to replace.',
        warningSigns: [
          'Dark brown or black oil on the dipstick',
          'Oil pressure warning light on the dash',
          'Engine knocking or ticking sounds at startup',
          'Burning oil smell from under the hood',
          'More than 7,500 miles since your last change'
        ],
        tips: [
          'Check your oil level monthly with the dipstick — low oil causes rapid wear.',
          'Synthetic oil lasts longer and performs better in extreme temperatures.',
          'Always replace the oil filter with every change.',
          'Keep service receipts — documented history increases resale value.'
        ]
      },
      {
        key: 'tire_rotation',
        name: 'Tire Rotation',
        frequency: 'Every 5,000–7,500 miles',
        intervalMiles: 6000,
        intervalMonths: null,
        filterGroup: 'mileage',
        serviceType: 'Tire rotation / alignment',
        costRange: '$25–$65',
        icon: 'settings',
        description: 'Tire rotation moves each tire to a different position so they wear evenly. Front tires handle steering and typically wear faster than rears.',
        whyItMatters: 'Uneven wear can cut tire life in half. Well-rotated tires also improve handling and are safer in wet conditions — a set of tires costs $400–$1,200, rotation costs $25–$65.',
        warningSigns: [
          'Visible uneven wear (one side more worn than the other)',
          'Vibration or shaking in the steering wheel at highway speeds',
          'Vehicle pulling to one side when driving straight',
          'TPMS light on (check pressure first, then rotation)',
          'More than 7,500 miles since last rotation'
        ],
        tips: [
          'Rotate tires every oil change — it takes the shop 15 minutes.',
          'Check tire pressure at every rotation — cold tires should match door jamb sticker.',
          'Ask for an alignment check with each rotation after 30,000 miles.',
          'Rotate even if one tire looks fine — prevention costs less than replacement.'
        ]
      },
      {
        key: 'brake_inspection',
        name: 'Brake Service',
        frequency: 'Inspect annually · Pads every 25,000–65,000 miles',
        intervalMiles: 30000,
        intervalMonths: 12,
        filterGroup: 'annually',
        serviceType: 'Brake service',
        costRange: '$150–$400 per axle',
        icon: 'circle-alert',
        description: 'Brake service includes inspecting and replacing brake pads, rotors, calipers, and fluid. Your brakes are the most critical safety system on your vehicle.',
        whyItMatters: 'Worn pads grind into rotors, turning a $150–$300 pad replacement into a $400–$800 pad-plus-rotor job. Failing brakes dramatically increase stopping distances.',
        warningSigns: [
          'Squealing or squeaking when braking (wear indicator)',
          'Grinding or metal-on-metal sound (urgent — rotor damage)',
          'Brake pedal feels soft, spongy, or sinks to the floor',
          'Vehicle pulls to one side when braking',
          'ABS or brake warning light on the dash'
        ],
        tips: [
          'Brake gently when possible — heavy braking wears pads 3–4x faster.',
          'Have brake fluid tested every 2 years — it absorbs moisture and reduces performance.',
          'If you hear grinding, stop driving and get inspected immediately.',
          'Replace pads in axle pairs — both fronts or both rears together.'
        ]
      },
      {
        key: 'cabin_air_filter',
        name: 'Cabin Air Filter',
        frequency: 'Every 15,000–25,000 miles or annually',
        intervalMiles: 20000,
        intervalMonths: 12,
        filterGroup: 'annually',
        serviceType: 'Belt / hose replacement',
        costRange: '$20–$70 (often DIY)',
        icon: 'wind',
        description: 'The cabin air filter cleans the air entering your passenger compartment through the vents and AC system, trapping dust, pollen, and pollutants.',
        whyItMatters: 'A clogged cabin filter reduces airflow, makes your AC work harder (hurting fuel economy and comfort), and allows allergens and pollutants into the cabin — especially problematic for allergy sufferers.',
        warningSigns: [
          'Reduced airflow from vents even on high fan setting',
          'Musty or dusty smell when the fan is running',
          'Increased allergy symptoms inside the vehicle',
          'AC not cooling as effectively as it used to',
          'More than 15,000 miles or 12 months since last replacement'
        ],
        tips: [
          'Check your cabin filter with the glove box open — it usually lives behind it.',
          'Cabin filter replacement is often a 5-minute DIY job — YouTube your exact model.',
          'Replace more frequently if you drive in dusty or high-pollen environments.',
          'Don\'t confuse cabin filter with engine air filter — they serve different purposes.'
        ]
      },
      {
        key: 'engine_air_filter',
        name: 'Engine Air Filter',
        frequency: 'Every 15,000–30,000 miles',
        intervalMiles: 20000,
        intervalMonths: null,
        filterGroup: 'mileage',
        serviceType: 'Engine tune-up',
        costRange: '$20–$80',
        icon: 'settings',
        description: 'The engine air filter prevents dirt and debris from entering your engine\'s combustion chamber. Your engine needs approximately 10,000 gallons of air for every gallon of fuel burned.',
        whyItMatters: 'A dirty air filter reduces engine power and fuel economy by up to 10%. In severe cases, contaminants bypass the filter and damage engine internals — turning a $30 part into a major repair.',
        warningSigns: [
          'Reduced engine power or sluggish acceleration',
          'Decreased fuel economy (more fill-ups than usual)',
          'Check engine light, especially with P0101, P0171, P0174 codes',
          'Black smoke from the exhaust on hard acceleration',
          'Visibly dirty or clogged filter on inspection'
        ],
        tips: [
          'Inspect your engine air filter at every oil change — just pull it out and look at it.',
          'Driving on unpaved roads shortens filter life significantly.',
          'Engine air filter replacement is a simple DIY job — no tools needed on most vehicles.',
          'A performance cold-air intake can improve airflow — but stock replacement is fine for daily driving.'
        ]
      },
      {
        key: 'battery_test',
        name: 'Battery & Electrical',
        frequency: 'Test every 6 months · Replace every 3–5 years',
        intervalMiles: null,
        intervalMonths: 6,
        filterGroup: 'quarterly',
        serviceType: 'Battery / electrical',
        costRange: '$0 test · $100–$250 replacement',
        icon: 'zap',
        description: 'A battery test checks voltage, cold cranking amps, and overall health. Most auto batteries last 3–5 years, but extreme temperatures and short trips shorten their life dramatically.',
        whyItMatters: 'A dead battery is the #1 cause of roadside assistance calls. Battery failures happen without warning, usually in cold weather. Testing lets you replace it on your schedule instead of the worst possible moment.',
        warningSigns: [
          'Engine cranks slowly when starting (especially in cold weather)',
          'Battery warning light on the dash',
          'Electrical accessories behaving erratically',
          'Headlights dim noticeably at idle',
          'Battery is 4 or more years old'
        ],
        tips: [
          'Most auto parts stores test your battery for free — takes 5 minutes.',
          'Clean white or blue corrosion from terminals with baking soda and water.',
          'Short commutes prevent full recharging — a trickle charger extends battery life.',
          'Keep jumper cables or a compact jump starter in your vehicle.'
        ]
      },
      {
        key: 'wiper_blades',
        name: 'Wiper Blades',
        frequency: 'Every 6–12 months',
        intervalMiles: null,
        intervalMonths: 9,
        filterGroup: 'annually',
        serviceType: 'Belt / hose replacement',
        costRange: '$20–$60',
        icon: 'droplets',
        description: 'Windshield wipers are rubber blades that clear rain, snow, and debris. UV exposure, temperature swings, and regular use cause them to crack and lose effectiveness over time.',
        whyItMatters: 'Worn wipers leave streaks and blind spots during rain, reducing visibility and making driving dangerous. They can also scratch your windshield if the rubber tears through — a windshield replacement costs $200–$600.',
        warningSigns: [
          'Streaking, skipping, or chattering across the windshield',
          'Squeaking sound when wipers run on wet glass',
          'Wiper leaving uncleaned arcs or patches',
          'Visible cracks or splits in the rubber blade',
          'More than 12 months since last replacement'
        ],
        tips: [
          'Replace blades before rainy season — not during it when you need them most.',
          'Lift wiper arms away from the glass before freezing weather to prevent rubber tearing.',
          'Use a washer fluid rated for your climate — frozen fluid is a safety hazard.',
          'Repair windshield chips immediately — most are covered by insurance with no deductible.'
        ]
      },
      {
        key: 'tire_pressure',
        name: 'Tire Pressure Check',
        frequency: 'Monthly',
        intervalMiles: null,
        intervalMonths: 1,
        filterGroup: 'monthly',
        serviceType: 'Tire rotation / alignment',
        costRange: 'Free',
        icon: 'gauge',
        description: 'Checking tire pressure ensures each tire is inflated to the manufacturer\'s recommended PSI, found on your door jamb sticker — not on the tire sidewall. Tires naturally lose 1–2 PSI per month.',
        whyItMatters: 'Under-inflated tires increase fuel consumption by up to 3%, wear out faster, and are more prone to blowouts at highway speeds. Over-inflated tires reduce traction and cause uneven center wear.',
        warningSigns: [
          'TPMS warning light on the dashboard',
          'Vehicle handling feels different or floaty',
          'One corner of the vehicle looks lower than others',
          'Visible wear concentrated in the center or edges of tread',
          'More than one month since last pressure check'
        ],
        tips: [
          'Check pressure when tires are cold — driven tires read 4–6 PSI higher than actual.',
          'Tires lose 1 PSI for every 10°F temperature drop in fall and winter.',
          'A quality tire gauge costs $10 and lives in your glove box — use it monthly.',
          'Your recommended PSI is on the door jamb sticker — not the max PSI on the tire.'
        ]
      },
      {
        key: 'coolant_flush',
        name: 'Coolant Flush',
        frequency: 'Every 30,000 miles or 5 years',
        intervalMiles: 30000,
        intervalMonths: 60,
        filterGroup: 'mileage',
        serviceType: 'Oil change / fluids',
        costRange: '$80–$180',
        icon: 'thermometer',
        description: 'A coolant flush drains old antifreeze from your system and replaces it with fresh fluid. Coolant prevents overheating in summer and freezing in winter while protecting internal components.',
        whyItMatters: 'Old coolant loses corrosion inhibitors, causing rust inside your radiator and engine. An overheating engine from coolant failure can cause a blown head gasket — a repair costing $1,500–$3,000.',
        warningSigns: [
          'Temperature gauge reading higher than normal',
          'Low coolant warning light',
          'Rusty or cloudy coolant in the overflow tank',
          'Sweet smell (like maple syrup) from the engine bay',
          'Overheating in stop-and-go traffic or on hills'
        ],
        tips: [
          'Never open the coolant reservoir cap when the engine is hot — serious burn risk.',
          'Check coolant level monthly in the see-through overflow tank (not the radiator).',
          'Mix coolant with distilled water, not tap water — minerals cause corrosion.',
          'If your temperature gauge spikes while driving, pull over immediately.'
        ]
      },
      {
        key: 'transmission_service',
        name: 'Transmission Service',
        frequency: 'Every 30,000–60,000 miles',
        intervalMiles: 45000,
        intervalMonths: null,
        filterGroup: 'mileage',
        serviceType: 'Transmission service',
        costRange: '$150–$400',
        icon: 'settings',
        description: 'Transmission service replaces the fluid (and sometimes the filter) in your transmission. This fluid keeps gears shifting smoothly in both automatic and manual transmissions.',
        whyItMatters: 'Neglected transmission fluid breaks down under heat and can\'t properly lubricate or cool internal gears. A transmission rebuild or replacement costs $2,500–$5,000+ — one of the most expensive repairs on any vehicle.',
        warningSigns: [
          'Slipping gears or delayed engagement (RPMs rise but speed doesn\'t)',
          'Rough, jerky, or hard shifts between gears',
          'Whining or clunking sounds from under the vehicle',
          'Dark brown or burnt-smelling transmission fluid',
          'Check engine or transmission warning light'
        ],
        tips: [
          'Check transmission fluid color and smell — healthy fluid is pink or red, not dark brown.',
          'Use only the manufacturer-specified fluid type — using the wrong type causes damage.',
          'Many sealed modern transmissions are "lifetime fill" — check your owner\'s manual.',
          'Avoid towing or severe duty use until fresh fluid is in the transmission.'
        ]
      },
      {
        key: 'spark_plugs',
        name: 'Spark Plugs',
        frequency: 'Every 30,000–100,000 miles',
        intervalMiles: 60000,
        intervalMonths: null,
        filterGroup: 'mileage',
        serviceType: 'Spark plugs',
        costRange: '$120–$350',
        icon: 'zap',
        description: 'Spark plugs create the electrical spark that ignites the fuel-air mixture in each cylinder. Modern iridium or platinum plugs last much longer than older copper ones.',
        whyItMatters: 'Worn spark plugs cause misfires, rough idling, poor acceleration, and reduced fuel economy. Ignoring them can damage your catalytic converter — a $1,000–$2,500 repair — from unburned fuel.',
        warningSigns: [
          'Rough idle or engine vibration at a stop',
          'Hesitation or stumbling on acceleration',
          'Reduced fuel economy',
          'Check engine light with P0300–P0308 misfire codes',
          'Hard starting, especially in cold weather'
        ],
        tips: [
          'Iridium and platinum plugs last much longer than copper — worth the extra cost.',
          'Replace all plugs at once, not just the misfiring cylinder.',
          'Use a torque wrench when installing plugs — over-tightening breaks the ceramic.',
          'Anti-seize compound on threads prevents plugs from seizing in aluminum heads.'
        ]
      },
      {
        key: 'serpentine_belt',
        name: 'Serpentine Belt',
        frequency: 'Every 60,000–100,000 miles',
        intervalMiles: 75000,
        intervalMonths: null,
        filterGroup: 'mileage',
        serviceType: 'Belt / hose replacement',
        costRange: '$150–$300',
        icon: 'settings',
        description: 'The serpentine belt drives your alternator, power steering pump, AC compressor, and water pump off the engine. It\'s a single long belt under constant tension.',
        whyItMatters: 'A snapped serpentine belt disables your alternator, power steering, and AC simultaneously. If your water pump stops, the engine can overheat in minutes, potentially causing catastrophic damage.',
        warningSigns: [
          'Squealing or chirping from the engine belt area',
          'Visible cracks or fraying on the belt surface',
          'Sudden loss of power steering assistance',
          'Battery or charging warning light (alternator driven by belt)',
          'AC suddenly stops working'
        ],
        tips: [
          'Inspect the belt at every oil change — look for cracks, fraying, or glazing.',
          'Replace the belt tensioner at the same time — it\'s cheap and prevents future failure.',
          'At 75,000 miles, replace proactively — a planned replacement is far cheaper than a breakdown.',
          'Carry a spare belt and a belt tool in your vehicle on road trips.'
        ]
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
        serviceType: 'Exterior wash',
        costRange: '$10–$30',
        icon: 'droplets',
        description: 'A quick exterior wash removes road grime, bird droppings, bug splatter, and surface contaminants before they can damage your paint and clear coat.',
        whyItMatters: 'Bird droppings and tree sap are acidic and etch permanently into clear coat within 24–72 hours. Regular washing prevents this damage and keeps your vehicle looking sharp year-round.',
        warningSigns: [
          'Visible bird droppings or tree sap on the paint',
          'Road salt or grime buildup (especially in winter)',
          'Dull or hazy appearance compared to a freshly washed car',
          'Water not beading anymore on painted surfaces',
          'More than 2 weeks since last wash'
        ],
        tips: [
          'Touchless or hand wash is gentler on paint than brush tunnel washes.',
          'Wash bird droppings off immediately — the acid etches clear coat within hours.',
          'Rinse the undercarriage in winter to remove road salt — it causes rust from below.',
          'Use a dedicated car wash soap, not dish soap — dish soap strips wax protection.'
        ]
      },
      {
        key: 'interior_clean',
        name: 'Interior Vacuum & Wipe-Down',
        frequency: 'Every 2–4 weeks',
        intervalMiles: null,
        intervalMonths: 1,
        filterGroup: 'monthly',
        serviceType: 'Interior cleaning',
        costRange: '$20–$80',
        icon: 'sparkles',
        description: 'Interior cleaning covers vacuuming seats and carpets, wiping the dashboard and controls, and cleaning windows and mirrors. It keeps the cabin fresh and comfortable.',
        whyItMatters: 'Dirt grinds into upholstery and carpet fibers, causing premature wear and permanent staining. A neglected interior also harbors bacteria, allergens, and odors that become progressively harder to remove.',
        warningSigns: [
          'Visible dirt or debris on floor mats and carpets',
          'Dust buildup on the dashboard and vents',
          'Smudges or film on interior glass surfaces',
          'Food odors or musty smell in the cabin',
          'More than one month since last interior wipe-down'
        ],
        tips: [
          'Use microfiber towels — they clean without scratching delicate surfaces.',
          'Apply a UV protectant to the dashboard to prevent sun cracking and fading.',
          'Compressed air clears debris from vents and tight spaces before wiping.',
          'Leather wipes help maintain flexibility and prevent cracking between deep cleans.'
        ]
      },
      {
        key: 'wax_sealant',
        name: 'Wax or Paint Sealant',
        frequency: 'Every 3–6 months',
        intervalMiles: null,
        intervalMonths: 4,
        filterGroup: 'quarterly',
        serviceType: 'Wax / polish',
        costRange: '$80–$250 professional · $20–$40 DIY',
        icon: 'shield',
        description: 'Wax or synthetic sealant creates a protective barrier over paint that repels water, blocks UV rays, and makes the surface easier to clean. Think of it as sunscreen and rain gear for your paint.',
        whyItMatters: 'Without protection, UV rays fade and oxidize paint in 2–3 years. A well-protected paint finish retains its gloss and can add $500–$1,500 in resale value compared to a faded, unprotected vehicle.',
        warningSigns: [
          'Water no longer beads on the paint surface',
          'Paint looks dull or hazy rather than glossy',
          'Visible oxidation or chalky appearance on dark colors',
          'Fine swirl marks visible in direct sunlight',
          'More than 4 months since last wax or sealant application'
        ],
        tips: [
          'Ceramic coating is a longer-lasting alternative — professionally applied lasts 2–5 years.',
          'Apply wax in shade with a cool panel — hot paint cures wax before it can be buffed off.',
          'Machine polish removes light swirl marks before waxing for a deeper shine.',
          'Car paint sealants last longer than traditional carnauba wax — both are effective.'
        ]
      },
      {
        key: 'full_detail',
        name: 'Full Detail',
        frequency: 'Every 4–6 months',
        intervalMiles: null,
        intervalMonths: 5,
        filterGroup: 'quarterly',
        serviceType: 'Full detail package',
        costRange: '$150–$400',
        icon: 'star',
        description: 'A full detail is a comprehensive cleaning: clay bar treatment, paint correction, polish, wax or sealant, interior deep clean, leather conditioning, and glass treatment.',
        whyItMatters: 'Regular detailing is one of the best investments for resale value. A professionally detailed vehicle shows better, holds its value longer, and can be worth thousands more at trade-in time.',
        warningSigns: [
          'Swirl marks visible on dark paint in direct sunlight',
          'Embedded dirt or clay that washing doesn\'t remove',
          'Leather seats looking dry or developing small cracks',
          'Paint protection not repelling water properly',
          'More than 6 months since a thorough detail'
        ],
        tips: [
          'Schedule a full detail before listing your vehicle for sale — ROI is excellent.',
          'Clay bar treatment removes embedded contaminants that washing cannot — do it before polishing.',
          'Interior extraction cleaning removes deep stains carpets better than surface cleaning.',
          'A paint correction removes scratches and swirls — ask for a single-stage polish for light defects.'
        ]
      },
      {
        key: 'headlight_restoration',
        name: 'Headlight Restoration',
        frequency: 'Every 2–3 years as needed',
        intervalMiles: null,
        intervalMonths: 30,
        filterGroup: 'annually',
        serviceType: 'Headlight restoration',
        costRange: '$80–$200 professional · $20 DIY kit',
        icon: 'lightbulb',
        description: 'UV exposure causes plastic headlight lenses to yellow and haze over time. Restoration involves wet sanding, polishing, and UV sealing to restore clarity.',
        whyItMatters: 'Cloudy headlights reduce light output by up to 80%, seriously compromising night visibility and safety. They are also a common reason for failed vehicle inspections in many states.',
        warningSigns: [
          'Headlights appear yellow, foggy, or hazy',
          'Noticeably reduced brightness at night',
          'Vehicle inspection failure related to lighting',
          'Other drivers flashing high beams (mistaking dim lights for low beams)',
          'Visible oxidation or peeling on the outer lens surface'
        ],
        tips: [
          'DIY restoration kits work well and cost around $20 at auto parts stores.',
          'Apply a UV sealant after restoration — without it, hazing returns within months.',
          'Professional restoration lasts longer because it includes UV coating application.',
          'Replace extremely pitted lenses — restoration won\'t fully clear severe damage.'
        ]
      },
      {
        key: 'engine_bay_cleaning',
        name: 'Engine Bay Cleaning',
        frequency: 'Every 6–12 months',
        intervalMiles: null,
        intervalMonths: 9,
        filterGroup: 'annually',
        serviceType: 'Engine bay cleaning',
        costRange: '$80–$180',
        icon: 'settings',
        description: 'Engine bay cleaning removes accumulated grease, dirt, and road debris from under the hood. A clean engine bay makes it much easier to spot fluid leaks and inspect components.',
        whyItMatters: 'Built-up grease and debris can hide fluid leaks until they become major failures. A clean engine bay impresses buyers at resale time and is a strong indicator of overall vehicle care.',
        warningSigns: [
          'Heavy grease or grime buildup visible under the hood',
          'Difficulty spotting any fluid leaks on dark, dirty surfaces',
          'Debris accumulation near hot engine components (slight fire risk)',
          'Oil or fluid spots on the driveway without a clear source',
          'More than 12 months since last engine bay cleaning'
        ],
        tips: [
          'Always clean a cold engine — heat causes cleaning products to evaporate too quickly.',
          'Cover the alternator and electrical connectors with plastic bags before using water.',
          'Let the engine dry completely before starting it after a wet cleaning.',
          'A degreaser spray + rinse combination cleans most engine bays effectively.'
        ]
      },
      {
        key: 'tire_dressing',
        name: 'Tire Dressing',
        frequency: 'Every 1–2 months',
        intervalMiles: null,
        intervalMonths: 2,
        filterGroup: 'monthly',
        serviceType: 'Full detail package',
        costRange: '$10–$40',
        icon: 'circle',
        description: 'Tire dressing is a protectant applied to tire sidewalls that restores a deep black appearance and shields rubber from UV damage and dry rot (browning).',
        whyItMatters: 'UV exposure causes tire rubber to dry out, crack, and brown prematurely. Regular protection extends sidewall life and keeps your vehicle looking sharp with minimal effort.',
        warningSigns: [
          'Tire sidewalls appearing brown or faded instead of black',
          'Dry, cracked appearance on the rubber sidewall',
          'Small surface cracks appearing on older sidewalls',
          'More than 2 months since last dressing application',
          'Tires parked outdoors in direct sunlight regularly'
        ],
        tips: [
          'Apply dressing after washing when the tire is clean and dry.',
          'Water-based dressings look more natural — solvent-based can dry out rubber over time.',
          'Apply only to the sidewall, not the tread — dressing on tread reduces grip.',
          'Even if tires aren\'t due for replacement, protect them — dry rot can cause blowouts.'
        ]
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

  function _injectStyles() {
    if (document.getElementById('care-guide-styles')) return;
    const s = document.createElement('style');
    s.id = 'care-guide-styles';
    s.textContent = `
      .care-card-highlight-anim {
        animation: careCardPulse 0.9s ease 4;
        border-color: var(--accent-gold) !important;
        box-shadow: 0 0 0 3px rgba(212,168,85,0.3) !important;
      }
      @keyframes careCardPulse {
        0%,100% { box-shadow: 0 0 0 3px rgba(212,168,85,0.3); }
        50% { box-shadow: 0 0 0 10px rgba(212,168,85,0.05); }
      }
      .care-warn-list { margin: 0; padding-left: 18px; }
      .care-warn-list li { font-size: 0.82rem; color: var(--text-secondary); line-height: 1.55; margin-bottom: 3px; }
      .care-tip-list { margin: 0; padding-left: 18px; }
      .care-tip-list li { font-size: 0.82rem; color: var(--text-secondary); line-height: 1.55; margin-bottom: 3px; }
      .care-section-label { font-size: 0.72rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.6px; margin: 12px 0 6px; }
      .care-detail-body { padding: 0 0 4px; }
      details.care-why-details summary::-webkit-details-marker { display: none; }
      details.care-why-details summary { list-style: none; }
      .relevance-badge {
        display: inline-block;
        background: var(--accent-teal-soft, rgba(34,211,238,0.12));
        color: var(--accent-teal, #22d3ee);
        border: 1px solid rgba(34,211,238,0.3);
        padding: 2px 8px;
        border-radius: 10px;
        font-size: 0.7rem;
        font-weight: 600;
        margin-top: 6px;
      }
    `;
    document.head.appendChild(s);
  }

  function renderCareGuide() {
    const container = document.getElementById('care-guide-panel');
    if (!container) return;
    _injectStyles();

    const vehicleSelector = _buildVehicleSelector();
    const healthSummary = _buildHealthSummary();
    const tabBar = _buildTabBar();
    const filterBar = _buildFilterBar();
    const cards = _buildCards();

    container.innerHTML = vehicleSelector + healthSummary + tabBar + filterBar + cards;

    if (careGuideHighlightKey) {
      setTimeout(function() {
        var card = document.getElementById('care-card-' + careGuideHighlightKey);
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.classList.add('care-card-highlight-anim');
          var details = card.querySelector('details.care-why-details');
          if (details) details.open = true;
          setTimeout(function() {
            card.classList.remove('care-card-highlight-anim');
            careGuideHighlightKey = null;
          }, 4000);
        }
      }, 150);
    }
  }

  function _buildVehicleSelector() {
    var vArr = typeof vehicles !== 'undefined' && Array.isArray(vehicles) ? vehicles : [];
    if (vArr.length === 0) {
      return '<div style="margin-bottom:20px;padding:16px 20px;background:var(--bg-input);border-radius:var(--radius-lg);display:flex;align-items:center;gap:12px;">' +
        '<span style="color:var(--text-muted);font-size:0.9rem;">Add a vehicle in <a href="#" onclick="showSection(\'vehicles\');return false;" style="color:var(--accent-gold);">My Vehicles</a> to see personalized care info.</span>' +
        '</div>';
    }
    if (!careGuideSelectedVehicle && vArr.length > 0) careGuideSelectedVehicle = vArr[0].id;
    var options = vArr.map(function(v) {
      var name = v.nickname || ((v.year || '') + ' ' + (v.make || '') + ' ' + (v.model || '')).trim();
      return '<option value="' + v.id + '"' + (v.id === careGuideSelectedVehicle ? ' selected' : '') + '>' + name + '</option>';
    }).join('');
    return '<div style="margin-bottom:20px;padding:16px 20px;background:linear-gradient(135deg,rgba(212,168,85,0.08),rgba(212,168,85,0.02));border:1px solid rgba(212,168,85,0.2);border-radius:var(--radius-lg);display:flex;align-items:center;gap:12px;flex-wrap:wrap;">' +
      '<span style="font-weight:600;color:var(--text-primary);font-size:0.95rem;">Personalize for:</span>' +
      '<select id="care-guide-vehicle-select" onchange="onCareVehicleChange(this.value)" style="padding:8px 14px;border-radius:var(--radius-md);border:1px solid var(--border-subtle);background:var(--bg-card);color:var(--text-primary);font-size:0.9rem;min-width:200px;cursor:pointer;">' + options + '</select>' +
      '</div>';
  }

  function _getSelectedVehicle() {
    var vArr = typeof vehicles !== 'undefined' && Array.isArray(vehicles) ? vehicles : [];
    if (!careGuideSelectedVehicle) return vArr[0] || null;
    return vArr.find(function(v) { return v.id === careGuideSelectedVehicle; }) || null;
  }

  function _buildHealthSummary() {
    var vehicle = _getSelectedVehicle();
    if (!vehicle) return '';
    var rArr = typeof reminders !== 'undefined' && Array.isArray(reminders) ? reminders : [];
    var vehicleReminders = rArr.filter(function(r) { return r.vehicleId === vehicle.id; });
    if (vehicleReminders.length === 0) return '';
    var overdue = vehicleReminders.filter(function(r) { return r.status === 'overdue'; }).length;
    var due = vehicleReminders.filter(function(r) { return r.status === 'due'; }).length;
    var ok = vehicleReminders.length - overdue - due;
    var vehicleName = vehicle.nickname || ((vehicle.year || '') + ' ' + (vehicle.make || '') + ' ' + (vehicle.model || '')).trim();
    return '<div style="margin-bottom:20px;display:grid;grid-template-columns:repeat(auto-fit, minmax(120px, 1fr));gap:12px;">' +
      '<div style="padding:14px 16px;background:' + (overdue > 0 ? 'rgba(239,95,95,0.1)' : 'var(--bg-input)') + ';border:1px solid ' + (overdue > 0 ? 'rgba(239,95,95,0.3)' : 'var(--border-subtle)') + ';border-radius:var(--radius-md);text-align:center;cursor:pointer;" onclick="showSection(\'maintenance-schedule\')" title="View overdue items">' +
        '<div style="font-size:1.5rem;font-weight:700;color:var(--accent-red);">' + overdue + '</div>' +
        '<div style="font-size:0.78rem;color:var(--text-muted);">Overdue</div>' +
        '</div>' +
      '<div style="padding:14px 16px;background:' + (due > 0 ? 'rgba(255,159,67,0.1)' : 'var(--bg-input)') + ';border:1px solid ' + (due > 0 ? 'rgba(255,159,67,0.3)' : 'var(--border-subtle)') + ';border-radius:var(--radius-md);text-align:center;cursor:pointer;" onclick="showSection(\'maintenance-schedule\')" title="View items due soon">' +
        '<div style="font-size:1.5rem;font-weight:700;color:var(--accent-orange);">' + due + '</div>' +
        '<div style="font-size:0.78rem;color:var(--text-muted);">Due Soon</div>' +
        '</div>' +
      '<div style="padding:14px 16px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:var(--radius-md);text-align:center;">' +
        '<div style="font-size:1.5rem;font-weight:700;color:var(--accent-green);">' + ok + '</div>' +
        '<div style="font-size:0.78rem;color:var(--text-muted);">Up to Date</div>' +
        '</div>' +
      '</div>';
  }

  function _buildTabBar() {
    var mechActive = careGuideActiveTab === 'mechanical';
    var cosActive = careGuideActiveTab === 'cosmetic';
    var iconW = typeof mccIcon === 'function' ? mccIcon('wrench', 16) : '';
    var iconS = typeof mccIcon === 'function' ? mccIcon('sparkles', 16) : '';
    return '<div style="display:flex;gap:0;margin-bottom:16px;border-bottom:2px solid var(--border-subtle);">' +
      '<button onclick="switchCareTab(\'mechanical\')" style="flex:1;padding:12px 16px;border:none;background:none;color:' + (mechActive ? 'var(--accent-gold)' : 'var(--text-muted)') + ';font-weight:' + (mechActive ? '600' : '400') + ';font-size:0.95rem;cursor:pointer;border-bottom:2px solid ' + (mechActive ? 'var(--accent-gold)' : 'transparent') + ';margin-bottom:-2px;transition:all 0.2s;display:flex;align-items:center;justify-content:center;gap:6px;">' + iconW + ' Mechanical & Safety</button>' +
      '<button onclick="switchCareTab(\'cosmetic\')" style="flex:1;padding:12px 16px;border:none;background:none;color:' + (cosActive ? 'var(--accent-gold)' : 'var(--text-muted)') + ';font-weight:' + (cosActive ? '600' : '400') + ';font-size:0.95rem;cursor:pointer;border-bottom:2px solid ' + (cosActive ? 'var(--accent-gold)' : 'transparent') + ';margin-bottom:-2px;transition:all 0.2s;display:flex;align-items:center;justify-content:center;gap:6px;">' + iconS + ' Appearance & Cosmetic</button>' +
      '</div>';
  }

  function _buildFilterBar() {
    var filters = [
      { key: 'all', label: 'All' },
      { key: 'weekly', label: 'Weekly' },
      { key: 'monthly', label: 'Monthly' },
      { key: 'quarterly', label: 'Quarterly' },
      { key: 'annually', label: 'Annually' },
      { key: 'mileage', label: 'Mileage-Based' }
    ];
    return '<div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;">' +
      filters.map(function(f) {
        var active = careGuideFilter === f.key;
        return '<button onclick="filterCareGuide(\'' + f.key + '\')" style="padding:6px 14px;font-size:0.82rem;border-radius:20px;border:1px solid ' + (active ? 'var(--accent-gold)' : 'var(--border-subtle)') + ';background:' + (active ? 'var(--accent-gold)' : 'transparent') + ';color:' + (active ? 'var(--bg-deep)' : 'var(--text-secondary)') + ';cursor:pointer;font-weight:' + (active ? '600' : '400') + ';transition:all 0.15s;">' + f.label + '</button>';
      }).join('') +
      '</div>';
  }

  function _buildCards() {
    var services = CARE_GUIDE_SERVICES[careGuideActiveTab] || [];
    var filtered = careGuideFilter === 'all' ? services : services.filter(function(s) { return s.filterGroup === careGuideFilter; });
    if (filtered.length === 0) {
      return '<div style="text-align:center;padding:40px;color:var(--text-muted);">No services match this filter.</div>';
    }
    var vehicle = _getSelectedVehicle();
    var mileage = vehicle ? (Number(vehicle.current_mileage || vehicle.mileage || 0)) : 0;
    var vehicleName = vehicle ? (vehicle.nickname || ((vehicle.year || '') + ' ' + (vehicle.make || '') + ' ' + (vehicle.model || '')).trim()) : null;
    return '<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(300px, 1fr));gap:16px;margin-bottom:32px;">' +
      filtered.map(function(s) { return _buildCard(s, vehicle, mileage, vehicleName); }).join('') +
      '</div>';
  }

  function _mileageHint(service, vehicle, mileage, vehicleName) {
    if (!mileage || !service.intervalMiles) return '';
    var lastSvc = _getLastServiceMileage(service.key, vehicle && vehicle.id);
    if (lastSvc !== null) {
      var since = mileage - lastSvc;
      var until = service.intervalMiles - since;
      if (until <= 0) return '<div style="color:var(--accent-red);font-size:0.78rem;font-weight:600;margin-top:5px;">Overdue by ~' + Math.abs(until).toLocaleString() + ' miles</div>';
      if (until < service.intervalMiles * 0.2) return '<div style="color:var(--accent-orange);font-size:0.78rem;margin-top:5px;">Due in ~' + until.toLocaleString() + ' miles</div>';
      return '<div style="color:var(--accent-green);font-size:0.78rem;margin-top:5px;">~' + until.toLocaleString() + ' miles until next service</div>';
    }
    if (vehicleName && service.intervalMiles) {
      var approxDue = service.intervalMiles - (mileage % service.intervalMiles);
      if (approxDue <= service.intervalMiles * 0.15) return '<div style="color:var(--accent-orange);font-size:0.78rem;margin-top:5px;">' + vehicleName + ': likely due in ~' + approxDue.toLocaleString() + ' miles</div>';
      return '<div style="color:var(--text-muted);font-size:0.75rem;margin-top:5px;">' + vehicleName + ': every ' + service.intervalMiles.toLocaleString() + ' mi</div>';
    }
    return '';
  }

  function _buildCard(service, vehicle, mileage, vehicleName) {
    var isHighlighted = careGuideHighlightKey === service.key;
    var iconHtml = typeof mccIcon === 'function' ? mccIcon(service.icon, 20) : '';
    var hint = _mileageHint(service, vehicle, mileage, vehicleName);

    var warnList = (service.warningSigns || []).map(function(w) { return '<li>' + w + '</li>'; }).join('');
    var tipList = (service.tips || []).map(function(t) { return '<li>' + t + '</li>'; }).join('');

    return '<div id="care-card-' + service.key + '" style="background:var(--bg-card);border:' + (isHighlighted ? '2px solid var(--accent-gold)' : '1px solid var(--border-subtle)') + ';border-radius:var(--radius-lg);padding:20px;transition:border 0.3s,box-shadow 0.3s;' + (isHighlighted ? 'box-shadow:0 0 16px rgba(212,168,85,0.25);' : '') + '">' +
      '<div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:10px;">' +
        '<span style="flex-shrink:0;color:var(--accent-gold);margin-top:3px;">' + iconHtml + '</span>' +
        '<div style="flex:1;">' +
          '<div style="font-weight:700;font-size:1rem;color:var(--text-primary);margin-bottom:3px;">' + service.name + '</div>' +
          '<div style="font-size:0.8rem;color:var(--accent-teal);font-weight:500;">' + service.frequency + '</div>' +
          hint +
        '</div>' +
        (service.costRange ? '<span style="font-size:0.75rem;font-weight:600;color:var(--accent-green);background:rgba(76,175,80,0.1);border:1px solid rgba(76,175,80,0.2);border-radius:100px;padding:2px 8px;white-space:nowrap;flex-shrink:0;">' + service.costRange + '</span>' : '') +
      '</div>' +
      '<p style="font-size:0.87rem;color:var(--text-secondary);line-height:1.6;margin:0 0 10px;">' + service.description + '</p>' +
      '<details class="care-why-details" style="margin-bottom:14px;">' +
        '<summary style="cursor:pointer;font-size:0.85rem;font-weight:600;color:var(--accent-gold);user-select:none;padding:8px 0;display:flex;align-items:center;gap:6px;">' +
          (typeof mccIcon === 'function' ? mccIcon('chevron-right', 14) : '') + ' Details, warning signs & tips' +
        '</summary>' +
        '<div class="care-detail-body">' +
          '<div class="care-section-label">Why it matters</div>' +
          '<p style="font-size:0.83rem;color:var(--text-secondary);line-height:1.6;margin:0 0 8px;">' + service.whyItMatters + '</p>' +
          (warnList ? '<div class="care-section-label">Warning signs</div><ul class="care-warn-list">' + warnList + '</ul>' : '') +
          (tipList ? '<div class="care-section-label">Pro tips</div><ul class="care-tip-list">' + tipList + '</ul>' : '') +
        '</div>' +
      '</details>' +
      '<button onclick="getQuotesFromCareGuide(\'' + service.name.replace(/'/g, "\\'") + '\',\'' + (service.serviceType || '').replace(/'/g, "\\'") + '\')" style="width:100%;padding:10px;font-size:0.88rem;border-radius:var(--radius-md);background:linear-gradient(135deg,var(--accent-gold),#c49a2a);color:var(--bg-deep);border:none;cursor:pointer;font-weight:600;display:flex;align-items:center;justify-content:center;gap:6px;">' +
        (typeof mccIcon === 'function' ? mccIcon('message-square', 14) : '') + ' Get Quotes' +
      '</button>' +
    '</div>';
  }

  function _getLastServiceMileage(careKey, vehicleId) {
    if (!vehicleId) return null;
    var rArr = typeof reminders !== 'undefined' && Array.isArray(reminders) ? reminders : [];
    var reminderType = CARE_KEY_TO_REMINDER_TYPE[careKey];
    if (!reminderType) return null;
    var matching = rArr.filter(function(r) { return r.vehicleId === vehicleId && r.type === reminderType; });
    if (matching.length === 0) return null;
    var withMileage = matching.filter(function(r) { return r.dueMileage; });
    if (withMileage.length === 0) return null;
    var allServices = CARE_GUIDE_SERVICES.mechanical.concat(CARE_GUIDE_SERVICES.cosmetic);
    var interval = (allServices.find(function(s) { return s.key === careKey; }) || {}).intervalMiles || 0;
    return Math.max.apply(null, withMileage.map(function(r) { return r.dueMileage - interval; }));
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

  function getQuotesFromCareGuide(title, serviceType) {
    if (typeof openPackageModal !== 'function') {
      if (typeof showSection === 'function') showSection('packages');
      return;
    }
    openPackageModal();
    setTimeout(function() {
      var titleInput = document.getElementById('p-title');
      if (titleInput) titleInput.value = title;
      var serviceTypeSelect = document.getElementById('p-service-type');
      if (serviceTypeSelect && serviceType) {
        var options = Array.from(serviceTypeSelect.options);
        var match = options.find(function(o) { return o.textContent.trim() === serviceType; });
        if (match) serviceTypeSelect.value = match.value;
      }
    }, 250);
  }

  function _openAcademyCareCardFull(key) {
    var allServices = CARE_GUIDE_SERVICES.mechanical.concat(CARE_GUIDE_SERVICES.cosmetic);
    var service = allServices.find(function(s) { return s.key === key; });
    if (!service) {
      renderCareGuide();
      return;
    }
    careGuideActiveTab = CARE_GUIDE_SERVICES.mechanical.indexOf(service) >= 0 ? 'mechanical' : 'cosmetic';
    careGuideFilter = 'all';
    careGuideHighlightKey = key;
    renderCareGuide();
  }

  function getCareKeyForCategory(categoryOrType) {
    if (!categoryOrType) return null;
    var normalized = categoryOrType.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim();
    var allServices = CARE_GUIDE_SERVICES.mechanical.concat(CARE_GUIDE_SERVICES.cosmetic);

    for (var i = 0; i < allServices.length; i++) {
      var s = allServices[i];
      if (s.key === normalized.replace(/ /g, '_')) return s.key;
      if (s.name.toLowerCase() === normalized) return s.key;
      if (s.serviceType && s.serviceType.toLowerCase().includes(normalized)) return s.key;
    }

    var keywords = {
      'oil': 'oil_change', 'oil change': 'oil_change', 'lube': 'oil_change', 'motor oil': 'oil_change', 'engine oil': 'oil_change',
      'p0524': 'oil_change', 'p0521': 'oil_change', 'p0011': 'oil_change',
      'tire': 'tire_rotation', 'tyre': 'tire_rotation', 'tpms': 'tire_pressure', 'tire pressure': 'tire_pressure',
      'alignment': 'tire_rotation', 'rotation': 'tire_rotation',
      'brake': 'brake_inspection', 'braking': 'brake_inspection', 'rotor': 'brake_inspection', 'caliper': 'brake_inspection',
      'pad': 'brake_inspection', 'abs': 'brake_inspection', 'grinding': 'brake_inspection', 'c1234': 'brake_inspection',
      'battery': 'battery_test', 'alternator': 'battery_test', 'charging': 'battery_test', 'electrical': 'battery_test',
      'p0562': 'battery_test', 'b1234': 'battery_test',
      'wiper': 'wiper_blades', 'windshield': 'wiper_blades',
      'cabin filter': 'cabin_air_filter', 'cabin air': 'cabin_air_filter',
      'air filter': 'engine_air_filter', 'engine filter': 'engine_air_filter', 'p0101': 'engine_air_filter', 'maf': 'engine_air_filter',
      'coolant': 'coolant_flush', 'antifreeze': 'coolant_flush', 'overheat': 'coolant_flush', 'temperature': 'coolant_flush',
      'transmission': 'transmission_service', 'slipping': 'transmission_service',
      'spark plug': 'spark_plugs', 'misfire': 'spark_plugs', 'p0300': 'spark_plugs', 'p0301': 'spark_plugs', 'tune': 'spark_plugs',
      'belt': 'serpentine_belt', 'serpentine': 'serpentine_belt',
      'wash': 'quick_wash', 'exterior': 'quick_wash',
      'detail': 'full_detail', 'full detail': 'full_detail',
      'wax': 'wax_sealant', 'polish': 'wax_sealant', 'sealant': 'wax_sealant', 'ceramic': 'wax_sealant',
      'headlight': 'headlight_restoration', 'headlamp': 'headlight_restoration',
      'engine bay': 'engine_bay_cleaning', 'engine clean': 'engine_bay_cleaning',
      'tire dress': 'tire_dressing', 'sidewall': 'tire_dressing',
      'interior': 'interior_clean', 'vacuum': 'interior_clean', 'seat': 'interior_clean', 'carpet': 'interior_clean',
      'p0420': 'spark_plugs', 'catalytic': 'spark_plugs', 'exhaust': 'spark_plugs',
      'suspension': 'brake_inspection', 'strut': 'brake_inspection', 'shock': 'brake_inspection',
      'check engine': 'spark_plugs', 'p0171': 'engine_air_filter', 'p0174': 'engine_air_filter'
    };

    for (var kw in keywords) {
      if (normalized.includes(kw)) return keywords[kw];
    }
    return null;
  }

  function updateArticleRelevanceBadges() {
    var vehicle = _getSelectedVehicle();
    if (!vehicle) return;
    var mileage = Number(vehicle.current_mileage || vehicle.mileage || 0);
    var vehicleName = vehicle.nickname || ((vehicle.year || '') + ' ' + (vehicle.make || '') + ' ' + (vehicle.model || '')).trim();
    var vType = (vehicle.vehicle_type || vehicle.type || '').toLowerCase();

    var rideshareCard = document.querySelector('[onclick*="showLearnCategory(\'rideshare\')"]');
    if (rideshareCard) {
      var old = rideshareCard.querySelector('.relevance-badge');
      if (old) old.remove();
      if (mileage >= 80000) {
        var badge = document.createElement('span');
        badge.className = 'relevance-badge';
        badge.textContent = 'Relevant for your ' + vehicleName;
        rideshareCard.appendChild(badge);
      }
    }

    var commercialCard = document.querySelector('[onclick*="showLearnCategory(\'commercial\')"]');
    if (commercialCard) {
      var old2 = commercialCard.querySelector('.relevance-badge');
      if (old2) old2.remove();
      if (vType.includes('commercial') || vType.includes('fleet') || vType.includes('van') || vType.includes('truck')) {
        var badge2 = document.createElement('span');
        badge2.className = 'relevance-badge';
        badge2.textContent = 'Relevant for your ' + vehicleName;
        commercialCard.appendChild(badge2);
      }
    }

    var articleHeaders = document.querySelectorAll('.learn-article-header');
    articleHeaders.forEach(function(header) {
      var titleEl = header.querySelector('.learn-article-title');
      if (!titleEl) return;
      var key = getCareKeyForCategory(titleEl.textContent || '');
      if (!key) return;
      if (header.querySelector('.article-care-badge')) return;
      var badge3 = document.createElement('span');
      badge3.className = 'article-care-badge relevance-badge';
      badge3.style.marginLeft = 'auto';
      badge3.style.marginRight = '8px';
      badge3.style.flexShrink = '0';
      badge3.textContent = 'For your ' + vehicleName;
      var readtime = header.querySelector('.learn-article-readtime');
      if (readtime) header.insertBefore(badge3, readtime);
      else header.appendChild(badge3);
    });
  }

  window.renderCareGuide = renderCareGuide;
  window.switchCareTab = switchCareTab;
  window.filterCareGuide = filterCareGuide;
  window.onCareVehicleChange = onCareVehicleChange;
  window.getQuotesFromCareGuide = getQuotesFromCareGuide;
  window._openAcademyCareCardFull = _openAcademyCareCardFull;
  window.updateArticleRelevanceBadges = updateArticleRelevanceBadges;
  window.getCareKeyForCategory = getCareKeyForCategory;
  window.CARE_GUIDE_SERVICES = CARE_GUIDE_SERVICES;

  renderCareGuide();
})();
