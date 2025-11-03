<script setup>
import { ref, onMounted, watch, computed, onBeforeUnmount } from 'vue'
import VueApexCharts from 'vue3-apexcharts'
import dayjs from 'dayjs'
import Litepicker from 'litepicker'
import 'litepicker/dist/css/litepicker.css'
import { useMagnetometerSeries } from '@/composables/useMagnetometerSeries'

// Fechas (un solo input range)
const from = ref('')
const to = ref('')
const pickerRef = ref(null)
const rangeInputRef = ref(null)
const pendingRange = ref(null)

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

// Nuestro composable (usa from/to)
const { labels, series, isLoading, errorMessage } = useMagnetometerSeries({
  from, to, every: ref(''), range: ref(''), unit: ref('nT'), station: ref('CHI')
})

const chartSeries = ref([])
const LINE_PALETTE = ['#2563eb', '#9333ea', '#0ea5e9', '#f97316', '#facc15', '#22c55e', '#ef4444', '#8b5cf6']
const chartColors = computed(() => chartSeries.value.map((_, index) => LINE_PALETTE[index % LINE_PALETTE.length]))
const xDomain = ref({ min: null, max: null })
const visiblePoints = ref(0)
const dataExtent = ref(null)
const hasValidSelection = computed(() => dayjs(from.value).isValid() && dayjs(to.value).isValid())
const hasVisibleData = computed(() => visiblePoints.value > 0)

const chartOptions = computed(() => ({
  chart: {
    type: 'line',
    height: 520,
    toolbar: {
      show: true,
      tools: { download: true, selection: true, zoom: true, zoomin: true, zoomout: true, pan: true },
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
    title: { text: 'H (nT)' },
    labels: {
      formatter: (val) => (Number.isFinite(val) ? Number(val).toFixed(2) : ''),
    },
    decimalsInFloat: 2,
    axisBorder: { show: false },
    tickAmount: 6
  },
  grid: {
    borderColor: '#e2e8f0',
    strokeDashArray: 4,
    padding: { left: 16, right: 16 }
  },
  tooltip: {
    theme: 'dark',
    shared: true,
    intersect: false,
    x: { format: 'yyyy-MM-dd HH:mm:ss' },
    y: {
      formatter: (val) => (Number.isFinite(val) ? `${val.toFixed(2)} nT` : '—')
    }
  },
  legend: { show: false },
  noData: {
    text: 'Sin datos para mostrar',
    style: { color: '#64748b', fontSize: '14px' }
  }
}))

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
  if (!dataExtent.value) {
    return ''
  }

  return `${dayjs(dataExtent.value.start).format('YYYY-MM-DD HH:mm')} → ${dayjs(dataExtent.value.end).format('YYYY-MM-DD HH:mm')}`
})

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

  return {
    start: normalizedStart.format('YYYY-MM-DDTHH:mm'),
    end: normalizedEnd.format('YYYY-MM-DDTHH:mm')
  }
}

function setDefaultTwoYears() {
  const end = dayjs()
  const start = end.subtract(2, 'year')
  const normalized = normalizeRange(start, end, { clampToFullDays: true })
  from.value = normalized.start
  to.value = normalized.end
  pendingRange.value = null
}

function applyPendingRange() {
  if (!hasPendingRange.value) {
    return
  }

  const { start, end } = pendingRange.value
  if (!dayjs(start).isValid() || !dayjs(end).isValid()) {
    return
  }

  const sameStart = from.value === start
  const sameEnd = to.value === end

  if (sameStart && sameEnd) {
    pendingRange.value = null
    return
  }

  from.value = start
  to.value = end
  pendingRange.value = null
}

const hasPendingChange = computed(() => {
  if (!pendingRange.value) {
    return false
  }

  const { start, end } = pendingRange.value
  if (!dayjs(start).isValid() || !dayjs(end).isValid()) {
    return false
  }

  return from.value !== start || to.value !== end
})

const hasPendingRange = computed(() => {
  if (!pendingRange.value) {
    return false
  }

  const { start, end } = pendingRange.value
  return dayjs(start).isValid() && dayjs(end).isValid()
})

const isApplyDisabled = computed(() => !hasPendingRange.value || !hasPendingChange.value)

function toTimestamp(value) {
  const ts = new Date(value).getTime()
  return Number.isFinite(ts) ? ts : null
}

// Dibuja (ordenando por tiempo y limitando al intervalo elegido)
function draw() {
  const rawPoints = (labels.value || []).map((t, i) => ({ t, v: (series.value || [])[i] }))
    .filter(p => p.t && Number.isFinite(p.v))
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

  visiblePoints.value = filteredPoints.length

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

  const titleStart = filteredPoints.length ? dayjs(filteredPoints[0].t) : selectionStart || dayjs()
  const titleEnd = filteredPoints.length ? dayjs(filteredPoints[filteredPoints.length - 1].t) : selectionEnd || titleStart

  const domain = {
    min: Number.isFinite(xRange[0]?.valueOf?.()) ? xRange[0].valueOf() : null,
    max: Number.isFinite(xRange[1]?.valueOf?.()) ? xRange[1].valueOf() : null
  }

  xDomain.value = domain

  chartSeries.value = filteredPoints.length
    ? [{
        name: `H – ${titleStart.format('YYYY-MM-DD')} a ${titleEnd.format('YYYY-MM-DD')}`,
        data: filteredPoints.map(point => {
          const ts = toTimestamp(point.t)
          return [ts, point.v]
        }).filter(([ts]) => ts !== null)
      }]
    : []
}

setDefaultTwoYears()

