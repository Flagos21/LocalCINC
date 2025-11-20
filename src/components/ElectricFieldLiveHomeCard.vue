<script setup>
import { computed } from 'vue'
import VueApexCharts from 'vue3-apexcharts'
import { useEfmLive } from '@/composables/useEfmLive'
import { useMagnetometerSeries } from '@/composables/useMagnetometerSeries'
import { buildDailyMedianBaseline } from '@/utils/timeSeriesBaseline'
import { durationStringToMs, injectNullGaps } from '@/utils/timeSeriesGaps'
import { formatUtcDateTime } from '@/utils/formatUtcDate'

const {
  points, error,
  range, every: agg, refreshMs, station,
  refresh
} = useEfmLive({
  station: '*',
  range: '1d',
  every: '1m',
  refreshMs: 5000
})

const BASELINE_NAME = 'Mediana últimos 7 días'

const {
  labels: baselineLabels,
  series: baselineValues
} = useMagnetometerSeries({
  range: '7d',
  every: '',
  unit: '',
  station,
  from: '',
  to: '',
  endpoint: '/api/electric-field/series'
})

const livePoints = computed(() => {
  const rawPoints = points.value
    .map((point) => {
      const timestamp = Number(point?.t ?? point?.time)

      if (!Number.isFinite(timestamp)) {
        return null
      }

      const numericValue = Number(point?.value)
      const value = Number.isFinite(numericValue) ? numericValue : null

      return [timestamp, value]
    })
    .filter((entry) => Array.isArray(entry))

  const stepMs = durationStringToMs(agg.value)
  return injectNullGaps(rawPoints, stepMs)
})

const lastPoint = computed(() => {
  for (let i = livePoints.value.length - 1; i >= 0; i -= 1) {
    const [ts, value] = livePoints.value[i]
    if (Number.isFinite(value)) {
      return { ts, value }
    }
  }
  return null
})

const lastValueLabel = computed(() => {
  if (!lastPoint.value) return '—'
  return `${lastPoint.value.value.toFixed(3)} kV/m`
})

const lastTimeLabel = computed(() => {
  if (!lastPoint.value) return '—'
  return formatUtcDateTime(lastPoint.value.ts)
})

const chartSeries = computed(() => {
  if (!livePoints.value.length) {
    return []
  }

  const baselinePoints = buildDailyMedianBaseline({
    referenceTimestamps: baselineLabels.value,
    referenceValues: baselineValues.value,
    targetTimestamps: livePoints.value.map(([timestamp]) => timestamp)
  })

  const hasBaseline = baselinePoints.some(([, value]) => Number.isFinite(value))

  return hasBaseline
    ? [
        { name: BASELINE_NAME, data: baselinePoints },
        { name: 'E_z', data: livePoints.value }
      ]
    : [
        { name: 'E_z', data: livePoints.value }
      ]
})

const chartOptions = computed(() => {
  const hasBaselineSeries = chartSeries.value.some((series) => series?.name === BASELINE_NAME)
  const colors = hasBaselineSeries ? ['#d1d5db', '#f97316'] : ['#f97316']
  const strokeWidth = hasBaselineSeries ? [2, 2] : 2
  const dashArray = hasBaselineSeries ? [0, 0] : 0

  return ({
  chart: {
    type: 'line',
    animations: { enabled: true, easing: 'easeinout', speed: 250 },
    toolbar: {
      show: true,
      tools: { download: true, selection: true, zoom: true, zoomin: true, zoomout: true, pan: true }
    },
    background: 'transparent',
    foreColor: '#0f172a',
    zoom: { enabled: true, type: 'x' }
  },
  colors,
  stroke: { width: strokeWidth, curve: 'straight', dashArray },
  markers: { size: 0, strokeWidth: 2, hover: { sizeOffset: 3 } },
  xaxis: { type: 'datetime', labels: { datetimeUTC: true } },
  yaxis: {
    title: { text: 'E_z (kV/m)' },
    min: -0.4, max: 0.4, decimalsInFloat: 2,
    labels: { formatter: v => (Number.isFinite(v) ? v.toFixed(2) : '') },
    tickAmount: 8
  },
  grid: { borderColor: '#e2e8f0', strokeDashArray: 4, padding: { left: 16, right: 16 } },
  annotations: { yaxis: [{ y: 0, borderColor: '#94a3b8', strokeDashArray: 6, opacity: 0.7 }] },
  tooltip: {
    theme: 'dark',
    shared: true, intersect: false,
    x: { format: 'yyyy-MM-dd HH:mm:ss' },
    y: { formatter: v => (Number.isFinite(v) ? `${v.toFixed(2)} kV/m` : '—') }
  },
  noData: { text: 'Cargando campo eléctrico…', style: { color: '#64748b', fontSize: '14px' } }
  })
})

function setQuickRange(r) { range.value = r }
function isActive(r) { return range.value === r }
</script>

