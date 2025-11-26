<template>
  <article class="home__tile home__tile--sun home-sun">
    <header class="home__tile-head">
      <div>
        <h3>El Sol (SUVI)</h3>
        <p>Vista en tiempo (casi) real del Sol por longitudes de onda EUV.</p>
      </div>
    </header>

    <div class="home__tile-visual home__tile-visual--sun">
      <SunViewer />
    </div>
  </article>
</template>

<script setup>
import SunViewer from '@/components/SunViewer.vue'
</script>

<style scoped>
.home__tile-visual--sun {
  min-height: var(--home-bottom-media-height);
  display: flex;
  align-items: stretch;
  justify-content: center;
}

/* El contenido interno del SunViewer debe ocupar todo el espacio */
.home__tile-visual--sun :deep(img),
.home__tile-visual--sun :deep(canvas),
.home__tile-visual--sun :deep(video) {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* Título y subtítulo en negro (ya lo tenías en el otro mensaje) */
.home__tile--sun h3,
.home__tile--sun p {
  color: #0f172a !important;
}
</style>

