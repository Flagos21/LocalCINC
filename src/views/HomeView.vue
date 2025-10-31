<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'

import SunViewer from '@/components/SunViewer.vue'
import IonogramLatest from '@/components/IonogramLatest.vue'
import MagnetometerChartOverview from '@/components/MagnetometerChartOverview.vue'
import ElectricFieldHomeCard from '@/components/ElectricFieldHomeCard.vue'
import AspectRatioControl from '@/components/AspectRatioControl.vue'

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

const aspectOptions = [
  { value: '5:4', label: '5:4' },
  { value: '4:3', label: '4:3' },
  { value: '3:2', label: '3:2' },
  { value: '1:1', label: '1:1' },
  { value: '16:9', label: '16:9' },
]

const defaultAspect = aspectOptions[0].value

const sunAspect = ref(defaultAspect)
const xrayAspect = ref(defaultAspect)
const magnetoAspect = ref(defaultAspect)
const ionogramAspect = ref(defaultAspect)
const mapAspect = ref(defaultAspect)

function toAspectCss(value) {
  const [w, h] = String(value)
    .split(':')
    .map((part) => Number(part.trim()))

  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return '5 / 4'
  }

  return `${w} / ${h}`
}

const sunAspectVars = computed(() => ({ '--dashboard-aspect': toAspectCss(sunAspect.value) }))
const xrayAspectVars = computed(() => ({ '--dashboard-aspect': toAspectCss(xrayAspect.value) }))
const magnetoAspectVars = computed(() => ({ '--dashboard-aspect': toAspectCss(magnetoAspect.value) }))
const ionogramAspectVars = computed(() => ({ '--dashboard-aspect': toAspectCss(ionogramAspect.value) }))
const mapAspectVars = computed(() => ({ '--dashboard-aspect': toAspectCss(mapAspect.value) }))

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
      <div class="home__cell home__cell--sun">
        <article class="panel panel--sun">
          <div class="panel__head">
            <h3>El Sol (SUVI)</h3>
            <p>Vista en tiempo (casi) real del Sol por longitudes de onda EUV.</p>
          </div>
          <div class="panel__body panel__body--sun">
            <div class="panel__aspect-target panel__aspect-target--sun" :style="sunAspectVars">
              <SunViewer />
            </div>
          </div>
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
                <p>No hay datos disponibles para este intervalo.</p>
              </div>

              <template v-else>
                <div class="panel__aspect-target panel__aspect-target--chart">
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
            <div v-else-if="!xrHasData" class="panel__state">
              <p>No hay datos disponibles para este intervalo.</p>
            </div>

            <template v-else>
              <div class="panel__aspect-target panel__aspect-target--chart" :style="xrayAspectVars">
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
      </div>

      <!-- Campo eléctrico local -->
      <div class="home__cell home__cell--electric">
        <div class="home__tile" :style="electricAspectVars">
          <ElectricFieldHomeCard />
        </div>
      </div>

      <!-- Magnetómetro -->
      <div class="home__cell home__cell--magneto">
        <MagnetometerChartOverview :style="magnetoAspectVars">
          <template #aspect-control>
            <AspectRatioControl v-model="magnetoAspect" :options="aspectOptions" />
          </template>
        </MagnetometerChartOverview>
      </div>

      <!-- Ionograma -->
      <div class="home__cell home__cell--ionogram">
        <div class="home__tile" :style="ionogramAspectVars">
          <IonogramLatest>
            <template #aspect-control>
              <AspectRatioControl v-model="ionogramAspect" :options="aspectOptions" />
            </template>
          </IonogramLatest>
        </div>
      </div>

      <!-- Mapa día/noche -->
      <div class="home__cell home__cell--map">
        <article class="panel panel--map">
          <div class="panel__head">
            <div>
              <h3>Mapa día/noche</h3>
              <p>Observa el terminador solar y penumbras actualizadas cada minuto.</p>
            </div>
            <AspectRatioControl v-model="mapAspect" :options="aspectOptions" />
          </div>
          <div class="panel__body panel__body--map">
            <div class="panel__aspect-target panel__aspect-target--map" :style="mapAspectVars">
              <DayNightMap
                mode="map"
                height="100%"
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
        </article>
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
.home__header h2 { color: #ffffff; }
.home__header p  { color: #ffffff; }

.home__grid {
  flex: 1;
  min-height: 0;
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(min(20rem, 100%), 1fr));
  grid-auto-rows: auto;
  align-items: start;
  justify-items: stretch;
}

.home__cell { width: 100%; display: flex; align-items: stretch; }
.home__cell > * { width: 100%; }

/* ---------- Panels ---------- */
.panel {
  background: #ffffff;
  border-radius: 0.75rem;
  padding: 0.75rem 1rem;
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  height: 100%;
  min-height: 0;
}

.panel--chart { padding-bottom: 0.75rem; }
.panel--flush { padding: 0; background: transparent; box-shadow: none; }

.panel__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
}

.panel__head :deep(.aspect-control) {
  flex-shrink: 0;
}

.panel__head > * {
  min-width: 0;
}

.panel__head h3 { font-size: 1.05rem; font-weight: 600; color: #1f2933; }
.panel__head p   { color: #69707d; margin-bottom: 0.25rem; font-size: 0.85rem; }

.panel__body {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 0;
}
.panel__body--sun {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
}

.panel__body--map { flex: 1 1 auto; }
.panel__body--map :deep(.tad-card) {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 980px;
  margin: 0 auto;
}
.panel__body--map :deep(.tad-map) {
  flex: 1 1 auto;
  min-height: 0;
}

.panel__aspect-target {
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  position: relative;
  aspect-ratio: var(--dashboard-aspect, 5 / 4);
  flex: none;
}

.panel__aspect-target > * {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
}

.panel__aspect-target--sun {
  background: #050a18;
  border-radius: 0.75rem;
  overflow: hidden;
}

.panel__aspect-target--sun :deep(.sunviewer) {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
}

.panel__aspect-target--sun :deep(.sunviewer__frame) {
  margin: 0;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  max-width: 100%;
}

.panel__aspect-target--sun :deep(.sunviewer__img) {
  max-height: 100%;
}

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
.xray__controls { display:flex; gap:.5rem; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
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
