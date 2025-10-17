import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// Configuración de Vite para tu proyecto LocalCINC
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  server: {
    proxy: {
      // 🔁 Todo lo que empiece con /api será redirigido a tu backend Express
      '/api': {
        target: 'http://localhost:3001', // el puerto donde corre tu API
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
