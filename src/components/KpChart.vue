<template>
  <div class="kp-card">
    <div class="kp-header">
      <div class="kp-title">
        <strong>Índice geomagnético Kp</strong>
        <small class="muted">Serie de barras de 3 h. Fuente: {{ provider }}</small>
      </div>
      <small class="muted" v-if="updatedAt">Actualizado: {{ fmtLocal(updatedAt) }}</small>
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

      <!-- Leyenda NOAA -->
      <div class="noaa-scale">
        <div class="seg" :style="{background: NOOA_COLORS.base}"><span>Kp &lt; 5</span></div>
        <div class="seg" :style="{background: NOOA_COLORS.k5}"><span>Kp = 5 (G1)</span></div>
        <div class="seg" :style="{background: NOOA_COLORS.k6}"><span>Kp = 6 (G2)</span></div>
        <div class="seg" :style="{background: NOOA_COLORS.k7}"><span>Kp = 7 (G3)</span></div>
        <div class="seg" :style="{background: NOOA_COLORS.k8_9}"><span>Kp = 8, 9 (G4)</span></div>
        <div class="seg" :style="{background: NOOA_COLORS.k9o}"><span>Kp = 9o (G5)</span></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import ApexChart from 'vue3-apexcharts'

const props = defineProps({ height: { type: [Number, String], default: 300 } })

const updatedAt = ref(null)
const provider  = ref('—')
const raw       = ref([]) // [{ ts, kp }]
const DAYS      = 3
const AUTO_REFRESH_MS = 10 * 60 * 1000

function fmtLocal(iso) { try { return new Date(iso).toLocaleString() } catch { return iso } }

async function reload () {
  try {
    const res = await fetch(`/api/kp?days=${DAYS}`)
    const j = await res.json()
    raw.value       = Array.isArray(j.points) ? j.points : []
    updatedAt.value = j?.meta?.lastUpdated ?? null
    provider.value  = j?.meta?.provider ?? '—'
  } catch (e) {
    console.error('kp reload failed:', e)
  }
}

let timer = null
onMounted(() => { reload(); timer = setInterval(reload, AUTO_REFRESH_MS) })
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

// Paleta NOAA
const NOOA_COLORS = {
  base:  '#8fd26e', k5: '#ffe81a', k6: '#ffd200', k7: '#ff9900', k8_9: '#ff0000', k9o: '#990000'
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
    .filter(p => p && p.ts != null)
    .map(p => {
      const x = new Date(p.ts).getTime()
      const y = Number(p.kp)
      return { x, y, fillColor: colorForKp(y), strokeColor: '#ffffff' }
    })
  return [{ name: 'Kp', data }]
})

const options = computed(() => ({
  chart: {
    animations: { enabled: true },
    toolbar: { show: false },
    zoom: { enabled: false },
    foreColor: '#4b5563'
  },
  plotOptions: { bar: { columnWidth: '65%', borderRadius: 2, distributed: false } },
  fill: { type: 'solid', opacity: 1 },
  colors: ['#8fd26e'],
  dataLabels: { enabled: false },
  grid: { borderColor: '#e5e7eb', strokeDashArray: 4 },
  legend: { show: false },

  // 🔹 Reemplaza solo desde aquí:
xaxis: {
  type: 'datetime',
  tickAmount: 24,           // fuerza ticks regulares
  tickPlacement: 'on',      // ticks sobre las barras
  labels: {
    datetimeUTC: true,
    rotate: 0,
    formatter: (val, timestamp, opts) => {
      const d = new Date(Number(val))
      const hour = String(d.getUTCHours()).padStart(2, '0') + ':00'
      const dayChange = d.getUTCHours() === 0
      // fecha solo cuando cambia el día
      if (dayChange) {
        const dateLbl = new Intl.DateTimeFormat('en-GB', {
          day: 'numeric',
          month: 'short',
          timeZone: 'UTC'
        }).format(d)
        return `${dateLbl}\n${hour}`  // fecha arriba, hora abajo
      }
      return hour                    // resto solo hora
    },
    style: {
      fontSize: '11px',
      colors: '#4b5563',
      fontWeight: 500,
      whiteSpace: 'pre'              // permite el salto de línea
    }
  },
  axisBorder: { show: false },
  axisTicks:  { show: true, color: '#d1d5db' },
  title: {
    text: 'Universal Time',
    style: { fontSize: '12px', color: '#6b7280' }
  }
},

  // 🔹 hasta aquí
  yaxis: {
    min: 0, max: 9, tickAmount: 9,
    labels: { formatter: (v) => Number(v).toFixed(0) },
    title: { text: 'Kp index', style: { fontSize: '12px', color: '#6b7280' } }
  },

  tooltip: {
    shared: false, intersect: false,
    x: {
      formatter: (ts) => {
        const n = typeof ts === 'number' ? ts : Number(ts)
        if (!Number.isFinite(n)) return ''
        const start = new Date(n)
        const end   = new Date(n + 3*3600*1000)
        const fmtStart = new Intl.DateTimeFormat('en-GB', {
          weekday:'short', day:'2-digit', month:'short', year:'numeric',
          hour:'2-digit', minute:'2-digit', hour12:false, timeZone:'UTC'
        }).format(start)
        const hhmmEnd = end.toISOString().slice(11,16)
        return `${fmtStart} – ${hhmmEnd} UTC`
      }
    },
    y: { formatter: v => Number(v).toFixed(1) }
  }
}))
</script>

<style scoped>
.kp-card  { background:#fff; border:1px solid #e5e7eb; border-radius:10px; overflow:hidden; }
.kp-header{ display:flex; justify-content:space-between; align-items:flex-start; padding:10px 12px; border-bottom:1px solid #e5e7eb; }
.kp-title { display:flex; flex-direction:column; gap:2px; }
.kp-title strong { color:#111827; } /* Título en negro */
.muted    { color:#6b7280; }
.kp-body  { padding:10px 12px 12px; }
.kp-empty { color:#6b7280; font-size:13px; padding:16px 0; text-align:center; }

.noaa-scale { display:flex; margin-top:10px; border:1px solid #d1d5db; border-radius:6px; overflow:hidden; }
.noaa-scale .seg {
  flex: 1 1 0%;
  display:flex; align-items:center; justify-content:center;
  height:28px; font-size:12px; color:#111827; font-weight:600;
  border-right:1px solid rgba(0,0,0,.08);
}
.noaa-scale .seg:nth-child(6) { color:#fff; }
.noaa-scale .seg:last-child { border-right:0; }
</style>
