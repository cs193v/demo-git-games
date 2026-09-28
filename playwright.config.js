// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  reporter: 'list',
  projects: [
    // Unit tests load the game's logic.js directly in Node. No browser needed.
    { name: 'unit', testDir: 'tests/unit' },
    // End-to-end tests open index.html in headless Chromium and play the game.
    { name: 'e2e', testDir: 'tests/e2e', use: { ...devices['Desktop Chrome'] } },
  ],
});
