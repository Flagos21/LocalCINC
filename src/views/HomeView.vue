<script setup>
import SunHomeCard from '@/components/SunHomeCard.vue'
import IonogramLatest from '@/components/IonogramLatest.vue'
import MagnetometerChartOverview from '@/components/MagnetometerChartOverview.vue'
// import ElectricFieldHomeCard from '@/components/ElectricFieldHomeCard.vue' // histórico (conservado)
import ElectricFieldLiveHomeCard from '@/components/ElectricFieldLiveHomeCard.vue' // LIVE con controles
import XRayHomeCard from '@/components/XRayHomeCard.vue'
import DayNightMapCard from '@/components/DayNightMapCard.vue'
</script>

<template>
  <section class="home">
    <div class="home__grid">
      <div class="home__grid-top">
        <XRayHomeCard />

        <div class="home__grid-top-right">
          <article class="home__tile home__tile--magneto">
            <MagnetometerChartOverview />
          </article>

          <article class="home__tile home__tile--electric">
            <!-- <ElectricFieldHomeCard /> -->
            <ElectricFieldLiveHomeCard />
          </article>
        </div>
      </div>

      <div class="home__grid-bottom">
        <SunHomeCard />

        <article class="home__tile home__tile--ionogram">
          <IonogramLatest />
        </article>

        <DayNightMapCard />
      </div>
    </div>
  </section>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  flex: 1;
  min-height: 0;
  height: auto;
  overflow: hidden;
}

/* Titulares en negro sobre fondo oscuro del main */
.home__header h2 { color: #ffffff; }
.home__header p  { color: #ffffff; }

.home__grid {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.home__grid-top {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1fr);
  align-items: stretch;
}

.home__grid-top-right {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1fr);
}

.home__grid-bottom {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1fr);
  align-items: stretch;
  justify-items: center;

  /* ↑ aumenté el clamp para que Sol/Mapa no queden “cortados” */
  --home-bottom-media-height: clamp(19rem, min(40vw, 46vh), 27rem);
}

.home__grid-bottom > .home__tile {
  width: min(100%, 28rem);
}

.home__tile {
  background: #ffffff;
  border-radius: 0.75rem;
  padding: 0.9rem 1rem 1rem;
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.home__tile-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.home__tile-head h3 { font-size: 1.05rem; font-weight: 600; color: #1f2933; }
.home__tile-head p  { color: #69707d; margin-top: 0.25rem; font-size: 0.9rem; }

.home__tile-body {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  min-height: 0;
  overflow: hidden;
}

.home__tile-divider {
  height: 1px; width: 100%;
  background: #e2e8f0; border-radius: 999px;
  margin: 0.5rem 0 0.75rem;
}

.home__tile-subsection { display: flex; flex-direction: column; gap: 0.75rem; min-height: 0; }
.home__tile-subsection :deep(.dst-card) { flex: 0 0 auto !important; }

.home__tile-subhead {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 0.5rem; margin-bottom: 0.25rem;
}
.home__tile-subhead h4 { margin: 0; font-size: 0.95rem; font-weight: 600; color: #1f2933; }
.home__tile-subhead p  { margin: 0.2rem 0 0; font-size: 0.85rem; color: #64748b; }

.home__tile-visual {
  width: 100%;
  height: clamp(14rem, 24vh, 19rem);
  border-radius: 0.75rem;
  overflow: hidden;
  position: relative;
  display: grid;
  place-items: center;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.home__tile-visual--chart {
  min-height: clamp(17rem, 32vh, 26rem);
}

/* === MAGNETO === */
.home__tile--magneto { padding: 0; }
.home__tile--magneto > * { height: 100%; min-height: 0; display: flex; flex-direction: column; }
.home__tile--magneto :deep(.magneto__body) { display: flex; flex-direction: column; gap: 0.75rem; flex: 1 1 auto; min-height: 0;
 }
.home__tile--magneto :deep(.magneto__chart-wrapper) {
  width: 100%; height: clamp(18rem, 36vh, 26rem);
  border-radius: 0.75rem; overflow: hidden; background: #ffffff; border: 1px solid #e2e8f0;
  display: flex; align-items: stretch; justify-content: center;
}
.home__tile--magneto :deep(.magneto__chart) { flex: 1 1 auto; min-height: 0; }

/* === ELECTRIC LIVE === */
.home__tile--electric { padding: 0; }
.home__tile--electric :deep(.efield-home__chart) {
  /* un poco más alto para que se respire bien el chart */
  min-height: clamp(19rem, 34vh, 28rem);
}

/* === IONOGRAM ===
   -> devolvemos fondo y sombra para que tenga el “contorno” igual a los demás tiles */
.home__tile--ionogram {
  padding: 0;            /* el cuerpo del componente controla el interior */
  background: #ffffff;   /* antes estaba transparente */
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.08);
  border-radius: 0.75rem;
}
.home__tile--ionogram :deep(.ionogram-card) {
  height: 100%; min-height: 0; display: flex; flex-direction: column;
  --ionogram-body-min-height: var(--home-bottom-media-height);
}
.home__tile--ionogram :deep(.ionogram-card__body) {
  flex: 1 1 auto; width: 100%; margin: 0 auto; border-radius: 0.75rem;
  overflow: hidden; border: 1px solid #e2e8f0; background: #ffffff;
  display: flex; align-items: center; justify-content: center;
  min-height: var(--home-bottom-media-height);
}
.home__tile--ionogram :deep(.ionogram-card__image) { width: 100%; height: 100%; object-fit: contain; }

/* utilidades varias */
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

.loader { width: 1.75rem; height: 1.75rem; border-radius: 50%; border: 3px solid rgba(37,99,235,.2); border-top-color:#2563eb; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg) } }

@media (min-width: 960px) {
  .home__grid-top {
    grid-template-columns: minmax(24rem, 0.95fr) minmax(28rem, 1.1fr);
    align-items: stretch;
  }
  .home__grid-top-right { grid-template-rows: repeat(2, minmax(0, 1fr)); }
  .home__grid-bottom { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (min-width: 1280px) {
  .home__grid-top { grid-template-columns: minmax(26rem, 1fr) minmax(32rem, 1.1fr); }
}

@media (max-width: 600px) {
  .home__tile { padding: 0.75rem; }
}
</style>
