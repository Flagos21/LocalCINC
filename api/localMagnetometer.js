/* eslint-env node */
import fs from 'fs/promises';
import path from 'path';

const MONTH_ABBREVIATIONS = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11
};

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const LOCAL_BUCKETS_MS = [
  MINUTE_MS,
  2 * MINUTE_MS,
  5 * MINUTE_MS,
  10 * MINUTE_MS,
  15 * MINUTE_MS,
  30 * MINUTE_MS,
  HOUR_MS,
  2 * HOUR_MS,
  3 * HOUR_MS,
  6 * HOUR_MS,
  12 * HOUR_MS,
  DAY_MS,
  2 * DAY_MS,
  7 * DAY_MS,
  14 * DAY_MS,
  30 * DAY_MS
];

const dataLinePattern = /^\s*\d{2}\s+\d{2}\s+\d{4}\s+\d{2}\s+\d{2}/;

export function parseDataMinFilename(filename, { root }) {
  const match = filename.match(/^([a-z]{3})(\d{2})([a-z]{3})\.(\d{2})m$/i);
  if (!match) {
    return null;
  }

  const [, stationRaw, dayStr, monthRaw, yearStr] = match;
  const station = stationRaw.toUpperCase();
  const monthIndex = MONTH_ABBREVIATIONS[monthRaw.toLowerCase()];

  if (monthIndex === undefined) {
    return null;
  }

  const day = Number.parseInt(dayStr, 10);
  const year = 2000 + Number.parseInt(yearStr, 10);

  if (!Number.isFinite(day) || !Number.isFinite(year)) {
    return null;
  }

  const timestamp = Date.UTC(year, monthIndex, day);
  const isoDate = new Date(timestamp).toISOString().slice(0, 10);

  return {
    station,
    day,
    monthIndex,
    year,
    isoDate,
    timestamp,
    filename,
    fullPath: path.join(root, filename)
  };
}

export async function listDataMinFiles({ root, station }) {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('m'))
      .map((entry) => parseDataMinFilename(entry.name, { root }))
      .filter((info) => info && (!station || info.station === station.toUpperCase()))
      .sort((a, b) => a.timestamp - b.timestamp);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function readDataMinFile(fileInfo) {
  try {
    const raw = await fs.readFile(fileInfo.fullPath, 'utf8');
    const lines = raw.split(/\r?\n/);

    const points = [];

    for (const line of lines) {
      if (!dataLinePattern.test(line)) {
        continue;
      }

      const parts = line.trim().split(/\s+/);

      if (parts.length < 7) {
        continue;
      }

      const [dayStr, monthStr, yearStr, hourStr, minuteStr, , hValueStr] = parts;

      const year = Number.parseInt(yearStr, 10);
      const month = Number.parseInt(monthStr, 10);
      const day = Number.parseInt(dayStr, 10);
      const hour = Number.parseInt(hourStr, 10);
      const minute = Number.parseInt(minuteStr, 10);
      const value = Number.parseFloat(hValueStr);

      if ([year, month, day, hour, minute].some((valuePart) => !Number.isFinite(valuePart))) {
        continue;
      }

      if (!Number.isFinite(value)) {
        continue;
      }

      const timestamp = Date.UTC(year, month - 1, day, hour, minute);
      points.push({
        t: new Date(timestamp).toISOString(),
        v: value
      });
    }

    if (!points.length) {
      return { points: [], start: null, end: null };
    }

    return {
      points,
      start: points[0].t,
      end: points[points.length - 1].t
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { points: [], start: null, end: null };
    }
    throw error;
  }
}

export function pickBucketSize({ rangeStartMs, rangeEndMs, totalPoints, targetPoints = 4000 }) {
  if (!Number.isFinite(rangeStartMs) || !Number.isFinite(rangeEndMs) || rangeEndMs <= rangeStartMs) {
    return MINUTE_MS;
  }

  if (!Number.isFinite(totalPoints) || totalPoints <= 0) {
    return MINUTE_MS;
  }

  const spanMs = rangeEndMs - rangeStartMs;
  const rawSpacing = Math.max(Math.floor(spanMs / targetPoints), MINUTE_MS);
  return LOCAL_BUCKETS_MS.find((bucket) => rawSpacing <= bucket) ?? LOCAL_BUCKETS_MS[LOCAL_BUCKETS_MS.length - 1];
}

export function aggregatePoints(points, bucketMs) {
  if (!Array.isArray(points) || points.length === 0) {
    return [];
  }

  const buckets = new Map();

  for (const point of points) {
    const time = new Date(point.t).getTime();
    const value = Number(point.v);

    if (!Number.isFinite(time) || !Number.isFinite(value)) {
      continue;
    }

    const bucketStart = Math.floor(time / bucketMs) * bucketMs;
    let entry = buckets.get(bucketStart);

    if (!entry) {
      entry = { sum: 0, count: 0, minTime: time, maxTime: time };
      buckets.set(bucketStart, entry);
    }

    entry.sum += value;
    entry.count += 1;
    if (time < entry.minTime) entry.minTime = time;
    if (time > entry.maxTime) entry.maxTime = time;
  }

  const aggregated = [];

  for (const [bucketStart, entry] of buckets.entries()) {
    if (!entry || entry.count <= 0) {
      continue;
    }

    const timestamp = new Date(entry.minTime ?? bucketStart).toISOString();
    const average = entry.sum / entry.count;

    if (!Number.isFinite(average)) {
      continue;
    }

    aggregated.push({ t: timestamp, v: average });
  }

  aggregated.sort((a, b) => new Date(a.t) - new Date(b.t));
  return aggregated;
}

