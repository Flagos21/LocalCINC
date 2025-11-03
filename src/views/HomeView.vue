<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

import SunViewer from '@/components/SunViewer.vue'
import IonogramLatest from '@/components/IonogramLatest.vue'
import MagnetometerChartOverview from '@/components/MagnetometerChartOverview.vue'
import ElectricFieldHomeCard from '@/components/ElectricFieldHomeCard.vue'
import XRayChartFigure from '@/components/XRayChartFigure.vue'
import { useGoesXrays } from '@/composables/useGoesXrays'

// Mapa Día/Noche
import DayNightMap from '@/components/DayNightMap.vue'

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
let clockTimer = null // 👈 sin tipos TS

onMounted(() => {
  clockTimer = window.setInterval(() => {
    utcNow.value = new Date()
  }, 1000)
})
onBeforeUnmount(() => { if (clockTimer) clearInterval(clockTimer) })

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
  <section class="home">
    <header class="home__header">
      <h2>Panel principal</h2>
      <p>Visualiza aquí los indicadores clave cuando estén disponibles.</p>
    </header>

    <div class="home__grid">
      <!-- Sol -->
      <article class="home__tile home__tile--sun">
        <header class="home__tile-head">
          <div>
            <h3>El Sol (SUVI)</h3>
            <p>Vista en tiempo (casi) real del Sol por longitudes de onda EUV.</p>
          </div>
        </header>

        <div class="home__tile-visual home__tile-visual--sun">
          <SunViewer />
        </div>
      </article>

      <!-- Rayos X -->
      <article class="home__tile home__tile--xray">
        <header class="home__tile-head xray__head">
          <div class="xray__title">
            <h3>GOES X-ray Flux (0.05–0.4 nm y 0.1–0.8 nm)</h3>
            <p>Escala logarítmica con umbrales A/B/C/M/X. Fuente: SWPC.</p>
          </div>

          <div class="xray__controls">
            <div class="xray__clock">
              <span class="tag">UTC ahora:</span>
              <span class="mono">{{ fmtUTC(utcNow) }}</span>
            </div>
            <div class="xray__clock">
              <span class="tag">Última muestra:</span>
              <span class="mono">{{ fmtUTC(lastPointTime) }}</span>
            </div>

            <label class="xray__range">
              <span class="tag">Intervalo:</span>
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
              <template v-if="lastPointTime">
                · Último ts: {{ new Date(lastPointTime).toISOString() }}
              </template>
            </small>
          </template>
        </div>
      </article>

      <!-- Campo eléctrico local -->
      <article class="home__tile home__tile--electric">
        <ElectricFieldHomeCard />
      </article>

      <!-- Magnetómetro -->
      <article class="home__tile home__tile--magneto">
        <MagnetometerChartOverview />
      </article>

      <!-- Ionograma -->
      <article class="home__tile home__tile--ionogram">
        <IonogramLatest />
      </article>

      <!-- Mapa día/noche -->
      <article class="home__tile home__tile--map">
        <header class="home__tile-head">
          <div>
            <h3>Mapa día/noche</h3>
            <p>Observa el terminador solar y penumbras actualizadas cada minuto.</p>
          </div>
        </header>
        <div class="home__tile-visual home__tile-visual--map">
          <DayNightMap
            mode="map"
            height="100%"
            :autoRefreshMs="60000"
            :showTwilight="true"
            :showSunMoon="true"
            :showAnimationControl="false"
            :focusBounds="[[ -60, -95 ], [ 18, -30 ]]"
            :focusMaxZoom="4"
          />
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  flex: 1;
  min-height: 0;
  height: 100%;
}

