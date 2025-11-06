<script setup>
import { computed } from 'vue'
import VueApexCharts from 'vue3-apexcharts'

import { useDstRealtime } from '@/composables/useDstRealtime'

const POLL_INTERVAL = 60000

const { points, lastPoint, isLoading, errorMessage } = useDstRealtime({ pollMs: POLL_INTERVAL })

const chartPoints = computed(() => {
  if (!points.value?.length) {
    return []
  }

  const now = Date.now()
  const monthStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime()
  const threshold = Math.max(monthStart, now - 7 * 24 * 60 * 60 * 1000)

  const withinMonth = points.value.filter((point) => point.timestamp >= monthStart)
  if (!withinMonth.length) {
    return []
  }

  const recent = withinMonth.filter((point) => point.timestamp >= threshold)
  return (recent.length ? recent : withinMonth).map((point) => [point.timestamp, point.value])
})

const chartSeries = computed(() => [{ name: 'Dst (nT)', data: chartPoints.value }])

const chartOptions = computed(() => ({
  chart: {
    type: 'line',
    height: '100%',
    toolbar: { show: false },
    animations: { enabled: true, easing: 'easeinout', speed: 300 },
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
  colors: ['#0ea5e9'],
  xaxis: {
    type: 'datetime',
    labels: { datetimeUTC: false },
    tooltip: { enabled: false }
  },
  yaxis: {
    labels: {
      formatter: (value) => (Number.isFinite(value) ? `${Math.round(value)}` : '')
    },
    title: { text: 'nT' }
  },
  grid: {
    borderColor: '#e2e8f0',
    strokeDashArray: 4,
    padding: { left: 12, right: 12 }
  },
  legend: { show: false },
  tooltip: {
    theme: 'dark',
    x: {
      formatter: (value) => formatLocalDateTime(value)
    },
    y: {
      formatter: (value) => (Number.isFinite(value) ? `${value.toFixed(0)} nT` : '—')
    }
  },
  noData: {
    text: isLoading.value ? 'Cargando índice Dst…' : 'Sin datos disponibles',
    style: { color: '#64748b', fontSize: '13px' }
  }
}))

const lastValue = computed(() => {
  if (!lastPoint.value) {
    return null
  }
  return lastPoint.value.value
})

const lastTimestampLabel = computed(() => {
  if (!lastPoint.value) {
    return '—'
  }

  return formatLocalDateTime(lastPoint.value.timestamp)
})

const lastValueLabel = computed(() => {
  if (lastValue.value == null) {
    return '—'
  }

  return `${Number(lastValue.value).toFixed(0)} nT`
})

const trendClass = computed(() => {
  if (lastValue.value == null) {
    return ''
  }
  if (lastValue.value <= -50) {
    return 'dst-card__value--low'
  }
  if (lastValue.value >= 0) {
    return 'dst-card__value--high'
  }
  return ''
})

const hasChartData = computed(() => chartPoints.value.length > 0)

function formatLocalDateTime(value) {
  const ts = typeof value === 'number' ? value : Date.parse(value)
  if (!Number.isFinite(ts)) {
    return '—'
  }

  return new Intl.DateTimeFormat('es-CL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(ts))
}
</script>

<template>
  <div class="dst-card">
    <header class="dst-card__head">
      <div>
        <h3>Dst (WDC Kyoto – quicklook)</h3>
        <p class="dst-card__subtitle">Índice geomagnético del mes en curso.</p>
      </div>
      <div class="dst-card__summary" aria-live="polite">
        <span class="dst-card__label">Último (nT)</span>
        <span class="dst-card__value" :class="trendClass">{{ lastValueLabel }}</span>
        <span class="dst-card__time">{{ lastTimestampLabel }}</span>
      </div>
    </header>

    <div class="dst-card__body" aria-live="polite">
      <div v-if="errorMessage && !hasChartData" class="dst-card__state dst-card__state--error">
        <strong>Sin conexión con Dst.</strong>
        <p>{{ errorMessage }}</p>
      </div>
      <div v-else-if="isLoading && !hasChartData" class="dst-card__state dst-card__state--loading">
        <span class="dst-card__spinner" aria-hidden="true"></span>
        <p>Cargando índice Dst…</p>
      </div>
      <div v-else-if="!hasChartData" class="dst-card__state">
        <p>No hay datos Dst disponibles.</p>
      </div>
      <div v-else class="dst-card__content">
        <div class="dst-card__chart" role="figure" aria-label="Dst (nT)">
          <VueApexCharts type="line" :options="chartOptions" :series="chartSeries" height="100%" />
        </div>
        <p v-if="errorMessage" class="dst-card__warning" role="status">⚠️ {{ errorMessage }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dst-card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  height: 100%;
  min-height: 0;
  flex: 1 1 auto;
}

.dst-card--embedded {
  flex: 0 0 auto;
}

.dst-card__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.dst-card__head h3 {
  font-size: 1.05rem;
  font-weight: 600;
  color: #1f2933;
  margin-bottom: 0.25rem;
}

.dst-card__subtitle {
  color: #64748b;
  font-size: 0.9rem;
  margin: 0;
}

.dst-card__summary {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.15rem;
  min-width: 10rem;
}

.dst-card__label {
  font-size: 0.85rem;
  color: #475569;
}

.dst-card__value {
  font-size: 1.65rem;
  font-weight: 600;
  color: #0f172a;
  line-height: 1.2;
}

.dst-card__value--low {
  color: #b42318;
}

.dst-card__value--high {
  color: #047857;
}

.dst-card__time {
  font-size: 0.85rem;
  color: #475569;
}

.dst-card__body {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-height: 0;
}

.dst-card__content {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-height: 0;
}

.dst-card__chart {
  flex: 1 1 auto;
  min-height: 0;
  background: #ffffff;
  border-radius: 0.75rem;
  border: 1px solid #e2e8f0;
  padding: 0.4rem;
  min-height: clamp(12rem, 32vw, 16rem);
}

.dst-card--embedded .dst-card__chart {
  min-height: clamp(12rem, 40vw, 18rem);
}

.dst-card__chart :deep(svg),
.dst-card__chart :deep(canvas) {
  width: 100%;
  height: 100%;
}

.dst-card__state {
  margin: auto;
  display: grid;
  place-items: center;
  text-align: center;
  gap: 0.5rem;
  color: #0f0f10;
  padding: 1.5rem 1rem;
  border: 1px dashed #d3dae6;
  border-radius: 0.75rem;
  background: #f8fafc;
}

.dst-card__state--error {
  color: #b42318;
  border-color: rgba(180, 35, 24, 0.35);
  background: rgba(180, 35, 24, 0.06);
}

.dst-card__state--loading {
  color: #0f0f10;
}

.dst-card__spinner {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  border: 3px solid rgba(37, 99, 235, 0.2);
  border-top-color: #2563eb;
  animation: dst-spin 1s linear infinite;
}

.dst-card__warning {
  margin: 0;
  font-size: 0.85rem;
  color: #b45309;
}

@keyframes dst-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
