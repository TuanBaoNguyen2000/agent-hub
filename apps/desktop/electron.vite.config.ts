import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

// Only `dependencies` stay external; workspace packages are bundled from source.
export default defineConfig({
  main: {
    // mcp.js is the MCP server, run by the app binary in Node mode (SPIKE-10).
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts'), mcp: resolve(__dirname, 'src/mcp/index.ts') },
      },
    },
  },
  preload: {},
  renderer: {
    plugins: [react()],
  },
});
