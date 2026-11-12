import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // A tela é servida pelo Worker em /produtos/ (equipe) e /portal/diamante-business/ (aluna); os
  // arquivos ficam em /produtos/assets/ nos dois casos.
  base: '/produtos/',
  build: { outDir: 'dist/produtos', emptyOutDir: true },
  server: {
    port: 5173,
    // Em desenvolvimento, o Vite repassa /api para o `wrangler dev` (que já traz o D1 local).
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
})
