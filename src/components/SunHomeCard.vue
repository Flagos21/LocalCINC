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
.home__tile-visual--sun { min-height: var(--home-bottom-media-height); }
</style>
