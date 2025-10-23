/* eslint-env node */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { InfluxDB } from '@influxdata/influxdb-client';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import process from 'node:process';
import {
  listDataMinFiles,
  loadLocalSeries
} from './localMagnetometer.js';

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ionogramRoot = path.join(__dirname, 'ionograms');
const magnetometerLocalRoot = path.join(__dirname, 'magnetometro', 'DataMin');

const {
  INFLUX_URL,
  INFLUX_TOKEN,
  INFLUX_ORG,
  INFLUX_BUCKET,
  MEASUREMENT = 'magnetometer',
  FIELD = 'H',
  DEFAULT_STATION = 'CHI',
  PORT = 3001
} = process.env;

if (!INFLUX_URL || !INFLUX_TOKEN || !INFLUX_ORG || !INFLUX_BUCKET) {
  console.error('❌ Falta configuración de Influx (URL/TOKEN/ORG/BUCKET) en .env');
  process.exit(1);
}

const influx = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN });
const queryApi = influx.getQueryApi(INFLUX_ORG);

const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

const MONTH_ABBREVIATIONS = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11
};

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const LOCAL_BUCKETS_MS = [
  MINUTE_MS,
  2 * MINUTE_MS,
  5 * MINUTE_MS,
  10 * MINUTE_MS,
  15 * MINUTE_MS,
  30 * MINUTE_MS,
  HOUR_MS,
  2 * HOUR_MS,
  3 * HOUR_MS,
  6 * HOUR_MS,
  12 * HOUR_MS,
  DAY_MS,
  2 * DAY_MS,
  7 * DAY_MS,
  14 * DAY_MS,
  30 * DAY_MS
];

function isImageFile(name) {
  const ext = path.extname(name).toLowerCase();
  return imageExtensions.has(ext);
}

function buildImagePayload({ year, month, day, filename }) {
  const baseName = path.parse(filename).name;
  const [datePart, timePart] = baseName.split('_');
  const safeTime = timePart && timePart.length === 6
    ? `${timePart.slice(0,2)}:${timePart.slice(2,4)}:${timePart.slice(4,6)}`
    : null;
  const isoTimestamp = datePart && timePart && timePart.length === 6
    ? new Date(`${year}-${month}-${day}T${timePart.slice(0,2)}:${timePart.slice(2,4)}:${timePart.slice(4,6)}Z`).toISOString()
    : null;

  return {
    filename,
    url: `/api/ionograms/${year}/${month}/${day}/${filename}`,
    date: `${year}-${month}-${day}`,
    time: safeTime,
    timestamp: isoTimestamp,
  };
}

