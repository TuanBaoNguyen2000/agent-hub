import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'apps/desktop/tests/e2e',
  testMatch: '**/*.e2e.ts',
  // Each test starts its own Electron app with its own data folder.
  workers: 1,
  timeout: 60_000,
  reporter: 'list',
});
