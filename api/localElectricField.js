/* eslint-env node */
import fs from 'fs/promises'
import path from 'path'

import { aggregatePoints, pickBucketSize, constants } from './localMagnetometer.js'

const { MINUTE_MS } = constants
const DEFAULT_WINDOW_DAYS = 1

const EFM_FILENAME_PATTERN = /^cinc_efm-(\d{2})(\d{2})(\d{4})\.efm$/i

export function parseElectricFieldFilename(filename, { root }) {
  const match = filename.match(EFM_FILENAME_PATTERN)
  if (!match) {
    return null
  }

  const [, monthStr, dayStr, yearStr] = match
  const monthIndex = Number.parseInt(monthStr, 10) - 1
  const day = Number.parseInt(dayStr, 10)
  const year = Number.parseInt(yearStr, 10)

  if (!Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return null
  }

  if (!Number.isFinite(day) || day < 1 || day > 31) {
    return null
  }

  if (!Number.isFinite(year)) {
    return null
  }

  const timestamp = Date.UTC(year, monthIndex, day)
  const isoDate = new Date(timestamp).toISOString().slice(0, 10)

  return {
    filename,
    fullPath: path.join(root, filename),
    timestamp,
    isoDate,
    year,
    monthIndex,
    day,
  }
}

export async function listElectricFieldFiles({ root }) {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.efm'))
      .map((entry) => parseElectricFieldFilename(entry.name, { root }))
      .filter((info) => info)
      .sort((a, b) => a.timestamp - b.timestamp)
  } catch (error) {
    if (error.code === 'ENOENT') {
      return []
    }
    throw error
  }
}

export async function readElectricFieldFile(fileInfo, { station } = {}) {
  try {
    const raw = await fs.readFile(fileInfo.fullPath, 'utf8')
    const lines = raw.split(/\r?\n/)

    const stationFilter = station ? station.toString() : ''
    const normalizedFilter = stationFilter.trim()

    const points = []
    const stations = new Set()
    const matchedStations = new Set()

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        continue
      }

      const parts = trimmed.split(',')
      if (parts.length < 2) {
        continue
      }

      const timePart = parts[0]?.trim()
      const valuePart = parts[1]?.trim()
      const stationPartRaw = parts[2]?.trim() ?? ''
      const stationPart = stationPartRaw

      if (stationPart) {
        stations.add(stationPart)
      }

      if (normalizedFilter && stationPart !== normalizedFilter) {
        continue
      }

      if (!timePart || !valuePart) {
        continue
      }

      const timeMatch = timePart.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
      if (!timeMatch) {
        continue
      }

      const hour = Number.parseInt(timeMatch[1], 10)
      const minute = Number.parseInt(timeMatch[2], 10)
      const second = Number.parseInt(timeMatch[3] ?? '0', 10)

      if (![hour, minute, second].every((value) => Number.isFinite(value))) {
        continue
      }

      const normalizedValue = valuePart.replace(',', '.')
      const value = Number.parseFloat(normalizedValue)

      if (!Number.isFinite(value)) {
        continue
      }

      const timestamp = Date.UTC(fileInfo.year, fileInfo.monthIndex, fileInfo.day, hour, minute, second)
      const iso = new Date(timestamp).toISOString()

      points.push({ t: iso, v: value, station: stationPart || null })

      if (stationPart) {
        matchedStations.add(stationPart)
      } else if (!normalizedFilter) {
        matchedStations.add('')
      }
    }

    points.sort((a, b) => new Date(a.t) - new Date(b.t))

    return {
      points,
      start: points[0]?.t ?? null,
      end: points[points.length - 1]?.t ?? null,
      stations: Array.from(stations).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
      matchedStations: Array.from(matchedStations).filter((value) => value !== ''),
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        points: [],
        start: null,
        end: null,
        stations: [],
        matchedStations: [],
      }
    }
    throw error
  }
}

function clampToUtcStart(date) {
  const copy = new Date(date)
  copy.setUTCHours(0, 0, 0, 0)
  return copy
}

function clampToUtcEnd(date) {
  const copy = new Date(date)
  copy.setUTCHours(23, 59, 59, 999)
  return copy
}

