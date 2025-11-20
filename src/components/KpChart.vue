<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import VueApexCharts from 'vue3-apexcharts'

const props = defineProps({
  height: { type: [Number, String], default: 300 },
  days: { type: Number, default: 3 }
})

const raw = ref([])
const updatedAt = ref(null)
const REFRESH_MS = 10 * 60 * 1000

// NOAA COLORS
const NOOA = {
  base: '#8fd26e',
  k5: '#ffe81a',
  k6: '#ffd200',
  k7: '#ff9900',
  k8_9: '#ff0000',
  k9o: '#990000'
}

function colorForKp(k) {
  k = Math.round(Number(k) || 0)
  if (k >= 8) return NOOA.k8_9
  if (k === 7) return NOOA.k7
  if (k === 6) return NOOA.k6
  if (k === 5) return NOOA.k5
  return NOOA.base
}

async function reload() {
  try {
    const res = await fetch(`/api/kp?days=${props.days}`, { cache: 'no-store' })
    const j = await res.json()
    raw.value = j.points || []
    updatedAt.value = j.meta?.lastUpdated || null
  } catch (err) {
    console.error('Kp load error:', err)
  }
}

let timer = null
onMounted(() => {
  reload()
  timer = setInterval(reload, REFRESH_MS)
})
onBeforeUnmount(() => timer && clearInterval(timer))

// ========= BAR SERIES =========
const series = computed(() => [
  {
    name: 'Kp',
    data: raw.value.map(p => ({
      x: new Date(p.ts).getTime(),
      y: Number(p.kp),
      fillColor: colorForKp(p.kp)
    }))
  }
])

// ========= CHART OPTIONS (estilo Dst pero barras) =========
const options = computed(() => ({
  chart: {
    type: 'bar',
    height: '100%',
    toolbar: { show: false },
    animations: { enabled: true, easing: 'easeinout', speed: 300 },
    background: 'transparent',
    foreColor: '#0f172a'
  },
  plotOptions: {
    bar: {
      columnWidth: '60%',
      borderRadius: 0
    }
  },
  stroke: { width: 0 },
  dataLabels: { enabled: false },

  xaxis: {
    type: 'datetime',
    labels: {
      datetimeUTC: true,
      style: { colors: '#475569', fontSize: '11px' }
    },
    tooltip: { enabled: false }
  },

  yaxis: {
    min: 0,
    max: 9,
    tickAmount: 9,
    labels: {
      formatter: v => Number(v).toFixed(0)
    },
    title: { text: 'Kp' }
  },

  grid: {
    borderColor: '#e2e8f0',
    strokeDashArray: 4,
    padding: { left: 12, right: 12 }
  },

  tooltip: {
    theme: 'dark',
    x: {
      formatter(ts) {
        const d = new Date(ts)
        return d.toUTCString().replace(' GMT', ' UTC')
      }
    },
    y: {
      formatter(v) {
        return `${v.toFixed(1)}`
      }
    }
  },

  legend: { show: false }
}))
</script>

<template>
  <div class="kp-card">
    <!-- Solo mostramos la hora de actualización pequeña arriba a la derecha -->
    <header class="kp-header" v-if="updatedAt">
      <small class="kp-upd">
        Actualizado (UTC): {{ new Date(updatedAt).toUTCString().replace(' GMT', ' UTC') }}
      </small>
    </header>

    <div class="kp-body">
      <VueApexCharts type="bar" :options="options" :series="series" :height="height" />

      <div class="kp-x-title">time (UTC)</div>

      <!-- NOAA SCALE (texto SIEMPRE negro) -->
      <div class="kp-scale">
        <div style="background:#8fd26e">G0</div>
        <div style="background:#ffe81a">G1</div>
        <div style="background:#ffd200">G2</div>
        <div style="background:#ff9900">G3</div>
        <div style="background:#ff0000">G4</div>
        <div style="background:#990000">G5</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kp-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 0.75rem;
  padding: 0.75rem;
}

.kp-header {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.3rem;
}

.kp-upd {
  color: #475569;
  font-size: 0.85rem;
}

.kp-body {
  display: flex;
  flex-direction: column;
}

.kp-x-title {
  text-align: center;
  font-size: 11px;
  color: #64748b;
  margin-top: 4px;
}

/* Escala NOAA */
.kp-scale {
  display: flex;
  margin-top: 6px;
  height: 28px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #d1d5db;
}

.kp-scale > div {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: #111827;          /* texto negro para todos */
  border-right: 1px solid rgba(0,0,0,0.08);
}

.kp-scale > div:last-child {
  border-right: none;
}
</style>
