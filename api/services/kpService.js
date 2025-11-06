/* eslint-env node */
import 'dotenv/config';
import process from 'node:process';
import localFallbackSource from '../data/kpFallback.json' with { type: 'json' };

// --- util: cron dinámico (soporta vendor/local si falta node-cron) ---
async function resolveCron() {
  try {
    const mod = await import('node-cron');
    return mod.default ?? mod;
  } catch {
    const mod = await import('../vendor/node-cron/index.js');
    console.warn('[Kp] Usando implementación local de node-cron.');
    return mod.default ?? mod;
  }
}
const cron = await resolveCron();

// --- endpoints conocidos ---
const GFZ_APP_JSON = 'https://kp.gfz.de/app/json/'; // intento 1 (a veces 500)
const NOAA_JSON_3H = 'https://services.swpc.noaa.gov/json/planetary_k_index.json';
const NOAA_JSON_1M = 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json';

const FETCH_TIMEOUT_MS = 30_000;

const clone = (value) => (
  typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value))
);

let localFallbackData = clone(localFallbackSource);

// -------------------- Config --------------------
function parsePositiveInt(v, fb) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fb;
}
function parseBoolean(v, fb = true) {
  if (v === undefined || v === null) return fb;
  const s = String(v).trim().toLowerCase();
  if (['1','true','yes','y','on'].includes(s)) return true;
  if (['0','false','no','n','off'].includes(s)) return false;
  return fb;
}
function getCfg() {
  const {
    KP_LOOKBACK_DAYS = '10',
    KP_STATUS = 'now',              // 'now' (nowcast) o 'def' (definitivos)
    KP_CRON = '*/15 * * * *',
    KP_ENABLED = 'true'
  } = process.env;

  return {
    lookbackDays: parsePositiveInt(KP_LOOKBACK_DAYS, 10),
    status: String(KP_STATUS).toLowerCase() === 'def' ? 'def' : 'now',
    cronExpr: KP_CRON && KP_CRON.trim() ? KP_CRON.trim() : '*/15 * * * *',
    enabled: parseBoolean(KP_ENABLED, true)
  };
}

