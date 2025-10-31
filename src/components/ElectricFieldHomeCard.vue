<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import VueApexCharts from 'vue3-apexcharts'

import dayjs from '@/utils/dayjs'
import { useMagnetometerSeries } from '@/composables/useMagnetometerSeries'

const DEFAULT_AXIS_SPAN = 5
const AXIS_PADDING_RATIO = 0.1

const presets = [
  { id: '1d', label: '1 día', duration: { amount: 1, unit: 'day' } },
  { id: '7d', label: '7 días', duration: { amount: 7, unit: 'day' } },
  { id: '1m', label: '1 mes', duration: { amount: 1, unit: 'month' } },
  { id: 'all', label: 'Todo' }
]

const activePreset = ref(presets[0].id)
const from = ref('')
const to = ref('')
const availableRange = ref(null)
const shouldApplyFullRange = ref(false)

const {
  labels,
  series,
  isLoading,
  errorMessage,
  meta
} = useMagnetometerSeries({
  from,
  to,
  range: ref(''),
  every: ref(''),
  unit: ref(''),
  station: ref(''),
  endpoint: ref('/api/electric-field/series')
})

const chartSeries = ref([])
const xDomain = ref({ min: null, max: null })
const yDomain = ref({ min: -DEFAULT_AXIS_SPAN, max: DEFAULT_AXIS_SPAN })
const visiblePoints = ref(0)
const dataExtent = ref(null)

const requestedWindow = computed(() => {
  const start = dayjs(from.value)
  const end = dayjs(to.value)

  if (!start.isValid() || !end.isValid()) {
    return null
  }

  return { start, end }
})

const rangeLabel = computed(() => {
  if (!requestedWindow.value) {
    const preset = presets.find((preset) => preset.id === activePreset.value)
    return preset?.label ?? 'Sin selección'
  }

  const { start, end } = requestedWindow.value
  return `${start.format('YYYY-MM-DD HH:mm')} → ${end.format('YYYY-MM-DD HH:mm')}`
})

const dataWindowLabel = computed(() => {
  if (!dataExtent.value) {
    return ''
  }

  return `${dayjs(dataExtent.value.start).format('YYYY-MM-DD HH:mm')} → ${dayjs(dataExtent.value.end).format('YYYY-MM-DD HH:mm')}`
})

const hasVisibleData = computed(() => visiblePoints.value > 0)

const metaSummary = computed(() => {
  const value = meta.value
  if (!value) {
    return ''
  }

  const points = Number.isFinite(Number(value.points)) ? Number(value.points) : 0
  const files = Array.isArray(value.files) ? value.files.length : 0
  const resolution = typeof value.bucket?.size === 'string' ? value.bucket.size : ''

  const pointsLabel = points === 1 ? '1 punto' : `${points.toLocaleString('es-CL')} puntos`
  const filesLabel = files === 1 ? '1 archivo' : `${files} archivos`
  const resolutionLabel = resolution ? ` · Resolución: ${resolution}` : ''

  return `${filesLabel} · ${pointsLabel}${resolutionLabel}`
})

const chartOptions = computed(() => ({
  chart: {
    type: 'line',
    height: '100%',
    toolbar: { show: false },
    animations: { enabled: true, easing: 'easeinout', speed: 250 },
    background: 'transparent',
    foreColor: '#0f172a'
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
  colors: ['#f97316'],
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
    min: Number.isFinite(yDomain.value.min) ? yDomain.value.min : -DEFAULT_AXIS_SPAN,
    max: Number.isFinite(yDomain.value.max) ? yDomain.value.max : DEFAULT_AXIS_SPAN,
    labels: { formatter: (val) => (Number.isFinite(val) ? Number(val).toFixed(2) : '') },
    decimalsInFloat: 2,
    axisBorder: { show: false }
  },
  grid: {
    borderColor: '#e2e8f0',
    strokeDashArray: 4,
    padding: { left: 12, right: 12 }
  },
  annotations: {
    yaxis: [
      {
        y: 0,
        borderColor: '#94a3b8',
        strokeDashArray: 6,
        opacity: 0.7
      }
    ]
  },
  tooltip: {
    theme: 'dark',
    shared: true,
    intersect: false,
    x: { format: 'yyyy-MM-dd HH:mm:ss' },
    y: { formatter: (val) => (Number.isFinite(val) ? `${val.toFixed(2)} kV/m` : '—') }
  },
  legend: { show: false },
  noData: {
    text: isLoading.value ? 'Cargando campo eléctrico…' : 'Sin datos para mostrar',
    style: { color: '#64748b', fontSize: '13px' }
  }
}))

