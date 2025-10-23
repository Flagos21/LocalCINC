<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

import SunViewer from '@/components/SunViewer.vue'
import IonogramLatest from '@/components/IonogramLatest.vue'
import MagnetometerChartOverview from '@/components/MagnetometerChartOverview.vue'
import DraggablePanel from '@/components/DraggablePanel.vue'

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

const workspaceRef = ref(null)

const panelDefaults = {
  map: {
    position: { x: 24, y: 24 },
    size: { width: 820, height: 540 },
    min: { width: 560, height: 420 },
    max: { width: 1180, height: 780 },
  },
  sun: {
    position: { x: 876, y: 24 },
    size: { width: 420, height: 420 },
    min: { width: 320, height: 280 },
    max: { width: 560, height: 560 },
  },
  xray: {
    position: { x: 24, y: 600 },
    size: { width: 720, height: 420 },
    min: { width: 480, height: 320 },
    max: { width: 960, height: 620 },
  },
  magneto: {
    position: { x: 780, y: 600 },
    size: { width: 520, height: 420 },
    min: { width: 400, height: 320 },
    max: { width: 820, height: 620 },
  },
  ionogram: {
    position: { x: 24, y: 1060 },
    size: { width: 520, height: 420 },
    min: { width: 380, height: 320 },
    max: { width: 780, height: 620 },
  },
}

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

    <div ref="workspaceRef" class="home__workspace">
      <DraggablePanel
        panel-id="map"
        :container-ref="workspaceRef"
        :default-position="panelDefaults.map.position"
        :default-size="panelDefaults.map.size"
        :min-size="panelDefaults.map.min"
        :max-size="panelDefaults.map.max"
        :order="0"
      >
        <div class="map-panel">
          <div class="map-panel__handle" data-drag-handle>
            <strong>Mapa día/noche</strong>
            <span>Arrastra la barra para ubicar el mapa a tu gusto.</span>
          </div>
          <div class="map-panel__content" data-no-drag>
            <DayNightMap
              mode="satellite"
              height="100%"
              :auto-refresh-ms="60000"
              :show-twilight="true"
              :show-sun-moon="true"
              night-color="#050a18"
              twilight-color="#0b1736"
              :night-opacity="0.38"
              :twilight-civil-opacity="0.26"
              :twilight-nautical-opacity="0.18"
              :twilight-astro-opacity="0.12"
            />
          </div>
        </div>
      </DraggablePanel>

      <DraggablePanel
        panel-id="sun"
        :container-ref="workspaceRef"
        :default-position="panelDefaults.sun.position"
        :default-size="panelDefaults.sun.size"
        :min-size="panelDefaults.sun.min"
        :max-size="panelDefaults.sun.max"
        :order="1"
      >
        <article class="panel" data-drag-handle>
          <div class="panel__head">
            <h3>El Sol (SUVI)</h3>
            <p>Vista en tiempo (casi) real del Sol por longitudes de onda EUV.</p>
          </div>
          <SunViewer />
        </article>
      </DraggablePanel>

      <DraggablePanel
        panel-id="xray"
        :container-ref="workspaceRef"
        :default-position="panelDefaults.xray.position"
        :default-size="panelDefaults.xray.size"
        :min-size="panelDefaults.xray.min"
        :max-size="panelDefaults.xray.max"
        :order="2"
      >
        <article class="panel panel--chart" data-drag-handle>
          <div class="panel__head xray__head">
            <div class="xray__title">
              <h3>GOES X-ray Flux (0.05–0.4 nm y 0.1–0.8 nm)</h3>
              <p>Escala logarítmica con umbrales A/B/C/M/X. Fuente: SWPC.</p>
            </div>

            <div class="xray__controls" data-no-drag>
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

          <div class="panel__body" aria-live="polite" data-no-drag>
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
      </DraggablePanel>

      <DraggablePanel
        panel-id="magneto"
        :container-ref="workspaceRef"
        :default-position="panelDefaults.magneto.position"
        :default-size="panelDefaults.magneto.size"
        :min-size="panelDefaults.magneto.min"
        :max-size="panelDefaults.magneto.max"
        :order="3"
      >
        <div class="panel panel--flush home__magneto-card" data-drag-handle>
          <MagnetometerChartOverview />
        </div>
      </DraggablePanel>

      <DraggablePanel
        panel-id="ionogram"
        :container-ref="workspaceRef"
        :default-position="panelDefaults.ionogram.position"
        :default-size="panelDefaults.ionogram.size"
        :min-size="panelDefaults.ionogram.min"
        :max-size="panelDefaults.ionogram.max"
        :order="4"
      >
        <div class="panel panel--flush home__ionogram-card">
          <div class="panel__handle" data-drag-handle>
            <strong>Ionograma más reciente</strong>
            <span>Arrastra esta barra para reorganizarlo.</span>
          </div>
          <div class="panel__body panel__body--ionogram" data-no-drag>
            <IonogramLatest />
          </div>
        </div>
      </DraggablePanel>
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

.home__workspace {
  position: relative;
  flex: 1;
  width: 100%;
  min-height: 860px;
  height: clamp(1400px, 92vh, 2000px);
  border-radius: 1rem;
  background: linear-gradient(160deg, rgba(15, 23, 42, 0.18), rgba(15, 23, 42, 0.05));
  overflow: hidden;
}

.home__workspace::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  border: 1px solid rgba(148, 163, 184, 0.25);
  pointer-events: none;
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
  height: 100%;
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

.panel__handle {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  background: rgba(15, 23, 42, 0.72);
  color: #e2e8f0;
  padding: 0.55rem 0.8rem;
  border-radius: 0.6rem;
  margin-bottom: 0.6rem;
  cursor: grab;
  user-select: none;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.28);
}

.panel__handle strong {
  font-size: 1rem;
  font-weight: 600;
  color: inherit;
}

.panel__handle span {
  font-size: 0.85rem;
  color: rgba(226, 232, 240, 0.78);
}

.panel__handle:active {
  cursor: grabbing;
}

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

.home__ionogram-card {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.panel__body--ionogram {
  flex: 1;
  min-height: 0;
}

.panel__body--ionogram :deep(.ionogram-card) {
  height: 100%;
  min-height: 0;
}

.map-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 0.75rem;
  padding: 0.85rem 1rem 1rem;
}

.map-panel__handle {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  background: rgba(15, 23, 42, 0.85);
  color: #e2e8f0;
  padding: 0.65rem 0.9rem;
  border-radius: 0.75rem;
  cursor: grab;
  user-select: none;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.4);
}

.map-panel__handle:active {
  cursor: grabbing;
}

.map-panel__handle strong {
  font-size: 1.05rem;
  font-weight: 600;
  color: inherit;
}

.map-panel__handle span {
  font-size: 0.85rem;
  color: rgba(226, 232, 240, 0.8);
}

.map-panel__content {
  flex: 1;
  min-height: 0;
}

.map-panel__content :deep(.tad-card) {
  height: 100%;
  width: 100%;
  max-width: none;
  margin: 0;
  display: flex;
  flex-direction: column;
}

.map-panel__content :deep(.tad-map) {
  flex: 1;
  min-height: 0;
  height: auto;
}

.map-panel__content :deep(.tad-footer) {
  flex-shrink: 0;
}

@media (max-width: 600px) {
  .panel { padding: .75rem; }
}
</style>
