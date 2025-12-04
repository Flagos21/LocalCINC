<script setup>
import { computed } from 'vue'
import VueApexCharts from 'vue3-apexcharts'

import { useEfmLive } from '@/composables/useEfmLive'
import { useMagnetometerSeries } from '@/composables/useMagnetometerSeries'
import { buildDailyMedianBaseline } from '@/utils/timeSeriesBaseline'
import { durationStringToMs, injectNullGaps } from '@/utils/timeSeriesGaps'

const MIN_AXIS_MAGNITUDE = 0.1
const FALLBACK_AXIS_MAGNITUDE = 0.4
const RANGE_PADDING_RATIO = 0.15
const BASELINE_NAME = 'Mediana últimos 7 días'

const QUICK_RANGES = [
  { value: '1d', label: '1 día' },
  { value: '3d', label: '3 días' },
  { value: '7d', label: '7 días' }
]

const AGG_OPTIONS = ['1s', '2s', '5s', '10s', '30s', '1m']
const REFRESH_OPTIONS = [
  { value: 1000, label: '1 s' },
  { value: 2000, label: '2 s' },
  { value: 5000, label: '5 s' },
  { value: 10000, label: '10 s' }
]

const {
  points,
  error,
  isFetching,
  range,
  every: aggregation,
  refreshMs,
  station,
  refresh
} = useEfmLive({
  station: '*',
  range: '1d',
  every: '1m',
  refreshMs: 5000
})

const {
  labels: baselineLabels,
  series: baselineValues
} = useMagnetometerSeries({
  range: '7d',
  every: '',
  unit: '',
  station,
  from: '',
  to: '',
  endpoint: '/api/electric-field/series'
})

const livePoints = computed(() => {
  const rawPoints = points.value
    .map((point) => {
      const timestamp = Number(point?.t ?? point?.time)

      if (!Number.isFinite(timestamp)) {
        return null
      }

      const numericValue = Number(point?.value)
      const value = Number.isFinite(numericValue) ? numericValue : null

      return [timestamp, value]
    })
    .filter((entry) => Array.isArray(entry))

  const stepMs = durationStringToMs(aggregation.value)
  return injectNullGaps(rawPoints, stepMs)
})

const baselinePoints = computed(() =>
  buildDailyMedianBaseline({
    referenceTimestamps: baselineLabels.value,
    referenceValues: baselineValues.value,
    targetTimestamps: livePoints.value.map(([timestamp]) => timestamp),
    bucketSizeMs: durationStringToMs(aggregation.value)
  })
)

const chartSeries = computed(() => {
  if (!livePoints.value.length && !baselinePoints.value.length) {
    return []
  }

  const hasBaseline = baselinePoints.value.some(([, value]) => Number.isFinite(value))

  return hasBaseline
    ? [
        { name: BASELINE_NAME, data: baselinePoints.value },
        { name: 'E_z', data: livePoints.value }
      ]
    : [
        { name: 'E_z', data: livePoints.value }
      ]
})

const xDomain = computed(() => {
  const timestamps = chartSeries.value
    .flatMap((series) => series?.data ?? [])
    .map(([timestamp]) => timestamp)
    .filter((value) => Number.isFinite(value))

  if (!timestamps.length) {
    return { min: null, max: null }
  }

  const min = Math.min(...timestamps)
  const max = Math.max(...timestamps)

  if (min === max) {
    const padding = 5 * 60 * 1000 // 5 minutos para evitar colapsar el eje
    return { min: min - padding, max: max + padding }
  }

  const spanPadding = Math.max(60_000, Math.round((max - min) * 0.05))
  return { min: min - spanPadding, max: max + spanPadding }
})

const yDomain = computed(() => {
  const values = chartSeries.value
    .flatMap((series) => series?.data ?? [])
    .map(([, value]) => value)
    .filter((value) => Number.isFinite(value))

  if (!values.length) {
    return { min: -FALLBACK_AXIS_MAGNITUDE, max: FALLBACK_AXIS_MAGNITUDE }
  }

  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const largestMagnitude = Math.max(Math.abs(minValue), Math.abs(maxValue))
  const safeMagnitude = Number.isFinite(largestMagnitude) ? Math.max(largestMagnitude, MIN_AXIS_MAGNITUDE) : MIN_AXIS_MAGNITUDE
  const padding = safeMagnitude * RANGE_PADDING_RATIO
  const limit = safeMagnitude + padding

  const round = (value) => Math.round(value * 1000) / 1000
  return { min: -round(limit), max: round(limit) }
})

const hasBaselineSeries = computed(() => chartSeries.value.some((series) => series?.name === BASELINE_NAME))

