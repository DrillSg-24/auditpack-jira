import { defineConfig } from 'vite';

// Relative base path is required so static assets resolve inside Atlassian Forge Custom UI.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
