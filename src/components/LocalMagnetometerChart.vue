<template>
  <div class="local-magnetometer">
    <div class="local-magnetometer__controls">
      <div class="control">
        <label class="control__label" for="local-magnetometer-date">Fecha disponible</label>
        <select
          id="local-magnetometer-date"
          class="control__select"
          v-model="selectedDate"
          :disabled="isLoadingDays || availableDays.length === 0"
        >
          <option v-if="isLoadingDays" disabled value="">
            Cargando fechas…
          </option>
          <option v-else-if="availableDays.length === 0" disabled value="">
            Sin datos locales
          </option>
          <option
            v-for="day in availableDays"
            :key="day.date"
            :value="day.date"
          >
            {{ formatDateOption(day.date, day.filename) }}
          </option>
        </select>
      </div>
      <button
        class="control__button"
        type="button"
        :disabled="!selectedDate || isLoadingSeries"
        @click="refreshSeries"
      >
        Recargar
      </button>
    </div>

    <div class="local-magnetometer__status">
      <p v-if="errorMessage" class="status status--error">
        {{ errorMessage }}
      </p>
      <p v-else-if="isLoadingSeries" class="status">
        Cargando serie local…
      </p>
      <template v-else-if="seriesSummary">
        <p class="status">
          Archivo: <strong>{{ seriesSummary.filename }}</strong>
          · Puntos: <strong>{{ seriesSummary.points }}</strong>
        </p>
        <p v-if="seriesSummary.range" class="status">
          Cobertura: {{ formatRange(seriesSummary.range.start, seriesSummary.range.end) }}
        </p>
      </template>
      <p v-else class="status">
        Selecciona una fecha para visualizar la serie local.
      </p>
    </div>

    <div class="local-magnetometer__chart">
      <ApexChart
        height="460"
        type="line"
        :options="chartOptions"
        :series="chartSeries"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import dayjs from 'dayjs';
import VueApexCharts from 'vue3-apexcharts';

const ApexChart = VueApexCharts;

const availableDays = ref([]);
const isLoadingDays = ref(false);
const isLoadingSeries = ref(false);
const selectedDate = ref('');
const errorMessage = ref('');
const seriesPayload = ref({ labels: [], series: [], meta: null });
const station = ref('CHI');

const points = computed(() => {
  const labels = Array.isArray(seriesPayload.value.labels)
    ? seriesPayload.value.labels
    : [];
  const values = Array.isArray(seriesPayload.value.series?.[0]?.data)
    ? seriesPayload.value.series[0].data
    : [];

  const length = Math.min(labels.length, values.length);
  const items = [];

  for (let index = 0; index < length; index += 1) {
    const timestamp = Date.parse(labels[index]);
    const value = Number(values[index]);

    if (Number.isNaN(timestamp) || !Number.isFinite(value)) {
      continue;
    }

    items.push({
      x: timestamp,
      y: value,
    });
  }

  return items;
});

const timeDomain = computed(() => {
  if (!points.value.length) {
    return null;
  }

  const timestamps = points.value.map((item) => item.x);
  const min = Math.min(...timestamps);
  const max = Math.max(...timestamps);

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return null;
  }

  return { min, max };
});

const chartSeries = computed(() => [{
  name: 'H',
  data: points.value,
}]);

const chartOptions = computed(() => ({
  chart: {
    id: 'local-magnetometer-chart',
    animations: { enabled: true, easing: 'easeinout', speed: 200 },
    background: 'transparent',
    foreColor: '#0f172a',
    toolbar: {
      show: true,
      tools: {
        download: true,
        selection: true,
        zoom: true,
        zoomin: true,
        zoomout: true,
        pan: true,
        reset: true,
      },
    },
    zoom: { enabled: true, type: 'x' },
  },
  colors: ['#2563eb'],
  dataLabels: { enabled: false },
  markers: {
    size: 0,
    strokeWidth: 2,
    hover: { sizeOffset: 3 },
  },
  stroke: {
    width: 2,
    curve: 'straight',
    lineCap: 'round',
  },
  grid: {
    borderColor: '#e2e8f0',
    strokeDashArray: 4,
    padding: { left: 16, right: 16 },
  },
  xaxis: {
    type: 'datetime',
    min: timeDomain.value?.min,
    max: timeDomain.value?.max,
    labels: {
      datetimeUTC: true,
      style: { colors: '#475569' },
    },
    axisBorder: { color: '#cbd5f5' },
    axisTicks: { color: '#cbd5f5' },
    tooltip: { enabled: false },
  },
  yaxis: {
    title: { text: 'H (nT)' },
    labels: {
      formatter: (value) => (Number.isFinite(value) ? value.toFixed(1) : ''),
    },
    decimalsInFloat: 1,
    axisBorder: { show: false },
    tickAmount: 6,
  },
  tooltip: {
    theme: 'dark',
    shared: false,
    intersect: false,
    x: {
      formatter: (timestamp) => dayjs(timestamp).utc().format('YYYY-MM-DD HH:mm'),
    },
    y: {
      formatter: (value) => (Number.isFinite(value) ? `${value.toFixed(2)} nT` : '—'),
    },
  },
  legend: { show: false },
  noData: {
    text: isLoadingSeries.value
      ? 'Cargando datos locales…'
      : 'Sin datos disponibles',
    style: { color: '#64748b', fontSize: '14px' },
  },
}));

