import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Package boundaries from docs/DEVELOPMENT.md and ADR-012. Each area lists the
// internal packages it may import; everything else under @agenthub/ is rejected.
const INTERNAL = ['application', 'contracts', 'desktop', 'domain', 'integrations', 'persistence', 'platform'];
const NODE_APIS = ['node:*', 'fs', 'fs/*', 'path', 'os', 'child_process', 'net', 'http', 'https'];
const SYSTEM_ACCESS = ['electron', 'better-sqlite3', ...NODE_APIS];

function boundary(files, { allowed, forbidden }) {
  const internal = INTERNAL.filter((name) => !allowed.includes(name)).map((name) => `@agenthub/${name}`);
  return {
    files,
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: [...internal, ...forbidden],
          message: 'Vi phạm package boundary, xem docs/DEVELOPMENT.md.',
        }],
      }],
    },
  };
}

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/out/**', '**/release/**', '**/dist/**', 'spikes/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  boundary(['packages/domain/**'], { allowed: [], forbidden: [...SYSTEM_ACCESS, 'react', 'react-dom'] }),
  boundary(['packages/contracts/**'], { allowed: [], forbidden: [...SYSTEM_ACCESS, 'react', 'react-dom'] }),
  boundary(['packages/application/**'], { allowed: ['domain'], forbidden: [...SYSTEM_ACCESS, 'react', 'react-dom'] }),
  boundary(['packages/persistence/src/**'], { allowed: ['application', 'domain'], forbidden: ['electron', 'react', 'react-dom'] }),
  boundary(['packages/integrations/**'], { allowed: ['application', 'domain'], forbidden: ['electron', 'better-sqlite3', 'react', 'react-dom'] }),
  boundary(['packages/platform/**'], { allowed: ['application', 'domain'], forbidden: ['electron', 'better-sqlite3', 'react', 'react-dom'] }),
  boundary(['apps/desktop/src/preload/**'], { allowed: ['contracts'], forbidden: ['better-sqlite3', 'react', 'react-dom', ...NODE_APIS] }),
  boundary(['apps/desktop/src/renderer/**'], { allowed: ['contracts'], forbidden: SYSTEM_ACCESS }),
);
