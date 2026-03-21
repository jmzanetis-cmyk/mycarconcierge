class AIChatWidget extends ChatWidgetBase {
  constructor() {
    super({
      widgetId: 'ai-chat-widget',
      position: 'bottom-right'
    });
    this.init();
  }

  init() {
    this.injectStyles(this.getAdditionalStyles());
    this.createWidget();
    this.attachBaseEventListeners();
  }

  getAdditionalStyles() {
    return `
      .ai-debug-banner {
        padding: 8px 12px;
        background: rgba(255, 193, 7, 0.15);
        border-bottom: 1px solid rgba(255, 193, 7, 0.3);
        font-size: 0.7rem;
        color: #ffc107;
        display: none;
        word-break: break-all;
      }

      .ai-debug-banner.visible {
        display: block;
      }

      .ai-debug-banner.error {
        background: rgba(220, 53, 69, 0.15);
        border-color: rgba(220, 53, 69, 0.3);
        color: #ff6b6b;
      }

      .ai-debug-banner.success {
        background: rgba(40, 167, 69, 0.15);
        border-color: rgba(40, 167, 69, 0.3);
        color: #4ac88c;
      }
    `;
  }

  createWidget() {
    const widget = this.createWidgetContainer();
    
    widget.innerHTML = `
      <button class="chat-widget-toggle" aria-label="Open AI Assistant">
        ${this.getToggleButtonHTML()}
      </button>
      
      <div class="chat-widget-panel">
        <div class="chat-widget-header">
          <div class="chat-widget-header-info">
            <div class="chat-widget-avatar">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 16v-4M12 8h.01"></path>
              </svg>
            </div>
            <div>
              <h3>AI Assistant</h3>
              <span class="chat-widget-status">Online</span>
            </div>
          </div>
        </div>
        
        <div class="ai-debug-banner"></div>
        
        <div class="chat-widget-messages">
          <div class="chat-widget-message assistant">
            <div class="chat-widget-message-content">
              Hello! I'm your AI assistant for My Car Concierge. I can help you with questions about our platform, car maintenance advice, and finding the right service providers. How can I assist you today?
            </div>
          </div>
        </div>
        
        ${this.createInputArea('Ask about car services...')}
      </div>
    `;

    document.body.appendChild(widget);
  }

  updateDebugBanner(message, type = 'info') {
    const banner = document.querySelector(`#${this.widgetId} .ai-debug-banner`);
    if (banner) {
      banner.textContent = message;
      banner.className = 'ai-debug-banner visible ' + type;
    }
  }

  async handleSendMessage() {
    const message = this.getInputValue();

    if (!message || this.isLoading) return;

    const apiUrl = `${this.apiBaseUrl}/api/chat`;
    const isNative = window.Capacitor !== undefined || window.location.protocol === 'capacitor:' || window.location.protocol === 'file:';
    this.updateDebugBanner(`Mode: ${isNative ? 'Native' : 'Web'} | URL: ${apiUrl}`, 'info');

    this.messages.push({ role: 'user', content: message });
    this.addMessage('user', message);
    
    this.clearInput();
    this.isLoading = true;
    this.setInputDisabled(true);
    this.showTypingIndicator();

    try {
      this.updateDebugBanner(`Connecting to: ${apiUrl}...`, 'info');
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: this.messages }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.updateDebugBanner(`HTTP ${response.status}: ${errorText.substring(0, 100)}`, 'error');
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const assistantMessage = data.message;

      this.updateDebugBanner(`Connected successfully to ${this.apiBaseUrl || 'local'}`, 'success');
      this.messages.push({ role: 'assistant', content: assistantMessage });
      this.hideTypingIndicator();
      this.addMessage('assistant', assistantMessage);

    } catch (error) {
      console.error('Chat error:', error);
      this.updateDebugBanner(`Error: ${error.message}`, 'error');
      this.hideTypingIndicator();
      this.addMessage('assistant', `Error connecting to My Car Concierge. Please try again. (${error.message})`);
    } finally {
      this.isLoading = false;
      this.setInputDisabled(false);
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new AIChatWidget());
} else {
  new AIChatWidget();
}
