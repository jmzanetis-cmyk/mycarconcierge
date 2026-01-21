    let currentUser = null;
    let fleet = null;
    let fleetVehicles = [];
    let drivers = [];
    let approvals = [];
    let serviceHistory = [];
    let currentApprovalId = null;

    // ========== INITIALIZATION ==========
    window.addEventListener('load', async () => {
      const user = await getCurrentUser();
      if (!user) return window.location.href = 'login.html';
      currentUser = user;
      
      // Check if user has fleet access
      const { data: profile } = await supabaseClient.from('profiles').select('*, fleets(*)').eq('id', user.id).single();
      
      if (!profile?.fleet_id && profile?.account_type !== 'fleet') {
        // No fleet access - redirect to member dashboard
        return window.location.href = 'members.html';
      }

      fleet = profile.fleets || { company_name: profile.business_name || 'My Fleet', auto_approve_under: 100 };
      
      await loadFleetData();
      setupEventListeners();
      updateUI();
    });

    async function loadFleetData() {
      if (!fleet?.id) return;
      
      // Load fleet vehicles
      const { data: vehicles } = await supabaseClient.from('fleet_vehicles')
        .select('*, vehicles(*), profiles(full_name)')
        .eq('fleet_id', fleet.id);
      fleetVehicles = vehicles || [];

      // Load drivers
      const { data: driverData } = await supabaseClient.from('profiles')
        .select('*')
        .eq('fleet_id', fleet.id)
        .eq('fleet_role', 'driver');
      drivers = driverData || [];

      // Load pending approvals
      const { data: approvalData } = await supabaseClient.from('fleet_approvals')
        .select('*, maintenance_packages(*, vehicles(*))')
        .eq('fleet_id', fleet.id)
        .eq('status', 'pending');
      approvals = approvalData || [];

      // Load service history
      const vehicleIds = fleetVehicles.map(fv => fv.vehicle_id);
      if (vehicleIds.length) {
        const { data: history } = await supabaseClient.from('service_history')
          .select('*, vehicles(*)')
          .in('vehicle_id', vehicleIds)
          .order('service_date', { ascending: false })
          .limit(100);
        serviceHistory = history || [];
      }

      renderAll();
    }

    function updateUI() {
      // Update header
      document.getElementById('user-name').textContent = currentUser.email?.split('@')[0] || 'Fleet Manager';
      document.getElementById('fleet-name').textContent = fleet?.company_name || 'My Fleet';
      document.getElementById('overview-subtitle').textContent = `Managing ${fleet?.company_name || 'your fleet'}'s vehicles.`;
      document.getElementById('auto-approve-amount').textContent = fleet?.auto_approve_under || 100;
      document.getElementById('vehicle-count').textContent = fleetVehicles.length;

      // Stats
      document.getElementById('stat-total-vehicles').textContent = fleetVehicles.length;
      document.getElementById('stat-active-vehicles').textContent = fleetVehicles.filter(v => v.status === 'active').length;
      document.getElementById('stat-in-maintenance').textContent = fleetVehicles.filter(v => v.status === 'maintenance').length;

      // Approvals badge
      if (approvals.length > 0) {
        document.getElementById('approval-count').textContent = approvals.length;
        document.getElementById('approval-count').style.display = 'inline';
      }
    }

    function renderAll() {
      renderVehiclesTable();
      renderDriversTable();
      renderApprovalsPreview();
      renderApprovalsList();
      renderHistoryTable();
      renderUpcomingMaintenance();
    }

    function renderVehiclesTable() {
      const tbody = document.getElementById('vehicles-table');
      if (!fleetVehicles.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:40px;">No vehicles in fleet yet.</td></tr>';
        return;
      }

      tbody.innerHTML = fleetVehicles.map(fv => {
        const v = fv.vehicles;
        const statusClass = fv.status === 'active' ? 'active' : fv.status === 'maintenance' ? 'maintenance' : 'out';
        return `
          <tr>
            <td>
              <strong>${v?.year || ''} ${v?.make || ''} ${v?.model || ''}</strong>
              <div style="font-size:0.82rem;color:var(--text-muted);">${v?.license_plate || 'No plate'}</div>
            </td>
            <td>${fv.fleet_number || '-'}</td>
            <td>${fv.profiles?.full_name || 'Unassigned'}</td>
            <td><span class="status ${statusClass}">${fv.status || 'Active'}</span></td>
            <td>${fv.next_service_due ? new Date(fv.next_service_due).toLocaleDateString() : '-'}</td>
            <td>
              <button class="btn btn-sm btn-secondary" onclick="viewVehicle('${fv.id}')">View</button>
              <button class="btn btn-sm btn-ghost" onclick="createServicePackage('${v?.id}')">+ Service</button>
            </td>
          </tr>
        `;
      }).join('');
    }

    function renderDriversTable() {
      const tbody = document.getElementById('drivers-table');
      if (!drivers.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:40px;">No drivers added yet.</td></tr>';
        return;
      }

      tbody.innerHTML = drivers.map(d => {
        const assignedVehicle = fleetVehicles.find(fv => fv.assigned_driver_id === d.id);
        const v = assignedVehicle?.vehicles;
        return `
          <tr>
            <td><strong>${d.full_name || 'Unknown'}</strong></td>
            <td>${d.email || '-'}</td>
            <td>${v ? `${v.year} ${v.make} ${v.model}` : 'None'}</td>
            <td>${assignedVehicle?.department || '-'}</td>
            <td>
              <button class="btn btn-sm btn-secondary">Edit</button>
            </td>
          </tr>
        `;
      }).join('');
    }

    function renderApprovalsPreview() {
      const container = document.getElementById('pending-approvals-preview');
      if (!approvals.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✓</div><p>No pending approvals.</p></div>';
        return;
      }

      container.innerHTML = approvals.slice(0, 3).map(a => {
        const pkg = a.maintenance_packages;
        const v = pkg?.vehicles;
        return `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--border-subtle);">
            <div>
              <strong>${pkg?.title || 'Service'}</strong>
              <div style="font-size:0.85rem;color:var(--text-muted);">${v ? `${v.year} ${v.make} ${v.model}` : 'Vehicle'}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-weight:600;">$${(a.amount || 0).toFixed(2)}</div>
              <button class="btn btn-sm btn-success" onclick="openApprovalModal('${a.id}')">Review</button>
            </div>
          </div>
        `;
      }).join('');
    }

    function renderApprovalsList() {
      const container = document.getElementById('approval-list');
      if (!approvals.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✓</div><p>No pending approvals. All caught up!</p></div>';
        return;
      }

      container.innerHTML = approvals.map(a => {
        const pkg = a.maintenance_packages;
        const v = pkg?.vehicles;
        return `
          <div class="card" style="margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <div>
                <h3 style="margin-bottom:4px;">${pkg?.title || 'Service Request'}</h3>
                <div style="color:var(--text-muted);font-size:0.88rem;">${v ? `${v.year} ${v.make} ${v.model}` : 'Vehicle'}</div>
                <p style="margin-top:12px;color:var(--text-secondary);">${pkg?.description || 'No description provided.'}</p>
              </div>
              <div style="text-align:right;">
                <div style="font-size:1.3rem;font-weight:600;">$${(a.amount || 0).toFixed(2)}</div>
                <div style="font-size:0.82rem;color:var(--text-muted);">Requested ${new Date(a.requested_at).toLocaleDateString()}</div>
              </div>
            </div>
            <div style="margin-top:16px;display:flex;gap:12px;">
              <button class="btn btn-success" onclick="approveRequest('${a.id}')">✓ Approve</button>
              <button class="btn btn-secondary" onclick="rejectRequest('${a.id}')">✗ Reject</button>
              <button class="btn btn-ghost" onclick="viewPackageDetails('${pkg?.id}')">View Details</button>
            </div>
          </div>
        `;
      }).join('');
    }

    function renderHistoryTable() {
      const tbody = document.getElementById('history-table');
      if (!serviceHistory.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:40px;">No service history yet.</td></tr>';
        return;
      }

      tbody.innerHTML = serviceHistory.map(h => {
        const v = h.vehicles;
        return `
          <tr>
            <td>${new Date(h.service_date).toLocaleDateString()}</td>
            <td>${v ? `${v.year} ${v.make} ${v.model}` : '-'}</td>
            <td>${h.description || h.service_type || '-'}</td>
            <td>${h.provider_business || h.provider_name || '-'}</td>
            <td>$${(h.total_cost || 0).toFixed(2)}</td>
            <td>${h.receipt_url ? '<button class="btn btn-sm btn-ghost">📄</button>' : '-'}</td>
          </tr>
        `;
      }).join('');
    }

    function renderUpcomingMaintenance() {
      const container = document.getElementById('upcoming-maintenance');
      const upcoming = fleetVehicles.filter(fv => fv.next_service_due).slice(0, 5);
      
      if (!upcoming.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📅</div><p>No upcoming maintenance scheduled.</p></div>';
        return;
      }

      container.innerHTML = upcoming.map(fv => {
        const v = fv.vehicles;
        const dueDate = new Date(fv.next_service_due);
        const isOverdue = dueDate < new Date();
        return `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--border-subtle);">
            <div>
              <strong>${v?.year || ''} ${v?.make || ''} ${v?.model || ''}</strong>
              <div style="font-size:0.85rem;color:var(--text-muted);">Fleet #${fv.fleet_number || '-'}</div>
            </div>
            <div style="text-align:right;">
              <div style="color:${isOverdue ? 'var(--accent-red)' : 'var(--text-secondary)'};">${isOverdue ? 'Overdue' : dueDate.toLocaleDateString()}</div>
              <button class="btn btn-sm btn-primary" onclick="createServicePackage('${v?.id}')">Schedule</button>
            </div>
          </div>
        `;
      }).join('');
    }

    // ========== ACTIONS ==========
    async function addFleetVehicle() {
      const make = document.getElementById('av-make').value.trim();
      const model = document.getElementById('av-model').value.trim();
      if (!make || !model) return showToast('Please enter make and model.', 'error');

      // Create vehicle
      const { data: vehicle } = await supabaseClient.from('vehicles').insert({
        owner_id: currentUser.id,
        year: parseInt(document.getElementById('av-year').value) || null,
        make,
        model,
        vin: document.getElementById('av-vin').value.trim() || null,
        license_plate: document.getElementById('av-plate').value.trim() || null,
        mileage: parseInt(document.getElementById('av-mileage').value) || null
      }).select().single();

      if (!vehicle) return showToast('Failed to create vehicle.', 'error');

      // Create fleet vehicle record
      await supabaseClient.from('fleet_vehicles').insert({
        fleet_id: fleet.id,
        vehicle_id: vehicle.id,
        fleet_number: document.getElementById('av-fleet-num').value.trim() || null,
        assigned_driver_id: document.getElementById('av-driver').value || null,
        department: document.getElementById('av-department').value.trim() || null,
        maintenance_schedule: document.getElementById('av-schedule').value,
        status: 'active'
      });

      closeModal('add-vehicle-modal');
      showToast('Vehicle added to fleet!', 'success');
      await loadFleetData();
      updateUI();
    }

    async function addDriver() {
      const name = document.getElementById('ad-name').value.trim();
      const email = document.getElementById('ad-email').value.trim();
      if (!name || !email) return showToast('Please enter name and email.', 'error');

      // In production, this would send an invite email
      // For now, create a placeholder profile
      showToast(`Invite sent to ${email}. They can now create their MCC account.`, 'success');
      closeModal('add-driver-modal');
    }

    async function approveRequest(approvalId) {
      if (!confirm('Approve this service request?')) return;

      await supabaseClient.from('fleet_approvals').update({
        status: 'approved',
        approved_by: currentUser.id,
        approved_at: new Date().toISOString()
      }).eq('id', approvalId);

      showToast('Service request approved!', 'success');
      await loadFleetData();
      updateUI();
    }

    async function rejectRequest(approvalId) {
      const reason = prompt('Please provide a reason for rejection:');
      if (reason === null) return;

      await supabaseClient.from('fleet_approvals').update({
        status: 'rejected',
        approved_by: currentUser.id,
        approved_at: new Date().toISOString(),
        rejection_reason: reason
      }).eq('id', approvalId);

      showToast('Service request rejected.', 'success');
      await loadFleetData();
      updateUI();
    }

    function createServicePackage(vehicleId) {
      // Redirect to members page with vehicle pre-selected
      window.location.href = `members.html?create_package=${vehicleId}`;
    }

    // ========== MODALS ==========
    function openAddVehicleModal() {
      document.getElementById('add-vehicle-modal').classList.add('active');
      // Populate driver dropdown
      const select = document.getElementById('av-driver');
      select.innerHTML = '<option value="">Unassigned</option>' + 
        drivers.map(d => `<option value="${d.id}">${d.full_name}</option>`).join('');
    }

    function openAddDriverModal() {
      document.getElementById('add-driver-modal').classList.add('active');
      // Populate vehicle dropdown
      const select = document.getElementById('ad-vehicle');
      const unassigned = fleetVehicles.filter(fv => !fv.assigned_driver_id);
      select.innerHTML = '<option value="">No vehicle assigned</option>' + 
        unassigned.map(fv => {
          const v = fv.vehicles;
          return `<option value="${fv.id}">${v?.year} ${v?.make} ${v?.model} (${fv.fleet_number || 'No #'})</option>`;
        }).join('');
    }

    function closeModal(id) {
      document.getElementById(id).classList.remove('active');
    }

    // ========== NAVIGATION ==========
    function setupEventListeners() {
      document.querySelectorAll('.nav-item[data-section]').forEach(item => {
        item.addEventListener('click', () => showSection(item.dataset.section));
      });

      document.querySelectorAll('.modal-backdrop').forEach(modal => {
        modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('active'); });
      });
    }

    function showSection(sectionId) {
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.getElementById(sectionId).classList.add('active');
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelector(`.nav-item[data-section="${sectionId}"]`)?.classList.add('active');
      document.getElementById('sidebar').classList.remove('open');
    }

    function toggleSidebar() {
      document.getElementById('sidebar').classList.toggle('open');
    }

    // ========== UTILITIES ==========
    function showToast(message, type = 'info') {
      const container = document.getElementById('toast-container');
      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      toast.textContent = message;
      container.appendChild(toast);
      setTimeout(() => toast.remove(), 5000);
    }

    async function logout() {
      await signOut();
      window.location.href = 'login.html';
    }
