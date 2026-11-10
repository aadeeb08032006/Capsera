import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api/v1': {
        target: process.env.VITE_DEV_PROXY_TARGET || 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});

