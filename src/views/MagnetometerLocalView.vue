<template>
  <section class="magneto-local">
    <header class="magneto-local__header">
      <div>
        <h2>Magnetómetros — Fuente local</h2>
        <p>Esta vista estará disponible próximamente con datos locales.</p>
      </div>
    </header>

    <div class="magneto-local__placeholder">
      <div class="placeholder-card">
        <p>Estamos preparando la visualización para fuentes locales.</p>
        <p class="placeholder-card__hint">Vuelve pronto para conocer las novedades.</p>
      </div>
    </div>
  </section>
</template>

<script setup>
</script>

<style scoped>
.magneto-local {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  flex: 1;
}

.magneto-local__header h2 {
  font-size: 1.75rem;
  font-weight: 600;
  color: #1f2933;
}

.magneto-local__header p {
  color: #52606d;
  margin-top: 0.25rem;
}

.magneto-local__placeholder {
  flex: 1;
  display: grid;
  place-items: center;
  min-height: 16rem;
}

.placeholder-card {
  background: #ffffff;
  padding: 2rem;
  border-radius: 0.75rem;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08), 0 4px 12px rgba(15, 23, 42, 0.06);
  text-align: center;
  max-width: 28rem;
}

.placeholder-card p {
  margin: 0;
  color: #1f2933;
}

.placeholder-card__hint {
  margin-top: 0.5rem;
  color: #64748b;
}
</style>
