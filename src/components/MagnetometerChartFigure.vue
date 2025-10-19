<script setup>
import { ref, onMounted, watch, computed, onBeforeUnmount } from 'vue'
import Plotly from 'plotly.js-dist-min'
import dayjs from 'dayjs'
import Litepicker from 'litepicker'
import 'litepicker/dist/css/litepicker.css'
import { useMagnetometerSeries } from '@/composables/useMagnetometerSeries'

// Fechas (un solo input range)
const from = ref('')
const to = ref('')
const pickerRef = ref(null)

// Nuestro composable (usa from/to)
const { labels, series, isLoading, errorMessage } = useMagnetometerSeries({
  from, to, every: ref(''), range: ref(''), unit: ref('nT'), station: ref('CHI')
})

const visiblePoints = ref(0)
const dataExtent = ref(null)
const missingSegments = ref([])
const hasValidSelection = computed(() => dayjs(from.value).isValid() && dayjs(to.value).isValid())
const hasVisibleData = computed(() => visiblePoints.value > 0)

const rangeHint = computed(() => {
  if (!hasValidSelection.value) {
    return 'Sin selección de fechas'
  }

  return `${dayjs(from.value).format('YYYY-MM-DD HH:mm')} → ${dayjs(to.value).format('YYYY-MM-DD HH:mm')}`
})

const dataWindowHint = computed(() => {
  if (!dataExtent.value) {
    return ''
  }

  return `${dayjs(dataExtent.value.start).format('YYYY-MM-DD HH:mm')} → ${dayjs(dataExtent.value.end).format('YYYY-MM-DD HH:mm')}`
})

const gapsMessage = computed(() => {
  if (!hasValidSelection.value || missingSegments.value.length === 0 || !hasVisibleData.value) {
    return ''
  }

  return 'El rango seleccionado incluye periodos sin datos (sombras grises en el gráfico).'
})

function setDefaultTwoYears() {
  const end = dayjs()
  const start = end.subtract(2, 'year')
  from.value = start.format('YYYY-MM-DDTHH:mm')
  to.value   = end.format('YYYY-MM-DDTHH:mm')
}

function computeTypicalGap(points) {
  if (!points || points.length < 2) {
    return null
  }

  const deltas = []

  for (let i = 0; i < points.length - 1; i += 1) {
    const current = dayjs(points[i].t)
    const next = dayjs(points[i + 1].t)
    const diff = next.diff(current, 'minute', true)

    if (Number.isFinite(diff) && diff > 0) {
      deltas.push(diff)
    }
  }

  if (!deltas.length) {
    return null
  }

  deltas.sort((a, b) => a - b)

  return deltas[Math.floor(deltas.length / 2)]
}

function buildMissingSegments(selectionStart, selectionEnd, sortedPoints, typicalGapMinutes) {
  const segments = []

  if (!selectionStart || !selectionEnd || selectionEnd.isBefore(selectionStart)) {
    return segments
  }

  if (!sortedPoints.length) {
    segments.push({ start: selectionStart, end: selectionEnd })
    return segments
  }

  const firstPoint = dayjs(sortedPoints[0].t)
  if (firstPoint.isAfter(selectionStart)) {
    segments.push({ start: selectionStart, end: firstPoint })
  }

  const threshold = typicalGapMinutes ? Math.max(typicalGapMinutes * 3, 30) : 90

  for (let i = 0; i < sortedPoints.length - 1; i += 1) {
    const current = dayjs(sortedPoints[i].t)
    const next = dayjs(sortedPoints[i + 1].t)

    if (next.diff(current, 'minute', true) > threshold) {
      segments.push({ start: current, end: next })
    }
  }

  const lastPoint = dayjs(sortedPoints[sortedPoints.length - 1].t)
  if (lastPoint.isBefore(selectionEnd)) {
    segments.push({ start: lastPoint, end: selectionEnd })
  }

  return segments
}

