<script setup>
import { ref, computed } from 'vue';
import VueApexCharts from 'vue3-apexcharts';
import dayjs from '@/utils/dayjs';
import { useMagnetometerLive } from '@/composables/useMagnetometerLive';
import { buildDailyMedianBaseline } from '@/utils/timeSeriesBaseline';
import { formatUtcDateTime } from '@/utils/formatUtcDate';

const presets = [
  { id: '1d', label: '1 día', duration: { amount: 1, unit: 'day' } },
  { id: '3d', label: '3 días', duration: { amount: 3, unit: 'day' } },
  { id: '7d', label: '7 días', duration: { amount: 7, unit: 'day' } }
];

const activePreset = ref(presets[0].id);

const {
  points,
  error,
  isFetching,
  range,
  every,
  refreshMs,
  station
} = useMagnetometerLive({
  station: 'chi',
  range: '1d',
  every: '1m',
  refreshMs: 60000
});

const unit = ref('nT');
const visiblePoints = ref(0);
const dataExtent = ref(null);
const xDomain = ref({ min: null, max: null });

const BASELINE_NAME = 'Mediana últimos 7 días';
const BASELINE_COLOR = '#d1d5db';
const LINE_COLOR = '#2563eb';

// Normalizamos puntos [{t, value}] → [[ts, val], ...]
const livePoints = computed(() => {
  const raw = (points.value || [])
    .map((p) => {
      const ts = Number(p?.t ?? p?.time);
      const val = Number(p?.value);
      if (!Number.isFinite(ts) || !Number.isFinite(val)) return null;
      return [ts, val];
    })
    .filter((entry) => entry !== null)
    .sort((a, b) => a[0] - b[0]);

  if (raw.length) {
    const start = dayjs(raw[0][0]);
    const end = dayjs(raw[raw.length - 1][0]);
    dataExtent.value = {
      start: start.toISOString(),
      end: end.toISOString()
    };
  } else {
    dataExtent.value = null;
  }

  visiblePoints.value = raw.length;

  // Dominio X con algo de padding
  let xRange;
  if (raw.length) {
    const start = dayjs(raw[0][0]);
    const end = dayjs(raw[raw.length - 1][0]);
    const hasSpan = end.diff(start) > 0;
    const paddedStart = hasSpan ? start : start.subtract(6, 'hour');
    const paddedEnd = hasSpan ? end : end.add(6, 'hour');
    xRange = [paddedStart, paddedEnd];
  } else {
    const now = dayjs();
    xRange = [now.subtract(1, 'day'), now.add(1, 'day')];
  }

  xDomain.value = {
    min: Number.isFinite(xRange[0]?.valueOf?.()) ? xRange[0].valueOf() : null,
    max: Number.isFinite(xRange[1]?.valueOf?.()) ? xRange[1].valueOf() : null
  };

  return raw;
});

// Baseline aproximada con los mismos datos como referencia
const baselinePoints = computed(() => {
  if (!livePoints.value.length) return [];
  const timestamps = livePoints.value.map(([ts]) => ts);
  const values = livePoints.value.map(([, v]) => v);

  return buildDailyMedianBaseline({
    referenceTimestamps: timestamps,
    referenceValues: values,
    targetTimestamps: timestamps
  });
});

const chartSeries = computed(() => {
  if (!livePoints.value.length && !baselinePoints.value.length) return [];

  const baselineHasData = baselinePoints.value.some(([, v]) =>
    Number.isFinite(v)
  );

  return baselineHasData
    ? [
        { name: BASELINE_NAME, data: baselinePoints.value },
        { name: 'h', data: livePoints.value }
      ]
    : [{ name: 'h', data: livePoints.value }];
});

const hasBaselineSeries = computed(() =>
  chartSeries.value.some((s) => s?.name === BASELINE_NAME)
);

const chartColors = computed(() =>
  hasBaselineSeries.value ? [BASELINE_COLOR, LINE_COLOR] : [LINE_COLOR]
);

const hasVisibleData = computed(() => visiblePoints.value > 0);

const rangeLabel = computed(() => {
  const preset = presets.find((p) => p.id === activePreset.value);
  return preset?.label ?? 'Sin selección';
});

