class AIChatWidget {
  constructor() {
    this.isOpen = false;
    this.messages = [];
    this.isLoading = false;
    this.init();
  }

  init() {
    this.createWidget();
    this.attachEventListeners();
  }

  createWidget() {
    const widgetHTML = `
      <div id="ai-chat-widget" class="ai-chat-widget">
        <button id="ai-chat-toggle" class="ai-chat-toggle" aria-label="Open AI Assistant">
          <svg class="chat-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          <svg class="close-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        
        <div id="ai-chat-panel" class="ai-chat-panel">
          <div class="ai-chat-header">
            <div class="ai-chat-header-info">
              <div class="ai-avatar">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M12 16v-4M12 8h.01"></path>
                </svg>
              </div>
              <div>
                <h3>AI Assistant</h3>
                <span class="ai-status">Online</span>
              </div>
            </div>
          </div>
          
          <div id="ai-chat-messages" class="ai-chat-messages">
            <div class="ai-message assistant">
              <div class="message-content">
                Hello! I'm your AI assistant for My Car Concierge. I can help you with questions about our platform, car maintenance advice, and finding the right service providers. How can I assist you today?
              </div>
            </div>
          </div>
          
          <div class="ai-chat-input-container">
            <textarea 
              id="ai-chat-input" 
              class="ai-chat-input" 
              placeholder="Ask about car services..."
              rows="1"
            ></textarea>
            <button id="ai-chat-send" class="ai-chat-send" aria-label="Send message">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      .ai-chat-widget {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 9999;
        font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
      }

      .ai-chat-toggle {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        border: none;
        background: linear-gradient(135deg, #d4a855 0%, #c49a45 100%);
        color: #0a0a0f;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 8px 32px rgba(212, 168, 85, 0.4);
        transition: all 0.3s ease;
      }

      .ai-chat-toggle:hover {
        transform: scale(1.05);
        box-shadow: 0 12px 40px rgba(212, 168, 85, 0.5);
      }

      .ai-chat-toggle .close-icon {
        display: none;
      }

      .ai-chat-widget.open .ai-chat-toggle .chat-icon {
        display: none;
      }

      .ai-chat-widget.open .ai-chat-toggle .close-icon {
        display: block;
      }

      .ai-chat-panel {
        position: absolute;
        bottom: 76px;
        right: 0;
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

      .ai-chat-widget.open .ai-chat-panel {
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

      .ai-chat-header {
        padding: 20px;
        background: rgba(28, 28, 42, 0.8);
        border-bottom: 1px solid rgba(148, 148, 168, 0.1);
      }

      .ai-chat-header-info {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .ai-avatar {
        width: 40px;
        height: 40px;
        background: linear-gradient(135deg, #d4a855 0%, #c49a45 100%);
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #0a0a0f;
      }

      .ai-chat-header h3 {
        margin: 0;
        font-size: 1rem;
        font-weight: 600;
        color: #f4f4f6;
      }

      .ai-status {
        font-size: 0.75rem;
        color: #4ac88c;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .ai-status::before {
        content: '';
        width: 6px;
        height: 6px;
        background: #4ac88c;
        border-radius: 50%;
        animation: pulse 2s infinite;
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }

      .ai-chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .ai-chat-messages::-webkit-scrollbar {
        width: 6px;
      }

      .ai-chat-messages::-webkit-scrollbar-track {
        background: transparent;
      }

      .ai-chat-messages::-webkit-scrollbar-thumb {
        background: rgba(148, 148, 168, 0.2);
        border-radius: 3px;
      }

      .ai-message {
        display: flex;
        flex-direction: column;
        max-width: 85%;
      }

      .ai-message.user {
        align-self: flex-end;
      }

      .ai-message.assistant {
        align-self: flex-start;
      }

      .message-content {
        padding: 12px 16px;
        border-radius: 16px;
        font-size: 0.9rem;
        line-height: 1.5;
      }

      .ai-message.user .message-content {
        background: linear-gradient(135deg, #d4a855 0%, #c49a45 100%);
        color: #0a0a0f;
        border-bottom-right-radius: 4px;
      }

      .ai-message.assistant .message-content {
        background: rgba(74, 124, 255, 0.12);
        color: #f4f4f6;
        border: 1px solid rgba(74, 124, 255, 0.2);
        border-bottom-left-radius: 4px;
      }

      .ai-message.loading .message-content {
        display: flex;
        gap: 4px;
        padding: 16px 20px;
      }

      .typing-dot {
        width: 8px;
        height: 8px;
        background: #9898a8;
        border-radius: 50%;
        animation: typingBounce 1.4s infinite ease-in-out;
      }

      .typing-dot:nth-child(1) { animation-delay: 0s; }
      .typing-dot:nth-child(2) { animation-delay: 0.2s; }
      .typing-dot:nth-child(3) { animation-delay: 0.4s; }

      @keyframes typingBounce {
        0%, 80%, 100% { transform: translateY(0); }
        40% { transform: translateY(-6px); }
      }

      .ai-chat-input-container {
        padding: 16px 20px;
        background: rgba(28, 28, 42, 0.6);
        border-top: 1px solid rgba(148, 148, 168, 0.1);
        display: flex;
        gap: 12px;
        align-items: flex-end;
      }

      .ai-chat-input {
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
      }

      .ai-chat-input::placeholder {
        color: #6b6b7a;
      }

      .ai-chat-input:focus {
        outline: none;
        border-color: rgba(212, 168, 85, 0.4);
      }

      .ai-chat-send {
        width: 44px;
        height: 44px;
        border-radius: 12px;
        border: none;
        background: linear-gradient(135deg, #d4a855 0%, #c49a45 100%);
        color: #0a0a0f;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        flex-shrink: 0;
      }

      .ai-chat-send:hover {
        transform: scale(1.05);
      }

      .ai-chat-send:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }

      @media (max-width: 480px) {
        .ai-chat-widget {
          bottom: 16px;
          right: 16px;
        }

        .ai-chat-toggle {
          width: 54px;
          height: 54px;
        }

        .ai-chat-panel {
          width: calc(100vw - 32px);
          height: calc(100vh - 100px);
          bottom: 70px;
          right: -8px;
        }
      }
    `;

    document.head.appendChild(style);
    document.body.insertAdjacentHTML('beforeend', widgetHTML);
  }

