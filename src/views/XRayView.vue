<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'

import dayjs from '@/utils/dayjs'
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

const rangePresets = [
  { id: '6h', label: '6 h', description: 'Últimas 6 horas' },
  { id: '1d', label: '1 día', description: 'Último día' },
  { id: '3d', label: '3 días', description: 'Últimos 3 días' },
  { id: '7d', label: '7 días', description: 'Última semana' },
]

const selectedPreset = computed(() => rangePresets.find((preset) => preset.id === xrRange.value) ?? rangePresets[0])
const selectionLabel = computed(() => selectedPreset.value?.description ?? 'Sin selección')

const totalPoints = computed(() =>
  sats.value.reduce(
    (acc, sat) =>
      acc + (longBySat.value?.[sat]?.length || 0) + (shortBySat.value?.[sat]?.length || 0),
    0,
  )
)

const summaryLabel = computed(() => {
  const satCount = sats.value.length
  const satText = satCount === 1 ? '1 satélite' : `${satCount} satélites`
  const points = totalPoints.value
  const pointsText = points === 1 ? '1 punto total' : `${points.toLocaleString('es-CL')} puntos totales`
  return `${satText} · ${pointsText}`
})

const dataExtent = computed(() => {
  const stamps = []
  for (const sat of sats.value) {
    for (const pair of longBySat.value?.[sat] || []) {
      const ts = Number(pair?.[0])
      if (Number.isFinite(ts)) stamps.push(ts)
    }
    for (const pair of shortBySat.value?.[sat] || []) {
      const ts = Number(pair?.[0])
      if (Number.isFinite(ts)) stamps.push(ts)
    }
  }

  if (!stamps.length) {
    return null
  }

  stamps.sort((a, b) => a - b)
  return { start: stamps[0], end: stamps[stamps.length - 1] }
})

const dataWindowLabel = computed(() => {
  if (!dataExtent.value) {
    return 'Sin datos disponibles'
  }

  const start = dayjs(dataExtent.value.start).utc()
  const end = dayjs(dataExtent.value.end).utc()

  return `${start.format('YYYY-MM-DD HH:mm')} → ${end.format('YYYY-MM-DD HH:mm')} UTC`
})

const utcNowLabel = computed(() => fmtUTC(utcNow.value))
const lastSampleLabel = computed(() => fmtUTC(lastPointTime.value))

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
    <article class="xray__card">
      <header class="xray__head">
        <div class="xray__intro">
          <h2>GOES X-ray Flux</h2>
          <p>Monitorea el flujo de rayos X de los satélites GOES en escalas logarítmicas.</p>
        </div>

        <div class="xray__head-actions">
          <div class="xray__presets" role="group" aria-label="Seleccionar intervalo de rayos X">
            <button
              v-for="preset in rangePresets"
              :key="preset.id"
              type="button"
              class="xray__preset"
              :class="{ 'xray__preset--active': preset.id === xrRange }"
              @click="xrRange = preset.id"
            >
              {{ preset.label }}
            </button>
          </div>

          <div class="xray__controls">
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
        </div>
      </header>

      <div class="xray__meta" role="status" aria-live="polite">
        <div class="xray__meta-item">
          <span class="xray__meta-label">Seleccionado</span>
          <span class="xray__meta-value">{{ selectionLabel }}</span>
        </div>
        <div class="xray__meta-item">
          <span class="xray__meta-label">Datos</span>
          <span class="xray__meta-value">{{ dataWindowLabel }}</span>
        </div>
        <div class="xray__meta-item">
          <span class="xray__meta-label">Última muestra</span>
          <span class="xray__meta-value">{{ lastSampleLabel }}</span>
        </div>
        <div class="xray__meta-item">
          <span class="xray__meta-label">UTC ahora</span>
          <span class="xray__meta-value">{{ utcNowLabel }}</span>
        </div>
        <div class="xray__meta-item">
          <span class="xray__meta-label">Resumen</span>
          <span class="xray__meta-value">{{ summaryLabel }}</span>
        </div>
      </div>

      <div class="xray__chart-area" aria-live="polite">
        <div v-if="xrError" class="xray__state xray__state--error">
          <strong>Problema al cargar rayos X.</strong>
          <p>{{ xrError }}</p>
        </div>
        <div v-else-if="xrLoading" class="xray__state xray__state--loading">
          <span class="loader" aria-hidden="true"></span>
          <p>Cargando rayos X…</p>
        </div>
        <div v-else-if="!xrHasData" class="xray__state">
          <p>No hay datos disponibles para este intervalo.</p>
        </div>

        <template v-else>
          <div class="xray__chart-shell">
            <XRayChartFigure
              :long-by-sat="longBySat"
              :short-by-sat="shortBySat"
              :sats="sats"
              :height="320"
            />
          </div>
          <small class="xray__foot">
            {{ summaryLabel }}
            <template v-if="sats.length">
              · Satélites: {{ sats.join(', ') }}
            </template>
          </small>
        </template>
      </div>
    </article>
  </section>