const dataWindowLabel = computed(() => {
  if (!dataExtent.value) return '';
  const { start, end } = dataExtent.value;
  return `${dayjs(start).format('YYYY-MM-DD HH:mm')} → ${dayjs(end).format(
    'YYYY-MM-DD HH:mm'
  )}`;
});

const metaSummary = computed(() =>
  hasVisibleData.value
    ? `${visiblePoints.value.toLocaleString('es-CL')} puntos visibles`
    : ''
);

const lastPoint = computed(() => {
  if (!livePoints.value.length) return null;
  const [ts, value] = livePoints.value[livePoints.value.length - 1];
  return { ts, value };
});

const lastValueLabel = computed(() => {
  if (!lastPoint.value) return '—';
  const suffix = unit.value || 'nT';
  return `${lastPoint.value.value.toFixed(1)} ${suffix}`;
});

const lastTimeLabel = computed(() => {
  if (!lastPoint.value) return '—';
  return formatUtcDateTime(lastPoint.value.ts);
});

const chartOptions = computed(() => {
  const strokeWidth = hasBaselineSeries.value ? [2, 2] : 2;
  const noDataText = error.value
    ? `Error al cargar: ${error.value}`
    : isFetching.value
      ? 'Cargando magnetómetro…'
      : 'Sin datos para mostrar';

  return {
    chart: {
      type: 'line',
      height: '100%',
      toolbar: { show: false },
      animations: { enabled: true, easing: 'easeinout', speed: 250 },
      background: 'transparent',
      foreColor: '#0f172a'
    },
    stroke: { width: strokeWidth, curve: 'straight' },
    dataLabels: { enabled: false },
    markers: {
      size: 0,
      strokeWidth: 2,
      fillOpacity: 1,
      strokeOpacity: 1,
      hover: { sizeOffset: 3 }
    },
    colors: chartColors.value,
    xaxis: {
      type: 'datetime',
      min: Number.isFinite(xDomain.value.min) ? xDomain.value.min : undefined,
      max: Number.isFinite(xDomain.value.max) ? xDomain.value.max : undefined,
      labels: { datetimeUTC: true },
      tooltip: { enabled: false },
      axisBorder: { color: '#cbd5f5' },
      axisTicks: { color: '#cbd5f5' }
    },
    yaxis: {
      title: { text: 'nT' },
      labels: {
        formatter: (val) =>
          Number.isFinite(val) ? Number(val).toFixed(1) : ''
      },
      decimalsInFloat: 1,
      axisBorder: { show: false }
    },
    grid: {
      borderColor: '#e2e8f0',
      strokeDashArray: 4,
      padding: { left: 16, right: 16 }
    },
    legend: { show: false },
    tooltip: {
      theme: 'dark',
      shared: true,
      intersect: false,
      x: { format: 'yyyy-MM-dd HH:mm:ss' },
      y: {
        formatter: (val) =>
          Number.isFinite(val) ? `${val.toFixed(2)} nT` : '—'
      }
    },
    noData: {
      text: noDataText,
      style: { color: '#64748b', fontSize: '13px' }
    }
  };
});

function applyPreset(id) {
  const preset = presets.find((p) => p.id === id);
  if (!preset) return;
  activePreset.value = id;
  // range → el composable lo traduce a `since`
  range.value = id; // '1d' | '3d' | '7d'
}
</script>

