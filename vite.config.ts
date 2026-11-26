import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  base: './',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // EE_NO_HMR=1: a second dev server for test harnesses, so edits elsewhere do not reload their tabs
  server: { port: 5173, hmr: process.env.EE_NO_HMR ? false : undefined },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as any);