onMounted(() => {
  // Calendario de intervalo (un solo input)
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

watch([labels, series], draw, { immediate: true })

watch([from, to], () => {
  draw()
})

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
  <section class="magneto">
    <div class="magneto__card">
      <header class="magneto__header">
        <div>
          <h1 class="magneto__title">Magnetómetro – Estación única</h1>
          <p class="magneto__description">
            Visualiza la componente H en nanoTeslas para la estación CHI. Usa el calendario para seleccionar un intervalo
            específico o explora con el zoom interactivo del gráfico.
          </p>
        </div>

        <div class="magneto__filters">
          <div class="magneto__field">
            <span class="magneto__label">Intervalo de fechas</span>
            <div class="magneto__controls">
              <input
                ref="rangeInputRef"
                class="magneto__picker"
                placeholder="Selecciona inicio → fin"
                readonly
              />
              <button
                type="button"
                class="magneto__apply"
                :disabled="isApplyDisabled"
                @click="applyPendingRange"
              >
                Visualizar
              </button>
            </div>
            <p v-if="hasPendingChange" class="magneto__pending">Pendiente: {{ pendingHint }}</p>
          </div>

          <div class="magneto__summary" role="status" aria-live="polite">
            <div class="magneto__summary-block">
              <span class="magneto__summary-label">Seleccionado</span>
              <span class="magneto__summary-value">{{ rangeHint }}</span>
            </div>
            <div class="magneto__summary-block">
              <span class="magneto__summary-label">Datos disponibles</span>
              <span class="magneto__summary-value">{{ dataWindowHint || 'Sin datos en el último refresco' }}</span>
            </div>
          </div>
        </div>
      </header>

      <div class="magneto__body">
        <div class="magneto__chart-wrapper">
          <VueApexCharts
            type="line"
            class="magneto__chart"
            height="520"
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
    </div>
  </section>
</template>

<style scoped>
.magneto {
  padding: 1.5rem;
}

.magneto__card {
  margin: 0 auto;
  max-width: 1120px;
  background: linear-gradient(150deg, #ffffff 0%, #fff7ed 50%, #ffedd5 100%);
  border-radius: 24px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow: 0 24px 50px rgba(15, 23, 42, 0.12);
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  overflow: hidden;
}

.magneto__header {
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
  padding: 2rem 2.5rem 1.5rem;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
}

.magneto__title {
  font-size: 2rem;
  font-weight: 600;
  color: #0f172a;
}

.magneto__description {
  max-width: 46ch;
  color: #475569;
  font-size: 0.95rem;
  line-height: 1.5;
}

.magneto__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 1.25rem;
  align-items: center;
}

.magneto__field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 260px;
}

.magneto__controls {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.magneto__label {
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #64748b;
  font-weight: 600;
}

.magneto__picker {
  border: 1px solid rgba(249, 115, 22, 0.35);
  border-radius: 12px;
  padding: 0.65rem 0.85rem;
  font-size: 0.95rem;
  color: #1e293b;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.95);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  cursor: pointer;
}

.magneto__picker:focus-visible,
.magneto__picker:hover {
  border-color: #f97316;
  box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.2);
  outline: none;
}

.magneto__apply {
  border: none;
  border-radius: 0.75rem;
  padding: 0.5rem 1rem;
  background: #f97316;
  color: #fff;
  font-weight: 600;
  font-size: 0.875rem;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
  box-shadow: 0 10px 20px rgba(249, 115, 22, 0.25);
}

.magneto__apply:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 12px 24px rgba(249, 115, 22, 0.28);
}

.magneto__apply:disabled {
  background: #fed7aa;
  color: #9a3412;
  cursor: not-allowed;
  box-shadow: none;
}

.magneto__pending {
  margin: 0;
  font-size: 0.75rem;
  color: #9a3412;
  background: rgba(249, 115, 22, 0.12);
  border-radius: 0.75rem;
  padding: 0.35rem 0.6rem;
  font-weight: 500;
}

.magneto__summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: #fff7ed;
  border-radius: 16px;
  border: 1px solid rgba(249, 115, 22, 0.16);
  min-width: 260px;
}

.magneto__summary-block {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.magneto__summary-label {
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #ea580c;
  font-weight: 600;
}

.magneto__summary-value {
  font-size: 0.85rem;
  color: #0f172a;
  font-weight: 500;
}

.magneto__body {
  padding: 0 2.5rem 2.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.magneto__chart-wrapper {
  position: relative;
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: #ffffff;
}

.magneto__chart {
  height: 520px;
  width: 100%;
}

.magneto__loading {
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

.magneto__spinner {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  border: 3px solid rgba(249, 115, 22, 0.25);
  border-top-color: #f97316;
  animation: magneto-spin 1s linear infinite;
}

.magneto__empty {
  margin-top: 1rem;
  padding: 1rem 1.25rem;
  background: rgba(249, 115, 22, 0.12);
  border-radius: 14px;
  color: #b45309;
  font-weight: 500;
  text-align: center;
}

.magneto__error {
  text-align: center;
  color: #b91c1c;
  font-size: 0.95rem;
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
  .magneto {
    padding: 1rem;
  }

  .magneto__card {
    border-radius: 20px;
  }

  .magneto__header {
    padding: 1.5rem 1.75rem 1.25rem;
  }

  .magneto__body {
    padding: 0 1.75rem 1.75rem;
  }

  .magneto__filters {
    flex-direction: column;
    align-items: stretch;
  }

  .magneto__field {
    width: 100%;
  }

  .magneto__summary {
    width: 100%;
  }
}

@media (max-width: 520px) {
  .magneto__card {
    gap: 1.25rem;
  }

  .magneto__title {
    font-size: 1.65rem;
  }

  .magneto__chart {
    height: 460px;
  }
}
</style>
