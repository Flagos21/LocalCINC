<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import VueApexCharts from 'vue3-apexcharts'
import dayjs from 'dayjs'
import { useMagnetometerSeries } from '@/composables/useMagnetometerSeries'

const chartSeries = ref([])
const xDomain = ref({ min: null, max: null })
const activePreset = ref('1m')
const rangeRef = ref('')
const from = ref('')
const to = ref('')

const LINE_PALETTE = ['#2563eb', '#9333ea', '#0ea5e9', '#f97316', '#facc15', '#22c55e', '#ef4444', '#8b5cf6']
const chartColors = computed(() => chartSeries.value.map((_, index) => LINE_PALETTE[index % LINE_PALETTE.length]))

const { labels, series, isLoading, errorMessage } = useMagnetometerSeries({
  range: rangeRef,
  every: ref(''),
  unit: ref('nT'),
  station: ref('CHI'),
  from,
  to,
  endpoint: ref('/api/local-magnetometer/series')
})

const visiblePoints = ref(0)
const dataExtent = ref(null)
const visibleSummary = computed(() =>
  visiblePoints.value
    ? `${visiblePoints.value.toLocaleString('es-CL')} puntos`
    : 'Sin puntos visibles'
)

const chartOptions = computed(() => ({
  chart: {
    type: 'line',
    height: '100%',
    toolbar: { show: true, tools: { download: true, selection: true, zoom: true, zoomin: true, zoomout: true, pan: true } },
    background: 'transparent',
    foreColor: '#0f172a',
    animations: { enabled: true, easing: 'easeinout', speed: 250 },
    zoom: { enabled: true, type: 'x' }
  },
  stroke: { width: 2, curve: 'straight' },
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
    labels: { formatter: (val) => (Number.isFinite(val) ? Number(val).toFixed(1) : '') },
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
    y: { formatter: (val) => (Number.isFinite(val) ? `${val.toFixed(2)} nT` : '—') }
  },
  noData: {
    text: 'Sin datos para mostrar',
    style: { color: '#64748b', fontSize: '14px' }
  }
}))

const presets = [
  { id: '1m', label: '1 m', description: 'Último mes', duration: { amount: 1, unit: 'month' } },
  { id: '6m', label: '6 m', description: 'Últimos 6 meses', duration: { amount: 6, unit: 'month' } },
  { id: '1y', label: '1 y', description: 'Último año', duration: { amount: 1, unit: 'year' } },
  { id: 'all', label: 'Todo', description: 'Últimos 5 años', duration: { amount: 5, unit: 'year' }, rangeToken: '5y' }
]

const selectedPreset = computed(() => presets.find((preset) => preset.id === activePreset.value) ?? presets[0])

const requestedWindow = computed(() => {
  const preset = selectedPreset.value
  if (!preset) return null

  if (preset.rangeToken) {
    const end = dayjs()
    const start = end.subtract(preset.duration.amount, preset.duration.unit)
    return { start, end }
  }

  const start = dayjs(from.value)
  const end = dayjs(to.value)

  if (!start.isValid() || !end.isValid()) {
    return null
  }

  return { start, end }
})

const rangeHint = computed(() => {
  const preset = selectedPreset.value
  const window = requestedWindow.value

  if (!preset) {
    return 'Sin selección'
  }

  if (!window) {
    return preset.description
  }

  return `${window.start.format('YYYY-MM-DD HH:mm')} → ${window.end.format('YYYY-MM-DD HH:mm')}`
})

const dataWindowHint = computed(() => {
  if (!dataExtent.value) {
    return ''
  }

  return `${dayjs(dataExtent.value.start).format('YYYY-MM-DD HH:mm')} → ${dayjs(dataExtent.value.end).format('YYYY-MM-DD HH:mm')}`
})

const hasVisibleData = computed(() => visiblePoints.value > 0)

function applyPreset(id) {
  const preset = presets.find((item) => item.id === id)
  if (!preset) return

  activePreset.value = id

  rangeRef.value = ''

  const end = dayjs()
  const duration = preset.duration
  const start = duration
    ? end.subtract(duration.amount, duration.unit)
    : end

  from.value = start.format('YYYY-MM-DDTHH:mm')
  to.value = end.format('YYYY-MM-DDTHH:mm')
  draw()
}

