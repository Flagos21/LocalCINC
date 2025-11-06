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
  initKpService,
  getKpCache,
  isKpEnabled
} from './services/kpService.js';
import {
  listDataMinFiles,
  loadLocalSeries
} from './localMagnetometer.js';
import {
  loadElectricFieldSeries
} from './localElectricField.js';

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ionogramRoot = path.join(__dirname, 'ionograms');
const magnetometerLocalRoot = path.join(__dirname, 'magnetometro', 'DataMin');
const electricFieldRoot = path.join(__dirname, 'campoelectrico', 'cinc_efm');

const {
  INFLUX_URL,
  INFLUX_TOKEN,
  INFLUX_ORG,
  INFLUX_BUCKET,
  MEASUREMENT = 'magnetometer',
  FIELD = 'H',
  DEFAULT_STATION = 'CHI',
  PORT = 3001,
  KYOTO_DST_URL,
  DST_CACHE_SEC: DST_CACHE_SEC_RAW = '60'
} = process.env;

const DEFAULT_DST_URL = 'https://wdc.kugi.kyoto-u.ac.jp/dst_realtime/presentmonth/index.html';
const DST_ENDPOINT = KYOTO_DST_URL || DEFAULT_DST_URL;
const DST_CACHE_TTL_MS = (() => {
  const parsed = Number.parseInt(DST_CACHE_SEC_RAW, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed * 1000 : 0;
})();

if (!INFLUX_URL || !INFLUX_TOKEN || !INFLUX_ORG || !INFLUX_BUCKET) {
  console.error('❌ Falta configuración de Influx (URL/TOKEN/ORG/BUCKET) en .env');
  process.exit(1);
}

const influx = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN });
const queryApi = influx.getQueryApi(INFLUX_ORG);

const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

function isConnectionRefusedError(err) {
  if (!err) return false;
  if (err.code === 'ECONNREFUSED') return true;
  if (err.cause && isConnectionRefusedError(err.cause)) return true;
  if (Array.isArray(err.errors)) {
    return err.errors.some((nested) => isConnectionRefusedError(nested));
  }
  if (typeof err.message === 'string' && err.message.includes('ECONNREFUSED')) {
    return true;
  }
  return false;
}

function isImageFile(name) {
  const ext = path.extname(name).toLowerCase();
  return imageExtensions.has(ext);
}

function normalizeTwoDigitYear(yy) {
  if (!Number.isFinite(yy)) {
    return null;
  }
  return yy >= 70 ? 1900 + yy : 2000 + yy;
}

function inferYearMonth({ url, raw }) {
  const fileMatch = url?.match(/dst\s*(\d{2})(\d{2})\.(?:txt|for|dat)/i);
  if (fileMatch) {
    const yy = Number.parseInt(fileMatch[1], 10);
    const mm = Number.parseInt(fileMatch[2], 10);
    if (Number.isFinite(yy) && Number.isFinite(mm) && mm >= 1 && mm <= 12) {
      return { yyyy: normalizeTwoDigitYear(yy), m0: mm - 1 };
    }
  }

  const sample = typeof raw === 'string' ? raw.slice(0, 500) : '';

  let match = sample.match(/\b((?:19|20)\d{2})\s+([01]?\d)\b/);
  if (match) {
    const yyyy = Number.parseInt(match[1], 10);
    const mm = Number.parseInt(match[2], 10);
    if (Number.isFinite(yyyy) && Number.isFinite(mm) && mm >= 1 && mm <= 12) {
      return { yyyy, m0: mm - 1 };
    }
  }

  match = sample.match(/\b(\d{2})\s+([01]?\d)\b/);
  if (match) {
    const yy = Number.parseInt(match[1], 10);
    const mm = Number.parseInt(match[2], 10);
    const yyyy = normalizeTwoDigitYear(yy);
    if (Number.isFinite(yyyy) && Number.isFinite(mm) && mm >= 1 && mm <= 12) {
      return { yyyy, m0: mm - 1 };
    }
  }

  const now = new Date();
  return { yyyy: now.getUTCFullYear(), m0: now.getUTCMonth() };
}

