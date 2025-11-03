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
      path: '/magnetometros/influxdb',
      name: 'magnetometers-influxdb',
      component: () => import('../views/MagnetometerInfluxView.vue'),
    },
    {
      path: '/magnetometros/local',
      name: 'magnetometers-local',
      component: () => import('../views/MagnetometerLocalView.vue'),
    },
    {
      path: '/campo-electrico',
      name: 'electric-field',
      component: () => import('../views/ElectricFieldView.vue'),
    },
    {
      path: '/mapa-dia-noche',
      name: 'day-night-map',
      component: () => import('../views/DayNightMapView.vue'),
    },
    {
      path: '/graphs',
      redirect: { name: 'magnetometers-influxdb' },
    },
    {
      path: '/magnetometros',
      redirect: { name: 'magnetometers-influxdb' },
    },
  ],
})

export default router
