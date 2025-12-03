import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import legacy from '@vitejs/plugin-legacy'

// Configuración de Vite para tu proyecto LocalCINC
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    legacy({
      // Target amplio para que el navegador de la TV no muera
      targets: ['defaults', 'not IE 11'],
      // Necesario para async/await y generadores en navegadores viejos
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
      // Estas opciones ayudan a que convivan bundle moderno + legacy
      renderLegacyChunks: true,
      modernPolyfills: true,
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',      // 👈 clave para que escuche en todas las interfaces
    port: 5173,           // puedes cambiarlo si quieres, pero así está estándar
    proxy: {
      // 🔁 Todo lo que empiece con /api será redirigido a tu backend Express
      '/api': {
        target: 'http://localhost:3001', // el puerto donde corre tu API (en tu PC)
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    // 👇 bajar un poco el target para que el bundle legacy sea amigable
    target: 'es2015',
  },
})
