// ========== MY CAR CONCIERGE - CORE MODULE ==========
// Essential initialization, state management, navigation, and module loader

    // ========== THEME TOGGLE ==========
    function toggleTheme() {
      document.documentElement.classList.add('theme-transition');
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      updateThemeIcon();
      updateThemeToggleUI();
      setTimeout(() => {
        document.documentElement.classList.remove('theme-transition');
      }, 300);
    }

    function updateThemeIcon() {
      const themeIcon = document.getElementById('theme-icon');
      const currentTheme = document.documentElement.getAttribute('data-theme');
      if (themeIcon) {
        themeIcon.textContent = currentTheme === 'dark' ? '🌙' : '☀️';
      }
    }

    function updateThemeToggleUI() {
      const themeToggle = document.getElementById('settings-theme-toggle');
      const themeLabel = document.getElementById('settings-theme-label');
      const iconDisplay = document.getElementById('settings-theme-icon-display');
      const currentTheme = document.documentElement.getAttribute('data-theme');
      if (themeToggle) {
        themeToggle.checked = currentTheme === 'light';
      }
      if (themeLabel) {
        themeLabel.textContent = currentTheme === 'dark' ? 'Dark Mode' : 'Light Mode';
      }
      if (iconDisplay) {
        iconDisplay.textContent = currentTheme === 'dark' ? '🌙' : '☀️';
      }
    }

    function setThemeFromToggle(isLight) {
      document.documentElement.classList.add('theme-transition');
      const newTheme = isLight ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      updateThemeIcon();
      updateThemeToggleUI();
      setTimeout(() => {
        document.documentElement.classList.remove('theme-transition');
      }, 300);
    }

    document.addEventListener('DOMContentLoaded', () => {
      updateThemeIcon();
    });

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
    
    
    // Vehicle Recalls State
    let vehicleRecalls = {}; // Map of vehicle_id -> { recalls: [], activeCount: 0 }
    let currentRecallsVehicleId = null; // Currently viewing recalls for this vehicle

    // Registration Verification State
    let pendingRegistrationFile = null; // File to upload for registration verification
    let vehicleRegistrationStatus = {}; // Map of vehicle_id -> { verified: boolean, status: string }
    let currentRegistrationVehicleId = null; // Currently verifying registration for this vehicle

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
        // Common trim levels and versions by make (includes special editions, performance variants, generations)
        'default': ['Base', 'S', 'SE', 'SEL', 'Limited', 'Premium', 'Sport', 'Touring', 'Luxury', 'GT', 'Turbo', 'Hybrid'],
        'Toyota': ['L', 'LE', 'SE', 'XLE', 'XSE', 'Limited', 'TRD Sport', 'TRD Off-Road', 'TRD Pro', 'Nightshade', 'Platinum', 'GR', 'GR Sport', 'Prime', 'Hybrid'],
        'Honda': ['LX', 'EX', 'EX-L', 'Sport', 'Touring', 'Elite', 'Type R', 'Type S', 'Si', 'Hybrid', 'e:HEV', 'Sport Touring'],
        'Ford': ['Base', 'XL', 'XLT', 'Lariat', 'King Ranch', 'Platinum', 'Limited', 'Raptor', 'ST', 'GT', 'GT Performance', 'Tremor', 'Timberline', 'Dark Horse'],
        'Chevrolet': ['LS', 'LT', 'RS', 'Premier', 'High Country', 'ZR2', 'Z71', 'SS', 'ZL1', 'Trail Boss', '1LE', 'Redline'],
        'BMW': ['Base', 'xDrive', 'M Sport', 'M', 'Competition', 'M40i', 'M50i', 'M Performance', 'Individual'],
        'Mercedes-Benz': ['Base', '4MATIC', 'AMG Line', 'AMG 35', 'AMG 43', 'AMG 45', 'AMG 53', 'AMG 63', 'AMG 63 S', 'Night Edition', 'Designo', 'CLA 45', 'C 43', 'E 53', 'S 63'],
        'Audi': ['Base', 'Premium', 'Premium Plus', 'Prestige', 'S Line', 'Black Optics', 'Competition', 'RS', 'e-tron', 'Sportback'],
        'Lexus': ['Base', 'Premium', 'Luxury', 'F Sport', 'Ultra Luxury', 'F Sport Handling', 'Executive'],
        'Tesla': ['Standard Range', 'Standard Range Plus', 'Long Range', 'Performance', 'Plaid', 'Plaid+'],
        'Hyundai': ['SE', 'SEL', 'N Line', 'Limited', 'Calligraphy', 'N', 'Ultimate', 'Blue Hybrid'],
        'Kia': ['LX', 'LXS', 'S', 'EX', 'GT-Line', 'SX', 'SX Prestige', 'GT', 'GT1', 'GT2'],
        'Jeep': ['Sport', 'Sport S', 'Latitude', 'Altitude', 'Limited', 'Trailhawk', 'Overland', 'Summit', 'Rubicon', 'Sahara', 'Rubicon 392', 'Willys', '4xe'],
        'Subaru': ['Base', 'Premium', 'Sport', 'Limited', 'Touring', 'Wilderness', 'Onyx Edition XT', 'STI', 'WRX'],
        'Volkswagen': ['S', 'SE', 'SEL', 'SEL Premium', 'R-Line', 'GTI', 'GLI', 'R', 'Mk 6', 'Mk 7', 'Mk 7.5', 'Mk 8', 'Autobahn', '1.8T', '2.0T', 'TDI'],
        'Mazda': ['Base', 'Select', 'Preferred', 'Premium', 'Premium Plus', 'Turbo', 'Turbo Premium Plus', 'Carbon Edition', 'Signature'],
        'Nissan': ['S', 'SV', 'SL', 'SR', 'Platinum', 'Midnight Edition', 'NISMO', 'Pro-4X', 'Rock Creek'],
        'Porsche': ['Base', 'S', '4S', 'GTS', 'Turbo', 'Turbo S', 'GT3', 'GT3 RS', 'GT4', 'Taycan', 'Carrera', 'Carrera S'],
        'Acura': ['Base', 'Technology', 'A-Spec', 'Advance', 'Type S', 'PMC Edition', 'SH-AWD'],
        'Infiniti': ['Pure', 'Luxe', 'Essential', 'Sensory', 'Sport', 'Red Sport 400'],
        'Genesis': ['Base', 'Standard', 'Advanced', 'Prestige', 'Sport', 'Sport Advanced', 'Sport Prestige'],
        'Dodge': ['SXT', 'GT', 'R/T', 'R/T Scat Pack', 'SRT Hellcat', 'SRT Hellcat Redeye', 'SRT Demon', 'Jailbreak', 'Widebody'],
        'Ram': ['Tradesman', 'Big Horn', 'Laramie', 'Rebel', 'Limited', 'TRX', 'Longhorn', 'Power Wagon'],
        'GMC': ['SLE', 'SLT', 'Denali', 'AT4', 'AT4X', 'Elevation', 'Canyon'],
        'Cadillac': ['Luxury', 'Premium Luxury', 'Sport', 'V-Series', 'Blackwing', 'Platinum'],
        'Land Rover': ['S', 'SE', 'HSE', 'R-Dynamic', 'Autobiography', 'SVR', 'First Edition', 'Westminster'],
        'Jaguar': ['Base', 'S', 'SE', 'R-Dynamic', 'R', 'SVR', 'First Edition', 'HSE'],
        'Alfa Romeo': ['Base', 'Sprint', 'Ti', 'Ti Sport', 'Veloce', 'Quadrifoglio'],
        'Maserati': ['Base', 'GT', 'Modena', 'Trofeo', 'MC Edition', 'GranSport', 'GranLusso']
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
      const trimInput = document.getElementById('v-trim');
      const trimDatalist = document.getElementById('v-trim-options');
      
      // Reset dependent dropdowns
      makeSelect.innerHTML = '<option value="">Select Make</option>';
      modelSelect.innerHTML = '<option value="">Select Model</option>';
      trimInput.value = '';
      trimDatalist.innerHTML = '';
      modelSelect.disabled = true;
      trimInput.disabled = true;
      
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
      const trimInput = document.getElementById('v-trim');
      const trimDatalist = document.getElementById('v-trim-options');
      
      // Reset dependent dropdowns
      modelSelect.innerHTML = '<option value="">Select Model</option>';
      trimInput.value = '';
      trimDatalist.innerHTML = '';
      trimInput.disabled = true;
      
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
      const trimInput = document.getElementById('v-trim');
      const trimDatalist = document.getElementById('v-trim-options');
      
      trimInput.value = '';
      trimDatalist.innerHTML = '';
      
      if (!modelSelect.value) {
        trimInput.disabled = true;
        return;
      }
      
      trimInput.disabled = false;
      const trims = vehicleData.trims[makeSelect.value] || vehicleData.trims['default'];
      trims.forEach(trim => {
        const opt = document.createElement('option');
        opt.value = trim;
        trimDatalist.appendChild(opt);
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
        checkActiveEmergency()
      ]);
      
      updateStats();
      setupEventListeners();
      setupRealtimeSubscriptions();
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

    // ========== NOTIFICATIONS (Core) ==========
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
      if (badge) {
        if (unreadCount > 0) {
          badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
          badge.style.display = 'inline';
        } else {
          badge.style.display = 'none';
        }
      }
    }

    function renderNotifications() {
      const container = document.getElementById('notifications-list');
      if (!container) return;
      
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
          <div class="notification-item ${unreadClass}" data-id="${n.id}" onclick="markNotificationRead('${n.id}')">
            <div class="notification-icon">${icon}</div>
            <div class="notification-content">
              <div class="notification-title">${escapeHtml(n.title || '')}</div>
              <div class="notification-message">${escapeHtml(n.message || '')}</div>
              <div class="notification-time">${timeAgo}</div>
            </div>
          </div>
        `;
      }).join('');
    }

    async function markNotificationRead(notifId) {
      await supabaseClient.from('notifications').update({ read: true }).eq('id', notifId);
      const notif = notifications.find(n => n.id === notifId);
      if (notif) notif.read = true;
      renderNotifications();
      updateNotificationBadge();
    }

    // ========== SMS OPTIONS TOGGLE ==========
    function toggleSmsOptions() {
      const checkbox = document.getElementById('sms-enabled');
      const optionsDiv = document.getElementById('sms-options');
      if (checkbox && optionsDiv) {
        optionsDiv.style.display = checkbox.checked ? 'block' : 'none';
      }
    }

    // ========== RENDER VEHICLES (Core) ==========
    function renderVehicles() {
      const grid = document.getElementById('vehicles-grid');
      if (!grid) return;
      
      if (!vehicles.length) {
        grid.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">🚗</div>
            <p>No vehicles added yet.</p>
            <button class="btn btn-primary" onclick="openAddVehicleModal()">Add Your First Vehicle</button>
          </div>
        `;
        return;
      }

      grid.innerHTML = vehicles.map(v => {
        const displayName = v.nickname || `${v.year} ${v.make} ${v.model}`;
        const trimInfo = v.trim_version ? `<span class="vehicle-trim">${escapeHtml(v.trim_version)}</span>` : '';
        return `
          <div class="vehicle-card" data-id="${v.id}">
            <div class="vehicle-card-header">
              <h3>${escapeHtml(displayName)}</h3>
              ${trimInfo}
            </div>
            <div class="vehicle-card-body">
              <p><strong>Year:</strong> ${v.year}</p>
              <p><strong>Make:</strong> ${escapeHtml(v.make)}</p>
              <p><strong>Model:</strong> ${escapeHtml(v.model)}</p>
              ${v.vin ? `<p><strong>VIN:</strong> ${escapeHtml(v.vin)}</p>` : ''}
              ${v.license_plate ? `<p><strong>Plate:</strong> ${escapeHtml(v.license_plate)}</p>` : ''}
              ${v.mileage ? `<p><strong>Mileage:</strong> ${v.mileage.toLocaleString()}</p>` : ''}
            </div>
            <div class="vehicle-card-actions">
              <button class="btn btn-sm btn-secondary" onclick="editVehicle('${v.id}')">Edit</button>
              <button class="btn btn-sm btn-danger" onclick="deleteVehicle('${v.id}')">Delete</button>
            </div>
          </div>
        `;
      }).join('');
    }

    // ========== RENDER SERVICE HISTORY (Core) ==========
    function renderServiceHistory() {
      const container = document.getElementById('history-list');
      if (!container) return;
      
      const filterVehicle = document.getElementById('history-vehicle-filter')?.value || 'all';
      let filtered = serviceHistory || [];
      
      if (filterVehicle !== 'all') {
        filtered = filtered.filter(h => h.vehicle_id === filterVehicle);
      }
      
      if (!filtered.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📜</div><p>No service history yet.</p></div>';
        return;
      }

      container.innerHTML = filtered.map(h => {
        const vehicleName = h.vehicles ? `${h.vehicles.year} ${h.vehicles.make} ${h.vehicles.model}` : 'Unknown Vehicle';
        const date = new Date(h.service_date).toLocaleDateString();
        return `
          <div class="history-item">
            <div class="history-icon">🔧</div>
            <div class="history-content">
              <div class="history-title">${escapeHtml(h.service_type || 'Service')}</div>
              <div class="history-vehicle">${escapeHtml(vehicleName)}</div>
              <div class="history-date">${date}</div>
              ${h.notes ? `<div class="history-notes">${escapeHtml(h.notes)}</div>` : ''}
            </div>
            ${h.cost ? `<div class="history-cost">$${h.cost.toFixed(2)}</div>` : ''}
          </div>
        `;
      }).join('');
    }

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

      // Display loyalty badges
      displayLoyaltyBadges(userProfile);

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

    async function displayLoyaltyBadges(profile) {
      const badgesContainer = document.getElementById('user-loyalty-badges');
      const preferredProviderDisplay = document.getElementById('preferred-provider-display');
      if (!badgesContainer) return;

      let badgesHtml = '';
      
      if (profile?.platform_fee_exempt) {
        badgesHtml += '<span class="loyalty-badge vip">👑 VIP Member</span>';
      }
      
      if (profile?.provider_verified) {
        badgesHtml += '<span class="loyalty-badge trusted">✓ Trusted Customer</span>';
      }

      if (badgesHtml) {
        badgesContainer.innerHTML = badgesHtml;
        badgesContainer.style.display = 'flex';
      } else {
        badgesContainer.style.display = 'none';
      }

      if (profile?.preferred_provider_id && preferredProviderDisplay) {
        try {
          const { data: provider } = await supabaseClient
            .from('profiles')
            .select('business_name, full_name')
            .eq('id', profile.preferred_provider_id)
            .single();
          
          if (provider) {
            const providerName = provider.business_name || provider.full_name || 'Your Provider';
            preferredProviderDisplay.innerHTML = `⭐ Preferred Provider: <strong>${providerName}</strong>`;
            preferredProviderDisplay.style.display = 'block';
          }
        } catch (err) {
          console.log('Could not load preferred provider:', err);
        }
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
        
        // Load recalls for all vehicles in background
        loadAllVehicleRecalls();
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
      
      // Load payment statuses for escrow display
      if (typeof loadPackagePaymentStatuses === 'function') {
        await loadPackagePaymentStatuses();
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


    // ========== EVENT LISTENERS (FROM CORE) ==========
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

    // ========== MODULE LOADER ==========
    const loadedModules = {};
    async function loadModule(name) {
      if (loadedModules[name]) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `/members-${name}.js`;
        script.async = true;
        script.onload = () => {
          loadedModules[name] = true;
          console.log(`[Module] Loaded ${name} module`);
          resolve();
        };
        script.onerror = (e) => {
          console.error(`[Module] Failed to load ${name} module`, e);
          reject(e);
        };
        document.body.appendChild(script);
      });
    }

    function loadModuleForSection(section) {
      switch(section) {
        case 'vehicles':
        case 'my-vehicles':
        case 'recalls':
        case 'verification':
          return loadModule('vehicles');
        case 'packages':
        case 'bids':
        case 'view-package':
        case 'upsells':
        case 'destination-services':
          return loadModule('packages');
        case 'settings':
        case 'notifications':
        case 'qr-checkin':
          return loadModule('settings');
        case 'emergency':
        case 'fuel-tracker':
        case 'insurance':
        case 'fleet':
        case 'household':
        case 'spending-analytics':
        case 'shop':
        case 'order-history':
        case 'referrals':
        case 'login-activity':
        case 'my-next-car':
        case 'dream-car-finder':
        case 'learn':
        case 'messages':
        case 'reminders':
        case 'cost-estimator':
        case 'maintenance-schedule':
          return loadModule('extras');
        case 'overview':
        case 'history':
          return Promise.resolve();
        default:
          console.error(`[Module] No module mapping for section: ${section}`);
          return Promise.resolve();
      }
    }

    // ========== NAVIGATION ==========
    async function showSection(sectionId) {
      // Load required module first
      await loadModuleForSection(sectionId);
      
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.getElementById(sectionId).classList.add('active');
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelector(`.nav-item[data-section="${sectionId}"]`)?.classList.add('active');
      document.getElementById('sidebar').classList.remove('open');
      
      // Reset scroll position to top
      document.querySelector('.main').scrollTop = 0;
      
      // Section-specific initializations (functions defined in respective modules)
      if (sectionId === 'emergency' && typeof loadEmergencySection === 'function') {
        loadEmergencySection();
      }
      if (sectionId === 'destination-services' && typeof loadDestinationServices === 'function') {
        loadDestinationServices();
      }
      if (sectionId === 'household' && typeof loadHouseholdSection === 'function') {
        loadHouseholdSection();
      }
      if (sectionId === 'fleet' && typeof loadFleetSection === 'function') {
        loadFleetSection();
      }
      if (sectionId === 'spending-analytics' && typeof initSpendingAnalytics === 'function') {
        initSpendingAnalytics();
      }
      if (sectionId === 'history' && typeof loadPosServiceHistory === 'function') {
        loadPosServiceHistory();
      }
      if (sectionId === 'qr-checkin') {
        loadMemberQrCode();
      }
      if (sectionId === 'cost-estimator' && typeof initCostEstimator === 'function') {
        initCostEstimator();
      }
      if (sectionId === 'maintenance-schedule' && typeof loadMaintenanceSchedule === 'function') {
        loadMaintenanceSchedule();
      }
      if (sectionId === 'settings') {
        if (typeof initPushNotifications === 'function') initPushNotifications();
        if (typeof loadLoginActivity === 'function') loadLoginActivity();
        if (typeof load2FAStatus === 'function') load2FAStatus();
      }
      if (sectionId === 'order-history' && typeof loadOrderHistory === 'function') {
        loadOrderHistory();
      }
      if (sectionId === 'learn' && typeof renderLearnHub === 'function') {
        renderLearnHub();
      }
      if (sectionId === 'dream-car-finder' && typeof loadDreamCarFinderSection === 'function') {
        loadDreamCarFinderSection();
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
      
      // Handle private job section
      const privateJobSection = document.getElementById('private-job-section');
      const privateJobCheckbox = document.getElementById('p-private-job');
      if (userProfile?.preferred_provider_id) {
        privateJobSection.style.display = 'block';
        privateJobCheckbox.checked = false;
        document.getElementById('private-job-info').style.display = 'none';
        loadPreferredProviderName();
      } else {
        privateJobSection.style.display = 'none';
      }
    }
    
    async function loadPreferredProviderName() {
      if (!userProfile?.preferred_provider_id) return;
      
      try {
        const { data: provider } = await supabaseClient
          .from('profiles')
          .select('business_name, full_name')
          .eq('id', userProfile.preferred_provider_id)
          .single();
        
        if (provider) {
          const providerName = provider.business_name || provider.full_name || 'your preferred provider';
          document.getElementById('preferred-provider-name').textContent = providerName;
        }
      } catch (err) {
        console.error('Error loading preferred provider name:', err);
      }
    }
    
    function handlePrivateJobToggle() {
      const isPrivate = document.getElementById('p-private-job').checked;
      document.getElementById('private-job-info').style.display = isPrivate ? 'block' : 'none';
    }

    // ========== DESTINATION SERVICE HANDLING ==========
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


    function openModal(modalId) {
      document.getElementById(modalId).classList.add('active');
    }

    function closeModal(modalId) {
      document.getElementById(modalId).classList.remove('active');
    }

    function escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
