import test from 'node:test'
import assert from 'node:assert/strict'

const originalEnv = {
  KP_LOOKBACK_DAYS: process.env.KP_LOOKBACK_DAYS,
  KP_STATUS: process.env.KP_STATUS,
  KP_ENABLED: process.env.KP_ENABLED,
  KP_CRON: process.env.KP_CRON
}

test.before(() => {
  process.env.KP_ENABLED = 'true'
  process.env.KP_LOOKBACK_DAYS = '3'
  process.env.KP_STATUS = 'def'
  process.env.KP_CRON = '*/15 * * * *'
})

test.after(async () => {
  process.env.KP_LOOKBACK_DAYS = originalEnv.KP_LOOKBACK_DAYS
  process.env.KP_STATUS = originalEnv.KP_STATUS
  process.env.KP_ENABLED = originalEnv.KP_ENABLED
  process.env.KP_CRON = originalEnv.KP_CRON

  const { stopKpService, __internals } = await import('../services/kpService.js')
  __internals.resetLocalFallbackData()
  stopKpService()
})

test('refreshKp prioriza datos GFZ y ordena la serie', async () => {
  const gfzSample = {
    datetime: [
      '2025-11-06T03:00:00Z',
      '2025-11-06T00:00:00Z',
      '2025-11-06T03:00:00Z'
    ],
    Kp: ['5.3', 3.2, 6.1],
    status: ['def', 'now', 'nowcast']
  }

  const originalFetch = global.fetch
  let gfzCalls = 0
  global.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url ?? ''
    if (url.includes('kp.gfz.de')) {
      gfzCalls += 1
      return { ok: true, json: async () => gfzSample }
    }
    return { ok: true, json: async () => ({ data: [] }) }
  }

  const { refreshKp, getKpCache, stopKpService } = await import(
    `../services/kpService.js?gfz=${Date.now()}`
  )

  await refreshKp()
  const cache = getKpCache()

  assert.equal(gfzCalls, 1)
  assert.equal(cache.series.length, 2)
  assert.equal(cache.series[0].time, '2025-11-06T00:00:00.000Z')
  assert.equal(cache.series[1].status, 'now')

  global.fetch = originalFetch
  stopKpService()
})

test('refreshKp usa fallback local cuando GFZ y NOAA fallan', async () => {
  const originalFetch = global.fetch
  global.fetch = async () => {
    throw new Error('fuentes remotas indisponibles')
  }

  const { refreshKp, getKpCache, stopKpService } = await import(
    `../services/kpService.js?fallback=${Date.now()}`
  )

  await refreshKp()
  const cache = getKpCache()

  assert.ok(cache.updatedAt)
  assert.ok(Array.isArray(cache.series))
  assert.equal(cache.series[0].time, '2024-05-01T00:00:00.000Z')
  assert.equal(cache.series.at(-1).time, '2024-05-04T21:00:00.000Z')

  global.fetch = originalFetch
  stopKpService()
})

test('refreshKp conserva el caché si todas las fuentes fallan', async () => {
  const sample = {
    data: [
      { time: '2025-11-06T00:00:00Z', value: 3.5 },
      { time: '2025-11-06T03:00:00Z', value: 4.2 }
    ]
  }

  const originalFetch = global.fetch
  global.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url ?? ''
    if (url.includes('kp.gfz.de')) {
      return { ok: true, json: async () => sample }
    }
    throw new Error('fuente NOAA caída')
  }

  const modId = `../services/kpService.js?cache=${Date.now()}`
  const { refreshKp, getKpCache, stopKpService, __internals } = await import(modId)

  await refreshKp()
  const firstCache = getKpCache()
  assert.equal(firstCache.series.length, 2)

  // ahora todas las fuentes fallan, incluyendo el fallback local
  global.fetch = async () => {
    throw new Error('fuentes indisponibles')
  }
  __internals.setLocalFallbackData({ data: [] })

  await refreshKp()
  const secondCache = getKpCache()

  assert.deepEqual(secondCache.series, firstCache.series)

  __internals.resetLocalFallbackData()
  global.fetch = originalFetch
  stopKpService()
})
