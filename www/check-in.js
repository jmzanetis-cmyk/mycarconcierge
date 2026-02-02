    let sessionId = null;
    let providerId = null;
    let providerName = 'My Car Concierge';
    let memberData = null;
    let vehiclesData = [];
    let selectedVehicleId = null;
    let isNewVehicle = false;
    let isNewMember = false;
    let queueId = null;
    let refreshInterval = null;
    let serviceCategory = '';
    let serviceDescription = '';

    const urlParams = new URLSearchParams(window.location.search);
    providerId = urlParams.get('provider');

    document.addEventListener('DOMContentLoaded', async () => {
      if (!providerId) {
        showError('Invalid kiosk configuration. Provider ID is required.');
        return;
      }
      await loadProviderInfo();
      setupInputListeners();
    });

    async function loadProviderInfo() {
      try {
        document.getElementById('shop-name').textContent = 'Welcome';
      } catch (error) {
        console.error('Error loading provider info:', error);
      }
    }

    function setupInputListeners() {
      const phoneInput = document.getElementById('phone-input');
      phoneInput.addEventListener('input', (e) => {
        e.target.value = formatPhone(e.target.value);
        const digits = e.target.value.replace(/\D/g, '');
        document.getElementById('phone-next-btn').disabled = digits.length !== 10;
      });

      const otpInput = document.getElementById('otp-input');
      otpInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
        updateOtpVerifyButton();
      });

      const memberNameInput = document.getElementById('member-name');
      memberNameInput.addEventListener('input', updateOtpVerifyButton);

      const serviceCategory = document.getElementById('service-category');
      serviceCategory.addEventListener('change', (e) => {
        document.getElementById('service-next-btn').disabled = !e.target.value;
      });
    }

    function formatPhone(value) {
      const digits = value.replace(/\D/g, '').slice(0, 10);
      if (digits.length === 0) return '';
      if (digits.length <= 3) return `(${digits}`;
      if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }

    function showError(message) {
      const errorEl = document.getElementById('error-message');
      errorEl.textContent = message;
      errorEl.classList.add('show');
      setTimeout(() => errorEl.classList.remove('show'), 5000);
    }

    function hideError() {
      document.getElementById('error-message').classList.remove('show');
    }

    function goToScreen(screenName) {
      hideError();
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      document.getElementById(`screen-${screenName}`).classList.add('active');
    }

    function setLoading(buttonId, loading) {
      const btn = document.getElementById(buttonId);
      if (loading) {
        btn.disabled = true;
        btn.dataset.originalText = btn.innerHTML;
        btn.innerHTML = '<span class="loading-spinner"></span> Please wait...';
      } else {
        btn.disabled = false;
        btn.innerHTML = btn.dataset.originalText;
      }
    }

    function updateOtpVerifyButton() {
      const otp = document.getElementById('otp-input').value;
      const memberName = document.getElementById('member-name').value.trim();
      const hasValidOtp = otp.length === 6;
      const hasValidName = !isNewMember || memberName.length > 0;
      document.getElementById('otp-verify-btn').disabled = !hasValidOtp || !hasValidName;
    }

    async function startCheckin() {
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/checkin/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providerId })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        sessionId = data.session.id;
        goToScreen('phone');
        document.getElementById('phone-input').focus();
      } catch (error) {
        showError(error.message || 'Failed to start check-in');
      }
    }

    async function submitPhone() {
      const phone = document.getElementById('phone-input').value;
      setLoading('phone-next-btn', true);
      
      try {
        const response = await fetch(`/api/checkin/${sessionId}/lookup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        if (data.otpCode) {
          document.getElementById('otp-display').style.display = 'block';
          document.getElementById('otp-code-display').textContent = data.otpCode;
        }

        isNewMember = !data.existingMember;
        if (isNewMember) {
          document.getElementById('member-name-section').style.display = 'block';
        } else {
          document.getElementById('member-name-section').style.display = 'none';
        }

        goToScreen('otp');
        document.getElementById('otp-input').focus();
        updateOtpVerifyButton();
      } catch (error) {
        showError(error.message || 'Failed to lookup phone');
      } finally {
        setLoading('phone-next-btn', false);
      }
    }

    async function verifyOtp() {
      const otp = document.getElementById('otp-input').value;
      const memberName = document.getElementById('member-name').value;
      setLoading('otp-verify-btn', true);

      try {
        const response = await fetch(`/api/checkin/${sessionId}/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ otp, memberName })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        memberData = data.member;
        vehiclesData = data.vehicles || [];
        renderVehicleList();
        goToScreen('vehicle');
      } catch (error) {
        showError(error.message || 'Invalid verification code');
      } finally {
        setLoading('otp-verify-btn', false);
      }
    }

    function renderVehicleList() {
      const list = document.getElementById('vehicle-list');
      if (vehiclesData.length === 0) {
        list.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">No vehicles found. Add a new vehicle below.</p>';
        document.getElementById('add-vehicle-form').style.display = 'block';
        document.getElementById('add-vehicle-btn').style.display = 'none';
        isNewVehicle = true;
        updateVehicleButton();
        return;
      }

      list.innerHTML = vehiclesData.map(v => `
        <div class="vehicle-option" data-id="${v.id}" onclick="selectVehicle('${v.id}')">
          <div class="vehicle-icon">🚗</div>
          <div class="vehicle-info">
            <div class="vehicle-name">${v.year} ${v.make} ${v.model}</div>
            <div class="vehicle-details">${v.color || ''} ${v.license_plate ? '• ' + v.license_plate : ''}</div>
          </div>
          <div class="vehicle-check">✓</div>
        </div>
      `).join('');
    }

    function selectVehicle(vehicleId) {
      selectedVehicleId = vehicleId;
      isNewVehicle = false;
      document.querySelectorAll('.vehicle-option').forEach(el => {
        el.classList.toggle('selected', el.dataset.id === vehicleId);
      });
      document.getElementById('add-vehicle-form').style.display = 'none';
      updateVehicleButton();
    }

    function toggleAddVehicle() {
      const form = document.getElementById('add-vehicle-form');
      const isVisible = form.style.display !== 'none';
      form.style.display = isVisible ? 'none' : 'block';
      
      if (!isVisible) {
        selectedVehicleId = null;
        isNewVehicle = true;
        document.querySelectorAll('.vehicle-option').forEach(el => el.classList.remove('selected'));
      }
      updateVehicleButton();
    }

    function updateVehicleButton() {
      const year = document.getElementById('new-vehicle-year').value;
      const make = document.getElementById('new-vehicle-make').value;
      const model = document.getElementById('new-vehicle-model').value;
      
      const hasValidNewVehicle = isNewVehicle && year && make && model;
      const hasSelectedVehicle = selectedVehicleId !== null;
      
      document.getElementById('vehicle-next-btn').disabled = !hasValidNewVehicle && !hasSelectedVehicle;
    }

    ['new-vehicle-year', 'new-vehicle-make', 'new-vehicle-model'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', updateVehicleButton);
    });

    async function submitVehicle() {
      setLoading('vehicle-next-btn', true);

      try {
        const payload = {};
        if (isNewVehicle) {
          payload.newVehicle = {
            year: document.getElementById('new-vehicle-year').value,
            make: document.getElementById('new-vehicle-make').value,
            model: document.getElementById('new-vehicle-model').value,
            color: document.getElementById('new-vehicle-color').value
          };
        } else {
          payload.vehicleId = selectedVehicleId;
        }

        const response = await fetch(`/api/checkin/${sessionId}/vehicle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        selectedVehicleId = data.vehicleId;
        goToScreen('service');
      } catch (error) {
        showError(error.message || 'Failed to select vehicle');
      } finally {
        setLoading('vehicle-next-btn', false);
      }
    }

    async function submitService() {
      const category = document.getElementById('service-category').value;
      const description = document.getElementById('service-description').value;
      setLoading('service-next-btn', true);

      try {
        const response = await fetch(`/api/checkin/${sessionId}/service`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category, description })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        serviceCategory = category;
        serviceDescription = description;
        updateConfirmation(category, description, data.estimatedWait);
        goToScreen('confirm');
      } catch (error) {
        showError(error.message || 'Failed to save service details');
      } finally {
        setLoading('service-next-btn', false);
      }
    }

    function updateConfirmation(category, description, estimatedWait) {
      document.getElementById('confirm-name').textContent = memberData?.full_name || 'Guest';
      document.getElementById('confirm-phone').textContent = document.getElementById('phone-input').value;
      
      const vehicle = vehiclesData.find(v => v.id === selectedVehicleId);
      const vehicleText = vehicle 
        ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
        : `${document.getElementById('new-vehicle-year').value} ${document.getElementById('new-vehicle-make').value} ${document.getElementById('new-vehicle-model').value}`;
      document.getElementById('confirm-vehicle').textContent = vehicleText;

      const categoryLabels = {
        oil_change: 'Oil Change',
        tire_service: 'Tire Service',
        brake_service: 'Brake Service',
        maintenance: 'General Maintenance',
        repair: 'Repair',
        detailing: 'Detailing',
        inspection: 'Inspection',
        other: 'Other'
      };
      document.getElementById('confirm-service').textContent = categoryLabels[category] || category;
      document.getElementById('estimated-wait-time').textContent = estimatedWait ? `~${estimatedWait} min` : 'TBD';
    }

    async function completeCheckin() {
      setLoading('complete-btn', true);
      
      try {
        const phone = document.getElementById('phone-input').value;
        const payload = {
          phone: phone.replace(/\D/g, ''),
          serviceCategory,
          serviceDescription,
          vehicleId: selectedVehicleId
        };
        
        const response = await fetch(`/api/checkin/${sessionId}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        queueId = data.queueId;
        document.getElementById('queue-number').textContent = `#${data.queuePosition}`;
        
        if (data.queuePosition === 1) {
          document.getElementById('queue-position').textContent = "You're next in line!";
        } else {
          document.getElementById('queue-position').textContent = `You're #${data.queuePosition} in line`;
        }
        
        document.getElementById('success-wait-time').textContent = data.estimatedWait ? `~${data.estimatedWait} min` : 'Shortly';

        goToScreen('success');
        startQueueRefresh();
      } catch (error) {
        showError(error.message || 'Failed to complete check-in');
      } finally {
        setLoading('complete-btn', false);
      }
    }

    function startQueueRefresh() {
      if (refreshInterval) clearInterval(refreshInterval);
      refreshInterval = setInterval(async () => {
        if (!queueId) return;
        try {
          const response = await fetch(`/api/checkin/position/${queueId}`);
          const data = await response.json();
          if (data.position) {
            document.getElementById('queue-number').textContent = `#${data.position}`;
            if (data.position === 1) {
              document.getElementById('queue-position').textContent = "You're next in line!";
            } else {
              document.getElementById('queue-position').textContent = `You're #${data.position} in line`;
            }
          }
          if (data.estimatedWait) {
            document.getElementById('success-wait-time').textContent = `~${data.estimatedWait} min`;
          }
          if (data.status === 'serving') {
            document.getElementById('queue-position').textContent = "🎉 It's your turn! Please proceed.";
            clearInterval(refreshInterval);
          }
        } catch (error) {
          console.error('Failed to refresh queue position:', error);
        }
      }, 30000);
    }

    function resetKiosk() {
      if (refreshInterval) clearInterval(refreshInterval);
      sessionId = null;
      memberData = null;
      vehiclesData = [];
      selectedVehicleId = null;
      isNewVehicle = false;
      isNewMember = false;
      queueId = null;
      serviceCategory = '';
      serviceDescription = '';

      document.getElementById('phone-input').value = '';
      document.getElementById('otp-input').value = '';
      document.getElementById('member-name').value = '';
      document.getElementById('otp-display').style.display = 'none';
      document.getElementById('member-name-section').style.display = 'none';
      document.getElementById('new-vehicle-year').value = '';
      document.getElementById('new-vehicle-make').value = '';
      document.getElementById('new-vehicle-model').value = '';
      document.getElementById('new-vehicle-color').value = '';
      document.getElementById('service-category').value = '';
      document.getElementById('service-description').value = '';
      document.getElementById('add-vehicle-form').style.display = 'none';
      document.getElementById('add-vehicle-btn').style.display = 'block';

      document.getElementById('phone-next-btn').disabled = true;
      document.getElementById('otp-verify-btn').disabled = true;
      document.getElementById('vehicle-next-btn').disabled = true;
      document.getElementById('service-next-btn').disabled = true;

      goToScreen('welcome');
    }
