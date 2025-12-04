<script setup>
import { RouterLink, RouterView } from 'vue-router'
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'

/* ==== Reloj ==== */
const now = ref(new Date())
let timerId = null
onMounted(() => { timerId = setInterval(() => { now.value = new Date() }, 1000) })
onBeforeUnmount(() => { if (timerId) clearInterval(timerId) })

function formatDT(date, timeZone) {
  return new Intl.DateTimeFormat('es-CL', {
    timeZone, hour12: false, dateStyle: 'short', timeStyle: 'medium'
  }).format(date)
}
const utcText = computed(() => formatDT(now.value, 'UTC'))
const clText  = computed(() => formatDT(now.value, 'America/Santiago'))
const utcISO  = computed(() => now.value.toISOString())

/* ==== Medir alto del masthead (navbar + timebar) y empujar el main ==== */
const mastheadEl = ref(null)
const navEl = ref(null)
const timebarEl = ref(null)
const styleVars = ref({})

function measure() {
  const navH  = navEl.value?.offsetHeight || 0
  const timeH = timebarEl.value?.offsetHeight || 0
  const total = navH + timeH
  styleVars.value = {
    '--nav-h': `${navH}px`,
    '--time-h': `${timeH}px`,
    '--masthead-h': `${total}px`
  }
}
onMounted(() => {
  // medir al montar y cuando cambie el tamaño (o fuentes)
  measure()
  window.addEventListener('resize', measure)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', measure)
})
</script>

<template>
  <div class="app-shell" :style="styleVars">
    <!-- Bloque fijo: navbar + timebar -->
    <div class="masthead" ref="mastheadEl" aria-label="Barra fija de navegación y hora">
      <header class="navbar" ref="navEl">
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
              <RouterLink to="/efm-live" class="dropdown-link">Campo eléctrico</RouterLink>
              <RouterLink to="/mapa-dia-noche" class="dropdown-link">Mapa día/noche</RouterLink>
              <RouterLink to="/magnetometros/tiempo-real" class="dropdown-link">Magnetómetro (tiempo real)</RouterLink>
            </div>
          </div>
        </nav>
        <h1 class="brand">
          <RouterLink to="/" class="brand__link">LocalCINC</RouterLink>
        </h1>
      </header>

      <!-- Franja de hora -->
      <div class="timebar" ref="timebarEl" aria-live="polite">
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
    </div>

    <!-- Contenido empujado hacia abajo según la altura fija -->
    <main class="content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display:flex; min-height:100vh; flex-direction:column; width:100%;
  /* OJO: no ocultamos overflow-y aquí para no interferir con fixed */
  overflow-x:hidden;
}

/* ===== MASTHEAD FIJO (navbar + timebar) ===== */
.masthead{
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 2000;  /* bien arriba */
  /* Fondo sólido para que no “transparente” al hacer scroll */
  background: #1f2933; /* coincide con navbar */
  /* la timebar ya tiene su propio color, así que no se nota el cambio de bloque */
  box-shadow: 0 2px 6px rgba(0,0,0,.15);
}

/* ===== Navbar (dentro del masthead) ===== */
.navbar {
  display:flex; align-items:center; gap:clamp(1rem,3vw,2.5rem);
  padding:1rem clamp(1rem,2vw,1.5rem); background:#1f2933; color:#fff;
  width:100%;
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

/* Menús por encima del contenido */
.dropdown-menu {
  position:absolute; top:calc(100% + .6rem); left:0; display:flex; flex-direction:column; min-width:12rem;
  background:#0f172a; border-radius:.5rem; box-shadow:0 10px 25px rgba(15,23,42,.25);
  padding:.5rem 0; opacity:0; pointer-events:none; transform:translateY(-.5rem);
  transition:opacity .15s ease, transform .15s ease; z-index: 2100;
}
.nav-dropdown:hover>.dropdown-menu, .nav-dropdown:focus-within>.dropdown-menu { opacity:1; pointer-events:auto; transform:translateY(0); }
.dropdown-link { color:#f8fafc; text-decoration:none; padding:.55rem 1rem; display:flex; align-items:center; justify-content:space-between; gap:.5rem; font-weight:500; }
.dropdown-link:hover, .dropdown-link:focus-visible { background:rgba(148,163,184,.25); }
.dropdown-link.router-link-active { background:rgba(56,189,248,.25); }
.dropdown-link--parent { width:100%; background:none; border:none; font:inherit; cursor:pointer; }
.dropdown-submenu { position:relative; }
.dropdown-menu--nested { top:0; left:calc(100% + .5rem); transform:translateX(-.5rem); }
.dropdown-submenu:hover>.dropdown-menu--nested, .dropdown-submenu:focus-within>.dropdown-menu--nested { opacity:1; pointer-events:auto; transform:translateX(0); }

/* ===== Timebar (debajo de la navbar, dentro del fijo) ===== */
.timebar {
  background:#0f172a; color:#e5e7eb; display:flex; align-items:center; justify-content:center;
  gap:.75rem; padding:.4rem 1rem; font-size:1.5rem; box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
  flex-wrap:wrap;
}
.time-item { display:inline-flex; align-items:baseline; gap:.5rem; font-variant-numeric: tabular-nums; }
.time-label { font-weight:600; color:#93c5fd; }
.time-sep { opacity:.6; }

/* ===== Main ===== */
/* Empuja el contenido hacia abajo exactamente la altura del masthead fijo */
.content {
  flex:1; display:flex; flex-direction:column; min-height:0;
  padding:1.5rem; background:#ffffff; overflow-x:hidden;
  padding-top: var(--masthead-h, 120px); /* clave para que no se tape */
}

@media (max-width: 720px) {
  .navbar { flex-direction:column; align-items:stretch; }
  .nav-links { justify-content:center; }
  .brand { margin-left:0; text-align:center; }
}
</style>
