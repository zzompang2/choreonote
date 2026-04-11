import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/ChoreoNote/' : '/',
  build: {
    outDir: 'dist',
  },
}));
