<script setup>
import { ref, onMounted, watch, computed, onBeforeUnmount } from 'vue'
import dayjs from '@/utils/dayjs'
import Litepicker from 'litepicker'
import 'litepicker/dist/css/litepicker.css'
import VueApexCharts from 'vue3-apexcharts'
import { useMagnetometerSeries } from '@/composables/useMagnetometerSeries'

const DEFAULT_RANGE_DAYS = 1
const MIN_AXIS_MAGNITUDE = 0.1
const RANGE_PADDING_RATIO = 0.15
const FALLBACK_AXIS_MAGNITUDE = 1

const rangeInputRef = ref(null)
const pickerRef = ref(null)
const pendingRange = ref(null)

const from = ref('')
const to = ref('')

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
const visiblePoints = ref(0)
const dataExtent = ref(null)
const yDomain = ref({ min: -FALLBACK_AXIS_MAGNITUDE, max: FALLBACK_AXIS_MAGNITUDE })
const hasBootstrappedRange = ref(false)

const hasValidSelection = computed(() => dayjs(from.value).isValid() && dayjs(to.value).isValid())
const hasVisibleData = computed(() => visiblePoints.value > 0)

const chartOptions = computed(() => ({
  chart: {
    type: 'line',
    height: 520,
    toolbar: {
      show: true,
      tools: { download: true, selection: true, zoom: true, zoomin: true, zoomout: true, pan: true }
    },
    animations: { enabled: true, easing: 'easeinout', speed: 250 },
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
    title: { text: 'E_z (kV/m)' },
    min: Number.isFinite(yDomain.value.min) ? yDomain.value.min : -FALLBACK_AXIS_MAGNITUDE,
    max: Number.isFinite(yDomain.value.max) ? yDomain.value.max : FALLBACK_AXIS_MAGNITUDE,
    labels: {
      formatter: (val) => (Number.isFinite(val) ? Number(val).toFixed(2) : '')
    },
    decimalsInFloat: 2,
    axisBorder: { show: false },
    tickAmount: 8
  },
  grid: {
    borderColor: '#e2e8f0',
    strokeDashArray: 4,
    padding: { left: 16, right: 16 }
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
    y: {
      formatter: (val) => (Number.isFinite(val) ? `${val.toFixed(2)} kV/m` : '—')
    }
  },
  legend: { show: false },
  noData: {
    text: isLoading.value ? 'Cargando campo eléctrico…' : 'Sin datos para mostrar',
    style: { color: '#64748b', fontSize: '14px' }
  }
}))

function toDayjsInstance(value) {
  if (!value) {
    return dayjs.invalid()
  }

  if (dayjs.isDayjs(value)) {
    return value
  }

  if (value instanceof Date) {
    return dayjs(value)
  }

  if (typeof value === 'number' || typeof value === 'string') {
    return dayjs(value)
  }

  if (typeof value?.toDate === 'function') {
    return dayjs(value.toDate())
  }

  if (typeof value?.toJSDate === 'function') {
    return dayjs(value.toJSDate())
  }

  if (value?.dateInstance instanceof Date) {
    return dayjs(value.dateInstance)
  }

  if (typeof value?.valueOf === 'function') {
    const primitive = value.valueOf()
    if (primitive !== value) {
      return toDayjsInstance(primitive)
    }
  }

  return dayjs(value)
}

function normalizeRange(start, end, { clampToFullDays = false } = {}) {
  let normalizedStart = toDayjsInstance(start)
  let normalizedEnd = toDayjsInstance(end)

  if (!normalizedStart.isValid() || !normalizedEnd.isValid()) {
    return { start: '', end: '' }
  }

  if (normalizedEnd.isBefore(normalizedStart)) {
    ;[normalizedStart, normalizedEnd] = [normalizedEnd, normalizedStart]
  }

  if (clampToFullDays) {
    normalizedStart = normalizedStart.startOf('day')
    normalizedEnd = normalizedEnd.endOf('day')
  }

  const startIso = normalizedStart.utc().format('YYYY-MM-DDTHH:mm:ss[Z]')
  const endIso = normalizedEnd.utc().format('YYYY-MM-DDTHH:mm:ss[Z]')

  return {
    start: startIso,
    end: endIso
  }
}