function clampToUtcStart(date) {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function clampToUtcEnd(date) {
  const copy = new Date(date);
  copy.setUTCHours(23, 59, 59, 999);
  return copy;
}

export async function loadLocalSeries({
  root,
  station,
  rangeStart,
  rangeEnd,
  targetPoints = 4000
}) {
  const files = await listDataMinFiles({ root, station });

  if (!files.length) {
    return {
      points: [],
      files: [],
      availableRange: null
    };
  }

  const availableStart = clampToUtcStart(new Date(files[0].timestamp));
  const availableEnd = clampToUtcEnd(new Date(files[files.length - 1].timestamp));
  const availableRange = {
    start: availableStart.toISOString(),
    end: availableEnd.toISOString()
  };

  const toDate = (value) => {
    if (!value) {
      return null;
    }

    const date = value instanceof Date ? new Date(value) : new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  };

  const requestedStart = toDate(rangeStart);
  const requestedEnd = toDate(rangeEnd);
  const requestedSpanMs =
    requestedStart && requestedEnd
      ? Math.max(requestedEnd.getTime() - requestedStart.getTime(), MINUTE_MS)
      : null;

  const buildSeriesForWindow = async ({ startDate, endDate }) => {
    const startUtc = clampToUtcStart(startDate);
    const endUtc = clampToUtcEnd(endDate);

    if (endUtc.getTime() < startUtc.getTime()) {
      return {
        points: [],
        files: [],
        totalPoints: 0,
        downsampled: false,
        bucketMs: MINUTE_MS,
        start: startUtc,
        end: endUtc
      };
    }

    let start = startUtc;
    let end = endUtc;

    if (start.getTime() < availableStart.getTime()) {
      start = new Date(availableStart.getTime());
    }

    if (end.getTime() > availableEnd.getTime()) {
      end = new Date(availableEnd.getTime());
    }

    if (end.getTime() < start.getTime()) {
      start = clampToUtcStart(end);
    }

    const selectedFiles = files.filter((file) => {
      const dayStart = clampToUtcStart(new Date(file.timestamp));
      const dayEnd = clampToUtcEnd(new Date(file.timestamp));
      return dayEnd.getTime() >= start.getTime() && dayStart.getTime() <= end.getTime();
    });

    if (!selectedFiles.length) {
      return {
        points: [],
        files: [],
        totalPoints: 0,
        downsampled: false,
        bucketMs: MINUTE_MS,
        start,
        end
      };
    }

    const combinedPoints = [];

    for (const file of selectedFiles) {
      const { points } = await readDataMinFile(file);

      for (const point of points) {
        const time = new Date(point.t).getTime();
        if (!Number.isFinite(time) || time < start.getTime() || time > end.getTime()) {
          continue;
        }
        combinedPoints.push(point);
      }
    }

    combinedPoints.sort((a, b) => new Date(a.t) - new Date(b.t));

    const totalPoints = combinedPoints.length;
    const bucketMs = pickBucketSize({
      rangeStartMs: start.getTime(),
      rangeEndMs: end.getTime(),
      totalPoints,
      targetPoints
    });

    let visiblePoints = combinedPoints;
    let downsampled = false;

    if (bucketMs > MINUTE_MS && totalPoints > targetPoints) {
      const aggregated = aggregatePoints(combinedPoints, bucketMs);
      if (aggregated.length) {
        visiblePoints = aggregated;
        downsampled = aggregated.length !== totalPoints;
      }
    }

    return {
      points: visiblePoints,
      files: selectedFiles.map((file) => ({ date: file.isoDate, filename: file.filename })),
      totalPoints,
      downsampled,
      bucketMs,
      start,
      end
    };
  };

  const initialStart = requestedStart ?? availableStart;
  const initialEnd = requestedEnd ?? availableEnd;

  let seriesWindow = await buildSeriesForWindow({ startDate: initialStart, endDate: initialEnd });

  if (!seriesWindow.points.length && requestedSpanMs !== null) {
    const fallbackEnd = new Date(availableEnd.getTime());
    const fallbackStartMs = Math.max(fallbackEnd.getTime() - requestedSpanMs, availableStart.getTime());
    const fallbackStart = new Date(fallbackStartMs);

    seriesWindow = await buildSeriesForWindow({ startDate: fallbackStart, endDate: fallbackEnd });
  }

  if (!seriesWindow.points.length) {
    return {
      points: [],
      files: [],
      availableRange
    };
  }

  return {
    points: seriesWindow.points,
    files: seriesWindow.files,
    totalPoints: seriesWindow.totalPoints,
    downsampled: seriesWindow.downsampled,
    bucketMs: seriesWindow.bucketMs,
    availableRange,
    requestedRange: {
      start: seriesWindow.start.toISOString(),
      end: seriesWindow.end.toISOString()
    }
  };
}

export const constants = {
  MINUTE_MS,
  HOUR_MS,
  DAY_MS,
  LOCAL_BUCKETS_MS
};
