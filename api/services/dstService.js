// api/services/dstService.js
// Parser robusto y fetch con plantilla por mes para Dst (Kyoto/ISWA). ESM, Node >= 18.

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

// =========================
// Config y utilidades
// =========================
function parsePositiveInt(v, fb) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fb;
}
function parseBoolean(v, fb = true) {
  if (v == null) return fb;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(s)) return false;
  return fb;
}

function yymmFrom(date) {
  const yy = String(date.getUTCFullYear()).slice(-2);
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return { yy, mm };
}
function resolveTemplateUrl(tpl, date) {
  const { yy, mm } = yymmFrom(date);
  return tpl.replace('{yy}', yy).replace('{mm}', mm);
}

function getConfig() {
  const {
    DST_ENABLED = 'true',
    DST_PRIMARY_URL_TEMPLATE = '',
    DST_FALLBACK_URL = '',
    DST_CACHE_SEC = '300',
    DST_DEBUG = '0'
  } = process.env;

  return {
    enabled: parseBoolean(DST_ENABLED, true),
    tpl: DST_PRIMARY_URL_TEMPLATE.trim() || null,
    fallbackUrl: DST_FALLBACK_URL.trim() || null,
    cacheTtlMs: parsePositiveInt(DST_CACHE_SEC, 300) * 1000,
    debug: parseBoolean(DST_DEBUG, false)
  };
}

function toIso(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function toIsoUtc(y, m1_12, d, h = 0) {
  const dt = new Date(Date.UTC(y, m1_12 - 1, d, h, 0, 0));
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}
function requestWithTimeout(url, opts = {}, ms = 30_000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  return fetch(url, { ...opts, signal: ac.signal }).finally(() => clearTimeout(t));
}
async function withRetry(fn, attempts = 2, delayBaseMs = 500) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, delayBaseMs * (i + 1)));
      }
    }
  }
  throw last;
}

