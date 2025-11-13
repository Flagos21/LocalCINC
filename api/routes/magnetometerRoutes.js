import express from 'express';
import { autoEvery } from '../utils/flux.js';
import { isConnectionRefusedError } from '../utils/errors.js';

function createMagnetometerRouter({
  queryApi,
  bucket,
  measurement,
  field,
  defaultStation,
  defaultUnit = 'nT'
}) {
  const router = express.Router();

  router.get('/series', async (req, res) => {
    try {
      const station = (req.query.station || defaultStation).toString();
      const unit = (req.query.unit || defaultUnit).toString();
      const everyQ = req.query.every?.toString();

      let startISO;
      let stopISO;
      if (req.query.from && req.query.to) {
        const fromDt = new Date(req.query.from);
        const toDt = new Date(req.query.to);
        if (Number.isNaN(fromDt.getTime()) || Number.isNaN(toDt.getTime())) {
          res.status(400).json({ error: 'Parámetros from/to inválidos' });
          return;
        }
        startISO = fromDt.toISOString();
        stopISO = toDt.toISOString();
      } else {
        const range = (req.query.range || '2y').toString();
        const m = range.match(/^(\d+)([smhdwy])$/i);
        if (!m) {
          res.status(400).json({ error: 'Parámetro range inválido' });
          return;
        }
        const n = Number(m[1]);
        const u = m[2].toLowerCase();
        const mult = { s: 1, m: 60, h: 3600, d: 86400, w: 604800, y: 31557600 }[u];
        const stop = new Date();
        const start = new Date(stop.getTime() - n * mult * 1000);
        startISO = start.toISOString();
        stopISO = stop.toISOString();
      }

      const every = autoEvery(startISO, stopISO, everyQ);

      const flux = `
from(bucket: "${bucket}")
  |> range(start: time(v: ${JSON.stringify(startISO)}), stop: time(v: ${JSON.stringify(stopISO)}))
  |> filter(fn: (r) => r._measurement == "${measurement}")
  |> filter(fn: (r) => r._field == "${field}")
  |> filter(fn: (r) => r.station == "${station}")
  |> filter(fn: (r) => r.unit == "${unit}")
  |> aggregateWindow(every: ${every}, fn: mean, createEmpty: false)
  |> yield(name: "mean")
`;

      const rows = [];
      await queryApi.collectRows(flux, (row, meta) => {
        const o = meta.toObject(row);
        rows.push({ t: o._time, v: Number(o._value) });
      });

      rows.sort((a, b) => new Date(a.t) - new Date(b.t));

      const dedup = [];
      for (let i = 0; i < rows.length; i += 1) {
        if (i > 0 && rows[i].t === rows[i - 1].t) {
          dedup[dedup.length - 1] = rows[i];
        } else {
          dedup.push(rows[i]);
        }
      }

      res.json({
        labels: dedup.map((r) => r.t),
        series: [{ name: field, data: dedup.map((r) => r.v) }],
        meta: { every, station, unit, field, measurement, startISO, stopISO }
      });
    } catch (err) {
      if (isConnectionRefusedError(err)) {
        console.error('API /api/series error: InfluxDB no está disponible (conexión rechazada).');
        res.status(503).json({ error: 'InfluxDB no está disponible. Intenta más tarde.' });
        return;
      }
      console.error('API /api/series error:', err);
      res.status(500).json({ error: 'No se pudieron obtener datos del servicio.' });
    }
  });

  router.get('/series-dh', async (req, res) => {
    try {
      const station = (req.query.station || defaultStation).toString();
      const unit = (req.query.unit || defaultUnit).toString();

      let startISO;
      let stopISO;
      if (req.query.from && req.query.to) {
        startISO = new Date(req.query.from).toISOString();
        stopISO = new Date(req.query.to).toISOString();
      } else {
        const stop = new Date();
        const start = new Date(stop);
        start.setFullYear(stop.getFullYear() - 2);
        startISO = start.toISOString();
        stopISO = stop.toISOString();
      }

      const flux = `
from(bucket: "${bucket}")
  |> range(start: time(v: ${JSON.stringify(startISO)}), stop: time(v: ${JSON.stringify(stopISO)}))
  |> filter(fn: (r) => r._measurement == "${measurement}")
  |> filter(fn: (r) => r._field == "${field}")
  |> filter(fn: (r) => r.station == "${station}")
  |> filter(fn: (r) => r.unit == "${unit}")
  |> aggregateWindow(every: 1h, fn: mean, createEmpty: false)
  |> yield(name: "mean")
`;

      const rows = [];
      await queryApi.collectRows(flux, (row, meta) => {
        const o = meta.toObject(row);
        rows.push({ t: o._time, v: Number(o._value) });
      });
      rows.sort((a, b) => new Date(a.t) - new Date(b.t));

      if (rows.length === 0) {
        res.json({ labels: [], series: [{ name: 'ΔH', data: [] }] });
        return;
      }

      const firstDay = rows[0].t.substring(0, 10);
      const firstDayVals = rows.filter((r) => r.t.startsWith(firstDay)).map((r) => r.v);
      const baseline = firstDayVals.reduce((a, b) => a + b, 0) / firstDayVals.length;

      const deltaH = rows.map((r) => ({ t: r.t, v: r.v - baseline }));

      res.json({
        labels: deltaH.map((d) => d.t),
        series: [{ name: 'ΔH', data: deltaH.map((d) => d.v) }],
        meta: { station, unit, baseline, field, measurement }
      });
    } catch (err) {
      if (isConnectionRefusedError(err)) {
        console.error('API /api/series-dh error: InfluxDB no está disponible (conexión rechazada).');
        res.status(503).json({ error: 'InfluxDB no está disponible. Intenta más tarde.' });
        return;
      }
      console.error('API /api/series-dh error:', err);
      res.status(500).json({ error: 'No se pudieron calcular ΔH.' });
    }
  });

  return router;
}

export default createMagnetometerRouter;
