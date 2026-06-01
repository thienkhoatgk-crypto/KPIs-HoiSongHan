import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // 🌟 Giúp sửa lỗi vỡ giao diện CSS dọc
  server: {
    allowedHosts: true, // 🌟 Giúp sửa lỗi Blocked Host tên miền .online
    port: 3000,
  },
});