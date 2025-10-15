<script setup>
const sections = [
  { title: 'Sección 1', description: 'Espacio reservado para un gráfico o imagen.' },
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
      <article v-for="section in sections" :key="section.title" class="panel">
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
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.panel {
  background: #ffffff;
  border-radius: 0.75rem;
  padding: 1.5rem;
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.75rem;
  min-height: 180px;
}

.panel h3 {
  font-size: 1.1rem;
  font-weight: 600;
  color: #1f2933;
}

.panel p {
  color: #69707d;
}
</style>
