<script setup>
import SunViewer from '@/components/SunViewer.vue'

const sections = [
  { title: 'El Sol (SUVI)', description: 'Vista en tiempo (casi) real del Sol por longitudes de onda EUV.' },
  { title: 'Sección 2', description: 'Espacio reservado para un gráfico o imagen.' },
  { title: 'Sección 3', description: 'Espacio reservado para un gráfico o imagen.' },
  { title: 'Sección 4', description: 'Espacio reservado para un gráfico o imagen.' },
]
</script>

<template>
  <section class="home">
    <header class="home__header">
      <h2>Panel principal</h2>
      <p>Visualiza aquí los indicadores clave cuando estén disponibles.</p>
    </header>

    <div class="home__grid">
      <!-- Primera tarjeta con el visor del Sol -->
      <article class="panel panel--tall">
        <div class="panel__head">
          <h3>{{ sections[0].title }}</h3>
          <p>{{ sections[0].description }}</p>
        </div>
        <SunViewer />
      </article>

      <!-- Resto de tarjetas como placeholder -->
      <article
        v-for="section in sections.slice(1)"
        :key="section.title"
        class="panel"
      >
        <h3>{{ section.title }}</h3>
        <p>{{ section.description }}</p>
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
  color: #1f2933;
}

.home__header p {
  color: #52606d;
}

.home__grid {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}

/* Tarjetas */
.panel {
  background: #ffffff;
  border-radius: 0.75rem;
  padding: 1rem 1.25rem;
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 220px; /* altura base de las tarjetas normales */
}

.panel__head h3 {
  font-size: 1.1rem;
  font-weight: 600;
  color: #1f2933;
}
.panel__head p {
  color: #69707d;
  margin-bottom: 0.25rem;
}

/* La primera sección un poco más alta para que el SunViewer respire */
.panel--tall {
  min-height: 420px;
}
</style>
