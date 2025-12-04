<!--
  Vista dedicada "live" (independiente del Home).
  Mantengo tu layout original, usando directamente el composable actualizado.
-->
<script setup>
import { computed } from 'vue'
import VueApexCharts from 'vue3-apexcharts'
import { useEfmLive } from '@/composables/useEfmLive'
import { useMagnetometerSeries } from '@/composables/useMagnetometerSeries'
import { buildDailyMedianBaseline } from '@/utils/timeSeriesBaseline'
import { durationStringToMs, injectNullGaps } from '@/utils/timeSeriesGaps'

// Props configurables
const props = defineProps({
  station:   { type: String, default: '*' },   // CHI / * / etc.
  since:     { type: String, default: '1d' },  // ventana temporal (ej: '1d')
  every:     { type: String, default: '1m' },  // agregación (ej: '1m')
  refreshMs: { type: Number, default: 5000 },  // auto-refresh
  yMin:      { type: Number, default: -0.4 },
  yMax:      { type: Number, default:  0.4 },
  height:    { type: [Number, String], default: 520 }
})

// Hook en vivo (reactivo) — ahora puedes pasar since directo
const {
  points,
  error,
  range,   // '1h' | '6h' | '24h' | 'today' | 'since:<dur>'
  every: agg, refreshMs, station,
  refresh
} = useEfmLive({
  station: props.station,
  since:   props.since,   // 👈 usamos since (el composable arma range='since:<dur>')
  every:   props.every,
  refreshMs: props.refreshMs
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

const baselinePoints = computed(() =>
  buildDailyMedianBaseline({
    referenceTimestamps: baselineLabels.value,
    referenceValues: baselineValues.value,
    targetTimestamps: livePoints.value.map(([timestamp]) => timestamp),
    bucketSizeMs: durationStringToMs(agg.value)
  })
)

const chartSeries = computed(() => {
  if (!livePoints.value.length && !baselinePoints.value.length) {
    return []
  }

  const hasBaseline = baselinePoints.value.some(([, value]) => Number.isFinite(value))

  return hasBaseline
    ? [
        { name: BASELINE_NAME, data: baselinePoints.value },
        { name: 'E_z', data: livePoints.value }
      ]
    : [
        { name: 'E_z', data: livePoints.value }
      ]
})

const hasBaselineSeries = computed(() => chartSeries.value.some((series) => series?.name === BASELINE_NAME))

// Opciones Apex
const chartOptions = computed(() => ({
  chart: {
    type: 'line',
    height: props.height,
    toolbar: {
      show: true,
      tools: { download: true, selection: true, zoom: true, zoomin: true, zoomout: true, pan: true }
    },
    animations: { enabled: true, easing: 'easeinout', speed: 250 },
    background: 'transparent',
    foreColor: '#0f172a',
    zoom: { enabled: true, type: 'x' }
  },
  colors: hasBaselineSeries.value ? ['#d1d5db', '#f97316'] : ['#f97316'],
  stroke: {
    width: hasBaselineSeries.value ? [2, 2] : 2,
    curve: 'straight',
    dashArray: hasBaselineSeries.value ? [0, 0] : 0
  },
  markers: { size: 0, strokeWidth: 2, hover: { sizeOffset: 3 } },
  xaxis: { type: 'datetime', labels: { datetimeUTC: true }, axisBorder: { color: '#cbd5f5' }, axisTicks: { color: '#cbd5f5' } },
  yaxis: {
    title: { text: 'E_z (kV/m)' },
    min: props.yMin,
    max: props.yMax,
    decimalsInFloat: 2,
    labels: { formatter: (v) => (Number.isFinite(v) ? v.toFixed(2) : '') },
    axisBorder: { show: false },
    tickAmount: 8
  },
  grid: { borderColor: '#e2e8f0', strokeDashArray: 4, padding: { left: 16, right: 16 } },
  annotations: { yaxis: [{ y: 0, borderColor: '#94a3b8', strokeDashArray: 6, opacity: 0.7 }] },
  tooltip: {
    theme: 'dark',
    shared: true, intersect: false,
    x: { format: 'yyyy-MM-dd HH:mm:ss' },
    y: { formatter: (v) => (Number.isFinite(v) ? `${v.toFixed(2)} kV/m` : '—') }
  },
  legend: { show: hasBaselineSeries.value },
  noData: { text: 'Cargando campo eléctrico…', style: { color: '#64748b', fontSize: '14px' } }
}))

// Acciones rápidas
function setQuickRange(r) {
  // r puede ser '1d' | '3d' | '7d'
  range.value = r
}
</script>

<template>
  <section class="efield efield--live">
    <div class="efield__card">
      <header class="efield__header">
        <div>
          <h1 class="efield__title">Campo eléctrico — Live</h1>
          <p class="efield__description">
            Streaming de la componente E_z en tiempo real desde Telegraf/InfluxDB.
            Ajusta la ventana y refresco según tu necesidad. Límites Y fijos para
            comparación rápida entre períodos.
          </p>
        </div>

        <div class="efield__filters">
          <!-- Rápidos -->
          <div class="efield__field">
            <span class="efield__label">Ventana rápida</span>
            <div class="efield__controls">
              <div class="efield__quick">
                <button class="efield__quick-btn" :class="{ active: range === '1d' }" @click="setQuickRange('1d')">1 día</button>
                <button class="efield__quick-btn" :class="{ active: range === '3d' }" @click="setQuickRange('3d')">3 días</button>
                <button class="efield__quick-btn" :class="{ active: range === '7d' }" @click="setQuickRange('7d')">7 días</button>
              </div>
            </div>
          </div>

          <!-- Ajustes -->
          <div class="efield__field">
            <span class="efield__label">Ajustes</span>
            <div class="efield__controls">
              <label class="efield__label--mini">cada</label>
              <select v-model="agg" class="efield__select">
                <option>1s</option><option>2s</option><option>5s</option>
                <option>10s</option><option>30s</option><option>1m</option>
              </select>

              <label class="efield__label--mini">refrescar</label>
              <select v-model.number="refreshMs" class="efield__select">
                <option :value="1000">1s</option>
                <option :value="2000">2s</option>
                <option :value="5000">5s</option>
                <option :value="10000">10s</option>
              </select>

              <button class="efield__apply" type="button" @click="refresh()">Refrescar</button>
            </div>
          </div>
        </div>
      </header>

      <div class="efield__body">
        <div class="efield__chart-wrapper">
          <VueApexCharts
            type="line"
            class="efield__chart"
            :height="height"
            :options="chartOptions"
            :series="chartSeries"
          />
        </div>
        <p v-if="error" class="efield__error">⚠️ {{ error }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.efield {
  display: flex;
  flex-direction: column;
  gap: 1.35rem;
  flex: 1;
  min-height: 0;
  width: min(100%, 74rem);
  margin: 0 auto;
}

.efield__card {
  margin: 0 auto;
  width: 100%;
  background: #ffffff;
  border-radius: 0.95rem;
  border: 1px solid #e2e8f0;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 1.35rem;
  overflow: hidden;
  padding: 1.35rem 1.5rem 1.4rem;
}

.efield__header {
  display: flex;
  flex-direction: column;
  gap: 1.15rem;
}

.efield__title { font-size: 1.8rem; font-weight: 600; color: #0f172a; }
.efield__description { max-width: 54ch; color: #475569; font-size: 0.95rem; line-height: 1.55; }

.efield__filters { display: flex; flex-wrap: wrap; gap: 1.1rem; align-items: center; }
.efield__field { display: flex; flex-direction: column; gap: 0.4rem; min-width: 260px; }
.efield__label { font-size: 0.82rem; font-weight: 700; text-transform: uppercase; color: #1f2937; letter-spacing: 0.04em; }
.efield__label--mini { font-size: 0.82rem; color: #475569; margin-left: 0.25rem; }

.efield__controls { display: flex; gap: 0.55rem; align-items: center; flex-wrap: wrap; }

.efield__quick { display: inline-flex; gap: 0.4rem; flex-wrap: wrap; }
.efield__quick-btn {
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  padding: 0.45rem 0.9rem;
  border-radius: 0.75rem;
  cursor: pointer;
  font-weight: 600;
  color: #0f172a;
  transition: transform 0.12s ease, box-shadow 0.15s ease, border-color 0.2s ease, background 0.2s ease;
}

.efield__quick-btn:hover,
.efield__quick-btn:focus-visible {
  transform: translateY(-1px);
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.08);
  border-color: #94a3b8;
  outline: none;
}

.efield__quick-btn:active { transform: translateY(0); }

.efield__quick-btn.active {
  background: #1d4ed8;
  color: #ffffff;
  border-color: #1d4ed8;
  box-shadow: 0 12px 22px rgba(37, 99, 235, 0.2);
}

.efield__select {
  border-radius: 0.75rem;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  padding: 0.55rem 0.75rem;
  font-size: 0.95rem;
  color: #0f172a;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}

.efield__select:focus-visible {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2);
}

.efield__apply {
  border: 1px solid #2563eb;
  border-radius: 0.75rem;
  font-weight: 700;
  padding: 0.6rem 1.1rem;
  cursor: pointer;
  background: #1d4ed8;
  color: #ffffff;
  box-shadow: 0 12px 24px rgba(37, 99, 235, 0.2);
  transition: transform 0.12s ease, box-shadow 0.12s ease, background 0.2s ease, border-color 0.2s ease;
}

.efield__apply:hover,
.efield__apply:focus-visible {
  transform: translateY(-1px);
  box-shadow: 0 14px 26px rgba(37, 99, 235, 0.24);
  outline: none;
}

.efield__apply:active { transform: translateY(0); }

.efield__body { padding: 0; display: flex; flex-direction: column; gap: 1rem; }

.efield__chart-wrapper {
  position: relative;
  border-radius: 0.85rem;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  padding: 0.4rem;
}
.efield__chart { width: 100%; background: #ffffff; border-radius: 0.65rem; }

.efield__error { text-align: center; color: #b91c1c; font-size: 0.95rem; font-weight: 500; }

@media (max-width: 768px) {
  .efield__card { padding: 1.1rem 1.15rem 1.25rem; }
  .efield__title { font-size: 1.55rem; }
  .efield__filters { flex-direction: column; align-items: stretch; }
  .efield__field, .efield__summary { width: 100%; }
}
</style>