function formatEveryLabel(every) {
  if (!every) {
    return ''
  }

  const match = every.match(/^(\d+)([smhd])$/)
  if (!match) {
    return every
  }

  const [, amountRaw, unit] = match
  const amount = Number.parseInt(amountRaw, 10)

  if (!Number.isFinite(amount)) {
    return every
  }

  const unitLabels = {
    s: amount === 1 ? 'segundo' : 'segundos',
    m: amount === 1 ? 'minuto' : 'minutos',
    h: amount === 1 ? 'hora' : 'horas',
    d: amount === 1 ? 'día' : 'días'
  }

  const label = unitLabels[unit]
  if (!label) {
    return every
  }

  return `${amount.toLocaleString('es-CL')} ${label}`
}

const defaultRangeDisplay = computed(() => {
  if (DEFAULT_RANGE_DAYS === 1) {
    return {
      button: 'Último día',
      description: 'las últimas 24 horas'
    }
  }

  return {
    button: `Últimos ${DEFAULT_RANGE_DAYS} días`,
    description: `los últimos ${DEFAULT_RANGE_DAYS} días`
  }
})

const defaultRangeValue = computed(() => {
  const availableEndRaw = meta.value?.availableRange?.end ?? meta.value?.to ?? null
  const availableStartRaw = meta.value?.availableRange?.start ?? null

  const endCandidate = availableEndRaw ? dayjs(availableEndRaw) : null
  const availableStart = availableStartRaw ? dayjs(availableStartRaw) : null

  if (endCandidate?.isValid?.()) {
    let startCandidate = endCandidate.subtract(DEFAULT_RANGE_DAYS - 1, 'day')

    if (availableStart?.isValid?.() && startCandidate.isBefore(availableStart)) {
      startCandidate = availableStart
    }

    return normalizeRange(startCandidate.startOf('day'), endCandidate.endOf('day'), {
      clampToFullDays: true
    })
  }

  if (meta.value?.range?.start && meta.value?.range?.end) {
    return normalizeRange(meta.value.range.start, meta.value.range.end)
  }

  return { start: '', end: '' }
})

function setDefaultRange({ allowFallback = true } = {}) {
  const normalized = defaultRangeValue.value

  if (normalized.start && normalized.end) {
    hasBootstrappedRange.value = true
    from.value = normalized.start
    to.value = normalized.end
    pendingRange.value = null
    return
  }

  if (!allowFallback) {
    return
  }

  const fallbackEnd = dayjs()
  const fallbackStart = fallbackEnd.subtract(DEFAULT_RANGE_DAYS - 1, 'day')
  const fallback = normalizeRange(fallbackStart.startOf('day'), fallbackEnd.endOf('day'), {
    clampToFullDays: true
  })

  from.value = fallback.start
  to.value = fallback.end
  pendingRange.value = null
}

function applyPendingRange() {
  if (!pendingRange.value) {
    return
  }

  const { start, end } = pendingRange.value
  if (!dayjs(start).isValid() || !dayjs(end).isValid()) {
    return
  }

  if (from.value === start && to.value === end) {
    pendingRange.value = null
    return
  }

  from.value = start
  to.value = end
  pendingRange.value = null
}

function resetRange() {
  setDefaultRange()
}

const hasPendingRange = computed(() => {
  if (!pendingRange.value) {
    return false
  }

  const { start, end } = pendingRange.value
  return dayjs(start).isValid() && dayjs(end).isValid()
})

const hasPendingChange = computed(() => {
  if (!pendingRange.value) {
    return false
  }

  const { start, end } = pendingRange.value
  return from.value !== start || to.value !== end
})