<template>
  <article class="magneto-home panel panel--chart">
    <header class="magneto-home__head">
      <div>
        <h3>Magnetómetro – Estación única (InfluxDB)</h3>
        <p>Visualiza la componente H en tiempo real desde InfluxDB.</p>
      </div>

      <div class="magneto-home__head-actions">
        <div class="magneto-home__latest" aria-live="polite">
          <span class="magneto-home__label">Último ({{ unit }})</span>
          <span class="magneto-home__value">{{ lastValueLabel }}</span>
          <span class="magneto-home__time">{{ lastTimeLabel }}</span>
        </div>

        <div
          class="magneto-home__presets"
          role="group"
          aria-label="Intervalos rápidos"
        >
          <button
            v-for="preset in presets"
            :key="preset.id"
            type="button"
            class="magneto-home__preset"
            :class="{ 'is-active': preset.id === activePreset }"
            @click="applyPreset(preset.id)"
          >
            {{ preset.label }}
          </button>
        </div>
      </div>
    </header>

    <div class="magneto-home__meta magneto-home__meta--grid">
      <div class="magneto-home__meta-item">
        <span class="magneto-home__label">Seleccionado</span>
        <span class="magneto-home__value">{{ rangeLabel }}</span>
      </div>
      <div class="magneto-home__meta-item" v-if="dataWindowLabel">
        <span class="magneto-home__label">Datos</span>
        <span class="magneto-home__value">{{ dataWindowLabel }}</span>
      </div>
      <div class="magneto-home__meta-item" v-if="metaSummary">
        <span class="magneto-home__label">Resumen</span>
        <span class="magneto-home__value">{{ metaSummary }}</span>
      </div>
    </div>

    <div
      class="magneto-home__chart"
      role="figure"
      aria-label="Magnetómetro desde InfluxDB"
    >
      <VueApexCharts
        type="line"
        height="100%"
        class="magneto-home__chart-canvas"
        :options="chartOptions"
        :series="chartSeries"
      />

      <div
        v-if="isFetching"
        class="magneto-home__loading"
        role="status"
        aria-live="polite"
      >
        <span class="magneto-home__spinner" aria-hidden="true"></span>
        <p>Cargando magnetómetro…</p>
      </div>
    </div>

    <p
      v-if="!isFetching && !hasVisibleData && !error"
      class="magneto-home__empty"
    >
      No hay datos disponibles para este intervalo.
    </p>

    <p v-if="error" class="magneto-home__error">⚠️ {{ error }}</p>
  </article>
</template>

<style scoped>
.magneto-home {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  height: 100%;
  padding: 1rem 1.25rem 1.25rem;
}

.magneto-home__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.magneto-home__head-actions {
  display: flex;
  align-items: flex-start;
  gap: 0.85rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.magneto-home__head h3 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: #0f172a;
}

.magneto-home__head p {
  margin: 0.25rem 0 0;
  color: #475569;
  font-size: 0.9rem;
}

.magneto-home__presets {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.magneto-home__latest {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.15rem;
  text-align: right;
  min-width: 11rem;
}

.magneto-home__preset {
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: rgba(248, 250, 252, 0.85);
  color: #0f172a;
  border-radius: 999px;
  padding: 0.4rem 0.9rem;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, transform 0.15s ease;
}

.magneto-home__preset:hover,
.magneto-home__preset:focus-visible {
  background: #f97316;
  color: #ffffff;
  outline: none;
}

.magneto-home__preset.is-active {
  background: #f97316;
  color: #ffffff;
  box-shadow: 0 10px 25px rgba(249, 115, 22, 0.25);
}

.magneto-home__meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 0.75rem;
  font-size: 0.85rem;
}

.magneto-home__meta-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.magneto-home__label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #b45309;
}

.magneto-home__value {
  color: #0f172a;
}

.magneto-home__time {
  color: #475569;
}

.magneto-home__latest .magneto-home__label {
  text-transform: none;
  letter-spacing: 0;
  font-size: 0.85rem;
  color: #475569;
}

.magneto-home__latest .magneto-home__value {
  font-size: 1.65rem;
  font-weight: 600;
  color: #0f172a;
  line-height: 1.2;
}

.magneto-home__latest .magneto-home__time {
  font-size: 0.85rem;
  color: #475569;
}

.magneto-home__chart {
  position: relative;
  flex: 1 1 auto;
  min-height: clamp(260px, 45vh, 520px);
  display: flex;
}

.magneto-home__chart-canvas,
.magneto-home__chart-canvas :deep(svg) {
  width: 100%;
  height: 100%;
}

.magneto-home__loading {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(4px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  font-size: 0.9rem;
  color: #0f172a;
}

.magneto-home__spinner {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 3px solid rgba(249, 115, 22, 0.2);
  border-top-color: #f97316;
  animation: spin 0.8s linear infinite;
}

.magneto-home__empty {
  margin: 0;
  font-size: 0.9rem;
  color: #475569;
}

.magneto-home__error {
  margin: 0;
  font-size: 0.9rem;
  color: #b91c1c;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 960px) {
  .magneto-home__head {
    flex-direction: column;
    align-items: stretch;
  }

  .magneto-home__head-actions {
    justify-content: flex-start;
  }

  .magneto-home__presets {
    justify-content: flex-start;
  }
}
</style>
