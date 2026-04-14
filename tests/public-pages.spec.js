const { test, expect } = require('@playwright/test');

test.describe('Homepage (index.html)', () => {
  test('page loads with correct title containing "My Car Concierge"', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveTitle(/My Car Concierge/);
  });

  test('logo image exists with alt="My Car Concierge"', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');
    const logo = page.locator('img[alt="My Car Concierge"]');
    await expect(logo.first()).toBeAttached();
  });

  test('theme toggle exists (data-theme attribute on html element)', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', /.+/);
  });

  test('PWA manifest link exists', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');
    const manifest = page.locator('link[rel="manifest"]');
    await expect(manifest).toBeAttached();
  });

  test('preconnect hints exist for fonts.googleapis.com', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');
    const preconnect = page.locator('link[rel="preconnect"][href="https://fonts.googleapis.com"]');
    await expect(preconnect).toBeAttached();
  });

  test('page has meta viewport tag', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');
    const viewport = page.locator('meta[name="viewport"]');
    await expect(viewport).toBeAttached();
    await expect(viewport).toHaveAttribute('content', /width=device-width/);
  });

  test('Apple mobile web app meta tags exist', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');
    const capable = page.locator('meta[name="apple-mobile-web-app-capable"]');
    await expect(capable).toBeAttached();
    const statusBar = page.locator('meta[name="apple-mobile-web-app-status-bar-style"]');
    await expect(statusBar).toBeAttached();
    const title = page.locator('meta[name="apple-mobile-web-app-title"]');
    await expect(title).toBeAttached();
  });
});

test.describe('Provider Info Page (provider-info.html)', () => {
  test('page loads successfully (status 200)', async ({ page }) => {
    const response = await page.goto('/provider-info.html');
    await page.waitForLoadState('domcontentloaded');
    expect(response.status()).toBe(200);
  });

  test('contains information about becoming a provider', async ({ page }) => {
    await page.goto('/provider-info.html');
    await page.waitForLoadState('domcontentloaded');
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).toMatch(/provider|Provider|business|Business/i);
  });
});

test.describe('Privacy Policy (privacy.html)', () => {
  test('page loads successfully', async ({ page }) => {
    const response = await page.goto('/privacy.html');
    await page.waitForLoadState('domcontentloaded');
    expect(response.status()).toBe(200);
  });

  test('contains "Privacy" text', async ({ page }) => {
    await page.goto('/privacy.html');
    await page.waitForLoadState('domcontentloaded');
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).toContain('Privacy');
  });
});

test.describe('Terms of Service (terms.html)', () => {
  test('page loads successfully', async ({ page }) => {
    const response = await page.goto('/terms.html');
    await page.waitForLoadState('domcontentloaded');
    expect(response.status()).toBe(200);
  });

  test('contains "Terms" text', async ({ page }) => {
    await page.goto('/terms.html');
    await page.waitForLoadState('domcontentloaded');
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).toContain('Terms');
  });
});

test.describe('FAQ Page (faq.html)', () => {
  test('page loads successfully', async ({ page }) => {
    const response = await page.goto('/faq.html');
    await page.waitForLoadState('domcontentloaded');
    expect(response.status()).toBe(200);
  });
});

test.describe('About Page (about.html)', () => {
  test('page loads successfully', async ({ page }) => {
    const response = await page.goto('/about.html');
    await page.waitForLoadState('domcontentloaded');
    expect(response.status()).toBe(200);
  });
});

test.describe('Contact Page (contact.html)', () => {
  test('page loads successfully', async ({ page }) => {
    const response = await page.goto('/contact.html');
    await page.waitForLoadState('domcontentloaded');
    expect(response.status()).toBe(200);
  });
});

test.describe('How It Works (how-it-works.html)', () => {
  test('page loads successfully', async ({ page }) => {
    const response = await page.goto('/how-it-works.html');
    await page.waitForLoadState('domcontentloaded');
    expect(response.status()).toBe(200);
  });
});

