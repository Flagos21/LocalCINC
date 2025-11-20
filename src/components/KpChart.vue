<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import VueApexCharts from 'vue3-apexcharts'

import { formatUtcDateTime } from '@/utils/formatUtcDate'

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
    const series = Array.isArray(j.series) ? j.series : j.points

    raw.value = Array.isArray(series)
      ? series
        .map((item) => ({
          ts: Number(item?.ts) || Date.parse(item?.time),
          kp: Number(item?.kp ?? item?.value)
        }))
        .filter((item) => Number.isFinite(item.ts) && Number.isFinite(item.kp))
      : []

    updatedAt.value = j.updatedAt || j.meta?.lastUpdated || null
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

const lastPoint = computed(() => {
  if (!raw.value.length) return null

  const sorted = raw.value
    .map((point) => ({ ts: Number(point?.ts), kp: Number(point?.kp) }))
    .filter((point) => Number.isFinite(point.ts) && Number.isFinite(point.kp))
    .sort((a, b) => a.ts - b.ts)

  return sorted.at(-1) || null
})

const lastValueLabel = computed(() => {
  if (!lastPoint.value) return '—'
  return lastPoint.value.kp.toFixed(1)
})

const lastTimeLabel = computed(() => {
  if (!lastPoint.value) return '—'
  return formatUtcDateTime(lastPoint.value.ts)
})

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
    <header class="kp-header">
      <div class="kp-summary">
        <span class="kp-label">Último (Kp)</span>
        <span class="kp-value">{{ lastValueLabel }}</span>
        <span class="kp-time">{{ lastTimeLabel }}</span>
      </div>

      <small v-if="updatedAt" class="kp-upd">
        Actualizado: {{ formatUtcDateTime(updatedAt, { includeSeconds: false }) }}
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
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.5rem;
  margin-bottom: 0.3rem;
}

.kp-upd {
  color: #475569;
  font-size: 0.85rem;
}

.kp-summary {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.1rem;
  text-align: right;
}

.kp-label {
  font-size: 0.85rem;
  color: #475569;
}

.kp-value {
  font-size: 1.65rem;
  font-weight: 600;
  color: #0f172a;
  line-height: 1.2;
}

.kp-time {
  font-size: 0.85rem;
  color: #475569;
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
