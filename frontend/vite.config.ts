import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    host: '0.0.0.0',  // Important for Docker!
    port: 5173,
    strictPort: true,
    allowedHosts: [
      'localhost',
      'transcendence.keystone-gateway.dev'
    ]
  }
})