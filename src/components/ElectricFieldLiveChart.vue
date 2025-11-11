<!--
  Componente Vue 3 para mostrar el E_z en vivo dentro de un "tile" del Home.
  - Usa VueApexCharts de forma local (sin depender del registro global).
  - Acepta props para estación, ventana (since), agregación, refresh, límites Y y altura.
  - Clase .efield-live--home para respetar la altura clamp del HomeView.
-->
<script setup>
import { computed } from 'vue'
import VueApexCharts from 'vue3-apexcharts'
import { useEfmLive } from '@/composables/useEfmLive'

// Props simples para configurarlo desde fuera
const props = defineProps({
  station:   { type: String, default: '*' },
  since:     { type: String, default: '10m' },  // ventana corta por defecto
  every:     { type: String, default: '5s' },
  refreshMs: { type: Number, default: 2000 },
  yMin:      { type: Number, default: -0.4 },
  yMax:      { type: Number, default:  0.4 },
  height:    { type: [Number, String], default: '100%' }
})

// Trae datos en vivo (ahora useEfmLive acepta since o range)
const { points, error } = useEfmLive({
  station: props.station,
  since: props.since,
  every: props.every,
  refreshMs: props.refreshMs
})

// Serie
const series = computed(() => [{
  name: 'E_z',
  data: points.value.map(p => [p.t, p.value]) // [timestamp_ms, value]
}])

// Opciones Apex
const chartOptions = computed(() => ({
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
  colors: ['#f97316'],
  stroke: { width: 2, curve: 'straight', dashArray: 0 },
  markers: { size: 0, strokeWidth: 2, hover: { sizeOffset: 3 } },
  xaxis: {
    type: 'datetime',
    labels: { datetimeUTC: true },
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
  annotations: { yaxis: [{ y: 0, borderColor: '#94a3b8', strokeDashArray: 6, opacity: 0.7 }] },
  tooltip: {
    theme: 'dark',
    shared: true,
    intersect: false,
    x: { format: 'yyyy-MM-dd HH:mm:ss' },
    y: { formatter: (v) => (Number.isFinite(v) ? `${v.toFixed(2)} kV/m` : '—') }
  },
  noData: { text: 'Cargando campo eléctrico…', style: { color: '#64748b', fontSize: '14px' } }
}))
</script>

<template>
  <div class="efield-live-card">
    <VueApexCharts
      type="line"
      class="efield-live--home efield-live__chart"
      :height="height"
      :options="chartOptions"
      :series="series" />
    <p v-if="error" class="efield-live__error">⚠️ {{ error }}</p>
  </div>
</template>

<style scoped>
.efield-live-card {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.efield-live__chart { width: 100%; }

.efield-live__error {
  margin-top: .5rem;
  color: #b91c1c;
  font-size: .95rem;
  text-align: center;
}
</style>
