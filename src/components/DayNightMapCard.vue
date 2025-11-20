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
  /* +2rem respecto al resto para igualar su “altura visible” */
  min-height: calc(var(--home-bottom-media-height) + 2rem);
}

.home__tile-visual--map :deep(.tad-map) {
  /* asegúrate que el contenedor interno acompañe el mayor alto */
  min-height: calc(var(--home-bottom-media-height) + 2rem);
}

.home__tile-visual--map :deep(.tad-card) {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  width: 100%;
  height: 100%;
  margin-inline: 0;
}
</style>
