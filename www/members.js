    // ========== STATE ==========
    let currentUser = null;
    let userProfile = null;
    let vehicles = [];
    let packages = [];
    let reminders = [];
    let serviceHistory = [];
    let upsellRequests = [];
    let currentPackageFilter = 'open';
    let currentUpsellFilter = 'pending';
    let currentViewPackage = null;
    let currentMessageProvider = null;
    let selectedPartsTier = 'standard';
    let selectedBiddingWindowHours = 72; // Default 3 days
    let selectedOilPreference = 'provider'; // 'provider' or 'specify'
    let pendingPackagePhotos = []; // Photos to upload with new package
    let pendingVehiclePhoto = null; // Photo to upload with new vehicle
    let pendingEditVehiclePhoto = null; // Photo to upload when editing vehicle
    let editingVehicleId = null; // Vehicle ID being edited
    let activeEmergency = null; // Current active emergency request
    let emergencyLocation = null; // Current GPS coordinates
    let pendingEmergencyPhotos = []; // Photos for emergency request
    
    // Fleet Management State
    let currentFleet = null; // Current fleet data
    let fleetMembers = []; // Fleet members list
    let fleetVehicles = []; // Fleet vehicles list
    let bulkBatches = []; // Bulk service batches
    let bulkWizardStep = 1; // Current bulk wizard step
    let bulkSelectedVehicles = []; // Selected vehicles for bulk service
    let editingFleetMemberId = null; // Member being edited
    let editingFleetVehicleId = null; // Vehicle assignment being edited
    
    // Identity Verification State
    let userVerificationStatus = null; // { verified: boolean, status: string }
    let stripeInstance = null; // Stripe.js instance

    // Service types by category
    const serviceTypes = {
      maintenance: [
        'Oil change / fluids', 'Tire rotation / alignment', 'Brake service', 'Battery / electrical',
        'Engine tune-up', 'Transmission service', 'Suspension / steering', 'Diagnostic / check engine',
        'AC / heating service', 'Belt / hose replacement', 'Spark plugs', 'Fuel system cleaning'
      ],
      detailing: [
        'Exterior wash', 'Interior cleaning', 'Interior & Exterior', 'Full detail package', 'Paint correction',
        'Ceramic coating', 'Wax / polish', 'Leather conditioning', 'Odor removal', 'Engine bay cleaning'
      ],
      cosmetic: [
        'Scratch repair', 'Dent repair (PDR)', 'Paint touch-up', 'Bumper repair',
        'Window tinting', 'Vinyl wrap', 'Headlight restoration', 'Wheel repair / refinish',
        'Car wrap (full)', 'Car wrap (partial)', 'Vinyl graphics', 'Paint protection film (PPF)'
      ],
      accident_repair: [
        'Collision repair', 'Frame straightening', 'Panel replacement', 'Airbag replacement',
        'Glass replacement', 'Full body restoration', 'Paint matching', 'Structural assessment'
      ],
      performance: [
        'Walnut shell blasting / Carbon cleaning', 'Intake manifold cleaning', 'Throttle body service',
        'Engine tuning / remapping', 'Performance exhaust', 'Turbo / supercharger install',
        'Cold air intake', 'ECU tuning', 'Lift kit installation', 'Lowering kit installation',
        'Coilover install', 'Big brake kit', 'Custom wheels / rims', 'Roll cage / safety equipment'
      ],
      audio_electronics: [
        'Sound system install', 'Subwoofers / amplifiers', 'Head unit / touchscreen',
        'Speaker upgrades', 'Dash camera install', 'Backup camera install', '360 camera system',
        'Rideshare camera setup', 'GPS tracking system', 'Remote start install', 'Car alarm / security'
      ],
      lighting: [
        'LED lighting upgrades', 'Underglow lighting', 'Interior LED lighting',
        'Holiday / Christmas lights', 'HID conversion kit', 'Custom headlights', 'Tail light modifications'
      ],
      interior: [
        'Custom upholstery', 'Leather seat covers', 'Seat heating installation',
        'Custom steering wheel', 'Custom dashboard', 'Custom floor mats', 'Trunk customization'
      ],
      offroad: [
        'Off-road accessories', 'Winch installation', 'Custom bumpers', 'Roof racks / carriers',
        'Trailer hitch install', 'Running boards / side steps', 'Truck bed liner', 'Tonneau cover'
      ],
      ev_hybrid: [
        'EV battery diagnostics', 'Charging station install', 'Electric motor service',
        'Hybrid battery replacement', 'EV maintenance / inspection', 'Regenerative brake service',
        'High-voltage system check', 'EV software updates'
      ],
      classic_vintage: [
        'Full restoration', 'Rust repair / prevention', 'Numbers matching parts',
        'Vintage upholstery restoration', 'Classic engine rebuild', 'Chrome restoration',
        'Carburetor service', 'Points / ignition conversion', 'Drum to disc brake conversion'
      ],
      fleet_graphics: [
        'Commercial vehicle wraps', 'Logo decals / lettering', 'DOT lettering / compliance',
        'Fleet branding package', 'Magnetic signs', 'Partial wrap', 'Vinyl removal'
      ],
      premium_protection: [
        'Undercoating / Rustproofing', 'PPF - Full front', 'PPF - Full body', 'PPF - High impact areas',
        'Ceramic coating (paint)', 'Ceramic window coating', 'Fabric protection', 'Leather protection & conditioning',
        'Window tinting - Standard', 'Window tinting - Ceramic', 'Wheel powder coating', 'Brake caliper painting', 'Glass coating'
      ],
      convertible_specialty: [
        'Convertible top replacement', 'Convertible window repair', 'Headliner replacement',
        'Sunroof repair', 'Mobile mechanic service', 'Soft top cleaning / conditioning'
      ],
      motorcycle: [
        'Motorcycle detailing', 'Motorcycle maintenance', 'Motorcycle modifications',
        'Motorcycle exhaust systems', 'Motorcycle wraps', 'Motorcycle tire service',
        'Chain / sprocket replacement', 'Motorcycle ceramic coating'
      ],
      rv_camper: [
        'RV / camper detailing', 'RV winterization', 'RV de-winterization',
        'RV maintenance', 'RV roof repair / coating', 'RV interior cleaning',
        'Generator service', 'Slide-out maintenance'
      ],
      boat_marine: [
        'Boat hull cleaning', 'Boat detailing', 'Boat winterization',
        'Marine engine service', 'Boat wraps', 'Bottom paint', 'Canvas / upholstery repair'
      ],
      manufacturer_service: [
        '── Mercedes-Benz ──',
        'Mercedes Service A (10K miles)',
        'Mercedes Service B (20K miles)',
        '── BMW ──',
        'BMW Oil Service',
        'BMW Inspection I (Minor)',
        'BMW Inspection II (Major)',
        '── Audi/VW ──',
        'Audi/VW Minor Service',
        'Audi/VW Major Service',
        'Audi/VW DSG Service',
        '── Lexus/Toyota ──',
        'Toyota/Lexus 5K Service',
        'Toyota/Lexus 10K Service',
        'Toyota/Lexus 15K Service',
        'Toyota/Lexus 30K Service',
        'Toyota/Lexus 60K Service',
        '── Porsche ──',
        'Porsche Minor Service',
        'Porsche Major Service',
        '── Land Rover/Jaguar ──',
        'Land Rover Annual Service',
        'Jaguar Annual Service',
        '── Volvo ──',
        'Volvo Scheduled Service',
        '── Other Brands ──',
        'Manufacturer Scheduled Service',
        'Factory Recommended Maintenance'
      ],
      other: ['Custom request']
    };

    // Vehicle makes, models, and trims data
    const vehicleData = {
      makes: ['Acura', 'Alfa Romeo', 'Aston Martin', 'Audi', 'Bentley', 'BMW', 'Buick', 'Cadillac', 'Chevrolet', 'Chrysler', 'Dodge', 'Ferrari', 'Fiat', 'Ford', 'Genesis', 'GMC', 'Honda', 'Hyundai', 'Infiniti', 'Jaguar', 'Jeep', 'Kia', 'Lamborghini', 'Land Rover', 'Lexus', 'Lincoln', 'Lucid', 'Maserati', 'Mazda', 'McLaren', 'Mercedes-Benz', 'Mini', 'Mitsubishi', 'Nissan', 'Polestar', 'Porsche', 'Ram', 'Rivian', 'Rolls-Royce', 'Subaru', 'Tesla', 'Toyota', 'Volkswagen', 'Volvo'],
      models: {
        'Acura': ['ILX', 'Integra', 'MDX', 'NSX', 'RDX', 'TLX'],
        'Alfa Romeo': ['Giulia', 'Stelvio', 'Tonale'],
        'Aston Martin': ['DB11', 'DB12', 'DBX', 'Vantage'],
        'Audi': ['A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'e-tron', 'e-tron GT', 'Q3', 'Q4 e-tron', 'Q5', 'Q7', 'Q8', 'RS3', 'RS5', 'RS6', 'RS7', 'S3', 'S4', 'S5', 'TT'],
        'Bentley': ['Bentayga', 'Continental GT', 'Flying Spur'],
        'BMW': ['2 Series', '3 Series', '4 Series', '5 Series', '7 Series', '8 Series', 'i4', 'i5', 'i7', 'iX', 'M2', 'M3', 'M4', 'M5', 'M8', 'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'Z4'],
        'Buick': ['Enclave', 'Encore', 'Encore GX', 'Envision'],
        'Cadillac': ['CT4', 'CT5', 'Escalade', 'Lyriq', 'XT4', 'XT5', 'XT6'],
        'Chevrolet': ['Blazer', 'Bolt EUV', 'Bolt EV', 'Camaro', 'Colorado', 'Corvette', 'Equinox', 'Malibu', 'Silverado', 'Suburban', 'Tahoe', 'Trailblazer', 'Traverse', 'Trax'],
        'Chrysler': ['300', 'Pacifica', 'Voyager'],
        'Dodge': ['Challenger', 'Charger', 'Durango', 'Hornet'],
        'Ferrari': ['296 GTB', '488', 'F8', 'Portofino', 'Purosangue', 'Roma', 'SF90'],
        'Fiat': ['500X'],
        'Ford': ['Bronco', 'Bronco Sport', 'Edge', 'Escape', 'Expedition', 'Explorer', 'F-150', 'F-150 Lightning', 'Maverick', 'Mustang', 'Mustang Mach-E', 'Ranger', 'Transit'],
        'Genesis': ['Electrified G80', 'Electrified GV70', 'G70', 'G80', 'G90', 'GV60', 'GV70', 'GV80'],
        'GMC': ['Acadia', 'Canyon', 'Hummer EV', 'Sierra', 'Terrain', 'Yukon'],
        'Honda': ['Accord', 'Civic', 'CR-V', 'HR-V', 'Odyssey', 'Passport', 'Pilot', 'Ridgeline'],
        'Hyundai': ['Elantra', 'Ioniq 5', 'Ioniq 6', 'Kona', 'Palisade', 'Santa Cruz', 'Santa Fe', 'Sonata', 'Tucson', 'Venue'],
        'Infiniti': ['Q50', 'Q60', 'QX50', 'QX55', 'QX60', 'QX80'],
        'Jaguar': ['E-Pace', 'F-Pace', 'F-Type', 'I-Pace', 'XF'],
        'Jeep': ['Cherokee', 'Compass', 'Gladiator', 'Grand Cherokee', 'Grand Cherokee L', 'Grand Wagoneer', 'Renegade', 'Wagoneer', 'Wrangler'],
        'Kia': ['Carnival', 'EV6', 'EV9', 'Forte', 'K5', 'Niro', 'Rio', 'Seltos', 'Sorento', 'Soul', 'Sportage', 'Stinger', 'Telluride'],
        'Lamborghini': ['Huracan', 'Revuelto', 'Urus'],
        'Land Rover': ['Defender', 'Discovery', 'Discovery Sport', 'Range Rover', 'Range Rover Evoque', 'Range Rover Sport', 'Range Rover Velar'],
        'Lexus': ['ES', 'GX', 'IS', 'LC', 'LS', 'LX', 'NX', 'RC', 'RX', 'RZ', 'TX', 'UX'],
        'Lincoln': ['Aviator', 'Corsair', 'Nautilus', 'Navigator'],
        'Lucid': ['Air'],
        'Maserati': ['Ghibli', 'GranTurismo', 'Grecale', 'Levante', 'MC20', 'Quattroporte'],
        'Mazda': ['CX-30', 'CX-5', 'CX-50', 'CX-9', 'CX-90', 'Mazda3', 'Mazda6', 'MX-30', 'MX-5 Miata'],
        'McLaren': ['720S', '750S', 'Artura', 'GT'],
        'Mercedes-Benz': ['A-Class', 'AMG GT', 'C-Class', 'CLA', 'CLE', 'E-Class', 'EQB', 'EQE', 'EQS', 'G-Class', 'GLA', 'GLB', 'GLC', 'GLE', 'GLS', 'Maybach', 'S-Class', 'SL'],
        'Mini': ['Clubman', 'Convertible', 'Countryman', 'Hardtop'],
        'Mitsubishi': ['Eclipse Cross', 'Mirage', 'Outlander', 'Outlander Sport'],
        'Nissan': ['Altima', 'Armada', 'Ariya', 'Frontier', 'Kicks', 'Leaf', 'Maxima', 'Murano', 'Pathfinder', 'Rogue', 'Sentra', 'Titan', 'Versa', 'Z'],
        'Polestar': ['Polestar 2', 'Polestar 3'],
        'Porsche': ['718 Boxster', '718 Cayman', '911', 'Cayenne', 'Macan', 'Panamera', 'Taycan'],
        'Ram': ['1500', '2500', '3500', 'ProMaster'],
        'Rivian': ['R1S', 'R1T'],
        'Rolls-Royce': ['Cullinan', 'Ghost', 'Phantom', 'Spectre'],
        'Subaru': ['Ascent', 'BRZ', 'Crosstrek', 'Forester', 'Impreza', 'Legacy', 'Outback', 'Solterra', 'WRX'],
        'Tesla': ['Model 3', 'Model S', 'Model X', 'Model Y', 'Cybertruck'],
        'Toyota': ['4Runner', '86', 'bZ4X', 'Camry', 'Corolla', 'Corolla Cross', 'Crown', 'GR Supra', 'Grand Highlander', 'Highlander', 'Land Cruiser', 'Prius', 'RAV4', 'Sequoia', 'Sienna', 'Tacoma', 'Tundra', 'Venza'],
        'Volkswagen': ['Arteon', 'Atlas', 'Atlas Cross Sport', 'Golf', 'Golf GTI', 'Golf R', 'ID.4', 'Jetta', 'Taos', 'Tiguan'],
        'Volvo': ['C40 Recharge', 'S60', 'S90', 'V60', 'V90', 'XC40', 'XC60', 'XC90']
      },
      trims: {
        // Common trim levels by make (simplified)
        'default': ['Base', 'S', 'SE', 'SEL', 'Limited', 'Premium', 'Sport', 'Touring'],
        'Toyota': ['L', 'LE', 'SE', 'XLE', 'XSE', 'Limited', 'TRD Sport', 'TRD Off-Road', 'TRD Pro', 'Nightshade', 'Platinum'],
        'Honda': ['LX', 'EX', 'EX-L', 'Sport', 'Touring', 'Elite', 'Type R'],
        'Ford': ['Base', 'XL', 'XLT', 'Lariat', 'King Ranch', 'Platinum', 'Limited', 'Raptor', 'ST', 'GT'],
        'Chevrolet': ['LS', 'LT', 'RS', 'Premier', 'High Country', 'ZR2', 'Z71', 'SS', 'ZL1'],
        'BMW': ['Base', 'xDrive', 'M Sport', 'M', 'Competition'],
        'Mercedes-Benz': ['Base', '4MATIC', 'AMG Line', 'AMG 43', 'AMG 53', 'AMG 63'],
        'Audi': ['Base', 'Premium', 'Premium Plus', 'Prestige', 'S Line', 'Black Optics'],
        'Lexus': ['Base', 'Premium', 'Luxury', 'F Sport', 'Ultra Luxury'],
        'Tesla': ['Standard Range', 'Long Range', 'Performance', 'Plaid'],
        'Hyundai': ['SE', 'SEL', 'N Line', 'Limited', 'Calligraphy'],
        'Kia': ['LX', 'LXS', 'S', 'EX', 'GT-Line', 'SX', 'SX Prestige'],
        'Jeep': ['Sport', 'Sport S', 'Latitude', 'Altitude', 'Limited', 'Trailhawk', 'Overland', 'Summit', 'Rubicon', 'Sahara'],
        'Subaru': ['Base', 'Premium', 'Sport', 'Limited', 'Touring', 'Wilderness', 'Onyx Edition XT']
      }
    };

    // Populate year dropdown (current year down to 1990)
    function initYearDropdown() {
      const yearSelect = document.getElementById('v-year');
      const currentYear = new Date().getFullYear() + 1; // Include next model year
      for (let y = currentYear; y >= 1990; y--) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        yearSelect.appendChild(opt);
      }
    }

    // Update make options when year is selected
    function updateMakeOptions() {
      const yearSelect = document.getElementById('v-year');
      const makeSelect = document.getElementById('v-make');
      const modelSelect = document.getElementById('v-model');
      const trimSelect = document.getElementById('v-trim');
      
      // Reset dependent dropdowns
      makeSelect.innerHTML = '<option value="">Select Make</option>';
      modelSelect.innerHTML = '<option value="">Select Model</option>';
      trimSelect.innerHTML = '<option value="">Select Trim (Optional)</option>';
      modelSelect.disabled = true;
      trimSelect.disabled = true;
      
      if (!yearSelect.value) {
        makeSelect.disabled = true;
        return;
      }
      
      makeSelect.disabled = false;
      vehicleData.makes.forEach(make => {
        const opt = document.createElement('option');
        opt.value = make;
        opt.textContent = make;
        makeSelect.appendChild(opt);
      });
    }

    // Update model options when make is selected
    function updateModelOptions() {
      const makeSelect = document.getElementById('v-make');
      const modelSelect = document.getElementById('v-model');
      const trimSelect = document.getElementById('v-trim');
      
      // Reset dependent dropdowns
      modelSelect.innerHTML = '<option value="">Select Model</option>';
      trimSelect.innerHTML = '<option value="">Select Trim (Optional)</option>';
      trimSelect.disabled = true;
      
      if (!makeSelect.value) {
        modelSelect.disabled = true;
        return;
      }
      
      modelSelect.disabled = false;
      const models = vehicleData.models[makeSelect.value] || [];
      models.forEach(model => {
        const opt = document.createElement('option');
        opt.value = model;
        opt.textContent = model;
        modelSelect.appendChild(opt);
      });
    }

    // Update trim options when model is selected
    function updateTrimOptions() {
      const makeSelect = document.getElementById('v-make');
      const modelSelect = document.getElementById('v-model');
      const trimSelect = document.getElementById('v-trim');
      
      trimSelect.innerHTML = '<option value="">Select Trim (Optional)</option>';
      
      if (!modelSelect.value) {
        trimSelect.disabled = true;
        return;
      }
      
      trimSelect.disabled = false;
      const trims = vehicleData.trims[makeSelect.value] || vehicleData.trims['default'];
      trims.forEach(trim => {
        const opt = document.createElement('option');
        opt.value = trim;
        opt.textContent = trim;
        trimSelect.appendChild(opt);
      });
    }

    // ========== 2FA ACCESS CHECK ==========
    async function checkAccessAuthorization() {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) {
        window.location.href = 'login.html';
        return false;
      }
      
      try {
        const response = await fetch('/api/auth/check-access', {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const result = await response.json();
        
        if (!result.authorized && result.reason === '2fa_required') {
          window.location.href = 'login.html?2fa=required&returnTo=' + encodeURIComponent(window.location.pathname);
          return false;
        }
        return true;
      } catch (error) {
        console.error('Access check error:', error);
        return true;
      }
    }

    // ========== INITIALIZATION ==========
    window.addEventListener('load', async () => {
      try {
        const user = await getCurrentUser();
        if (!user) return window.location.href = 'login.html';
        currentUser = user;
        
        // Check 2FA authorization before loading dashboard
        const authorized = await checkAccessAuthorization();
        if (!authorized) return;
        
        // Check ToS acceptance before loading dashboard
        const tosAccepted = await TosModal.check(supabaseClient, user.id);
        if (!tosAccepted) {
          TosModal.show(async () => {
            const accepted = await TosModal.accept(supabaseClient, user.id);
            if (accepted) {
              await initializeDashboard();
            }
          });
          return;
        }
        
        await initializeDashboard();
      } catch (err) {
        console.error('Page initialization error:', err);
        showToast('Error loading page. Check console for details.', 'error');
      }
    });

    async function initializeDashboard() {
      initYearDropdown(); // Initialize year dropdown
      
      // Load all data in parallel for faster dashboard loading
      await Promise.all([
        loadProfile(),
        loadVehicles(),
        loadPackages(),
        loadDestinationServices(),
        loadReminders(),
        loadRecommendations(),
        loadServiceHistory(),
        loadUpsellRequests(),
        loadConversations(),
        loadNotifications(),
        checkActiveEmergency(),
        initStripeIdentity()
      ]);
      
      updateStats();
      setupEventListeners();
      setupRealtimeSubscriptions();
      
      // Check identity verification after Stripe is initialized
      await checkIdentityVerification();
      
      // Check for identity verification return
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('identity_verification') === 'complete') {
        // Refresh verification status after returning from Stripe Identity
        await checkIdentityVerification();
        showToast('Verification check complete. Please wait while we confirm your status.', 'success');
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
    
    // ========== STRIPE IDENTITY VERIFICATION ==========
    async function initStripeIdentity() {
      try {
        const response = await fetch('/api/config/stripe');
        const config = await response.json();
        if (config.publishableKey) {
          stripeInstance = Stripe(config.publishableKey);
        } else {
          console.warn('Stripe publishable key not configured');
        }
      } catch (error) {
        console.error('Failed to initialize Stripe:', error);
      }
    }
    
    async function checkIdentityVerification() {
      if (!currentUser) return;
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const response = await fetch(`/api/identity/status/${currentUser.id}`, {
          headers: { 'Authorization': `Bearer ${session?.access_token}` }
        });
        
        const result = await response.json();
        
        if (result.success) {
          userVerificationStatus = {
            verified: result.status === 'verified',
            status: result.status,
            verifiedAt: result.verified_at,
            verifiedName: result.verified_name
          };
        } else {
          userVerificationStatus = { verified: false, status: 'not_started' };
        }
        
        // Update UI based on verification status
        updateVerificationUI();
      } catch (error) {
        console.error('Failed to check identity verification:', error);
        userVerificationStatus = { verified: false, status: 'error' };
      }
    }
    
    function updateVerificationUI() {
      const verificationSection = document.getElementById('identity-verification-section');
      const vehicleFormSection = document.getElementById('vehicle-form-section');
      const verifiedBadge = document.getElementById('identity-verified-badge');
      
      if (!verificationSection || !vehicleFormSection) return;
      
      if (userVerificationStatus?.verified) {
        // User is verified - show form with badge
        verificationSection.style.display = 'none';
        vehicleFormSection.style.display = 'block';
        if (verifiedBadge) verifiedBadge.style.display = 'inline-flex';
      } else {
        // User is not verified - show verification required
        verificationSection.style.display = 'block';
        vehicleFormSection.style.display = 'none';
        if (verifiedBadge) verifiedBadge.style.display = 'none';
      }
    }
    
    async function startIdentityVerification() {
      if (!stripeInstance) {
        showToast('Stripe not initialized. Please refresh the page.', 'error');
        return;
      }
      
      try {
        const verifyBtn = document.getElementById('verify-identity-btn');
        if (verifyBtn) {
          verifyBtn.disabled = true;
          verifyBtn.innerHTML = '⏳ Starting verification...';
        }
        
        const { data: { session } } = await supabaseClient.auth.getSession();
        const response = await fetch('/api/identity/create-verification-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`
          }
        });
        
        const result = await response.json();
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to create verification session');
        }
        
        // Open Stripe Identity modal
        const { error } = await stripeInstance.verifyIdentity(result.client_secret);
        
        if (error) {
          console.error('Stripe Identity error:', error);
          if (error.type !== 'modal_closed') {
            showToast('Verification was not completed: ' + error.message, 'error');
          }
        } else {
          // Verification session was submitted
          showToast('Verification submitted! We will verify your identity shortly.', 'success');
        }
        
        // Refresh status regardless of outcome
        await checkIdentityVerification();
        
      } catch (error) {
        console.error('Identity verification error:', error);
        showToast('Failed to start verification: ' + error.message, 'error');
      } finally {
        const verifyBtn = document.getElementById('verify-identity-btn');
        if (verifyBtn) {
          verifyBtn.disabled = false;
          verifyBtn.innerHTML = '🛡️ Verify My Identity';
        }
      }
    }

    // ========== REALTIME SUBSCRIPTIONS ==========
    let realtimeChannel = null;

    function setupRealtimeSubscriptions() {
      // Subscribe to changes relevant to this member
      realtimeChannel = supabaseClient.channel('member-updates')
        
        // New bids on member's packages
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'bids'
        }, async (payload) => {
          // Check if this bid is for one of our packages
          const pkg = packages.find(p => p.id === payload.new.package_id);
          if (pkg) {
            console.log('[REALTIME] New bid received:', payload.new);
            showToast('💰 New bid received!', 'success');
            await loadPackages();
            updateStats();
          }
        })

        // New messages for this member
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `recipient_id=eq.${currentUser.id}`
        }, async (payload) => {
          console.log('[REALTIME] New message:', payload.new);
          showToast('💬 New message received!', 'success');
          await loadConversations();
          
          // If message modal is open, refresh it
          if (document.getElementById('message-modal').classList.contains('active')) {
            const msgThread = document.getElementById('message-thread');
            const newMsg = payload.new;
            const msgHtml = `
              <div class="message received">
                <div class="message-bubble">${newMsg.content}</div>
                <div class="message-time">${new Date(newMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            `;
            msgThread.insertAdjacentHTML('beforeend', msgHtml);
            msgThread.scrollTop = msgThread.scrollHeight;
          }
        })

        // New notifications
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUser.id}`
        }, async (payload) => {
          console.log('[REALTIME] New notification:', payload.new);
          await loadNotifications();
        })

        // Package status changes
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'maintenance_packages'
        }, async (payload) => {
          const pkg = packages.find(p => p.id === payload.new.id);
          if (pkg) {
            console.log('[REALTIME] Package updated:', payload.new);
            if (payload.old.status !== payload.new.status) {
              showToast(`📦 Package "${payload.new.title}" is now ${payload.new.status}`, 'success');
            }
            await loadPackages();
            updateStats();
          }
        })

        // Upsell requests
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'upsell_requests',
          filter: `member_id=eq.${currentUser.id}`
        }, async (payload) => {
          console.log('[REALTIME] New upsell request:', payload.new);
          showToast('⚠️ Provider found additional work needed!', 'success');
          await loadUpsellRequests();
        })

        .subscribe((status) => {
          console.log('[REALTIME] Subscription status:', status);
          updateRealtimeStatus(status);
        });
    }

    function updateRealtimeStatus(status) {
      const dot = document.getElementById('realtime-dot');
      const text = document.getElementById('realtime-text');
      
      if (status === 'SUBSCRIBED') {
        dot.style.background = 'var(--accent-green)';
        text.textContent = 'Live updates on';
      } else if (status === 'CHANNEL_ERROR') {
        dot.style.background = 'var(--accent-red)';
        text.textContent = 'Connection error';
      } else if (status === 'CLOSED') {
        dot.style.background = 'var(--text-muted)';
        text.textContent = 'Disconnected';
      } else {
        dot.style.background = 'var(--accent-orange)';
        text.textContent = 'Connecting...';
      }
    }

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      if (realtimeChannel) {
        supabaseClient.removeChannel(realtimeChannel);
      }
    });

    async function loadProfile() {
      const { data, error } = await supabaseClient.from('profiles').select('*').eq('id', currentUser.id).single();
      
      // If no profile exists, create one
      if (error || !data) {
        console.log('No profile found, creating one...');
        const { data: newProfile, error: createError } = await supabaseClient.from('profiles').insert({
          id: currentUser.id,
          email: currentUser.email,
          role: 'member'
        }).select().single();
        
        if (createError) {
          console.error('Failed to create profile:', createError);
          // Continue anyway with defaults
          userProfile = { role: 'member' };
        } else {
          userProfile = newProfile;
        }
      } else {
        userProfile = data;
      }
      
      const name = userProfile?.full_name || 'Member';
      const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
      document.getElementById('user-name').textContent = name;
      document.getElementById('user-email').textContent = currentUser.email;
      document.getElementById('user-avatar').textContent = initials;

      // Populate settings fields
      document.getElementById('settings-name').value = userProfile?.full_name || '';
      document.getElementById('settings-phone').value = userProfile?.phone || '';
      document.getElementById('settings-zip').value = userProfile?.zip_code || '';
      document.getElementById('settings-city').value = userProfile?.city || '';
      document.getElementById('settings-state').value = userProfile?.state || '';

      // SMS notification settings
      document.getElementById('sms-enabled').checked = userProfile?.sms_notifications || false;
      document.getElementById('sms-bid-received').checked = userProfile?.sms_bid_received !== false;
      document.getElementById('sms-work-completed').checked = userProfile?.sms_work_completed !== false;
      document.getElementById('sms-new-message').checked = userProfile?.sms_new_message || false;
      if (document.getElementById('sms-bidding-ending')) {
        document.getElementById('sms-bidding-ending').checked = userProfile?.sms_bidding_ending !== false;
      }
      toggleSmsOptions();

      // Load notification preferences
      loadNotificationPreferences();

      // Show location reminder if ZIP not set
      if (!userProfile?.zip_code) {
        const status = document.getElementById('location-status');
        status.innerHTML = '<div style="background:var(--accent-orange-soft);border:1px solid rgba(245,158,11,0.3);color:var(--accent-orange);padding:12px;border-radius:var(--radius-md);">⚠️ Please set your ZIP code so providers in your area can find your service requests.</div>';
        status.style.display = 'block';
      }

      // Show admin link if user is admin
      if (userProfile?.role === 'admin') {
        document.getElementById('admin-nav').style.display = 'block';
      }

      // Check if user has approved provider access before showing switch portal button
      checkProviderAccess();
      
      // Check if user is an approved founder
      checkFounderAccess();
    }

    async function checkFounderAccess() {
      try {
        const { data: founderRecord } = await supabaseClient
          .from('member_founder_profiles')
          .select('id, status')
          .eq('user_id', currentUser.id)
          .eq('status', 'active')
          .single();
        
        if (founderRecord) {
          document.getElementById('founder-nav').style.display = 'block';
        }
      } catch (err) {
        // No founder record found - keep hidden
      }
    }

    async function checkProviderAccess() {
      try {
        const { data: providerRecord } = await supabaseClient
          .from('service_providers')
          .select('id, status')
          .eq('user_id', currentUser.id)
          .single();
        
        // Only show dual access if user has an approved provider record
        if (providerRecord && providerRecord.status === 'approved') {
          document.getElementById('switch-portal-container').style.display = 'block';
        } else {
          document.getElementById('switch-portal-container').style.display = 'none';
        }
      } catch (err) {
        // No provider record found - hide the switch portal option
        document.getElementById('switch-portal-container').style.display = 'none';
      }
    }

    function switchToProvider() {
      localStorage.setItem('mcc_portal', 'provider');
      window.location.href = 'providers.html';
    }

    async function loadVehicles() {
      try {
        const { data, error } = await supabaseClient.from('vehicles').select('*').eq('owner_id', currentUser.id).order('created_at', { ascending: false });
        
        if (error) {
          console.error('Error loading vehicles:', error);
          vehicles = [];
        } else {
          vehicles = data || [];
        }
        
        renderVehicles();
        updateVehicleSelects();
      } catch (err) {
        console.error('loadVehicles error:', err);
        vehicles = [];
        renderVehicles();
      }
    }

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
      const { data: newPkg } = await supabaseClient.from('maintenance_packages').insert({
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
      }).select().single();

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

    async function loadPackages() {
      const { data } = await supabaseClient.from('maintenance_packages').select('*, vehicles(nickname, year, make, model, fuel_injection_type)').eq('member_id', currentUser.id).order('created_at', { ascending: false });
      packages = data || [];
      
      // Fetch bid counts for all packages
      if (packages.length > 0) {
        const packageIds = packages.map(p => p.id);
        const { data: bidsData } = await supabaseClient
          .from('bids')
          .select('package_id')
          .in('package_id', packageIds);
        
        // Count bids per package
        const bidCounts = {};
        (bidsData || []).forEach(bid => {
          bidCounts[bid.package_id] = (bidCounts[bid.package_id] || 0) + 1;
        });
        
        // Attach bid count to each package
        packages.forEach(p => {
          p.bid_count = bidCounts[p.id] || 0;
        });
      }
      
      renderPackages();
      renderRecentActivity();
    }

    async function loadConversations() {
      try {
        // Get all messages where user is sender or recipient
        const { data: messages, error } = await supabaseClient
          .from('messages')
          .select('*, maintenance_packages(id, title)')
          .or(`sender_id.eq.${currentUser.id},recipient_id.eq.${currentUser.id}`)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error loading conversations:', error);
          return;
        }

        // Group by package_id and get the other party
        const conversationMap = new Map();
        
        for (const msg of messages || []) {
          const key = msg.package_id;
          const otherPartyId = msg.sender_id === currentUser.id ? msg.recipient_id : msg.sender_id;
          
          if (!conversationMap.has(key)) {
            conversationMap.set(key, {
              packageId: msg.package_id,
              packageTitle: msg.maintenance_packages?.title || 'Unknown Package',
              otherPartyId,
              lastMessage: msg.content,
              lastMessageTime: msg.created_at,
              unread: msg.recipient_id === currentUser.id && !msg.read_at
            });
          }
        }

        // Fetch provider alias for each conversation
        const conversations = Array.from(conversationMap.values());
        const providerIds = [...new Set(conversations.map(c => c.otherPartyId))];
        
        if (providerIds.length > 0) {
          const { data: providers } = await supabaseClient
            .from('profiles')
            .select('id, provider_alias')
            .in('id', providerIds);

          const providerMap = new Map(providers?.map(p => [p.id, p]) || []);
          
          conversations.forEach(c => {
            const provider = providerMap.get(c.otherPartyId);
            // Use alias, never real business name
            c.providerName = provider?.provider_alias || `Provider #${c.otherPartyId.slice(0,4).toUpperCase()}`;
          });
        }

        renderConversations(conversations);
        
        // Update unread badge
        const unreadCount = conversations.filter(c => c.unread).length;
        const badge = document.getElementById('message-count');
        if (unreadCount > 0) {
          badge.textContent = unreadCount;
          badge.style.display = 'inline';
        } else {
          badge.style.display = 'none';
        }
      } catch (err) {
        console.error('loadConversations error:', err);
      }
    }

    function renderConversations(conversations) {
      const container = document.getElementById('conversations-list');
      
      if (!conversations.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">💬</div><p>No conversations yet. Messages will appear here when you communicate with providers.</p></div>';
        return;
      }

      container.innerHTML = conversations.map(c => `
        <div class="conversation-card" onclick="openMessageWithProvider('${c.packageId}', '${c.otherPartyId}')" style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:16px 20px;margin-bottom:12px;cursor:pointer;transition:all 0.15s;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
            <div>
              <div style="font-weight:600;margin-bottom:2px;">${c.providerName}</div>
              <div style="font-size:0.85rem;color:var(--text-muted);">Re: ${c.packageTitle}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:0.8rem;color:var(--text-muted);">${formatMessageTime(c.lastMessageTime)}</div>
              ${c.unread ? '<span style="display:inline-block;width:10px;height:10px;background:var(--accent-gold);border-radius:50%;margin-top:4px;"></span>' : ''}
            </div>
          </div>
          <div style="font-size:0.9rem;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${c.lastMessage}
          </div>
        </div>
      `).join('');
    }

    function formatMessageTime(timestamp) {
      const date = new Date(timestamp);
      const now = new Date();
      const diff = now - date;
      
      if (diff < 60000) return 'Just now';
      if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
      if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
      if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
      return date.toLocaleDateString();
    }

    async function loadReminders() {
      const dismissedIds = getDismissedReminderIds();
      const snoozedIds = getSnoozedReminderIds();
      reminders = [];
      
      vehicles.forEach(v => {
        const vehicleName = v.nickname || `${v.year} ${v.make} ${v.model}`;
        
        if (v.registration_expiration) {
          const expDate = new Date(v.registration_expiration);
          const daysUntil = Math.ceil((expDate - new Date()) / (1000 * 60 * 60 * 24));
          if (daysUntil <= 60) {
            const reminderId = `reg-${v.id}`;
            if (!dismissedIds.includes(reminderId) && !snoozedIds.includes(reminderId)) {
              reminders.push({
                id: reminderId,
                vehicleId: v.id,
                vehicleName,
                type: 'registration',
                title: 'Registration Renewal',
                dueDate: v.registration_expiration,
                daysUntil,
                status: daysUntil < 0 ? 'overdue' : daysUntil <= 14 ? 'due' : 'ok'
              });
            }
          }
        }
        
        if (v.warranty_expiration) {
          const expDate = new Date(v.warranty_expiration);
          const daysUntil = Math.ceil((expDate - new Date()) / (1000 * 60 * 60 * 24));
          if (daysUntil <= 90 && daysUntil > -30) {
            const reminderId = `warranty-${v.id}`;
            if (!dismissedIds.includes(reminderId) && !snoozedIds.includes(reminderId)) {
              reminders.push({
                id: reminderId,
                vehicleId: v.id,
                vehicleName,
                type: 'warranty',
                title: 'Warranty Expiring',
                dueDate: v.warranty_expiration,
                daysUntil,
                status: daysUntil < 0 ? 'overdue' : daysUntil <= 30 ? 'due' : 'ok'
              });
            }
          }
        }
        
        if (v.mileage) {
          const nextOilChange = Math.ceil(v.mileage / 5000) * 5000;
          const milesUntil = nextOilChange - v.mileage;
          if (milesUntil <= 1000) {
            const reminderId = `oil-${v.id}`;
            if (!dismissedIds.includes(reminderId) && !snoozedIds.includes(reminderId)) {
              reminders.push({
                id: reminderId,
                vehicleId: v.id,
                vehicleName,
                type: 'oil_change',
                title: 'Oil Change Due',
                dueMileage: nextOilChange,
                milesUntil,
                status: milesUntil < 0 ? 'overdue' : 'due'
              });
            }
          }
        }
      });
      
      const vehicleIds = vehicles.map(v => v.id);
      if (vehicleIds.length > 0) {
        const { data: dbReminders } = await supabaseClient
          .from('reminders')
          .select('*, vehicles(nickname, year, make, model, mileage, fuel_injection_type)')
          .in('vehicle_id', vehicleIds)
          .neq('status', 'completed');
        
        if (dbReminders) {
          dbReminders.forEach(r => {
            const reminderId = `db-${r.id}`;
            if (dismissedIds.includes(reminderId)) return;
            
            if (r.status === 'snoozed') {
              const snoozedUntil = getSnoozedUntilDate(reminderId);
              if (snoozedUntil && new Date() < new Date(snoozedUntil)) return;
            }
            
            const vehicleName = r.vehicles ? (r.vehicles.nickname || `${r.vehicles.year} ${r.vehicles.make} ${r.vehicles.model}`) : 'Unknown Vehicle';
            let status = 'ok';
            let daysUntil = null;
            let milesUntil = null;
            
            if (r.due_date) {
              const expDate = new Date(r.due_date);
              daysUntil = Math.ceil((expDate - new Date()) / (1000 * 60 * 60 * 24));
              status = daysUntil < 0 ? 'overdue' : daysUntil <= 14 ? 'due' : 'ok';
            }
            
            if (r.due_mileage && r.vehicles?.mileage) {
              milesUntil = r.due_mileage - r.vehicles.mileage;
              if (milesUntil < 0) status = 'overdue';
              else if (milesUntil <= 500) status = 'due';
            }
            
            reminders.push({
              id: reminderId,
              dbId: r.id,
              vehicleId: r.vehicle_id,
              vehicleName,
              type: r.reminder_type || 'other',
              title: r.title,
              description: r.description,
              dueDate: r.due_date,
              dueMileage: r.due_mileage,
              daysUntil,
              milesUntil,
              status,
              isFromDb: true
            });
          });
        }
      }
      
      updateShowDismissedButton();
      renderReminders();
      renderUpcomingReminders();
    }
    
    function getSnoozedReminderIds() {
      try {
        const snoozed = JSON.parse(localStorage.getItem('mcc_snoozed_reminders') || '{}');
        const now = new Date();
        return Object.entries(snoozed)
          .filter(([id, until]) => new Date(until) > now)
          .map(([id]) => id);
      } catch {
        return [];
      }
    }
    
    function getSnoozedUntilDate(reminderId) {
      try {
        const snoozed = JSON.parse(localStorage.getItem('mcc_snoozed_reminders') || '{}');
        return snoozed[reminderId];
      } catch {
        return null;
      }
    }
    
    async function snoozeReminder(reminderId, dbId) {
      const snoozedUntil = new Date();
      snoozedUntil.setDate(snoozedUntil.getDate() + 7);
      
      try {
        const snoozed = JSON.parse(localStorage.getItem('mcc_snoozed_reminders') || '{}');
        snoozed[reminderId] = snoozedUntil.toISOString();
        localStorage.setItem('mcc_snoozed_reminders', JSON.stringify(snoozed));
      } catch {}
      
      if (dbId) {
        await supabaseClient.from('reminders').update({ status: 'snoozed' }).eq('id', dbId);
      }
      
      reminders = reminders.filter(r => r.id !== reminderId);
      renderReminders();
      renderUpcomingReminders();
      updateStats();
      showToast('Reminder snoozed for 7 days');
    }
    
    function openCreateReminderModal() {
      const vehicleSelect = document.getElementById('reminder-vehicle');
      vehicleSelect.innerHTML = '<option value="">Select a vehicle...</option>' + 
        vehicles.map(v => `<option value="${v.id}">${v.nickname || `${v.year || ''} ${v.make} ${v.model}`.trim()}</option>`).join('');
      
      document.getElementById('reminder-title-input').value = '';
      document.getElementById('reminder-type-select').value = 'maintenance';
      document.getElementById('reminder-due-date').value = '';
      document.getElementById('reminder-due-mileage').value = '';
      document.getElementById('reminder-notes').value = '';
      document.querySelector('input[name="reminder-due-type"][value="date"]').checked = true;
      toggleReminderDueType();
      
      openModal('create-reminder-modal');
    }
    
    function toggleReminderDueType() {
      const dueType = document.querySelector('input[name="reminder-due-type"]:checked').value;
      document.getElementById('reminder-date-group').style.display = dueType === 'date' ? 'block' : 'none';
      document.getElementById('reminder-mileage-group').style.display = dueType === 'mileage' ? 'block' : 'none';
    }
    
    async function saveReminder() {
      const vehicleId = document.getElementById('reminder-vehicle').value;
      const title = document.getElementById('reminder-title-input').value.trim();
      const reminderType = document.getElementById('reminder-type-select').value;
      const dueType = document.querySelector('input[name="reminder-due-type"]:checked').value;
      const dueDate = document.getElementById('reminder-due-date').value;
      const dueMileage = document.getElementById('reminder-due-mileage').value;
      const notes = document.getElementById('reminder-notes').value.trim();
      
      if (!vehicleId) {
        showToast('Please select a vehicle', 'error');
        return;
      }
      if (!title) {
        showToast('Please enter a reminder title', 'error');
        return;
      }
      if (dueType === 'date' && !dueDate) {
        showToast('Please enter a due date', 'error');
        return;
      }
      if (dueType === 'mileage' && !dueMileage) {
        showToast('Please enter a due mileage', 'error');
        return;
      }
      
      const reminderData = {
        vehicle_id: vehicleId,
        title: title,
        reminder_type: reminderType,
        description: notes || null,
        due_date: dueType === 'date' ? dueDate : null,
        due_mileage: dueType === 'mileage' ? parseInt(dueMileage) : null,
        status: 'pending'
      };
      
      const { error } = await supabaseClient.from('reminders').insert(reminderData);
      
      if (error) {
        showToast('Failed to create reminder: ' + error.message, 'error');
        return;
      }
      
      closeModal('create-reminder-modal');
      showToast('Reminder created successfully', 'success');
      await loadReminders();
      updateStats();
    }

    function getDismissedReminderIds() {
      try {
        return JSON.parse(localStorage.getItem('mcc_dismissed_reminders') || '[]');
      } catch {
        return [];
      }
    }

    function dismissReminder(reminderId) {
      const dismissedIds = getDismissedReminderIds();
      if (!dismissedIds.includes(reminderId)) {
        dismissedIds.push(reminderId);
        localStorage.setItem('mcc_dismissed_reminders', JSON.stringify(dismissedIds));
      }
      reminders = reminders.filter(r => r.id !== reminderId);
      updateShowDismissedButton();
      renderReminders();
      renderUpcomingReminders();
      updateStats();
      showToast('Reminder dismissed');
    }

    function updateShowDismissedButton() {
      const dismissedIds = getDismissedReminderIds();
      const btn = document.getElementById('show-dismissed-btn');
      if (btn) {
        btn.style.display = dismissedIds.length > 0 ? 'block' : 'none';
      }
    }

    let showingDismissed = false;
    function toggleDismissedReminders() {
      showingDismissed = !showingDismissed;
      const btn = document.getElementById('show-dismissed-btn');
      if (showingDismissed) {
        btn.textContent = 'Hide dismissed';
        localStorage.removeItem('mcc_dismissed_reminders');
        loadReminders();
        showToast('Dismissed reminders restored');
      } else {
        btn.textContent = 'Show dismissed';
        loadReminders();
      }
    }

    async function loadServiceHistory() {
      const { data } = await supabaseClient.from('service_history').select('*, vehicles(nickname, year, make, model, fuel_injection_type)').eq('vehicles.owner_id', currentUser.id).order('service_date', { ascending: false });
      serviceHistory = data || [];
      renderServiceHistory();
    }

    // ========== SERVICE RECOMMENDATIONS ==========
    let recommendations = [];

    async function loadRecommendations() {
      try {
        const vehicleIds = vehicles.map(v => v.id);
        if (vehicleIds.length === 0) {
          recommendations = [];
          renderRecommendations();
          return;
        }

        const { data, error } = await supabaseClient
          .from('service_recommendations')
          .select('*, vehicles(id, nickname, year, make, model, fuel_injection_type)')
          .in('vehicle_id', vehicleIds)
          .eq('is_dismissed', false)
          .order('priority', { ascending: true })
          .order('created_at', { ascending: false });

        if (error) {
          console.log('service_recommendations table may not exist:', error);
          await generateLocalRecommendations();
          return;
        }

        recommendations = data || [];
        if (recommendations.length === 0) {
          await generateLocalRecommendations();
        } else {
          renderRecommendations();
        }
      } catch (err) {
        console.log('loadRecommendations error:', err);
        await generateLocalRecommendations();
      }
    }

    async function generateLocalRecommendations() {
      recommendations = [];
      const now = new Date();

      for (const vehicle of vehicles) {
        const vehicleName = vehicle.nickname || `${vehicle.year || ''} ${vehicle.make} ${vehicle.model}`.trim();
        const mileage = vehicle.mileage || vehicle.current_mileage || 0;

        if (vehicle.last_oil_change_date) {
          const lastOilChange = new Date(vehicle.last_oil_change_date);
          const monthsSince = (now - lastOilChange) / (1000 * 60 * 60 * 24 * 30);
          if (monthsSince > 6) {
            recommendations.push({
              id: `local-oil-${vehicle.id}`,
              vehicle_id: vehicle.id,
              vehicles: { id: vehicle.id, nickname: vehicle.nickname, year: vehicle.year, make: vehicle.make, model: vehicle.model },
              service_type: 'Oil Change',
              priority: monthsSince > 9 ? 'urgent' : 'soon',
              reason: `Last oil change was ${Math.floor(monthsSince)} months ago`,
              estimated_cost_low: 35,
              estimated_cost_high: 85,
              source: 'time',
              isLocal: true
            });
          }
        } else if (!vehicle.last_oil_change_date && mileage > 0) {
          recommendations.push({
            id: `local-oil-unknown-${vehicle.id}`,
            vehicle_id: vehicle.id,
            vehicles: { id: vehicle.id, nickname: vehicle.nickname, year: vehicle.year, make: vehicle.make, model: vehicle.model },
            service_type: 'Oil Change',
            priority: 'upcoming',
            reason: 'No oil change records found - consider scheduling soon',
            estimated_cost_low: 35,
            estimated_cost_high: 85,
            source: 'time',
            isLocal: true
          });
        }

        if (vehicle.last_tire_rotation_date) {
          const lastRotation = new Date(vehicle.last_tire_rotation_date);
          const monthsSince = (now - lastRotation) / (1000 * 60 * 60 * 24 * 30);
          if (monthsSince > 6) {
            recommendations.push({
              id: `local-tire-${vehicle.id}`,
              vehicle_id: vehicle.id,
              vehicles: { id: vehicle.id, nickname: vehicle.nickname, year: vehicle.year, make: vehicle.make, model: vehicle.model },
              service_type: 'Tire Rotation',
              priority: monthsSince > 12 ? 'soon' : 'routine',
              reason: `Last tire rotation was ${Math.floor(monthsSince)} months ago`,
              estimated_cost_low: 25,
              estimated_cost_high: 50,
              source: 'time',
              isLocal: true
            });
          }
        }

        if (vehicle.last_brake_service_date) {
          const lastBrake = new Date(vehicle.last_brake_service_date);
          const monthsSince = (now - lastBrake) / (1000 * 60 * 60 * 24 * 30);
          if (monthsSince > 24) {
            recommendations.push({
              id: `local-brake-${vehicle.id}`,
              vehicle_id: vehicle.id,
              vehicles: { id: vehicle.id, nickname: vehicle.nickname, year: vehicle.year, make: vehicle.make, model: vehicle.model },
              service_type: 'Brake Inspection',
              priority: monthsSince > 36 ? 'urgent' : 'soon',
              reason: `Last brake service was ${Math.floor(monthsSince)} months ago`,
              estimated_cost_low: 50,
              estimated_cost_high: 400,
              source: 'time',
              isLocal: true
            });
          }
        }

        if (mileage > 30000 && !vehicle.last_transmission_service_date) {
          recommendations.push({
            id: `local-trans-${vehicle.id}`,
            vehicle_id: vehicle.id,
            vehicles: { id: vehicle.id, nickname: vehicle.nickname, year: vehicle.year, make: vehicle.make, model: vehicle.model },
            service_type: 'Transmission Service',
            priority: mileage > 60000 ? 'soon' : 'routine',
            reason: `At ${mileage.toLocaleString()} miles, consider a transmission fluid check`,
            estimated_cost_low: 100,
            estimated_cost_high: 250,
            source: 'mileage',
            isLocal: true
          });
        }

        if (mileage > 50000 && !vehicle.last_coolant_flush_date) {
          recommendations.push({
            id: `local-coolant-${vehicle.id}`,
            vehicle_id: vehicle.id,
            vehicles: { id: vehicle.id, nickname: vehicle.nickname, year: vehicle.year, make: vehicle.make, model: vehicle.model },
            service_type: 'Coolant Flush',
            priority: 'routine',
            reason: `At ${mileage.toLocaleString()} miles, a coolant flush is recommended`,
            estimated_cost_low: 100,
            estimated_cost_high: 200,
            source: 'mileage',
            isLocal: true
          });
        }
      }

      const priorityOrder = { urgent: 0, soon: 1, upcoming: 2, routine: 3 };
      recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

      renderRecommendations();
    }

    async function generateRecommendations(vehicleId) {
      const vehicle = vehicles.find(v => v.id === vehicleId);
      if (!vehicle) return;

      const now = new Date();
      const vehicleName = vehicle.nickname || `${vehicle.year || ''} ${vehicle.make} ${vehicle.model}`.trim();
      const mileage = vehicle.mileage || vehicle.current_mileage || 0;
      const newRecs = [];

      if (vehicle.last_oil_change_date) {
        const lastOilChange = new Date(vehicle.last_oil_change_date);
        const monthsSince = (now - lastOilChange) / (1000 * 60 * 60 * 24 * 30);
        if (monthsSince > 6) {
          newRecs.push({
            vehicle_id: vehicleId,
            service_type: 'Oil Change',
            priority: monthsSince > 9 ? 'urgent' : 'soon',
            reason: `Last oil change was ${Math.floor(monthsSince)} months ago`,
            estimated_cost_low: 35,
            estimated_cost_high: 85,
            source: 'time'
          });
        }
      }

      if (vehicle.last_tire_rotation_date) {
        const lastRotation = new Date(vehicle.last_tire_rotation_date);
        const monthsSince = (now - lastRotation) / (1000 * 60 * 60 * 24 * 30);
        if (monthsSince > 6) {
          newRecs.push({
            vehicle_id: vehicleId,
            service_type: 'Tire Rotation',
            priority: monthsSince > 12 ? 'soon' : 'routine',
            reason: `Last tire rotation was ${Math.floor(monthsSince)} months ago`,
            estimated_cost_low: 25,
            estimated_cost_high: 50,
            source: 'time'
          });
        }
      }

      if (vehicle.last_brake_service_date) {
        const lastBrake = new Date(vehicle.last_brake_service_date);
        const monthsSince = (now - lastBrake) / (1000 * 60 * 60 * 24 * 30);
        if (monthsSince > 24) {
          newRecs.push({
            vehicle_id: vehicleId,
            service_type: 'Brake Inspection',
            priority: monthsSince > 36 ? 'urgent' : 'soon',
            reason: `Last brake service was ${Math.floor(monthsSince)} months ago`,
            estimated_cost_low: 50,
            estimated_cost_high: 400,
            source: 'time'
          });
        }
      }

      if (mileage > 30000 && !vehicle.last_transmission_service_date) {
        newRecs.push({
          vehicle_id: vehicleId,
          service_type: 'Transmission Service',
          priority: mileage > 60000 ? 'soon' : 'routine',
          reason: `At ${mileage.toLocaleString()} miles, consider a transmission fluid check`,
          estimated_cost_low: 100,
          estimated_cost_high: 250,
          source: 'mileage'
        });
      }

      if (mileage > 50000 && !vehicle.last_coolant_flush_date) {
        newRecs.push({
          vehicle_id: vehicleId,
          service_type: 'Coolant Flush',
          priority: 'routine',
          reason: `At ${mileage.toLocaleString()} miles, a coolant flush is recommended`,
          estimated_cost_low: 100,
          estimated_cost_high: 200,
          source: 'mileage'
        });
      }

      for (const rec of newRecs) {
        try {
          const { data: existing } = await supabaseClient
            .from('service_recommendations')
            .select('id')
            .eq('vehicle_id', vehicleId)
            .eq('service_type', rec.service_type)
            .eq('is_dismissed', false)
            .single();

          if (existing) {
            await supabaseClient
              .from('service_recommendations')
              .update({ priority: rec.priority, reason: rec.reason })
              .eq('id', existing.id);
          } else {
            await supabaseClient
              .from('service_recommendations')
              .insert(rec);
          }
        } catch (err) {
          console.log('Could not save recommendation to database:', err);
        }
      }

      await loadRecommendations();
    }

    async function refreshAllRecommendations() {
      showToast('Refreshing recommendations...', 'success');
      for (const vehicle of vehicles) {
        await generateRecommendations(vehicle.id);
      }
      await loadRecommendations();
      showToast('Recommendations updated', 'success');
    }

    function getRecommendationIcon(serviceType) {
      const icons = {
        'Oil Change': '🛢️',
        'Tire Rotation': '🔄',
        'Brake Inspection': '🛑',
        'Brake Service': '🛑',
        'Transmission Service': '⚙️',
        'Coolant Flush': '💧',
        'Air Filter': '🌬️',
        'Battery Check': '🔋',
        'Alignment': '📐',
        'Inspection': '🔍',
        'Tune-Up': '🔧',
        'default': '🔧'
      };
      return icons[serviceType] || icons['default'];
    }

    function getRecommendationExplanation(serviceType, source, priority) {
      const serviceExplanations = {
        'Oil Change': 'Engine oil breaks down with heat and use, losing its ability to lubricate and protect moving parts. Fresh oil prevents metal-on-metal wear that leads to expensive engine damage.',
        'Tire Rotation': 'Front tires wear faster due to steering forces. Rotation evens out wear patterns, extending total tire life by 20-30% and maintaining balanced handling.',
        'Brake Inspection': 'Brake pads thin with every stop. An inspection measures remaining material and catches issues before they compromise your safety or damage rotors.',
        'Brake Service': 'Your brake pads are a wear item - the friction material gets thinner each time you stop. Replacing worn pads prevents rotor damage and ensures reliable stopping.',
        'Transmission Service': 'Transmission fluid degrades from heat, affecting shift quality and component protection. Fresh fluid helps prevent the $3,000-$8,000 cost of transmission failure.',
        'Coolant Flush': 'Old coolant becomes acidic and loses its heat-transfer properties. Fresh coolant prevents overheating and protects against internal corrosion.',
        'Air Filter': 'A clogged air filter restricts airflow, reducing engine power and fuel economy. Clean filters let your engine breathe freely for optimal performance.',
        'Battery Check': 'Car batteries typically last 3-5 years. Testing reveals weak batteries before they strand you, and cleaning terminals ensures reliable starts.',
        'Alignment': 'Misaligned wheels cause uneven tire wear and poor handling. An alignment protects your tire investment and improves driving feel.',
        'Inspection': 'Comprehensive inspections catch developing issues early when they are cheap to fix, preventing surprise breakdowns and costly emergency repairs.',
        'Tune-Up': 'Modern tune-ups focus on spark plugs, filters, and systems that affect performance. Fresh components restore power, economy, and smooth operation.'
      };
      
      let explanation = serviceExplanations[serviceType] || 'Regular maintenance keeps your vehicle running reliably and helps prevent unexpected repair costs.';
      
      if (source === 'mileage') {
        explanation += ' This is based on your current mileage.';
      } else if (source === 'time') {
        explanation += ' Time-based intervals apply even with low mileage because fluids and components age.';
      } else if (source === 'inspection') {
        explanation += ' A recent inspection identified this need.';
      }
      
      if (priority === 'urgent') {
        explanation += ' ⚠️ This should be addressed soon to prevent further issues.';
      }
      
      return explanation;
    }

    function renderRecommendations() {
      const container = document.getElementById('recommendations-list');

      if (!recommendations.length) {
        container.innerHTML = `
          <div class="empty-state" style="padding:24px;">
            <div class="empty-state-icon">✅</div>
            <p>No service recommendations at this time.</p>
            <p style="font-size:0.85rem;margin-top:8px;">Recommendations will appear based on your vehicle data and service history.</p>
          </div>`;
        return;
      }

      const groupedByVehicle = {};
      recommendations.forEach(rec => {
        const vId = rec.vehicle_id;
        if (!groupedByVehicle[vId]) {
          groupedByVehicle[vId] = {
            vehicle: rec.vehicles,
            recs: []
          };
        }
        groupedByVehicle[vId].recs.push(rec);
      });

      let html = '';
      Object.entries(groupedByVehicle).forEach(([vehicleId, group]) => {
        const vehicleName = group.vehicle ? 
          (group.vehicle.nickname || `${group.vehicle.year || ''} ${group.vehicle.make} ${group.vehicle.model}`.trim()) : 
          'Unknown Vehicle';

        if (Object.keys(groupedByVehicle).length > 1) {
          html += `<div class="recommendation-vehicle">🚗 ${vehicleName}</div>`;
        }

        group.recs.forEach(rec => {
          const icon = getRecommendationIcon(rec.service_type);
          const priorityClass = rec.priority || 'routine';
          const costRange = (rec.estimated_cost_low && rec.estimated_cost_high) 
            ? `$${rec.estimated_cost_low} - $${rec.estimated_cost_high}` 
            : '';
          const dueInfo = rec.due_date 
            ? `Due: ${new Date(rec.due_date).toLocaleDateString()}` 
            : (rec.due_mileage ? `Due at ${rec.due_mileage.toLocaleString()} miles` : '');
          const whyExplanation = getRecommendationExplanation(rec.service_type, rec.source, priorityClass);

          html += `
            <div class="recommendation-item priority-${priorityClass}">
              <div class="recommendation-icon ${priorityClass}">${icon}</div>
              <div class="recommendation-content">
                <div class="recommendation-header">
                  <span class="recommendation-title">${rec.service_type}</span>
                  <span class="recommendation-priority ${priorityClass}">${priorityClass}</span>
                </div>
                <div class="recommendation-reason">${rec.reason || 'Regular maintenance recommended'}</div>
                <div class="recommendation-why" style="margin:10px 0;padding:10px 12px;background:var(--accent-gold-soft);border-radius:var(--radius-sm);border-left:3px solid var(--accent-gold);">
                  <span style="font-size:0.82rem;color:var(--text-secondary);line-height:1.5;">💡 <strong>Why this matters:</strong> ${whyExplanation}</span>
                </div>
                <div class="recommendation-meta">
                  ${costRange ? `<span>💰 ${costRange}</span>` : ''}
                  ${dueInfo ? `<span>📅 ${dueInfo}</span>` : ''}
                  ${rec.source ? `<span>📊 ${rec.source === 'time' ? 'Time-based' : rec.source === 'mileage' ? 'Mileage-based' : rec.source === 'inspection' ? 'Inspection' : 'Manual'}</span>` : ''}
                </div>
                <div class="recommendation-actions">
                  <button class="btn btn-primary btn-sm" data-rec="${encodeURIComponent(JSON.stringify({
                    vehicleId: rec.vehicle_id,
                    serviceType: rec.service_type,
                    reason: rec.reason || 'Regular maintenance recommended',
                    costLow: rec.estimated_cost_low || null,
                    costHigh: rec.estimated_cost_high || null,
                    priority: rec.priority || 'routine'
                  }))}" onclick="scheduleFromRecommendation(this)">📅 Schedule Service</button>
                  <button class="btn btn-ghost btn-sm" onclick="dismissRecommendation('${rec.id}', ${rec.isLocal || false})">Dismiss</button>
                </div>
              </div>
            </div>
          `;
        });
      });

      container.innerHTML = html;
    }

    const recommendationToServiceType = {
      'oil change': 'Oil change / fluids',
      'oil service': 'Oil change / fluids',
      'synthetic oil': 'Oil change / fluids',
      'conventional oil': 'Oil change / fluids',
      'transmission service': 'Transmission service',
      'transmission fluid': 'Transmission service',
      'transfer case': 'Transmission service',
      'coolant flush': 'AC / heating service',
      'coolant service': 'AC / heating service',
      'radiator': 'AC / heating service',
      'brake service': 'Brake service',
      'brake inspection': 'Brake service',
      'brake pad': 'Brake service',
      'brake rotor': 'Brake service',
      'brake fluid': 'Brake service',
      'tire rotation': 'Tire rotation / alignment',
      'tire balance': 'Tire rotation / alignment',
      'wheel alignment': 'Tire rotation / alignment',
      'alignment': 'Tire rotation / alignment',
      'tire replacement': 'Tire rotation / alignment',
      'battery': 'Battery / electrical',
      'battery replacement': 'Battery / electrical',
      'alternator': 'Battery / electrical',
      'starter': 'Battery / electrical',
      'electrical': 'Battery / electrical',
      'engine tune-up': 'Engine tune-up',
      'tune-up': 'Engine tune-up',
      'engine service': 'Engine tune-up',
      'spark plugs': 'Spark plugs',
      'spark plug': 'Spark plugs',
      'ignition': 'Spark plugs',
      'belt replacement': 'Belt / hose replacement',
      'timing belt': 'Belt / hose replacement',
      'serpentine belt': 'Belt / hose replacement',
      'drive belt': 'Belt / hose replacement',
      'hose replacement': 'Belt / hose replacement',
      'radiator hose': 'Belt / hose replacement',
      'suspension': 'Suspension / steering',
      'steering': 'Suspension / steering',
      'shock': 'Suspension / steering',
      'strut': 'Suspension / steering',
      'ball joint': 'Suspension / steering',
      'tie rod': 'Suspension / steering',
      'control arm': 'Suspension / steering',
      'diagnostic': 'Diagnostic / check engine',
      'check engine': 'Diagnostic / check engine',
      'engine light': 'Diagnostic / check engine',
      'obd': 'Diagnostic / check engine',
      'scan': 'Diagnostic / check engine',
      'air filter': 'Engine tune-up',
      'engine air filter': 'Engine tune-up',
      'cabin filter': 'AC / heating service',
      'cabin air filter': 'AC / heating service',
      'fuel system': 'Fuel system cleaning',
      'fuel filter': 'Fuel system cleaning',
      'fuel injection': 'Fuel system cleaning',
      'injector': 'Fuel system cleaning',
      'ac service': 'AC / heating service',
      'air conditioning': 'AC / heating service',
      'heater': 'AC / heating service',
      'hvac': 'AC / heating service',
      'climate control': 'AC / heating service',
      'differential': 'Transmission service',
      'differential fluid': 'Transmission service',
      'axle': 'Transmission service',
      'power steering': 'Suspension / steering',
      'power steering fluid': 'Suspension / steering',
      'wheel bearing': 'Suspension / steering',
      'hub bearing': 'Suspension / steering',
      'water pump': 'AC / heating service',
      'thermostat': 'AC / heating service',
      'exhaust': 'Other service',
      'muffler': 'Other service',
      'catalytic': 'Other service',
      'windshield wiper': 'Other service',
      'wiper': 'Other service',
      'headlight': 'Battery / electrical',
      'light bulb': 'Battery / electrical',
      'fluid flush': 'Oil change / fluids',
      'fluid service': 'Oil change / fluids'
    };

    function normalizeServiceType(str) {
      return str.toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    function scheduleFromRecommendation(buttonEl) {
      let data;
      try {
        data = JSON.parse(decodeURIComponent(buttonEl.dataset.rec));
      } catch (e) {
        console.error('Failed to parse recommendation data:', e);
        openPackageModal();
        return;
      }
      
      const { vehicleId, serviceType, reason, costLow, costHigh, priority } = data;
      
      openPackageModal();
      
      setTimeout(() => {
        const vehicleSelect = document.getElementById('p-vehicle');
        if (vehicleSelect) vehicleSelect.value = vehicleId;
        
        const titleInput = document.getElementById('p-title');
        if (titleInput) titleInput.value = serviceType;
        
        const descInput = document.getElementById('p-description');
        if (descInput) {
          let description = reason;
          if (costLow && costHigh) {
            description += `\n\nEstimated cost range: $${costLow} - $${costHigh}`;
          }
          if (priority && priority !== 'routine') {
            description += `\nPriority: ${priority.charAt(0).toUpperCase() + priority.slice(1)}`;
          }
          descInput.value = description;
        }
        
        const serviceTypeSelect = document.getElementById('p-service-type');
        const categorySelect = document.getElementById('p-category');
        
        if (serviceTypeSelect && categorySelect) {
          const trySelectServiceType = () => {
            if (serviceTypeSelect.options.length <= 1) return false;
            
            const normalizedServiceType = normalizeServiceType(serviceType);
            const options = Array.from(serviceTypeSelect.options);
            
            const exactMatch = options.find(opt => 
              opt.value && normalizeServiceType(opt.value) === normalizedServiceType
            );
            if (exactMatch) {
              serviceTypeSelect.value = exactMatch.value;
              return true;
            }
            
            const serviceTypeLower = serviceType.toLowerCase();
            let matchedValue = null;
            for (const [key, value] of Object.entries(recommendationToServiceType)) {
              if (serviceTypeLower.includes(key)) {
                matchedValue = value;
                break;
              }
            }
            
            if (matchedValue) {
              const matchingOption = options.find(opt => opt.value === matchedValue);
              if (matchingOption) {
                serviceTypeSelect.value = matchedValue;
                return true;
              }
            }
            
            return false;
          };
          
          const observer = new MutationObserver((mutations, obs) => {
            if (trySelectServiceType()) {
              obs.disconnect();
            }
          });
          
          observer.observe(serviceTypeSelect, { childList: true });
          
          categorySelect.value = 'maintenance';
          categorySelect.dispatchEvent(new Event('change'));
          
          if (trySelectServiceType()) {
            observer.disconnect();
          }
          
          setTimeout(() => observer.disconnect(), 2000);
        }
      }, 100);
    }

    async function dismissRecommendation(recId, isLocal = false) {
      if (isLocal) {
        recommendations = recommendations.filter(r => r.id !== recId);
        renderRecommendations();
        showToast('Recommendation dismissed');
        return;
      }

      try {
        const { error } = await supabaseClient
          .from('service_recommendations')
          .update({ is_dismissed: true, dismissed_at: new Date().toISOString() })
          .eq('id', recId);

        if (error) throw error;

        recommendations = recommendations.filter(r => r.id !== recId);
        renderRecommendations();
        showToast('Recommendation dismissed');
      } catch (err) {
        console.log('Could not dismiss recommendation:', err);
        recommendations = recommendations.filter(r => r.id !== recId);
        renderRecommendations();
        showToast('Recommendation dismissed');
      }
    }

    async function updateStats() {
      document.getElementById('stat-vehicles').textContent = vehicles.length;
      document.getElementById('stat-packages').textContent = packages.filter(p => ['open', 'pending', 'accepted', 'in_progress'].includes(p.status)).length;
      document.getElementById('stat-reminders').textContent = reminders.filter(r => r.status === 'due' || r.status === 'overdue').length;
      document.getElementById('stat-completed').textContent = packages.filter(p => p.status === 'completed').length;
      
      // Calculate total bids received across all open packages
      const totalBids = packages
        .filter(p => p.status === 'open')
        .reduce((sum, p) => sum + (p.bid_count || 0), 0);
      document.getElementById('stat-bids').textContent = totalBids;
      
      // Load provider count
      try {
        const { count } = await supabaseClient.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'provider').eq('is_suspended', false);
        document.getElementById('stat-providers').textContent = count || 0;
      } catch (e) {
        document.getElementById('stat-providers').textContent = '--';
      }
      
      // Update nav badges
      const reminderCount = reminders.filter(r => r.status === 'due' || r.status === 'overdue').length;
      const reminderBadge = document.getElementById('reminder-count');
      if (reminderCount > 0) {
        reminderBadge.textContent = reminderCount;
        reminderBadge.style.display = 'inline';
      }
    }

    // ========== RENDERING ==========
    function renderVehicles() {
      const grid = document.getElementById('vehicles-grid');
      if (!vehicles.length) {
        grid.innerHTML = `
          <div class="empty-state" style="grid-column: 1 / -1; padding: 60px 20px;">
            <div class="empty-state-icon" style="font-size: 64px; margin-bottom: 20px;">🚗</div>
            <h3 style="font-size: 1.3rem; margin-bottom: 8px;">No vehicles yet</h3>
            <p style="color: var(--text-muted); margin-bottom: 24px;">Add your first vehicle to get started with maintenance tracking.</p>
            <button class="btn btn-primary" onclick="openVehicleModal()" style="padding: 14px 28px; font-size: 1rem;">+ Add Your First Vehicle</button>
          </div>`;
        return;
      }
      grid.innerHTML = vehicles.map(v => {
        const healthClass = v.health_score >= 90 ? 'excellent' : v.health_score >= 70 ? 'good' : v.health_score >= 50 ? 'fair' : 'poor';
        const healthLabel = v.health_score >= 90 ? 'Excellent' : v.health_score >= 70 ? 'Good' : v.health_score >= 50 ? 'Fair' : 'Needs Attention';
        const vehicleTitle = `${v.year || ''} ${v.make} ${v.model}`.trim();
        const vehicleSubtitle = `${v.year || ''} ${v.make} ${v.model} ${v.trim || ''} ${v.color ? '• ' + v.color : ''}`.trim();
        const photoContent = v.photo_url 
          ? `<img src="${v.photo_url}" alt="${vehicleTitle}" style="width:100%;height:100%;object-fit:cover;">`
          : `<span class="vehicle-emoji">🚗</span>`;
        const verifiedBadge = userVerificationStatus?.verified 
          ? '<span style="position:absolute;top:12px;left:12px;background:linear-gradient(135deg, var(--accent-green), #3da577);color:white;padding:4px 10px;border-radius:100px;font-size:0.7rem;font-weight:600;display:flex;align-items:center;gap:4px;">🛡️ Verified Owner</span>' 
          : '';
        return `
          <div class="vehicle-card">
            <div class="vehicle-card-photo">
              ${photoContent}
              ${verifiedBadge}
              <span class="vehicle-card-badge ${healthClass}">${healthLabel}</span>
            </div>
            <div class="vehicle-card-body">
              <div class="vehicle-card-title">${v.nickname || vehicleTitle}</div>
              <div class="vehicle-card-subtitle">${vehicleSubtitle}</div>
              <div class="vehicle-card-meta">
                <span>🏷️ ${v.mileage ? v.mileage.toLocaleString() + ' mi' : 'No mileage'}</span>
                ${v.vin ? `<span>VIN: ...${v.vin.slice(-6)}</span>` : ''}
              </div>
              <div class="vehicle-card-actions">
                <button class="btn btn-secondary btn-sm" onclick="viewVehicleDetails('${v.id}')" style="flex: 1;">View Details</button>
                <button class="btn btn-primary btn-sm" onclick="createPackageForVehicle('${v.id}')" style="flex: 1;">+ Service</button>
                <button class="btn btn-ghost btn-sm" onclick="generateHealthReportPDF('${v.id}')" title="Download Health Report" style="padding: 8px;">📄</button>
                <button class="btn btn-ghost btn-sm" onclick="deleteVehicle('${v.id}')" title="Delete" style="padding: 8px;">🗑️</button>
              </div>
            </div>
          </div>
        `;
      }).join('');
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
        
        // Countdown timer for open packages
        let countdownHtml = '';
        if (p.status === 'open' && p.bidding_deadline) {
          const countdown = formatCountdown(p.bidding_deadline);
          const urgentClass = countdown.expired ? 'expired' : countdown.urgent ? 'urgent' : '';
          countdownHtml = `<span class="countdown-timer ${urgentClass}">⏱️ ${countdown.text}</span>`;
        }
        
        // Repost button for expired packages
        const repostButton = isExpired ? `<button class="btn btn-primary btn-sm" onclick="repostPackage('${p.id}')">🔄 Repost</button>` : '';
        
        // Extend deadline button for open (non-expired) packages
        const extendButton = (p.status === 'open' && !isExpired) ? `<button class="btn btn-ghost btn-sm" onclick="extendDeadline('${p.id}')" title="Add more time">⏱️+</button>` : '';
        
        return `
          <div class="package-card">
            <div class="package-header">
              <div>
                <div class="package-title">${p.title}</div>
                <div class="package-vehicle">${vehicleName}</div>
              </div>
              <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
                <span class="package-status ${statusClass}">${displayStatus}</span>
                ${countdownHtml}
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

    // ========== END MAINTENANCE SCHEDULE ==========

    let posServiceHistory = [];
    let posHistoryOffset = 0;
    let posHistoryHasMore = false;
    let posHistoryProviders = [];

    async function loadPosServiceHistory(append = false) {
      if (!currentUser) return;
      
      const list = document.getElementById('history-list');
      if (!append) {
        list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏳</div><p>Loading service history...</p></div>';
        posHistoryOffset = 0;
        posServiceHistory = [];
      }
      
      try {
        const params = new URLSearchParams();
        params.set('limit', '20');
        params.set('offset', posHistoryOffset.toString());
        
        const vehicleFilter = document.getElementById('history-vehicle-filter').value;
        const providerFilter = document.getElementById('history-provider-filter').value;
        const startDate = document.getElementById('history-start-date').value;
        const endDate = document.getElementById('history-end-date').value;
        const search = document.getElementById('history-search').value.trim();
        
        if (vehicleFilter) params.set('vehicle_id', vehicleFilter);
        if (providerFilter) params.set('provider_id', providerFilter);
        if (startDate) params.set('start_date', startDate);
        if (endDate) params.set('end_date', endDate);
        if (search) params.set('search', search);
        
        const response = await fetch(`/api/member/service-history/${currentUser.id}?${params.toString()}`);
        const result = await response.json();
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to load service history');
        }
        
        if (append) {
          posServiceHistory = [...posServiceHistory, ...result.data];
        } else {
          posServiceHistory = result.data;
          collectProviders(result.data);
        }
        
        posHistoryOffset = posHistoryOffset + result.data.length;
        posHistoryHasMore = result.pagination?.hasMore || false;
        
        renderPosServiceHistory();
        updateHistoryStats();
        
        const paginationEl = document.getElementById('history-pagination');
        paginationEl.style.display = posHistoryHasMore ? 'block' : 'none';
        
      } catch (error) {
        console.error('Error loading POS service history:', error);
        list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><p>Failed to load service history.</p><p style="font-size:0.85rem;color:var(--text-muted);margin-top:8px;">${error.message}</p></div>`;
      }
    }
    
    function collectProviders(data) {
      const providerMap = new Map();
      data.forEach(item => {
        if (item.provider?.id && !providerMap.has(item.provider.id)) {
          providerMap.set(item.provider.id, item.provider.name);
        }
      });
      posHistoryProviders = Array.from(providerMap.entries());
      
      const providerSelect = document.getElementById('history-provider-filter');
      providerSelect.innerHTML = '<option value="">All Providers</option>' + 
        posHistoryProviders.map(([id, name]) => `<option value="${id}">${name}</option>`).join('');
    }
    
    function loadMoreHistory() {
      loadPosServiceHistory(true);
    }
    
    function clearHistoryFilters() {
      document.getElementById('history-vehicle-filter').value = '';
      document.getElementById('history-provider-filter').value = '';
      document.getElementById('history-start-date').value = '';
      document.getElementById('history-end-date').value = '';
      document.getElementById('history-search').value = '';
      loadPosServiceHistory();
    }
    
    function updateHistoryStats() {
      const totalServices = posServiceHistory.length;
      const totalSpent = posServiceHistory.reduce((sum, h) => sum + (h.total || 0), 0);
      const uniqueProviders = new Set(posServiceHistory.map(h => h.provider?.id).filter(Boolean)).size;
      
      document.getElementById('history-stat-total').textContent = totalServices.toString();
      document.getElementById('history-stat-spent').textContent = '$' + totalSpent.toFixed(2);
      document.getElementById('history-stat-providers').textContent = uniqueProviders.toString();
    }
    
    function renderPosServiceHistory() {
      const list = document.getElementById('history-list');
      
      if (!posServiceHistory.length) {
        list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📜</div><p>No service history found.</p><p style="font-size:0.9rem;color:var(--text-muted);margin-top:8px;">Completed walk-in services will appear here.</p></div>`;
        return;
      }
      
      list.innerHTML = posServiceHistory.map(h => {
        const date = new Date(h.date);
        const statusClass = h.status === 'refunded' ? 'status-refunded' : 'status-completed';
        const statusLabel = h.status === 'refunded' ? 'Refunded' : 'Completed';
        
        const servicesArray = h.services || [];
        const servicesList = servicesArray.length > 0 
          ? servicesArray.map(s => s.name || s.description || 'Service').join(', ')
          : (h.serviceDescription || 'Walk-in Service');
        
        return `
          <div class="service-history-card" id="history-card-${h.id}">
            <div class="service-history-header" onclick="toggleHistoryDetails('${h.id}')">
              <div class="service-history-provider">
                <div class="provider-avatar">${(h.provider?.name || 'P').charAt(0).toUpperCase()}</div>
                <div class="provider-info">
                  <div class="provider-name">${h.provider?.name || 'Unknown Provider'}</div>
                  <div class="service-date">${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
                </div>
              </div>
              <div class="service-history-summary">
                <span class="service-status-badge ${statusClass}">${statusLabel}</span>
                <div class="service-total">$${(h.total || 0).toFixed(2)}</div>
              </div>
            </div>
            <div class="service-history-body">
              <div class="service-info-row">
                <div class="service-info-item">
                  <span class="info-label">🔧 Services</span>
                  <span class="info-value">${servicesList}</span>
                </div>
                <div class="service-info-item">
                  <span class="info-label">🚗 Vehicle</span>
                  <span class="info-value">${h.vehicle?.displayName || 'Unknown Vehicle'}</span>
                </div>
              </div>
              <button class="btn btn-ghost btn-sm expand-btn" onclick="toggleHistoryDetails('${h.id}')">
                <span class="expand-icon">▼</span> View Details
              </button>
            </div>
            <div class="service-history-details" id="details-${h.id}" style="display:none;">
              <div class="details-section">
                <h4>Receipt Details</h4>
                <div class="receipt-breakdown">
                  ${servicesArray.length > 0 ? `
                    <div class="receipt-items">
                      ${servicesArray.map(s => `
                        <div class="receipt-item">
                          <span>${s.name || s.description || 'Service'}</span>
                          <span>$${(s.price || 0).toFixed(2)}</span>
                        </div>
                      `).join('')}
                    </div>
                  ` : ''}
                  <div class="receipt-totals">
                    ${h.laborTotal ? `<div class="receipt-line"><span>Labor</span><span>$${h.laborTotal.toFixed(2)}</span></div>` : ''}
                    ${h.partsTotal ? `<div class="receipt-line"><span>Parts</span><span>$${h.partsTotal.toFixed(2)}</span></div>` : ''}
                    ${h.subtotal ? `<div class="receipt-line"><span>Subtotal</span><span>$${h.subtotal.toFixed(2)}</span></div>` : ''}
                    ${h.taxTotal ? `<div class="receipt-line"><span>Tax</span><span>$${h.taxTotal.toFixed(2)}</span></div>` : ''}
                    <div class="receipt-line total"><span>Total Paid</span><span>$${(h.total || 0).toFixed(2)}</span></div>
                  </div>
                  ${h.paymentMethod ? `<div class="payment-method">Paid via ${formatPaymentMethod(h.paymentMethod)}</div>` : ''}
                </div>
              </div>
              ${h.technicianNotes ? `
                <div class="details-section">
                  <h4>Technician Notes</h4>
                  <p class="technician-notes">${h.technicianNotes}</p>
                </div>
              ` : ''}
              ${h.inspection ? renderInspectionDetails(h.inspection) : ''}
              <div class="details-actions">
                <button class="btn btn-secondary btn-sm" onclick="printReceipt('${h.id}')">🖨️ Print Receipt</button>
                ${h.provider?.phone ? `<a href="tel:${h.provider.phone}" class="btn btn-ghost btn-sm">📞 Call Provider</a>` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
    
    function renderInspectionDetails(inspection) {
      if (!inspection) return '';
      
      const conditionColors = {
        excellent: 'var(--accent-green)',
        good: 'var(--accent-blue)',
        fair: 'var(--accent-orange)',
        poor: 'var(--accent-red)',
        needs_attention: 'var(--accent-red)'
      };
      
      const conditionColor = conditionColors[inspection.overallCondition] || 'var(--text-secondary)';
      
      return `
        <div class="details-section">
          <h4>Inspection Results</h4>
          <div class="inspection-summary">
            <div class="inspection-condition" style="color:${conditionColor};">
              Overall: ${(inspection.overallCondition || 'N/A').replace(/_/g, ' ').toUpperCase()}
            </div>
            ${inspection.mileage ? `<div class="inspection-mileage">Mileage: ${inspection.mileage.toLocaleString()} mi</div>` : ''}
          </div>
          ${inspection.items && inspection.items.length > 0 ? `
            <div class="inspection-items">
              ${inspection.items.map(item => `
                <div class="inspection-item">
                  <span class="item-name">${item.name || item.category || 'Item'}</span>
                  <span class="item-condition status-${item.condition || 'good'}">${(item.condition || 'OK').toUpperCase()}</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
          ${inspection.notes ? `<p class="inspection-notes">${inspection.notes}</p>` : ''}
        </div>
      `;
    }
    
    function formatPaymentMethod(method) {
      const methods = {
        cash: 'Cash',
        card: 'Card',
        credit_card: 'Credit Card',
        debit_card: 'Debit Card',
        check: 'Check',
        app: 'In-App Payment'
      };
      return methods[method] || method || 'Unknown';
    }
    
    function toggleHistoryDetails(id) {
      const details = document.getElementById(`details-${id}`);
      const card = document.getElementById(`history-card-${id}`);
      const expandBtn = card.querySelector('.expand-btn');
      
      if (details.style.display === 'none') {
        details.style.display = 'block';
        card.classList.add('expanded');
        if (expandBtn) {
          expandBtn.innerHTML = '<span class="expand-icon">▲</span> Hide Details';
        }
      } else {
        details.style.display = 'none';
        card.classList.remove('expanded');
        if (expandBtn) {
          expandBtn.innerHTML = '<span class="expand-icon">▼</span> View Details';
        }
      }
    }
    
    function printReceipt(id) {
      const service = posServiceHistory.find(h => h.id === id);
      if (!service) return;
      
      const date = new Date(service.date);
      const servicesArray = service.services || [];
      
      const printWindow = window.open('', '_blank');
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Service Receipt - My Car Concierge</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; max-width: 600px; margin: 0 auto; }
            h1 { text-align: center; margin-bottom: 8px; }
            .subtitle { text-align: center; color: #666; margin-bottom: 24px; }
            .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
            .section { margin: 24px 0; }
            .section h3 { margin-bottom: 12px; border-bottom: 2px solid #333; padding-bottom: 8px; }
            .total-row { font-weight: bold; font-size: 1.2em; border-top: 2px solid #333; padding-top: 12px; }
            .footer { text-align: center; margin-top: 40px; color: #666; font-size: 12px; }
            @media print { body { padding: 20px; } }
          </style>
        </head>
        <body>
          <h1>Service Receipt</h1>
          <p class="subtitle">My Car Concierge</p>
          
          <div class="section">
            <div class="info-row"><span>Date:</span><span>${date.toLocaleDateString()} ${date.toLocaleTimeString()}</span></div>
            <div class="info-row"><span>Provider:</span><span>${service.provider?.name || 'N/A'}</span></div>
            <div class="info-row"><span>Vehicle:</span><span>${service.vehicle?.displayName || 'N/A'}</span></div>
            <div class="info-row"><span>Status:</span><span>${service.status === 'refunded' ? 'Refunded' : 'Completed'}</span></div>
          </div>
          
          <div class="section">
            <h3>Services</h3>
            ${servicesArray.length > 0 ? servicesArray.map(s => `
              <div class="info-row"><span>${s.name || s.description || 'Service'}</span><span>$${(s.price || 0).toFixed(2)}</span></div>
            `).join('') : `<div class="info-row"><span>${service.serviceDescription || 'Walk-in Service'}</span><span>-</span></div>`}
          </div>
          
          <div class="section">
            <h3>Totals</h3>
            ${service.laborTotal ? `<div class="info-row"><span>Labor</span><span>$${service.laborTotal.toFixed(2)}</span></div>` : ''}
            ${service.partsTotal ? `<div class="info-row"><span>Parts</span><span>$${service.partsTotal.toFixed(2)}</span></div>` : ''}
            ${service.subtotal ? `<div class="info-row"><span>Subtotal</span><span>$${service.subtotal.toFixed(2)}</span></div>` : ''}
            ${service.taxTotal ? `<div class="info-row"><span>Tax</span><span>$${service.taxTotal.toFixed(2)}</span></div>` : ''}
            <div class="info-row total-row"><span>Total Paid</span><span>$${(service.total || 0).toFixed(2)}</span></div>
          </div>
          
          ${service.technicianNotes ? `
            <div class="section">
              <h3>Technician Notes</h3>
              <p>${service.technicianNotes}</p>
            </div>
          ` : ''}
          
          <div class="footer">
            <p>Thank you for using My Car Concierge!</p>
            <p>Receipt ID: ${service.id}</p>
          </div>
        </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 250);
    }

    function renderServiceHistory() {
      const list = document.getElementById('history-list');
      const filter = document.getElementById('history-vehicle-filter').value;
      let filtered = serviceHistory;
      if (filter) filtered = serviceHistory.filter(h => h.vehicle_id === filter);

      if (!filtered.length) {
        list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📜</div><p>No service history yet. Completed packages will appear here.</p></div>';
        return;
      }
      list.innerHTML = filtered.map(h => {
        const date = new Date(h.service_date);
        return `
          <div class="history-item">
            <div class="history-date">
              <div class="history-date-day">${date.getDate()}</div>
              <div class="history-date-month">${date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}</div>
            </div>
            <div class="history-content">
              <div class="history-title">${h.service_type || h.description}</div>
              <div class="history-details">
                ${h.vehicles ? (h.vehicles.nickname || `${h.vehicles.year} ${h.vehicles.make} ${h.vehicles.model}`) : ''}
                ${h.mileage_at_service ? ` • ${h.mileage_at_service.toLocaleString()} miles` : ''}
              </div>
            </div>
            <div class="history-cost">${h.cost ? '$' + h.cost.toFixed(2) : ''}</div>
          </div>
        `;
      }).join('');
    }

    function updateVehicleSelects() {
      const options = '<option value="">Select a vehicle...</option>' + vehicles.map(v => 
        `<option value="${v.id}">${v.nickname || `${v.year || ''} ${v.make} ${v.model}`.trim()}</option>`
      ).join('');
      document.getElementById('p-vehicle').innerHTML = options;
      document.getElementById('history-vehicle-filter').innerHTML = '<option value="">All Vehicles</option>' + vehicles.map(v => 
        `<option value="${v.id}">${v.nickname || `${v.year || ''} ${v.make} ${v.model}`.trim()}</option>`
      ).join('');
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

    // ========== EVENT LISTENERS ==========
    function setupEventListeners() {
      // Navigation
      document.querySelectorAll('.nav-item[data-section]').forEach(item => {
        item.addEventListener('click', () => showSection(item.dataset.section));
      });

      // Package tabs
      document.querySelectorAll('.tab[data-tab]').forEach(tab => {
        tab.addEventListener('click', () => {
          document.querySelectorAll('.tab[data-tab]').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          currentPackageFilter = tab.dataset.tab;
          renderPackages();
        });
      });

      // Upsell tabs
      document.querySelectorAll('.tab[data-upsell-filter]').forEach(tab => {
        tab.addEventListener('click', () => {
          document.querySelectorAll('.tab[data-upsell-filter]').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          currentUpsellFilter = tab.dataset.upsellFilter;
          renderUpsells();
        });
      });

      // Parts tier selection
      document.querySelectorAll('.parts-tier').forEach(tier => {
        tier.addEventListener('click', () => {
          document.querySelectorAll('.parts-tier').forEach(t => t.classList.remove('selected'));
          tier.classList.add('selected');
          selectedPartsTier = tier.dataset.tier;
        });
      });

      // Bidding window selection
      document.querySelectorAll('.bid-window-option').forEach(opt => {
        opt.addEventListener('click', () => {
          document.querySelectorAll('.bid-window-option').forEach(o => o.classList.remove('selected'));
          opt.classList.add('selected');
          selectedBiddingWindowHours = parseInt(opt.dataset.hours);
        });
      });

      // Category change -> update service types
      document.getElementById('p-category').addEventListener('change', (e) => {
        const types = serviceTypes[e.target.value] || [];
        const options = types.map(t => {
          // Check if this is a separator (starts with ──)
          if (t.startsWith('──')) {
            return `<option value="" disabled style="font-weight:600;color:var(--accent-gold);background:var(--bg-elevated);">${t}</option>`;
          }
          return `<option value="${t}">${t}</option>`;
        }).join('');
        document.getElementById('p-service-type').innerHTML = '<option value="">Select service...</option>' + options;
        document.getElementById('insurance-section').style.display = e.target.value === 'accident_repair' ? 'block' : 'none';
        
        // Show oil preference section for maintenance or manufacturer_service categories
        const showOilPrefs = e.target.value === 'maintenance' || e.target.value === 'manufacturer_service';
        document.getElementById('oil-preference-section').style.display = showOilPrefs ? 'block' : 'none';
        
        // Show fitment section for performance, offroad, and other mod categories
        const fitmentCategories = ['performance', 'offroad', 'cosmetic', 'premium_protection', 'motorcycle', 'classic_vintage'];
        const showFitment = fitmentCategories.includes(e.target.value);
        document.getElementById('fitment-section').style.display = showFitment ? 'block' : 'none';
      });

      // Oil preference toggle selection
      document.querySelectorAll('.oil-pref-option').forEach(opt => {
        opt.addEventListener('click', () => {
          document.querySelectorAll('.oil-pref-option').forEach(o => o.classList.remove('selected'));
          opt.classList.add('selected');
          selectedOilPreference = opt.dataset.choice;
          document.getElementById('oil-specify-options').style.display = opt.dataset.choice === 'specify' ? 'block' : 'none';
        });
      });

      // History filter
      document.getElementById('history-vehicle-filter').addEventListener('change', renderServiceHistory);

      // Close modals on backdrop click
      document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.classList.remove('active'); });
      });

      // Message input enter key
      document.getElementById('message-input').addEventListener('keypress', e => {
        if (e.key === 'Enter') sendMessage();
      });
    }

    // ========== NAVIGATION ==========
    function showSection(sectionId) {
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.getElementById(sectionId).classList.add('active');
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelector(`.nav-item[data-section="${sectionId}"]`)?.classList.add('active');
      document.getElementById('sidebar').classList.remove('open');
      
      // Reset scroll position to top
      document.querySelector('.main').scrollTop = 0;
      
      if (sectionId === 'emergency') {
        loadEmergencySection();
      }
      if (sectionId === 'destination-services') {
        loadDestinationServices();
      }
      if (sectionId === 'household') {
        loadHouseholdSection();
      }
      if (sectionId === 'fleet') {
        loadFleetSection();
      }
      if (sectionId === 'spending-analytics') {
        initSpendingAnalytics();
      }
      if (sectionId === 'history') {
        loadPosServiceHistory();
      }
      if (sectionId === 'qr-checkin') {
        loadMemberQrCode();
      }
      if (sectionId === 'cost-estimator') {
        initCostEstimator();
      }
      if (sectionId === 'maintenance-schedule') {
        loadMaintenanceSchedule();
      }
      if (sectionId === 'settings') {
        initPushNotifications();
      }
      if (sectionId === 'order-history') {
        loadOrderHistory();
      }
    }

    let memberQrToken = null;

    async function loadMemberQrCode() {
      if (!currentUser?.id) return;
      
      const container = document.getElementById('qr-code-container');
      const loading = document.getElementById('qr-loading');
      const error = document.getElementById('qr-error');
      
      container.style.display = 'none';
      loading.style.display = 'block';
      error.style.display = 'none';
      
      try {
        const res = await fetch(`/api/member/${currentUser.id}/qr-token`);
        const data = await res.json();
        
        if (data.success && data.qrToken) {
          memberQrToken = data.qrToken;
          await generateQrCode(data.qrToken, 'qr-code-canvas', 200);
          container.style.display = 'inline-block';
        } else {
          throw new Error(data.error || 'Failed to get QR token');
        }
      } catch (err) {
        console.error('QR code error:', err);
        error.style.display = 'block';
      } finally {
        loading.style.display = 'none';
      }
    }

    async function generateQrCode(data, canvasId, size) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;
      
      try {
        await QRCode.toCanvas(canvas, `mcc:checkin:${data}`, {
          width: size,
          margin: 2,
          color: { dark: '#0a0a0f', light: '#ffffff' }
        });
      } catch (err) {
        console.error('QR generation error:', err);
      }
    }

    function downloadQrCode() {
      if (!memberQrToken) {
        showToast('QR code not ready yet', 'error');
        return;
      }
      
      const canvas = document.getElementById('qr-code-canvas');
      const link = document.createElement('a');
      link.download = 'my-car-concierge-checkin-qr.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast('QR code downloaded!', 'success');
    }

    function showQrFullscreen() {
      if (!memberQrToken) {
        showToast('QR code not ready yet', 'error');
        return;
      }
      
      const modal = document.getElementById('qr-fullscreen-modal');
      modal.style.display = 'flex';
      generateQrCode(memberQrToken, 'qr-fullscreen-canvas', 300);
    }

    function closeQrFullscreen() {
      document.getElementById('qr-fullscreen-modal').style.display = 'none';
    }

    function toggleSidebar() { 
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebar-overlay');
      sidebar.classList.toggle('open'); 
      if (sidebar.classList.contains('open')) {
        overlay.style.display = 'block';
        document.querySelector('.mobile-close').style.display = 'flex';
        document.body.classList.add('sidebar-open');
      } else {
        overlay.style.display = 'none';
        document.body.classList.remove('sidebar-open');
      }
    }

    // ========== MODALS ==========
    function openVehicleModal() {
      document.getElementById('vehicle-modal').classList.add('active');
      
      // Update verification UI when modal opens
      updateVerificationUI();
      
      // Reset all form fields
      ['v-year','v-make','v-model','v-trim','v-color','v-nickname','v-mileage','v-vin'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      
      // Reset dropdowns to initial state
      document.getElementById('v-make').innerHTML = '<option value="">Select Make</option>';
      document.getElementById('v-model').innerHTML = '<option value="">Select Model</option>';
      document.getElementById('v-trim').innerHTML = '<option value="">Select Trim (Optional)</option>';
      document.getElementById('v-make').disabled = true;
      document.getElementById('v-model').disabled = true;
      document.getElementById('v-trim').disabled = true;
      
      // Reset vehicle photo
      pendingVehiclePhoto = null;
      document.getElementById('vehicle-photo-preview').style.display = 'none';
      document.getElementById('vehicle-photo-preview').src = '';
      document.getElementById('vehicle-photo-placeholder').style.display = 'block';
      document.getElementById('vehicle-photo-remove').style.display = 'none';
      document.getElementById('vehicle-photo-upload-area').style.borderStyle = 'dashed';
    }

    function openPackageModal() {
      if (!vehicles.length) {
        showToast('Please add a vehicle first', 'error');
        return openVehicleModal();
      }
      document.getElementById('package-modal').classList.add('active');
      document.getElementById('p-vehicle').value = '';
      document.getElementById('p-title').value = '';
      document.getElementById('p-description').value = '';
      document.getElementById('p-category').value = 'maintenance';
      document.getElementById('p-category').dispatchEvent(new Event('change'));
      document.getElementById('p-frequency').value = 'one_time';
      document.getElementById('p-schedule').value = '';
      document.getElementById('p-pickup').value = 'either';
      selectedPartsTier = 'standard';
      document.querySelectorAll('.parts-tier').forEach(t => t.classList.toggle('selected', t.dataset.tier === 'standard'));
      selectedBiddingWindowHours = 72;
      document.querySelectorAll('.bid-window-option').forEach(o => o.classList.toggle('selected', o.dataset.hours === '72'));
      
      // Reset oil preference
      selectedOilPreference = 'provider';
      document.querySelectorAll('.oil-pref-option').forEach(o => o.classList.toggle('selected', o.dataset.choice === 'provider'));
      document.getElementById('oil-specify-options').style.display = 'none';
      document.getElementById('p-oil-type').value = 'full_synthetic';
      document.getElementById('p-oil-brand').value = '';
      
      // Reset destination service fields
      document.getElementById('destination-service-fields').style.display = 'none';
      document.getElementById('p-destination-type').value = '';
      document.querySelectorAll('.destination-type-option').forEach(o => o.classList.remove('selected'));
      document.getElementById('airport-fields').style.display = 'none';
      document.getElementById('dealership-fields').style.display = 'none';
      document.getElementById('detail-fields').style.display = 'none';
      document.getElementById('other-destination-fields').style.display = 'none';
      
      // Clear photos
      pendingPackagePhotos = [];
      document.getElementById('package-photo-previews').innerHTML = '';
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

    // ========== VEHICLE PHOTO HANDLING ==========
    function handleVehiclePhotoSelect(event) {
      const file = event.target.files[0];
      if (!file) return;
      
      if (file.size > 5 * 1024 * 1024) {
        showToast('Photo is too large (max 5MB)', 'error');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        pendingVehiclePhoto = {
          file: file,
          preview: e.target.result
        };
        
        // Update UI
        document.getElementById('vehicle-photo-preview').src = e.target.result;
        document.getElementById('vehicle-photo-preview').style.display = 'block';
        document.getElementById('vehicle-photo-placeholder').style.display = 'none';
        document.getElementById('vehicle-photo-remove').style.display = 'flex';
        document.getElementById('vehicle-photo-upload-area').style.borderStyle = 'solid';
      };
      reader.readAsDataURL(file);
      
      // Clear input so same file can be selected again
      event.target.value = '';
    }

    function removeVehiclePhoto() {
      pendingVehiclePhoto = null;
      document.getElementById('vehicle-photo-preview').style.display = 'none';
      document.getElementById('vehicle-photo-preview').src = '';
      document.getElementById('vehicle-photo-placeholder').style.display = 'block';
      document.getElementById('vehicle-photo-remove').style.display = 'none';
      document.getElementById('vehicle-photo-upload-area').style.borderStyle = 'dashed';
    }

    // ========== EDIT VEHICLE PHOTO HANDLING ==========
    function handleEditVehiclePhotoSelect(event) {
      const file = event.target.files[0];
      if (!file) return;
      
      if (file.size > 5 * 1024 * 1024) {
        showToast('Photo is too large (max 5MB)', 'error');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        pendingEditVehiclePhoto = {
          file: file,
          preview: e.target.result
        };
        
        // Update UI
        document.getElementById('edit-vehicle-photo-preview').src = e.target.result;
        document.getElementById('edit-vehicle-photo-preview').style.display = 'block';
        document.getElementById('edit-vehicle-photo-placeholder').style.display = 'none';
        document.getElementById('edit-vehicle-photo-remove').style.display = 'flex';
        document.getElementById('edit-vehicle-photo-upload-area').style.borderStyle = 'solid';
      };
      reader.readAsDataURL(file);
      
      // Clear input so same file can be selected again
      event.target.value = '';
    }

    function removeEditVehiclePhoto() {
      pendingEditVehiclePhoto = null;
      document.getElementById('edit-vehicle-photo-preview').style.display = 'none';
      document.getElementById('edit-vehicle-photo-preview').src = '';
      document.getElementById('edit-vehicle-photo-placeholder').style.display = 'block';
      document.getElementById('edit-vehicle-photo-remove').style.display = 'none';
      document.getElementById('edit-vehicle-photo-upload-area').style.borderStyle = 'dashed';
    }

    // ========== EDIT VEHICLE FUNCTIONS ==========
    function editVehicle(vehicleId) {
      const vehicle = vehicles.find(v => v.id === vehicleId);
      if (!vehicle) {
        showToast('Vehicle not found', 'error');
        return;
      }
      
      editingVehicleId = vehicleId;
      pendingEditVehiclePhoto = null;
      
      // Close the view details modal if open
      closeModal('vehicle-details-modal');
      
      // Populate year dropdown
      const yearSelect = document.getElementById('edit-v-year');
      yearSelect.innerHTML = '<option value="">Select Year</option>';
      const currentYear = new Date().getFullYear() + 1;
      for (let y = currentYear; y >= 1990; y--) {
        yearSelect.innerHTML += `<option value="${y}" ${vehicle.year == y ? 'selected' : ''}>${y}</option>`;
      }
      
      // Populate make dropdown with all makes and select current
      const makeSelect = document.getElementById('edit-v-make');
      makeSelect.innerHTML = '<option value="">Select Make</option>';
      vehicleData.makes.forEach(make => {
        makeSelect.innerHTML += `<option value="${make}" ${vehicle.make === make ? 'selected' : ''}>${make}</option>`;
      });
      
      // Populate model dropdown based on make
      const modelSelect = document.getElementById('edit-v-model');
      modelSelect.innerHTML = '<option value="">Select Model</option>';
      if (vehicle.make && vehicleData.models[vehicle.make]) {
        vehicleData.models[vehicle.make].forEach(model => {
          modelSelect.innerHTML += `<option value="${model}" ${vehicle.model === model ? 'selected' : ''}>${model}</option>`;
        });
      }
      // If vehicle model not in list, add it as an option
      if (vehicle.model && !vehicleData.models[vehicle.make]?.includes(vehicle.model)) {
        modelSelect.innerHTML += `<option value="${vehicle.model}" selected>${vehicle.model}</option>`;
      }
      
      // Populate trim dropdown based on make/model
      const trimSelect = document.getElementById('edit-v-trim');
      trimSelect.innerHTML = '<option value="">Select Trim (Optional)</option>';
      if (vehicle.make && vehicle.model && vehicleData.trims[vehicle.make]?.[vehicle.model]) {
        vehicleData.trims[vehicle.make][vehicle.model].forEach(trim => {
          trimSelect.innerHTML += `<option value="${trim}" ${vehicle.trim === trim ? 'selected' : ''}>${trim}</option>`;
        });
      }
      // If vehicle trim not in list, add it as an option
      if (vehicle.trim && !vehicleData.trims[vehicle.make]?.[vehicle.model]?.includes(vehicle.trim)) {
        trimSelect.innerHTML += `<option value="${vehicle.trim}" selected>${vehicle.trim}</option>`;
      }
      
      // Set color
      document.getElementById('edit-v-color').value = vehicle.color || '';
      
      // Set nickname
      document.getElementById('edit-v-nickname').value = vehicle.nickname || '';
      
      // Set mileage
      document.getElementById('edit-v-mileage').value = vehicle.mileage || '';
      
      // Set VIN
      document.getElementById('edit-v-vin').value = vehicle.vin || '';
      
      // Set Fuel Injection Type
      document.getElementById('edit-v-fuel-injection').value = vehicle.fuel_injection_type || '';
      
      // Handle existing photo
      if (vehicle.photo_url) {
        document.getElementById('edit-vehicle-photo-preview').src = vehicle.photo_url;
        document.getElementById('edit-vehicle-photo-preview').style.display = 'block';
        document.getElementById('edit-vehicle-photo-placeholder').style.display = 'none';
        document.getElementById('edit-vehicle-photo-remove').style.display = 'flex';
        document.getElementById('edit-vehicle-photo-upload-area').style.borderStyle = 'solid';
      } else {
        document.getElementById('edit-vehicle-photo-preview').style.display = 'none';
        document.getElementById('edit-vehicle-photo-preview').src = '';
        document.getElementById('edit-vehicle-photo-placeholder').style.display = 'block';
        document.getElementById('edit-vehicle-photo-remove').style.display = 'none';
        document.getElementById('edit-vehicle-photo-upload-area').style.borderStyle = 'dashed';
      }
      
      // Open the modal
      document.getElementById('edit-vehicle-modal').classList.add('active');
    }

    async function saveEditVehicle() {
      const make = document.getElementById('edit-v-make').value.trim();
      const model = document.getElementById('edit-v-model').value.trim();
      if (!make || !model) return showToast('Make and model are required', 'error');
      if (!editingVehicleId) return showToast('No vehicle selected for editing', 'error');

      // Get the current vehicle to check for existing photo
      const currentVehicle = vehicles.find(v => v.id === editingVehicleId);
      let photoUrl = currentVehicle?.photo_url || null;

      // Upload new photo if one was selected
      if (pendingEditVehiclePhoto) {
        showToast('Uploading photo...', 'success');
        const fileName = `${currentUser.id}/${editingVehicleId}-${Date.now()}-${pendingEditVehiclePhoto.file.name}`;
        
        try {
          const { data: uploadData, error: uploadError } = await supabaseClient.storage
            .from('vehicle-photos')
            .upload(fileName, pendingEditVehiclePhoto.file);
          
          if (!uploadError) {
            const { data: urlData } = supabaseClient.storage
              .from('vehicle-photos')
              .getPublicUrl(fileName);
            photoUrl = urlData.publicUrl;
          } else {
            console.error('Photo upload error:', uploadError);
            showToast('Photo upload failed, but updating vehicle info...', 'error');
          }
        } catch (err) {
          console.error('Error uploading vehicle photo:', err);
        }
      }

      // Check if photo was removed (preview hidden but no new photo selected)
      const previewVisible = document.getElementById('edit-vehicle-photo-preview').style.display !== 'none';
      if (!previewVisible && !pendingEditVehiclePhoto) {
        photoUrl = null;
      }

      const year = document.getElementById('edit-v-year').value ? Number(document.getElementById('edit-v-year').value) : null;
      const trim = document.getElementById('edit-v-trim').value || null;
      const fuelInjectionValue = document.getElementById('edit-v-fuel-injection').value || null;
      const fuelInjectionType = fuelInjectionValue || null;

      const vehicleData = {
        make, 
        model,
        year,
        trim,
        color: document.getElementById('edit-v-color').value || null,
        nickname: document.getElementById('edit-v-nickname').value.trim() || null,
        mileage: document.getElementById('edit-v-mileage').value ? Number(document.getElementById('edit-v-mileage').value) : null,
        vin: document.getElementById('edit-v-vin').value.trim().toUpperCase() || null,
        photo_url: photoUrl,
        fuel_injection_type: fuelInjectionType
      };

      const { data, error } = await supabaseClient
        .from('vehicles')
        .update(vehicleData)
        .eq('id', editingVehicleId)
        .select();
      
      if (error) {
        console.error('Vehicle update error:', error);
        return showToast('Failed to update vehicle: ' + (error.message || 'Unknown error'), 'error');
      }
      
      closeModal('edit-vehicle-modal');
      showToast('Vehicle updated successfully!', 'success');
      
      // Reset state
      editingVehicleId = null;
      pendingEditVehiclePhoto = null;
      
      await loadVehicles();
      await loadReminders();
      updateStats();
    }

    // Helper functions for edit modal dropdowns
    function updateEditMakeOptions() {
      const yearValue = document.getElementById('edit-v-year').value;
      const makeSelect = document.getElementById('edit-v-make');
      const modelSelect = document.getElementById('edit-v-model');
      const trimSelect = document.getElementById('edit-v-trim');
      
      // Reset model and trim
      modelSelect.innerHTML = '<option value="">Select Model</option>';
      trimSelect.innerHTML = '<option value="">Select Trim (Optional)</option>';
      
      // Populate makes (same makes regardless of year)
      makeSelect.innerHTML = '<option value="">Select Make</option>';
      vehicleData.makes.forEach(make => {
        makeSelect.innerHTML += `<option value="${make}">${make}</option>`;
      });
    }

    function updateEditModelOptions() {
      const makeValue = document.getElementById('edit-v-make').value;
      const modelSelect = document.getElementById('edit-v-model');
      const trimSelect = document.getElementById('edit-v-trim');
      
      modelSelect.innerHTML = '<option value="">Select Model</option>';
      trimSelect.innerHTML = '<option value="">Select Trim (Optional)</option>';
      
      if (makeValue && vehicleData.models[makeValue]) {
        vehicleData.models[makeValue].forEach(model => {
          modelSelect.innerHTML += `<option value="${model}">${model}</option>`;
        });
      }
    }

    function updateEditTrimOptions() {
      const makeValue = document.getElementById('edit-v-make').value;
      const modelValue = document.getElementById('edit-v-model').value;
      const trimSelect = document.getElementById('edit-v-trim');
      
      trimSelect.innerHTML = '<option value="">Select Trim (Optional)</option>';
      
      if (makeValue && modelValue && vehicleData.trims[makeValue]?.[modelValue]) {
        vehicleData.trims[makeValue][modelValue].forEach(trim => {
          trimSelect.innerHTML += `<option value="${trim}">${trim}</option>`;
        });
      }
    }

    async function uploadVehiclePhoto(vehicleId) {
      if (!pendingVehiclePhoto) return null;
      
      try {
        const fileName = `${vehicleId}/${Date.now()}-${pendingVehiclePhoto.file.name}`;
        
        // Upload to Supabase Storage
        const { data, error } = await supabaseClient.storage
          .from('vehicle-photos')
          .upload(fileName, pendingVehiclePhoto.file);
        
        if (error) {
          console.error('Vehicle photo upload error:', error);
          return null;
        }

        // Get public URL
        const { data: urlData } = supabaseClient.storage
          .from('vehicle-photos')
          .getPublicUrl(fileName);

        return urlData.publicUrl;
      } catch (err) {
        console.error('Error uploading vehicle photo:', err);
        return null;
      }
    }

    // ========== SAVE FUNCTIONS ==========
    async function saveVehicle() {
      // Check identity verification before allowing vehicle save
      if (!userVerificationStatus?.verified) {
        showToast('Please verify your identity before adding a vehicle', 'error');
        updateVerificationUI();
        return;
      }
      
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
        fuel_injection_type: fuelInjectionType,
        identity_verified_at_add: userVerificationStatus?.verified || false
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
      const successMsg = isDestinationService 
        ? 'Transport request created! Only drivers with verified credentials can bid.'
        : 'Package created! Providers have ' + formatBiddingWindow(selectedBiddingWindowHours) + ' to submit bids.';
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
                <button class="btn btn-primary" onclick="confirmCompletion('${packageId}')">✓ Confirm Complete & Release Payment</button>
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
        showToast('Bid accepted! Payment held in escrow. Provider has been notified.', 'success');
        await loadPackages();
      } catch (err) {
        console.error('Error accepting bid:', err);
        showToast('Failed to accept bid. Please try again.', 'error');
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

    // ========== MESSAGING ==========
    async function openMessageWithProvider(packageId, providerId) {
      currentViewPackage = packageId;
      currentMessageProvider = providerId;

      // Get provider alias (not real name for privacy)
      const { data: providerProfile } = await supabaseClient
        .from('profiles')
        .select('provider_alias')
        .eq('id', providerId)
        .single();

      // Use alias or generate anonymous ID
      const providerName = providerProfile?.provider_alias || `Provider #${providerId.slice(0,4).toUpperCase()}`;

      const { data: messages } = await supabaseClient.from('messages').select('*').eq('package_id', packageId).or(`sender_id.eq.${currentUser.id},recipient_id.eq.${currentUser.id}`).order('created_at', { ascending: true });

      const thread = document.getElementById('message-thread');
      if (!messages?.length) {
        thread.innerHTML = '<p style="color:var(--text-muted);text-align:center;">No messages yet. Start the conversation!</p>';
      } else {
        thread.innerHTML = messages.map(m => `
          <div class="message ${m.sender_id === currentUser.id ? 'sent' : 'received'}">
            <div class="message-bubble">${m.content}</div>
            <div class="message-time">${new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        `).join('');
        thread.scrollTop = thread.scrollHeight;
      }

      document.getElementById('message-modal-title').textContent = `Message ${providerName}`;
      document.getElementById('message-input').value = '';
      document.getElementById('message-modal').classList.add('active');
    }

    async function sendMessage() {
      const input = document.getElementById('message-input');
      const content = input.value.trim();
      if (!content || !currentMessageProvider || !currentViewPackage) return;

      const { error } = await supabaseClient.from('messages').insert({
        package_id: currentViewPackage,
        sender_id: currentUser.id,
        recipient_id: currentMessageProvider,
        content
      });

      if (error) {
        console.error('Error sending message:', error);
        showToast('Failed to send message', 'error');
        return;
      }

      input.value = '';
      await openMessageWithProvider(currentViewPackage, currentMessageProvider);
    }

    // ========== VEHICLE DETAILS ==========
    async function viewVehicleDetails(vehicleId) {
      const vehicle = vehicles.find(v => v.id === vehicleId);
      if (!vehicle) return;

      // Try to load photos and documents, but don't fail if tables don't exist
      let photos = [];
      let documents = [];
      
      try {
        const photoResult = await window.listVehiclePhotos(vehicleId);
        photos = photoResult?.data || [];
      } catch (e) {
        console.log('Could not load photos:', e);
      }
      
      try {
        const docResult = await window.listVehicleDocuments(vehicleId);
        documents = docResult?.data || [];
      } catch (e) {
        console.log('Could not load documents:', e);
      }
      
      const vehicleHistory = serviceHistory.filter(h => h.vehicle_id === vehicleId);

      document.getElementById('vehicle-details-title').textContent = vehicle.nickname || `${vehicle.year || ''} ${vehicle.make} ${vehicle.model}`;
      document.getElementById('vehicle-details-body').innerHTML = `
        <div class="tabs" style="margin-bottom:20px;">
          <div class="tab active" onclick="showVehicleTab('info', '${vehicleId}')">Info</div>
          <div class="tab" onclick="showVehicleTab('photos', '${vehicleId}')">Photos (${photos?.length || 0})</div>
          <div class="tab" onclick="showVehicleTab('documents', '${vehicleId}')">Documents (${documents?.length || 0})</div>
          <div class="tab" onclick="showVehicleTab('history', '${vehicleId}')">Service History</div>
        </div>
        
        <div id="vehicle-tab-info">
          <div class="form-row">
            <div><strong>Year:</strong> ${vehicle.year || 'N/A'}</div>
            <div><strong>Make:</strong> ${vehicle.make}</div>
          </div>
          <div class="form-row" style="margin-top:12px;">
            <div><strong>Model:</strong> ${vehicle.model}</div>
            <div><strong>Trim:</strong> ${vehicle.trim || 'N/A'}</div>
          </div>
          <div class="form-row" style="margin-top:12px;">
            <div><strong>Color:</strong> ${vehicle.color || 'N/A'}</div>
            <div><strong>Mileage:</strong> ${vehicle.mileage ? vehicle.mileage.toLocaleString() + ' mi' : 'N/A'}</div>
          </div>
          <div class="form-row" style="margin-top:12px;">
            <div style="flex:1;"><strong>VIN:</strong> <span style="font-family: monospace;">${vehicle.vin || 'Not provided'}</span></div>
          </div>
          <div style="margin-top:24px;display:flex;gap:12px;">
            <button class="btn btn-secondary" onclick="editVehicle('${vehicleId}')">Edit Details</button>
            <button class="btn btn-danger" onclick="deleteVehicle('${vehicleId}')">Delete Vehicle</button>
          </div>
        </div>
        
        <div id="vehicle-tab-photos" style="display:none;">
          <div style="display:flex;gap:12px;align-items:center;margin-bottom:16px;">
            <input type="file" class="form-input" id="vehicle-photo-upload" accept="image/*" multiple style="flex:1;">
            <select class="form-select" id="photo-type-select" style="width:auto;">
              <option value="general">General</option>
              <option value="exterior">Exterior</option>
              <option value="interior">Interior</option>
              <option value="damage">Damage</option>
            </select>
            <button class="btn btn-primary" onclick="uploadVehiclePhotos('${vehicleId}')">📤 Upload</button>
          </div>
          <div class="photo-grid" style="margin-top:16px;" id="vehicle-photos-grid">
            ${photos?.length ? photos.map(p => `
              <div class="photo-item" style="position:relative;">
                <img src="${p.url}" onclick="window.open('${p.url}','_blank')" style="cursor:pointer;">
                ${p.is_primary ? '<span style="position:absolute;top:4px;left:4px;background:var(--accent-gold);color:#000;padding:2px 6px;border-radius:4px;font-size:0.7rem;">Primary</span>' : ''}
                <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.7);padding:4px;display:flex;justify-content:space-between;">
                  <button class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:0.7rem;" onclick="event.stopPropagation();window.setPrimaryPhoto('${p.id}','${vehicleId}')">⭐</button>
                  <button class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:0.7rem;color:var(--accent-red);" onclick="event.stopPropagation();window.deleteVehiclePhoto('${p.id}','${vehicleId}')">🗑</button>
                </div>
              </div>
            `).join('') : '<p style="color:var(--text-muted);grid-column:1/-1;">No photos yet. Upload photos of your vehicle!</p>'}
          </div>
        </div>
        
        <div id="vehicle-tab-documents" style="display:none;">
          <div style="display:flex;gap:12px;align-items:center;margin-bottom:16px;flex-wrap:wrap;">
            <input type="file" class="form-input" id="vehicle-doc-upload" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" style="flex:1;min-width:200px;">
            <select class="form-select" id="doc-type-select" style="width:auto;">
              <option value="registration">Registration</option>
              <option value="insurance_card">Insurance Card</option>
              <option value="title">Title</option>
              <option value="inspection">Inspection</option>
              <option value="warranty">Warranty</option>
              <option value="service_record">Service Record</option>
              <option value="other">Other</option>
            </select>
            <input type="date" class="form-input" id="doc-expiration" style="width:auto;" placeholder="Expiration (optional)">
            <button class="btn btn-primary" onclick="uploadVehicleDocument('${vehicleId}')">📤 Upload</button>
          </div>
          <div id="vehicle-documents-list">
            ${documents?.length ? documents.map(d => `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:var(--bg-input);border-radius:var(--radius-md);margin-bottom:8px;">
                <div style="display:flex;align-items:center;gap:12px;">
                  <span style="font-size:1.5rem;">${getDocIcon(d.document_type)}</span>
                  <div>
                    <div style="font-weight:500;">${formatDocType(d.document_type)}</div>
                    <div style="font-size:0.8rem;color:var(--text-muted);">
                      ${d.document_name || 'Document'} 
                      ${d.expiration_date ? `• Expires: ${new Date(d.expiration_date).toLocaleDateString()}` : ''}
                    </div>
                  </div>
                </div>
                <div style="display:flex;gap:8px;">
                  <a href="${d.file_url}" target="_blank" class="btn btn-secondary btn-sm">View</a>
                  <button class="btn btn-ghost btn-sm" style="color:var(--accent-red);" onclick="window.deleteVehicleDocument('${d.id}','${vehicleId}')">🗑</button>
                </div>
              </div>
            `).join('') : '<p style="color:var(--text-muted);">No documents yet. Upload your registration, insurance card, etc.</p>'}
          </div>
        </div>
        
        <div id="vehicle-tab-history" style="display:none;">
          ${vehicleHistory.length ? vehicleHistory.map(h => `
            <div class="history-item">
              <div class="history-date">
                <div class="history-date-day">${new Date(h.service_date).getDate()}</div>
                <div class="history-date-month">${new Date(h.service_date).toLocaleDateString('en-US', { month: 'short' })}</div>
              </div>
              <div class="history-content">
                <div class="history-title">${h.service_type || h.description}</div>
                <div class="history-details">${h.mileage_at_service ? h.mileage_at_service.toLocaleString() + ' miles' : ''}</div>
              </div>
              <div class="history-cost">${h.total_cost ? '$' + h.total_cost.toFixed(2) : ''}</div>
            </div>
          `).join('') : '<p style="color:var(--text-muted)">No service history for this vehicle.</p>'}
        </div>
      `;

      document.getElementById('vehicle-details-modal').classList.add('active');
    }

    function getDocIcon(type) {
      const icons = {
        registration: '📋',
        insurance_card: '🛡️',
        title: '📜',
        inspection: '🔍',
        warranty: '✅',
        service_record: '🔧',
        other: '📄'
      };
      return icons[type] || '📄';
    }

    function formatDocType(type) {
      const names = {
        registration: 'Registration',
        insurance_card: 'Insurance Card',
        title: 'Title',
        inspection: 'Inspection',
        warranty: 'Warranty',
        service_record: 'Service Record',
        other: 'Other'
      };
      return names[type] || type;
    }

    function showVehicleTab(tabName, vehicleId) {
      ['info', 'photos', 'documents', 'history'].forEach(t => {
        document.getElementById(`vehicle-tab-${t}`).style.display = t === tabName ? 'block' : 'none';
      });
      // Update tab active state
      document.querySelectorAll('.tabs .tab').forEach(tab => tab.classList.remove('active'));
      event.target.classList.add('active');
    }

    async function uploadVehiclePhotos(vehicleId) {
      const input = document.getElementById('vehicle-photo-upload');
      const photoType = document.getElementById('photo-type-select')?.value || 'general';
      
      if (!input.files.length) {
        showToast('Please select photos to upload', 'error');
        return;
      }
      
      showToast('Uploading photos...', 'info');
      
      let successCount = 0;
      for (const file of Array.from(input.files)) {
        const result = await window.uploadVehiclePhoto(vehicleId, file, photoType);
        if (result) successCount++;
      }
      
      if (successCount > 0) {
        showToast(`${successCount} photo(s) uploaded!`, 'success');
        input.value = ''; // Clear input
        viewVehicleDetails(vehicleId);
      }
    }

    async function uploadVehicleDocument(vehicleId) {
      const input = document.getElementById('vehicle-doc-upload');
      const docType = document.getElementById('doc-type-select')?.value || 'other';
      const expiration = document.getElementById('doc-expiration')?.value || null;
      
      if (!input.files.length) {
        showToast('Please select a document to upload', 'error');
        return;
      }
      
      showToast('Uploading document...', 'info');
      
      const file = input.files[0];
      const result = await window.uploadVehicleDocument(vehicleId, file, docType, expiration);
      
      if (result) {
        showToast('Document uploaded!', 'success');
        input.value = ''; // Clear input
        document.getElementById('doc-expiration').value = '';
        viewVehicleDetails(vehicleId);
      }
    }

    async function generateHealthReportPDF(vehicleId) {
      showToast('Generating health report...', 'info');
      
      try {
        const { jsPDF } = window.jspdf;
        
        const { data: vehicle } = await supabaseClient
          .from('vehicles')
          .select('*')
          .eq('id', vehicleId)
          .single();
        
        if (!vehicle) {
          showToast('Vehicle not found', 'error');
          return;
        }
        
        const { data: profile } = await supabaseClient
          .from('profiles')
          .select('full_name, email')
          .eq('id', vehicle.owner_id)
          .single();
        
        const { data: inspections } = await supabaseClient
          .from('inspection_reports')
          .select('*, profiles:provider_id(full_name, business_name)')
          .eq('vehicle_id', vehicleId)
          .order('inspection_date', { ascending: false })
          .limit(1);
        
        const latestInspection = inspections?.[0] || null;
        
        const { data: completedPackages } = await supabaseClient
          .from('maintenance_packages')
          .select('*, profiles:accepted_provider_id(full_name, business_name)')
          .eq('vehicle_id', vehicleId)
          .eq('status', 'completed')
          .order('completed_at', { ascending: false })
          .limit(20);
        
        const { data: recommendations } = await supabaseClient
          .from('service_recommendations')
          .select('*')
          .eq('vehicle_id', vehicleId)
          .eq('is_dismissed', false)
          .order('priority', { ascending: true });
        
        const doc = new jsPDF();
        let yPos = 20;
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        const margin = 20;
        const contentWidth = pageWidth - (margin * 2);
        
        const colors = {
          gold: [212, 168, 85],
          darkBlue: [10, 10, 15],
          textPrimary: [40, 40, 50],
          textSecondary: [100, 100, 110],
          green: [74, 200, 140],
          orange: [245, 158, 11],
          red: [239, 95, 95],
          blue: [74, 124, 255]
        };
        
        function addNewPageIfNeeded(requiredSpace = 40) {
          if (yPos + requiredSpace > pageHeight - 30) {
            doc.addPage();
            yPos = 20;
            return true;
          }
          return false;
        }
        
        function drawSectionHeader(title) {
          addNewPageIfNeeded(30);
          doc.setFillColor(...colors.gold);
          doc.rect(margin, yPos, contentWidth, 8, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);
          doc.setTextColor(10, 10, 15);
          doc.text(title.toUpperCase(), margin + 4, yPos + 5.5);
          yPos += 14;
        }
        
        function getHealthColor(score) {
          if (score >= 90) return colors.green;
          if (score >= 70) return colors.blue;
          if (score >= 50) return colors.orange;
          return colors.red;
        }
        
        function getHealthLabel(score) {
          if (score >= 90) return 'Excellent';
          if (score >= 70) return 'Good';
          if (score >= 50) return 'Fair';
          return 'Needs Attention';
        }
        
        function getConditionColor(condition) {
          if (condition === 'good') return colors.green;
          if (condition === 'fair') return colors.blue;
          if (condition === 'needs_attention') return colors.orange;
          if (condition === 'urgent') return colors.red;
          return colors.textSecondary;
        }
        
        doc.setFillColor(...colors.darkBlue);
        doc.rect(0, 0, pageWidth, 50, 'F');
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(24);
        doc.setTextColor(...colors.gold);
        doc.text('MY CAR CONCIERGE', margin, 22);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(14);
        doc.setTextColor(255, 255, 255);
        doc.text('Vehicle Health Report', margin, 35);
        
        doc.setFontSize(10);
        doc.setTextColor(180, 180, 190);
        doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, margin, 45);
        
        yPos = 60;
        
        const vehicleTitle = `${vehicle.year || ''} ${vehicle.make} ${vehicle.model}`.trim();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.setTextColor(...colors.textPrimary);
        doc.text(vehicle.nickname || vehicleTitle, margin, yPos);
        yPos += 8;
        
        if (vehicle.nickname) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(12);
          doc.setTextColor(...colors.textSecondary);
          doc.text(vehicleTitle, margin, yPos);
          yPos += 8;
        }
        
        const healthScore = vehicle.health_score || 85;
        const healthColor = getHealthColor(healthScore);
        const healthLabel = getHealthLabel(healthScore);
        
        doc.setFillColor(...healthColor);
        doc.roundedRect(pageWidth - margin - 50, 55, 50, 20, 3, 3, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(255, 255, 255);
        doc.text(healthLabel, pageWidth - margin - 25, 67, { align: 'center' });
        
        yPos += 6;
        
        drawSectionHeader('Vehicle Information');
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(...colors.textPrimary);
        
        const vehicleInfo = [
          ['Owner', profile?.full_name || 'N/A'],
          ['VIN', vehicle.vin || 'Not recorded'],
          ['Current Mileage', vehicle.mileage ? `${vehicle.mileage.toLocaleString()} miles` : 'Not recorded'],
          ['Color', vehicle.color || 'N/A'],
          ['License Plate', vehicle.license_plate || 'N/A']
        ];
        
        vehicleInfo.forEach(([label, value]) => {
          doc.setFont('helvetica', 'bold');
          doc.text(`${label}:`, margin, yPos);
          doc.setFont('helvetica', 'normal');
          doc.text(value, margin + 45, yPos);
          yPos += 6;
        });
        
        yPos += 6;
        
        if (latestInspection) {
          drawSectionHeader('Latest Inspection Report');
          
          const providerName = latestInspection.profiles?.business_name || latestInspection.profiles?.full_name || 'Unknown Provider';
          const inspectionDate = new Date(latestInspection.inspection_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
          
          doc.setFontSize(10);
          doc.setTextColor(...colors.textSecondary);
          doc.text(`Performed by ${providerName} on ${inspectionDate}`, margin, yPos);
          yPos += 10;
          
          const checkpoints = [
            { category: 'Engine & Fluids', items: [
              { name: 'Engine Oil', status: latestInspection.engine_oil, notes: latestInspection.engine_oil_notes },
              { name: 'Transmission Fluid', status: latestInspection.transmission_fluid },
              { name: 'Coolant Level', status: latestInspection.coolant_level },
              { name: 'Brake Fluid', status: latestInspection.brake_fluid },
              { name: 'Power Steering Fluid', status: latestInspection.power_steering_fluid }
            ]},
            { category: 'Brakes', items: [
              { name: 'Front Brake Pads', status: latestInspection.brake_pads_front, extra: latestInspection.brake_pads_front_percent ? `${latestInspection.brake_pads_front_percent}%` : null },
              { name: 'Rear Brake Pads', status: latestInspection.brake_pads_rear, extra: latestInspection.brake_pads_rear_percent ? `${latestInspection.brake_pads_rear_percent}%` : null },
              { name: 'Brake Rotors', status: latestInspection.brake_rotors }
            ]},
            { category: 'Tires', items: [
              { name: 'Front Left Tire', status: latestInspection.tire_front_left, extra: latestInspection.tire_front_left_tread ? `${latestInspection.tire_front_left_tread}/32"` : null },
              { name: 'Front Right Tire', status: latestInspection.tire_front_right, extra: latestInspection.tire_front_right_tread ? `${latestInspection.tire_front_right_tread}/32"` : null },
              { name: 'Rear Left Tire', status: latestInspection.tire_rear_left, extra: latestInspection.tire_rear_left_tread ? `${latestInspection.tire_rear_left_tread}/32"` : null },
              { name: 'Rear Right Tire', status: latestInspection.tire_rear_right, extra: latestInspection.tire_rear_right_tread ? `${latestInspection.tire_rear_right_tread}/32"` : null }
            ]},
            { category: 'Electrical', items: [
              { name: 'Battery', status: latestInspection.battery, extra: latestInspection.battery_voltage ? `${latestInspection.battery_voltage}V` : null },
              { name: 'Headlights', status: latestInspection.headlights },
              { name: 'Taillights', status: latestInspection.taillights },
              { name: 'Turn Signals', status: latestInspection.turn_signals }
            ]},
            { category: 'Belts & Hoses', items: [
              { name: 'Serpentine Belt', status: latestInspection.serpentine_belt },
              { name: 'Radiator Hoses', status: latestInspection.radiator_hoses },
              { name: 'Heater Hoses', status: latestInspection.heater_hoses }
            ]}
          ];
          
          const urgentItems = [];
          const attentionItems = [];
          
          checkpoints.forEach(category => {
            category.items.forEach(item => {
              if (item.status === 'urgent') urgentItems.push(item.name);
              if (item.status === 'needs_attention') attentionItems.push(item.name);
            });
          });
          
          if (urgentItems.length > 0) {
            addNewPageIfNeeded(20);
            doc.setFillColor(239, 95, 95, 0.1);
            doc.setDrawColor(...colors.red);
            doc.roundedRect(margin, yPos - 4, contentWidth, 8 + (urgentItems.length * 5), 2, 2, 'FD');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(...colors.red);
            doc.text('⚠ URGENT ITEMS:', margin + 4, yPos + 2);
            yPos += 6;
            doc.setFont('helvetica', 'normal');
            urgentItems.forEach(item => {
              doc.text(`• ${item}`, margin + 8, yPos);
              yPos += 5;
            });
            yPos += 6;
          }
          
          if (attentionItems.length > 0) {
            addNewPageIfNeeded(20);
            doc.setFillColor(245, 158, 11, 0.1);
            doc.setDrawColor(...colors.orange);
            doc.roundedRect(margin, yPos - 4, contentWidth, 8 + (attentionItems.length * 5), 2, 2, 'FD');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(...colors.orange);
            doc.text('⚡ NEEDS ATTENTION:', margin + 4, yPos + 2);
            yPos += 6;
            doc.setFont('helvetica', 'normal');
            attentionItems.forEach(item => {
              doc.text(`• ${item}`, margin + 8, yPos);
              yPos += 5;
            });
            yPos += 6;
          }
          
          checkpoints.forEach(category => {
            addNewPageIfNeeded(40);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(...colors.textPrimary);
            doc.text(category.category, margin, yPos);
            yPos += 6;
            
            category.items.forEach(item => {
              if (!item.status || item.status === 'na') return;
              
              addNewPageIfNeeded(8);
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(9);
              doc.setTextColor(...colors.textSecondary);
              doc.text(`• ${item.name}`, margin + 4, yPos);
              
              const conditionColor = getConditionColor(item.status);
              doc.setFillColor(...conditionColor);
              doc.circle(margin + 70, yPos - 1.5, 2, 'F');
              doc.setTextColor(...conditionColor);
              doc.text(item.status.replace('_', ' ').toUpperCase(), margin + 74, yPos);
              
              if (item.extra) {
                doc.setTextColor(...colors.textSecondary);
                doc.text(`(${item.extra})`, margin + 105, yPos);
              }
              
              yPos += 5;
            });
            yPos += 4;
          });
          
          if (latestInspection.general_notes) {
            addNewPageIfNeeded(20);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(...colors.textPrimary);
            doc.text('Inspector Notes:', margin, yPos);
            yPos += 5;
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(9);
            doc.setTextColor(...colors.textSecondary);
            const noteLines = doc.splitTextToSize(latestInspection.general_notes, contentWidth - 10);
            doc.text(noteLines, margin + 4, yPos);
            yPos += noteLines.length * 4 + 6;
          }
        }
        
        if (completedPackages && completedPackages.length > 0) {
          yPos += 4;
          drawSectionHeader('Service History');
          
          completedPackages.forEach((pkg, index) => {
            if (index >= 10) return;
            addNewPageIfNeeded(20);
            
            const serviceDate = pkg.completed_at ? new Date(pkg.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
            const providerName = pkg.profiles?.business_name || pkg.profiles?.full_name || 'Unknown';
            
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(...colors.textPrimary);
            doc.text(pkg.title, margin, yPos);
            
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...colors.textSecondary);
            doc.text(serviceDate, pageWidth - margin - 30, yPos, { align: 'right' });
            yPos += 5;
            
            doc.text(`Provider: ${providerName}`, margin + 4, yPos);
            yPos += 4;
            
            if (pkg.description) {
              const descLines = doc.splitTextToSize(pkg.description, contentWidth - 10);
              doc.text(descLines.slice(0, 2), margin + 4, yPos);
              yPos += Math.min(descLines.length, 2) * 4;
            }
            
            yPos += 4;
            doc.setDrawColor(220, 220, 230);
            doc.line(margin, yPos, pageWidth - margin, yPos);
            yPos += 4;
          });
        }
        
        if (recommendations && recommendations.length > 0) {
          yPos += 4;
          drawSectionHeader('Current Recommendations');
          
          const priorityLabels = { urgent: '🔴 Urgent', soon: '🟠 Soon', upcoming: '🟡 Upcoming', routine: '🔵 Routine' };
          
          recommendations.forEach((rec, index) => {
            if (index >= 8) return;
            addNewPageIfNeeded(15);
            
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(...colors.textPrimary);
            doc.text(rec.service_type, margin, yPos);
            
            const priorityText = priorityLabels[rec.priority] || rec.priority;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.text(priorityText, pageWidth - margin - 30, yPos, { align: 'right' });
            yPos += 5;
            
            if (rec.reason) {
              doc.setTextColor(...colors.textSecondary);
              const reasonLines = doc.splitTextToSize(rec.reason, contentWidth - 10);
              doc.text(reasonLines.slice(0, 2), margin + 4, yPos);
              yPos += Math.min(reasonLines.length, 2) * 4;
            }
            
            if (rec.estimated_cost_low && rec.estimated_cost_high) {
              doc.setTextColor(...colors.gold);
              doc.text(`Estimated: $${rec.estimated_cost_low} - $${rec.estimated_cost_high}`, margin + 4, yPos);
              yPos += 4;
            }
            
            yPos += 3;
          });
        }
        
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
          doc.setPage(i);
          doc.setFillColor(240, 240, 245);
          doc.rect(0, pageHeight - 20, pageWidth, 20, 'F');
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(...colors.textSecondary);
          doc.text('Generated by My Car Concierge • mycarconcierge.com', margin, pageHeight - 10);
          doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
        }
        
        const filename = `${vehicleTitle.replace(/\s+/g, '_')}_Health_Report_${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(filename);
        
        showToast('Health report downloaded!', 'success');
        
      } catch (error) {
        console.error('Error generating health report:', error);
        showToast('Error generating report. Please try again.', 'error');
      }
    }

    async function deleteVehicle(vehicleId) {
      if (!confirm('Delete this vehicle? This cannot be undone.')) return;
      await supabaseClient.from('vehicles').delete().eq('id', vehicleId);
      closeModal('vehicle-details-modal');
      showToast('Vehicle removed', 'success');
      await loadVehicles();
      await loadReminders();
      updateStats();
    }

    // ========== UTILITIES ==========
    function formatFrequency(freq) {
      const map = { one_time: 'One-time', weekly: 'Weekly', bi_weekly: 'Bi-weekly', monthly: 'Monthly', quarterly: 'Quarterly', annually: 'Annually' };
      return map[freq] || freq;
    }

    function formatPickup(pref) {
      const map = { 
        provider_pickup: 'Provider pickup', 
        member_dropoff: 'Drop-off', 
        rideshare: 'Rideshare', 
        either: 'Flexible',
        destination_service: '🚗 Transport Service'
      };
      return map[pref] || pref;
    }

    function showToast(message, type = 'success') {
      const container = document.getElementById('toast-container');
      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      toast.innerHTML = `<span>${type === 'success' ? '✓' : '⚠'}</span><span>${message}</span>`;
      container.appendChild(toast);
      setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
    }

    async function submitSupportTicket() {
      const category = document.getElementById('support-category').value;
      const subject = document.getElementById('support-subject').value.trim();
      const message = document.getElementById('support-message').value.trim();

      if (!subject || !message) return showToast('Please fill in all fields.', 'error');

      await supabaseClient.from('support_tickets').insert({
        user_id: currentUser.id,
        user_role: 'member',
        category: category,
        subject: subject,
        description: message,
        status: 'open',
        priority: 'normal'
      });

      closeModal('support-modal');
      showToast('Support ticket submitted. We\'ll get back to you within 24-48 hours.', 'success');
      
      // Clear form
      document.getElementById('support-subject').value = '';
      document.getElementById('support-message').value = '';
    }

    function openSupport() {
      document.getElementById('support-modal').classList.add('active');
    }

    // ========== CIRCUMVENTION REPORTING ==========
    let reportEvidenceFiles = [];

    function openReportModal() {
      // Reset form
      document.getElementById('report-type').value = '';
      document.getElementById('report-description').value = '';
      document.getElementById('report-truthful').checked = false;
      reportEvidenceFiles = [];
      document.getElementById('report-evidence-list').innerHTML = '';
      
      closeModal('message-modal');
      document.getElementById('report-modal').classList.add('active');
    }

    function handleReportEvidence(input) {
      const files = Array.from(input.files);
      files.forEach(file => {
        if (file.size > 10 * 1024 * 1024) {
          showToast(`${file.name} is too large (max 10MB)`, 'error');
          return;
        }
        reportEvidenceFiles.push(file);
      });
      renderReportEvidence();
      input.value = '';
    }

    function renderReportEvidence() {
      const container = document.getElementById('report-evidence-list');
      container.innerHTML = reportEvidenceFiles.map((file, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg-input);border-radius:var(--radius-sm);margin-bottom:4px;">
          <span style="font-size:0.85rem;">📎 ${file.name}</span>
          <button onclick="removeReportEvidence(${i})" style="background:none;border:none;color:var(--text-muted);cursor:pointer;">×</button>
        </div>
      `).join('');
    }

    function removeReportEvidence(index) {
      reportEvidenceFiles.splice(index, 1);
      renderReportEvidence();
    }

    async function submitReport() {
      const reportType = document.getElementById('report-type').value;
      const description = document.getElementById('report-description').value.trim();
      const truthful = document.getElementById('report-truthful').checked;

      if (!reportType) return showToast('Please select a violation type', 'error');
      if (!description) return showToast('Please describe what happened', 'error');
      if (!truthful) return showToast('Please confirm this report is truthful', 'error');

      showToast('Submitting report...', 'success');

      try {
        // Upload evidence files if any
        let evidenceUrls = [];
        for (const file of reportEvidenceFiles) {
          const fileName = `${currentUser.id}/${Date.now()}-${file.name}`;
          const { data, error } = await supabaseClient.storage
            .from('report-evidence')
            .upload(fileName, file);
          
          if (!error && data) {
            const { data: urlData } = supabaseClient.storage
              .from('report-evidence')
              .getPublicUrl(fileName);
            evidenceUrls.push(urlData.publicUrl);
          }
        }

        // Create report record
        const { error } = await supabaseClient.from('circumvention_reports').insert({
          reporter_id: currentUser.id,
          provider_id: currentMessageProvider,
          package_id: currentViewPackage,
          report_type: reportType,
          description: description,
          evidence_urls: evidenceUrls.length > 0 ? evidenceUrls : null,
          status: 'pending'
        });

        if (error) {
          console.error('Report submission error:', error);
          // If table doesn't exist, still show success (report noted)
          if (error.code === '42P01') {
            closeModal('report-modal');
            showToast('Report received. Our team will investigate. Thank you for helping keep MCC safe!', 'success');
            return;
          }
          throw error;
        }

        closeModal('report-modal');
        showToast('Report submitted successfully. Our team will investigate and you may be eligible for a reward if the violation is confirmed. Thank you!', 'success');
      } catch (err) {
        console.error('Report error:', err);
        showToast('Report noted. Our team will review. Thank you!', 'success');
        closeModal('report-modal');
      }
    }

    // ========== NOTIFICATIONS ==========
    let notifications = [];

    async function loadNotifications() {
      try {
        const { data, error } = await supabaseClient
          .from('notifications')
          .select('*')
          .eq('user_id', currentUser.id)
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) {
          console.log('Notifications table may not exist:', error);
          return;
        }

        notifications = data || [];
        renderNotifications();
        updateNotificationBadge();
      } catch (err) {
        console.log('loadNotifications error:', err);
      }
    }

    function updateNotificationBadge() {
      const unreadCount = notifications.filter(n => !n.read).length;
      const badge = document.getElementById('notif-count');
      if (unreadCount > 0) {
        badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        badge.style.display = 'inline';
      } else {
        badge.style.display = 'none';
      }
    }

    function renderNotifications() {
      const container = document.getElementById('notifications-list');
      
      if (!notifications.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔔</div><p>No notifications yet.</p></div>';
        return;
      }

      const notifIcons = {
        'bid_received': '💰',
        'bid_accepted': '✅',
        'work_started': '🔧',
        'work_completed': '✓',
        'message_received': '💬',
        'payment_released': '💳',
        'upsell_request': '⚠️',
        'reminder': '🔔',
        'default': '📢'
      };

      container.innerHTML = notifications.map(n => {
        const icon = notifIcons[n.type] || notifIcons['default'];
        const timeAgo = formatTimeAgo(n.created_at);
        const unreadClass = n.read ? '' : 'unread';
        
        return `
          <div class="notification-item ${unreadClass}" onclick="handleNotificationClick('${n.id}', '${n.link_type || ''}', '${n.link_id || ''}')" style="display:flex;gap:16px;padding:16px 20px;background:${n.read ? 'var(--bg-card)' : 'var(--accent-gold-soft)'};border:1px solid ${n.read ? 'var(--border-subtle)' : 'rgba(212,168,85,0.3)'};border-radius:var(--radius-md);margin-bottom:12px;cursor:pointer;transition:all 0.15s;">
            <div style="font-size:24px;">${icon}</div>
            <div style="flex:1;">
              <div style="font-weight:${n.read ? '400' : '600'};margin-bottom:4px;">${n.title}</div>
              ${n.message ? `<div style="font-size:0.9rem;color:var(--text-secondary);line-height:1.5;">${n.message}</div>` : ''}
              <div style="font-size:0.8rem;color:var(--text-muted);margin-top:8px;">${timeAgo}</div>
            </div>
            ${!n.read ? '<div style="width:10px;height:10px;background:var(--accent-gold);border-radius:50%;flex-shrink:0;margin-top:6px;"></div>' : ''}
          </div>
        `;
      }).join('');
    }

    function formatTimeAgo(timestamp) {
      const date = new Date(timestamp);
      const now = new Date();
      const diff = now - date;
      
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);
      
      if (minutes < 1) return 'Just now';
      if (minutes < 60) return `${minutes}m ago`;
      if (hours < 24) return `${hours}h ago`;
      if (days < 7) return `${days}d ago`;
      return date.toLocaleDateString();
    }

    async function handleNotificationClick(notifId, linkType, linkId) {
      // Mark as read
      await supabaseClient
        .from('notifications')
        .update({ read: true, read_at: new Date().toISOString() })
        .eq('id', notifId);

      // Navigate based on link type
      if (linkType === 'package' && linkId) {
        showSection('packages');
        setTimeout(() => viewPackage(linkId), 100);
      } else if (linkType === 'message' && linkId) {
        showSection('messages');
      } else if (linkType === 'upsell') {
        showSection('upsells');
      }

      // Refresh notifications
      await loadNotifications();
    }

    async function markAllNotificationsRead() {
      const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
      if (!unreadIds.length) {
        showToast('All notifications already read', 'success');
        return;
      }

      await supabaseClient
        .from('notifications')
        .update({ read: true, read_at: new Date().toISOString() })
        .in('id', unreadIds);

      showToast('All notifications marked as read', 'success');
      await loadNotifications();
    }

    // Create notification helper (called when actions happen)
    async function createNotification(type, title, message, linkType = null, linkId = null) {
      try {
        await supabaseClient.from('notifications').insert({
          user_id: currentUser.id,
          type,
          title,
          message,
          link_type: linkType,
          link_id: linkId
        });
      } catch (err) {
        console.log('Could not create notification:', err);
      }
    }

    // ========== SETTINGS ==========
    async function saveSettings() {
      const fullName = document.getElementById('settings-name').value.trim();
      const phone = document.getElementById('settings-phone').value.trim();
      const zipCode = document.getElementById('settings-zip').value.trim();
      const city = document.getElementById('settings-city').value.trim();
      const state = document.getElementById('settings-state').value;

      // SMS preferences
      const smsEnabled = document.getElementById('sms-enabled').checked;
      const smsBidReceived = document.getElementById('sms-bid-received').checked;
      const smsWorkCompleted = document.getElementById('sms-work-completed').checked;
      const smsNewMessage = document.getElementById('sms-new-message').checked;
      const smsBiddingEnding = document.getElementById('sms-bidding-ending')?.checked || false;

      if (!zipCode) {
        showToast('Please enter your ZIP code', 'error');
        return;
      }

      // Validate phone if SMS enabled
      if (smsEnabled && !phone) {
        showToast('Please enter your phone number to enable SMS notifications', 'error');
        return;
      }

      try {
        const { error } = await supabaseClient.from('profiles').update({
          full_name: fullName || null,
          phone: phone || null,
          zip_code: zipCode,
          city: city || null,
          state: state || null,
          sms_notifications: smsEnabled,
          sms_bid_received: smsBidReceived,
          sms_work_completed: smsWorkCompleted,
          sms_new_message: smsNewMessage,
          sms_bidding_ending: smsBiddingEnding
        }).eq('id', currentUser.id);

        if (error) throw error;

        // Update local profile
        userProfile.full_name = fullName;
        userProfile.phone = phone;
        userProfile.zip_code = zipCode;
        userProfile.city = city;
        userProfile.state = state;
        userProfile.sms_notifications = smsEnabled;

        // Update display name
        const name = fullName || 'Member';
        const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        document.getElementById('user-name').textContent = name;
        document.getElementById('user-avatar').textContent = initials;

        // Hide location warning
        document.getElementById('location-status').style.display = 'none';

        showToast('Settings saved!', 'success');
      } catch (err) {
        console.error('Save settings error:', err);
        showToast('Failed to save settings', 'error');
      }
    }

    function toggleSmsOptions() {
      const enabled = document.getElementById('sms-enabled').checked;
      document.getElementById('sms-options').style.display = enabled ? 'block' : 'none';
    }

    // ==================== NOTIFICATION PREFERENCES FUNCTIONS ====================

    async function loadNotificationPreferences() {
      if (!currentUser) return;
      
      try {
        const response = await fetch(`/api/member/${currentUser.id}/notification-preferences`);
        const data = await response.json();
        
        if (data.warning) {
          console.log('Notification preferences:', data.warning);
        }
        
        const prefs = data.preferences || {};
        
        document.getElementById('pref-followup-email').checked = prefs.follow_up_emails !== false;
        document.getElementById('pref-followup-sms').checked = prefs.follow_up_sms !== false;
        document.getElementById('pref-maintenance-email').checked = prefs.maintenance_reminder_emails !== false;
        document.getElementById('pref-maintenance-sms').checked = prefs.maintenance_reminder_sms !== false;
        document.getElementById('pref-urgent-email').checked = prefs.urgent_update_emails !== false;
        document.getElementById('pref-urgent-sms').checked = prefs.urgent_update_sms !== false;
        document.getElementById('pref-marketing-email').checked = prefs.marketing_emails === true;
        document.getElementById('pref-marketing-sms').checked = prefs.marketing_sms === true;
        
      } catch (error) {
        console.error('Failed to load notification preferences:', error);
      }
    }

    async function saveNotificationPreferences() {
      if (!currentUser) {
        showToast('Please log in to save preferences', 'error');
        return;
      }
      
      const statusEl = document.getElementById('notif-save-status');
      statusEl.style.display = 'inline';
      statusEl.textContent = 'Saving...';
      statusEl.style.color = 'var(--text-muted)';
      
      const preferences = {
        follow_up_emails: document.getElementById('pref-followup-email').checked,
        follow_up_sms: document.getElementById('pref-followup-sms').checked,
        maintenance_reminder_emails: document.getElementById('pref-maintenance-email').checked,
        maintenance_reminder_sms: document.getElementById('pref-maintenance-sms').checked,
        urgent_update_emails: document.getElementById('pref-urgent-email').checked,
        urgent_update_sms: document.getElementById('pref-urgent-sms').checked,
        marketing_emails: document.getElementById('pref-marketing-email').checked,
        marketing_sms: document.getElementById('pref-marketing-sms').checked
      };
      
      try {
        const response = await fetch(`/api/member/${currentUser.id}/notification-preferences`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(preferences)
        });
        
        const data = await response.json();
        
        if (data.success) {
          statusEl.textContent = '✓ Saved';
          statusEl.style.color = 'var(--accent-green)';
          showToast('Notification preferences saved!', 'success');
          
          setTimeout(() => {
            statusEl.style.display = 'none';
          }, 3000);
        } else if (data.warning) {
          statusEl.textContent = '⚠ Migration needed';
          statusEl.style.color = 'var(--accent-orange)';
          showToast('Preferences saved locally. Database migration pending.', 'warning');
        } else {
          throw new Error(data.error || 'Failed to save');
        }
        
      } catch (error) {
        console.error('Failed to save notification preferences:', error);
        statusEl.textContent = '✗ Failed';
        statusEl.style.color = 'var(--accent-red)';
        showToast('Failed to save notification preferences', 'error');
      }
    }

    // ==================== PUSH NOTIFICATIONS ====================
    
    let pushSubscription = null;
    
    async function initPushNotifications() {
      const notSupportedEl = document.getElementById('push-not-supported');
      const contentEl = document.getElementById('push-content');
      
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        if (notSupportedEl) notSupportedEl.style.display = 'block';
        if (contentEl) contentEl.style.display = 'none';
        return;
      }
      
      try {
        const registration = await navigator.serviceWorker.ready;
        pushSubscription = await registration.pushManager.getSubscription();
        
        updatePushUI(!!pushSubscription);
        
        if (pushSubscription) {
          await loadPushPreferences();
        }
      } catch (error) {
        console.error('Push init error:', error);
      }
    }
    
    function updatePushUI(enabled) {
      const statusIcon = document.getElementById('push-status-icon');
      const statusText = document.getElementById('push-status-text');
      const statusDesc = document.getElementById('push-status-desc');
      const statusBadge = document.getElementById('push-status-badge');
      const enableSection = document.getElementById('push-enable-section');
      const enabledSection = document.getElementById('push-enabled-section');
      
      if (!statusIcon) return;
      
      if (enabled) {
        statusIcon.textContent = '🔔';
        statusText.textContent = 'Push Notifications Enabled';
        statusDesc.textContent = 'You\'ll receive instant alerts on this device.';
        statusBadge.textContent = 'On';
        statusBadge.style.background = 'rgba(74,200,140,0.15)';
        statusBadge.style.color = 'var(--accent-green)';
        enableSection.style.display = 'none';
        enabledSection.style.display = 'block';
      } else {
        statusIcon.textContent = '🔕';
        statusText.textContent = 'Push Notifications Disabled';
        statusDesc.textContent = 'Enable to receive instant alerts for bids, vehicle updates, and more.';
        statusBadge.textContent = 'Off';
        statusBadge.style.background = 'rgba(239,95,95,0.15)';
        statusBadge.style.color = 'var(--accent-red)';
        enableSection.style.display = 'block';
        enabledSection.style.display = 'none';
      }
    }
    
    async function enablePushNotifications() {
      try {
        const btn = document.getElementById('push-enable-btn');
        btn.disabled = true;
        btn.textContent = 'Enabling...';
        
        const permission = await Notification.requestPermission();
        
        if (permission !== 'granted') {
          showToast('Please allow notifications in your browser settings', 'error');
          btn.disabled = false;
          btn.textContent = '🔔 Enable Push Notifications';
          return;
        }
        
        const registration = await navigator.serviceWorker.ready;
        
        const vapidKey = await getVapidKey();
        if (!vapidKey) {
          showToast('Push notifications not configured', 'error');
          btn.disabled = false;
          btn.textContent = '🔔 Enable Push Notifications';
          return;
        }
        
        pushSubscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey)
        });
        
        await savePushSubscription(pushSubscription);
        
        updatePushUI(true);
        showToast('Push notifications enabled!', 'success');
        
      } catch (error) {
        console.error('Enable push error:', error);
        showToast('Failed to enable push notifications', 'error');
        const btn = document.getElementById('push-enable-btn');
        btn.disabled = false;
        btn.textContent = '🔔 Enable Push Notifications';
      }
    }
    
    async function disablePushNotifications() {
      try {
        if (pushSubscription) {
          await pushSubscription.unsubscribe();
          await removePushSubscription();
          pushSubscription = null;
        }
        
        updatePushUI(false);
        showToast('Push notifications disabled', 'success');
        
      } catch (error) {
        console.error('Disable push error:', error);
        showToast('Failed to disable push notifications', 'error');
      }
    }
    
    async function getVapidKey() {
      try {
        const response = await fetch('/api/push/vapid-key');
        const data = await response.json();
        return data.publicKey;
      } catch (error) {
        console.error('Failed to get VAPID key:', error);
        return null;
      }
    }
    
    async function savePushSubscription(subscription) {
      if (!currentUser) return;
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session?.access_token) return;
        
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            subscription: subscription.toJSON()
          })
        });
      } catch (error) {
        console.error('Failed to save push subscription:', error);
      }
    }
    
    async function removePushSubscription() {
      if (!currentUser) return;
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session?.access_token) return;
        
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({})
        });
      } catch (error) {
        console.error('Failed to remove push subscription:', error);
      }
    }
    
    async function loadPushPreferences() {
      const bidAlerts = document.getElementById('push-bid-alerts');
      const vehicleStatus = document.getElementById('push-vehicle-status');
      const dreamCar = document.getElementById('push-dream-car');
      const maintenance = document.getElementById('push-maintenance');
      
      if (!bidAlerts) return;
      
      try {
        const response = await fetch(`/api/member/${currentUser.id}/notification-preferences`);
        const data = await response.json();
        const prefs = data.preferences || {};
        
        bidAlerts.checked = prefs.push_bid_alerts !== false;
        vehicleStatus.checked = prefs.push_vehicle_status !== false;
        dreamCar.checked = prefs.push_dream_car_matches !== false;
        maintenance.checked = prefs.push_maintenance_reminders !== false;
        
        [bidAlerts, vehicleStatus, dreamCar, maintenance].forEach(el => {
          el.addEventListener('change', savePushPreferences);
        });
        
      } catch (error) {
        console.error('Failed to load push preferences:', error);
      }
    }
    
    async function savePushPreferences() {
      if (!currentUser) return;
      
      const preferences = {
        push_bid_alerts: document.getElementById('push-bid-alerts')?.checked ?? true,
        push_vehicle_status: document.getElementById('push-vehicle-status')?.checked ?? true,
        push_dream_car_matches: document.getElementById('push-dream-car')?.checked ?? true,
        push_maintenance_reminders: document.getElementById('push-maintenance')?.checked ?? true
      };
      
      try {
        await fetch(`/api/member/${currentUser.id}/notification-preferences`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(preferences)
        });
      } catch (error) {
        console.error('Failed to save push preferences:', error);
      }
    }
    
    function urlBase64ToUint8Array(base64String) {
      const padding = '='.repeat((4 - base64String.length % 4) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }
      return outputArray;
    }

    // ==================== SERVICE COORDINATION FUNCTIONS ====================

    // Store current logistics context
    let currentLogisticsContext = {
      packageId: null,
      memberId: null,
      providerId: null,
      appointmentId: null,
      transferId: null
    };

    // Load logistics data for a package
    let driverLocationRefreshInterval = null;
    
    async function loadLogisticsData(packageId) {
      try {
        const [appointmentResult, transferResult, locationResult, driverLocationResult] = await Promise.all([
          getAppointment(packageId),
          getVehicleTransfer(packageId),
          getActiveLocationShare(packageId),
          window.getDriverLocation(packageId)
        ]);

        renderAppointmentStatus(packageId, appointmentResult.data);
        renderTransferStatus(packageId, transferResult.data);
        renderLocationStatus(packageId, locationResult.data, driverLocationResult.data);
        loadEvidenceTimeline(packageId);
        loadKeyExchangeTimeline(packageId);
        loadInspectionReport(packageId);
        
        if (driverLocationRefreshInterval) {
          clearInterval(driverLocationRefreshInterval);
        }
        driverLocationRefreshInterval = setInterval(async () => {
          const { data: driverLoc } = await window.getDriverLocation(packageId);
          const { data: providerLoc } = await getActiveLocationShare(packageId);
          renderLocationStatus(packageId, providerLoc, driverLoc);
        }, 18000);
      } catch (err) {
        console.error('Error loading logistics data:', err);
      }
    }

    // Render appointment status
    function renderAppointmentStatus(packageId, appointment) {
      const container = document.getElementById(`appointment-status-${packageId}`);
      if (!container) return;

      if (!appointment) {
        container.innerHTML = `
          <div style="padding:16px;background:var(--bg-input);border-radius:var(--radius-md);border:1px dashed var(--border-subtle);">
            <div style="color:var(--text-muted);font-size:0.9rem;text-align:center;">
              <span style="font-size:1.5rem;display:block;margin-bottom:8px;">📅</span>
              No appointment scheduled yet. Propose a time to get started.
            </div>
          </div>
        `;
        return;
      }

      const statusColors = {
        'proposed': { bg: 'var(--accent-gold-soft)', color: 'var(--accent-gold)', icon: '⏳' },
        'counter_proposed': { bg: 'var(--accent-orange-soft)', color: 'var(--accent-orange)', icon: '🔄' },
        'confirmed': { bg: 'var(--accent-green-soft)', color: 'var(--accent-green)', icon: '✓' },
        'cancelled': { bg: 'rgba(239, 95, 95, 0.15)', color: 'var(--accent-red)', icon: '✗' }
      };
      const status = statusColors[appointment.status] || statusColors['proposed'];
      const date = new Date(appointment.proposed_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      const timeStart = appointment.proposed_time_start || 'TBD';
      const timeEnd = appointment.proposed_time_end || 'TBD';
      const proposedByMe = appointment.proposed_by === currentUser?.id;

      container.innerHTML = `
        <div style="padding:16px;background:${status.bg};border-radius:var(--radius-md);border:1px solid ${status.color}30;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
            <div>
              <div style="font-size:0.8rem;text-transform:uppercase;letter-spacing:0.05em;color:${status.color};margin-bottom:4px;">
                ${status.icon} ${appointment.status.replace('_', ' ').toUpperCase()}
              </div>
              <div style="font-size:1.1rem;font-weight:600;color:var(--text-primary);">${date}</div>
              <div style="font-size:0.9rem;color:var(--text-secondary);margin-top:4px;">🕐 ${timeStart} - ${timeEnd}</div>
            </div>
            ${appointment.estimated_days ? `<div style="text-align:right;"><div style="font-size:0.8rem;color:var(--text-muted);">Est. Duration</div><div style="font-weight:600;color:var(--text-primary);">${appointment.estimated_days} day(s)</div></div>` : ''}
          </div>
          ${appointment.notes ? `<div style="font-size:0.85rem;color:var(--text-secondary);padding:12px;background:var(--bg-input);border-radius:var(--radius-sm);margin-bottom:12px;">"${appointment.notes}"</div>` : ''}
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${appointment.status === 'proposed' && !proposedByMe ? `
              <button class="btn btn-success btn-sm" onclick="confirmScheduleFromMember('${appointment.id}', '${packageId}')">✓ Confirm Time</button>
              <button class="btn btn-secondary btn-sm" onclick="proposeNewTimeFromMember('${appointment.id}', '${packageId}')">🔄 Propose Different Time</button>
            ` : ''}
            ${appointment.status === 'counter_proposed' && proposedByMe ? `
              <button class="btn btn-success btn-sm" onclick="acceptCounterProposalFromMember('${appointment.id}', '${packageId}')">✓ Accept New Time</button>
              <button class="btn btn-secondary btn-sm" onclick="proposeNewTimeFromMember('${appointment.id}', '${packageId}')">🔄 Counter Again</button>
            ` : ''}
            ${appointment.status === 'proposed' && proposedByMe ? `
              <div style="font-size:0.85rem;color:var(--text-muted);">⏳ Waiting for provider response...</div>
            ` : ''}
            ${appointment.status === 'counter_proposed' && !proposedByMe ? `
              <button class="btn btn-success btn-sm" onclick="acceptCounterProposalFromMember('${appointment.id}', '${packageId}')">✓ Accept New Time</button>
              <button class="btn btn-secondary btn-sm" onclick="proposeNewTimeFromMember('${appointment.id}', '${packageId}')">🔄 Counter Again</button>
            ` : ''}
            ${appointment.status === 'confirmed' ? `
              <div style="font-size:0.85rem;color:var(--accent-green);">✓ Appointment confirmed! See you on ${date}.</div>
            ` : ''}
          </div>
        </div>
      `;
    }

    // Render transfer status with timeline
    function renderTransferStatus(packageId, transfer) {
      const container = document.getElementById(`transfer-status-${packageId}`);
      if (!container) return;

      if (!transfer) {
        container.innerHTML = `
          <div style="padding:16px;background:var(--bg-input);border-radius:var(--radius-md);border:1px dashed var(--border-subtle);">
            <div style="color:var(--text-muted);font-size:0.9rem;text-align:center;">
              <span style="font-size:1.5rem;display:block;margin-bottom:8px;">🚗</span>
              No transfer method set. Configure how your vehicle will be delivered.
            </div>
          </div>
        `;
        return;
      }

      const transferTypes = {
        'member_dropoff': { label: 'Member Drop-off', icon: '🚗', desc: 'You bring the vehicle to the provider' },
        'provider_pickup': { label: 'Provider Pickup', icon: '🚚', desc: 'Provider picks up from your location' },
        'mobile_service': { label: 'Mobile Service', icon: '🔧', desc: 'Service performed at your location' },
        'towing': { label: 'Towing Required', icon: '🚜', desc: 'Vehicle will be towed' }
      };
      const type = transferTypes[transfer.transfer_type] || transferTypes['member_dropoff'];

      const statusSteps = [
        { key: 'pending', label: 'Pending', icon: '⏳' },
        { key: 'scheduled', label: 'Scheduled', icon: '📅' },
        { key: 'in_transit_to_provider', label: 'In Transit', icon: '🚗' },
        { key: 'with_provider', label: 'With Provider', icon: '🔧' },
        { key: 'work_complete', label: 'Work Complete', icon: '✅' },
        { key: 'in_transit_to_member', label: 'Returning', icon: '🏠' },
        { key: 'returned', label: 'Returned', icon: '✓' }
      ];

      const currentStepIndex = statusSteps.findIndex(s => s.key === transfer.vehicle_status) || 0;

      container.innerHTML = `
        <div style="padding:16px;background:var(--bg-input);border-radius:var(--radius-md);">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
            <div style="width:48px;height:48px;background:var(--accent-blue-soft);border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center;font-size:24px;">${type.icon}</div>
            <div>
              <div style="font-weight:600;color:var(--text-primary);">${type.label}</div>
              <div style="font-size:0.85rem;color:var(--text-secondary);">${type.desc}</div>
            </div>
          </div>
          
          <!-- Timeline -->
          <div style="margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;position:relative;padding:0 4px;">
              <div style="position:absolute;top:12px;left:20px;right:20px;height:3px;background:var(--border-subtle);z-index:0;"></div>
              <div style="position:absolute;top:12px;left:20px;height:3px;background:var(--accent-green);z-index:1;width:${Math.max(0, (currentStepIndex / (statusSteps.length - 1)) * 100)}%;transition:width 0.3s;"></div>
              ${statusSteps.map((step, i) => `
                <div style="display:flex;flex-direction:column;align-items:center;z-index:2;flex:1;">
                  <div style="width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;
                    ${i < currentStepIndex ? 'background:var(--accent-green);color:#022c22;' : 
                      i === currentStepIndex ? 'background:var(--accent-blue);color:white;animation:pulse 2s infinite;' : 
                      'background:var(--bg-elevated);border:2px solid var(--border-subtle);color:var(--text-muted);'}">
                    ${i <= currentStepIndex ? step.icon : (i + 1)}
                  </div>
                  <div style="font-size:0.65rem;color:${i <= currentStepIndex ? 'var(--text-primary)' : 'var(--text-muted)'};margin-top:6px;text-align:center;max-width:60px;">${step.label}</div>
                </div>
              `).join('')}
            </div>
          </div>

          ${transfer.pickup_address ? `<div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:8px;">📍 Pickup: ${transfer.pickup_address}</div>` : ''}
          ${transfer.return_address ? `<div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:8px;">🏠 Return: ${transfer.return_address}</div>` : ''}
          
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
            ${transfer.vehicle_status === 'pending' || transfer.vehicle_status === 'scheduled' ? `
              <button class="btn btn-success btn-sm" onclick="confirmVehicleHandoff('${transfer.id}', '${packageId}', 'pickup')">✓ Confirm Handoff</button>
            ` : ''}
            ${transfer.vehicle_status === 'in_transit_to_member' || transfer.vehicle_status === 'work_complete' ? `
              <button class="btn btn-success btn-sm" onclick="confirmVehicleHandoff('${transfer.id}', '${packageId}', 'return')">✓ Confirm Vehicle Received</button>
            ` : ''}
          </div>
        </div>
      `;
    }

    // Render location status
    function renderLocationStatus(packageId, locationShare, driverLocation) {
      const container = document.getElementById(`location-status-${packageId}`);
      if (!container) return;

      let html = '';
      
      if (driverLocation && driverLocation.lat && driverLocation.lng) {
        const updatedAt = new Date(driverLocation.updated_at).toLocaleTimeString();
        const updatedDate = new Date(driverLocation.updated_at).toLocaleDateString();
        const mapsUrl = `https://www.google.com/maps?q=${driverLocation.lat},${driverLocation.lng}`;
        const driverName = driverLocation.profiles?.business_name || driverLocation.profiles?.provider_alias || driverLocation.profiles?.full_name || 'Driver';
        const trackingTypeLabels = {
          'pickup': '🚗 Picking up your vehicle',
          'return': '🚗 Returning your vehicle',
          'in_transit': '🚗 In transit'
        };
        const trackingLabel = trackingTypeLabels[driverLocation.tracking_type] || '🚗 Driver is on the way';
        
        html += `
          <div style="padding:16px;background:var(--accent-green-soft);border:1px solid rgba(74,200,140,0.3);border-radius:var(--radius-md);margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
              <div style="width:12px;height:12px;border-radius:50%;background:var(--accent-green);animation:pulse 1.5s ease-in-out infinite;flex-shrink:0;"></div>
              <div>
                <div style="font-weight:600;color:var(--accent-green);font-size:0.95rem;">${trackingLabel}</div>
                <div style="font-size:0.8rem;color:var(--text-secondary);">${driverName} is sharing live location</div>
              </div>
            </div>
            
            <div style="background:var(--bg-input);border-radius:var(--radius-md);padding:16px;margin-bottom:12px;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <div>
                  <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:6px;">
                    📍 Live Location
                  </div>
                  <div style="font-size:0.95rem;color:var(--text-primary);margin-bottom:4px;">
                    ${parseFloat(driverLocation.lat).toFixed(6)}, ${parseFloat(driverLocation.lng).toFixed(6)}
                  </div>
                  ${driverLocation.speed ? `<div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:4px;">Speed: ${driverLocation.speed} mph</div>` : ''}
                  <div style="font-size:0.8rem;color:var(--text-muted);">Last update: ${updatedAt} on ${updatedDate}</div>
                </div>
                <a href="${mapsUrl}" target="_blank" class="btn btn-primary btn-sm" style="text-decoration:none;">
                  🗺️ Open Maps
                </a>
              </div>
            </div>
            
            <div style="text-align:center;">
              <div style="display:inline-block;padding:8px 16px;background:var(--bg-card);border-radius:var(--radius-sm);border:1px solid var(--border-subtle);">
                <iframe 
                  src="https://www.openstreetmap.org/export/embed.html?bbox=${parseFloat(driverLocation.lng) - 0.01},${parseFloat(driverLocation.lat) - 0.01},${parseFloat(driverLocation.lng) + 0.01},${parseFloat(driverLocation.lat) + 0.01}&layer=mapnik&marker=${driverLocation.lat},${driverLocation.lng}" 
                  style="width:100%;min-width:280px;height:180px;border:none;border-radius:var(--radius-sm);"
                  loading="lazy"
                ></iframe>
              </div>
            </div>
          </div>
        `;
      }
      
      if (locationShare) {
        const isFromMe = locationShare.shared_by === currentUser?.id;
        const sharedAt = new Date(locationShare.shared_at).toLocaleString();
        const mapsUrl = `https://www.google.com/maps?q=${locationShare.latitude},${locationShare.longitude}`;

        html += `
          <div style="padding:16px;background:${isFromMe ? 'var(--accent-green-soft)' : 'var(--accent-blue-soft)'};border-radius:var(--radius-md);">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <div>
                <div style="font-size:0.8rem;text-transform:uppercase;letter-spacing:0.05em;color:${isFromMe ? 'var(--accent-green)' : 'var(--accent-blue)'};margin-bottom:4px;">
                  ${isFromMe ? '📍 Your Shared Location' : '📍 Provider Location (One-time)'}
                </div>
                ${locationShare.address ? `<div style="font-size:0.95rem;color:var(--text-primary);margin-bottom:4px;">${locationShare.address}</div>` : ''}
                <div style="font-size:0.8rem;color:var(--text-muted);">Shared: ${sharedAt}</div>
                ${locationShare.message ? `<div style="font-size:0.85rem;color:var(--text-secondary);margin-top:8px;">"${locationShare.message}"</div>` : ''}
              </div>
              <a href="${mapsUrl}" target="_blank" class="btn btn-sm btn-secondary" style="text-decoration:none;">
                🗺️ Open Maps
              </a>
            </div>
          </div>
        `;
      }
      
      if (!html) {
        html = `
          <div style="color:var(--text-muted);font-size:0.9rem;">
            Share your location to help the provider find you for pickup. When the driver is on the way, you'll see their live location here.
          </div>
        `;
      }
      
      container.innerHTML = html;
    }

    // ========== MEMBER EVIDENCE FUNCTIONS ==========

    const memberEvidenceTypeLabels = {
      'pre_pickup': { label: 'Pre-Pickup Condition', icon: '🔵', color: 'var(--accent-blue)' },
      'arrival_shop': { label: 'Arrival at Shop', icon: '🟠', color: '#f59e0b' },
      'post_service': { label: 'Post-Service Condition', icon: '🟢', color: 'var(--accent-green)' },
      'return': { label: 'Vehicle Return', icon: '🟣', color: '#a855f7' }
    };

    async function loadEvidenceTimeline(packageId) {
      const container = document.getElementById(`evidence-timeline-${packageId}`);
      if (!container) return;

      try {
        const { data: evidence } = await window.getPackageEvidence(packageId);

        if (!evidence || evidence.length === 0) {
          container.innerHTML = `
            <div style="padding:16px;background:var(--bg-input);border-radius:var(--radius-md);border:1px dashed var(--border-subtle);">
              <div style="color:var(--text-muted);font-size:0.9rem;text-align:center;">
                <span style="font-size:1.5rem;display:block;margin-bottom:8px;">📸</span>
                No evidence captured yet. Document your vehicle condition before pickup.
              </div>
            </div>
          `;
          return;
        }

        const timeline = evidence.map(e => {
          const typeInfo = memberEvidenceTypeLabels[e.type] || { label: e.type, icon: '📷', color: 'var(--text-muted)' };
          const photoGrid = e.photos?.length ? `
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
              ${e.photos.slice(0, 4).map(url => `
                <div style="width:60px;height:60px;border-radius:6px;overflow:hidden;border:1px solid var(--border-subtle);cursor:pointer;" onclick="window.open('${url}','_blank')">
                  <img src="${url}" style="width:100%;height:100%;object-fit:cover;">
                </div>
              `).join('')}
              ${e.photos.length > 4 ? `<div style="width:60px;height:60px;border-radius:6px;background:var(--bg-input);display:flex;align-items:center;justify-content:center;font-size:0.8rem;color:var(--text-muted);">+${e.photos.length - 4}</div>` : ''}
            </div>
          ` : '';

          const createdByName = e.profiles?.business_name || e.profiles?.full_name || (e.created_by_role === 'member' ? 'You' : 'Provider');

          return `
            <div style="display:flex;gap:12px;padding:12px;background:var(--bg-input);border-radius:var(--radius-md);border-left:3px solid ${typeInfo.color};margin-bottom:12px;">
              <div style="font-size:20px;">${typeInfo.icon}</div>
              <div style="flex:1;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">
                  <div style="font-weight:600;font-size:0.9rem;">${typeInfo.label}</div>
                  <div style="font-size:0.75rem;color:var(--text-muted);">by ${createdByName}</div>
                </div>
                <div style="display:flex;gap:16px;font-size:0.82rem;color:var(--text-secondary);margin-bottom:4px;">
                  <span>🔢 ${e.odometer?.toLocaleString() || 'N/A'} mi</span>
                  <span>⛽ ${e.fuel_level || 'N/A'}</span>
                </div>
                ${e.exterior_condition ? `<div style="font-size:0.82rem;color:var(--text-secondary);margin-top:4px;"><strong>Exterior:</strong> ${e.exterior_condition}</div>` : ''}
                ${e.interior_condition ? `<div style="font-size:0.82rem;color:var(--text-secondary);margin-top:4px;"><strong>Interior:</strong> ${e.interior_condition}</div>` : ''}
                ${e.notes ? `<div style="font-size:0.85rem;color:var(--text-secondary);margin-top:6px;">${e.notes}</div>` : ''}
                <div style="font-size:0.75rem;color:var(--text-muted);margin-top:8px;">${new Date(e.created_at).toLocaleString()}</div>
                ${photoGrid}
              </div>
            </div>
          `;
        }).join('');

        container.innerHTML = timeline || '<div style="color:var(--text-muted);font-size:0.9rem;">No evidence captured yet.</div>';
      } catch (err) {
        console.error('Error loading evidence timeline:', err);
        container.innerHTML = '<div style="color:var(--accent-red);font-size:0.9rem;">Failed to load evidence.</div>';
      }
    }

    async function loadKeyExchangeTimeline(packageId) {
      const container = document.getElementById(`key-exchange-timeline-${packageId}`);
      if (!container) return;

      try {
        const { data: keyExchanges, error } = await supabaseClient
          .from('key_exchanges')
          .select('*')
          .eq('package_id', packageId)
          .order('created_at', { ascending: true });

        if (error) throw error;

        if (!keyExchanges || keyExchanges.length === 0) {
          container.innerHTML = `
            <div style="padding:16px;background:var(--bg-input);border-radius:var(--radius-md);border:1px dashed var(--border-subtle);">
              <div style="color:var(--text-muted);font-size:0.9rem;text-align:center;">
                <span style="font-size:1.5rem;display:block;margin-bottom:8px;">🔑</span>
                No key exchanges recorded yet. The provider will document key handoffs at pickup and return.
              </div>
            </div>
          `;
          return;
        }

        const stageInfo = {
          'pickup': { label: 'Pickup Key Exchange', icon: '🔵', color: 'var(--accent-blue)' },
          'return': { label: 'Return Key Exchange', icon: '🟣', color: '#a855f7' }
        };

        const timeline = keyExchanges.map(exchange => {
          const info = stageInfo[exchange.stage] || { label: exchange.stage, icon: '🔑', color: 'var(--text-muted)' };
          
          const photoGrid = `
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
              ${exchange.driver_id_photo_url ? `
                <div style="width:60px;height:60px;border-radius:6px;overflow:hidden;border:2px solid var(--accent-gold);position:relative;cursor:pointer;" onclick="window.open('${exchange.driver_id_photo_url}','_blank')">
                  <img src="${exchange.driver_id_photo_url}" style="width:100%;height:100%;object-fit:cover;">
                  <div style="position:absolute;top:2px;right:2px;background:var(--accent-gold);color:#000;padding:1px 3px;border-radius:3px;font-size:0.55rem;font-weight:600;">ID</div>
                </div>
              ` : ''}
              ${(exchange.key_photos || []).slice(0, 3).map(url => `
                <div style="width:60px;height:60px;border-radius:6px;overflow:hidden;border:1px solid var(--border-subtle);cursor:pointer;" onclick="window.open('${url}','_blank')">
                  <img src="${url}" style="width:100%;height:100%;object-fit:cover;">
                </div>
              `).join('')}
            </div>
          `;

          return `
            <div style="display:flex;gap:12px;padding:12px;background:var(--bg-input);border-radius:var(--radius-md);border-left:3px solid ${exchange.verified_at ? 'var(--accent-green)' : info.color};margin-bottom:12px;">
              <div style="font-size:20px;">${info.icon}</div>
              <div style="flex:1;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-weight:600;font-size:0.9rem;">${info.label}</span>
                    ${exchange.verified_at ? `<span style="background:var(--accent-green);color:#fff;padding:2px 8px;border-radius:12px;font-size:0.7rem;font-weight:600;">✓ Verified</span>` : ''}
                  </div>
                  <div style="font-size:0.75rem;color:var(--text-muted);">by Provider</div>
                </div>
                ${exchange.verified_at ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:4px;">${new Date(exchange.verified_at).toLocaleString()}</div>` : ''}
                ${exchange.notes ? `<div style="font-size:0.85rem;color:var(--text-secondary);margin-top:6px;">${exchange.notes}</div>` : ''}
                ${photoGrid}
              </div>
            </div>
          `;
        }).join('');

        container.innerHTML = timeline || '<div style="color:var(--text-muted);font-size:0.9rem;">No key exchanges recorded yet.</div>';
      } catch (err) {
        console.error('Error loading key exchange timeline:', err);
        container.innerHTML = '<div style="color:var(--accent-red);font-size:0.9rem;">Failed to load key exchanges.</div>';
      }
    }

    function openMemberEvidenceModal(packageId, type) {
      document.getElementById('member-evidence-package-id').value = packageId;
      document.getElementById('member-evidence-type').value = type;
      document.getElementById('member-evidence-modal-title').textContent = memberEvidenceTypeLabels[type]?.label || 'Document Vehicle Condition';
      document.getElementById('member-evidence-photo-preview').innerHTML = '';
      document.getElementById('member-evidence-photos').value = '';
      document.getElementById('member-evidence-odometer').value = '';
      document.getElementById('member-evidence-fuel').value = '';
      document.getElementById('member-evidence-exterior').value = '';
      document.getElementById('member-evidence-interior').value = '';
      document.getElementById('member-evidence-notes').value = '';
      document.getElementById('member-evidence-upload-status').style.display = 'none';
      document.getElementById('member-evidence-modal').classList.add('active');
    }

    function previewMemberEvidencePhotos() {
      const fileInput = document.getElementById('member-evidence-photos');
      const preview = document.getElementById('member-evidence-photo-preview');
      const files = Array.from(fileInput.files).slice(0, 10);
      preview.innerHTML = '';
      files.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = document.createElement('div');
          img.style.cssText = 'width:80px;height:80px;border-radius:8px;overflow:hidden;border:1px solid var(--border-subtle);position:relative;';
          img.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;">`;
          preview.appendChild(img);
        };
        reader.readAsDataURL(file);
      });
    }

    async function submitMemberEvidence() {
      const packageId = document.getElementById('member-evidence-package-id').value;
      const type = document.getElementById('member-evidence-type').value;
      const fileInput = document.getElementById('member-evidence-photos');
      const odometer = document.getElementById('member-evidence-odometer').value;
      const fuelLevel = document.getElementById('member-evidence-fuel').value;
      const exteriorCondition = document.getElementById('member-evidence-exterior').value;
      const interiorCondition = document.getElementById('member-evidence-interior').value;
      const notes = document.getElementById('member-evidence-notes').value;

      if (!odometer || !fuelLevel) {
        return showToast('Please provide odometer reading and fuel level', 'error');
      }

      const files = Array.from(fileInput.files).slice(0, 10);
      if (files.length === 0) {
        return showToast('Please add at least one photo', 'error');
      }

      const btn = document.getElementById('submit-member-evidence-btn');
      const statusDiv = document.getElementById('member-evidence-upload-status');
      btn.disabled = true;
      btn.textContent = 'Uploading...';
      statusDiv.style.display = 'block';
      statusDiv.innerHTML = '<p style="color:var(--accent-gold);">📤 Uploading photos...</p>';

      try {
        const photoUrls = await window.uploadEvidencePhotos(packageId, files);
        if (photoUrls.length === 0) {
          throw new Error('Failed to upload photos');
        }

        statusDiv.innerHTML = '<p style="color:var(--accent-gold);">📝 Saving evidence...</p>';

        let lat = null, lng = null;
        try {
          const pos = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
          });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch (e) { }

        const { data, error } = await window.saveEvidence({
          packageId,
          type,
          photos: photoUrls,
          odometer: parseInt(odometer),
          fuelLevel,
          exteriorCondition,
          interiorCondition,
          notes,
          role: 'member',
          lat,
          lng
        });

        if (error) throw error;

        statusDiv.innerHTML = '<p style="color:var(--accent-green);">✅ Evidence saved successfully!</p>';
        showToast('Vehicle condition documented!', 'success');

        setTimeout(() => {
          closeModal('member-evidence-modal');
          loadEvidenceTimeline(packageId);
        }, 1500);
      } catch (err) {
        console.error('Evidence submission error:', err);
        statusDiv.innerHTML = `<p style="color:var(--accent-red);">❌ Error: ${err.message || 'Failed to save evidence'}</p>`;
        showToast('Failed to save evidence', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '📸 Save Evidence';
      }
    }

    // Open schedule modal
    function openScheduleModal(packageId, memberId, providerId) {
      currentLogisticsContext = { packageId, memberId, providerId };
      document.getElementById('schedule-package-id').value = packageId;
      document.getElementById('schedule-member-id').value = memberId;
      document.getElementById('schedule-provider-id').value = providerId;
      
      // Set minimum date to today
      const today = new Date().toISOString().split('T')[0];
      document.getElementById('schedule-date').min = today;
      document.getElementById('schedule-date').value = '';
      document.getElementById('schedule-time-start').value = '09:00';
      document.getElementById('schedule-time-end').value = '17:00';
      document.getElementById('schedule-duration').value = '1';
      document.getElementById('schedule-notes').value = '';
      
      openModal('schedule-modal');
    }

    // Submit schedule proposal
    async function submitScheduleProposal() {
      const packageId = document.getElementById('schedule-package-id').value;
      const memberId = document.getElementById('schedule-member-id').value;
      const providerId = document.getElementById('schedule-provider-id').value;
      const date = document.getElementById('schedule-date').value;
      const timeStart = document.getElementById('schedule-time-start').value;
      const timeEnd = document.getElementById('schedule-time-end').value;
      const duration = parseInt(document.getElementById('schedule-duration').value) || 1;
      const notes = document.getElementById('schedule-notes').value;

      if (!date) {
        showToast('Please select a date', 'error');
        return;
      }

      try {
        const result = await createAppointment(packageId, memberId, providerId, date, timeStart, timeEnd, duration, notes);
        
        if (result.error) {
          throw new Error(result.error);
        }

        showToast('Appointment proposed successfully!', 'success');
        closeModal('schedule-modal');
        loadLogisticsData(packageId);
      } catch (err) {
        console.error('Error proposing appointment:', err);
        showToast('Failed to propose appointment: ' + err.message, 'error');
      }
    }

    // Confirm schedule from member
    async function confirmScheduleFromMember(appointmentId, packageId) {
      if (!confirm('Confirm this appointment time?')) return;

      try {
        const result = await confirmAppointment(appointmentId, packageId);
        
        if (result.error) {
          throw new Error(result.error);
        }

        showToast('Appointment confirmed!', 'success');
        loadLogisticsData(packageId);
      } catch (err) {
        console.error('Error confirming appointment:', err);
        showToast('Failed to confirm appointment: ' + err.message, 'error');
      }
    }

    // Accept counter proposal
    async function acceptCounterProposalFromMember(appointmentId, packageId) {
      if (!confirm('Accept the proposed new time?')) return;

      try {
        const result = await acceptCounterProposal(appointmentId, packageId);
        
        if (result.error) {
          throw new Error(result.error);
        }

        showToast('Counter proposal accepted!', 'success');
        loadLogisticsData(packageId);
      } catch (err) {
        console.error('Error accepting counter proposal:', err);
        showToast('Failed to accept counter proposal: ' + err.message, 'error');
      }
    }

    // Open counter proposal modal
    function proposeNewTimeFromMember(appointmentId, packageId) {
      currentLogisticsContext.appointmentId = appointmentId;
      currentLogisticsContext.packageId = packageId;
      
      document.getElementById('counter-appointment-id').value = appointmentId;
      document.getElementById('counter-package-id').value = packageId;
      
      const today = new Date().toISOString().split('T')[0];
      document.getElementById('counter-date').min = today;
      document.getElementById('counter-date').value = '';
      document.getElementById('counter-time-start').value = '09:00';
      document.getElementById('counter-time-end').value = '17:00';
      document.getElementById('counter-notes').value = '';
      
      openModal('counter-proposal-modal');
    }

    // Submit counter proposal
    async function submitCounterProposal() {
      const appointmentId = document.getElementById('counter-appointment-id').value;
      const packageId = document.getElementById('counter-package-id').value;
      const date = document.getElementById('counter-date').value;
      const timeStart = document.getElementById('counter-time-start').value;
      const timeEnd = document.getElementById('counter-time-end').value;
      const notes = document.getElementById('counter-notes').value;

      if (!date) {
        showToast('Please select a date', 'error');
        return;
      }

      try {
        const result = await proposeNewTime(appointmentId, packageId, date, timeStart, timeEnd, notes);
        
        if (result.error) {
          throw new Error(result.error);
        }

        showToast('New time proposed!', 'success');
        closeModal('counter-proposal-modal');
        loadLogisticsData(packageId);
      } catch (err) {
        console.error('Error proposing new time:', err);
        showToast('Failed to propose new time: ' + err.message, 'error');
      }
    }

    // Open transfer modal
    function openTransferModal(packageId, memberId, providerId) {
      currentLogisticsContext = { packageId, memberId, providerId };
      document.getElementById('transfer-package-id').value = packageId;
      document.getElementById('transfer-member-id').value = memberId;
      document.getElementById('transfer-provider-id').value = providerId;
      
      // Reset form
      document.querySelectorAll('.transfer-type-option').forEach(opt => opt.classList.remove('selected'));
      document.getElementById('transfer-pickup-address').value = '';
      document.getElementById('transfer-pickup-notes').value = '';
      document.getElementById('transfer-return-address').value = '';
      document.getElementById('transfer-special-instructions').value = '';
      document.getElementById('transfer-address-section').style.display = 'none';
      
      openModal('transfer-modal');
    }

    // Select transfer type
    function selectTransferType(type) {
      document.querySelectorAll('.transfer-type-option').forEach(opt => opt.classList.remove('selected'));
      document.querySelector(`[data-transfer-type="${type}"]`).classList.add('selected');
      document.getElementById('selected-transfer-type').value = type;
      
      // Show address fields for pickup or towing
      const addressSection = document.getElementById('transfer-address-section');
      if (type === 'provider_pickup' || type === 'towing') {
        addressSection.style.display = 'block';
      } else {
        addressSection.style.display = 'none';
      }
    }

    // Submit transfer setup
    async function submitTransferSetup() {
      const packageId = document.getElementById('transfer-package-id').value;
      const memberId = document.getElementById('transfer-member-id').value;
      const providerId = document.getElementById('transfer-provider-id').value;
      const transferType = document.getElementById('selected-transfer-type').value;
      const pickupAddress = document.getElementById('transfer-pickup-address').value;
      const pickupNotes = document.getElementById('transfer-pickup-notes').value;
      const returnAddress = document.getElementById('transfer-return-address').value;
      const specialInstructions = document.getElementById('transfer-special-instructions').value;

      if (!transferType) {
        showToast('Please select a transfer method', 'error');
        return;
      }

      if ((transferType === 'provider_pickup' || transferType === 'towing') && !pickupAddress) {
        showToast('Please enter a pickup address', 'error');
        return;
      }

      try {
        const result = await createVehicleTransfer(packageId, memberId, providerId, transferType, pickupAddress, pickupNotes, returnAddress, specialInstructions);
        
        if (result.error) {
          throw new Error(result.error);
        }

        showToast('Transfer method set up successfully!', 'success');
        closeModal('transfer-modal');
        loadLogisticsData(packageId);
      } catch (err) {
        console.error('Error setting up transfer:', err);
        showToast('Failed to set up transfer: ' + err.message, 'error');
      }
    }

    // Confirm vehicle handoff
    async function confirmVehicleHandoff(transferId, packageId, type) {
      const confirmMsg = type === 'pickup' 
        ? 'Confirm that you have handed over your vehicle?' 
        : 'Confirm that you have received your vehicle back?';
      
      if (!confirm(confirmMsg)) return;

      try {
        let result;
        if (type === 'pickup') {
          result = await confirmPickup(transferId, packageId, 'member');
        } else {
          result = await confirmReturn(transferId, packageId, 'member');
        }
        
        if (result.error) {
          throw new Error(result.error);
        }

        showToast(type === 'pickup' ? 'Handoff confirmed!' : 'Return confirmed!', 'success');
        loadLogisticsData(packageId);
      } catch (err) {
        console.error('Error confirming handoff:', err);
        showToast('Failed to confirm: ' + err.message, 'error');
      }
    }

    // Share my location
    async function shareMyLocation(packageId, providerId) {
      if (!providerId) {
        showToast('No provider assigned yet', 'error');
        return;
      }

      document.getElementById('location-share-package-id').value = packageId;
      document.getElementById('location-share-provider-id').value = providerId;
      document.getElementById('location-share-message').value = '';
      
      openModal('location-share-modal');
    }

    // Confirm and share location
    async function confirmShareLocation() {
      const packageId = document.getElementById('location-share-package-id').value;
      const providerId = document.getElementById('location-share-provider-id').value;
      const message = document.getElementById('location-share-message').value;

      try {
        showToast('Getting your location...', 'success');
        
        const result = await shareLocation(packageId, providerId, 'pickup', message);
        
        if (result.error) {
          throw new Error(result.error);
        }

        showToast('Location shared successfully!', 'success');
        closeModal('location-share-modal');
        loadLogisticsData(packageId);
      } catch (err) {
        console.error('Error sharing location:', err);
        showToast('Failed to share location: ' + err.message, 'error');
      }
    }

    // View shared location from provider
    async function viewSharedLocation(packageId) {
      try {
        const result = await getActiveLocationShare(packageId);
        
        if (result.error) {
          throw new Error(result.error);
        }

        if (!result.data) {
          showToast('No location shared by provider yet', 'error');
          return;
        }

        const location = result.data;
        const sharedAt = new Date(location.shared_at).toLocaleString();
        const mapsUrl = `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;

        document.getElementById('view-location-body').innerHTML = `
          <div style="text-align:center;margin-bottom:20px;">
            <div style="font-size:48px;margin-bottom:12px;">📍</div>
            <div style="font-size:1.1rem;font-weight:600;color:var(--text-primary);margin-bottom:4px;">
              ${location.shared_by === currentUser?.id ? 'Your Shared Location' : 'Provider Location'}
            </div>
            ${location.address ? `<div style="color:var(--text-secondary);margin-bottom:8px;">${location.address}</div>` : ''}
            <div style="font-size:0.85rem;color:var(--text-muted);">Shared: ${sharedAt}</div>
          </div>
          ${location.message ? `
            <div style="padding:16px;background:var(--bg-input);border-radius:var(--radius-md);margin-bottom:20px;">
              <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:4px;">Message:</div>
              <div style="color:var(--text-secondary);">"${location.message}"</div>
            </div>
          ` : ''}
          <div style="display:flex;flex-direction:column;gap:8px;">
            <a href="${mapsUrl}" target="_blank" class="btn btn-primary" style="justify-content:center;text-decoration:none;">
              🗺️ Open in Google Maps
            </a>
            <a href="https://www.google.com/maps/dir/?api=1&destination=${location.latitude},${location.longitude}" target="_blank" class="btn btn-secondary" style="justify-content:center;text-decoration:none;">
              🚗 Get Directions
            </a>
          </div>
        `;

        // Mark as viewed
        if (location.shared_by !== currentUser?.id) {
          await markLocationViewed(location.id);
        }

        openModal('view-location-modal');
      } catch (err) {
        console.error('Error viewing location:', err);
        showToast('Failed to load location: ' + err.message, 'error');
      }
    }

    // ========== EMERGENCY FUNCTIONS ==========
    async function checkActiveEmergency() {
      try {
        const { data } = await getActiveEmergency(currentUser.id);
        activeEmergency = data;
        updateEmergencyBanner();
      } catch (err) {
        console.error('Error checking emergency:', err);
      }
    }

    function updateEmergencyBanner() {
      const banner = document.getElementById('emergency-alert-banner');
      const statusText = document.getElementById('emergency-banner-status');
      
      if (activeEmergency) {
        banner.style.display = 'flex';
        const statusLabels = {
          'pending': 'Waiting for a provider to accept...',
          'accepted': `Provider assigned! ETA: ${activeEmergency.eta_minutes || '--'} minutes`,
          'en_route': 'Provider is on the way!',
          'arrived': 'Provider has arrived',
          'in_progress': 'Help in progress...'
        };
        statusText.textContent = statusLabels[activeEmergency.status] || activeEmergency.status;
      } else {
        banner.style.display = 'none';
      }
    }

    function openEmergencyRequest() {
      if (activeEmergency) {
        openEmergencyStatus();
        return;
      }
      
      pendingEmergencyPhotos = [];
      document.getElementById('emergency-photo-previews').innerHTML = '';
      document.getElementById('emergency-type').value = '';
      document.getElementById('emergency-description').value = '';
      document.getElementById('emergency-location-text').textContent = 'Getting your location...';
      document.getElementById('emergency-address-text').textContent = '';
      
      const vehicleOptions = '<option value="">No vehicle selected</option>' + vehicles.map(v => 
        `<option value="${v.id}">${v.nickname || `${v.year || ''} ${v.make} ${v.model}`.trim()}</option>`
      ).join('');
      document.getElementById('emergency-vehicle').innerHTML = vehicleOptions;
      
      openModal('emergency-request-modal');
      getEmergencyLocation();
    }

    function getEmergencyLocation() {
      if (!navigator.geolocation) {
        document.getElementById('emergency-location-text').textContent = 'Location not available';
        return;
      }
      
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          emergencyLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          document.getElementById('emergency-location-text').textContent = '📍 Location captured';
          
          try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${emergencyLocation.lat}&lon=${emergencyLocation.lng}`);
            const data = await response.json();
            if (data.display_name) {
              document.getElementById('emergency-address-text').textContent = data.display_name;
              emergencyLocation.address = data.display_name;
            }
          } catch (e) {
            console.log('Could not get address');
          }
        },
        (error) => {
          document.getElementById('emergency-location-text').textContent = '⚠️ Could not get location';
          document.getElementById('emergency-address-text').textContent = 'Please enable location services';
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }

    function handleEmergencyPhotos(input) {
      const files = Array.from(input.files);
      if (pendingEmergencyPhotos.length + files.length > 5) {
        showToast('Maximum 5 photos allowed', 'error');
        return;
      }
      
      files.forEach(file => {
        pendingEmergencyPhotos.push(file);
        const reader = new FileReader();
        reader.onload = (e) => {
          const idx = pendingEmergencyPhotos.length - 1;
          const preview = document.createElement('div');
          preview.className = 'emergency-photo';
          preview.innerHTML = `
            <img src="${e.target.result}" alt="Photo ${idx + 1}">
            <button class="emergency-photo-remove" onclick="removeEmergencyPhoto(${idx})">×</button>
          `;
          document.getElementById('emergency-photo-previews').appendChild(preview);
        };
        reader.readAsDataURL(file);
      });
      input.value = '';
    }

    function removeEmergencyPhoto(idx) {
      pendingEmergencyPhotos.splice(idx, 1);
      renderEmergencyPhotoPreviews();
    }

    function renderEmergencyPhotoPreviews() {
      const container = document.getElementById('emergency-photo-previews');
      container.innerHTML = '';
      pendingEmergencyPhotos.forEach((file, idx) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const preview = document.createElement('div');
          preview.className = 'emergency-photo';
          preview.innerHTML = `
            <img src="${e.target.result}" alt="Photo ${idx + 1}">
            <button class="emergency-photo-remove" onclick="removeEmergencyPhoto(${idx})">×</button>
          `;
          container.appendChild(preview);
        };
        reader.readAsDataURL(file);
      });
    }

    const EMERGENCY_SERVICE_RATES = {
      lockout: { base: 100, perMile: 0, includedMiles: 0, display: '🔐 Lockout' },
      dead_battery: { base: 100, perMile: 0, includedMiles: 0, display: '🔋 Jump Start' },
      flat_tire: { base: 125, perMile: 0, includedMiles: 0, display: '🛞 Flat Tire' },
      fuel_delivery: { base: 125, perMile: 0, includedMiles: 0, display: '⛽ Fuel Delivery' },
      tow_needed: { base: 200, perMile: 6, includedMiles: 10, display: '🚛 Towing' },
      accident: { base: 250, perMile: 6, includedMiles: 10, display: '💥 Accident' },
      other: { base: 150, perMile: 0, includedMiles: 0, display: '🔧 Other' }
    };
    const EMERGENCY_ACTIVATION_FEE = 25;
    let pendingEmergencyPaymentData = null;

    function calculateEmergencyEscrow(emergencyType, miles = 10) {
      const rate = EMERGENCY_SERVICE_RATES[emergencyType];
      if (!rate) return 0;
      
      let escrow = rate.base;
      if (rate.perMile > 0 && miles > rate.includedMiles) {
        escrow += (miles - rate.includedMiles) * rate.perMile;
      }
      return escrow;
    }

    function handleEmergencyTypeChange() {
      const emergencyType = document.getElementById('emergency-type').value;
      const towDistanceGroup = document.getElementById('tow-distance-group');
      const pricePreview = document.getElementById('emergency-price-preview');
      
      const needsDistance = emergencyType === 'tow_needed' || emergencyType === 'accident';
      towDistanceGroup.style.display = needsDistance ? 'block' : 'none';
      
      if (emergencyType) {
        pricePreview.style.display = 'block';
        updateEmergencyPricePreview();
      } else {
        pricePreview.style.display = 'none';
      }
    }

    function updateEmergencyPricePreview() {
      const emergencyType = document.getElementById('emergency-type').value;
      if (!emergencyType) return;
      
      const miles = parseFloat(document.getElementById('emergency-tow-miles').value) || 10;
      const escrow = calculateEmergencyEscrow(emergencyType, miles);
      const total = EMERGENCY_ACTIVATION_FEE + escrow;
      
      document.getElementById('emergency-escrow-preview').textContent = '$' + escrow.toFixed(2);
      document.getElementById('emergency-total-preview').textContent = '$' + total.toFixed(2);
    }

    function showEmergencyPaymentModal(escrowAmount, totalAmount) {
      document.getElementById('payment-modal-escrow').textContent = '$' + escrowAmount.toFixed(2);
      document.getElementById('payment-modal-escrow-text').textContent = '$' + escrowAmount.toFixed(2);
      document.getElementById('payment-modal-total').textContent = '$' + totalAmount.toFixed(2);
      closeModal('emergency-request-modal');
      openModal('emergency-payment-modal');
    }

    async function submitEmergencyRequest() {
      const emergencyType = document.getElementById('emergency-type').value;
      const description = document.getElementById('emergency-description').value;
      const vehicleId = document.getElementById('emergency-vehicle').value;
      
      if (!emergencyType) {
        showToast('Please select an emergency type', 'error');
        return;
      }
      
      const lat = document.getElementById('emergency-lat').value;
      const lng = document.getElementById('emergency-lng').value;
      
      if (!lat || !lng) {
        showToast('Could not get your location. Please enable location services.', 'error');
        return;
      }
      
      const needsDistance = emergencyType === 'tow_needed' || emergencyType === 'accident';
      const estimatedMiles = needsDistance ? (parseFloat(document.getElementById('emergency-tow-miles').value) || 10) : null;
      const escrowAmount = calculateEmergencyEscrow(emergencyType, estimatedMiles || 10);
      const totalAmount = EMERGENCY_ACTIVATION_FEE + escrowAmount;
      
      pendingEmergencyPaymentData = {
        vehicleId: vehicleId || null,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        address: document.getElementById('emergency-address').value || null,
        emergencyType: emergencyType,
        description: description,
        estimatedMiles: estimatedMiles,
        activationFee: EMERGENCY_ACTIVATION_FEE,
        escrowAmount: escrowAmount
      };
      
      showEmergencyPaymentModal(escrowAmount, totalAmount);
    }

    async function confirmEmergencyPayment() {
      if (!pendingEmergencyPaymentData) {
        showToast('No pending emergency request', 'error');
        return;
      }
      
      try {
        closeModal('emergency-payment-modal');
        showToast('Processing payment and submitting emergency request...', 'success');
        
        const claimDeadline = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        
        const { data, error } = await createEmergencyRequest({
          vehicleId: pendingEmergencyPaymentData.vehicleId,
          lat: pendingEmergencyPaymentData.lat,
          lng: pendingEmergencyPaymentData.lng,
          address: pendingEmergencyPaymentData.address,
          emergencyType: pendingEmergencyPaymentData.emergencyType,
          description: pendingEmergencyPaymentData.description,
          photos: [],
          activationFee: pendingEmergencyPaymentData.activationFee,
          escrowAmount: pendingEmergencyPaymentData.escrowAmount,
          estimatedMiles: pendingEmergencyPaymentData.estimatedMiles,
          claimDeadline: claimDeadline,
          paymentStatus: 'pending_payment'
        });
        
        if (error) throw new Error(error);
        
        if (pendingEmergencyPhotos.length > 0) {
          const photoUrls = [];
          for (const file of pendingEmergencyPhotos) {
            const { data: url, error: uploadError } = await uploadEmergencyPhoto(data.id, file);
            if (!uploadError && url) photoUrls.push(url);
          }
          
          if (photoUrls.length > 0) {
            await supabaseClient.from('emergency_requests')
              .update({ photos: photoUrls })
              .eq('id', data.id);
          }
        }
        
        pendingEmergencyPaymentData = null;
        activeEmergency = data;
        updateEmergencyBanner();
        showSection('emergency');
        loadEmergencySection();
        showToast('🚨 Emergency request submitted! Providers are being notified.', 'success');
        
      } catch (err) {
        console.error('Error submitting emergency:', err);
        showToast('Failed to submit emergency request: ' + err.message, 'error');
      }
    }

    function previewEmergencyPhotos(input) {
      const files = Array.from(input.files);
      pendingEmergencyPhotos = pendingEmergencyPhotos.concat(files);
      const container = document.getElementById('emergency-photo-preview');
      container.innerHTML = '';
      pendingEmergencyPhotos.forEach((file, idx) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const preview = document.createElement('div');
          preview.className = 'emergency-photo';
          preview.innerHTML = `
            <img src="${e.target.result}" alt="Photo ${idx + 1}">
            <button class="emergency-photo-remove" onclick="removeEmergencyPhoto(${idx})">×</button>
          `;
          container.appendChild(preview);
        };
        reader.readAsDataURL(file);
      });
    }

    async function refreshEmergencyLocation() {
      document.getElementById('emergency-address').value = 'Getting your location...';
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (pos) => {
          document.getElementById('emergency-lat').value = pos.coords.latitude;
          document.getElementById('emergency-lng').value = pos.coords.longitude;
          try {
            const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`);
            const data = await resp.json();
            document.getElementById('emergency-address').value = data.display_name || `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
          } catch (e) {
            document.getElementById('emergency-address').value = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
          }
        }, (err) => {
          document.getElementById('emergency-address').value = 'Unable to get location';
          showToast('Please enable location services', 'error');
        }, { enableHighAccuracy: true });
      }
    }

    async function loadEmergencySection() {
      if (!currentUser) return;
      
      // Check for active emergency
      const { data: activeData } = await getActiveEmergency(currentUser.id);
      if (activeData) {
        activeEmergency = activeData;
        document.getElementById('emergency-active-status').style.display = 'block';
        document.getElementById('emergency-request-form').style.display = 'none';
        renderEmergencySectionStatus();
        startEmergencyPolling();
      } else {
        stopEmergencyPolling();
        document.getElementById('emergency-active-status').style.display = 'none';
        document.getElementById('emergency-request-form').style.display = 'block';
        refreshEmergencyLocation();
        populateEmergencyVehicles();
      }
      
      // Load history
      const { data: history } = await getMyEmergencies(currentUser.id);
      renderEmergencyHistory(history || []);
    }

    function renderEmergencySectionStatus() {
      const e = activeEmergency;
      if (!e) return;
      
      const typeLabels = {
        'flat_tire': '🛞 Flat Tire',
        'dead_battery': '🔋 Dead Battery',
        'lockout': '🔐 Locked Out',
        'tow_needed': '🚛 Tow Needed',
        'fuel_delivery': '⛽ Out of Fuel',
        'accident': '💥 Accident',
        'other': '❓ Other'
      };
      
      document.getElementById('emergency-active-type').textContent = typeLabels[e.emergency_type] || e.emergency_type;
      
      const statuses = ['pending', 'accepted', 'en_route', 'arrived', 'in_progress', 'completed'];
      const currentIdx = statuses.indexOf(e.status);
      
      const statusLabels = {
        'pending': { icon: '⏳', label: 'Waiting for provider' },
        'accepted': { icon: '✓', label: 'Provider accepted' },
        'en_route': { icon: '🚗', label: 'Provider en route' },
        'arrived': { icon: '📍', label: 'Provider arrived' },
        'in_progress': { icon: '🔧', label: 'Work in progress' },
        'completed': { icon: '✅', label: 'Completed' }
      };
      
      // Show round info for pending status
      let roundInfoHtml = '';
      if (e.status === 'pending') {
        const currentRound = e.claim_round || 1;
        const claimDeadline = e.claim_deadline ? new Date(e.claim_deadline) : null;
        let timeRemaining = '';
        if (claimDeadline) {
          const remaining = Math.max(0, Math.floor((claimDeadline - new Date()) / 1000));
          const mins = Math.floor(remaining / 60);
          const secs = remaining % 60;
          timeRemaining = `${mins}:${secs.toString().padStart(2, '0')} remaining`;
        }
        roundInfoHtml = `
          <div style="background:var(--accent-orange-soft);border:1px solid var(--accent-orange);border-radius:var(--radius-md);padding:12px 16px;margin-bottom:16px;text-align:center;">
            <div style="font-weight:600;color:var(--accent-orange);margin-bottom:4px;">🔍 Round ${currentRound} of 3</div>
            <div style="font-size:0.85rem;color:var(--text-secondary);">Searching for nearby providers... ${timeRemaining}</div>
          </div>
        `;
      }
      
      const timelineHtml = statuses.slice(0, 5).map((status, idx) => {
        const stepClass = idx < currentIdx ? 'completed' : idx === currentIdx ? 'current' : 'pending';
        const info = statusLabels[status];
        return `
          <div class="emergency-step ${stepClass}">
            <div class="emergency-step-dot">${info.icon}</div>
            <div class="emergency-step-info">
              <div class="emergency-step-label">${info.label}</div>
            </div>
          </div>
        `;
      }).join('');
      
      document.getElementById('emergency-status-timeline').innerHTML = roundInfoHtml + timelineHtml;
      
      if (e.provider) {
        document.getElementById('emergency-provider-info').style.display = 'block';
        document.getElementById('emergency-provider-info').innerHTML = `
          <div style="font-weight:600;margin-bottom:8px;">Your Provider</div>
          <div style="font-size:1.1rem;margin-bottom:4px;">${e.provider.business_name || e.provider.full_name}</div>
          ${e.provider.phone ? `<a href="tel:${e.provider.phone}" class="btn btn-primary" style="margin-top:8px;width:100%;justify-content:center;">📞 Call Provider</a>` : ''}
          ${e.eta_minutes ? `<div style="color:var(--accent-gold);margin-top:8px;">ETA: ${e.eta_minutes} minutes</div>` : ''}
        `;
      }
    }

    function renderEmergencyHistory(emergencies) {
      const container = document.getElementById('emergency-history-list');
      const completed = emergencies.filter(e => ['completed', 'cancelled'].includes(e.status));
      
      if (completed.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">🆘</div>
            <p>No emergency requests yet.</p>
          </div>
        `;
        return;
      }
      
      const typeLabels = {
        'flat_tire': '🛞 Flat Tire',
        'dead_battery': '🔋 Dead Battery',
        'lockout': '🔐 Locked Out',
        'tow_needed': '🚛 Tow Needed',
        'fuel_delivery': '⛽ Out of Fuel',
        'accident': '💥 Accident',
        'other': '❓ Other'
      };
      
      container.innerHTML = completed.map(e => `
        <div style="padding:16px;background:var(--bg-elevated);border-radius:var(--radius-md);margin-bottom:12px;border:1px solid var(--border-subtle);">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <span style="font-size:1.1rem;">${typeLabels[e.emergency_type] || e.emergency_type}</span>
              <span class="status-badge ${e.status === 'completed' ? 'status-completed' : 'status-cancelled'}" style="margin-left:12px;">${e.status}</span>
            </div>
            <span style="color:var(--text-muted);font-size:0.85rem;">${new Date(e.created_at).toLocaleDateString()}</span>
          </div>
          ${e.vehicles ? `<div style="color:var(--text-secondary);font-size:0.9rem;margin-top:4px;">${e.vehicles.year} ${e.vehicles.make} ${e.vehicles.model}</div>` : ''}
        </div>
      `).join('');
    }

    async function populateEmergencyVehicles() {
      const select = document.getElementById('emergency-vehicle');
      if (!userVehicles || userVehicles.length === 0) {
        select.innerHTML = '<option value="">No vehicles - add one first</option>';
        return;
      }
      select.innerHTML = '<option value="">Select a vehicle (optional)</option>' + 
        userVehicles.map(v => `<option value="${v.id}">${v.year} ${v.make} ${v.model}</option>`).join('');
    }

    async function openEmergencyStatus() {
      if (!activeEmergency) {
        await checkActiveEmergency();
      }
      
      if (!activeEmergency) {
        showToast('No active emergency', 'error');
        return;
      }
      
      openModal('emergency-status-modal');
      renderEmergencyStatus();
    }

    function renderEmergencyStatus() {
      const e = activeEmergency;
      if (!e) return;
      
      const typeLabels = {
        'flat_tire': '🛞 Flat Tire',
        'dead_battery': '🔋 Dead Battery',
        'lockout': '🔐 Locked Out',
        'tow_needed': '🚛 Tow Needed',
        'fuel_delivery': '⛽ Out of Fuel',
        'accident': '💥 Accident',
        'other': '❓ Other'
      };
      
      const statuses = ['pending', 'accepted', 'en_route', 'arrived', 'in_progress', 'completed'];
      const currentIdx = statuses.indexOf(e.status);
      
      const statusLabels = {
        'pending': { icon: '⏳', label: 'Waiting for provider' },
        'accepted': { icon: '✓', label: 'Provider accepted' },
        'en_route': { icon: '🚗', label: 'Provider en route' },
        'arrived': { icon: '📍', label: 'Provider arrived' },
        'in_progress': { icon: '🔧', label: 'Work in progress' },
        'completed': { icon: '✅', label: 'Completed' }
      };
      
      const timelineHtml = statuses.slice(0, 5).map((status, idx) => {
        const stepClass = idx < currentIdx ? 'completed' : idx === currentIdx ? 'current' : 'pending';
        const info = statusLabels[status];
        return `
          <div class="emergency-step ${stepClass}">
            <div class="emergency-step-dot">${info.icon}</div>
            <div class="emergency-step-info">
              <div class="emergency-step-label">${info.label}</div>
              ${idx === currentIdx && e.accepted_at ? `<div class="emergency-step-time">${new Date(e.accepted_at).toLocaleTimeString()}</div>` : ''}
            </div>
          </div>
        `;
      }).join('');
      
      const providerHtml = e.provider ? `
        <div style="background:var(--bg-input);border-radius:var(--radius-md);padding:16px;margin-top:20px;">
          <div style="font-weight:600;margin-bottom:8px;">Your Provider</div>
          <div style="font-size:1.1rem;margin-bottom:4px;">${e.provider.business_name || e.provider.full_name}</div>
          ${e.provider.phone ? `<a href="tel:${e.provider.phone}" class="btn btn-primary" style="margin-top:12px;width:100%;justify-content:center;">📞 Call Provider</a>` : ''}
          ${e.eta_minutes ? `<div style="color:var(--accent-gold);margin-top:12px;">ETA: ${e.eta_minutes} minutes</div>` : ''}
        </div>
      ` : '';
      
      const vehicleName = e.vehicles ? `${e.vehicles.year} ${e.vehicles.make} ${e.vehicles.model}` : 'No vehicle selected';
      
      document.getElementById('emergency-status-content').innerHTML = `
        <div style="text-align:center;margin-bottom:20px;">
          <div style="font-size:32px;margin-bottom:8px;">${typeLabels[e.emergency_type]?.split(' ')[0] || '🚨'}</div>
          <div style="font-size:1.1rem;font-weight:600;">${typeLabels[e.emergency_type] || e.emergency_type}</div>
          <div style="color:var(--text-muted);font-size:0.9rem;">${vehicleName}</div>
        </div>
        
        <div class="emergency-timeline">${timelineHtml}</div>
        
        ${providerHtml}
        
        ${e.address ? `
          <div style="margin-top:20px;padding:16px;background:var(--bg-input);border-radius:var(--radius-md);">
            <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:4px;">📍 Your Location</div>
            <div style="font-size:0.9rem;color:var(--text-secondary);">${e.address}</div>
          </div>
        ` : ''}
        
        ${e.description ? `
          <div style="margin-top:16px;padding:16px;background:var(--bg-input);border-radius:var(--radius-md);">
            <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:4px;">Description</div>
            <div style="font-size:0.9rem;color:var(--text-secondary);">${e.description}</div>
          </div>
        ` : ''}
      `;
      
      document.getElementById('emergency-status-footer').innerHTML = e.status === 'pending' ? `
        <button class="btn btn-danger" onclick="cancelActiveEmergency()">Cancel Request</button>
        <button class="btn btn-secondary" onclick="closeModal('emergency-status-modal')">Close</button>
      ` : `<button class="btn btn-secondary" onclick="closeModal('emergency-status-modal')">Close</button>`;
    }

    async function cancelActiveEmergency() {
      if (!activeEmergency) return;
      if (!confirm('Are you sure you want to cancel this emergency request?')) return;
      
      try {
        const { error } = await cancelEmergency(activeEmergency.id);
        if (error) throw new Error(error);
        
        activeEmergency = null;
        updateEmergencyBanner();
        closeModal('emergency-status-modal');
        loadEmergencySection();
        showToast('Emergency request cancelled', 'success');
      } catch (err) {
        console.error('Error cancelling emergency:', err);
        showToast('Failed to cancel: ' + err.message, 'error');
      }
    }

    // Real-time polling for emergency status updates
    let emergencyPollInterval = null;
    
    async function checkEmergencyRoundExpiry() {
      if (!activeEmergency || activeEmergency.status !== 'pending') return;
      
      const claimDeadline = activeEmergency.claim_deadline ? new Date(activeEmergency.claim_deadline) : null;
      const now = new Date();
      
      if (claimDeadline && claimDeadline <= now) {
        const currentRound = activeEmergency.claim_round || 1;
        
        if (currentRound >= 3) {
          // All 3 rounds exhausted - show fallback message
          showEmergencyNoProvidersMessage();
          return;
        }
        
        // Extend to next round
        const { data, error } = await extendEmergencyRound(activeEmergency.id);
        if (data) {
          activeEmergency = { ...activeEmergency, ...data };
          renderEmergencySectionStatus();
          showToast(`Extending search - Round ${data.claim_round} of 3`, 'info');
        } else if (error && error.roundsExhausted) {
          showEmergencyNoProvidersMessage();
        }
      }
    }
    
    function showEmergencyNoProvidersMessage() {
      const container = document.getElementById('emergency-active-status');
      if (!container) return;
      
      container.innerHTML = `
        <div class="card" style="text-align:center;padding:40px 24px;">
          <div style="font-size:48px;margin-bottom:16px;">😔</div>
          <h3 style="margin-bottom:12px;color:var(--accent-red);">No Providers Available</h3>
          <p style="color:var(--text-secondary);margin-bottom:24px;line-height:1.6;">
            We're sorry, but no providers were able to respond to your emergency request after 15 minutes of searching.
          </p>
          <div style="background:var(--bg-input);border-radius:var(--radius-md);padding:16px;margin-bottom:24px;">
            <p style="font-weight:600;margin-bottom:8px;">Alternative Help:</p>
            <p style="color:var(--text-secondary);margin-bottom:12px;">Please try calling 911 or a local towing service.</p>
            <a href="tel:911" class="btn btn-danger" style="width:100%;justify-content:center;margin-bottom:8px;">📞 Call 911</a>
          </div>
          <button class="btn btn-secondary" onclick="cancelActiveEmergency()" style="width:100%;justify-content:center;">Cancel Request & Try Again</button>
        </div>
      `;
      
      stopEmergencyPolling();
    }
    
    function startEmergencyPolling() {
      if (emergencyPollInterval) return;
      emergencyPollInterval = setInterval(async () => {
        if (!activeEmergency || !currentUser) return;
        
        // Check for round expiry first
        await checkEmergencyRoundExpiry();
        
        const { data } = await getActiveEmergency(currentUser.id);
        if (data && data.status !== activeEmergency.status) {
          activeEmergency = data;
          renderEmergencySectionStatus();
          updateEmergencyBanner();
          if (data.status === 'completed') {
            showToast('Your emergency service has been completed!', 'success');
            stopEmergencyPolling();
            setTimeout(() => loadEmergencySection(), 2000);
          } else if (data.status === 'accepted') {
            showToast('A provider has accepted your request!', 'success');
          } else if (data.status === 'en_route') {
            showToast('Your provider is on the way!', 'success');
          } else if (data.status === 'arrived') {
            showToast('Your provider has arrived!', 'success');
          }
        } else if (data) {
          // Update activeEmergency even if status hasn't changed (to get latest round info)
          activeEmergency = data;
          renderEmergencySectionStatus();
        }
        if (!data) {
          activeEmergency = null;
          updateEmergencyBanner();
          loadEmergencySection();
          stopEmergencyPolling();
        }
      }, 10000);
    }
    
    function stopEmergencyPolling() {
      if (emergencyPollInterval) {
        clearInterval(emergencyPollInterval);
        emergencyPollInterval = null;
      }
    }

    // ==================== INSPECTION REPORT DISPLAY ====================
    async function loadInspectionReport(packageId) {
      const container = document.getElementById(`inspection-report-content-${packageId}`);
      if (!container) return;
      
      try {
        const { data: inspection, error } = await supabaseClient
          .from('inspection_reports')
          .select('*')
          .eq('package_id', packageId)
          .single();
        
        if (error || !inspection) {
          container.innerHTML = `
            <div style="color:var(--text-muted);font-size:0.9rem;text-align:center;padding:16px;">
              <span style="font-size:1.5rem;display:block;margin-bottom:8px;">📋</span>
              No inspection report available yet. Your provider will complete an inspection during service.
            </div>
          `;
          return;
        }
        
        renderInspectionReport(packageId, inspection);
      } catch (err) {
        console.error('Error loading inspection:', err);
        container.innerHTML = `<div style="color:var(--text-muted);font-size:0.9rem;">Could not load inspection report.</div>`;
      }
    }
    
    function renderInspectionReport(packageId, inspection) {
      const container = document.getElementById(`inspection-report-content-${packageId}`);
      if (!container) return;
      
      const conditionLabels = { excellent: 'Excellent', good: 'Good', fair: 'Fair', needs_attention: 'Needs Attention' };
      const statusLabels = { good: 'Good', fair: 'Fair', needs_attention: 'Attention', urgent: 'Urgent', na: 'N/A' };
      const inspectionDate = new Date(inspection.inspection_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      
      const categories = [
        { 
          name: '🛢️ Fluids', 
          items: [
            { label: 'Engine Oil', field: 'engine_oil' },
            { label: 'Transmission Fluid', field: 'transmission_fluid' },
            { label: 'Coolant Level', field: 'coolant_level' },
            { label: 'Brake Fluid', field: 'brake_fluid' },
            { label: 'Power Steering Fluid', field: 'power_steering_fluid' }
          ]
        },
        { 
          name: '🛞 Brakes', 
          items: [
            { label: 'Front Brake Pads', field: 'brake_pads_front', extra: inspection.brake_pads_front_percent ? `${inspection.brake_pads_front_percent}%` : null },
            { label: 'Rear Brake Pads', field: 'brake_pads_rear', extra: inspection.brake_pads_rear_percent ? `${inspection.brake_pads_rear_percent}%` : null },
            { label: 'Brake Rotors', field: 'brake_rotors' }
          ]
        },
        { 
          name: '🚗 Tires', 
          items: [
            { label: 'Front Left', field: 'tire_front_left', extra: inspection.tire_front_left_tread ? `${inspection.tire_front_left_tread}/32"` : null },
            { label: 'Front Right', field: 'tire_front_right', extra: inspection.tire_front_right_tread ? `${inspection.tire_front_right_tread}/32"` : null },
            { label: 'Rear Left', field: 'tire_rear_left', extra: inspection.tire_rear_left_tread ? `${inspection.tire_rear_left_tread}/32"` : null },
            { label: 'Rear Right', field: 'tire_rear_right', extra: inspection.tire_rear_right_tread ? `${inspection.tire_rear_right_tread}/32"` : null },
            { label: 'Spare Tire', field: 'spare_tire' }
          ]
        },
        { 
          name: '⚡ Electrical & Lights', 
          items: [
            { label: 'Battery', field: 'battery', extra: inspection.battery_voltage ? `${inspection.battery_voltage}V` : null },
            { label: 'Headlights', field: 'headlights' },
            { label: 'Taillights', field: 'taillights' },
            { label: 'Turn Signals', field: 'turn_signals' }
          ]
        },
        { 
          name: '🔗 Belts & Hoses', 
          items: [
            { label: 'Serpentine Belt', field: 'serpentine_belt' },
            { label: 'Hoses', field: 'hoses' }
          ]
        },
        { 
          name: '🌧️ Wipers & Glass', 
          items: [
            { label: 'Wiper Blades', field: 'wiper_blades' },
            { label: 'Windshield', field: 'windshield' }
          ]
        },
        { 
          name: '🔧 Suspension & Steering', 
          items: [
            { label: 'Shocks/Struts', field: 'shocks_struts' },
            { label: 'Alignment', field: 'alignment' }
          ]
        },
        { 
          name: '🌬️ Filters', 
          items: [
            { label: 'Air Filter', field: 'air_filter' },
            { label: 'Cabin Filter', field: 'cabin_filter' }
          ]
        }
      ];
      
      let categoriesHtml = categories.map(cat => {
        const hasIssues = cat.items.some(item => inspection[item.field] === 'urgent' || inspection[item.field] === 'needs_attention');
        const itemsHtml = cat.items.filter(item => inspection[item.field]).map(item => {
          const status = inspection[item.field];
          return `
            <div class="inspection-item-row">
              <span>${item.label}${item.extra ? ` <span style="color:var(--text-muted);font-size:0.8rem;">(${item.extra})</span>` : ''}</span>
              <span class="inspection-status-badge ${status}">${statusLabels[status] || status}</span>
            </div>
          `;
        }).join('');
        
        if (!itemsHtml) return '';
        
        return `
          <div class="inspection-category-section ${hasIssues ? 'expanded' : ''}">
            <div class="inspection-category-toggle" onclick="this.parentElement.classList.toggle('expanded')">
              <span>${cat.name}</span>
              <span style="font-size:0.8rem;color:var(--text-muted);">▼</span>
            </div>
            <div class="inspection-category-items">${itemsHtml}</div>
          </div>
        `;
      }).join('');
      
      container.innerHTML = `
        <div class="inspection-report-header">
          <div>
            <span class="inspection-overall-badge ${inspection.overall_condition}">${conditionLabels[inspection.overall_condition] || 'N/A'}</span>
            <div class="inspection-date" style="margin-top:8px;">📅 Inspected: ${inspectionDate}</div>
          </div>
        </div>
        
        <div class="inspection-counts">
          ${inspection.urgent_items > 0 ? `<div class="inspection-count-item urgent">🔴 ${inspection.urgent_items} Urgent</div>` : ''}
          ${inspection.attention_items > 0 ? `<div class="inspection-count-item attention">🟠 ${inspection.attention_items} Need Attention</div>` : ''}
          ${!inspection.urgent_items && !inspection.attention_items ? `<div class="inspection-count-item good">✅ All items in good condition</div>` : ''}
        </div>
        
        ${categoriesHtml}
        
        ${inspection.recommendations ? `
          <div class="inspection-recommendations">
            <div class="inspection-recommendations-title">💡 Provider Recommendations</div>
            <div class="inspection-recommendations-text">${inspection.recommendations}</div>
          </div>
        ` : ''}
        
        ${inspection.technician_notes ? `
          <div class="inspection-recommendations" style="margin-top:12px;">
            <div class="inspection-recommendations-title">📝 Technician Notes</div>
            <div class="inspection-recommendations-text">${inspection.technician_notes}</div>
          </div>
        ` : ''}
      `;
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

    // ==================== HOUSEHOLD MANAGEMENT ====================
    let currentHousehold = null;
    let householdMembers = [];
    let householdVehicles = [];
    let pendingInvitations = [];
    let myMembershipId = null;
    let isHouseholdOwner = false;
    let managingMember = null;

    async function loadHouseholdSection() {
      if (!currentUser) return;
      
      try {
        const { data, error } = await getMyHouseholds(currentUser.id);
        if (error) {
          console.error('Error loading households:', error);
          return;
        }
        
        const pendingBanner = document.getElementById('household-pending-invitations-banner');
        const allMemberships = await checkPendingInvitations();
        
        if (allMemberships.length > 0) {
          pendingBanner.style.display = 'block';
          const roleLabels = { owner: 'Owner', adult: 'Adult', driver: 'Driver', viewer: 'Viewer', member: 'Member' };
          pendingBanner.innerHTML = allMemberships.map(inv => `
            <div class="card" style="background:linear-gradient(135deg, rgba(212,168,85,0.08), rgba(212,168,85,0.03));border:2px solid rgba(212,168,85,0.3);margin-bottom:12px;position:relative;">
              <div style="position:absolute;top:-8px;left:16px;background:var(--accent-gold);color:#0a0a0f;padding:2px 10px;border-radius:100px;font-size:0.7rem;font-weight:700;">📨 INVITATION</div>
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;padding-top:8px;">
                <div style="flex:1;min-width:200px;">
                  <div style="font-size:1.1rem;font-weight:600;margin-bottom:6px;">${inv.household?.name || 'Household'}</div>
                  <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
                    <span style="font-size:0.85rem;color:var(--text-secondary);">Invited by <strong>${inv.household?.owner?.full_name || 'Owner'}</strong></span>
                    <span style="padding:3px 10px;border-radius:100px;font-size:0.72rem;font-weight:600;background:var(--accent-blue-soft);color:var(--accent-blue);">${roleLabels[inv.role] || 'Member'} Role</span>
                  </div>
                </div>
                <div style="display:flex;gap:10px;">
                  <button class="btn btn-primary" onclick="acceptInvitation('${inv.id}')" style="padding:10px 20px;">✓ Accept</button>
                  <button class="btn btn-secondary" onclick="declineInvitation('${inv.id}')" style="padding:10px 20px;">✗ Decline</button>
                </div>
              </div>
            </div>
          `).join('');
        } else {
          pendingBanner.style.display = 'none';
        }
        
        const owned = data.owned || [];
        const memberOf = data.memberOf || [];
        
        if (owned.length === 0 && memberOf.length === 0) {
          document.getElementById('household-no-household').style.display = 'block';
          document.getElementById('household-dashboard').style.display = 'none';
          return;
        }
        
        currentHousehold = owned.length > 0 ? owned[0] : memberOf[0];
        isHouseholdOwner = owned.length > 0 && owned[0].id === currentHousehold.id;
        
        if (memberOf.length > 0 && !isHouseholdOwner) {
          myMembershipId = currentHousehold.membership?.id;
        }
        
        document.getElementById('household-no-household').style.display = 'none';
        document.getElementById('household-dashboard').style.display = 'block';
        
        await loadHouseholdDetails(currentHousehold.id);
        
      } catch (err) {
        console.error('Error loading household section:', err);
      }
    }

    async function checkPendingInvitations() {
      if (!currentUser) return [];
      
      const { data } = await supabaseClient
        .from('household_members')
        .select(`
          *,
          household:household_id(name, owner_id, owner:owner_id(full_name))
        `)
        .eq('email', currentUser.email)
        .eq('status', 'pending');
      
      return data || [];
    }

    async function loadHouseholdDetails(householdId) {
      const { data, error } = await getHouseholdDetails(householdId);
      if (error) {
        console.error('Error loading household details:', error);
        return;
      }
      
      currentHousehold = data;
      householdMembers = data.members || [];
      
      document.getElementById('household-name-display').textContent = data.name;
      
      const memberCount = householdMembers.filter(m => m.status === 'active').length + 1;
      document.getElementById('household-member-count-badge').textContent = `👥 ${memberCount} member${memberCount !== 1 ? 's' : ''}`;
      
      document.getElementById('household-role-display').textContent = isHouseholdOwner ? 'Owner' : 
        (householdMembers.find(m => m.user_id === currentUser.id)?.role || 'Member');
      
      if (isHouseholdOwner) {
        document.getElementById('edit-household-btn').style.display = 'inline-flex';
        document.getElementById('invite-member-btn').style.display = 'inline-flex';
        document.getElementById('share-vehicle-btn').style.display = 'inline-flex';
      } else {
        document.getElementById('edit-household-btn').style.display = 'none';
        document.getElementById('invite-member-btn').style.display = 'none';
        document.getElementById('share-vehicle-btn').style.display = 'none';
      }
      
      renderHouseholdMembers();
      renderPendingInvitations();
      await loadHouseholdVehicles(householdId);
      await loadHouseholdActivity();
    }

    function renderHouseholdMembers() {
      const grid = document.getElementById('household-members-grid');
      
      const roleColors = {
        owner: 'var(--accent-gold)',
        adult: 'var(--accent-blue)',
        driver: 'var(--accent-green)',
        viewer: 'var(--text-muted)'
      };
      
      const roleLabels = {
        owner: 'Owner',
        adult: 'Adult',
        driver: 'Driver',
        viewer: 'Viewer',
        member: 'Member'
      };
      
      let membersHtml = '';
      
      if (currentHousehold.owner) {
        const owner = currentHousehold.owner;
        const initial = (owner.full_name || owner.email || 'O').charAt(0).toUpperCase();
        const isCurrentUserOwner = currentUser && owner.id === currentUser.id;
        membersHtml += `
          <div style="background:var(--bg-elevated);border:2px solid var(--accent-gold);border-radius:var(--radius-lg);padding:20px;position:relative;">
            <div style="position:absolute;top:-8px;right:16px;background:linear-gradient(135deg, var(--accent-gold), #e8bc5a);color:#0a0a0f;padding:2px 10px;border-radius:100px;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">👑 Owner</div>
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
              <div style="width:52px;height:52px;background:linear-gradient(135deg, var(--accent-gold), #e8bc5a);border:3px solid rgba(212,168,85,0.3);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#0a0a0f;box-shadow:0 4px 12px rgba(212,168,85,0.3);">
                ${initial}
              </div>
              <div style="flex:1;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="font-weight:600;font-size:1.05rem;">${owner.full_name || 'Owner'}</span>
                  ${isCurrentUserOwner ? '<span style="padding:2px 8px;border-radius:100px;font-size:0.68rem;font-weight:500;background:var(--accent-blue-soft);color:var(--accent-blue);">You</span>' : ''}
                  <span style="padding:2px 8px;border-radius:100px;font-size:0.68rem;font-weight:500;background:var(--accent-green-soft);color:var(--accent-green);">Active</span>
                </div>
                <div style="font-size:0.85rem;color:var(--text-muted);">${owner.email || ''}</div>
              </div>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
              <span style="display:inline-block;padding:2px 8px;border-radius:100px;font-size:0.7rem;background:var(--accent-blue-soft);color:var(--accent-blue);">📝 Can Request</span>
              <span style="display:inline-block;padding:2px 8px;border-radius:100px;font-size:0.7rem;background:var(--accent-green-soft);color:var(--accent-green);">✓ Can Approve</span>
              <span style="display:inline-block;padding:2px 8px;border-radius:100px;font-size:0.7rem;background:var(--accent-gold-soft);color:var(--accent-gold);">🔓 Full Access</span>
            </div>
          </div>
        `;
      }
      
      const activeMembers = householdMembers.filter(m => m.status === 'active');
      activeMembers.forEach(member => {
        const user = member.user || {};
        const name = user.full_name || member.email || 'Member';
        const email = user.email || member.email || '';
        const initial = name.charAt(0).toUpperCase();
        const role = member.role || 'member';
        const roleColor = roleColors[role] || roleColors.viewer;
        const perms = member.permissions || {};
        
        let permsBadges = [];
        if (perms.can_request_services) permsBadges.push('<span style="display:inline-block;padding:2px 8px;border-radius:100px;font-size:0.7rem;background:var(--accent-blue-soft);color:var(--accent-blue);">📝 Can Request</span>');
        if (perms.can_approve_services) permsBadges.push('<span style="display:inline-block;padding:2px 8px;border-radius:100px;font-size:0.7rem;background:var(--accent-green-soft);color:var(--accent-green);">✓ Can Approve</span>');
        if (perms.spending_limit) permsBadges.push(`<span style="display:inline-block;padding:2px 8px;border-radius:100px;font-size:0.7rem;background:var(--accent-gold-soft);color:var(--accent-gold);">💰 $${perms.spending_limit} limit</span>`);
        
        const manageBtn = isHouseholdOwner ? `<button class="btn btn-ghost btn-sm" onclick="openManageMemberModal('${member.id}')">Manage</button>` : '';
        
        membersHtml += `
          <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:20px;">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
              <div style="width:48px;height:48px;background:linear-gradient(135deg, ${roleColor}44, ${roleColor}22);border:2px solid ${roleColor}44;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:600;color:${roleColor};">
                ${initial}
              </div>
              <div style="flex:1;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="font-weight:600;">${name}</span>
                  <span style="padding:2px 8px;border-radius:100px;font-size:0.68rem;font-weight:500;background:var(--accent-green-soft);color:var(--accent-green);">Active</span>
                </div>
                <div style="font-size:0.85rem;color:var(--text-muted);">${email}</div>
              </div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:${permsBadges.length > 0 ? '12px' : '0'};">
              <span style="padding:4px 10px;border-radius:100px;font-size:0.75rem;font-weight:600;background:${roleColor}22;color:${roleColor};">
                ${roleLabels[role] || role}
              </span>
              ${manageBtn}
            </div>
            ${permsBadges.length > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:6px;">${permsBadges.join('')}</div>` : ''}
          </div>
        `;
      });
      
      grid.innerHTML = membersHtml || '<div class="empty-state" style="grid-column:1/-1;padding:32px;"><div class="empty-state-icon">👥</div><p>No members yet.</p></div>';
    }

    function renderPendingInvitations() {
      const pendingSection = document.getElementById('household-pending-section');
      const pendingList = document.getElementById('household-pending-list');
      
      const pending = householdMembers.filter(m => m.status === 'pending');
      
      if (!isHouseholdOwner || pending.length === 0) {
        pendingSection.style.display = 'none';
        return;
      }
      
      const roleLabels = { owner: 'Owner', adult: 'Adult', driver: 'Driver', viewer: 'Viewer', member: 'Member' };
      const roleColors = { owner: 'var(--accent-gold)', adult: 'var(--accent-blue)', driver: 'var(--accent-green)', viewer: 'var(--text-muted)', member: 'var(--text-secondary)' };
      
      pendingSection.style.display = 'block';
      pendingList.innerHTML = pending.map(inv => {
        const role = inv.role || 'member';
        const roleColor = roleColors[role] || roleColors.member;
        return `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:16px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:var(--radius-md);margin-bottom:10px;">
            <div style="display:flex;align-items:center;gap:12px;flex:1;">
              <div style="width:40px;height:40px;background:var(--accent-orange-soft);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;color:var(--accent-orange);">📧</div>
              <div style="flex:1;">
                <div style="font-weight:500;margin-bottom:4px;">${inv.email}</div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
                  <span style="padding:2px 8px;border-radius:100px;font-size:0.7rem;font-weight:600;background:var(--accent-orange-soft);color:var(--accent-orange);">⏳ Pending</span>
                  <span style="padding:2px 8px;border-radius:100px;font-size:0.7rem;font-weight:500;background:${roleColor}22;color:${roleColor};">${roleLabels[role] || 'Member'}</span>
                </div>
              </div>
            </div>
            <button class="btn btn-danger btn-sm" onclick="cancelInvitation('${inv.id}')" title="Cancel invitation">✕ Cancel</button>
          </div>
        `;
      }).join('');
    }

    async function loadHouseholdVehicles(householdId) {
      const { data, error } = await getHouseholdVehicles(householdId);
      if (error) {
        console.error('Error loading household vehicles:', error);
        return;
      }
      
      householdVehicles = data || [];
      
      const vehicleCountBadge = document.getElementById('household-vehicle-count-badge');
      if (vehicleCountBadge) {
        vehicleCountBadge.textContent = `🚗 ${householdVehicles.length} vehicle${householdVehicles.length !== 1 ? 's' : ''}`;
      }
      
      renderHouseholdVehicles();
    }

    function renderHouseholdVehicles() {
      const grid = document.getElementById('household-vehicles-grid');
      
      if (householdVehicles.length === 0) {
        grid.innerHTML = `
          <div class="empty-state" style="grid-column:1/-1;padding:32px;">
            <div class="empty-state-icon">🚗</div>
            <p>No vehicles shared yet.</p>
            ${isHouseholdOwner ? '<button class="btn btn-secondary" onclick="openShareVehicleModal()" style="margin-top:12px;">+ Share a Vehicle</button>' : ''}
          </div>
        `;
        return;
      }
      
      const accessColors = {
        full: 'var(--accent-green)',
        request: 'var(--accent-orange)',
        view: 'var(--text-muted)'
      };
      
      const accessLabels = {
        full: 'Full Access',
        request: 'Request Only',
        view: 'View Only'
      };
      
      grid.innerHTML = householdVehicles.map(hv => {
        const v = hv.vehicle || {};
        const vehicleName = `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim() || 'Unknown Vehicle';
        const sharedBy = hv.shared_by_user?.full_name || 'Owner';
        const accessLevel = hv.access_level || 'view';
        const accessColor = accessColors[accessLevel] || accessColors.view;
        
        const canManage = isHouseholdOwner || hv.shared_by === currentUser.id;
        const canRequestService = !isHouseholdOwner && (accessLevel === 'full' || accessLevel === 'request');
        const isViewOnly = accessLevel === 'view' && !isHouseholdOwner;
        
        let actionButtons = '';
        if (canManage) {
          actionButtons = `<button class="btn btn-ghost btn-sm" onclick="removeSharedVehicle('${hv.id}')">Remove</button>`;
        } else if (canRequestService) {
          actionButtons = `<button class="btn btn-primary btn-sm" onclick="requestServiceForHouseholdVehicle('${v.id}', '${vehicleName}')">Request Service</button>`;
        } else if (isViewOnly) {
          actionButtons = `<span style="font-size:0.8rem;color:var(--text-muted);font-style:italic;">👁️ View Only</span>`;
        }
        
        return `
          <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);overflow:hidden;transition:all 0.2s;" class="household-vehicle-card">
            <div style="height:140px;background:linear-gradient(135deg, rgba(74,124,255,0.1), rgba(212,168,85,0.1));display:flex;align-items:center;justify-content:center;font-size:56px;position:relative;">
              🚗
              <span style="position:absolute;top:12px;right:12px;padding:4px 10px;border-radius:100px;font-size:0.72rem;font-weight:600;background:${accessColor}22;color:${accessColor};">
                ${accessLabels[accessLevel]}
              </span>
            </div>
            <div style="padding:16px;">
              <div style="font-weight:600;font-size:1.05rem;margin-bottom:4px;">${vehicleName}</div>
              <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:12px;">Shared by ${sharedBy}</div>
              <div style="display:flex;justify-content:flex-end;align-items:center;padding-top:12px;border-top:1px solid var(--border-subtle);">
                ${actionButtons}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    async function createNewHousehold() {
      const name = document.getElementById('create-household-name').value.trim();
      if (!name) {
        showToast('Please enter a household name', 'error');
        return;
      }
      
      const { data, error } = await createHousehold(name, currentUser.id);
      if (error) {
        showToast('Failed to create household: ' + error.message, 'error');
        return;
      }
      
      showToast('Household created successfully!', 'success');
      document.getElementById('create-household-name').value = '';
      isHouseholdOwner = true;
      await loadHouseholdSection();
    }

    function openInviteMemberModal() {
      document.getElementById('invite-email').value = '';
      document.getElementById('invite-role').value = 'adult';
      document.getElementById('perm-request-services').checked = true;
      document.getElementById('perm-approve-services').checked = false;
      document.getElementById('invite-spending-limit').value = '';
      updateInvitePermissions();
      openModal('invite-member-modal');
    }

    function updateInvitePermissions() {
      const role = document.getElementById('invite-role').value;
      const approveContainer = document.getElementById('perm-approve-container');
      const requestCheckbox = document.getElementById('perm-request-services');
      const approveCheckbox = document.getElementById('perm-approve-services');
      
      if (role === 'viewer') {
        requestCheckbox.checked = false;
        requestCheckbox.disabled = true;
        approveCheckbox.checked = false;
        approveContainer.style.display = 'none';
      } else if (role === 'driver') {
        requestCheckbox.checked = true;
        requestCheckbox.disabled = false;
        approveCheckbox.checked = false;
        approveContainer.style.display = 'none';
      } else {
        requestCheckbox.checked = true;
        requestCheckbox.disabled = false;
        approveContainer.style.display = 'flex';
      }
    }

    async function sendHouseholdInvitation() {
      const email = document.getElementById('invite-email').value.trim();
      const role = document.getElementById('invite-role').value;
      
      if (!email) {
        showToast('Please enter an email address', 'error');
        return;
      }
      
      if (!email.includes('@')) {
        showToast('Please enter a valid email address', 'error');
        return;
      }
      
      const permissions = {
        can_request_services: document.getElementById('perm-request-services').checked,
        can_approve_services: document.getElementById('perm-approve-services').checked,
        spending_limit: document.getElementById('invite-spending-limit').value ? 
          parseFloat(document.getElementById('invite-spending-limit').value) : null
      };
      
      const { data, error } = await inviteHouseholdMember(currentHousehold.id, email, role, currentUser.id);
      
      if (error) {
        showToast('Failed to send invitation: ' + error.message, 'error');
        return;
      }
      
      if (data && permissions) {
        await updateHouseholdMemberPermissions(data.id, permissions);
      }
      
      showToast('Invitation sent successfully!', 'success');
      closeModal('invite-member-modal');
      await loadHouseholdDetails(currentHousehold.id);
    }

    async function cancelInvitation(membershipId) {
      if (!confirm('Cancel this invitation?')) return;
      
      const { error } = await removeHouseholdMember(membershipId);
      if (error) {
        showToast('Failed to cancel invitation', 'error');
        return;
      }
      
      showToast('Invitation cancelled', 'success');
      await loadHouseholdDetails(currentHousehold.id);
    }

    async function acceptInvitation(membershipId) {
      const { data, error } = await acceptHouseholdInvitation(membershipId);
      if (error) {
        showToast('Failed to accept invitation: ' + error.message, 'error');
        return;
      }
      
      showToast('You have joined the household!', 'success');
      await loadHouseholdSection();
    }

    async function declineInvitation(membershipId) {
      if (!confirm('Decline this invitation?')) return;
      
      const { error } = await removeHouseholdMember(membershipId);
      if (error) {
        showToast('Failed to decline invitation', 'error');
        return;
      }
      
      showToast('Invitation declined', 'success');
      await loadHouseholdSection();
    }

    function openShareVehicleModal() {
      const select = document.getElementById('share-vehicle-select');
      
      const sharedVehicleIds = householdVehicles.map(hv => hv.vehicle_id);
      const availableVehicles = vehicles.filter(v => !sharedVehicleIds.includes(v.id));
      
      if (availableVehicles.length === 0) {
        showToast('All your vehicles are already shared with this household', 'error');
        return;
      }
      
      select.innerHTML = '<option value="">Choose a vehicle...</option>' + 
        availableVehicles.map(v => `<option value="${v.id}">${v.nickname || `${v.year || ''} ${v.make} ${v.model}`.trim()}</option>`).join('');
      
      document.querySelectorAll('input[name="access-level"]').forEach(r => r.checked = false);
      document.querySelectorAll('.access-level-option').forEach(opt => {
        opt.style.borderColor = 'var(--border-subtle)';
      });
      
      openModal('share-vehicle-modal');
    }

    function selectAccessLevel(level) {
      document.querySelectorAll('.access-level-option').forEach(opt => {
        opt.style.borderColor = 'var(--border-subtle)';
      });
      const selected = document.querySelector(`input[name="access-level"][value="${level}"]`);
      if (selected) {
        selected.checked = true;
        selected.closest('.access-level-option').style.borderColor = 'var(--accent-gold)';
      }
    }

    async function shareVehicle() {
      const vehicleId = document.getElementById('share-vehicle-select').value;
      const accessLevel = document.querySelector('input[name="access-level"]:checked')?.value;
      
      if (!vehicleId) {
        showToast('Please select a vehicle', 'error');
        return;
      }
      
      if (!accessLevel) {
        showToast('Please select an access level', 'error');
        return;
      }
      
      const { data, error } = await shareVehicleWithHousehold(currentHousehold.id, vehicleId, accessLevel, currentUser.id);
      
      if (error) {
        showToast('Failed to share vehicle: ' + error.message, 'error');
        return;
      }
      
      showToast('Vehicle shared successfully!', 'success');
      closeModal('share-vehicle-modal');
      await loadHouseholdVehicles(currentHousehold.id);
    }

    async function removeSharedVehicle(accessId) {
      if (!confirm('Remove this vehicle from household sharing?')) return;
      
      const { error } = await removeVehicleFromHousehold(accessId);
      if (error) {
        showToast('Failed to remove vehicle', 'error');
        return;
      }
      
      showToast('Vehicle removed from household', 'success');
      await loadHouseholdVehicles(currentHousehold.id);
    }

    function requestServiceForHouseholdVehicle(vehicleId, vehicleName) {
      showSection('packages');
      setTimeout(() => {
        openNewPackageModal();
        const vehicleSelect = document.getElementById('p-vehicle');
        if (vehicleSelect) {
          for (let i = 0; i < vehicleSelect.options.length; i++) {
            if (vehicleSelect.options[i].value === vehicleId) {
              vehicleSelect.selectedIndex = i;
              break;
            }
          }
        }
        showToast(`Creating service request for ${vehicleName}`, 'success');
      }, 200);
    }

    function openManageMemberModal(membershipId) {
      managingMember = householdMembers.find(m => m.id === membershipId);
      if (!managingMember) return;
      
      const user = managingMember.user || {};
      const name = user.full_name || managingMember.email || 'Member';
      const perms = managingMember.permissions || {};
      
      document.getElementById('manage-member-content').innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
          <div style="width:48px;height:48px;background:var(--accent-blue-soft);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:600;color:var(--accent-blue);">
            ${name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style="font-weight:600;">${name}</div>
            <div style="font-size:0.85rem;color:var(--text-muted);">${user.email || managingMember.email || ''}</div>
          </div>
        </div>
        
        <div class="form-group">
          <label class="form-label">Role</label>
          <select class="form-select" id="manage-role">
            <option value="adult" ${managingMember.role === 'adult' ? 'selected' : ''}>Adult</option>
            <option value="driver" ${managingMember.role === 'driver' ? 'selected' : ''}>Driver</option>
            <option value="viewer" ${managingMember.role === 'viewer' ? 'selected' : ''}>Viewer</option>
          </select>
        </div>
        
        <div class="form-section">
          <div class="form-section-title">Permissions</div>
          <div style="display:grid;gap:12px;">
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="checkbox" id="manage-perm-request" ${perms.can_request_services ? 'checked' : ''}>
              <span>Can request services</span>
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="checkbox" id="manage-perm-approve" ${perms.can_approve_services ? 'checked' : ''}>
              <span>Can approve services</span>
            </label>
          </div>
          
          <div class="form-group" style="margin-top:16px;">
            <label class="form-label">Spending Limit</label>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="color:var(--text-muted);">$</span>
              <input type="number" class="form-input" id="manage-spending-limit" placeholder="No limit" value="${perms.spending_limit || ''}" style="max-width:150px;">
              <span style="color:var(--text-muted);font-size:0.85rem;">per service</span>
            </div>
          </div>
        </div>
      `;
      
      openModal('manage-member-modal');
    }

    async function saveMemberPermissions() {
      if (!managingMember) return;
      
      const role = document.getElementById('manage-role').value;
      const permissions = {
        can_request_services: document.getElementById('manage-perm-request').checked,
        can_approve_services: document.getElementById('manage-perm-approve').checked,
        spending_limit: document.getElementById('manage-spending-limit').value ? 
          parseFloat(document.getElementById('manage-spending-limit').value) : null
      };
      
      await supabaseClient
        .from('household_members')
        .update({ role: role })
        .eq('id', managingMember.id);
      
      await updateHouseholdMemberPermissions(managingMember.id, permissions);
      
      showToast('Member permissions updated', 'success');
      closeModal('manage-member-modal');
      managingMember = null;
      await loadHouseholdDetails(currentHousehold.id);
    }

    async function removeMemberFromHousehold() {
      if (!managingMember) return;
      
      const name = managingMember.user?.full_name || managingMember.email || 'this member';
      if (!confirm(`Remove ${name} from the household?`)) return;
      
      const { error } = await removeHouseholdMember(managingMember.id);
      if (error) {
        showToast('Failed to remove member', 'error');
        return;
      }
      
      showToast('Member removed from household', 'success');
      closeModal('manage-member-modal');
      managingMember = null;
      await loadHouseholdDetails(currentHousehold.id);
    }

    async function editHouseholdName() {
      const newName = prompt('Enter new household name:', currentHousehold.name);
      if (!newName || newName.trim() === currentHousehold.name) return;
      
      const { error } = await supabaseClient
        .from('households')
        .update({ name: newName.trim() })
        .eq('id', currentHousehold.id);
      
      if (error) {
        showToast('Failed to update household name', 'error');
        return;
      }
      
      showToast('Household name updated', 'success');
      await loadHouseholdDetails(currentHousehold.id);
    }

    async function loadHouseholdActivity() {
      if (!currentHousehold) return;
      
      const activityList = document.getElementById('household-activity-list');
      if (!activityList) return;
      
      try {
        const memberUserIds = householdMembers
          .filter(m => m.status === 'active' && m.user_id)
          .map(m => m.user_id);
        
        if (isHouseholdOwner && currentUser) {
          memberUserIds.push(currentUser.id);
        }
        
        const sharedVehicleIds = householdVehicles.map(hv => hv.vehicle_id);
        
        if (memberUserIds.length === 0 && sharedVehicleIds.length === 0) {
          activityList.innerHTML = `
            <div class="empty-state" style="padding:24px;">
              <div class="empty-state-icon">📊</div>
              <p>No recent activity.</p>
              <p style="font-size:0.85rem;color:var(--text-muted);margin-top:8px;">Service requests from household members will appear here.</p>
            </div>
          `;
          return;
        }
        
        let query = supabaseClient
          .from('maintenance_packages')
          .select(`
            id, title, status, created_at,
            member:member_id(id, full_name, email),
            vehicle:vehicle_id(year, make, model)
          `)
          .order('created_at', { ascending: false })
          .limit(10);
        
        if (sharedVehicleIds.length > 0) {
          query = query.in('vehicle_id', sharedVehicleIds);
        } else if (memberUserIds.length > 0) {
          query = query.in('member_id', memberUserIds);
        }
        
        const { data: activity, error } = await query;
        
        if (error || !activity || activity.length === 0) {
          activityList.innerHTML = `
            <div class="empty-state" style="padding:24px;">
              <div class="empty-state-icon">📊</div>
              <p>No recent activity.</p>
              <p style="font-size:0.85rem;color:var(--text-muted);margin-top:8px;">Service requests from household members will appear here.</p>
            </div>
          `;
          return;
        }
        
        const statusColors = {
          open: { bg: 'var(--accent-green-soft)', color: 'var(--accent-green)', label: 'Open' },
          pending: { bg: 'var(--accent-orange-soft)', color: 'var(--accent-orange)', label: 'Pending' },
          accepted: { bg: 'var(--accent-blue-soft)', color: 'var(--accent-blue)', label: 'Accepted' },
          in_progress: { bg: 'var(--accent-blue-soft)', color: 'var(--accent-blue)', label: 'In Progress' },
          completed: { bg: 'var(--bg-elevated)', color: 'var(--text-muted)', label: 'Completed' },
          cancelled: { bg: 'rgba(239,95,95,0.15)', color: 'var(--accent-red)', label: 'Cancelled' }
        };
        
        activityList.innerHTML = activity.map(item => {
          const memberName = item.member?.full_name || item.member?.email || 'Unknown';
          const vehicleName = item.vehicle ? `${item.vehicle.year || ''} ${item.vehicle.make || ''} ${item.vehicle.model || ''}`.trim() : 'Unknown Vehicle';
          const status = statusColors[item.status] || statusColors.pending;
          const initial = memberName.charAt(0).toUpperCase();
          const date = new Date(item.created_at);
          const timeAgo = getTimeAgo(date);
          const isCurrentUser = currentUser && item.member?.id === currentUser.id;
          
          return `
            <div style="display:flex;gap:16px;padding:16px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:var(--radius-md);margin-bottom:12px;transition:all 0.2s;" onmouseover="this.style.borderColor='var(--accent-gold)'" onmouseout="this.style.borderColor='var(--border-subtle)'">
              <div style="width:44px;height:44px;background:linear-gradient(135deg, var(--accent-gold-soft), var(--accent-blue-soft));border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:600;color:var(--accent-gold);flex-shrink:0;">
                ${initial}
              </div>
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:6px;">
                  <div style="flex:1;min-width:0;">
                    <span style="font-weight:600;color:var(--text-primary);">${isCurrentUser ? 'You' : memberName}</span>
                    <span style="color:var(--text-muted);font-size:0.9rem;"> requested service</span>
                  </div>
                  <span style="padding:3px 10px;border-radius:100px;font-size:0.72rem;font-weight:600;background:${status.bg};color:${status.color};white-space:nowrap;">${status.label}</span>
                </div>
                <div style="font-size:0.92rem;color:var(--text-secondary);margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                  <span style="color:var(--accent-gold);">📦</span> ${item.title}
                </div>
                <div style="display:flex;align-items:center;gap:12px;font-size:0.82rem;color:var(--text-muted);">
                  <span>🚗 ${vehicleName}</span>
                  <span>•</span>
                  <span>${timeAgo}</span>
                </div>
              </div>
            </div>
          `;
        }).join('');
        
      } catch (err) {
        console.error('Error loading household activity:', err);
        activityList.innerHTML = `
          <div class="empty-state" style="padding:24px;">
            <div class="empty-state-icon">⚠️</div>
            <p>Could not load activity.</p>
          </div>
        `;
      }
    }

    function getTimeAgo(date) {
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);
      
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    }

    async function refreshHouseholdActivity() {
      await loadHouseholdActivity();
      showToast('Activity refreshed', 'success');
    }

    // ========== FLEET MANAGEMENT ==========
    
    async function loadFleetSection() {
      if (!currentUser) return;
      
      const { owned, memberOf } = await getMyFleets(currentUser.id);
      const allFleets = [...(owned || []), ...(memberOf || [])];
      
      if (allFleets.length === 0) {
        document.getElementById('fleet-no-fleet').style.display = 'block';
        document.getElementById('fleet-dashboard').style.display = 'none';
        return;
      }
      
      currentFleet = owned && owned.length > 0 ? owned[0] : (memberOf && memberOf.length > 0 ? memberOf[0] : null);
      
      if (currentFleet) {
        document.getElementById('fleet-no-fleet').style.display = 'none';
        document.getElementById('fleet-dashboard').style.display = 'block';
        await loadFleetDetails(currentFleet.id);
      } else {
        document.getElementById('fleet-no-fleet').style.display = 'block';
        document.getElementById('fleet-dashboard').style.display = 'none';
      }
    }
    
    let currentFleetVehicleFilter = 'all';
    let fleetPendingApprovals = [];
    
    async function loadFleetDetails(fleetId) {
      const { data, error } = await getFleetDetails(fleetId);
      if (error || !data) {
        console.error('Error loading fleet details:', error);
        return;
      }
      
      currentFleet = data;
      fleetMembers = data.members || [];
      fleetVehicles = data.vehicles || [];
      
      document.getElementById('fleet-name-display').textContent = data.name || data.company_name || 'Unnamed Fleet';
      document.getElementById('fleet-business-type-badge').textContent = formatBusinessType(data.business_type);
      document.getElementById('fleet-member-count-badge').textContent = `${fleetMembers.length} Member${fleetMembers.length !== 1 ? 's' : ''}`;
      document.getElementById('fleet-vehicle-count-badge').textContent = `${fleetVehicles.length} Vehicle${fleetVehicles.length !== 1 ? 's' : ''}`;
      
      const fleetCountBadge = document.getElementById('fleet-count');
      if (fleetCountBadge) {
        fleetCountBadge.textContent = fleetVehicles.length;
        fleetCountBadge.style.display = fleetVehicles.length > 0 ? 'inline-flex' : 'none';
      }
      
      if (data.billing_email || data.address || data.tax_id) {
        document.getElementById('fleet-company-info').style.display = 'block';
        document.getElementById('fleet-billing-email-display').innerHTML = data.billing_email ? `📧 ${data.billing_email}` : '';
        document.getElementById('fleet-address-display').innerHTML = data.address ? `📍 ${data.address}` : '';
        const taxIdEl = document.getElementById('fleet-tax-id-display');
        if (taxIdEl) taxIdEl.innerHTML = data.tax_id ? `🏛️ Tax ID: ${data.tax_id}` : '';
      } else {
        document.getElementById('fleet-company-info').style.display = 'none';
      }
      
      updateFleetStats();
      renderFleetMembers();
      renderFleetVehicles();
      await loadBulkBatches();
      await loadFleetApprovals();
    }
    
    function updateFleetStats() {
      const activeServices = fleetVehicles.filter(fv => fv.vehicle?.health_status === 'in_service').length;
      const pendingCount = fleetPendingApprovals.length;
      
      document.getElementById('fleet-stat-active-services').textContent = activeServices;
      document.getElementById('fleet-stat-pending-approvals').textContent = pendingCount;
      document.getElementById('fleet-stat-total-vehicles').textContent = fleetVehicles.length;
      document.getElementById('fleet-stat-team-size').textContent = fleetMembers.length;
    }
    
    async function loadFleetApprovals() {
      if (!currentFleet || !currentUser) return;
      
      const isOwnerOrManager = currentFleet.owner_id === currentUser.id || 
        fleetMembers.some(m => m.user_id === currentUser.id && (m.role === 'owner' || m.role === 'manager'));
      
      const approvalSection = document.getElementById('fleet-approval-queue-section');
      if (!approvalSection) return;
      
      if (!isOwnerOrManager) {
        approvalSection.style.display = 'none';
        return;
      }
      
      const { data: approvals, error } = await supabaseClient
        .from('maintenance_packages')
        .select('*, vehicles(*), profiles:member_id(*)')
        .eq('fleet_id', currentFleet.id)
        .eq('status', 'pending_approval')
        .order('created_at', { ascending: false });
      
      fleetPendingApprovals = approvals || [];
      updateFleetStats();
      
      if (fleetPendingApprovals.length === 0) {
        approvalSection.style.display = 'none';
        return;
      }
      
      approvalSection.style.display = 'block';
      renderFleetApprovals();
    }
    
    function renderFleetApprovals() {
      const container = document.getElementById('fleet-approval-queue-list');
      if (!container) return;
      
      if (fleetPendingApprovals.length === 0) {
        container.innerHTML = `
          <div class="empty-state" style="padding:24px;">
            <div class="empty-state-icon">✅</div>
            <p>No pending approvals.</p>
          </div>
        `;
        return;
      }
      
      container.innerHTML = fleetPendingApprovals.map(pkg => {
        const v = pkg.vehicles || {};
        const requester = pkg.profiles || {};
        const vehicleName = `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim();
        const requesterName = requester.full_name || requester.email || 'Unknown';
        
        return `
          <div class="batch-card" style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;">
              <div>
                <div style="font-weight:600;font-size:1rem;margin-bottom:4px;">${pkg.title || 'Service Request'}</div>
                <div style="font-size:0.88rem;color:var(--text-secondary);margin-bottom:8px;">${vehicleName}</div>
                <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:0.85rem;color:var(--text-muted);">
                  <span>👤 ${requesterName}</span>
                  ${pkg.estimated_cost ? `<span>💰 ~$${Number(pkg.estimated_cost).toLocaleString()}</span>` : ''}
                  <span>📅 ${new Date(pkg.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <div style="display:flex;gap:8px;">
                <button class="btn btn-success btn-sm" onclick="approveFleetServiceRequest('${pkg.id}')">✓ Approve</button>
                <button class="btn btn-danger btn-sm" onclick="rejectFleetServiceRequest('${pkg.id}')">✕ Reject</button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
    
    async function approveFleetServiceRequest(packageId) {
      const { error } = await supabaseClient
        .from('maintenance_packages')
        .update({ status: 'open', approved_at: new Date().toISOString(), approved_by: currentUser.id })
        .eq('id', packageId);
      
      if (error) {
        showToast('Failed to approve request', 'error');
        return;
      }
      
      showToast('Service request approved!', 'success');
      await loadFleetApprovals();
    }
    
    async function rejectFleetServiceRequest(packageId) {
      if (!confirm('Reject this service request?')) return;
      
      const { error } = await supabaseClient
        .from('maintenance_packages')
        .update({ status: 'rejected', rejected_at: new Date().toISOString(), rejected_by: currentUser.id })
        .eq('id', packageId);
      
      if (error) {
        showToast('Failed to reject request', 'error');
        return;
      }
      
      showToast('Service request rejected', 'success');
      await loadFleetApprovals();
    }
    
    async function refreshFleetApprovals() {
      await loadFleetApprovals();
      showToast('Approval queue refreshed', 'success');
    }
    
    function filterFleetVehicles(filter) {
      currentFleetVehicleFilter = filter;
      
      document.querySelectorAll('#fleet-vehicle-tabs .tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.fleetFilter === filter) tab.classList.add('active');
      });
      
      renderFleetVehicles();
    }
    
    function formatBusinessType(type) {
      const types = {
        rental: 'Rental',
        corporate: 'Corporate',
        delivery: 'Delivery',
        rideshare: 'Rideshare',
        logistics: 'Logistics',
        small_business: 'Small Business',
        government: 'Government',
        nonprofit: 'Non-Profit',
        other: 'Other'
      };
      return types[type] || type || 'Business';
    }
    
    function renderFleetMembers() {
      const tbody = document.getElementById('fleet-members-tbody');
      if (!tbody) return;
      
      if (fleetMembers.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted);">
              <div style="font-size:32px;margin-bottom:8px;">👥</div>
              No fleet members yet. Add your first employee.
            </td>
          </tr>
        `;
        return;
      }
      
      tbody.innerHTML = fleetMembers.map(member => {
        const profile = member.user || {};
        const name = profile.full_name || member.email || 'Unknown';
        const email = profile.email || member.email || '-';
        const role = member.role || 'driver';
        const status = member.status || 'active';
        
        return `
          <tr>
            <td>
              <div style="display:flex;align-items:center;gap:12px;">
                <div style="width:36px;height:36px;background:var(--accent-gold-soft);border-radius:50%;display:flex;align-items:center;justify-content:center;">
                  ${name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style="font-weight:500;">${name}</div>
                  <div style="font-size:0.82rem;color:var(--text-muted);">${email}</div>
                </div>
              </div>
            </td>
            <td><span class="fleet-role-badge ${role}">${role}</span></td>
            <td>${member.employee_id || '-'}</td>
            <td>${member.department || '-'}</td>
            <td>${member.spending_limit ? '$' + Number(member.spending_limit).toLocaleString() : 'No limit'}</td>
            <td>
              ${member.requires_approval 
                ? '<span class="approval-indicator">⚠️ Required</span>' 
                : '<span class="approval-indicator no-approval">✓ Auto</span>'}
            </td>
            <td><span class="fleet-status-badge ${status}">${status}</span></td>
            <td>
              <div style="display:flex;gap:6px;">
                <button class="btn btn-ghost btn-sm" onclick="openEditFleetEmployee('${member.id}')" title="Edit">✏️</button>
                ${status === 'active' 
                  ? `<button class="btn btn-ghost btn-sm" onclick="suspendFleetMember('${member.id}', '${name.replace(/'/g, "\\'")}')" title="Suspend" style="color:var(--accent-orange);">⏸️</button>`
                  : `<button class="btn btn-ghost btn-sm" onclick="activateFleetMember('${member.id}', '${name.replace(/'/g, "\\'")}')" title="Activate" style="color:var(--accent-green);">▶️</button>`
                }
                <button class="btn btn-ghost btn-sm" onclick="confirmRemoveFleetEmployee('${member.id}', '${name.replace(/'/g, "\\'")}')" title="Remove" style="color:var(--accent-red);">🗑️</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
    
    function renderFleetVehicles() {
      const grid = document.getElementById('fleet-vehicles-grid');
      if (!grid) return;
      
      let filteredVehicles = fleetVehicles;
      
      if (currentFleetVehicleFilter === 'assigned') {
        filteredVehicles = fleetVehicles.filter(fv => fv.assigned_driver_id && fv.assignment_type !== 'pool');
      } else if (currentFleetVehicleFilter === 'pool') {
        filteredVehicles = fleetVehicles.filter(fv => fv.assignment_type === 'pool' || !fv.assigned_driver_id);
      } else if (currentFleetVehicleFilter === 'needs_service') {
        filteredVehicles = fleetVehicles.filter(fv => {
          const v = fv.vehicle || {};
          return v.health_status === 'needs_attention' || v.health_status === 'poor' || v.health_status === 'fair';
        });
      }
      
      if (fleetVehicles.length === 0) {
        grid.innerHTML = `
          <div class="empty-state" style="grid-column:1/-1;padding:32px;">
            <div class="empty-state-icon">🚗</div>
            <p>No vehicles in fleet yet.</p>
            <button class="btn btn-primary btn-sm" onclick="openAddFleetVehicleModal()" style="margin-top:12px;">+ Add First Vehicle</button>
          </div>
        `;
        return;
      }
      
      if (filteredVehicles.length === 0) {
        grid.innerHTML = `
          <div class="empty-state" style="grid-column:1/-1;padding:24px;">
            <div class="empty-state-icon">🔍</div>
            <p>No vehicles match this filter.</p>
          </div>
        `;
        return;
      }
      
      grid.innerHTML = filteredVehicles.map(fv => {
        const v = fv.vehicle || {};
        const driver = fv.assigned_driver;
        const driverName = driver?.full_name || 'Pool Vehicle';
        const assignment = fv.assignment_type || 'pool';
        const healthStatus = v.health_status || 'good';
        const needsService = healthStatus === 'needs_attention' || healthStatus === 'poor' || healthStatus === 'fair';
        
        return `
          <div class="fleet-vehicle-card">
            <div class="fleet-vehicle-photo">
              ${v.photo_url 
                ? `<img src="${v.photo_url}" alt="${v.make} ${v.model}">` 
                : '🚗'}
              <span class="fleet-assignment-badge ${assignment}" style="position:absolute;top:8px;right:8px;">${assignment}</span>
              ${needsService ? `<span class="fleet-assignment-badge" style="position:absolute;top:8px;left:8px;background:rgba(239,95,95,0.9);color:#fff;">⚠️ Needs Service</span>` : ''}
            </div>
            <div class="fleet-vehicle-body">
              <div class="fleet-vehicle-title">${v.year || ''} ${v.make || ''} ${v.model || ''}</div>
              <div class="fleet-vehicle-driver">👤 ${driverName}</div>
              <div class="fleet-vehicle-meta">
                ${fv.department ? `<span style="font-size:0.78rem;color:var(--text-muted);">📁 ${fv.department}</span>` : ''}
                <span class="fleet-status-badge ${healthStatus === 'excellent' || healthStatus === 'good' ? 'active' : healthStatus === 'fair' ? 'pending' : 'inactive'}" style="font-size:0.7rem;">${healthStatus}</span>
              </div>
              <div style="display:flex;gap:8px;">
                <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="openEditFleetVehicle('${fv.id}')">✏️ Edit</button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
    
    async function loadBulkBatches() {
      if (!currentFleet) return;
      
      const { data, error } = await getFleetBulkBatches(currentFleet.id);
      if (error) {
        console.error('Error loading bulk batches:', error);
        return;
      }
      
      bulkBatches = data || [];
      renderBulkBatches();
    }
    
    function renderBulkBatches() {
      const container = document.getElementById('bulk-batches-list');
      if (!container) return;
      
      if (bulkBatches.length === 0) {
        container.innerHTML = `
          <div class="empty-state" style="padding:32px;">
            <div class="empty-state-icon">📅</div>
            <p>No bulk service batches yet.</p>
            <p style="font-size:0.85rem;color:var(--text-muted);margin-top:8px;">Schedule maintenance for multiple vehicles at once.</p>
          </div>
        `;
        return;
      }
      
      container.innerHTML = bulkBatches.map(batch => {
        const statusClass = (batch.status || 'draft').replace(/ /g, '_');
        const vehicleCount = batch.vehicles?.length || 0;
        
        return `
          <div class="batch-card">
            <div class="batch-header">
              <div>
                <div class="batch-title">${batch.name || 'Untitled Batch'}</div>
                <div style="font-size:0.85rem;color:var(--text-muted);">${batch.service_type || 'Maintenance'}</div>
              </div>
              <span class="batch-status-badge ${statusClass}">${formatBatchStatus(batch.status)}</span>
            </div>
            <div class="batch-meta">
              <span>🚗 ${vehicleCount} vehicle${vehicleCount !== 1 ? 's' : ''}</span>
              <span>📅 ${formatDateRange(batch.start_date, batch.end_date)}</span>
              ${batch.total_estimated_cost ? `<span>💰 ~$${Number(batch.total_estimated_cost).toLocaleString()}</span>` : ''}
            </div>
            <div class="batch-actions">
              ${batch.status === 'draft' ? `<button class="btn btn-secondary btn-sm" onclick="editBulkBatch('${batch.id}')">Edit</button>` : ''}
              ${batch.status === 'draft' ? `<button class="btn btn-primary btn-sm" onclick="submitBulkBatch('${batch.id}')">Submit for Approval</button>` : ''}
              ${batch.status === 'pending_approval' && currentFleet.owner_id === currentUser?.id ? `<button class="btn btn-success btn-sm" onclick="approveBulkBatch('${batch.id}')">Approve</button>` : ''}
            </div>
          </div>
        `;
      }).join('');
    }
    
    function formatBatchStatus(status) {
      const statuses = {
        draft: 'Draft',
        pending_approval: 'Pending Approval',
        approved: 'Approved',
        in_progress: 'In Progress',
        completed: 'Completed'
      };
      return statuses[status] || status || 'Draft';
    }
    
    function formatDateRange(start, end) {
      if (!start) return 'No dates set';
      const s = new Date(start).toLocaleDateString();
      const e = end ? new Date(end).toLocaleDateString() : '';
      return e ? `${s} - ${e}` : s;
    }
    
    async function createNewFleet() {
      const name = document.getElementById('create-fleet-name').value.trim();
      const businessType = document.getElementById('create-fleet-business-type').value;
      const billingEmail = document.getElementById('create-fleet-billing-email').value.trim();
      const billingAddress = document.getElementById('create-fleet-billing-address')?.value.trim() || '';
      const taxId = document.getElementById('create-fleet-tax-id')?.value.trim() || '';
      
      if (!name) {
        showToast('Please enter a fleet name', 'error');
        return;
      }
      
      const { data, error } = await createFleet({
        name,
        business_type: businessType || 'other',
        billing_email: billingEmail || null,
        address: billingAddress || null,
        tax_id: taxId || null,
        owner_id: currentUser.id
      });
      
      if (error) {
        showToast('Failed to create fleet: ' + error.message, 'error');
        return;
      }
      
      showToast('Fleet created successfully!', 'success');
      currentFleet = data;
      await loadFleetSection();
    }
    
    function openAddFleetEmployeeModal() {
      document.getElementById('fleet-employee-email').value = '';
      document.getElementById('fleet-employee-role').value = 'driver';
      document.getElementById('fleet-employee-id').value = '';
      document.getElementById('fleet-employee-dept').value = '';
      document.getElementById('fleet-employee-spending-limit').value = '';
      document.getElementById('fleet-employee-requires-approval').checked = false;
      openModal('add-fleet-employee-modal');
    }
    
    async function addFleetEmployee() {
      const email = document.getElementById('fleet-employee-email').value.trim();
      const role = document.getElementById('fleet-employee-role').value;
      const employeeId = document.getElementById('fleet-employee-id').value.trim();
      const department = document.getElementById('fleet-employee-dept').value.trim();
      const spendingLimit = document.getElementById('fleet-employee-spending-limit').value;
      const requiresApproval = document.getElementById('fleet-employee-requires-approval').checked;
      
      if (!email) {
        showToast('Please enter an email address', 'error');
        return;
      }
      
      const { data: userLookup } = await supabaseClient
        .from('profiles')
        .select('id')
        .eq('email', email)
        .single();
      
      const userId = userLookup?.id || null;
      
      const { error } = await addFleetMember(currentFleet.id, userId, role, {
        email,
        employee_id: employeeId || null,
        department: department || null,
        spending_limit: spendingLimit ? Number(spendingLimit) : null,
        requires_approval: requiresApproval
      });
      
      if (error) {
        showToast('Failed to add employee: ' + error.message, 'error');
        return;
      }
      
      showToast('Employee added to fleet!', 'success');
      closeModal('add-fleet-employee-modal');
      await loadFleetDetails(currentFleet.id);
    }
    
    function openEditFleetEmployee(memberId) {
      const member = fleetMembers.find(m => m.id === memberId);
      if (!member) return;
      
      editingFleetMemberId = memberId;
      const profile = member.user || {};
      const name = profile.full_name || member.email || 'Unknown';
      
      document.getElementById('edit-fleet-employee-content').innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
          <div style="width:48px;height:48px;background:var(--accent-gold-soft);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;">
            ${name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style="font-weight:600;font-size:1.1rem;">${name}</div>
            <div style="color:var(--text-muted);font-size:0.88rem;">${profile.email || member.email || ''}</div>
          </div>
        </div>
        
        <div class="form-group">
          <label class="form-label">Role</label>
          <select class="form-select" id="edit-fleet-employee-role">
            <option value="driver" ${member.role === 'driver' ? 'selected' : ''}>Driver</option>
            <option value="manager" ${member.role === 'manager' ? 'selected' : ''}>Manager</option>
            <option value="viewer" ${member.role === 'viewer' ? 'selected' : ''}>Viewer</option>
          </select>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Employee ID</label>
            <input type="text" class="form-input" id="edit-fleet-employee-id" value="${member.employee_id || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Department</label>
            <input type="text" class="form-input" id="edit-fleet-employee-dept" value="${member.department || ''}">
          </div>
        </div>
        
        <div class="form-group">
          <label class="form-label">Spending Limit</label>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="color:var(--text-muted);">$</span>
            <input type="number" class="form-input" id="edit-fleet-employee-spending" value="${member.spending_limit || ''}" style="max-width:150px;">
          </div>
        </div>
        
        <div class="form-group">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
            <input type="checkbox" id="edit-fleet-employee-approval" ${member.requires_approval ? 'checked' : ''}>
            <span>Requires approval for all service requests</span>
          </label>
        </div>
      `;
      
      openModal('edit-fleet-employee-modal');
    }
    
    async function saveFleetEmployee() {
      if (!editingFleetMemberId) return;
      
      const role = document.getElementById('edit-fleet-employee-role').value;
      const employeeId = document.getElementById('edit-fleet-employee-id').value.trim();
      const department = document.getElementById('edit-fleet-employee-dept').value.trim();
      const spendingLimit = document.getElementById('edit-fleet-employee-spending').value;
      const requiresApproval = document.getElementById('edit-fleet-employee-approval').checked;
      
      const { error } = await updateFleetMember(editingFleetMemberId, {
        role,
        employee_id: employeeId || null,
        department: department || null,
        spending_limit: spendingLimit ? Number(spendingLimit) : null,
        requires_approval: requiresApproval
      });
      
      if (error) {
        showToast('Failed to update employee', 'error');
        return;
      }
      
      showToast('Employee updated', 'success');
      closeModal('edit-fleet-employee-modal');
      editingFleetMemberId = null;
      await loadFleetDetails(currentFleet.id);
    }
    
    async function confirmRemoveFleetEmployee(memberId, name) {
      if (!confirm(`Remove ${name} from the fleet?`)) return;
      
      const { error } = await removeFleetMember(memberId);
      if (error) {
        showToast('Failed to remove employee', 'error');
        return;
      }
      
      showToast('Employee removed from fleet', 'success');
      await loadFleetDetails(currentFleet.id);
    }
    
    async function removeFleetEmployee() {
      if (!editingFleetMemberId) return;
      
      const member = fleetMembers.find(m => m.id === editingFleetMemberId);
      const name = member?.user?.full_name || member?.email || 'this employee';
      
      if (!confirm(`Remove ${name} from the fleet?`)) return;
      
      const { error } = await removeFleetMember(editingFleetMemberId);
      if (error) {
        showToast('Failed to remove employee', 'error');
        return;
      }
      
      showToast('Employee removed from fleet', 'success');
      closeModal('edit-fleet-employee-modal');
      editingFleetMemberId = null;
      await loadFleetDetails(currentFleet.id);
    }
    
    function openAddFleetVehicleModal() {
      const select = document.getElementById('fleet-vehicle-select');
      select.innerHTML = '<option value="">Choose a vehicle from your garage...</option>' + 
        vehicles.filter(v => !fleetVehicles.some(fv => fv.vehicle_id === v.id))
          .map(v => `<option value="${v.id}">${v.year} ${v.make} ${v.model}</option>`)
          .join('');
      
      const driverSelect = document.getElementById('fleet-vehicle-driver');
      driverSelect.innerHTML = '<option value="">No assigned driver (Pool vehicle)</option>' + 
        fleetMembers.filter(m => m.role === 'driver' || m.role === 'manager')
          .map(m => `<option value="${m.user_id || m.id}">${m.user?.full_name || m.email}</option>`)
          .join('');
      
      document.getElementById('fleet-vehicle-dept').value = '';
      document.querySelectorAll('input[name="fleet-assignment-type"]').forEach(r => r.checked = r.value === 'pool');
      
      setupFleetAssignmentOptions();
      openModal('add-fleet-vehicle-modal');
    }
    
    function setupFleetAssignmentOptions() {
      document.querySelectorAll('.fleet-assignment-option').forEach(opt => {
        opt.addEventListener('click', function() {
          document.querySelectorAll('.fleet-assignment-option').forEach(o => o.style.borderColor = 'var(--border-subtle)');
          this.style.borderColor = 'var(--accent-gold)';
          
          const type = this.querySelector('input').value;
          document.getElementById('fleet-vehicle-dates-row').style.display = type === 'temporary' ? 'grid' : 'none';
        });
      });
    }
    
    async function addVehicleToFleet() {
      const vehicleId = document.getElementById('fleet-vehicle-select').value;
      const driverId = document.getElementById('fleet-vehicle-driver').value || null;
      const assignmentType = document.querySelector('input[name="fleet-assignment-type"]:checked')?.value || 'pool';
      const department = document.getElementById('fleet-vehicle-dept').value.trim();
      const startDate = document.getElementById('fleet-vehicle-start-date').value;
      const endDate = document.getElementById('fleet-vehicle-end-date').value;
      
      if (!vehicleId) {
        showToast('Please select a vehicle', 'error');
        return;
      }
      
      const { error } = await assignVehicleToFleet(currentFleet.id, vehicleId, {
        assigned_driver_id: driverId,
        assignment_type: assignmentType,
        department: department || null,
        start_date: startDate || null,
        end_date: endDate || null
      });
      
      if (error) {
        showToast('Failed to add vehicle to fleet: ' + error.message, 'error');
        return;
      }
      
      showToast('Vehicle added to fleet!', 'success');
      closeModal('add-fleet-vehicle-modal');
      await loadFleetDetails(currentFleet.id);
    }
    
    function openEditFleetVehicle(assignmentId) {
      const fv = fleetVehicles.find(v => v.id === assignmentId);
      if (!fv) return;
      
      editingFleetVehicleId = assignmentId;
      const v = fv.vehicle || {};
      
      const driverOptions = '<option value="">No assigned driver (Pool vehicle)</option>' + 
        fleetMembers.filter(m => m.role === 'driver' || m.role === 'manager')
          .map(m => `<option value="${m.user_id || m.id}" ${(m.user_id || m.id) === fv.assigned_driver_id ? 'selected' : ''}>${m.user?.full_name || m.email}</option>`)
          .join('');
      
      document.getElementById('edit-fleet-vehicle-content').innerHTML = `
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;">
          <div style="width:80px;height:60px;background:var(--bg-input);border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center;font-size:32px;overflow:hidden;">
            ${v.photo_url ? `<img src="${v.photo_url}" style="width:100%;height:100%;object-fit:cover;">` : '🚗'}
          </div>
          <div>
            <div style="font-weight:600;font-size:1.1rem;">${v.year} ${v.make} ${v.model}</div>
            <div style="color:var(--text-muted);font-size:0.88rem;">VIN: ${v.vin || 'N/A'}</div>
          </div>
        </div>
        
        <div class="form-group">
          <label class="form-label">Assigned Driver</label>
          <select class="form-select" id="edit-fleet-vehicle-driver">${driverOptions}</select>
        </div>
        
        <div class="form-group">
          <label class="form-label">Assignment Type</label>
          <select class="form-select" id="edit-fleet-vehicle-type">
            <option value="permanent" ${fv.assignment_type === 'permanent' ? 'selected' : ''}>Permanent</option>
            <option value="temporary" ${fv.assignment_type === 'temporary' ? 'selected' : ''}>Temporary</option>
            <option value="pool" ${fv.assignment_type === 'pool' ? 'selected' : ''}>Pool</option>
          </select>
        </div>
        
        <div class="form-group">
          <label class="form-label">Department / Cost Center</label>
          <input type="text" class="form-input" id="edit-fleet-vehicle-dept" value="${fv.department || ''}">
        </div>
      `;
      
      openModal('edit-fleet-vehicle-modal');
    }
    
    async function saveFleetVehicle() {
      if (!editingFleetVehicleId) return;
      
      const driverId = document.getElementById('edit-fleet-vehicle-driver').value || null;
      const assignmentType = document.getElementById('edit-fleet-vehicle-type').value;
      const department = document.getElementById('edit-fleet-vehicle-dept').value.trim();
      
      const { error } = await updateFleetVehicleAssignment(editingFleetVehicleId, {
        assigned_driver_id: driverId,
        assignment_type: assignmentType,
        department: department || null
      });
      
      if (error) {
        showToast('Failed to update vehicle assignment', 'error');
        return;
      }
      
      showToast('Vehicle assignment updated', 'success');
      closeModal('edit-fleet-vehicle-modal');
      editingFleetVehicleId = null;
      await loadFleetDetails(currentFleet.id);
    }
    
    async function removeVehicleFromFleet() {
      if (!editingFleetVehicleId) return;
      
      const fv = fleetVehicles.find(v => v.id === editingFleetVehicleId);
      const vehicleName = fv?.vehicle ? `${fv.vehicle.year} ${fv.vehicle.make} ${fv.vehicle.model}` : 'this vehicle';
      
      if (!confirm(`Remove ${vehicleName} from the fleet?`)) return;
      
      const { error } = await supabaseClient
        .from('fleet_vehicles')
        .delete()
        .eq('id', editingFleetVehicleId);
      
      if (error) {
        showToast('Failed to remove vehicle', 'error');
        return;
      }
      
      showToast('Vehicle removed from fleet', 'success');
      closeModal('edit-fleet-vehicle-modal');
      editingFleetVehicleId = null;
      await loadFleetDetails(currentFleet.id);
    }
    
    function openBulkServiceWizard() {
      bulkWizardStep = 1;
      bulkSelectedVehicles = [];
      
      document.getElementById('bulk-batch-title').value = '';
      document.getElementById('bulk-service-type').value = '';
      document.getElementById('bulk-batch-description').value = '';
      document.getElementById('bulk-date-start').value = '';
      document.getElementById('bulk-date-end').value = '';
      
      updateBulkWizardUI();
      openModal('bulk-service-wizard-modal');
    }
    
    function updateBulkWizardUI() {
      document.querySelectorAll('.wizard-step').forEach((step, i) => {
        step.classList.remove('active', 'completed');
        if (i + 1 < bulkWizardStep) step.classList.add('completed');
        if (i + 1 === bulkWizardStep) step.classList.add('active');
      });
      
      document.querySelectorAll('.bulk-wizard-step').forEach((step, i) => {
        step.style.display = i + 1 === bulkWizardStep ? 'block' : 'none';
      });
      
      document.getElementById('bulk-prev-btn').style.display = bulkWizardStep > 1 ? 'inline-flex' : 'none';
      document.getElementById('bulk-next-btn').style.display = bulkWizardStep < 4 ? 'inline-flex' : 'none';
      document.getElementById('bulk-submit-btn').style.display = bulkWizardStep === 4 ? 'inline-flex' : 'none';
    }
    
    function bulkWizardNext() {
      if (bulkWizardStep === 1) {
        const title = document.getElementById('bulk-batch-title').value.trim();
        const serviceType = document.getElementById('bulk-service-type').value;
        const startDate = document.getElementById('bulk-date-start').value;
        const endDate = document.getElementById('bulk-date-end').value;
        
        if (!title || !serviceType || !startDate || !endDate) {
          showToast('Please fill in all required fields', 'error');
          return;
        }
        
        renderBulkVehiclesList();
      } else if (bulkWizardStep === 2) {
        if (bulkSelectedVehicles.length === 0) {
          showToast('Please select at least one vehicle', 'error');
          return;
        }
        renderBulkScheduleList();
      } else if (bulkWizardStep === 3) {
        renderBulkReview();
      }
      
      bulkWizardStep++;
      updateBulkWizardUI();
    }
    
    function bulkWizardPrev() {
      if (bulkWizardStep > 1) {
        bulkWizardStep--;
        updateBulkWizardUI();
      }
    }
    
    function renderBulkVehiclesList() {
      const container = document.getElementById('bulk-vehicles-list');
      
      container.innerHTML = fleetVehicles.map(fv => {
        const v = fv.vehicle || {};
        const isSelected = bulkSelectedVehicles.includes(fv.id);
        
        return `
          <label style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg-input);border:2px solid ${isSelected ? 'var(--accent-gold)' : 'var(--border-subtle)'};border-radius:var(--radius-md);cursor:pointer;transition:all 0.15s;">
            <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleBulkVehicle('${fv.id}')">
            <div style="width:50px;height:40px;background:var(--bg-elevated);border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;overflow:hidden;">
              ${v.photo_url ? `<img src="${v.photo_url}" style="width:100%;height:100%;object-fit:cover;">` : '🚗'}
            </div>
            <div style="flex:1;">
              <div style="font-weight:500;">${v.year} ${v.make} ${v.model}</div>
              <div style="font-size:0.82rem;color:var(--text-muted);">${fv.department || 'No department'}</div>
            </div>
          </label>
        `;
      }).join('');
      
      updateBulkSelectedCount();
    }
    
    function toggleBulkVehicle(vehicleId) {
      if (bulkSelectedVehicles.includes(vehicleId)) {
        bulkSelectedVehicles = bulkSelectedVehicles.filter(id => id !== vehicleId);
      } else {
        bulkSelectedVehicles.push(vehicleId);
      }
      renderBulkVehiclesList();
    }
    
    function toggleAllBulkVehicles() {
      if (bulkSelectedVehicles.length === fleetVehicles.length) {
        bulkSelectedVehicles = [];
      } else {
        bulkSelectedVehicles = fleetVehicles.map(fv => fv.id);
      }
      renderBulkVehiclesList();
    }
    
    function updateBulkSelectedCount() {
      document.getElementById('bulk-selected-count').textContent = bulkSelectedVehicles.length;
    }
    
    function renderBulkScheduleList() {
      const container = document.getElementById('bulk-schedule-list');
      const startDate = document.getElementById('bulk-date-start').value;
      
      container.innerHTML = bulkSelectedVehicles.map(fvId => {
        const fv = fleetVehicles.find(v => v.id === fvId);
        if (!fv) return '';
        const v = fv.vehicle || {};
        
        return `
          <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg-input);border-radius:var(--radius-md);">
            <div style="flex:1;">
              <div style="font-weight:500;">${v.year} ${v.make} ${v.model}</div>
            </div>
            <input type="date" class="form-input" style="width:auto;" id="bulk-schedule-${fvId}" value="${startDate}">
          </div>
        `;
      }).join('');
    }
    
    function renderBulkReview() {
      const title = document.getElementById('bulk-batch-title').value;
      const serviceType = document.getElementById('bulk-service-type').value;
      const description = document.getElementById('bulk-batch-description').value;
      const startDate = document.getElementById('bulk-date-start').value;
      const endDate = document.getElementById('bulk-date-end').value;
      
      const vehiclesList = bulkSelectedVehicles.map(fvId => {
        const fv = fleetVehicles.find(v => v.id === fvId);
        if (!fv) return '';
        const v = fv.vehicle || {};
        const schedDate = document.getElementById(`bulk-schedule-${fvId}`)?.value || startDate;
        
        return `
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-subtle);">
            <span>${v.year} ${v.make} ${v.model}</span>
            <span style="color:var(--text-muted);">${new Date(schedDate).toLocaleDateString()}</span>
          </div>
        `;
      }).join('');
      
      document.getElementById('bulk-review-content').innerHTML = `
        <div class="card" style="margin-bottom:16px;">
          <h4 style="margin-bottom:12px;">📋 Batch Details</h4>
          <div style="display:grid;gap:8px;font-size:0.9rem;">
            <div><strong>Title:</strong> ${title}</div>
            <div><strong>Service Type:</strong> ${serviceType}</div>
            <div><strong>Date Range:</strong> ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}</div>
            ${description ? `<div><strong>Description:</strong> ${description}</div>` : ''}
          </div>
        </div>
        
        <div class="card">
          <h4 style="margin-bottom:12px;">🚗 Vehicles (${bulkSelectedVehicles.length})</h4>
          ${vehiclesList}
        </div>
        
        <div style="margin-top:16px;padding:16px;background:var(--accent-gold-soft);border-radius:var(--radius-md);">
          <strong style="color:var(--accent-gold);">ℹ️ What happens next:</strong>
          <p style="font-size:0.88rem;color:var(--text-secondary);margin-top:8px;">
            This batch will be submitted for approval. Once approved, individual maintenance packages will be created for each vehicle and sent out for provider bids.
          </p>
        </div>
      `;
    }
    
    async function submitBulkServiceBatch() {
      const title = document.getElementById('bulk-batch-title').value.trim();
      const serviceType = document.getElementById('bulk-service-type').value;
      const description = document.getElementById('bulk-batch-description').value.trim();
      const startDate = document.getElementById('bulk-date-start').value;
      const endDate = document.getElementById('bulk-date-end').value;
      
      const vehicleSchedules = bulkSelectedVehicles.map(fvId => {
        const schedDate = document.getElementById(`bulk-schedule-${fvId}`)?.value || startDate;
        return { fleet_vehicle_id: fvId, scheduled_date: schedDate };
      });
      
      const { data, error } = await createBulkServiceBatch(currentFleet.id, {
        name: title,
        service_type: serviceType,
        description: description || null,
        start_date: startDate,
        end_date: endDate,
        vehicles: vehicleSchedules,
        status: 'pending_approval'
      });
      
      if (error) {
        showToast('Failed to create bulk service batch: ' + error.message, 'error');
        return;
      }
      
      showToast('Bulk service batch submitted for approval!', 'success');
      closeModal('bulk-service-wizard-modal');
      await loadBulkBatches();
    }
    
    async function approveBulkBatch(batchId) {
      if (!confirm('Approve this bulk service batch? This will create maintenance packages for all vehicles.')) return;
      
      const { error } = await approveBulkServiceBatch(batchId);
      if (error) {
        showToast('Failed to approve batch: ' + error.message, 'error');
        return;
      }
      
      showToast('Batch approved! Maintenance packages are being created.', 'success');
      await loadBulkBatches();
    }
    
    function openFleetSettingsModal() {
      if (!currentFleet) return;
      
      document.getElementById('fleet-settings-name').value = currentFleet.name || '';
      document.getElementById('fleet-settings-company-name').value = currentFleet.company_name || '';
      document.getElementById('fleet-settings-business-type').value = currentFleet.business_type || 'other';
      document.getElementById('fleet-settings-billing-email').value = currentFleet.billing_email || '';
      document.getElementById('fleet-settings-address').value = currentFleet.address || '';
      const taxIdEl = document.getElementById('fleet-settings-tax-id');
      if (taxIdEl) taxIdEl.value = currentFleet.tax_id || '';
      
      openModal('fleet-settings-modal');
    }
    
    async function saveFleetSettings() {
      const name = document.getElementById('fleet-settings-name').value.trim();
      const companyName = document.getElementById('fleet-settings-company-name').value.trim();
      const businessType = document.getElementById('fleet-settings-business-type').value;
      const billingEmail = document.getElementById('fleet-settings-billing-email').value.trim();
      const address = document.getElementById('fleet-settings-address').value.trim();
      const taxId = document.getElementById('fleet-settings-tax-id')?.value.trim() || '';
      
      if (!name) {
        showToast('Please enter a fleet name', 'error');
        return;
      }
      
      const { error } = await supabaseClient
        .from('fleets')
        .update({
          name,
          company_name: companyName || null,
          business_type: businessType,
          billing_email: billingEmail || null,
          address: address || null,
          tax_id: taxId || null
        })
        .eq('id', currentFleet.id);
      
      if (error) {
        showToast('Failed to update fleet settings', 'error');
        return;
      }
      
      showToast('Fleet settings updated', 'success');
      closeModal('fleet-settings-modal');
      await loadFleetDetails(currentFleet.id);
    }
    
    async function suspendFleetMember(memberId, memberName) {
      if (!confirm(`Suspend ${memberName}? They will not be able to request services.`)) return;
      
      const { error } = await updateFleetMember(memberId, { status: 'suspended' });
      if (error) {
        showToast('Failed to suspend member', 'error');
        return;
      }
      
      showToast('Member suspended', 'success');
      await loadFleetDetails(currentFleet.id);
    }
    
    async function activateFleetMember(memberId, memberName) {
      const { error } = await updateFleetMember(memberId, { status: 'active' });
      if (error) {
        showToast('Failed to activate member', 'error');
        return;
      }
      
      showToast('Member activated', 'success');
      await loadFleetDetails(currentFleet.id);
    }
    
    function editFleetName() {
      const newName = prompt('Enter new fleet name:', currentFleet?.name || '');
      if (!newName || newName.trim() === currentFleet?.name) return;
      
      supabaseClient
        .from('fleets')
        .update({ name: newName.trim() })
        .eq('id', currentFleet.id)
        .then(({ error }) => {
          if (error) {
            showToast('Failed to update fleet name', 'error');
            return;
          }
          showToast('Fleet name updated', 'success');
          loadFleetDetails(currentFleet.id);
        });
    }

    // ========== SPENDING ANALYTICS ==========
    let spendingChart = null;
    let spendingData = { parts: [], labor: [], taxes: [], towing: [], platform: [], other: [] };

    function initSpendingAnalytics() {
      const yearFilter = document.getElementById('spending-year-filter');
      const currentYear = new Date().getFullYear();
      yearFilter.innerHTML = '';
      for (let y = currentYear; y >= currentYear - 5; y--) {
        yearFilter.innerHTML += `<option value="${y}">${y}</option>`;
      }
      yearFilter.value = currentYear;
      yearFilter.addEventListener('change', () => loadSpendingData());
      
      const vehicleFilter = document.getElementById('spending-vehicle-filter');
      vehicleFilter.innerHTML = '<option value="">All Vehicles</option>';
      if (window.userVehicles && userVehicles.length > 0) {
        userVehicles.forEach(v => {
          vehicleFilter.innerHTML += `<option value="${v.id}">${v.year} ${v.make} ${v.model}</option>`;
        });
      }
      vehicleFilter.addEventListener('change', () => loadSpendingData());
      
      loadSpendingData();
    }

    async function loadSpendingData() {
      const year = document.getElementById('spending-year-filter').value || new Date().getFullYear();
      const vehicleId = document.getElementById('spending-vehicle-filter').value;
      
      document.getElementById('spending-year-label').textContent = year;
      
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;
      
      let query = supabaseClient
        .from('payments')
        .select('*, packages(vehicle_id, transfer_type, vehicles(year, make, model, fuel_injection_type)), bids(parts_cost, labor_cost, tax_amount, towing_cost)')
        .eq('member_id', currentUser.id)
        .eq('status', 'completed')
        .gte('created_at', startDate)
        .lte('created_at', endDate);
      
      const { data, error } = await query;
      
      if (error) {
        console.error('Error loading spending data:', error);
        return;
      }
      
      const monthlyData = Array(12).fill(null).map(() => ({ parts: 0, labor: 0, taxes: 0, towing: 0, platform: 0, other: 0 }));
      let totalParts = 0, totalLabor = 0, totalTaxes = 0, totalTowing = 0, totalPlatform = 0, totalOther = 0;
      
      (data || []).forEach(payment => {
        if (vehicleId && payment.packages?.vehicle_id !== vehicleId) return;
        
        const month = new Date(payment.created_at).getMonth();
        const total = parseFloat(payment.amount) || 0;
        const bid = payment.bids || {};
        const pkg = payment.packages || {};
        
        const platformFee = total * 0.075;
        const parts = parseFloat(bid.parts_cost) || 0;
        const labor = parseFloat(bid.labor_cost) || 0;
        const taxes = parseFloat(bid.tax_amount) || (total * 0.08);
        const isTowing = pkg.transfer_type === 'towing' || parseFloat(bid.towing_cost) > 0;
        const towing = parseFloat(bid.towing_cost) || (isTowing ? total * 0.15 : 0);
        
        let calculatedTotal = parts + labor + taxes + towing + platformFee;
        let other = 0;
        if (parts === 0 && labor === 0) {
          const remaining = total - platformFee - taxes - towing;
          const partsEst = remaining * 0.45;
          const laborEst = remaining * 0.45;
          other = remaining * 0.1;
          monthlyData[month].parts += partsEst;
          monthlyData[month].labor += laborEst;
          totalParts += partsEst;
          totalLabor += laborEst;
        } else {
          other = Math.max(0, total - calculatedTotal);
          monthlyData[month].parts += parts;
          monthlyData[month].labor += labor;
          totalParts += parts;
          totalLabor += labor;
        }
        
        monthlyData[month].taxes += taxes;
        monthlyData[month].towing += towing;
        monthlyData[month].platform += platformFee;
        monthlyData[month].other += other;
        
        totalTaxes += taxes;
        totalTowing += towing;
        totalPlatform += platformFee;
        totalOther += other;
      });
      
      spendingData = {
        parts: monthlyData.map(m => m.parts),
        labor: monthlyData.map(m => m.labor),
        taxes: monthlyData.map(m => m.taxes),
        towing: monthlyData.map(m => m.towing),
        platform: monthlyData.map(m => m.platform),
        other: monthlyData.map(m => m.other)
      };
      
      const grandTotal = totalParts + totalLabor + totalTaxes + totalTowing + totalPlatform + totalOther;
      document.getElementById('spending-total-label').textContent = '$' + grandTotal.toFixed(2);
      document.getElementById('legend-parts').textContent = '$' + totalParts.toFixed(2);
      document.getElementById('legend-labor').textContent = '$' + totalLabor.toFixed(2);
      document.getElementById('legend-taxes').textContent = '$' + totalTaxes.toFixed(2);
      document.getElementById('legend-towing').textContent = '$' + totalTowing.toFixed(2);
      document.getElementById('legend-platform').textContent = '$' + totalPlatform.toFixed(2);
      document.getElementById('legend-other').textContent = '$' + totalOther.toFixed(2);
      
      renderSpendingChart();
    }

    function renderSpendingChart() {
      const ctx = document.getElementById('spending-chart');
      if (!ctx) return;
      
      if (spendingChart) spendingChart.destroy();
      
      spendingChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
          datasets: [
            { label: 'Parts', data: spendingData.parts, backgroundColor: '#4a7cff', borderRadius: 4 },
            { label: 'Labor', data: spendingData.labor, backgroundColor: '#9b59b6', borderRadius: 4 },
            { label: 'Taxes', data: spendingData.taxes, backgroundColor: '#e74c3c', borderRadius: 4 },
            { label: 'Towing', data: spendingData.towing, backgroundColor: '#3498db', borderRadius: 4 },
            { label: 'Platform Fee', data: spendingData.platform, backgroundColor: '#4ac88c', borderRadius: 4 },
            { label: 'Other', data: spendingData.other, backgroundColor: '#f59e0b', borderRadius: 4 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { stacked: true, grid: { color: 'rgba(148,148,168,0.12)' }, ticks: { color: '#9898a8' } },
            y: { stacked: true, grid: { color: 'rgba(148,148,168,0.12)' }, ticks: { color: '#9898a8', callback: v => '$' + v } }
          }
        }
      });
    }

    function downloadSpendingCSV() {
      const year = document.getElementById('spending-year-filter').value;
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      let csv = 'Month,Parts,Labor,Taxes,Towing,Platform Fee,Other,Total\n';
      
      for (let i = 0; i < 12; i++) {
        const parts = spendingData.parts[i] || 0;
        const labor = spendingData.labor[i] || 0;
        const taxes = spendingData.taxes[i] || 0;
        const towing = spendingData.towing[i] || 0;
        const platform = spendingData.platform[i] || 0;
        const other = spendingData.other[i] || 0;
        const total = parts + labor + taxes + towing + platform + other;
        csv += `${months[i]},${parts.toFixed(2)},${labor.toFixed(2)},${taxes.toFixed(2)},${towing.toFixed(2)},${platform.toFixed(2)},${other.toFixed(2)},${total.toFixed(2)}\n`;
      }
      
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `spending-${year}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }

    let vaCurrentStep = 1;
    let vaSessionType = 'diagnostic';
    let vaSelectedVehicle = null;
    let vaMediaFiles = [];
    let vaMediaUrls = [];
    let vaAssessmentResult = null;

    function openVehicleAssistantModal() {
      vaCurrentStep = 1;
      vaSessionType = 'diagnostic';
      vaSelectedVehicle = null;
      vaMediaFiles = [];
      vaMediaUrls = [];
      vaAssessmentResult = null;
      
      const vehicleSelect = document.getElementById('va-vehicle-select');
      vehicleSelect.innerHTML = '<option value="">Choose a vehicle from your garage...</option>';
      vehicles.forEach(v => {
        vehicleSelect.innerHTML += `<option value="${v.id}">${v.year} ${v.make} ${v.model}</option>`;
      });
      
      document.querySelectorAll('.va-type-card').forEach(c => c.classList.remove('selected'));
      document.querySelector('.va-type-card[data-type="diagnostic"]').classList.add('selected');
      document.getElementById('va-description').value = '';
      document.querySelectorAll('#va-symptoms-section input[type="checkbox"]').forEach(cb => cb.checked = false);
      document.getElementById('va-media-preview').innerHTML = '';
      document.getElementById('va-upload-status').textContent = '';
      document.getElementById('va-loading').style.display = 'block';
      document.getElementById('va-result').style.display = 'none';
      
      updateVaUI();
      document.getElementById('vehicle-assistant-modal').classList.add('active');
    }

    function selectVaType(type) {
      vaSessionType = type;
      document.querySelectorAll('.va-type-card').forEach(c => c.classList.remove('selected'));
      document.querySelector(`.va-type-card[data-type="${type}"]`).classList.add('selected');
    }

    function updateVaUI() {
      for (let i = 1; i <= 4; i++) {
        document.getElementById(`va-step-${i}`).style.display = i === vaCurrentStep ? 'block' : 'none';
      }
      
      document.querySelectorAll('.va-step').forEach(step => {
        const stepNum = parseInt(step.dataset.step);
        step.classList.remove('active', 'completed');
        if (stepNum === vaCurrentStep) step.classList.add('active');
        else if (stepNum < vaCurrentStep) step.classList.add('completed');
      });
      
      const backBtn = document.getElementById('va-back-btn');
      const nextBtn = document.getElementById('va-next-btn');
      const footer = document.getElementById('va-footer');
      
      backBtn.style.display = vaCurrentStep > 1 ? 'block' : 'none';
      
      if (vaCurrentStep === 4) {
        footer.style.display = 'none';
      } else {
        footer.style.display = 'flex';
        nextBtn.textContent = vaCurrentStep === 3 ? 'Get Assessment →' : 'Next →';
      }
      
      if (vaSessionType === 'diagnostic') {
        document.getElementById('va-description-label').textContent = 'Describe the Issue';
        document.getElementById('va-description').placeholder = 'Be as detailed as possible. What do you see, hear, or feel? When did it start?';
        document.getElementById('va-symptoms-section').style.display = 'block';
      } else {
        document.getElementById('va-description-label').textContent = 'Describe the Custom Work';
        document.getElementById('va-description').placeholder = 'Describe the modifications or cosmetic work you want done. Include any specific requirements or preferences.';
        document.getElementById('va-symptoms-section').style.display = 'none';
      }
    }

    function vaGoBack() {
      if (vaCurrentStep > 1) {
        vaCurrentStep--;
        updateVaUI();
      }
    }

    async function vaGoNext() {
      if (vaCurrentStep === 1) {
        const vehicleId = document.getElementById('va-vehicle-select').value;
        if (!vehicleId) {
          showToast('Please select a vehicle', 'error');
          return;
        }
        vaSelectedVehicle = vehicles.find(v => v.id === vehicleId);
        vaCurrentStep = 2;
        updateVaUI();
      } else if (vaCurrentStep === 2) {
        const description = document.getElementById('va-description').value.trim();
        if (description.length < 10) {
          showToast('Please provide a more detailed description (at least 10 characters)', 'error');
          return;
        }
        vaCurrentStep = 3;
        updateVaUI();
      } else if (vaCurrentStep === 3) {
        vaCurrentStep = 4;
        updateVaUI();
        await generateVaAssessment();
      }
    }

    async function handleVaMediaSelect(event) {
      const files = Array.from(event.target.files);
      const maxFiles = 5;
      const maxSize = 10 * 1024 * 1024;
      
      if (vaMediaFiles.length + files.length > maxFiles) {
        showToast(`Maximum ${maxFiles} files allowed`, 'error');
        return;
      }
      
      for (const file of files) {
        if (file.size > maxSize) {
          showToast(`${file.name} exceeds 10MB limit`, 'error');
          continue;
        }
        vaMediaFiles.push(file);
      }
      
      renderVaMediaPreviews();
      event.target.value = '';
    }

    function renderVaMediaPreviews() {
      const container = document.getElementById('va-media-preview');
      container.innerHTML = '';
      
      vaMediaFiles.forEach((file, index) => {
        const div = document.createElement('div');
        div.className = 'va-media-item';
        
        if (file.type.startsWith('image/')) {
          const img = document.createElement('img');
          img.src = URL.createObjectURL(file);
          div.appendChild(img);
        } else if (file.type.startsWith('video/')) {
          const video = document.createElement('video');
          video.src = URL.createObjectURL(file);
          video.muted = true;
          div.appendChild(video);
        } else if (file.type.startsWith('audio/')) {
          div.innerHTML = '<div class="va-audio-icon">🎵</div>';
        }
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'va-media-remove';
        removeBtn.innerHTML = '×';
        removeBtn.onclick = () => removeVaMedia(index);
        div.appendChild(removeBtn);
        
        container.appendChild(div);
      });
    }

    function removeVaMedia(index) {
      vaMediaFiles.splice(index, 1);
      renderVaMediaPreviews();
    }

    async function uploadVaMedia() {
      if (vaMediaFiles.length === 0) return [];
      
      const statusEl = document.getElementById('va-upload-status');
      const urls = [];
      
      for (let i = 0; i < vaMediaFiles.length; i++) {
        const file = vaMediaFiles[i];
        statusEl.textContent = `Uploading ${i + 1}/${vaMediaFiles.length}...`;
        
        try {
          const ext = file.name.split('.').pop().toLowerCase();
          const filename = `${crypto.randomUUID()}.${ext}`;
          const path = `diagnostic-media/${currentUser.id}/${filename}`;
          
          const { data, error } = await supabaseClient.storage
            .from('vehicle-files')
            .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
          
          if (error) {
            console.error('Upload error:', error);
            continue;
          }
          
          const { data: publicData } = supabaseClient.storage.from('vehicle-files').getPublicUrl(path);
          if (publicData?.publicUrl) {
            urls.push(publicData.publicUrl);
          }
        } catch (err) {
          console.error('Upload error:', err);
        }
      }
      
      statusEl.textContent = `Uploaded ${urls.length} file(s)`;
      return urls;
    }

    async function generateVaAssessment() {
      document.getElementById('va-loading').style.display = 'block';
      document.getElementById('va-result').style.display = 'none';
      document.getElementById('va-footer').style.display = 'none';
      
      try {
        vaMediaUrls = await uploadVaMedia();
        
        const symptoms = [];
        document.querySelectorAll('#va-symptoms-section input[type="checkbox"]:checked').forEach(cb => {
          symptoms.push(cb.value);
        });
        
        const response = await fetch('/api/diagnostics/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionType: vaSessionType,
            vehicleInfo: vaSelectedVehicle ? {
              year: vaSelectedVehicle.year,
              make: vaSelectedVehicle.make,
              model: vaSelectedVehicle.model,
              mileage: vaSelectedVehicle.mileage
            } : null,
            description: document.getElementById('va-description').value.trim(),
            symptoms: symptoms,
            mediaUrls: vaMediaUrls
          })
        });
        
        if (!response.ok) {
          throw new Error('Failed to generate assessment');
        }
        
        vaAssessmentResult = await response.json();
        displayVaResult(vaAssessmentResult);
        
      } catch (error) {
        console.error('Assessment error:', error);
        showToast('Failed to generate assessment. Please try again.', 'error');
        vaCurrentStep = 3;
        updateVaUI();
      }
    }

    function displayVaResult(result) {
      document.getElementById('va-loading').style.display = 'none';
      document.getElementById('va-result').style.display = 'block';
      
      const severityLabels = {
        low: '✅ Low Priority',
        medium: '⚠️ Medium Priority',
        high: '🔶 High Priority',
        critical: '🚨 Critical - Address Immediately',
        cosmetic: '✨ Cosmetic Work'
      };
      
      const severityBadge = document.getElementById('va-severity-badge');
      severityBadge.innerHTML = `<span class="va-severity ${result.severity || 'medium'}">${severityLabels[result.severity] || severityLabels.medium}</span>`;
      
      document.getElementById('va-assessment-text').textContent = result.assessment || 'No assessment available.';
      
      const costs = result.costEstimate || {};
      const partsLow = costs.partsLow || 0;
      const partsHigh = costs.partsHigh || 0;
      const laborLow = costs.laborLow || 0;
      const laborHigh = costs.laborHigh || 0;
      
      document.getElementById('va-parts-cost').textContent = `$${partsLow.toLocaleString()} - $${partsHigh.toLocaleString()}`;
      document.getElementById('va-labor-cost').textContent = `$${laborLow.toLocaleString()} - $${laborHigh.toLocaleString()}`;
      
      const totalLow = partsLow + laborLow;
      const totalHigh = partsHigh + laborHigh;
      document.getElementById('va-total-cost').textContent = `$${totalLow.toLocaleString()} - $${totalHigh.toLocaleString()}`;
      
      const warningsSection = document.getElementById('va-safety-warnings');
      const warningsList = document.getElementById('va-warnings-list');
      if (result.safetyWarnings && result.safetyWarnings.length > 0) {
        warningsSection.style.display = 'block';
        warningsList.innerHTML = result.safetyWarnings.map(w => `<li>${w}</li>`).join('');
      } else {
        warningsSection.style.display = 'none';
      }
      
      const servicesList = document.getElementById('va-services-list');
      const services = result.recommendedServices || result.recommendedCategories || [];
      if (services.length > 0) {
        servicesList.innerHTML = services.map(s => `<span class="va-service-tag">${s}</span>`).join('');
      } else {
        servicesList.innerHTML = '<span class="va-service-tag">General Maintenance</span>';
      }
      
      document.getElementById('va-disclaimer-text').textContent = result.disclaimer || 'This is an AI-powered informational tool only. Always consult a professional mechanic.';
    }

    function createServiceRequestFromAssessment() {
      if (!vaAssessmentResult || !vaSelectedVehicle) {
        showToast('No assessment available', 'error');
        return;
      }
      
      closeModal('vehicle-assistant-modal');
      
      openPackageModal();
      
      setTimeout(() => {
        const vehicleSelect = document.getElementById('p-vehicle');
        if (vehicleSelect) {
          vehicleSelect.value = vaSelectedVehicle.id;
        }
        
        const categorySelect = document.getElementById('p-category');
        if (categorySelect) {
          const categories = vaAssessmentResult.recommendedCategories || [];
          if (categories.includes('maintenance') || categories.includes('mechanical')) {
            categorySelect.value = 'maintenance';
          } else if (categories.includes('cosmetic') || categories.includes('body')) {
            categorySelect.value = 'cosmetic';
          } else if (categories.includes('performance')) {
            categorySelect.value = 'performance';
          }
        }
        
        const titleInput = document.getElementById('p-title');
        if (titleInput) {
          const services = vaAssessmentResult.recommendedServices || [];
          titleInput.value = services.length > 0 ? services.slice(0, 2).join(' & ') : (vaSessionType === 'diagnostic' ? 'Vehicle Issue - AI Assessed' : 'Custom Work Request');
        }
        
        const descriptionInput = document.getElementById('p-description');
        if (descriptionInput) {
          const originalDesc = document.getElementById('va-description').value.trim();
          const costs = vaAssessmentResult.costEstimate || {};
          const totalLow = (costs.partsLow || 0) + (costs.laborLow || 0);
          const totalHigh = (costs.partsHigh || 0) + (costs.laborHigh || 0);
          
          descriptionInput.value = `${originalDesc}

--- AI Assessment Summary ---
${vaAssessmentResult.assessment}

Estimated Cost Range: $${totalLow.toLocaleString()} - $${totalHigh.toLocaleString()}
Severity: ${vaAssessmentResult.severity || 'Not specified'}

Note: This assessment was generated by AI and is for informational purposes only. Actual diagnosis and costs may vary.`;
        }
        
        showToast('Assessment loaded into service request form', 'success');
      }, 300);
    }

    // Car Education Data
    const carEducation = {
      maintenance101: [
        { title: 'Why Oil Changes Matter', content: 'Oil lubricates your engine\'s moving parts and removes heat. Old oil breaks down and can\'t protect your engine, leading to wear and expensive repairs. Most modern cars need synthetic oil every 5,000-10,000 miles.', icon: '🛢️' },
        { title: 'Brake Basics', content: 'Brakes work by pressing pads against spinning rotors to slow your car. Brake pads wear down over time and need replacement every 30,000-70,000 miles. Squealing usually means pads are getting low.', icon: '🛑' },
        { title: 'Tire Care Essentials', content: 'Tires are your only contact with the road. Rotate them every 5,000-7,500 miles for even wear. Check pressure monthly - underinflated tires waste gas and wear faster.', icon: '🔄' },
        { title: 'Battery Health', content: 'Car batteries typically last 3-5 years. Extreme heat and cold shorten their life. Signs of a dying battery: slow engine crank, dim lights, and dashboard warning lights.', icon: '🔋' },
        { title: 'Fluid Check Guide', content: 'Your car uses several fluids: engine oil, coolant, brake fluid, transmission fluid, and power steering fluid. Most have dipsticks or reservoirs you can check yourself.', icon: '💧' },
        { title: 'Filter Fundamentals', content: 'Air filters keep dust out of your engine (replace every 15,000-30,000 miles). Cabin filters keep the air you breathe clean (replace every 15,000-25,000 miles).', icon: '💨' }
      ],
      repairs: [
        { title: 'Alternator vs Battery', content: 'If your car won\'t start, it could be either. A dead battery is more common. If you jump-start and it dies again quickly, the alternator (which charges the battery) may be failing.', icon: '⚡' },
        { title: 'Suspension & Shocks', content: 'Suspension keeps your ride smooth and your tires on the road. Signs of worn shocks: bouncy ride, nose-diving when braking, uneven tire wear.', icon: '🚗' },
        { title: 'Transmission Explained', content: 'The transmission transfers power from engine to wheels and changes gears. Automatic transmissions shift for you; manuals require clutch work. Fluid changes extend transmission life.', icon: '⚙️' },
        { title: 'Timing Belt vs Chain', content: 'Timing belts are rubber and need replacement (60,000-100,000 miles). Timing chains are metal and usually last the life of the engine. Check your owner\'s manual.', icon: '🔗' },
        { title: 'Catalytic Converter', content: 'This emissions device converts harmful gases into less harmful ones. They\'re expensive because they contain precious metals. Theft is common - consider a protective shield.', icon: '🌿' },
        { title: 'CV Joints & Axles', content: 'CV (constant velocity) joints allow your wheels to turn while receiving power. Clicking sounds when turning often indicate worn CV joints. The rubber boots protect them from dirt.', icon: '🔘' }
      ],
      warningSigns: [
        { title: 'Squealing Brakes', content: 'A high-pitched squeal usually means brake pads are worn. Built-in wear indicators make this sound on purpose. Don\'t ignore it - metal-on-metal grinding is much more expensive to fix.', icon: '🔊', severity: 'medium' },
        { title: 'Check Engine Light', content: 'This can mean anything from a loose gas cap to a serious engine problem. A steady light means get it checked soon. A flashing light means pull over - continued driving may cause damage.', icon: '🚨', severity: 'high' },
        { title: 'Burning Smell', content: 'Different burns mean different problems: Sweet smell = coolant leak. Burning oil = oil leak onto hot engine. Burning rubber = belt slipping or stuck brake. Electrical = wiring issue.', icon: '👃', severity: 'high' },
        { title: 'Vibrations', content: 'Steering wheel shake at highway speeds often means unbalanced or worn tires. Vibration when braking suggests warped rotors. General vibration could be engine mounts or drivetrain.', icon: '📳', severity: 'medium' },
        { title: 'Pulling to One Side', content: 'If your car drifts left or right, it could be alignment, uneven tire pressure, or worn suspension. Start by checking tire pressure - it\'s the easiest fix.', icon: '↔️', severity: 'low' },
        { title: 'Strange Noises', content: 'Clicking when turning = CV joint. Grinding = brakes or transmission. Knocking from engine = low oil or engine damage. Hissing = vacuum or coolant leak. Clunking over bumps = suspension.', icon: '👂', severity: 'medium' }
      ],
      savingTips: [
        { title: 'Get Multiple Quotes', content: 'For any repair over $300, get 2-3 quotes. Prices can vary significantly. My Car Concierge makes this easy with competitive bidding from verified providers.', icon: '📊' },
        { title: 'Don\'t Skip Maintenance', content: 'Regular oil changes and inspections catch small problems before they become big ones. A $50 oil change prevents a $5,000 engine replacement.', icon: '📅' },
        { title: 'Understand the Diagnosis', content: 'Ask your mechanic to explain what\'s wrong in plain language. A good provider will show you the worn parts and explain why repairs are needed.', icon: '🔍' },
        { title: 'Know What\'s Urgent', content: 'Brakes, tires, steering = safety-critical, fix immediately. Oil leak = fix soon. Cosmetic issues = can wait. Don\'t let shops scare you into unnecessary rush jobs.', icon: '⏰' },
        { title: 'OEM vs Aftermarket Parts', content: 'OEM (Original Equipment Manufacturer) parts are made by your car\'s brand. Aftermarket parts are often cheaper and work fine, but quality varies. For critical components, OEM may be worth it.', icon: '🏭' },
        { title: 'DIY What You Can', content: 'Some things are easy to do yourself: wiper blades, air filters, tire pressure, washer fluid. YouTube tutorials make it simple. Save labor costs for complex repairs.', icon: '🛠️' }
      ],
      rideshare: [
        { title: 'Accelerated Maintenance Schedules', content: 'When you drive 30,000-50,000+ miles per year, standard maintenance intervals don\'t apply. Your oil changes may need to happen every 3,000-5,000 miles instead of 7,500. Brake pads might last only 20,000 miles with constant city stop-and-go. Create a mileage-based schedule and track everything - your car is your business asset.', icon: '📅', readTime: '3 min' },
        { title: 'City Driving Wear Patterns', content: 'Stop-and-go traffic is the hardest on your vehicle. Brakes wear 2-3x faster than highway driving. Transmission fluid degrades faster from constant gear changes. Your cooling system works harder in traffic. Engine mounts and suspension take a beating from potholes. Understanding these patterns helps you budget for repairs.', icon: '🏙️', readTime: '3 min' },
        { title: 'Cost-Per-Mile Calculations', content: 'Knowing your true cost per mile helps you understand profitability. Include: fuel, insurance, maintenance, repairs, depreciation, and car washes. Most drivers underestimate true costs. Track all expenses for accurate calculations. A well-maintained vehicle has lower cost-per-mile than one driven to failure.', icon: '💵', readTime: '4 min' },
        { title: 'Tax Deduction Essentials', content: 'Vehicle expenses for business driving may be tax-deductible. Keep detailed mileage logs with dates, destinations, and purpose. Save all receipts for repairs, maintenance, fuel, and car washes. Consult a tax professional about standard mileage rate vs actual expenses method. Good records can save you thousands.', icon: '📋', readTime: '3 min' },
        { title: 'Protecting Resale Value', content: 'High-mileage vehicles depreciate faster, but you can minimize the hit. Keep detailed maintenance records - they\'re worth money at resale. Address cosmetic issues promptly. Consider professional detailing before selling. Timing matters - selling at 100K miles gets better value than 150K. Plan your exit strategy.', icon: '💰', readTime: '3 min' },
        { title: 'Passenger Comfort & Safety', content: 'Happy passengers mean better ratings and tips. Keep your cabin air filter fresh for clean air. Ensure AC works well year-round. Check that all seat belts function properly. Keep the interior clean and odor-free. Working USB ports and phone mounts show professionalism. First impressions matter.', icon: '⭐', readTime: '3 min' }
      ],
      commercial: [
        { title: 'Heavy-Duty Brake Systems', content: 'Larger vehicles with passengers or cargo need more stopping power. Brake systems work much harder than passenger cars. Inspect brake pads, rotors, and drums more frequently. Listen for squealing or grinding - address immediately. Air brake systems require additional maintenance. Never compromise on brakes when carrying passengers.', icon: '🛑', readTime: '4 min' },
        { title: 'Transmission Care for Heavy Loads', content: 'Transmissions in vans and buses work harder due to weight. Use the correct transmission fluid specified for your vehicle. Consider more frequent fluid changes - every 30,000 miles for heavy use. Avoid overloading - it accelerates wear dramatically. Towing or carrying maximum loads? Expect shorter component life.', icon: '⚙️', readTime: '4 min' },
        { title: 'Pre-Trip Inspection Basics', content: 'Professional drivers should inspect their vehicle before each trip. Check tires for pressure and damage. Test all lights - headlights, brake lights, turn signals. Verify horn works. Check mirrors for proper adjustment. Look under the vehicle for leaks. Test brakes before leaving. This protects you and your passengers.', icon: '✅', readTime: '4 min' },
        { title: 'Cooling System Demands', content: 'Engines in commercial vehicles run hotter due to constant operation and heavier loads. Check coolant levels regularly. Inspect belts and hoses for wear. Watch your temperature gauge - overheating destroys engines. Consider a heavy-duty radiator if you frequently operate at capacity. Don\'t ignore warning signs.', icon: '🌡️', readTime: '3 min' },
        { title: 'Suspension & Steering Under Load', content: 'Heavy loads stress suspension components. Inspect shocks and struts for leaks or wear. Check ball joints and tie rod ends regularly. Listen for clunks over bumps - address immediately. Proper alignment extends tire life and improves handling. Worn suspension affects braking distance and safety.', icon: '🔧', readTime: '3 min' },
        { title: 'Fleet Maintenance Records', content: 'Proper documentation is essential for commercial vehicles. Track all maintenance by date and mileage. Record fuel consumption to spot problems early. Keep repair receipts organized. Many jurisdictions require maintenance logs for commercial vehicles. Good records also help with resale and warranty claims.', icon: '📁', readTime: '3 min' }
      ],
      glossary: [
        { term: 'Alignment', definition: 'Adjusting the angles of your wheels so they\'re perpendicular to the ground and parallel to each other. Proper alignment prevents uneven tire wear.' },
        { term: 'Alternator', definition: 'Generates electricity while the engine runs to charge the battery and power electrical systems.' },
        { term: 'Brake Caliper', definition: 'Squeezes brake pads against the rotor to slow your wheels. Contains pistons that push when you press the brake pedal.' },
        { term: 'Brake Rotor', definition: 'The disc that spins with your wheel. Brake pads squeeze it to slow you down. Also called a brake disc.' },
        { term: 'Catalytic Converter', definition: 'Emissions device that converts harmful exhaust gases into less harmful ones. Contains precious metals; theft is common.' },
        { term: 'Coolant', definition: 'Liquid that circulates through your engine to prevent overheating. Also called antifreeze because it lowers the freezing point in winter.' },
        { term: 'CV Joint', definition: 'Constant Velocity joint - allows power to transfer to wheels while they turn and move up/down with suspension.' },
        { term: 'Differential', definition: 'Allows wheels to spin at different speeds when turning. Located between drive wheels.' },
        { term: 'Direct Injection', definition: 'Fuel delivery system that sprays fuel directly into the cylinder. More efficient but can cause carbon buildup on intake valves.' },
        { term: 'ECU/ECM', definition: 'Engine Control Unit/Module - the computer that manages your engine. Controls fuel injection, ignition timing, and more.' },
        { term: 'Exhaust Manifold', definition: 'Collects exhaust gases from engine cylinders and directs them to the catalytic converter and muffler.' },
        { term: 'Head Gasket', definition: 'Seals the gap between engine block and cylinder head. Failure causes coolant/oil mixing and overheating. Expensive repair.' },
        { term: 'Ignition Coil', definition: 'Converts battery voltage to the high voltage needed to create a spark in the spark plugs.' },
        { term: 'OBD-II', definition: 'On-Board Diagnostics port under your dashboard. Mechanics plug in scanners here to read error codes and diagnose problems.' },
        { term: 'Radiator', definition: 'Cools your engine by transferring heat from coolant to the air. Located at the front of your car behind the grille.' },
        { term: 'Serpentine Belt', definition: 'Single belt that drives multiple components: alternator, power steering pump, AC compressor, water pump. Needs periodic replacement.' },
        { term: 'Spark Plug', definition: 'Creates the electrical spark that ignites fuel in gasoline engines. Replace every 30,000-100,000 miles depending on type.' },
        { term: 'Struts/Shocks', definition: 'Suspension components that absorb bumps and keep tires on the road. Struts are structural; shocks are just dampers.' },
        { term: 'Thermostat', definition: 'Valve that regulates coolant flow to maintain optimal engine temperature. A stuck thermostat causes overheating or slow warming.' },
        { term: 'Timing Belt/Chain', definition: 'Synchronizes engine valve opening with piston movement. Belts need replacement; chains usually last the engine\'s life.' },
        { term: 'Torque', definition: 'Rotational force - what gets your car moving from a stop. Measured in pound-feet (lb-ft) or Newton-meters (Nm).' },
        { term: 'Transmission', definition: 'Transfers engine power to wheels and changes gear ratios for speed and torque. Automatic or manual.' },
        { term: 'Turbocharger', definition: 'Uses exhaust gas to spin a turbine that compresses intake air, increasing engine power. Requires more cooling and maintenance.' },
        { term: 'VIN', definition: 'Vehicle Identification Number - unique 17-character code identifying your specific vehicle. Found on dashboard and door jamb.' },
        { term: 'Wheel Bearing', definition: 'Allows wheels to spin smoothly. Worn bearings make humming/growling noise that changes with speed.' },
        { term: 'DOT Inspection', definition: 'Department of Transportation safety inspection required for commercial vehicles. Covers brakes, lights, tires, steering, and other safety-critical systems.' },
        { term: 'Pre-Trip Inspection', definition: 'A systematic check of vehicle safety components before driving. Required for commercial drivers; recommended for all high-mileage drivers.' },
        { term: 'Cost Per Mile', definition: 'Total operating cost divided by miles driven. Includes fuel, maintenance, insurance, depreciation, and repairs. Essential metric for rideshare and commercial drivers.' },
        { term: 'Fleet Maintenance', definition: 'Scheduled maintenance program for multiple vehicles. Emphasizes preventive care, detailed record-keeping, and minimizing downtime.' },
        { term: 'Heavy-Duty', definition: 'Components designed for commercial use and higher stress levels. Often found on vans, buses, and trucks. Built for durability over long service life.' },
        { term: 'Air Brakes', definition: 'Braking system using compressed air instead of hydraulic fluid. Common on buses, trucks, and large commercial vehicles. Requires specialized maintenance.' },
        { term: 'Load Capacity', definition: 'Maximum weight a vehicle can safely carry, including passengers and cargo. Exceeding capacity accelerates wear on suspension, brakes, and drivetrain.' }
      ]
    };

    const learnCategoryMeta = {
      maintenance101: { title: 'Maintenance 101', icon: '🔧', desc: 'Understanding routine maintenance' },
      repairs: { title: 'Understanding Repairs', icon: '🔩', desc: 'What mechanics mean when they say...' },
      warningSigns: { title: 'Warning Signs', icon: '⚠️', desc: 'Sounds, smells, and symptoms to watch for' },
      savingTips: { title: 'Money-Saving Tips', icon: '💰', desc: 'How to save on car care' },
      rideshare: { title: 'Rideshare & High-Mileage Drivers', icon: '🚗', desc: 'Tips for drivers who put serious miles on their vehicles' },
      commercial: { title: 'Commercial & Fleet Vehicles', icon: '🚐', desc: 'Maintenance for vans, buses, and commercial transport' }
    };

    let currentLearnCategory = null;
    let currentGlossaryFilter = '';

    function renderLearnHub() {
      const categoriesContainer = document.getElementById('learn-categories');
      const articlesView = document.getElementById('learn-articles-view');
      
      categoriesContainer.style.display = 'grid';
      articlesView.style.display = 'none';
      currentLearnCategory = null;
      
      renderGlossary('');
    }

    function showLearnCategory(category) {
      const categoriesContainer = document.getElementById('learn-categories');
      const articlesView = document.getElementById('learn-articles-view');
      
      categoriesContainer.style.display = 'none';
      articlesView.style.display = 'block';
      currentLearnCategory = category;
      
      renderEducationCategory(category);
    }

    function renderEducationCategory(category) {
      const articlesView = document.getElementById('learn-articles-view');
      const articles = carEducation[category] || [];
      const meta = learnCategoryMeta[category];
      
      let html = `
        <div class="learn-back-btn" onclick="renderLearnHub()">← Back to Categories</div>
        <div class="learn-articles-header">
          <h2 class="learn-articles-title">
            <span>${meta.icon}</span> ${meta.title}
          </h2>
          <span style="color:var(--text-muted);font-size:0.88rem;">${articles.length} articles</span>
        </div>
        <p style="color:var(--text-secondary);margin-bottom:20px;">${meta.desc}</p>
      `;
      
      articles.forEach((article, index) => {
        const articleId = `${category}-${index}`;
        const severityBadge = article.severity 
          ? `<span class="learn-severity-badge ${article.severity}">${article.severity}</span>` 
          : '';
        
        html += `
          <div class="learn-article-item" id="article-${articleId}">
            <div class="learn-article-header" onclick="toggleArticle('${articleId}')">
              <span class="learn-article-icon">${article.icon}</span>
              <span class="learn-article-title">${article.title}</span>
              ${severityBadge}
              <span class="learn-article-expand">▼</span>
            </div>
            <div class="learn-article-content">
              <div class="learn-article-text">${article.content}</div>
            </div>
          </div>
        `;
      });
      
      articlesView.innerHTML = html;
    }

    function toggleArticle(articleId) {
      const articleEl = document.getElementById(`article-${articleId}`);
      if (articleEl) {
        articleEl.classList.toggle('expanded');
      }
    }

    function renderGlossary(searchTerm = '') {
      const glossaryList = document.getElementById('glossary-list');
      const alphabetContainer = document.getElementById('glossary-alphabet');
      
      currentGlossaryFilter = searchTerm.toLowerCase();
      
      const filteredTerms = carEducation.glossary.filter(item => 
        item.term.toLowerCase().includes(currentGlossaryFilter) || 
        item.definition.toLowerCase().includes(currentGlossaryFilter)
      );
      
      const usedLetters = new Set(filteredTerms.map(item => item.term[0].toUpperCase()));
      const allLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      
      alphabetContainer.innerHTML = allLetters.map(letter => {
        const hasTerms = usedLetters.has(letter);
        return `<span class="learn-glossary-letter ${hasTerms ? '' : 'disabled'}" onclick="${hasTerms ? `scrollToGlossaryLetter('${letter}')` : ''}">${letter}</span>`;
      }).join('');
      
      if (filteredTerms.length === 0) {
        glossaryList.innerHTML = `
          <div class="empty-state" style="padding:32px;">
            <div class="empty-state-icon">🔍</div>
            <p>No terms found matching "${searchTerm}"</p>
          </div>
        `;
        return;
      }
      
      let currentLetter = '';
      let html = '';
      
      filteredTerms.sort((a, b) => a.term.localeCompare(b.term)).forEach(item => {
        const firstLetter = item.term[0].toUpperCase();
        if (firstLetter !== currentLetter) {
          currentLetter = firstLetter;
          html += `<div id="glossary-letter-${firstLetter}" style="font-size:1.2rem;font-weight:700;color:var(--accent-gold);margin-top:16px;margin-bottom:8px;">${firstLetter}</div>`;
        }
        html += `
          <div class="learn-glossary-item">
            <div class="learn-glossary-term">${item.term}</div>
            <div class="learn-glossary-definition">${item.definition}</div>
          </div>
        `;
      });
      
      glossaryList.innerHTML = html;
    }

    function filterGlossary(searchTerm) {
      renderGlossary(searchTerm);
    }

    function scrollToGlossaryLetter(letter) {
      const el = document.getElementById(`glossary-letter-${letter}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    // Initialize Learn section when shown
    const originalShowSection = showSection;
    showSection = function(sectionId) {
      originalShowSection(sectionId);
      if (sectionId === 'learn') {
        renderLearnHub();
      }
      if (sectionId === 'settings') {
        load2FAStatus();
      }
    };

    // ========== 2FA FUNCTIONS ==========
    let pending2FAPhone = '';

    async function load2FAStatus() {
      if (!currentUser) return;
      
      const loadingEl = document.getElementById('2fa-loading');
      const contentEl = document.getElementById('2fa-content');
      
      if (loadingEl) loadingEl.style.display = 'block';
      if (contentEl) contentEl.style.display = 'none';
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          update2FADisplay(false, null);
          return;
        }
        
        const response = await fetch('/api/2fa/status', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });
        const data = await response.json();
        
        update2FADisplay(data.enabled, data.phone);
      } catch (error) {
        console.error('Error loading 2FA status:', error);
        update2FADisplay(false, null);
      } finally {
        if (loadingEl) loadingEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'block';
      }
    }

    function update2FADisplay(enabled, maskedPhone) {
      const statusIcon = document.getElementById('2fa-status-icon');
      const statusText = document.getElementById('2fa-status-text');
      const statusDesc = document.getElementById('2fa-status-desc');
      const statusBadge = document.getElementById('2fa-status-badge');
      const enableSection = document.getElementById('2fa-enable-section');
      const disableSection = document.getElementById('2fa-disable-section');
      const maskedPhoneEl = document.getElementById('2fa-masked-phone');
      
      if (enabled) {
        if (statusIcon) statusIcon.textContent = '🔒';
        if (statusText) statusText.textContent = '2FA is Enabled';
        if (statusDesc) statusDesc.textContent = 'Your account is protected with two-factor authentication.';
        if (statusBadge) {
          statusBadge.textContent = 'Enabled';
          statusBadge.style.background = 'var(--accent-green-soft)';
          statusBadge.style.color = 'var(--accent-green)';
        }
        if (enableSection) enableSection.style.display = 'none';
        if (disableSection) disableSection.style.display = 'block';
        if (maskedPhoneEl) maskedPhoneEl.textContent = maskedPhone || '***-***-****';
      } else {
        if (statusIcon) statusIcon.textContent = '🔓';
        if (statusText) statusText.textContent = '2FA is Disabled';
        if (statusDesc) statusDesc.textContent = 'Your account is protected by password only.';
        if (statusBadge) {
          statusBadge.textContent = 'Disabled';
          statusBadge.style.background = 'rgba(239,95,95,0.15)';
          statusBadge.style.color = 'var(--accent-red)';
        }
        if (enableSection) enableSection.style.display = 'block';
        if (disableSection) disableSection.style.display = 'none';
      }
    }

    function format2FAPhoneInput(input) {
      let value = input.value.replace(/\D/g, '');
      if (value.length > 10) value = value.slice(0, 10);
      
      if (value.length >= 6) {
        input.value = `(${value.slice(0, 3)}) ${value.slice(3, 6)}-${value.slice(6)}`;
      } else if (value.length >= 3) {
        input.value = `(${value.slice(0, 3)}) ${value.slice(3)}`;
      } else if (value.length > 0) {
        input.value = `(${value}`;
      }
    }

    async function initiate2FAEnable() {
      const phoneInput = document.getElementById('2fa-phone-input');
      const phone = phoneInput.value.replace(/\D/g, '');
      
      if (phone.length !== 10) {
        showToast('Please enter a valid 10-digit phone number', 'error');
        return;
      }
      
      const btn = document.getElementById('2fa-enable-btn');
      const originalText = btn.innerHTML;
      btn.innerHTML = '⏳ Sending...';
      btn.disabled = true;
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          showToast('Session expired. Please log in again.', 'error');
          return;
        }
        
        const response = await fetch('/api/2fa/send-code', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ phone: phone })
        });
        
        const data = await response.json();
        
        if (data.success) {
          pending2FAPhone = phone;
          open2FAVerifyModal(phoneInput.value);
        } else {
          showToast(data.error || 'Failed to send verification code', 'error');
        }
      } catch (error) {
        console.error('Error sending 2FA code:', error);
        showToast('Failed to send verification code. Please try again.', 'error');
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    }

    function open2FAVerifyModal(formattedPhone) {
      const phoneDisplay = document.getElementById('2fa-verify-phone-display');
      if (phoneDisplay) phoneDisplay.textContent = formattedPhone;
      
      // Clear all digit inputs
      for (let i = 1; i <= 6; i++) {
        const input = document.getElementById(`2fa-digit-${i}`);
        if (input) input.value = '';
      }
      
      document.getElementById('2fa-verify-error').style.display = 'none';
      document.getElementById('2fa-verify-btn').disabled = true;
      
      document.getElementById('2fa-verify-modal').classList.add('active');
      
      // Focus first input
      setTimeout(() => {
        const firstInput = document.getElementById('2fa-digit-1');
        if (firstInput) firstInput.focus();
      }, 100);
    }

    function close2FAVerifyModal() {
      document.getElementById('2fa-verify-modal').classList.remove('active');
    }

    function handle2FADigitInput(input, position) {
      const value = input.value.replace(/\D/g, '');
      input.value = value.slice(0, 1);
      
      if (value && position < 6) {
        const nextInput = document.getElementById(`2fa-digit-${position + 1}`);
        if (nextInput) nextInput.focus();
      }
      
      check2FACodeComplete();
    }

    function handle2FAKeydown(event, position) {
      if (event.key === 'Backspace' && !event.target.value && position > 1) {
        const prevInput = document.getElementById(`2fa-digit-${position - 1}`);
        if (prevInput) {
          prevInput.focus();
          prevInput.value = '';
        }
      }
    }

    function check2FACodeComplete() {
      let code = '';
      for (let i = 1; i <= 6; i++) {
        const input = document.getElementById(`2fa-digit-${i}`);
        code += input ? input.value : '';
      }
      
      const verifyBtn = document.getElementById('2fa-verify-btn');
      if (verifyBtn) {
        verifyBtn.disabled = code.length !== 6;
      }
    }

    function get2FACode() {
      let code = '';
      for (let i = 1; i <= 6; i++) {
        const input = document.getElementById(`2fa-digit-${i}`);
        code += input ? input.value : '';
      }
      return code;
    }

    async function verify2FACode() {
      const code = get2FACode();
      if (code.length !== 6) return;
      
      const btn = document.getElementById('2fa-verify-btn');
      const errorEl = document.getElementById('2fa-verify-error');
      
      btn.innerHTML = '⏳ Verifying...';
      btn.disabled = true;
      errorEl.style.display = 'none';
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          errorEl.textContent = 'Session expired. Please log in again.';
          errorEl.style.display = 'block';
          return;
        }
        
        // First verify the code
        const verifyResponse = await fetch('/api/2fa/verify-code', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ code: code })
        });
        
        const verifyData = await verifyResponse.json();
        
        if (!verifyData.success) {
          errorEl.textContent = verifyData.error || 'Invalid verification code';
          errorEl.style.display = 'block';
          btn.innerHTML = 'Verify & Enable 2FA';
          btn.disabled = false;
          return;
        }
        
        // Then enable 2FA
        const enableResponse = await fetch('/api/2fa/enable', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ phone: pending2FAPhone })
        });
        
        const enableData = await enableResponse.json();
        
        if (enableData.success) {
          close2FAVerifyModal();
          showToast('✅ Two-factor authentication enabled successfully!', 'success');
          load2FAStatus();
          document.getElementById('2fa-phone-input').value = '';
        } else {
          errorEl.textContent = enableData.error || 'Failed to enable 2FA';
          errorEl.style.display = 'block';
        }
      } catch (error) {
        console.error('Error verifying 2FA code:', error);
        errorEl.textContent = 'An error occurred. Please try again.';
        errorEl.style.display = 'block';
      } finally {
        btn.innerHTML = 'Verify & Enable 2FA';
        btn.disabled = false;
      }
    }

    async function resend2FACode() {
      const resendBtn = document.getElementById('2fa-resend-btn');
      if (!pending2FAPhone || !resendBtn) return;
      
      resendBtn.textContent = 'Sending...';
      resendBtn.disabled = true;
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          showToast('Session expired. Please log in again.', 'error');
          return;
        }
        
        const response = await fetch('/api/2fa/send-code', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ phone: pending2FAPhone })
        });
        
        const data = await response.json();
        
        if (data.success) {
          showToast('Verification code resent!', 'success');
        } else {
          showToast(data.error || 'Failed to resend code', 'error');
        }
      } catch (error) {
        console.error('Error resending 2FA code:', error);
        showToast('Failed to resend code. Please try again.', 'error');
      } finally {
        resendBtn.textContent = 'Resend Code';
        resendBtn.disabled = false;
      }
    }

    function open2FADisableModal() {
      document.getElementById('2fa-disable-modal').classList.add('active');
    }

    function close2FADisableModal() {
      document.getElementById('2fa-disable-modal').classList.remove('active');
    }

    async function confirm2FADisable() {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          showToast('Session expired. Please log in again.', 'error');
          return;
        }
        
        const response = await fetch('/api/2fa/disable', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({})
        });
        
        const data = await response.json();
        
        if (data.success) {
          close2FADisableModal();
          showToast('Two-factor authentication has been disabled.', 'success');
          load2FAStatus();
        } else {
          showToast(data.error || 'Failed to disable 2FA', 'error');
        }
      } catch (error) {
        console.error('Error disabling 2FA:', error);
        showToast('Failed to disable 2FA. Please try again.', 'error');
      }
    }

    async function logout() {
      await supabaseClient.auth.signOut();
      window.location.href = 'login.html';
    }

    // =============================================
    // MY NEXT CAR - Prospect Vehicle Functions
    // =============================================
    
    let prospectVehicles = [];
    let memberCarPreferences = null;
    let selectedProspectRating = 0;
    let editingProspectId = null;
    let selectedForComparison = new Set();

    function showProspectTab(tabName) {
      document.querySelectorAll('.prospect-tab-content').forEach(t => t.style.display = 'none');
      document.querySelectorAll('[data-prospect-tab]').forEach(t => t.classList.remove('active'));
      
      document.getElementById(tabName + '-tab').style.display = 'block';
      document.querySelector(`[data-prospect-tab="${tabName}"]`).classList.add('active');
      
      if (tabName === 'compare') {
        updateCompareSelection();
      } else if (tabName === 'preferences') {
        loadCarPreferences();
      } else if (tabName === 'ai-search') {
        loadDreamCarSearches();
      }
    }

    // =============================================
    // AI SEARCH - Dream Car Finder Functions
    // =============================================
    
    let dreamCarSearches = [];
    let dreamCarMatches = [];
    let editingSearchId = null;
    let currentMatchDetail = null;

    async function loadDreamCarSearches() {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        const { data, error } = await supabaseClient
          .from('dream_car_searches')
          .select('*')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        
        dreamCarSearches = data || [];
        renderDreamCarSearches();
        loadDreamCarMatches();
      } catch (error) {
        console.error('Error loading dream car searches:', error);
      }
    }

    async function loadDreamCarMatches(searchId = null) {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        let query = supabaseClient
          .from('dream_car_matches')
          .select('*')
          .eq('user_id', session.user.id)
          .eq('is_dismissed', false)
          .order('found_at', { ascending: false })
          .limit(50);

        if (searchId) {
          query = query.eq('search_id', searchId);
        }

        const { data, error } = await query;

        if (error) throw error;
        
        dreamCarMatches = data || [];
        renderDreamCarMatches();
      } catch (error) {
        console.error('Error loading dream car matches:', error);
      }
    }

    function renderDreamCarSearches() {
      const list = document.getElementById('ai-searches-list');
      
      if (dreamCarSearches.length === 0) {
        list.innerHTML = `
          <div class="empty-state" style="padding: 40px 20px;">
            <div class="empty-state-icon">🤖</div>
            <p>No AI searches yet.</p>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 8px;">Create a search and we'll automatically find matching cars for you.</p>
          </div>
        `;
        return;
      }

      list.innerHTML = dreamCarSearches.map(search => {
        const statusColor = search.is_active ? 'var(--accent-green)' : 'var(--text-muted)';
        const statusText = search.is_active ? 'Active' : 'Paused';
        const lastSearched = search.last_searched_at ? new Date(search.last_searched_at).toLocaleDateString() : 'Never';
        
        const criteriaParts = [];
        if (search.min_year || search.max_year) {
          criteriaParts.push(`${search.min_year || 'Any'} - ${search.max_year || 'Any'}`);
        }
        if (search.preferred_makes && search.preferred_makes.length > 0) {
          criteriaParts.push(search.preferred_makes.slice(0, 3).join(', '));
        }
        if (search.max_price) {
          criteriaParts.push('$' + Number(search.max_price).toLocaleString() + ' max');
        }
        if (search.max_mileage) {
          criteriaParts.push(Number(search.max_mileage).toLocaleString() + ' mi max');
        }
        
        const matchCount = dreamCarMatches.filter(m => m.search_id === search.id && !m.is_dismissed).length;

        return `
          <div style="background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 20px; margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
              <div style="flex: 1; min-width: 200px;">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                  <h4 style="font-size: 1rem; font-weight: 600;">${escapeHtml(search.search_name || 'Untitled Search')}</h4>
                  <span style="padding: 4px 10px; border-radius: 100px; font-size: 0.75rem; font-weight: 500; background: ${search.is_active ? 'var(--accent-green-soft)' : 'var(--bg-input)'}; color: ${statusColor};">
                    ${statusText}
                  </span>
                </div>
                <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 8px;">
                  ${criteriaParts.length > 0 ? criteriaParts.join(' • ') : 'No criteria set'}
                </p>
                <div style="display: flex; gap: 16px; font-size: 0.82rem; color: var(--text-muted);">
                  <span>📅 Last searched: ${lastSearched}</span>
                  <span>🎯 Matches: ${matchCount}</span>
                  <span>🔄 ${search.search_frequency === 'hourly' ? 'Every hour' : search.search_frequency === 'twice_daily' ? 'Twice daily' : 'Daily'}</span>
                </div>
              </div>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button class="btn btn-sm btn-secondary" onclick="viewSearchMatches('${search.id}')">
                  🎯 View Matches
                </button>
                <button class="btn btn-sm btn-secondary" onclick="editDreamCarSearch('${search.id}')">
                  ✏️ Edit
                </button>
                <button class="btn btn-sm btn-secondary" onclick="toggleSearchActive('${search.id}')">
                  ${search.is_active ? '⏸️ Pause' : '▶️ Resume'}
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteDreamCarSearch('${search.id}')">
                  🗑️
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    function renderDreamCarMatches() {
      const grid = document.getElementById('ai-matches-grid');
      const filter = document.getElementById('ai-matches-filter').value;
      
      let filtered = dreamCarMatches;
      if (filter === 'unseen') {
        filtered = dreamCarMatches.filter(m => !m.is_seen);
      } else if (filter === 'saved') {
        filtered = dreamCarMatches.filter(m => m.is_saved);
      }

      if (filtered.length === 0) {
        grid.innerHTML = `
          <div class="empty-state" style="padding: 40px 20px; grid-column: 1 / -1;">
            <div class="empty-state-icon">🚗</div>
            <p>No matches found yet.</p>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 8px;">Create an AI search and matches will appear here.</p>
          </div>
        `;
        return;
      }

      grid.innerHTML = filtered.map(match => {
        const photo = match.photos && match.photos.length > 0 ? match.photos[0] : null;
        const scoreColor = match.match_score >= 90 ? 'var(--accent-green)' : match.match_score >= 70 ? 'var(--accent-gold)' : 'var(--accent-blue)';
        
        return `
          <div class="vehicle-card" style="cursor: pointer;" onclick="viewMatchDetail('${match.id}')">
            <div class="vehicle-card-photo">
              ${photo ? `<img src="${escapeHtml(photo)}" alt="Car photo" onerror="this.parentNode.innerHTML='<div class=\\'vehicle-emoji\\'>🚗</div>'">` : '<div class="vehicle-emoji">🚗</div>'}
              <div style="position: absolute; top: 12px; right: 12px; padding: 6px 12px; border-radius: 100px; font-size: 0.8rem; font-weight: 600; background: linear-gradient(135deg, ${scoreColor}, ${scoreColor}88); color: white;">
                ${match.match_score || 0}% Match
              </div>
              ${!match.is_seen ? '<div style="position: absolute; top: 12px; left: 12px; width: 10px; height: 10px; background: var(--accent-blue); border-radius: 50%;"></div>' : ''}
            </div>
            <div class="vehicle-card-body">
              <h3 class="vehicle-card-title">${match.year || ''} ${escapeHtml(match.make || '')} ${escapeHtml(match.model || '')}</h3>
              <p class="vehicle-card-subtitle">${match.trim ? escapeHtml(match.trim) : ''}</p>
              <div class="vehicle-card-meta">
                ${match.price ? `<span>💰 $${Number(match.price).toLocaleString()}</span>` : ''}
                ${match.mileage ? `<span>🛣️ ${Number(match.mileage).toLocaleString()} mi</span>` : ''}
              </div>
              <div style="display: flex; gap: 8px; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px;">
                ${match.location ? `<span>📍 ${escapeHtml(match.location)}</span>` : ''}
                ${match.source ? `<span>🔗 ${escapeHtml(match.source)}</span>` : ''}
              </div>
              <div class="vehicle-card-actions" onclick="event.stopPropagation();">
                <button class="btn btn-sm ${match.is_seen ? 'btn-ghost' : 'btn-secondary'}" onclick="markMatchSeen('${match.id}', ${!match.is_seen})">
                  ${match.is_seen ? '👁️ Seen' : '👁️ Mark Seen'}
                </button>
                <button class="btn btn-sm ${match.is_saved ? 'btn-primary' : 'btn-secondary'}" onclick="saveMatch('${match.id}', ${!match.is_saved})">
                  ${match.is_saved ? '⭐ Saved' : '☆ Save'}
                </button>
                <button class="btn btn-sm btn-ghost" onclick="dismissMatch('${match.id}')" title="Dismiss">
                  ✕
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    function filterAIMatches() {
      renderDreamCarMatches();
    }

    function viewSearchMatches(searchId) {
      loadDreamCarMatches(searchId);
    }

    function openAISearchModal(searchId = null) {
      editingSearchId = searchId;
      const modal = document.getElementById('ai-search-modal');
      const titleEl = document.getElementById('ai-search-modal-title');
      const form = document.getElementById('ai-search-form');
      
      form.reset();
      document.getElementById('ai-search-id').value = '';
      
      document.querySelectorAll('input[name="ai-body-style"]').forEach(cb => cb.checked = false);
      document.querySelectorAll('input[name="ai-fuel-type"]').forEach(cb => cb.checked = false);
      document.getElementById('ai-search-notify-email').checked = true;
      document.getElementById('ai-search-active').checked = true;
      
      if (searchId) {
        titleEl.textContent = 'Edit AI Search';
        const search = dreamCarSearches.find(s => s.id === searchId);
        if (search) {
          document.getElementById('ai-search-id').value = search.id;
          document.getElementById('ai-search-name').value = search.search_name || '';
          document.getElementById('ai-search-min-year').value = search.min_year || '';
          document.getElementById('ai-search-max-year').value = search.max_year || '';
          document.getElementById('ai-search-min-price').value = search.min_price || '';
          document.getElementById('ai-search-max-price').value = search.max_price || '';
          document.getElementById('ai-search-max-mileage').value = search.max_mileage || '';
          document.getElementById('ai-search-makes').value = (search.preferred_makes || []).join(', ');
          document.getElementById('ai-search-models').value = (search.preferred_models || []).join(', ');
          document.getElementById('ai-search-zip').value = search.zip_code || '';
          document.getElementById('ai-search-radius').value = search.max_distance_miles || '';
          document.getElementById('ai-search-colors').value = (search.exterior_colors || []).join(', ');
          document.getElementById('ai-search-features').value = (search.must_have_features || []).join(', ');
          document.getElementById('ai-search-frequency').value = search.search_frequency || 'daily';
          document.getElementById('ai-search-notify-email').checked = search.notify_email !== false;
          document.getElementById('ai-search-notify-sms').checked = search.notify_sms === true;
          document.getElementById('ai-search-active').checked = search.is_active !== false;
          
          (search.body_styles || []).forEach(style => {
            const cb = document.querySelector(`input[name="ai-body-style"][value="${style}"]`);
            if (cb) cb.checked = true;
          });
          
          (search.fuel_types || []).forEach(type => {
            const cb = document.querySelector(`input[name="ai-fuel-type"][value="${type}"]`);
            if (cb) cb.checked = true;
          });
        }
      } else {
        titleEl.textContent = 'Create AI Search';
      }
      
      modal.classList.add('active');
    }

    function closeAISearchModal() {
      document.getElementById('ai-search-modal').classList.remove('active');
      editingSearchId = null;
    }

    function editDreamCarSearch(searchId) {
      openAISearchModal(searchId);
    }

    async function saveAISearch(event) {
      event.preventDefault();
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          showToast('Please log in to save search', 'error');
          return;
        }

        const bodyStyles = Array.from(document.querySelectorAll('input[name="ai-body-style"]:checked')).map(cb => cb.value);
        const fuelTypes = Array.from(document.querySelectorAll('input[name="ai-fuel-type"]:checked')).map(cb => cb.value);
        
        const searchData = {
          user_id: session.user.id,
          search_name: document.getElementById('ai-search-name').value.trim(),
          min_year: parseInt(document.getElementById('ai-search-min-year').value) || null,
          max_year: parseInt(document.getElementById('ai-search-max-year').value) || null,
          min_price: parseFloat(document.getElementById('ai-search-min-price').value) || null,
          max_price: parseFloat(document.getElementById('ai-search-max-price').value) || null,
          max_mileage: parseInt(document.getElementById('ai-search-max-mileage').value) || null,
          preferred_makes: document.getElementById('ai-search-makes').value.split(',').map(s => s.trim()).filter(s => s),
          preferred_models: document.getElementById('ai-search-models').value.split(',').map(s => s.trim()).filter(s => s),
          body_styles: bodyStyles,
          fuel_types: fuelTypes,
          zip_code: document.getElementById('ai-search-zip').value.trim() || null,
          max_distance_miles: parseInt(document.getElementById('ai-search-radius').value) || null,
          exterior_colors: document.getElementById('ai-search-colors').value.split(',').map(s => s.trim()).filter(s => s),
          must_have_features: document.getElementById('ai-search-features').value.split(',').map(s => s.trim()).filter(s => s),
          search_frequency: document.getElementById('ai-search-frequency').value,
          notify_email: document.getElementById('ai-search-notify-email').checked,
          notify_sms: document.getElementById('ai-search-notify-sms').checked,
          is_active: document.getElementById('ai-search-active').checked
        };

        const existingId = document.getElementById('ai-search-id').value;
        
        if (existingId) {
          const { error } = await supabaseClient
            .from('dream_car_searches')
            .update(searchData)
            .eq('id', existingId);
          
          if (error) throw error;
          showToast('Search updated successfully!', 'success');
        } else {
          const { error } = await supabaseClient
            .from('dream_car_searches')
            .insert([searchData]);
          
          if (error) throw error;
          showToast('Search created successfully!', 'success');
        }
        
        closeAISearchModal();
        loadDreamCarSearches();
      } catch (error) {
        console.error('Error saving AI search:', error);
        showToast('Failed to save search. Please try again.', 'error');
      }
    }

    async function deleteDreamCarSearch(searchId) {
      if (!confirm('Are you sure you want to delete this search? All matches will also be deleted.')) return;
      
      try {
        const { error } = await supabaseClient
          .from('dream_car_searches')
          .delete()
          .eq('id', searchId);
        
        if (error) throw error;
        
        showToast('Search deleted successfully!', 'success');
        loadDreamCarSearches();
      } catch (error) {
        console.error('Error deleting search:', error);
        showToast('Failed to delete search. Please try again.', 'error');
      }
    }

    async function toggleSearchActive(searchId) {
      try {
        const search = dreamCarSearches.find(s => s.id === searchId);
        if (!search) return;
        
        const { error } = await supabaseClient
          .from('dream_car_searches')
          .update({ is_active: !search.is_active })
          .eq('id', searchId);
        
        if (error) throw error;
        
        showToast(search.is_active ? 'Search paused' : 'Search resumed', 'success');
        loadDreamCarSearches();
      } catch (error) {
        console.error('Error toggling search:', error);
        showToast('Failed to update search. Please try again.', 'error');
      }
    }

    async function markMatchSeen(matchId, seen = true) {
      try {
        const { error } = await supabaseClient
          .from('dream_car_matches')
          .update({ is_seen: seen })
          .eq('id', matchId);
        
        if (error) throw error;
        
        const match = dreamCarMatches.find(m => m.id === matchId);
        if (match) match.is_seen = seen;
        renderDreamCarMatches();
      } catch (error) {
        console.error('Error marking match:', error);
      }
    }

    async function saveMatch(matchId, save = true) {
      try {
        const { error } = await supabaseClient
          .from('dream_car_matches')
          .update({ is_saved: save })
          .eq('id', matchId);
        
        if (error) throw error;
        
        const match = dreamCarMatches.find(m => m.id === matchId);
        if (match) match.is_saved = save;
        renderDreamCarMatches();
        showToast(save ? 'Match saved!' : 'Match unsaved', 'success');
      } catch (error) {
        console.error('Error saving match:', error);
      }
    }

    async function dismissMatch(matchId) {
      try {
        const { error } = await supabaseClient
          .from('dream_car_matches')
          .update({ is_dismissed: true })
          .eq('id', matchId);
        
        if (error) throw error;
        
        dreamCarMatches = dreamCarMatches.filter(m => m.id !== matchId);
        renderDreamCarMatches();
        showToast('Match dismissed', 'success');
      } catch (error) {
        console.error('Error dismissing match:', error);
      }
    }

    function viewMatchDetail(matchId) {
      const match = dreamCarMatches.find(m => m.id === matchId);
      if (!match) return;
      
      currentMatchDetail = match;
      markMatchSeen(matchId, true);
      
      const modal = document.getElementById('ai-match-detail-modal');
      const titleEl = document.getElementById('ai-match-modal-title');
      const bodyEl = document.getElementById('ai-match-modal-body');
      
      titleEl.textContent = `${match.year || ''} ${match.make || ''} ${match.model || ''}`.trim();
      
      const photo = match.photos && match.photos.length > 0 ? match.photos[0] : null;
      const scoreColor = match.match_score >= 90 ? 'var(--accent-green)' : match.match_score >= 70 ? 'var(--accent-gold)' : 'var(--accent-blue)';
      
      bodyEl.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
          <div>
            <div style="height: 200px; background: var(--bg-input); border-radius: var(--radius-md); overflow: hidden; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
              ${photo ? `<img src="${escapeHtml(photo)}" alt="Car photo" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.parentNode.innerHTML='<div style=\\'font-size: 60px;\\'>🚗</div>'">` : '<div style="font-size: 60px;">🚗</div>'}
            </div>
            ${match.photos && match.photos.length > 1 ? `
              <div style="display: flex; gap: 8px; overflow-x: auto;">
                ${match.photos.slice(1, 5).map(p => `
                  <img src="${escapeHtml(p)}" alt="Photo" style="width: 60px; height: 60px; object-fit: cover; border-radius: var(--radius-sm); cursor: pointer;" onerror="this.style.display='none'">
                `).join('')}
              </div>
            ` : ''}
          </div>
          <div>
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
              <div style="padding: 8px 16px; border-radius: 100px; font-size: 1rem; font-weight: 600; background: linear-gradient(135deg, ${scoreColor}, ${scoreColor}88); color: white;">
                ${match.match_score || 0}% Match
              </div>
              ${match.is_saved ? '<span style="color: var(--accent-gold);">⭐ Saved</span>' : ''}
            </div>
            <div style="display: grid; gap: 12px;">
              ${match.price ? `<div><span style="color: var(--text-muted);">Price:</span> <strong>$${Number(match.price).toLocaleString()}</strong></div>` : ''}
              ${match.mileage ? `<div><span style="color: var(--text-muted);">Mileage:</span> <strong>${Number(match.mileage).toLocaleString()} miles</strong></div>` : ''}
              ${match.exterior_color ? `<div><span style="color: var(--text-muted);">Color:</span> ${escapeHtml(match.exterior_color)}</div>` : ''}
              ${match.location ? `<div><span style="color: var(--text-muted);">Location:</span> ${escapeHtml(match.location)}</div>` : ''}
              ${match.seller_type ? `<div><span style="color: var(--text-muted);">Seller:</span> ${match.seller_type === 'dealer' ? 'Dealer' : match.seller_type === 'private' ? 'Private' : 'Other'}</div>` : ''}
              ${match.source ? `<div><span style="color: var(--text-muted);">Source:</span> ${escapeHtml(match.source)}</div>` : ''}
            </div>
            ${match.listing_url ? `
              <a href="${escapeHtml(match.listing_url)}" target="_blank" rel="noopener" class="btn btn-secondary" style="margin-top: 16px; width: 100%; justify-content: center;">
                🔗 View Original Listing
              </a>
            ` : ''}
          </div>
        </div>
        ${match.match_reasons && match.match_reasons.length > 0 ? `
          <div style="margin-top: 20px; padding: 16px; background: var(--bg-input); border-radius: var(--radius-md);">
            <h4 style="font-size: 0.9rem; font-weight: 600; margin-bottom: 12px; color: var(--accent-gold);">Why this matches:</h4>
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
              ${match.match_reasons.map(r => `<span style="padding: 4px 10px; background: var(--accent-gold-soft); color: var(--accent-gold); border-radius: 100px; font-size: 0.82rem;">✓ ${escapeHtml(r)}</span>`).join('')}
            </div>
          </div>
        ` : ''}
      `;
      
      modal.classList.add('active');
    }

    function closeAIMatchModal() {
      document.getElementById('ai-match-detail-modal').classList.remove('active');
      currentMatchDetail = null;
    }

    async function addMatchToProspects() {
      if (!currentMatchDetail) return;
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          showToast('Please log in', 'error');
          return;
        }

        const prospectData = {
          user_id: session.user.id,
          year: parseInt(currentMatchDetail.year) || null,
          make: currentMatchDetail.make,
          model: currentMatchDetail.model,
          trim: currentMatchDetail.trim,
          asking_price: currentMatchDetail.price,
          mileage: currentMatchDetail.mileage,
          exterior_color: currentMatchDetail.exterior_color,
          seller_location: currentMatchDetail.location,
          seller_type: currentMatchDetail.seller_type,
          listing_url: currentMatchDetail.listing_url,
          photos: currentMatchDetail.photos || [],
          status: 'considering'
        };

        const { error } = await supabaseClient
          .from('prospect_vehicles')
          .insert([prospectData]);

        if (error) throw error;

        showToast('Added to prospects!', 'success');
        closeAIMatchModal();
        loadProspectVehicles();
      } catch (error) {
        console.error('Error adding to prospects:', error);
        showToast('Failed to add to prospects', 'error');
      }
    }

    async function loadProspectVehicles() {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        const { data, error } = await supabaseClient
          .from('prospect_vehicles')
          .select('*')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        
        prospectVehicles = data || [];
        renderProspects();
        updateProspectCount();
      } catch (error) {
        console.error('Error loading prospects:', error);
      }
    }

    function updateProspectCount() {
      const countEl = document.getElementById('prospect-count');
      const activeCount = prospectVehicles.filter(p => p.status === 'considering' || p.status === 'test_driven').length;
      if (activeCount > 0) {
        countEl.textContent = activeCount;
        countEl.style.display = 'inline-block';
      } else {
        countEl.style.display = 'none';
      }
    }

    function renderProspects() {
      const grid = document.getElementById('prospects-grid');
      const filter = document.getElementById('prospect-filter').value;
      
      let filtered = prospectVehicles;
      if (filter !== 'all') {
        filtered = prospectVehicles.filter(p => p.status === filter);
      }

      if (filtered.length === 0) {
        grid.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">🚘</div>
            <p>No prospect vehicles ${filter !== 'all' ? 'with this status' : 'yet'}.</p>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 8px;">Add vehicles you're considering to compare them.</p>
          </div>
        `;
        return;
      }

      grid.innerHTML = filtered.map(p => {
        const matchScore = calculateMatchScore(p);
        const statusColors = {
          considering: 'var(--accent-blue)',
          test_driven: 'var(--accent-orange)',
          offer_made: '#a855f7',
          purchased: 'var(--accent-green)',
          passed: 'var(--text-muted)'
        };
        const statusLabels = {
          considering: 'Considering',
          test_driven: 'Test Driven',
          offer_made: 'Offer Made',
          purchased: 'Purchased',
          passed: 'Passed'
        };
        
        return `
          <div class="vehicle-card" style="cursor: pointer;" onclick="viewProspect('${p.id}')">
            <div class="vehicle-card-photo">
              <div class="vehicle-emoji">🚘</div>
              ${p.is_favorite ? '<div style="position:absolute;top:12px;left:12px;font-size:24px;">❤️</div>' : ''}
              <div class="vehicle-card-badge" style="background:${statusColors[p.status] || statusColors.considering};color:${p.status === 'passed' ? 'var(--text-primary)' : '#fff'};">${statusLabels[p.status] || 'Considering'}</div>
            </div>
            <div class="vehicle-card-body">
              <div class="vehicle-card-title">${p.year || ''} ${p.make || ''} ${p.model || ''}</div>
              <div class="vehicle-card-subtitle">${p.trim || ''} ${p.body_style ? '• ' + p.body_style : ''}</div>
              <div class="vehicle-card-meta">
                ${p.mileage ? `<span>🛣️ ${Number(p.mileage).toLocaleString()} mi</span>` : ''}
                ${p.asking_price ? `<span>💰 $${Number(p.asking_price).toLocaleString()}</span>` : ''}
                ${p.carfax_accidents !== null ? `<span>⚠️ ${p.carfax_accidents} accidents</span>` : ''}
              </div>
              ${matchScore !== null ? `
                <div style="margin-top:12px;padding:8px 12px;background:${matchScore >= 80 ? 'var(--accent-green-soft)' : matchScore >= 50 ? 'var(--accent-orange-soft)' : 'rgba(239,95,95,0.15)'};border-radius:var(--radius-sm);display:inline-flex;align-items:center;gap:6px;">
                  <span style="font-weight:600;color:${matchScore >= 80 ? 'var(--accent-green)' : matchScore >= 50 ? 'var(--accent-orange)' : 'var(--accent-red)'};">${matchScore}% Match</span>
                </div>
              ` : ''}
              ${p.personal_rating ? `
                <div style="margin-top:8px;color:var(--accent-gold);">
                  ${'⭐'.repeat(p.personal_rating)}${'☆'.repeat(5 - p.personal_rating)}
                </div>
              ` : ''}
              <div class="vehicle-card-actions" onclick="event.stopPropagation();">
                <button class="btn btn-sm btn-secondary" onclick="editProspect('${p.id}')">✏️ Edit</button>
                <button class="btn btn-sm btn-ghost" onclick="toggleFavorite('${p.id}')" title="${p.is_favorite ? 'Remove from favorites' : 'Add to favorites'}">${p.is_favorite ? '❤️' : '🤍'}</button>
                <button class="btn btn-sm btn-danger" onclick="deleteProspect('${p.id}')">🗑️</button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    function filterProspects() {
      renderProspects();
    }

    function calculateMatchScore(prospect) {
      if (!memberCarPreferences) return null;
      
      let score = 0;
      let factors = 0;

      if (memberCarPreferences.min_budget && memberCarPreferences.max_budget && prospect.asking_price) {
        factors++;
        if (prospect.asking_price >= memberCarPreferences.min_budget && prospect.asking_price <= memberCarPreferences.max_budget) {
          score += 100;
        } else if (prospect.asking_price < memberCarPreferences.min_budget) {
          score += 80;
        } else {
          const overBudget = prospect.asking_price - memberCarPreferences.max_budget;
          const percentage = (overBudget / memberCarPreferences.max_budget) * 100;
          score += Math.max(0, 100 - percentage * 2);
        }
      }

      if (memberCarPreferences.min_year && prospect.year) {
        factors++;
        score += prospect.year >= memberCarPreferences.min_year ? 100 : 50;
      }

      if (memberCarPreferences.max_mileage && prospect.mileage) {
        factors++;
        if (prospect.mileage <= memberCarPreferences.max_mileage) {
          score += 100;
        } else {
          const overMileage = prospect.mileage - memberCarPreferences.max_mileage;
          const percentage = (overMileage / memberCarPreferences.max_mileage) * 100;
          score += Math.max(0, 100 - percentage);
        }
      }

      if (memberCarPreferences.preferred_makes && memberCarPreferences.preferred_makes.length > 0 && prospect.make) {
        factors++;
        if (memberCarPreferences.preferred_makes.some(m => m.toLowerCase() === prospect.make.toLowerCase())) {
          score += 100;
        } else {
          score += 30;
        }
      }

      if (memberCarPreferences.fuel_preference && prospect.fuel_type) {
        factors++;
        score += memberCarPreferences.fuel_preference === prospect.fuel_type ? 100 : 50;
      }

      if (factors === 0) return null;
      return Math.round(score / factors);
    }

    function openAddProspectModal() {
      editingProspectId = null;
      document.getElementById('add-prospect-form').reset();
      selectedProspectRating = 0;
      updateRatingStars();
      document.getElementById('add-prospect-modal').style.display = 'flex';
    }

    function closeAddProspectModal() {
      document.getElementById('add-prospect-modal').style.display = 'none';
      editingProspectId = null;
    }

    function setProspectRating(rating) {
      selectedProspectRating = rating;
      document.getElementById('prospect-rating').value = rating;
      updateRatingStars();
    }

    function updateRatingStars() {
      document.querySelectorAll('#prospect-rating-stars .rating-star').forEach(star => {
        const r = parseInt(star.dataset.rating);
        star.style.opacity = r <= selectedProspectRating ? '1' : '0.3';
      });
    }

    async function lookupProspectVIN() {
      const vin = document.getElementById('prospect-vin-lookup').value.trim().toUpperCase();
      if (!vin || vin.length !== 17) {
        showToast('Please enter a valid 17-character VIN', 'error');
        return;
      }

      const btn = document.getElementById('vin-lookup-btn');
      btn.disabled = true;
      btn.textContent = '⏳ Looking up...';

      try {
        const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`);
        const data = await response.json();
        
        if (data.Results) {
          const getValue = (varName) => {
            const item = data.Results.find(r => r.Variable === varName);
            return item && item.Value && item.Value !== 'Not Applicable' ? item.Value : '';
          };

          document.getElementById('prospect-year').value = getValue('Model Year');
          document.getElementById('prospect-make').value = getValue('Make');
          document.getElementById('prospect-model').value = getValue('Model');
          document.getElementById('prospect-trim').value = getValue('Trim');
          document.getElementById('prospect-body-style').value = getValue('Body Class') || '';
          
          const displacement = getValue('Displacement (L)');
          const cylinders = getValue('Engine Number of Cylinders');
          const engineConfig = getValue('Engine Configuration');
          let engine = '';
          if (displacement) engine += displacement + 'L ';
          if (cylinders) engine += cylinders + '-cyl ';
          if (engineConfig) engine += engineConfig;
          document.getElementById('prospect-engine').value = engine.trim();
          
          const fuelType = getValue('Fuel Type - Primary');
          if (fuelType) {
            const fuelSelect = document.getElementById('prospect-fuel-type');
            for (let opt of fuelSelect.options) {
              if (fuelType.toLowerCase().includes(opt.value.toLowerCase())) {
                fuelSelect.value = opt.value;
                break;
              }
            }
          }
          
          document.getElementById('prospect-vin').value = vin;
          
          showToast('Vehicle specs loaded from VIN!', 'success');
        }
      } catch (error) {
        console.error('VIN lookup error:', error);
        showToast('Failed to lookup VIN. Please try again.', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '🔍 Lookup';
      }
    }

    async function saveProspectVehicle(e) {
      e.preventDefault();
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          showToast('Please log in to save vehicles', 'error');
          return;
        }

        const prospectData = {
          user_id: session.user.id,
          vin: document.getElementById('prospect-vin').value.trim().toUpperCase() || null,
          year: parseInt(document.getElementById('prospect-year').value) || null,
          make: document.getElementById('prospect-make').value.trim() || null,
          model: document.getElementById('prospect-model').value.trim() || null,
          trim: document.getElementById('prospect-trim').value.trim() || null,
          body_style: document.getElementById('prospect-body-style').value || null,
          engine: document.getElementById('prospect-engine').value.trim() || null,
          fuel_type: document.getElementById('prospect-fuel-type').value || null,
          mileage: parseInt(document.getElementById('prospect-mileage').value) || null,
          asking_price: parseFloat(document.getElementById('prospect-price').value) || null,
          exterior_color: document.getElementById('prospect-ext-color').value.trim() || null,
          interior_color: document.getElementById('prospect-int-color').value.trim() || null,
          seller_type: document.getElementById('prospect-seller-type').value || null,
          seller_name: document.getElementById('prospect-seller-name').value.trim() || null,
          seller_location: document.getElementById('prospect-location').value.trim() || null,
          listing_url: document.getElementById('prospect-listing-url').value.trim() || null,
          carfax_accidents: parseInt(document.getElementById('prospect-accidents').value) || 0,
          carfax_owners: parseInt(document.getElementById('prospect-owners').value) || null,
          carfax_service_records: document.getElementById('prospect-service-records').checked,
          carfax_notes: document.getElementById('prospect-carfax-notes').value.trim() || null,
          personal_rating: selectedProspectRating || null,
          personal_notes: document.getElementById('prospect-notes').value.trim() || null
        };

        // Preserve existing status when editing, or set to 'considering' for new prospects
        if (editingProspectId) {
          const existingProspect = prospectVehicles.find(p => p.id === editingProspectId);
          if (existingProspect) {
            prospectData.status = existingProspect.status;
          }
        } else {
          prospectData.status = 'considering';
        }

        let result;
        if (editingProspectId) {
          result = await supabaseClient
            .from('prospect_vehicles')
            .update(prospectData)
            .eq('id', editingProspectId)
            .eq('user_id', session.user.id);
        } else {
          result = await supabaseClient
            .from('prospect_vehicles')
            .insert(prospectData);
        }

        if (result.error) throw result.error;

        showToast(editingProspectId ? 'Prospect updated!' : 'Prospect added!', 'success');
        closeAddProspectModal();
        await loadProspectVehicles();
      } catch (error) {
        console.error('Error saving prospect:', error);
        showToast('Failed to save prospect: ' + error.message, 'error');
      }
    }

    async function editProspect(id) {
      const prospect = prospectVehicles.find(p => p.id === id);
      if (!prospect) return;

      editingProspectId = id;
      
      document.getElementById('prospect-vin').value = prospect.vin || '';
      document.getElementById('prospect-year').value = prospect.year || '';
      document.getElementById('prospect-make').value = prospect.make || '';
      document.getElementById('prospect-model').value = prospect.model || '';
      document.getElementById('prospect-trim').value = prospect.trim || '';
      document.getElementById('prospect-body-style').value = prospect.body_style || '';
      document.getElementById('prospect-engine').value = prospect.engine || '';
      document.getElementById('prospect-fuel-type').value = prospect.fuel_type || '';
      document.getElementById('prospect-mileage').value = prospect.mileage || '';
      document.getElementById('prospect-price').value = prospect.asking_price || '';
      document.getElementById('prospect-ext-color').value = prospect.exterior_color || '';
      document.getElementById('prospect-int-color').value = prospect.interior_color || '';
      document.getElementById('prospect-seller-type').value = prospect.seller_type || '';
      document.getElementById('prospect-seller-name').value = prospect.seller_name || '';
      document.getElementById('prospect-location').value = prospect.seller_location || '';
      document.getElementById('prospect-listing-url').value = prospect.listing_url || '';
      document.getElementById('prospect-accidents').value = prospect.carfax_accidents || '';
      document.getElementById('prospect-owners').value = prospect.carfax_owners || '';
      document.getElementById('prospect-service-records').checked = prospect.carfax_service_records || false;
      document.getElementById('prospect-carfax-notes').value = prospect.carfax_notes || '';
      document.getElementById('prospect-notes').value = prospect.personal_notes || '';
      
      selectedProspectRating = prospect.personal_rating || 0;
      document.getElementById('prospect-rating').value = selectedProspectRating;
      updateRatingStars();

      document.getElementById('add-prospect-modal').style.display = 'flex';
    }

    async function deleteProspect(id) {
      if (!confirm('Are you sure you want to delete this prospect?')) return;

      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        const { error } = await supabaseClient
          .from('prospect_vehicles')
          .delete()
          .eq('id', id)
          .eq('user_id', session.user.id);

        if (error) throw error;

        showToast('Prospect deleted', 'success');
        await loadProspectVehicles();
      } catch (error) {
        console.error('Error deleting prospect:', error);
        showToast('Failed to delete prospect', 'error');
      }
    }

    async function toggleFavorite(id) {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        const prospect = prospectVehicles.find(p => p.id === id);
        if (!prospect) return;

        const { error } = await supabaseClient
          .from('prospect_vehicles')
          .update({ is_favorite: !prospect.is_favorite })
          .eq('id', id)
          .eq('user_id', session.user.id);

        if (error) throw error;

        await loadProspectVehicles();
      } catch (error) {
        console.error('Error toggling favorite:', error);
      }
    }

    function viewProspect(id) {
      const prospect = prospectVehicles.find(p => p.id === id);
      if (!prospect) return;

      const matchScore = calculateMatchScore(prospect);
      const statusLabels = {
        considering: 'Considering',
        test_driven: 'Test Driven',
        offer_made: 'Offer Made',
        purchased: 'Purchased',
        passed: 'Passed'
      };

      document.getElementById('view-prospect-title').textContent = `${prospect.year || ''} ${prospect.make || ''} ${prospect.model || ''}`.trim() || 'Prospect Details';
      
      document.getElementById('view-prospect-body').innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
          <div>
            <h4 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:12px;">Vehicle Info</h4>
            <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);border:1px solid var(--border-subtle);">
              <p style="margin-bottom:8px;"><strong>Year:</strong> ${prospect.year || 'N/A'}</p>
              <p style="margin-bottom:8px;"><strong>Make:</strong> ${prospect.make || 'N/A'}</p>
              <p style="margin-bottom:8px;"><strong>Model:</strong> ${prospect.model || 'N/A'}</p>
              <p style="margin-bottom:8px;"><strong>Trim:</strong> ${prospect.trim || 'N/A'}</p>
              <p style="margin-bottom:8px;"><strong>Body Style:</strong> ${prospect.body_style || 'N/A'}</p>
              <p style="margin-bottom:8px;"><strong>Engine:</strong> ${prospect.engine || 'N/A'}</p>
              <p style="margin-bottom:8px;"><strong>Fuel Type:</strong> ${prospect.fuel_type || 'N/A'}</p>
              <p style="margin-bottom:8px;"><strong>Mileage:</strong> ${prospect.mileage ? Number(prospect.mileage).toLocaleString() + ' mi' : 'N/A'}</p>
              <p style="margin-bottom:8px;"><strong>Colors:</strong> ${prospect.exterior_color || '?'} / ${prospect.interior_color || '?'}</p>
              ${prospect.vin ? `<p style="margin-bottom:0;"><strong>VIN:</strong> ${prospect.vin}</p>` : ''}
            </div>
          </div>
          <div>
            <h4 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:12px;">Pricing & Seller</h4>
            <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);border:1px solid var(--border-subtle);">
              <p style="font-size:1.5rem;font-weight:700;color:var(--accent-gold);margin-bottom:12px;">${prospect.asking_price ? '$' + Number(prospect.asking_price).toLocaleString() : 'Price TBD'}</p>
              <p style="margin-bottom:8px;"><strong>Seller:</strong> ${prospect.seller_name || 'Unknown'} (${prospect.seller_type || 'N/A'})</p>
              <p style="margin-bottom:8px;"><strong>Location:</strong> ${prospect.seller_location || 'N/A'}</p>
              ${prospect.listing_url ? `<p style="margin-bottom:0;"><a href="${prospect.listing_url}" target="_blank" style="color:var(--accent-blue);">View Listing →</a></p>` : ''}
            </div>
          </div>
        </div>

        <div style="margin-top:24px;">
          <h4 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:12px;">Vehicle History (Carfax)</h4>
          <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);border:1px solid var(--border-subtle);display:grid;grid-template-columns:repeat(3,1fr);gap:16px;">
            <div style="text-align:center;">
              <div style="font-size:2rem;margin-bottom:4px;color:${prospect.carfax_accidents === 0 ? 'var(--accent-green)' : prospect.carfax_accidents <= 1 ? 'var(--accent-orange)' : 'var(--accent-red)'};">${prospect.carfax_accidents ?? '?'}</div>
              <div style="font-size:0.85rem;color:var(--text-muted);">Accidents</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:2rem;margin-bottom:4px;color:var(--text-primary);">${prospect.carfax_owners ?? '?'}</div>
              <div style="font-size:0.85rem;color:var(--text-muted);">Owners</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:2rem;margin-bottom:4px;">${prospect.carfax_service_records ? '✅' : '❌'}</div>
              <div style="font-size:0.85rem;color:var(--text-muted);">Service Records</div>
            </div>
          </div>
          ${prospect.carfax_notes ? `<p style="margin-top:12px;font-size:0.9rem;color:var(--text-secondary);">${prospect.carfax_notes}</p>` : ''}
        </div>

        <div style="margin-top:24px;display:flex;gap:24px;flex-wrap:wrap;">
          <div style="flex:1;min-width:200px;">
            <h4 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:12px;">Your Rating</h4>
            <div style="font-size:28px;color:var(--accent-gold);">
              ${prospect.personal_rating ? '⭐'.repeat(prospect.personal_rating) + '☆'.repeat(5 - prospect.personal_rating) : '☆☆☆☆☆'}
            </div>
          </div>
          ${matchScore !== null ? `
          <div style="flex:1;min-width:200px;">
            <h4 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:12px;">Match Score</h4>
            <div style="font-size:2.5rem;font-weight:700;color:${matchScore >= 80 ? 'var(--accent-green)' : matchScore >= 50 ? 'var(--accent-orange)' : 'var(--accent-red)'};">${matchScore}%</div>
          </div>
          ` : ''}
          <div style="flex:1;min-width:200px;">
            <h4 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:12px;">Status</h4>
            <select onchange="updateProspectStatus('${prospect.id}', this.value)" style="padding:10px 16px;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);color:var(--text-primary);">
              <option value="considering" ${prospect.status === 'considering' ? 'selected' : ''}>Considering</option>
              <option value="test_driven" ${prospect.status === 'test_driven' ? 'selected' : ''}>Test Driven</option>
              <option value="offer_made" ${prospect.status === 'offer_made' ? 'selected' : ''}>Offer Made</option>
              <option value="purchased" ${prospect.status === 'purchased' ? 'selected' : ''}>Purchased</option>
              <option value="passed" ${prospect.status === 'passed' ? 'selected' : ''}>Passed</option>
            </select>
          </div>
        </div>

        ${prospect.personal_notes ? `
        <div style="margin-top:24px;">
          <h4 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:12px;">Your Notes</h4>
          <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);border:1px solid var(--border-subtle);color:var(--text-secondary);line-height:1.6;">${prospect.personal_notes}</div>
        </div>
        ` : ''}

        <div style="margin-top:24px;display:flex;gap:12px;flex-wrap:wrap;">
          <button class="btn btn-primary" onclick="editProspect('${prospect.id}');closeViewProspectModal();">✏️ Edit</button>
          <button class="btn btn-secondary" onclick="toggleFavorite('${prospect.id}');closeViewProspectModal();">${prospect.is_favorite ? '❤️ Unfavorite' : '🤍 Favorite'}</button>
          <button class="btn btn-danger" onclick="deleteProspect('${prospect.id}');closeViewProspectModal();">🗑️ Delete</button>
        </div>
      `;

      document.getElementById('view-prospect-modal').style.display = 'flex';
    }

    function closeViewProspectModal() {
      document.getElementById('view-prospect-modal').style.display = 'none';
    }

    async function updateProspectStatus(id, status) {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        const { error } = await supabaseClient
          .from('prospect_vehicles')
          .update({ status })
          .eq('id', id)
          .eq('user_id', session.user.id);

        if (error) throw error;
        
        showToast('Status updated', 'success');
        await loadProspectVehicles();
      } catch (error) {
        console.error('Error updating status:', error);
      }
    }

    function updateCompareSelection() {
      const container = document.getElementById('compare-selection');
      
      if (prospectVehicles.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem;">Add prospect vehicles first to compare them.</p>';
        document.getElementById('compare-btn').disabled = true;
        return;
      }

      container.innerHTML = prospectVehicles.map(p => `
        <label style="display:flex;align-items:center;gap:8px;padding:10px 16px;background:var(--bg-input);border:1px solid ${selectedForComparison.has(p.id) ? 'var(--accent-gold)' : 'var(--border-subtle)'};border-radius:var(--radius-md);cursor:pointer;transition:all 0.2s;">
          <input type="checkbox" ${selectedForComparison.has(p.id) ? 'checked' : ''} onchange="toggleCompareSelection('${p.id}')" style="width:18px;height:18px;accent-color:var(--accent-gold);">
          <span>${p.year || ''} ${p.make || ''} ${p.model || ''}</span>
        </label>
      `).join('');

      document.getElementById('compare-btn').disabled = selectedForComparison.size < 2;
    }

    function toggleCompareSelection(id) {
      if (selectedForComparison.has(id)) {
        selectedForComparison.delete(id);
      } else {
        if (selectedForComparison.size >= 4) {
          showToast('Maximum 4 vehicles for comparison', 'error');
          return;
        }
        selectedForComparison.add(id);
      }
      updateCompareSelection();
    }

    function generateComparison() {
      if (selectedForComparison.size < 2) {
        showToast('Select at least 2 vehicles to compare', 'error');
        return;
      }

      const selected = prospectVehicles.filter(p => selectedForComparison.has(p.id));
      
      const thead = document.getElementById('comparison-thead');
      const tbody = document.getElementById('comparison-tbody');
      
      thead.innerHTML = `
        <tr>
          <th style="padding:12px 16px;text-align:left;background:var(--bg-input);border-bottom:1px solid var(--border-subtle);font-weight:600;color:var(--text-muted);font-size:0.85rem;">Attribute</th>
          ${selected.map(p => `<th style="padding:12px 16px;text-align:center;background:var(--bg-input);border-bottom:1px solid var(--border-subtle);font-weight:600;">${p.year || ''} ${p.make || ''} ${p.model || ''}</th>`).join('')}
        </tr>
      `;

      const rows = [
        { label: 'Asking Price', key: 'asking_price', format: v => v ? '$' + Number(v).toLocaleString() : 'N/A', best: 'low' },
        { label: 'Mileage', key: 'mileage', format: v => v ? Number(v).toLocaleString() + ' mi' : 'N/A', best: 'low' },
        { label: 'Year', key: 'year', format: v => v || 'N/A', best: 'high' },
        { label: 'Trim', key: 'trim', format: v => v || 'N/A' },
        { label: 'Engine', key: 'engine', format: v => v || 'N/A' },
        { label: 'Fuel Type', key: 'fuel_type', format: v => v || 'N/A' },
        { label: 'Body Style', key: 'body_style', format: v => v || 'N/A' },
        { label: 'Exterior Color', key: 'exterior_color', format: v => v || 'N/A' },
        { label: 'Accidents', key: 'carfax_accidents', format: v => v !== null ? v : 'N/A', best: 'low' },
        { label: 'Previous Owners', key: 'carfax_owners', format: v => v || 'N/A', best: 'low' },
        { label: 'Service Records', key: 'carfax_service_records', format: v => v ? '✅ Yes' : '❌ No' },
        { label: 'Your Rating', key: 'personal_rating', format: v => v ? '⭐'.repeat(v) : 'N/A', best: 'high' },
        { label: 'Match Score', key: null, format: (v, p) => { const s = calculateMatchScore(p); return s !== null ? s + '%' : 'N/A'; }, best: 'high', isComputed: true }
      ];

      tbody.innerHTML = rows.map(row => {
        const values = selected.map(p => row.isComputed ? row.format(null, p) : row.format(p[row.key]));
        const numericValues = selected.map(p => {
          if (row.isComputed) return calculateMatchScore(p);
          return typeof p[row.key] === 'number' ? p[row.key] : null;
        });
        
        let bestIdx = -1;
        if (row.best && numericValues.some(v => v !== null)) {
          const validValues = numericValues.filter(v => v !== null);
          if (row.best === 'low') {
            const minVal = Math.min(...validValues);
            bestIdx = numericValues.indexOf(minVal);
          } else {
            const maxVal = Math.max(...validValues);
            bestIdx = numericValues.indexOf(maxVal);
          }
        }

        return `
          <tr>
            <td style="padding:12px 16px;border-bottom:1px solid var(--border-subtle);font-weight:500;">${row.label}</td>
            ${values.map((v, i) => `
              <td style="padding:12px 16px;text-align:center;border-bottom:1px solid var(--border-subtle);${bestIdx === i ? 'color:var(--accent-green);font-weight:600;' : ''}">${v}</td>
            `).join('')}
          </tr>
        `;
      }).join('');

      document.getElementById('comparison-results').style.display = 'block';
    }

    async function loadCarPreferences() {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        const { data, error } = await supabaseClient
          .from('member_car_preferences')
          .select('*')
          .eq('user_id', session.user.id)
          .single();

        if (error && error.code !== 'PGRST116') throw error;
        
        memberCarPreferences = data;
        
        if (data) {
          document.getElementById('pref-min-budget').value = data.min_budget || '';
          document.getElementById('pref-max-budget').value = data.max_budget || '';
          document.getElementById('pref-min-year').value = data.min_year || '';
          document.getElementById('pref-max-year').value = data.max_year || '';
          document.getElementById('pref-max-mileage').value = data.max_mileage || '';
          document.getElementById('pref-fuel').value = data.fuel_preference || '';
          document.getElementById('pref-transmission').value = data.transmission_preference || '';
          document.getElementById('pref-drivetrain').value = data.drivetrain_preference || '';
          document.getElementById('pref-makes').value = (data.preferred_makes || []).join(', ');
          document.getElementById('pref-must-have').value = (data.must_have_features || []).join(', ');
          document.getElementById('pref-deal-breakers').value = (data.deal_breakers || []).join(', ');
          document.getElementById('pref-notes').value = data.notes || '';
        }
      } catch (error) {
        console.error('Error loading preferences:', error);
      }
    }

    async function saveCarPreferences(e) {
      e.preventDefault();
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          showToast('Please log in to save preferences', 'error');
          return;
        }

        const parseList = (val) => val ? val.split(',').map(s => s.trim()).filter(s => s) : [];

        const prefData = {
          user_id: session.user.id,
          min_budget: parseFloat(document.getElementById('pref-min-budget').value) || null,
          max_budget: parseFloat(document.getElementById('pref-max-budget').value) || null,
          min_year: parseInt(document.getElementById('pref-min-year').value) || null,
          max_year: parseInt(document.getElementById('pref-max-year').value) || null,
          max_mileage: parseInt(document.getElementById('pref-max-mileage').value) || null,
          fuel_preference: document.getElementById('pref-fuel').value || null,
          transmission_preference: document.getElementById('pref-transmission').value || null,
          drivetrain_preference: document.getElementById('pref-drivetrain').value || null,
          preferred_makes: parseList(document.getElementById('pref-makes').value),
          must_have_features: parseList(document.getElementById('pref-must-have').value),
          deal_breakers: parseList(document.getElementById('pref-deal-breakers').value),
          notes: document.getElementById('pref-notes').value.trim() || null
        };

        const { data: existing } = await supabaseClient
          .from('member_car_preferences')
          .select('id')
          .eq('user_id', session.user.id)
          .single();

        let result;
        if (existing) {
          result = await supabaseClient
            .from('member_car_preferences')
            .update(prefData)
            .eq('user_id', session.user.id);
        } else {
          result = await supabaseClient
            .from('member_car_preferences')
            .insert(prefData);
        }

        if (result.error) throw result.error;

        memberCarPreferences = prefData;
        showToast('Preferences saved!', 'success');
        renderProspects();
      } catch (error) {
        console.error('Error saving preferences:', error);
        showToast('Failed to save preferences: ' + error.message, 'error');
      }
    }

    function clearCarPreferences() {
      document.getElementById('preferences-form').reset();
    }

    // Load prospects when My Next Car section is shown
    const originalShowSection = showSection;
    showSection = function(sectionId) {
      originalShowSection(sectionId);
      if (sectionId === 'my-next-car') {
        loadProspectVehicles();
        loadCarPreferences();
      }
      if (sectionId === 'shop') {
        loadShopProducts();
      }
    };

    // ========== SHOP SECTION ==========
    let shopCart = [];
    let shopProducts = [];
    let currentShopFilter = 'all';

    // Placeholder products (will be replaced with Printful API data)
    const placeholderProducts = [
      {
        id: 'prod_1',
        name: 'MCC Classic Logo T-Shirt',
        category: 'apparel',
        price: 29.99,
        image: null,
        variants: [
          { id: 'var_1a', name: 'Small', price: 29.99 },
          { id: 'var_1b', name: 'Medium', price: 29.99 },
          { id: 'var_1c', name: 'Large', price: 29.99 },
          { id: 'var_1d', name: 'XL', price: 29.99 }
        ]
      },
      {
        id: 'prod_2',
        name: 'MCC Premium Hoodie',
        category: 'apparel',
        price: 59.99,
        image: null,
        variants: [
          { id: 'var_2a', name: 'Small', price: 59.99 },
          { id: 'var_2b', name: 'Medium', price: 59.99 },
          { id: 'var_2c', name: 'Large', price: 59.99 },
          { id: 'var_2d', name: 'XL', price: 59.99 }
        ]
      },
      {
        id: 'prod_3',
        name: 'MCC Performance Cap',
        category: 'accessories',
        price: 24.99,
        image: null,
        variants: [
          { id: 'var_3a', name: 'One Size', price: 24.99 }
        ]
      },
      {
        id: 'prod_4',
        name: 'MCC Travel Mug',
        category: 'accessories',
        price: 19.99,
        image: null,
        variants: [
          { id: 'var_4a', name: '16oz', price: 19.99 },
          { id: 'var_4b', name: '20oz', price: 22.99 }
        ]
      },
      {
        id: 'prod_5',
        name: 'MCC Keychain',
        category: 'accessories',
        price: 12.99,
        image: null,
        variants: [
          { id: 'var_5a', name: 'Standard', price: 12.99 }
        ]
      },
      {
        id: 'prod_6',
        name: 'MCC Logo Decal - Small',
        category: 'decals',
        price: 5.99,
        image: null,
        variants: [
          { id: 'var_6a', name: 'White', price: 5.99 },
          { id: 'var_6b', name: 'Gold', price: 5.99 },
          { id: 'var_6c', name: 'Black', price: 5.99 }
        ]
      },
      {
        id: 'prod_7',
        name: 'MCC Logo Decal - Large',
        category: 'decals',
        price: 9.99,
        image: null,
        variants: [
          { id: 'var_7a', name: 'White', price: 9.99 },
          { id: 'var_7b', name: 'Gold', price: 9.99 },
          { id: 'var_7c', name: 'Black', price: 9.99 }
        ]
      },
      {
        id: 'prod_8',
        name: 'MCC Window Sticker Pack',
        category: 'decals',
        price: 14.99,
        image: null,
        variants: [
          { id: 'var_8a', name: '5-Pack', price: 14.99 },
          { id: 'var_8b', name: '10-Pack', price: 24.99 }
        ]
      }
    ];

    // Load cart from localStorage
    function loadCartFromStorage() {
      try {
        const savedCart = localStorage.getItem('mcc_shop_cart');
        if (savedCart) {
          shopCart = JSON.parse(savedCart);
          updateCartUI();
        }
      } catch (e) {
        console.error('Error loading cart:', e);
        shopCart = [];
      }
    }

    // Save cart to localStorage
    function saveCartToStorage() {
      try {
        localStorage.setItem('mcc_shop_cart', JSON.stringify(shopCart));
      } catch (e) {
        console.error('Error saving cart:', e);
      }
    }

    async function loadShopProducts() {
      loadCartFromStorage();
      
      try {
        const response = await fetch('/api/shop/products');
        const data = await response.json();
        
        if (data.success && data.products && data.products.length > 0) {
          shopProducts = data.products;
          if (data.source === 'placeholder') {
            console.log('Using placeholder products - Printful API not configured');
          }
        } else {
          shopProducts = placeholderProducts;
        }
      } catch (error) {
        console.error('Error loading shop products:', error);
        shopProducts = placeholderProducts;
      }
      
      renderShopProducts();
    }

    // Render shop products
    function renderShopProducts() {
      const grid = document.getElementById('shop-products-grid');
      const emptyState = document.getElementById('shop-empty-state');
      
      const filteredProducts = currentShopFilter === 'all' 
        ? shopProducts 
        : shopProducts.filter(p => p.category === currentShopFilter);
      
      if (filteredProducts.length === 0) {
        grid.innerHTML = '';
        emptyState.style.display = 'block';
        return;
      }
      
      emptyState.style.display = 'none';
      
      grid.innerHTML = filteredProducts.map(product => `
        <div class="product-card" style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);overflow:hidden;transition:all 0.3s ease;">
          <div class="product-image-container" style="height:180px;position:relative;border-bottom:1px solid var(--border-subtle);overflow:hidden;">
            <div class="product-skeleton" style="position:absolute;inset:0;background:linear-gradient(135deg, rgba(74,124,255,0.1), rgba(212,168,85,0.1));display:flex;align-items:center;justify-content:center;">
              <div class="skeleton-shimmer"></div>
              <span style="font-size:64px;opacity:0.5;">${getCategoryEmoji(product.category)}</span>
            </div>
            ${product.image ? `
              <img 
                src="${product.image}" 
                alt="${product.name}" 
                loading="lazy"
                class="product-image-lazy"
                style="width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity 0.4s ease;"
                onload="this.style.opacity='1';this.previousElementSibling.style.display='none';"
                onerror="this.style.display='none';"
              />
            ` : `
              <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:64px;background:linear-gradient(135deg, rgba(74,124,255,0.1), rgba(212,168,85,0.1));">
                ${getCategoryEmoji(product.category)}
              </div>
            `}
          </div>
          <div class="product-info" style="padding:16px;">
            <h4 style="font-size:0.95rem;font-weight:600;margin-bottom:8px;line-height:1.3;">${product.name}</h4>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
              <span style="font-size:1.1rem;font-weight:700;color:var(--accent-gold);">$${product.price.toFixed(2)}</span>
              <span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;">${product.category}</span>
            </div>
            ${product.variants.length > 1 ? `
              <select id="variant-${product.id}" class="form-select" style="width:100%;padding:8px 12px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);color:var(--text-primary);font-size:0.85rem;margin-bottom:12px;">
                ${product.variants.map(v => `<option value="${v.id}" data-price="${v.price}">${v.name}${v.price !== product.price ? ` (+$${(v.price - product.price).toFixed(2)})` : ''}</option>`).join('')}
              </select>
            ` : ''}
            <button class="btn btn-primary" onclick="addToCart('${product.id}')" style="width:100%;padding:10px 16px;font-size:0.88rem;">
              Add to Cart
            </button>
          </div>
        </div>
      `).join('');
    }

    function getCategoryEmoji(category) {
      switch (category) {
        case 'apparel': return '👕';
        case 'accessories': return '🎒';
        case 'decals': return '🏷️';
        default: return '📦';
      }
    }

    // Filter shop products by category
    function filterShopProducts(category) {
      currentShopFilter = category;
      
      // Update filter button states
      document.querySelectorAll('.shop-filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.category === category) {
          btn.classList.add('active');
        }
      });
      
      renderShopProducts();
    }

    // Add item to cart
    function addToCart(productId) {
      const product = shopProducts.find(p => p.id === productId);
      if (!product) return;
      
      let selectedVariant = product.variants[0];
      
      // Check if there's a variant selector
      const variantSelect = document.getElementById(`variant-${productId}`);
      if (variantSelect) {
        const selectedOption = variantSelect.options[variantSelect.selectedIndex];
        selectedVariant = product.variants.find(v => v.id === selectedOption.value) || selectedVariant;
      }
      
      // Check if item already in cart
      const existingIndex = shopCart.findIndex(item => 
        item.productId === productId && item.variantId === selectedVariant.id
      );
      
      if (existingIndex >= 0) {
        shopCart[existingIndex].quantity++;
      } else {
        shopCart.push({
          productId: productId,
          variantId: selectedVariant.id,
          name: product.name,
          variantName: selectedVariant.name,
          price: selectedVariant.price,
          quantity: 1
        });
      }
      
      saveCartToStorage();
      updateCartUI();
      showToast(`Added ${product.name} to cart`, 'success');
    }

    // Remove item from cart
    function removeFromCart(index) {
      if (index >= 0 && index < shopCart.length) {
        const item = shopCart[index];
        shopCart.splice(index, 1);
        saveCartToStorage();
        updateCartUI();
        showToast(`Removed ${item.name} from cart`, 'info');
      }
    }

    // Update cart quantity
    function updateCartQuantity(index, quantity) {
      if (index >= 0 && index < shopCart.length) {
        if (quantity <= 0) {
          removeFromCart(index);
        } else {
          shopCart[index].quantity = quantity;
          saveCartToStorage();
          updateCartUI();
        }
      }
    }

    // Update cart UI
    function updateCartUI() {
      const totalItems = shopCart.reduce((sum, item) => sum + item.quantity, 0);
      const subtotal = shopCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      
      // Update cart counts
      document.getElementById('cart-item-count').textContent = totalItems;
      const mobileCount = document.getElementById('mobile-cart-count');
      if (mobileCount) mobileCount.textContent = totalItems;
      
      // Update cart items list
      const cartList = document.getElementById('cart-items-list');
      const cartSummary = document.getElementById('cart-summary');
      const checkoutBtn = document.getElementById('checkout-btn');
      const clearCartBtn = document.getElementById('clear-cart-btn');
      
      if (shopCart.length === 0) {
        cartList.innerHTML = `
          <div class="empty-state" style="padding:24px 0;">
            <div style="font-size:40px;margin-bottom:12px;">🛒</div>
            <p style="color:var(--text-muted);font-size:0.9rem;">Your cart is empty</p>
          </div>
        `;
        cartSummary.style.display = 'none';
        checkoutBtn.disabled = true;
        clearCartBtn.style.display = 'none';
      } else {
        cartList.innerHTML = shopCart.map((item, index) => `
          <div class="cart-item" style="display:flex;gap:12px;padding:12px;background:var(--bg-elevated);border-radius:var(--radius-sm);margin-bottom:8px;">
            <div style="flex:1;">
              <div style="font-size:0.9rem;font-weight:500;margin-bottom:4px;">${item.name}</div>
              <div style="font-size:0.8rem;color:var(--text-muted);">${item.variantName}</div>
              <div style="font-size:0.9rem;color:var(--accent-gold);font-weight:600;margin-top:4px;">$${(item.price * item.quantity).toFixed(2)}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
              <div style="display:flex;align-items:center;gap:4px;">
                <button class="btn btn-ghost" onclick="updateCartQuantity(${index}, ${item.quantity - 1})" style="padding:4px 8px;font-size:0.9rem;">−</button>
                <span style="min-width:24px;text-align:center;">${item.quantity}</span>
                <button class="btn btn-ghost" onclick="updateCartQuantity(${index}, ${item.quantity + 1})" style="padding:4px 8px;font-size:0.9rem;">+</button>
              </div>
              <button class="btn btn-ghost" onclick="removeFromCart(${index})" style="padding:4px 8px;font-size:0.75rem;color:var(--accent-red);">Remove</button>
            </div>
          </div>
        `).join('');
        
        cartSummary.style.display = 'block';
        document.getElementById('cart-subtotal').textContent = `$${subtotal.toFixed(2)}`;
        document.getElementById('cart-total').textContent = `$${subtotal.toFixed(2)}`;
        checkoutBtn.disabled = false;
        clearCartBtn.style.display = 'block';
      }
      
      // Update modal cart if open
      const modalItems = document.getElementById('cart-modal-items');
      if (modalItems) {
        modalItems.innerHTML = cartList.innerHTML;
      }
      const modalSubtotal = document.getElementById('cart-modal-subtotal');
      const modalTotal = document.getElementById('cart-modal-total');
      if (modalSubtotal) modalSubtotal.textContent = `$${subtotal.toFixed(2)}`;
      if (modalTotal) modalTotal.textContent = `$${subtotal.toFixed(2)}`;
    }

    // Show cart modal (for mobile)
    function showCartModal() {
      updateCartUI();
      document.getElementById('cart-modal').classList.add('active');
    }

    // Clear entire cart
    function clearCart() {
      if (confirm('Are you sure you want to clear your cart?')) {
        shopCart = [];
        saveCartToStorage();
        updateCartUI();
        showToast('Cart cleared', 'info');
      }
    }

    async function proceedToCheckout() {
      if (shopCart.length === 0) {
        showToast('Your cart is empty', 'error');
        return;
      }
      
      const checkoutBtn = document.getElementById('checkout-btn');
      if (checkoutBtn) {
        checkoutBtn.disabled = true;
        checkoutBtn.textContent = 'Processing...';
      }
      
      try {
        const session = await supabaseClient.auth.getSession();
        const token = session?.data?.session?.access_token;
        
        if (!token) {
          showToast('Please log in to checkout', 'error');
          return;
        }
        
        const checkoutItems = shopCart.map(item => {
          const product = shopProducts.find(p => p.id === item.productId);
          const variant = product?.variants?.find(v => v.id === item.variantId);
          
          return {
            productId: item.productId,
            variantId: item.variantId,
            printfulSyncVariantId: variant?.printfulSyncVariantId || null,
            name: item.name,
            variantName: item.variantName,
            price: item.price,
            quantity: item.quantity
          };
        });
        
        const response = await fetch('/api/shop/checkout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ items: checkoutItems })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'Checkout failed');
        }
        
        if (data.url) {
          shopCart = [];
          saveCartToStorage();
          window.location.href = data.url;
        } else if (data.sessionId) {
          const stripeConfig = await fetch('/api/config/stripe');
          const { publishableKey } = await stripeConfig.json();
          
          if (!publishableKey) {
            throw new Error('Stripe not configured');
          }
          
          const stripe = Stripe(publishableKey);
          shopCart = [];
          saveCartToStorage();
          await stripe.redirectToCheckout({ sessionId: data.sessionId });
        } else {
          throw new Error('Invalid checkout response');
        }
        
      } catch (error) {
        console.error('Checkout error:', error);
        showToast('Checkout failed: ' + error.message, 'error');
      } finally {
        if (checkoutBtn) {
          checkoutBtn.disabled = false;
          checkoutBtn.textContent = 'Checkout';
        }
      }
    }

    // Initialize shop on page load
    loadCartFromStorage();

    // ========== ORDER HISTORY ==========
    let memberOrders = [];

    async function loadOrderHistory() {
      if (!currentUser?.id) return;
      
      const loading = document.getElementById('order-history-loading');
      const empty = document.getElementById('order-history-empty');
      const list = document.getElementById('order-history-list');
      
      loading.style.display = 'block';
      empty.style.display = 'none';
      list.style.display = 'none';
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const response = await fetch(`/api/member/${currentUser.id}/orders`, {
          headers: { 'Authorization': `Bearer ${session?.access_token}` }
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch orders');
        }
        
        const data = await response.json();
        memberOrders = data.orders || [];
        
        loading.style.display = 'none';
        
        if (memberOrders.length === 0) {
          empty.style.display = 'block';
        } else {
          renderOrderHistory(memberOrders);
          list.style.display = 'flex';
        }
      } catch (error) {
        console.error('Error loading order history:', error);
        loading.style.display = 'none';
        empty.style.display = 'block';
        showToast('Failed to load order history', 'error');
      }
    }

    function renderOrderHistory(orders) {
      const list = document.getElementById('order-history-list');
      
      list.innerHTML = orders.map(order => {
        const orderDate = new Date(order.created_at).toLocaleDateString('en-US', {
          year: 'numeric', month: 'short', day: 'numeric'
        });
        const orderNumber = order.order_number || `#${order.id.slice(0, 8).toUpperCase()}`;
        const itemCount = order.items?.length || 0;
        const itemText = itemCount === 1 ? '1 item' : `${itemCount} items`;
        const total = order.total_amount ? `$${(order.total_amount / 100).toFixed(2)}` : '$0.00';
        const status = order.status || 'pending';
        const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
        
        const itemsHtml = (order.items || []).map(item => `
          <div class="order-item-row">
            <div class="order-item-image">
              ${item.image_url ? `<img src="${item.image_url}" alt="${item.name}">` : '📦'}
            </div>
            <div class="order-item-info">
              <div class="order-item-name">${item.name || 'Product'}</div>
              ${item.variant ? `<div class="order-item-variant">${item.variant}</div>` : ''}
            </div>
            <div class="order-item-qty">x${item.quantity || 1}</div>
            <div class="order-item-price">$${((item.price || 0) / 100).toFixed(2)}</div>
          </div>
        `).join('');
        
        const shippingHtml = order.shipping_address ? `
          <div class="order-details-section">
            <div class="order-details-title">Shipping Address</div>
            <div class="order-shipping-info">
              <p><strong>${order.shipping_address.name || ''}</strong></p>
              <p>${order.shipping_address.line1 || ''}</p>
              ${order.shipping_address.line2 ? `<p>${order.shipping_address.line2}</p>` : ''}
              <p>${order.shipping_address.city || ''}, ${order.shipping_address.state || ''} ${order.shipping_address.postal_code || ''}</p>
              <p>${order.shipping_address.country || ''}</p>
            </div>
          </div>
        ` : '';
        
        const trackingHtml = order.tracking_number || order.tracking_url ? `
          <div class="order-details-section">
            <div class="order-details-title">Tracking</div>
            <div class="order-shipping-info">
              ${order.tracking_number ? `<p><strong>Tracking #:</strong> ${order.tracking_number}</p>` : ''}
              ${order.tracking_url ? `
                <button class="btn btn-primary btn-sm order-tracking-btn" onclick="trackOrder('${order.id}')">
                  📍 Track Shipment
                </button>
              ` : ''}
            </div>
          </div>
        ` : '';
        
        return `
          <div class="order-card" id="order-${order.id}">
            <div class="order-card-header" onclick="toggleOrderDetails('${order.id}')">
              <div class="order-card-info">
                <div class="order-icon">📦</div>
                <div class="order-meta">
                  <div class="order-number">${orderNumber}</div>
                  <div class="order-date">${orderDate}</div>
                </div>
                <div class="order-summary">
                  <span class="order-items-count">${itemText}</span>
                  <span class="order-total">${total}</span>
                </div>
              </div>
              <span class="order-status ${status}">${statusLabel}</span>
              <span class="order-expand-icon">▼</span>
            </div>
            <div class="order-details">
              <div class="order-details-section">
                <div class="order-details-title">Items</div>
                ${itemsHtml || '<p style="color:var(--text-muted);">No items</p>'}
              </div>
              ${shippingHtml}
              ${trackingHtml}
            </div>
          </div>
        `;
      }).join('');
    }

    function toggleOrderDetails(orderId) {
      const orderCard = document.getElementById(`order-${orderId}`);
      if (orderCard) {
        orderCard.classList.toggle('expanded');
      }
    }

    function trackOrder(orderId) {
      const order = memberOrders.find(o => o.id === orderId);
      if (order?.tracking_url) {
        window.open(order.tracking_url, '_blank');
      } else if (order?.tracking_number) {
        const trackingUrl = `https://www.google.com/search?q=track+${encodeURIComponent(order.tracking_number)}`;
        window.open(trackingUrl, '_blank');
      } else {
        showToast('No tracking information available', 'error');
      }
    }
