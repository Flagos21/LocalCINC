<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import VueApexCharts from 'vue3-apexcharts'
import dayjs from 'dayjs'
import { useMagnetometerSeries } from '@/composables/useMagnetometerSeries'

const props = defineProps({
  range: { type: String, default: '7d' },
  every: { type: String, default: '1h' },
  station: { type: String, default: 'CHI' },
})

const rangeRef = ref(props.range)
const everyRef = ref(props.every)
const unitRef = ref('nT')
const from = ref('')
const to = ref('')

const chartSeries = ref([])
const xDomain = ref({ min: null, max: null })
const latestSample = ref(null)
const extent = ref(null)
const pointCount = ref(0)

const { labels, series, isLoading, errorMessage } = useMagnetometerSeries({
  range: rangeRef,
  every: everyRef,
  unit: unitRef,
  station: props.station,
  from,
  to,
})

const hasData = computed(() => pointCount.value > 0)
const lastValue = computed(() => (latestSample.value ? latestSample.value.v : null))
const lastTimestamp = computed(() => (latestSample.value ? latestSample.value.t : null))

const formattedValue = computed(() => {
  if (!Number.isFinite(lastValue.value)) return '—'
  return `${lastValue.value.toFixed(1)} nT`
})

const formattedTimestamp = computed(() => {
  if (!lastTimestamp.value) return '—'
  return dayjs(lastTimestamp.value).format('YYYY-MM-DD HH:mm')
})

const formattedExtent = computed(() => {
  if (!extent.value) return '—'
  return `${dayjs(extent.value.start).format('YYYY-MM-DD')} → ${dayjs(extent.value.end).format('YYYY-MM-DD')}`
})

const chartOptions = computed(() => ({
  chart: {
    type: 'line',
    height: 220,
    animations: { enabled: true, easing: 'easeinout', speed: 250 },
    toolbar: { show: true, tools: { download: true, selection: true, zoom: true, zoomin: true, zoomout: true, pan: true } },
    background: 'transparent',
    foreColor: '#0f172a',
    zoom: { enabled: true, type: 'x' }
  },
  dataLabels: { enabled: false },
  stroke: { width: 2, curve: 'straight' },
  markers: {
    size: 0,
    strokeWidth: 2,
    fillOpacity: 1,
    strokeOpacity: 1,
    hover: { sizeOffset: 3 }
  },
  colors: ['#2563eb'],
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
    decimalsInFloat: 1,
    labels: { formatter: (val) => (Number.isFinite(val) ? Number(val).toFixed(1) : '') },
    axisBorder: { show: false }
  },
  grid: {
    borderColor: '#e2e8f0',
    strokeDashArray: 4,
    padding: { left: 12, right: 12 }
  },
  legend: { show: false },
  tooltip: {
    theme: 'dark',
    shared: true,
    intersect: false,
    x: { format: 'yyyy-MM-dd HH:mm:ss' },
    y: { formatter: (val) => (Number.isFinite(val) ? `${val.toFixed(1)} nT` : '—') }
  },
  noData: {
    text: 'Sin datos para mostrar',
    style: { color: '#64748b', fontSize: '13px' }
  }
}))

function buildPoints() {
  return (labels.value || [])
    .map((t, idx) => ({ t, v: (series.value || [])[idx] }))
    .filter((point) => point.t && Number.isFinite(point.v))
    .sort((a, b) => new Date(a.t) - new Date(b.t))
}

