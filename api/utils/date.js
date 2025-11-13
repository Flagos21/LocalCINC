export function parseDateQuery(value, { isEnd = false } = {}) {
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

export function toUtcStart(date) {
  const clone = new Date(date);
  clone.setUTCHours(0, 0, 0, 0);
  return clone;
}

export function toUtcEnd(date) {
  const clone = new Date(date);
  clone.setUTCHours(23, 59, 59, 999);
  return clone;
}

export default {
  parseDateQuery,
  toUtcStart,
  toUtcEnd
};
