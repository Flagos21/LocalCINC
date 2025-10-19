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

/** Repara JSON de arreglo si llega truncado. */
function tryRepairJsonArrayText(txt) {
  txt = (txt || '').replace(/^\uFEFF/, '').trim();
  if (!txt.length) throw new Error('respuesta vacía');

  // si ya parsea, devuélvelo tal cual
  try {
    return JSON.parse(txt);
  } catch (e) { /* continúa a reparar */ }

  const start = txt.indexOf('[');
  if (start === -1) throw new Error('no-array');

  let body = txt.slice(start + 1);
  const lastObjEnd = body.lastIndexOf('}');
  if (lastObjEnd === -1) throw new Error('sin-objetos-validos');

  body = body.slice(0, lastObjEnd + 1);
  body = body.replace(/,\s*$/m, '');
  const repaired = '[' + body + ']';
  return JSON.parse(repaired);
}

/** fetch con timeout simple */
async function fetchWithTimeout(url, { signal, timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  const link = [];
  if (signal) {
    const onAbort = () => controller.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    link.push(() => signal.removeEventListener('abort', onAbort));
  }

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      mode: 'cors',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      credentials: 'omit',
      headers: { accept: 'application/json,text/plain;q=0.9,*/*;q=0.8' }
    });
    clearTimeout(t);
    link.forEach(fn => fn());
    return res;
  } catch (e) {
    clearTimeout(t);
    link.forEach(fn => fn());
    throw e;
  }
}

/** Descarga + parseo con reintentos */
async function fetchJsonResilient(url, { retries = 2, externalSignal } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const bust = (url.includes('?') ? '&' : '?') + 't=' + Date.now();
    const fullUrl = url + bust;
    try {
      const res = await fetchWithTimeout(fullUrl, { signal: externalSignal, timeoutMs: 25000 });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const txt = await res.text();
      try {
        return tryRepairJsonArrayText(txt);
      } catch (e) {
        lastErr = new Error(`JSON inválido: ${e && e.message ? e.message : e}`);
        if (attempt < retries) { await wait(300 * (attempt + 1)); continue; }
        throw lastErr;
      }
    } catch (err) {
      if (err && (err.name === 'AbortError' || err.message === 'Aborted')) {
        const e = new Error('Aborted');
        e.name = 'AbortError';
        throw e;
      }
      lastErr = err;
      if (attempt < retries) { await wait(400 * (attempt + 1)); continue; }
      throw lastErr || err || new Error('fetch error');
    }
  }
  throw lastErr || new Error('unknown');
}

/** Convierte filas en [ts, flux] por energía */
function parseSeries(rows, energy) {
  return rows
    .filter(r => r.energy === energy)
    .map(r => [Date.parse(r.time_tag), Number(r.flux)])
    .filter(([ts, fx]) => Number.isFinite(ts) && Number.isFinite(fx))
    .sort((a, b) => a[0] - b[0]);
}

export function useGoesXrays(options) {
  // tu Home pasa '6h' (string). Aquí lo envolvemos en ref.
  const range = ref((options && options.range) || '6h');
  const pollMs = ref((options && options.pollMs) || 60000);
  const autoRefresh = ref((options && options.auto) !== false);

  const isLoading = ref(false);
  const errorMessage = ref(null);

  const longSeries = ref([]);  // 0.1–0.8 nm (XRS-B)
  const shortSeries = ref([]); // 0.05–0.4 nm (XRS-A)
  const lastPointTime = ref(null);

  let timer = null;
  let aborter = null;
  let refreshLock = false;

  async function fetchOnce() {
    // ⬇⬇⬇ FIX: no bloqueamos por refreshLock aquí
    if (isLoading.value) return;

    isLoading.value = true;
    errorMessage.value = null;

    if (aborter) aborter.abort();
    aborter = new AbortController();

    const file = RANGE_TO_FILE[range.value] || RANGE_TO_FILE['6h'];
    const urls = [`${BASE_PRIMARY}${file}`, `${BASE_SECONDARY}${file}`];

    for (const url of urls) {
      try {
        const data = await fetchJsonResilient(url, { externalSignal: aborter.signal, retries: 2 });

        const ls = parseSeries(data, '0.1-0.8nm');
        const ss = parseSeries(data, '0.05-0.4nm');

        if ((ls.length + ss.length) === 0) throw new Error('respuesta vacía');

        longSeries.value = ls;
        shortSeries.value = ss;

        const lastTs = Math.max(
          ls.length ? ls[ls.length - 1][0] : 0,
          ss.length ? ss[ss.length - 1][0] : 0
        );
        lastPointTime.value = Number.isFinite(lastTs) && lastTs > 0 ? new Date(lastTs) : null;

        isLoading.value = false;
        return; // éxito
      } catch (err) {
        if (err && err.name === 'AbortError') { isLoading.value = false; return; }
        errorMessage.value = `No se pudo obtener datos (${url}): ${err && err.message ? err.message : err}`;
        // intenta siguiente URL (secondary)
      }
    }

    isLoading.value = false;
  }

  function start() {
    if (timer !== null) return;
    timer = window.setInterval(() => {
      if (!autoRefresh.value) return;
      if (!isLoading.value) fetchOnce();
    }, pollMs.value);
  }

  function stop() {
    if (timer !== null) { clearInterval(timer); timer = null; }
  }

  function toggleAuto() {
    autoRefresh.value = !autoRefresh.value;
  }

  async function refresh() {
    if (refreshLock) return;
    refreshLock = true;
    try { await fetchOnce(); }
    finally { setTimeout(() => { refreshLock = false; }, 150); }
  }

  onMounted(() => { fetchOnce(); start(); });
  onBeforeUnmount(() => { stop(); if (aborter) aborter.abort(); });

  // cuando cambia el rango del <select v-model="xrRange">
  watch(range, () => { errorMessage.value = null; refresh(); });

  // si cambia el intervalo de polling:
  watch(pollMs, () => { stop(); start(); });

  const hasData = computed(() => (longSeries.value.length + shortSeries.value.length) > 0);

  return {
    isLoading, errorMessage, hasData,
    longSeries, shortSeries, lastPointTime,
    autoRefresh, toggleAuto,
    range,            // ← tu Home lo usa como xrRange (v-model)
    pollMs,
    refresh,
  };
}
