<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import Plotly from 'plotly.js-dist-min'
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

const plotRef = ref(null)
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

  const xs = points.map((p) => p.t)
  const ys = points.map((p) => p.v)

  const now = dayjs()
  let xRange = null
  if (points.length) {
    const start = dayjs(points[0].t)
    const end = dayjs(points[points.length - 1].t)
    const hasSpan = end.diff(start) > 0
    const paddedStart = hasSpan ? start : start.subtract(6, 'hour')
    const paddedEnd = hasSpan ? end : end.add(6, 'hour')
    xRange = [paddedStart.toISOString(), paddedEnd.toISOString()]
  }

  if (!xRange) {
    xRange = [now.subtract(3, 'day').toISOString(), now.add(3, 'day').toISOString()]
  }

  const trace = {
    x: xs,
    y: ys,
    type: 'scatter',
    mode: 'lines',
    connectgaps: false,
    name: 'H',
    line: {
      color: '#2563eb',
      width: 2,
    },
    hovertemplate:
      '%{x|%Y-%m-%d %H:%M:%S}<br>' +
      'H: %{y:.1f} nT' +
      '<extra></extra>',
  }

  const layout = {
    height: 220,
    margin: { t: 32, r: 16, b: 40, l: 56 },
    paper_bgcolor: '#ffffff',
    plot_bgcolor: '#ffffff',
    hovermode: 'x unified',
    showlegend: false,
    title: {
      text: hasData.value
        ? `Serie ${props.station} · últimos ${props.range}`
        : `Serie ${props.station}`,
      x: 0,
      xanchor: 'left',
      font: {
        family: 'Inter, sans-serif',
        size: 16,
        color: '#0f172a',
      },
    },
    xaxis: {
      type: 'date',
      autorange: false,
      range: xRange,
      showgrid: true,
      gridcolor: 'rgba(148, 163, 184, 0.2)',
      zeroline: false,
      linecolor: 'rgba(100, 116, 139, 0.35)',
      linewidth: 1,
      tickformatstops: [
        { dtickrange: [null, 1000 * 60 * 60 * 24 * 2], value: '%d %b\n%H:%M' },
        { dtickrange: [1000 * 60 * 60 * 24 * 2, 1000 * 60 * 60 * 24 * 62], value: '%d %b' },
        { dtickrange: [1000 * 60 * 60 * 24 * 62, null], value: '%b %Y' },
      ],
    },
    yaxis: {
      autorange: true,
      title: 'nT',
      zeroline: false,
      gridcolor: 'rgba(148, 163, 184, 0.2)',
      linecolor: 'rgba(100, 116, 139, 0.35)',
      linewidth: 1,
      tickformat: ',.0f',
    },
  }

  if (!plotRef.value) return

  Plotly.react(plotRef.value, points.length ? [trace] : [], layout, {
    responsive: true,
    displaylogo: false,
    modeBarButtonsToRemove: ['lasso2d'],
    toImageButtonOptions: {
      format: 'png',
      filename: `magnetometro-${props.station}-${dayjs().format('YYYYMMDD-HHmmss')}`,
      scale: 2,
    },
  })
}

watch([labels, series], draw)

onMounted(() => {
  draw()
})

onBeforeUnmount(() => {
  if (plotRef.value) {
    Plotly.purge(plotRef.value)
  }
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
        <p>Sin datos para el rango solicitado.</p>
      </div>
      <div v-else class="magneto-card__plot">
        <div ref="plotRef" class="magneto-card__chart" />
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
  align-items: flex-start;
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
