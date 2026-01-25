const AgreementForm = (function() {
  let signaturePad = null;
  let canvas = null;
  
  function createSignaturePad(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return null;
    
    const isDarkMode = document.documentElement.getAttribute('data-theme') !== 'light';
    
    container.innerHTML = `
      <div class="signature-pad-container">
        <div class="signature-tabs">
          <button type="button" class="sig-tab active" data-tab="draw">Draw Signature</button>
          <button type="button" class="sig-tab" data-tab="type">Type Signature</button>
        </div>
        
        <div class="sig-panel draw-panel active">
          <canvas id="signature-canvas" width="500" height="150"></canvas>
          <div class="signature-actions">
            <button type="button" class="clear-signature-btn">Clear</button>
          </div>
        </div>
        
        <div class="sig-panel type-panel">
          <input type="text" id="typed-signature" class="typed-signature-input" placeholder="Type your full legal name">
          <div class="typed-signature-preview"></div>
        </div>
        
        <input type="hidden" id="signature-data" name="signature_data">
        <input type="hidden" id="signature-type" name="signature_type" value="draw">
      </div>
    `;
    
    canvas = container.querySelector('#signature-canvas');
    initCanvas(canvas, isDarkMode);
    
    container.querySelectorAll('.sig-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        container.querySelectorAll('.sig-tab').forEach(t => t.classList.remove('active'));
        container.querySelectorAll('.sig-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const panel = container.querySelector(`.${tab.dataset.tab}-panel`);
        if (panel) panel.classList.add('active');
        document.getElementById('signature-type').value = tab.dataset.tab;
        updateSignatureData();
      });
    });
    
    container.querySelector('.clear-signature-btn').addEventListener('click', () => {
      clearCanvas(isDarkMode);
    });
    
    const typedInput = container.querySelector('#typed-signature');
    const preview = container.querySelector('.typed-signature-preview');
    typedInput.addEventListener('input', () => {
      preview.textContent = typedInput.value;
      updateSignatureData();
    });
    
    const themeObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'data-theme') {
          const newIsDarkMode = document.documentElement.getAttribute('data-theme') !== 'light';
          updateCanvasColors(canvas, newIsDarkMode);
        }
      });
    });
    
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });
    
    return { canvas, getSignatureData };
  }
  
  function updateCanvasColors(canvas, isDarkMode) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = isDarkMode ? '#d4a855' : '#1e3a5f';
  }
  
  function initCanvas(canvas, isDarkMode) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = isDarkMode ? '#1a1a2e' : '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = isDarkMode ? '#d4a855' : '#1e3a5f';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;
    
    function getCoords(e) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      
      if (e.touches && e.touches[0]) {
        return {
          x: (e.touches[0].clientX - rect.left) * scaleX,
          y: (e.touches[0].clientY - rect.top) * scaleY
        };
      }
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    }
    
    function startDrawing(e) {
      e.preventDefault();
      isDrawing = true;
      const coords = getCoords(e);
      lastX = coords.x;
      lastY = coords.y;
    }
    
    function draw(e) {
      if (!isDrawing) return;
      e.preventDefault();
      const coords = getCoords(e);
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
      lastX = coords.x;
      lastY = coords.y;
    }
    
    function stopDrawing() {
      if (isDrawing) {
        isDrawing = false;
        updateSignatureData();
      }
    }
    
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);
    
    canvas.addEventListener('touchstart', startDrawing, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', stopDrawing);
  }
  
  function clearCanvas(isDarkMode) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = isDarkMode ? '#1a1a2e' : '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    updateSignatureData();
  }
  
  function isCanvasEmpty() {
    if (!canvas) return true;
    const ctx = canvas.getContext('2d');
    const isDarkMode = document.documentElement.getAttribute('data-theme') !== 'light';
    const emptyColor = isDarkMode ? [26, 26, 46, 255] : [255, 255, 255, 255];
    const pixelData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    
    for (let i = 0; i < pixelData.length; i += 4) {
      if (Math.abs(pixelData[i] - emptyColor[0]) > 10 ||
          Math.abs(pixelData[i + 1] - emptyColor[1]) > 10 ||
          Math.abs(pixelData[i + 2] - emptyColor[2]) > 10) {
        return false;
      }
    }
    return true;
  }
  
  function updateSignatureData() {
    const signatureType = document.getElementById('signature-type')?.value || 'draw';
    const signatureDataInput = document.getElementById('signature-data');
    
    if (signatureType === 'draw' && canvas && !isCanvasEmpty()) {
      signatureDataInput.value = canvas.toDataURL('image/png');
    } else if (signatureType === 'type') {
      const typedSig = document.getElementById('typed-signature')?.value || '';
      signatureDataInput.value = typedSig ? `typed:${typedSig}` : '';
    } else {
      signatureDataInput.value = '';
    }
  }
  
  function getSignatureData() {
    return document.getElementById('signature-data')?.value || '';
  }
  
  function createAgreementForm(options) {
    const {
      containerId,
      agreementType,
      fields = ['full_name', 'business_name', 'ein_last4'],
      acknowledgments = [],
      onSubmit
    } = options;
    
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const isDarkMode = document.documentElement.getAttribute('data-theme') !== 'light';
    
    let fieldsHtml = '';
    
    if (fields.includes('full_name')) {
      fieldsHtml += `
        <div class="agreement-field">
          <label for="agreement-full-name">Full Legal Name <span class="required">*</span></label>
          <input type="text" id="agreement-full-name" name="full_name" required placeholder="Enter your full legal name">
        </div>
      `;
    }
    
    if (fields.includes('business_name')) {
      fieldsHtml += `
        <div class="agreement-field">
          <label for="agreement-business-name">Business Name</label>
          <input type="text" id="agreement-business-name" name="business_name" placeholder="Enter your business name (if applicable)">
        </div>
      `;
    }
    
    if (fields.includes('ein_last4')) {
      fieldsHtml += `
        <div class="agreement-field">
          <label for="agreement-ein">Last 4 digits of EIN or SSN <span class="required">*</span></label>
          <input type="text" id="agreement-ein" name="ein_last4" maxlength="4" pattern="[0-9]{4}" required placeholder="XXXX">
          <span class="field-hint">For 1099 tax purposes</span>
        </div>
      `;
    }
    
    let acknowledgementsHtml = '';
    if (acknowledgments.length > 0) {
      acknowledgementsHtml = `
        <div class="agreement-acknowledgments">
          <h4>Acknowledgments</h4>
          ${acknowledgments.map((ack, i) => `
            <label class="acknowledgment-item">
              <input type="checkbox" name="acknowledgment_${i}" required>
              <span>${ack}</span>
            </label>
          `).join('')}
        </div>
      `;
    }
    
    container.innerHTML = `
      <form id="agreement-form" class="agreement-form ${isDarkMode ? 'dark-mode' : 'light-mode'}">
        <div class="agreement-form-section">
          <h3>Your Information</h3>
          ${fieldsHtml}
        </div>
        
        <div class="agreement-form-section">
          <h3>Effective Date</h3>
          <div class="agreement-field">
            <input type="date" id="agreement-date" name="effective_date" value="${new Date().toISOString().split('T')[0]}">
          </div>
        </div>
        
        ${acknowledgementsHtml}
        
        <div class="agreement-form-section">
          <h3>Your Signature <span class="required">*</span></h3>
          <div id="signature-pad-area"></div>
        </div>
        
        <div class="agreement-form-section agreement-final-confirm">
          <label class="final-confirm-checkbox">
            <input type="checkbox" id="final-agreement-confirm" required>
            <span>I have read, understand, and agree to the terms of this agreement. I acknowledge that this electronic signature is legally binding.</span>
          </label>
        </div>
        
        <div class="agreement-form-actions">
          <button type="submit" class="submit-agreement-btn">
            <span class="btn-text">Sign Agreement</span>
            <span class="btn-loading" style="display:none;">Submitting...</span>
          </button>
        </div>
        
        <input type="hidden" name="agreement_type" value="${agreementType}">
      </form>
    `;
    
    createSignaturePad('signature-pad-area');
    
    const form = document.getElementById('agreement-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const signatureData = getSignatureData();
      if (!signatureData) {
        alert('Please provide your signature by drawing or typing your name.');
        return;
      }
      
      const btn = form.querySelector('.submit-agreement-btn');
      const btnText = btn.querySelector('.btn-text');
      const btnLoading = btn.querySelector('.btn-loading');
      
      btn.disabled = true;
      btnText.style.display = 'none';
      btnLoading.style.display = 'inline';
      
      const formData = new FormData(form);
      const data = {
        agreement_type: agreementType,
        full_name: formData.get('full_name'),
        business_name: formData.get('business_name') || null,
        ein_last4: formData.get('ein_last4'),
        effective_date: formData.get('effective_date'),
        signature_data: signatureData,
        signature_type: formData.get('signature_type'),
        acknowledgments: acknowledgments.map((_, i) => formData.get(`acknowledgment_${i}`) === 'on')
      };
      
      try {
        if (onSubmit) {
          await onSubmit(data);
        } else {
          const response = await fetch('/api/agreements/sign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          
          if (!response.ok) {
            throw new Error('Failed to submit agreement');
          }
          
          const result = await response.json();
          showSuccessMessage(container, result);
        }
      } catch (error) {
        console.error('Error submitting agreement:', error);
        alert('There was an error submitting your agreement. Please try again.');
        btn.disabled = false;
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
      }
    });
  }
  
  function showSuccessMessage(container, result) {
    container.innerHTML = `
      <div class="agreement-success">
        <div class="success-icon">✓</div>
        <h2>Agreement Signed Successfully</h2>
        <p>Thank you for signing the agreement. A confirmation email has been sent to your registered email address.</p>
        <p class="success-details">
          <strong>Signed on:</strong> ${new Date().toLocaleDateString()}<br>
          <strong>Reference:</strong> ${result.id || 'N/A'}
        </p>
        <div class="success-actions">
          <a href="/members.html" class="back-to-dashboard-btn">Back to Dashboard</a>
        </div>
      </div>
    `;
  }
  
  function injectStyles() {
    if (document.getElementById('agreement-form-styles')) return;
    
    const styles = document.createElement('style');
    styles.id = 'agreement-form-styles';
    styles.textContent = `
      .agreement-form {
        max-width: 600px;
        margin: 40px auto;
        padding: 30px;
        border-radius: 16px;
        font-family: 'Outfit', sans-serif;
      }
      
      .agreement-form.dark-mode {
        background: rgba(18, 22, 28, 0.95);
        border: 1px solid rgba(212, 168, 85, 0.2);
        color: #f4f4f6;
      }
      
      .agreement-form.light-mode {
        background: #ffffff;
        border: 1px solid #e0e0e0;
        color: #1e3a5f;
        box-shadow: 0 4px 20px rgba(0,0,0,0.08);
      }
      
      .agreement-form-section {
        margin-bottom: 30px;
      }
      
      .agreement-form-section h3 {
        font-size: 18px;
        margin-bottom: 15px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(128,128,128,0.3);
      }
      
      .dark-mode .agreement-form-section h3 {
        color: #d4a855;
        border-color: rgba(212, 168, 85, 0.3);
      }
      
      .light-mode .agreement-form-section h3 {
        color: #1e3a5f;
        border-color: rgba(30, 58, 95, 0.2);
      }
      
      .agreement-field {
        margin-bottom: 20px;
      }
      
      .agreement-field label {
        display: block;
        margin-bottom: 8px;
        font-weight: 500;
      }
      
      .agreement-field .required {
        color: #e74c3c;
      }
      
      .agreement-field input[type="text"],
      .agreement-field input[type="date"] {
        width: 100%;
        padding: 14px 16px;
        border-radius: 10px;
        font-size: 16px;
        font-family: inherit;
        transition: all 0.2s;
      }
      
      .dark-mode .agreement-field input {
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(212, 168, 85, 0.3);
        color: #f4f4f6;
      }
      
      .dark-mode .agreement-field input:focus {
        border-color: #d4a855;
        outline: none;
        box-shadow: 0 0 0 3px rgba(212, 168, 85, 0.15);
      }
      
      .light-mode .agreement-field input {
        background: #fefdfb;
        border: 1px solid #d0d0d0;
        color: #1e3a5f;
      }
      
      .light-mode .agreement-field input:focus {
        border-color: #b8942d;
        outline: none;
        box-shadow: 0 0 0 3px rgba(184, 148, 45, 0.15);
      }
      
      .field-hint {
        display: block;
        margin-top: 6px;
        font-size: 13px;
        opacity: 0.7;
      }
      
      .signature-pad-container {
        border-radius: 12px;
        overflow: hidden;
      }
      
      .dark-mode .signature-pad-container {
        background: rgba(0,0,0,0.3);
        border: 1px solid rgba(212, 168, 85, 0.3);
      }
      
      .light-mode .signature-pad-container {
        background: #f8f8f8;
        border: 1px solid #d0d0d0;
      }
      
      .signature-tabs {
        display: flex;
        border-bottom: 1px solid rgba(128,128,128,0.3);
      }
      
      .sig-tab {
        flex: 1;
        padding: 12px;
        border: none;
        background: transparent;
        cursor: pointer;
        font-family: inherit;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.2s;
      }
      
      .dark-mode .sig-tab {
        color: #9898a8;
      }
      
      .dark-mode .sig-tab.active {
        color: #d4a855;
        background: rgba(212, 168, 85, 0.1);
      }
      
      .light-mode .sig-tab {
        color: #666;
      }
      
      .light-mode .sig-tab.active {
        color: #1e3a5f;
        background: rgba(30, 58, 95, 0.1);
      }
      
      .sig-panel {
        display: none;
        padding: 20px;
      }
      
      .sig-panel.active {
        display: block;
      }
      
      #signature-canvas {
        width: 100%;
        height: 150px;
        border-radius: 8px;
        cursor: crosshair;
        touch-action: none;
      }
      
      .dark-mode #signature-canvas {
        background: #1a1a2e;
        border: 1px solid rgba(212, 168, 85, 0.2);
      }
      
      .light-mode #signature-canvas {
        background: #ffffff;
        border: 1px solid #d0d0d0;
      }
      
      .signature-actions {
        margin-top: 10px;
        text-align: right;
      }
      
      .clear-signature-btn {
        padding: 8px 16px;
        border-radius: 6px;
        border: none;
        cursor: pointer;
        font-family: inherit;
        font-size: 14px;
        transition: all 0.2s;
      }
      
      .dark-mode .clear-signature-btn {
        background: rgba(255,255,255,0.1);
        color: #f4f4f6;
      }
      
      .dark-mode .clear-signature-btn:hover {
        background: rgba(255,255,255,0.2);
      }
      
      .light-mode .clear-signature-btn {
        background: #e0e0e0;
        color: #333;
      }
      
      .light-mode .clear-signature-btn:hover {
        background: #d0d0d0;
      }
      
      .typed-signature-input {
        width: 100%;
        padding: 14px 16px;
        border-radius: 10px;
        font-size: 16px;
        font-family: inherit;
        margin-bottom: 15px;
      }
      
      .dark-mode .typed-signature-input {
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(212, 168, 85, 0.3);
        color: #f4f4f6;
      }
      
      .light-mode .typed-signature-input {
        background: #ffffff;
        border: 1px solid #d0d0d0;
        color: #1e3a5f;
      }
      
      .typed-signature-preview {
        font-family: 'Brush Script MT', 'Segoe Script', cursive;
        font-size: 32px;
        min-height: 60px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        padding: 10px;
      }
      
      .dark-mode .typed-signature-preview {
        color: #d4a855;
        background: rgba(0,0,0,0.2);
      }
      
      .light-mode .typed-signature-preview {
        color: #1e3a5f;
        background: rgba(0,0,0,0.03);
      }
      
      .agreement-acknowledgments {
        margin-bottom: 30px;
      }
      
      .agreement-acknowledgments h4 {
        margin-bottom: 15px;
        font-size: 16px;
      }
      
      .acknowledgment-item {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 12px;
        cursor: pointer;
        padding: 12px;
        border-radius: 8px;
        transition: background 0.2s;
      }
      
      .dark-mode .acknowledgment-item:hover {
        background: rgba(255,255,255,0.05);
      }
      
      .light-mode .acknowledgment-item:hover {
        background: rgba(0,0,0,0.03);
      }
      
      .acknowledgment-item input[type="checkbox"] {
        width: 20px;
        height: 20px;
        margin-top: 2px;
        flex-shrink: 0;
        accent-color: #d4a855;
      }
      
      .acknowledgment-item span {
        font-size: 14px;
        line-height: 1.5;
      }
      
      .agreement-final-confirm {
        padding: 20px;
        border-radius: 12px;
        margin-bottom: 30px;
      }
      
      .dark-mode .agreement-final-confirm {
        background: rgba(212, 168, 85, 0.1);
        border: 1px solid rgba(212, 168, 85, 0.3);
      }
      
      .light-mode .agreement-final-confirm {
        background: rgba(184, 148, 45, 0.1);
        border: 1px solid rgba(184, 148, 45, 0.3);
      }
      
      .final-confirm-checkbox {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        cursor: pointer;
      }
      
      .final-confirm-checkbox input {
        width: 22px;
        height: 22px;
        margin-top: 2px;
        flex-shrink: 0;
        accent-color: #d4a855;
      }
      
      .final-confirm-checkbox span {
        font-size: 15px;
        line-height: 1.5;
        font-weight: 500;
      }
      
      .agreement-form-actions {
        text-align: center;
      }
      
      .submit-agreement-btn {
        padding: 16px 48px;
        font-size: 18px;
        font-weight: 600;
        border: none;
        border-radius: 12px;
        cursor: pointer;
        font-family: inherit;
        transition: all 0.3s;
      }
      
      .dark-mode .submit-agreement-btn {
        background: linear-gradient(135deg, #d4a855, #c49a4b);
        color: #0a0a0f;
      }
      
      .dark-mode .submit-agreement-btn:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 8px 25px rgba(212, 168, 85, 0.35);
      }
      
      .light-mode .submit-agreement-btn {
        background: linear-gradient(135deg, #b8942d, #a68528);
        color: #ffffff;
      }
      
      .light-mode .submit-agreement-btn:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 8px 25px rgba(184, 148, 45, 0.35);
      }
      
      .submit-agreement-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      
      .agreement-success {
        text-align: center;
        padding: 60px 30px;
      }
      
      .success-icon {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 40px;
        margin: 0 auto 30px;
      }
      
      .dark-mode .success-icon {
        background: linear-gradient(135deg, #d4a855, #c49a4b);
        color: #0a0a0f;
      }
      
      .light-mode .success-icon {
        background: linear-gradient(135deg, #27ae60, #2ecc71);
        color: #ffffff;
      }
      
      .agreement-success h2 {
        margin-bottom: 15px;
        font-size: 24px;
      }
      
      .agreement-success p {
        margin-bottom: 20px;
        opacity: 0.8;
      }
      
      .success-details {
        padding: 20px;
        border-radius: 10px;
        margin-bottom: 30px;
        text-align: left;
        display: inline-block;
      }
      
      .dark-mode .success-details {
        background: rgba(255,255,255,0.05);
      }
      
      .light-mode .success-details {
        background: rgba(0,0,0,0.03);
      }
      
      .back-to-dashboard-btn {
        display: inline-block;
        padding: 14px 36px;
        border-radius: 10px;
        text-decoration: none;
        font-weight: 600;
        transition: all 0.2s;
      }
      
      .dark-mode .back-to-dashboard-btn {
        background: rgba(212, 168, 85, 0.2);
        color: #d4a855;
        border: 1px solid rgba(212, 168, 85, 0.3);
      }
      
      .dark-mode .back-to-dashboard-btn:hover {
        background: rgba(212, 168, 85, 0.3);
      }
      
      .light-mode .back-to-dashboard-btn {
        background: #1e3a5f;
        color: #ffffff;
      }
      
      .light-mode .back-to-dashboard-btn:hover {
        background: #2a4a6f;
      }
      
      @media (max-width: 600px) {
        .agreement-form {
          margin: 20px;
          padding: 20px;
        }
        
        .signature-tabs {
          flex-direction: column;
        }
        
        .sig-tab {
          padding: 14px;
        }
        
        .submit-agreement-btn {
          width: 100%;
        }
      }
    `;
    
    document.head.appendChild(styles);
  }
  
  function init() {
    injectStyles();
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  return {
    createSignaturePad,
    createAgreementForm,
    getSignatureData,
    injectStyles
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AgreementForm;
}
