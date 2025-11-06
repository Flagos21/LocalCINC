<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import ApexChart from 'vue3-apexcharts'

// ===== Parámetros =====
const DAYS_WINDOW = 4                  // cuántos días mostrar (deslizante)
const AUTO_REFRESH_MS = 10 * 60 * 1000 // 10 minutos
const AGGREGATION = 'max'              // 'max' | 'mean' dentro de cada 3h

// ===== Estado UI =====
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
      columnWidth: '68%',
      distributed: true,    // color por barra
      borderRadius: 2
    }
  },
  grid: { borderColor: '#eaecef', strokeDashArray: 3 },
  xaxis: {
    type: 'datetime',
    // Etiquetas en el eje: solo medianoche UTC
    labels: {
      datetimeUTC: true,
      formatter: (value) => {
        const d = new Date(Number(value))
        return d.getUTCHours() === 0
          ? d.toLocaleDateString('en-GB', {
              day: '2-digit', month: 'short', year: 'numeric',
              timeZone: 'UTC'
            })
          : ''
      }
    },
    tickAmount: 12
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
    x: { formatter: (v) =>
      new Date(v).toLocaleString('en-GB', {
        year: 'numeric', month: 'short', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
        timeZone: 'UTC'
      }) + ' UTC'
    },
    y: { formatter: (v) => (Math.round(v * 10) / 10).toString() }
  },
  legend: { show: false },
  colors: [] // la llenamos con un color por punto
})

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
    binned = binned.filter(p => p.x >= startWin)

    // Asigna datos y colores
    series.value = [{ name: 'Kp (3h)', data: binned }]
    options.value.colors = binned.map(p => kpColor(p.y))

    // Opcional: fija min/max del eje X al rango solicitado
    options.value.xaxis.min = startWin
    options.value.xaxis.max = now
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
  <div class="kp-card">
    <div class="kp-header">
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

    <div class="kp-body">
      <ApexChart type="bar" height="280" :options="options" :series="series" />
      <div class="kp-legend">
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
.kp-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: #fafafa; border-bottom: 1px solid #eee; }
.kp-actions { display: flex; gap: 10px; align-items: center; font-size: 12px; color: #666; }
.kp-btn { font-size: 12px; padding: 4px 8px; border: 1px solid #1976d2; background: #1976d2; color: #fff; border-radius: 6px; cursor: pointer; }
.kp-btn:disabled { opacity: .6; cursor: default; }
.kp-body { padding: 8px 10px 12px; }
.kp-legend { display: flex; gap: 12px; font-size: 12px; color: #666; margin-top: 6px; flex-wrap: wrap; }
.dot { display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:6px; vertical-align:middle; }
</style>
