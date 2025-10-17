<template>
  <section class="graphs">
    <header class="graphs__header">
      <div>
        <h2>Evolución magnética</h2>
        <p>Serie temporal de la componente H registrada por la estación CHI.</p>
      </div>
      <form class="graphs__controls" @submit.prevent>
        <label class="control">
          <span>Rango</span>
          <select v-model="range">
            <option v-for="option in rangeOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
        <label class="control">
          <span>Resolución</span>
          <select v-model="every">
            <option v-for="option in everyOptions" :key="option" :value="option">
              {{ option }}
            </option>
          </select>
        </label>
        <label class="control">
          <span>Unidad</span>
          <select v-model="unit">
            <option v-for="option in unitOptions" :key="option" :value="option">
              {{ option }}
            </option>
          </select>
        </label>
      </form>
    </header>

    <section class="graphs__body" aria-live="polite">
      <div v-if="errorMessage" class="state state--error">
        <strong>Hubo un problema al cargar los datos.</strong>
        <p>{{ errorMessage }}</p>
      </div>
      <div v-else-if="isLoading" class="state state--loading">
        <span class="loader" aria-hidden="true" />
        <p>Cargando datos…</p>
      </div>
      <div v-else-if="!hasData" class="state">
        <p>No hay datos disponibles para los filtros seleccionados.</p>
      </div>
      <MagnetometerChartFigure v-else :labels="labels" :series="seriesData" :unit="unit" />
    </section>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import MagnetometerChartFigure from '@/components/MagnetometerChartFigure.vue';
import { useMagnetometerSeries } from '@/composables/useMagnetometerSeries';

const rangeToEveryOptions = {
  '6h': ['1m', '5m'],
  '12h': ['2m', '5m', '10m'],
  '24h': ['1m', '5m', '15m'],
  '48h': ['5m', '15m', '30m'],
  '7d': ['15m', '30m', '1h'],
  all: ['1h', '6h', '12h', '1d']
};

const unitOptions = ['nT', 'pT'];

const range = ref('all');
const every = ref(rangeToEveryOptions[range.value][1]);
const unit = ref('nT');

const { labels, series: seriesData, isLoading, errorMessage } = useMagnetometerSeries({
  range,
  every,
  unit,
  station: 'CHI'
});

const rangeOptions = [
  { value: '6h', label: '6 h' },
  { value: '12h', label: '12 h' },
  { value: '24h', label: '24 h' },
  { value: '48h', label: '48 h' },
  { value: '7d', label: '7 días' },
  { value: 'all', label: 'Todo' }
];

const everyOptions = computed(() => rangeToEveryOptions[range.value] || ['1m']);

watch(range, () => {
  if (!everyOptions.value.includes(every.value)) {
    every.value = everyOptions.value[0];
  }
});

const hasData = computed(() => labels.value.length > 0 && seriesData.value.length > 0);
</script>

<style scoped>
.graphs {
  background: #ffffff;
  border-radius: 0.75rem;
  padding: 2rem;
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.graphs__header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 1.25rem;
}

.graphs__header h2 {
  font-size: 1.5rem;
  font-weight: 600;
  color: #1f2933;
  margin-bottom: 0.25rem;
}

.graphs__header p {
  color: #52606d;
  max-width: 32rem;
}

.graphs__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: flex-end;
}

.control {
  display: flex;
  flex-direction: column;
  font-size: 0.875rem;
  color: #52606d;
  gap: 0.35rem;
}

.control select {
  min-width: 7rem;
  border-radius: 0.5rem;
  border: 1px solid #d3dae6;
  padding: 0.45rem 0.75rem;
  font-size: 0.95rem;
  color: #1f2933;
  background: #f8fafc;
}

.graphs__body {
  min-height: 20rem;
}

.state {
  display: grid;
  place-items: center;
  text-align: center;
  gap: 0.5rem;
  color: #52606d;
  padding: 3rem 1rem;
  border: 1px dashed #d3dae6;
  border-radius: 0.75rem;
}

.state--error {
  color: #b42318;
  border-color: rgba(180, 35, 24, 0.35);
  background: rgba(180, 35, 24, 0.06);
}

.state--loading {
  color: #1f2933;
}

.loader {
  width: 2rem;
  height: 2rem;
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

@media (max-width: 768px) {
  .graphs {
    padding: 1.5rem;
  }

  .control select {
    min-width: 6rem;
  }
}
</style>
