import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const DEFAULT_ENDPOINT = import.meta.env.VITE_DST_API || 'http://localhost:3001/api/dst/realtime'

function toTimestamp(value) {
  if (value == null) {
    return null
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    // Consider value already milliseconds or seconds (>=1e12 means ms)
    if (value > 1e12) {
      return value
    }

    if (value > 1e9) {
      // seconds precision
      return value * 1000
    }

    // assume already ms for small but positive values
    return value
  }

  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toNumber(value) {
  if (value == null) {
    return null
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function extractSeries(payload) {
  if (!payload) {
    return []
  }

  if (Array.isArray(payload.series)) {
    return payload.series
  }

  if (Array.isArray(payload.data)) {
    return payload.data
  }

  if (Array.isArray(payload.points)) {
    return payload.points
  }

  if (Array.isArray(payload)) {
    return payload
  }

  return []
}

function toEntry(raw) {
  if (!raw) {
    return null
  }

  if (Array.isArray(raw)) {
    const ts = toTimestamp(raw[0])
    const value = toNumber(raw[1])
    return ts != null && value != null ? { timestamp: ts, value } : null
  }

  if (typeof raw === 'object') {
    const tsCandidate =
      raw.timestamp ??
      raw.time ??
      raw.time_tag ??
      raw.timeTag ??
      raw.datetime ??
      raw.date ??
      raw.ts ??
      raw.t ??
      raw.obs_time ??
      raw.obstime ??
      raw.time_utc ??
      raw.created_at

    const valueCandidate =
      raw.value ??
      raw.dst ??
      raw.dst_index ??
      raw.dstIndex ??
      raw.nT ??
      raw.nt ??
      raw.reading ??
      raw.measure ??
      raw.v ??
      raw.y

    const ts = toTimestamp(tsCandidate)
    const value = toNumber(valueCandidate)

    return ts != null && value != null ? { timestamp: ts, value } : null
  }

  return null
}

function normalizeEntries(payload) {
  const rawSeries = extractSeries(payload)
  const entries = []

  for (const raw of rawSeries) {
    const entry = toEntry(raw)
    if (entry) {
      entries.push(entry)
    }
  }

  entries.sort((a, b) => a.timestamp - b.timestamp)

  const now = Date.now()
  const monthStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime()

  return entries.filter((entry) => entry.timestamp >= monthStart)
}

export function useDstRealtime({ pollMs = 60000, endpoint = DEFAULT_ENDPOINT } = {}) {
  const points = ref([])
  const isLoading = ref(false)
  const errorMessage = ref('')

  const hasData = computed(() => points.value.length > 0)
  const lastPoint = computed(() => (points.value.length ? points.value[points.value.length - 1] : null))

  let timerId = null
  let abortController = null

  const fetchOnce = async () => {
    if (abortController) {
      abortController.abort()
    }

    const controller = new AbortController()
    abortController = controller

    isLoading.value = true
    errorMessage.value = ''

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      })

      const rawBody = await response.text()
      if (!response.ok) {
        const fallbackMessage = 'No se pudo obtener el índice Dst.'
        if (!rawBody) {
          throw new Error(fallbackMessage)
        }

        try {
          const parsedError = JSON.parse(rawBody)
          const message = typeof parsedError?.error === 'string' ? parsedError.error : fallbackMessage
          throw new Error(message)
        } catch {
          throw new Error(fallbackMessage)
        }
      }

      if (!rawBody) {
        points.value = []
        return
      }

      let payload
      try {
        payload = JSON.parse(rawBody)
      } catch (error) {
        throw new Error('La respuesta del servicio Dst no es JSON válido.')
      }

      const normalized = normalizeEntries(payload)
      points.value = normalized
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }

      errorMessage.value = error instanceof Error ? error.message : 'No fue posible actualizar el índice Dst.'
    } finally {
      if (abortController === controller) {
        abortController = null
      }
      isLoading.value = false
    }
  }

  const schedule = () => {
    if (timerId) {
      clearInterval(timerId)
      timerId = null
    }

    if (pollMs > 0) {
      timerId = window.setInterval(() => {
        fetchOnce()
      }, pollMs)
    }
  }

  onMounted(() => {
    fetchOnce()
    schedule()
  })

  onBeforeUnmount(() => {
    if (timerId) {
      clearInterval(timerId)
      timerId = null
    }
    if (abortController) {
      abortController.abort()
      abortController = null
    }
  })

  return {
    points,
    lastPoint,
    isLoading,
    errorMessage,
    hasData,
    refresh: fetchOnce
  }
}
