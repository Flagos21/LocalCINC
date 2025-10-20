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
      path: '/graphs',
      name: 'graphs',
      component: () => import('../views/GraphsView.vue'),
    },
    {
      path: '/ionograms',
      name: 'ionograms',
      component: () => import('../views/IonogramGalleryView.vue'),
    },
  ],
})

export default router
