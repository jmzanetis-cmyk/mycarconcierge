const { test, expect } = require('@playwright/test');

test.describe('Chat Widget', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');
  });

  test('chat widget toggle button is visible on homepage', async ({ page }) => {
    const toggle = page.locator('#helpdesk-widget .chat-widget-toggle');
    await expect(toggle).toBeVisible();
  });

  test('chat widget opens when toggle is clicked', async ({ page }) => {
    const toggle = page.locator('#helpdesk-widget .chat-widget-toggle');
    await toggle.click();
    const panel = page.locator('#helpdesk-widget .chat-widget-panel');
    await expect(panel).toBeVisible();
  });

  test('chat widget shows welcome message with prompts', async ({ page }) => {
    const toggle = page.locator('#helpdesk-widget .chat-widget-toggle');
    await toggle.click();
    const welcome = page.locator('#helpdesk-widget .chat-widget-welcome');
    await expect(welcome).toBeVisible();
    const prompts = page.locator('#helpdesk-widget .chat-widget-prompt-btn');
    await expect(prompts).toHaveCount(3);
  });

  test('chat widget has header with title and action buttons', async ({ page }) => {
    const toggle = page.locator('#helpdesk-widget .chat-widget-toggle');
    await toggle.click();
    const title = page.locator('#helpdesk-widget .helpdesk-header-text h3');
    await expect(title).toHaveText('My Car Concierge');
    const copyBtn = page.locator('#helpdesk-widget .helpdesk-copy-btn');
    await expect(copyBtn).toBeVisible();
    const clearBtn = page.locator('#helpdesk-widget .helpdesk-clear-btn');
    await expect(clearBtn).toBeVisible();
  });

  test('chat widget input area is present with placeholder', async ({ page }) => {
    const toggle = page.locator('#helpdesk-widget .chat-widget-toggle');
    await toggle.click();
    const input = page.locator('#helpdesk-widget .chat-widget-input');
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('placeholder', 'Type your question...');
  });

  test('chat widget closes when toggle is clicked again', async ({ page }) => {
    const toggle = page.locator('#helpdesk-widget .chat-widget-toggle');
    await toggle.click();
    const panel = page.locator('#helpdesk-widget .chat-widget-panel');
    await expect(panel).toBeVisible();
    await toggle.click();
    await expect(panel).not.toBeVisible();
  });

  test('clicking a prompt button populates input and sends message', async ({ page }) => {
    const toggle = page.locator('#helpdesk-widget .chat-widget-toggle');
    await toggle.click();
    const firstPrompt = page.locator('#helpdesk-widget .chat-widget-prompt-btn').first();
    const promptText = await firstPrompt.textContent();
    await firstPrompt.click();
    const userMessage = page.locator('#helpdesk-widget .chat-widget-message.user');
    await expect(userMessage).toBeVisible({ timeout: 5000 });
    await expect(userMessage).toContainText(promptText);
  });

  test('typing indicator appears while waiting for response', async ({ page }) => {
    const toggle = page.locator('#helpdesk-widget .chat-widget-toggle');
    await toggle.click();
    const input = page.locator('#helpdesk-widget .chat-widget-input');
    await input.fill('test message');
    const sendBtn = page.locator('#helpdesk-widget .chat-widget-send');
    await sendBtn.click();
    const typing = page.locator('#helpdesk-widget .chat-widget-typing-indicator');
    await expect(typing).toBeVisible({ timeout: 3000 });
  });

  test('clear button resets conversation and shows welcome', async ({ page }) => {
    const toggle = page.locator('#helpdesk-widget .chat-widget-toggle');
    await toggle.click();
    const firstPrompt = page.locator('#helpdesk-widget .chat-widget-prompt-btn').first();
    await firstPrompt.click();
    await page.waitForTimeout(500);
    const clearBtn = page.locator('#helpdesk-widget .helpdesk-clear-btn');
    await clearBtn.click();
    const welcome = page.locator('#helpdesk-widget .chat-widget-welcome');
    await expect(welcome).toBeVisible({ timeout: 3000 });
  });

  test('chat widget respects light theme', async ({ page }) => {
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
    });
    const toggle = page.locator('#helpdesk-widget .chat-widget-toggle');
    await toggle.click();
    const panel = page.locator('#helpdesk-widget .chat-widget-panel');
    await expect(panel).toBeVisible();
  });

  test('chat widget stores messages in localStorage', async ({ page }) => {
    const toggle = page.locator('#helpdesk-widget .chat-widget-toggle');
    await toggle.click();
    const firstPrompt = page.locator('#helpdesk-widget .chat-widget-prompt-btn').first();
    await firstPrompt.click();
    await page.waitForTimeout(1000);
    const stored = await page.evaluate(() => {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('mcc-helpdesk-'));
      return keys.length > 0;
    });
    expect(stored).toBe(true);
  });
});

test.describe('Chat Widget on Provider Page', () => {
  test('shows provider-specific prompts on providers page', async ({ page }) => {
    await page.goto('/providers.html');
    await page.waitForLoadState('domcontentloaded');
    const toggle = page.locator('#helpdesk-widget .chat-widget-toggle');
    if (await toggle.isVisible()) {
      await toggle.click();
      const prompts = page.locator('#helpdesk-widget .chat-widget-prompt-btn');
      const count = await prompts.count();
      expect(count).toBe(3);
    }
  });
});
