<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'

import DstCard from '@/components/DstCard.vue'
import KpChart from '@/components/KpChart.vue'
import XRayChartFigure from '@/components/XRayChartFigure.vue'
import { useGoesXrays } from '@/composables/useGoesXrays'
import { formatUtcDateTime } from '@/utils/formatUtcDate'

const {
  isLoading: xrLoading,
  errorMessage: xrError,
  hasData: xrHasData,
  longBySat,
  shortBySat,
  sats,
  lastPointTime,
  range: xrRange,
} = useGoesXrays({ range: '6h', pollMs: 60000, auto: true })

const utcNow = ref(new Date())
let clockTimer = null

onMounted(() => {
  clockTimer = window.setInterval(() => { utcNow.value = new Date() }, 1000)
})
onBeforeUnmount(() => { if (clockTimer) clearInterval(clockTimer) })

function fmtUTC(value) {
  return formatUtcDateTime(value)
}

function findLatestFlux(pairs) {
  const entries = (Array.isArray(pairs) ? pairs : [])
    .map(([ts, val]) => ({ ts: Number(ts), value: Number(val) }))
    .filter((item) => Number.isFinite(item.ts) && Number.isFinite(item.value))
    .sort((a, b) => a.ts - b.ts)

  return entries.at(-1) || null
}

const latestFluxRows = computed(() => {
  const rows = []

  for (const sat of sats.value) {
    const long = findLatestFlux(longBySat.value?.[sat])
    const short = findLatestFlux(shortBySat.value?.[sat])

    if (long || short) {
      rows.push({ sat, long, short })
    }
  }

  return rows
})

function formatFluxLabel(value) {
  if (!Number.isFinite(value)) return '—'
  return `${value.toExponential(2)} W/m²`
}

const xrayRanges = [
  { id: '6h', label: '6 h' },
  { id: '1d', label: '1 día' },
  { id: '3d', label: '3 días' },
  { id: '7d', label: '7 días' }
]
</script>

