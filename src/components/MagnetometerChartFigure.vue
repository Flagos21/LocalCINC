<script setup>
import { ref, onMounted, watch } from 'vue'
import Plotly from 'plotly.js-dist-min'
import dayjs from 'dayjs'
import Litepicker from 'litepicker'
import 'litepicker/dist/css/litepicker.css'
import { useMagnetometerSeries } from '@/composables/useMagnetometerSeries'

// UI state
const mode = ref('H')             // 'H' | 'DELTA'
const deltaWindowMin = ref(60)
const isLoading = ref(false)
const errorMessage = ref('')

// Fechas (un solo input range)
const from = ref('')
const to = ref('')

// Nuestro composable (usa from/to)
const { labels, series, fetchData } = useMagnetometerSeries({
  from, to, every: ref(''), range: ref(''), unit: ref('nT'), station: ref('CHI')
})

function setDefaultTwoYears() {
  const end = dayjs()
  const start = end.subtract(2, 'year')
  from.value = start.format('YYYY-MM-DDTHH:mm')
  to.value   = end.format('YYYY-MM-DDTHH:mm')
}

// ΔH media móvil
function computeDeltaH(xs, ys, windowMinutes) {
  const wms = windowMinutes * 60 * 1000
  const out = []
  const q = []
  let sum = 0, head = 0
  for (let i = 0; i < xs.length; i++) {
    const t = new Date(xs[i]).getTime()
    const v = ys[i]
    q.push({ t, v }); sum += v
    while (q.length && (t - q[head].t) > wms) { sum -= q[head].v; head++ }
    const cnt = q.length - head
    out.push(v - (cnt ? sum / cnt : v))
  }
  return out
}

// Dibuja (ordenando por tiempo y sin conectar huecos)
function draw() {
  // Zipea, filtra NaN, ordena
  const pts = (labels.value || []).map((t, i) => ({ t, v: (series.value || [])[i] }))
    .filter(p => p.t && Number.isFinite(p.v))
    .sort((a,b) => new Date(a.t) - new Date(b.t))

  const xs = pts.map(p => p.t)
  const ys = pts.map(p => p.v)
  const yplot = mode.value === 'DELTA' ? computeDeltaH(xs, ys, deltaWindowMin.value) : ys

  const trace = {
    x: xs,
    y: yplot,
    type: 'scatter',
    mode: 'lines',
    connectgaps: false,         // ⬅️ no conectar huecos
    name: mode.value === 'DELTA' ? 'ΔH' : 'H',
    hovertemplate:
      '%{x|%Y-%m-%d %H:%M:%S}<br>' +
      (mode.value === 'DELTA' ? 'ΔH: %{y:.2f} nT' : 'H: %{y:.2f} nT') +
      '<extra></extra>'
  }

  const layout = {
    title: {
      text: (mode.value === 'DELTA' ? 'ΔH – ' : 'H – ') +
            `${dayjs(from.value).format('YYYY-MM-DD')} – ${dayjs(to.value).format('YYYY-MM-DD')}`,
      x: 0.5
    },
    xaxis: {
      title: 'Fecha',
      type: 'date',
      tickformatstops: [
        { dtickrange: [null, 1000*60*60*24*2], value: '%H:%M\n%d %b' },
        { dtickrange: [1000*60*60*24*2, 1000*60*60*24*62], value: '%d %b %Y' },
        { dtickrange: [1000*60*60*24*62, null], value: '%b %Y' }
      ],
      rangeslider: { visible: true },
      rangeselector: {
        buttons: [
          { step: 'month', stepmode: 'backward', count: 1, label: '1m' },
          { step: 'month', stepmode: 'backward', count: 6, label: '6m' },
          { step: 'year',  stepmode: 'backward', count: 1, label: '1y' },
          { step: 'all', label: 'Todo' }
        ]
      }
    },
    yaxis: {
      title: mode.value === 'DELTA' ? 'ΔH (nT)' : 'H (nT)',
      zeroline: true,
      zerolinewidth: 1.5,
      zerolinecolor: '#666',
      gridcolor: '#e5e7eb',
      tickformat: ',.2f'
    },
    margin: { t: 60, r: 20, b: 50, l: 60 },
    shapes: [
      { type: 'line', x0: 0, x1: 1, xref: 'paper', y0: 0, y1: 0, yref: 'y',
        line: { dash: 'dash', width: 1, color: '#6b7280' } }
    ],
    hovermode: 'x unified'
  }

  Plotly.react('plot-magneto', [trace], layout, {
    responsive: true,
    displaylogo: false,
    modeBarButtonsToRemove: ['select2d', 'lasso2d']
  })
}