const isApplyDisabled = computed(() => !hasPendingRange.value || !hasPendingChange.value)

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

  const selectionStart = hasValidSelection.value ? dayjs(from.value) : null
  const selectionEnd = hasValidSelection.value ? dayjs(to.value) : null

  const filteredPoints = selectionStart && selectionEnd
    ? rawPoints.filter((point) => {
        const time = new Date(point.t).getTime()
        return time >= selectionStart.valueOf() && time <= selectionEnd.valueOf()
      })
    : rawPoints

  const chartPoints = filteredPoints
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
    const largestMagnitude = Math.max(Math.abs(minValue), Math.abs(maxValue))
    const safeMagnitude = Number.isFinite(largestMagnitude) ? largestMagnitude : MIN_AXIS_MAGNITUDE
    const baseMagnitude = Math.max(safeMagnitude, MIN_AXIS_MAGNITUDE)
    const padding = baseMagnitude * RANGE_PADDING_RATIO
    const limit = baseMagnitude + padding
    const round = (value) => Math.round(value * 1000) / 1000
    yDomain.value = {
      min: -round(limit),
      max: round(limit)
    }
  } else {
    yDomain.value = { min: -FALLBACK_AXIS_MAGNITUDE, max: FALLBACK_AXIS_MAGNITUDE }
  }

  let xRange = null

  if (selectionStart && selectionEnd) {
    if (selectionStart.isSame(selectionEnd)) {
      xRange = [selectionStart.subtract(12, 'hour'), selectionEnd.add(12, 'hour')]
    } else {
      xRange = [selectionStart, selectionEnd]
    }
  } else if (filteredPoints.length) {
    const start = dayjs(filteredPoints[0].t)
    const end = dayjs(filteredPoints[filteredPoints.length - 1].t)
    const hasSpan = end.diff(start) > 0
    const paddedStart = hasSpan ? start : start.subtract(6, 'hour')
    const paddedEnd = hasSpan ? end : end.add(6, 'hour')
    xRange = [paddedStart, paddedEnd]
  }

  if (!xRange) {
    const now = dayjs()
    xRange = [now.subtract(1, 'day'), now.add(1, 'day')]
  }

  const titleStart = chartPoints.length ? dayjs(chartPoints[0][0]) : selectionStart || dayjs()
  const titleEnd = chartPoints.length ? dayjs(chartPoints[chartPoints.length - 1][0]) : selectionEnd || titleStart

  const domain = {
    min: Number.isFinite(xRange[0]?.valueOf?.()) ? xRange[0].valueOf() : null,
    max: Number.isFinite(xRange[1]?.valueOf?.()) ? xRange[1].valueOf() : null
  }

  xDomain.value = domain

  chartSeries.value = chartPoints.length
    ? [{
        name: `E_z – ${titleStart.format('YYYY-MM-DD')} a ${titleEnd.format('YYYY-MM-DD')}`,
        data: chartPoints
      }]
    : []
}

const rangeHint = computed(() => {
  if (!hasValidSelection.value) {
    return 'Sin selección de fechas'
  }

  return `${dayjs(from.value).format('YYYY-MM-DD HH:mm')} → ${dayjs(to.value).format('YYYY-MM-DD HH:mm')}`
})

const pendingHint = computed(() => {
  if (!pendingRange.value) {
    return ''
  }

  const { start, end } = pendingRange.value
  if (!start || !end) {
    return ''
  }

  return `${dayjs(start).format('YYYY-MM-DD HH:mm')} → ${dayjs(end).format('YYYY-MM-DD HH:mm')}`
})

const dataWindowHint = computed(() => {
  if (dataExtent.value) {
    return `${dayjs(dataExtent.value.start).format('YYYY-MM-DD HH:mm')} → ${dayjs(dataExtent.value.end).format('YYYY-MM-DD HH:mm')}`
  }

  const available = meta.value?.availableRange
  if (available?.start && available?.end) {
    return `${dayjs(available.start).format('YYYY-MM-DD HH:mm')} → ${dayjs(available.end).format('YYYY-MM-DD HH:mm')}`
  }

  return ''
})