// =========================
// Normalización de HTML/texto
// =========================
function extractPre(html) {
  const m = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  return m ? m[1] : null;
}
function stripHtml(html) {
  return html
    .replace(/<\/(p|div|br|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\r?\n/g, '\n');
}

function inferYearMonthFromText(sample) {
  // Busca "YYYY MM"
  let m = sample.match(/\b((?:19|20)\d{2})\s+([01]?\d)\b/);
  if (m) {
    const Y = +m[1];
    const M = +m[2];
    if (M >= 1 && M <= 12) return { Y, M };
  }
  // Variante con nombre de mes
  const names = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';
  m = sample.match(new RegExp(`\\b((?:19|20)\\d{2})\\b[\\s\\S]{0,40}\\b(${names})\\b`, 'i'));
  if (m) {
    const map = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
    const Y = +m[1];
    const M = map[m[2].toLowerCase()];
    if (M) return { Y, M };
  }
  const now = new Date();
  return { Y: now.getUTCFullYear(), M: now.getUTCMonth() + 1 };
}

function normalizeAndSplitLines(txt) {
  return txt
    .replace(/[;\t]+/g, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/\r?\n/g, '\n')
    .split('\n');
}

// pega números tipo " -10-20"
function deglueSigns(s) {
  return s.replace(/(?<=\d)[+-]/g, (m) => ' ' + m);
}

// =========================
// Parser Kyoto/ISWA
// =========================
function parseKyotoDSTHeader(line) {
  // Acepta: "DST 2511*05 RRX 020 ..." o "DST2511*05RRX020 ..."
  let m = line.match(/^DST\s*(\d{2})(\d{2})\*(\d{2})\s*[A-Z]{3}\s*\d{3}\s+(.+)$/i);
  if (!m) {
    m = line.match(/^DST\s*(\d{2})(\d{2})\*(\d{2})\s*[A-Z0-9\s]{2,10}\s+(.+)$/i);
  }
  if (!m) return null;
  const yy = +m[1];
  const mm = +m[2];
  const dd = +m[3];
  const Y = yy >= 70 ? 1900 + yy : 2000 + yy;
  const M = mm;
  return { Y, M, D: dd, tail: m[4] };
}

function last24IntegersFromTail(s) {
  const all = (deglueSigns(s).match(/-?\d+/g) || []).map(Number);
  if (all.length >= 24) return all.slice(-24);
  return [];
}

function sanitizeDstSeries(series) {
  if (!Array.isArray(series) || !series.length) return [];

  const now = Date.now();
  const parsed = [];

  for (const raw of series) {
    if (!raw) continue;
    const iso = toIso(raw.time ?? raw.timestamp ?? raw.datetime ?? raw.date ?? raw.timeTag ?? raw.time_tag);
    const val = Number(raw.value ?? raw.dst ?? raw.Dst ?? raw.index);
    if (!iso || !Number.isFinite(val) || Math.abs(val) >= 9999) continue;
    const ts = Date.parse(iso);
    if (!Number.isFinite(ts) || ts > now) continue;
    parsed.push({ time: new Date(ts).toISOString(), value: val });
  }

  parsed.sort((a, b) => new Date(a.time) - new Date(b.time));

  const byDay = new Map();
  for (const entry of parsed) {
    const dayKey = entry.time.slice(0, 10);
    if (!byDay.has(dayKey)) byDay.set(dayKey, []);
    const bucket = byDay.get(dayKey);
    bucket.push(entry);
    if (bucket.length > 24) {
      bucket.shift();
    }
  }

  const limited = Array.from(byDay.values()).flat();
  limited.sort((a, b) => new Date(a.time) - new Date(b.time));

  const dedup = [];
  const seen = new Set();
  for (const entry of limited) {
    if (seen.has(entry.time)) continue;
    seen.add(entry.time);
    dedup.push({ ...entry });
  }

  return dedup;
}

function parseDstText(txt, debug = false) {
  const lines = normalizeAndSplitLines(txt);
  const out = [];
  let ctxYM = inferYearMonthFromText(txt);
  let lastDay = 0;
  let firstDSTLine = null;

  for (const raw of lines) {
    let line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#') || line.startsWith('//')) continue;

    // CSV "timestamp,value"
    if (line.includes(',') && !/\s,\s/.test(line)) {
      const [ts, vstr] = line.split(',');
      const iso = toIso(ts);
      const v = Number(vstr);
      if (iso && Number.isFinite(v) && Math.abs(v) < 9999) out.push({ time: iso, value: v });
      continue;
    }

    // Encabezado Kyoto tipo "DSTyymm*dd..."
    const head = parseKyotoDSTHeader(line);
    if (head) {
      if (!firstDSTLine) firstDSTLine = line;

      let tail = deglueSigns(head.tail)
        .replace(/[^0-9+\-\s].*$/, '') // corta basura no numérica fuerte al final
        .trim();

      // tokenización primaria
      let toks = tail.split(/\s+/).map(Number).filter(Number.isFinite);

      // horas (baseline + 24 + avg) → me quedo con las 24
      let hours;
      if (toks.length >= 26) hours = toks.slice(1, 25);
      else if (toks.length === 25) hours = toks.slice(0, 24);
      else if (toks.length >= 24) hours = toks.slice(0, 24);
      else {
        // plan C: tomar últimos 24 enteros visibles
        hours = last24IntegersFromTail(head.tail);
      }

      for (let h = 0; h < hours.length && h < 24; h++) {
        const v = hours[h];
        if (!Number.isFinite(v) || Math.abs(v) >= 9999) continue;
        const iso = toIsoUtc(head.Y, head.M, head.D, h);
        if (iso) out.push({ time: iso, value: v });
      }
      lastDay = head.D;
      continue;
    }

    // Fila por hora: "YYYY MM DD HH V"
    if (/^\d{4}\s+\d{1,2}\s+\d{1,2}\s+\d{1,2}\b/.test(line)) {
      const p = line.replace(/\s+/g, ' ').split(' ');
      if (p.length >= 5) {
        const Y = +p[0], M = +p[1], D = +p[2], H = +p[3], V = +p[4];
        if (M>=1 && M<=12 && D>=1 && D<=31 && H>=0 && H<=23 && Number.isFinite(V) && Math.abs(V)<9999) {
          const iso = toIsoUtc(Y, M, D, H); if (iso) out.push({ time: iso, value: V });
          continue;
        }
      }
    }

    // "YYYY MM DD" + 24 valores
    const parts = line.replace(/\s+/g, ' ').split(' ');
    const n = parts.length;

    if (n >= 27 && /^\d{4}$/.test(parts[0])) {
      const Y = +parts[0], M = +parts[1], D = +parts[2];
      if (M>=1 && M<=12 && D>=1 && D<=31) {
        for (let h = 0; h < 24; h++) {
          const V = Number(parts[3 + h]);
          if (!Number.isFinite(V) || Math.abs(V) >= 9999) continue;
          const iso = toIsoUtc(Y, M, D, h); if (iso) out.push({ time: iso, value: V });
        }
        lastDay = D; continue;
      }
    }

    // "DD" + 24 valores (sin año/mes)
    if (n >= 25 && /^\d{1,2}$/.test(parts[0])) {
      const D = +parts[0]; const { Y, M } = ctxYM;
      if (D>=1 && D<=31) {
        for (let h = 0; h < 24 && (1 + h) < n; h++) {
          const V = Number(parts[1 + h]);
          if (!Number.isFinite(V) || Math.abs(V) >= 9999) continue;
          const iso = toIsoUtc(Y, M, D, h); if (iso) out.push({ time: iso, value: V });
        }
        lastDay = D; continue;
      }
    }

    // Solo 24 valores → día secuencial dentro del mes inferido
    if (n === 24 && parts.every(p => /^-?\d+(\.\d+)?$/.test(p))) {
      const D = (lastDay > 0 ? lastDay + 1 : 1); const { Y, M } = ctxYM;
      for (let h = 0; h < 24; h++) {
        const V = Number(parts[h]); if (!Number.isFinite(V) || Math.abs(V) >= 9999) continue;
        const iso = toIsoUtc(Y, M, D, h); if (iso) out.push({ time: iso, value: V });
      }
      lastDay = D; continue;
    }

    // Cabecera "YYYY MM" para el mes en curso
    if (n >= 2 && /^\d{4}$/.test(parts[0]) && /^\d{1,2}$/.test(parts[1])) {
      const Y = +parts[0], M = +parts[1]; if (M>=1 && M<=12) ctxYM = { Y, M };
      continue;
    }
  }

  // Orden + dedupe
  out.sort((a, b) => new Date(a.time) - new Date(b.time));
  const seen = new Set(); const dedup = [];
  for (const p of out) {
    if (!seen.has(p.time)) { seen.add(p.time); dedup.push(p); }
  }

  if (debug && !dedup.length) {
    const first20 = lines.slice(0, 20).join('\n');
    console.warn('[Dst][DEBUG] primeras 20 líneas:\n' + first20);
  }
  return sanitizeDstSeries(dedup);
}

// =========================
// Fetch desde URL (auto JSON/HTML/TXT)
// =========================
async function fetchDstSeries(url, debug = false) {
  const r = await requestWithTimeout(
    url,
    { method: 'GET', headers: { 'User-Agent': 'LocalCINC/1.0 (+Dst)' } },
    30_000
  );
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const ctype = (r.headers.get('content-type') || '').toLowerCase();
  const body = await r.text();

  if (debug) {
    const matchDST = (body.match(/^DST.*$/gmi) || []).slice(0, 3).join('\n');
    if (matchDST) console.warn('[Dst][DEBUG] primeras líneas con "DST":\n' + matchDST);
  }

  // JSON
  if (ctype.includes('application/json') || body.trim().startsWith('[') || body.trim().startsWith('{')) {
    try {
      const json = JSON.parse(body);
      const arr = Array.isArray(json) ? json : (Array.isArray(json?.data) ? json.data : null);
      if (arr) {
        const out = [];
        for (const it of arr) {
          const iso = toIso(it.time ?? it.timestamp ?? it.datetime ?? it.date);
          const val = Number(it.value ?? it.dst ?? it.Dst ?? it.index);
          if (iso && Number.isFinite(val) && Math.abs(val) < 9999) out.push({ time: iso, value: val });
        }
        out.sort((a, b) => new Date(a.time) - new Date(b.time));
        if (!out.length) throw new Error('JSON sin puntos válidos');
        return out;
      }
    } catch {
      // caer a texto
    }
  }

  // HTML (página mensual de Kyoto)
  if (ctype.includes('text/html') || body.trim().startsWith('<')) {
    const pre = extractPre(body);
    const txt = pre ? pre : stripHtml(body);
    const series = parseDstText(txt, debug);
    if (!series.length) throw new Error('HTML sin puntos válidos');
    return series;
  }

  // Texto plano
  const series = parseDstText(body, debug);
  if (!series.length) throw new Error('TXT sin puntos válidos');
  return series;
}

// =========================
// Fallback local
// =========================
async function loadLocalFallback() {
  const base = path.resolve(process.cwd(), 'api', 'data');
  try {
    const p = path.join(base, 'dstFallback.txt');
    const txt = await fs.readFile(p, 'utf8');
    const s = parseDstText(txt, true);
    if (s.length) return s;
  } catch {}
  try {
    const p = path.join(base, 'dstFallback.json');
    const raw = await fs.readFile(p, 'utf8');
    const arr = JSON.parse(raw);
    const s = [];
    for (const it of Array.isArray(arr) ? arr : []) {
      const iso = toIso(it.time ?? it.timestamp ?? it.datetime ?? it.date);
      const v = Number(it.value ?? it.dst ?? it.Dst ?? it.index);
      if (iso && Number.isFinite(v) && Math.abs(v) < 9999) s.push({ time: iso, value: v });
    }
    s.sort((a, b) => new Date(a.time) - new Date(b.time));
    if (s.length) return s;
  } catch {}
  return [];
}

// =========================
/* Estado de caché */
// =========================
let cacheState = {
  updatedAt: null,
  expiry: 0,
  series: []
};
let refreshing = null;

function cloneSeries(series) {
  return series.map((p) => ({ ...p }));
}
export function getDstCache() {
  return { updatedAt: cacheState.updatedAt, series: cloneSeries(cacheState.series) };
}
export function isDstEnabled() {
  return getConfig().enabled;
}

// =========================
// Refresh / Get
// =========================
export async function refreshDst() {
  const { enabled, tpl, fallbackUrl, cacheTtlMs, debug } = getConfig();
  if (!enabled) return getDstCache();
  if (refreshing) return refreshing;

  const runPromise = (async () => {
    const now = new Date();
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

    const candidates = [];
    if (tpl) {
      candidates.push(resolveTemplateUrl(tpl, now));  // mes actual
      candidates.push(resolveTemplateUrl(tpl, prev)); // mes anterior
    }
    if (fallbackUrl) candidates.push(fallbackUrl);     // HTML mensual u otro

    let lastErr;
    for (const url of candidates) {
      try {
        const rawSeries = await withRetry(() => fetchDstSeries(url, debug), 2);
        const series = sanitizeDstSeries(rawSeries);
        cacheState = {
          updatedAt: new Date().toISOString(),
          expiry: Date.now() + cacheTtlMs,
          series
        };
        console.info(`[Dst] cache actualizado (${series.length} puntos) desde ${url}`);
        return getDstCache();
      } catch (e) {
        lastErr = e;
        console.warn('[Dst] intento fallido:', url, '-', e.message);
      }
    }

    const local = sanitizeDstSeries(await loadLocalFallback());
    if (local.length) {
      cacheState = {
        updatedAt: new Date().toISOString(),
        expiry: Date.now() + cacheTtlMs,
        series: local
      };
      console.info(`[Dst] cache inicializado con fallback local (${local.length} puntos)`);
      return getDstCache();
    }

    throw new Error(lastErr?.message || 'No se pudieron obtener puntos Dst válidos.');
  })()
    .finally(() => {
      if (refreshing === runPromise) {
        refreshing = null;
      }
    });

  refreshing = runPromise;

  return runPromise;
}

export async function getDstRealtime() {
  const { enabled } = getConfig();
  if (!enabled) return getDstCache();
  const now = Date.now();
  if (cacheState.series.length && cacheState.expiry > now) return getDstCache();
  await refreshDst();
  return getDstCache();
}

export async function getDstRealtimeLatest() {
  const cache = await getDstRealtime();
  const series = Array.isArray(cache.series) ? cache.series : [];
  if (!series.length) return null;
  const latest = series[series.length - 1];
  if (!latest || latest.time == null || latest.value == null) return null;
  return { time: latest.time, value: latest.value };
}

const AUTO_REFRESH_MS = 60_000;

if (AUTO_REFRESH_MS > 0) {
  const timer = setInterval(() => {
    if (!isDstEnabled()) return;
    refreshDst().catch((err) => {
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[Dst] auto-refresh error:', err?.message || err);
      }
    });
  }, AUTO_REFRESH_MS);
  if (typeof timer.unref === 'function') timer.unref();
}