const chartOptions = computed(() => {
  const colors = hasBaselineSeries.value ? ['#d1d5db', '#f97316'] : ['#f97316']
  const strokeWidth = hasBaselineSeries.value ? [2, 2] : 2
  const dashArray = hasBaselineSeries.value ? [0, 0] : 0
  const noDataText = error.value
    ? `Error al cargar: ${error.value}`
    : isFetching.value
      ? 'Cargando campo eléctrico…'
      : 'Sin datos para mostrar'

  return ({
    chart: {
      type: 'line',
      height: '100%',
      toolbar: {
        show: true,
        tools: { download: true, selection: true, zoom: true, zoomin: true, zoomout: true, pan: true }
      },
      animations: { enabled: true, easing: 'easeinout', speed: 250 },
      background: 'transparent',
      foreColor: '#0f172a',
      zoom: { enabled: true, type: 'x' }
    },
    colors,
    stroke: { width: strokeWidth, curve: 'straight', dashArray },
    markers: { size: 0, strokeWidth: 2, hover: { sizeOffset: 3 } },
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
      title: { text: 'E_z (kV/m)' },
      min: Number.isFinite(yDomain.value.min) ? yDomain.value.min : -FALLBACK_AXIS_MAGNITUDE,
      max: Number.isFinite(yDomain.value.max) ? yDomain.value.max : FALLBACK_AXIS_MAGNITUDE,
      labels: { formatter: (val) => (Number.isFinite(val) ? Number(val).toFixed(2) : '') },
      decimalsInFloat: 2,
      axisBorder: { show: false },
      tickAmount: 8
    },
    grid: { borderColor: '#e2e8f0', strokeDashArray: 4, padding: { left: 16, right: 16 } },
    annotations: { yaxis: [{ y: 0, borderColor: '#94a3b8', strokeDashArray: 6, opacity: 0.7 }] },
    tooltip: {
      theme: 'dark',
      shared: true,
      intersect: false,
      x: { format: 'yyyy-MM-dd HH:mm:ss' },
      y: { formatter: (val) => (Number.isFinite(val) ? `${val.toFixed(2)} kV/m` : '—') }
    },
    legend: { show: hasBaselineSeries.value },
    noData: {
      text: noDataText,
      style: { color: '#64748b', fontSize: '14px' }
    }
  })
})

function setQuickRange(value) {
  range.value = value
}

function isActiveRange(value) {
  return range.value === value
}
</script>

<template>
  <section class="efield-live">
    <header class="efield-live__header">
      <div>
        <h1>Campo eléctrico en tiempo real</h1>
        <p>Serie streaming de E<sub>z</sub> con controles rápidos y mediana diaria de referencia.</p>
      </div>
      <button type="button" class="efield-live__refresh" @click="refresh()">Actualizar ahora</button>
    </header>

    <div class="efield-live__controls">
      <div class="ctrl-group">
        <span class="ctrl-label">Ventana</span>
        <div class="quick">
          <button
            v-for="preset in QUICK_RANGES"
            :key="preset.value"
            type="button"
            class="quick-btn"
            :class="{ active: isActiveRange(preset.value) }"
            @click="setQuickRange(preset.value)"
          >
            {{ preset.label }}
          </button>
        </div>
      </div>

      <div class="ctrl-group">
        <span class="ctrl-label">Agregación</span>
        <select v-model="aggregation" class="select">
          <option v-for="option in AGG_OPTIONS" :key="option">{{ option }}</option>
        </select>
      </div>

      <div class="ctrl-group">
        <span class="ctrl-label">Refresco</span>
        <select v-model.number="refreshMs" class="select">
          <option v-for="option in REFRESH_OPTIONS" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>
    </div>

    <div class="efield-live__chart card-surface">
      <VueApexCharts
        type="line"
        class="chart"
        :height="'100%'"
        :options="chartOptions"
        :series="chartSeries"
      />
    </div>

    <p v-if="error" class="efield-live__error">⚠️ {{ error }}</p>
  </section>
</template>

<style scoped>
.efield-live {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  min-height: 0;
  padding: 1.5rem 1.5rem 2rem;
}

.efield-live__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.efield-live__header h1 {
  font-size: 1.6rem;
  font-weight: 600;
  color: #0f172a;
  margin-bottom: 0.3rem;
}

.efield-live__header p {
  color: #475569;
  max-width: 48ch;
  font-size: 0.95rem;
}

.efield-live__header sub {
  font-size: 0.65em;
}

.efield-live__refresh {
  align-self: center;
  background: linear-gradient(135deg, #fb923c, #f97316);
  color: #fff;
  border: none;
  border-radius: 9999px;
  padding: 0.5rem 1.35rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 10px 18px rgba(249, 115, 22, 0.15);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.efield-live__refresh:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 22px rgba(249, 115, 22, 0.18);
}

.efield-live__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 1.25rem;
  align-items: flex-end;
}

.ctrl-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.ctrl-label {
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 0.78rem;
  font-weight: 600;
  color: #b45309;
}

.quick {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.quick-btn {
  position: relative;
  border: 1px solid rgba(249, 115, 22, 0.35);
  background: #fff;
  color: #0f172a;
  padding: 0.35rem 0.85rem;
  border-radius: 9999px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: box-shadow 0.15s ease, transform 0.1s ease, border-color 0.2s ease, background 0.2s ease;
  box-shadow:
    0 0 0 0 rgba(249, 115, 22, 0),
    0 10px 18px rgba(249, 115, 22, 0.08);
}

.quick-btn::after {
  content: '';
  position: absolute;
  inset: auto 0 -4px;
  height: 3px;
  border-radius: 9999px;
  background: linear-gradient(135deg, rgba(249, 115, 22, 0.85), rgba(249, 115, 22, 0.4));
  opacity: 0;
  transition: opacity 0.2s ease;
}

.quick-btn:hover {
  transform: translateY(-1px);
  border-color: rgba(249, 115, 22, 0.55);
  box-shadow:
    0 3px 6px rgba(249, 115, 22, 0.16),
    0 10px 18px rgba(249, 115, 22, 0.12);
}

.quick-btn.active {
  background: rgba(249, 115, 22, 0.08);
  border-color: rgba(249, 115, 22, 0.65);
}

.quick-btn.active::after {
  opacity: 1;
}

.select {
  min-width: 8rem;
  border: 1px solid #cbd5e1;
  background: #fff;
  padding: 0.45rem 0.7rem;
  border-radius: 0.65rem;
  font-size: 0.95rem;
  color: #0f172a;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.select:focus {
  outline: none;
  border-color: rgba(249, 115, 22, 0.65);
  box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.15);
}

.efield-live__chart {
  flex: 1;
  min-height: 420px;
  padding: 1rem;
  border-radius: 1rem;
}

.chart {
  width: 100%;
}

.efield-live__error {
  color: #dc2626;
  font-weight: 500;
}
</style>
