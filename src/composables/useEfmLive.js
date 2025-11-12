/*
  Composable Vue 3 para obtener datos en vivo del campo eléctrico E_z
  desde una API REST y refrescarlos periódicamente.

  Cambios clave:
  - Soporta opts.since (string tipo '10m') además de opts.range.
    Si llega since, usamos range = `since:${since}`.
  - Mantiene compatibilidad con 'today' | '1h' | '6h' | '24h' | 'since:10m'
*/

import { ref, onMounted, onBeforeUnmount, watch } from 'vue';

// convierte ms → "Xs|Xm|Xh|Xd" (lo que entiende tu API)
function msToInfluxSince(ms) {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s % 86400 === 0) return `${s / 86400}d`;
  if (s % 3600 === 0)  return `${s / 3600}h`;
  if (s % 60 === 0)    return `${s / 60}m`;
  return `${s}s`;
}

export function useEfmLive(opts = {}) {
  const baseUrl   = opts.baseUrl ?? import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
  const station   = ref(opts.station ?? '*');

  // Si viene since, priorizamos "since:<dur>" como range; si no, usamos range directo o 'today'
  const initialRange =
    opts.since ? `since:${opts.since}` :
    (opts.range ?? 'today');

  const range     = ref(initialRange);           // 'today' | '1h' | '6h' | '24h' | 'since:10m'
  const every     = ref(opts.every ?? '5s');     // agregación backend
  const refreshMs = ref(opts.refreshMs ?? 5000); // 5s por defecto

  const points = ref([]);
  const error  = ref(null);
  let timer;

  function computeSinceForRange(rng) {
    // rng puede ser 'since:10m', 'today', '1h', '6h', '24h'
    if (typeof rng === 'string' && rng.startsWith('since:')) {
      return rng.slice('since:'.length); // → '10m'
    }
    if (rng === 'today') {
      const now = new Date();
      const start = new Date(now);
      start.setHours(0, 0, 0, 0); // medianoche local
      return msToInfluxSince(now.getTime() - start.getTime());
    }
    // '1h','6h','24h' ya lo entiende tu backend tal cual
    return rng;
  }

  async function fetchNow() {
    try {
      const url = new URL('/api/efm/live', baseUrl);
      url.searchParams.set('station', station.value || '*');
      url.searchParams.set('since', computeSinceForRange(range.value));
      url.searchParams.set('every', every.value);

      const res = await fetch(url.toString(), { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('Respuesta no es array');
      points.value = data;
      error.value = null;
    } catch (e) {
      error.value = e?.message ?? String(e);
    }
  }

  function start() {
    stop();
    fetchNow();
    timer = window.setInterval(fetchNow, refreshMs.value);
  }
  function stop() {
    if (timer) clearInterval(timer), (timer = undefined);
  }

  onMounted(start);
  onBeforeUnmount(stop);

  // Si el usuario cambia rango / every / refreshMs / station, reiniciamos el polling
  watch([range, every, refreshMs, station], start);

  return {
    points, error,
    range, every, refreshMs, station,
    refresh: fetchNow
  };
}