function toTimestamp(value) {
  const ts = new Date(value).getTime()
  return Number.isFinite(ts) ? ts : null
}

function draw() {
  const rawPoints = (labels.value || []).map((t, i) => ({ t, v: (series.value || [])[i] }))
    .filter((point) => point.t && Number.isFinite(point.v))
    .sort((a, b) => new Date(a.t) - new Date(b.t))

  if (rawPoints.length) {
    const rawStart = dayjs(rawPoints[0].t)
    const rawEnd = dayjs(rawPoints[rawPoints.length - 1].t)
    dataExtent.value = {
      start: rawStart.toISOString(),
      end: rawEnd.toISOString()
    }
  } else {
    dataExtent.value = null
  }

  visiblePoints.value = rawPoints.length

  let xRange = null

  if (rawPoints.length) {
    const start = dayjs(rawPoints[0].t)
    const end = dayjs(rawPoints[rawPoints.length - 1].t)
    const hasSpan = end.diff(start) > 0
    const paddedStart = hasSpan ? start : start.subtract(6, 'hour')
    const paddedEnd = hasSpan ? end : end.add(6, 'hour')
    xRange = [paddedStart, paddedEnd]
  } else if (requestedWindow.value) {
    const { start, end } = requestedWindow.value
    xRange = [start, end]
  }

  if (!xRange) {
    const now = dayjs()
    xRange = [now.subtract(1, 'day'), now.add(1, 'day')]
  }

  const displayWindow = rawPoints.length
    ? { start: dayjs(rawPoints[0].t), end: dayjs(rawPoints[rawPoints.length - 1].t) }
    : requestedWindow.value

  const domain = {
    min: Number.isFinite(xRange[0]?.valueOf?.()) ? xRange[0].valueOf() : null,
    max: Number.isFinite(xRange[1]?.valueOf?.()) ? xRange[1].valueOf() : null
  }

  xDomain.value = domain

  chartSeries.value = rawPoints.length
    ? [{
        name: displayWindow
          ? `H – ${displayWindow.start.format('YYYY-MM-DD')} a ${displayWindow.end.format('YYYY-MM-DD')}`
          : 'H',
        data: rawPoints
          .map((point) => {
            const ts = toTimestamp(point.t)
            return [ts, point.v]
          })
          .filter(([ts]) => ts !== null)
      }]
    : []
}

applyPreset(activePreset.value)

watch([labels, series], draw, { immediate: true })

onMounted(() => {
  draw()
})
</script>

<template>
  <section class="magneto">
    <article class="magneto__card">
      <header class="magneto__head">
        <div class="magneto__intro">
          <h1 class="magneto__title">Magnetómetro – Estación única</h1>
          <p class="magneto__description">
            Visualiza la componente H con atajos rápidos para cambiar el periodo observado.
          </p>
        </div>

        <div class="magneto__head-actions">
          <slot name="aspect-control" />
          <div class="magneto__presets" role="group" aria-label="Seleccionar intervalo rápido">
            <button
              v-for="preset in presets"
              :key="preset.id"
              type="button"
              class="magneto__preset"
              :class="{ 'magneto__preset--active': preset.id === activePreset }"
              @click="applyPreset(preset.id)"
            >
              {{ preset.label }}
            </button>
          </div>
        </div>
      </header>

      <div class="magneto__meta" role="status" aria-live="polite">
        <div class="magneto__meta-item">
          <span class="magneto__meta-label">Seleccionado</span>
          <span class="magneto__meta-value">{{ rangeHint }}</span>
        </div>
        <div class="magneto__meta-item">
          <span class="magneto__meta-label">Datos</span>
          <span class="magneto__meta-value">{{ dataWindowHint || 'Sin datos disponibles' }}</span>
        </div>
        <div class="magneto__meta-item">
          <span class="magneto__meta-label">Puntos visibles</span>
          <span class="magneto__meta-value">{{ visibleSummary }}</span>
        </div>
      </div>

      <div class="magneto__body">
        <div class="magneto__chart-wrapper">
          <VueApexCharts
            type="line"
            class="magneto__chart"
            height="100%"
            :options="chartOptions"
            :series="chartSeries"
          />

          <div v-if="isLoading" class="magneto__loading" role="status" aria-live="polite">
            <span class="magneto__spinner" aria-hidden="true"></span>
            <p>Cargando serie de datos…</p>
          </div>
        </div>

        <p v-if="!isLoading && !hasVisibleData && !errorMessage" class="magneto__empty">
          No hay datos disponibles para el intervalo seleccionado.
        </p>

        <p v-if="errorMessage" class="magneto__error">⚠️ {{ errorMessage }}</p>
      </div>
    </article>
  </section>