function toTimestamp(value) {
  const ts = new Date(value).getTime()
  return Number.isFinite(ts) ? ts : null
}

function setWindow({ start, end }) {
  const startDate = dayjs(start)
  const endDate = dayjs(end)

  if (!startDate.isValid() || !endDate.isValid()) {
    return
  }

  let clampedStart = startDate
  let clampedEnd = endDate

  if (availableRange.value?.start && availableRange.value?.end) {
    const min = dayjs(availableRange.value.start)
    const max = dayjs(availableRange.value.end)

    if (min.isValid() && clampedStart.isBefore(min)) {
      clampedStart = min
    }

    if (max.isValid() && clampedEnd.isAfter(max)) {
      clampedEnd = max
    }
  }

  if (clampedEnd.isBefore(clampedStart)) {
    ;[clampedStart, clampedEnd] = [clampedEnd, clampedStart]
  }

  from.value = clampedStart.utc().format('YYYY-MM-DDTHH:mm:ss[Z]')
  to.value = clampedEnd.utc().format('YYYY-MM-DDTHH:mm:ss[Z]')
}

function applyPreset(id) {
  const preset = presets.find((item) => item.id === id)
  if (!preset) {
    return
  }

  activePreset.value = id
  shouldApplyFullRange.value = false

  if (preset.id === 'all') {
    if (availableRange.value?.start && availableRange.value?.end) {
      setWindow({ start: availableRange.value.start, end: availableRange.value.end })
      shouldApplyFullRange.value = false
    } else {
      shouldApplyFullRange.value = true
    }
    return
  }

  const now = dayjs()
  const end = now.endOf('minute')
  const start = end.subtract(preset.duration.amount, preset.duration.unit).startOf('minute')

  setWindow({ start, end })
}