async function apply() {
  isLoading.value = true
  errorMessage.value = ''
  try {
    if (mode.value === 'DELTA') {
      // Llama al nuevo endpoint backend que entrega ΔH ya calculado
      const res = await fetch(`/api/series-dh?from=${from.value}&to=${to.value}`)
      const json = await res.json()
      labels.value = json.labels
      series.value = json.series[0].data
    } else {
      await fetchData()
    }
    draw()
  } catch (e) {
    console.error(e)
    errorMessage.value = 'No se pudieron obtener los datos del servicio.'
  } finally {
    isLoading.value = false
  }
}


onMounted(() => {
  setDefaultTwoYears()

  // Calendario de rango (un solo input)
  const picker = new Litepicker({
    element: document.getElementById('range-input'),
    singleMode: false,
    numberOfMonths: 2,
    numberOfColumns: 2,
    format: 'YYYY-MM-DD HH:mm',
    allowRepick: true,
    autoApply: true,
    useLocaleSettings: true,
    lang: 'es-ES',
    dropdowns: { minYear: 2010, maxYear: dayjs().year(), months: true, years: true },
    startDate: dayjs(from.value).toDate(),
    endDate: dayjs(to.value).toDate(),
  })

  picker.on('selected', (d1, d2) => {
    if (d1 && d2) {
      from.value = dayjs(d1).format('YYYY-MM-DDTHH:mm')
      to.value   = dayjs(d2).format('YYYY-MM-DDTHH:mm')
      apply()
    }
  })

  apply()
})

watch([mode, deltaWindowMin], draw)
</script>

<template>
  <div class="p-6 space-y-4">
    <h1 class="text-2xl font-semibold">Magnetómetro – Estación única</h1>

    <div class="flex flex-wrap gap-4 items-end">
      <div class="w-80">
        <label class="block text-sm mb-1">Rango de fechas</label>
        <input id="range-input" class="border rounded px-3 py-2 w-full" placeholder="Selecciona inicio → fin" />
        <small class="text-gray-500">
          Desde {{ dayjs(from).format('YYYY-MM-DD HH:mm') }} hasta {{ dayjs(to).format('YYYY-MM-DD HH:mm') }}
        </small>
      </div>

      <div>
        <label class="block text-sm mb-1">Modo</label>
        <select v-model="mode" class="border rounded px-3 py-2">
          <option value="H">H (nT)</option>
          <option value="DELTA">ΔH (nT)</option>
        </select>
      </div>

      <div v-if="mode==='DELTA'">
        <label class="block text-sm mb-1">Ventana ΔH (min)</label>
        <input type="number" min="5" step="5" v-model.number="deltaWindowMin" class="border rounded px-3 py-2 w-28">
      </div>

      <button class="px-4 py-2 rounded bg-blue-600 text-white" @click="apply" :disabled="isLoading">
        {{ isLoading ? 'Cargando…' : 'Aplicar' }}
      </button>
    </div>

    <div id="plot-magneto" style="width:100%;height:540px;border:1px solid #e5e7eb;border-radius:8px;"></div>

    <p v-if="errorMessage" class="text-red-600 text-sm">⚠️ {{ errorMessage }}</p>
  </div>
</template>

<style scoped>
</style>
