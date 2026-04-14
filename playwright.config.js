const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testMatch:     ['**/tests/frontend.spec.js'],
  timeout:       15000,
  retries:       1,
  workers:       4,
  fullyParallel: true,

  use: {
    baseURL:    'http://localhost:3000',
    headless:   false,
    slowMo:     100,
    screenshot: 'only-on-failure',
    video:      'on-first-retry',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  outputDir: 'tests/results/',
});
