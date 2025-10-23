<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

import XRayChartFigure from '@/components/XRayChartFigure.vue'
import { useGoesXrays } from '@/composables/useGoesXrays'

const {
  isLoading: xrLoading,
  errorMessage: xrError,
  hasData: xrHasData,
  longBySat,
  shortBySat,
  sats,
  lastPointTime,
  autoRefresh,
  toggleAuto,
  range: xrRange,
  refresh,
} = useGoesXrays({ range: '6h', pollMs: 60000, auto: true })

const utcNow = ref(new Date())
let clockTimer = null

onMounted(() => {
  clockTimer = window.setInterval(() => {
    utcNow.value = new Date()
  }, 1000)
})

onBeforeUnmount(() => {
  if (clockTimer) {
    clearInterval(clockTimer)
  }
})

function fmtUTC(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(value) + ' UTC'
}
</script>

<template>
  <section class="xray">
    <header class="xray__header">
      <div>
        <h2>GOES X-ray Flux</h2>
        <p>Monitorea el flujo de rayos X de los satélites GOES en escalas logarítmicas.</p>
      </div>

      <div class="xray__meta">
        <div class="xray__clock">
          <span class="tag">UTC ahora:</span>
          <span class="mono">{{ fmtUTC(utcNow) }}</span>
        </div>
        <div class="xray__clock">
          <span class="tag">Última muestra:</span>
          <span class="mono">{{ fmtUTC(lastPointTime) }}</span>
        </div>
      </div>
    </header>

    <div class="xray__panel">
      <div class="xray__controls">
        <label class="xray__range">
          <span class="tag">Rango:</span>
          <select v-model="xrRange">
            <option value="6h">6 h</option>
            <option value="1d">1 día</option>
            <option value="3d">3 días</option>
            <option value="7d">7 días</option>
          </select>
        </label>

        <button
          class="toggle"
          :class="{ 'is-on': autoRefresh }"
          @click="toggleAuto"
          type="button"
          :aria-pressed="autoRefresh"
        >
          <span class="knob"></span>
          <span class="label">{{ autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF' }}</span>
        </button>

        <button class="ghost" type="button" @click="refresh">Refrescar</button>
      </div>

      <div class="xray__chart" aria-live="polite">
        <div v-if="xrError" class="xray__state xray__state--error">
          <strong>Problema al cargar rayos X.</strong>
          <p>{{ xrError }}</p>
        </div>
        <div v-else-if="xrLoading" class="xray__state xray__state--loading">
          <span class="loader" aria-hidden="true"></span>
          <p>Cargando rayos X…</p>
        </div>
        <div v-else-if="!xrHasData" class="xray__state">
          <p>No hay datos disponibles para este rango.</p>
        </div>

        <template v-else>
          <XRayChartFigure
            :long-by-sat="longBySat"
            :short-by-sat="shortBySat"
            :sats="sats"
            :height="320"
          />
          <small class="xray__foot">
            Sats: {{ sats.join(', ') }}
            · Pts totales Long: {{
              sats.reduce((acc, s) => acc + (longBySat[s]?.length || 0), 0)
            }}
            · Pts totales Short: {{
              sats.reduce((acc, s) => acc + (shortBySat[s]?.length || 0), 0)
            }}
            <template v-if="lastPointTime">
              · Último ts: {{ new Date(lastPointTime).toISOString() }}
            </template>
          </small>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.xray {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  flex: 1;
  min-height: 0;
  width: min(100%, 68rem);
  margin: 0 auto;
}

.xray__header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-end;
  gap: 1rem;
}

.xray__header h2 {
  font-size: 1.75rem;
  font-weight: 600;
  color: #1f2933;
}

.xray__header p {
  color: #52606d;
  margin-top: 0.25rem;
}

.xray__meta {
  display: flex;
  gap: 1.25rem;
  align-items: center;
  flex-wrap: wrap;
}

.xray__clock {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.9rem;
  color: #1f2933;
}

.xray__panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 1.5rem;
  background: #ffffff;
  border-radius: 0.75rem;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08), 0 4px 12px rgba(15, 23, 42, 0.06);
}

.xray__controls {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.xray__range {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.95rem;
  color: #1f2933;
}

.xray__range select {
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  padding: 0.35rem 0.5rem;
  background: #ffffff;
}

.toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 9999px;
  padding: 0.25rem 0.75rem 0.25rem 0.35rem;
  background: #f8fafc;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.toggle .knob {
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 50%;
  background: #cbd5f5;
  transition: background 0.2s ease;
}

.toggle.is-on {
  border-color: #38bdf8;
  background: #e0f2fe;
}

.toggle.is-on .knob {
  background: #0ea5e9;
}

.toggle .label {
  font-size: 0.85rem;
  font-weight: 500;
  color: #0f172a;
}

.ghost {
  border: 1px solid transparent;
  border-radius: 0.5rem;
  padding: 0.35rem 0.6rem;
  background: #e2e8f0;
  cursor: pointer;
  font-weight: 500;
  color: #0f172a;
}

.ghost:hover {
  background: #cbd5f5;
}

.xray__chart {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.xray__state {
  display: grid;
  place-items: center;
  padding: 2rem 1rem;
  text-align: center;
  color: #1f2933;
  background: #f8fafc;
  border-radius: 0.75rem;
}

.xray__state--error {
  color: #b91c1c;
  background: #fee2e2;
}

.loader {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  border: 3px solid rgba(14, 165, 233, 0.25);
  border-top-color: #0ea5e9;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.xray__foot {
  color: #475569;
  display: block;
  font-size: 0.85rem;
}

.mono {
  font-family: ui-monospace, Menlo, Consolas, 'Liberation Mono', monospace;
}

.tag {
  font-size: 0.75rem;
  font-weight: 600;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
</style>
