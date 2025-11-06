import process from 'node:process';
import fallbackRaw from '../data/kpFallback.json' with { type: 'json' };

async function resolveCron() {
  try {
    const mod = await import('node-cron');
    return mod.default ?? mod;
  } catch (err) {
    try {
      const mod = await import('../vendor/node-cron/index.js');
      console.warn('[Kp] Usando implementación local de node-cron.');
      return mod.default ?? mod;
    } catch (fallbackErr) {
      err.cause = fallbackErr;
      throw err;
    }
  }
}

const cron = await resolveCron();

const GFZ_BASE_URL = 'https://kp.gfz.de/app/json/';
const FETCH_TIMEOUT_MS = 30_000;

let kpCache = { updatedAt: null, series: [] };
let refreshPromise = null;
let cronTask = null;
let initialized = false;
let fallbackSeries = [];

function cloneSeries(series) {
  return series.map((point) => ({ ...point }));
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value, fallback = true) {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = value.toString().trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

function getConfig() {
  const {
    KP_LOOKBACK_DAYS = '10',
    KP_STATUS = 'now',
    KP_CRON = '*/15 * * * *',
    KP_ENABLED = 'true'
  } = process.env;

  const lookbackDays = parsePositiveInt(KP_LOOKBACK_DAYS, 10);
  const status = KP_STATUS && KP_STATUS.toString().toLowerCase() === 'def' ? 'def' : 'now';
  const cronExpr = KP_CRON && KP_CRON.trim() ? KP_CRON.trim() : '*/15 * * * *';
  const enabled = parseBoolean(KP_ENABLED, true);

  return { lookbackDays, status, cronExpr, enabled };
}

export function isKpEnabled() {
  return getConfig().enabled;
}

export function buildUrl({ now = new Date() } = {}) {
  const { lookbackDays, status } = getConfig();
  const endDate = new Date(now);
  const startDate = new Date(endDate.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  const url = new URL(GFZ_BASE_URL);
  url.searchParams.set('index', 'Kp');
  url.searchParams.set('start', startDate.toISOString());
  url.searchParams.set('end', endDate.toISOString());
  if (status === 'def') {
    url.searchParams.set('status', 'def');
  }
  return url.toString();
}

function normalizeStatus(rawStatus) {
  const normalized = rawStatus ? rawStatus.toString().trim().toLowerCase() : '';
  if (normalized.startsWith('def')) {
    return 'def';
  }
  return 'now';
}

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function normalizeSeries(raw) {
  if (!raw) return [];

  const collections = [];
  if (Array.isArray(raw)) {
    collections.push(raw);
  }
  if (Array.isArray(raw?.data)) {
    collections.push(raw.data);
  }
  if (Array.isArray(raw?.series)) {
    collections.push(raw.series);
  }
  if (Array.isArray(raw?.items)) {
    collections.push(raw.items);
  }

  if (!collections.length) {
    return [];
  }

  const normalized = [];

  for (const collection of collections) {
    for (const item of collection) {
      if (!item) continue;

      if (Array.isArray(item)) {
        const [timeRaw, valueRaw, statusRaw] = item;
        const iso = toIso(timeRaw);
        const value = Number.parseFloat(valueRaw);
        if (iso && Number.isFinite(value)) {
          normalized.push({
            time: iso,
            value,
            status: normalizeStatus(statusRaw)
          });
        }
        continue;
      }

      if (typeof item === 'object') {
        const time =
          item.time ??
          item.timestamp ??
          item.time_tag ??
          item.timeTag ??
          item.datetime ??
          item.date ??
          item.obstime ??
          item.obsTime;
        const iso = toIso(time);
        const valueRaw =
          item.value ??
          item.kp ??
          item.Kp ??
          item.kp_index ??
          item.index ??
          item.KP ??
          item.kpIndex;
        const value = Number.parseFloat(valueRaw);
        if (iso && Number.isFinite(value)) {
          normalized.push({
            time: iso,
            value,
            status: normalizeStatus(item.status ?? item.flag ?? item.type)
          });
        }
      }
    }
  }

  normalized.sort((a, b) => new Date(a.time) - new Date(b.time));

  const deduped = [];
  let lastTime = null;
  for (const point of normalized) {
    if (point.time === lastTime) {
      deduped[deduped.length - 1] = point;
    } else {
      deduped.push(point);
      lastTime = point.time;
    }
  }

  return deduped;
}

function loadFallbackSeries() {
  try {
    const series = normalizeSeries(fallbackRaw);
    if (series.length) {
      return series;
    }
  } catch (err) {
    console.error('[Kp] No se pudo normalizar el fallback local:', err);
  }
  return [];
}

fallbackSeries = loadFallbackSeries();

export async function fetchKp() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const url = buildUrl();
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'LocalCINC/1.0 (+https://kp.gfz.de)',
        'Accept': 'application/json'
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`GFZ respondió con estado ${response.status}`);
    }

    const body = await response.json();
    const series = normalizeSeries(body);
    if (!series.length) {
      throw new Error('GFZ devolvió una serie vacía o no reconocida');
    }
    return series;
  } finally {
    clearTimeout(timeout);
  }
}

export function getKpCache() {
  return {
    updatedAt: kpCache.updatedAt,
    series: cloneSeries(kpCache.series)
  };
}

export async function refreshKp() {
  if (!isKpEnabled()) {
    return getKpCache();
  }
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const series = await fetchKp();
      kpCache = {
        updatedAt: new Date().toISOString(),
        series
      };
      console.info(`[Kp] cache actualizado con ${series.length} puntos.`);
    } catch (err) {
      console.error('[Kp] Error al refrescar datos:', err);
      if (!kpCache.series.length && fallbackSeries.length) {
        kpCache = {
          updatedAt: new Date().toISOString(),
          series: cloneSeries(fallbackSeries)
        };
        console.info(
          `[Kp] cache inicializado con datos de respaldo (${kpCache.series.length} puntos).`
        );
      }
    } finally {
      refreshPromise = null;
    }
    return getKpCache();
  })();

  return refreshPromise;
}

export async function initKpService() {
  const { cronExpr, enabled } = getConfig();
  if (!enabled) {
    console.info('[Kp] Servicio deshabilitado por configuración.');
    return getKpCache();
  }
  if (initialized) {
    return getKpCache();
  }
  initialized = true;

  await refreshKp();

  if (cronTask) {
    cronTask.stop();
    cronTask = null;
  }

  try {
    cronTask = cron.schedule(cronExpr, () => {
      refreshKp();
    });
    console.info(`[Kp] Cron inicializado (${cronExpr}).`);
  } catch (err) {
    console.error('[Kp] No se pudo programar el cron:', err);
  }

  return getKpCache();
}

export function stopKpService() {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
  }
  initialized = false;
  refreshPromise = null;
  kpCache = { updatedAt: null, series: [] };
}

export const __internals = {
  normalizeSeries,
  parseBoolean,
  parsePositiveInt
};

