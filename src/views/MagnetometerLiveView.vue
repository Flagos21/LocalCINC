<template>
  <section class="magneto-live">
    <header class="magneto-live__header">
      <div>
        <p class="magneto-live__eyebrow">Monitoreo en vivo</p>
        <h2>Magnetómetro — Tiempo real</h2>
        <p class="magneto-live__lede">
          Observa el streaming de la componente H con actualizaciones automáticas cada minuto.
        </p>
      </div>
    </header>

    <div class="magneto-live__card">
      <MagnetometerLiveHomeCard />
    </div>
  </section>
</template>

<script setup>
import MagnetometerLiveHomeCard from '@/components/MagnetometerLiveHomeCard.vue'
</script>

<style scoped>
.magneto-live {
  display: flex;
  flex-direction: column;
  gap: 1.35rem;
  flex: 1;
  min-height: 0;
  width: min(100%, 72rem);
  margin: 0 auto;
}

.magneto-live__header h2 {
  font-size: clamp(1.75rem, 2vw + 1rem, 2rem);
  font-weight: 700;
  color: #0f172a;
  margin: 0.1rem 0 0.35rem;
}

.magneto-live__eyebrow {
  margin: 0;
  font-size: 0.9rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #b45309;
  font-weight: 700;
}

.magneto-live__lede {
  color: #475569;
  margin: 0;
  max-width: 58ch;
}

.magneto-live__card {
  background: #ffffff;
  border-radius: 0.85rem;
  border: 1px solid #e2e8f0;
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.08);
  padding: 1.1rem;
}
</style>
