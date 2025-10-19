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
const { labels, series, fetchData, isLoading, errorMessage } = useMagnetometerSeries({
  from, to, every: ref(''), range: ref(''), unit: ref('nT'), station: ref('CHI')
})

const hasData = computed(() => labels.value.length > 0 && series.value.length > 0)
const dataExtent = ref(null)
const hasValidSelection = computed(() => dayjs(from.value).isValid() && dayjs(to.value).isValid())

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

function setDefaultTwoYears() {
  const end = dayjs()
  const start = end.subtract(2, 'year')
  from.value = start.format('YYYY-MM-DDTHH:mm')
  to.value   = end.format('YYYY-MM-DDTHH:mm')
}

// Dibuja (ordenando por tiempo y sin conectar huecos)
function draw() {
  // Zipea, filtra NaN, ordena
  const pts = (labels.value || []).map((t, i) => ({ t, v: (series.value || [])[i] }))
    .filter(p => p.t && Number.isFinite(p.v))
    .sort((a,b) => new Date(a.t) - new Date(b.t))

  const xs = pts.map(p => p.t)
  const ys = pts.map(p => p.v)

  if (!xs.length) {
    dataExtent.value = null
    Plotly.purge('plot-magneto')
    return
  }

  const start = dayjs(xs[0])
  const end = dayjs(xs[xs.length - 1])

  dataExtent.value = {
    start: start.toISOString(),
    end: end.toISOString()
  }

  // Si solo llega un dato extendemos un poco la ventana para que sea visible
  const hasSpan = end.diff(start) > 0
  const paddedStart = hasSpan ? start : start.subtract(6, 'hour')
  const paddedEnd = hasSpan ? end : end.add(6, 'hour')
  const xRange = [paddedStart.toISOString(), paddedEnd.toISOString()]

  const trace = {
    x: xs,
    y: ys,
    type: 'scatter',
    mode: 'lines',
    connectgaps: false,         // ⬅️ no conectar huecos
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
      text: `H – ${start.format('YYYY-MM-DD')} a ${end.format('YYYY-MM-DD')}`,
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
    shapes: [
      { type: 'line', x0: 0, x1: 1, xref: 'paper', y0: 0, y1: 0, yref: 'y',
        line: { dash: 'dash', width: 1, color: '#6b7280' } }
    ],
    hovermode: 'x unified',
    font: {
      family: 'Inter, sans-serif',
      color: '#0f172a'
    }
  }

  Plotly.react('plot-magneto', [trace], layout, {
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

async function apply() {
  try {
    await fetchData()
  } catch (e) {
    console.error(e)
  }
}

onMounted(() => {
  setDefaultTwoYears()

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

  apply()
})

watch([labels, series], draw)

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
            <small class="magneto__hint">
              {{ rangeHint }}
            </small>
            <small v-if="dataExtent" class="magneto__hint magneto__hint--data">
              Datos disponibles: {{ dataWindowHint }}
            </small>
          </label>

          <button class="magneto__button" type="button" @click="apply" :disabled="isLoading">
            <svg class="magneto__button-icon" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9H9m0-5h.01M5 20h14a1 1 0 001-1v-9a1 1 0 00-1-1h-4l-2-3H9l-2 3H5a1 1 0 00-1 1v9a1 1 0 001 1z" />
            </svg>
            {{ isLoading ? 'Actualizando…' : 'Actualizar' }}
          </button>
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

        <p v-if="!isLoading && !hasData && !errorMessage" class="magneto__empty">
          No hay datos disponibles para el rango seleccionado.
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
  gap: 1rem;
  align-items: flex-end;
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

.magneto__hint {
  font-size: 0.75rem;
  color: #64748b;
}

.magneto__hint--data {
  color: #1e293b;
  font-weight: 500;
}

.magneto__button {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.65rem 1.4rem;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  color: #ffffff;
  font-size: 0.95rem;
  font-weight: 600;
  box-shadow: 0 14px 28px rgba(37, 99, 235, 0.25);
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.magneto__button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 18px 32px rgba(37, 99, 235, 0.3);
}

.magneto__button:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 12px 24px rgba(37, 99, 235, 0.22);
}

.magneto__button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  box-shadow: none;
}

.magneto__button-icon {
  width: 1.05rem;
  height: 1.05rem;
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
  text-align: center;
  color: #64748b;
  font-size: 0.95rem;
  padding: 0.75rem;
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

  .magneto__button {
    width: 100%;
    justify-content: center;
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
