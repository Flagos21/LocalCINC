<template>
  <section class="day-night">
    <header class="day-night__header">
      <div>
        <h2>Mapa día/noche</h2>
        <p>Explora el terminador solar, penumbras y posiciones actuales del Sol y la Luna.</p>
      </div>
    </header>

    <div class="day-night__card">
      <div class="day-night__surface">
        <div class="day-night__map" role="img" aria-label="Mapa interactivo de zonas de día y noche en la Tierra">
          <DayNightMap
            mode="map"
            height="100%"
            :autoRefreshMs="60000"
            :showTwilight="true"
            :showSunMoon="true"
          />
        </div>
      </div>
      <p class="day-night__footnote">La capa se actualiza automáticamente cada minuto.</p>
    </div>
  </section>
</template>

<script setup>
import DayNightMap from '@/components/DayNightMap.vue'
</script>

<style scoped>
.day-night {
  display: flex;
  flex-direction: column;
  gap: 1.35rem;
  flex: 1;
  min-height: 0;
  width: min(100%, 72rem);
  margin: 0 auto;
}

.day-night__header h2 {
  font-size: 1.75rem;
  font-weight: 600;
  color: #0f172a;
}

.day-night__header p {
  color: #475569;
  margin-top: 0.35rem;
  max-width: 45ch;
}

.day-night__card {
  background: #ffffff;
  border-radius: 0.85rem;
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.08);
  padding: 1.1rem;
  border: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.day-night__surface {
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  background: #f8fafc;
  padding: 0.35rem;
}

.day-night__map {
  width: 100%;
  height: clamp(20rem, 60vh, 32rem);
  border-radius: 0.65rem;
  overflow: hidden;
  background: radial-gradient(circle at center, rgba(15, 23, 42, 0.06), rgba(15, 23, 42, 0.16));
}

.day-night__footnote {
  color: #475569;
  font-size: 0.9rem;
}

@media (max-width: 640px) {
  .day-night__card {
    padding: 1rem;
  }

  .day-night__map {
    height: clamp(18rem, 55vh, 28rem);
  }
}
</style>
