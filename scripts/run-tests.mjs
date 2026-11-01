// Runs Vitest on Electron's own runtime, so tests load native modules the way the app does.
// Usage: node scripts/run-tests.mjs [vitest args]
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);
const electron = require('electron');
const vitest = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');

const result = spawnSync(electron, [vitest, 'run', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
});
process.exit(result.status ?? 1);