  attachEventListeners() {
    const toggle = document.getElementById('ai-chat-toggle');
    const input = document.getElementById('ai-chat-input');
    const sendBtn = document.getElementById('ai-chat-send');
    const widget = document.getElementById('ai-chat-widget');

    toggle.addEventListener('click', () => {
      this.isOpen = !this.isOpen;
      widget.classList.toggle('open', this.isOpen);
      if (this.isOpen) {
        input.focus();
      }
    });

    sendBtn.addEventListener('click', () => this.sendMessage());

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 100) + 'px';
    });
  }

  async sendMessage() {
    const input = document.getElementById('ai-chat-input');
    const message = input.value.trim();

    if (!message || this.isLoading) return;

    this.messages.push({ role: 'user', content: message });
    this.addMessageToUI('user', message);
    
    input.value = '';
    input.style.height = 'auto';

    this.isLoading = true;
    this.showLoading();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: this.messages }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();
      const assistantMessage = data.message;

      this.messages.push({ role: 'assistant', content: assistantMessage });
      this.hideLoading();
      this.addMessageToUI('assistant', assistantMessage);

    } catch (error) {
      console.error('Chat error:', error);
      this.hideLoading();
      this.addMessageToUI('assistant', 'I apologize, but I encountered an issue processing your request. Please try again in a moment.');
    } finally {
      this.isLoading = false;
    }
  }

  addMessageToUI(role, content) {
    const messagesContainer = document.getElementById('ai-chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `ai-message ${role}`;
    messageDiv.innerHTML = `<div class="message-content">${this.escapeHtml(content)}</div>`;
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  showLoading() {
    const messagesContainer = document.getElementById('ai-chat-messages');
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'ai-loading-indicator';
    loadingDiv.className = 'ai-message assistant loading';
    loadingDiv.innerHTML = `
      <div class="message-content">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    `;
    messagesContainer.appendChild(loadingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  hideLoading() {
    const loading = document.getElementById('ai-loading-indicator');
    if (loading) {
      loading.remove();
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new AIChatWidget());
} else {
  new AIChatWidget();
}
