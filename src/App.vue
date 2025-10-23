<script setup>
import { RouterLink, RouterView } from 'vue-router'
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'

const now = ref(new Date())
let timerId = null // 👈 sin tipos TS

onMounted(() => {
  timerId = setInterval(() => { now.value = new Date() }, 1000)
})
onBeforeUnmount(() => { if (timerId) clearInterval(timerId) })

function formatDT(date, timeZone) {
  return new Intl.DateTimeFormat('es-CL', {
    timeZone, hour12: false, dateStyle: 'short', timeStyle: 'medium'
  }).format(date)
}

const utcText = computed(() => formatDT(now.value, 'UTC'))
const clText  = computed(() => formatDT(now.value, 'America/Santiago'))
const utcISO  = computed(() => now.value.toISOString())
</script>

<template>
  <div class="app-shell">
    <header class="navbar">
      <nav class="nav-links">
        <RouterLink to="/" class="nav-link">Inicio</RouterLink>
        <div class="nav-item nav-dropdown">
          <button class="nav-link nav-link--trigger" type="button">
            Productos <span class="nav-caret" aria-hidden="true">▾</span>
          </button>
          <div class="dropdown-menu">
            <RouterLink to="/sol" class="dropdown-link">Sol</RouterLink>
            <RouterLink to="/rayos-x" class="dropdown-link">Rayos X</RouterLink>
            <RouterLink to="/ionograms" class="dropdown-link">Ionosondas</RouterLink>
            <div class="dropdown-submenu">
              <button class="dropdown-link dropdown-link--parent" type="button">
                Magnetómetros <span class="nav-caret" aria-hidden="true">▸</span>
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

    <!-- Franja de hora -->
    <div class="timebar" aria-live="polite">
      <div class="time-item">
        <span class="time-label">UTC</span>
        <time :datetime="utcISO">{{ utcText }}</time>
      </div>
      <span class="time-sep">•</span>
      <div class="time-item">
        <span class="time-label">Chile (America/Santiago)</span>
        <span>{{ clText }}</span>
      </div>
    </div>

    <main class="content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-shell { display:flex; min-height:100vh; flex-direction:column; width:100%; overflow-x:hidden; }

/* Navbar */
.navbar {
  display:flex; align-items:center; gap:clamp(1rem,3vw,2.5rem);
  padding:1rem clamp(1rem,2vw,1.5rem); background:#1f2933; color:#fff;
  box-shadow:0 2px 6px rgba(0,0,0,.1); position:sticky; top:0; z-index:1000; width:100%;
}
.brand { font-size:1.25rem; font-weight:600; margin:0 0 0 auto; text-align:right; }
.brand__link { color:inherit; text-decoration:none; }
.nav-links { display:flex; gap:clamp(.75rem,2vw,1.5rem); align-items:center; flex-wrap:wrap; flex:1 1 auto; justify-content:center; min-width:0; }
.nav-link { color:inherit; font-weight:500; text-decoration:none; padding-bottom:.25rem; border-bottom:2px solid transparent; transition:border-color .2s ease; }
.nav-link.router-link-active { border-color:#38bdf8; }
.nav-link:hover, .nav-link:focus-visible { border-color:rgba(255,255,255,.5); }
.nav-item { position:relative; }
.nav-link--trigger { background:none; border:none; font:inherit; display:inline-flex; align-items:center; gap:.35rem; cursor:pointer; padding:0; }
.nav-caret { font-size:.75rem; }

.dropdown-menu {
  position:absolute; top:calc(100% + .6rem); left:0; display:flex; flex-direction:column; min-width:12rem;
  background:#0f172a; border-radius:.5rem; box-shadow:0 10px 25px rgba(15,23,42,.25);
  padding:.5rem 0; opacity:0; pointer-events:none; transform:translateY(-.5rem);
  transition:opacity .15s ease, transform .15s ease; z-index:10;
}
.nav-dropdown:hover>.dropdown-menu, .nav-dropdown:focus-within>.dropdown-menu { opacity:1; pointer-events:auto; transform:translateY(0); }
.dropdown-link { color:#f8fafc; text-decoration:none; padding:.55rem 1rem; display:flex; align-items:center; justify-content:space-between; gap:.5rem; font-weight:500; }
.dropdown-link:hover, .dropdown-link:focus-visible { background:rgba(148,163,184,.25); }
.dropdown-link.router-link-active { background:rgba(56,189,248,.25); }
.dropdown-link--parent { width:100%; background:none; border:none; font:inherit; cursor:pointer; }
.dropdown-submenu { position:relative; }
.dropdown-menu--nested { top:0; left:calc(100% + .5rem); transform:translateY(0) translateX(-.5rem); }
.dropdown-submenu:hover>.dropdown-menu--nested, .dropdown-submenu:focus-within>.dropdown-menu--nested { opacity:1; pointer-events:auto; transform:translateY(0) translateX(0); }

/* Franja hora */
.timebar {
  background:#0f172a; color:#e5e7eb; display:flex; align-items:center; justify-content:center;
  gap:.75rem; padding:.4rem 1rem; font-size:.95rem; box-shadow: inset 0 1px 0 rgba(255,255,255,.06); flex-wrap:wrap;
}
.time-item { display:inline-flex; align-items:baseline; gap:.5rem; font-variant-numeric: tabular-nums; }
.time-label { font-weight:600; color:#93c5fd; }
.time-sep { opacity:.6; }

/* Main */
.content {
  flex:1; display:flex; flex-direction:column; min-height:0;
  padding:1.5rem; background:#0b1220; /* más oscuro para resaltar paneles y el mapa */
  overflow-x:hidden;
}

@media (max-width: 720px) {
  .navbar { flex-direction:column; align-items:stretch; }
  .nav-links { justify-content:center; }
  .brand { margin-left:0; text-align:center; }
}
</style>
