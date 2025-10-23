<template>
  <section class="magneto-local">
    <header class="magneto-local__header">
      <div>
        <h2>Magnetómetros — Fuente local</h2>
        <p>
          Visualiza la componente H (nT) obtenida desde los archivos DataMin locales generados por
          el magnetómetro de Chillán.
        </p>
      </div>
    </header>

    <div class="magneto-local__content">
      <LocalMagnetometerChart />
    </div>
  </section>
</template>

<script setup>
import LocalMagnetometerChart from '@/components/LocalMagnetometerChart.vue'
</script>

<style scoped>
.magneto-local {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  flex: 1;
}

.magneto-local__header h2 {
  font-size: 1.75rem;
  font-weight: 600;
  color: #1f2933;
}

.magneto-local__header p {
  color: #52606d;
  margin-top: 0.25rem;
}

.magneto-local__content {
  flex: 1;
  min-height: 0;
}
</style>
