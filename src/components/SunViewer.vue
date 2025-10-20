<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'

const channels = [
  { label: 'SUVI 094 Å', value: '094', json: 'suvi-primary-094.json' },
  { label: 'SUVI 131 Å', value: '131', json: 'suvi-primary-131.json' },
  { label: 'SUVI 171 Å', value: '171', json: 'suvi-primary-171.json' },
  { label: 'SUVI 195 Å', value: '195', json: 'suvi-primary-195.json' },
  { label: 'SUVI 284 Å', value: '284', json: 'suvi-primary-284.json' },
  { label: 'SUVI 304 Å', value: '304', json: 'suvi-primary-304.json' },
  { label: 'Thematic', value: 'map', json: 'suvi-primary-map.json' },
]

// modos: static -> latest.png; anim -> frames desde JSON
const modeOptions = [
  { label: 'Estática', value: 'static' },
  { label: 'Animación', value: 'anim' },
]

const selected = ref('304')
const mode = ref('static')
const isLoading = ref(true)
const hadError = ref(false)
const message = ref('')

const lastTick = ref(Date.now()) // cache-buster para estática

// ---- URLs base
const pngUrl = computed(() =>
  `https://services.swpc.noaa.gov/images/animations/suvi/primary/${selected.value}/latest.png?t=${lastTick.value}`
)
const jsonUrl = computed(() => {
  const ch = channels.find(c => c.value === selected.value)
  return ch
    ? `https://services.swpc.noaa.gov/products/animations/${ch.json}`
    : ''
})

// ---- Animación (frames del JSON)
const frames = ref([])          // lista de URLs de imágenes
const frameIndex = ref(0)
const isPlaying = ref(false)
const fps = ref(8)              // velocidad por defecto
let timer = null

