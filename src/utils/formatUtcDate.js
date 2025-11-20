export function formatUtcDateTime(value, { includeSeconds = true } = {}) {
  const ts = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value)

  if (!Number.isFinite(ts)) {
    return '—'
  }

  const options = {
    timeZone: 'UTC',
    hour12: false,
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }

  if (includeSeconds) {
    options.second = '2-digit'
  }

  const formatted = new Intl.DateTimeFormat('es-ES', options).format(new Date(ts))
  return `${formatted} UTC`
}
