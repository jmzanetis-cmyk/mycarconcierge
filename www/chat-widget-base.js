class ChatWidgetBase {
  constructor(options = {}) {
    this.isOpen = false;
    this.isLoading = false;
    this.messages = [];
    this.widgetId = options.widgetId || 'chat-widget';
    this.position = options.position || 'bottom-right';
    this.primaryColor = options.primaryColor || '#d4a855';
    this.secondaryColor = options.secondaryColor || '#c49a45';
    this.apiBaseUrl = this.getApiBaseUrl();
  }

  getApiBaseUrl() {
    const isNativeApp = window.Capacitor !== undefined || 
                        window.location.protocol === 'capacitor:' ||
                        window.location.protocol === 'ionic:' ||
                        window.location.protocol === 'file:';
    
    if (isNativeApp) {
      return (window.MCC_CONFIG && window.MCC_CONFIG.siteUrlWww) || 'https://www.mycarconcierge.com';
    }
    return '';
  }

  getBaseStyles() {
    return `
      .chat-widget-base {
        position: fixed;
        z-index: 9999;
        font-family: 'Outfit', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }

      .chat-widget-base.bottom-right {
        bottom: 24px;
        right: 24px;
      }

      .chat-widget-base.bottom-left {
        bottom: 24px;
        left: 24px;
      }

      .chat-widget-toggle {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        border: none;
        background: linear-gradient(135deg, ${this.primaryColor} 0%, ${this.secondaryColor} 100%);
        color: #0a0a0f;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 8px 32px rgba(212, 168, 85, 0.4);
        transition: all 0.3s ease;
      }

      .chat-widget-toggle:hover {
        transform: scale(1.05);
        box-shadow: 0 12px 40px rgba(212, 168, 85, 0.5);
      }

      .chat-widget-toggle .close-icon {
        display: none;
      }

      .chat-widget-base.open .chat-widget-toggle .chat-icon {
        display: none;
      }

      .chat-widget-base.open .chat-widget-toggle .close-icon {
        display: block;
      }

      .chat-widget-panel {
        position: absolute;
        bottom: 76px;
        width: 380px;
        max-width: calc(100vw - 48px);
        height: 520px;
        max-height: calc(100vh - 120px);
        background: rgba(18, 18, 28, 0.98);
        border: 1px solid rgba(148, 148, 168, 0.15);
        border-radius: 22px;
        display: none;
        flex-direction: column;
        overflow: hidden;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(20px);
      }

      .chat-widget-base.bottom-right .chat-widget-panel {
        right: 0;
      }

      .chat-widget-base.bottom-left .chat-widget-panel {
        left: 0;
      }

      .chat-widget-base.open .chat-widget-panel {
        display: flex;
        animation: chatSlideUp 0.3s ease;
      }

      @keyframes chatSlideUp {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .chat-widget-header {
        padding: 20px;
        background: rgba(28, 28, 42, 0.8);
        border-bottom: 1px solid rgba(148, 148, 168, 0.1);
      }

      .chat-widget-header-info {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .chat-widget-avatar {
        width: 40px;
        height: 40px;
        background: linear-gradient(135deg, ${this.primaryColor} 0%, ${this.secondaryColor} 100%);
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #0a0a0f;
      }

      .chat-widget-header h3 {
        margin: 0;
        font-size: 1rem;
        font-weight: 600;
        color: #f4f4f6;
      }

      .chat-widget-status {
        font-size: 0.75rem;
        color: #4ac88c;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .chat-widget-status::before {
        content: '';
        width: 6px;
        height: 6px;
        background: #4ac88c;
        border-radius: 50%;
        animation: statusPulse 2s infinite;
      }

      @keyframes statusPulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }

      .chat-widget-messages {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .chat-widget-messages::-webkit-scrollbar {
        width: 6px;
      }

      .chat-widget-messages::-webkit-scrollbar-track {
        background: transparent;
      }

      .chat-widget-messages::-webkit-scrollbar-thumb {
        background: rgba(148, 148, 168, 0.2);
        border-radius: 3px;
      }

      .chat-widget-message {
        display: flex;
        flex-direction: column;
        max-width: 85%;
      }

      .chat-widget-message.user {
        align-self: flex-end;
      }

      .chat-widget-message.assistant {
        align-self: flex-start;
      }

      .chat-widget-message-content {
        padding: 12px 16px;
        border-radius: 16px;
        font-size: 0.9rem;
        line-height: 1.5;
        word-wrap: break-word;
      }

      .chat-widget-message.user .chat-widget-message-content {
        background: linear-gradient(135deg, ${this.primaryColor} 0%, ${this.secondaryColor} 100%);
        color: #0a0a0f;
        border-bottom-right-radius: 4px;
      }

      .chat-widget-message.assistant .chat-widget-message-content {
        background: rgba(74, 124, 255, 0.12);
        color: #f4f4f6;
        border: 1px solid rgba(74, 124, 255, 0.2);
        border-bottom-left-radius: 4px;
      }

      .chat-widget-message.assistant .chat-widget-message-content ul,
      .chat-widget-message.assistant .chat-widget-message-content ol {
        margin: 8px 0;
        padding-left: 20px;
      }

      .chat-widget-message.assistant .chat-widget-message-content li {
        margin: 4px 0;
      }

      .chat-widget-typing {
        display: flex;
        gap: 4px;
        padding: 16px 20px;
      }

      .chat-widget-typing-dot {
        width: 8px;
        height: 8px;
        background: #9898a8;
        border-radius: 50%;
        animation: typingBounce 1.4s infinite ease-in-out;
      }

      .chat-widget-typing-dot:nth-child(1) { animation-delay: 0s; }
      .chat-widget-typing-dot:nth-child(2) { animation-delay: 0.2s; }
      .chat-widget-typing-dot:nth-child(3) { animation-delay: 0.4s; }

      @keyframes typingBounce {
        0%, 80%, 100% { transform: translateY(0); }
        40% { transform: translateY(-6px); }
      }

      .chat-widget-input-container {
        padding: 16px 20px;
        background: rgba(28, 28, 42, 0.6);
        border-top: 1px solid rgba(148, 148, 168, 0.1);
        display: flex;
        gap: 12px;
        align-items: flex-end;
      }

      .chat-widget-input {
        flex: 1;
        background: rgba(18, 18, 28, 0.8);
        border: 1px solid rgba(148, 148, 168, 0.15);
        border-radius: 12px;
        padding: 12px 16px;
        font-family: inherit;
        font-size: 0.9rem;
        color: #f4f4f6;
        resize: none;
        max-height: 100px;
        line-height: 1.4;
        outline: none;
        transition: border-color 0.2s ease;
      }

      .chat-widget-input::placeholder {
        color: #6b6b7a;
      }

      .chat-widget-input:focus {
        border-color: rgba(212, 168, 85, 0.4);
      }

      .chat-widget-send {
        width: 44px;
        height: 44px;
        border-radius: 12px;
        border: none;
        background: linear-gradient(135deg, ${this.primaryColor} 0%, ${this.secondaryColor} 100%);
        color: #0a0a0f;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        flex-shrink: 0;
      }

      .chat-widget-send:hover:not(:disabled) {
        transform: scale(1.05);
      }

      .chat-widget-send:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }

      .chat-widget-welcome {
        text-align: center;
        padding: 40px 20px;
        color: rgba(255, 255, 255, 0.7);
      }

      .chat-widget-welcome-icon {
        width: 60px;
        height: 60px;
        margin: 0 auto 16px;
        border-radius: 50%;
        background: linear-gradient(135deg, ${this.primaryColor}33, ${this.primaryColor}11);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .chat-widget-welcome-icon svg {
        width: 30px;
        height: 30px;
        fill: ${this.primaryColor};
      }

      .chat-widget-welcome h4 {
        margin: 0 0 8px;
        font-size: 16px;
        color: #ffffff;
      }

      .chat-widget-welcome p {
        margin: 0;
        font-size: 14px;
        line-height: 1.5;
      }

      @media (max-width: 480px) {
        .chat-widget-base {
          bottom: 16px;
          right: 16px;
        }

        .chat-widget-base.bottom-left {
          left: 16px;
        }

        .chat-widget-toggle {
          width: 54px;
          height: 54px;
        }

        .chat-widget-panel {
          width: calc(100vw - 32px);
          height: calc(100vh - 100px);
          bottom: 70px;
          right: -8px;
        }

        .chat-widget-base.bottom-left .chat-widget-panel {
          left: -8px;
          right: auto;
        }
      }
    `;
  }

  getToggleButtonHTML() {
    return `
      <svg class="chat-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
      <svg class="close-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;
  }

  getSendButtonIcon() {
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="22" y1="2" x2="11" y2="13"></line>
        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
      </svg>
    `;
  }

  injectStyles(additionalStyles = '') {
    const existingStyle = document.getElementById(`${this.widgetId}-styles`);
    if (existingStyle) existingStyle.remove();

    const style = document.createElement('style');
    style.id = `${this.widgetId}-styles`;
    style.textContent = this.getBaseStyles() + additionalStyles;
    document.head.appendChild(style);
  }

  createWidgetContainer() {
    const widget = document.createElement('div');
    widget.id = this.widgetId;
    widget.className = `chat-widget-base ${this.position}`;
    return widget;
  }

  createToggleButton() {
    return `
      <button class="chat-widget-toggle" aria-label="Toggle chat">
        ${this.getToggleButtonHTML()}
      </button>
    `;
  }

  createInputArea(placeholder = 'Type your message...') {
    return `
      <div class="chat-widget-input-container">
        <textarea 
          class="chat-widget-input" 
          placeholder="${placeholder}"
          rows="1"
        ></textarea>
        <button class="chat-widget-send" aria-label="Send message">
          ${this.getSendButtonIcon()}
        </button>
      </div>
    `;
  }

  attachBaseEventListeners() {
    const widget = document.getElementById(this.widgetId);
    const toggle = widget.querySelector('.chat-widget-toggle');
    const input = widget.querySelector('.chat-widget-input');
    const sendBtn = widget.querySelector('.chat-widget-send');

    toggle.addEventListener('click', () => this.toggle());

    sendBtn.addEventListener('click', () => this.handleSendMessage());

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSendMessage();
      }
    });

    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 100) + 'px';
      if (sendBtn) {
        sendBtn.disabled = !input.value.trim() || this.isLoading;
      }
    });
  }

  toggle() {
    this.isOpen = !this.isOpen;
    const widget = document.getElementById(this.widgetId);
    widget.classList.toggle('open', this.isOpen);
    if (this.isOpen) {
      const input = widget.querySelector('.chat-widget-input');
      setTimeout(() => input && input.focus(), 100);
    }
  }

  open() {
    if (!this.isOpen) {
      this.isOpen = true;
      const widget = document.getElementById(this.widgetId);
      widget.classList.add('open');
      const input = widget.querySelector('.chat-widget-input');
      setTimeout(() => input && input.focus(), 100);
    }
  }

  close() {
    if (this.isOpen) {
      this.isOpen = false;
      const widget = document.getElementById(this.widgetId);
      widget.classList.remove('open');
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  formatMessage(text) {
    const escaped = this.escapeHtml(text);
    return escaped
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^\d+\)\s/gm, '<br><strong>$&</strong>')
      .replace(/^[-•]\s/gm, '<br>• ');
  }

  addMessage(role, content, useFormatting = false) {
    const widget = document.getElementById(this.widgetId);
    const messagesContainer = widget.querySelector('.chat-widget-messages');
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-widget-message ${role}`;
    
    const formattedContent = useFormatting ? this.formatMessage(content) : this.escapeHtml(content);
    messageDiv.innerHTML = `<div class="chat-widget-message-content">${formattedContent}</div>`;
    
    messagesContainer.appendChild(messageDiv);
    this.scrollToBottom();
  }

  showTypingIndicator() {
    const widget = document.getElementById(this.widgetId);
    const messagesContainer = widget.querySelector('.chat-widget-messages');
    
    const existingIndicator = widget.querySelector('.chat-widget-typing-indicator');
    if (existingIndicator) return;
    
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'chat-widget-message assistant chat-widget-typing-indicator';
    loadingDiv.innerHTML = `
      <div class="chat-widget-message-content chat-widget-typing">
        <div class="chat-widget-typing-dot"></div>
        <div class="chat-widget-typing-dot"></div>
        <div class="chat-widget-typing-dot"></div>
      </div>
    `;
    messagesContainer.appendChild(loadingDiv);
    this.scrollToBottom();
  }

  hideTypingIndicator() {
    const widget = document.getElementById(this.widgetId);
    const indicator = widget.querySelector('.chat-widget-typing-indicator');
    if (indicator) indicator.remove();
  }

  scrollToBottom() {
    const widget = document.getElementById(this.widgetId);
    const messagesContainer = widget.querySelector('.chat-widget-messages');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  getInputValue() {
    const widget = document.getElementById(this.widgetId);
    const input = widget.querySelector('.chat-widget-input');
    return input ? input.value.trim() : '';
  }

  clearInput() {
    const widget = document.getElementById(this.widgetId);
    const input = widget.querySelector('.chat-widget-input');
    if (input) {
      input.value = '';
      input.style.height = 'auto';
    }
  }

  setInputDisabled(disabled) {
    const widget = document.getElementById(this.widgetId);
    const sendBtn = widget.querySelector('.chat-widget-send');
    if (sendBtn) {
      sendBtn.disabled = disabled;
    }
  }

  handleSendMessage() {
    console.warn('handleSendMessage should be overridden in subclass');
  }

  removeWelcomeMessage() {
    const widget = document.getElementById(this.widgetId);
    const welcome = widget.querySelector('.chat-widget-welcome');
    if (welcome) welcome.remove();
  }

  destroy() {
    const widget = document.getElementById(this.widgetId);
    if (widget) widget.remove();
    
    const styles = document.getElementById(`${this.widgetId}-styles`);
    if (styles) styles.remove();
  }
}

if (typeof window !== 'undefined') {
  window.ChatWidgetBase = ChatWidgetBase;
}
