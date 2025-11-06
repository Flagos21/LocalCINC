<template>
  <div class="kp-card">
    <div class="kp-header">
      <div class="kp-title">
        <strong>Índice geomagnético Kp</strong>
        <small class="muted">Serie de barras de 3 h. Fuente: {{ provider }}</small>
      </div>

      <div class="kp-actions">
        <label>Días:
          <select v-model.number="days">
            <option :value="3">3</option>
            <option :value="5">5</option>
            <option :value="7">7</option>
            <option :value="10">10</option>
          </select>
        </label>
        <button class="kp-btn" @click="reload" :disabled="loading">Actualizar</button>
        <small class="muted" v-if="updatedAt">Actualizado: {{ fmtLocal(updatedAt) }}</small>
      </div>
    </div>

    <div class="kp-body">
      <ApexChart v-if="series.length"
                 type="bar"
                 :height="height"
                 :options="options"
                 :series="series" />
      <div v-else class="kp-empty">Sin datos.</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import ApexChart from 'vue3-apexcharts'

const props = defineProps({
  height: { type: [Number, String], default: 280 }
})

const days = ref(3)
const loading = ref(false)
const updatedAt = ref(null)
const provider = ref('—')
const raw = ref([]) // [{ ts, kp }]

const AUTO_REFRESH_MS = 15 * 60 * 1000

function fmtLocal(iso) {
  try { return new Date(iso).toLocaleString() } catch { return iso }
}

async function reload () {
  loading.value = true
  try {
    const res = await fetch(`/api/kp?days=${days.value}`)
    const j = await res.json()
    raw.value = Array.isArray(j.points) ? j.points : []
    updatedAt.value = j?.meta?.lastUpdated ?? null
    provider.value   = j?.meta?.provider ?? '—'
  } catch (e) {
    console.error('kp reload failed:', e)
  } finally {
    loading.value = false
  }
}

let timer = null
onMounted(() => {
  reload()
  timer = setInterval(reload, AUTO_REFRESH_MS)
})
onBeforeUnmount(() => { if (timer) clearInterval(timer) })
watch(days, () => reload())

// --------- Series ----------
const series = computed(() => {
  const data = raw.value.map(p => ({
    x: new Date(p.ts).getTime(),
    y: Number(p.kp)
  }))
  return [{ name: 'Kp', data }]
})

// --------- Opciones estilo GFZ ----------
const options = computed(() => ({
  chart: {
    animations: { enabled: true },
    toolbar: { show: false },
    zoom: { enabled: false },
    foreColor: '#4b5563' // gris suave
  },
  plotOptions: {
    bar: {
      columnWidth: '65%',
      borderRadius: 2,
      distributed: true,
      colors: {
        ranges: [
          { from: 0,   to: 2.99, color: '#22c55e' }, // verde
          { from: 3,   to: 4.99, color: '#eab308' }, // amarillo
          { from: 5,   to: 9,    color: '#ef4444' }  // rojo
        ]
      }
    }
  },
  grid: {
    borderColor: '#e5e7eb',
    strokeDashArray: 4
  },
  dataLabels: { enabled: false },
  legend: { show: false }, // ← sin leyenda
  xaxis: {
    type: 'datetime',
    tickPlacement: 'between',
    // Sólo rotular a medianoche UTC para verse como GFZ
    labels: {
      datetimeUTC: true,
      rotate: 0,
      formatter: (ts) => {
        const d = new Date(Number(ts))
        return d.getUTCHours() === 0
          ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d)
          : '' // horas intermedias sin etiqueta
      },
      trim: true
    },
    axisBorder: { show: false },
    axisTicks: { show: false }
  },
  yaxis: {
    min: 0, max: 9, tickAmount: 9,
    decimalsInFloat: 0,
    labels: { formatter: (v) => v.toFixed(0) }
  },
  tooltip: {
    shared: false,
    intersect: false,
    x: {
      formatter: (ts) => {
        const d = new Date(ts)
        // Ej: Thu, 06 Nov 2025 21:00 UTC
        return new Intl.DateTimeFormat('en-GB', {
          weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC'
        }).format(d) + ' UTC'
      }
    },
    y: { formatter: (v) => Number(v).toFixed(1) } // 1 decimal como en GFZ
  }
}))
</script>

<style scoped>
.kp-card { background:#fff; border:1px solid #e5e7eb; border-radius:10px; overflow:hidden; }
.kp-header { display:flex; justify-content:space-between; align-items:flex-start; padding:10px 12px; border-bottom:1px solid #e5e7eb; }
.kp-title { display:flex; flex-direction:column; gap:2px; }
.muted { color:#6b7280; }
.kp-actions { display:flex; gap:10px; align-items:center; font-size:12px; color:#666; }
.kp-btn { padding:4px 10px; border:1px solid #1f2937; background:#1f2937; color:#fff; border-radius:6px; cursor:pointer; }
.kp-btn:disabled { opacity:.6; cursor:default; }
.kp-body { padding:10px 12px 12px; }
.kp-empty { color:#6b7280; font-size:13px; padding:16px 0; text-align:center; }
</style>
