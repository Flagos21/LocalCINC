<template>
  <div class="kp-card">
    <div class="kp-meta" v-if="updatedAt">
      <small class="muted">Actualizado: {{ fmtLocal(updatedAt) }}</small>
    </div>

    <div class="kp-body">
      <ApexChart
        v-if="series.length && series[0].data.length"
        type="bar"
        :height="height"
        :options="options"
        :series="series"
      />
      <div v-else class="kp-empty">Sin datos.</div>

      <div v-if="dayLabels.length" class="kp-day-labels">
        <span v-for="label in dayLabels" :key="label">{{ label }}</span>
      </div>

      <!-- Leyenda NOAA -->
      <div class="noaa-scale">
        <div class="seg" :style="{ background: NOOA_COLORS.base }"><span>G0</span></div>
        <div class="seg" :style="{ background: NOOA_COLORS.k5 }"><span>G1</span></div>
        <div class="seg" :style="{ background: NOOA_COLORS.k6 }"><span>G2</span></div>
        <div class="seg" :style="{ background: NOOA_COLORS.k7 }"><span>G3</span></div>
        <div class="seg" :style="{ background: NOOA_COLORS.k8_9 }"><span>G4</span></div>
        <div class="seg" :style="{ background: NOOA_COLORS.k9o }"><span>G5</span></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import ApexChart from 'vue3-apexcharts'

const props = defineProps({ height: { type: [Number, String], default: 300 } })

const updatedAt = ref(null)
const raw = ref([]) // [{ ts, kp }]
const DAYS = 3
const AUTO_REFRESH_MS = 10 * 60 * 1000

