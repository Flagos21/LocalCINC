<script setup>
import { computed } from 'vue'
import VueApexCharts from 'vue3-apexcharts'
import { useEfmLive } from '@/composables/useEfmLive'

// Props configurables
const props = defineProps({
  station:   { type: String, default: '*' },   // CHI / * / etc.
  since:     { type: String, default: '10m' }, // ventana temporal en backend (ej: '10m')
  every:     { type: String, default: '5s' },  // agregación en backend (ej: '5s')
  refreshMs: { type: Number, default: 2000 },  // auto-refresh
  yMin:      { type: Number, default: -0.4 },
  yMax:      { type: Number, default:  0.4 },
  height:    { type: [Number, String], default: 520 }
})

// Hook en vivo (reactivo)
const {
  points, error,
  range,   // p.ej. '1h' | '6h' | '24h' | 'today' | 'since:<dur>'
  every: agg, refreshMs, station,
  refresh
} = useEfmLive({
  station: props.station,
  range:   `since:${props.since}`, // tip: usamos el formato 'since:<dur>'
  every:   props.every,
  refreshMs: props.refreshMs
})

// Serie
const series = computed(() => [{
  name: 'E_z',
  data: points.value.map(p => [p.t, p.value]) // [timestamp_ms, value]
}])

// Opciones Apex con la misma estética del otro componente
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
  colors: ['#f97316'], // naranja
  stroke: { width: 2, curve: 'straight', dashArray: 0 },
  markers: {
    size: 0, strokeWidth: 2, fillOpacity: 1, strokeOpacity: 1,
    hover: { sizeOffset: 3 }
  },
  xaxis: {
    type: 'datetime',
    labels: { datetimeUTC: true },
    tooltip: { enabled: false },
    axisBorder: { color: '#cbd5f5' },
    axisTicks:  { color: '#cbd5f5' }
  },
  yaxis: {
    title: { text: 'E_z (kV/m)' },
    min: props.yMin,
    max: props.yMax,
    decimalsInFloat: 2,
    labels: { formatter: (v) => (Number.isFinite(v) ? v.toFixed(2) : '') },
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
      { y: 0, borderColor: '#94a3b8', strokeDashArray: 6, opacity: 0.7 }
    ]
  },
  tooltip: {
    theme: 'dark',
    shared: true,
    intersect: false,
    x: { format: 'yyyy-MM-dd HH:mm:ss' },
    y: { formatter: (v) => (Number.isFinite(v) ? `${v.toFixed(2)} kV/m` : '—') }
  },
  noData: {
    text: 'Cargando campo eléctrico…',
    style: { color: '#64748b', fontSize: '14px' }
  }
}))

// Acciones rápidas
function setQuickRange(r) {
  // r: '1h' | '6h' | '24h' | 'today' | 'since:10m'
  range.value = r.startsWith('since:') ? r : r
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
                <button class="efield__quick-btn" @click="setQuickRange('since:10m')">10 min</button>
                <button class="efield__quick-btn" @click="setQuickRange('1h')">1 h</button>
                <button class="efield__quick-btn" @click="setQuickRange('6h')">6 h</button>
                <button class="efield__quick-btn" @click="setQuickRange('24h')">24 h</button>
                <button class="efield__quick-btn" @click="setQuickRange('today')">Hoy</button>
              </div>
            </div>
          </div>

          <!-- Estación -->
          <div class="efield__field">
            <span class="efield__label">Estación</span>
            <div class="efield__controls">
              <input class="efield__picker" v-model="station" placeholder="*, CHI, etc." />
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
            :series="series"
          />
        </div>

        <p v-if="error" class="efield__error">⚠️ {{ error }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* === Mismo look & feel que tu componente histórico === */
.efield { padding: 1.5rem; }
.efield__card {
  margin: 0 auto; max-width: 1120px;
  background: linear-gradient(150deg, #ffffff 0%, #f6f8ff 50%, #edf2ff 100%);
  border-radius: 24px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow: 0 24px 50px rgba(15, 23, 42, 0.12);
  display: flex; flex-direction: column; gap: 1.5rem; overflow: hidden;
}
.efield__header {
  display: flex; flex-direction: column; gap: 1.75rem;
  padding: 2rem 2.5rem 1.5rem;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
}
.efield__title { font-size: 2rem; font-weight: 600; color: #0f172a; }
.efield__description { max-width: 48ch; color: #475569; font-size: 0.95rem; line-height: 1.5; }

.efield__filters { display: flex; flex-wrap: wrap; gap: 1.25rem; align-items: center; }
.efield__field { display: flex; flex-direction: column; gap: 0.35rem; min-width: 260px; }
.efield__label { font-size: 0.85rem; font-weight: 600; text-transform: uppercase; color: #b45309; }
.efield__label--mini { font-size: 0.8rem; color: #b45309; margin-left: 0.25rem; }

.efield__controls { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }

.efield__quick { display: inline-flex; gap: 0.35rem; flex-wrap: wrap; }
.efield__quick-btn {
  border: 1px solid rgba(249,115,22,0.35); background: rgba(255,255,255,0.9);
  padding: 0.45rem 0.8rem; border-radius: 12px; cursor: pointer;
  transition: transform .15s ease, box-shadow .15s ease, border-color .2s ease;
}
.efield__quick-btn:hover { transform: translateY(-1px); box-shadow: 0 12px 22px rgba(249,115,22,0.2); }

.efield__picker, .efield__select {
  border-radius: 12px; border: 1px solid rgba(249,115,22,0.35);
  background: rgba(255,255,255,0.9);
  padding: 0.55rem 0.75rem; font-size: 0.95rem; color: #0f172a;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}
.efield__picker:focus-visible, .efield__select:focus-visible {
  outline: none; border-color: #f97316; box-shadow: 0 0 0 3px rgba(249,115,22,0.25);
}

.efield__apply {
  border: none; border-radius: 12px; font-weight: 600; padding: 0.6rem 1.1rem; cursor: pointer;
  background: #f97316; color: #ffffff; box-shadow: 0 10px 20px rgba(249,115,22,0.25);
  transition: transform .15s ease, box-shadow .15s ease;
}
.efield__apply:hover { transform: translateY(-1px); box-shadow: 0 14px 24px rgba(249,115,22,0.35); }

.efield__body { padding: 0 2.5rem 2.25rem; display: flex; flex-direction: column; gap: 1rem; }
.efield__chart-wrapper {
  position: relative; border-radius: 18px; overflow: hidden;
  border: 1px solid rgba(15,23,42,0.08); background: #ffffff;
}
.efield__chart { width: 100%; }

.efield__error { text-align: center; color: #b91c1c; font-size: 0.95rem; font-weight: 500; }

@media (max-width: 768px) {
  .efield { padding: 1rem; }
  .efield__card { border-radius: 20px; }
  .efield__header { padding: 1.5rem 1.75rem 1.25rem; }
  .efield__body { padding: 0 1.75rem 1.75rem; }
  .efield__filters { flex-direction: column; align-items: stretch; }
  .efield__field, .efield__summary { width: 100%; }
}
@media (max-width: 520px) {
  .efield__card { gap: 1.25rem; }
  .efield__title { font-size: 1.65rem; }
}
</style>