<template>
  <article class="home__tile home__tile--xray xray-card">
    <header class="home__tile-head xray__head">
      <div class="xray__title">
        <h3>GOES X-ray Flux (0.05–0.4 nm y 0.1–0.8 nm)</h3>
        <p>Escala logarítmica con umbrales A/B/C/M/X. Fuente: SWPC.</p>
      </div>

      <div class="xray__controls">
        <div class="xray__timestamps">
          <div class="xray__clock">
            <span class="tag">UTC ahora:</span>
            <span class="mono">{{ fmtUTC(utcNow) }}</span>
          </div>
          <small v-if="lastPointTime" class="xray__updated">
            Actualizado: {{ fmtUTC(lastPointTime) }}
          </small>
        </div>

        <div class="xray__latest">
          <span class="last-label">Últimos valores</span>
          <div class="xray__latest-grid">
            <div
              v-for="row in latestFluxRows"
              :key="row.sat"
              class="xray__latest-column"
            >
              <span class="last-hint">GOES-{{ row.sat }}</span>
              <div class="xray__latest-row" v-if="row.long || row.short">
                <div class="xray__latest-pair" v-if="row.long">
                  <span class="last-hint">0.1–0.8 nm</span>
                  <span class="last-value">{{ formatFluxLabel(row.long.value) }}</span>
                </div>
                <div class="xray__latest-pair" v-if="row.short">
                  <span class="last-hint">0.05–0.4 nm</span>
                  <span class="last-value">{{ formatFluxLabel(row.short.value) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="xray__ranges" role="group" aria-label="Rango de rayos X">
          <button
            v-for="range in xrayRanges"
            :key="range.id"
            type="button"
            class="xray__range-btn"
            :class="{ 'is-active': xrRange === range.id }"
            @click="xrRange = range.id"
          >
            {{ range.label }}
          </button>
        </div>
      </div>
    </header>

    <div class="home__tile-body" aria-live="polite">
      <div v-if="xrError" class="home__tile-state home__tile-state--error">
        <strong>Problema al cargar rayos X.</strong>
        <p>{{ xrError }}</p>
      </div>
      <div v-else-if="xrLoading" class="home__tile-state home__tile-state--loading">
        <span class="loader" aria-hidden="true"></span>
        <p>Cargando rayos X…</p>
      </div>
      <div v-else-if="!xrHasData" class="home__tile-state">
        <p>No hay datos disponibles para este intervalo.</p>
      </div>

      <template v-else>
        <div class="home__tile-visual home__tile-visual--chart">
          <XRayChartFigure
            :long-by-sat="longBySat"
            :short-by-sat="shortBySat"
            :sats="sats"
            :height="'100%'"
          />
        </div>
        <small class="xray__foot">
          Sats: {{ sats.join(', ') }}
          · Pts totales Long: {{
            sats.reduce((acc, s) => acc + (longBySat[s]?.length || 0), 0)
          }}
          · Pts totales Short: {{
            sats.reduce((acc, s) => acc + (shortBySat[s]?.length || 0), 0)
          }}
        </small>
      </template>

      <div class="home__tile-divider" role="presentation" aria-hidden="true"></div>

      <div class="home__tile-subsection">
        <DstCard class="dst-card--embedded" />
      </div>

      <div class="home__tile-divider" role="presentation" aria-hidden="true"></div>

      <div class="home__tile-subsection home__tile-subsection--kp">
        <KpChart embedded :height="200" />
      </div>
    </div>
  </article>
</template>

<style scoped>
.home__tile { padding: 0.9rem 1rem 1rem; }

.xray__head { gap: .75rem; }
.xray__title h3 { margin-bottom: .25rem; }
.xray__controls { display:flex; gap:.75rem; align-items:flex-start; flex-wrap:wrap; justify-content:flex-end; }
.xray__timestamps { display:flex; flex-direction:column; align-items:flex-end; gap:0.15rem; min-width: 13rem; }
.xray__clock { display:flex; gap:.35rem; align-items:baseline; }
.xray__updated { color:#475569; font-size:0.85rem; }
.xray__latest { display:flex; flex-direction:column; gap:.25rem; min-width: 18rem; }
.xray__latest-grid { display:flex; flex-wrap:wrap; gap:0.5rem; align-items:stretch; }
.xray__latest-column { border:1px solid #e2e8f0; background:#f8fafc; border-radius:0.65rem; padding:0.5rem 0.65rem; display:flex; flex-direction:column; gap:0.2rem; min-width: 12.5rem; flex: 1 1 12.5rem; align-items:stretch; }
.xray__latest-row { display:flex; gap:0.5rem; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; }
.xray__latest-pair { display:flex; flex-direction:column; align-items:flex-start; gap:0.05rem; min-width: 7rem; }
.last-label { font-size:0.85rem; color:#475569; text-align:right; }
.last-hint { color:#475569; font-size:0.85rem; }
.last-value { font-size:1.35rem; font-weight:700; color:#0f172a; line-height:1.2; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace; }
.xray__ranges { display:flex; gap:0.45rem; flex-wrap:wrap; justify-content:flex-end; }
.xray__range-btn { border:1px solid rgba(15,23,42,0.12); background:rgba(248,250,252,0.9); color:#0f172a; border-radius:999px; padding:0.35rem 0.95rem; font-weight:600; cursor:pointer; transition: background .15s ease, color .15s ease, box-shadow .15s ease; }
.xray__range-btn:hover, .xray__range-btn:focus-visible { background:#f97316; color:#fff; outline:none; }
.xray__range-btn.is-active { background:#f97316; color:#fff; box-shadow:0 10px 25px rgba(249, 115, 22, 0.25); }
.tag { color:#0f0f10; font-size:.85rem; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace; color:#0f0f10; }

.xray__foot { margin-top:.25rem; color:#0f0f10; display:block; }

.home__tile-body { gap: 0.9rem; }
.home__tile-subsection { gap: 1rem; }
.home__tile--xray .home__tile-divider { margin: 0.75rem 0 1rem; }

.home__tile-subsection--kp { gap: 0.5rem; }
.home__tile-subsection--kp :deep(.kp-card) { width: 100%; }

.home__tile-state { margin: auto 0; }
.home__tile-visual { height: clamp(14rem, 24vh, 19rem); }
</style>