// Dibuja (ordenando por tiempo y sin conectar huecos)
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

  const typicalGapMinutes = computeTypicalGap(rawPoints)

  const filteredPoints = selectionStart && selectionEnd
    ? rawPoints.filter((point) => {
        const time = new Date(point.t).getTime()
        return time >= selectionStart.valueOf() && time <= selectionEnd.valueOf()
      })
    : rawPoints

  visiblePoints.value = filteredPoints.length

  const xs = filteredPoints.map(p => p.t)
  const ys = filteredPoints.map(p => p.v)

  const shapes = []

  if (selectionStart && selectionEnd) {
    const segments = buildMissingSegments(selectionStart, selectionEnd, filteredPoints, typicalGapMinutes)
    missingSegments.value = segments

    segments.forEach((segment) => {
      shapes.push({
        type: 'rect',
        xref: 'x',
        yref: 'paper',
        x0: segment.start.toISOString(),
        x1: segment.end.toISOString(),
        y0: 0,
        y1: 1,
        layer: 'below',
        fillcolor: 'rgba(148, 163, 184, 0.18)',
        line: { width: 0 }
      })
    })
  } else {
    missingSegments.value = []
  }

  shapes.push({
    type: 'line',
    x0: 0,
    x1: 1,
    xref: 'paper',
    y0: 0,
    y1: 0,
    yref: 'y',
    line: { dash: 'dash', width: 1, color: '#6b7280' }
  })

  let xRange = null

  if (selectionStart && selectionEnd) {
    if (selectionStart.isSame(selectionEnd)) {
      xRange = [selectionStart.subtract(12, 'hour').toISOString(), selectionEnd.add(12, 'hour').toISOString()]
    } else {
      xRange = [selectionStart.toISOString(), selectionEnd.toISOString()]
    }
  } else if (filteredPoints.length) {
    const start = dayjs(filteredPoints[0].t)
    const end = dayjs(filteredPoints[filteredPoints.length - 1].t)
    const hasSpan = end.diff(start) > 0
    const paddedStart = hasSpan ? start : start.subtract(6, 'hour')
    const paddedEnd = hasSpan ? end : end.add(6, 'hour')
    xRange = [paddedStart.toISOString(), paddedEnd.toISOString()]
  }

  if (!xRange) {
    const now = dayjs()
    xRange = [now.subtract(1, 'day').toISOString(), now.add(1, 'day').toISOString()]
  }

  const titleStart = filteredPoints.length ? dayjs(filteredPoints[0].t) : selectionStart || dayjs()
  const titleEnd = filteredPoints.length ? dayjs(filteredPoints[filteredPoints.length - 1].t) : selectionEnd || titleStart

  const trace = {
    x: xs,
    y: ys,
    type: 'scatter',
    mode: 'lines',
    connectgaps: false,
    name: 'H',
    line: {
      color: '#2563eb',
      width: 2
    },
    hovertemplate:
      '%{x|%Y-%m-%d %H:%M:%S}<br>' +
      'H: %{y:.2f} nT' +
      '<extra></extra>'
  }

  const layout = {
    title: {
      text: `H – ${titleStart.format('YYYY-MM-DD')} a ${titleEnd.format('YYYY-MM-DD')}`,
      x: 0.02,
      xanchor: 'left',
      font: {
        family: 'Inter, sans-serif',
        size: 18,
        color: '#0f172a'
      }
    },
    xaxis: {
      title: 'Fecha',
      type: 'date',
      autorange: false,
      range: xRange,
      tickformatstops: [
        { dtickrange: [null, 1000*60*60*24*2], value: '%H:%M\n%d %b' },
        { dtickrange: [1000*60*60*24*2, 1000*60*60*24*62], value: '%d %b %Y' },
        { dtickrange: [1000*60*60*24*62, null], value: '%b %Y' }
      ],
      rangeslider: {
        visible: true,
        range: xRange
      },
      rangeselector: {
        buttons: [
          { step: 'month', stepmode: 'backward', count: 1, label: '1m' },
          { step: 'month', stepmode: 'backward', count: 6, label: '6m' },
          { step: 'year',  stepmode: 'backward', count: 1, label: '1y' },
          { step: 'all', label: 'Todo' }
        ]
      }
    },
    yaxis: {
      title: 'H (nT)',
      zeroline: true,
      zerolinewidth: 1.5,
      zerolinecolor: '#666',
      gridcolor: '#e5e7eb',
      tickformat: ',.2f'
    },
    margin: { t: 60, r: 24, b: 60, l: 70 },
    paper_bgcolor: '#f8fafc',
    plot_bgcolor: '#ffffff',
    shapes,
    hovermode: 'x unified',
    font: {
      family: 'Inter, sans-serif',
      color: '#0f172a'
    }
  }

  const data = filteredPoints.length ? [trace] : []

  Plotly.react('plot-magneto', data, layout, {
    responsive: true,
    displaylogo: false,
    scrollZoom: true,
    modeBarButtonsToRemove: ['lasso2d'],
    toImageButtonOptions: {
      format: 'png',
      filename: `magnetometro-${dayjs().format('YYYYMMDD-HHmmss')}`,
      scale: 2
    }
  })
}

