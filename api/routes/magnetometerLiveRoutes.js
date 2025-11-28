// api/routes/magnetometerLiveRoutes.js
import express from 'express';
import { isConnectionRefusedError } from '../utils/errors.js';

function createMagnetometerLiveRouter({
  queryApi,
  bucket,
  measurement = 'magnetometer',
  tagKey = 'station',
  valueField = 'h',         // <-- por defecto 'h' minúscula
  defaultStation = '*',     // <-- '*' para no filtrar
  defaultSince = '1d',
  defaultEvery = '1m',
  maxPoints = '5000'
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

  async function queryMagnetometerLive({ station, since, every, limit }) {
    const _since = sanitizeDuration(since, defaultSince);
    const _every = sanitizeDuration(every, defaultEvery);
    const requestedMax = Number.parseInt(limit ?? maxPoints, 10);
    const _max = Number.isFinite(requestedMax)
      ? requestedMax
      : Number.parseInt(maxPoints, 10) || 5000;

    // Igual que en EFM: si station === '*' no filtramos por tag
    const hasStation = station && station !== '*';
    const stationFilter = hasStation
      ? `|> filter(fn: (r) => r.${tagKey} == "${station}")`
      : '';

    const flux = `
from(bucket: "${bucket}")
  |> range(start: -${_since})
  |> filter(fn: (r) => r._measurement == "${measurement}")
  ${stationFilter}
  |> filter(fn: (r) => r._field == "${valueField}")
  |> aggregateWindow(every: ${_every}, fn: mean, createEmpty: false)
  |> yield(name: "mean")
`;

    const rows = [];
    await queryApi.collectRows(flux, (row, meta) => {
      const o = meta.toObject(row);
      const t = new Date(o._time).getTime();
      const v = Number(o._value);
      if (Number.isFinite(t) && Number.isFinite(v)) {
        rows.push({ t, value: v });
      }
    });

    let sorted = rows.sort((a, b) => a.t - b.t);
    if (sorted.length > _max) {
      sorted = sorted.slice(-_max);
    }

    return sorted;
  }

  router.get('/live', async (req, res) => {
    try {
      const station = (req.query.station || defaultStation).toString();
      const since = (req.query.since || defaultSince).toString();
      const every = (req.query.every || defaultEvery).toString();
      const limit = req.query.maxPoints ?? maxPoints;

      const key = `magneto:live:${station}:${since}:${every}:${limit}`;
      const cached = cacheGet(key);
      if (cached) {
        res.json(cached);
        return;
      }

      const data = await queryMagnetometerLive({ station, since, every, limit });
      cacheSet(key, data, 2500);
      res.json(data);
    } catch (err) {
      if (isConnectionRefusedError(err)) {
        console.error('API /api/magnetometer-live/live error: InfluxDB no está disponible (conexión rechazada).');
        res
          .status(503)
          .json({ error: 'InfluxDB no está disponible. Intenta más tarde.' });
        return;
      }
      console.error('API /api/magnetometer-live/live error:', err);
      res.status(500).json({ error: 'No se pudo obtener Magnetómetro live.' });
    }
  });

  router.get('/last', async (req, res) => {
    try {
      const station = (req.query.station || defaultStation).toString();
      const data = await queryMagnetometerLive({
        station,
        since: '6h',
        every: '1m',
        limit: 5000
      });
      res.json(data.at(-1) ?? null);
    } catch (err) {
      if (isConnectionRefusedError(err)) {
        console.error('API /api/magnetometer-live/last error: InfluxDB no está disponible (conexión rechazada).');
        res
          .status(503)
          .json({ error: 'InfluxDB no está disponible. Intenta más tarde.' });
        return;
      }
      console.error('API /api/magnetometer-live/last error:', err);
      res.status(500).json({ error: 'No se pudo obtener el último punto de magnetómetro.' });
    }
  });

  return router;
}

export default createMagnetometerLiveRouter;
