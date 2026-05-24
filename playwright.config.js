const { defineConfig } = require('@playwright/test');

// Replit's nix-built chromium lives at a fixed store path. On other
// environments (CI / GitHub Actions / fresh laptops) the binary won't
// exist there, so allow an env override and fall back to Playwright's
// own bundled chromium (`executablePath: undefined`) when the nix path
// is missing. CI sets `PLAYWRIGHT_SKIP_NIX_CHROMIUM=1` to force the
// bundled binary that `npx playwright install chromium` provides.
const fs = require('fs');
const NIX_CHROMIUM_PATH = '/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium';
const overridePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const skipNix = process.env.PLAYWRIGHT_SKIP_NIX_CHROMIUM === '1';
const chromiumPath = overridePath
  || (!skipNix && fs.existsSync(NIX_CHROMIUM_PATH) ? NIX_CHROMIUM_PATH : undefined);

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60000,
  expect: {
    timeout: 10000
  },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'test-results/html' }]],
  use: {
    baseURL: 'http://localhost:5000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        launchOptions: {
          executablePath: chromiumPath,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
        }
      },
    },
  ],
  webServer: {
    command: 'cd www && node server.js',
    port: 5000,
    reuseExistingServer: true,
    timeout: 30000,
  },
});