setDefaultTwoYears()

onMounted(() => {
  // Calendario de rango (un solo input)
  const picker = new Litepicker({
    element: document.getElementById('range-input'),
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
    const start = dayjs(d1)
    const end = dayjs(d2)

    if (!start.isValid() || !end.isValid()) {
      return
    }

    from.value = start.format('YYYY-MM-DDTHH:mm')
    to.value = end.format('YYYY-MM-DDTHH:mm')
  })

  picker.on('clear:selection', () => {
    setDefaultTwoYears()
  })

  if (dayjs(from.value).isValid() && dayjs(to.value).isValid()) {
    picker.setDateRange(dayjs(from.value).toDate(), dayjs(to.value).toDate(), true)
  }

  pickerRef.value = picker
})

watch([labels, series], draw)

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
            Visualiza la componente H en nanoTeslas para la estación CHI. Usa el calendario para seleccionar un rango
            específico o explora con el zoom interactivo del gráfico.
          </p>
        </div>

        <div class="magneto__filters">
          <label class="magneto__field">
            <span class="magneto__label">Rango de fechas</span>
            <input
              id="range-input"
              class="magneto__picker"
              placeholder="Selecciona inicio → fin"
              readonly
            />
          </label>

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
          <div id="plot-magneto" class="magneto__chart"></div>

          <div v-if="isLoading" class="magneto__loading" role="status" aria-live="polite">
            <span class="magneto__spinner" aria-hidden="true"></span>
            <p>Cargando serie de datos…</p>
          </div>
        </div>

        <p v-if="!isLoading && !hasVisibleData && !errorMessage" class="magneto__empty">
          No hay datos disponibles para el rango seleccionado.
        </p>

        <p v-if="gapsMessage" class="magneto__gaps">{{ gapsMessage }}</p>

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
  background: linear-gradient(150deg, #ffffff 0%, #f6f8ff 50%, #edf2ff 100%);
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
  align-items: flex-start;
}

.magneto__field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 260px;
}

.magneto__label {
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #64748b;
  font-weight: 600;
}

.magneto__picker {
  border: 1px solid #cbd5f5;
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
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
  outline: none;
}

.magneto__summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: rgba(37, 99, 235, 0.08);
  border-radius: 16px;
  border: 1px solid rgba(37, 99, 235, 0.12);
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
  color: #1e3a8a;
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
  border: 3px solid rgba(37, 99, 235, 0.25);
  border-top-color: #2563eb;
  animation: magneto-spin 1s linear infinite;
}

.magneto__empty {
  margin-top: 1rem;
  padding: 1rem 1.25rem;
  background: rgba(59, 130, 246, 0.12);
  border-radius: 14px;
  color: #1d4ed8;
  font-weight: 500;
  text-align: center;
}

.magneto__gaps {
  margin-top: 0.75rem;
  padding: 0.85rem 1.1rem;
  background: rgba(15, 23, 42, 0.05);
  border-left: 3px solid #2563eb;
  border-radius: 0 14px 14px 0;
  color: #1e293b;
  font-size: 0.85rem;
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