</template>

<style scoped>
.xray {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  flex: 1;
  min-height: 0;
  width: min(100%, 70rem);
  margin: 0 auto;
}

.xray__card {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  background: #ffffff;
  border-radius: 0.9rem;
  border: 1px solid #e2e8f0;
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.06);
  padding: 1.25rem 1.5rem 1.5rem;
}

.xray__head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.xray__intro {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  max-width: min(32rem, 100%);
}

.xray__intro h2 {
  font-size: 1.65rem;
  font-weight: 600;
  color: #1f2937;
  margin: 0;
}

.xray__intro p {
  margin: 0;
  color: #475569;
  font-size: 0.95rem;
}

.xray__head-actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  align-items: flex-end;
}

.xray__presets {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.xray__preset {
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #0f172a;
  border-radius: 999px;
  padding: 0.35rem 0.85rem;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease, transform 0.15s ease;
}

.xray__preset:hover,
.xray__preset:focus-visible {
  background: #e2e8f0;
  border-color: #cbd5e1;
  color: #0f172a;
  outline: none;
}

.xray__preset--active {
  background: #f97316;
  color: #ffffff;
  border-color: #ea580c;
  box-shadow: 0 12px 22px rgba(249, 115, 22, 0.24);
}

.xray__controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.xray__meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 0.75rem;
}

.xray__meta-item {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.6rem 0.85rem;
  border-radius: 0.75rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.xray__meta-label {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
  color: #475569;
}

.xray__meta-value {
  font-size: 0.85rem;
  color: #0f172a;
  font-weight: 500;
  word-break: break-word;
}

.xray__chart-area {
  border: 1px solid #e2e8f0;
  border-radius: 0.85rem;
  background: #f8fafc;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 0;
}

.xray__chart-shell {
  background: #ffffff;
  border-radius: 0.75rem;
  border: 1px solid rgba(15, 23, 42, 0.08);
  overflow: hidden;
}

.toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.35rem 0.85rem 0.35rem 0.45rem;
  border-radius: 999px;
  border: 1px solid #cbd5e1;
  background: rgba(248, 250, 252, 0.92);
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
}

.toggle:hover,
.toggle:focus-visible {
  border-color: #94a3b8;
  box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.25);
  outline: none;
}

.toggle .knob {
  width: 1.45rem;
  height: 1.45rem;
  border-radius: 999px;
  background: #1d4ed8;
  box-shadow: 0 8px 16px rgba(37, 99, 235, 0.25);
}

.toggle .label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #334155;
}

.toggle.is-on {
  border-color: rgba(59, 130, 246, 0.4);
  background: rgba(59, 130, 246, 0.1);
}

.toggle.is-on .knob {
  background: #1d4ed8;
  box-shadow: 0 8px 16px rgba(37, 99, 235, 0.25);
}

.toggle.is-on .label {
  color: #1e3a8a;
}

.ghost {
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #0f172a;
  border-radius: 0.75rem;
  padding: 0.45rem 0.9rem;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}

.ghost:hover,
.ghost:focus-visible {
  background: #e2e8f0;
  color: #0f172a;
  border-color: #cbd5e1;
  outline: none;
}

.xray__state {
  display: grid;
  place-items: center;
  gap: 0.75rem;
  text-align: center;
  min-height: 240px;
  color: #1f2933;
}

.xray__state--loading .loader {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  border: 3px solid rgba(37, 99, 235, 0.2);
  border-top-color: #2563eb;
  animation: spin 0.9s linear infinite;
}

.xray__state--error {
  color: #b91c1c;
}

.xray__foot {
  display: block;
  font-size: 0.8rem;
  color: #475569;
}

@media (max-width: 768px) {
  .xray__head-actions {
    align-items: stretch;
  }

  .xray__controls {
    justify-content: flex-start;
  }
}
</style>
