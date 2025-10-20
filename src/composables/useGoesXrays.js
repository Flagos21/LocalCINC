// src/composables/useGoesXrays.js
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';

const RANGE_TO_FILE = {
  '6h': 'xrays-6-hour.json',
  '1d': 'xrays-1-day.json',
  '3d': 'xrays-3-day.json',
  '7d': 'xrays-7-day.json',
};

const BASE_PRIMARY   = 'https://services.swpc.noaa.gov/json/goes/primary/';
const BASE_SECONDARY = 'https://services.swpc.noaa.gov/json/goes/secondary/';

const wait = (ms) => new Promise(r => setTimeout(r, ms));

function tryRepairJsonArrayText(txt) {
  txt = (txt || '').replace(/^\uFEFF/, '').trim();
  if (!txt.length) throw new Error('respuesta vacía');
  try { return JSON.parse(txt); } catch { /* reparar */ }
  const start = txt.indexOf('[');
  if (start === -1) throw new Error('no-array');
  let body = txt.slice(start + 1);
  const lastObjEnd = body.lastIndexOf('}');
  if (lastObjEnd === -1) throw new Error('sin-objetos-validos');
  body = body.slice(0, lastObjEnd + 1).replace(/,\s*$/m, '');
  return JSON.parse('[' + body + ']');
}

async function fetchWithTimeout(url, { signal, timeoutMs = 25000 } = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const links = [];
  if (signal) {
    const onAbort = () => controller.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    links.push(() => signal.removeEventListener('abort', onAbort));
  }
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      mode: 'cors',
      cache: 'no-store',
      credentials: 'omit',
      headers: { accept: 'application/json,text/plain;q=0.9,*/*;q=0.8' }
    });
    clearTimeout(t);
    links.forEach(fn => fn());
    return res;
  } catch (e) {
    clearTimeout(t);
    links.forEach(fn => fn());
    throw e;
  }
}

async function fetchJsonResilient(url, { retries = 2, externalSignal } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const bust = (url.includes('?') ? '&' : '?') + 't=' + Date.now();
    try {
      const res = await fetchWithTimeout(url + bust, { signal: externalSignal, timeoutMs: 25000 });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const txt = await res.text();
      return tryRepairJsonArrayText(txt);
    } catch (err) {
      if (err && (err.name === 'AbortError' || err.message === 'Aborted')) {
        const e = new Error('Aborted'); e.name = 'AbortError'; throw e;
      }
      lastErr = err;
      if (attempt < retries) { await wait(400 * (attempt + 1)); continue; }
      throw lastErr || err || new Error('fetch error');
    }
  }
  throw lastErr || new Error('unknown');
}

/* ------------------ helpers de parseo ------------------ */
const ENERGY_LONG  = '0.1-0.8nm';
const ENERGY_SHORT = '0.05-0.4nm';

function satKeyOf(row) {
  // SWPC suele usar "satellite": 18/19. Cubrimos alternativas por si cambian nombres.
  const s = row.satellite ?? row.satellite_number ?? row.sat ?? row.sc ?? row.spacecraft;
  return String(s);
}

function toPairs(rows) {
  return rows
    .map(r => [Date.parse(r.time_tag), Number(r.flux)])
    .filter(([ts, v]) => Number.isFinite(ts) && Number.isFinite(v))
    .sort((a, b) => a[0] - b[0]);
}

function groupBySatAndEnergy(rows) {
  /** Estructura:
   * longBySat:  { '18': [[ts, flux], ...], '19': [...] }
   * shortBySat: { '18': [[ts, flux], ...], '19': [...] }
   */
  const longBySat = {};
  const shortBySat = {};
  const satsSet = new Set();

  for (const r of rows) {
    const sat = satKeyOf(r);
    if (!sat || !r.energy) continue;
    satsSet.add(sat);
    if (r.energy === ENERGY_LONG) {
      (longBySat[sat] ??= []).push(r);
    } else if (r.energy === ENERGY_SHORT) {
      (shortBySat[sat] ??= []).push(r);
    }
  }

  // Convertimos cada grupo a pares [ts, flux] y de-duplicamos por ts
  const dedup = (arr) => {
    const pairs = toPairs(arr || []);
    const out = [];
    let lastTs = -1;
    for (const [ts, v] of pairs) {
      if (ts === lastTs) {
        out[out.length - 1][1] = v; // nos quedamos con el último
      } else {
        out.push([ts, v]);
        lastTs = ts;
      }
    }
    return out;
  };

  for (const s of satsSet) {
    longBySat[s]  = dedup(longBySat[s]);
    shortBySat[s] = dedup(shortBySat[s]);
  }

  return { longBySat, shortBySat, sats: Array.from(satsSet).sort() };
}

