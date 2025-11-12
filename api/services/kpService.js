/* eslint-env node */
// Kp service (GFZ primario, NOAA fallback) SIN promedios.
// Solo conserva muestras exactas a 3 h (UTC) en 00,03,06,... y descarta el resto.

import 'dotenv/config';
import process from 'node:process';
import fs from 'node:fs/promises';

// ---------- Helpers ----------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const FETCH_TIMEOUT_MS = 25_000;

async function fetchWithTimeout(url, opts = {}) {
  const { signal, timeout = FETCH_TIMEOUT_MS, ...rest } = opts;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error('timeout')), timeout);
  try {
    const res = await fetch(url, {
      ...rest,
      signal: signal ?? ctrl.signal,
      headers: { 'accept': '*/*', ...(rest.headers || {}) }
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function dedupeKeepLast(list, by='ts') {
  const m = new Map();
  for (const it of list) m.set(it[by], it);
  return [...m.values()].sort((a,b)=>a.ts.localeCompare(b.ts));
}

// ---------- Normalización SIN promedio ----------
// Quedarse SOLO con marcas exactas cada 3h (UTC) y normalizar a :00:00Z.
// Si viene algo a 1h u horas “desalineadas”, se ignora.
// Si hay más de un punto en la misma marca de 3h, se deja el último.
function normalizeTo3h(points) {
  if (!Array.isArray(points) || points.length === 0) return [];
  const kept = [];
  for (const p of points) {
    const d = new Date(p.ts);
    if (Number.isNaN(+d)) continue;
    const h = d.getUTCHours();
    const m = d.getUTCMinutes();
    const s = d.getUTCSeconds();
    // Solo horas múltiplo de 3 y sin minutos/segundos
    if (h % 3 !== 0 || m !== 0 || s !== 0) continue;
    const ts = new Date(Date.UTC(
      d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, 0, 0
    )).toISOString().replace('.000Z', 'Z');
    const v = Number(p.kp);
    if (Number.isFinite(v)) kept.push({ ts, kp: v, source: p.source || 'norm' });
  }
  return dedupeKeepLast(kept);
}

// ---------- Proveedores ----------
// NOAA SWPC (Kp planetario 3h)
async function fetchNoaa3h() {
  const url = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json';
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`NOAA HTTP ${res.status}`);
  const json = await res.json();
  // formato: [ ["time_tag","kp_index"], ["2025-01-01 00:00:00","3.33"], ... ]
  const rows = Array.isArray(json) ? json.slice(1) : [];
  const pts = [];
  for (const r of rows) {
    const ts = (r[0] || '').replace(' ', 'T') + 'Z';
    const v = Number(r[1]);
    if (Number.isFinite(v)) pts.push({ ts, kp: v, source: 'NOAA' });
  }
  return dedupeKeepLast(pts);
}

// GFZ "User specified download" JSON (Kp)
async function fetchGfzRangeUTC(startISO, endISO) {
  const start = startISO.slice(0,10);
  const end = endISO.slice(0,10);
  const candidates = [
    `https://kp.gfz.de/data?format=json&index=Kp&start=${start}&end=${end}`,
    `https://kp.gfz.de/en/data?format=json&index=Kp&start=${start}&end=${end}`
  ];
  let lastErr;
  for (const url of candidates) {
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error(`GFZ HTTP ${res.status}`);
      const json = await res.json();
      // Esperado: { meta, datetime:[], Kp:[] }
      if (!json || !Array.isArray(json.datetime) || !Array.isArray(json.Kp)) {
        throw new Error('GFZ shape unexpected');
      }
      const pts = json.datetime
        .map((ts, i) => ({ ts, kp: Number(json.Kp[i]), source: 'GFZ' }))
        .filter(p => Number.isFinite(p.kp));
      return dedupeKeepLast(pts);
    } catch (e) {
      lastErr = e;
      await sleep(200);
    }
  }
  throw lastErr ?? new Error('GFZ unreachable');
}

// ---------- Cache & API ----------
const state = {
  points: [],
  lastUpdated: 0,
  provider: 'none'
};

function cutoffDays(days) {
  const ms = Math.max(1, Number(days) || 3) * 24*3600*1000;
  return Date.now() - ms;
}

function filterSince(points, sinceMs) {
  return points.filter(p => (new Date(p.ts)).getTime() >= sinceMs);
}

export async function refreshNow() {
  const end = new Date();
  const start = new Date(end.getTime() - 7*24*3600*1000); // último 7 días

  // GFZ primero
  try {
    const gfz = await fetchGfzRangeUTC(start.toISOString(), end.toISOString());
    const pts = normalizeTo3h(gfz); // sin promedios
    state.points = pts;
    state.lastUpdated = Date.now();
    state.provider = 'GFZ';
    console.log(`[Kp] Actualizado desde GFZ con ${pts.length} puntos.`);
    return;
  } catch (e) {
    console.warn('[Kp] GFZ falló:', e.message);
  }

  // NOAA fallback
  try {
    const noaa = await fetchNoaa3h();
    const pts = normalizeTo3h(noaa); // por si viniera algo desalineado
    state.points = pts;
    state.lastUpdated = Date.now();
    state.provider = 'NOAA';
    console.log(`[Kp] Actualizado desde NOAA con ${pts.length} puntos.`);
    return;
  } catch (e) {
    console.warn('[Kp] NOAA fallback falló:', e.message);
  }

  // Fallback local opcional: ../data/kp.json
  try {
    const raw = await fs.readFile(new URL('../data/kp.json', import.meta.url), 'utf8');
    const j = JSON.parse(raw);
    const ptsRaw = (j.datetime||[]).map((ts,i)=>({ ts, kp: Number(j.Kp[i]), source: 'LOCAL' }))
      .filter(p=>Number.isFinite(p.kp));
    state.points = normalizeTo3h(ptsRaw);
    state.provider = 'LOCAL';
    state.lastUpdated = Date.now();
    console.log(`[Kp] Actualizado desde archivo local con ${state.points.length} puntos.`);
  } catch {
    console.error('[Kp] Sin proveedores disponibles ni fallback local.');
  }
}

let cronHandle = null;
export async function startCron() {
  const { default: Cron } = await import('node-cron');
  cronHandle = Cron.schedule('*/15 * * * *', () => refreshNow().catch(()=>{}));
}

export function mountKpApi(app, basePath = '/api/kp') {
  app.get(basePath, async (req, res) => {
    try {
      const days = clamp(Number(req.query.days ?? 3), 1, 30);
      const since = cutoffDays(days);
      if ((Date.now() - state.lastUpdated) > 10*60*1000 || state.points.length === 0) {
        await refreshNow();
      }
      const pts = filterSince(state.points, since);
      res.json({
        meta: {
          provider: state.provider,
          lastUpdated: new Date(state.lastUpdated).toISOString(),
          cadence: '3h'
        },
        points: pts
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}
