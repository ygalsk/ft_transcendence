// vite.config.ts
import { defineConfig } from 'vite'
// import { resolve } from 'path'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main:       './index.html',
        pong:       './pong.html',
        leaderboard: './leaderboard.html',
        tournament: './tournament.html',
        pongArena: './pong_arena.html',
        pong3d: './pong-3d.html',
        pongClient: './pong-client.html',
        privacy: './privacy.html',
        terms: './terms.html'
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
