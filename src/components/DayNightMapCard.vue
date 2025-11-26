<template>
  <article class="home__tile home__tile--map home-map">
    <header class="home__tile-head">
      <div>
        <h3>Mapa día/noche</h3>
        <p>Observa el terminador solar y penumbras actualizadas cada minuto.</p>
      </div>
    </header>

    <div class="home__tile-visual home__tile-visual--map">
      <DayNightMap
        mode="map"
        height="100%"
        :autoRefreshMs="60000"
        :showTwilight="true"
        :showSunMoon="true"
        :showAnimationControl="false"
        :focusBounds="[[ -55, -82 ], [ 15, -35 ]]"
        :focusMaxZoom="5"
      />
    </div>
  </article>
</template>

<script setup>
import DayNightMap from '@/components/DayNightMap.vue'
</script>

<style scoped>
.home__tile-visual--map {
  /* MISMA altura que el resto de medios inferiores */
  min-height: var(--home-bottom-media-height);
  display: flex;
  align-items: stretch;
}

/* El contenedor del mapa debe heredar la misma altura */
.home__tile-visual--map :deep(.tad-map) {
  flex: 1 1 auto;
  min-height: var(--home-bottom-media-height);
}

/* La card interna del widget ocupa todo el alto / ancho */
.home__tile-visual--map :deep(.tad-card) {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  width: 100%;
  height: 100%;
  margin-inline: 0;
}

/* Título y subtítulo en negro (ya lo aplicamos antes) */
.home__tile--map h3,
.home__tile--map p {
  color: #0f172a !important;
}
</style>

