// playwright.config.js
// Place this at the root of your project (same level as server.js)

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/frontend',
  testMatch: '**/*.spec.js',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  retries: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],

  use: {
    // The HTML files are served via file:// — no base URL needed
    headless: true,           // change to false for visual debugging
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
    // Allow local file access (needed for file:// URLs)
    contextOptions: {
      permissions: [],
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Uncomment to test on Firefox / WebKit too:
    // { name: 'firefox',  use: { ...devices['Desktop Firefox'] } },
    // { name: 'webkit',   use: { ...devices['Desktop Safari']  } },
  ],

  // If you ever add a dev server for the HTML files, configure it here:
  // webServer: {
  //   command: 'npx serve . -p 4000',
  //   port: 4000,
  //   reuseExistingServer: !process.env.CI,
  // },
});
