    let currentStep = 1;
    let uploadedFiles = { license: [], insurance: [], certs: [], portfolio: [] };
    let userId = null;

    // ========== SIGNATURE PAD ==========
    let signaturePad = null;
    let isDrawing = false;
    let signatureData = null;

    function initSignaturePad() {
      const canvas = document.getElementById('signature-pad');
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      
      // Set canvas size for high DPI displays
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * 2;
      canvas.height = rect.height * 2;
      ctx.scale(2, 2);
      
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      let lastX = 0;
      let lastY = 0;

      function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        if (e.touches) {
          return {
            x: e.touches[0].clientX - rect.left,
            y: e.touches[0].clientY - rect.top
          };
        }
        return {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        };
      }

      function startDrawing(e) {
        isDrawing = true;
        const pos = getPos(e);
        lastX = pos.x;
        lastY = pos.y;
        document.getElementById('signature-error').style.display = 'none';
      }

      function draw(e) {
        if (!isDrawing) return;
        e.preventDefault();
        
        const pos = getPos(e);
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        
        lastX = pos.x;
        lastY = pos.y;
      }

      function stopDrawing() {
        if (isDrawing) {
          isDrawing = false;
          signatureData = canvas.toDataURL('image/png');
        }
      }

      // Mouse events
      canvas.addEventListener('mousedown', startDrawing);
      canvas.addEventListener('mousemove', draw);
      canvas.addEventListener('mouseup', stopDrawing);
      canvas.addEventListener('mouseout', stopDrawing);

      // Touch events
      canvas.addEventListener('touchstart', startDrawing);
      canvas.addEventListener('touchmove', draw);
      canvas.addEventListener('touchend', stopDrawing);
    }

    function clearSignature() {
      const canvas = document.getElementById('signature-pad');
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      signatureData = null;
    }

    function isSignatureEmpty() {
      const canvas = document.getElementById('signature-pad');
      if (!canvas) return true;
      
      const ctx = canvas.getContext('2d');
      const pixelData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      
      // Check if any pixel has been drawn
      for (let i = 3; i < pixelData.length; i += 4) {
        if (pixelData[i] > 0) return false;
      }
      return true;
    }

    // ========== END SIGNATURE PAD ==========

    // Checkbox toggle for service/brand selection checkboxes
    document.querySelectorAll('.checkbox-group .checkbox-item').forEach(item => {
      const checkbox = item.querySelector('input[type="checkbox"]');
      
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (checkbox) {
          checkbox.checked = !checkbox.checked;
          item.classList.toggle('selected', checkbox.checked);
        }
      });
    });

    function showMessage(text, type = 'error') {
      const msg = document.getElementById('message');
      msg.textContent = text;
      msg.className = `message show ${type}`;
      msg.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function hideMessage() {
      document.getElementById('message').className = 'message';
    }

    function updateStepIndicator() {
      document.querySelectorAll('.step-dot').forEach((dot, i) => {
        const stepNum = i + 1;
        dot.classList.remove('active', 'completed');
        if (stepNum === currentStep) dot.classList.add('active');
        else if (stepNum < currentStep) dot.classList.add('completed');
      });
    }

    function showStep(step) {
      document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
      document.getElementById(`step-${step}`).classList.add('active');
      currentStep = step;
      updateStepIndicator();
      hideMessage();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      // Hide benefits section after step 1
      const benefitsSection = document.getElementById('benefits-section');
      const learnMoreLink = document.getElementById('learn-more-link');
      if (benefitsSection) {
        benefitsSection.style.display = step === 1 ? 'grid' : 'none';
      }
      if (learnMoreLink) {
        learnMoreLink.style.display = step === 1 ? 'block' : 'none';
      }
      
      // Initialize signature pad when reaching step 6
      if (step === 6) {
        setTimeout(() => initSignaturePad(), 100);
      }
    }

    async function nextStep(current) {
      // Validation
      if (current === 1) {
        const email = document.getElementById('email').value.trim();
        const phone = document.getElementById('phone').value.trim();
        const password = document.getElementById('password').value;
        const confirm = document.getElementById('password-confirm').value;

        if (!email || !phone || !password) return showMessage('Please fill in all required fields.');
        if (password !== confirm) return showMessage('Passwords do not match.');
        if (password.length < 6) return showMessage('Password must be at least 6 characters.');

        // Try to create account first
        showMessage('Setting up your account...', 'info');
        const { data, error } = await supabaseClient.auth.signUp({ email, password });
        
        // If user already exists, try to sign them in instead
        if (error && error.message.toLowerCase().includes('already registered')) {
          showMessage('Account exists. Signing you in...', 'info');
          const { data: signInData, error: signInErr } = await supabaseClient.auth.signInWithPassword({ email, password });
          if (signInErr) {
            return showMessage('This email is already registered. Please use the correct password or log in first.');
          }
          userId = signInData.user?.id;
        } else if (error) {
          return showMessage(error.message);
        } else {
          userId = data.user?.id;
          
          // Sign in immediately to ensure we have a session for profile creation
          const { error: signInError } = await supabaseClient.auth.signInWithPassword({ email, password });
          if (signInError) {
            console.log('Auto sign-in note:', signInError.message);
            // Continue anyway - profile creation might still work
          }
        }

        if (!userId) {
          return showMessage('Error: Could not create or access user account.');
        }

        // Check if profile already exists (e.g., user is already a member)
        const { data: existingProfile } = await supabaseClient
          .from('profiles')
          .select('id, role, is_also_member')
          .eq('id', userId)
          .single();

        if (existingProfile) {
          // User already has a profile - update it to pending_provider and preserve/set is_also_member
          const { error: updateError } = await supabaseClient.from('profiles').update({
            role: 'pending_provider',
            is_also_member: existingProfile.is_also_member || existingProfile.role === 'member',
            phone: phone,
            free_trial_bids: 3
          }).eq('id', userId);

          if (updateError) {
            console.error('Profile update error:', updateError);
            return showMessage('Profile error: ' + updateError.message);
          }
          showMessage('Account updated! You can now apply as a provider.', 'success');
        } else {
          // Create new profile
          const { error: profileError } = await supabaseClient.from('profiles').insert({
            id: userId,
            role: 'pending_provider',
            phone: phone,
            free_trial_bids: 3
          });

          if (profileError) {
            console.error('Profile creation error:', profileError);
            return showMessage('Profile error: ' + profileError.message);
          }
          showMessage('Account created!', 'success');
        }

        // Handle referral code if provided
        const referralCode = document.getElementById('referral-code').value.trim().toUpperCase();
        if (referralCode) {
          try {
            // Use the RPC function to register the referral (bypasses RLS for founder updates)
            const { data: result, error: rpcError } = await supabaseClient
              .rpc('register_provider_referral', {
                p_referral_code: referralCode,
                p_provider_user_id: userId,
                p_provider_email: email
              });

            if (rpcError) {
              console.error('Referral RPC error:', rpcError);
              showMessage('Note: Could not process referral code, but your account has been created. You can continue with signup.', 'info');
            } else if (result && result.success) {
              showMessage(`Account created! Connected to referrer: ${result.founder_name}`, 'success');
            } else if (result && !result.success) {
              console.log('Referral not applied:', result.error);
              if (result.error === 'already_referred') {
                showMessage('Account created! A referral was already recorded for this account.', 'info');
              } else {
                showMessage('Note: The referral code entered was not recognized, but your account has been created. You can continue with signup.', 'info');
              }
            }
          } catch (refErr) {
            console.error('Referral processing error:', refErr);
            // Continue anyway - referral is optional
          }
        }
      }

      if (current === 2) {
        const businessName = document.getElementById('business-name').value.trim();
        const contactName = document.getElementById('contact-name').value.trim();
        const businessType = document.getElementById('business-type').value;
        const city = document.getElementById('city').value.trim();
        const state = document.getElementById('state').value.trim();
        const serviceArea = document.getElementById('service-area').value.trim();

        if (!businessName || !contactName || !businessType || !city || !state || !serviceArea) {
          return showMessage('Please fill in all required fields.');
        }
      }

      if (current === 3) {
        const years = document.getElementById('years-business').value;
        if (!years) return showMessage('Please enter years in business.');
        
        const services = Array.from(document.querySelectorAll('#services-checkboxes input:checked')).map(c => c.value);
        if (services.length === 0) return showMessage('Please select at least one service you offer.');
      }

      if (current === 4) {
        if (uploadedFiles.license.length === 0) return showMessage('Please upload your business license.');
        if (uploadedFiles.insurance.length === 0) return showMessage('Please upload your insurance certificate.');
      }

      // Step 5 doesn't require validation - references are optional
      
      // When moving to step 6 (legal agreement), populate the date
      if (current === 5) {
        const today = new Date().toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });
        document.getElementById('signature-date').value = today;
      }

      showStep(current + 1);
    }

    function prevStep(current) {
      showStep(current - 1);
    }

    function handleFileUpload(input, type) {
      const files = Array.from(input.files);
      files.forEach(file => {
        uploadedFiles[type].push(file);
      });
      renderUploadedFiles(type);
      input.value = '';
    }

    function renderUploadedFiles(type) {
      const container = document.getElementById(`files-${type}`);
      container.innerHTML = uploadedFiles[type].map((file, i) => `
        <div class="uploaded-file">
          <span>📄 ${file.name}</span>
          <button onclick="removeFile('${type}', ${i})">×</button>
        </div>
      `).join('');
    }

    function removeFile(type, index) {
      uploadedFiles[type].splice(index, 1);
      renderUploadedFiles(type);
    }

    function addReference() {
      const container = document.getElementById('references-container');
      const refHtml = `
        <div class="reference-card">
          <div class="reference-header">
            <span class="reference-title">Reference</span>
            <button class="reference-remove" onclick="this.closest('.reference-card').remove()">×</button>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Name</label>
              <input type="text" class="form-input ref-name" placeholder="Reference name">
            </div>
            <div class="form-group">
              <label class="form-label">Company</label>
              <input type="text" class="form-input ref-company" placeholder="Company">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Phone</label>
              <input type="tel" class="form-input ref-phone" placeholder="(555) 123-4567">
            </div>
            <div class="form-group">
              <label class="form-label">Relationship</label>
              <select class="form-select ref-relationship">
                <option value="customer">Customer</option>
                <option value="supplier">Supplier</option>
                <option value="partner">Business Partner</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
        </div>
      `;
      container.insertAdjacentHTML('beforeend', refHtml);
    }

    // Loaner vehicle toggle
    function toggleLoaner(show) {
      document.getElementById('loaner-details').style.display = show ? 'block' : 'none';
      document.querySelectorAll('#loaner-available .checkbox-item').forEach(item => {
        const radio = item.querySelector('input[type="radio"]');
        item.classList.toggle('selected', radio.value === (show ? 'yes' : 'no'));
      });
    }

    // Pickup fee toggle
    document.getElementById('pickup-fee')?.addEventListener('change', function() {
      const showAmount = ['flat', 'per_mile'].includes(this.value);
      document.getElementById('pickup-fee-amount-group').style.display = showAmount ? 'block' : 'none';
    });

    async function submitApplication() {
      // Validate all legal agreement checkboxes
      const legalName = document.getElementById('legal-name').value.trim();
      const agreeRead = document.getElementById('agree-read').checked;
      const agreeCircumvention = document.getElementById('agree-circumvention').checked;
      const agreeAnonymous = document.getElementById('agree-anonymous').checked;
      const agreeBinding = document.getElementById('agree-binding').checked;
      const agreeTerms = document.getElementById('agree-terms').checked;

      if (!legalName) {
        return showMessage('Please enter your full legal name to sign the agreement.');
      }
      
      // Validate signature
      if (isSignatureEmpty()) {
        document.getElementById('signature-error').style.display = 'block';
        return showMessage('Please sign in the signature box above.');
      }

      if (!agreeRead) {
        return showMessage('Please confirm you have read the Provider Service Agreement.');
      }
      if (!agreeCircumvention) {
        return showMessage('Please acknowledge the non-circumvention clause.');
      }
      if (!agreeAnonymous) {
        return showMessage('Please acknowledge the anonymous operation requirement.');
      }
      if (!agreeBinding) {
        return showMessage('Please acknowledge this is a legally binding agreement.');
      }
      if (!agreeTerms) {
        return showMessage('Please agree to the Terms of Service and Provider Agreement.');
      }

      showMessage('Submitting your application...', 'info');

      try {
        // Generate provider alias
        const aliasNumber = Math.floor(1000 + Math.random() * 9000);
        const providerAlias = `AutoPro #${aliasNumber}`;

        // Gather form data
        const services = Array.from(document.querySelectorAll('#services-checkboxes input:checked')).map(c => c.value);
        const brands = Array.from(document.querySelectorAll('#brands-checkboxes input:checked')).map(c => c.value);
        
        // Loaner vehicle data
        const hasLoaner = document.querySelector('input[name="loaner"]:checked')?.value === 'yes';
        const loanerDeliveryOptions = Array.from(document.querySelectorAll('#loaner-delivery-options input:checked')).map(c => c.value);
        
        // Pickup/delivery data
        const pickupDeliveryOptions = Array.from(document.querySelectorAll('#pickup-delivery-options input:checked')).map(c => c.value);

        // Create application record
        const { data: app, error: appError } = await supabaseClient.from('provider_applications').insert({
          user_id: userId,
          provider_alias: providerAlias,
          business_name: document.getElementById('business-name').value.trim(),
          business_type: document.getElementById('business-type').value,
          contact_name: document.getElementById('contact-name').value.trim(),
          phone: document.getElementById('phone').value.trim(),
          email: document.getElementById('email').value.trim(),
          legal_signatory_name: legalName,
          agreement_signed_at: new Date().toISOString(),
          agreement_signature: signatureData, // Store the signature image
          agreement_ip_address: null, // Would be captured server-side in production
          website: document.getElementById('website').value.trim() || null,
          street_address: document.getElementById('street-address').value.trim() || null,
          city: document.getElementById('city').value.trim(),
          state: document.getElementById('state').value.trim(),
          zip_code: document.getElementById('zip').value.trim() || null,
          service_area: document.getElementById('service-area').value.trim(),
          service_radius_miles: document.getElementById('service-radius').value ? parseInt(document.getElementById('service-radius').value) : null,
          services_offered: services,
          brand_specializations: brands.length ? brands : null,
          years_in_business: parseInt(document.getElementById('years-business').value) || 0,
          employees_count: document.getElementById('employees').value ? parseInt(document.getElementById('employees').value) : null,
          bays_count: document.getElementById('bays').value ? parseInt(document.getElementById('bays').value) : null,
          vehicles_per_week: document.getElementById('capacity').value ? parseInt(document.getElementById('capacity').value) : null,
          // Loaner vehicle info
          has_loaner_vehicles: hasLoaner,
          loaner_vehicle_count: hasLoaner && document.getElementById('loaner-count').value ? parseInt(document.getElementById('loaner-count').value) : null,
          loaner_vehicle_types: hasLoaner ? document.getElementById('loaner-types').value.trim() || null : null,
          loaner_delivery_options: hasLoaner && loanerDeliveryOptions.length ? loanerDeliveryOptions : null,
          loaner_requirements: hasLoaner ? document.getElementById('loaner-requirements').value.trim() || null : null,
          loaner_fee_type: hasLoaner ? document.getElementById('loaner-fee-type').value : null,
          loaner_fee_amount: hasLoaner && document.getElementById('loaner-fee-amount').value ? parseFloat(document.getElementById('loaner-fee-amount').value) : null,
          // Pickup/delivery info
          pickup_delivery_options: pickupDeliveryOptions.length ? pickupDeliveryOptions : null,
          pickup_radius_miles: document.getElementById('pickup-radius').value ? parseInt(document.getElementById('pickup-radius').value) : null,
          pickup_fee_type: document.getElementById('pickup-fee').value,
          pickup_fee_amount: document.getElementById('pickup-fee-amount').value ? parseFloat(document.getElementById('pickup-fee-amount').value) : null,
          status: 'approved' // Auto-approve providers who complete all requirements
        }).select().single();

        if (appError) throw appError;

        const appId = app.id;

        // Upload documents
        for (const type of ['license', 'insurance', 'certs', 'portfolio']) {
          for (const file of uploadedFiles[type]) {
            const ext = file.name.split('.').pop();
            const filename = `${userId}/${type}_${Date.now()}.${ext}`;
            
            const { error: uploadError } = await supabaseClient.storage
              .from('provider-documents')
              .upload(filename, file);
            
            if (!uploadError) {
              const { data: urlData } = supabaseClient.storage.from('provider-documents').getPublicUrl(filename);
              
              await supabaseClient.from('provider_documents').insert({
                application_id: appId,
                provider_id: userId,
                document_type: type === 'license' ? 'business_license' : type === 'insurance' ? 'insurance_certificate' : type === 'certs' ? 'certification' : 'portfolio',
                document_name: file.name,
                file_url: urlData.publicUrl
              });
            }
          }
        }

        // Save external reviews
        const reviewPlatforms = ['google', 'yelp', 'facebook', 'bbb'];
        for (const platform of reviewPlatforms) {
          const url = document.getElementById(`review-${platform}`).value.trim();
          if (url) {
            await supabaseClient.from('provider_external_reviews').insert({
              application_id: appId,
              provider_id: userId,
              platform: platform,
              profile_url: url
            });
          }
        }

        // Save references
        const refCards = document.querySelectorAll('.reference-card');
        for (const card of refCards) {
          const name = card.querySelector('.ref-name').value.trim();
          if (name) {
            await supabaseClient.from('provider_references').insert({
              application_id: appId,
              reference_name: name,
              reference_company: card.querySelector('.ref-company').value.trim() || null,
              reference_phone: card.querySelector('.ref-phone').value.trim() || null,
              relationship: card.querySelector('.ref-relationship').value
            });
          }
        }

        // Update profile - approve as provider with free trial bids
        await supabaseClient.from('profiles').update({
          full_name: document.getElementById('contact-name').value.trim(),
          role: 'provider', // Auto-approve
          business_name: document.getElementById('business-name').value.trim(),
          city: document.getElementById('city').value.trim(),
          state: document.getElementById('state').value.trim(),
          service_area: document.getElementById('service-area').value.trim(),
          services_offered: services,
          free_trial_bids: 3, // Give 3 free bids to start
          bid_credits: 0,
          total_bids_purchased: 0,
          total_bids_used: 0
        }).eq('id', userId);

        showStep('success');

      } catch (err) {
        console.error('Signup error:', err);
        // Show detailed error message for debugging
        const errorMsg = err?.message || err?.error_description || JSON.stringify(err) || 'Unknown error';
        showMessage('Error: ' + errorMsg);
      }
    }