/* ------------------ composable ------------------ */
export function useGoesXrays(options) {
  const range = ref((options && options.range) || '6h');
  const pollMs = ref((options && options.pollMs) || 60000);
  const autoRefresh = ref((options && options.auto) !== false);

  const isLoading = ref(false);
  const errorMessage = ref(null);

  // NUEVO: por satélite
  const longBySat = ref({});   // { '18': [[ts, flux], ...], '19': [...] }
  const shortBySat = ref({});  // { '18': [[ts, flux], ...], '19': [...] }
  const sats = ref([]);        // ['18','19', ...]
  const lastPointTime = ref(null);

  let timer = null;
  let aborter = null;
  let refreshLock = false;

  async function fetchOnce() {
    if (isLoading.value) return;

    isLoading.value = true;
    errorMessage.value = null;

    if (aborter) aborter.abort();
    aborter = new AbortController();

    const file = RANGE_TO_FILE[range.value] || RANGE_TO_FILE['6h'];
    const urls = [
      `${BASE_PRIMARY}${file}`,
      `${BASE_SECONDARY}${file}`,
    ];

    try {
      // Traemos ambas fuentes y combinamos (algunas pueden fallar)
      const results = await Promise.allSettled(
        urls.map(u => fetchJsonResilient(u, { externalSignal: aborter.signal, retries: 2 }))
      );

      const rows = results
        .filter(r => r.status === 'fulfilled' && Array.isArray(r.value))
        .flatMap(r => r.value);

      if (!rows.length) throw new Error('No se pudo obtener datos desde primary/secondary');

      const grouped = groupBySatAndEnergy(rows);

      longBySat.value  = grouped.longBySat;
      shortBySat.value = grouped.shortBySat;
      sats.value       = grouped.sats;

      // último timestamp global
      let lastTs = 0;
      for (const s of sats.value) {
        const la = longBySat.value[s]; const sa = shortBySat.value[s];
        if (la && la.length) lastTs = Math.max(lastTs, la[la.length - 1][0]);
        if (sa && sa.length) lastTs = Math.max(lastTs, sa[sa.length - 1][0]);
      }
      lastPointTime.value = Number.isFinite(lastTs) && lastTs > 0 ? new Date(lastTs) : null;

    } catch (err) {
      if (err && err.name === 'AbortError') { isLoading.value = false; return; }
      errorMessage.value = err && err.message ? err.message : String(err);
    } finally {
      isLoading.value = false;
    }
  }

  function start() {
    if (timer !== null) return;
    timer = window.setInterval(() => {
      if (!autoRefresh.value) return;
      if (!isLoading.value) fetchOnce();
    }, pollMs.value);
  }
  function stop() { if (timer !== null) { clearInterval(timer); timer = null; } }
  function toggleAuto() { autoRefresh.value = !autoRefresh.value; }
  async function refresh() {
    if (refreshLock) return;
    refreshLock = true;
    try { await fetchOnce(); } finally { setTimeout(() => { refreshLock = false; }, 150); }
  }

  onMounted(() => { fetchOnce(); start(); });
  onBeforeUnmount(() => { stop(); if (aborter) aborter.abort(); });

  watch(range, () => { errorMessage.value = null; refresh(); });
  watch(pollMs, () => { stop(); start(); });

  const hasData = computed(() => sats.value.length > 0);

  return {
    // estado
    isLoading, errorMessage, hasData,
    // NUEVO por satélite
    longBySat, shortBySat, sats,
    // controles
    lastPointTime, autoRefresh, toggleAuto,
    range, pollMs, refresh,
  };
}
