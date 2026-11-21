import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// GitHub Pages 주소: https://hotel-museo.github.io/room-service-v2-cloude/
export default defineConfig({
  base: '/room-service-v2-cloude/',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        guest: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin/index.html'),
      },
    },
  },
});
