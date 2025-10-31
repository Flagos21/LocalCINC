<!-- src/components/XRayChartFigure.vue -->
<script setup>
import { ref, watch, computed } from 'vue';
import VueApexCharts from 'vue3-apexcharts';

const props = defineProps({
  // Estructura:
  // longBySat:  { '18': [[ts, flux], ...], '19': [...] }
  // shortBySat: { '18': [[ts, flux], ...], '19': [...] }
  // sats: ['18','19', ...]
  longBySat:  { type: Object, required: true },
  shortBySat: { type: Object, required: true },
  sats:       { type: Array,  required: true },
  height:     { type: [Number, String], default: 400 },
});

/* ---------- Utilidades ---------- */
function toLog10Pairs(pairs) {
  const out = [];
  for (let i = 0; i < (pairs?.length || 0); i++) {
    const ts = Number(pairs[i][0]);
    const v  = Number(pairs[i][1]);
    if (!Number.isFinite(ts) || !Number.isFinite(v) || v <= 0) continue;
    out.push([ts, Math.log10(v)]);
  }
  return out;
}

function roundToMinute(ts) { return Math.floor(ts / 60000) * 60000; }

/** Rejilla común (timestamps redondeados a minuto, ordenados) */
function buildCommonGrid(allSeriesPairs) {
  const set = new Set();
  for (const arr of allSeriesPairs) for (const [ts] of arr) set.add(roundToMinute(ts));
  const grid = Array.from(set);
  grid.sort((a, b) => a - b);
  return grid;
}

/** Remuestreo nearest-neighbor con tolerancia */
function resampleNearest(pairsLog, grid, toleranceMs) {
  if (!pairsLog?.length || !grid?.length) return grid.map(ts => [ts, null]);
  let j = 0;
  const out = new Array(grid.length);
  for (let i = 0; i < grid.length; i++) {
    const gts = grid[i];
    while (j < pairsLog.length - 1 && pairsLog[j + 1][0] <= gts) j++;
    let k = j;
    if (j + 1 < pairsLog.length && Math.abs(pairsLog[j + 1][0] - gts) < Math.abs(pairsLog[j][0] - gts)) k = j + 1;
    const best = pairsLog[k];
    out[i] = (Math.abs(best[0] - gts) <= toleranceMs) ? [gts, best[1]] : [gts, null];
  }
  return out;
}

/** Forward-fill + backward-fill para evitar nulls en el hover */
function fillGapsFFillBFill(pairs) {
  const out = pairs.map(p => [p[0], p[1]]);
  let last = null;
  for (let i = 0; i < out.length; i++) {
    if (Number.isFinite(out[i][1])) last = out[i][1];
    else if (last !== null) out[i][1] = last;
  }
  let firstValid = null;
  for (let i = 0; i < out.length; i++) {
    if (Number.isFinite(out[i][1])) { firstValid = out[i][1]; break; }
  }
  if (firstValid !== null) {
    for (let i = 0; i < out.length && !Number.isFinite(out[i][1]); i++) out[i][1] = firstValid;
  }
  return out;
}

/* ---------- Umbrales ---------- */
const thresholds = [
  { y: 1e-7,  label: 'B (1e-7)' },
  { y: 1e-6,  label: 'C (1e-6)' },
  { y: 1e-5,  label: 'M (1e-5)' },
  { y: 1e-4,  label: 'X (1e-4)' },
];
const thrLog = thresholds.map(t => ({ y: Math.log10(t.y), label: t.label }));

/* ---------- Construcción de series alineadas ---------- */
const chartSeries = ref([]);
const gridX = ref([]); // guardamos la grilla para tooltip custom
const TOLERANCE_MS = 120_000;

function rebuildSeries() {
  // 1) log10 de todas las series
  const allLog = [];
  for (const sat of props.sats) {
    allLog.push(toLog10Pairs(props.longBySat[sat]));
    allLog.push(toLog10Pairs(props.shortBySat[sat]));
  }
  // 2) grilla común por minuto
  gridX.value = buildCommonGrid(allLog);

  // 3) remuestreo + fill
  const out = [];
  for (const sat of props.sats) {
    const longLog  = toLog10Pairs(props.longBySat[sat]);
    const shortLog = toLog10Pairs(props.shortBySat[sat]);

    const longAligned  = fillGapsFFillBFill(resampleNearest(longLog,  gridX.value, TOLERANCE_MS));
    const shortAligned = fillGapsFFillBFill(resampleNearest(shortLog, gridX.value, TOLERANCE_MS));

    out.push({ name: `GOES-${sat} Long`,  data: longAligned  });
    out.push({ name: `GOES-${sat} Short`, data: shortAligned });
  }
  chartSeries.value = out;
}

