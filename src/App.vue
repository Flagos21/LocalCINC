<script setup>
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="app-shell">
    <header class="navbar">
      <nav class="nav-links">
        <RouterLink to="/" class="nav-link">Inicio</RouterLink>
        <div class="nav-item nav-dropdown">
          <button class="nav-link nav-link--trigger" type="button">
            Productos
            <span class="nav-caret" aria-hidden="true">▾</span>
          </button>
          <div class="dropdown-menu">
            <RouterLink to="/sol" class="dropdown-link">Sol</RouterLink>
            <RouterLink to="/rayos-x" class="dropdown-link">Rayos X</RouterLink>
            <RouterLink to="/ionograms" class="dropdown-link">Ionosondas</RouterLink>
            <div class="dropdown-submenu">
              <button class="dropdown-link dropdown-link--parent" type="button">
                Magnetómetros
                <span class="nav-caret" aria-hidden="true">▸</span>
              </button>
              <div class="dropdown-menu dropdown-menu--nested">
                <RouterLink to="/magnetometros/influxdb" class="dropdown-link">InfluxDB</RouterLink>
                <RouterLink to="/magnetometros/local" class="dropdown-link">Local</RouterLink>
              </div>
            </div>
          </div>
        </div>
      </nav>
      <h1 class="brand">
        <RouterLink to="/" class="brand__link">LocalCINC</RouterLink>
      </h1>
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
  width: 100%;
  overflow-x: hidden;
}

.navbar {
  display: flex;
  align-items: center;
  gap: clamp(1rem, 3vw, 2.5rem);
  padding: 1rem clamp(1rem, 2vw, 1.5rem);
  background-color: #1f2933;
  color: #ffffff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
  position: sticky;
  top: 0;
  z-index: 1000;
  width: 100%;
  box-sizing: border-box;
}

.brand {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0;
  margin-left: auto;
  text-align: right;
}

.brand__link {
  color: inherit;
  text-decoration: none;
}

.nav-links {
  display: flex;
  gap: clamp(0.75rem, 2vw, 1.5rem);
  align-items: center;
  flex-wrap: wrap;
  flex: 1 1 auto;
  justify-content: center;
  min-width: 0;
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

.nav-link:hover,
.nav-link:focus-visible {
  border-color: rgba(255, 255, 255, 0.5);
}

.nav-item {
  position: relative;
}

.nav-link--trigger {
  background: none;
  border: none;
  font: inherit;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  cursor: pointer;
  padding: 0;
}

.nav-caret {
  font-size: 0.75rem;
}

.dropdown-menu {
  position: absolute;
  top: calc(100% + 0.6rem);
  left: 0;
  display: flex;
  flex-direction: column;
  min-width: 12rem;
  background: #0f172a;
  border-radius: 0.5rem;
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.25);
  padding: 0.5rem 0;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-0.5rem);
  transition: opacity 0.15s ease, transform 0.15s ease;
  z-index: 10;
}

.nav-dropdown:hover > .dropdown-menu,
.nav-dropdown:focus-within > .dropdown-menu {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.dropdown-link {
  color: #f8fafc;
  text-decoration: none;
  padding: 0.55rem 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  font-weight: 500;
}

.dropdown-link:hover,
.dropdown-link:focus-visible {
  background: rgba(148, 163, 184, 0.25);
}

.dropdown-link.router-link-active {
  background: rgba(56, 189, 248, 0.25);
}

.dropdown-link--parent {
  width: 100%;
  background: none;
  border: none;
  font: inherit;
  cursor: pointer;
}

.dropdown-submenu {
  position: relative;
}

.dropdown-menu--nested {
  top: 0;
  left: calc(100% + 0.5rem);
  transform: translateY(0) translateX(-0.5rem);
}

.dropdown-submenu:hover > .dropdown-menu--nested,
.dropdown-submenu:focus-within > .dropdown-menu--nested {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0) translateX(0);
}

.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 1.5rem;
  background-color: #f3f4f6;
  overflow: hidden;
}

@media (max-width: 720px) {
  .navbar {
    flex-direction: column;
    align-items: stretch;
  }

  .nav-links {
    justify-content: center;
  }

  .brand {
    margin-left: 0;
    text-align: center;
  }
}
</style>
