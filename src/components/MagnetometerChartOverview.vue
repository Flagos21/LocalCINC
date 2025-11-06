<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import VueApexCharts from 'vue3-apexcharts'

import dayjs from '@/utils/dayjs'
import { useMagnetometerSeries } from '@/composables/useMagnetometerSeries'

const presets = [
  { id: '1d', label: '1 día', duration: { amount: 1, unit: 'day' } },
  { id: '3d', label: '3 días', duration: { amount: 3, unit: 'day' } },
  { id: '7d', label: '7 días', duration: { amount: 7, unit: 'day' } }
]

const activePreset = ref(presets[0].id)
const from = ref('')
const to = ref('')
const availableRange = ref(null)
const hasInitializedPreset = ref(false)

const chartSeries = ref([])
const xDomain = ref({ min: null, max: null })
const visiblePoints = ref(0)
const dataExtent = ref(null)

const { labels, series, isLoading, errorMessage, meta } = useMagnetometerSeries({
  from,
  to,
  range: ref(''),
  every: ref(''),
  unit: ref('nT'),
  station: ref('CHI'),
  endpoint: ref('/api/local-magnetometer/series')
})

const LINE_PALETTE = ['#2563eb', '#9333ea', '#0ea5e9', '#f97316', '#facc15', '#22c55e', '#ef4444', '#8b5cf6']
const chartColors = computed(() => chartSeries.value.map((_, index) => LINE_PALETTE[index % LINE_PALETTE.length]))

const requestedWindow = computed(() => {
  const start = dayjs(from.value)
  const end = dayjs(to.value)

  if (!start.isValid() || !end.isValid()) {
    return null
  }

  return { start, end }
})

const rangeLabel = computed(() => {
  const window = requestedWindow.value

  if (!window) {
    const preset = presets.find((preset) => preset.id === activePreset.value)
    return preset?.label ?? 'Sin selección'
  }

  const { start, end } = window
  return `${start.format('YYYY-MM-DD HH:mm')} → ${end.format('YYYY-MM-DD HH:mm')}`
})

const dataWindowLabel = computed(() => {
  if (dataExtent.value) {
    return `${dayjs(dataExtent.value.start).format('YYYY-MM-DD HH:mm')} → ${dayjs(dataExtent.value.end).format('YYYY-MM-DD HH:mm')}`
  }

  if (availableRange.value?.start && availableRange.value?.end) {
    return `${dayjs(availableRange.value.start).format('YYYY-MM-DD HH:mm')} → ${dayjs(availableRange.value.end).format('YYYY-MM-DD HH:mm')}`
  }

  return ''
})

const visibleSummary = computed(() =>
  visiblePoints.value ? `${visiblePoints.value.toLocaleString('es-CL')} puntos` : 'Sin puntos visibles'
)

const hasVisibleData = computed(() => visiblePoints.value > 0)

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
    text: isLoading.value ? 'Cargando magnetómetro…' : 'Sin datos para mostrar',
    style: { color: '#64748b', fontSize: '13px' }
  }
}))

function toTimestamp(value) {
  const ts = new Date(value).getTime()
  return Number.isFinite(ts) ? ts : null
}

function resolveAnchorEnd(explicitEnd) {
  const candidates = [
    explicitEnd,
    availableRange.value?.end,
    meta.value?.availableRange?.end,
    meta.value?.range?.end,
    meta.value?.to,
    dataExtent.value?.end,
    labels.value?.[labels.value.length - 1]
  ]

  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }

    const parsed = dayjs(candidate)
    if (parsed.isValid()) {
      return parsed
    }
  }

  return dayjs()
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
  hasInitializedPreset.value = true
}

function applyPreset(id, { anchorEnd } = {}) {
  const preset = presets.find((item) => item.id === id)
  if (!preset) {
    return
  }

  activePreset.value = id

  const anchor = resolveAnchorEnd(anchorEnd)
  const end = anchor.endOf('minute')
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
      const value = Number(point.v)

      if (ts === null || !Number.isFinite(value)) {
        return null
      }

      return [ts, value]
    })
    .filter((entry) => entry !== null)

  visiblePoints.value = chartPoints.length

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
  } else if (availableRange.value?.start && availableRange.value?.end) {
    xRange = [dayjs(availableRange.value.start), dayjs(availableRange.value.end)]
  }

  if (!xRange) {
    const now = dayjs()
    xRange = [now.subtract(1, 'day'), now.add(1, 'day')]
  }

  const domain = {
    min: Number.isFinite(xRange[0]?.valueOf?.()) ? xRange[0].valueOf() : null,
    max: Number.isFinite(xRange[1]?.valueOf?.()) ? xRange[1].valueOf() : null
  }

  xDomain.value = domain

  chartSeries.value = chartPoints.length
    ? [
        {
          name: 'H',
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
  }

  if (!hasInitializedPreset.value) {
    const fallbackEnd =
      value?.availableRange?.end ||
      value?.range?.end ||
      value?.to ||
      dataExtent.value?.end ||
      labels.value?.[labels.value.length - 1]

    applyPreset(activePreset.value, { anchorEnd: fallbackEnd })
  }
})

