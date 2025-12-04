<template>
  <section class="sun">
    <header class="sun__header">
      <div>
        <h2>Imágenes del Sol (GOES-SUVI)</h2>
        <p>Selecciona filtros y modos de visualización para analizar la actividad solar en EUV.</p>
      </div>
    </header>

    <div class="sun__card">
      <div class="sun__surface">
        <SunViewer />
      </div>
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
  gap: 1.35rem;
  flex: 1;
  min-height: 0;
  width: min(100%, 72rem);
  margin: 0 auto;
}

.sun__header h2 {
  font-size: 1.75rem;
  font-weight: 600;
  color: #0f172a;
}

.sun__header p {
  color: #475569;
  margin-top: 0.3rem;
  max-width: 48ch;
}

.sun__card {
  background: #ffffff;
  border-radius: 0.85rem;
  border: 1px solid #e2e8f0;
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.08);
  padding: 1.1rem;
}

.sun__surface {
  border-radius: 0.75rem;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  padding: 0.5rem;
  display: grid;
  place-items: center;
  min-height: clamp(22rem, 50vh, 34rem);
}
</style>
