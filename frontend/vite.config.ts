import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/v1': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // 提升 chunk 警告阈值（拆分后单 chunk 普遍 < 200KB，但 vendor 可能 ~250KB）
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // vite 8 用 rolldown，manualChunks 只接受函数形式
        // 把第三方大依赖拆到独立 vendor chunk，业务代码改动不会让它们重新下载
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (/[\\/]node_modules[\\/](react|react-dom|react-router-dom|scheduler)[\\/]/.test(id)) return 'vendor-react'
          if (/[\\/]node_modules[\\/]recharts[\\/]/.test(id))        return 'vendor-charts'
          if (/[\\/]node_modules[\\/]d3-/.test(id))                  return 'vendor-charts' // recharts 依赖
          if (/[\\/]node_modules[\\/]qrcode\.react[\\/]/.test(id))   return 'vendor-qrcode'
          if (/[\\/]node_modules[\\/]qrcode[\\/]/.test(id))          return 'vendor-qrcode'
          if (/[\\/]node_modules[\\/]lucide-react[\\/]/.test(id))    return 'vendor-icons'
          if (/[\\/]node_modules[\\/]react-hot-toast[\\/]/.test(id)) return 'vendor-toast'
          if (/[\\/]node_modules[\\/]axios[\\/]/.test(id))           return 'vendor-axios'
          return 'vendor-misc' // 兜底：其它小依赖统一打一个包
        },
      },
    },
  },
})
