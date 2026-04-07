const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const FAKE_MEMBER_ID = '00000000-aaaa-bbbb-cccc-000000000010';
const FAKE_MEMBER_EMAIL = 'member-settings@example.com';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

const membersHtmlContent = fs.readFileSync(path.join(__dirname, '..', 'www', 'members.html'), 'utf8');
const membersSettingsContent = fs.readFileSync(path.join(__dirname, '..', 'www', 'members-settings.js'), 'utf8');
const membersJsContent = fs.readFileSync(path.join(__dirname, '..', 'www', 'members.js'), 'utf8');
const membersCoreContent = fs.readFileSync(path.join(__dirname, '..', 'www', 'members-core.js'), 'utf8');
const i18nContent = fs.readFileSync(path.join(__dirname, '..', 'www', 'i18n.js'), 'utf8');
const serverContent = fs.readFileSync(path.join(__dirname, '..', 'www', 'server.js'), 'utf8');

test.describe('Member Settings Module', () => {

  test.describe('Settings Save Validation', () => {

    test('Settings page loads with profile fields (name, phone, zip, city, state)', async () => {
      expect(membersHtmlContent).toContain('id="settings-name"');
      expect(membersHtmlContent).toContain('id="settings-phone"');
      expect(membersHtmlContent).toContain('id="settings-zip"');
      expect(membersHtmlContent).toContain('id="settings-city"');
      expect(membersHtmlContent).toContain('id="settings-state"');
    });

    test('ZIP code is required for saving settings', async () => {
      expect(membersSettingsContent).toContain("if (!zipCode)");
      expect(membersSettingsContent).toContain("Please enter your ZIP code");
    });

    test('Phone number required when SMS is enabled', async () => {
      expect(membersSettingsContent).toContain("if (smsEnabled && !phone)");
      expect(membersSettingsContent).toContain("Please enter your phone number to enable SMS notifications");
    });

    test('SMS options toggle visibility (sms-options div shown/hidden)', async () => {
      expect(membersHtmlContent).toContain('id="sms-options"');
      expect(membersHtmlContent).toContain('id="sms-enabled"');
      expect(membersHtmlContent).toContain('onchange="toggleSmsOptions()"');
      expect(membersSettingsContent).toContain("function toggleSmsOptions()");
      expect(membersSettingsContent).toContain("'block' : 'none'");
    });

    test('Settings save updates profile display name and initials', async () => {
      expect(membersSettingsContent).toContain("document.getElementById('user-name').textContent = name");
      expect(membersSettingsContent).toContain("document.getElementById('user-avatar').textContent = initials");
      expect(membersSettingsContent).toContain("name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)");
    });
  });

  test.describe('Notification Preferences', () => {

    test('Notification preferences API endpoint exists (GET)', async ({ request }) => {
      const res = await request.get(`${BASE_URL}/api/member/${FAKE_MEMBER_ID}/notification-preferences`);
      expect(res.status()).not.toBe(404);
    });

    test('Notification preferences can be saved (PUT)', async ({ request }) => {
      const res = await request.put(`${BASE_URL}/api/member/${FAKE_MEMBER_ID}/notification-preferences`, {
        data: {
          follow_up_emails: true,
          follow_up_sms: true,
          maintenance_reminder_emails: true,
          maintenance_reminder_sms: false,
          urgent_update_emails: true,
          urgent_update_sms: false,
          marketing_emails: false,
          marketing_sms: false
        }
      });
      expect(res.status()).not.toBe(404);
    });

    test('All 8 notification toggle types exist in HTML', async () => {
      expect(membersHtmlContent).toContain('id="pref-followup-email"');
      expect(membersHtmlContent).toContain('id="pref-followup-sms"');
      expect(membersHtmlContent).toContain('id="pref-maintenance-email"');
      expect(membersHtmlContent).toContain('id="pref-maintenance-sms"');
      expect(membersHtmlContent).toContain('id="pref-urgent-email"');
      expect(membersHtmlContent).toContain('id="pref-urgent-sms"');
      expect(membersHtmlContent).toContain('id="pref-marketing-email"');
      expect(membersHtmlContent).toContain('id="pref-marketing-sms"');

      expect(membersSettingsContent).toContain('follow_up_emails');
      expect(membersSettingsContent).toContain('follow_up_sms');
      expect(membersSettingsContent).toContain('maintenance_reminder_emails');
      expect(membersSettingsContent).toContain('maintenance_reminder_sms');
      expect(membersSettingsContent).toContain('urgent_update_emails');
      expect(membersSettingsContent).toContain('urgent_update_sms');
      expect(membersSettingsContent).toContain('marketing_emails');
      expect(membersSettingsContent).toContain('marketing_sms');
    });

    test('Marketing notifications default to opt-out (checked = false by default)', async () => {
      const marketingEmailMatch = membersHtmlContent.match(/id="pref-marketing-email"[^>]*>/);
      expect(marketingEmailMatch).toBeTruthy();
      expect(marketingEmailMatch[0]).not.toContain('checked');

      const marketingSmsMatch = membersHtmlContent.match(/id="pref-marketing-sms"[^>]*>/);
      expect(marketingSmsMatch).toBeTruthy();
      expect(marketingSmsMatch[0]).not.toContain('checked');

      expect(membersSettingsContent).toContain('marketing_emails === true');
      expect(membersSettingsContent).toContain('marketing_sms === true');
    });

    test('Save status feedback UI elements exist', async () => {
      expect(membersHtmlContent).toContain('id="notif-save-status"');
      expect(membersSettingsContent).toContain("statusEl.textContent = 'Saving...'");
      expect(membersSettingsContent).toContain("statusEl.textContent = '✓ Saved'");
      expect(membersSettingsContent).toContain("statusEl.textContent = '✗ Failed'");
    });
  });

  test.describe('Push Notifications', () => {

    test('Push notification UI elements exist in HTML', async () => {
      expect(membersHtmlContent).toContain('id="push-not-supported"');
      expect(membersHtmlContent).toContain('id="push-content"');
      expect(membersHtmlContent).toContain('id="push-enable-section"');
      expect(membersHtmlContent).toContain('id="push-enabled-section"');
      expect(membersHtmlContent).toContain('id="push-status-icon"');
      expect(membersHtmlContent).toContain('id="push-status-text"');
      expect(membersHtmlContent).toContain('id="push-status-badge"');
    });

    test('Push notification preference toggles exist', async () => {
      expect(membersHtmlContent).toContain('id="push-bid-alerts"');
      expect(membersHtmlContent).toContain('id="push-vehicle-status"');
      expect(membersHtmlContent).toContain('id="push-dream-car"');
      expect(membersHtmlContent).toContain('id="push-maintenance"');
    });

    test('VAPID key endpoint exists (GET /api/push/vapid-key)', async ({ request }) => {
      const res = await request.get(`${BASE_URL}/api/push/vapid-key`);
      expect(res.status()).not.toBe(404);
    });

    test('Push subscribe/unsubscribe endpoints exist', async ({ request }) => {
      const subscribRes = await request.post(`${BASE_URL}/api/push/subscribe`, {
        data: { subscription: {} },
        headers: { 'Content-Type': 'application/json' }
      });
      expect(subscribRes.status()).not.toBe(404);

      const unsubRes = await request.post(`${BASE_URL}/api/push/unsubscribe`, {
        data: {},
        headers: { 'Content-Type': 'application/json' }
      });
      expect(unsubRes.status()).not.toBe(404);
    });
  });

  test.describe('Two-Factor Authentication (2FA)', () => {

    test('2FA status endpoint exists (GET /api/2fa/status)', async ({ request }) => {
      const res = await request.get(`${BASE_URL}/api/2fa/status`);
      expect(res.status()).not.toBe(404);
    });

    test('2FA UI shows enabled/disabled states with proper icons and badges', async () => {
      expect(membersHtmlContent).toContain('id="2fa-status-icon"');
      expect(membersHtmlContent).toContain('id="2fa-status-text"');
      expect(membersHtmlContent).toContain('id="2fa-status-desc"');
      expect(membersHtmlContent).toContain('id="2fa-status-badge"');
      expect(membersHtmlContent).toContain('id="2fa-enable-section"');
      expect(membersHtmlContent).toContain('id="2fa-disable-section"');

      expect(membersSettingsContent).toContain("statusIcon.textContent = '🔒'");
      expect(membersSettingsContent).toContain("statusIcon.textContent = '🔓'");
      expect(membersSettingsContent).toContain("statusBadge.textContent = 'Enabled'");
      expect(membersSettingsContent).toContain("statusBadge.textContent = 'Disabled'");
    });

    test('Phone input formatter strips non-digits and formats as (XXX) XXX-XXXX', async () => {
      expect(membersSettingsContent).toContain('function format2FAPhoneInput(input)');
      expect(membersSettingsContent).toContain("input.value.replace(/\\D/g, '')");
      expect(membersSettingsContent).toContain('value.slice(0, 3)');
      expect(membersSettingsContent).toContain('value.slice(3, 6)');
      expect(membersSettingsContent).toContain('value.slice(6)');
      expect(membersHtmlContent).toContain('oninput="format2FAPhoneInput(this)"');
    });

    test('6-digit verification code input UI with individual digit fields', async () => {
      for (let i = 1; i <= 6; i++) {
        expect(membersHtmlContent).toContain(`id="2fa-digit-${i}"`);
        expect(membersHtmlContent).toContain(`handle2FADigitInput(this, ${i})`);
        expect(membersHtmlContent).toContain(`handle2FAKeydown(event, ${i})`);
      }
      expect(membersHtmlContent).toContain('id="2fa-verify-modal"');
      expect(membersHtmlContent).toContain('id="2fa-verify-btn"');
      expect(membersHtmlContent).toContain('id="2fa-verify-error"');
    });

    test('2FA send-code endpoint exists (POST /api/2fa/send-code)', async ({ request }) => {
      const res = await request.post(`${BASE_URL}/api/2fa/send-code`, {
        data: { phone: '5551234567' },
        headers: { 'Content-Type': 'application/json' }
      });
      expect(res.status()).not.toBe(404);
    });

    test('2FA verify endpoint exists (POST /api/2fa/verify-code)', async ({ request }) => {
      const res = await request.post(`${BASE_URL}/api/2fa/verify-code`, {
        data: { code: '123456' },
        headers: { 'Content-Type': 'application/json' }
      });
      expect(res.status()).not.toBe(404);
    });

    test('2FA disable endpoint exists (POST /api/2fa/disable)', async ({ request }) => {
      const res = await request.post(`${BASE_URL}/api/2fa/disable`, {
        data: {},
        headers: { 'Content-Type': 'application/json' }
      });
      expect(res.status()).not.toBe(404);
    });
  });

  test.describe('Login Activity', () => {

    test('Login activity endpoint exists (GET /api/member/:id/login-activity)', async ({ request }) => {
      const res = await request.get(`${BASE_URL}/api/member/${FAKE_MEMBER_ID}/login-activity`);
      expect(res.status()).not.toBe(404);
    });

    test('Login activity section exists in members.html', async () => {
      expect(membersHtmlContent).toContain('id="login-activity-loading"');
      expect(membersHtmlContent).toContain('id="login-activity-content"');
      expect(membersHtmlContent).toContain('id="login-activity-empty"');
      expect(membersHtmlContent).toContain('id="login-activity-alert"');
      expect(membersHtmlContent).toContain('id="login-activity-table"');
      expect(membersHtmlContent).toContain('id="login-activity-tbody"');
    });

    test('Login activity renders device info, IP, and timestamp', async () => {
      expect(membersSettingsContent).toContain('activity.device_type');
      expect(membersSettingsContent).toContain('activity.ip_address');
      expect(membersSettingsContent).toContain('activity.login_at');
      expect(membersSettingsContent).toContain('activity.browser');
      expect(membersSettingsContent).toContain('activity.os');
      expect(membersSettingsContent).toContain('maskIpAddress');
      expect(membersSettingsContent).toContain('function renderLoginActivityTable()');
    });
  });

  test.describe('Account Deletion', () => {

    test('Account deletion UI elements exist in HTML', async () => {
      expect(membersHtmlContent).toContain('id="delete-account-modal"');
      expect(membersHtmlContent).toContain('id="confirm-delete-btn"');
      expect(membersHtmlContent).toContain('Delete My Account');
    });

    test('Account deletion requires confirmation text input', async () => {
      expect(membersHtmlContent).toContain('id="delete-confirm-input"');
      expect(membersHtmlContent).toContain('placeholder="DELETE"');
      expect(membersCoreContent).toContain('confirmDeleteAccount');
      expect(membersCoreContent).toContain("delete-confirm-input");
    });

    test('Account deletion endpoint exists (POST /api/account/delete)', async ({ request }) => {
      const res = await request.post(`${BASE_URL}/api/account/delete`, {
        data: {},
        headers: { 'Content-Type': 'application/json' }
      });
      expect(res.status()).not.toBe(404);
    });
  });

  test.describe('Theme & Language Preferences', () => {

    test('Theme toggle exists in HTML (data-theme attribute support)', async () => {
      expect(membersHtmlContent).toContain('data-theme=');
      expect(membersHtmlContent).toContain('id="theme-toggle-btn"');
      expect(membersHtmlContent).toContain('onclick="toggleTheme()"');
    });

    test('Language selector exists with supported languages', async () => {
      expect(membersHtmlContent).toContain('id="language-switcher"');
      expect(i18nContent).toContain('SUPPORTED_LANGUAGES');
      expect(i18nContent).toContain('createLanguageSwitcher');
      expect(i18nContent).toContain('setLanguage');
    });

    test('Source code contains theme toggle and language functions', async () => {
      expect(membersJsContent).toContain('function toggleTheme()');
      expect(membersJsContent).toContain("getAttribute('data-theme')");
      expect(membersJsContent).toContain("setAttribute('data-theme'");
      expect(i18nContent).toContain('async function setLanguage(lang)');
      expect(i18nContent).toContain('languageChanged');
    });
  });
});