</template>

<style scoped>
.magneto {
  height: 100%;
}

.magneto__card {
  width: 100%;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-radius: 0.75rem;
  border: 1px solid #e2e8f0;
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.06);
  gap: 0.75rem;
  padding: 0.9rem 1rem;
  min-height: 0;
  height: 100%;
}

.magneto__head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.9rem;
}

.magneto__intro {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  max-width: min(32rem, 100%);
}

.magneto__head-actions {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.magneto__head-actions :deep(.aspect-control) {
  flex-shrink: 0;
}

.magneto__presets {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.magneto__preset {
  border: 1px solid rgba(249, 115, 22, 0.35);
  background: rgba(249, 115, 22, 0.08);
  color: #9a3412;
  border-radius: 999px;
  padding: 0.35rem 0.85rem;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease, transform 0.15s ease;
}

.magneto__preset:hover,
.magneto__preset:focus-visible {
  background: rgba(249, 115, 22, 0.18);
  border-color: #f97316;
  color: #7c2d12;
  outline: none;
}

.magneto__preset--active {
  background: #f97316;
  color: #ffffff;
  border-color: #ea580c;
  box-shadow: 0 12px 22px rgba(249, 115, 22, 0.26);
}

.magneto__title {
  font-size: 1.1rem;
  font-weight: 600;
  color: #0f172a;
}

.magneto--compact .magneto__title {
  font-size: 1.25rem;
}

.magneto__description {
  color: #475569;
  font-size: 0.9rem;
  line-height: 1.4;
}

.magneto__meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 0.75rem;
  padding: 0.25rem 0;
}

.magneto__meta-item {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.6rem 0.8rem;
  border-radius: 0.75rem;
  background: rgba(249, 115, 22, 0.08);
  border: 1px solid rgba(249, 115, 22, 0.18);
  min-height: 3.25rem;
}

.magneto__meta-label {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
  color: #ea580c;
}

.magneto__meta-value {
  font-size: 0.85rem;
  color: #0f172a;
  font-weight: 500;
}

.magneto__body {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  flex: 1;
  min-height: 0;
}

.magneto__chart-wrapper {
  position: relative;
  border-radius: 0.65rem;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  flex: 1 1 auto;
  display: flex;
  min-height: 0;
  aspect-ratio: var(--dashboard-aspect, 5 / 4);
}

.magneto__chart {
  height: 100%;
  width: 100%;
}

.magneto--compact .magneto__chart {
  height: 100%;
}

.magneto__loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  text-align: center;
  gap: 0.75rem;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(4px);
  color: #1e293b;
  font-size: 0.9rem;
}

.magneto__spinner {
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 50%;
  border: 3px solid rgba(249, 115, 22, 0.25);
  border-top-color: #f97316;
  animation: magneto-spin 1s linear infinite;
}

.magneto__empty {
  padding: 0.75rem 1rem;
  background: rgba(249, 115, 22, 0.12);
  border-radius: 0.65rem;
  color: #b45309;
  font-weight: 500;
  text-align: center;
}

.magneto__error {
  text-align: center;
  color: #b91c1c;
  font-size: 0.9rem;
  font-weight: 500;
}

@keyframes magneto-spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

@media (max-width: 768px) {
  .magneto__chart {
    height: min(220px, 100%);
  }
}
</style>
