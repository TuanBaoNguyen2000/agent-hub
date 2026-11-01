import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

// Only `dependencies` stay external; workspace packages are bundled from source.
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()],
  },
});
