import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/my_football_legend/',
  publicDir: '.generated-public',
  plugins: [react()],
});