function parseDateQuery(value, { isEnd = false } = {}) {
  if (!value) {
    return null;
  }

  let normalized = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    normalized = `${normalized}T${isEnd ? '23:59:59Z' : '00:00:00Z'}`;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function toUtcStart(date) {
  const clone = new Date(date);
  clone.setUTCHours(0, 0, 0, 0);
  return clone;
}

function toUtcEnd(date) {
  const clone = new Date(date);
  clone.setUTCHours(23, 59, 59, 999);
  return clone;
}

async function listIonogramsForDate(dateStr) {
  const [year, month, day] = dateStr.split('-');
  const dayDir = path.join(ionogramRoot, year, month, day);

  try {
    const entries = await fs.readdir(dayDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && isImageFile(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b))
      .map((filename) => buildImagePayload({ year, month, day, filename }));
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

async function findLatestIonogram() {
  try {
    const years = await fs.readdir(ionogramRoot, { withFileTypes: true });
    const sortedYears = years
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => b.localeCompare(a));

    for (const year of sortedYears) {
      const months = await fs.readdir(path.join(ionogramRoot, year), { withFileTypes: true });
      const sortedMonths = months
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((a, b) => b.localeCompare(a));

      for (const month of sortedMonths) {
        const days = await fs.readdir(path.join(ionogramRoot, year, month), { withFileTypes: true });
        const sortedDays = days
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .sort((a, b) => b.localeCompare(a));

        for (const day of sortedDays) {
          const files = await fs.readdir(path.join(ionogramRoot, year, month, day), { withFileTypes: true });
          const sortedFiles = files
            .filter((entry) => entry.isFile() && isImageFile(entry.name))
            .map((entry) => entry.name)
            .sort((a, b) => b.localeCompare(a));

          if (sortedFiles.length > 0) {
            return buildImagePayload({ year, month, day, filename: sortedFiles[0] });
          }
        }
      }
    }

    return null;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

app.get('/api/ionograms/latest', async (req, res) => {
  try {
    const latest = await findLatestIonogram();
    if (!latest) {
      return res.status(404).json({ error: 'No se encontraron ionogramas.' });
    }
    res.json(latest);
  } catch (err) {
    console.error('API /api/ionograms/latest error:', err);
    res.status(500).json({ error: 'No se pudo obtener el ionograma más reciente.' });
  }
});

app.get('/api/ionograms/list', async (req, res) => {
  const dateParam = req.query.date?.toString();

  if (!dateParam) {
    return res.status(400).json({ error: 'Parámetro date requerido (YYYY-MM-DD).' });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return res.status(400).json({ error: 'Formato de fecha inválido. Usa YYYY-MM-DD.' });
  }

  try {
    const images = await listIonogramsForDate(dateParam);
    res.json({ date: dateParam, images });
  } catch (err) {
    console.error('API /api/ionograms/list error:', err);
    res.status(500).json({ error: 'No se pudieron listar los ionogramas para la fecha dada.' });
  }
});

app.use('/api/ionograms', express.static(ionogramRoot, { fallthrough: true }));

app.get('/api/local-magnetometer/days', async (req, res) => {
  const station = (req.query.station || DEFAULT_STATION).toString().toUpperCase();

  try {
    const files = await listDataMinFiles({ root: magnetometerLocalRoot, station });

    res.json({
      station,
      days: files.map((file) => ({
        date: file.isoDate,
        filename: file.filename,
        timestamp: file.timestamp
      }))
    });
  } catch (err) {
    console.error('API /api/local-magnetometer/days error:', err);
    res.status(500).json({ error: 'No se pudieron listar los datos locales disponibles.' });
  }
});

app.get('/api/local-magnetometer/series', async (req, res) => {
  const station = (req.query.station || DEFAULT_STATION).toString().toUpperCase();
  const dateParam = req.query.date?.toString();
  const fromParam = req.query.from?.toString();
  const toParam = req.query.to?.toString();

  try {
    const files = await listDataMinFiles({ root: magnetometerLocalRoot, station });

    if (!files.length) {
      return res.status(404).json({ error: 'No se encontraron archivos locales para la estación indicada.' });
    }

    let rangeStart;
    let rangeEnd;

    if (fromParam || toParam) {
      if (!fromParam || !toParam) {
        return res.status(400).json({ error: 'Parámetros from y to requeridos para rangos personalizados.' });
      }

      const parsedFrom = parseDateQuery(fromParam, { isEnd: false });
      const parsedTo = parseDateQuery(toParam, { isEnd: true });

      if (!parsedFrom || !parsedTo) {
        return res.status(400).json({ error: 'Parámetros from/to inválidos. Usa formato YYYY-MM-DD o YYYY-MM-DDTHH:mm.' });
      }

      if (parsedFrom.getTime() > parsedTo.getTime()) {
        return res.status(400).json({ error: 'La fecha inicial no puede ser posterior a la final.' });
      }

      rangeStart = parsedFrom;
      rangeEnd = parsedTo;
    } else if (dateParam) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        return res.status(400).json({ error: 'Parámetro date inválido. Usa YYYY-MM-DD.' });
      }

      const parsedDate = parseDateQuery(dateParam);
      if (!parsedDate) {
        return res.status(400).json({ error: 'Parámetro date inválido. Usa YYYY-MM-DD.' });
      }

      const iso = parsedDate.toISOString().slice(0, 10);
      const found = files.find((file) => file.isoDate === iso);

      if (!found) {
        return res.status(404).json({ error: `No hay datos locales para la fecha ${iso}.` });
      }

      rangeStart = toUtcStart(parsedDate);
      rangeEnd = toUtcEnd(parsedDate);
    } else {
      const now = new Date();
      const defaultEnd = toUtcEnd(now);
      const defaultStart = toUtcStart(new Date(now));
      defaultStart.setUTCFullYear(defaultStart.getUTCFullYear() - 2);

      rangeStart = defaultStart;
      rangeEnd = defaultEnd;
    }
    const seriesPayload = await loadLocalSeries({
      root: magnetometerLocalRoot,
      station,
      rangeStart,
      rangeEnd,
      targetPoints: 4000
    });

    if (!seriesPayload.points.length) {
      return res.status(404).json({ error: 'No hay datos locales disponibles para el rango solicitado.' });
    }

    const labels = seriesPayload.points.map((point) => point.t);
    const values = seriesPayload.points.map((point) => point.v);
    const startLabel = labels[0] ?? null;
    const endLabel = labels[labels.length - 1] ?? null;

    return res.json({
      labels,
      series: [
        {
          name: 'H',
          data: values
        }
      ],
      meta: {
        station,
        source: 'local-directory',
        points: labels.length,
        originalPoints: seriesPayload.totalPoints,
        bucket: seriesPayload.bucketMs
          ? {
              size: toFluxDuration(seriesPayload.bucketMs),
              ms: seriesPayload.bucketMs,
              downsampled: seriesPayload.downsampled,
              returned: labels.length,
              original: seriesPayload.totalPoints
            }
          : null,
        range: startLabel && endLabel ? { start: startLabel, end: endLabel } : null,
        files: seriesPayload.files,
        from: seriesPayload.requestedRange.start,
        to: seriesPayload.requestedRange.end,
        availableRange: seriesPayload.availableRange,
        filename: seriesPayload.files.length === 1 ? seriesPayload.files[0].filename : null
      }
    });
  } catch (err) {
    console.error('API /api/local-magnetometer/series error:', err);
    res.status(500).json({ error: 'No se pudo obtener la serie local.' });
  }
});

// Helpers
function toFluxDuration(ms) {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s % 86400 === 0) return `${s / 86400}d`;
  if (s % 3600 === 0)  return `${s / 3600}h`;
  if (s % 60 === 0)    return `${s / 60}m`;
  return `${s}s`;
}
function autoEvery(startISO, stopISO, requestedEvery) {
  if (requestedEvery) return requestedEvery;
  const start = new Date(startISO);
  const stop = new Date(stopISO);
  const ms = stop - start;
  const targetPoints = 4000;
  const raw = Math.max(Math.floor(ms / targetPoints), 60_000); // >=1m
  const nice = [60e3, 2*60e3, 5*60e3, 10*60e3, 15*60e3, 30*60e3,
                60*60e3, 2*60*60e3, 6*60*60e3, 12*60*60e3, 24*60*60e3];
  const chosen = nice.find(n => raw <= n) ?? 24*60*60e3;
  return toFluxDuration(chosen);
}

// GET /api/series?from=...&to=...
app.get('/api/series', async (req, res) => {
  try {
    const station = (req.query.station || DEFAULT_STATION).toString();
    const unit = (req.query.unit || 'nT').toString();
    const everyQ = req.query.every?.toString();

    let startISO, stopISO;
    if (req.query.from && req.query.to) {
      const fromDt = new Date(req.query.from);
      const toDt   = new Date(req.query.to);
      if (isNaN(fromDt) || isNaN(toDt)) {
        return res.status(400).json({ error: 'Parámetros from/to inválidos' });
      }
      startISO = fromDt.toISOString();
      stopISO  = toDt.toISOString();
    } else {
      const range = (req.query.range || '2y').toString();
      const m = range.match(/^(\d+)([smhdwy])$/i);
      if (!m) return res.status(400).json({ error: 'Parámetro range inválido' });
      const n = Number(m[1]); const u = m[2].toLowerCase();
      const mult = { s:1, m:60, h:3600, d:86400, w:604800, y:31557600 }[u];
      const stop = new Date();
      const start = new Date(stop.getTime() - n*mult*1000);
      startISO = start.toISOString();
      stopISO  = stop.toISOString();
    }

    const every = autoEvery(startISO, stopISO, everyQ);

    const flux = `
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: time(v: ${JSON.stringify(startISO)}), stop: time(v: ${JSON.stringify(stopISO)}))
  |> filter(fn: (r) => r._measurement == "${MEASUREMENT}")
  |> filter(fn: (r) => r._field == "${FIELD}")
  |> filter(fn: (r) => r.station == "${station}")
  |> filter(fn: (r) => r.unit == "${unit}")
  |> aggregateWindow(every: ${every}, fn: mean, createEmpty: false)
  |> yield(name: "mean")
`;

    // Recolecta filas → ordena por _time → deduplica timestamps
    const rows = [];
    await queryApi.collectRows(flux, (row, meta) => {
      const o = meta.toObject(row);
      rows.push({ t: o._time, v: Number(o._value) });
    });

    rows.sort((a,b) => new Date(a.t) - new Date(b.t));

    // Si hay timestamps repetidos, me quedo con el último
    const dedup = [];
    for (let i=0;i<rows.length;i++){
      if (i>0 && rows[i].t === rows[i-1].t) {
        dedup[dedup.length-1] = rows[i];
      } else {
        dedup.push(rows[i]);
      }
    }

    res.json({
      labels: dedup.map(r => r.t),
      series: [{ name: FIELD, data: dedup.map(r => r.v) }],
      meta: { every, station, unit, field: FIELD, measurement: MEASUREMENT, startISO, stopISO }
    });
  } catch (err) {
    console.error('API /api/series error:', err);
    res.status(500).json({ error: 'No se pudieron obtener datos del servicio.' });
  }
});
// --- NUEVO ENDPOINT: /api/series-dh ---
// Calcula ΔH = H - media_diaria(H)
// --- NUEVO ENDPOINT: /api/series-dh ---
// ΔH = H - media del primer día del rango
app.get('/api/series-dh', async (req, res) => {
  try {
    const station = (req.query.station || DEFAULT_STATION).toString();
    const unit = (req.query.unit || 'nT').toString();

    let startISO, stopISO;
    if (req.query.from && req.query.to) {
      startISO = new Date(req.query.from).toISOString();
      stopISO  = new Date(req.query.to).toISOString();
    } else {
      const stop = new Date();
      const start = new Date(stop);
      start.setFullYear(stop.getFullYear() - 2);
      startISO = start.toISOString();
      stopISO  = stop.toISOString();
    }

    const flux = `
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: time(v: ${JSON.stringify(startISO)}), stop: time(v: ${JSON.stringify(stopISO)}))
  |> filter(fn: (r) => r._measurement == "${MEASUREMENT}")
  |> filter(fn: (r) => r._field == "${FIELD}")
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
    rows.sort((a,b) => new Date(a.t) - new Date(b.t));

    if (rows.length === 0) {
      return res.json({ labels: [], series: [{ name: 'ΔH', data: [] }] });
    }

    // baseline: media del primer día de la serie
    const firstDay = rows[0].t.substring(0,10);
    const firstDayVals = rows.filter(r => r.t.startsWith(firstDay)).map(r => r.v);
    const baseline = firstDayVals.reduce((a,b)=>a+b,0)/firstDayVals.length;

    const deltaH = rows.map(r => ({ t: r.t, v: r.v - baseline }));

    res.json({
      labels: deltaH.map(d => d.t),
      series: [{ name: 'ΔH', data: deltaH.map(d => d.v) }],
      meta: { station, unit, baseline, field: FIELD, measurement: MEASUREMENT }
    });
  } catch (err) {
    console.error('API /api/series-dh error:', err);
    res.status(500).json({ error: 'No se pudieron calcular ΔH.' });
  }
});


app.listen(Number(PORT), () => {
  console.log(`✅ API escuchando en http://localhost:${PORT}`);
});
