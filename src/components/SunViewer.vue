<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

/**
 * Filtros SUVI (GOES) disponibles en SWPC.
 * Cada opción mapea a la ruta de `latest.png`.
 */
const suviOptions = [
  { label: 'SUVI 094 Å', value: '094' },
  { label: 'SUVI 131 Å', value: '131' },
  { label: 'SUVI 171 Å', value: '171' },
  { label: 'SUVI 195 Å', value: '195' },
  { label: 'SUVI 284 Å', value: '284' },
  { label: 'SUVI 304 Å', value: '304' },
]

// estado
const selected = ref('304') // por defecto 304 Å (detalla cromosfera/filamentos)
const lastTick = ref(Date.now())
const isLoading = ref(true)
const hadError = ref(false)

// URL computada con "cache buster" para forzar refresco
const imageUrl = computed(() =>
  `https://services.swpc.noaa.gov/images/animations/suvi/primary/${selected.value}/latest.png?t=${lastTick.value}`
)

let timer = null
onMounted(() => {
  // refresco cada 2 minutos (ajustable)
  timer = setInterval(() => {
    lastTick.value = Date.now()
  }, 120000)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

function handleLoad() {
  isLoading.value = false
  hadError.value = false
}

function handleError() {
  isLoading.value = false
  hadError.value = true
}

/** Forzar refresco manual */
function refreshNow() {
  isLoading.value = true
  lastTick.value = Date.now()
}
</script>

<template>
  <div class="sunviewer">
    <div class="sunviewer__toolbar">
      <label class="sunviewer__label">
        Filtro:
        <select v-model="selected" @change="refreshNow">
          <option v-for="opt in suviOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </label>

      <button class="sunviewer__btn" @click="refreshNow">Actualizar</button>
    </div>

    <div class="sunviewer__frame">
      <img
        :src="imageUrl"
        alt="Vista actual del Sol (GOES-SUVI)"
        @load="handleLoad"
        @error="handleError"
        class="sunviewer__img"
      />

      <div v-if="isLoading" class="sunviewer__status">Cargando…</div>
      <div v-else-if="hadError" class="sunviewer__status sunviewer__status--error">
        No se pudo cargar la imagen. Intenta con otro filtro o presiona “Actualizar”.
      </div>
    </div>

    <p class="sunviewer__hint">
      Fuente: NOAA/NWS SWPC – Imágenes GOES-SUVI (<a href="https://www.swpc.noaa.gov/products/goes-solar-ultraviolet-imager-suvi" target="_blank" rel="noopener">ver ficha</a>).
    </p>
  </div>
</template>

<style scoped>
.sunviewer {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* Barra superior */
.sunviewer__toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  justify-content: space-between;
}

.sunviewer__label {
  font-size: 0.95rem;
  color: #1f2933;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.sunviewer__label select {
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  padding: 0.35rem 0.5rem;
  background: #fff;
}

.sunviewer__btn {
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  padding: 0.35rem 0.6rem;
  background: #f9fafb;
  cursor: pointer;
}
.sunviewer__btn:hover { background: #f3f4f6; }

/* Marco del contenido: asegura que nada “se escape” del card */
.sunviewer__frame {
  position: relative;
  width: 100%;
  /* Mantén una relación de aspecto cuadrada y crece si el card es alto */
  aspect-ratio: 1 / 1;
  border-radius: 0.75rem;
  background: #0b1020; /* fondo oscuro para contraste */
  overflow: hidden;    /* evita desbordes */
  display: grid;
  place-items: center;
}

/* La imagen nunca se sale: se contiene y centra */
.sunviewer__img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
}

/* Estado (loading/error) overlay */
.sunviewer__status {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 0.95rem;
  color: #e5e7eb;
  background: rgba(0,0,0,0.2);
  backdrop-filter: blur(2px);
}
.sunviewer__status--error {
  color: #fecaca;
}

.sunviewer__hint {
  font-size: 0.8rem;
  color: #6b7280;
}
</style>
