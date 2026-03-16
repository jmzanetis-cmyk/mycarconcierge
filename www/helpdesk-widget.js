class HelpdeskWidget extends ChatWidgetBase {
  constructor(options = {}) {
    super({
      widgetId: 'helpdesk-widget',
      position: options.position || 'bottom-right',
      primaryColor: options.primaryColor || '#d4a855',
      secondaryColor: options.secondaryColor || '#c49a4a',
      storageKey: 'mcc-helpdesk'
    });
    
    this.mode = options.mode || 'driver';
    this.conversationId = options.conversationId || `helpdesk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this._restoring = false;
    this.messageTimes = [];
    this.rateLimit = { maxMessages: 5, windowMs: 60000 };
    
    this.init();
  }
  
  init() {
    this.injectStyles(this.getAdditionalStyles());
    this.createWidget();
    this.attachBaseEventListeners();

    const widget = document.getElementById(this.widgetId);
    const messagesContainer = widget.querySelector('.chat-widget-messages');
    messagesContainer.addEventListener('click', (e) => {
      const promptBtn = e.target.closest('.chat-widget-prompt-btn');
      if (promptBtn) {
        const input = widget.querySelector('.chat-widget-input');
        if (input) {
          input.value = promptBtn.textContent;
        }
        this.handleSendMessage();
      }
    });

    const modePills = widget.querySelector('.helpdesk-mode-pills');
    if (modePills) {
      modePills.addEventListener('click', (e) => {
        const pill = e.target.closest('.helpdesk-mode-pill');
        if (pill && pill.dataset.mode && pill.dataset.mode !== this.mode) {
          this.setMode(pill.dataset.mode);
          this.updateModePills();
        }
      });
    }

    const clearBtn = widget.querySelector('.helpdesk-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearConversation());
    }

    const copyBtn = widget.querySelector('.helpdesk-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => this.copyConversation());
    }

    const emailBtn = widget.querySelector('.helpdesk-email-btn');
    if (emailBtn) {
      const user = this.getLoggedInUser();
      if (user && user.email) {
        emailBtn.style.display = 'flex';
      }
      emailBtn.addEventListener('click', () => this.emailConversation());
    }

    this.restoreMessages();
  }
  
  getAdditionalStyles() {
    return `
      .helpdesk-mode-pills {
        display: flex;
        gap: 6px;
        padding: 8px 14px 4px;
        background: rgba(0,0,0,0.15);
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }
      [data-theme="light"] .helpdesk-mode-pills {
        background: rgba(30,58,95,0.04);
        border-bottom: 1px solid rgba(30,58,95,0.08);
      }
      .helpdesk-mode-pill {
        flex: 1;
        padding: 7px 6px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.12);
        background: transparent;
        color: rgba(255,255,255,0.55);
        font-size: 11px;
        font-family: inherit;
        cursor: pointer;
        transition: all 0.2s ease;
        text-align: center;
        white-space: nowrap;
      }
      .helpdesk-mode-pill:hover {
        background: rgba(212,168,85,0.12);
        border-color: rgba(212,168,85,0.3);
        color: rgba(255,255,255,0.85);
      }
      .helpdesk-mode-pill.active {
        background: rgba(212,168,85,0.18);
        border-color: rgba(212,168,85,0.5);
        color: #d4a855;
        font-weight: 600;
      }
      [data-theme="light"] .helpdesk-mode-pill {
        border-color: rgba(30,58,95,0.12);
        color: rgba(30,58,95,0.45);
      }
      [data-theme="light"] .helpdesk-mode-pill:hover {
        background: rgba(184,148,45,0.08);
        border-color: rgba(184,148,45,0.25);
        color: rgba(30,58,95,0.75);
      }
      [data-theme="light"] .helpdesk-mode-pill.active {
        background: rgba(184,148,45,0.12);
        border-color: rgba(184,148,45,0.4);
        color: #8a6d1b;
      }

      .helpdesk-header-text p {
        margin: 2px 0 0;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.6);
      }

      [data-theme="light"] .helpdesk-header-text p {
        color: rgba(30, 58, 95, 0.5);
      }

      [data-theme="light"] .chat-widget-status {
        color: #2d8a5e;
      }

      [data-theme="light"] .chat-widget-status::before {
        background: #2d8a5e;
      }

      [data-theme="light"] .chat-widget-avatar {
        color: #1e3a5f;
      }

      .helpdesk-clear-btn {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.4);
        cursor: pointer;
        padding: 6px;
        border-radius: 8px;
        transition: all 0.2s ease;
        margin-left: auto;
        display: flex;
        align-items: center;
      }
      .helpdesk-clear-btn:hover {
        color: rgba(255, 255, 255, 0.8);
        background: rgba(255, 255, 255, 0.1);
      }
      [data-theme="light"] .helpdesk-clear-btn {
        color: rgba(30, 58, 95, 0.35);
      }
      [data-theme="light"] .helpdesk-clear-btn:hover {
        color: rgba(30, 58, 95, 0.7);
        background: rgba(30, 58, 95, 0.08);
      }

      .helpdesk-copy-btn {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.4);
        cursor: pointer;
        padding: 6px;
        border-radius: 8px;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
      }
      .helpdesk-copy-btn:hover {
        color: rgba(255, 255, 255, 0.8);
        background: rgba(255, 255, 255, 0.1);
      }
      .helpdesk-copy-btn.copied {
        color: #4ac88c;
      }
      [data-theme="light"] .helpdesk-copy-btn {
        color: rgba(30, 58, 95, 0.35);
      }
      [data-theme="light"] .helpdesk-copy-btn:hover {
        color: rgba(30, 58, 95, 0.7);
        background: rgba(30, 58, 95, 0.08);
      }
      [data-theme="light"] .helpdesk-copy-btn.copied {
        color: #2d8a5e;
      }

      .helpdesk-email-btn {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.4);
        cursor: pointer;
        padding: 6px;
        border-radius: 8px;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
      }
      .helpdesk-email-btn:hover {
        color: rgba(255, 255, 255, 0.8);
        background: rgba(255, 255, 255, 0.1);
      }
      .helpdesk-email-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .helpdesk-email-btn.copied {
        color: #4ac88c;
      }
      [data-theme="light"] .helpdesk-email-btn {
        color: rgba(30, 58, 95, 0.35);
      }
      [data-theme="light"] .helpdesk-email-btn:hover {
        color: rgba(30, 58, 95, 0.7);
        background: rgba(30, 58, 95, 0.08);
      }
      [data-theme="light"] .helpdesk-email-btn.copied {
        color: #2d8a5e;
      }

      .chat-widget-prompts {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 16px;
      }
      .chat-widget-prompt-btn {
        background: rgba(212, 168, 85, 0.1);
        border: 1px solid rgba(212, 168, 85, 0.25);
        color: #d4a855;
        padding: 10px 14px;
        border-radius: 12px;
        font-size: 13px;
        font-family: inherit;
        cursor: pointer;
        text-align: left;
        transition: all 0.2s ease;
        line-height: 1.3;
      }
      .chat-widget-prompt-btn:hover {
        background: rgba(212, 168, 85, 0.2);
        border-color: rgba(212, 168, 85, 0.4);
      }
      [data-theme="light"] .chat-widget-prompt-btn {
        background: rgba(184, 148, 45, 0.08);
        border: 1px solid rgba(184, 148, 45, 0.2);
        color: #8a6d1b;
      }
      [data-theme="light"] .chat-widget-prompt-btn:hover {
        background: rgba(184, 148, 45, 0.15);
        border-color: rgba(184, 148, 45, 0.35);
      }
    `;
  }
  
  getModePillsHTML() {
    const modes = [
      { key: 'driver', label: 'Car Expert' },
      { key: 'provider', label: 'Provider Support' },
      { key: 'education', label: 'Car Academy' }
    ];
    return modes.map(m =>
      `<button class="helpdesk-mode-pill${m.key === this.mode ? ' active' : ''}" data-mode="${m.key}">${m.label}</button>`
    ).join('');
  }

  updateModePills() {
    const widget = document.getElementById(this.widgetId);
    if (!widget) return;
    widget.querySelectorAll('.helpdesk-mode-pill').forEach(pill => {
      pill.classList.toggle('active', pill.dataset.mode === this.mode);
    });
    const headerLabel = widget.querySelector('.helpdesk-header-text p');
    if (headerLabel) {
      const config = this.getModeConfig();
      headerLabel.textContent = config.label;
    }
  }

  getModeConfig() {
    const configs = {
      driver: {
        label: 'Car Expert',
        welcome: "Got questions about your car? Describe the issue and I'll help you understand what's happening and what to do next.",
        prompts: ["What does my check engine light mean?", "My car is making a strange noise", "When should I change my oil?"]
      },
      provider: {
        label: 'Provider Support',
        welcome: 'Have questions about working with My Car Concierge? I can help with onboarding, services, and platform questions.',
        prompts: ["How do I get started on the platform?", "How does the bidding system work?", "What are bid packs?"]
      },
      education: {
        label: 'Car Academy Tutor',
        welcome: "Welcome to Car Academy! I'm here to help you learn about your vehicle in plain English. Ask me anything about maintenance, repairs, warning signs, or how cars work - no question is too basic!",
        prompts: ["How does my engine work?", "What are the warning signs of brake problems?", "How do I read my tire numbers?"]
      }
    };
    const base = configs[this.mode] || configs.driver;
    const pagePrompts = this.getPageContextPrompts();
    if (pagePrompts) {
      return { ...base, prompts: pagePrompts };
    }
    return base;
  }

  getPageContextPrompts() {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('members') && this.mode === 'driver') {
      return ["How do I add a vehicle?", "How do I request quotes?", "What's the service coordination dashboard?"];
    }
    if (path.includes('provider') && this.mode === 'provider') {
      return ["How do I respond to a bid request?", "How do provider ratings work?", "How do I manage my team?"];
    }
    if (path.includes('fleet')) {
      return ["How do I manage a fleet?", "Can I track maintenance for all vehicles?", "How does fleet pricing work?"];
    }
    if (path.includes('split-pay')) {
      return ["How does split payment work?", "What happens if someone doesn't pay?", "Can I split with non-members?"];
    }
    if (path.includes('check-in')) {
      return ["How does QR check-in work?", "What happens after I check in?", "Can the provider see my check-in?"];
    }
    if (path.includes('signup')) {
      return ["What does membership include?", "Is there a fee to join?", "How do I get started?"];
    }
    if (path.includes('merch') || path.includes('shop')) {
      return ["What merch do you offer?", "How does shipping work?", "Can I return an item?"];
    }
    return null;
  }

  getLoggedInUser() {
    try {
      const sbKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
      for (const key of sbKeys) {
        const data = JSON.parse(localStorage.getItem(key));
        if (data && data.user) {
          const meta = data.user.user_metadata || {};
          return {
            name: meta.full_name || meta.name || meta.first_name || null,
            email: data.user.email,
            role: meta.role || null
          };
        }
      }
    } catch (e) {}
    return null;
  }
  
  getWelcomeHTML(config) {
    const user = this.getLoggedInUser();
    let title;
    if (user && user.name) {
      if (this.mode === 'education') {
        title = `Welcome back, ${user.name}!`;
      } else if (this.mode === 'provider') {
        title = `Hi ${user.name}! Need help with the platform?`;
      } else {
        title = `Hi ${user.name}! Got questions about your car?`;
      }
    } else {
      title = this.mode === 'education' ? `Welcome to Car Academy! ${typeof mccIcon === 'function' ? mccIcon('graduation-cap', 20) : ''}` : 'Hi there!';
    }
    return `
      <div class="chat-widget-welcome">
        <div class="chat-widget-welcome-icon">
          <svg viewBox="0 0 24 24"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>
        </div>
        <h4>${title}</h4>
        <p>${config.welcome}</p>
        <div class="chat-widget-prompts">
          ${config.prompts.map(p => `<button class="chat-widget-prompt-btn">${p}</button>`).join('')}
        </div>
      </div>
    `;
  }
  
  createWidget() {
    const widget = this.createWidgetContainer();
    const config = this.getModeConfig();
    
    widget.innerHTML = `
      <button class="chat-widget-toggle">
        <svg class="chat-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
        <svg class="close-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      </button>
      
      <div class="chat-widget-panel">
        <div class="chat-widget-header">
          <div class="chat-widget-header-info">
            <div class="chat-widget-avatar">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>
            </div>
            <div class="helpdesk-header-text">
              <h3>My Car Concierge</h3>
              <p>${config.label}</p>
            </div>
            <button class="helpdesk-copy-btn" aria-label="Copy conversation" title="Copy conversation">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
            <button class="helpdesk-email-btn" aria-label="Email conversation" title="Email conversation" style="display:none;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            </button>
            <button class="helpdesk-clear-btn" aria-label="Clear conversation" title="Clear conversation">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>

        <div class="helpdesk-mode-pills">
          ${this.getModePillsHTML()}
        </div>
        
        <div class="chat-widget-messages">
          ${this.getWelcomeHTML(config)}
        </div>
        
        ${this.createInputArea('Type your question...')}
      </div>
    `;
    
    document.body.appendChild(widget);
  }

  saveToStorage() {
    if (this._restoring) return;
    super.saveToStorage();
  }

  restoreMessages() {
    const loaded = this.loadFromStorage();
    if (loaded.length > 0) {
      this.removeWelcomeMessage();
      this.messages = loaded;
      this._restoring = true;
      for (const msg of loaded) {
        this.addMessage(msg.role, msg.content, msg.role === 'assistant');
      }
      this._restoring = false;
    }
  }

  onConversationCleared() {
    const config = this.getModeConfig();
    const widget = document.getElementById(this.widgetId);
    const messagesContainer = widget.querySelector('.chat-widget-messages');
    messagesContainer.innerHTML = this.getWelcomeHTML(config);
  }

  copyConversation() {
    if (this.messages.length === 0) return;
    const text = this.messages.map(m => {
      const label = m.role === 'user' ? 'You' : 'My Car Concierge';
      return `${label}: ${m.content}`;
    }).join('\n\n');
    const widget = document.getElementById(this.widgetId);
    const copyBtn = widget.querySelector('.helpdesk-copy-btn');
    navigator.clipboard.writeText(text).then(() => {
      if (copyBtn) {
        copyBtn.classList.add('copied');
        const origSvg = copyBtn.innerHTML;
        copyBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
        setTimeout(() => {
          copyBtn.classList.remove('copied');
          copyBtn.innerHTML = origSvg;
        }, 2000);
      }
    }).catch(() => {});
  }

  async emailConversation() {
    if (this.messages.length === 0) return;
    const user = this.getLoggedInUser();
    if (!user || !user.email) return;
    const widget = document.getElementById(this.widgetId);
    const emailBtn = widget.querySelector('.helpdesk-email-btn');
    if (emailBtn) emailBtn.disabled = true;
    try {
      const isNetlify = window.location.hostname.includes('netlify') || 
                        window.location.hostname === 'mycarconcierge.com' ||
                        window.location.hostname === 'www.mycarconcierge.com';
      const apiUrl = isNetlify ? '/.netlify/functions/helpdesk-email' : '/api/helpdesk-email';
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          name: user.name || '',
          conversation: this.messages,
          mode: this.mode
        })
      });
      if (response.ok) {
        if (emailBtn) {
          emailBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
          emailBtn.classList.add('copied');
          setTimeout(() => {
            emailBtn.classList.remove('copied');
            emailBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>';
          }, 3000);
        }
      }
    } catch (err) {
      console.error('Email export error:', err);
    }
    if (emailBtn) emailBtn.disabled = false;
  }

  checkRateLimit() {
    const now = Date.now();
    this.messageTimes = this.messageTimes.filter(t => now - t < this.rateLimit.windowMs);
    if (this.messageTimes.length >= this.rateLimit.maxMessages) {
      const oldest = this.messageTimes[0];
      const retryAfterMs = oldest + this.rateLimit.windowMs - now;
      return { limited: true, retryAfterMs };
    }
    return { limited: false };
  }
  
  async handleSendMessage() {
    const text = this.getInputValue();
    if (!text || this.isLoading) return;

    const rateCheck = this.checkRateLimit();
    if (rateCheck.limited) {
      const seconds = Math.ceil(rateCheck.retryAfterMs / 1000);
      if (this.messages.length === 0) {
        this.removeWelcomeMessage();
      }
      const widget = document.getElementById(this.widgetId);
      const messagesContainer = widget.querySelector('.chat-widget-messages');
      const messageDiv = document.createElement('div');
      messageDiv.className = 'chat-widget-message system';
      messageDiv.innerHTML = `<div class="chat-widget-message-content">You're asking questions faster than I can keep up! Please wait ${seconds} seconds before sending another message.</div>`;
      messagesContainer.appendChild(messageDiv);
      this.scrollToBottom();
      return;
    }

    this.messageTimes.push(Date.now());
    
    this.clearInput();
    this.setInputDisabled(true);
    this.isLoading = true;
    
    if (this.messages.length === 0) {
      this.removeWelcomeMessage();
    }
    
    this.messages.push({ role: 'user', content: text });
    this.addMessage('user', text);
    this.showTypingIndicator();
    
    try {
      const isNetlify = window.location.hostname.includes('netlify') || 
                        window.location.hostname === 'mycarconcierge.com' ||
                        window.location.hostname === 'www.mycarconcierge.com';
      const isNativeApp = window.Capacitor !== undefined || window.location.protocol === 'capacitor:';
      let apiUrl;
      if (isNetlify) {
        apiUrl = '/.netlify/functions/helpdesk';
      } else if (isNativeApp) {
        apiUrl = 'https://www.mycarconcierge.com/.netlify/functions/helpdesk';
      } else {
        apiUrl = '/api/helpdesk';
      }
      console.log('Helpdesk calling:', apiUrl);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationId: this.conversationId,
          mode: this.mode
        })
      });

      if (response.status === 429) {
        this.hideTypingIndicator();
        this.addMessage('assistant', 'The service is busy right now. Please wait a moment and try again.');
        this.isLoading = false;
        this.setInputDisabled(false);
        return;
      }
      
      const data = await response.json();
      this.hideTypingIndicator();
      
      if (data.reply) {
        this.messages.push({ role: 'assistant', content: data.reply });
        this.addMessage('assistant', data.reply, true);
      } else if (data.error) {
        this.addMessage('assistant', 'Sorry, something went wrong. Please try again.');
      }
    } catch (err) {
      console.error('Helpdesk error:', err);
      this.hideTypingIndicator();
      const isNative = window.Capacitor !== undefined || window.location.protocol !== 'https:';
      this.addMessage('assistant', 'Sorry, I couldn\'t connect to My Car Concierge right now. Please check your internet connection and try again.');
    }
    
    this.isLoading = false;
    this.setInputDisabled(false);
  }
  
  setMode(newMode) {
    if (this.mode === newMode) return;

    this.saveToStorage();
    
    this.mode = newMode;
    this.messages = [];
    this.conversationId = `helpdesk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const config = this.getModeConfig();
    
    const widget = document.getElementById(this.widgetId);
    const headerText = widget.querySelector('.helpdesk-header-text p');
    if (headerText) {
      headerText.textContent = config.label;
    }
    
    const messagesContainer = widget.querySelector('.chat-widget-messages');
    messagesContainer.innerHTML = '';

    const saved = this.loadFromStorage();
    if (saved.length > 0) {
      this.restoreMessages();
    } else {
      messagesContainer.innerHTML = this.getWelcomeHTML(config);
    }
  }
  
  openWithMode(mode) {
    this.setMode(mode);
    this.open();
  }
}

if (typeof window !== 'undefined') {
  window.HelpdeskWidget = HelpdeskWidget;
}
