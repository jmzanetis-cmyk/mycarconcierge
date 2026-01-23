class HelpdeskWidget extends ChatWidgetBase {
  constructor(options = {}) {
    super({
      widgetId: 'helpdesk-widget',
      position: options.position || 'bottom-right',
      primaryColor: options.primaryColor || '#d4a855',
      secondaryColor: options.secondaryColor || '#c49a4a'
    });
    
    this.mode = options.mode || 'driver';
    this.conversationId = options.conversationId || `helpdesk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.init();
  }
  
  init() {
    this.injectStyles(this.getAdditionalStyles());
    this.createWidget();
    this.attachBaseEventListeners();
  }
  
  getAdditionalStyles() {
    return `
      .helpdesk-header-text p {
        margin: 2px 0 0;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.6);
      }
    `;
  }
  
  getModeConfig() {
    const configs = {
      driver: {
        label: 'Car Expert',
        welcome: "Got questions about your car? Describe the issue and I'll help you understand what's happening and what to do next."
      },
      provider: {
        label: 'Provider Support',
        welcome: 'Have questions about working with My Car Concierge? I can help with onboarding, services, and platform questions.'
      },
      education: {
        label: 'Car Academy Tutor',
        welcome: "Welcome to Car Academy! 🎓 I'm here to help you learn about your vehicle in plain English. Ask me anything about maintenance, repairs, warning signs, or how cars work - no question is too basic!"
      }
    };
    return configs[this.mode] || configs.driver;
  }
  
  getWelcomeHTML(config) {
    const title = this.mode === 'education' ? 'Welcome to Car Academy! 🎓' : 'Hi there!';
    return `
      <div class="chat-widget-welcome">
        <div class="chat-widget-welcome-icon">
          <svg viewBox="0 0 24 24"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>
        </div>
        <h4>${title}</h4>
        <p>${config.welcome}</p>
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
          </div>
        </div>
        
        <div class="chat-widget-messages">
          ${this.getWelcomeHTML(config)}
        </div>
        
        ${this.createInputArea('Type your question...')}
      </div>
    `;
    
    document.body.appendChild(widget);
  }
  
  async handleSendMessage() {
    const text = this.getInputValue();
    if (!text || this.isLoading) return;
    
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
      const apiUrl = `${this.apiBaseUrl}/api/helpdesk`;
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
      this.addMessage('assistant', `Error connecting to My Car Concierge. (${isNative ? 'Native' : 'Web'} mode, ${err.message})`);
    }
    
    this.isLoading = false;
    this.setInputDisabled(false);
  }
  
  setMode(newMode) {
    if (this.mode === newMode) return;
    
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
    messagesContainer.innerHTML = this.getWelcomeHTML(config);
  }
  
  openWithMode(mode) {
    this.setMode(mode);
    this.open();
  }
}

if (typeof window !== 'undefined') {
  window.HelpdeskWidget = HelpdeskWidget;
}
