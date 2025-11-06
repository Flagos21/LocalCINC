<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import ApexChart from 'vue3-apexcharts'

// ===== Parámetros =====
const DAYS_WINDOW = 8                  // cuántos días mostrar inicialmente
const MIN_POINTS = 16                  // mínimo de barras para que se vea lleno
const MAX_POINTS = 80                  // evita cargas excesivas
const AUTO_REFRESH_MS = 10 * 60 * 1000 // 10 minutos
const AGGREGATION = 'max'              // 'max' | 'mean' dentro de cada 3h

// ===== Estado UI =====
const props = defineProps({
  embedded: { type: Boolean, default: false },
  height: { type: [Number, String], default: 280 }
})

const loading   = ref(false)
const updatedAt = ref(null)
const series    = ref([{ name: 'Kp (3h)', data: [] }])
const options   = ref({
  chart: {
    type: 'bar',
    height: 280,
    animations: { enabled: true, speed: 250 },
    toolbar: { show: false },
    foreColor: '#444'
  },
  plotOptions: {
    bar: {
      columnWidth: '82%',
      distributed: true,    // color por barra
      borderRadius: 2,
      dataLabels: {
        position: 'top'
      }
    }
  },
  dataLabels: {
    enabled: true,
    formatter: val => (Math.round(val * 10) / 10).toString(),
    style: {
      colors: ['#1f2933'],
      fontSize: '12px',
      fontWeight: 500
    },
    offsetY: -6
  },
  grid: { borderColor: '#eaecef', strokeDashArray: 3 },
  xaxis: {
    type: 'datetime',
    tickPlacement: 'on',
    // Etiquetas en el eje: muestra día + hora UTC
    labels: {
      datetimeUTC: true,
      rotate: -30,
      offsetY: 4,
      formatter: (value) => {
        if (!value) return ''
        const d = new Date(Number(value))
        return new Intl.DateTimeFormat('es-CL', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          timeZone: 'UTC'
        }).format(d)
      }
    },
    axisBorder: { show: true },
    axisTicks: { show: false }
  },
  yaxis: {
    min: 0,
    max: 9,
    tickAmount: 9,
    decimalsInFloat: 0,
    title: { text: 'Kp index' }
  },
  tooltip: {
    shared: false,
    x: {
      formatter: (val, { dataPointIndex }) => {
        const p = lastDisplayed?.[dataPointIndex]
        const ts = p?.x ?? val
        return new Date(ts).toLocaleString('es-CL', {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: 'UTC'
        }) + ' UTC'
      }
    },
    y: { formatter: (v) => (Math.round(v * 10) / 10).toString() }
  },
  legend: { show: false },
  colors: [] // la llenamos con un color por punto
})

const chartHeight = computed(() => props.height)

watch(
  () => props.height,
  (value) => { options.value.chart.height = value }
)
options.value.chart.height = props.height

// ===== Utilidades =====
function kpColor(v) {
  if (v < 4) return '#2e7d32'  // verde (quiet)
  if (v < 6) return '#fbc02d'  // amarillo (active)
  if (v < 8) return '#fb8c00'  // naranja (G1-G2)
  return '#c62828'             // rojo (G3+)
}

/** Redondea al inicio de su ventana 3h (UTC) */
function binStart3h(iso) {
  const d = new Date(iso)
  const h = d.getUTCHours()
  const startH = Math.floor(h / 3) * 3
  d.setUTCHours(startH, 0, 0, 0)
  return d.getTime() // trabajamos con epoch para Apex
}

/** Agrupa valores arbitrarios a 3h con AGGREGATION */
function groupTo3h(points) {
  const bins = new Map()
  for (const p of points) {
    if (!p?.x || !Number.isFinite(p?.y)) continue
    const b = binStart3h(p.x)
    const arr = bins.get(b) ?? []
    arr.push(p.y)
    bins.set(b, arr)
  }

  const out = []
  for (const [b, arr] of bins) {
    if (!arr.length) continue
    let y
    if (AGGREGATION === 'mean') {
      y = arr.reduce((a, c) => a + c, 0) / arr.length
    } else {
      y = Math.max(...arr)
    }
    out.push({ x: b, y })
  }
  out.sort((a, b) => a.x - b.x)
  return out
}

let timer = null
let lastDisplayed = []

