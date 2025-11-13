export function toFluxDuration(ms) {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s % 86400 === 0) return `${s / 86400}d`;
  if (s % 3600 === 0) return `${s / 3600}h`;
  if (s % 60 === 0) return `${s / 60}m`;
  return `${s}s`;
}

export function autoEvery(startISO, stopISO, requestedEvery) {
  if (requestedEvery) return requestedEvery;
  const start = new Date(startISO);
  const stop = new Date(stopISO);
  const ms = stop - start;
  const targetPoints = 4000;
  const raw = Math.max(Math.floor(ms / targetPoints), 60_000); // >=1m
  const nice = [
    60e3,
    2 * 60e3,
    5 * 60e3,
    10 * 60e3,
    15 * 60e3,
    30 * 60e3,
    60 * 60e3,
    2 * 60 * 60e3,
    6 * 60 * 60e3,
    12 * 60 * 60e3,
    24 * 60 * 60e3
  ];
  const chosen = nice.find((n) => raw <= n) ?? 24 * 60 * 60e3;
  return toFluxDuration(chosen);
}

export default {
  toFluxDuration,
  autoEvery
};
