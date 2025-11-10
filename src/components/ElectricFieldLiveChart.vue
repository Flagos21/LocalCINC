<script setup>
import { computed } from 'vue';
import { useEfmLive } from '@/composables/useEfmLive';

// Props simples para configurarlo desde fuera
const props = defineProps({
  station: { type: String, default: '*' },
  since:   { type: String, default: '10m' },
  every:   { type: String, default: '5s' },
  refreshMs: { type: Number, default: 2000 },
  yMin: { type: Number, default: -0.4 }, // <- límites Y como pediste
  yMax: { type: Number, default:  0.4 },
  height: { type: [Number, String], default: 300 }
});

// Trae datos en vivo
const { points, error } = useEfmLive({
  station: props.station,
  since: props.since,
  every: props.every,
  refreshMs: props.refreshMs
});

// ---- ApexCharts ----
// Si ya registraste el plugin global en main.js (app.use(VueApexCharts)),
// usa la etiqueta <apexchart>. Si no, te dejo indicaciones más abajo.
const series = computed(() => [{
  name: 'E_z',
  data: points.value.map(p => [p.t, p.value]) // [timestamp_ms, value]
}]);

const chartOptions = computed(() => ({
  chart: { id: 'efm-live', type: 'line', animations: { enabled: true } },
  stroke: { curve: 'straight', width: 2 },
  xaxis: { type: 'datetime' },
  yaxis: { min: props.yMin, max: props.yMax, decimalsInFloat: 2 },
  tooltip: { x: { format: 'dd-MM-yyyy HH:mm:ss' } }
}));
</script>

<template>
  <div class="p-4 rounded-xl border">
    <apexchart :options="chartOptions" :series="series" :height="height" />
    <p v-if="error" class="text-red-500 mt-2">Error: {{ error }}</p>
  </div>
</template>
