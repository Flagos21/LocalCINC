<template>
  <section class="magneto">
    <header class="magneto__header">
      <div>
        <h2>Magnetómetros — InfluxDB</h2>
        <p>Explora las series temporales servidas desde la base de datos InfluxDB local.</p>
      </div>
    </header>

    <div class="magneto__content">
      <MagnetometerChartFigure />
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
  gap: 1.5rem;
  flex: 1;
  min-height: 0;
}

.magneto__header h2 {
  font-size: 1.75rem;
  font-weight: 600;
  color: #1f2933;
}

.magneto__header p {
  color: #52606d;
  margin-top: 0.25rem;
}

.magneto__content {
  flex: 1;
  min-height: 0;
  padding: 1.25rem;
  background: #ffffff;
  border-radius: 0.75rem;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08), 0 4px 12px rgba(15, 23, 42, 0.06);
}
</style>