test.describe('Signup Member Page (onboarding-member.html)', () => {
  test('signup-member.html redirects to onboarding-member.html', async ({ page }) => {
    await page.goto('/signup-member.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForURL('**/onboarding-member.html**', { timeout: 5000 });
    expect(page.url()).toContain('onboarding-member.html');
  });

  test('page loads with onboarding form (#onboarding)', async ({ page }) => {
    await page.goto('/onboarding-member.html');
    await page.waitForLoadState('domcontentloaded');
    const form = page.locator('#onboarding');
    await expect(form).toBeAttached();
  });

  test('has name input (#input-name) and steps container', async ({ page }) => {
    await page.goto('/onboarding-member.html');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#input-name')).toBeAttached();
    await expect(page.locator('#steps-container')).toBeAttached();
  });

  test('has progress bar (.progress-bar)', async ({ page }) => {
    await page.goto('/onboarding-member.html');
    await page.waitForLoadState('domcontentloaded');
    const progressBar = page.locator('.progress-bar');
    await expect(progressBar).toBeAttached();
  });

  test('has login link for existing users', async ({ page }) => {
    await page.goto('/onboarding-member.html');
    await page.waitForLoadState('domcontentloaded');
    const loginLink = page.locator('.login-link a, a[href*="login"]');
    await expect(loginLink.first()).toBeAttached();
  });
});

test.describe('Signup Provider Page (signup-provider.html)', () => {
  test('page loads with step indicators (.step-dot)', async ({ page }) => {
    await page.goto('/signup-provider.html');
    await page.waitForLoadState('domcontentloaded');
    const stepDots = page.locator('.step-dot');
    const count = await stepDots.count();
    expect(count).toBeGreaterThan(0);
  });

  test('has multi-step form with step 1 active (#step-1)', async ({ page }) => {
    await page.goto('/signup-provider.html');
    await page.waitForLoadState('domcontentloaded');
    const step1 = page.locator('#step-1');
    await expect(step1).toBeAttached();
    await expect(step1).toHaveClass(/active/);
  });

  test('shows benefits section (#benefits-section)', async ({ page }) => {
    await page.goto('/signup-provider.html');
    await page.waitForLoadState('domcontentloaded');
    const benefits = page.locator('#benefits-section');
    await expect(benefits).toBeAttached();
  });

  test('has 6 step dots', async ({ page }) => {
    await page.goto('/signup-provider.html');
    await page.waitForLoadState('domcontentloaded');
    const stepDots = page.locator('.step-dot');
    await expect(stepDots).toHaveCount(6);
  });
});

test.describe('Referral Page', () => {
  test('/founding-provider-chris-agrapidis.html loads successfully', async ({ page }) => {
    const response = await page.goto('/founding-provider-chris-agrapidis.html');
    await page.waitForLoadState('domcontentloaded');
    expect(response.status()).toBe(200);
  });
});

test.describe('Split Pay Page (split-pay.html)', () => {
  test('page loads with title "Split Payment – My Car Concierge"', async ({ page }) => {
    await page.goto('/split-pay.html');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveTitle('Split Payment – My Car Concierge');
  });

  test('has Stripe script loaded', async ({ page }) => {
    await page.goto('/split-pay.html');
    await page.waitForLoadState('domcontentloaded');
    const stripeScript = page.locator('script[src*="js.stripe.com"]');
    await expect(stripeScript).toBeAttached();
  });

  test('has container element (.container)', async ({ page }) => {
    await page.goto('/split-pay.html');
    await page.waitForLoadState('domcontentloaded');
    const container = page.locator('.container');
    await expect(container).toBeAttached();
  });
});

test.describe('Forgot Password (forgot-password.html)', () => {
  test('page loads successfully', async ({ page }) => {
    const response = await page.goto('/forgot-password.html');
    await page.waitForLoadState('domcontentloaded');
    expect(response.status()).toBe(200);
  });
});

test.describe('Trust & Safety (trust-safety.html)', () => {
  test('page loads successfully', async ({ page }) => {
    const response = await page.goto('/trust-safety.html');
    await page.waitForLoadState('domcontentloaded');
    expect(response.status()).toBe(200);
  });
});
