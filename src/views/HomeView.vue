<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import MagnetometerChartFigure from '@/components/MagnetometerChartFigure.vue';
import SunViewer from '@/components/SunViewer.vue';
import XRayChartFigure from '@/components/XRayChartFigure.vue';
import { useMagnetometerSeries } from '@/composables/useMagnetometerSeries';
import { useGoesXrays } from '@/composables/useGoesXrays';

const placeholders = [
  { title: 'Sección 3', description: 'Espacio reservado para un gráfico o imagen.' },
  { title: 'Sección 4', description: 'Espacio reservado para un gráfico o imagen.' }
];

/* -------- Magnetómetro -------- */
const range = ref('7d');
const every = ref('1h');
const unit = ref('nT');
const { labels, series, isLoading, errorMessage } = useMagnetometerSeries({
  range, every, unit, station: 'CHI'
});
const hasData = computed(() => labels.value.length > 0 && series.value.length > 0);

/* -------- GOES X-rays (por satélite) -------- */
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
  range: xrRange,        // <- v-model del <select>
  refresh
} = useGoesXrays({ range: '6h', pollMs: 60000, auto: true });

/* Reloj UTC (visual) */
const utcNow = ref(new Date());
let clockTimer = null;
onMounted(() => { clockTimer = window.setInterval(() => { utcNow.value = new Date(); }, 1000); });
onBeforeUnmount(() => { if (clockTimer) clearInterval(clockTimer); });

function fmtUTC(d) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).format(d) + ' UTC';
}
</script>

<template>
  <section class="home">
    <header class="home__header">
      <h2>Panel principal</h2>
      <p>Visualiza aquí los indicadores clave cuando estén disponibles.</p>
    </header>

    <div class="home__grid">
      <article class="panel panel--tall">
        <div class="panel__head">
          <h3>El Sol (SUVI)</h3>
          <p>Vista en tiempo (casi) real del Sol por longitudes de onda EUV.</p>
        </div>
        <SunViewer />
      </article>

      <article class="panel panel--chart">
        <div class="panel__head">
          <h3>Componente H (últimos 7 días)</h3>
          <p>Promedio horario de la estación CHI.</p>
        </div>
        <div class="panel__body" aria-live="polite">
          <div v-if="errorMessage" class="panel__state panel__state--error">
            <strong>Hubo un problema al cargar los datos.</strong>
            <p>{{ errorMessage }}</p>
          </div>
          <div v-else-if="isLoading" class="panel__state panel__state--loading">
            <span class="loader" aria-hidden="true" />
            <p>Cargando datos…</p>
          </div>
          <div v-else-if="!hasData" class="panel__state">
            <p>No hay datos disponibles para este periodo.</p>
          </div>
          <MagnetometerChartFigure v-else :labels="labels" :series="series" :unit="unit" />
        </div>
      </article>

      <article v-for="section in placeholders" :key="section.title" class="panel">
        <h3>{{ section.title }}</h3>
        <p>{{ section.description }}</p>
      </article>

      <!-- CARD HORIZONTAL: GOES X-ray Flux -->
      <article class="panel panel--chart panel--wide">
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

            <button class="toggle" :class="{ 'is-on': autoRefresh }" @click="toggleAuto" type="button" :aria-pressed="autoRefresh">
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
            <!-- ahora pasamos las series por satélite -->
            <XRayChartFigure :long-by-sat="longBySat" :short-by-sat="shortBySat" :sats="sats" />
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
  </section>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.home__header h2 {
  font-size: 1.75rem;
  font-weight: 600;
  color: #0f0f10; /* antes: #1f2933 */
}

.home__header p {
  color: #0f0f10; /* antes: #52606d */
}

.home__grid {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}

.panel {
  background: #ffffff;
  border-radius: 0.75rem;
  padding: 1rem 1.25rem;
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 220px;
  color: #0f0f10; /* fuerza negro por defecto dentro del panel */
}

.panel__head h3 {
  font-size: 1.1rem;
  font-weight: 600;
  color: #0f0f10; /* antes: #1f2933 */
}

.panel__head p {
  color: #0f0f10; /* antes: #69707d */
  margin-bottom: 0.25rem;
}

.panel__body { flex: 1; display: flex; flex-direction: column; }

.panel__state {
  margin-top: auto;
  margin-bottom: auto;
  display: grid;
  place-items: center;
  text-align: center;
  gap: 0.5rem;
  color: #0f0f10; /* antes: #52606d */
  padding: 2rem 1rem;
  border: 1px dashed #d3dae6;
  border-radius: 0.75rem;
}

.panel__state--error {
  color: #b42318;
  border-color: rgba(180, 35, 24, 0.35);
  background: rgba(180, 35, 24, 0.06);
}

.panel__state--loading { color: #0f0f10; }

.loader {
  width: 1.75rem; height: 1.75rem; border-radius: 50%;
  border: 3px solid rgba(37, 99, 235, 0.2);
  border-top-color: #2563eb;
  animation: spin 1s linear infinite;
}
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.panel--tall { min-height: 420px; }
.panel--chart { min-height: 420px; }

/* ===== X-Rays (full width) ===== */
.panel--wide { grid-column: 1 / -1; }

.xray__head { display: flex; gap: 0.75rem; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; }
.xray__title h3 { margin-bottom: .25rem; }

.xray__controls { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; }

.xray__clock { display: flex; gap: .35rem; align-items: baseline; }

/* Etiquetas y textos auxiliares ahora negros */
.tag { color: #0f0f10; font-size: .85rem; }

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  color: #0f0f10;
}

/* Toggle */
.toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: .5rem;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  border-radius: 9999px;
  padding: .25rem .6rem .25rem .25rem;
  cursor: pointer;
  color: #0f0f10; /* texto negro */
}
.toggle .knob { width: 1.25rem; height: 1.25rem; border-radius: 9999px; background: #94a3b8; transition: all .2s ease; }
.toggle.is-on { border-color: #2563eb; background: #eff6ff; }
.toggle.is-on .knob { background: #2563eb; transform: translateX(1.1rem); }
.toggle .label { font-size: .85rem; color: #0f0f10; } /* antes: #0f172a (oscuro azulado) */

.ghost {
  background: transparent;
  border: 1px solid #cbd5e1;
  color: #0f0f10; /* antes: #0f172a */
  padding: .35rem .6rem;
  border-radius: .5rem;
  cursor: pointer;
}
.ghost:hover { background: #f1f5f9; }

.xray__foot { margin-top: .5rem; color: #0f0f10; } /* antes: #64748b */
</style>
