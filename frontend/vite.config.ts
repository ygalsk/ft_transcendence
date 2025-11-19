import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Proxy API calls to backend gateway
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000'
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: '/index.html',
      }
    }
  }
})
