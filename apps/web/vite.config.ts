import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 前端只与 BFF 通信；模型密钥永不下发浏览器（技术说明 §2.2 / §10.1 红线）
export default defineConfig({
  plugins: [react()],
  server: {
    // 监听所有网卡：方便用手机（iOS Safari / Android Chrome / 微信）在同一局域网访问做三端走查
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
      '/samples': { target: 'http://127.0.0.1:8787', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
