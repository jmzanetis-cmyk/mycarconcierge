const TosModal = {
  _overlay: null,
  _onAccepted: null,

  async check(supabaseClient, userId) {
    try {
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('tos_accepted')
        .eq('id', userId)
        .single();

      if (error) {
        console.log('ToS check - column may not exist yet:', error.message);
        return true;
      }

      return data?.tos_accepted === true;
    } catch (err) {
      console.log('ToS check error:', err);
      return true;
    }
  },

  show(onAccepted) {
    this._onAccepted = onAccepted;

    if (this._overlay) {
      this._overlay.remove();
    }

    this._overlay = document.createElement('div');
    this._overlay.id = 'tos-modal-overlay';
    this._overlay.innerHTML = `
      <style>
        #tos-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.85);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          padding: 24px;
        }
        #tos-modal-card {
          background: var(--bg-card, rgba(18, 18, 28, 0.95));
          border: 1px solid var(--border-medium, rgba(148, 148, 168, 0.2));
          border-radius: 16px;
          width: 100%;
          max-width: 500px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          animation: tosModalIn 0.3s ease;
        }
        @keyframes tosModalIn {
          from { opacity: 0; transform: scale(0.95) translateY(20px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        #tos-modal-header {
          padding: 24px 28px;
          border-bottom: 1px solid var(--border-subtle, rgba(148, 148, 168, 0.12));
          text-align: center;
        }
        #tos-modal-header h2 {
          font-family: 'Playfair Display', serif;
          font-size: 1.5rem;
          font-weight: 500;
          color: var(--text-primary, #f4f4f6);
          margin: 0 0 8px 0;
        }
        #tos-modal-header p {
          font-size: 0.9rem;
          color: var(--text-secondary, #9898a8);
          margin: 0;
        }
        #tos-modal-body {
          padding: 24px 28px;
          overflow-y: auto;
          flex: 1;
        }
        #tos-content-box {
          background: var(--bg-input, rgba(22, 22, 34, 0.9));
          border: 1px solid var(--border-subtle, rgba(148, 148, 168, 0.12));
          border-radius: 12px;
          padding: 20px;
          max-height: 200px;
          overflow-y: auto;
          margin-bottom: 20px;
          font-size: 0.88rem;
          line-height: 1.7;
          color: var(--text-secondary, #9898a8);
        }
        #tos-content-box h4 {
          color: var(--text-primary, #f4f4f6);
          font-size: 0.95rem;
          margin: 0 0 12px 0;
        }
        #tos-content-box ul {
          margin: 12px 0;
          padding-left: 20px;
        }
        #tos-content-box li {
          margin-bottom: 8px;
        }
        #tos-content-box a {
          color: var(--accent-gold, #d4a855);
          text-decoration: none;
        }
        #tos-content-box a:hover {
          text-decoration: underline;
        }
        #tos-checkbox-container {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 16px;
          background: var(--accent-gold-soft, rgba(212, 168, 85, 0.15));
          border: 1px solid rgba(212, 168, 85, 0.3);
          border-radius: 12px;
          cursor: pointer;
        }
        #tos-checkbox-container:hover {
          background: rgba(212, 168, 85, 0.2);
        }
        #tos-checkbox {
          width: 22px;
          height: 22px;
          accent-color: var(--accent-gold, #d4a855);
          cursor: pointer;
          flex-shrink: 0;
          margin-top: 2px;
        }
        #tos-checkbox-label {
          font-size: 0.92rem;
          color: var(--text-primary, #f4f4f6);
          cursor: pointer;
          line-height: 1.5;
        }
        #tos-checkbox-label a {
          color: var(--accent-gold, #d4a855);
          text-decoration: none;
        }
        #tos-checkbox-label a:hover {
          text-decoration: underline;
        }
        #tos-modal-footer {
          padding: 20px 28px;
          border-top: 1px solid var(--border-subtle, rgba(148, 148, 168, 0.12));
        }
        #tos-accept-btn {
          width: 100%;
          padding: 14px 24px;
          font-family: 'Outfit', -apple-system, sans-serif;
          font-size: 1rem;
          font-weight: 600;
          border: none;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          background: linear-gradient(135deg, var(--accent-gold, #d4a855), #c49a45);
          color: #0a0a0f;
        }
        #tos-accept-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }
        #tos-accept-btn:not(:disabled):hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(212, 168, 85, 0.4);
        }
        #tos-loading {
          display: none;
          text-align: center;
          padding: 12px;
          color: var(--text-secondary, #9898a8);
          font-size: 0.9rem;
        }
      </style>
      <div id="tos-modal-card">
        <div id="tos-modal-header">
          <h2>📜 Terms of Service</h2>
          <p>Please review and accept to continue</p>
        </div>
        <div id="tos-modal-body">
          <div id="tos-content-box">
            <h4>Welcome to My Car Concierge</h4>
            <p>By using our platform, you agree to the following:</p>
            <ul>
              <li><strong>Service Agreement:</strong> My Car Concierge connects vehicle owners with service providers. We facilitate the connection but are not responsible for the work performed.</li>
              <li><strong>Payment Terms:</strong> All payments are processed securely through our platform. A 7.5% service fee applies to all transactions.</li>
              <li><strong>Dispute Resolution:</strong> In case of disputes, our team will review and mediate. For jobs over $1,000, third-party inspection may be required.</li>
              <li><strong>Privacy:</strong> Your personal information is protected according to our Privacy Policy. We never sell your data to third parties.</li>
              <li><strong>User Conduct:</strong> Users must provide accurate information and treat all parties with respect.</li>
            </ul>
            <p style="margin-top: 16px;">
              For the complete terms, please read our 
              <a href="/terms.html" target="_blank">Terms of Service</a> and 
              <a href="/privacy.html" target="_blank">Privacy Policy</a>.
            </p>
          </div>
          <label id="tos-checkbox-container">
            <input type="checkbox" id="tos-checkbox">
            <span id="tos-checkbox-label">
              I have read and agree to the <a href="/terms.html" target="_blank">Terms of Service</a> and <a href="/privacy.html" target="_blank">Privacy Policy</a>
            </span>
          </label>
        </div>
        <div id="tos-modal-footer">
          <div id="tos-loading">Saving your acceptance...</div>
          <button id="tos-accept-btn" disabled>Accept & Continue</button>
        </div>
      </div>
    `;

    document.body.appendChild(this._overlay);

    const checkbox = document.getElementById('tos-checkbox');
    const acceptBtn = document.getElementById('tos-accept-btn');
    const checkboxContainer = document.getElementById('tos-checkbox-container');

    checkbox.addEventListener('change', () => {
      acceptBtn.disabled = !checkbox.checked;
    });

    checkboxContainer.addEventListener('click', (e) => {
      if (e.target.tagName !== 'A' && e.target.tagName !== 'INPUT') {
        checkbox.checked = !checkbox.checked;
        acceptBtn.disabled = !checkbox.checked;
      }
    });

    acceptBtn.addEventListener('click', () => {
      if (checkbox.checked && this._onAccepted) {
        this._onAccepted();
      }
    });
  },

  async accept(supabaseClient, userId) {
    const acceptBtn = document.getElementById('tos-accept-btn');
    const loading = document.getElementById('tos-loading');

    if (acceptBtn) {
      acceptBtn.disabled = true;
      acceptBtn.textContent = 'Saving...';
    }
    if (loading) {
      loading.style.display = 'block';
    }

    try {
      const { error } = await supabaseClient
        .from('profiles')
        .update({
          tos_accepted: true,
          tos_accepted_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) {
        console.error('Error saving ToS acceptance:', error);
        if (acceptBtn) {
          acceptBtn.disabled = false;
          acceptBtn.textContent = 'Accept & Continue';
        }
        if (loading) {
          loading.style.display = 'none';
        }
        if (typeof showToast === 'function') {
          showToast('Failed to save your acceptance. Please try again.', 'error');
        }
        return false;
      }

      this.hide();
      return true;
    } catch (err) {
      console.error('ToS accept error:', err);
      if (acceptBtn) {
        acceptBtn.disabled = false;
        acceptBtn.textContent = 'Accept & Continue';
      }
      if (loading) {
        loading.style.display = 'none';
      }
      if (typeof showToast === 'function') {
        showToast('An error occurred. Please try again.', 'error');
      }
      return false;
    }
  },

  hide() {
    if (this._overlay) {
      this._overlay.remove();
      this._overlay = null;
    }
  }
};

window.TosModal = TosModal;
