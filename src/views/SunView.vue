<template>
  <section class="sun">
    <header class="sun__header">
      <div>
        <h2>Imágenes del Sol (GOES-SUVI)</h2>
        <p>Selecciona filtros y modos de visualización para analizar la actividad solar en EUV.</p>
      </div>
    </header>

    <div class="sun__viewer">
      <SunViewer />
    </div>
  </section>
</template>

<script setup>
import SunViewer from '@/components/SunViewer.vue'
</script>

<style scoped>
.sun {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  flex: 1;
  min-height: 0;
  width: min(100%, 68rem);
  margin: 0 auto;
}

.sun__header h2 {
  font-size: 1.75rem;
  font-weight: 600;
  color: #1f2933;
}

.sun__header p {
  color: #52606d;
  margin-top: 0.25rem;
}

.sun__viewer {
  flex: 1;
  min-height: 0;
  padding: 1.25rem;
  background: #ffffff;
  border-radius: 0.75rem;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08), 0 4px 12px rgba(15, 23, 42, 0.06);
  display: flex;
  justify-content: center;
}
</style>