const seriesSummary = computed(() => {
  if (!seriesPayload.value?.meta) {
    return null;
  }

  const { meta } = seriesPayload.value;
  return {
    filename: meta.filename,
    points: meta.points,
    range: meta.range,
  };
});

function formatDateOption(date, filename) {
  const formatted = dayjs(date).isValid()
    ? dayjs(date).format('YYYY-MM-DD')
    : date;
  return `${formatted} · ${filename}`;
}

function formatRange(start, end) {
  const startLabel = dayjs(start).isValid()
    ? dayjs(start).utc().format('YYYY-MM-DD HH:mm')
    : start;
  const endLabel = dayjs(end).isValid()
    ? dayjs(end).utc().format('YYYY-MM-DD HH:mm')
    : end;

  return `${startLabel} → ${endLabel}`;
}

async function fetchAvailableDays() {
  isLoadingDays.value = true;
  errorMessage.value = '';

  try {
    const response = await fetch(`/api/local-magnetometer/days?station=${station.value}`);

    if (!response.ok) {
      throw new Error('No se pudieron obtener las fechas disponibles.');
    }

    const payload = await response.json();
    const days = Array.isArray(payload.days) ? payload.days : [];
    const sortedDays = [...days].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
    availableDays.value = sortedDays;

    if (availableDays.value.length > 0) {
      selectedDate.value = availableDays.value[availableDays.value.length - 1].date;
    } else {
      selectedDate.value = '';
      seriesPayload.value = { labels: [], series: [], meta: null };
    }
  } catch (error) {
    console.error('fetchAvailableDays error', error);
    errorMessage.value = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
    availableDays.value = [];
    selectedDate.value = '';
  } finally {
    isLoadingDays.value = false;
  }
}

async function fetchSeries(date) {
  if (!date) {
    return;
  }

  isLoadingSeries.value = true;
  errorMessage.value = '';

  try {
    const response = await fetch(`/api/local-magnetometer/series?station=${station.value}&date=${date}`);
    const rawBody = await response.text();
    let payload;

    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch (parseError) {
      if (!response.ok) {
        throw new Error('No se pudo cargar la serie local.');
      }
      throw parseError;
    }

    if (!response.ok) {
      const message = payload?.error || 'No se pudo cargar la serie local.';
      throw new Error(message);
    }

    seriesPayload.value = {
      labels: Array.isArray(payload.labels) ? payload.labels : [],
      series: Array.isArray(payload.series) ? payload.series : [],
      meta: payload.meta ?? null,
    };
  } catch (error) {
    console.error('fetchSeries error', error);
    errorMessage.value = error instanceof Error ? error.message : 'Ocurrió un error al leer la serie local.';
    seriesPayload.value = { labels: [], series: [], meta: null };
  } finally {
    isLoadingSeries.value = false;
  }
}

function refreshSeries() {
  if (selectedDate.value) {
    fetchSeries(selectedDate.value);
  }
}

watch(selectedDate, (date, previous) => {
  if (!date || date === previous) {
    return;
  }

  fetchSeries(date);
});

onMounted(() => {
  fetchAvailableDays();
});
</script>

<style scoped>
.local-magnetometer {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.local-magnetometer__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: flex-end;
}

.control {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.control__label {
  font-size: 0.875rem;
  color: #475569;
  font-weight: 500;
}

.control__select {
  min-width: 14rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid #cbd5f5;
  background: #ffffff;
  color: #0f172a;
  font-size: 0.95rem;
}

.control__select:disabled {
  background: #f1f5f9;
  color: #94a3b8;
  cursor: not-allowed;
}

.control__button {
  padding: 0.55rem 1.25rem;
  border-radius: 0.5rem;
  background: #2563eb;
  color: #ffffff;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: background 0.2s ease-in-out;
}

.control__button:disabled {
  background: #93c5fd;
  cursor: not-allowed;
}

.control__button:not(:disabled):hover {
  background: #1d4ed8;
}

.local-magnetometer__status {
  background: #f8fafc;
  border-radius: 0.75rem;
  padding: 0.85rem 1rem;
  border: 1px solid #e2e8f0;
}

.status {
  margin: 0;
  color: #334155;
  font-size: 0.95rem;
}

.status + .status {
  margin-top: 0.35rem;
}

.status--error {
  color: #b91c1c;
}

.local-magnetometer__chart {
  background: #ffffff;
  border-radius: 0.75rem;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08), 0 4px 12px rgba(15, 23, 42, 0.06);
  padding: 1rem;
}
</style>
