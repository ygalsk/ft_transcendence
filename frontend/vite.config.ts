// vite.config.ts
import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    rollupOptions: {
      input: {
        main:       resolve(__dirname, 'index.html'),
        pong:       resolve(__dirname, 'pong.html'),
        leaderboard:resolve(__dirname, 'leaderboard.html'),
        tournament: resolve(__dirname, 'tournament.html'),
      },
    },
  },
})
