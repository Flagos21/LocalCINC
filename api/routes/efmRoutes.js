import express from 'express';
import { isConnectionRefusedError } from '../utils/errors.js';

function createEfmRouter({
  queryApi,
  bucket,
  measurement = 'efm',
  tagKey = 'station',
  valueField = 'value',
  statusField = 'status',
  defaultStation = 'CHI',
  defaultSince = '30s',
  defaultEvery = '1s',
  maxPoints = '2000'
}) {
  const router = express.Router();
  const cache = new Map();

  function cacheGet(key) {
    const hit = cache.get(key);
    if (!hit) return null;
    if (Date.now() > hit.expires) {
      cache.delete(key);
      return null;
    }
    return hit.data;
  }

  function cacheSet(key, data, ttlMs = 2500) {
    cache.set(key, { expires: Date.now() + ttlMs, data });
  }

  function sanitizeDuration(d, fallback) {
    const s = (d || '').toString().trim();
    return /^\d+(ms|s|m|h|d|w|y)$/i.test(s) ? s : fallback;
  }

  async function queryEfmLive({ station, since, every, limit }) {
    const _since = sanitizeDuration(since, defaultSince);
    const _every = sanitizeDuration(every, defaultEvery);
    const requestedMax = Number.parseInt(limit ?? maxPoints, 10);
    const _max = Number.isFinite(requestedMax) ? requestedMax : Number.parseInt(maxPoints, 10) || 2000;

    const hasStation = station && station !== '*';
    const stationFilter = hasStation ? `|> filter(fn: (r) => r.${tagKey} == "${station}")` : '';

    const flux = `
from(bucket: "${bucket}")
  |> range(start: -${_since})
  |> filter(fn: (r) => r._measurement == "${measurement}")
  ${stationFilter}
  |> filter(fn: (r) => r._field == "${valueField}" or r._field == "${statusField}")
  |> aggregateWindow(every: ${_every}, fn: mean, createEmpty: false)
  |> yield(name: "mean")
`;

    const raw = [];
    await queryApi.collectRows(flux, (row, meta) => {
      const o = meta.toObject(row);
      raw.push({ t: new Date(o._time).getTime(), field: o._field, v: Number(o._value) });
    });

    const byTs = new Map();
    for (const r of raw) {
      const entry = byTs.get(r.t) || { t: r.t, value: null, status: null };
      if (r.field === valueField) entry.value = r.v;
      if (r.field === statusField) entry.status = r.v;
      byTs.set(r.t, entry);
    }

    let arr = Array.from(byTs.values()).sort((a, b) => a.t - b.t);
    if (arr.length > _max) {
      arr = arr.slice(-_max);
    }

    return arr;
  }

  router.get('/live', async (req, res) => {
    try {
      const station = (req.query.station || defaultStation).toString();
      const since = (req.query.since || defaultSince).toString();
      const every = (req.query.every || defaultEvery).toString();
      const limit = req.query.maxPoints ?? maxPoints;

      const key = `efm:live:${station}:${since}:${every}:${limit}`;
      const cached = cacheGet(key);
      if (cached) {
        res.json(cached);
        return;
      }

      const data = await queryEfmLive({ station, since, every, limit });
      cacheSet(key, data, 2500);
      res.json(data);
    } catch (err) {
      if (isConnectionRefusedError(err)) {
        console.error('API /api/efm/live error: InfluxDB no está disponible (conexión rechazada).');
        res.status(503).json({ error: 'InfluxDB no está disponible. Intenta más tarde.' });
        return;
      }
      console.error('API /api/efm/live error:', err);
      res.status(500).json({ error: 'No se pudo obtener EFM live.' });
    }
  });

  router.get('/last', async (req, res) => {
    try {
      const station = (req.query.station || defaultStation).toString();
      const data = await queryEfmLive({ station, since: '5s', every: '1s', limit: 200 });
      res.json(data.at(-1) ?? null);
    } catch (err) {
      if (isConnectionRefusedError(err)) {
        console.error('API /api/efm/last error: InfluxDB no está disponible (conexión rechazada).');
        res.status(503).json({ error: 'InfluxDB no está disponible. Intenta más tarde.' });
        return;
      }
      console.error('API /api/efm/last error:', err);
      res.status(500).json({ error: 'No se pudo obtener el último punto EFM.' });
    }
  });

  return router;
}

export default createEfmRouter;
