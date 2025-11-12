const MINUTE = 60 * 1000;

function normalizeNumber(value) {
  const num = Number.parseInt(value, 10);
  if (!Number.isFinite(num)) {
    throw new Error(`Valor de cron inválido: ${value}`);
  }
  return num;
}

function createRangeMatcher(start, end, step = 1) {
  return (value) => value >= start && value <= end && ((value - start) % step === 0);
}

function parseSegment(segment, min, max, { allowWrapSunday = false } = {}) {
  if (!segment || segment === '*') {
    return () => true;
  }

  const [basePart, stepPart] = segment.split('/');
  let step = 1;
  if (stepPart) {
    step = normalizeNumber(stepPart);
    if (step <= 0) {
      throw new Error(`Paso inválido en cron: ${segment}`);
    }
  }

  if (!basePart || basePart === '*') {
    return (value) => ((value - min) % step === 0);
  }

  if (basePart.includes('-')) {
    const [startRaw, endRaw] = basePart.split('-');
    let start = normalizeNumber(startRaw);
    let end = normalizeNumber(endRaw);

    if (allowWrapSunday) {
      if (start === 7) start = 0;
      if (end === 7) end = 0;
    }

    if (start < min || start > max || end < min || end > max || (start !== end && start > end)) {
      throw new Error(`Rango inválido en cron: ${segment}`);
    }

    return createRangeMatcher(start, end, step);
  }

  const valueRaw = normalizeNumber(basePart);
  const value = allowWrapSunday && valueRaw === 7 ? 0 : valueRaw;
  if (value < min || value > max) {
    throw new Error(`Valor fuera de rango en cron: ${segment}`);
  }

  if (step > 1) {
    return (candidate) => candidate >= value && ((candidate - value) % step === 0);
  }

  return (candidate) => candidate === value;
}

function parseField(field, min, max, options = {}) {
  const trimmed = field.trim();
  if (trimmed === '*' || trimmed === '?') {
    return () => true;
  }

  const segments = trimmed.split(',').map((part) => part.trim()).filter(Boolean);
  if (!segments.length) {
    throw new Error(`Campo de cron vacío: ${field}`);
  }

  const matchers = segments.map((segment) => parseSegment(segment, min, max, options));
  return (value) => matchers.some((fn) => fn(value));
}

function parseExpression(expression) {
  if (typeof expression !== 'string') {
    throw new Error('La expresión de cron debe ser un string.');
  }

  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Expresión de cron inválida: ${expression}`);
  }

  return {
    matchMinute: parseField(parts[0], 0, 59),
    matchHour: parseField(parts[1], 0, 23),
    matchDay: parseField(parts[2], 1, 31),
    matchMonth: parseField(parts[3], 1, 12),
    matchWeekDay: parseField(parts[4], 0, 6, { allowWrapSunday: true })
  };
}

function shouldRun(matchers, date) {
  const minute = date.getMinutes();
  const hour = date.getHours();
  const day = date.getDate();
  const month = date.getMonth() + 1;
  let weekDay = date.getDay();
  if (weekDay === 7) weekDay = 0;
  return (
    matchers.matchMinute(minute) &&
    matchers.matchHour(hour) &&
    matchers.matchDay(day) &&
    matchers.matchMonth(month) &&
    matchers.matchWeekDay(weekDay)
  );
}

function getDelayToNextMinute(now = new Date()) {
  const ms = now.getMilliseconds();
  const sec = now.getSeconds();
  const remaining = MINUTE - (sec * 1000 + ms);
  return remaining <= 0 ? MINUTE : remaining;
}

export function schedule(expression, task) {
  if (typeof task !== 'function') {
    throw new Error('El callback del cron debe ser una función.');
  }

  const matchers = parseExpression(expression);

  let stopped = false;
  let timeoutId = null;

  const tick = () => {
    if (stopped) {
      return;
    }

    timeoutId = null;
    const now = new Date();
    if (shouldRun(matchers, now)) {
      Promise.resolve().then(() => {
        try {
          task();
        } catch (err) {
          setTimeout(() => { throw err; }, 0);
        }
      });
    }

    planNext();
  };

  const planNext = () => {
    if (stopped) {
      return;
    }
    const delay = getDelayToNextMinute();
    timeoutId = setTimeout(tick, delay);
  };

  planNext();

  return {
    start() {
      if (!stopped) {
        return this;
      }
      stopped = false;
      if (timeoutId === null) {
        planNext();
      }
      return this;
    },
    stop() {
      stopped = true;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      return this;
    }
  };
}

export default {
  schedule
};
