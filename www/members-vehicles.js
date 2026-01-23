// ========== MY CAR CONCIERGE - VEHICLES MODULE ==========
// Vehicle management, recalls, registration verification, vehicle details

    // ========== VEHICLE RECALLS FUNCTIONS ==========
    
    async function fetchVehicleRecalls(vehicleId, refresh = false) {
      try {
        const url = `/api/vehicle/${vehicleId}/recalls${refresh ? '?refresh=true' : ''}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.success) {
          vehicleRecalls[vehicleId] = {
            recalls: data.recalls || [],
            activeCount: data.active_count || 0,
            totalCount: data.total_count || 0
          };
          return vehicleRecalls[vehicleId];
        }
        return null;
      } catch (error) {
        console.error('Error fetching recalls:', error);
        return null;
      }
    }
    
    async function loadAllVehicleRecalls() {
      for (const vehicle of vehicles) {
        await fetchVehicleRecalls(vehicle.id, false);
      }
      renderVehicles();
    }
    
    async function openRecallsModal(vehicleId) {
      currentRecallsVehicleId = vehicleId;
      const vehicle = vehicles.find(v => v.id === vehicleId);
      if (!vehicle) return;
      
      const vehicleName = vehicle.nickname || `${vehicle.year || ''} ${vehicle.make} ${vehicle.model}`.trim();
      const vehicleDetails = `${vehicle.year || ''} ${vehicle.make} ${vehicle.model} ${vehicle.trim || ''}`.trim();
      
      document.getElementById('recalls-vehicle-name').textContent = vehicleName;
      document.getElementById('recalls-vehicle-details').textContent = vehicleDetails;
      document.getElementById('recalls-list').innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted);">Loading recalls...</div>';
      document.getElementById('recalls-empty').style.display = 'none';
      document.getElementById('recalls-active-count').textContent = '...';
      
      openModal('recalls-modal');
      
      const recallData = await fetchVehicleRecalls(vehicleId, false);
      renderRecallsList(recallData);
    }
    
    async function refreshVehicleRecalls() {
      if (!currentRecallsVehicleId) return;
      
      const btn = document.getElementById('refresh-recalls-btn');
      btn.disabled = true;
      btn.innerHTML = '⏳ Checking...';
      
      document.getElementById('recalls-list').innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted);">Checking NHTSA for updates...</div>';
      
      try {
        const recallData = await fetchVehicleRecalls(currentRecallsVehicleId, true);
        renderRecallsList(recallData);
        renderVehicles();
      } catch (error) {
        console.error('Error refreshing recalls:', error);
      } finally {
        btn.disabled = false;
        btn.innerHTML = '🔄 Check for Updates';
      }
    }
    
    function renderRecallsList(recallData) {
      const listEl = document.getElementById('recalls-list');
      const emptyEl = document.getElementById('recalls-empty');
      const countEl = document.getElementById('recalls-active-count');
      
      if (!recallData || !recallData.recalls || recallData.recalls.length === 0) {
        listEl.innerHTML = '';
        emptyEl.style.display = 'block';
        countEl.textContent = '0';
        return;
      }
      
      emptyEl.style.display = 'none';
      countEl.textContent = recallData.activeCount || 0;
      
      listEl.innerHTML = recallData.recalls.map(recall => {
        const isAcknowledged = recall.is_acknowledged;
        const statusClass = isAcknowledged ? 'addressed' : 'active';
        const cardClass = isAcknowledged ? 'acknowledged' : 'unacknowledged';
        const statusText = isAcknowledged ? 'Addressed' : 'Active';
        
        return `
          <div class="recall-card ${cardClass}">
            <div class="recall-card-header">
              <div>
                <div class="recall-card-title">${escapeHtml(recall.component || 'Unknown Component')}</div>
                <div class="recall-card-campaign">Campaign #${escapeHtml(recall.nhtsa_campaign_number || 'N/A')}</div>
              </div>
              <span class="recall-card-status ${statusClass}">${statusText}</span>
            </div>
            
            ${recall.summary ? `
              <div class="recall-card-section">
                <div class="recall-card-section-title">Summary</div>
                <div class="recall-card-section-content">${escapeHtml(recall.summary)}</div>
              </div>
            ` : ''}
            
            ${recall.consequence ? `
              <div class="recall-card-section">
                <div class="recall-card-section-title">⚠️ Consequence</div>
                <div class="recall-card-section-content" style="color: var(--accent-red);">${escapeHtml(recall.consequence)}</div>
              </div>
            ` : ''}
            
            ${recall.remedy ? `
              <div class="recall-card-section">
                <div class="recall-card-section-title">✅ Remedy</div>
                <div class="recall-card-section-content">${escapeHtml(recall.remedy)}</div>
              </div>
            ` : ''}
            
            ${!isAcknowledged ? `
              <div class="recall-card-actions">
                <button class="btn btn-success btn-sm" onclick="acknowledgeRecall('${recall.id}')">
                  ✓ Mark as Addressed
                </button>
                <button class="btn btn-secondary btn-sm" onclick="createPackageForVehicle('${currentRecallsVehicleId}')">
                  📦 Request Service
                </button>
              </div>
            ` : `
              <div class="recall-card-actions">
                <span style="font-size: 0.82rem; color: var(--text-muted);">
                  ✓ Addressed ${recall.acknowledged_at ? new Date(recall.acknowledged_at).toLocaleDateString() : ''}
                </span>
              </div>
            `}
          </div>
        `;
      }).join('');
    }
    
    async function acknowledgeRecall(recallId) {
      try {
        const response = await fetch(`/api/recalls/${recallId}/acknowledge`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: currentUser?.id || null })
        });
        
        const data = await response.json();
        
        if (data.success) {
          const recallData = await fetchVehicleRecalls(currentRecallsVehicleId, false);
          renderRecallsList(recallData);
          renderVehicles();
        } else {
          alert('Failed to acknowledge recall: ' + (data.error || 'Unknown error'));
        }
      } catch (error) {
        console.error('Error acknowledging recall:', error);
        alert('Error acknowledging recall');
      }
    }
    
    // ========== END VEHICLE RECALLS ==========

    // ========== REGISTRATION VERIFICATION FUNCTIONS ==========
    
    async function uploadRegistrationDocument(file, vehicleId) {
      if (!supabaseClient) {
        console.error('Supabase client not initialized');
        return null;
      }
      
      try {
        const userId = currentUser?.id;
        if (!userId) {
          showToast('User not authenticated', 'error');
          return null;
        }
        
        const timestamp = Date.now();
        const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filePath = `${userId}/${timestamp}_${safeFileName}`;
        
        const { data, error } = await supabaseClient.storage
          .from('registrations')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });
        
        if (error) {
          console.error('Upload error:', error);
          showToast('Failed to upload document: ' + error.message, 'error');
          return null;
        }
        
        const { data: publicData } = supabaseClient.storage
          .from('registrations')
          .getPublicUrl(filePath);
        
        if (publicData?.publicUrl) {
          return publicData.publicUrl;
        }
        
        return null;
      } catch (error) {
        console.error('Upload error:', error);
        showToast('Failed to upload document', 'error');
        return null;
      }
    }
    
    async function verifyRegistration(registrationUrl, vehicleId) {
      try {
        const response = await fetch('/api/registration/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            registrationUrl: registrationUrl,
            vehicleId: vehicleId
          })
        });
        
        const data = await response.json();
        
        if (data.success) {
          vehicleRegistrationStatus[vehicleId] = {
            verified: data.status === 'approved',
            status: data.status,
            details: data.details || null
          };
          
          if (data.status === 'approved') {
            const vehicle = vehicles.find(v => v.id === vehicleId);
            if (vehicle) {
              vehicle.registration_verified = true;
            }
          }
          
          return data;
        } else {
          return { success: false, error: data.error || 'Verification failed' };
        }
      } catch (error) {
        console.error('Verification error:', error);
        return { success: false, error: 'Failed to verify registration' };
      }
    }
    
    async function checkRegistrationStatus(vehicleId) {
      try {
        const response = await fetch(`/api/registration/verifications?vehicleId=${vehicleId}`);
        const data = await response.json();
        
        if (data.success && data.verifications && data.verifications.length > 0) {
          const latestVerification = data.verifications[0];
          vehicleRegistrationStatus[vehicleId] = {
            verified: latestVerification.status === 'approved',
            status: latestVerification.status,
            details: latestVerification.extracted_data || null
          };
          return latestVerification;
        }
        return null;
      } catch (error) {
        console.error('Check status error:', error);
        return null;
      }
    }
    
    function openRegistrationModal(vehicleId) {
      currentRegistrationVehicleId = vehicleId;
      document.getElementById('registration-vehicle-id').value = vehicleId;
      
      pendingRegistrationFile = null;
      document.getElementById('registration-upload-area').style.display = 'none';
      document.getElementById('registration-upload-buttons').style.display = 'grid';
      document.getElementById('registration-drop-zone').style.display = 'block';
      document.getElementById('registration-preview-img').src = '';
      document.getElementById('registration-file-info').style.display = 'none';
      document.getElementById('registration-loading').style.display = 'none';
      document.getElementById('registration-result').style.display = 'none';
      document.getElementById('verify-registration-btn').disabled = true;
      
      const status = vehicleRegistrationStatus[vehicleId];
      const statusContainer = document.getElementById('registration-current-status');
      if (status) {
        statusContainer.style.display = 'block';
        const statusLabels = {
          pending: '⏳ Pending Review',
          approved: '✅ Approved',
          rejected: '❌ Rejected',
          needs_review: '🔍 Needs Manual Review'
        };
        document.getElementById('registration-status-display').innerHTML = `
          <span class="registration-status-badge ${status.status}">${statusLabels[status.status] || status.status}</span>
        `;
      } else {
        statusContainer.style.display = 'none';
      }
      
      openModal('registration-modal');
    }
    
    function handleRegistrationFileSelect(event) {
      const file = event.target.files[0];
      if (!file) return;
      
      if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
        showToast('Please upload a JPG or PNG image', 'error');
        return;
      }
      
      processRegistrationFile(file);
      event.target.value = '';
    }
    
    function removeRegistrationFile() {
      pendingRegistrationFile = null;
      document.getElementById('registration-upload-area').style.display = 'none';
      document.getElementById('registration-upload-buttons').style.display = 'grid';
      document.getElementById('registration-drop-zone').style.display = 'block';
      document.getElementById('registration-preview-img').src = '';
      document.getElementById('registration-file-info').style.display = 'none';
      document.getElementById('verify-registration-btn').disabled = true;
    }
    
    function handleRegistrationDragOver(event) {
      event.preventDefault();
      event.stopPropagation();
      const dropZone = document.getElementById('registration-drop-zone');
      dropZone.style.borderColor = 'var(--accent-gold)';
      dropZone.style.background = 'var(--accent-gold-soft)';
    }
    
    function handleRegistrationDragLeave(event) {
      event.preventDefault();
      event.stopPropagation();
      const dropZone = document.getElementById('registration-drop-zone');
      dropZone.style.borderColor = 'var(--border-medium)';
      dropZone.style.background = 'transparent';
    }
    
    function handleRegistrationDrop(event) {
      event.preventDefault();
      event.stopPropagation();
      const dropZone = document.getElementById('registration-drop-zone');
      dropZone.style.borderColor = 'var(--border-medium)';
      dropZone.style.background = 'transparent';
      
      const files = event.dataTransfer?.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
          processRegistrationFile(file);
        } else {
          showToast('Please upload a JPG or PNG image', 'error');
        }
      }
    }
    
    function processRegistrationFile(file) {
      if (file.size > 10 * 1024 * 1024) {
        showToast('File is too large. Maximum size is 10MB.', 'error');
        return;
      }
      
      pendingRegistrationFile = file;
      
      const reader = new FileReader();
      reader.onload = function(e) {
        document.getElementById('registration-preview-img').src = e.target.result;
        document.getElementById('registration-upload-area').style.display = 'block';
        document.getElementById('registration-upload-buttons').style.display = 'none';
        document.getElementById('registration-drop-zone').style.display = 'none';
        
        document.getElementById('registration-file-name').textContent = file.name;
        document.getElementById('registration-file-size').textContent = formatFileSize(file.size);
        document.getElementById('registration-file-info').style.display = 'flex';
        
        document.getElementById('verify-registration-btn').disabled = false;
      };
      reader.readAsDataURL(file);
    }
    
    function formatFileSize(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
    
    async function submitRegistrationVerification() {
      if (!pendingRegistrationFile || !currentRegistrationVehicleId) {
        showToast('Please select a registration document', 'error');
        return;
      }
      
      const btn = document.getElementById('verify-registration-btn');
      btn.disabled = true;
      btn.innerHTML = '⏳ Processing...';
      
      document.getElementById('registration-loading').style.display = 'block';
      document.getElementById('registration-result').style.display = 'none';
      document.getElementById('registration-loading-icon').textContent = '📤';
      document.getElementById('registration-loading-text').textContent = 'Uploading document...';
      document.getElementById('registration-loading-subtext').textContent = 'Please wait';
      document.getElementById('registration-progress-bar').style.width = '20%';
      
      try {
        const registrationUrl = await uploadRegistrationDocument(pendingRegistrationFile, currentRegistrationVehicleId);
        
        document.getElementById('registration-progress-bar').style.width = '50%';
        
        if (!registrationUrl) {
          throw new Error('Failed to upload document');
        }
        
        document.getElementById('registration-loading-icon').textContent = '🔍';
        document.getElementById('registration-loading-text').textContent = 'Analyzing document...';
        document.getElementById('registration-loading-subtext').textContent = 'Extracting registration details';
        document.getElementById('registration-progress-bar').style.width = '70%';
        
        const result = await verifyRegistration(registrationUrl, currentRegistrationVehicleId);
        
        document.getElementById('registration-progress-bar').style.width = '100%';
        await new Promise(resolve => setTimeout(resolve, 300));
        document.getElementById('registration-loading').style.display = 'none';
        
        const resultContainer = document.getElementById('registration-result');
        resultContainer.style.display = 'block';
        
        if (result.success) {
          const statusConfig = {
            approved: {
              icon: '✅',
              title: 'Registration Verified!',
              message: 'Your vehicle registration has been successfully verified.',
              class: 'approved',
              bgColor: 'var(--accent-green-soft)',
              borderColor: 'rgba(74,200,140,0.3)',
              color: 'var(--accent-green)'
            },
            needs_review: {
              icon: '🔍',
              title: 'Manual Review Required',
              message: 'Your registration requires manual review. We\'ll verify it within 24-48 hours.',
              class: 'needs_review',
              bgColor: 'var(--accent-blue-soft)',
              borderColor: 'rgba(74,124,255,0.3)',
              color: 'var(--accent-blue)'
            },
            rejected: {
              icon: '❌',
              title: 'Verification Failed',
              message: 'The registration document could not be verified. Please ensure the image is clear and try again.',
              class: 'rejected',
              bgColor: 'rgba(239,95,95,0.15)',
              borderColor: 'rgba(239,95,95,0.3)',
              color: 'var(--accent-red)'
            },
            pending: {
              icon: '⏳',
              title: 'Verification Pending',
              message: 'Your registration is being processed.',
              class: 'pending',
              bgColor: 'var(--accent-orange-soft)',
              borderColor: 'rgba(245,158,11,0.3)',
              color: 'var(--accent-orange)'
            }
          };
          
          const config = statusConfig[result.status] || statusConfig.pending;
          
          resultContainer.innerHTML = `
            <div style="background:${config.bgColor};border:1px solid ${config.borderColor};border-radius:var(--radius-md);padding:20px;text-align:center;">
              <div style="font-size:48px;margin-bottom:12px;">${config.icon}</div>
              <div style="font-weight:600;font-size:1.1rem;margin-bottom:8px;color:${config.color};">${config.title}</div>
              <p style="color:var(--text-secondary);font-size:0.9rem;">${config.message}</p>
              ${result.details ? `
                <div style="margin-top:12px;padding:12px;background:var(--bg-elevated);border-radius:var(--radius-md);text-align:left;">
                  <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:8px;">Extracted Information:</div>
                  ${result.details.licensePlate ? `<div style="font-size:0.88rem;"><strong>Plate:</strong> ${result.details.licensePlate}</div>` : ''}
                  ${result.details.vin ? `<div style="font-size:0.88rem;"><strong>VIN:</strong> ${result.details.vin}</div>` : ''}
                  ${result.details.expirationDate ? `<div style="font-size:0.88rem;"><strong>Expires:</strong> ${result.details.expirationDate}</div>` : ''}
                </div>
              ` : ''}
            </div>
          `;
          
          if (result.status === 'approved') {
            showToast('Registration verified successfully!', 'success');
            renderVehicles();
          }
        } else {
          resultContainer.innerHTML = `
            <div style="background:rgba(239,95,95,0.15);border:1px solid rgba(239,95,95,0.3);border-radius:var(--radius-md);padding:20px;text-align:center;">
              <div style="font-size:48px;margin-bottom:12px;">❌</div>
              <div style="font-weight:600;font-size:1.1rem;margin-bottom:8px;color:var(--accent-red);">Verification Error</div>
              <p style="color:var(--text-secondary);font-size:0.9rem;">${result.error || 'An error occurred during verification. Please try again.'}</p>
            </div>
          `;
        }
        
        btn.innerHTML = '✓ Verify Registration';
        btn.disabled = true;
        
      } catch (error) {
        console.error('Verification error:', error);
        document.getElementById('registration-progress-bar').style.width = '0%';
        document.getElementById('registration-loading').style.display = 'none';
        document.getElementById('registration-result').innerHTML = `
          <div style="background:rgba(239,95,95,0.15);border:1px solid rgba(239,95,95,0.3);border-radius:var(--radius-md);padding:20px;text-align:center;">
            <div style="font-size:48px;margin-bottom:12px;">❌</div>
            <div style="font-weight:600;font-size:1.1rem;margin-bottom:8px;color:var(--accent-red);">Upload Failed</div>
            <p style="color:var(--text-secondary);font-size:0.9rem;">${error.message || 'Failed to upload the document. Please try again.'}</p>
          </div>
        `;
        document.getElementById('registration-result').style.display = 'block';
        
        btn.innerHTML = '✓ Verify Registration';
        btn.disabled = false;
      }
    }
    
    // ========== END REGISTRATION VERIFICATION ==========

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
      
      // Populate trim datalist based on make and set current value
      const trimInput = document.getElementById('edit-v-trim');
      const trimDatalist = document.getElementById('edit-v-trim-options');
      trimDatalist.innerHTML = '';
      
      // Add trim options from the make's trim list
      const trims = vehicleData.trims[vehicle.make] || vehicleData.trims['default'] || [];
      trims.forEach(trim => {
        const opt = document.createElement('option');
        opt.value = trim;
        trimDatalist.appendChild(opt);
      });
      
      // Set the current trim value (works for both predefined and custom trims)
      trimInput.value = vehicle.trim || '';
      
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
      const trimInput = document.getElementById('edit-v-trim');
      const trimDatalist = document.getElementById('edit-v-trim-options');
      
      // Reset model and trim
      modelSelect.innerHTML = '<option value="">Select Model</option>';
      trimInput.value = '';
      trimDatalist.innerHTML = '';
      
      // Populate makes (same makes regardless of year)
      makeSelect.innerHTML = '<option value="">Select Make</option>';
      vehicleData.makes.forEach(make => {
        makeSelect.innerHTML += `<option value="${make}">${make}</option>`;
      });
    }

    function updateEditModelOptions() {
      const makeValue = document.getElementById('edit-v-make').value;
      const modelSelect = document.getElementById('edit-v-model');
      const trimInput = document.getElementById('edit-v-trim');
      const trimDatalist = document.getElementById('edit-v-trim-options');
      
      modelSelect.innerHTML = '<option value="">Select Model</option>';
      trimInput.value = '';
      trimDatalist.innerHTML = '';
      
      if (makeValue && vehicleData.models[makeValue]) {
        vehicleData.models[makeValue].forEach(model => {
          modelSelect.innerHTML += `<option value="${model}">${model}</option>`;
        });
      }
    }

    function updateEditTrimOptions() {
      const makeValue = document.getElementById('edit-v-make').value;
      const trimInput = document.getElementById('edit-v-trim');
      const trimDatalist = document.getElementById('edit-v-trim-options');
      
      trimInput.value = '';
      trimDatalist.innerHTML = '';
      
      // Populate with trims based on make (or default)
      const trims = vehicleData.trims[makeValue] || vehicleData.trims['default'] || [];
      trims.forEach(trim => {
        const opt = document.createElement('option');
        opt.value = trim;
        trimDatalist.appendChild(opt);
      });
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
          
          <div style="margin-top:24px;padding:16px;background:var(--bg-input);border-radius:var(--radius-lg);border:1px solid var(--border-subtle);">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
              <div>
                <div style="font-weight:600;margin-bottom:4px;">📋 Registration Verification</div>
                <div style="font-size:0.88rem;color:var(--text-muted);">
                  ${vehicle.registration_verified || vehicleRegistrationStatus[vehicleId]?.verified 
                    ? '<span style="color:var(--accent-green);">✅ Verified</span>' 
                    : vehicleRegistrationStatus[vehicleId]?.status === 'pending' 
                      ? '<span style="color:var(--accent-orange);">⏳ Pending Review</span>'
                      : vehicleRegistrationStatus[vehicleId]?.status === 'needs_review'
                        ? '<span style="color:var(--accent-blue);">🔍 Under Review</span>'
                        : 'Not verified yet'}
                </div>
              </div>
              ${vehicle.registration_verified || vehicleRegistrationStatus[vehicleId]?.verified 
                ? '<span class="registration-status-badge approved">✓ Verified</span>'
                : `<button class="btn btn-primary" onclick="openRegistrationModal('${vehicleId}')" style="padding:10px 20px;">📋 Verify Registration</button>`
              }
            </div>
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
          const configDomain = (window.MCC_CONFIG && window.MCC_CONFIG.siteUrl) ? window.MCC_CONFIG.siteUrl.replace(/^https?:\/\//, '') : 'mycarconcierge.com';
          doc.text('Generated by My Car Concierge • ' + configDomain, margin, pageHeight - 10);
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
