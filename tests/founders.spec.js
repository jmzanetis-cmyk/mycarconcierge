const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://127.0.0.1:5000';

test.describe('Founders Page - Structure & Content', () => {
  test('page loads with correct title and meta description', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    await expect(page).toHaveTitle(/Founder Programs/i);
    const metaDesc = await page.locator('meta[name="description"]').getAttribute('content');
    expect(metaDesc).toContain('founding community');
  });

  test('page has correct HTML lang attribute', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBe('en');
  });

  test('onboarding banner is visible', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    const banner = page.locator('[role="banner"]');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Onboarding');
  });

  test('navigation has logo and sign up button', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    const nav = page.locator('nav[role="navigation"]');
    await expect(nav).toBeVisible();
    await expect(nav.locator('.nav-logo img')).toBeVisible();
    await expect(nav.locator('.nav-cta')).toContainText('Sign Up');
  });

  test('hero section has founding heading and urgency line', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    const hero = page.locator('.hero');
    await expect(hero.locator('h1')).toContainText('Founding');
    await expect(hero.locator('.hero-urgency')).toContainText('Limited founding spots');
  });

  test('hero buttons are in correct order: provider first, member second', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    const buttons = page.locator('.hero-buttons a');
    await expect(buttons.nth(0)).toContainText("I'm a Service Provider");
    await expect(buttons.nth(1)).toContainText("I'm a Car Owner");
    expect(await buttons.nth(0).getAttribute('class')).toContain('btn-gold');
    expect(await buttons.nth(1).getAttribute('class')).toContain('btn-outline');
  });

  test('trust indicators are present', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    const trustSection = page.locator('.trust-indicators');
    await expect(trustSection).toBeVisible();
    await expect(trustSection.locator('.trust-item')).toHaveCount(3);
    await expect(trustSection).toContainText('Stripe-Secured');
    await expect(trustSection).toContainText('Vetted Providers');
    await expect(trustSection).toContainText('Your Data');
  });
});

test.describe('Founders Page - Section Order', () => {
  test('provider program section appears before member program section', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    const providerSection = page.locator('#provider-program');
    const memberSection = page.locator('#member-program');
    await expect(providerSection).toBeVisible();
    await expect(memberSection).toBeVisible();

    const providerTop = await providerSection.boundingBox();
    const memberTop = await memberSection.boundingBox();
    expect(providerTop.y).toBeLessThan(memberTop.y);
  });

  test('provider section has correct content', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    const section = page.locator('#provider-program');
    await expect(section).toContainText('Founding Providers');
    await expect(section).toContainText('0% Platform Fees');
    await expect(section).toContainText('Early Access');
    await expect(section).toContainText('Priority Listing');
    await expect(section).toContainText('Limited Spots');
    await expect(section.locator('.btn-gold')).toContainText('Apply as Founding Provider');
  });

  test('member section has correct content', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    const section = page.locator('#member-program');
    await expect(section).toContainText('Member Founders');
    await expect(section).toContainText('Free to Join');
    await expect(section).toContainText('Earn Commissions');
    await expect(section).toContainText('Lifetime Earning');
    await expect(section).toContainText('Personal Referral Link');
    await expect(section.locator('.btn-gold')).toContainText('Join as Member Founder');
  });

  test('member section has how-it-works steps', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    const steps = page.locator('#member-program .how-step');
    await expect(steps).toHaveCount(4);
    await expect(steps.nth(0)).toContainText('Sign Up');
    await expect(steps.nth(1)).toContainText('Get Your Link');
    await expect(steps.nth(2)).toContainText('Share');
    await expect(steps.nth(3)).toContainText('Earn');
  });
});

test.describe('Founders Page - Theme Toggle', () => {
  test('theme toggle button is visible in nav', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    const toggle = page.locator('.theme-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-label', 'Toggle light/dark theme');
  });

  test('page defaults to dark theme', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    const theme = await page.locator('html').getAttribute('data-theme');
    expect(theme).toBe('dark');
  });

  test('clicking toggle switches to light theme', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    await page.locator('.theme-toggle').click();
    const theme = await page.locator('html').getAttribute('data-theme');
    expect(theme).toBe('light');
  });

  test('theme persists via localStorage', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    await page.locator('.theme-toggle').click();
    const saved = await page.evaluate(() => localStorage.getItem('theme'));
    expect(saved).toBe('light');
  });

  test('double-click toggles back to dark', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    await page.locator('.theme-toggle').click();
    await page.locator('.theme-toggle').click();
    const theme = await page.locator('html').getAttribute('data-theme');
    expect(theme).toBe('dark');
  });

  test('light theme changes body background color', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    await page.locator('.theme-toggle').click();
    await page.waitForTimeout(400);
    const bgColor = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bgColor).not.toContain('18, 22, 28');
  });
});