const metaSummary = computed(() => {
  const value = meta.value
  if (!value) {
    return null
  }

  const files = Array.isArray(value.files) ? value.files : []
  const fileCount = files.length
  const first = files[0]
  const last = files[fileCount - 1]

  const visiblePointsRaw = Number(value.points ?? 0)
  const originalPointsRaw = Number(value.originalPoints ?? visiblePointsRaw)
  const visiblePoints = Number.isFinite(visiblePointsRaw) ? visiblePointsRaw : 0
  const originalPoints = Number.isFinite(originalPointsRaw) ? originalPointsRaw : visiblePoints

  const bucketInfo = value.bucket ?? null
  const bucketEvery = typeof bucketInfo?.size === 'string' ? bucketInfo.size : ''
  const resolutionText = formatEveryLabel(bucketEvery)

  const fileLabel = fileCount === 1
    ? `${fileCount} archivo EFM`
    : `${fileCount} archivos EFM`

  let dateLabel = ''
  if (first && last) {
    dateLabel = `${dayjs(first.date).format('YYYY-MM-DD')} → ${dayjs(last.date).format('YYYY-MM-DD')}`
  } else if (fileCount === 1 && first) {
    dateLabel = dayjs(first.date).format('YYYY-MM-DD')
  } else if (value.availableRange?.start && value.availableRange?.end) {
    dateLabel = `${dayjs(value.availableRange.start).format('YYYY-MM-DD')} → ${dayjs(value.availableRange.end).format('YYYY-MM-DD')}`
  }

  const basePointsLabel = visiblePoints === 1
    ? '1 punto visible'
    : `${visiblePoints.toLocaleString('es-CL')} puntos visibles`

  const pointsLabel = originalPoints > visiblePoints
    ? `${basePointsLabel} (de ${originalPoints.toLocaleString('es-CL')} totales)`
    : basePointsLabel

  const resolutionLabel = resolutionText
    ? bucketInfo?.downsampled
      ? `Resolución media: ${resolutionText}`
      : `Resolución: ${resolutionText}`
    : ''

  return {
    fileLabel,
    dateLabel,
    pointsLabel,
    resolutionLabel
  }
})

const stationSummary = computed(() => {
  const value = meta.value
  if (!value) {
    return ''
  }

  const matched = Array.isArray(value.stationsMatched)
    ? value.stationsMatched.filter((station) => typeof station === 'string' && station.trim() !== '')
    : []

  if (matched.length) {
    return matched.length === 1
      ? `Estación ${matched[0]}`
      : `Estaciones ${matched.join(', ')}`
  }

  const available = Array.isArray(value.stationsAvailable)
    ? value.stationsAvailable.filter((station) => typeof station === 'string' && station.trim() !== '')
    : []

  if (available.length) {
    return available.length === 1
      ? `Estación disponible: ${available[0]}`
      : `Estaciones disponibles: ${available.join(', ')}`
  }

  return ''
})

onMounted(() => {
  const picker = new Litepicker({
    element: rangeInputRef.value,
    singleMode: false,
    splitView: false,
    numberOfMonths: 1,
    numberOfColumns: 1,
    format: 'YYYY-MM-DD HH:mm',
    allowRepick: true,
    autoApply: true,
    useLocaleSettings: true,
    lang: 'es-ES',
    dropdowns: { minYear: 2010, maxYear: dayjs().year(), months: true, years: true },
    startDate: dayjs(from.value).isValid() ? dayjs(from.value).toDate() : null,
    endDate: dayjs(to.value).isValid() ? dayjs(to.value).toDate() : null
  })

  picker.on('selected', (d1, d2) => {
    const start = toDayjsInstance(d1)
    const end = toDayjsInstance(d2)

    if (!start.isValid() || !end.isValid()) {
      pendingRange.value = null
      return
    }

    const normalized = normalizeRange(start, end)
    const matchesCurrent = normalized.start === from.value && normalized.end === to.value
    pendingRange.value = matchesCurrent ? null : { ...normalized }
  })

  if (dayjs(from.value).isValid() && dayjs(to.value).isValid()) {
    picker.setDateRange(dayjs(from.value).toDate(), dayjs(to.value).toDate(), true)
  }

  pickerRef.value = picker

  draw()
})

watch(meta, () => {
  if (hasBootstrappedRange.value) {
    return
  }

  const normalized = defaultRangeValue.value
  if (normalized.start && normalized.end) {
    setDefaultRange({ allowFallback: false })
  }
})

watch([labels, series], draw, { immediate: true })
watch([from, to], draw)

