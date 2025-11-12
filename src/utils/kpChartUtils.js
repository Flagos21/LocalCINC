export const KP_GREEN_THRESHOLD = 4;
export const KP_YELLOW_THRESHOLD = 6;

export function colorForKp(value) {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) {
    return '#64748b';
  }
  if (numeric < KP_GREEN_THRESHOLD) {
    return '#22c55e';
  }
  if (numeric < KP_YELLOW_THRESHOLD) {
    return '#facc15';
  }
  return '#ef4444';
}

export function normalizeKpSeries(series) {
  if (!Array.isArray(series)) {
    return [];
  }
  const parsed = [];
  for (const item of series) {
    if (!item) continue;
    const time = item.time ?? item.timestamp ?? item.t;
    const parsedTime = time ? new Date(time) : null;
    const iso = parsedTime && !Number.isNaN(parsedTime.getTime())
      ? parsedTime.toISOString()
      : null;
    const value = Number.parseFloat(item.value ?? item.v ?? item.kp ?? item.y);
    const status = (item.status ?? item.flag ?? 'now').toString().toLowerCase().startsWith('def') ? 'def' : 'now';
    if (!iso || !Number.isFinite(value)) {
      continue;
    }
    parsed.push({ time: iso, value, status });
  }
  parsed.sort((a, b) => new Date(a.time) - new Date(b.time));

  const deduped = [];
  let last = null;
  for (const point of parsed) {
    if (point.time === last) {
      deduped[deduped.length - 1] = point;
    } else {
      deduped.push(point);
      last = point.time;
    }
  }
  return deduped;
}

export function buildKpDataset(series) {
  const normalized = normalizeKpSeries(series);
  return {
    label: 'Índice Kp',
    data: normalized.map((point) => ({
      x: point.time,
      y: point.value,
      status: point.status
    })),
    backgroundColor: normalized.map((point) => colorForKp(point.value))
  };
}

export function mergeKpSeries(existing, incoming) {
  const merged = normalizeKpSeries([...(existing || []), ...(incoming || [])]);
  return merged;
}

export function formatUpdatedAt(value) {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date?.getTime?.())) {
    return '—';
  }
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date) + ' UTC';
}
