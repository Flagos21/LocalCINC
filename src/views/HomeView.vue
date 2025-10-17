<script setup>
import { computed, ref } from 'vue';
import MagnetometerChartFigure from '@/components/MagnetometerChartFigure.vue';
import SunViewer from '@/components/SunViewer.vue';
import { useMagnetometerSeries } from '@/composables/useMagnetometerSeries';

const placeholders = [
  { title: 'Sección 3', description: 'Espacio reservado para un gráfico o imagen.' },
  { title: 'Sección 4', description: 'Espacio reservado para un gráfico o imagen.' }
];

const range = ref('7d');
const every = ref('1h');
const unit = ref('nT');

const { labels, series, isLoading, errorMessage } = useMagnetometerSeries({
  range,
  every,
  unit,
  station: 'CHI'
});

const hasData = computed(() => labels.value.length > 0 && series.value.length > 0);
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

      <article class="panel panel--chart">
        <div class="panel__head">
          <h3>Componente H (últimos 7 días)</h3>
          <p>Promedio horario de la estación CHI.</p>
        </div>
        <div class="panel__body" aria-live="polite">
          <div v-if="errorMessage" class="panel__state panel__state--error">
            <strong>Hubo un problema al cargar los datos.</strong>
            <p>{{ errorMessage }}</p>
          </div>
          <div v-else-if="isLoading" class="panel__state panel__state--loading">
            <span class="loader" aria-hidden="true" />
            <p>Cargando datos…</p>
          </div>
          <div v-else-if="!hasData" class="panel__state">
            <p>No hay datos disponibles para este periodo.</p>
          </div>
          <MagnetometerChartFigure v-else :labels="labels" :series="series" :unit="unit" />
        </div>
      </article>

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

.panel__body {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.panel__state {
  margin-top: auto;
  margin-bottom: auto;
  display: grid;
  place-items: center;
  text-align: center;
  gap: 0.5rem;
  color: #52606d;
  padding: 2rem 1rem;
  border: 1px dashed #d3dae6;
  border-radius: 0.75rem;
}

.panel__state--error {
  color: #b42318;
  border-color: rgba(180, 35, 24, 0.35);
  background: rgba(180, 35, 24, 0.06);
}

.panel__state--loading {
  color: #1f2933;
}

.loader {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  border: 3px solid rgba(37, 99, 235, 0.2);
  border-top-color: #2563eb;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.panel--tall {
  min-height: 420px;
}

.panel--chart {
  min-height: 420px;
}
</style>
