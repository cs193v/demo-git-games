// Shared setup for the end-to-end tests. It provides a `page` that fails the test if the
// game logs an error, throws, or can't load one of its files.
const path = require('path');
const { pathToFileURL } = require('url');
const base = require('@playwright/test');

const GAME_URL = pathToFileURL(path.join(__dirname, '..', '..', 'index.html')).href;

const test = base.test.extend({
  page: async ({ page }, use) => {
    const problems = [];
    page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(`console error: ${message.text()}`);
    });
    page.on('requestfailed', (request) => problems.push(`failed to load: ${request.url()}`));
    await use(page);
    base.expect(problems, 'the game should run without errors').toEqual([]);
  },
});

module.exports = { test, expect: base.expect, GAME_URL };