watch([from, to], ([start, end]) => {
  const picker = pickerRef.value
  if (!picker) return

  const startDate = dayjs(start)
  const endDate = dayjs(end)

  if (startDate.isValid() && endDate.isValid()) {
    const currentStart = picker.getStartDate()
    const currentEnd = picker.getEndDate()

    const startTime = currentStart ? currentStart.getTime() : null
    const endTime = currentEnd ? currentEnd.getTime() : null

    if (startTime !== startDate.toDate().getTime() || endTime !== endDate.toDate().getTime()) {
      picker.setDateRange(startDate.toDate(), endDate.toDate(), true)
    }
  } else {
    picker.clearSelection()
  }
})

onBeforeUnmount(() => {
  if (pickerRef.value) {
    pickerRef.value.destroy()
    pickerRef.value = null
  }
})
</script>

<template>
  <section class="efield efield--local">
    <div class="efield__card">
      <header class="efield__header">
        <div>
          <h1 class="efield__title">Campo eléctrico – Fuente local</h1>
          <p class="efield__description">
            Visualiza la componente E_z obtenida desde los archivos EFM almacenados localmente para la estación de Chillán.
            Selecciona el intervalo en el calendario para cargar los datos disponibles (por defecto se muestran {{ defaultRangeDisplay.description }}).
          </p>
        </div>

        <div class="efield__filters">
          <div class="efield__field">
            <span class="efield__label">Intervalo de fechas</span>
            <div class="efield__controls">
              <input
                ref="rangeInputRef"
                class="efield__picker"
                placeholder="Selecciona inicio → fin"
                readonly
              />
              <button
                type="button"
                class="efield__apply"
                :disabled="isApplyDisabled"
                @click="applyPendingRange"
              >
                Visualizar
              </button>
              <button
                type="button"
                class="efield__reset"
                @click="resetRange"
              >
                {{ defaultRangeDisplay.button }}
              </button>
            </div>
            <p v-if="hasPendingChange" class="efield__pending">Pendiente: {{ pendingHint }}</p>
          </div>

          <div class="efield__summary" role="status" aria-live="polite">
            <div class="efield__summary-block">
              <span class="efield__summary-label">Seleccionado</span>
              <span class="efield__summary-value">{{ rangeHint }}</span>
            </div>
            <div class="efield__summary-block">
              <span class="efield__summary-label">Datos disponibles</span>
              <span class="efield__summary-value">{{ dataWindowHint || 'Sin datos en el último refresco' }}</span>
            </div>
            <div class="efield__summary-block" v-if="metaSummary">
              <span class="efield__summary-label">Archivos y puntos</span>
              <span class="efield__summary-value">
                {{ metaSummary.fileLabel }} · {{ metaSummary.pointsLabel }}
                <template v-if="metaSummary.resolutionLabel">
                  <br />{{ metaSummary.resolutionLabel }}
                </template>
                <template v-if="metaSummary.dateLabel">
                  <br />{{ metaSummary.dateLabel }}
                </template>
              </span>
            </div>
            <div class="efield__summary-block" v-if="stationSummary">
              <span class="efield__summary-label">Estaciones</span>
              <span class="efield__summary-value">{{ stationSummary }}</span>
            </div>
          </div>
        </div>
      </header>

      <div class="efield__body">
        <div class="efield__chart-wrapper">
          <VueApexCharts
            type="line"
            class="efield__chart"
            height="520"
            :options="chartOptions"
            :series="chartSeries"
          />

          <div v-if="isLoading" class="efield__loading" role="status" aria-live="polite">
            <span class="efield__spinner" aria-hidden="true"></span>
            <p>Cargando campo eléctrico…</p>
          </div>
        </div>

        <p v-if="!isLoading && !hasVisibleData && !errorMessage" class="efield__empty">
          No hay datos de campo eléctrico disponibles para el intervalo seleccionado.
        </p>

        <p v-if="errorMessage" class="efield__error">⚠️ {{ errorMessage }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.efield {
  padding: 1.5rem;
}

.efield__card {
  margin: 0 auto;
  max-width: 1120px;
  background: linear-gradient(150deg, #ffffff 0%, #f6f8ff 50%, #edf2ff 100%);
  border-radius: 24px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow: 0 24px 50px rgba(15, 23, 42, 0.12);
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  overflow: hidden;
}

.efield__header {
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
  padding: 2rem 2.5rem 1.5rem;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
}

.efield__title {
  font-size: 2rem;
  font-weight: 600;
  color: #0f172a;
}

.efield__description {
  max-width: 48ch;
  color: #475569;
  font-size: 0.95rem;
  line-height: 1.5;
}

.efield__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 1.25rem;
  align-items: center;
}

.efield__field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 260px;
}

