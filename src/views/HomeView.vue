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
      <article class="panel panel--tall">
        <div class="panel__head">
          <h3>El Sol (SUVI)</h3>
          <p>Vista en tiempo (casi) real del Sol por longitudes de onda EUV.</p>
        </div>
        <SunViewer />
      </article>

      <div class="home__magneto">
        <MagnetometerChartOverview />
      </div>

      <article v-for="section in placeholders" :key="section.title" class="panel">
        <h3>{{ section.title }}</h3>
        <p>{{ section.description }}</p>
      </article>
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
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}

.home__magneto {
  grid-column: 1 / -1;
}

.panel {
  background: #ffffff;
  border-radius: 0.75rem;
  padding: 1rem 1.25rem;
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 220px;
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
  min-height: 420px;
}
</style>
