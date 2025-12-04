<!--
  Componente Vue 3 para mostrar el E_z en vivo dentro de un "tile" del Home.
  - Usa VueApexCharts de forma local (sin depender del registro global).
  - Acepta props para estación, ventana (since), agregación, refresh, límites Y y altura.
  - Clase .efield-live--home para respetar la altura clamp del HomeView.
-->
<script setup>
import { computed } from 'vue'
import VueApexCharts from 'vue3-apexcharts'
import { useEfmLive } from '@/composables/useEfmLive'
import { useMagnetometerSeries } from '@/composables/useMagnetometerSeries'
import { buildDailyMedianBaseline } from '@/utils/timeSeriesBaseline'
import { durationStringToMs, injectNullGaps } from '@/utils/timeSeriesGaps'

// Props simples para configurarlo desde fuera
const props = defineProps({
  station:   { type: String, default: '*' },
  since:     { type: String, default: '10m' },  // ventana corta por defecto
  every:     { type: String, default: '5s' },
  refreshMs: { type: Number, default: 2000 },
  yMin:      { type: Number, default: -0.4 },
  yMax:      { type: Number, default:  0.4 },
  height:    { type: [Number, String], default: '100%' }
})

// Trae datos en vivo (ahora useEfmLive acepta since o range)
const {
  points,
  error,
  station,
  every: aggregation,
  range
} = useEfmLive({
  station: props.station,
  since: props.since,
  every: props.every,
  refreshMs: props.refreshMs
})

const BASELINE_NAME = 'Mediana últimos 7 días'

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

  const stepMs = durationStringToMs(aggregation.value ?? props.every)
  return injectNullGaps(rawPoints, stepMs)
})

const targetTimestamps = computed(() => {
  const stepMs = durationStringToMs(aggregation.value ?? props.every)
  const rawRange = String(range.value ?? '').replace(/^since:/, '')
  const windowMs = durationStringToMs(rawRange)
  const liveTimestamps = livePoints.value.map(([ts]) => ts).filter((ts) => Number.isFinite(ts))

  if (!Number.isFinite(stepMs) || stepMs <= 0) {
    return liveTimestamps
  }

  const now = Date.now()
  const end = liveTimestamps.length ? Math.max(liveTimestamps[liveTimestamps.length - 1], now) : now
  const start = Number.isFinite(windowMs) && windowMs > 0 ? end - windowMs : (liveTimestamps[0] ?? end)

  const timeline = new Set(liveTimestamps)

  for (let ts = end; ts >= start; ts -= stepMs) {
    timeline.add(Math.round(ts))
  }

  return Array.from(timeline).sort((a, b) => a - b)
})

const baselinePoints = computed(() =>
  buildDailyMedianBaseline({
    referenceTimestamps: baselineLabels.value,
    referenceValues: baselineValues.value,
    targetTimestamps: targetTimestamps.value,
    bucketSizeMs: durationStringToMs(aggregation.value ?? props.every)
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

const hasBaselineSeries = computed(() => chartSeries.value.some((series) => series?.name === BASELINE_NAME))

// Opciones Apex
const chartOptions = computed(() => ({
  chart: {
    type: 'line',
    animations: { enabled: true, easing: 'easeinout', speed: 250 },
    toolbar: {
      show: true,
      tools: { download: true, selection: true, zoom: true, zoomin: true, zoomout: true, pan: true }
    },
    background: 'transparent',
    foreColor: '#0f172a',
    zoom: { enabled: true, type: 'x' }
  },
  colors: hasBaselineSeries.value ? ['#d1d5db', '#f97316'] : ['#f97316'],
  stroke: {
    width: hasBaselineSeries.value ? [2, 2] : 2,
    curve: 'straight',
    dashArray: hasBaselineSeries.value ? [0, 0] : 0
  },
  markers: { size: 0, strokeWidth: 2, hover: { sizeOffset: 3 } },
  xaxis: {
    type: 'datetime',
    labels: { datetimeUTC: true },
    axisBorder: { color: '#cbd5f5' },
    axisTicks:  { color: '#cbd5f5' }
  },
  yaxis: {
    title: { text: 'E_z (kV/m)' },
    min: props.yMin,
    max: props.yMax,
    decimalsInFloat: 2,
    labels: { formatter: (v) => (Number.isFinite(v) ? v.toFixed(2) : '') },
    axisBorder: { show: false },
    tickAmount: 8
  },
  grid: {
    borderColor: '#e2e8f0',
    strokeDashArray: 4,
    padding: { left: 16, right: 16 }
  },
  annotations: { yaxis: [{ y: 0, borderColor: '#94a3b8', strokeDashArray: 6, opacity: 0.7 }] },
  tooltip: {
    theme: 'dark',
    shared: true,
    intersect: false,
    x: { format: 'yyyy-MM-dd HH:mm:ss' },
    y: { formatter: (v) => (Number.isFinite(v) ? `${v.toFixed(2)} kV/m` : '—') }
  },
  legend: { show: hasBaselineSeries.value },
  noData: { text: 'Cargando campo eléctrico…', style: { color: '#64748b', fontSize: '14px' } }
}))
</script>

<template>
  <div class="efield-live-card">
    <VueApexCharts
      type="line"
      class="efield-live--home efield-live__chart"
      :height="height"
      :options="chartOptions"
      :series="chartSeries" />
    <p v-if="error" class="efield-live__error">⚠️ {{ error }}</p>
  </div>
</template>

<style scoped>
.efield-live-card {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.efield-live__chart { width: 100%; }

.efield-live__error {
  margin-top: .5rem;
  color: #b91c1c;
  font-size: .95rem;
  text-align: center;
}
</style>