<template>
  <div class="efield-home">
    <header class="efield-home__head">
      <div>
        <h3>Campo eléctrico (tiempo real)</h3>
        <p>Streaming E<sub>z</sub> con ventana rápida, controles y límites fijos.</p>
      </div>
      <div class="efield-home__summary">
        <span class="efield-home__label">Último</span>
        <span class="efield-home__value">{{ lastValueLabel }}</span>
        <span class="efield-home__time">{{ lastTimeLabel }}</span>
      </div>
    </header>

    <!-- Controles -->
    <div class="efield-home__controls">
      <div class="ctrl-group">
        <span class="ctrl-label">Ventana</span>
        <div class="quick">
          <button class="quick-btn" :class="{active:isActive('1d')}" @click="setQuickRange('1d')">1 día</button>
          <button class="quick-btn" :class="{active:isActive('3d')}" @click="setQuickRange('3d')">3 días</button>
          <button class="quick-btn" :class="{active:isActive('7d')}" @click="setQuickRange('7d')">7 días</button>
        </div>
      </div>

      <div class="ctrl-group">
        <span class="ctrl-label">Ajustes</span>
        <div class="adj">
          <label class="mini">cada</label>
          <select v-model="agg" class="select">
            <option>1s</option><option>2s</option><option>5s</option>
            <option>10s</option><option>30s</option><option>1m</option>
          </select>

          <label class="mini">refrescar</label>
          <select v-model.number="refreshMs" class="select">
            <option :value="1000">1s</option>
            <option :value="2000">2s</option>
            <option :value="5000">5s</option>
            <option :value="10000">10s</option>
          </select>

          <button class="apply" type="button" @click="refresh()">Refrescar</button>
        </div>
      </div>
    </div>

    <!-- Gráfico -->
    <div class="efield-home__chart card-surface">
      <VueApexCharts
        type="line"
        class="chart"
        :height="'100%'"
        :options="chartOptions"
        :series="chartSeries"
      />
    </div>

    <p v-if="error" class="efield-home__error">⚠️ {{ error }}</p>
  </div>
</template>

<style scoped>
.efield-home {
  display: flex; flex-direction: column; gap: 0.65rem;
  height: 100%; min-height: 0;
  padding: 0.9rem 1rem 1rem; /* el tile está sin padding */
}
.efield-home__head { display:flex; justify-content: space-between; align-items: flex-start; gap: 0.75rem; }
.efield-home__head h3 { font-size: 1.05rem; font-weight: 600; color: #1f2933; }
.efield-home__head p  { color:#69707d; margin-top:.15rem; font-size:.9rem; }
.efield-home__summary { display:flex; flex-direction:column; gap:0.15rem; align-items:flex-end; min-width: 11rem; }
.efield-home__label { font-size:0.85rem; color:#475569; text-transform:none; letter-spacing:0; }
.efield-home__value { font-size:1.65rem; font-weight:600; color:#0f172a; line-height:1.2; }
.efield-home__time { color:#475569; font-size:0.85rem; }

/* Controles compactos */
.efield-home__controls { display: flex; gap: .75rem; flex-wrap: wrap; align-items: center; }
.ctrl-group { display:flex; flex-direction: column; gap:.25rem; }
.ctrl-label { font-size:.8rem; font-weight:600; color:#b45309; text-transform:uppercase; }

/* Botones rápidos con “franja naranja” (look magnetómetro) */
.quick { display:flex; gap:.35rem; flex-wrap:wrap; }
.quick-btn {
  position: relative;
  border:1px solid rgba(249,115,22,.35);
  background:#fff; color:#0f172a;
  padding:.30rem .70rem; border-radius:9999px; cursor:pointer; font-size:.85rem;
  transition: box-shadow .15s ease, transform .1s ease, border-color .2s ease, background .2s ease;
  box-shadow:
    0 0 0 0 rgba(249,115,22,0),            /* base */
    0 10px 18px rgba(249,115,22,.08);      /* sombra suave */
}
.quick-btn:hover {
  transform: translateY(-1px);
  background:#fff7ed;
  border-color:#f59e0b;
  box-shadow:
    0 0 0 2px rgba(249,115,22,.28) inset,  /* “franja” interna */
    0 12px 22px rgba(249,115,22,.14);
}
.quick-btn.active {
  background:#f97316;
  color:#ffffff;
  box-shadow: 0 10px 25px rgba(249, 115, 22, 0.25);
}

.select {
  border:1px solid rgba(249,115,22,.35); background:#fff; color:#0f172a;
  border-radius:10px; padding:.35rem .55rem; min-width: 9rem;
}
.adj { display:flex; gap:.45rem; align-items:center; flex-wrap:wrap; }
.mini { font-size:.8rem; color:#b45309; }

.apply {
  border:none; border-radius:10px; padding:.35rem .7rem; cursor:pointer;
  background:#f97316; color:#fff; font-weight:600;
  box-shadow: 0 10px 20px rgba(249,115,22,.25);
}
.apply:hover { transform: translateY(-1px); box-shadow: 0 14px 24px rgba(249,115,22,.35); }

/* Superficie del gráfico */
.card-surface {
  border: 1px solid #e2e8f0; border-radius: .75rem; background:#fff;
  padding: .4rem; flex: 1 1 auto; min-height: 0;
}
.efield-home__chart { width:100%; height:100%; min-height:0; }
.chart { width: 100%; height: 100%; }

.efield-home__error { margin-top:.4rem; color:#b91c1c; text-align:center; }

@media (max-width: 600px) {
  .select { min-width: 7rem; }
}
</style>
