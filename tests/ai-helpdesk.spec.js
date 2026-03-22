'use strict';

const { test, expect } = require('@playwright/test');
const {
  BASE_URL,
  TEST_MEMBER_EMAIL, TEST_MEMBER_PASS,
  loginViaUI
} = require('./helpers');

test.describe('AI Helpdesk Widget — All 3 Modes (Real API + Browser Widget)', () => {
  const modes = [
    { mode: 'driver',    prompt: 'What does the P0300 misfire code mean?' },
    { mode: 'provider',  prompt: 'How do I win more bids on this platform?' },
    { mode: 'education', prompt: 'Explain what a timing belt does in plain English.' }
  ];

  for (const { mode, prompt } of modes) {
    test(`Mode "${mode}": returns substantive real AI response (>80 chars, no error text)`, async ({ request }) => {
      const res = await request.post(`${BASE_URL}/api/helpdesk`, {
        data: { message: prompt, mode, conversationId: `e2e-${mode}-${Date.now()}` }
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(typeof body.reply).toBe('string');
      expect(body.reply.length).toBeGreaterThan(80);
      expect(body.reply).not.toMatch(/sorry.*went wrong|unable to generate|error occurred/i);
    });
  }

  test('Chat widget opens in browser, accepts a message, and renders AI response', async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const toggleBtn = page.locator('.chat-widget-toggle').first();
    await expect(toggleBtn).toBeVisible({ timeout: 10000 });
    await page.evaluate(() => {
      const btn = document.querySelector('.chat-widget-toggle');
      if (btn) btn.click();
    });
    await page.waitForTimeout(1500);

    const chatPanel = page.locator('.chat-widget-panel').first();
    await expect(chatPanel).toBeVisible({ timeout: 5000 });

    const chatInput = page.locator('.chat-widget-input').first();
    await expect(chatInput).toBeVisible({ timeout: 3000 });
    await chatInput.fill('What oil change interval do you recommend for a Toyota Camry?');
    await page.waitForTimeout(300);

    const sendBtn = page.locator('.chat-widget-send').first();
    await expect(sendBtn).toBeVisible({ timeout: 3000 });
    await sendBtn.click();

    await page.waitForTimeout(8000);

    const messages = page.locator('.chat-widget-message');
    const msgCount = await messages.count();
    expect(msgCount).toBeGreaterThan(1);

    const lastMsgText = await messages.last().textContent();
    expect(lastMsgText?.trim().length).toBeGreaterThan(30);
  });

  test('Helpdesk widget is present in home page DOM', async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('domcontentloaded');
    const widget = page.locator('#ai-chat-widget, [id*="helpdesk"], [class*="chat-widget"]').first();
    await expect(widget).toBeAttached({ timeout: 10000 });
  });

  test('Helpdesk widget: mode pills switch active mode', async ({ page }) => {
    await loginViaUI(page, TEST_MEMBER_EMAIL, TEST_MEMBER_PASS, 'member');
    await page.waitForTimeout(2000);

    const helpdeskWidget = page.locator('#helpdesk-widget');
    await expect(helpdeskWidget).toBeAttached({ timeout: 10000 });

    await page.evaluate(() => {
      const toggle = document.querySelector('#helpdesk-widget .chat-widget-toggle');
      if (toggle) toggle.click();
    });
    await page.waitForTimeout(1500);

    const panel = page.locator('#helpdesk-widget .chat-widget-panel');
    await expect(panel).toBeVisible({ timeout: 5000 });

    const modePills = page.locator('#helpdesk-widget .helpdesk-mode-pill');
    expect(await modePills.count()).toBe(3);

    const providerPill = page.locator('#helpdesk-widget .helpdesk-mode-pill[data-mode="provider"]');
    await expect(providerPill).toBeVisible({ timeout: 5000 });
    await page.evaluate(() => {
      const pill = document.querySelector('#helpdesk-widget .helpdesk-mode-pill[data-mode="provider"]');
      if (pill) pill.click();
    });
    await page.waitForTimeout(800);
    expect(await providerPill.evaluate(el => el.classList.contains('active'))).toBe(true);

    const educationPill = page.locator('#helpdesk-widget .helpdesk-mode-pill[data-mode="education"]');
    await expect(educationPill).toBeVisible({ timeout: 5000 });
    await page.evaluate(() => {
      const pill = document.querySelector('#helpdesk-widget .helpdesk-mode-pill[data-mode="education"]');
      if (pill) pill.click();
    });
    await page.waitForTimeout(800);
    expect(await educationPill.evaluate(el => el.classList.contains('active'))).toBe(true);

    const driverPill = page.locator('#helpdesk-widget .helpdesk-mode-pill[data-mode="driver"]');
    await page.evaluate(() => {
      const pill = document.querySelector('#helpdesk-widget .helpdesk-mode-pill[data-mode="driver"]');
      if (pill) pill.click();
    });
    await page.waitForTimeout(800);
    expect(await driverPill.evaluate(el => el.classList.contains('active'))).toBe(true);

    const activePills = await page.evaluate(
      () => document.querySelectorAll('#helpdesk-widget .helpdesk-mode-pill.active').length
    );
    expect(activePills).toBe(1);
  });

  test('Helpdesk widget: send a real message in each mode and verify AI response renders', async ({ page }) => {
    test.setTimeout(90000);
    await loginViaUI(page, TEST_MEMBER_EMAIL, TEST_MEMBER_PASS, 'member');
    await page.waitForTimeout(2000);

    const helpdeskWidget = page.locator('#helpdesk-widget');
    await expect(helpdeskWidget).toBeAttached({ timeout: 10000 });

    await page.evaluate(() => {
      const toggle = document.querySelector('#helpdesk-widget .chat-widget-toggle');
      if (toggle) toggle.click();
    });
    const panel = page.locator('#helpdesk-widget .chat-widget-panel');
    await expect(panel).toBeVisible({ timeout: 5000 });

    const widgetModes = [
      { dataMode: 'driver',    question: 'What does check engine light mean?' },
      { dataMode: 'provider',  question: 'How should I price my bid competitively?' },
      { dataMode: 'education', question: 'Explain engine oil viscosity in simple terms.' }
    ];

    for (const { dataMode, question } of widgetModes) {
      const pill = page.locator(`#helpdesk-widget .helpdesk-mode-pill[data-mode="${dataMode}"]`);
      if (await pill.count() > 0) {
        await page.evaluate((m) => {
          const p = document.querySelector(`#helpdesk-widget .helpdesk-mode-pill[data-mode="${m}"]`);
          if (p) p.click();
        }, dataMode);
        await page.waitForTimeout(500);
        expect(await pill.evaluate(el => el.classList.contains('active')),
          `Mode pill "${dataMode}" must be active after clicking`).toBe(true);
      }

      const beforeCount = await page.locator('#helpdesk-widget .chat-widget-message').count();

      const chatInput = page.locator('#helpdesk-widget .chat-widget-input, #helpdesk-widget textarea, #helpdesk-widget input[type="text"]').first();
      await expect(chatInput).toBeVisible({ timeout: 5000 });
      await chatInput.fill(question);
      await page.waitForTimeout(200);

      const sendBtn = page.locator('#helpdesk-widget .chat-widget-send, #helpdesk-widget button[type="submit"]').first();
      if (await sendBtn.count() > 0) {
        await sendBtn.click();
      } else {
        await chatInput.press('Enter');
      }

      await page.waitForTimeout(10000);

      const afterCount = await page.locator('#helpdesk-widget .chat-widget-message').count();
      expect(afterCount, `Mode "${dataMode}": at least 1 new message should appear after sending`).toBeGreaterThan(beforeCount);

      const lastMsgText = (await page.locator('#helpdesk-widget .chat-widget-message').last().textContent()) || '';
      expect(lastMsgText.trim().length, `Mode "${dataMode}": response message must have content`).toBeGreaterThan(10);
      expect(lastMsgText, `Mode "${dataMode}": response must not be a critical error`).not.toMatch(/critical error|service unavailable|500/i);
      console.log(`[Helpdesk mode "${dataMode}"] response snippet: "${lastMsgText.trim().substring(0, 80)}"`);
    }
  });
});
