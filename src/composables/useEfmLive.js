// src/composables/useEfmLive.js
/*
  Composable Vue 3 para obtener datos en vivo del campo eléctrico E_z
  desde la API REST y refrescarlos periódicamente.

  Cambios clave:
  - Eliminamos el uso de 'http://localhost:3001' como baseUrl.
  - Construimos la URL siempre como ruta relativa: /api/efm/live
    → Vite la proxea al backend en 3001.
  - Mantenemos soporte para opts.since y opts.range
    ('today', '1h', '6h', '24h', 'since:10m', etc.).
*/

import { ref, onMounted, onBeforeUnmount, watch } from 'vue'

import { durationStringToMs } from '@/utils/timeSeriesGaps'

// convierte ms → "Xs|Xm|Xh|Xd" (lo que entiende tu API / Influx)
function msToInfluxSince(ms) {
  const s = Math.max(1, Math.round(ms / 1000))
  if (s % 86400 === 0) return `${s / 86400}d`
  if (s % 3600 === 0)  return `${s / 3600}h`
  if (s % 60 === 0)    return `${s / 60}m`
  return `${s}s`
}

// rng puede ser 'today' | '1h' | '6h' | '24h' | 'since:10m'
function computeSinceForRange(rng) {
  if (typeof rng === 'string' && rng.startsWith('since:')) {
    // "since:10m" → "10m"
    return rng.slice('since:'.length)
  }

  if (rng === 'today') {
    const now = new Date()
    const start = new Date(now)
    start.setHours(0, 0, 0, 0) // medianoche local
    return msToInfluxSince(now.getTime() - start.getTime())
  }

  // '1h', '6h', '24h' ya son duraciones válidas para tu backend
  return rng
}

export function useEfmLive(opts = {}) {
  // Estación, normalmente "*" o "CHI"
  const station = ref(opts.station ?? '*')

  // Base path relativo (para usar siempre el proxy de Vite)
  const basePath = opts.basePath ?? '/api/efm'

  // Si viene since, priorizamos "since:<dur>" como range; si no, usamos range directo o 'today'
  const initialRange =
    opts.since ? `since:${opts.since}` :
    (opts.range ?? 'today')

  const range     = ref(initialRange)          // 'today' | '1h' | '6h' | '24h' | 'since:10m'
  const every     = ref(opts.every ?? '5s')    // agregación backend
  const refreshMs = ref(opts.refreshMs ?? 5000) // 5s por defecto

  const points     = ref([])
  const error      = ref(null)
  const isFetching = ref(false)
  let timer

  async function fetchNow() {
    // Por si algún navegador muy viejo no soporta fetch
    if (typeof fetch !== 'function') {
      error.value = 'Este navegador no soporta fetch.'
      points.value = []
      return
    }

    try {
      isFetching.value = true

      // Usamos siempre same-origin + ruta relativa: http://IP:5173 + /api/efm/live
      const url = new URL(`${basePath}/live`, window.location.origin)

      url.searchParams.set('station', station.value || '*')
      const sinceParam = computeSinceForRange(range.value)
      const everyParam = every.value

      const bucketMs = durationStringToMs(everyParam)
      const sinceMs = durationStringToMs(sinceParam)
      const estimatedPoints = Number.isFinite(bucketMs) && Number.isFinite(sinceMs) && bucketMs > 0
        ? Math.ceil(sinceMs / bucketMs) + 2
        : null

      url.searchParams.set('since', sinceParam)
      url.searchParams.set('every', everyParam)

      if (Number.isFinite(estimatedPoints) && estimatedPoints > 0) {
        url.searchParams.set('maxPoints', String(estimatedPoints))
      }

      const res = await fetch(url.toString(), { cache: 'no-store' })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const data = await res.json()
      if (!Array.isArray(data)) {
        throw new Error('Respuesta no es array')
      }

      points.value = data
      error.value = null
    } catch (e) {
      error.value = e?.message ?? String(e)
      points.value = []
    } finally {
      isFetching.value = false
    }
  }

  function start() {
    stop()
    fetchNow()
    timer = window.setInterval(fetchNow, refreshMs.value)
  }

  function stop() {
    if (timer) {
      clearInterval(timer)
      timer = undefined
    }
  }

  onMounted(start)
  onBeforeUnmount(stop)

  // Si el usuario cambia rango / every / refreshMs / station, reiniciamos el polling
  watch([range, every, refreshMs, station], start)

  return {
    points,
    error,
    isFetching,
    range,
    every,      // 👈 ojo: sigue llamándose "every" para ser compatible con tu destructuring
    refreshMs,
    station,
    refresh: fetchNow
  }
}