function fmtLocal(iso) {
  try {
    return new Date(iso).toLocaleString('es-CL', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

async function reload() {
  try {
    const res = await fetch(`/api/kp?days=${DAYS}`, { cache: 'no-store' })
    const j = await res.json()
    raw.value = Array.isArray(j.points) ? j.points : []
    updatedAt.value = j?.meta?.lastUpdated ?? null
  } catch (e) {
    console.error('kp reload failed:', e)
  }
}

let timer = null
onMounted(() => {
  reload()
  timer = setInterval(reload, AUTO_REFRESH_MS)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

// Paleta NOAA
const NOOA_COLORS = {
  base: '#8fd26e',
  k5: '#ffe81a',
  k6: '#ffd200',
  k7: '#ff9900',
  k8_9: '#ff0000',
  k9o: '#990000',
}
function colorForKp(v) {
  const k = Math.max(0, Math.min(9, Math.round(Number(v) || 0)))
  if (k >= 8) return NOOA_COLORS.k8_9
  if (k === 7) return NOOA_COLORS.k7
  if (k === 6) return NOOA_COLORS.k6
  if (k === 5) return NOOA_COLORS.k5
  return NOOA_COLORS.base
}

// Serie (idéntica a tu flujo, sin min/max forzados)
const series = computed(() => {
  const data = raw.value
    .filter((p) => p && p.ts != null)
    .map((p) => {
      const x = new Date(p.ts).getTime()
      const y = Number(p.kp)
      return { x, y, fillColor: colorForKp(y), strokeColor: '#ffffff' }
    })
  return [{ name: 'Kp', data }]
})

const DATE_FMT = new Intl.DateTimeFormat('es-CL', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

function formatUtcLabel(date) {
  const raw = DATE_FMT.format(date)
  return raw.replace(/(^|\s)([a-záéíóúñ])/g, (match, p1, p2) => p1 + p2.toUpperCase())
}
const options = computed(() => {
  return {
    chart: {
      animations: { enabled: true },
      toolbar: {
        show: true,
        tools: {
          download: true,
          selection: false,
          zoom: false,
          zoomin: false,
          zoomout: false,
          pan: false,
          reset: false,
        },
        export: {
          csv: {
            filename: 'kp-index',
            headerCategory: 'Inicio ventana (UTC)',
            headerValue: 'Kp',
          },
          svg: { filename: 'kp-index' },
          png: { filename: 'kp-index' },
        },
      },
      zoom: { enabled: false },
      foreColor: '#4b5563',
    },
    plotOptions: { bar: { columnWidth: '55%', borderRadius: 0, distributed: false } },
    fill: { type: 'solid', opacity: 1 },
    colors: ['#8fd26e'],
    dataLabels: { enabled: false },
    grid: { borderColor: '#e5e7eb', strokeDashArray: 4 },
    legend: { show: false },

    xaxis: {
      type: 'datetime',
      tickPlacement: 'on',
      labels: {
        datetimeUTC: true,
        rotate: 0,
        formatter: (val, timestamp) => {
          const time = Number(timestamp)
          if (!Number.isFinite(time)) return ''
          const date = new Date(time)
          if (Number.isNaN(date.getTime()) || date.getUTCHours() !== 0) return ''
          return formatUtcLabel(date)
        },
        style: {
          fontSize: '11px',
          colors: '#4b5563',
          fontWeight: 500,
        },
      },
      axisBorder: { show: false },
      axisTicks: { show: true, color: '#d1d5db' },
      title: {
        text: 'time (UTC)',
        style: { fontSize: '12px', color: '#6b7280', fontWeight: 500 },
      },
    },

    yaxis: {
      min: 0,
      max: 9,
      tickAmount: 9,
      labels: { formatter: (v) => Number(v).toFixed(0) },
      title: { text: 'Kp index', style: { fontSize: '12px', color: '#6b7280' } },
    },

    tooltip: {
      shared: false,
      intersect: false,
      x: {
        formatter: (ts) => {
          const n = typeof ts === 'number' ? ts : Number(ts)
          if (!Number.isFinite(n)) return ''
          const start = new Date(n)
          const end = new Date(n + 3 * 3600 * 1000)
          const fmtStart = new Intl.DateTimeFormat('es-CL', {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'UTC',
          }).format(start)
          const hhmmEnd = end.toISOString().slice(11, 16)
          return `${fmtStart} – ${hhmmEnd} UTC`
        },
      },
      y: { formatter: (v) => Number(v).toFixed(1) },
    },
  }
})

const dayLabels = computed(() => {
  const firstSeries = series.value?.[0]?.data ?? []
  const stamps = firstSeries
    .map((point) => Number(point?.x))
    .filter((stamp) => Number.isFinite(stamp))

  if (!stamps.length) return []

  stamps.sort((a, b) => a - b)

  const first = new Date(stamps[0])
  const last = new Date(stamps[stamps.length - 1])

  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) return []

  const startMidnight = Date.UTC(
    first.getUTCFullYear(),
    first.getUTCMonth(),
    first.getUTCDate()
  )
  const endMidnight = Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate())

  const labels = []
  for (
    let cursor = startMidnight;
    cursor <= endMidnight;
    cursor += 24 /* hours */ * 3600 * 1000
  ) {
    labels.push(formatUtcLabel(new Date(cursor)))
  }

  return labels
})
</script>

<style scoped>
.kp-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
}
.kp-meta {
  display: flex;
  justify-content: flex-end;
  padding: 10px 12px 0;
}
.muted {
  color: #6b7280;
}
.kp-body {
  padding: 8px 12px 12px;
}

.kp-day-labels {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 6px;
  padding: 0 4px;
  font-size: 12px;
  color: #4b5563;
}

.kp-day-labels span {
  flex: 1 1 0;
  text-align: center;
  font-weight: 500;
  white-space: nowrap;
}
.kp-empty {
  color: #6b7280;
  font-size: 13px;
  padding: 16px 0;
  text-align: center;
}

.noaa-scale {
  display: flex;
  margin-top: 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  overflow: hidden;
}
.noaa-scale .seg {
  flex: 1 1 0%;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  font-size: 12px;
  color: #111827;
  font-weight: 600;
  border-right: 1px solid rgba(0, 0, 0, 0.08);
}
.noaa-scale .seg:nth-child(6) {
  color: #fff;
}
.noaa-scale .seg:last-child {
  border-right: 0;
}

:deep(.apexcharts-toolbar) {
  backdrop-filter: none;
  background: #ffffff;
  border-radius: 0.5rem;
  border: 1px solid #cbd5f5;
  padding: 0.2rem;
  box-shadow: none;
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