watch(() => [props.longBySat, props.shortBySat, props.sats], rebuildSeries, { deep: true, immediate: true });

/* ---------- Opciones ApexCharts ---------- */
const options = computed(() => ({
  chart: {
    type: 'line',
    height: '100%',
    animations: { enabled: true, easing: 'linear', dynamicAnimation: { speed: 300 } },
    toolbar: { show: true, tools: { download: true, selection: true, zoom: true, zoomin: true, zoomout: true, pan: true } },
    zoom: { enabled: true, type: 'x' },
    foreColor: '#334155',
    background: 'transparent',
  },
  legend: { show: true },
  stroke: { width: 2, curve: 'straight' },
  markers: {
    size: 0,
    strokeWidth: 2,
    fillOpacity: 1,
    strokeOpacity: 1,
    hover: { sizeOffset: 3 }
  },
  xaxis: {
    type: 'datetime',
    tooltip: { enabled: false }, // la tooltip la renderizamos nosotros
    labels: { datetimeUTC: true },
  },
  yaxis: {
    min: -9, max: -2, tickAmount: 7,
    labels: { formatter: (p) => Number.isFinite(p) ? `1e${Math.round(p)}` : '' },
    title: { text: 'Flujo X (W/m²)' },
  },
  grid: { strokeDashArray: 4 },
  annotations: {
    yaxis: thrLog.map(t => ({
      y: t.y,
      borderColor: '#94a3b8',
      label: { text: t.label, style: { background: '#f8fafc', color: '#0f172a' } }
    })),
  },
  colors: ['#ea580c', '#6b21a8', '#f59e0b', '#4c1d95'],

  /* === Tooltip SIEMPRE con todas las series visibles (por índice común) === */
  tooltip: {
    shared: false,
    intersect: false,
    followCursor: true,
    custom: ({ seriesIndex, dataPointIndex, w }) => {
      // si por alguna razón Apex no entrega índice válido, no mostramos nada
      const idx = Number.isInteger(dataPointIndex) && dataPointIndex >= 0 ? dataPointIndex : null;
      if (idx === null) return '';

      // series ocultas (apagadas en leyenda)
      const hidden = new Set(w.globals.collapsedSeriesIndices || []);

      const ts = gridX.value[idx];
      if (!Number.isFinite(ts)) return '';

      const dtStr = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'UTC', hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      }).format(new Date(ts)) + ' UTC';

      const rows = [];
      for (let i = 0; i < w.config.series.length; i++) {
        if (hidden.has(i)) continue; // solo las visibles
        const yLog = w.globals.series[i]?.[idx]; // mismo índice para TODAS
        if (!Number.isFinite(yLog)) continue;
        const name  = w.config.series[i].name;
        const color = (w.config.colors && w.config.colors[i]) || '#999';
        const valStr = (10 ** yLog).toExponential(2) + ' W/m²';
        rows.push({ name, color, valStr });
      }

      if (!rows.length) return '';

      return `
        <div class="apex-custom-tip" style="padding:.55rem .75rem;background:rgba(15,23,42,0.97);color:#f8fafc;border-radius:0.75rem;border:1px solid rgba(148,163,184,0.55);box-shadow:0 18px 38px rgba(15,23,42,0.35);backdrop-filter:none;">
          <div style="font-weight:600;margin-bottom:.35rem;letter-spacing:0.01em;">${dtStr}</div>
          ${rows.map(r => `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:.75rem;">
              <div style="display:flex;align-items:center;gap:.45rem;min-width:11.5rem;">
                <span style="width:.55rem;height:.55rem;border-radius:9999px;background:${r.color};display:inline-block;box-shadow:0 0 0 1px rgba(255,255,255,0.55);"></span>
                <span>${r.name}</span>
              </div>
              <span style="font-family:ui-monospace,Menlo,Consolas,monospace;">${r.valStr}</span>
            </div>
          `).join('')}
        </div>
      `;
    }
  },
}));
</script>

<template>
  <VueApexCharts
    type="line"
    :height="props.height"
    :options="options"
    :series="chartSeries"
  />
</template>

<style scoped>
:deep(.apexcharts-toolbar) {
  backdrop-filter: none;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 0.5rem;
  padding: 0.2rem;
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.2);
}

:deep(.apexcharts-toolbar svg) {
  fill: #0f172a;
  transition: fill 0.2s ease;
}

:deep(.apexcharts-toolbar svg:hover) {
  fill: #0369a1;
}

:deep(.apexcharts-menu) {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 0.5rem;
  box-shadow: 0 15px 30px rgba(15, 23, 42, 0.35);
}

:deep(.apexcharts-menu-item) {
  color: #f8fafc;
  font-weight: 500;
}

:deep(.apexcharts-menu-item:hover) {
  background: rgba(148, 163, 184, 0.3);
}
</style>
