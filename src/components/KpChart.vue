<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import Chart from 'chart.js/auto'
import 'chartjs-adapter-date-fns'

import {
  buildKpDataset,
  mergeKpSeries,
  formatUpdatedAt
} from '@/utils/kpChartUtils.js'

const REFRESH_INTERVAL_MS = 10 * 60 * 1000

const canvasRef = ref(null)
const isLoading = ref(false)
const hasLoadedOnce = ref(false)
const errorMessage = ref('')
const series = ref([])
const updatedAt = ref(null)
const tooltip = ref({ visible: false, x: 0, y: 0, value: 0, label: '' })

let refreshTimer = null
let chart = null
let bars = []

const updatedLabel = computed(() => formatUpdatedAt(updatedAt.value))
const hasData = computed(() => series.value.length > 0)

function resetTooltip() {
  tooltip.value = { visible: false, x: 0, y: 0, value: 0, label: '' }
}

function updateTooltip(event) {
  if (!canvasRef.value || !bars.length) {
    resetTooltip()
    return
  }

  const rect = canvasRef.value.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  const hovered = bars.find((bar) => (
    x >= bar.x &&
    x <= bar.x + bar.width &&
    y >= bar.y &&
    y <= bar.y + bar.height
  ))

  if (!hovered) {
    resetTooltip()
    return
  }

  tooltip.value = {
    visible: true,
    x: hovered.x + hovered.width / 2,
    y: hovered.y + 12,
    value: hovered.value,
    label: formatUpdatedAt(hovered.label)
  }
}

function attachCanvasEvents() {
  if (!canvasRef.value) return
  canvasRef.value.addEventListener('mousemove', updateTooltip)
  canvasRef.value.addEventListener('mouseleave', resetTooltip)
}

function detachCanvasEvents() {
  if (!canvasRef.value) return
  canvasRef.value.removeEventListener('mousemove', updateTooltip)
  canvasRef.value.removeEventListener('mouseleave', resetTooltip)
}

function updateChart() {
  if (!canvasRef.value) {
    return
  }

  const dataset = buildKpDataset(series.value)

  if (!chart) {
    const ctx = canvasRef.value.getContext('2d')
    chart = new Chart(ctx, {
      type: 'bar',
      data: { datasets: [dataset] },
      options: {
        padding: { left: 44, right: 16, top: 16, bottom: 40 },
        axisColor: '#cbd5f5',
        axisLabelColor: '#475569'
      }
    })
    attachCanvasEvents()
  } else {
    chart.config.data.datasets = [dataset]
    chart.update()
  }

  bars = chart.getBars?.() || []
  resetTooltip()
}

async function loadData({ silent = false } = {}) {
  if (!silent) {
    isLoading.value = true
  }

  try {
    const response = await fetch('/api/kp', { cache: 'no-cache' })
    if (!response.ok) {
      if (response.status === 503) {
        throw new Error('Servicio deshabilitado temporalmente (503).')
      }
      throw new Error(`Error al consultar índice Kp (HTTP ${response.status}).`)
    }

    const payload = await response.json()
    const merged = mergeKpSeries(series.value, payload.series)
    series.value = merged
    updatedAt.value = payload.updatedAt || null
    errorMessage.value = ''
    updateChart()
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Error inesperado al cargar Kp.'
    resetTooltip()
  } finally {
    if (!silent) {
      isLoading.value = false
    }
    hasLoadedOnce.value = true
  }
}

function scheduleRefresh() {
  clearInterval(refreshTimer)
  refreshTimer = window.setInterval(() => {
    loadData({ silent: true })
  }, REFRESH_INTERVAL_MS)
}

function cancelRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

async function manualRefresh() {
  await loadData({ silent: false })
}

onMounted(async () => {
  await loadData({ silent: false })
  scheduleRefresh()
})

onBeforeUnmount(() => {
  cancelRefresh()
  detachCanvasEvents()
  if (chart) {
    chart.destroy()
    chart = null
  }
  bars = []
})
</script>

<template>
  <div class="kp-chart">
    <div class="kp-chart__body">
      <canvas ref="canvasRef" class="kp-chart__canvas" role="img" aria-label="Gráfico del índice geomagnético Kp"></canvas>

      <div v-if="!hasData && !isLoading && hasLoadedOnce" class="kp-chart__overlay">
        <p>Sin datos disponibles.</p>
      </div>

      <div v-if="isLoading && !hasLoadedOnce" class="kp-chart__overlay kp-chart__overlay--loading">
        <span class="kp-chart__spinner" aria-hidden="true"></span>
        <p>Cargando índice Kp…</p>
      </div>

      <div v-if="errorMessage" class="kp-chart__overlay kp-chart__overlay--error">
        <strong>Problema al cargar Kp</strong>
        <p>{{ errorMessage }}</p>
      </div>

      <transition name="kp-tooltip">
        <div
          v-if="tooltip.visible"
          class="kp-chart__tooltip"
          :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
          role="presentation"
        >
          <p>Kp: {{ tooltip.value.toFixed(1) }}</p>
          <small>{{ tooltip.label }}</small>
        </div>
      </transition>
    </div>

    <footer class="kp-chart__footer">
      <span>Actualizado: {{ updatedLabel }}</span>
      <button type="button" class="kp-chart__refresh" @click="manualRefresh" :disabled="isLoading">
        Refrescar
      </button>
    </footer>
  </div>
</template>

<style scoped>
.kp-chart {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
  height: 100%;
}

.kp-chart__body {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
}

.kp-chart__canvas {
  width: 100%;
  height: 100%;
  display: block;
  border-radius: 0.5rem;
  background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
  border: 1px solid #e2e8f0;
}

.kp-chart__overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  text-align: center;
  padding: 1rem;
  border-radius: 0.5rem;
  background: rgba(248, 250, 252, 0.9);
  color: #1f2937;
}

.kp-chart__overlay--loading {
  color: #0f172a;
}

.kp-chart__overlay--error {
  color: #b91c1c;
}

.kp-chart__spinner {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  border: 3px solid rgba(59, 130, 246, 0.2);
  border-top-color: rgba(59, 130, 246, 0.9);
  animation: kp-chart-spin 1s linear infinite;
  margin-bottom: 0.5rem;
}

@keyframes kp-chart-spin {
  to {
    transform: rotate(360deg);
  }
}

.kp-chart__tooltip {
  position: absolute;
  transform: translate(-50%, -100%);
  background: rgba(15, 23, 42, 0.92);
  color: #f8fafc;
  padding: 0.4rem 0.6rem;
  border-radius: 0.4rem;
  font-size: 0.75rem;
  pointer-events: none;
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.2);
}

.kp-tooltip-enter-active,
.kp-tooltip-leave-active {
  transition: opacity 0.12s ease-in-out;
}

.kp-tooltip-enter-from,
.kp-tooltip-leave-to {
  opacity: 0;
}

.kp-chart__footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
  color: #334155;
}

.kp-chart__refresh {
  border: 1px solid #3b82f6;
  background: transparent;
  color: #1d4ed8;
  border-radius: 0.375rem;
  padding: 0.25rem 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease;
}

.kp-chart__refresh:disabled {
  opacity: 0.6;
  cursor: wait;
}

.kp-chart__refresh:not(:disabled):hover {
  background: rgba(59, 130, 246, 0.08);
}
</style>
