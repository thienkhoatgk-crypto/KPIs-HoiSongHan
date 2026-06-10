import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  server: {
    allowedHosts: ["kpissonghan.online", "kpissonghan.web.app", "kpissonghan--kpissonghan.asia-southeast1.hosted.app", "localhost", "127.0.0.1"],
    port: 3000,
    host: true
  },
  preview: {
    allowedHosts: ["kpissonghan.online", "kpissonghan.web.app", "kpissonghan--kpissonghan.asia-southeast1.hosted.app", "localhost", "127.0.0.1"],
    port: 3000,
    host: true
  }
});