function parseDstMonthlyText(raw, inferred) {
  if (!raw || !inferred || !Number.isFinite(inferred?.yyyy) || !Number.isFinite(inferred?.m0)) {
    return [];
  }

  const lines = raw.split(/\r?\n/);
  const points = [];
  let previousDay = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const tokens = trimmed.split(/\s+/);
    if (tokens.length < 24) {
      continue;
    }

    const numbers = tokens.map((token) => Number.parseInt(token, 10));
    if (numbers.some((value) => !Number.isFinite(value))) {
      continue;
    }

    let day;
    let values;

    if (numbers.length === 24) {
      day = previousDay > 0 ? previousDay + 1 : 1;
      values = numbers;
    } else if (numbers.length >= 25) {
      day = numbers[0];
      values = numbers.slice(1, 25);
    } else {
      continue;
    }

    if (!Number.isFinite(day) || day < 1 || day > 31) {
      continue;
    }

    previousDay = day;

    for (let hour = 0; hour < values.length && hour < 24; hour += 1) {
      const value = values[hour];
      if (!Number.isFinite(value) || Math.abs(value) >= 9999) {
        continue;
      }

      const timestamp = Date.UTC(inferred.yyyy, inferred.m0, day, hour, 0, 0);
      if (Number.isFinite(timestamp)) {
        points.push({ timestamp, value });
      }
    }
  }

  return points;
}

function parseDstHourlyRows(raw) {
  if (!raw) {
    return [];
  }

  const lines = raw.split(/\r?\n/);
  const points = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const tokens = trimmed.split(/\s+/);
    if (tokens.length < 5) {
      continue;
    }

    let year = Number.parseInt(tokens[0], 10);
    const month = Number.parseInt(tokens[1], 10);
    const day = Number.parseInt(tokens[2], 10);
    const hour = Number.parseInt(tokens[3], 10);
    const value = Number.parseFloat(tokens[4]);

    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(hour) || !Number.isFinite(value)) {
      continue;
    }

    if (year < 100) {
      year = normalizeTwoDigitYear(year);
    }

    if (!Number.isFinite(year) || month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23) {
      continue;
    }

    if (Math.abs(value) >= 9999) {
      continue;
    }

    const timestamp = Date.UTC(year, month - 1, day, hour, 0, 0);
    if (Number.isFinite(timestamp)) {
      points.push({ timestamp, value });
    }
  }

  return points;
}

function normalizeDstPoints(points) {
  if (!Array.isArray(points) || points.length === 0) {
    return [];
  }

  const map = new Map();
  for (const point of points) {
    if (!point || !Number.isFinite(point.timestamp) || !Number.isFinite(point.value)) {
      continue;
    }

    map.set(point.timestamp, point.value);
  }

  const timestamps = Array.from(map.keys()).sort((a, b) => a - b);
  const nowYear = new Date().getUTCFullYear();
  const normalized = [];

  for (const timestamp of timestamps) {
    const value = map.get(timestamp);
    if (!Number.isFinite(value) || Math.abs(value) >= 9999) {
      continue;
    }

    const date = new Date(timestamp);
    const year = date.getUTCFullYear();
    if (year < 1970 || year > nowYear + 1) {
      continue;
    }

    normalized.push({
      timestamp: date.toISOString(),
      value
    });
  }

  return normalized;
}

function cloneDstPayload(payload) {
  if (!payload) {
    return null;
  }

  return {
    ...payload,
    data: Array.isArray(payload.data) ? payload.data.map((entry) => ({ ...entry })) : [],
    meta: payload.meta ? { ...payload.meta } : undefined
  };
}

let dstCache = {
  expiresAt: 0,
  payload: null,
  raw: '',
  inferred: null,
  updatedAt: null
};

async function fetchDstFromSource() {
  if (!DST_ENDPOINT) {
    throw new Error('No se configuró la URL de origen para el índice Dst.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(DST_ENDPOINT, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Respuesta inválida desde Kyoto Dst (${response.status})`);
    }

    const raw = await response.text();
    const inferred = inferYearMonth({ url: DST_ENDPOINT, raw });
    let parsed = parseDstMonthlyText(raw, inferred);
    if (!parsed.length) {
      parsed = parseDstHourlyRows(raw);
    }

    const normalized = normalizeDstPoints(parsed);
    if (!normalized.length) {
      throw new Error('No se pudieron obtener puntos Dst válidos.');
    }

    const updatedAt = new Date().toISOString();
    const meta = {
      points: normalized.length,
      url: DST_ENDPOINT,
      cacheTtlSec: Math.round(DST_CACHE_TTL_MS / 1000),
      inferred,
      updatedAt
    };

    const payload = {
      source: 'live',
      updatedAt,
      data: normalized,
      meta
    };

    dstCache = {
      expiresAt: DST_CACHE_TTL_MS > 0 ? Date.now() + DST_CACHE_TTL_MS : 0,
      payload,
      raw,
      inferred,
      updatedAt
    };

    return cloneDstPayload(payload);
  } finally {
    clearTimeout(timeout);
  }
}

