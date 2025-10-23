<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

import SunViewer from '@/components/SunViewer.vue'
import IonogramLatest from '@/components/IonogramLatest.vue'
import MagnetometerChartOverview from '@/components/MagnetometerChartOverview.vue'

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

      <!-- Day/Night: ocupa todo el ancho y centrado -->
      <div class="home__cell home__cell--daynight">
        <div class="daynight-wrap">
          <!-- refresco cada 1 minuto -->
          <DayNightMap
            mode="satellite"
            height="clamp(520px, 55vh, 720px)"
            :autoRefreshMs="60000"
            :showTwilight="true"
            :showSunMoon="true"
            nightColor="#050a18"
            twilightColor="#0b1736"
            :nightOpacity="0.38"
            :twilightCivilOpacity="0.26"
            :twilightNauticalOpacity="0.18"
            :twilightAstroOpacity="0.12"
          />
        </div>
      </div>

    <div class="home__grid">
      <!-- Sol -->
      <div class="home__cell home__cell--sun">
        <article class="panel">
          <div class="panel__head">
            <h3>El Sol (SUVI)</h3>
            <p>Vista en tiempo (casi) real del Sol por longitudes de onda EUV.</p>
          </div>
          <SunViewer />
        </article>
      </div>

      <!-- Rayos X -->
      <div class="home__cell home__cell--xray">
        <article class="panel panel--chart">
          <div class="panel__head xray__head">
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
          </div>

          <div class="panel__body" aria-live="polite">
            <div v-if="xrError" class="panel__state panel__state--error">
              <strong>Problema al cargar rayos X.</strong>
              <p>{{ xrError }}</p>
            </div>
            <div v-else-if="xrLoading" class="panel__state panel__state--loading">
              <span class="loader" aria-hidden="true"></span>
              <p>Cargando rayos X…</p>
            </div>
            <div v-else-if="!xrHasData" class="panel__state">
              <p>No hay datos disponibles para este rango.</p>
            </div>

            <template v-else>
              <XRayChartFigure
                :long-by-sat="longBySat"
                :short-by-sat="shortBySat"
                :sats="sats"
                :height="260"
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
        </article>
      </div>

      <!-- Magnetómetro -->
      <div class="home__cell home__cell--magneto">
        <div class="panel panel--flush home__magneto-card">
          <MagnetometerChartOverview />
        </div>
      </div>

      <!-- Ionograma -->
      <div class="home__cell home__cell--ionogram">
        <IonogramLatest />
      </div>


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
.home__header h2 { color: #0f0f10; }
.home__header p  { color: #0f0f10; }

.home__grid {
  flex: 1;
  min-height: 0;
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(min(20rem, 100%), 1fr));
  grid-auto-rows: auto;
  align-items: start;
}

.home__cell { width: 100%; }
.home__cell > * { width: 100%; }

/* Day/Night a lo ancho y centrado */
.home__cell--daynight {
  grid-column: 1 / -1; /* ocupa todas las columnas del grid */
}

.daynight-wrap{
  display: flex;
  justify-content: center;
  padding: 8px 0 2px;
}

/* limitar ancho del card del mapa y usar todo el ancho en móvil */
.daynight-wrap :deep(.tad-card){
  width: min(1280px, 100%);
  box-shadow: 0 14px 32px rgba(0,0,0,.38);
}

/* ---------- Panels ---------- */
.panel {
  background: #ffffff;
  border-radius: 0.75rem;
  padding: 0.75rem 1rem;
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  height: auto;
}

.panel--chart { padding-bottom: 0.75rem; }
.panel--flush { padding: 0; background: transparent; box-shadow: none; }

.panel__head h3 { font-size: 1.05rem; font-weight: 600; color: #1f2933; }
.panel__head p   { color: #69707d; margin-bottom: 0.25rem; font-size: 0.85rem; }

.panel__body { flex: 0 1 auto; display: flex; flex-direction: column; min-height: 0; }

/* Estados */
.panel__state {
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
.panel__state--error { color: #b42318; border-color: rgba(180,35,24,.35); background: rgba(180,35,24,.06); }
.panel__state--loading { color: #0f0f10; }

.loader {
  width: 1.75rem; height: 1.75rem; border-radius: 50%;
  border: 3px solid rgba(37,99,235,.2); border-top-color:#2563eb;
  animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg) } }

.xray__head { display:flex; gap:.75rem; align-items:center; justify-content:space-between; flex-wrap:wrap; }
.xray__title h3 { margin-bottom: .25rem; }
.xray__controls { display:flex; gap:.5rem; align-items:center; flex-wrap:wrap; }
.xray__clock { display:flex; gap:.35rem; align-items:baseline; }
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

.xray__foot { margin-top:.5rem; color:#0f0f10; }

.home__magneto-card { height:100%; min-height:0; }
.home__magneto-card :deep(.magneto) { height:100%; min-height:0; }
.home__magneto-card :deep(.magneto__card){ height:100%; min-height:0; display:flex; flex-direction:column; }
.home__magneto-card :deep(.magneto__body){ flex:1; min-height:0; display:flex; flex-direction:column; }
.home__magneto-card :deep(.magneto__chart-wrapper){ flex:1; min-height:0; }
.home__magneto-card :deep(.magneto__chart){ height:100%; min-height:0; }

@media (min-width: 960px) {
  .home__grid { grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr)); }
}
@media (min-width: 1280px) {
  .home__grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
@media (max-width: 600px) {
  .panel { padding: .75rem; }
}
</style>