onMounted(() => {
  if (!hasInitializedPreset.value) {
    applyPreset(activePreset.value)
  }
})
</script>

<template>
  <article class="panel panel--chart magneto-home">
    <header class="magneto-home__head">
      <div>
        <h3>Magnetómetro – Estación única</h3>
        <p>Visualiza la componente H con atajos rápidos para cambiar el periodo observado.</p>
      </div>

      <div class="magneto-home__head-actions">
        <div class="magneto-home__presets" role="group" aria-label="Intervalos rápidos">
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

    <div class="magneto-home__meta">
      <div class="magneto-home__meta-item">
        <span class="magneto-home__label">Seleccionado</span>
        <span class="magneto-home__value">{{ rangeLabel }}</span>
      </div>
      <div class="magneto-home__meta-item" v-if="dataWindowLabel">
        <span class="magneto-home__label">Datos</span>
        <span class="magneto-home__value">{{ dataWindowLabel }}</span>
      </div>
      <div class="magneto-home__meta-item">
        <span class="magneto-home__label">Puntos visibles</span>
        <span class="magneto-home__value">{{ visibleSummary }}</span>
      </div>
    </div>

    <div class="magneto-home__chart" role="figure" aria-label="Magnetómetro local">
      <VueApexCharts
        type="line"
        height="100%"
        class="magneto-home__chart-canvas"
        :options="chartOptions"
        :series="chartSeries"
      />

      <div v-if="isLoading" class="magneto-home__loading" role="status" aria-live="polite">
        <span class="magneto-home__spinner" aria-hidden="true"></span>
        <p>Cargando magnetómetro…</p>
      </div>
    </div>

    <p v-if="!isLoading && !hasVisibleData && !errorMessage" class="magneto-home__empty">
      No hay datos disponibles para este intervalo.
    </p>

    <p v-if="errorMessage" class="magneto-home__error">⚠️ {{ errorMessage }}</p>
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
  align-items: center;
  gap: 0.65rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.magneto-home__presets {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.magneto-home__preset {
  border: 1px solid rgba(37, 99, 235, 0.35);
  background: rgba(37, 99, 235, 0.08);
  color: #1d4ed8;
  border-radius: 999px;
  padding: 0.35rem 0.85rem;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}

.magneto-home__preset:hover,
.magneto-home__preset:focus-visible {
  background: rgba(37, 99, 235, 0.18);
  border-color: #2563eb;
  color: #1e3a8a;
  outline: none;
}

.magneto-home__preset.is-active {
  background: #2563eb;
  color: #ffffff;
  border-color: #1d4ed8;
  box-shadow: 0 12px 22px rgba(37, 99, 235, 0.25);
}

.magneto-home__meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 0.75rem;
  padding: 0.75rem;
  background: rgba(37, 99, 235, 0.05);
  border-radius: 0.75rem;
  border: 1px solid rgba(37, 99, 235, 0.12);
}

.magneto-home__meta-item {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.magneto-home__label {
  text-transform: uppercase;
  font-size: 0.7rem;
  letter-spacing: 0.05em;
  color: #1e40af;
}

.magneto-home__value {
  font-size: 0.9rem;
  font-weight: 600;
  color: #0f172a;
}

.magneto-home__chart {
  position: relative;
  min-height: 16rem;
  flex: 1;
  border-radius: 0.75rem;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  overflow: hidden;
}

.magneto-home__chart-canvas {
  width: 100%;
  height: 100%;
}

.magneto-home__loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  gap: 0.65rem;
  background: rgba(248, 250, 252, 0.85);
  color: #0f172a;
  font-weight: 600;
}

.magneto-home__spinner {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 999px;
  border: 3px solid rgba(37, 99, 235, 0.2);
  border-top-color: #2563eb;
  animation: spin 1s linear infinite;
}

.magneto-home__empty {
  margin: 0;
  font-size: 0.85rem;
  color: #475569;
}

.magneto-home__error {
  margin: 0;
  font-size: 0.85rem;
  color: #b91c1c;
  font-weight: 600;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