async function getDstData(allowFreshFetch = true) {
  const now = Date.now();
  const hasCache = Boolean(dstCache.payload);
  const cacheValid = hasCache && DST_CACHE_TTL_MS > 0 && dstCache.expiresAt > now;

  if (cacheValid) {
    return cloneDstPayload(dstCache.payload);
  }

  if (!hasCache && !allowFreshFetch) {
    allowFreshFetch = true;
  }

  if (allowFreshFetch) {
    try {
      return await fetchDstFromSource();
    } catch (err) {
      if (hasCache) {
        const cached = cloneDstPayload(dstCache.payload);
        if (cached) {
          cached.source = 'stale-cache';
          if (cached.meta) {
            cached.meta = { ...cached.meta, error: err.message };
          }
          return cached;
        }
      }
      throw err;
    }
  }

  if (hasCache) {
    const cached = cloneDstPayload(dstCache.payload);
    if (cached) {
      cached.source = 'stale-cache';
      return cached;
    }
  }

  throw new Error('No hay datos Dst disponibles.');
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

app.get('/api/dst/realtime', async (req, res) => {
  try {
    const payload = await getDstData(true);
    res.json(payload);
  } catch (err) {
    console.error('API /api/dst/realtime error:', err);

    if (err?.name === 'AbortError') {
      return res.status(504).json({ error: 'Tiempo de espera excedido al consultar el índice Dst.' });
    }

    const status = isConnectionRefusedError(err) ? 502 : 500;
    const message = err?.message && err.message.includes('No hay datos')
      ? err.message
      : 'No se pudo obtener el índice Dst.';
    res.status(status).json({ error: message });
  }
});

app.get('/api/dst/debug/inferred', async (req, res) => {
  try {
    if (!dstCache.payload) {
      await getDstData(true);
    }

    if (!dstCache.inferred) {
      return res.status(404).json({ error: 'No hay información inferida disponible.' });
    }

    res.json({ inferred: dstCache.inferred, updatedAt: dstCache.updatedAt });
  } catch (err) {
    console.error('API /api/dst/debug/inferred error:', err);

    if (err?.name === 'AbortError') {
      return res.status(504).json({ error: 'Tiempo de espera excedido al consultar el índice Dst.' });
    }

    const status = isConnectionRefusedError(err) ? 502 : 500;
    res.status(status).json({ error: 'No se pudo obtener la inferencia de fecha para Dst.' });
  }
});

app.get('/api/dst/debug/raw-head', async (req, res) => {
  try {
    if (!dstCache.payload) {
      await getDstData(true);
    }

    if (!dstCache.raw) {
      return res.status(404).json({ error: 'No hay datos brutos disponibles.' });
    }

    const lines = dstCache.raw.split(/\r?\n/).slice(0, 30);
    res.json({ lines, updatedAt: dstCache.updatedAt });
  } catch (err) {
    console.error('API /api/dst/debug/raw-head error:', err);

    if (err?.name === 'AbortError') {
      return res.status(504).json({ error: 'Tiempo de espera excedido al consultar el índice Dst.' });
    }

    const status = isConnectionRefusedError(err) ? 502 : 500;
    res.status(status).json({ error: 'No se pudo obtener el origen bruto del Dst.' });
  }
});

app.get('/api/dst/chart', async (req, res) => {
  try {
    const payload = await getDstData(false);
    const data = Array.isArray(payload?.data) ? payload.data : [];

    const labels = data.map((point) => point.timestamp);
    const series = [
      {
        name: 'Dst (nT)',
        data: data.map((point) => point.value)
      }
    ];

    res.json({
      labels,
      series,
      meta: {
        points: labels.length,
        updatedAt: payload?.updatedAt ?? null,
        source: payload?.source ?? null
      }
    });
  } catch (err) {
    console.error('API /api/dst/chart error:', err);

    if (err?.name === 'AbortError') {
      return res.status(504).json({ error: 'Tiempo de espera excedido al consultar el índice Dst.' });
    }

    const status = isConnectionRefusedError(err) ? 502 : 500;
    const message = err?.message && err.message.includes('No hay datos')
      ? err.message
      : 'No se pudo generar la serie Dst.';
    res.status(status).json({ error: message });
  }
});

app.get('/api/kp', (req, res) => {
  if (!isKpEnabled()) {
    return res.status(503).json({ error: 'Kp disabled' });
  }

  const cache = getKpCache();
  res.json(cache);
});

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
        return res.status(400).json({ error: 'Parámetros from y to requeridos para intervalos personalizados.' });
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
      return res.status(404).json({ error: 'No hay datos locales disponibles para el intervalo solicitado.' });
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

app.get('/api/electric-field/series', async (req, res) => {
  const stationParam = req.query.station?.toString().trim() ?? '';
  const dateParam = req.query.date?.toString();
  const fromParam = req.query.from?.toString();
  const toParam = req.query.to?.toString();

  try {
    let rangeStart;
    let rangeEnd;

    if (fromParam || toParam) {
      if (!fromParam || !toParam) {
        return res.status(400).json({ error: 'Parámetros from y to requeridos para intervalos personalizados.' });
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

      rangeStart = toUtcStart(parsedDate);
      rangeEnd = toUtcEnd(parsedDate);
    } else {
      rangeStart = undefined;
      rangeEnd = undefined;
    }

    const seriesPayload = await loadElectricFieldSeries({
      root: electricFieldRoot,
      station: stationParam || undefined,
      rangeStart,
      rangeEnd,
      targetPoints: 4000,
    });

    if (!seriesPayload.points.length) {
      return res.status(404).json({ error: 'No hay datos locales disponibles para el intervalo solicitado.' });
    }

    const labels = seriesPayload.points.map((point) => point.t);
    const values = seriesPayload.points.map((point) => point.v);
    const startLabel = labels[0] ?? null;
    const endLabel = labels[labels.length - 1] ?? null;

    return res.json({
      labels,
      series: [
        {
          name: 'E_z',
          data: values,
        },
      ],
      meta: {
        station: stationParam || null,
        stationsAvailable: seriesPayload.stations,
        stationsMatched: seriesPayload.matchedStations,
        points: labels.length,
        originalPoints: seriesPayload.totalPoints,
        bucket: seriesPayload.bucketMs
          ? {
              size: toFluxDuration(seriesPayload.bucketMs),
              ms: seriesPayload.bucketMs,
              downsampled: seriesPayload.downsampled,
              returned: labels.length,
              original: seriesPayload.totalPoints,
            }
          : null,
        range: startLabel && endLabel ? { start: startLabel, end: endLabel } : null,
        files: seriesPayload.files,
        from: seriesPayload.requestedRange?.start,
        to: seriesPayload.requestedRange?.end,
        availableRange: seriesPayload.availableRange,
      },
    });
  } catch (err) {
    console.error('API /api/electric-field/series error:', err);
    res.status(500).json({ error: 'No se pudo obtener la serie de campo eléctrico local.' });
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
    if (isConnectionRefusedError(err)) {
      console.error('API /api/series error: InfluxDB no está disponible (conexión rechazada).');
      return res.status(503).json({ error: 'InfluxDB no está disponible. Intenta más tarde.' });
    }
    console.error('API /api/series error:', err);
    res.status(500).json({ error: 'No se pudieron obtener datos del servicio.' });
  }
});
// --- NUEVO ENDPOINT: /api/series-dh ---
// Calcula ΔH = H - media_diaria(H)
// --- NUEVO ENDPOINT: /api/series-dh ---
// ΔH = H - media del primer día del intervalo
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
    if (isConnectionRefusedError(err)) {
      console.error('API /api/series-dh error: InfluxDB no está disponible (conexión rechazada).');
      return res.status(503).json({ error: 'InfluxDB no está disponible. Intenta más tarde.' });
    }
    console.error('API /api/series-dh error:', err);
    res.status(500).json({ error: 'No se pudieron calcular ΔH.' });
  }
});


const kpReadyPromise = initKpService();

if (process.env.NODE_ENV !== 'test') {
  try {
    await kpReadyPromise;
  } catch (err) {
    console.error('[Kp] Error en warm-up inicial:', err);
  }

  app.listen(Number(PORT), () => {
    console.log(`✅ API escuchando en http://localhost:${PORT}`);
  });
}

export const kpReady = kpReadyPromise;
export default app;
