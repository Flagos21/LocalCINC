<script setup>
import { ref, watch, computed } from 'vue';
import VueApexCharts from 'vue3-apexcharts';

const props = defineProps({
  // Arrays como [[tsMs, flux], ...]
  longSeries: { type: Array, required: true },
  shortSeries: { type: Array, required: true },
});

/* ---------- Utilidades ---------- */
function toLog10Pairs(pairs) {
  // Transforma [ts, y] -> [ts, log10(y)] filtrando y<=0
  const out = [];
  for (let i = 0; i < pairs.length; i++) {
    const ts = Number(pairs[i][0]);
    const v = Number(pairs[i][1]);
    if (!Number.isFinite(ts) || !Number.isFinite(v) || v <= 0) continue;
    out.push([ts, Math.log10(v)]);
  }
  return out;
}
const thresholds = [
  { y: 1e-7,  label: 'B (1e-7)' },
  { y: 1e-6,  label: 'C (1e-6)' },
  { y: 1e-5,  label: 'M (1e-5)' },
  { y: 1e-4,  label: 'X (1e-4)' },
];
// umbrales convertidos a log10
const thrLog = thresholds.map(t => ({ y: Math.log10(t.y), label: t.label }));

/* ---------- Series (transformadas a log10) ---------- */
const chartSeries = ref([]);
function rebuildSeries() {
  chartSeries.value = [
    { name: 'Long 0.1–0.8 nm (XRS-B)', data: toLog10Pairs(props.longSeries) },
    { name: 'Short 0.05–0.4 nm (XRS-A)', data: toLog10Pairs(props.shortSeries) },
  ];
}
watch(() => [props.longSeries, props.shortSeries], rebuildSeries, { deep: true, immediate: true });

/* ---------- Opciones ApexCharts (eje Y lineal en log10) ---------- */
const options = computed(() => ({
  chart: {
    type: 'line',
    height: 380,
    animations: { enabled: true, easing: 'linear', dynamicAnimation: { speed: 300 } },
    toolbar: { show: true, tools: { download: true, selection: true, zoom: true, zoomin: true, zoomout: true, pan: true } },
    zoom: { enabled: true, type: 'x' },
    foreColor: '#334155',
    background: 'transparent',
  },
  legend: { show: true },
  stroke: { width: 2, curve: 'straight' },
  xaxis: {
    type: 'datetime',
    tooltip: { enabled: false },
    labels: { datetimeUTC: true },
  },
  // NOTA: aquí el eje Y es LINEAL mostrando log10(flux)
  yaxis: {
    min: -9,   // 1e-9
    max: -2,   // 1e-2
    tickAmount: 7,
    labels: {
      formatter: (p) => {
        if (!Number.isFinite(p)) return '';
        const k = Math.round(p);
        return `1e${k}`;
      },
    },
    title: { text: 'Flujo X (W/m²)' },
  },
  tooltip: {
    shared: true,
    x: { format: "yyyy-MM-dd HH:mm 'UTC'" },
    // Convertimos de vuelta: 10^(log10(v))
    y: { formatter: (p) => (Number.isFinite(p) ? (10 ** p).toExponential(2) + ' W/m²' : '-') }
  },
  grid: { strokeDashArray: 4 },
  annotations: {
    yaxis: thrLog.map(t => ({
      y: t.y,
      borderColor: '#94a3b8',
      label: { text: t.label, style: { background: '#f8fafc', color: '#0f172a' } }
    })),
  },
}));
</script>

<template>
  <VueApexCharts type="line" :height="400" :options="options" :series="chartSeries" />
</template>

<style scoped>
/* opcional */
</style>
