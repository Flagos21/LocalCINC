import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/sol',
      name: 'sun',
      component: () => import('../views/SunView.vue'),
    },
    {
      path: '/rayos-x',
      name: 'xray',
      component: () => import('../views/XRayView.vue'),
    },
    {
      path: '/ionograms',
      name: 'ionograms',
      component: () => import('../views/IonogramGalleryView.vue'),
    },
    {
      path: '/magnetometros/tiempo-real',
      name: 'magnetometers-live',
      component: () => import('../views/MagnetometerLiveView.vue'),
    },
    {
      path: '/mapa-dia-noche',
      name: 'day-night-map',
      component: () => import('../views/DayNightMapView.vue'),
    },
    {
      path: '/graphs',
      redirect: { name: 'magnetometers-live' },
    },
    {
      path: '/magnetometros',
      redirect: { name: 'magnetometers-live' },
    },
    {
      path: '/efm-live',
      name: 'efm-live',
      component: () => import('../views/ElectricFieldLiveView.vue'),
    },
    {
      path: '/campo-electrico',
      redirect: { name: 'efm-live' },
    },
  ],
})

export default router
