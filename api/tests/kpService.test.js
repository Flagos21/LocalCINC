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

test.after(() => {
  process.env.KP_LOOKBACK_DAYS = originalEnv.KP_LOOKBACK_DAYS
  process.env.KP_STATUS = originalEnv.KP_STATUS
  process.env.KP_ENABLED = originalEnv.KP_ENABLED
  process.env.KP_CRON = originalEnv.KP_CRON
})

test('buildUrl respeta lookback y status', async () => {
  const { buildUrl } = await import('../services/kpService.js')
  const now = new Date('2025-01-04T00:00:00Z')
  const url = new URL(buildUrl({ now }))
  assert.equal(url.searchParams.get('index'), 'Kp')
  assert.equal(url.searchParams.get('status'), 'def')
  assert.equal(url.searchParams.get('end'), '2025-01-04T00:00:00.000Z')
  assert.equal(url.searchParams.get('start'), '2025-01-01T00:00:00.000Z')
})

test('fetchKp normaliza y ordena la serie', async () => {
  const sample = {
    data: [
      { time: '2025-11-06T03:00:00Z', value: '5.3', status: 'def' },
      { time: '2025-11-06T00:00:00Z', kp: 3.2, status: 'now' },
      { time: '2025-11-06T03:00:00Z', value: 6.1, status: 'nowcast' }
    ]
  }

  const originalFetch = global.fetch
  let called = 0
  global.fetch = async () => {
    called += 1
    return {
      ok: true,
      json: async () => sample
    }
  }

  const { fetchKp } = await import('../services/kpService.js')
  const series = await fetchKp()

  assert.equal(called, 1)
  assert.equal(series.length, 2)
  assert.equal(series[0].time, '2025-11-06T00:00:00.000Z')
  assert.equal(series[1].status, 'now')

  global.fetch = originalFetch
})

test('refreshKp conserva caché cuando hay errores', async () => {
  const originalFetch = global.fetch
  const payloadOk = {
    data: [
      { time: '2025-11-06T00:00:00Z', value: 3.5 },
      { time: '2025-11-06T03:00:00Z', value: 4.2 }
    ]
  }

  let call = 0
  global.fetch = async () => {
    call += 1
    if (call === 1) {
      return { ok: true, json: async () => payloadOk }
    }
    throw new Error('GFZ caído')
  }

  const { refreshKp, getKpCache, stopKpService } = await import('../services/kpService.js')

  await refreshKp()
  const firstCache = getKpCache()
  assert.equal(firstCache.series.length, 2)

  await refreshKp()
  const secondCache = getKpCache()

  assert.equal(call, 2)
  assert.deepEqual(secondCache.series, firstCache.series)

  global.fetch = originalFetch
  stopKpService()
})

test('refreshKp usa fallback local cuando GFZ falla en warm-up', async () => {
  const originalFetch = global.fetch
  global.fetch = async () => {
    throw new Error('GFZ no disponible')
  }

  const { refreshKp, getKpCache, stopKpService } = await import(
    `../services/kpService.js?fallback=${Date.now()}`
  )

  await refreshKp()
  const cache = getKpCache()

  assert.ok(cache.updatedAt)
  assert.ok(Array.isArray(cache.series))
  assert.ok(cache.series.length > 0)
  assert.equal(cache.series[0].time, '2024-05-01T00:00:00.000Z')

  global.fetch = originalFetch
  stopKpService()
})