test.describe('Founders Page - FAQ Interactivity', () => {
  test('FAQ section has 6 questions', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    const questions = page.locator('.faq-question');
    await expect(questions).toHaveCount(6);
  });

  test('FAQ answers are hidden by default', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    const firstAnswer = page.locator('.faq-answer').first();
    const maxHeight = await firstAnswer.evaluate(el => getComputedStyle(el).maxHeight);
    expect(maxHeight).toBe('0px');
  });

  test('clicking a FAQ question expands its answer', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    const firstQuestion = page.locator('.faq-question').first();
    await firstQuestion.click();
    const firstItem = page.locator('.faq-item').first();
    await expect(firstItem).toHaveClass(/active/);
    const expanded = await firstQuestion.getAttribute('aria-expanded');
    expect(expanded).toBe('true');
  });

  test('clicking another question closes the previous one', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    const questions = page.locator('.faq-question');
    await questions.nth(0).click();
    await expect(page.locator('.faq-item').nth(0)).toHaveClass(/active/);
    await questions.nth(1).click();
    await expect(page.locator('.faq-item').nth(0)).not.toHaveClass(/active/);
    await expect(page.locator('.faq-item').nth(1)).toHaveClass(/active/);
  });

  test('clicking same question again closes it', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    const firstQuestion = page.locator('.faq-question').first();
    await firstQuestion.click();
    await expect(page.locator('.faq-item').first()).toHaveClass(/active/);
    await firstQuestion.click();
    await expect(page.locator('.faq-item').first()).not.toHaveClass(/active/);
    const expanded = await firstQuestion.getAttribute('aria-expanded');
    expect(expanded).toBe('false');
  });
});

test.describe('Founders Page - Accessibility', () => {
  test('main content is wrapped in a main element', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    const main = page.locator('main[role="main"]');
    await expect(main).toBeVisible();
  });

  test('footer has contentinfo role', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    const footer = page.locator('footer[role="contentinfo"]');
    await expect(footer).toBeVisible();
  });

  test('navigation has proper aria-label', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    const nav = page.locator('nav[aria-label="Main navigation"]');
    await expect(nav).toBeVisible();
  });

  test('FAQ questions have aria-expanded attributes', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    const questions = page.locator('.faq-question');
    const count = await questions.count();
    for (let i = 0; i < count; i++) {
      const expanded = await questions.nth(i).getAttribute('aria-expanded');
      expect(expanded).toBe('false');
    }
  });

  test('FAQ questions have aria-controls pointing to answer IDs', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    const questions = page.locator('.faq-question');
    const count = await questions.count();
    for (let i = 0; i < count; i++) {
      const controls = await questions.nth(i).getAttribute('aria-controls');
      expect(controls).toBeTruthy();
      const answer = page.locator(`#${controls}`);
      await expect(answer).toBeAttached();
    }
  });

  test('decorative SVGs have aria-hidden', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    const svgs = page.locator('.benefit-icon svg, .rollout-stat-icon svg');
    const count = await svgs.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < Math.min(count, 5); i++) {
      const ariaHidden = await svgs.nth(i).getAttribute('aria-hidden');
      expect(ariaHidden).toBe('true');
    }
  });

  test('interactive elements have focus-visible styles', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    const css = await page.evaluate(() => {
      const sheets = Array.from(document.styleSheets);
      let rules = '';
      sheets.forEach(s => {
        try {
          Array.from(s.cssRules).forEach(r => { rules += r.cssText + '\n'; });
        } catch(e) {}
      });
      return rules;
    });
    expect(css).toContain('focus-visible');
  });
});

test.describe('Founders Page - Provider Referral & Final CTA', () => {
  test('provider referral section exists', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    const section = page.locator('.provider-referral-section');
    await expect(section).toBeVisible();
    await expect(section).toContainText('Refer Other Providers');
  });

  test('final CTA has buttons in correct order', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    const buttons = page.locator('.final-cta-buttons a');
    await expect(buttons.nth(0)).toContainText('Apply as Founding Provider');
    await expect(buttons.nth(1)).toContainText('Join as Member Founder');
  });

  test('footer has correct links', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    const footer = page.locator('footer');
    await expect(footer).toContainText('2026 My Car Concierge');
    const links = footer.locator('a');
    const count = await links.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });
});

test.describe('Founders Page - Spacing & Layout', () => {
  test('hero section does not have excessive height', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    const hero = page.locator('.hero');
    const box = await hero.boundingBox();
    expect(box.height).toBeLessThan(800);
  });

  test('benefit cards are visible in grid layout', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    const cards = page.locator('#provider-program .benefit-card');
    await expect(cards).toHaveCount(4);
    for (let i = 0; i < 4; i++) {
      await expect(cards.nth(i)).toBeVisible();
    }
  });

  test('rollout stats are displayed', async ({ page }) => {
    await page.goto(`${BASE_URL}/founders.html`);
    const stats = page.locator('.rollout-stat');
    await expect(stats).toHaveCount(3);
  });
});
