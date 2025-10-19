<script setup>
import SunViewer from '@/components/SunViewer.vue';
import MagnetometerChartOverview from '@/components/MagnetometerChartOverview.vue';

const placeholders = [
  { title: 'Sección 3', description: 'Espacio reservado para un gráfico o imagen.' },
  { title: 'Sección 4', description: 'Espacio reservado para un gráfico o imagen.' }
];
</script>

<template>
  <section class="home">
    <header class="home__header">
      <h2>Panel principal</h2>
      <p>Visualiza aquí los indicadores clave cuando estén disponibles.</p>
    </header>

    <div class="home__grid">
      <div class="home__item">
        <article class="panel panel--tall">
          <div class="panel__head">
            <h3>El Sol (SUVI)</h3>
            <p>Vista en tiempo (casi) real del Sol por longitudes de onda EUV.</p>
          </div>
          <SunViewer />
        </article>
      </div>

      <div class="home__item">
        <MagnetometerChartOverview class="home__magneto-card" />
      </div>

      <div v-for="section in placeholders" :key="section.title" class="home__item">
        <article class="panel">
          <h3>{{ section.title }}</h3>
          <p>{{ section.description }}</p>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.home__header h2 {
  font-size: 1.75rem;
  font-weight: 600;
  color: #1f2933;
}

.home__header p {
  color: #52606d;
}

.home__grid {
  display: grid;
  gap: 1.25rem;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  align-items: stretch;
}

@media (min-width: 1024px) {
  .home__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.home__item {
  display: flex;
}

.home__item > * {
  flex: 1 1 auto;
}

.panel {
  background: #ffffff;
  border-radius: 0.75rem;
  padding: 0.85rem 1.1rem;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  min-height: 200px;
}

.panel__head h3 {
  font-size: 1.1rem;
  font-weight: 600;
  color: #1f2933;
}

.panel__head p {
  color: #69707d;
  margin-bottom: 0.25rem;
}

.panel--tall {
  min-height: 360px;
}

.home__magneto-card :deep(.magneto__card) {
  height: 100%;
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.08);
}

.home__magneto-card :deep(.magneto__header) {
  padding: 1.1rem 1.3rem 0.9rem;
}

.home__magneto-card :deep(.magneto__body) {
  padding: 0 1.3rem 1.1rem;
}

.home__magneto-card :deep(.magneto__chart) {
  min-height: 220px;
}
</style>
