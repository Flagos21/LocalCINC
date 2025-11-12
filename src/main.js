import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'

if (typeof window !== 'undefined') {
  window.Apex = window.Apex || {}
  window.Apex.chart = { ...(window.Apex.chart || {}), useUTC: true }
}

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
