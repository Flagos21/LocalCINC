import test from 'node:test'
import assert from 'node:assert/strict'

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  INFLUX_URL: process.env.INFLUX_URL,
  INFLUX_TOKEN: process.env.INFLUX_TOKEN,
  INFLUX_ORG: process.env.INFLUX_ORG,
  INFLUX_BUCKET: process.env.INFLUX_BUCKET,
  KP_ENABLED: process.env.KP_ENABLED
}

test.after(() => {
  process.env.NODE_ENV = originalEnv.NODE_ENV
  process.env.INFLUX_URL = originalEnv.INFLUX_URL
  process.env.INFLUX_TOKEN = originalEnv.INFLUX_TOKEN
  process.env.INFLUX_ORG = originalEnv.INFLUX_ORG
  process.env.INFLUX_BUCKET = originalEnv.INFLUX_BUCKET
  process.env.KP_ENABLED = originalEnv.KP_ENABLED
})

test('GET /api/kp entrega serie desde caché', async () => {
  process.env.NODE_ENV = 'test'
  process.env.INFLUX_URL = 'http://localhost'
  process.env.INFLUX_TOKEN = 'dummy'
  process.env.INFLUX_ORG = 'dummy'
  process.env.INFLUX_BUCKET = 'dummy'
  process.env.KP_ENABLED = 'true'

  const sample = {
    data: [
      { time: '2025-11-06T00:00:00Z', value: 3.3, status: 'now' },
      { time: '2025-11-06T03:00:00Z', value: 5.1, status: 'def' }
    ]
  }

  const originalFetch = global.fetch
  global.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url ?? ''
    if (url.includes('kp.gfz.de')) {
      return { ok: true, json: async () => sample }
    }
    return originalFetch(input, init)
  }

  const { default: app, kpReady } = await import('../server.js')
  await kpReady

  const server = app.listen(0)
  const { port } = server.address()

  const response = await fetch(`http://127.0.0.1:${port}/api/kp`)
  assert.equal(response.status, 200)
  const body = await response.json()

  assert.ok(body.updatedAt)
  assert.equal(Array.isArray(body.series), true)
  assert.equal(body.series.length, 2)
  assert.equal(body.series[0].value, 3.3)

  server.close()
  global.fetch = originalFetch

  const { stopKpService } = await import('../services/kpService.js')
  stopKpService()
})

test('GET /api/kp usa fallback local cuando GFZ falla', async () => {
  process.env.NODE_ENV = 'test'
  process.env.INFLUX_URL = 'http://localhost'
  process.env.INFLUX_TOKEN = 'dummy'
  process.env.INFLUX_ORG = 'dummy'
  process.env.INFLUX_BUCKET = 'dummy'
  process.env.KP_ENABLED = 'true'

  const originalFetch = global.fetch
  global.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url ?? ''
    if (url.includes('kp.gfz.de')) {
      throw new Error('GFZ caído')
    }
    return originalFetch(input, init)
  }

  const { default: app, kpReady } = await import(`../server.js?fallback=${Date.now()}`)
  await kpReady

  const server = app.listen(0)
  const { port } = server.address()

  const response = await fetch(`http://127.0.0.1:${port}/api/kp`)
  assert.equal(response.status, 200)
  const body = await response.json()

  assert.ok(body.series.length > 0)
  assert.equal(body.series[0].time, '2024-05-01T00:00:00.000Z')

  server.close()
  global.fetch = originalFetch

  const { stopKpService } = await import('../services/kpService.js')
  stopKpService()
})

test('GET /api/kp devuelve 503 cuando está deshabilitado', async () => {
  process.env.NODE_ENV = 'test'
  process.env.INFLUX_URL = 'http://localhost'
  process.env.INFLUX_TOKEN = 'dummy'
  process.env.INFLUX_ORG = 'dummy'
  process.env.INFLUX_BUCKET = 'dummy'
  process.env.KP_ENABLED = 'false'

  const originalFetch = global.fetch
  global.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url ?? ''
    if (url.includes('kp.gfz.de')) {
      throw new Error('GFZ caído')
    }
    return originalFetch(input, init)
  }

  const { default: app, kpReady } = await import(`../server.js?disabled=${Date.now()}`)
  await kpReady
  const server = app.listen(0)
  const { port } = server.address()

  const response = await fetch(`http://127.0.0.1:${port}/api/kp`)
  assert.equal(response.status, 503)

  server.close()
  global.fetch = originalFetch
  const { stopKpService } = await import('../services/kpService.js')
  stopKpService()
})