function draw() {
  const rawPoints = (labels.value || [])
    .map((t, i) => ({ t, v: (series.value || [])[i] }))
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

  const chartPoints = rawPoints
    .map((point) => {
      const ts = toTimestamp(point.t)
      const numericValue = Number(point.v)
      if (ts === null || !Number.isFinite(numericValue)) {
        return null
      }

      return [ts, numericValue]
    })
    .filter((entry) => entry !== null)

  visiblePoints.value = chartPoints.length

  if (chartPoints.length) {
    const values = chartPoints.map(([, value]) => value)
    const minValue = Math.min(...values)
    const maxValue = Math.max(...values)
    const maxAbs = Math.max(DEFAULT_AXIS_SPAN, Math.abs(minValue), Math.abs(maxValue))
    const padding = maxAbs * AXIS_PADDING_RATIO
    yDomain.value = {
      min: -Math.round((maxAbs + padding) * 100) / 100,
      max: Math.round((maxAbs + padding) * 100) / 100
    }
  } else {
    yDomain.value = { min: -DEFAULT_AXIS_SPAN, max: DEFAULT_AXIS_SPAN }
  }

  let xRange = null

  if (chartPoints.length) {
    const start = dayjs(chartPoints[0][0])
    const end = dayjs(chartPoints[chartPoints.length - 1][0])
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

  xDomain.value = {
    min: Number.isFinite(xRange[0]?.valueOf?.()) ? xRange[0].valueOf() : null,
    max: Number.isFinite(xRange[1]?.valueOf?.()) ? xRange[1].valueOf() : null
  }

  chartSeries.value = chartPoints.length
    ? [
        {
          name: 'E_z',
          data: chartPoints
        }
      ]
    : []
}

watch([labels, series], draw, { immediate: true })
watch(meta, (value) => {
  if (value?.availableRange?.start && value?.availableRange?.end) {
    availableRange.value = {
      start: value.availableRange.start,
      end: value.availableRange.end
    }

    if (shouldApplyFullRange.value) {
      setWindow({ start: value.availableRange.start, end: value.availableRange.end })
      shouldApplyFullRange.value = false
    }
  }
})

onMounted(() => {
  applyPreset(activePreset.value)
})
</script>

<template>
  <article class="panel panel--chart efield-home">
    <header class="efield-home__head">
      <div>
        <h3>Campo eléctrico local</h3>
        <p>Serie E_z a partir de los archivos EFM disponibles en el repositorio local.</p>
      </div>

      <div class="efield-home__head-actions">
        <div class="efield-home__presets" role="group" aria-label="Intervalos rápidos">
          <button
            v-for="preset in presets"
            :key="preset.id"
            type="button"
            class="efield-home__preset"
            :class="{ 'is-active': preset.id === activePreset }"
            @click="applyPreset(preset.id)"
          >
            {{ preset.label }}
          </button>
        </div>
      </div>
    </header>

    <div class="efield-home__meta">
      <div class="efield-home__meta-item">
        <span class="efield-home__label">Seleccionado</span>
        <span class="efield-home__value">{{ rangeLabel }}</span>
      </div>
      <div class="efield-home__meta-item" v-if="dataWindowLabel">
        <span class="efield-home__label">Datos</span>
        <span class="efield-home__value">{{ dataWindowLabel }}</span>
      </div>
      <div class="efield-home__meta-item" v-if="metaSummary">
        <span class="efield-home__label">Resumen</span>
        <span class="efield-home__value">{{ metaSummary }}</span>
      </div>
    </div>

    <div class="efield-home__chart" role="figure" aria-label="Campo eléctrico local">
      <VueApexCharts
        type="line"
        height="100%"
        class="efield-home__chart-canvas"
        :options="chartOptions"
        :series="chartSeries"
      />

      <div v-if="isLoading" class="efield-home__loading" role="status" aria-live="polite">
        <span class="efield-home__spinner" aria-hidden="true"></span>
        <p>Cargando campo eléctrico…</p>
      </div>
    </div>

    <p v-if="!isLoading && !hasVisibleData && !errorMessage" class="efield-home__empty">
      No hay datos disponibles para este intervalo.
    </p>

    <p v-if="errorMessage" class="efield-home__error">⚠️ {{ errorMessage }}</p>
  </article>
</template>

<style scoped>
.efield-home {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  height: 100%;
  padding: 1rem 1.25rem 1.25rem;
}

.efield-home__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.efield-home__head-actions {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.efield-home__head h3 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: #0f172a;
}

.efield-home__head p {
  margin: 0.25rem 0 0;
  color: #475569;
  font-size: 0.9rem;
}

.efield-home__presets {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.efield-home__preset {
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

.efield-home__preset:hover,
.efield-home__preset:focus-visible {
  background: #f97316;
  color: #ffffff;
  outline: none;
}

.efield-home__preset.is-active {
  background: #f97316;
  color: #ffffff;
  box-shadow: 0 10px 25px rgba(249, 115, 22, 0.25);
}

.efield-home__meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 0.75rem;
  font-size: 0.85rem;
}

.efield-home__meta-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.efield-home__label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #b45309;
}

.efield-home__value {
  color: #0f172a;
}

.efield-home__chart {
  position: relative;
  flex: 1 1 auto;
  min-height: clamp(260px, 45vh, 520px);
  display: flex;
}

.efield-home__chart-canvas,
.efield-home__chart-canvas :deep(svg) {
  width: 100%;
  height: 100%;
}

.efield-home__loading {
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

.efield-home__spinner {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 3px solid rgba(249, 115, 22, 0.2);
  border-top-color: #f97316;
  animation: spin 0.8s linear infinite;
}

.efield-home__empty {
  margin: 0;
  font-size: 0.9rem;
  color: #475569;
}

.efield-home__error {
  margin: 0;
  font-size: 0.9rem;
  color: #b91c1c;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (max-width: 960px) {
  .efield-home__head {
    flex-direction: column;
    align-items: stretch;
  }

  .efield-home__head-actions {
    justify-content: flex-start;
  }

  .efield-home__presets {
    justify-content: flex-start;
  }
}
</style>
