import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5151,
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5150',
        changeOrigin: true,
        timeout: 1200000,        // 20分钟
        proxyTimeout: 1200000     // 20分钟，避免大采集被代理层提前断开
      }
    }
  }
})
