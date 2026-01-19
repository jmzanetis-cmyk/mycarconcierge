class HelpdeskWidget {
  constructor(options = {}) {
    this.mode = options.mode || 'driver';
    this.position = options.position || 'bottom-right';
    this.primaryColor = options.primaryColor || '#d4a855';
    this.conversationId = options.conversationId || `helpdesk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.isOpen = false;
    this.isLoading = false;
    this.messages = [];
    this.apiBaseUrl = this.getApiBaseUrl();
    
    this.init();
  }
  
  getApiBaseUrl() {
    const isNativeApp = window.Capacitor !== undefined || 
                        window.location.protocol === 'capacitor:' ||
                        window.location.protocol === 'ionic:' ||
                        window.location.protocol === 'file:';
    
    if (isNativeApp) {
      return 'https://www.mycarconcierge.com';
    }
    return '';
  }
  
  init() {
    this.injectStyles();
    this.createWidget();
    this.bindEvents();
  }
  
  injectStyles() {
    if (document.getElementById('helpdesk-widget-styles')) return;
    
    const styles = document.createElement('style');
    styles.id = 'helpdesk-widget-styles';
    styles.textContent = `
      .helpdesk-widget {
        position: fixed;
        z-index: 10000;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      
      .helpdesk-widget.bottom-right {
        bottom: 20px;
        right: 20px;
      }
      
      .helpdesk-widget.bottom-left {
        bottom: 20px;
        left: 20px;
      }
      
      .helpdesk-toggle {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: linear-gradient(135deg, ${this.primaryColor}, #c49a4a);
        border: none;
        cursor: pointer;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.3s ease, box-shadow 0.3s ease;
      }
      
      .helpdesk-toggle:hover {
        transform: scale(1.05);
        box-shadow: 0 6px 25px rgba(0, 0, 0, 0.4);
      }
      
      .helpdesk-toggle svg {
        width: 28px;
        height: 28px;
        fill: #0a0a0f;
      }
      
      .helpdesk-toggle .close-icon {
        display: none;
      }
      
      .helpdesk-widget.open .helpdesk-toggle .chat-icon {
        display: none;
      }
      
      .helpdesk-widget.open .helpdesk-toggle .close-icon {
        display: block;
      }
      
      .helpdesk-panel {
        position: absolute;
        bottom: 70px;
        width: 360px;
        max-width: calc(100vw - 40px);
        height: 500px;
        max-height: calc(100vh - 120px);
        background: #12121a;
        border-radius: 16px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        display: none;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.1);
      }
      
      .helpdesk-widget.bottom-right .helpdesk-panel {
        right: 0;
      }
      
      .helpdesk-widget.bottom-left .helpdesk-panel {
        left: 0;
      }
      
      .helpdesk-widget.open .helpdesk-panel {
        display: flex;
        animation: slideUp 0.3s ease;
      }
      
      @keyframes slideUp {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      .helpdesk-header {
        padding: 16px 20px;
        background: linear-gradient(135deg, #1a1a24, #12121a);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        align-items: center;
        gap: 12px;
      }
      
      .helpdesk-header-icon {
        width: 40px;
        height: 40px;
        border-radius: 10px;
        background: linear-gradient(135deg, ${this.primaryColor}, #c49a4a);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .helpdesk-header-icon svg {
        width: 22px;
        height: 22px;
        fill: #0a0a0f;
      }
      
      .helpdesk-header-text h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: #ffffff;
      }
      
      .helpdesk-header-text p {
        margin: 2px 0 0;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.6);
      }
      
      .helpdesk-messages {
        flex: 1;
        padding: 16px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      
      .helpdesk-messages::-webkit-scrollbar {
        width: 6px;
      }
      
      .helpdesk-messages::-webkit-scrollbar-track {
        background: transparent;
      }
      
      .helpdesk-messages::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 3px;
      }
      
      .helpdesk-message {
        max-width: 85%;
        padding: 12px 16px;
        border-radius: 16px;
        font-size: 14px;
        line-height: 1.5;
        word-wrap: break-word;
      }
      
      .helpdesk-message.user {
        align-self: flex-end;
        background: linear-gradient(135deg, ${this.primaryColor}, #c49a4a);
        color: #0a0a0f;
        border-bottom-right-radius: 4px;
      }
      
      .helpdesk-message.assistant {
        align-self: flex-start;
        background: rgba(255, 255, 255, 0.08);
        color: #ffffff;
        border-bottom-left-radius: 4px;
      }
      
      .helpdesk-message.assistant ul,
      .helpdesk-message.assistant ol {
        margin: 8px 0;
        padding-left: 20px;
      }
      
      .helpdesk-message.assistant li {
        margin: 4px 0;
      }
      
      .helpdesk-typing {
        align-self: flex-start;
        padding: 12px 16px;
        background: rgba(255, 255, 255, 0.08);
        border-radius: 16px;
        border-bottom-left-radius: 4px;
        display: flex;
        gap: 4px;
      }
      
      .helpdesk-typing span {
        width: 8px;
        height: 8px;
        background: rgba(255, 255, 255, 0.4);
        border-radius: 50%;
        animation: typing 1.4s infinite;
      }
      
      .helpdesk-typing span:nth-child(2) {
        animation-delay: 0.2s;
      }
      
      .helpdesk-typing span:nth-child(3) {
        animation-delay: 0.4s;
      }
      
      @keyframes typing {
        0%, 60%, 100% {
          transform: translateY(0);
          opacity: 0.4;
        }
        30% {
          transform: translateY(-6px);
          opacity: 1;
        }
      }
      
      .helpdesk-welcome {
        text-align: center;
        padding: 40px 20px;
        color: rgba(255, 255, 255, 0.7);
      }
      
      .helpdesk-welcome-icon {
        width: 60px;
        height: 60px;
        margin: 0 auto 16px;
        border-radius: 50%;
        background: linear-gradient(135deg, ${this.primaryColor}33, ${this.primaryColor}11);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .helpdesk-welcome-icon svg {
        width: 30px;
        height: 30px;
        fill: ${this.primaryColor};
      }
      
      .helpdesk-welcome h4 {
        margin: 0 0 8px;
        font-size: 16px;
        color: #ffffff;
      }
      
      .helpdesk-welcome p {
        margin: 0;
        font-size: 14px;
        line-height: 1.5;
      }
      
      .helpdesk-input-row {
        padding: 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        gap: 10px;
        background: #0e0e14;
      }
      
      .helpdesk-input {
        flex: 1;
        padding: 12px 16px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.05);
        color: #ffffff;
        font-size: 14px;
        outline: none;
        transition: border-color 0.2s ease;
      }
      
      .helpdesk-input::placeholder {
        color: rgba(255, 255, 255, 0.4);
      }
      
      .helpdesk-input:focus {
        border-color: ${this.primaryColor};
      }
      
      .helpdesk-send {
        width: 44px;
        height: 44px;
        border: none;
        border-radius: 12px;
        background: linear-gradient(135deg, ${this.primaryColor}, #c49a4a);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s ease, opacity 0.2s ease;
      }
      
      .helpdesk-send:hover:not(:disabled) {
        transform: scale(1.05);
      }
      
      .helpdesk-send:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      
      .helpdesk-send svg {
        width: 20px;
        height: 20px;
        fill: #0a0a0f;
      }
      
      @media (max-width: 480px) {
        .helpdesk-panel {
          width: calc(100vw - 40px);
          height: calc(100vh - 140px);
          bottom: 80px;
        }
        
        .helpdesk-toggle {
          width: 54px;
          height: 54px;
        }
      }
    `;
    document.head.appendChild(styles);
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
  
  createWidget() {
    const widget = document.createElement('div');
    widget.className = `helpdesk-widget ${this.position}`;
    widget.id = 'helpdesk-widget';
    
    const config = this.getModeConfig();
    const modeLabel = config.label;
    const welcomeText = config.welcome;
    
    widget.innerHTML = `
      <div class="helpdesk-panel">
        <div class="helpdesk-header">
          <div class="helpdesk-header-icon">
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>
          </div>
          <div class="helpdesk-header-text">
            <h3>My Car Concierge</h3>
            <p>${modeLabel}</p>
          </div>
        </div>
        <div class="helpdesk-messages">
          <div class="helpdesk-welcome">
            <div class="helpdesk-welcome-icon">
              <svg viewBox="0 0 24 24"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>
            </div>
            <h4>Hi there!</h4>
            <p>${welcomeText}</p>
          </div>
        </div>
        <div class="helpdesk-input-row">
          <input type="text" class="helpdesk-input" placeholder="Type your question..." />
          <button class="helpdesk-send" disabled>
            <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
      </div>
      <button class="helpdesk-toggle">
        <svg class="chat-icon" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
        <svg class="close-icon" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      </button>
    `;
    
    document.body.appendChild(widget);
    
    this.widget = widget;
    this.panel = widget.querySelector('.helpdesk-panel');
    this.messagesContainer = widget.querySelector('.helpdesk-messages');
    this.input = widget.querySelector('.helpdesk-input');
    this.sendBtn = widget.querySelector('.helpdesk-send');
    this.toggleBtn = widget.querySelector('.helpdesk-toggle');
  }
  
  bindEvents() {
    this.toggleBtn.addEventListener('click', () => this.toggle());
    this.sendBtn.addEventListener('click', () => this.sendMessage());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    this.input.addEventListener('input', () => {
      this.sendBtn.disabled = !this.input.value.trim() || this.isLoading;
    });
  }
  
  toggle() {
    this.isOpen = !this.isOpen;
    this.widget.classList.toggle('open', this.isOpen);
    if (this.isOpen) {
      setTimeout(() => this.input.focus(), 300);
    }
  }
  
  async sendMessage() {
    const text = this.input.value.trim();
    if (!text || this.isLoading) return;
    
    this.input.value = '';
    this.sendBtn.disabled = true;
    this.isLoading = true;
    
    if (this.messages.length === 0) {
      const welcome = this.messagesContainer.querySelector('.helpdesk-welcome');
      if (welcome) welcome.remove();
    }
    
    this.addMessage(text, 'user');
    this.showTyping();
    
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
      this.hideTyping();
      
      if (data.reply) {
        this.addMessage(data.reply, 'assistant');
      } else if (data.error) {
        this.addMessage('Sorry, something went wrong. Please try again.', 'assistant');
      }
    } catch (err) {
      console.error('Helpdesk error:', err);
      this.hideTyping();
      const isNative = window.Capacitor !== undefined || window.location.protocol !== 'https:';
      this.addMessage(`Error connecting to My Car Concierge. (${isNative ? 'Native' : 'Web'} mode, ${err.message})`, 'assistant');
    }
    
    this.isLoading = false;
    this.sendBtn.disabled = !this.input.value.trim();
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  addMessage(text, role) {
    this.messages.push({ role, content: text });
    
    const div = document.createElement('div');
    div.className = `helpdesk-message ${role}`;
    div.innerHTML = this.formatMessage(text);
    this.messagesContainer.appendChild(div);
    this.scrollToBottom();
  }
  
  formatMessage(text) {
    const escaped = this.escapeHtml(text);
    return escaped
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^\d+\)\s/gm, '<br><strong>$&</strong>')
      .replace(/^[-•]\s/gm, '<br>• ');
  }
  
  showTyping() {
    const typing = document.createElement('div');
    typing.className = 'helpdesk-typing';
    typing.id = 'helpdesk-typing';
    typing.innerHTML = '<span></span><span></span><span></span>';
    this.messagesContainer.appendChild(typing);
    this.scrollToBottom();
  }
  
  hideTyping() {
    const typing = document.getElementById('helpdesk-typing');
    if (typing) typing.remove();
  }
  
  scrollToBottom() {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }
  
  setMode(newMode) {
    if (this.mode === newMode) return;
    
    this.mode = newMode;
    this.messages = [];
    this.conversationId = `helpdesk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const config = this.getModeConfig();
    
    const headerText = this.widget.querySelector('.helpdesk-header-text p');
    if (headerText) {
      headerText.textContent = config.label;
    }
    
    this.messagesContainer.innerHTML = `
      <div class="helpdesk-welcome">
        <div class="helpdesk-welcome-icon">
          <svg viewBox="0 0 24 24"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>
        </div>
        <h4>${this.mode === 'education' ? 'Welcome to Car Academy! 🎓' : 'Hi there!'}</h4>
        <p>${config.welcome}</p>
      </div>
    `;
  }
  
  open() {
    if (!this.isOpen) {
      this.isOpen = true;
      this.widget.classList.add('open');
      setTimeout(() => this.input.focus(), 300);
    }
  }
  
  close() {
    if (this.isOpen) {
      this.isOpen = false;
      this.widget.classList.remove('open');
    }
  }
  
  openWithMode(mode) {
    this.setMode(mode);
    this.open();
  }
  
  destroy() {
    const widget = document.getElementById('helpdesk-widget');
    if (widget) widget.remove();
    
    const styles = document.getElementById('helpdesk-widget-styles');
    if (styles) styles.remove();
  }
}

if (typeof window !== 'undefined') {
  window.HelpdeskWidget = HelpdeskWidget;
}
