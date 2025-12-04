<template>
  <section class="magneto">
    <header class="magneto__header">
      <div>
        <h2>Magnetómetros — InfluxDB</h2>
        <p>Explora las series temporales servidas desde la base de datos InfluxDB local.</p>
      </div>
    </header>

    <div class="magneto__card">
      <div class="magneto__content">
        <MagnetometerChartFigure />
      </div>
    </div>
  </section>
</template>

<script setup>
import MagnetometerChartFigure from '@/components/MagnetometerChartFigure.vue'
</script>

<style scoped>
.magneto {
  display: flex;
  flex-direction: column;
  gap: 1.35rem;
  flex: 1;
  min-height: 0;
  width: min(100%, 72rem);
  margin: 0 auto;
}

.magneto__header h2 {
  font-size: 1.75rem;
  font-weight: 600;
  color: #0f172a;
}

.magneto__header p {
  color: #475569;
  margin-top: 0.25rem;
  max-width: 48ch;
}

.magneto__card {
  background: #ffffff;
  border-radius: 0.85rem;
  border: 1px solid #e2e8f0;
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.08);
  padding: 1.1rem;
}

.magneto__content {
  flex: 1;
  min-height: 0;
  padding: 0.5rem;
  background: #f8fafc;
  border-radius: 0.75rem;
  border: 1px solid #e2e8f0;
}
</style>