function toDate(value) {
  if (!value) {
    return null
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function subtractDaysClamped(date, days) {
  const copy = new Date(date)
  if (!Number.isFinite(copy.getTime())) {
    return copy
  }

  copy.setUTCDate(copy.getUTCDate() - Math.max(days, 0))
  return copy
}

export async function loadElectricFieldSeries({
  root,
  station,
  rangeStart,
  rangeEnd,
  targetPoints = 4000,
}) {
  const files = await listElectricFieldFiles({ root })

  if (!files.length) {
    return {
      points: [],
      files: [],
      availableRange: null,
      stations: [],
      matchedStations: [],
    }
  }

  const availableStart = clampToUtcStart(new Date(files[0].timestamp))
  const availableEnd = clampToUtcEnd(new Date(files[files.length - 1].timestamp))

  const availableRange = {
    start: availableStart.toISOString(),
    end: availableEnd.toISOString(),
  }

  const requestedStart = toDate(rangeStart)
  const requestedEnd = toDate(rangeEnd)

  let end = requestedEnd ? clampToUtcEnd(requestedEnd) : availableEnd

  if (end.getTime() > availableEnd.getTime()) {
    end = new Date(availableEnd.getTime())
  }

  if (end.getTime() < availableStart.getTime()) {
    end = new Date(availableEnd.getTime())
  }

  let start

  if (requestedStart) {
    start = clampToUtcStart(requestedStart)
  } else {
    const daysToSubtract = Math.max(DEFAULT_WINDOW_DAYS - 1, 0)
    start = clampToUtcStart(subtractDaysClamped(end, daysToSubtract))
  }

  if (start.getTime() > end.getTime()) {
    start = clampToUtcStart(subtractDaysClamped(end, DEFAULT_WINDOW_DAYS - 1))
  }

  if (start.getTime() < availableStart.getTime()) {
    start = new Date(availableStart.getTime())
  }

  if (end.getTime() > availableEnd.getTime()) {
    end = new Date(availableEnd.getTime())
  }

  if (start.getTime() > availableEnd.getTime()) {
    start = new Date(availableStart.getTime())
    end = new Date(availableEnd.getTime())
  }

  if (start.getTime() > end.getTime()) {
    start = new Date(availableStart.getTime())
  }

  const selectedFiles = files.filter((file) => {
    const dayStart = clampToUtcStart(new Date(file.timestamp))
    const dayEnd = clampToUtcEnd(new Date(file.timestamp))
    return dayEnd.getTime() >= start.getTime() && dayStart.getTime() <= end.getTime()
  })

  if (!selectedFiles.length) {
    return {
      points: [],
      files: [],
      availableRange,
      stations: [],
      matchedStations: [],
    }
  }

  const combinedPoints = []
  const stationsInFiles = new Set()
  const matchedStations = new Set()
  const filterValue = station ? station.toString().trim() : ''

  for (const file of selectedFiles) {
    const { points, stations, matchedStations: fileMatchedStations } = await readElectricFieldFile(file, { station: filterValue })

    for (const stationId of stations) {
      if (stationId) {
        stationsInFiles.add(stationId)
      }
    }

    for (const stationId of fileMatchedStations) {
      if (stationId) {
        matchedStations.add(stationId)
      }
    }

    for (const point of points) {
      const time = new Date(point.t).getTime()
      if (!Number.isFinite(time) || time < start.getTime() || time > end.getTime()) {
        continue
      }
      combinedPoints.push(point)
    }
  }

  combinedPoints.sort((a, b) => new Date(a.t) - new Date(b.t))

  const totalPoints = combinedPoints.length
  const bucketMs = pickBucketSize({
    rangeStartMs: start.getTime(),
    rangeEndMs: end.getTime(),
    totalPoints,
    targetPoints,
  })

  let visiblePoints = combinedPoints
  let downsampled = false

  if (bucketMs >= MINUTE_MS && totalPoints > targetPoints) {
    const aggregated = aggregatePoints(combinedPoints, bucketMs)
    if (aggregated.length) {
      visiblePoints = aggregated
      downsampled = aggregated.length !== totalPoints
    }
  }

  return {
    points: visiblePoints,
    files: selectedFiles.map((file) => ({ date: file.isoDate, filename: file.filename })),
    totalPoints,
    downsampled,
    bucketMs,
    availableRange,
    stations: Array.from(stationsInFiles).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    matchedStations: Array.from(matchedStations).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    requestedRange: { start: start.toISOString(), end: end.toISOString() },
  }
}