function clearTimer () {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function startTimer () {
  clearTimer()
  const ms = Math.max(1, Math.round(1000 / Math.max(1, fps.value)))
  timer = setInterval(() => {
    if (!frames.value.length) return
    frameIndex.value = (frameIndex.value + 1) % frames.value.length
  }, ms)
}

watch(fps, () => {
  if (isPlaying.value) startTimer()
})

watch(isPlaying, (playing) => {
  if (playing) startTimer()
  else clearTimer()
})

// ---- Carga del JSON de animación
async function loadAnimation() {
  isLoading.value = true
  hadError.value = false
  message.value = ''
  frames.value = []
  frameIndex.value = 0

  try {
    const resp = await fetch(jsonUrl.value, { cache: 'no-cache' })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data = await resp.json()

    // El JSON de SWPC suele ser una lista con objetos o strings.
    // Mapeamos de forma tolerante: url || href || src || string.
    const list = Array.isArray(data) ? data : (data?.frames || data?.images || [])
    const urls = list
      .map(item => {
        if (typeof item === 'string') return item
        if (item?.url) return item.url
        if (item?.href) return item.href
        if (item?.src) return item.src
        if (item?.image) return item.image
        return null
      })
      .filter(Boolean)
      // Aseguramos URLs absolutas si vinieran relativas:
      .map(u => (u.startsWith('http') ? u : `https://services.swpc.noaa.gov${u}`))

    if (!urls.length) {
      throw new Error('El JSON no contenía frames reconocibles.')
    }

    frames.value = urls
    isLoading.value = false
    message.value = `Animación lista: ${frames.value.length} fotogramas.`
  } catch (err) {
    console.error('Anim error:', err)
    isLoading.value = false
    hadError.value = true
    message.value = 'No se pudo cargar la animación. Prueba más tarde o usa “Estática”.'
  }
}

// ---- Estática
function refreshStatic() {
  isLoading.value = true
  hadError.value = false
  message.value = ''
  lastTick.value = Date.now()
}

// ---- Reacciones a cambios
watch([mode, selected], async () => {
  clearTimer()
  isPlaying.value = false
  if (mode.value === 'anim') {
    await loadAnimation()
  } else {
    refreshStatic()
  }
})

onMounted(() => {
  // Carga inicial
  refreshStatic()
})

onBeforeUnmount(() => {
  clearTimer()
})

// ---- Controles UI
function onPlayPause() {
  if (!frames.value.length) return
  isPlaying.value = !isPlaying.value
}
function onSeek(evt) {
  const i = Number(evt.target.value)
  frameIndex.value = i
}
</script>

<template>
  <div class="sunviewer">
    <div class="sunviewer__toolbar">
      <div class="sunviewer__controls">
        <label class="sunviewer__label">
          Filtro:
          <select v-model="selected">
            <option v-for="c in channels" :key="c.value" :value="c.value">{{ c.label }}</option>
          </select>
        </label>

        <label class="sunviewer__label">
          Modo:
          <select v-model="mode">
            <option v-for="m in modeOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
          </select>
        </label>

        <label v-if="mode==='anim'" class="sunviewer__label">
          FPS:
          <input type="number" min="1" max="24" step="1" v-model.number="fps" style="width:4.5rem" />
        </label>
      </div>

      <div class="sunviewer__actions">
        <button class="sunviewer__btn" v-if="mode==='static'" @click="refreshStatic">Actualizar</button>
        <button class="sunviewer__btn" v-else @click="loadAnimation">Recargar frames</button>
      </div>
    </div>

    <div class="sunviewer__frame">
      <!-- Estática -->
      <img
        v-if="mode==='static'"
        :src="pngUrl"
        alt="Vista del Sol (SUVI)"
        class="sunviewer__img"
        @load="() => { isLoading=false; hadError=false; message='Imagen actual cargada.' }"
        @error="() => { isLoading=false; hadError=true; message='No se pudo cargar la imagen.' }"
      />

      <!-- Animación: mostrar el frame actual -->
      <img
        v-else
        :src="frames.length ? frames[frameIndex] : ''"
        alt="Animación del Sol (SUVI)"
        class="sunviewer__img"
        @load="() => { isLoading=false; hadError=false }"
        @error="() => { isLoading=false; hadError=true }"
      />

      <div v-if="isLoading" class="sunviewer__status">Cargando…</div>
      <div v-else-if="hadError" class="sunviewer__status sunviewer__status--error">{{ message }}</div>
    </div>

    <!-- Controles de reproducción -->
    <div v-if="mode==='anim'" class="sunviewer__player">
      <button class="sunviewer__btn" :disabled="!frames.length" @click="onPlayPause">
        {{ isPlaying ? 'Pausa' : 'Reproducir' }}
      </button>

      <input
        class="sunviewer__range"
        type="range"
        min="0"
        :max="Math.max(0, frames.length-1)"
        step="1"
        :value="frameIndex"
        @input="onSeek"
        :disabled="!frames.length"
      />

      <span class="sunviewer__counter" v-if="frames.length">
        {{ frameIndex + 1 }} / {{ frames.length }}
      </span>
    </div>

    <div class="sunviewer__footer">
      <span class="sunviewer__hint">{{ message }}</span>
      <span class="sunviewer__src">Fuente: NOAA/NWS SWPC – GOES-SUVI</span>
    </div>
  </div>
</template>

<style scoped>
.sunviewer { display:flex; flex-direction:column; gap:0.75rem; }

/* Top bar */
.sunviewer__toolbar {
  display:flex; align-items:center; justify-content:space-between; gap:0.75rem; flex-wrap:wrap;
}
.sunviewer__controls { display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap; }
.sunviewer__actions { display:flex; gap:0.5rem; }

.sunviewer__label { font-size:0.95rem; color:#1f2933; display:inline-flex; align-items:center; gap:0.5rem; }
.sunviewer__label select, .sunviewer__label input[type="number"] {
  border:1px solid #d1d5db; border-radius:0.5rem; padding:0.35rem 0.5rem; background:#fff;
}
.sunviewer__btn {
  border:1px solid #d1d5db; border-radius:0.5rem; padding:0.35rem 0.6rem; background:#f9fafb; cursor:pointer;
}
.sunviewer__btn:hover { background:#f3f4f6; }

/* Frame contenedor (evita desbordes) */
.sunviewer__frame {
  position:relative; width:100%; aspect-ratio:1; border-radius:0.75rem;
  background:#0b1020; overflow:hidden; display:grid; place-items:center;
  flex:1; max-height:240px;
}
.sunviewer__img { width:100%; height:100%; object-fit:contain; display:block; }
.sunviewer__status {
  position:absolute; inset:0; display:grid; place-items:center;
  font-size:0.95rem; color:#e5e7eb; background:rgba(0,0,0,0.2); backdrop-filter:blur(2px);
}
.sunviewer__status--error { color:#fecaca; }

/* Player */
.sunviewer__player { display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap; }
.sunviewer__range { flex:1; min-width:160px; }
.sunviewer__counter { font-size:0.85rem; color:#374151; }

/* Footer */
.sunviewer__footer {
  display:flex; justify-content:space-between; gap:0.5rem; flex-wrap:wrap; font-size:0.8rem; color:#6b7280;
}
</style>