async function loadData() {
  try {
    loading.value = true

    // Pedimos muchos puntos; el backend devolverá lo que tenga.
    const res = await fetch('/api/kp?last=2000', { cache: 'no-cache' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()

    updatedAt.value = json.updatedAt ?? null

    // Normaliza a {x: ISO, y: kp}
    const raw = (json.series ?? [])
      .map(p => ({ x: p.time, y: Number(p.value) }))
      .filter(p => Number.isFinite(p.y))

    // Bin 3h
    let binned = groupTo3h(raw)

    // Ventana deslizante últimos N días
    const now = Date.now()
    const startWin = now - DAYS_WINDOW * 24 * 60 * 60 * 1000
    let displayed = binned.filter(p => p.x >= startWin)

    if (displayed.length < MIN_POINTS) {
      const sliceCount = Math.min(MAX_POINTS, binned.length)
      displayed = binned.slice(-sliceCount)
    }

    lastDisplayed = displayed

    // Asigna datos y colores
    series.value = [{ name: 'Kp (3h)', data: displayed }]
    options.value.colors = displayed.map(p => kpColor(p.y))

    // Opcional: fija min/max del eje X al rango solicitado
    if (displayed.length) {
      const first = displayed[0].x
      const last = displayed[displayed.length - 1].x
      const span = Math.max(3 * 60 * 60 * 1000, last - first + 3 * 60 * 60 * 1000)
      options.value.xaxis.min = first
      options.value.xaxis.max = first + span
      options.value.xaxis.tickAmount = Math.min(displayed.length, 16)
    } else {
      options.value.xaxis.min = undefined
      options.value.xaxis.max = undefined
      options.value.xaxis.tickAmount = undefined
    }
  } catch (e) {
    console.error('[KpChart] loadData error:', e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadData()
  timer = setInterval(loadData, AUTO_REFRESH_MS)
})
onBeforeUnmount(() => { if (timer) clearInterval(timer) })
</script>

<template>
  <div :class="['kp-card', { 'kp-card--embedded': props.embedded }]">
    <div :class="['kp-header', { 'kp-header--embedded': props.embedded }]">
      <strong>Índice geomagnético Kp (GFZ) — 3 h</strong>
      <div class="kp-actions">
        <span class="kp-updated">
          {{ updatedAt ? new Date(updatedAt).toUTCString() : '—' }}
        </span>
        <button class="kp-btn" :disabled="loading" @click="loadData">
          {{ loading ? 'Cargando…' : 'Refrescar' }}
        </button>
      </div>
    </div>

    <div :class="['kp-body', { 'kp-body--embedded': props.embedded }]">
      <ApexChart type="bar" :height="chartHeight" :options="options" :series="series" />
      <div class="kp-legend" :class="{ 'kp-legend--embedded': props.embedded }">
        <span><i class="dot" style="background:#2e7d32"></i> Kp &lt; 4</span>
        <span><i class="dot" style="background:#fbc02d"></i> 4 ≤ Kp &lt; 6</span>
        <span><i class="dot" style="background:#fb8c00"></i> 6 ≤ Kp &lt; 8</span>
        <span><i class="dot" style="background:#c62828"></i> Kp ≥ 8</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kp-card { border: 1px solid #e9ecef; border-radius: 10px; overflow: hidden; background: #fff; }
.kp-card--embedded { border: none; background: transparent; box-shadow: none; padding: 0; }
.kp-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: #fafafa; border-bottom: 1px solid #eee; }
.kp-header--embedded { background: transparent; border-bottom: none; padding: 0 0 0.5rem; }
.kp-actions { display: flex; gap: 10px; align-items: center; font-size: 12px; color: #666; }
.kp-header--embedded .kp-actions { gap: 0.5rem; flex-wrap: wrap; justify-content: flex-end; font-size: 0.8rem; }
.kp-header--embedded .kp-updated { color: #475569; }
.kp-header--embedded .kp-btn { font-size: 0.8rem; padding: 3px 7px; }
.kp-btn { font-size: 12px; padding: 4px 8px; border: 1px solid #1976d2; background: #1976d2; color: #fff; border-radius: 6px; cursor: pointer; }
.kp-btn:disabled { opacity: .6; cursor: default; }
.kp-body { padding: 8px 10px 12px; }
.kp-body--embedded { padding: 0; }
.kp-legend { display: flex; gap: 12px; font-size: 12px; color: #666; margin-top: 6px; flex-wrap: wrap; }
.kp-legend--embedded { margin-top: 0.75rem; }
.dot { display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:6px; vertical-align:middle; }
</style>