.efield__label {
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
  color: #b45309;
}

.efield__controls {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}

.efield__picker {
  flex: 1;
  min-width: 220px;
  border-radius: 12px;
  border: 1px solid rgba(249, 115, 22, 0.35);
  background: rgba(255, 255, 255, 0.9);
  padding: 0.65rem 0.85rem;
  font-size: 0.95rem;
  color: #0f172a;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
  cursor: pointer;
}

.efield__picker:focus-visible {
  outline: none;
  border-color: #f97316;
  box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.25);
}

.efield__apply,
.efield__reset {
  border: none;
  border-radius: 12px;
  font-weight: 600;
  padding: 0.65rem 1.2rem;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.efield__apply {
  background: #f97316;
  color: #ffffff;
  box-shadow: 0 10px 20px rgba(249, 115, 22, 0.25);
}

.efield__apply:disabled {
  background: #fdba74;
  color: rgba(255, 255, 255, 0.8);
  cursor: not-allowed;
  box-shadow: none;
}

.efield__apply:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 24px rgba(249, 115, 22, 0.35);
}

.efield__reset {
  background: rgba(249, 115, 22, 0.12);
  color: #c2410c;
}

.efield__reset:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 22px rgba(249, 115, 22, 0.2);
}

.efield__pending {
  margin: 0;
  font-size: 0.85rem;
  color: #c2410c;
}

.efield__summary {
  display: flex;
  gap: 1.25rem;
  flex-wrap: wrap;
  align-items: stretch;
}

.efield__summary-block {
  flex: 1 1 220px;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 16px;
  padding: 0.85rem 1rem;
  border: 1px solid rgba(15, 23, 42, 0.06);
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.efield__summary-label {
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #ea580c;
  font-weight: 600;
}

.efield__summary-value {
  font-size: 0.85rem;
  color: #0f172a;
  font-weight: 500;
  line-height: 1.35;
}

.efield__body {
  padding: 0 2.5rem 2.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.efield__chart-wrapper {
  position: relative;
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: #ffffff;
}

.efield__chart {
  height: 520px;
  width: 100%;
}

.efield__loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  text-align: center;
  gap: 0.75rem;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(6px);
  color: #1e293b;
  font-size: 0.95rem;
}

.efield__spinner {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  border: 3px solid rgba(249, 115, 22, 0.25);
  border-top-color: #f97316;
  animation: efield-spin 1s linear infinite;
}

.efield__empty {
  margin-top: 1rem;
  padding: 1rem 1.25rem;
  background: rgba(249, 115, 22, 0.12);
  border-radius: 14px;
  color: #c2410c;
  font-weight: 500;
  text-align: center;
}

.efield__error {
  text-align: center;
  color: #b91c1c;
  font-size: 0.95rem;
  font-weight: 500;
}

@keyframes efield-spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

@media (max-width: 768px) {
  .efield {
    padding: 1rem;
  }

  .efield__card {
    border-radius: 20px;
  }

  .efield__header {
    padding: 1.5rem 1.75rem 1.25rem;
  }

  .efield__body {
    padding: 0 1.75rem 1.75rem;
  }

  .efield__filters {
    flex-direction: column;
    align-items: stretch;
  }

  .efield__field {
    width: 100%;
  }

  .efield__summary {
    width: 100%;
  }
}

@media (max-width: 520px) {
  .efield__card {
    gap: 1.25rem;
  }

  .efield__title {
    font-size: 1.65rem;
  }

  .efield__chart {
    height: 460px;
  }
}
</style>