/* Titulares en negro sobre fondo oscuro del main */
.home__header h2 { color: #ffffff; }
.home__header p  { color: #ffffff; }

.home__grid {
  flex: 1;
  min-height: 0;
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(22rem, 1fr));
  align-items: stretch;
}

.home__tile {
  background: #ffffff;
  border-radius: 0.75rem;
  padding: 0.9rem 1rem 1rem;
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  height: 100%;
  min-height: 0;
}

.home__tile-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.home__tile-head h3 {
  font-size: 1.05rem;
  font-weight: 600;
  color: #1f2933;
}

.home__tile-head p {
  color: #69707d;
  margin-top: 0.25rem;
  font-size: 0.9rem;
}

.home__tile-body {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 0;
}


.home__tile-visual {
  width: 100%;
  height: clamp(15rem, 28vw, 21rem);
  border-radius: 0.75rem;
  overflow: hidden;
  position: relative;
  display: grid;
  place-items: center;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.home__tile-visual > * {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.home__tile-visual--chart {
  background: #ffffff;
  padding: 0.4rem;
  align-items: stretch;
  justify-items: stretch;
}

.home__tile-visual--chart :deep(svg),
.home__tile-visual--chart :deep(canvas) {
  width: 100%;
  height: 100%;
}

.home__tile-visual--sun {
  background: #ffffff;
  --dashboard-aspect: 1 / 1;
  height: auto;
  min-height: 0;
  padding: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
}

.home__tile-visual--sun > * {
  height: auto;
}

.home__tile-visual--sun :deep(.sunviewer) {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: auto;
  min-height: 0;
  max-width: 28rem;
  margin: 0 auto;
}

.home__tile-visual--sun :deep(.sunviewer__frame) {
  margin: 0;
  width: 100%;
  align-self: center;
}

.home__tile-visual--map {
  background: #ffffff;
  align-items: stretch;
  justify-items: stretch;
}

.home__tile-visual--map :deep(.tad-card) {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  width: 100%;
}

.home__tile-visual--map :deep(.tad-map) {
  flex: 1 1 auto;
  min-height: 0;
}

.home__tile-state {
  margin: auto 0;
  display: grid;
  place-items: center;
  text-align: center;
  gap: 0.5rem;
  color: #0f0f10;
  padding: 1.5rem 1rem;
  border: 1px dashed #d3dae6;
  border-radius: 0.75rem;
}

.home__tile-state--error { color: #b42318; border-color: rgba(180,35,24,.35); background: rgba(180,35,24,.06); }
.home__tile-state--loading { color: #0f0f10; }

.loader {
  width: 1.75rem; height: 1.75rem; border-radius: 50%;
  border: 3px solid rgba(37,99,235,.2); border-top-color:#2563eb;
  animation: spin 1s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg) } }

.xray__head { gap: .75rem; }
.xray__title h3 { margin-bottom: .25rem; }
.xray__controls { display:flex; gap:.5rem; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
.xray__clock { display:flex; gap:.35rem; align-items:baseline; }
.xray__range select { border-radius: 0.5rem; padding: 0.3rem 0.45rem; border: 1px solid #cbd5e1; }
.tag { color:#0f0f10; font-size:.85rem; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace; color:#0f0f10; }

.toggle {
  position: relative; display:inline-flex; align-items:center; gap:.5rem;
  border:1px solid #cbd5e1; background:#f8fafc; border-radius:9999px;
  padding:.25rem .6rem .25rem .25rem; cursor:pointer; color:#0f0f10;
}

.toggle .knob { width:1.25rem; height:1.25rem; border-radius:9999px; background:#94a3b8; transition:all .2s ease; }
.toggle.is-on { border-color:#2563eb; background:#eff6ff; }
.toggle.is-on .knob { background:#2563eb; transform: translateX(1.1rem); }
.toggle .label { font-size:.85rem; color:#0f0f10; }

.ghost { background:transparent; border:1px solid #cbd5e1; color:#0f0f10; padding:.35rem .6rem; border-radius:.5rem; cursor:pointer; }
.ghost:hover { background:#f1f5f9; }

.xray__foot { margin-top:.25rem; color:#0f0f10; display:block; }

.home__tile--electric {
  padding: 0;
  background: transparent;
  box-shadow: none;
}

.home__tile--electric :deep(.efield-home) {
  height: 100%;
  min-height: 0;
}

.home__tile--magneto,
.home__tile--ionogram {
  padding: 0;
  background: transparent;
  box-shadow: none;
}

.home__tile--magneto > *,
.home__tile--ionogram > * {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.home__tile--magneto :deep(.magneto__body) {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  flex: 1 1 auto;
  min-height: 0;
}

.home__tile--magneto :deep(.magneto__chart-wrapper) {
  width: 100%;
  height: clamp(15rem, 28vw, 21rem);
  border-radius: 0.75rem;
  overflow: hidden;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: stretch;
  justify-content: center;
}

.home__tile--magneto :deep(.magneto__chart) {
  flex: 1 1 auto;
  min-height: 0;
}

.home__tile--ionogram :deep(.ionogram-card) {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.home__tile--ionogram :deep(.ionogram-card__body) {
  height: clamp(15rem, 28vw, 21rem);
  border-radius: 0.75rem;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
}

@media (min-width: 960px) {
  .home__grid { grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr)); }
}

@media (min-width: 1280px) {
  .home__grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (max-width: 600px) {
  .home__tile { padding: 0.75rem; }
}
</style>