function draw() {
  const points = buildPoints()
  pointCount.value = points.length

  if (points.length) {
    const first = points[0]
    const last = points[points.length - 1]
    extent.value = { start: first.t, end: last.t }
    latestSample.value = last
  } else {
    extent.value = null
    latestSample.value = null
  }

  const now = dayjs()
  let xRange = null
  if (points.length) {
    const start = dayjs(points[0].t)
    const end = dayjs(points[points.length - 1].t)
    const hasSpan = end.diff(start) > 0
    const paddedStart = hasSpan ? start : start.subtract(6, 'hour')
    const paddedEnd = hasSpan ? end : end.add(6, 'hour')
    xRange = [paddedStart, paddedEnd]
  }

  if (!xRange) {
    xRange = [now.subtract(3, 'day'), now.add(3, 'day')]
  }

  const domain = {
    min: Number.isFinite(xRange[0]?.valueOf?.()) ? xRange[0].valueOf() : null,
    max: Number.isFinite(xRange[1]?.valueOf?.()) ? xRange[1].valueOf() : null
  }

  xDomain.value = domain

  chartSeries.value = points.length
    ? [{
        name: `Serie ${props.station}`,
        data: points
          .map((point) => {
            const ts = new Date(point.t).getTime()
            return Number.isFinite(ts) ? [ts, point.v] : null
          })
          .filter(Boolean)
      }]
    : []
}

watch([labels, series], draw, { immediate: true })

onMounted(() => {
  draw()
})
</script>

<template>
  <article class="magneto-card">
    <header class="magneto-card__header">
      <div>
        <h3 class="magneto-card__title">Magnetómetro CHI</h3>
        <p class="magneto-card__subtitle">Componente H · Promedio horario ({{ props.range }})</p>
      </div>
      <dl class="magneto-card__meta">
        <div>
          <dt>Último valor</dt>
          <dd>{{ formattedValue }}</dd>
        </div>
        <div>
          <dt>Actualizado</dt>
          <dd>{{ formattedTimestamp }}</dd>
        </div>
      </dl>
    </header>

    <div class="magneto-card__body" aria-live="polite">
      <div v-if="errorMessage" class="magneto-card__state magneto-card__state--error">
        <strong>No se pudo cargar la serie.</strong>
        <p>{{ errorMessage }}</p>
      </div>
      <div v-else-if="isLoading" class="magneto-card__state">
        <span class="magneto-card__spinner" aria-hidden="true"></span>
        <p>Cargando datos…</p>
      </div>
      <div v-else-if="!hasData" class="magneto-card__state">
        <p>Sin datos para el intervalo solicitado.</p>
      </div>
      <div v-else class="magneto-card__plot">
        <VueApexCharts
          type="line"
          class="magneto-card__chart"
          height="220"
          :options="chartOptions"
          :series="chartSeries"
        />
      </div>
    </div>

    <footer class="magneto-card__footer">
      <span>Ventana de datos: {{ formattedExtent }}</span>
      <span>Puntos visibles: {{ pointCount }}</span>
    </footer>
  </article>
</template>

<style scoped>
.magneto-card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: #ffffff;
  border-radius: 0.75rem;
  border: 1px solid #e2e8f0;
  padding: 0.75rem 0.85rem 0.9rem;
  height: 100%;
  min-height: 0;
  box-shadow: 0 6px 12px rgba(15, 23, 42, 0.08);
}

.magneto-card__header {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
}

.magneto-card__title {
  font-size: 1.05rem;
  font-weight: 600;
  color: #0f172a;
}

.magneto-card__subtitle {
  margin-top: 0.25rem;
  font-size: 0.85rem;
  color: #475569;
}

.magneto-card__meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
  font-size: 0.8rem;
  color: #334155;
}

.magneto-card__meta dt {
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 0.65rem;
  color: #64748b;
}

.magneto-card__meta dd {
  margin: 0;
  font-weight: 600;
  color: #0f172a;
}

.magneto-card__body {
  flex: 1;
  min-height: 0;
  position: relative;
  border-radius: 0.65rem;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  overflow: hidden;
  display: flex;
}

.magneto-card__plot {
  flex: 1;
  min-height: 0;
}

.magneto-card__chart {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.magneto-card__state {
  display: grid;
  place-items: center;
  gap: 0.5rem;
  text-align: center;
  padding: 1.25rem;
  color: #0f172a;
  width: 100%;
}

.magneto-card__state--error {
  color: #b91c1c;
}

.magneto-card__spinner {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  border: 3px solid rgba(59, 130, 246, 0.2);
  border-top-color: #2563eb;
  animation: spin 1s linear infinite;
}

.magneto-card__footer {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
  font-size: 0.75rem;
  color: #475569;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