// -------------------- Normalizadores --------------------
function toIso(x) {
  if (x === undefined || x === null) return null;

  if (x instanceof Date) {
    const t = x.getTime();
    return Number.isNaN(t) ? null : x.toISOString();
  }

  if (typeof x === 'number') {
    const d = new Date(x);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  let s = String(x).trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) {
    s = s.replace(' ', 'T');
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) {
    s = `${s}Z`;
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function normStatus(s) {
  const k = (s ?? '').toString().trim().toLowerCase();
  return k.startsWith('def') ? 'def' : 'now';
}

/** Forma A: GFZ “matriz” como tu kp.json -> { datetime:[], Kp:[], status:[] } */
function normalizeGfzMatrix(obj) {
  if (!obj || !Array.isArray(obj.datetime) || !Array.isArray(obj.Kp)) return [];
  const n = Math.min(obj.datetime.length, obj.Kp.length, (obj.status || []).length || Infinity);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const t = toIso(obj.datetime[i]);
    const v = Number.parseFloat(obj.Kp[i]);
    if (!t || !Number.isFinite(v)) continue;
    out.push({ time: t, value: v, status: normStatus(obj.status?.[i]) });
  }
  return out;
}

/** Forma B: colecciones varias [{time,value,status}] o [[time,value,status], ...] */
function normalizeFlexible(body) {
  const pools = [];
  if (Array.isArray(body)) pools.push(body);
  if (Array.isArray(body?.data)) pools.push(body.data);
  if (Array.isArray(body?.series)) pools.push(body.series);
  if (Array.isArray(body?.items)) pools.push(body.items);

  const out = [];
  for (const col of pools) {
    for (const item of col) {
      if (Array.isArray(item)) {
        const [tr, vr, sr] = item;
        const t = toIso(tr);
        const v = Number.parseFloat(vr);
        if (t && Number.isFinite(v)) out.push({ time: t, value: v, status: normStatus(sr) });
      } else if (item && typeof item === 'object') {
        const t = toIso(
          item.time ?? item.timestamp ?? item.time_tag ?? item.timeTag ?? item.datetime ?? item.date,
        );
        const v = Number.parseFloat(
          item.value ?? item.kp ?? item.Kp ?? item.kp_index ?? item.index ?? item.KP ?? item.kpIndex,
        );
        if (t && Number.isFinite(v)) out.push({ time: t, value: v, status: normStatus(item.status ?? item.flag) });
      }
    }
  }
  return out;
}

function sortDedup(series) {
  const s = [...series].sort((a, b) => new Date(a.time) - new Date(b.time));
  const out = [];
  let last = null;
  for (const p of s) {
    if (p.time === last) out[out.length - 1] = p; else { out.push(p); last = p.time; }
  }
  return out;
}

// -------------------- Fetchers --------------------
function buildGfzUrlIso(now = new Date()) {
  const { lookbackDays, status } = getCfg();
  const end = new Date(now);
  const start = new Date(end.getTime() - lookbackDays * 86400_000);
  const u = new URL(GFZ_APP_JSON);
  u.searchParams.set('index', 'Kp');
  u.searchParams.set('start', start.toISOString());
  u.searchParams.set('end', end.toISOString());
  if (status === 'def') u.searchParams.set('status', 'def');
  return u.toString();
}
function buildGfzUrlYmd(now = new Date()) {
  // Variante “YYYY-MM-DD” (algunos despliegues aceptan este formato)
  const { lookbackDays, status } = getCfg();
  const end = new Date(now);
  const start = new Date(end.getTime() - lookbackDays * 86400_000);
  const pad = (n) => String(n).padStart(2, '0');
  const s = `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-${pad(start.getUTCDate())}`;
  const e = `${end.getUTCFullYear()}-${pad(end.getUTCMonth() + 1)}-${pad(end.getUTCDate())}`;
  const u = new URL(GFZ_APP_JSON);
  u.searchParams.set('index', 'Kp');
  u.searchParams.set('start', s);
  u.searchParams.set('end', e);
  if (status === 'def') u.searchParams.set('status', 'def');
  return u.toString();
}

async function fetchJson(url, { timeoutMs = FETCH_TIMEOUT_MS, headers = {} } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'LocalCINC/1.0 (+https://kp.gfz.de)',
        Accept: 'application/json',
        ...headers,
      },
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// GFZ (ISO)
async function tryGfzIso() {
  try {
    const body = await fetchJson(buildGfzUrlIso());
    // si llega tipo matriz { datetime, Kp, status }
    if (body && body.datetime && body.Kp) {
      const s = normalizeGfzMatrix(body);
      if (!s.length) throw new Error('GFZ serie vacía/no reconocida');
      return sortDedup(s);
    }
    const s = normalizeFlexible(body);
    if (!s.length) throw new Error('GFZ serie vacía/no reconocida');
    return sortDedup(s);
  } catch (e) {
    console.warn('[Kp] GFZ (ISO) falló:', e.message || e);
    throw e;
  }
}

// GFZ (YYYY-MM-DD)
async function tryGfzYmd() {
  try {
    const body = await fetchJson(buildGfzUrlYmd());
    if (body && body.datetime && body.Kp) {
      const s = normalizeGfzMatrix(body);
      if (!s.length) throw new Error('GFZ serie vacía/no reconocida');
      return sortDedup(s);
    }
    const s = normalizeFlexible(body);
    if (!s.length) throw new Error('GFZ serie vacía/no reconocida');
    return sortDedup(s);
  } catch (e) {
    console.warn('[Kp] GFZ (YMD) falló:', e.message || e);
    throw e;
  }
}

// NOAA fallback. Primero intenta la serie oficial de 3 horas y luego complementa con 1 minuto.
async function tryNoaa() {
  const collected = [];

  try {
    const body3h = await fetchJson(NOAA_JSON_3H);
    const normalized3h = normalizeFlexible(body3h);
    for (const p of normalized3h) {
      if (p?.time && Number.isFinite(p?.value)) {
        collected.push({ ...p, status: 'now' });
      }
    }
  } catch (err) {
    console.warn('[Kp] NOAA (3h) falló:', err.message || err);
  }

  try {
    const body1m = await fetchJson(NOAA_JSON_1M);
    for (const it of body1m) {
      const rawTime = it.time_tag ?? it.timeTag ?? it.time ?? it.timestamp ?? it.observed_time;
      const t = toIso(rawTime);
      const v = Number.parseFloat(it.kp_index ?? it.kp ?? it.value);
      if (t && Number.isFinite(v)) {
        collected.push({ time: t, value: v, status: 'now' });
      }
    }
  } catch (err) {
    console.warn('[Kp] NOAA (1m) falló:', err.message || err);
  }

  const sorted = sortDedup(collected);
  if (!sorted.length) {
    throw new Error('NOAA serie vacía/no reconocida');
  }
  return sorted;
}

function tryLocalFallback() {
  const pools = normalizeFlexible(
    localFallbackData?.data ?? localFallbackData?.series ?? localFallbackData
  );
  const sorted = sortDedup(pools);
  if (!sorted.length) throw new Error('Fallback local vacío');
  return sorted;
}

// -------------------- Cache & API --------------------
let kpCache = { updatedAt: null, series: [] };
let cronTask = null;
let refreshing = null;
let initialized = false;

export function isKpEnabled() { return getCfg().enabled; }
export function getKpCache() {
  return { updatedAt: kpCache.updatedAt, series: kpCache.series.map(p => ({ ...p })) };
}

export async function refreshKp() {
  if (!isKpEnabled()) return getKpCache();
  if (refreshing) return refreshing;

  refreshing = (async () => {
    try {
      let series = [];
      const attempts = [
        async () => await tryGfzIso(),
        async () => await tryGfzYmd(),
        async () => {
          console.warn('[Kp] Usando NOAA como fallback…');
          return await tryNoaa();
        },
        async () => {
          console.warn('[Kp] Usando datos locales de respaldo…');
          return tryLocalFallback();
        }
      ];

      for (const attempt of attempts) {
        try {
          series = await attempt();
          if (series?.length) break;
        } catch (err) {
          console.warn('[Kp] Intento fallido al obtener datos:', err.message || err);
        }
      }

      if (!series?.length) {
        throw new Error('No se pudo obtener la serie Kp desde las fuentes disponibles.');
      }

      kpCache = { updatedAt: new Date().toISOString(), series };
      console.info(`[Kp] cache actualizado con ${series.length} puntos.`);
    } catch (err) {
      console.error('[Kp] Error al refrescar datos:', err);
    } finally {
      refreshing = null;
    }
    return getKpCache();
  })();

  return refreshing;
}

export async function initKpService() {
  const { cronExpr, enabled } = getCfg();
  if (!enabled) {
    console.info('[Kp] Servicio deshabilitado por configuración.');
    return getKpCache();
  }
  if (initialized) return getKpCache();
  initialized = true;

  await refreshKp();

  try {
    if (cronTask) cronTask.stop();
    cronTask = cron.schedule(cronExpr, () => { refreshKp(); });
    console.info(`[Kp] Cron inicializado (${cronExpr}).`);
  } catch (err) {
    console.error('[Kp] No se pudo programar el cron:', err);
  }
  return getKpCache();
}

export function stopKpService() {
  if (cronTask) {
    try { cronTask.stop(); } catch { /* ignore */ }
    cronTask = null;
  }
  refreshing = null;
  initialized = false;
}

function setLocalFallbackData(data) {
  localFallbackData = data;
}

function resetLocalFallbackData() {
  localFallbackData = clone(localFallbackSource);
}

// Exporte “internals” solo para tests si los usas
export const __internals = {
  normalizeGfzMatrix,
  normalizeFlexible,
  setLocalFallbackData,
  resetLocalFallbackData,
};
