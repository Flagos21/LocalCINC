<script setup>
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="app-shell">
    <header class="navbar">
      <h1 class="brand">LocalCINC</h1>
      <nav class="nav-links">
        <RouterLink to="/" class="nav-link">Home</RouterLink>
        <RouterLink to="/graphs" class="nav-link">Gráficos</RouterLink>
      </nav>
    </header>

    <main class="content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  min-height: 100vh;
  flex-direction: column;
}

.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  background-color: #1f2933;
  color: #ffffff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.brand {
  font-size: 1.25rem;
  font-weight: 600;
}

.nav-links {
  display: flex;
  gap: 1rem;
}

.nav-link {
  color: inherit;
  font-weight: 500;
  text-decoration: none;
  padding-bottom: 0.25rem;
  border-bottom: 2px solid transparent;
  transition: border-color 0.2s ease;
}

.nav-link.router-link-active {
  border-color: #38bdf8;
}

.nav-link:hover {
  border-color: rgba(255, 255, 255, 0.5);
}

.content {
  flex: 1;
  padding: 2rem 1.5rem 3rem;
  background-color: #f3f4f6;
}
</style>
